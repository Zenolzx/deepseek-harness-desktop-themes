/**
 * Client entry for `dsh-desktop-themes`.
 *
 * Responsibilities (all reversible, all released on dispose):
 *  1. Register the six built-in themes + any custom themes with the DSH
 *     `theme` service.
 *  2. Bind this plugin's settings (DSH 0.2.x `configForms.get('desktop-themes')`
 *     or the DSH 0.1.x `ui-desktop-themes` scope) and mirror it into a
 *     reactive store (debounced, durable persistence).
 *  3. Present the config: inject static + dynamic CSS (fonts, wallpaper,
 *     glass, layout) and stack the transparency token layer.
 *  4. Drive the Canvas-2D particle/glow effect engine.
 *  5. Persist wallpapers as IndexedDB blobs (never Base64 in settings).
 *  6. Register the settings section into the product's `settings.section` slot.
 */

import { createDefaultConfig } from '../config/defaults.ts';
import { coerceConfig } from '../config/validation.ts';
import { CONFIG_ENTRY_ID, SETTINGS_NAMESPACE, type ContentStyle, type DesktopThemesConfig, type SettingsField } from '../config/types.ts';
import { THEMES, buildCustomThemeDefinition, resolvePalette } from '../themes/index.ts';
import { buildFontCss } from '../appearance/fonts.ts';
import { buildTransparencyOverrides, isTransparencyActive } from '../appearance/transparency.ts';
import { buildContentLayer, effectiveContentStyle } from '../appearance/content.ts';
import { buildWallpaperCss, validateWallpaperFile } from '../appearance/wallpaper.ts';
import { buildGlassCss, supportsBackdropFilter } from '../appearance/glass.ts';
import { createStyleController, scheduleRaf } from '../utils/style.ts';
import { createStore, deepEqual } from '../utils/store.ts';
import { EffectsEngine } from '../effects/engine.ts';
import { getEffectPreset } from '../effects/presets.ts';
import { deleteWallpaper, getWallpaper, listWallpapers, newWallpaperId, putWallpaper } from '../storage/wallpaper-store.ts';
import { detectLang } from '../settings/i18n.ts';
import { SettingsPanel } from '../settings/SettingsPanel.tsx';
import { Studio, StudioIcon, studioCss } from '../studio/Studio.tsx';
import { createElement } from 'react';
import { scheduledTheme } from '../studio/schedule.ts';
import type { WallpaperPickResult } from '../settings/SettingsPanel.tsx';
import { Pet, type PetFace } from '../pet/Pet.tsx';
import { PLUGIN_BUILD_ID, PLUGIN_VERSION } from '../build-info.ts';
import staticCss from './styles.css';
import petCss from '../pet/pet.css';
import { hydrateBuiltinWallpaper } from './theme-presets.ts';
import { loadConfigSnapshot, saveConfigSnapshot } from '../storage/config-store.ts';
import { disposeFontFaces, hydrateInstalledFonts } from '../fonts/runtime.ts';
import { buildWorkspaceCss } from '../workspace/recipes.ts';

const PLUGIN_ID = 'dsh-desktop-themes';
const OVERRIDE_SOURCE = PLUGIN_ID;
const CONTENT_SOURCE = `${PLUGIN_ID}/content`;
const PERSIST_DEBOUNCE_MS = 350;
const SETTINGS_FIELDS: readonly SettingsField[] = [
  'workspace',
  'scene',
  'theme',
  'font',
  'appearance',
  'wallpaper',
  'glass',
  'effects',
  'performance',
  'customThemes',
  'themeSchedule',
  'recentWallpapers',
  'pet',
];

if (typeof document !== 'undefined') {
  document.documentElement.dataset.dthVersion = PLUGIN_VERSION;
  document.documentElement.dataset.dthBuild = PLUGIN_BUILD_ID;
}

interface ThemeRuntimeLike {
  /** Current theme snapshot (mirrors `ThemeRuntime#getTheme`). */
  getTheme?(): {
    active?: { id?: string; colorScheme?: string };
    themes?: Array<{ id: string }>;
    preference?: string;
    revision?: number;
  };
  register(definition: { id: string; colorScheme: string; tokens: Record<string, string> }): () => void;
  setTheme(id: string): void;
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void;
}

interface SettingsScopeLike {
  getSnapshot(): { status: 'loading' | 'ready' | 'unavailable'; value: unknown; writable: boolean };
  subscribe(listener: () => void): () => void;
  /** 0.2.x answers whether the Host accepted the write; 0.1.x resolves void. */
  set(field: string, value: unknown): Promise<boolean | void>;
}

/** DSH 0.1.x settings binder (`ctx.settingsScope`). */
interface SettingsScopeBinderLike {
  bind(spec: { namespace: string }): SettingsScopeLike;
}

/** DSH 0.2.x per-entry configuration forms (`ctx.configForms`). */
interface ConfigFormsLike {
  get(entryId: string): SettingsScopeLike;
}

interface SlotsLike {
  inject(slot: string, callback: () => void): void;
  register(options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown): () => void;
}

interface ClientContext {
  get(name: string): unknown;
  inject(services: string[], callback: (ctx: ClientContextWithServices) => void): void;
  effect(fn: () => (() => void) | void, label?: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

/** A context child that is allowed to read the services it injected. */
interface ClientContextWithServices extends ClientContext {
  get(name: string): unknown;
}

export const inject = ['theme', 'slots', 'connection', 'remote'] as const;

const RADIUS: Record<string, string> = { compact: '6px', standard: '10px', soft: '16px' };
const CONTENT_MAX: Record<string, string> = { compact: '820px', standard: '1080px', wide: '100%' };

/**
 * Reflect the content treatment on the document root so the static stylesheet
 * can react (opaque content surfaces, marker geometry) without re-injecting a
 * stylesheet on every settings change.
 */
function applyContentAttribute(config: DesktopThemesConfig, style: ContentStyle): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.dthContent = style;
  root.style.setProperty('--dth-diff-tint', String(Math.min(2, Math.max(0.25, config.appearance.diffTint))));
  // The decoration layers always stay above the app shell. Putting the shell
  // above them (the 1.7.0 "under" mode) silently erased every particle and the
  // ambient glow whenever a shell surface painted over the canvas — most
  // visibly on the home screen. Readability is handled by the opaque content
  // cards instead, so particles can never be lost to a stacking change.
  root.dataset.dthEffects = 'over';
}

function buildLayoutCss(config: DesktopThemesConfig): string {
  const radius = RADIUS[config.appearance.borderRadius] ?? RADIUS.standard;
  const contentMax = CONTENT_MAX[config.appearance.contentWidth] ?? CONTENT_MAX.standard;
  return [
    `:root { --dth-radius: ${radius}; --dth-content-max: ${contentMax}; }`,
    `.dth-panel, .dth-glass { border-radius: var(--dth-radius); }`,
    `.dth-content { max-width: var(--dth-content-max); margin: 0 auto; }`,
  ].join('\n');
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** OS-level "reduce transparency" (Windows contrast themes, macOS setting). */
function prefersReducedTransparency(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  } catch {
    return false;
  }
}

export function apply(ctx: ClientContext): void {
  const theme = ctx.get('theme') as ThemeRuntimeLike | undefined;
  const slots = ctx.get('slots') as SlotsLike | undefined;

  // An explicit local save is available before the asynchronous host settings
  // scope becomes ready, preventing a refresh from flashing/resetting defaults.
  let explicitBootstrap = loadConfigSnapshot();
  const store = createStore<DesktopThemesConfig>(
    hydrateBuiltinWallpaper(explicitBootstrap ?? createDefaultConfig()),
  );

  // ---- Downloadable fonts -------------------------------------------------
  // Register previously installed webfonts before the first paint they can
  // affect. The family names match the preset stacks, so a registered face is
  // picked up by the same CSS without re-injecting anything.
  void hydrateInstalledFonts();

  // ---- Theme registration (built-in) -------------------------------------
  if (theme !== undefined) {
    for (const definition of THEMES) {
      const dispose = theme.register(definition.definition);
      ctx.effect(() => dispose, 'desktop-themes: builtin theme registration');
    }
  }

  // ---- Custom theme registration (reconciled on change) ------------------
  const customRegistrations = new Map<string, { dispose: () => void; signature: string }>();
  const syncCustomThemes = (config: DesktopThemesConfig) => {
    if (theme === undefined) return;
    const nextIds = new Set(config.customThemes.map((t) => t.id));
    for (const [id, reg] of customRegistrations) {
      if (!nextIds.has(id)) {
        reg.dispose();
        customRegistrations.delete(id);
      }
    }
    for (const custom of config.customThemes) {
      const signature = `${custom.base}|${JSON.stringify(custom.colors)}|${JSON.stringify(custom.syntax)}|${JSON.stringify(custom.states)}`;
      const existing = customRegistrations.get(custom.id);
      if (existing !== undefined && existing.signature === signature) continue;
      if (existing !== undefined) existing.dispose();
      const definition = buildCustomThemeDefinition(custom);
      const dispose = theme.register(definition);
      customRegistrations.set(custom.id, { dispose, signature });
    }
  };

  // ---- Style controllers --------------------------------------------------
  const staticStyles = createStyleController(`${PLUGIN_ID}/static`, PLUGIN_ID);
  const dynamicStyles = createStyleController(`${PLUGIN_ID}/dynamic`, PLUGIN_ID);
  staticStyles.set(staticCss + '\n' + petCss + '\n' + studioCss);

  // ---- Effects engine ------------------------------------------------------
  const effects = new EffectsEngine();

  // ---- Accessibility / performance environment ----------------------------
  let reducedTransparency = prefersReducedTransparency();
  const syncEnvironmentAttributes = () => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.dthReducedTransparency = reducedTransparency ? 'true' : 'false';
    root.dataset.dthReducedMotion = prefersReducedMotion() ? 'true' : 'false';
  };
  syncEnvironmentAttributes();

  // ---- Transparency layer management ------------------------------------
  let activeThemeId: string = store.get().theme;
  let transparencyDisposer: (() => void) | null = null;
  let contentDisposer: (() => void) | null = null;

  /**
   * Single authoritative path that asks the DSH `theme` service to activate
   * `id`. Every caller — first mount, remote settings adoption, settings commit,
   * and drift recovery — goes through this one function, so the initial and the
   * manual-switch code paths can never diverge again. The DSH host only ever
   * persists the built-in `light`/`dark`/`system` preference; third-party theme
   * ids are session-only, so any later re-adoption of that preference by
   * `ui-theme` silently drops our theme. {@link assertTheme} is therefore
   * re-invoked from the `theme/change` guard below whenever that happens.
   */
  const assertTheme = (id: string) => {
    if (theme === undefined) return;
    let active: string | undefined;
    let registered = false;
    try {
      const snapshot = theme.getTheme?.();
      active = snapshot?.active?.id;
      registered = snapshot?.themes?.some((definition) => definition.id === id) ?? false;
    } catch {
      registered = true; // unknown service shape: fall back to attempting setTheme
    }
    if (active === id) {
      activeThemeId = id;
      return;
    }
    if (!registered) {
      console.warn(`[dsh-desktop-themes] theme "${id}" is not registered yet; skipping activation`);
      return;
    }
    activeThemeId = id;
    try {
      theme.setTheme(id);
    } catch (error) {
      console.warn(`[dsh-desktop-themes] cannot activate theme "${id}":`, error);
      if (active !== undefined) activeThemeId = active;
    }
  };

  const applyTransparency = (config: DesktopThemesConfig) => {
    if (transparencyDisposer !== null) {
      transparencyDisposer();
      transparencyDisposer = null;
    }
    // OS "reduce transparency" wins over the plugin preference: the product's
    // own opaque surfaces are the safest fallback.
    if (theme === undefined || reducedTransparency || !isTransparencyActive(config.appearance)) return;
    transparencyDisposer = theme.overrideTokens(
      OVERRIDE_SOURCE,
      buildTransparencyOverrides(config.appearance, activeThemeId, config.wallpaper.enabled, config.customThemes),
    );
  };

  /**
   * Theme the content surfaces the product styles on its own (diff rows,
   * document preview, selection). `classic` releases the layer so the
   * product's original surfaces come back unchanged.
   */
  const applyContent = (config: DesktopThemesConfig) => {
    if (contentDisposer !== null) {
      contentDisposer();
      contentDisposer = null;
    }
    const style = effectiveContentStyle(config);
    applyContentAttribute(config, style);
    if (theme === undefined || style === 'classic') return;
    const palette = resolvePalette(config.theme, config.customThemes);
    if (palette === undefined) return;
    const layer = buildContentLayer(palette, { style, tint: config.appearance.diffTint });
    const custom = config.customThemes.find(item => item.id === config.theme);
    if (custom?.syntax) {
      const tokens = buildCustomThemeDefinition(custom).tokens;
      for (const [key, value] of Object.entries(tokens)) {
        if (key.startsWith('--shiki-token-')) layer[key] = { light: value, dark: value };
      }
    }
    if (Object.keys(layer).length === 0) return;
    contentDisposer = theme.overrideTokens(CONTENT_SOURCE, layer);
  };

  // ---- Dynamic CSS (fonts / wallpaper / glass / layout) -------------------
  let rafCancel: (() => void) | null = null;
  const applyDynamic = (config: DesktopThemesConfig) => {
    if (rafCancel !== null) rafCancel();
    rafCancel = scheduleRaf(() => {
      const palette = resolvePalette(config.theme, config.customThemes);
      const css = [
        buildFontCss(config.font),
        buildWallpaperCss(config.wallpaper, palette?.accent, palette?.bgBase),
        buildGlassCss(glassFor(config), supportsBackdropFilter(), palette),
        buildLayoutCss(config),
        buildWorkspaceCss(config),
      ].join('\n');
      dynamicStyles.set(css);
    });
  };

  // Power-saver mode disables complex blur; reduced-transparency does the same
  // regardless of the stored preference.
  const glassFor = (config: DesktopThemesConfig) => {
    if (reducedTransparency) {
      return { ...config.glass, enabled: false, blurLevel: 'off' as const };
    }
    if (config.performance.level === 'power-saver') {
      return { ...config.glass, blurLevel: 'off' as const };
    }
    return config.glass;
  };

  // ---- Effects application -------------------------------------------------
  const applyEffects = (config: DesktopThemesConfig) => {
    const palette = resolvePalette(config.theme, config.customThemes);
    let particles: string[];
    let glows: string[];
    if (config.effects.autoThemeColors || config.effects.particleColors.length === 0) {
      particles = palette?.particleColors ?? ['#3D7EFF'];
      glows = palette?.glowColors ?? ['#3D7EFF'];
    } else {
      particles = config.effects.particleColors;
      glows = config.effects.glowColors.length > 0 ? config.effects.glowColors : config.effects.particleColors;
    }
    const powerSaver = config.performance.level === 'power-saver';
    let effectiveEffects = powerSaver
      ? {
          ...config.effects,
          connectLines: false,
          mouseInteraction: false,
          parallax: false,
          cursorGlow: false,
        }
      : { ...config.effects };
    const meta = getEffectPreset(effectiveEffects.preset);
    if (meta.kind === 'none') effectiveEffects = { ...effectiveEffects, enabled: false };
    effects.update({
      effects: effectiveEffects,
      performance: config.performance.level,
      colors: { particles, glows },
      reducedMotion: prefersReducedMotion(),
    });
  };

  // ---- Persistence (debounced, field-granular) ----------------------------
  let scope: SettingsScopeLike | null = null;
  let pending: Partial<Record<SettingsField, unknown>> = {};
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const saveNotifier = createStore<{ saving: boolean; saved: boolean; failed: boolean }>({ saving: false, saved: false, failed: false });

  const flushPersist = async (explicit = false): Promise<boolean> => {
    persistTimer = null;
    // Local snapshot first: it keeps the chosen appearance across a refresh
    // even when the Host offers no settings service or a write fails.
    const localSaved = saveConfigSnapshot(previewBase ?? store.get());
    if (scope === null || Object.keys(pending).length === 0) {
      const ok = explicit ? localSaved : true;
      saveNotifier.set({ saving: false, saved: ok, failed: !ok });
      if (ok) setTimeout(() => saveNotifier.set({ saving: false, saved: false, failed: false }), 1800);
      return ok;
    }
    const writes = Object.entries(pending);
    pending = {};
    const results = await Promise.allSettled(writes.map(([field, value]) => scope!.set(field, value)));
    const remoteSaved = results.every((result) => result.status === 'fulfilled' && result.value !== false);
    const ok = localSaved && remoteSaved;
    saveNotifier.set({ saving: false, saved: ok, failed: !ok });
    if (ok) setTimeout(() => saveNotifier.set({ saving: false, saved: false, failed: false }), 1800);
    return ok;
  };

  const schedulePersist = (field: SettingsField, value: unknown) => {
    pending[field] = value;
    saveNotifier.set({ saving: true, saved: false, failed: false });
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void flushPersist(), PERSIST_DEBOUNCE_MS);
  };

  const queueAllFields = (config: DesktopThemesConfig) => {
    for (const field of SETTINGS_FIELDS) {
      pending[field] = field === 'wallpaper' ? { ...config.wallpaper, path: '' } : config[field];
    }
  };

  /** User-facing, synchronous-local + awaited-host save action. */
  const saveNow = async (): Promise<boolean> => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    queueAllFields(previewBase ?? store.get());
    saveNotifier.set({ saving: true, saved: false, failed: false });
    return flushPersist(true);
  };

  // ---- Runtime apply (preview only, no persistence) ------------------------
  const applyRuntime = (next: DesktopThemesConfig) => {
    const prev = store.get();
    if (deepEqual(next, prev)) return;
    const themeChanged = next.theme !== prev.theme;
    const customThemesChanged = !deepEqual(next.customThemes, prev.customThemes);
    store.set(next);
    if (customThemesChanged) syncCustomThemes(next);
    if (themeChanged) assertTheme(next.theme);
    if (
      themeChanged ||
      customThemesChanged ||
      !deepEqual(next.font, prev.font) ||
      !deepEqual(next.appearance, prev.appearance) ||
      !deepEqual(next.wallpaper, prev.wallpaper) ||
      !deepEqual(next.glass, prev.glass) ||
      !deepEqual(next.performance, prev.performance)
      || !deepEqual(next.workspace, prev.workspace)
    ) applyDynamic(next);
    if (
      themeChanged ||
      customThemesChanged ||
      !deepEqual(next.appearance, prev.appearance) ||
      next.wallpaper.enabled !== prev.wallpaper.enabled
    ) applyTransparency(next);
    if (
      themeChanged ||
      customThemesChanged ||
      next.appearance.contentStyle !== prev.appearance.contentStyle ||
      next.appearance.diffTint !== prev.appearance.diffTint ||
      // The decoration layering depends on the ground being translucent.
      next.appearance.transparencyEnabled !== prev.appearance.transparencyEnabled ||
      next.wallpaper.enabled !== prev.wallpaper.enabled
    ) applyContent(next);
    if (
      themeChanged ||
      customThemesChanged ||
      !deepEqual(next.effects, prev.effects) ||
      !deepEqual(next.performance, prev.performance)
    ) applyEffects(next);
  };

  // ---- Preview path (live, never persisted) --------------------------------
  // Theme cards preview on Space/hover-like gestures. A preview applies to the
  // reactive store and every presenter exactly like a real switch, but it is
  // not queued for persistence and can be rolled back byte-for-byte.
  let previewBase: DesktopThemesConfig | null = null;
  const preview = (next: DesktopThemesConfig) => {
    if (previewBase === null) previewBase = store.get();
    applyRuntime(hydrateBuiltinWallpaper(next));
  };
  const cancelPreview = () => {
    if (previewBase === null) return;
    const base = previewBase;
    previewBase = null;
    applyRuntime(base);
  };

  // ---- Commit path (preview + persist) ------------------------------------
  const commit = (next: DesktopThemesConfig, automatic = false) => {
    next = hydrateBuiltinWallpaper(next);
    if(next.wallpaper.sourceId && !next.wallpaper.sourceId.startsWith('builtin:') && next.wallpaper.path.startsWith('blob:')) {
      wallpaperUrls.set(next.wallpaper.sourceId,next.wallpaper.path);
    }
    previewBase = null;
    const prev = store.get();
    if (!automatic && next.theme !== prev.theme && next.themeSchedule.enabled) {
      next = { ...next, themeSchedule: { ...next.themeSchedule, enabled: false } };
    }
    if (deepEqual(next, prev)) return;
    syncCustomThemes(next);
    applyRuntime(next);
    for (const field of SETTINGS_FIELDS) {
      if (!deepEqual(next[field], prev[field])) {
        // The runtime object URL is never durable; persist only the managed id.
        const value = field === 'wallpaper' ? { ...next.wallpaper, path: '' } : next[field];
        schedulePersist(field, value);
      }
    }
  };

  // ---- Apply defaults immediately (first paint before scope read) ---------
  applyDynamic(store.get());
  applyTransparency(store.get());
  applyContent(store.get());
  applyEffects(store.get());
  syncCustomThemes(store.get());
  assertTheme(store.get().theme);

  // ---- Reading-mode attribute (replaces the expensive `:has(pre)` selector) ----
  // A throttled observer flips one attribute on <html>; the stylesheet then has
  // a plain attribute selector, so streaming output no longer forces a
  // document-wide style recalculation on every token.
  let readingRaf = 0;
  const syncReadingMode = () => {
    if (readingRaf !== 0) return;
    const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn: () => void) => setTimeout(fn, 16);
    readingRaf = schedule(() => {
      readingRaf = 0;
      if (typeof document === 'undefined') return;
      const root = document.documentElement;
      root.dataset.dthReading = document.querySelector('[data-review-view], pre') !== null ? 'true' : 'false';
      root.dataset.dthReview = document.querySelector('[data-review-view]') !== null ? 'true' : 'false';
    }) as unknown as number;
  };
  let readingObserver: MutationObserver | null = null;
  if (typeof MutationObserver !== 'undefined' && document.body !== null) {
    readingObserver = new MutationObserver(syncReadingMode);
    readingObserver.observe(document.body, { childList: true, subtree: true });
    syncReadingMode();
  }

  // ---- Streaming / typing throttle for the particle layer ------------------
  // The canvas is decorative: dropping it to 15 fps while text streams keeps
  // the main thread available for layout without a visible pause.
  let activityTimer: ReturnType<typeof setTimeout> | null = null;
  let streamBurst = 0;
  let streamObserver: MutationObserver | null = null;
  const markActive = () => {
    effects.setThrottled(true);
    if (activityTimer !== null) clearTimeout(activityTimer);
    activityTimer = setTimeout(() => {
      activityTimer = null;
      effects.setThrottled(false);
    }, 900);
  };
  const onInput = () => markActive();
  document.addEventListener('input', onInput, true);
  document.addEventListener('compositionstart', onInput, true);
  if (typeof MutationObserver !== 'undefined' && document.body !== null) {
    streamObserver = new MutationObserver((records) => {
      streamBurst += records.length;
      if (streamBurst < 24) return;
      streamBurst = 0;
      markActive();
    });
    streamObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // ---- Environment preference listeners -----------------------------------
  const environmentQueries: MediaQueryList[] = [];
  const onEnvironmentChange = () => {
    reducedTransparency = prefersReducedTransparency();
    syncEnvironmentAttributes();
    applyDynamic(store.get());
    applyTransparency(store.get());
    applyEffects(store.get());
  };
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    for (const queryText of ['(prefers-reduced-transparency: reduce)', '(prefers-reduced-motion: reduce)']) {
      try {
        const query = window.matchMedia(queryText);
        query.addEventListener('change', onEnvironmentChange);
        environmentQueries.push(query);
      } catch {
        /* older runtimes only expose addListener; the initial read still works */
      }
    }
  }

  // ---- Boot reconciliation ------------------------------------------------
  // `ui-theme` re-adopts its durable built-in preference (here `dark`)
  // asynchronously *after* this plugin has asserted its session-only theme on
  // mount. Each adoption publishes a `theme/change` whose snapshot the ui-layout
  // presenter applies LAST in the listener order, so a synchronous re-assert
  // from inside that dispatch is always painted over by the adoption's own
  // stale payload. Reconciliation therefore (a) runs on fresh ticks, and
  // (b) verifies the actual DOM (dark attribute / color-scheme / token
  // presence), not just the runtime id — a runtime that already says
  // "mint-breeze" can coexist with a DOM that was left on the dark base.
  const reconcileTimers: Array<ReturnType<typeof setTimeout>> = [];
  let reconcileRaf = 0;
  const reconcileTheme = () => {
    if (theme === undefined) return;
    const config = store.get();
    const wanted = config.theme;
    const palette = resolvePalette(wanted, config.customThemes);
    const wantDark = palette?.colorScheme === 'dark';
    let active: string | undefined;
    let scheme: string | undefined;
    try {
      const snapshot = theme.getTheme?.();
      active = snapshot?.active?.id;
      scheme = snapshot?.active?.colorScheme;
    } catch {
      active = undefined;
    }
    const body = typeof document !== 'undefined' ? document.body : null;
    const domDark = body?.hasAttribute('data-ds-dark-theme') ?? false;
    const htmlScheme = typeof document !== 'undefined' ? document.documentElement.style.colorScheme : '';
    const labelSet =
      body !== null && body.style.getPropertyValue('--dsw-alias-label-primary').trim() !== '';
    const runtimeOk = active === wanted;
    const domOk = scheme === (wantDark ? 'dark' : 'light') && domDark === wantDark && htmlScheme === (wantDark ? 'dark' : 'light') && labelSet;
    if (runtimeOk && domOk) return;
    if (!runtimeOk) {
      assertTheme(wanted);
      return;
    }
    // Runtime already matches the configured theme, but the DOM still carries a
    // stale base paint (an adoption's payload that the presenter applied after
    // our last mint publish). Nudge the official API with the opposite built-in
    // scheme so a fresh publish cycle ends with the presenter repainting our
    // theme on top; the drift guard's deferred recover below re-converges any
    // residual skew.
    try {
      theme.setTheme(wantDark ? 'light' : 'dark');
    } catch {
      /* built-ins always exist */
    }
    assertTheme(wanted);
  };
  if (typeof requestAnimationFrame === 'function') {
    reconcileRaf = requestAnimationFrame(() => reconcileTheme());
  }
  reconcileTimers.push(setTimeout(reconcileTheme, 350), setTimeout(reconcileTheme, 1400));

  // ---- Wallpaper management (IndexedDB) -----------------------------------
  const wallpaperUrls = new Map<string, string>();

  const activateWallpaper = (id: string, name: string, blob: Blob, config: DesktopThemesConfig) => {
    const existing = wallpaperUrls.get(id);
    if (existing === undefined) {
      const url = URL.createObjectURL(blob);
      wallpaperUrls.set(id, url);
      commit({
        ...config,
        wallpaper: { ...config.wallpaper, enabled: true, sourceId: id, path: url, name },
      });
    } else {
      commit({
        ...config,
        wallpaper: { ...config.wallpaper, enabled: true, sourceId: id, path: existing, name },
      });
    }
  };

  const chooseWallpaper = async (file: File): Promise<WallpaperPickResult> => {
    const validation = validateWallpaperFile({ name: file.name, size: file.size, type: file.type });
    if (!validation.ok) return { ok: false, reason: validation.reason };
    const id = newWallpaperId();
    const ok = await putWallpaper(id, file.name, file);
    if (!ok) {
      // IndexedDB unavailable: use a session-only object URL.
      const url = URL.createObjectURL(file);
      wallpaperUrls.set(id, url);
      const config = store.get();
      commit({ ...config, wallpaper: { ...config.wallpaper, enabled: true, sourceId: '', path: url, name: file.name } });
      return { ok: true };
    }
    const config = store.get();
    activateWallpaper(id, file.name, file, config);
    const recent = [id, ...config.recentWallpapers.filter((r) => r !== id)].slice(0, 16);
    commit({ ...store.get(), recentWallpapers: recent });
    return { ok: true };
  };

  const clearWallpaper = () => {
    const config = store.get();
    const id = config.wallpaper.sourceId;
    if (id.length > 0 && !id.startsWith('builtin:')) {
      const url = wallpaperUrls.get(id);
      if (url !== undefined) URL.revokeObjectURL(url);
      wallpaperUrls.delete(id);
      void deleteWallpaper(id);
    }
    commit({
      ...config,
      wallpaper: { ...config.wallpaper, enabled: false, sourceId: '', path: '', name: '' },
      recentWallpapers: config.recentWallpapers.filter((r) => r !== id),
    });
  };

  const restoreWallpaper = async (id: string): Promise<boolean> => {
    const record = await getWallpaper(id);
    if (record === undefined) return false;
    activateWallpaper(id, record.name, record.blob, store.get());
    return true;
  };

  const listRecentWallpapers = async (): Promise<Array<{ id: string; name: string }>> => {
    const metas = await listWallpapers();
    const byId = new Map(metas.map((m) => [m.id, m.name]));
    return store
      .get()
      .recentWallpapers.map((id) => ({ id, name: byId.get(id) ?? '' }))
      .filter((item) => byId.has(item.id));
  };

  // Restore the durable wallpaper from IndexedDB once the scope publishes.
  const restoreDurableWallpaper = async (config: DesktopThemesConfig) => {
    const wp = config.wallpaper;
    if (!wp.enabled || wp.sourceId.length === 0) return;
    if (wp.sourceId.startsWith('builtin:')) return;
    if (wallpaperUrls.has(wp.sourceId)) return;
    const record = await getWallpaper(wp.sourceId);
    if (record === undefined) {
      // Blob missing → fall back to theme background but keep the selection.
      return;
    }
    const url = URL.createObjectURL(record.blob);
    wallpaperUrls.set(wp.sourceId, url);
    const current = store.get();
    if (current.wallpaper.sourceId === wp.sourceId) {
      applyRuntime({ ...current, wallpaper: { ...current.wallpaper, path: url, name: record.name } });
    }
  };

  // ---- Settings scope (persistence) ---------------------------------------
  // The local snapshot can be the only available settings source. Its managed
  // image needs hydrating even when the remote scope never becomes ready.
  void restoreDurableWallpaper(store.get());
  // DSH 0.2.x serves settings per profile entry id through `ctx.configForms`
  // (`configForms.get('desktop-themes')`); DSH 0.1.x binds the plugin-owned
  // namespace through `ctx.settingsScope`. Neither service is in the static
  // inject list, so either runtime can load the plugin; the available binder
  // wins, and a runtime with neither keeps the local snapshot fallback.
  const adoptFromScope = () => {
    const snapshot = scope?.getSnapshot();
    if (snapshot === undefined || snapshot.status !== 'ready' || snapshot.value === undefined) return;
    const incoming = hydrateBuiltinWallpaper(coerceConfig(snapshot.value));
    if (explicitBootstrap !== null) {
      const saved = hydrateBuiltinWallpaper(explicitBootstrap);
      explicitBootstrap = null;
      if (!deepEqual(incoming, saved)) {
        queueAllFields(saved);
        void flushPersist();
        return;
      }
    }
    if (deepEqual(incoming, store.get())) return;
    store.set(incoming);
    syncCustomThemes(incoming);
    assertTheme(incoming.theme);
    applyDynamic(incoming);
    applyTransparency(incoming);
    applyContent(incoming);
    applyEffects(incoming);
    void restoreDurableWallpaper(incoming);
  };

  const bindScope = (open: () => SettingsScopeLike, label: string) => {
    if (scope !== null) return;
    try {
      const candidate = open();
      scope = candidate;
      scope.subscribe(adoptFromScope);
      adoptFromScope();
    } catch (error) {
      console.warn(`[dsh-desktop-themes] ${label} binding failed:`, error);
      scope = null;
    }
  };

  ctx.inject(['configForms'], (child) => {
    const forms = child.get('configForms') as ConfigFormsLike | undefined;
    if (forms !== undefined) bindScope(() => forms.get(CONFIG_ENTRY_ID), 'configForms');
  });

  ctx.inject(['settingsScope'], (child) => {
    const binder = child.get('settingsScope') as SettingsScopeBinderLike | undefined;
    if (binder !== undefined) bindScope(() => binder.bind({ namespace: SETTINGS_NAMESPACE }), 'settingsScope');
  });

  // ---- React to theme switches made outside this plugin -------------------
  // Guard on the configured theme: `overrideTokens` also emits `theme/change`,
  // and re-applying on those (id-unchanged) events would loop forever.
  if (theme !== undefined) {
    let recoverQueued = false;
    const recoverTheme = () => {
      recoverQueued = false;
      if (theme === undefined) return;
      const before = theme.getTheme?.().active?.id;
      assertTheme(store.get().theme);
      const after = theme.getTheme?.().active?.id;
      if (before !== after) {
        // Keep one durable breadcrumb: the host re-adopted its built-in
        // appearance preference over our session-only theme and we restored it.
        console.warn(`[dsh-desktop-themes] host re-adopted its appearance preference; re-asserted theme "${after}"`);
      }
      applyTransparency(store.get());
      applyContent(store.get());
    };
    ctx.on('theme/change', (snapshot) => {
      const id = (snapshot as { active?: { id?: string } })?.active?.id;
      if (id === undefined) return;
      if (id === store.get().theme) {
        activeThemeId = id;
        return;
      }
      // A refresh boots from the DSH host's durable built-in preference
      // (`light`/`dark`/`system` — here `dark`), and `ui-theme` re-adopts that
      // preference asynchronously, i.e. *after* this plugin has already
      // activated its session-only theme id on mount. Each adoption drops our
      // theme and publishes a snapshot whose payload the ui-layout presenter
      // applies LAST in this dispatch (it registered after this plugin). A
      // synchronous re-assert here would therefore be painted over by the very
      // same event's dark payload — the "half broken" state with the runtime
      // claiming mint while the DOM stays dark. Recovery must run on a fresh
      // tick *after* the presenter applied the adoption, so the next publish
      // ends with our theme painted last — identical to a manual switch.
      activeThemeId = id;
      if (!recoverQueued) {
        recoverQueued = true;
        if (typeof queueMicrotask === 'function') queueMicrotask(recoverTheme);
        else if (typeof Promise !== 'undefined') void Promise.resolve().then(recoverTheme);
        else setTimeout(recoverTheme, 0);
      }
    });
  }

  // ---- Settings section ----------------------------------------------------
  let scheduleActive = true;
  const applySchedule = () => {
    if (!scheduleActive) return;
    if (previewBase !== null) return;
    const current = store.get();
    const id = scheduledTheme(current, new Date().getHours());
    if (id && id !== current.theme) commit({ ...current, theme: id, scene: '' }, true);
  };
  const scheduleTimer = setInterval(applySchedule, 60_000);
  const cancelScheduleSubscription = store.subscribe(() => queueMicrotask(applySchedule));
  document.addEventListener('visibilitychange', applySchedule);
  applySchedule();
  let layoutFace: { selectPanel?: (id: string | null) => void } | undefined;
  ctx.inject(['layout'], child => { layoutFace = child.get('layout') as typeof layoutFace; });
  const openStudio = () => layoutFace?.selectPanel?.('desktop-themes-studio');
  if (slots !== undefined) {
    slots.inject('main', () => {
      slots.register({ name: 'main', key: 'desktop-themes-studio' }, () => createElement(Studio, {
        store, commit, preview, cancelPreview, saveNow, close: () => {
          layoutFace?.selectPanel?.(null);
        },
      }));
    });
    slots.inject('sidebar.panellist', () => {
      slots.register({ name: 'sidebar.panellist', id: 'desktop-themes-studio', order: 30, label: () => '外观工作室' }, (props) => createElement(StudioIcon, { size: typeof props.size === 'number' ? props.size : 18 }));
    });
  }
  if (slots !== undefined) {
    slots.inject('settings.section', () => {
      slots.register(
        {
          name: 'settings.section',
          id: 'desktop-themes',
          order: 20,
          label: () => (detectLang() === 'zh' ? '桌面外观' : 'Desktop Themes'),
        },
        (props) =>
          SettingsPanel({
            close: typeof props.close === 'function' ? (props.close as () => void) : undefined,
            store,
            saveNotifier,
            saveNow,
            commit,
            preview,
            cancelPreview,
            openStudio,
            chooseWallpaper,
            clearWallpaper,
            restoreWallpaper,
            listRecentWallpapers,
          }),
      );
    });
  }

  // ---- Desktop pet (shell.overlay floating layer) --------------------------
  if (slots !== undefined) {
    slots.inject('shell.overlay', () => {
      slots.register(
        {
          name: 'shell.overlay',
          id: 'desktop-pet',
          order: 90,
        },
        (standardProps) =>
          Pet({
            store,
            commit,
            chooseWallpaper,
            clearWallpaper,
            restoreWallpaper,
            listRecentWallpapers,
            useSessions: (standardProps as { useSessions?: PetFace['useSessions'] }).useSessions,
          }),
      );
    });
  }


  // ---- Teardown ------------------------------------------------------------
  ctx.effect(
    () => () => {
      if (transparencyDisposer !== null) transparencyDisposer();
      if (contentDisposer !== null) contentDisposer();
      if (rafCancel !== null) rafCancel();
      if (typeof cancelAnimationFrame === 'function' && reconcileRaf !== 0) cancelAnimationFrame(reconcileRaf);
      for (const timer of reconcileTimers) clearTimeout(timer);
      if (readingObserver !== null) readingObserver.disconnect();
      if (streamObserver !== null) streamObserver.disconnect();
      if (activityTimer !== null) clearTimeout(activityTimer);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('compositionstart', onInput, true);
      for (const query of environmentQueries) query.removeEventListener('change', onEnvironmentChange);
      effects.dispose();
      scheduleActive = false;
      clearInterval(scheduleTimer);
      cancelScheduleSubscription();
      document.removeEventListener('visibilitychange', applySchedule);
      disposeFontFaces();
      for (const url of wallpaperUrls.values()) URL.revokeObjectURL(url);
      wallpaperUrls.clear();
      for (const reg of customRegistrations.values()) reg.dispose();
      customRegistrations.clear();
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        void flushPersist();
      }
      staticStyles.dispose();
      dynamicStyles.dispose();
    },
    'desktop-themes: cleanup',
  );
}
