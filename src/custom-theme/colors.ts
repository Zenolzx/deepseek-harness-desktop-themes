/**
 * Custom-theme color generation and contrast safety. The seven editable
 * colors (primary, accent, background, panel, text, particle, glow) can be
 * generated from a seed using a harmony strategy, and text contrast is
 * detected and fixable in one click.
 */

import type { CustomThemeColors } from '../config/types.ts';
import {
  adjustLightness,
  adjustSaturation,
  contrastRatio,
  ensureContrast,
  hslToHex,
  hexToHsl,
  rotateHue,
} from '../utils/color.ts';

export type HarmonyKind =
  | 'mono'
  | 'analogous'
  | 'complementary'
  | 'cool'
  | 'warm'
  | 'muted'
  | 'high-contrast';

export const HARMONY_KINDS: readonly HarmonyKind[] = [
  'mono',
  'analogous',
  'complementary',
  'cool',
  'warm',
  'muted',
  'high-contrast',
];

/** Default seeds per harmony kind (used when no seed is provided). */
const DEFAULT_SEEDS: Record<HarmonyKind, string> = {
  mono: '#3D7EFF',
  analogous: '#22D3EE',
  complementary: '#3D7EFF',
  cool: '#22D3EE',
  warm: '#FF7A59',
  muted: '#8B7CF6',
  'high-contrast': '#3D7EFF',
};

function surfaceFor(bg: string, delta: number): string {
  return adjustLightness(bg, delta);
}

/**
 * Generate a coordinated seven-color palette from a seed using the requested
 * harmony strategy. `isDark` decides whether the background is dark (light
 * text) or light (dark text).
 */
export function generateHarmony(kind: HarmonyKind, seed: string, isDark: boolean): CustomThemeColors {
  const accent = seed || DEFAULT_SEEDS[kind];
  const hsl = hexToHsl(accent);
  let primary = accent;
  let particle = accent;
  let glow = accent;

  switch (kind) {
    case 'mono':
      primary = adjustLightness(accent, -0.06);
      particle = adjustLightness(accent, 0.08);
      glow = accent;
      break;
    case 'analogous':
      primary = rotateHue(accent, -30);
      particle = rotateHue(accent, 30);
      glow = rotateHue(accent, 15);
      break;
    case 'complementary':
      primary = rotateHue(accent, 180);
      particle = accent;
      glow = rotateHue(accent, 150);
      break;
    case 'cool': {
      const cool = hslToHex((hsl.h + 210) % 360, 0.65, 0.6);
      primary = cool;
      particle = rotateHue(cool, 40);
      glow = rotateHue(cool, 20);
      break;
    }
    case 'warm': {
      const warm = hslToHex((hsl.h + 20) % 360, 0.7, 0.62);
      primary = warm;
      particle = rotateHue(warm, -20);
      glow = rotateHue(warm, 15);
      break;
    }
    case 'muted':
      primary = adjustSaturation(accent, 0.5);
      particle = adjustSaturation(rotateHue(accent, 40), 0.45);
      glow = adjustSaturation(accent, 0.6);
      break;
    case 'high-contrast':
      primary = adjustSaturation(accent, 1);
      particle = '#ffffff';
      glow = primary;
      break;
  }

  const background = kind === 'high-contrast'
    ? (isDark ? '#05070c' : '#f7fafc')
    : isDark
      ? hslToHex(hsl.h, Math.min(0.5, hsl.s * 0.6), 0.09)
      : hslToHex(hsl.h, Math.min(0.5, hsl.s * 0.5), 0.94);
  const panel = surfaceFor(background, isDark ? 0.04 : 0.02);
  const text = isDark ? '#F2F5FA' : '#161A22';

  return {
    primary,
    accent,
    background,
    panel,
    text,
    particle,
    glow,
  };
}

/** Contrast warnings for the text-on-background pair. */
export function contrastIssues(colors: CustomThemeColors): string[] {
  const issues: string[] = [];
  const textRatio = contrastRatio(colors.text, colors.background);
  if (textRatio < 4.5) issues.push(`text/background ratio ${textRatio.toFixed(2)} < 4.5`);
  const panelRatio = contrastRatio(colors.text, colors.panel);
  if (panelRatio < 4.5) issues.push(`text/panel ratio ${panelRatio.toFixed(2)} < 4.5`);
  const primaryRatio = contrastRatio(colors.primary, colors.background);
  if (primaryRatio < 3) issues.push(`primary/background ratio ${primaryRatio.toFixed(2)} < 3`);
  return issues;
}

/** Best foreground (dark or light) for a given accent background. */
export function foregroundOnAccent(accent: string): string {
  const dark = contrastRatio('#0b0e14', accent);
  const light = contrastRatio('#ffffff', accent);
  return dark >= light ? '#0b0e14' : '#ffffff';
}

/** Fix text contrast against the background in place. */
export function fixContrast(colors: CustomThemeColors): CustomThemeColors {
  // The same ink appears on the window and raised panels. Use the candidate
  // with the strongest worst-case contrast across both surfaces.
  const candidates = [
    ensureContrast(ensureContrast(colors.text, colors.background, 4.5), colors.panel, 4.5),
    ensureContrast(ensureContrast(colors.text, colors.panel, 4.5), colors.background, 4.5),
    '#111113',
    '#ffffff',
  ];
  const text = candidates.reduce((best, candidate) => {
    const floor = Math.min(contrastRatio(candidate, colors.background), contrastRatio(candidate, colors.panel));
    const bestFloor = Math.min(contrastRatio(best, colors.background), contrastRatio(best, colors.panel));
    return floor > bestFloor ? candidate : best;
  }, colors.text);
  return {
    ...colors,
    text,
    primary: ensureContrast(colors.primary, colors.background, 3),
  };
}
