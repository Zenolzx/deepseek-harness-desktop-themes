import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultConfig } from '../src/config/defaults.ts';
import { applyVisualModePreset } from '../src/appearance/visual-mode.ts';

test('focus and immersive presets preserve user assets and theme identity', () => {
  const base = createDefaultConfig();
  base.theme = 'obsidian-gold';
  base.wallpaper.sourceId = 'user:wallpaper';
  base.wallpaper.path = 'blob:wallpaper';
  base.pet.enabled = false;
  const immersive = applyVisualModePreset(base, 'immersive');
  assert.equal(immersive.wallpaper.sourceId, 'user:wallpaper');
  assert.equal(immersive.wallpaper.path, 'blob:wallpaper');
  assert.equal(immersive.pet.enabled, false);
  assert.equal(immersive.effects.density, 'low');
  const focus = applyVisualModePreset(immersive, 'focus');
  assert.equal(focus.effects.density, 'low');
  assert.equal(focus.effects.glowIntensity, 'off');
  assert.equal(focus.appearance.panelOpacity, 1);
  assert.equal(focus.appearance.windowOpacity, 1);
  assert.equal(focus.glass.enabled, false);
  assert.equal(focus.wallpaper.sourceId, 'user:wallpaper');
  assert.ok(focus.wallpaper.opacity <= 0.28);
  assert.ok(focus.wallpaper.overlay >= 0.56);
});

