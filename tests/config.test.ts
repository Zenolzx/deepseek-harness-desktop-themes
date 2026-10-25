import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, createDefaultConfig } from '../src/config/defaults.ts';
import { coerceConfig, mergeConfig } from '../src/config/validation.ts';

test('default config has six themes and full sub-objects', () => {
  assert.equal(DEFAULT_CONFIG.theme, 'obsidian-gold');
  assert.equal(DEFAULT_CONFIG.schemaVersion, 3);
  assert.ok(DEFAULT_CONFIG.font.uiPreset.length > 0);
  assert.ok(DEFAULT_CONFIG.font.codePreset.length > 0);
  assert.equal(DEFAULT_CONFIG.appearance.windowOpacity, 0.94);
  assert.equal(DEFAULT_CONFIG.wallpaper.enabled, true);
  assert.equal(DEFAULT_CONFIG.wallpaper.sourceId, 'builtin:obsidian-gold');
  assert.equal(DEFAULT_CONFIG.glass.enabled, true);
  assert.equal(DEFAULT_CONFIG.effects.preset, 'gold-dust');
  assert.equal(DEFAULT_CONFIG.performance.level, 'balanced');
});

test('createDefaultConfig returns a deep copy, not the shared object', () => {
  const a = createDefaultConfig();
  const b = createDefaultConfig();
  assert.notEqual(a, b);
  assert.notEqual(a.font, b.font);
  assert.notEqual(a.effects.particleColors, b.effects.particleColors);
  a.font.fontSize = 99;
  assert.equal(b.font.fontSize, DEFAULT_CONFIG.font.fontSize);
});

test('coerceConfig on non-object input returns defaults without throwing', () => {
  for (const input of [null, undefined, 42, 'nope', [], true]) {
    const config = coerceConfig(input);
    assert.equal(config.theme, DEFAULT_CONFIG.theme);
    assert.ok(config.font);
  }
});

test('coerceConfig clamps out-of-range numbers and drops unknown keys', () => {
  const config = coerceConfig({
    theme: 'not-a-theme',
    font: { fontSize: 999, lineHeight: -5, ligatures: 'yes' },
    appearance: { windowOpacity: 0.01 },
    extra: 'ignored',
  });
  assert.equal(config.theme, 'obsidian-gold'); // invalid theme falls back
  assert.equal(config.font.fontSize, 24); // clamped to max
  assert.equal(config.font.lineHeight, 1); // clamped to min
  assert.equal(config.font.ligatures, true); // non-boolean falls back
  assert.equal(config.appearance.windowOpacity, 0.55); // clamped to floor
  assert.ok(!('extra' in config));
});

test('coerceConfig clamps opacity to the 0.55 contrast floor', () => {
  const config = coerceConfig({ appearance: { panelOpacity: 0.1 } });
  assert.equal(config.appearance.panelOpacity, 0.55);
});

test('mergeConfig fills a partial object over defaults', () => {
  const merged = mergeConfig({ theme: 'obsidian-gold', font: { fontSize: 18 } });
  assert.equal(merged.theme, 'obsidian-gold');
  assert.equal(merged.font.fontSize, 18);
  assert.equal(merged.font.uiPreset, DEFAULT_CONFIG.font.uiPreset); // untouched default
  assert.equal(merged.glass.strength, DEFAULT_CONFIG.glass.strength);
});

test('coerceConfig preserves a valid custom theme id', () => {
  const config = coerceConfig({
    theme: 'custom-abc',
    customThemes: [{ id: 'custom-abc', name: 'Mine', base: 'quantum-blue', colors: { background: '#000000' } }],
  });
  assert.equal(config.theme, 'custom-abc');
  assert.equal(config.customThemes.length, 1);
});

test('coerceConfig dedupes and re-ids invalid custom theme ids', () => {
  const config = coerceConfig({
    customThemes: [
      { id: 'not-prefixed', name: 'A', base: 'quantum-blue' },
      { id: 'custom-x', name: 'B', base: 'mint-breeze' },
    ],
  });
  assert.equal(config.customThemes.length, 2);
  assert.ok(config.customThemes.every((t) => t.id.startsWith('custom-')));
});
