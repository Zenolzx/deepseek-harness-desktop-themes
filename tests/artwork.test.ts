import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalExpr, parseArtwork } from '../src/design/artwork.ts';
import { artwork } from './fixtures/artwork.ts';
import { coerceConfig } from '../src/config/validation.ts';
import { createDefaultConfig } from '../src/config/defaults.ts';
import { draftFromTheme } from '../src/studio/model.ts';
import { exportStyleBundle, parseStyleBundle } from '../src/workspace/sharing.ts';

test('artwork admits creative expressions, deterministic noise, and safe arithmetic',()=>{
  assert.equal(parseArtwork(artwork()).layers[0].shape,'path');
  const env={i:1,n:20,t:0,r:.2,seed:17};
  assert.equal(evalExpr(['div',5,0],env),0);
  assert.equal(evalExpr(['sqrt',-2],env),0);
  assert.equal(evalExpr(['noise',.3,.5],env),evalExpr(['noise',.3,.5],env));
  assert.notEqual(evalExpr(['noise',.3,.5],env),evalExpr(['noise',.3,.5],{...env,seed:20}));
});
test('artwork rejects executable code, excessive depth and runtime budgets',()=>{
  const a=artwork();assert.throws(()=>parseArtwork({...a,layers:[{...a.layers[0],x:['fetch','https://example.com']}]}),/表达式/);
  assert.throws(()=>parseArtwork({...a,script:'document.body.remove()'}),/字段/);
  let expr:unknown=1;for(let i=0;i<14;i++)expr=['sin',expr];
  assert.throws(()=>parseArtwork({...a,layers:[{...a.layers[0],x:expr}]}),/嵌套/);
  assert.throws(()=>parseArtwork({...a,layers:Array.from({length:4},(_,i)=>({...a.layers[0],id:String(i),count:600}))}),/预算/);
  assert.throws(()=>parseArtwork({...a,duration:.5}),/至少4秒/);
  assert.throws(()=>parseArtwork({...a,decisions:{intent:'漂亮'}}),/七项/);
});
test('artwork requires registered, used, bounded raster assets',()=>{
  const a=artwork(),asset={id:'a',name:'art',data:'data:image/png;base64,AAAA',source:'user',author:'user',license:'user',origin:'user',sha256:'sha256:'+'a'.repeat(64)};
  assert.throws(()=>parseArtwork({...a,layers:[{...a.layers[0],shape:'image',path:undefined,assetId:'missing'}]}),/登记/);
  assert.throws(()=>parseArtwork({...a,assets:[asset]}),/未使用/);
  assert.throws(()=>parseArtwork({...a,assets:[{...asset,data:'data:image/svg+xml;base64,AAAA'}]}),/PNG/);
});
test('procedural artwork survives config normalization and portable version2 export/import',async()=>{
  const c=createDefaultConfig(),draft={...draftFromTheme(c.theme,c.customThemes),artwork:artwork()};
  const normalized=coerceConfig({...c,theme:'custom-a',customThemes:[{...draft,id:'custom-a'}]});
  assert.deepEqual(normalized.customThemes[0].artwork,parseArtwork(artwork()));
  const text=await exportStyleBundle(c,draft),pack=parseStyleBundle(text);
  assert.equal(pack.version,2);assert.deepEqual(pack.config.customThemes[0].artwork,parseArtwork(artwork()));
  assert.throws(()=>parseStyleBundle(text.replace('"version": 2','"version": 1')),/版本2/);
});
