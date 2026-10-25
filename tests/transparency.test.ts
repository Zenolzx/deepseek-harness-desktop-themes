import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTransparencyOverrides, isTransparencyActive, surfaceColorsFor } from '../src/appearance/transparency.ts';
import { DEFAULT_APPEARANCE } from '../src/config/defaults.ts';

test('surfaceColorsFor resolves registered themes to their palettes', () => {
  const colors = surfaceColorsFor('quantum-blue');
  assert.equal(colors.base, '#030817');
  assert.match(colors.sidebar, /^#/);
  assert.match(surfaceColorsFor('dark').base, /^#/);
  assert.equal(surfaceColorsFor('light').base, '#ffffff');
});

test('surfaceColorsFor resolves a light custom theme', () => {
  const colors = surfaceColorsFor('custom-1', [{ id: 'custom-1', name: 'X', base: 'mint-breeze', colors: { primary: '#000000', accent: '#000000', background: '#ffffff', panel: '#eeeeee', text: '#111111', particle: '#000000', glow: '#000000' } }]);
  assert.equal(colors.base, '#ffffff');
});

test('buildTransparencyOverrides emits rgba() values with the right alpha', () => {
  const overrides = buildTransparencyOverrides(DEFAULT_APPEARANCE, 'quantum-blue', false);
  const base = overrides['--dsw-alias-bg-base'];
  assert.ok(base, 'bg-base override present');
  assert.match(base.dark, /rgba\(3, 8, 23, 0\.94\)/);
  assert.equal(base.light, base.dark);
});

test('base background becomes fully transparent when a wallpaper is active', () => {
  const overrides = buildTransparencyOverrides(DEFAULT_APPEARANCE, 'quantum-blue', true);
  assert.match(overrides['--dsw-alias-bg-base'].dark, /0\)/);
});

test('sidebar token obeys the sidebar opacity, not the window opacity', () => {
  const appearance = { ...DEFAULT_APPEARANCE, sidebarOpacity: 0.6, windowOpacity: 0.9 };
  const overrides = buildTransparencyOverrides(appearance, 'quantum-blue', false);
  assert.match(overrides['--dsw-specific-sidebar-fill'].dark, /0\.6/);
  assert.match(overrides['--dsw-alias-bg-base'].dark, /0\.9/);
});

test('isTransparencyActive follows the master switch', () => {
  assert.equal(isTransparencyActive({ ...DEFAULT_APPEARANCE, transparencyEnabled: true }), true);
  assert.equal(isTransparencyActive({ ...DEFAULT_APPEARANCE, transparencyEnabled: false }), false);
});
