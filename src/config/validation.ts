/**
 * Runtime validation, coercion, and version migration for the desktop-themes
 * configuration. This module is dependency-free (no schemastery) so it can run
 * on both the Host and the Client; it is the "invalid config must never crash
 * the plugin" boundary.
 *
 * Design: every parser is total — it either returns a fully-formed value or a
 * per-field default, and never throws. Callers never receive partial objects.
 */

import {
  DEFAULT_APPEARANCE,
  DEFAULT_CONFIG,
  DEFAULT_EFFECTS,
  DEFAULT_FONT,
  DEFAULT_GLASS,
  DEFAULT_PERFORMANCE,
  DEFAULT_PET,
  DEFAULT_WALLPAPER,
  createDefaultConfig,
} from './defaults.ts';
import type {
  AppearanceConfig,
  BorderRadiusLevel,
  BlurLevel,
  ContentStyle,
  ContentWidthLevel,
  CustomThemeConfig,
  CustomThemeColors,
  DesktopThemesConfig,
  EffectPresetId,
  EffectsConfig,
  FontConfig,
  GlassConfig,
  LightIntensity,
  PerformanceConfig,
  PerformanceLevel,
  PetConfig,
  PetStyle,
  ThemeId,
  VoiceStyle,
  WallpaperConfig,
  WallpaperFit,
} from './types.ts';
import { SCHEMA_VERSION } from './types.ts';
import { THEME_VISUAL_DEFAULTS } from '../themes/visual-defaults.ts';

const THEME_IDS: readonly string[] = [
  'quantum-blue',
  'aurora-dream',
  'mint-breeze',
  'sakura-mist',
  'sunset-flow',
  'obsidian-gold',
];
const FIT_MODES: readonly WallpaperFit[] = ['cover', 'contain', 'stretch', 'center', 'tile'];
const BLUR_LEVELS: readonly BlurLevel[] = ['off', 'light', 'standard', 'strong'];
const PERFORMANCE_LEVELS: readonly PerformanceLevel[] = ['power-saver', 'balanced', 'quality'];
const ANIMATION_SPEEDS = ['still', 'gentle', 'standard', 'active'] as const;
const DENSITIES = ['off', 'low', 'medium', 'high'] as const;
const LIGHT_INTENSITIES: readonly LightIntensity[] = ['off', 'soft', 'standard', 'bright'];
const RADIUS_LEVELS: readonly BorderRadiusLevel[] = ['compact', 'standard', 'soft'];
const CONTENT_STYLES: readonly ContentStyle[] = ['classic', 'refined'];
const WIDTH_LEVELS: readonly ContentWidthLevel[] = ['compact', 'standard', 'wide'];
const PET_STYLES: readonly PetStyle[] = ['moonfox'];
const VOICE_STYLES = ['normal', 'gentle', 'cheerful', 'playful', 'calm', 'robot'] as const;
const EFFECT_PRESETS: readonly EffectPresetId[] = [
  'none',
  'tech-data',
  'starfield',
  'aurora-flow',
  'fireflies',
  'bubbles',
  'sakura',
  'gold-dust',
  'breathing',
  'custom',
];

/** Legacy v1 theme id → nearest v2 theme id. */
const LEGACY_THEME: Record<string, string> = {
  'tokyo-night': 'quantum-blue',
  'catppuccin-mocha': 'aurora-dream',
  'black-gold': 'obsidian-gold',
};

/** Legacy v1 family name → v2 preset key (lower-cased lookup). */
const LEGACY_UI_PRESET: Record<string, string> = {
  inter: 'system',
  system: 'system',
  'system-ui': 'system',
  'lxgw wenkai': 'lxgw-wenkai',
  '霞鹜文楷': 'lxgw-wenkai',
  'maple ui': 'maple-ui',
  misans: 'misans',
  'mi sans': 'misans',
  'harmonyos sans sc': 'harmonyos-sans',
  'harmonyos sans': 'harmonyos-sans',
  'noto sans sc': 'noto-sans-sc',
  'microsoft yahei ui': 'ms-yahei-ui',
  'microsoft yahei': 'ms-yahei-ui',
  '微软雅黑': 'ms-yahei-ui',
  'pingfang sc': 'pingfang-sc',
  '苹方': 'pingfang-sc',
};

const LEGACY_CODE_PRESET: Record<string, string> = {
  'jetbrains mono': 'jetbrains-mono',
  'maple mono': 'maple-mono',
  'cascadia code': 'cascadia-code',
  'fira code': 'fira-code',
  'source code pro': 'source-code-pro',
  'ibm plex mono': 'ibm-plex-mono',
  consolas: 'consolas',
  monospace: 'system-mono',
  system: 'system-mono',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string, max = 512): string {
  return typeof value === 'string' && value.length <= max ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Coerce a number, clamping to [min,max] and snapping to `step` where given. */
function asNumber(value: unknown, fallback: number, min: number, max: number, step?: number): number {
  let result = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  result = Math.min(max, Math.max(min, result));
  if (step !== undefined && step > 0) {
    result = Math.round(result / step) * step;
  }
  const decimals = (String(step ?? 0).split('.')[1] ?? '').length;
  return Number(result.toFixed(decimals));
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function asStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.length > 256) continue;
    if (out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

/** Validate a `#RGB`/`#RRGGBB`/`#RRGGBBAA` hex color (returns true when valid). */
function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

function asColor(value: unknown, fallback: string): string {
  return isHexColor(value) ? value : fallback;
}

function coerceFont(value: unknown): FontConfig {
  const src = isObject(value) ? value : {};
  return {
    uiPreset: asString(src.uiPreset, DEFAULT_FONT.uiPreset, 64),
    codePreset: asString(src.codePreset, DEFAULT_FONT.codePreset, 64),
    uiCustomFamily: asString(src.uiCustomFamily, '', 256),
    codeCustomFamily: asString(src.codeCustomFamily, '', 256),
    fontSize: asNumber(src.fontSize, DEFAULT_FONT.fontSize, 10, 24, 1),
    codeFontSize: asNumber(src.codeFontSize, DEFAULT_FONT.codeFontSize, 9, 24, 1),
    lineHeight: asNumber(src.lineHeight, DEFAULT_FONT.lineHeight, 1, 2.5, 0.05),
    fontWeight: asNumber(src.fontWeight, DEFAULT_FONT.fontWeight, 100, 900, 100),
    ligatures: asBoolean(src.ligatures, DEFAULT_FONT.ligatures),
    smoothing: asBoolean(src.smoothing, DEFAULT_FONT.smoothing),
  };
}

function coerceAppearance(value: unknown): AppearanceConfig {
  const src = isObject(value) ? value : {};
  return {
    transparencyEnabled: asBoolean(src.transparencyEnabled, DEFAULT_APPEARANCE.transparencyEnabled),
    windowOpacity: asNumber(src.windowOpacity, DEFAULT_APPEARANCE.windowOpacity, 0.55, 1, 0.01),
    sidebarOpacity: asNumber(src.sidebarOpacity, DEFAULT_APPEARANCE.sidebarOpacity, 0.55, 1, 0.01),
    panelOpacity: asNumber(src.panelOpacity, DEFAULT_APPEARANCE.panelOpacity, 0.55, 1, 0.01),
    inputOpacity: asNumber(src.inputOpacity, DEFAULT_APPEARANCE.inputOpacity, 0.55, 1, 0.01),
    borderRadius: asEnum(src.borderRadius, RADIUS_LEVELS, DEFAULT_APPEARANCE.borderRadius),
    contentWidth: asEnum(src.contentWidth, WIDTH_LEVELS, DEFAULT_APPEARANCE.contentWidth),
    animationsEnabled: asBoolean(src.animationsEnabled, DEFAULT_APPEARANCE.animationsEnabled),
    contentStyle: asEnum(src.contentStyle, CONTENT_STYLES, DEFAULT_APPEARANCE.contentStyle),
    diffTint: asNumber(src.diffTint, DEFAULT_APPEARANCE.diffTint, 0.25, 2, 0.25),
  };
}

function coerceWallpaper(value: unknown): WallpaperConfig {
  const src = isObject(value) ? value : {};
  return {
    enabled: asBoolean(src.enabled, DEFAULT_WALLPAPER.enabled),
    sourceId: asString(src.sourceId, '', 128),
    path: asString(src.path, '', 1024),
    name: asString(src.name, '', 256),
    fit: asEnum(src.fit, FIT_MODES, DEFAULT_WALLPAPER.fit),
    positionX: asNumber(src.positionX, DEFAULT_WALLPAPER.positionX, 0, 100, 1),
    positionY: asNumber(src.positionY, DEFAULT_WALLPAPER.positionY, 0, 100, 1),
    scale: asNumber(src.scale, DEFAULT_WALLPAPER.scale, 0.5, 3, 0.05),
    opacity: asNumber(src.opacity, DEFAULT_WALLPAPER.opacity, 0, 1, 0.01),
    blur: asNumber(src.blur, DEFAULT_WALLPAPER.blur, 0, 50, 1),
    overlay: asNumber(src.overlay, DEFAULT_WALLPAPER.overlay, 0, 1, 0.01),
    saturation: asNumber(src.saturation, DEFAULT_WALLPAPER.saturation, 0, 2, 0.05),
    brightness: asNumber(src.brightness, DEFAULT_WALLPAPER.brightness, 0.5, 1.5, 0.05),
    tintEnabled: asBoolean(src.tintEnabled, DEFAULT_WALLPAPER.tintEnabled),
    tintStrength: asNumber(src.tintStrength, DEFAULT_WALLPAPER.tintStrength, 0, 1, 0.01),
  };
}

function coerceEffects(value: unknown): EffectsConfig {
  const src = isObject(value) ? value : {};
  return {
    enabled: asBoolean(src.enabled, DEFAULT_EFFECTS.enabled),
    preset: asEnum(src.preset, EFFECT_PRESETS, DEFAULT_EFFECTS.preset),
    density: asEnum(src.density, DENSITIES, DEFAULT_EFFECTS.density),
    particleCount: asNumber(src.particleCount, DEFAULT_EFFECTS.particleCount, 0, 400, 1),
    particleSize: asNumber(src.particleSize, DEFAULT_EFFECTS.particleSize, 1, 6, 0.5),
    particleSpeed: asNumber(src.particleSpeed, DEFAULT_EFFECTS.particleSpeed, 0.2, 3, 0.1),
    particleOpacity: asNumber(src.particleOpacity, DEFAULT_EFFECTS.particleOpacity, 0, 1, 0.01),
    connectLines: asBoolean(src.connectLines, DEFAULT_EFFECTS.connectLines),
    mouseInteraction: asBoolean(src.mouseInteraction, DEFAULT_EFFECTS.mouseInteraction),
    parallax: asBoolean(src.parallax, DEFAULT_EFFECTS.parallax),
    cursorGlow: asBoolean(src.cursorGlow, DEFAULT_EFFECTS.cursorGlow),
    glowIntensity: asEnum(src.glowIntensity, LIGHT_INTENSITIES, DEFAULT_EFFECTS.glowIntensity),
    animationSpeed: asEnum(src.animationSpeed, ANIMATION_SPEEDS, DEFAULT_EFFECTS.animationSpeed),
    autoThemeColors: asBoolean(src.autoThemeColors, DEFAULT_EFFECTS.autoThemeColors),
    particleColors: asStringArray(src.particleColors, 6),
    glowColors: asStringArray(src.glowColors, 6),
  };
}

function coercePerformance(value: unknown): PerformanceConfig {
  const src = isObject(value) ? value : {};
  return {
    level: asEnum(src.level, PERFORMANCE_LEVELS, DEFAULT_PERFORMANCE.level),
  };
}

function coercePet(value: unknown): PetConfig {
  const src = isObject(value) ? value : {};
  const speechLines = asStringArray(src.speechLines, 24);
  return {
    enabled: asBoolean(src.enabled, DEFAULT_PET.enabled),
    style: asEnum(src.style, PET_STYLES, DEFAULT_PET.style),
    positionX: asNumber(src.positionX, DEFAULT_PET.positionX, 0, 100, 1),
    positionY: asNumber(src.positionY, DEFAULT_PET.positionY, 0, 100, 1),
    size: asNumber(src.size, DEFAULT_PET.size, 64, 288, 1),
    animations: asBoolean(src.animations, DEFAULT_PET.animations),
    speech: asBoolean(src.speech, DEFAULT_PET.speech),
    speechLines: speechLines.length > 0 ? speechLines : [...DEFAULT_PET.speechLines],
    voiceEnabled: asBoolean(src.voiceEnabled, DEFAULT_PET.voiceEnabled),
    voiceStyle: asEnum(src.voiceStyle, VOICE_STYLES as readonly VoiceStyle[], DEFAULT_PET.voiceStyle),
  };
}

function coerceGlass(value: unknown): GlassConfig {
  const src = isObject(value) ? value : {};
  return {
    enabled: asBoolean(src.enabled, DEFAULT_GLASS.enabled),
    blurLevel: asEnum(src.blurLevel, BLUR_LEVELS, DEFAULT_GLASS.blurLevel),
    strength: asNumber(src.strength, DEFAULT_GLASS.strength, 0, 40, 1),
    saturation: asNumber(src.saturation, DEFAULT_GLASS.saturation, 0.5, 2, 0.05),
    panelOpacity: asNumber(src.panelOpacity, DEFAULT_GLASS.panelOpacity, 0, 1, 0.01),
    borderHighlight: asNumber(src.borderHighlight, DEFAULT_GLASS.borderHighlight, 0, 1, 0.01),
    shadow: asNumber(src.shadow, DEFAULT_GLASS.shadow, 0, 1, 0.01),
  };
}

function coerceCustomThemeColors(value: unknown): CustomThemeColors {
  const src = isObject(value) ? value : {};
  return {
    primary: asColor(src.primary, '#3b82f6'),
    accent: asColor(src.accent, '#22d3ee'),
    background: asColor(src.background, '#0b1120'),
    panel: asColor(src.panel, '#131c31'),
    text: asColor(src.text, '#e6edf7'),
    particle: asColor(src.particle, '#22d3ee'),
    glow: asColor(src.glow, '#3b82f6'),
  };
}

function coerceCustomTheme(value: unknown, index: number): CustomThemeConfig {
  const src = isObject(value) ? value : {};
  const id = asString(src.id, `custom-${index + 1}`, 64).startsWith('custom-')
    ? asString(src.id, `custom-${index + 1}`, 64)
    : `custom-${index + 1}`;
  return {
    id,
    name: asString(src.name, `Custom ${index + 1}`, 64),
    base: asString(src.base, 'quantum-blue', 64),
    colors: coerceCustomThemeColors(src.colors),
  };
}

function coerceCustomThemes(value: unknown): CustomThemeConfig[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: CustomThemeConfig[] = [];
  for (const item of value) {
    const theme = coerceCustomTheme(item, out.length);
    if (seen.has(theme.id)) continue;
    seen.add(theme.id);
    out.push(theme);
    if (out.length >= 50) break;
  }
  return out;
}

function coerceThemeId(value: unknown, customThemes: CustomThemeConfig[]): string {
  if (typeof value === 'string' && THEME_IDS.includes(value)) return value;
  if (typeof value === 'string' && customThemes.some((t) => t.id === value)) return value;
  // Legacy theme ids migrate to their closest new theme.
  if (typeof value === 'string' && LEGACY_THEME[value] !== undefined) return LEGACY_THEME[value];
  return DEFAULT_CONFIG.theme;
}

/**
 * Coerce an arbitrary value into a fully-formed config. Never throws. A
 * missing or non-object input yields the defaults; unknown keys are dropped.
 * The value is migrated from older schema versions first.
 */
export function coerceConfig(value: unknown): DesktopThemesConfig {
  if (!isObject(value)) return createDefaultConfig();
  const version = typeof value.schemaVersion === 'number' ? value.schemaVersion : 1;
  const migrated = version < SCHEMA_VERSION ? migrateConfig(value, version) : value;
  return coerceCurrent(migrated);
}

function coerceCurrent(value: Record<string, unknown>): DesktopThemesConfig {
  const customThemes = coerceCustomThemes(value.customThemes);
  return {
    schemaVersion: SCHEMA_VERSION,
    theme: coerceThemeId(value.theme, customThemes),
    font: coerceFont(value.font),
    appearance: coerceAppearance(value.appearance),
    wallpaper: coerceWallpaper(value.wallpaper),
    glass: coerceGlass(value.glass),
    effects: coerceEffects(value.effects),
    performance: coercePerformance(value.performance),
    customThemes,
    recentWallpapers: asStringArray(value.recentWallpapers, 16),
    pet: coercePet(value.pet),
  };
}

/** Map a legacy family name to a v2 preset, or '' when it is not a known preset. */
function mapLegacyFamily(family: unknown, table: Record<string, string>): string {
  if (typeof family !== 'string') return '';
  const key = family.trim().toLowerCase();
  return table[key] ?? '';
}

/**
 * Migrate a raw config document from `version` up to the current version.
 * Each step upgrades N → N+1; unknown future versions pass through untouched
 * (coercion still clamps them).
 */
function migrateConfig(config: Record<string, unknown>, version: number): Record<string, unknown> {
  let current = { ...config };
  let v = version;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (step === undefined) break;
    current = step(current);
    v += 1;
  }
  return current;
}

type MigrationStep = (config: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, MigrationStep> = {
  // v1 → v2: restructure theme ids, font presets, glass levels, and add the
  // effects / performance / custom-theme sections.
  1: (config) => {
    const next = { ...config };

    // Theme id: legacy → new (themeId legacy handled first).
    const rawTheme = typeof next.theme === 'string' ? next.theme : next.themeId;
    next.theme = typeof rawTheme === 'string' && LEGACY_THEME[rawTheme] !== undefined
      ? LEGACY_THEME[rawTheme]
      : rawTheme ?? DEFAULT_CONFIG.theme;
    delete next.themeId;

    // Font: legacy family names → preset keys.
    const font = isObject(next.font) ? next.font : {};
    const uiFamily = font.uiFamily;
    const chineseFamily = font.chineseFamily;
    const codeFamily = font.codeFamily;
    const uiMapped =
      mapLegacyFamily(chineseFamily, LEGACY_UI_PRESET) || mapLegacyFamily(uiFamily, LEGACY_UI_PRESET);
    const codeMapped = mapLegacyFamily(codeFamily, LEGACY_CODE_PRESET);
    const nextFont = { ...font };
    if (uiMapped) {
      nextFont.uiPreset = uiMapped;
      nextFont.uiCustomFamily = '';
    } else if (typeof chineseFamily === 'string' && chineseFamily.trim().length > 0) {
      nextFont.uiPreset = 'custom';
      nextFont.uiCustomFamily = chineseFamily;
    } else if (typeof uiFamily === 'string' && uiFamily.trim().length > 0) {
      nextFont.uiPreset = 'custom';
      nextFont.uiCustomFamily = uiFamily;
    }
    if (codeMapped) {
      nextFont.codePreset = codeMapped;
      nextFont.codeCustomFamily = '';
    } else if (typeof codeFamily === 'string' && codeFamily.trim().length > 0) {
      nextFont.codePreset = 'custom';
      nextFont.codeCustomFamily = codeFamily;
    }
    // Drop legacy font fields (no longer part of the persisted shape).
    delete nextFont.uiFamily;
    delete nextFont.codeFamily;
    delete nextFont.chineseFamily;
    next.font = nextFont;

    // Wallpaper: v1 kept a blob URL in `path` (non-durable). Keep it as the
    // runtime path but mark no durable source.
    if (isObject(next.wallpaper)) {
      const wp = { ...next.wallpaper };
      wp.sourceId = '';
      wp.name = '';
      wp.tintEnabled = false;
      wp.tintStrength = DEFAULT_WALLPAPER.tintStrength;
      next.wallpaper = wp;
    }

    // Glass: `performanceMode` → `blurLevel`.
    if (isObject(next.glass)) {
      const glass = { ...next.glass };
      const mode = glass.performanceMode;
      if (mode === 'off') glass.blurLevel = 'off';
      else if (mode === 'light') glass.blurLevel = 'light';
      else if (mode === 'strong') glass.blurLevel = 'strong';
      else glass.blurLevel = 'standard';
      // Preset tiers carry no custom-radius override (strength 0 = follow preset).
      if (mode === 'off' || mode === 'light' || mode === 'standard' || mode === 'strong') {
        glass.strength = 0;
      }
      delete glass.performanceMode;
      next.glass = glass;
    }

    next.schemaVersion = SCHEMA_VERSION;
    return next;
  },
  // v2 → v3: make the old barely-visible built-in effect recipes adopt the
  // stronger theme-specific defaults. Deliberately customized effects remain
  // untouched.
  2: (config) => {
    const next = { ...config };
    const theme: ThemeId = typeof next.theme === 'string' && THEME_IDS.includes(next.theme)
      ? (next.theme as ThemeId)
      : (DEFAULT_CONFIG.theme as ThemeId);
    const effects = isObject(next.effects) ? { ...next.effects } : {};
    const recipe = THEME_VISUAL_DEFAULTS[theme].effects;
    const wasLegacyRecipe = effects.preset === recipe.preset
      && effects.density === 'low'
      && (typeof effects.particleSize !== 'number' || effects.particleSize <= 2)
      && (typeof effects.particleOpacity !== 'number' || effects.particleOpacity <= 0.45);
    if (wasLegacyRecipe) next.effects = { ...effects, ...recipe };
    next.schemaVersion = SCHEMA_VERSION;
    return next;
  },
};

/**
 * Deep-merge a (possibly partial) user config over the defaults, field by
 * field, so an import that carries only a subset still produces a complete,
 * valid config. Used by the settings scope reader before coercion.
 */
export function mergeConfig(partial: unknown): DesktopThemesConfig {
  const base = createDefaultConfig();
  if (!isObject(partial)) return base;
  const coerced = coerceConfig({ ...partial, schemaVersion: SCHEMA_VERSION });
  return coerced;
}

/**
 * Parse an exported JSON document into a config, migrating older
 * `schemaVersion`s forward. Accepts either the envelope
 * `{ schemaVersion, config }` or a bare config object.
 */
export function importConfig(raw: unknown): DesktopThemesConfig {
  if (!isObject(raw)) return createDefaultConfig();

  if (isObject(raw.config)) {
    const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
    const inner = { ...(raw.config as Record<string, unknown>) };
    if (typeof inner.schemaVersion !== 'number') inner.schemaVersion = version;
    return coerceConfig(inner);
  }

  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  return coerceConfig({ ...raw, schemaVersion: version });
}

/** Whether a config document is well-formed enough to attempt an import. */
export function isProbablyConfig(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (isObject(value.config)) return true;
  return (
    typeof value.theme === 'string' ||
    typeof value.themeId === 'string' ||
    isObject(value.font) ||
    isObject(value.appearance) ||
    isObject(value.wallpaper) ||
    isObject(value.glass) ||
    isObject(value.effects)
  );
}

/** Whether a theme id references a built-in theme (vs. a custom theme). */
export function isBuiltinThemeId(id: string): id is ThemeId {
  return (THEME_IDS as readonly string[]).includes(id);
}
