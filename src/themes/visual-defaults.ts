import type { AppearanceConfig, EffectsConfig, GlassConfig, ThemeId, WallpaperConfig } from '../config/types.ts';

export interface ThemeVisualDefaults {
  appearance: Partial<AppearanceConfig>;
  wallpaper: Partial<WallpaperConfig>;
  glass: Partial<GlassConfig>;
  effects: Partial<EffectsConfig>;
}

/**
 * Theme recipes, split into two families:
 *  - Workbench: paper-like surfaces, near-solid panels, no particles.
 *  - Cinema: deeper grounds, atmospheric wallpaper and a restrained effect.
 *
 * Scene presets layer on top of these; `switchTheme(..., 'ambience')` uses the
 * recipe directly.
 */
export const THEME_VISUAL_DEFAULTS: Record<ThemeId, ThemeVisualDefaults> = {
  'mint-breeze': {
    appearance: { windowOpacity: 1, sidebarOpacity: 1, panelOpacity: 1, inputOpacity: 1, borderRadius: 'standard' },
    wallpaper: { opacity: 0.24, overlay: 0.4, saturation: 0.95, brightness: 1.02, tintEnabled: true, tintStrength: 0.06 },
    glass: { enabled: false, blurLevel: 'off', saturation: 1, panelOpacity: 0.98, borderHighlight: 0.28, shadow: 0.1 },
    effects: { enabled: false, preset: 'none', density: 'off', particleSize: 2, particleSpeed: 0.4, particleOpacity: 0.2, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'off', animationSpeed: 'still' },
  },
  'sakura-mist': {
    appearance: { windowOpacity: 1, sidebarOpacity: 1, panelOpacity: 1, inputOpacity: 1, borderRadius: 'compact' },
    wallpaper: { opacity: 0.22, overlay: 0.38, saturation: 0.92, brightness: 1.02, tintEnabled: true, tintStrength: 0.05 },
    glass: { enabled: false, blurLevel: 'off', saturation: 1, panelOpacity: 0.98, borderHighlight: 0.3, shadow: 0.1 },
    effects: { enabled: false, preset: 'none', density: 'off', particleSize: 2, particleSpeed: 0.4, particleOpacity: 0.2, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'off', animationSpeed: 'still' },
  },
  'quantum-blue': {
    appearance: { windowOpacity: 0.99, sidebarOpacity: 0.98, panelOpacity: 0.99, inputOpacity: 1, borderRadius: 'compact' },
    wallpaper: { opacity: 0.26, overlay: 0.48, saturation: 0.9, brightness: 0.95, tintEnabled: true, tintStrength: 0.05 },
    glass: { enabled: false, blurLevel: 'off', saturation: 1, panelOpacity: 0.98, borderHighlight: 0.24, shadow: 0.18 },
    effects: { enabled: true, preset: 'starfield', density: 'low', particleSize: 2, particleSpeed: 0.45, particleOpacity: 0.22, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'soft', animationSpeed: 'gentle' },
  },
  'aurora-dream': {
    appearance: { windowOpacity: 0.9, sidebarOpacity: 0.86, panelOpacity: 0.9, inputOpacity: 0.94, borderRadius: 'soft' },
    wallpaper: { opacity: 0.7, overlay: 0.4, saturation: 0.95, brightness: 0.86, tintEnabled: true, tintStrength: 0.12 },
    glass: { enabled: true, blurLevel: 'light', saturation: 1.1, panelOpacity: 0.9, borderHighlight: 0.36, shadow: 0.3 },
    effects: { enabled: true, preset: 'aurora-flow', density: 'low', particleSize: 2, particleSpeed: 0.6, particleOpacity: 0.36, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'soft', animationSpeed: 'gentle' },
  },
  'sunset-flow': {
    appearance: { windowOpacity: 0.9, sidebarOpacity: 0.86, panelOpacity: 0.9, inputOpacity: 0.94, borderRadius: 'soft' },
    wallpaper: { opacity: 0.7, overlay: 0.4, saturation: 0.9, brightness: 0.88, tintEnabled: true, tintStrength: 0.12 },
    glass: { enabled: true, blurLevel: 'light', saturation: 1.08, panelOpacity: 0.9, borderHighlight: 0.34, shadow: 0.32 },
    effects: { enabled: true, preset: 'fireflies', density: 'low', particleSize: 2.5, particleSpeed: 0.55, particleOpacity: 0.36, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'soft', animationSpeed: 'gentle' },
  },
  'obsidian-gold': {
    appearance: { windowOpacity: 0.9, sidebarOpacity: 0.86, panelOpacity: 0.9, inputOpacity: 0.94, borderRadius: 'soft' },
    wallpaper: { opacity: 0.74, overlay: 0.45, saturation: 0.9, brightness: 0.9, tintEnabled: true, tintStrength: 0.12 },
    glass: { enabled: true, blurLevel: 'light', saturation: 1.05, panelOpacity: 0.9, borderHighlight: 0.36, shadow: 0.38 },
    effects: { enabled: true, preset: 'gold-dust', density: 'low', particleSize: 2.5, particleSpeed: 0.65, particleOpacity: 0.36, connectLines: false, mouseInteraction: false, parallax: false, cursorGlow: false, glowIntensity: 'soft', animationSpeed: 'gentle' },
  },
};
