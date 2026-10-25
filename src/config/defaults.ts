import type {
  AppearanceConfig,
  DesktopThemesConfig,
  EffectsConfig,
  FontConfig,
  GlassConfig,
  PerformanceConfig,
  PetConfig,
  WallpaperConfig,
} from './types.ts';
import { SCHEMA_VERSION } from './types.ts';

/**
 * Default configuration. Every value here must round-trip through the
 * schemastery schema (see `schema.ts`) so the resolved persisted section and
 * this object stay identical when nothing is overridden.
 */

export const DEFAULT_FONT: FontConfig = {
  uiPreset: 'system',
  codePreset: 'jetbrains-mono',
  uiCustomFamily: '',
  codeCustomFamily: '',
  fontSize: 14,
  codeFontSize: 13,
  lineHeight: 1.6,
  fontWeight: 400,
  ligatures: true,
  smoothing: true,
};

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  transparencyEnabled: true,
  windowOpacity: 0.94,
  sidebarOpacity: 0.94,
  panelOpacity: 0.96,
  inputOpacity: 0.98,
  borderRadius: 'soft',
  contentWidth: 'standard',
  animationsEnabled: true,
  contentStyle: 'refined',
  diffTint: 0.75,
};

export const DEFAULT_WALLPAPER: WallpaperConfig = {
  enabled: true,
  sourceId: 'builtin:obsidian-gold',
  path: '',
  name: 'Obsidian Gold · Built-in',
  fit: 'cover',
  positionX: 50,
  positionY: 50,
  scale: 1,
  opacity: 0.58,
  blur: 0,
  overlay: 0.46,
  saturation: 0.9,
  brightness: 0.9,
  tintEnabled: true,
  tintStrength: 0.14,
};

export const DEFAULT_EFFECTS: EffectsConfig = {
  enabled: true,
  preset: 'gold-dust',
  density: 'low',
  particleCount: 0,
  particleSize: 2.5,
  particleSpeed: 0.7,
  particleOpacity: 0.45,
  connectLines: false,
  mouseInteraction: false,
  parallax: false,
  cursorGlow: false,
  glowIntensity: 'soft',
  animationSpeed: 'gentle',
  autoThemeColors: true,
  particleColors: [],
  glowColors: [],
};

export const DEFAULT_PERFORMANCE: PerformanceConfig = {
  level: 'balanced',
};

export const DEFAULT_GLASS: GlassConfig = {
  enabled: true,
  blurLevel: 'light',
  strength: 0,
  saturation: 1.05,
  panelOpacity: 0.94,
  borderHighlight: 0.36,
  shadow: 0.2,
};

/** Default speech-bubble lines (one phrase per entry). */
export const DEFAULT_PET_SPEECH_LINES: string[] = [
  'debug + coffee = life',
  '404: 休息时间未找到',
  '月光巡逻中，一切正常',
  '再写一行就下班',
  '咖啡因已注入，冲刺中！',
  '别慌，先喝口咖啡',
  '编译通过？不存在的',
  '今天也是元气满满的一天',
];

export const DEFAULT_PET: PetConfig = {
  enabled: true,
  style: 'moonfox',
  positionX: 89,
  positionY: 82,
  size: 144,
  animations: true,
  speech: true,
  speechLines: [...DEFAULT_PET_SPEECH_LINES],
  voiceEnabled: false,
  voiceStyle: 'playful',
};

export const DEFAULT_CONFIG: DesktopThemesConfig = {
  schemaVersion: SCHEMA_VERSION,
  theme: 'obsidian-gold',
  font: DEFAULT_FONT,
  appearance: DEFAULT_APPEARANCE,
  wallpaper: DEFAULT_WALLPAPER,
  glass: DEFAULT_GLASS,
  effects: DEFAULT_EFFECTS,
  performance: DEFAULT_PERFORMANCE,
  customThemes: [],
  recentWallpapers: [],
  pet: DEFAULT_PET,
};

/** Lower bound enforced for any opacity slider (contrast floor). */
export const MIN_OPACITY = 0.55;

/** Recommended (safe) values the "restore recommended" action reverts to. */
export const RECOMMENDED_OPACITY = {
  windowOpacity: 0.94,
  sidebarOpacity: 0.94,
  panelOpacity: 0.96,
  inputOpacity: 0.98,
} as const;

/** A deep, frozen copy of the defaults (safe to hand to callers). */
export function createDefaultConfig(): DesktopThemesConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    theme: DEFAULT_CONFIG.theme,
    font: { ...DEFAULT_FONT },
    appearance: { ...DEFAULT_APPEARANCE },
    wallpaper: { ...DEFAULT_WALLPAPER },
    glass: { ...DEFAULT_GLASS },
    effects: {
      ...DEFAULT_EFFECTS,
      particleColors: [...DEFAULT_EFFECTS.particleColors],
      glowColors: [...DEFAULT_EFFECTS.glowColors],
    },
    performance: { ...DEFAULT_PERFORMANCE },
    customThemes: [],
    recentWallpapers: [],
    pet: { ...DEFAULT_PET, speechLines: [...DEFAULT_PET.speechLines] },
  };
}
