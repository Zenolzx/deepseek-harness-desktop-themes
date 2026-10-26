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
 *
 * 2.0 defaults to the restrained Paper workbench: opaque reading surfaces,
 * almost no wallpaper and no particle motion.
 */

export const DEFAULT_FONT: FontConfig = {
  uiPreset: 'system',
  codePreset: 'jetbrains-mono',
  uiCustomFamily: '',
  codeCustomFamily: '',
  fontSize: 14,
  codeFontSize: 13,
  lineHeight: 1.75,
  fontWeight: 400,
  ligatures: true,
  smoothing: true,
};

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  transparencyEnabled: true,
  windowOpacity: 1,
  sidebarOpacity: 1,
  panelOpacity: 1,
  inputOpacity: 1,
  borderRadius: 'standard',
  contentWidth: 'standard',
  animationsEnabled: true,
  contentStyle: 'refined',
  diffTint: 0.6,
};

export const DEFAULT_WALLPAPER: WallpaperConfig = {
  enabled: true,
  sourceId: 'builtin:mint-breeze',
  path: '',
  name: 'Paper · Built-in',
  fit: 'cover',
  positionX: 50,
  positionY: 50,
  focusX: 50,
  focusY: 42,
  safeArea: 'balanced',
  scale: 1,
  opacity: 0.32,
  blur: 0,
  overlay: 0.42,
  saturation: 0.95,
  brightness: 1.02,
  tintEnabled: true,
  tintStrength: 0.06,
};

export const DEFAULT_EFFECTS: EffectsConfig = {
  enabled: false,
  preset: 'none',
  density: 'off',
  particleCount: 0,
  particleSize: 2,
  particleSpeed: 0.4,
  particleOpacity: 0.2,
  connectLines: false,
  mouseInteraction: false,
  parallax: false,
  cursorGlow: false,
  glowIntensity: 'off',
  animationSpeed: 'still',
  autoThemeColors: true,
  particleColors: [],
  glowColors: [],
};

export const DEFAULT_PERFORMANCE: PerformanceConfig = {
  level: 'balanced',
};

export const DEFAULT_GLASS: GlassConfig = {
  enabled: false,
  blurLevel: 'off',
  strength: 0,
  saturation: 1,
  panelOpacity: 0.98,
  borderHighlight: 0.28,
  shadow: 0.1,
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
  enabled: false,
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

export const DEFAULT_SCENE = 'workbench';

export const DEFAULT_CONFIG: DesktopThemesConfig = {
  workspace: { style: 'paper', mode: 'create', ambience: 'balanced', warmth: 0.7, depth: 0.65 },
  schemaVersion: SCHEMA_VERSION,
  scene: DEFAULT_SCENE,
  theme: 'mint-breeze',
  font: DEFAULT_FONT,
  appearance: DEFAULT_APPEARANCE,
  wallpaper: DEFAULT_WALLPAPER,
  glass: DEFAULT_GLASS,
  effects: DEFAULT_EFFECTS,
  performance: DEFAULT_PERFORMANCE,
  customThemes: [],
  themeSchedule: { enabled: false, family: '' },
  recentWallpapers: [],
  pet: DEFAULT_PET,
};

/** Lower bound enforced for any opacity slider (contrast floor). */
export const MIN_OPACITY = 0.55;

/** Recommended (safe) values the "restore recommended" action reverts to. */
export const RECOMMENDED_OPACITY = {
  windowOpacity: 1,
  sidebarOpacity: 1,
  panelOpacity: 1,
  inputOpacity: 1,
} as const;

/** A deep, frozen copy of the defaults (safe to hand to callers). */
export function createDefaultConfig(): DesktopThemesConfig {
  return {
    workspace: { ...DEFAULT_CONFIG.workspace },
    schemaVersion: SCHEMA_VERSION,
    scene: DEFAULT_SCENE,
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
    themeSchedule: { enabled: false, family: '' },
    recentWallpapers: [],
    pet: { ...DEFAULT_PET, speechLines: [...DEFAULT_PET.speechLines] },
  };
}
