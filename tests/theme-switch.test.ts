import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultConfig } from '../src/config/defaults.ts';
import { switchTheme } from '../src/themes/switch.ts';

function customWallpaperBase() {
  const base = createDefaultConfig();
  base.wallpaper.sourceId = 'wall-123';
  base.wallpaper.path = 'blob:wall-123';
  base.wallpaper.name = 'mine.jpg';
  base.wallpaper.opacity = 0.42;
  base.wallpaper.safeArea = 'strong';
  base.effects.density = 'high';
  base.effects.particleOpacity = 0.9;
  base.glass.panelOpacity = 0.7;
  base.appearance.panelOpacity = 0.62;
  return base;
}

test('palette-only switch preserves a custom wallpaper and every ambience parameter', () => {
  const base = customWallpaperBase();
  const next = switchTheme(base, 'mint-breeze');
  assert.equal(next.theme, 'mint-breeze');
  assert.equal(next.wallpaper.sourceId, 'wall-123');
  assert.equal(next.wallpaper.path, 'blob:wall-123');
  assert.equal(next.wallpaper.opacity, 0.42);
  assert.equal(next.wallpaper.safeArea, 'strong');
  assert.equal(next.effects.density, 'high');
  assert.equal(next.effects.particleOpacity, 0.9);
  assert.equal(next.glass.panelOpacity, 0.7);
  assert.equal(next.appearance.panelOpacity, 0.62);
});

test('palette-only switch follows a theme-owned wallpaper but keeps it disabled', () => {
  const base = createDefaultConfig();
  assert.equal(base.wallpaper.sourceId, 'builtin:mint-breeze');
  base.wallpaper.enabled = false;
  base.wallpaper.positionX = 18;
  const next = switchTheme(base, 'sakura-mist');
  assert.equal(next.wallpaper.sourceId, 'builtin:sakura-mist');
  assert.equal(next.wallpaper.name, 'sakura-mist · Built-in');
  assert.equal(next.wallpaper.path, '');
  assert.equal(next.wallpaper.enabled, false);
  assert.equal(next.wallpaper.positionX, 18);
  assert.equal(next.effects.preset, base.effects.preset);
});

test('ambience switch applies the recipe but never replaces a custom wallpaper', () => {
  const base = customWallpaperBase();
  const next = switchTheme(base, 'quantum-blue', 'ambience');
  assert.equal(next.theme, 'quantum-blue');
  assert.equal(next.wallpaper.sourceId, 'wall-123');
  assert.equal(next.wallpaper.path, 'blob:wall-123');
  assert.equal(next.effects.preset, 'starfield');
  assert.equal(next.effects.density, 'low');
  assert.equal(next.glass.borderHighlight, 0.24);
});

test('ambience switch applies the wallpaper grade to a theme-owned image', () => {
  const base = createDefaultConfig();
  const next = switchTheme(base, 'aurora-dream', 'ambience');
  assert.equal(next.wallpaper.sourceId, 'builtin:aurora-dream');
  assert.equal(next.wallpaper.opacity, 0.7);
  assert.equal(next.wallpaper.overlay, 0.4);
  assert.equal(next.effects.preset, 'aurora-flow');
  assert.equal(next.glass.blurLevel, 'light');
});

test('custom theme ids switch palette-only and never touch assets', () => {
  const base = customWallpaperBase();
  base.customThemes = [{
    id: 'custom-abc',
    name: 'Mine',
    base: 'mint-breeze',
    colors: { primary: '#123456', accent: '#654321', background: '#fafafa', panel: '#ffffff', text: '#222222', particle: '#123456', glow: '#654321' },
  }];
  const next = switchTheme(base, 'custom-abc', 'ambience');
  assert.equal(next.theme, 'custom-abc');
  assert.equal(next.wallpaper.path, 'blob:wall-123');
  assert.equal(next.effects.density, 'high');
  assert.equal(next.appearance.panelOpacity, 0.62);
});
