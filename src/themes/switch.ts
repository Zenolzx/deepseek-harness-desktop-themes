/**
 * Theme switching policy, kept pure (no asset imports) so the rules can be
 * unit-tested and reused by the settings panel and the pet menu.
 *
 * The core promise of 1.9: a theme click must not destroy user assets. The
 * caller chooses between "only colours" (the default) and "full ambience".
 */

import type { DesktopThemesConfig, ThemeId } from '../config/types.ts';
import { THEME_VISUAL_DEFAULTS } from './visual-defaults.ts';

/** How much of the active look a theme switch is allowed to replace. */
export type ThemeSwitchMode = 'palette' | 'ambience';

export function isBuiltinThemeId(value: string): value is ThemeId {
  return Object.prototype.hasOwnProperty.call(THEME_VISUAL_DEFAULTS, value);
}

function isThemeOwnedWallpaper(config: DesktopThemesConfig): boolean {
  return config.wallpaper.sourceId.startsWith('builtin:');
}

function withBuiltinWallpaper(config: DesktopThemesConfig, id: ThemeId): DesktopThemesConfig['wallpaper'] {
  return {
    ...config.wallpaper,
    sourceId: `builtin:${id}`,
    // The client hydrates the actual asset URL from `sourceId`; keeping an old
    // theme's URL here would briefly paint the wrong image during a preview.
    path: '',
    name: `${id} · Built-in`,
  };
}

/**
 * Switch the theme without discarding the user's own assets.
 *
 * - `palette` (the default) only changes the theme id. Theme-owned built-in
 *   wallpapers follow the new theme; a custom wallpaper, its enabled flag and
 *   every effect/glass/transparency parameter are left untouched.
 * - `ambience` additionally applies the theme's atmospheric recipe (opacity,
 *   wallpaper grade, glass, particle recipe). A user-provided wallpaper is
 *   never replaced, and a disabled wallpaper stays disabled.
 *
 * Custom theme ids never carry an atmospheric recipe: switching to one is
 * always palette-only.
 */
export function switchTheme(
  config: DesktopThemesConfig,
  id: string,
  mode: ThemeSwitchMode = 'palette',
): DesktopThemesConfig {
  const preset = isBuiltinThemeId(id) ? THEME_VISUAL_DEFAULTS[id] : undefined;
  if (preset === undefined) return { ...config, theme: id };
  const themeId = id as ThemeId;

  const themeOwned = isThemeOwnedWallpaper(config);
  let next: DesktopThemesConfig = {
    ...config,
    theme: themeId,
    wallpaper: themeOwned ? withBuiltinWallpaper(config, themeId) : config.wallpaper,
  };

  if (mode === 'palette') return next;

  next = {
    ...next,
    appearance: { ...next.appearance, ...preset.appearance },
    glass: { ...next.glass, ...preset.glass },
    effects: { ...next.effects, ...preset.effects },
  };
  // A custom image is a user asset: keep every field. A disabled wallpaper
  // keeps its disabled state while still following the theme-owned image.
  if (themeOwned) {
    next = {
      ...next,
      wallpaper: { ...next.wallpaper, ...preset.wallpaper },
    };
  }
  return next;
}
