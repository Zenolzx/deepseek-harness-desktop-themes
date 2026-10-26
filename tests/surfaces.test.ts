import test from 'node:test';
import assert from 'node:assert/strict';

import { THEMES } from '../src/themes/index.ts';
import { auditSurfaces, describeSurfaces } from '../src/themes/surfaces.ts';

test('all six built-in themes separate chrome, canvas, panel and raised surfaces', () => {
  for (const theme of THEMES) {
    const report = auditSurfaces(theme.palette);
    assert.equal(report.passed, true, `${theme.id}: ${report.issues.map((issue) => issue.label).join(', ')}`);
  }
});

test('a chrome colour equal to the canvas fails the surface gate', () => {
  const flat = { ...THEMES[0].palette, sidebarFill: THEMES[0].palette.bgBase };
  const report = auditSurfaces(flat);
  assert.equal(report.passed, false);
  const chrome = report.issues.find((issue) => issue.id === 'chrome');
  assert.ok(chrome);
  assert.ok((chrome?.ratio ?? 99) < 1.05);
  assert.match(describeSurfaces(report), /^fail · chrome\/canvas/);
});

test('a panel too close to the canvas fails the surface gate', () => {
  const palette = { ...THEMES[0].palette, bgSurface: THEMES[0].palette.bgBase };
  const report = auditSurfaces(palette);
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((issue) => issue.label === 'panel/canvas'));
});

test('the gate rejects a surface stack that jumps too far', () => {
  const palette = { ...THEMES[0].palette, bgSurface: '#FFFFFF', sidebarFill: '#000000' };
  const report = auditSurfaces(palette);
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((issue) => issue.id === 'chrome'));
});

test('surface audit exposes border hairlines as part of the hierarchy', () => {
  const report = auditSurfaces(THEMES[0].palette);
  const ids = report.checks.map((check) => check.id);
  assert.deepEqual(ids, ['chrome', 'panel', 'layer2', 'layer3', 'input', 'border-l2', 'border-l3', 'border-l4']);
  assert.match(describeSurfaces(report), /^pass · chrome/);
});
