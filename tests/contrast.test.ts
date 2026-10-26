import test from 'node:test';
import assert from 'node:assert/strict';

import { THEMES, resolvePalette } from '../src/themes/index.ts';
import { auditPalette, auditPalettes, describeContrast, passesContrast, CONTRAST_PAIRS } from '../src/themes/contrast.ts';
import { buildThemeTokens } from '../src/themes/palette.ts';
import { contrastRatio } from '../src/utils/color.ts';

test('all six built-in themes pass the WCAG AA contrast gate', () => {
  const reports = auditPalettes(THEMES.map((theme) => theme.palette));
  for (const report of reports) {
    assert.equal(report.issues.length, 0, `${report.themeId}: ${report.issues.map((i) => i.label).join(', ')}`);
    assert.ok(report.grade === 'AA' || report.grade === 'AAA');
    assert.ok(report.minTextRatio >= 4.5, `${report.themeId} min text ${report.minTextRatio}`);
    assert.ok(report.minUiRatio >= 3, `${report.themeId} min UI ${report.minUiRatio}`);
  }
});

test('the contrast gate detects a failing pair with a precise label', () => {
  const palette = { ...THEMES[0].palette, textMuted: THEMES[0].palette.bgBase };
  const report = auditPalette(palette);
  assert.equal(report.grade, 'fail');
  const issue = report.issues.find((entry) => entry.id === 'muted.bgBase');
  assert.ok(issue);
  assert.equal(issue?.label, 'muted/bgBase');
  assert.equal(issue?.required, 4.5);
  assert.ok((issue?.ratio ?? 99) < 1.2);
  assert.equal(passesContrast(palette), false);
});

test('every audited pair names real string palette fields and a sane threshold', () => {
  assert.ok(CONTRAST_PAIRS.length >= 20);
  for (const pair of CONTRAST_PAIRS) {
    const fg = THEMES[0].palette[pair.foreground];
    const bg = THEMES[0].palette[pair.background];
    assert.equal(typeof fg, 'string', `${pair.id} foreground`);
    assert.equal(typeof bg, 'string', `${pair.id} background`);
    assert.ok(pair.min === 3 || pair.min === 4.5);
  }
});

test('the dimmed label token uses the readable muted tone, not a 50% wash', () => {
  for (const theme of THEMES) {
    const tokens = buildThemeTokens(theme.palette);
    const dimmed = tokens['--dsw-alias-label-dimmed'];
    assert.ok(contrastRatio(dimmed, theme.palette.bgBase) >= 4.5, `${theme.id} dimmed label`);
  }
});

test('derived custom themes keep secondary and muted text readable', () => {
  const palette = resolvePalette('custom-1', [{
    id: 'custom-1',
    name: 'Low contrast',
    base: 'mint-breeze',
    colors: { primary: '#3D7EFF', accent: '#22D3EE', background: '#F7F7F7', panel: '#FFFFFF', text: '#333333', particle: '#3D7EFF', glow: '#22D3EE' },
  }]);
  assert.ok(palette);
  for (const surface of [palette.bgBase, palette.bgSurface, palette.bgSurface2, palette.bgSurface3]) {
    assert.ok(contrastRatio(palette.textSecondary, surface) >= 4.5, 'secondary');
    assert.ok(contrastRatio(palette.textMuted, surface) >= 4.5, 'muted');
  }
});

test('dark custom themes also keep derived text readable on raised panels', () => {
  const palette = resolvePalette('custom-dark', [{
    id: 'custom-dark',
    name: 'Dark low contrast',
    base: 'quantum-blue',
    colors: { primary: '#3D7EFF', accent: '#22D3EE', background: '#080A10', panel: '#202630', text: '#777777', particle: '#3D7EFF', glow: '#22D3EE' },
  }]);
  assert.ok(palette);
  for (const surface of [palette.bgBase, palette.bgSurface, palette.bgSurface2, palette.bgSurface3]) {
    assert.ok(contrastRatio(palette.textSecondary, surface) >= 4.5, 'secondary');
    assert.ok(contrastRatio(palette.textMuted, surface) >= 4.5, 'muted');
  }
});

test('describeContrast reports the grade and first failure', () => {
  const good = describeContrast(auditPalette(THEMES[0].palette));
  assert.match(good, /^(AA|AAA) · min text/);
  const bad = describeContrast(auditPalette({ ...THEMES[0].palette, textMuted: '#FFFFFF' }));
  assert.match(bad, /^fail · muted\/bgBase/);
});
