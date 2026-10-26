/**
 * Scene presets — the 2.0 top-level aesthetic layer.
 *
 * A scene is deliberately coarser than a theme: it names a complete working
 * posture (restrained workbench, cinematic, deep focus, review, night,
 * presentation) and applies the matching palette, surfaces, wallpaper grade,
 * motion and reading typography in one click. The theme picker remains for
 * users who only want a different colour world.
 */

import type {
  AppearanceConfig,
  DesktopThemesConfig,
  EffectsConfig,
  FontConfig,
  GlassConfig,
  SceneId,
  WallpaperConfig,
} from '../config/types.ts';
import { switchTheme } from '../themes/switch.ts';

export type SceneFamily = 'workbench' | 'cinema';

export interface ScenePreset {
  id: SceneId;
  family: SceneFamily;
  /** Built-in theme this scene is built around. */
  theme: string;
  appearance: Partial<AppearanceConfig>;
  wallpaper: Partial<WallpaperConfig>;
  glass: Partial<GlassConfig>;
  effects: Partial<EffectsConfig>;
  font: Partial<FontConfig>;
}

export const SCENES: readonly ScenePreset[] = [
  {
    id: 'workbench',
    family: 'workbench',
    theme: 'mint-breeze',
    appearance: { windowOpacity: 1, sidebarOpacity: 1, panelOpacity: 1, inputOpacity: 1, borderRadius: 'standard', contentWidth: 'standard', contentStyle: 'refined', diffTint: 0.6 },
    wallpaper: { opacity: 0.18, overlay: 0.42, saturation: 0.95, brightness: 1.02, tintEnabled: true, tintStrength: 0.04, safeArea: 'balanced' },
    glass: { enabled: false, blurLevel: 'off', panelOpacity: 0.98, borderHighlight: 0.28, shadow: 0.1 },
    effects: { enabled: false, preset: 'none', density: 'off', particleOpacity: 0.2, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'off', animationSpeed: 'still' },
    font: { fontSize: 14, codeFontSize: 13, lineHeight: 1.6 },
  },
  {
    id: 'cinema',
    family: 'cinema',
    theme: 'obsidian-gold',
    appearance: { windowOpacity: 0.9, sidebarOpacity: 0.86, panelOpacity: 0.9, inputOpacity: 0.94, borderRadius: 'soft', contentWidth: 'standard', contentStyle: 'refined', diffTint: 1 },
    wallpaper: { opacity: 0.74, overlay: 0.45, saturation: 0.9, brightness: 0.9, tintEnabled: true, tintStrength: 0.12, safeArea: 'balanced' },
    glass: { enabled: true, blurLevel: 'light', saturation: 1.05, panelOpacity: 0.9, borderHighlight: 0.36, shadow: 0.38 },
    effects: { enabled: true, preset: 'gold-dust', density: 'low', particleSize: 2.5, particleSpeed: 0.65, particleOpacity: 0.36, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'soft', animationSpeed: 'gentle' },
    font: { fontSize: 15, codeFontSize: 13, lineHeight: 1.65 },
  },
  {
    id: 'deep-focus',
    family: 'workbench',
    theme: 'quantum-blue',
    appearance: { windowOpacity: 0.99, sidebarOpacity: 0.98, panelOpacity: 0.99, inputOpacity: 1, borderRadius: 'compact', contentWidth: 'compact', contentStyle: 'refined', diffTint: 0.5 },
    wallpaper: { opacity: 0.12, overlay: 0.55, saturation: 0.85, brightness: 0.9, tintEnabled: true, tintStrength: 0.03, safeArea: 'strong' },
    glass: { enabled: false, blurLevel: 'off', panelOpacity: 0.99, borderHighlight: 0.22, shadow: 0.12 },
    effects: { enabled: false, preset: 'none', density: 'off', particleOpacity: 0.15, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'off', animationSpeed: 'still' },
    font: { fontSize: 14, codeFontSize: 13, lineHeight: 1.55 },
  },
  {
    id: 'review',
    family: 'workbench',
    theme: 'sakura-mist',
    appearance: { windowOpacity: 1, sidebarOpacity: 1, panelOpacity: 1, inputOpacity: 1, borderRadius: 'compact', contentWidth: 'wide', contentStyle: 'refined', diffTint: 0.8 },
    wallpaper: { opacity: 0.14, overlay: 0.36, saturation: 0.9, brightness: 1.02, tintEnabled: true, tintStrength: 0.03, safeArea: 'balanced' },
    glass: { enabled: false, blurLevel: 'off', panelOpacity: 0.99, borderHighlight: 0.3, shadow: 0.08 },
    effects: { enabled: false, preset: 'none', density: 'off', particleOpacity: 0.15, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'off', animationSpeed: 'still' },
    font: { fontSize: 14, codeFontSize: 13, lineHeight: 1.65 },
  },
  {
    id: 'night',
    family: 'cinema',
    theme: 'sunset-flow',
    appearance: { windowOpacity: 0.92, sidebarOpacity: 0.88, panelOpacity: 0.92, inputOpacity: 0.96, borderRadius: 'soft', contentWidth: 'standard', contentStyle: 'refined', diffTint: 0.9 },
    wallpaper: { opacity: 0.66, overlay: 0.5, saturation: 0.88, brightness: 0.86, tintEnabled: true, tintStrength: 0.1, safeArea: 'balanced' },
    glass: { enabled: true, blurLevel: 'light', saturation: 1.05, panelOpacity: 0.92, borderHighlight: 0.3, shadow: 0.3 },
    effects: { enabled: true, preset: 'fireflies', density: 'low', particleSize: 2.5, particleSpeed: 0.45, particleOpacity: 0.3, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'soft', animationSpeed: 'gentle' },
    font: { fontSize: 15, codeFontSize: 13, lineHeight: 1.65 },
  },
  {
    id: 'present',
    family: 'workbench',
    theme: 'mint-breeze',
    appearance: { windowOpacity: 1, sidebarOpacity: 1, panelOpacity: 1, inputOpacity: 1, borderRadius: 'standard', contentWidth: 'wide', contentStyle: 'refined', diffTint: 1 },
    wallpaper: { opacity: 0.1, overlay: 0.32, saturation: 1, brightness: 1.04, tintEnabled: true, tintStrength: 0.02, safeArea: 'off' },
    glass: { enabled: false, blurLevel: 'off', panelOpacity: 1, borderHighlight: 0.24, shadow: 0.06 },
    effects: { enabled: false, preset: 'none', density: 'off', particleOpacity: 0.1, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'off', animationSpeed: 'still' },
    font: { fontSize: 17, codeFontSize: 15, lineHeight: 1.75 },
  },
];

export function getScene(id: string): ScenePreset | undefined {
  return SCENES.find((scene) => scene.id === id);
}

function isCustomWallpaper(config: DesktopThemesConfig): boolean {
  return config.wallpaper.sourceId.length > 0 && !config.wallpaper.sourceId.startsWith('builtin:');
}

/**
 * Apply a scene. A user-provided wallpaper is never replaced, even by the
 * cinematic scenes; the wallpaper grade is only adjusted for theme-owned
 * images. Font families and the pet are left as the user set them.
 */
export function applyScene(config: DesktopThemesConfig, id: string): DesktopThemesConfig {
  const scene = getScene(id);
  if (scene === undefined) return { ...config, scene: '' };
  let next = switchTheme(config, scene.theme, 'ambience');
  next = {
    ...next,
    scene: scene.id,
    appearance: { ...next.appearance, ...scene.appearance },
    glass: { ...next.glass, ...scene.glass },
    effects: { ...next.effects, ...scene.effects },
    font: { ...next.font, ...scene.font },
  };
  if (!isCustomWallpaper(config)) {
    next = { ...next, wallpaper: { ...next.wallpaper, ...scene.wallpaper } };
  }
  return next;
}
