/**
 * Content-surface layer (diff rows, document preview, selection).
 *
 * The product ships its own diff/selection palette and the plugin has never
 * overridden it, so every theme inherited the product's default green/red
 * (light `#e6f4e7` / `#01a241`) — a saturated, full-width slab that reads as
 * "a green card glued onto the pane" and clashes with every theme's own hue.
 *
 * This module derives the missing `--dsw-alias-file-diff-*` aliases (plus the
 * document-preview surfaces) from the palette, so all six themes follow their
 * own success/danger colors, and exposes a strength multiplier so the tint can
 * be dialled down without shipping a new build.
 *
 * Applied through `theme.overrideTokens`, exactly like the transparency layer:
 * reversible, no product DOM is touched, and `classic` simply releases the
 * override so the product's own surfaces come back.
 */

import type { ContentStyle, DesktopThemesConfig } from '../config/types.ts';
import type { ThemePalette } from '../themes/palette.ts';
import { mixHex, rgba } from '../utils/color.ts';

/** Themes that expose the classic/refined switch in the settings UI. */
export const CONTENT_VARIANT_THEMES: readonly string[] = ['mint-breeze'];

export function supportsContentVariant(themeId: string): boolean {
  return CONTENT_VARIANT_THEMES.includes(themeId);
}

/**
 * Resolve the content style actually in force. Themes without a variant keep
 * the refined layer, so the fix reaches all six palettes while only Mint
 * Breeze grows a user-facing toggle.
 */
export function effectiveContentStyle(config: DesktopThemesConfig): ContentStyle {
  if (!supportsContentVariant(config.theme)) return 'refined';
  return config.appearance.contentStyle;
}

export interface ContentLayerOptions {
  style: ContentStyle;
  /** Highlight strength multiplier (1 = standard, 0.5 = half). */
  tint: number;
}

/** Alphas are higher on dark grounds: the same wash over near-black vanishes. */
const ALPHA = {
  light: { addedBg: 0.055, addedGutter: 0.1, deletedBg: 0.05, deletedGutter: 0.09, code: 0.1, selection: 0.2 },
  dark: { addedBg: 0.14, addedGutter: 0.21, deletedBg: 0.13, deletedGutter: 0.2, code: 0.22, selection: 0.3 },
} as const;

/**
 * Build the `{ light, dark }` override map for the content layer. Returns an
 * empty map for `classic`, which is how the layer is "removed" (the caller
 * disposes the override instead of writing empty values).
 */
export function buildContentLayer(
  palette: ThemePalette,
  options: ContentLayerOptions,
): Record<string, { light: string; dark: string }> {
  if (options.style === 'classic') return {};

  const dark = palette.colorScheme === 'dark';
  const a = dark ? ALPHA.dark : ALPHA.light;
  const k = Math.min(2, Math.max(0.25, options.tint));
  const scale = (value: number) => Math.min(1, value * k);

  // The marker is drawn *on* the row wash, so on dark grounds it is lifted
  // toward white to stay legible against its own tinted row.
  const addedMarker = dark ? mixHex(palette.success, '#FFFFFF', 0.22) : palette.success;
  const deletedMarker = dark ? mixHex(palette.danger, '#FFFFFF', 0.18) : palette.danger;

  // Reading surfaces settle between the raised surface and the sidebar fill:
  // pure `bgSurface` reads as a bright white slab over a translucent ground,
  // while this mix still occludes the particle canvas but stays card-like.
  const paper = mixHex(palette.bgSurface, palette.sidebarFill, 0.45);
  const preview = paper;
  const contentSurface = paper;

  const tokens: Record<string, string> = {
    '--dsw-alias-file-diff-added-bg': rgba(palette.success, scale(a.addedBg)),
    '--dsw-alias-file-diff-added-gutter': rgba(palette.success, scale(a.addedGutter)),
    '--dsw-alias-file-diff-added-marker': addedMarker,
    '--dsw-alias-file-diff-deleted-bg': rgba(palette.danger, scale(a.deletedBg)),
    '--dsw-alias-file-diff-deleted-gutter': rgba(palette.danger, scale(a.deletedGutter)),
    '--dsw-alias-file-diff-deleted-marker': deletedMarker,
    '--dsw-alias-code-diff-added': rgba(palette.success, scale(a.code)),
    '--dsw-alias-code-diff-deleted': rgba(palette.danger, scale(a.code)),
    '--dsw-alias-bg-document-preview': preview,
    '--dsw-alias-bg-document-selection': rgba(palette.accent, scale(a.selection)),
    '--dth-content-surface': contentSurface,
  };

  const out: Record<string, { light: string; dark: string }> = {};
  for (const [token, value] of Object.entries(tokens)) out[token] = { light: value, dark: value };
  return out;
}
