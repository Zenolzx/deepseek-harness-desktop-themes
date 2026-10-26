import type { DesktopThemesConfig, ThemeId } from '../config/types.ts';
import arc from '../assets/wallpapers/arc.svg';
import dune from '../assets/wallpapers/dune.svg';
import graphite from '../assets/wallpapers/graphite.svg';
import mist from '../assets/wallpapers/mist.svg';
import noir from '../assets/wallpapers/noir.svg';
import paper from '../assets/wallpapers/paper.svg';

const WALLPAPERS: Record<ThemeId, string> = {
  'quantum-blue': graphite,
  'aurora-dream': arc,
  'mint-breeze': paper,
  'sakura-mist': mist,
  'sunset-flow': dune,
  'obsidian-gold': noir,
};

const THEME_IDS = new Set<ThemeId>(Object.keys(WALLPAPERS) as ThemeId[]);

export function isBuiltinThemeId(value: string): value is ThemeId {
  return THEME_IDS.has(value as ThemeId);
}

export function builtinWallpaper(id: ThemeId): string {
  return WALLPAPERS[id];
}

/** Scenes/themes use the same vector art at thumbnail size; no second asset. */
export function builtinWallpaperThumbnail(id: ThemeId): string {
  return WALLPAPERS[id];
}

export function hydrateBuiltinWallpaper(config: DesktopThemesConfig): DesktopThemesConfig {
  const prefix = 'builtin:';
  if (!config.wallpaper.enabled || !config.wallpaper.sourceId.startsWith(prefix)) return config;
  const id = config.wallpaper.sourceId.slice(prefix.length);
  if (!isBuiltinThemeId(id)) return config;
  const path = builtinWallpaper(id);
  if (config.wallpaper.path === path) return config;
  return { ...config, wallpaper: { ...config.wallpaper, path } };
}

// Re-export the pure switching policy next to the asset registry so existing
// callers keep one import surface.
export { switchTheme, type ThemeSwitchMode } from '../themes/switch.ts';
