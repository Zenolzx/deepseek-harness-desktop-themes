import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFontCss, codeFontStack, uiFontStack } from '../src/appearance/fonts.ts';
import {
  buildCodeStack,
  buildUiStack,
  familyForDownload,
  getCodePreset,
  getUiPreset,
  isFontAvailable,
  listDownloads,
  presetFamilies,
} from '../src/fonts/presets.ts';
import { DEFAULT_FONT } from '../src/config/defaults.ts';

test('UI stack includes safe fallbacks and ends with sans-serif', () => {
  const stack = buildUiStack(DEFAULT_FONT.uiPreset, DEFAULT_FONT.uiCustomFamily);
  assert.ok(stack.includes('Microsoft YaHei UI'));
  assert.ok(stack.includes('PingFang SC'));
  assert.ok(stack.endsWith('sans-serif'));
});

test('code stack includes JetBrains Mono, Maple Mono, CJK, and monospace fallback', () => {
  const stack = buildCodeStack('jetbrains-mono', '');
  assert.ok(stack.includes('JetBrains Mono'));
  assert.ok(stack.includes('Maple Mono'));
  assert.ok(stack.includes('PingFang SC'));
  assert.ok(stack.endsWith('monospace'));
});

test('custom family is used as the primary when the preset is custom', () => {
  const stack = buildUiStack('custom', 'My Fancy Font');
  assert.ok(stack.startsWith('"My Fancy Font"'));
});

test('a missing font name falls through the stack instead of breaking', () => {
  const stack = buildUiStack('custom', '');
  assert.ok(stack.length > 0);
  assert.ok(!stack.startsWith(','));
});

test('font CSS toggles ligatures and smoothing', () => {
  const ligOn = buildFontCss({ ...DEFAULT_FONT, ligatures: true, smoothing: true });
  const ligOff = buildFontCss({ ...DEFAULT_FONT, ligatures: false, smoothing: false });
  assert.ok(ligOn.includes('font-variant-ligatures: contextual'));
  assert.ok(ligOff.includes('font-variant-ligatures: none'));
  assert.ok(ligOn.includes('-webkit-font-smoothing: antialiased'));
  assert.ok(ligOff.includes('-webkit-font-smoothing: auto'));
});

test('preset lookups resolve known and unknown keys', () => {
  assert.equal(getUiPreset('lxgw-wenkai')?.family, 'LXGW WenKai');
  assert.equal(getCodePreset('cascadia-code')?.family, 'Cascadia Code');
  assert.equal(getUiPreset('missing'), undefined);
});

test('isFontAvailable returns true for system defaults and when DOM is absent', () => {
  assert.equal(isFontAvailable(''), true);
  assert.equal(isFontAvailable('Some Font'), true); // no document in Node
});

test('uiFontStack / codeFontStack helpers build from the config', () => {
  const ui = uiFontStack({ ...DEFAULT_FONT, uiPreset: 'maple-ui', uiCustomFamily: '' });
  const code = codeFontStack({ ...DEFAULT_FONT, codePreset: 'fira-code', codeCustomFamily: '' });
  assert.ok(ui.includes('Maple UI'));
  assert.ok(code.includes('Fira Code'));
});

test('localized family aliases are part of the stack (霞鹜文楷 / LXGW WenKai)', () => {
  const stack = buildUiStack('lxgw-wenkai', '');
  assert.ok(stack.includes('"LXGW WenKai"'), 'English family stays first');
  assert.ok(stack.includes('"霞鹜文楷"'), 'localized family is reachable');
  assert.ok(stack.indexOf('"LXGW WenKai"') < stack.indexOf('"霞鹜文楷"'));
});

test('family aliases are deduplicated against primary and fallbacks', () => {
  const stack = buildUiStack('ms-yahei-ui', '');
  assert.equal(stack.match(/"Microsoft YaHei UI"/g)?.length, 1);
  assert.ok(stack.includes('"微软雅黑 UI"'));
  const families = presetFamilies(getUiPreset('ms-yahei-ui'), 'Microsoft YaHei UI');
  assert.equal(families.length, new Set(families.map((f) => f.toLowerCase())).size);
});

test('code presets expose Nerd Font aliases', () => {
  const stack = buildCodeStack('maple-mono', '');
  assert.ok(stack.includes('"Maple Mono NF CN"'));
  assert.ok(stack.includes('"Maple Mono"'));
});

test('download catalogue is unique, HTTPS and license-labelled', () => {
  const downloads = listDownloads();
  assert.ok(downloads.length >= 6);
  assert.equal(new Set(downloads.map((d) => d.id)).size, downloads.length);
  for (const download of downloads) {
    assert.ok(download.url.startsWith('https://'), download.id);
    assert.ok(download.url.endsWith('.woff2'), download.id);
    assert.ok(download.sizeBytes > 1024, download.id);
    assert.ok(download.license.length > 0, download.id);
    assert.ok(download.homepage.startsWith('https://'), download.id);
  }
  assert.equal(familyForDownload('maple-mono'), 'Maple Mono');
  assert.equal(familyForDownload('lxgw-wenkai'), 'LXGW WenKai');
});

test('font CSS also overrides the composer / form-control family', () => {
  const css = buildFontCss(DEFAULT_FONT);
  assert.ok(css.includes('body textarea'));
  assert.ok(css.includes('--dsw-font-family'));
  assert.ok(css.includes('--ds-font-family-code'));
});
