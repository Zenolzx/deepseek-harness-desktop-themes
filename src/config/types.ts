/**
 * Shared configuration types for DeepSeek Harness Desktop Themes (schema v3).
 *
 * These types are platform-agnostic: they are imported by the Host entry
 * (schema registration) and the Client entry (presenter + settings UI), and
 * they are the single source of truth for the persisted settings shape.
 */

/** Identifier of one of the six built-in desktop themes. */
export type ThemeId =
  | 'quantum-blue'
  | 'aurora-dream'
  | 'mint-breeze'
  | 'sakura-mist'
  | 'sunset-flow'
  | 'obsidian-gold';

/** Wallpaper background fit modes. */
export type WallpaperFit = 'cover' | 'contain' | 'stretch' | 'center' | 'tile';

/** Glassmorphism blur strength presets. */
export type BlurLevel = 'off' | 'light' | 'standard' | 'strong';

/** Global performance tier (drives particle counts, effects, GPU budget). */
export type PerformanceLevel = 'power-saver' | 'balanced' | 'quality';

/** Animation speed presets. */
export type AnimationSpeed = 'still' | 'gentle' | 'standard' | 'active';

/** Particle density presets. */
export type ParticleDensity = 'off' | 'low' | 'medium' | 'high';

/** Light / glow intensity presets. */
export type LightIntensity = 'off' | 'soft' | 'standard' | 'bright';

/** Corner-radius presets. */
export type BorderRadiusLevel = 'compact' | 'standard' | 'soft';

/**
 * Content-surface treatment.
 *
 * - `classic` keeps the product's own diff/code surfaces untouched (the
 *   pre-1.7 look) so a user can fall back without losing the theme.
 * - `refined` applies the theme-derived content layer: low-contrast diff rows,
 *   a thin marker bar, a card-like document preview and opaque code surfaces.
 */
export type ContentStyle = 'classic' | 'refined';

/** Desktop pet character style. */
export type PetStyle = 'moonfox';

/** Desktop pet voice (text-to-speech) emotion presets. */
export type VoiceStyle = 'normal' | 'gentle' | 'cheerful' | 'playful' | 'calm' | 'robot';

/** Content width presets. */
export type ContentWidthLevel = 'compact' | 'standard' | 'wide';

/** Built-in visual-effect presets. */
export type EffectPresetId =
  | 'none'
  | 'tech-data'
  | 'starfield'
  | 'aurora-flow'
  | 'fireflies'
  | 'bubbles'
  | 'sakura'
  | 'gold-dust'
  | 'breathing'
  | 'custom';

export interface FontConfig {
  /** UI font preset key (see src/fonts/presets.ts). */
  uiPreset: string;
  /** Code font preset key. */
  codePreset: string;
  /** Custom UI font family (used only when `uiPreset === 'custom'`). */
  uiCustomFamily: string;
  /** Custom code font family (used only when `codePreset === 'custom'`). */
  codeCustomFamily: string;
  /** Base UI font size in px. */
  fontSize: number;
  /** Code font size in px. */
  codeFontSize: number;
  /** Base line height (unitless multiplier). */
  lineHeight: number;
  /** Base font weight (100..900). */
  fontWeight: number;
  /** Whether font ligatures are enabled for the code font. */
  ligatures: boolean;
  /** Whether font smoothing (antialiasing) is enabled. */
  smoothing: boolean;
}

export interface AppearanceConfig {
  /** Master switch for the semi-transparent surface layer. */
  transparencyEnabled: boolean;
  /** App base background opacity (0.55..1.00). */
  windowOpacity: number;
  /** Sidebar background opacity (0.55..1.00). */
  sidebarOpacity: number;
  /** Content panel background opacity (0.55..1.00). */
  panelOpacity: number;
  /** Input area background opacity (0.55..1.00). */
  inputOpacity: number;
  /** Corner radius preset. */
  borderRadius: BorderRadiusLevel;
  /** Content width preset. */
  contentWidth: ContentWidthLevel;
  /** Whether theme transitions / hover animations are enabled. */
  animationsEnabled: boolean;
  /** Content-surface treatment (see {@link ContentStyle}). */
  contentStyle: ContentStyle;
  /** Diff highlight strength multiplier (0.5 = half, 1 = standard). */
  diffTint: number;
}

export interface WallpaperConfig {
  /** Master switch for the custom wallpaper layer. */
  enabled: boolean;
  /**
   * Stable managed resource id (an IndexedDB key owned by the plugin). Empty
   * disables. The raw image bytes live in IndexedDB, never in settings.
   */
  sourceId: string;
  /**
   * Runtime display URL (a `blob:` object URL derived from `sourceId`). This
   * field is NOT the durable source and is cleared/re-derived across restarts.
   */
  path: string;
  /** Original file name (shown in the recent list). */
  name: string;
  /** Background fit mode. */
  fit: WallpaperFit;
  /** Horizontal anchor 0..100 (percent). */
  positionX: number;
  /** Vertical anchor 0..100 (percent). */
  positionY: number;
  /** Zoom factor (0.5..3.0, 1 = native). */
  scale: number;
  /** Wallpaper opacity (0..1). */
  opacity: number;
  /** Wallpaper blur radius in px (0..50). */
  blur: number;
  /** Dark overlay strength over the wallpaper (0..1). */
  overlay: number;
  /** Saturation adjustment (0..2, 1 = none). */
  saturation: number;
  /** Brightness adjustment (0.5..1.5, 1 = none). */
  brightness: number;
  /** Mix the wallpaper with the theme accent color. */
  tintEnabled: boolean;
  /** Accent-mix strength (0..1). */
  tintStrength: number;
}

export interface EffectsConfig {
  /** Master switch for the visual effects layer. */
  enabled: boolean;
  /** Selected effect preset. */
  preset: EffectPresetId;
  /** Particle density preset (off/low/medium/high). */
  density: ParticleDensity;
  /** Explicit particle count; 0 = auto (derived from density + area + tier). */
  particleCount: number;
  /** Particle size (1..6, abstract units). */
  particleSize: number;
  /** Particle speed multiplier (0.2..3). */
  particleSpeed: number;
  /** Particle opacity (0..1). */
  particleOpacity: number;
  /** Connect nearby particles with lines. */
  connectLines: boolean;
  /** Let particles drift toward the pointer. */
  mouseInteraction: boolean;
  /** Background parallax shift. */
  parallax: boolean;
  /** Soft cursor-following glow. */
  cursorGlow: boolean;
  /** Light / glow intensity preset. */
  glowIntensity: LightIntensity;
  /** Animation speed preset. */
  animationSpeed: AnimationSpeed;
  /** Derive particle/glow colors from the active theme automatically. */
  autoThemeColors: boolean;
  /** Override particle colors (used when `autoThemeColors` is false). */
  particleColors: string[];
  /** Override glow colors (used when `autoThemeColors` is false). */
  glowColors: string[];
}

export interface PerformanceConfig {
  /** Global performance tier. */
  level: PerformanceLevel;
}

export interface GlassConfig {
  /** Master switch for glassmorphism. */
  enabled: boolean;
  /** Blur strength preset. */
  blurLevel: BlurLevel;
  /** Custom blur radius in px (used by the advanced control). */
  strength: number;
  /** Backdrop saturation (0.5..2.0, 1 = none). */
  saturation: number;
  /** Panel fill opacity for the glass surface (0..1). */
  panelOpacity: number;
  /** Border highlight strength (0..1). */
  borderHighlight: number;
  /** Soft shadow strength (0..1). */
  shadow: number;
}

export interface CustomThemeColors {
  primary: string;
  accent: string;
  background: string;
  panel: string;
  text: string;
  particle: string;
  glow: string;
}

export interface CustomThemeConfig {
  id: string;
  name: string;
  /** Built-in theme id used as the starting point. */
  base: string;
  colors: CustomThemeColors;
}

export interface PetConfig {
  /** Master switch for the desktop pet. */
  enabled: boolean;
  /** Character style. */
  style: PetStyle;
  /** Horizontal anchor 0..100 (percent of viewport). */
  positionX: number;
  /** Vertical anchor 0..100 (percent of viewport). */
  positionY: number;
  /** Pet size in px (64..288). */
  size: number;
  /** Idle animations (float, blink, steam) plus playful one-shot actions. */
  animations: boolean;
  /** Speech bubble on hover / click. */
  speech: boolean;
  /** Editable speech-bubble lines (one phrase per entry). */
  speechLines: string[];
  /** Master switch for the pet reading a line aloud after each turn. */
  voiceEnabled: boolean;
  /** Emotion preset for the read-aloud voice. */
  voiceStyle: VoiceStyle;
}

export interface DesktopThemesConfig {
  /** Persisted schema version (drives migration). */
  schemaVersion: number;
  /** Selected theme id (a built-in id or a custom theme id). */
  theme: string;
  font: FontConfig;
  appearance: AppearanceConfig;
  wallpaper: WallpaperConfig;
  glass: GlassConfig;
  effects: EffectsConfig;
  performance: PerformanceConfig;
  customThemes: CustomThemeConfig[];
  /** Recent wallpaper source ids (most recent first). */
  recentWallpapers: string[];
  /** Desktop pet configuration. */
  pet: PetConfig;
}

/**
 * Legacy (DSH 0.1.x) settings namespace registered through
 * `ctx.settings.register()`. The browser binds it through `settingsScope`.
 */
export const SETTINGS_NAMESPACE = 'ui-desktop-themes';

/**
 * DSH 0.2.x serves settings per profile entry id. This plugin's row in
 * `cordis.patch.yml` uses `id: desktop-themes`, so the browser binds
 * `ctx.configForms.get(CONFIG_ENTRY_ID)`.
 */
export const CONFIG_ENTRY_ID = 'desktop-themes';

/** Top-level fields of the persisted settings section (one write each). */
export type SettingsField = keyof Omit<DesktopThemesConfig, 'schemaVersion'>;

/** Current persisted schema version. */
export const SCHEMA_VERSION = 3;

/** Exported JSON envelope (the `schemaVersion` also lives inside the config). */
export interface ExportedConfig {
  schemaVersion: number;
  config: DesktopThemesConfig;
}
