import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGlassCss, resolveGlass } from '../src/appearance/glass.ts';
import { DEFAULT_GLASS } from '../src/config/defaults.ts';
import { mintBreeze } from '../src/themes/mint-breeze.ts';

test('resolveGlass maps blur levels to blur radii', () => {
  assert.equal(resolveGlass({ ...DEFAULT_GLASS, blurLevel: 'light' }).blurPx, 8);
  assert.equal(resolveGlass({ ...DEFAULT_GLASS, blurLevel: 'standard' }).blurPx, 16);
  assert.equal(resolveGlass({ ...DEFAULT_GLASS, blurLevel: 'strong' }).blurPx, 24);
  assert.equal(resolveGlass({ ...DEFAULT_GLASS, blurLevel: 'off' }).blurPx, 0);
});

test('resolveGlass honors the advanced custom strength override', () => {
  const resolved = resolveGlass({ ...DEFAULT_GLASS, blurLevel: 'standard', strength: 32 });
  assert.equal(resolved.blurPx, 32);
});

test('resolveGlass disables blur and shadow in off mode', () => {
  const resolved = resolveGlass({ ...DEFAULT_GLASS, blurLevel: 'off', shadow: 0.8 });
  assert.equal(resolved.applyBlur, false);
  assert.equal(resolved.blurPx, 0);
  assert.equal(resolved.shadowStrength, 0);
});

test('glass CSS degrades to a solid fill when blur is unsupported', () => {
  const css = buildGlassCss(DEFAULT_GLASS, false);
  assert.ok(!css.includes('backdrop-filter'));
  assert.ok(css.includes('background: rgba('));
});

test('glass CSS uses backdrop-filter when supported and enabled', () => {
  const css = buildGlassCss({ ...DEFAULT_GLASS, enabled: true, blurLevel: 'light' }, true);
  assert.ok(css.includes('-webkit-backdrop-filter'));
  assert.ok(css.includes('backdrop-filter'));
});

test('disabled glass still emits a readable solid surface', () => {
  const css = buildGlassCss({ ...DEFAULT_GLASS, enabled: false }, true);
  assert.ok(!css.includes('backdrop-filter'));
  assert.ok(css.includes('background'));
});

test('light-theme glass uses the palette surface and ink', () => {
  const css = buildGlassCss({ ...DEFAULT_GLASS, enabled: true, blurLevel: 'light' }, true, mintBreeze);
  assert.ok(css.includes('rgba(224, 221, 215,'));
  assert.ok(css.includes('rgba(27, 25, 22,'));
});
