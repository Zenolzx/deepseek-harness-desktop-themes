import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveParticleCount } from '../src/effects/engine.ts';
import { getEffectPreset } from '../src/effects/presets.ts';
import { DEFAULT_EFFECTS } from '../src/config/defaults.ts';

test('particle counts stay within the performance-tier caps', () => {
  const area = 1920 * 1080;
  for (const level of ['power-saver', 'balanced', 'quality'] as const) {
    for (const density of ['low', 'medium', 'high'] as const) {
      const count = resolveParticleCount({ ...DEFAULT_EFFECTS, density }, level, area);
      assert.ok(count >= 14, `${level}/${density} too low: ${count}`);
      assert.ok(count <= 112, `${level}/${density} too high: ${count}`);
    }
  }
});

test('off density yields zero particles', () => {
  assert.equal(resolveParticleCount({ ...DEFAULT_EFFECTS, density: 'off' }, 'quality', 1920 * 1080), 0);
});

test('explicit count is clamped to the tier cap', () => {
  const base = { ...DEFAULT_EFFECTS, density: 'low' as const };
  assert.equal(resolveParticleCount({ ...base, particleCount: 400 }, 'balanced', 1920 * 1080), 64);
  assert.equal(resolveParticleCount({ ...base, particleCount: 90 }, 'quality', 1920 * 1080), 90);
});

test('every effect preset resolves to metadata', () => {
  for (const preset of ['none', 'tech-data', 'starfield', 'aurora-flow', 'fireflies', 'bubbles', 'sakura', 'gold-dust', 'breathing', 'custom'] as const) {
    assert.equal(getEffectPreset(preset).id, preset);
  }
});
