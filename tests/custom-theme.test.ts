import test from 'node:test';
import assert from 'node:assert/strict';

import { generateHarmony, HARMONY_KINDS, contrastIssues, fixContrast, foregroundOnAccent } from '../src/custom-theme/colors.ts';
import { contrastRatio } from '../src/utils/color.ts';

test('every harmony kind produces a valid seven-color palette', () => {
  for (const kind of HARMONY_KINDS) {
    const colors = generateHarmony(kind, '#3D7EFF', true);
    for (const [key, value] of Object.entries(colors)) {
      assert.match(value, /^#[0-9a-fA-F]{6}$/, `${kind}.${key} invalid: ${value}`);
    }
  }
});

test('dark and light backgrounds produce readable default text', () => {
  const dark = generateHarmony('mono', '#3D7EFF', true);
  const light = generateHarmony('mono', '#3D7EFF', false);
  assert.ok(contrastRatio(dark.text, dark.background) >= 4.5);
  assert.ok(contrastRatio(light.text, light.background) >= 4.5);
});

test('contrastIssues flags low text/background contrast', () => {
  const bad = { primary: '#3D7EFF', accent: '#22D3EE', background: '#ffffff', panel: '#ffffff', text: '#ffffff', particle: '#000000', glow: '#000000' };
  assert.ok(contrastIssues(bad).length > 0);
  const good = generateHarmony('high-contrast', '#3D7EFF', true);
  assert.equal(contrastIssues(good).length, 0);
});

test('fixContrast raises text contrast to a readable level', () => {
  const bad = { primary: '#3D7EFF', accent: '#22D3EE', background: '#ffffff', panel: '#ffffff', text: '#dddddd', particle: '#000000', glow: '#000000' };
  const fixed = fixContrast(bad);
  assert.ok(contrastRatio(fixed.text, fixed.background) >= 4.5);
});

test('custom-theme warning and repair include the raised panel', () => {
  const colors = { primary: '#3D7EFF', accent: '#22D3EE', background: '#eeeeee', panel: '#ffffff', text: '#aaaaaa', particle: '#000000', glow: '#000000' };
  assert.ok(contrastIssues(colors).some((issue) => issue.startsWith('text/panel')));
  const fixed = fixContrast(colors);
  assert.ok(contrastRatio(fixed.text, fixed.background) >= 4.5);
  assert.ok(contrastRatio(fixed.text, fixed.panel) >= 4.5);
});

test('foregroundOnAccent picks the more readable of dark/light', () => {
  const fg = foregroundOnAccent('#3D7EFF');
  const dark = contrastRatio('#0b0e14', '#3D7EFF');
  const light = contrastRatio('#ffffff', '#3D7EFF');
  assert.equal(fg, dark >= light ? '#0b0e14' : '#ffffff');
});
