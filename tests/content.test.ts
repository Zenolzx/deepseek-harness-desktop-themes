import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContentLayer, effectiveContentStyle, supportsContentVariant } from '../src/appearance/content.ts';
import { createDefaultConfig } from '../src/config/defaults.ts';
import { coerceConfig } from '../src/config/validation.ts';
import { mintBreeze } from '../src/themes/mint-breeze.ts';
import { quantumBlue } from '../src/themes/quantum-blue.ts';

const DIFF_KEYS = [
  '--dsw-alias-file-diff-added-bg',
  '--dsw-alias-file-diff-added-gutter',
  '--dsw-alias-file-diff-added-marker',
  '--dsw-alias-file-diff-deleted-bg',
  '--dsw-alias-file-diff-deleted-gutter',
  '--dsw-alias-file-diff-deleted-marker',
  '--dsw-alias-code-diff-added',
  '--dsw-alias-code-diff-deleted',
  '--dsw-alias-bg-document-preview',
  '--dsw-alias-bg-document-selection',
] as const;

/** Read the alpha out of `rgba(r, g, b, a)`. */
function alphaOf(value: string): number {
  const match = /rgba\([^)]*,\s*([0-9.]+)\)$/.exec(value);
  assert.ok(match !== null, `not an rgba color: ${value}`);
  return Number(match[1]);
}

test('classic releases the layer entirely', () => {
  assert.deepEqual(buildContentLayer(mintBreeze, { style: 'classic', tint: 1 }), {});
});

test('refined emits every content token for light and dark schemes', () => {
  for (const palette of [mintBreeze, quantumBlue]) {
    const layer = buildContentLayer(palette, { style: 'refined', tint: 1 });
    for (const key of DIFF_KEYS) {
      assert.ok(key in layer, `${palette.id} is missing ${key}`);
      assert.equal(layer[key].light, layer[key].dark);
      assert.ok(layer[key].light.length > 0);
    }
  }
});

test('diff markers follow the palette success/danger colors', () => {
  const layer = buildContentLayer(mintBreeze, { style: 'refined', tint: 1 });
  assert.equal(layer['--dsw-alias-file-diff-added-marker'].light, mintBreeze.success);
  assert.equal(layer['--dsw-alias-file-diff-deleted-marker'].light, mintBreeze.danger);
});

test('tint scales the row wash linearly and is clamped', () => {
  const full = buildContentLayer(mintBreeze, { style: 'refined', tint: 1 });
  const half = buildContentLayer(mintBreeze, { style: 'refined', tint: 0.5 });
  const key = '--dsw-alias-file-diff-added-bg';
  assert.ok(Math.abs(alphaOf(half[key].light) - alphaOf(full[key].light) / 2) < 1e-9);

  const huge = buildContentLayer(mintBreeze, { style: 'refined', tint: 50 });
  assert.ok(alphaOf(huge[key].light) <= 1);
});

test('dark palettes use a stronger wash than light ones', () => {
  const light = buildContentLayer(mintBreeze, { style: 'refined', tint: 1 });
  const dark = buildContentLayer(quantumBlue, { style: 'refined', tint: 1 });
  const key = '--dsw-alias-file-diff-added-bg';
  assert.ok(alphaOf(dark[key].light) > alphaOf(light[key].light));
});

test('the document preview stays opaque so decorations cannot bleed through', () => {
  const layer = buildContentLayer(mintBreeze, { style: 'refined', tint: 1 });
  const preview = layer['--dsw-alias-bg-document-preview'].light;
  assert.ok(preview.startsWith('#'), `expected an opaque hex color, got ${preview}`);
});

test('only Mint Breeze exposes the classic/refined switch', () => {
  assert.equal(supportsContentVariant('mint-breeze'), true);
  assert.equal(supportsContentVariant('quantum-blue'), false);

  const config = createDefaultConfig();
  config.theme = 'quantum-blue';
  config.appearance.contentStyle = 'classic';
  assert.equal(effectiveContentStyle(config), 'refined');

  config.theme = 'mint-breeze';
  assert.equal(effectiveContentStyle(config), 'classic');
});

test('appearance coercion keeps and clamps the new fields', () => {
  const kept = coerceConfig({ appearance: { contentStyle: 'classic', diffTint: 0.5 } });
  assert.equal(kept.appearance.contentStyle, 'classic');
  assert.equal(kept.appearance.diffTint, 0.5);

  const bad = coerceConfig({ appearance: { contentStyle: 'nope', diffTint: 99 } });
  assert.equal(bad.appearance.contentStyle, 'refined');
  assert.equal(bad.appearance.diffTint, 2);

  const defaults = createDefaultConfig();
  assert.equal(defaults.appearance.contentStyle, 'refined');
  assert.equal(defaults.appearance.diffTint, 1);
});
