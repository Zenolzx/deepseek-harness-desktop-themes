import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultConfig } from '../src/config/defaults.ts';
import { coerceConfig, importConfig } from '../src/config/validation.ts';
import { SCENES, applyScene, getScene } from '../src/scenes/presets.ts';

test('six scenes cover both workbench and cinema families', () => {
  assert.equal(SCENES.length, 6);
  assert.equal(SCENES.filter((scene) => scene.family === 'workbench').length, 4);
  assert.equal(SCENES.filter((scene) => scene.family === 'cinema').length, 2);
  for (const scene of SCENES) {
    assert.ok(['mint-breeze', 'sakura-mist', 'quantum-blue', 'aurora-dream', 'sunset-flow', 'obsidian-gold'].includes(scene.theme));
    assert.ok(getScene(scene.id) === scene);
  }
});

test('workbench scene produces a restrained, near-solid light surface', () => {
  const next = applyScene(createDefaultConfig(), 'workbench');
  assert.equal(next.scene, 'workbench');
  assert.equal(next.theme, 'mint-breeze');
  assert.equal(next.appearance.panelOpacity, 1);
  assert.equal(next.glass.enabled, false);
  assert.equal(next.effects.enabled, false);
  assert.equal(next.effects.preset, 'none');
  assert.equal(next.font.fontSize, 14);
});

test('cinema scene applies motion and glass but preserves custom assets and type choices', () => {
  const base = createDefaultConfig();
  base.wallpaper.sourceId = 'wall-123';
  base.wallpaper.path = 'blob:wall-123';
  base.pet.enabled = false;
  base.font.uiPreset = 'lxgw-wenkai';
  base.font.uiCustomFamily = '';
  const next = applyScene(base, 'cinema');
  assert.equal(next.scene, 'cinema');
  assert.equal(next.theme, 'obsidian-gold');
  assert.equal(next.wallpaper.sourceId, 'wall-123');
  assert.equal(next.wallpaper.path, 'blob:wall-123');
  assert.equal(next.pet.enabled, false);
  assert.equal(next.font.uiPreset, 'lxgw-wenkai');
  assert.equal(next.effects.preset, 'gold-dust');
  assert.equal(next.effects.density, 'low');
  assert.equal(next.glass.enabled, true);
  assert.equal(next.font.fontSize, 15);
});

test('unknown scene ids fall back to the custom scene state', () => {
  const next = applyScene(createDefaultConfig(), 'missing');
  assert.equal(next.scene, '');
  assert.equal(next.theme, createDefaultConfig().theme);
});

test('scene coercion accepts known ids and blank custom state', () => {
  assert.equal(coerceConfig({ scene: 'night' }).scene, 'night');
  assert.equal(coerceConfig({ scene: '' }).scene, '');
  assert.equal(coerceConfig({ scene: 'nope' }).scene, 'workbench');
});

test('v3 configs infer a scene from their previous theme family', () => {
  const light = importConfig({ schemaVersion: 3, config: { theme: 'sakura-mist' } });
  assert.equal(light.scene, 'workbench');
  const dark = importConfig({ schemaVersion: 3, config: { theme: 'obsidian-gold' } });
  assert.equal(dark.scene, 'cinema');
});
