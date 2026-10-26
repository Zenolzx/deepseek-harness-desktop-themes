/**
 * Desktop-theme registry: the six premium themes and the DSH `theme` service
 * registration definitions derived from them. Custom themes are built from the
 * same palette/token pipeline at runtime (see `paletteFromCustomColors`).
 *
 * The public ids are retained for configuration compatibility, but 2.0 gives
 * each one a new visual identity: three restrained workbench palettes and
 * three cinematic palettes.
 */

import type { CustomThemeConfig } from '../config/types.ts';
import { auroraDream } from './aurora-dream.ts';
import { mintBreeze } from './mint-breeze.ts';
import { obsidianGold } from './obsidian-gold.ts';
import { buildThemeTokens, paletteFromCustomColors, type ThemePalette } from './palette.ts';
import { quantumBlue } from './quantum-blue.ts';
import { sakuraMist } from './sakura-mist.ts';
import { sunsetFlow } from './sunset-flow.ts';
import { contrastRatio, readableOn } from '../utils/color.ts';

/** Registration shape consumed by the DSH `theme` service (`register`). */
export interface DshThemeDefinition {
  id: string;
  colorScheme: 'light' | 'dark';
  tokens: Record<string, string>;
}

export interface DesktopTheme {
  id: string;
  /** Human-readable display name. */
  name: string;
  /** One-line description shown in the settings UI. */
  description: string;
  /** Style tag (e.g. "Workbench" / "Cinema"). */
  tag: string;
  /** Core palette (used for transparency derivation + display swatches). */
  palette: ThemePalette;
  /** Ready-to-register DSH theme definition. */
  definition: DshThemeDefinition;
}

const DEFINITIONS: DesktopTheme[] = [
  {
    id: 'mint-breeze',
    name: 'Paper',
    description: 'Bone paper, warm ink and a single terracotta accent for long reading.',
    tag: 'Workbench',
    palette: mintBreeze,
    definition: { id: 'mint-breeze', colorScheme: 'light', tokens: buildThemeTokens(mintBreeze) },
  },
  {
    id: 'sakura-mist',
    name: 'Mist',
    description: 'Cool porcelain, graphite ink and ultramarine punctuation.',
    tag: 'Workbench',
    palette: sakuraMist,
    definition: { id: 'sakura-mist', colorScheme: 'light', tokens: buildThemeTokens(sakuraMist) },
  },
  {
    id: 'quantum-blue',
    name: 'Graphite',
    description: 'Cool graphite, frosted depth and a mineral-blue accent.',
    tag: 'Workbench',
    palette: quantumBlue,
    definition: { id: 'quantum-blue', colorScheme: 'dark', tokens: buildThemeTokens(quantumBlue) },
  },
  {
    id: 'aurora-dream',
    name: 'Arc',
    description: 'Deep-space indigo, periwinkle light and a quiet teal signal.',
    tag: 'Cinema',
    palette: auroraDream,
    definition: { id: 'aurora-dream', colorScheme: 'dark', tokens: buildThemeTokens(auroraDream) },
  },
  {
    id: 'sunset-flow',
    name: 'Dune',
    description: 'Desert night, burnt orange and sand ivory under a low horizon.',
    tag: 'Cinema',
    palette: sunsetFlow,
    definition: { id: 'sunset-flow', colorScheme: 'dark', tokens: buildThemeTokens(sunsetFlow) },
  },
  {
    id: 'obsidian-gold',
    name: 'Noir',
    description: 'Black velvet, warm ivory type and champagne-amber light.',
    tag: 'Cinema',
    palette: obsidianGold,
    definition: { id: 'obsidian-gold', colorScheme: 'dark', tokens: buildThemeTokens(obsidianGold) },
  },
];

export const THEMES: readonly DesktopTheme[] = DEFINITIONS;

export function getTheme(id: string): DesktopTheme | undefined {
  return THEMES.find((theme) => theme.id === id);
}

export function isBuiltinTheme(id: string): boolean {
  return THEMES.some((theme) => theme.id === id);
}

/** Resolve the palette for a theme id (built-in or custom). */
export function resolvePalette(id: string, customThemes: readonly CustomThemeConfig[] = []): ThemePalette | undefined {
  const builtin = getTheme(id);
  if (builtin !== undefined) return builtin.palette;
  const custom = customThemes.find((t) => t.id === id);
  if (custom !== undefined) {
    const base = getTheme(custom.base)?.palette ?? quantumBlue;
    return customPalette(custom, base);
  }
  return undefined;
}

/** Build a DSH theme definition for a custom theme. */
export function buildCustomThemeDefinition(theme: CustomThemeConfig): DshThemeDefinition {
  const base = getTheme(theme.base)?.palette ?? quantumBlue;
  const palette = customPalette(theme, base);
  const tokens = buildThemeTokens(palette);
  for (const [key, value] of Object.entries(theme.syntax ?? {})) {
    if (!['constant','string','comment','keyword','parameter','function','string-expression','punctuation','link'].includes(key) || !/^#[0-9a-f]{6}$/i.test(value)) continue;
    tokens[`--shiki-token-${key}`] = contrastRatio(value, palette.codeBlock) >= 4.5 ? value : readableOn(palette.codeBlock, '#111113', '#FFFFFF');
  }
  return { id: theme.id, colorScheme: palette.colorScheme, tokens };
}

function customPalette(theme: CustomThemeConfig, base: ThemePalette): ThemePalette {
  const palette = paletteFromCustomColors(theme.colors, base);
  for (const key of ['success','warning','danger'] as const) {
    const color = theme.states?.[key];
    if (color && /^#[0-9a-f]{6}$/i.test(color)) palette[key] = color;
  }
  return palette;
}

/** Palette lookup for transparency derivation, including built-in pair. */
export function bgBaseForTheme(id: string, customThemes: readonly CustomThemeConfig[] = []): string {
  const palette = resolvePalette(id, customThemes);
  if (palette !== undefined) return palette.bgBase;
  return id === 'light' ? '#ffffff' : '#151517';
}
