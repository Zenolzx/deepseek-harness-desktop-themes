import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultConfig } from '../src/config/defaults.ts';
import { LOCAL_CONFIG_KEY, loadConfigSnapshot, saveConfigSnapshot } from '../src/storage/config-store.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

test('explicit config snapshot round-trips and strips runtime wallpaper URLs', () => {
  const storage = memoryStorage();
  const config = createDefaultConfig();
  config.font.uiPreset = 'lxgw-wenkai';
  config.wallpaper.path = 'blob:runtime-only';
  assert.equal(saveConfigSnapshot(config, storage), true);
  assert.ok(storage.values.has(LOCAL_CONFIG_KEY));
  const restored = loadConfigSnapshot(storage);
  assert.equal(restored?.font.uiPreset, 'lxgw-wenkai');
  assert.equal(restored?.wallpaper.path, '');
  assert.equal(restored?.wallpaper.sourceId, 'builtin:mint-breeze');
});

test('invalid explicit config snapshots fail closed', () => {
  const storage = memoryStorage();
  storage.setItem(LOCAL_CONFIG_KEY, '{bad json');
  assert.equal(loadConfigSnapshot(storage), null);
});
