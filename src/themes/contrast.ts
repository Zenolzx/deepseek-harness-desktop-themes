/**
 * WCAG contrast gate for the theme palettes.
 *
 * The audit is deliberately expressible as data: each pair names the two
 * palette fields it compares and the minimum ratio that use requires. The
 * settings UI renders the same report, the test suite fails when a built-in
 * theme regresses, and `scripts/contrast-audit.ts` prints the table for CI.
 *
 * Thresholds follow WCAG 2.2 AA:
 *  - normal body text ≥ 4.5:1 (AAA when ≥ 7:1)
 *  - large text / non-text UI / state accents ≥ 3:1
 */

import { contrastRatio } from '../utils/color.ts';
import type { ThemePalette } from './palette.ts';

export type ContrastLevel = 'text' | 'ui';

/** One audited foreground/background pair. */
export interface ContrastPair {
  /** Stable id, also used as the settings deep-link key. */
  id: string;
  /** Human-readable pair, e.g. `muted/bgSurface`. */
  label: string;
  foreground: keyof ThemePalette;
  background: keyof ThemePalette;
  /** Minimum ratio required for this use. */
  min: number;
  level: ContrastLevel;
}

/**
 * The audited pairs. Palette text fields are compared against every surface a
 * reader actually sees; status colors need non-text contrast only, because the
 * product pairs them with an icon and a tinted background.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { id: 'primary.bgBase', label: 'primary/bgBase', foreground: 'textPrimary', background: 'bgBase', min: 4.5, level: 'text' },
  { id: 'primary.bgSurface', label: 'primary/bgSurface', foreground: 'textPrimary', background: 'bgSurface', min: 4.5, level: 'text' },
  { id: 'primary.bgSurface2', label: 'primary/bgSurface2', foreground: 'textPrimary', background: 'bgSurface2', min: 4.5, level: 'text' },
  { id: 'primary.bgSurface3', label: 'primary/bgSurface3', foreground: 'textPrimary', background: 'bgSurface3', min: 4.5, level: 'text' },
  { id: 'primary.sidebarFill', label: 'primary/sidebarFill', foreground: 'textPrimary', background: 'sidebarFill', min: 4.5, level: 'text' },
  { id: 'primary.codeBlock', label: 'primary/codeBlock', foreground: 'textPrimary', background: 'codeBlock', min: 4.5, level: 'text' },
  { id: 'secondary.bgBase', label: 'secondary/bgBase', foreground: 'textSecondary', background: 'bgBase', min: 4.5, level: 'text' },
  { id: 'secondary.bgSurface', label: 'secondary/bgSurface', foreground: 'textSecondary', background: 'bgSurface', min: 4.5, level: 'text' },
  { id: 'secondary.bgSurface2', label: 'secondary/bgSurface2', foreground: 'textSecondary', background: 'bgSurface2', min: 4.5, level: 'text' },
  { id: 'secondary.bgSurface3', label: 'secondary/bgSurface3', foreground: 'textSecondary', background: 'bgSurface3', min: 4.5, level: 'text' },
  { id: 'secondary.sidebarFill', label: 'secondary/sidebarFill', foreground: 'textSecondary', background: 'sidebarFill', min: 4.5, level: 'text' },
  { id: 'muted.bgBase', label: 'muted/bgBase', foreground: 'textMuted', background: 'bgBase', min: 4.5, level: 'text' },
  { id: 'muted.bgSurface', label: 'muted/bgSurface', foreground: 'textMuted', background: 'bgSurface', min: 4.5, level: 'text' },
  { id: 'muted.bgSurface2', label: 'muted/bgSurface2', foreground: 'textMuted', background: 'bgSurface2', min: 4.5, level: 'text' },
  { id: 'muted.bgSurface3', label: 'muted/bgSurface3', foreground: 'textMuted', background: 'bgSurface3', min: 4.5, level: 'text' },
  { id: 'muted.sidebarFill', label: 'muted/sidebarFill', foreground: 'textMuted', background: 'sidebarFill', min: 4.5, level: 'text' },
  { id: 'accent.bgBase', label: 'accent/bgBase', foreground: 'accent', background: 'bgBase', min: 4.5, level: 'text' },
  { id: 'accent.bgSurface', label: 'accent/bgSurface', foreground: 'accent', background: 'bgSurface', min: 4.5, level: 'text' },
  { id: 'accentForeground.accent', label: 'accentForeground/accent', foreground: 'accentForeground', background: 'accent', min: 4.5, level: 'text' },
  { id: 'success.bgBase', label: 'success/bgBase', foreground: 'success', background: 'bgBase', min: 3, level: 'ui' },
  { id: 'success.bgSurface', label: 'success/bgSurface', foreground: 'success', background: 'bgSurface', min: 3, level: 'ui' },
  { id: 'warning.bgBase', label: 'warning/bgBase', foreground: 'warning', background: 'bgBase', min: 3, level: 'ui' },
  { id: 'warning.bgSurface', label: 'warning/bgSurface', foreground: 'warning', background: 'bgSurface', min: 3, level: 'ui' },
  { id: 'danger.bgBase', label: 'danger/bgBase', foreground: 'danger', background: 'bgBase', min: 3, level: 'ui' },
  { id: 'danger.bgSurface', label: 'danger/bgSurface', foreground: 'danger', background: 'bgSurface', min: 3, level: 'ui' },
];

export interface ContrastIssue {
  id: string;
  label: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  level: ContrastLevel;
}

export type ReadabilityGrade = 'AAA' | 'AA' | 'fail';

export interface ThemeContrastReport {
  themeId: string;
  issues: ContrastIssue[];
  /** Lowest normal-text ratio found. */
  minTextRatio: number;
  /** Lowest non-text/state ratio found. */
  minUiRatio: number;
  grade: ReadabilityGrade;
}

function colorOf(palette: ThemePalette, key: keyof ThemePalette): string {
  const value = palette[key];
  return typeof value === 'string' ? value : '#000000';
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Audit one palette. Returns every failing pair plus the minima and grade. */
export function auditPalette(palette: ThemePalette): ThemeContrastReport {
  const issues: ContrastIssue[] = [];
  let minTextRatio = Number.POSITIVE_INFINITY;
  let minUiRatio = Number.POSITIVE_INFINITY;

  for (const pair of CONTRAST_PAIRS) {
    const foreground = colorOf(palette, pair.foreground);
    const background = colorOf(palette, pair.background);
    const ratio = round(contrastRatio(foreground, background));
    if (pair.level === 'text') minTextRatio = Math.min(minTextRatio, ratio);
    else minUiRatio = Math.min(minUiRatio, ratio);
    if (ratio + 0.005 < pair.min) {
      issues.push({
        id: pair.id,
        label: pair.label,
        foreground,
        background,
        ratio,
        required: pair.min,
        level: pair.level,
      });
    }
  }

  const grade: ReadabilityGrade =
    minTextRatio >= 7 && minUiRatio >= 4.5
      ? 'AAA'
      : minTextRatio >= 4.5 && minUiRatio >= 3
        ? 'AA'
        : 'fail';

  return { themeId: palette.id, issues, minTextRatio, minUiRatio, grade };
}

/** Audit a list of palettes (built-ins plus custom themes). */
export function auditPalettes(palettes: readonly ThemePalette[]): ThemeContrastReport[] {
  return palettes.map(auditPalette);
}

/** True when every audited pair of the palette passes its threshold. */
export function passesContrast(palette: ThemePalette): boolean {
  return auditPalette(palette).issues.length === 0;
}

/** Short, human-readable summary used by badges and tooltips. */
export function describeContrast(report: ThemeContrastReport): string {
  if (report.issues.length === 0) {
    return `${report.grade} · min text ${report.minTextRatio.toFixed(2)}:1 · min UI ${report.minUiRatio.toFixed(2)}:1`;
  }
  const first = report.issues[0];
  return `${report.grade} · ${first.label} ${first.ratio.toFixed(2)}:1 < ${first.required}:1`;
}
