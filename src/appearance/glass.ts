/**
 * Glassmorphism: blur/saturation/shadow CSS with graceful fallback.
 *
 * Prefers `backdrop-filter` (with the `-webkit-` prefix); when it is
 * unsupported the surfaces fall back to a solid semi-transparent fill so text
 * stays readable. Blur is applied only to the plugin's own surfaces and to the
 * document root — not to every nested node — so scrolling does not constantly
 * trigger expensive repaints.
 */

import type { GlassConfig } from '../config/types.ts';
import type { ThemePalette } from '../themes/palette.ts';
import { rgba } from '../utils/color.ts';

export interface ResolvedGlass {
  /** Effective backdrop blur radius in px. */
  blurPx: number;
  saturation: number;
  panelOpacity: number;
  borderHighlight: number;
  shadowStrength: number;
  /** Whether any blur is active (false in `off` mode). */
  applyBlur: boolean;
}

const TIER_BLUR: Record<string, number> = {
  off: 0,
  light: 8,
  standard: 16,
  strong: 24,
};

/** Resolve the effective glass parameters from the configured blur level. */
export function resolveGlass(glass: GlassConfig): ResolvedGlass {
  const tierRadius = TIER_BLUR[glass.blurLevel] ?? TIER_BLUR.standard;
  // `strength` is the advanced custom radius: when it differs from the tier it
  // overrides the preset (except when blur is explicitly off).
  const customOverride = glass.strength > 0 && glass.strength !== tierRadius && glass.blurLevel !== 'off';
  const blurPx = customOverride ? glass.strength : tierRadius;
  const applyBlur = blurPx > 0;
  const shadowStrength = applyBlur ? glass.shadow : 0;
  return {
    blurPx,
    saturation: glass.saturation,
    panelOpacity: glass.panelOpacity,
    borderHighlight: glass.borderHighlight,
    shadowStrength,
    applyBlur,
  };
}

/** Feature detection, tolerant of SSR/headless (no `window`). */
export function supportsBackdropFilter(): boolean {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') return false;
  return (
    CSS.supports('backdrop-filter', 'blur(1px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
  );
}

/**
 * Build the glass CSS for the plugin's own `.dth-glass` surfaces (settings
 * panel, dialogs, toasts). Disabled glass still emits a solid surface so the
 * plugin UI remains readable.
 */
export function buildGlassCss(glass: GlassConfig, supported: boolean, palette?: ThemePalette): string {
  const resolved = resolveGlass(glass);
  const surface = palette?.bgSurface3 ?? '#111113';
  const border = palette?.textPrimary ?? '#ffffff';

  if (!glass.enabled || !resolved.applyBlur || !supported) {
    return [
      '.dth-glass {',
      '  background: ' + rgba(surface, resolved.panelOpacity) + ';',
      '  border: 1px solid ' + rgba(border, resolved.borderHighlight * 0.08) + ';',
      '}',
    ].join('\n');
  }

  const shadow = resolved.shadowStrength > 0
    ? `box-shadow: 0 ${(resolved.shadowStrength * 8).toFixed(1)}px ${(resolved.shadowStrength * 24).toFixed(1)}px rgba(0, 0, 0, ${(resolved.shadowStrength * 0.4).toFixed(2)});`
    : '';

  return [
    '.dth-glass {',
    '  -webkit-backdrop-filter: blur(' + resolved.blurPx + 'px) saturate(' + resolved.saturation + ');',
    '  backdrop-filter: blur(' + resolved.blurPx + 'px) saturate(' + resolved.saturation + ');',
    '  background: ' + rgba(surface, resolved.panelOpacity) + ';',
    '  border: 1px solid ' + rgba(border, resolved.borderHighlight * 0.14) + ';',
    shadow,
    '}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
