import type { DesktopThemesConfig, ThemeId } from '../config/types.ts';
import { THEME_VISUAL_DEFAULTS } from '../themes/visual-defaults.ts';
import { applyVisualModePreset } from '../appearance/visual-mode.ts';
import auroraDream from '../assets/wallpapers/aurora-dream.jpg';
import mintBreeze from '../assets/wallpapers/mint-breeze.jpg';
import obsidianGold from '../assets/wallpapers/obsidian-gold.jpg';
import quantumBlue from '../assets/wallpapers/quantum-blue.jpg';
import sakuraMist from '../assets/wallpapers/sakura-mist.jpg';
import sunsetFlow from '../assets/wallpapers/sunset-flow.jpg';
import auroraDreamThumb from '../assets/wallpapers/thumbs/aurora-dream.jpg';
import mintBreezeThumb from '../assets/wallpapers/thumbs/mint-breeze.jpg';
import obsidianGoldThumb from '../assets/wallpapers/thumbs/obsidian-gold.jpg';
import quantumBlueThumb from '../assets/wallpapers/thumbs/quantum-blue.jpg';
import sakuraMistThumb from '../assets/wallpapers/thumbs/sakura-mist.jpg';
import sunsetFlowThumb from '../assets/wallpapers/thumbs/sunset-flow.jpg';

const WALLPAPERS: Record<ThemeId, string> = {
  'quantum-blue': quantumBlue,
  'aurora-dream': auroraDream,
  'mint-breeze': mintBreeze,
  'sakura-mist': sakuraMist,
  'sunset-flow': sunsetFlow,
  'obsidian-gold': obsidianGold,
};

const THUMBNAILS: Record<ThemeId, string> = {
  'quantum-blue': quantumBlueThumb,
  'aurora-dream': auroraDreamThumb,
  'mint-breeze': mintBreezeThumb,
  'sakura-mist': sakuraMistThumb,
  'sunset-flow': sunsetFlowThumb,
  'obsidian-gold': obsidianGoldThumb,
};

const THEME_IDS = new Set<ThemeId>(Object.keys(WALLPAPERS) as ThemeId[]);

export function isBuiltinThemeId(value: string): value is ThemeId {
  return THEME_IDS.has(value as ThemeId);
}

export function builtinWallpaper(id: ThemeId): string {
  return WALLPAPERS[id];
}

export function builtinWallpaperThumbnail(id: ThemeId): string {
  return THUMBNAILS[id];
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

/** Select a built-in theme with its wallpaper and a reading-first recipe. */
export function applyBuiltinThemePreset(config: DesktopThemesConfig, id: ThemeId): DesktopThemesConfig {
  const preset = THEME_VISUAL_DEFAULTS[id];
  const themed: DesktopThemesConfig = {
    ...config,
    theme: id,
    appearance: { ...config.appearance, ...preset.appearance },
    wallpaper: {
      ...config.wallpaper,
      ...preset.wallpaper,
      enabled: true,
      sourceId: `builtin:${id}`,
      path: builtinWallpaper(id),
      name: `${id} · Built-in`,
      fit: 'cover',
      positionX: 50,
      positionY: 50,
      scale: 1,
      blur: 0,
    },
    glass: { ...config.glass, ...preset.glass },
    effects: { ...config.effects, ...preset.effects, autoThemeColors: true, particleColors: [], glowColors: [] },
  };
  return applyVisualModePreset(themed, 'focus');
}
