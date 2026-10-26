import test from 'node:test';
import assert from 'node:assert/strict';

import { THEMES, getTheme, isBuiltinTheme, bgBaseForTheme, resolvePalette, buildCustomThemeDefinition } from '../src/themes/index.ts';
import { buildSyntaxTokens, buildThemeTokens } from '../src/themes/palette.ts';
import { contrastRatio } from '../src/utils/color.ts';
import { THEME_VISUAL_DEFAULTS } from '../src/themes/visual-defaults.ts';

test('the registry exposes exactly six themes with distinct ids', () => {
  assert.deepEqual(
    THEMES.map((t) => t.id).sort(),
    ['aurora-dream', 'mint-breeze', 'obsidian-gold', 'quantum-blue', 'sakura-mist', 'sunset-flow'].sort(),
  );
});

test('every theme has a full token set and a valid color scheme', () => {
  for (const theme of THEMES) {
    assert.ok(theme.definition.colorScheme === 'dark' || theme.definition.colorScheme === 'light');
    const tokens = theme.definition.tokens;
    for (const token of [
      '--dsw-alias-bg-base',
      '--dsw-alias-bg-layer-1',
      '--dsw-alias-label-primary',
      '--dsw-alias-brand-primary',
      '--dsw-alias-border-l1',
      '--dsw-alias-state-error-primary',
      '--dsw-alias-markdown-code-block',
      '--dsw-specific-sidebar-fill',
      '--dth-shadow-color',
      '--dth-glow-color',
    ]) {
      assert.ok(token in tokens, `${theme.id} is missing ${token}`);
      assert.match(tokens[token], /^(#|rgb|rgba)/);
    }
  }
});

test('syntax colors stay readable on every built-in code surface', () => {
  const keys = ['constant', 'string', 'comment', 'keyword', 'parameter', 'function', 'string-expression', 'punctuation', 'link'];
  for (const theme of THEMES) {
    const tokens = buildSyntaxTokens(theme.palette);
    for (const key of keys) {
      const color = tokens[`--shiki-token-${key}`];
      assert.ok(contrastRatio(color, theme.palette.codeBlock) >= 4.5, `${theme.id}: ${key}`);
    }
  }
});

test('light themes use light scheme and dark themes use dark scheme', () => {
  assert.equal(getTheme('mint-breeze')?.definition.colorScheme, 'light');
  assert.equal(getTheme('sakura-mist')?.definition.colorScheme, 'light');
  assert.equal(getTheme('quantum-blue')?.definition.colorScheme, 'dark');
});

test('token values differ across the six themes', () => {
  const bases = new Set(THEMES.map((t) => buildThemeTokens(t.palette)['--dsw-alias-bg-base']));
  assert.equal(bases.size, 6);
});

test('getTheme / isBuiltinTheme / bgBaseForTheme behave for known and unknown ids', () => {
  assert.equal(getTheme('quantum-blue')?.id, 'quantum-blue');
  assert.equal(getTheme('missing'), undefined);
  assert.equal(isBuiltinTheme('obsidian-gold'), true);
  assert.equal(isBuiltinTheme('system'), false);
  assert.equal(bgBaseForTheme('light'), '#ffffff');
  assert.match(bgBaseForTheme('dark'), /^#/);
});

test('resolvePalette resolves built-in and custom themes', () => {
  assert.equal(resolvePalette('quantum-blue')?.bgBase, '#08090A');
  const custom = resolvePalette('custom-1', [{ id: 'custom-1', name: 'X', base: 'quantum-blue', colors: { primary: '#123456', accent: '#654321', background: '#0a0a0a', panel: '#111111', text: '#ffffff', particle: '#123456', glow: '#654321' } }]);
  assert.equal(custom?.bgBase, '#0a0a0a');
  assert.equal(resolvePalette('missing'), undefined);
});

test('every built-in theme has a distinct visible theme-specific visual recipe', () => {
  assert.deepEqual(Object.keys(THEME_VISUAL_DEFAULTS).sort(), THEMES.map((theme) => theme.id).sort());
  const presets = new Set(Object.values(THEME_VISUAL_DEFAULTS).map((preset) => preset.effects.preset));
  assert.equal(presets.size, 5); // three workbench themes share `none`
  for (const preset of Object.values(THEME_VISUAL_DEFAULTS)) {
    assert.ok((preset.wallpaper.opacity ?? 0) > 0);
  }
  for (const id of ['mint-breeze', 'sakura-mist'] as const) {
    assert.equal(THEME_VISUAL_DEFAULTS[id].effects.enabled, false);
    assert.equal(THEME_VISUAL_DEFAULTS[id].appearance.panelOpacity, 1);
  }
  for (const id of ['aurora-dream', 'sunset-flow', 'obsidian-gold'] as const) {
    assert.equal(THEME_VISUAL_DEFAULTS[id].effects.enabled, true);
    assert.equal(THEME_VISUAL_DEFAULTS[id].effects.density, 'low');
  }
});

test('buildCustomThemeDefinition builds a register-able definition', () => {
  const def = buildCustomThemeDefinition({ id: 'custom-1', name: 'X', base: 'mint-breeze', colors: { primary: '#123456', accent: '#654321', background: '#ffffff', panel: '#eeeeee', text: '#111111', particle: '#123456', glow: '#654321' } });
  assert.equal(def.id, 'custom-1');
  assert.equal(def.colorScheme, 'light');
  assert.ok('--dsw-alias-bg-base' in def.tokens);
});

test('custom themes retain legible syntax colors at an extreme accent', () => {
  const palette = resolvePalette('custom-1', [{ id: 'custom-1', name: 'X', base: 'quantum-blue', colors: { primary: '#020304', accent: '#020304', background: '#050505', panel: '#111111', text: '#ffffff', particle: '#020304', glow: '#020304' } }]);
  assert.ok(palette);
  const tokens = buildSyntaxTokens(palette);
  assert.ok(contrastRatio(tokens['--shiki-token-constant'], palette.codeBlock) >= 4.5);
});
