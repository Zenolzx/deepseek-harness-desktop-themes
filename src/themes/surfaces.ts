/**
 * Surface-hierarchy gate.
 *
 * WCAG contrast covers text, but an interface can pass every text check and
 * still look like one flat sheet because its chrome, canvas and panels sit on
 * the same luminance. This module audits those relationships separately:
 *
 *   canvas  = bgBase        (center conversation)
 *   chrome  = sidebarFill   (Windows frame + both rails)
 *   panel   = bgSurface     (settings/card surface)
 *   raised  = bgSurface2/3  (inputs, nested cards, menus)
 *
 * The ratios are deliberately ranges: too little reads as one colour, too much
 * reads as striped blocks.
 */

import { contrastRatio, mixHex } from '../utils/color.ts';
import { BORDER_ALPHA, type ThemePalette } from './palette.ts';

export interface SurfaceRule {
  id: string;
  label: string;
  foreground: keyof ThemePalette;
  background: keyof ThemePalette;
  min: number;
  max: number;
}

export interface SurfaceCheck {
  id: string;
  label: string;
  ratio: number;
  min: number;
  max: number;
  foreground: string;
  background: string;
}

export interface SurfaceReport {
  themeId: string;
  checks: SurfaceCheck[];
  issues: SurfaceCheck[];
  passed: boolean;
}

const SURFACE_RULES: readonly SurfaceRule[] = [
  { id: 'chrome', label: 'chrome/canvas', foreground: 'sidebarFill', background: 'bgBase', min: 1.14, max: 1.28 },
  { id: 'panel', label: 'panel/canvas', foreground: 'bgSurface', background: 'bgBase', min: 1.08, max: 1.34 },
  { id: 'layer2', label: 'layer2/panel', foreground: 'bgSurface2', background: 'bgSurface', min: 1.05, max: 1.22 },
  { id: 'layer3', label: 'layer3/layer2', foreground: 'bgSurface3', background: 'bgSurface2', min: 1.04, max: 1.16 },
  { id: 'input', label: 'layer2/canvas', foreground: 'bgSurface2', background: 'bgBase', min: 1.04, max: 1.55 },
];

const BORDER_RULES = [
  { id: 'border-l2', min: 1.3, max: 1.7 },
  { id: 'border-l3', min: 1.5, max: 1.95 },
  { id: 'border-l4', min: 1.7, max: 2.45 },
] as const;

function stringColor(palette: ThemePalette, key: keyof ThemePalette): string {
  const value = palette[key];
  return typeof value === 'string' ? value : '#000000';
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function auditSurfaces(palette: ThemePalette): SurfaceReport {
  const checks: SurfaceCheck[] = [];
  for (const rule of SURFACE_RULES) {
    const foreground = stringColor(palette, rule.foreground);
    const background = stringColor(palette, rule.background);
    checks.push({
      id: rule.id,
      label: rule.label,
      ratio: round(contrastRatio(foreground, background)),
      min: rule.min,
      max: rule.max,
      foreground,
      background,
    });
  }

  const border = BORDER_ALPHA[palette.colorScheme];
  for (const rule of BORDER_RULES) {
    const alpha = rule.id === 'border-l2' ? border.l2 : rule.id === 'border-l3' ? border.l3 : border.l4;
    const line = mixHex(palette.bgBase, palette.textPrimary, alpha);
    checks.push({
      id: rule.id,
      label: `${rule.id}/canvas`,
      ratio: round(contrastRatio(line, palette.bgBase)),
      min: rule.min,
      max: rule.max,
      foreground: line,
      background: palette.bgBase,
    });
  }

  const issues = checks.filter((check) => check.ratio + 0.005 < check.min || check.ratio - 0.005 > check.max);
  return { themeId: palette.id, checks, issues, passed: issues.length === 0 };
}

export function describeSurfaces(report: SurfaceReport): string {
  if (report.passed) {
    const chrome = report.checks.find((check) => check.id === 'chrome');
    const panel = report.checks.find((check) => check.id === 'panel');
    return `pass · chrome ${chrome?.ratio.toFixed(2)} · panel ${panel?.ratio.toFixed(2)}`;
  }
  const first = report.issues[0];
  return `fail · ${first.label} ${first.ratio.toFixed(2)} outside ${first.min}–${first.max}`;
}
