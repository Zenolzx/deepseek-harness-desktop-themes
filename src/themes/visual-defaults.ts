import type { AppearanceConfig, EffectsConfig, GlassConfig, ThemeId, WallpaperConfig } from '../config/types.ts';

export interface ThemeVisualDefaults {
  appearance: Partial<AppearanceConfig>;
  wallpaper: Partial<WallpaperConfig>;
  glass: Partial<GlassConfig>;
  effects: Partial<EffectsConfig>;
}

/** Atmospheric recipes; built-in theme selection applies the focus treatment on top. */
export const THEME_VISUAL_DEFAULTS: Record<ThemeId, ThemeVisualDefaults> = {
  'quantum-blue': {
    appearance: { windowOpacity: 0.88, sidebarOpacity: 0.8, panelOpacity: 0.86, inputOpacity: 0.9, borderRadius: 'compact' },
    wallpaper: { opacity: 0.66, overlay: 0.34, saturation: 1.05, brightness: 0.8, tintEnabled: true, tintStrength: 0.16 },
    glass: { blurLevel: 'light', saturation: 1.1, panelOpacity: 0.86, borderHighlight: 0.38, shadow: 0.34 },
    effects: { enabled: true, preset: 'tech-data', density: 'medium', particleSize: 2.5, particleSpeed: 0.9, particleOpacity: 0.82, connectLines: true, glowIntensity: 'standard', animationSpeed: 'standard' },
  },
  'aurora-dream': {
    appearance: { windowOpacity: 0.88, sidebarOpacity: 0.8, panelOpacity: 0.84, inputOpacity: 0.88, borderRadius: 'soft' },
    wallpaper: { opacity: 0.64, overlay: 0.38, saturation: 0.95, brightness: 0.8, tintEnabled: true, tintStrength: 0.12 },
    glass: { blurLevel: 'standard', saturation: 1.15, panelOpacity: 0.82, borderHighlight: 0.42, shadow: 0.32 },
    effects: { enabled: true, preset: 'aurora-flow', density: 'medium', particleSize: 3.5, particleSpeed: 0.6, particleOpacity: 0.58, connectLines: false, glowIntensity: 'standard', animationSpeed: 'gentle' },
  },
  'mint-breeze': {
    appearance: { windowOpacity: 0.94, sidebarOpacity: 0.9, panelOpacity: 0.92, inputOpacity: 0.95, borderRadius: 'soft' },
    wallpaper: { opacity: 0.56, overlay: 0.04, saturation: 0.9, brightness: 1.05, tintEnabled: true, tintStrength: 0.08 },
    glass: { blurLevel: 'light', saturation: 1, panelOpacity: 0.9, borderHighlight: 0.5, shadow: 0.18 },
    effects: { enabled: true, preset: 'bubbles', density: 'medium', particleSize: 3, particleSpeed: 0.5, particleOpacity: 0.58, connectLines: false, glowIntensity: 'soft', animationSpeed: 'gentle' },
  },
  'sakura-mist': {
    appearance: { windowOpacity: 0.94, sidebarOpacity: 0.9, panelOpacity: 0.92, inputOpacity: 0.95, borderRadius: 'soft' },
    wallpaper: { opacity: 0.62, overlay: 0.05, saturation: 0.85, brightness: 1.05, tintEnabled: true, tintStrength: 0.08 },
    glass: { blurLevel: 'light', saturation: 1.05, panelOpacity: 0.91, borderHighlight: 0.46, shadow: 0.18 },
    effects: { enabled: true, preset: 'sakura', density: 'medium', particleSize: 3, particleSpeed: 0.6, particleOpacity: 0.68, connectLines: false, glowIntensity: 'soft', animationSpeed: 'standard' },
  },
  'sunset-flow': {
    appearance: { windowOpacity: 0.9, sidebarOpacity: 0.84, panelOpacity: 0.87, inputOpacity: 0.9, borderRadius: 'standard' },
    wallpaper: { opacity: 0.64, overlay: 0.4, saturation: 0.9, brightness: 0.8, tintEnabled: true, tintStrength: 0.12 },
    glass: { blurLevel: 'light', saturation: 1.1, panelOpacity: 0.86, borderHighlight: 0.36, shadow: 0.38 },
    effects: { enabled: true, preset: 'fireflies', density: 'medium', particleSize: 2.5, particleSpeed: 0.6, particleOpacity: 0.76, connectLines: false, glowIntensity: 'standard', animationSpeed: 'gentle' },
  },
  'obsidian-gold': {
    appearance: { windowOpacity: 0.9, sidebarOpacity: 0.82, panelOpacity: 0.88, inputOpacity: 0.9, borderRadius: 'soft' },
    wallpaper: { opacity: 0.72, overlay: 0.42, saturation: 0.9, brightness: 0.9, tintEnabled: true, tintStrength: 0.14 },
    glass: { blurLevel: 'light', saturation: 1.05, panelOpacity: 0.88, borderHighlight: 0.36, shadow: 0.42 },
    effects: { enabled: true, preset: 'gold-dust', density: 'medium', particleSize: 2.5, particleSpeed: 0.7, particleOpacity: 0.82, connectLines: false, glowIntensity: 'standard', animationSpeed: 'gentle' },
  },
};
