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
      scene: '',
      appearance: { ...config.appearance, ...recipe.appearance, contentStyle: 'refined', diffTint: 1 },
      wallpaper: { ...config.wallpaper, ...recipe.wallpaper },
      glass: { ...config.glass, ...recipe.glass },
      effects: { ...config.effects, ...recipe.effects },
    };
  }
  return {
    ...config,
    scene: '',
    appearance: {
      ...config.appearance,
      // Workbench is deliberately near-solid: the content is the subject and
      // the wallpaper only remains as a faint spatial cue. Immersive keeps the
      // theme's translucent recipe instead.
      windowOpacity: 1,
      sidebarOpacity: 1,
      panelOpacity: 1,
      inputOpacity: 1,
      contentStyle: 'refined',
      diffTint: 0.75,
    },
    wallpaper: {
      ...config.wallpaper,
      opacity: Math.min(config.wallpaper.opacity, 0.28),
      overlay: Math.max(config.wallpaper.overlay, 0.56),
      tintStrength: Math.min(config.wallpaper.tintStrength, 0.08),
    },
    glass: { ...config.glass, enabled: false, blurLevel: 'off' },
    effects: {
      ...config.effects,
      density: 'low',
      particleOpacity: Math.min(config.effects.particleOpacity, 0.22),
      glowIntensity: 'off',
      connectLines: false,
      cursorGlow: false,
      parallax: false,
    },
  };
}
