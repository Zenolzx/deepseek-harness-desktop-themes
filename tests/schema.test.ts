import test from 'node:test';
import assert from 'node:assert/strict';

import { DesktopThemesSchema } from '../src/config/schema.ts';
import { DEFAULT_CONFIG } from '../src/config/defaults.ts';

test('empty section resolves to the defaults', () => {
  const resolved = DesktopThemesSchema({});
  assert.equal(resolved.scene, 'workbench');
  assert.equal(resolved.theme, DEFAULT_CONFIG.theme);
  assert.equal(resolved.font.uiPreset, DEFAULT_CONFIG.font.uiPreset);
  assert.equal(resolved.font.fontSize, DEFAULT_CONFIG.font.fontSize);
  assert.equal(resolved.appearance.windowOpacity, 1);
  assert.equal(resolved.wallpaper.enabled, DEFAULT_CONFIG.wallpaper.enabled);
  assert.equal(resolved.effects.preset, DEFAULT_CONFIG.effects.preset);
  assert.equal(resolved.schemaVersion, 4);
});

test('null section also resolves to defaults', () => {
  const resolved = DesktopThemesSchema(null);
  assert.equal(resolved.theme, 'mint-breeze');
});

test('out-of-range font size is rejected', () => {
  assert.throws(() => DesktopThemesSchema({ font: { fontSize: 999 } } as any));
  assert.throws(() => DesktopThemesSchema({ font: { fontSize: 11 } } as any));
});

test('wallpaper safe-area fields resolve with readable defaults', () => {
  const resolved = DesktopThemesSchema({ wallpaper: { safeArea: 'strong', focusX: 30 } });
  assert.equal(resolved.wallpaper.safeArea, 'strong');
  assert.equal(resolved.wallpaper.focusX, 30);
  assert.equal(resolved.wallpaper.focusY, DEFAULT_CONFIG.wallpaper.focusY);
  assert.throws(() => DesktopThemesSchema({ wallpaper: { safeArea: 'nope' } } as any));
});

test('valid partial input keeps provided values and fills the rest', () => {
  const resolved = DesktopThemesSchema({
    theme: 'mint-breeze',
    glass: { blurLevel: 'strong' },
  });
  assert.equal(resolved.theme, 'mint-breeze');
  assert.equal(resolved.glass.blurLevel, 'strong');
  assert.equal(resolved.font.codePreset, DEFAULT_CONFIG.font.codePreset);
});

test('custom themes array resolves with defaults per element', () => {
  const resolved = DesktopThemesSchema({
    customThemes: [{ id: 'custom-1', name: 'X', base: 'quantum-blue' }],
  });
  assert.equal(resolved.customThemes.length, 1);
  assert.equal(resolved.customThemes[0].id, 'custom-1');
  assert.ok(resolved.customThemes[0].colors.background.length > 0);
});
