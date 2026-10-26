import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfig } from '../src/config/defaults.ts';
import { coerceConfig } from '../src/config/validation.ts';
import { DesktopThemesSchema } from '../src/config/schema.ts';
import { STYLE_PACKS, MODES, AMBIENCES, applyStylePack, applyWorkspace, buildWorkspaceCss } from '../src/workspace/recipes.ts';
import { paletteFromPixels } from '../src/workspace/wallpaper-colors.ts';
import { draftFromTheme, draftIssues } from '../src/studio/model.ts';
import { exportStyleBundle, parseStyleBundle, mergeStyleBundle } from '../src/workspace/sharing.ts';
import { COMMUNITY_THEMES } from '../src/workspace/community.ts';

test('workspace persists and invalid fields clamp without losing legacy choices',()=>{
  const c=createDefaultConfig();assert.deepEqual(DesktopThemesSchema({}).workspace,c.workspace);
  assert.deepEqual(coerceConfig(c).workspace,c.workspace);
  const old=coerceConfig({schemaVersion:4,theme:'obsidian-gold',pet:{enabled:true}});
  assert.equal(old.theme,'obsidian-gold');assert.equal(old.pet.enabled,true);
  assert.deepEqual(coerceConfig({...c,workspace:{style:'bad',mode:'bad',ambience:'bad',warmth:99,depth:-1}}).workspace,{...c.workspace,warmth:1,depth:0});
});
test('all 36 style / mode / ambience combinations preserve personal assets and palette identity',()=>{
  for(const pack of STYLE_PACKS)for(const mode of MODES)for(const ambience of AMBIENCES){
    const base=createDefaultConfig();base.wallpaper.sourceId='personal';base.wallpaper.path='blob:personal';base.font.uiPreset='lxgw-wenkai';base.pet.enabled=true;
    const styled=applyStylePack(base,pack.id),next=applyWorkspace(styled,{mode:mode.id,ambience:ambience.id});
    assert.equal(next.theme,pack.theme);assert.equal(next.wallpaper.sourceId,'personal');assert.equal(next.wallpaper.path,'blob:personal');assert.equal(next.pet.enabled,true);assert.equal(next.font.uiPreset,'lxgw-wenkai');
    assert.equal(next.appearance.panelOpacity,1);assert.equal(next.appearance.inputOpacity,1);
    if(mode.id==='focus'||mode.id==='review')assert.equal(next.effects.enabled,false);
    assert.deepEqual(coerceConfig(next).workspace,next.workspace);
  }
});
test('image palettes handle strong colors, neutral images and transparent pixels',()=>{
  for(const dark of [true,false])for(const rgb of [[255,0,0],[0,0,255],[255,255,255],[0,0,0],[0,255,0],[127,127,127]]){
    const draft=paletteFromPixels([...rgb,255,...rgb,255,255,0,255,0],dark);
    assert.deepEqual(draftIssues(draft),[]);assert.equal(draft.source,'wallpaper');
  }
  assert.throws(()=>paletteFromPixels([0,0,0,0],true),/像素/);
});
test('complete style bundle round-trips without exporting unrelated themes or runtime URLs',async()=>{
  const base=applyStylePack(createDefaultConfig(),'mineral');base.wallpaper.path='data:image/svg+xml,internal';
  base.pet.speechLines=['private personal phrase'];
  const draft=draftFromTheme(base.theme,[]),text=await exportStyleBundle(base,draft),bundle=parseStyleBundle(text);
  assert.ok(!text.includes('private personal phrase'));
  assert.equal(bundle.config.wallpaper.path,'');assert.equal(bundle.config.customThemes.length,1);
  const current=createDefaultConfig();current.pet.enabled=true;current.performance.level='power-saver';
  const next=mergeStyleBundle(current,bundle);assert.equal(next.pet.enabled,true);assert.equal(next.performance.level,'power-saver');assert.equal(next.workspace.style,'mineral');assert.equal(next.customThemes.length,1);assert.equal(next.customThemes[0].name,draft.name);
  assert.throws(()=>parseStyleBundle(JSON.stringify({...bundle,version:2})),/不支持/);
  assert.throws(()=>parseStyleBundle(JSON.stringify({...bundle,wallpaper:{name:'x',data:'https://example.com/remote.png'}})),/壁纸/);
  assert.throws(()=>parseStyleBundle('{bad'));
});
test('offline community adaptations retain attribution and pass the actual surface audit',()=>{
  assert.equal(COMMUNITY_THEMES.length,3);
  for(const item of COMMUNITY_THEMES){assert.ok(item.author);assert.match(item.url,/github.com\/tinted-theming/);assert.deepEqual(draftIssues(item.theme),[]);}
});
test('material is static and reduced transparency removes ambient paint',()=>{
  const css=buildWorkspaceCss(createDefaultConfig());assert.match(css,/radial-gradient/);assert.match(css,/prefers-reduced-transparency/);assert.doesNotMatch(css,/@keyframes|animation:|backdrop-filter/);
});
