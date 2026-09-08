/**
 * Client entry for `dsh-desktop-themes`.
 *
 * Responsibilities (all reversible, all released on dispose):
 *  1. Register the six built-in themes + any custom themes with the DSH
 *     `theme` service.
 *  2. Bind the `ui-desktop-themes` settings scope and mirror it into a
 *     reactive store (debounced, durable persistence).
 *  3. Present the config: inject static + dynamic CSS (fonts, wallpaper,
 *     glass, layout) and stack the transparency token layer.
 *  4. Drive the Canvas-2D particle/glow effect engine.
 *  5. Persist wallpapers as IndexedDB blobs (never Base64 in settings).
 *  6. Register the settings section into the product's `settings.section` slot.
 */

import { createDefaultConfig } from '../config/defaults.ts';
import { coerceConfig } from '../config/validation.ts';
import { SETTINGS_NAMESPACE, type DesktopThemesConfig, type SettingsField } from '../config/types.ts';
import { THEMES, buildCustomThemeDefinition, resolvePalette } from '../themes/index.ts';
import { buildFontCss } from '../appearance/fonts.ts';
import { buildTransparencyOverrides, isTransparencyActive } from '../appearance/transparency.ts';
import { buildWallpaperCss, validateWallpaperFile } from '../appearance/wallpaper.ts';
import { buildGlassCss, supportsBackdropFilter } from '../appearance/glass.ts';
import { createStyleController, scheduleRaf } from '../utils/style.ts';
import { createStore, deepEqual } from '../utils/store.ts';
import { EffectsEngine } from '../effects/engine.ts';
import { getEffectPreset } from '../effects/presets.ts';
import { deleteWallpaper, getWallpaper, listWallpapers, newWallpaperId, putWallpaper } from '../storage/wallpaper-store.ts';
import { detectLang } from '../settings/i18n.ts';
import { SettingsPanel } from '../settings/SettingsPanel.tsx';
import type { WallpaperPickResult } from '../settings/SettingsPanel.tsx';
import { Pet, type PetFace } from '../pet/Pet.tsx';
import { PLUGIN_BUILD_ID, PLUGIN_VERSION } from '../build-info.ts';
import staticCss from './styles.css';
import petCss from '../pet/pet.css';
import { hydrateBuiltinWallpaper } from './theme-presets.ts';
import { loadConfigSnapshot, saveConfigSnapshot } from '../storage/config-store.ts';

const PLUGIN_ID = 'dsh-desktop-themes';
const OVERRIDE_SOURCE = PLUGIN_ID;
const PERSIST_DEBOUNCE_MS = 350;
const SETTINGS_FIELDS: readonly SettingsField[] = [
  'theme',
  'font',
  'appearance',
  'wallpaper',
  'glass',
  'effects',
  'performance',
  'customThemes',
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
  set(field: string, value: unknown): Promise<void>;
}

interface SettingsScopeBinderLike {
  bind(spec: { namespace: string }): SettingsScopeLike;
}

interface SlotsLike {
  inject(slot: string, callback: () => void): void;
  register(options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown): () => void;
}

interface ClientContext {
  get(name: string): unknown;
  effect(fn: () => (() => void) | void, label?: string): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

export const inject = ['theme', 'settingsScope', 'slots', 'connection', 'remote'] as const;

const RADIUS: Record<string, string> = { compact: '6px', standard: '10px', soft: '16px' };
const CONTENT_MAX: Record<string, string> = { compact: '820px', standard: '1080px', wide: '100%' };

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

export function apply(ctx: ClientContext): void {
  const theme = ctx.get('theme') as ThemeRuntimeLike | undefined;
  const settingsScope = ctx.get('settingsScope') as SettingsScopeBinderLike | undefined;
  const slots = ctx.get('slots') as SlotsLike | undefined;

  // An explicit local save is available before the asynchronous host settings
  // scope becomes ready, preventing a refresh from flashing/resetting defaults.
  let explicitBootstrap = loadConfigSnapshot();
  const store = createStore<DesktopThemesConfig>(
    hydrateBuiltinWallpaper(explicitBootstrap ?? createDefaultConfig()),
  );

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
      const signature = `${custom.base}|${JSON.stringify(custom.colors)}`;
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
  staticStyles.set(staticCss + '\n' + petCss);

  // ---- Effects engine ------------------------------------------------------
  const effects = new EffectsEngine();

  // ---- Transparency layer management ------------------------------------
  let activeThemeId: string = store.get().theme;
  let transparencyDisposer: (() => void) | null = null;

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
    if (theme === undefined || !isTransparencyActive(config.appearance)) return;
    transparencyDisposer = theme.overrideTokens(
      OVERRIDE_SOURCE,
      buildTransparencyOverrides(config.appearance, activeThemeId, config.wallpaper.enabled, config.customThemes),
    );
  };

  // ---- Dynamic CSS (fonts / wallpaper / glass / layout) -------------------
  let rafCancel: (() => void) | null = null;
  const applyDynamic = (config: DesktopThemesConfig) => {
    if (rafCancel !== null) rafCancel();
    rafCancel = scheduleRaf(() => {
      const palette = resolvePalette(config.theme, config.customThemes);
      const css = [
        buildFontCss(config.font),
        buildWallpaperCss(config.wallpaper, palette?.accent),
        buildGlassCss(glassFor(config), supportsBackdropFilter()),
        buildLayoutCss(config),
      ].join('\n');
      dynamicStyles.set(css);
    });
  };

  // Power-saver mode disables complex blur.
  const glassFor = (config: DesktopThemesConfig) => {
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
    const localSaved = explicit ? saveConfigSnapshot(store.get()) : true;
    if (scope === null || Object.keys(pending).length === 0) {
      const ok = explicit ? localSaved : true;
      saveNotifier.set({ saving: false, saved: ok, failed: !ok });
      if (ok) setTimeout(() => saveNotifier.set({ saving: false, saved: false, failed: false }), 1800);
      return ok;
    }
    const writes = Object.entries(pending);
    pending = {};
    const results = await Promise.allSettled(writes.map(([field, value]) => scope!.set(field, value)));
    const remoteSaved = results.every((result) => result.status === 'fulfilled');
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
    queueAllFields(store.get());
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
    if (themeChanged) assertTheme(next.theme);
    if (
      themeChanged ||
      customThemesChanged ||
      !deepEqual(next.font, prev.font) ||
      !deepEqual(next.appearance, prev.appearance) ||
      !deepEqual(next.wallpaper, prev.wallpaper) ||
      !deepEqual(next.glass, prev.glass) ||
      !deepEqual(next.performance, prev.performance)
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
      !deepEqual(next.effects, prev.effects) ||
      !deepEqual(next.performance, prev.performance)
    ) applyEffects(next);
  };

  // ---- Commit path (preview + persist) ------------------------------------
  const commit = (next: DesktopThemesConfig) => {
    next = hydrateBuiltinWallpaper(next);
    const prev = store.get();
    if (deepEqual(next, prev)) return;
    syncCustomThemes(next);
    applyRuntime(next);
    if (scope === null) return;
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
  applyEffects(store.get());
  syncCustomThemes(store.get());
  assertTheme(store.get().theme);

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
  if (settingsScope !== undefined) {
    try {
      scope = settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
    } catch (error) {
      console.warn('[dsh-desktop-themes] settingsScope.bind failed:', error);
      scope = null;
    }
    const adopt = () => {
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
      applyEffects(incoming);
      void restoreDurableWallpaper(incoming);
    };
    scope?.subscribe(adopt);
    adopt();
  }

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
      if (rafCancel !== null) rafCancel();
      if (typeof cancelAnimationFrame === 'function' && reconcileRaf !== 0) cancelAnimationFrame(reconcileRaf);
      for (const timer of reconcileTimers) clearTimeout(timer);
      effects.dispose();
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
