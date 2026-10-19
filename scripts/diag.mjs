/**
 * Standalone diagnostic: loads the BUILT client bundle in Node with a mocked
 * browser/runtime and drives `apply()` with a mocked cordis ctx, so we can see
 * exactly what the plugin does at activation and catch any runtime error.
 *
 * Run: `node scripts/diag.mjs`
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---- browser globals -------------------------------------------------------
const madeStyles = [];
const document = {
  head: {
    appendChild(el) {
      el.isConnected = true;
      madeStyles.push(el);
    },
  },
  createElement(tag) {
    return {
      tagName: tag,
      dataset: {},
      textContent: '',
      isConnected: false,
      style: { setProperty() {} },
      className: '',
      width: 0,
      height: 0,
      getAttribute() { return null; },
      setAttribute() {},
      removeAttribute() {},
      remove() { this.isConnected = false; },
      append() {},
      appendChild() {},
      isConnectedFlag: false,
      querySelector() { return null; },
      getContext() { return null; },
    };
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
  body: {
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    setAttribute() {},
    removeAttribute() {},
    hasAttribute() { return false; },
    getAttribute() { return null; },
    appendChild() {},
  },
  documentElement: { style: { setProperty() {}, removeProperty() {} }, dataset: {} },
};

globalThis.document = document;
globalThis.CSS = {
  escape: (s) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`),
  supports: () => true,
};
globalThis.requestAnimationFrame = (cb) => { cb(); return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
globalThis.URL = {
  createObjectURL: () => 'blob:mock-url',
  revokeObjectURL: () => {},
};

// ---- module loader capture -------------------------------------------------
let capturedFactory = null;
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      capturedFactory = spec;
    },
  },
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
};

const fakeRequire = (id) => {
  if (id === 'react') {
    return {
      useState: (v) => [v, () => {}],
      useSyncExternalStore: (_s, g) => g(),
      useCallback: (f) => f,
      useRef: () => ({ current: null }),
      createElement: () => null,
    };
  }
  if (id === 'react/jsx-runtime') {
    return { jsx: () => null, jsxs: () => null, Fragment: null };
  }
  throw new Error(`unexpected require: ${id}`);
};

// ---- load the bundle -------------------------------------------------------
const code = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
// The bundle is a plain script that calls window.__ModuleLoader__.load(...).
// eval is only used here to run our own built artifact in the diagnostic.
(0, eval)(code);

if (capturedFactory === null) throw new Error('factory not captured');
const mod = capturedFactory.factory(fakeRequire);

// ---- mock ctx --------------------------------------------------------------
const events = { registeredThemes: [], setThemeCalls: [], overrides: [], registeredSlots: [] };
const theme = {
  register(def) { events.registeredThemes.push(def.id); return () => {}; },
  setTheme(id) { events.setThemeCalls.push(id); },
  overrideTokens(src, tokens) { events.overrides.push({ src, keys: Object.keys(tokens).length }); return () => {}; },
};
const settingsScope = {
  bind() {
    return {
      getSnapshot() { return { status: 'unavailable', value: undefined }; },
      subscribe() { return () => {}; },
      set() { return Promise.resolve(); },
    };
  },
};
const slots = {
  inject(_name, cb) { cb(); },
  register(opts) { events.registeredSlots.push(opts); return () => {}; },
};

const ctx = {
  get(name) {
    if (name === 'theme') return theme;
    if (name === 'settingsScope') return settingsScope;
    if (name === 'slots') return slots;
    return undefined;
  },
  inject(names, cb) {
    const child = { get: (name) => (names.includes(name) ? ctx.get(name) : undefined) };
    cb(child, () => {});
  },
  effect() {},
  on(_event, _cb) {},
};

// ---- run --------------------------------------------------------------------
console.log('module exports:', Object.keys(mod));
console.log('inject:', JSON.stringify(mod.inject));
mod.apply(ctx);
console.log('registeredThemes:', JSON.stringify(events.registeredThemes));
console.log('setThemeCalls:', JSON.stringify(events.setThemeCalls));
console.log('overrides:', JSON.stringify(events.overrides));
console.log('registeredSlots:', JSON.stringify(events.registeredSlots.map((s) => s.id)));
console.log('style tags created:', madeStyles.length);
for (const s of madeStyles) {
  console.log(`  style[${s.dataset.pluginCss}] len=${s.textContent.length}`);
}
console.log('DIAG OK');
