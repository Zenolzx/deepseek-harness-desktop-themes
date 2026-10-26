import test from 'node:test';
import assert from 'node:assert/strict';

import { exportConfigJson, parseImportedConfig } from '../src/config/transfer.ts';
import { createDefaultConfig } from '../src/config/defaults.ts';

test('export → import round-trips a config', () => {
  const original = createDefaultConfig();
  original.theme = 'aurora-dream';
  original.font.codeFontSize = 15;
  original.glass.blurLevel = 'strong';

  const json = exportConfigJson(original);
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 4);

  const result = parseImportedConfig(json);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.config, original);
  }
});

test('invalid JSON reports a parse error', () => {
  const result = parseImportedConfig('{ not json');
  assert.deepEqual(result, { ok: false, reason: 'parse' });
});

test('valid JSON that is not a config reports a schema error', () => {
  const result = parseImportedConfig('{"hello": "world"}');
  assert.deepEqual(result, { ok: false, reason: 'schema' });
});

test('exported JSON carries no image bytes or secret fields', () => {
  const json = exportConfigJson(createDefaultConfig());
  assert.ok(!json.includes('base64'));
  assert.ok(!json.includes('token'));
  assert.ok(!json.includes('password'));
});
test('backup strips hydrated builtin images and temporary blob URLs',()=>{
  for(const path of ['blob:private-runtime','data:image/png;base64,private-image']){
    const c=createDefaultConfig();c.wallpaper.path=path;
    const exported=exportConfigJson(c);assert.ok(!exported.includes(path));assert.equal(JSON.parse(exported).config.wallpaper.path,'');
  }
});
