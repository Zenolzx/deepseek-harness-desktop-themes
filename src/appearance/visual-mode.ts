import type { DesktopThemesConfig, ThemeId } from '../config/types.ts';
import { THEME_VISUAL_DEFAULTS } from '../themes/visual-defaults.ts';

export type VisualMode = 'focus' | 'immersive';

const BUILTIN_IDS: readonly string[] = Object.keys(THEME_VISUAL_DEFAULTS);

/** Apply a reading-first or atmospheric recipe without replacing user assets. */
export function applyVisualModePreset(config: DesktopThemesConfig, mode: VisualMode): DesktopThemesConfig {
  const baseId = BUILTIN_IDS.includes(config.theme)
    ? config.theme
    : config.customThemes.find((theme) => theme.id === config.theme)?.base;
  const recipe = baseId && BUILTIN_IDS.includes(baseId)
    ? THEME_VISUAL_DEFAULTS[baseId as ThemeId]
    : THEME_VISUAL_DEFAULTS['obsidian-gold'];
  if (mode === 'immersive') {
    return {
      ...config,
      appearance: { ...config.appearance, ...recipe.appearance, contentStyle: 'refined', diffTint: 1 },
      wallpaper: { ...config.wallpaper, ...recipe.wallpaper },
      glass: { ...config.glass, ...recipe.glass },
      effects: { ...config.effects, ...recipe.effects },
    };
  }
  return {
    ...config,
    appearance: {
      ...config.appearance,
      windowOpacity: 0.94,
      sidebarOpacity: 0.94,
      panelOpacity: 0.96,
      inputOpacity: 0.98,
      contentStyle: 'refined',
      diffTint: 0.75,
    },
    wallpaper: { ...config.wallpaper, opacity: 0.58, overlay: 0.46, tintStrength: 0.1 },
    glass: { ...config.glass, blurLevel: 'light', panelOpacity: 0.94, shadow: 0.2 },
    effects: { ...config.effects, density: 'low', particleOpacity: 0.45, glowIntensity: 'soft', connectLines: false },
  };
}
