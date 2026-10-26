import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { hexToOklch, oklchToHex } from '../src/studio/oklch.ts';
import { draftFromTheme, draftIssues, draftPalette, makeVariant, repairDraft, pushHistory, travelHistory } from '../src/studio/model.ts';
import { exportTheme, importTheme, parseColor, parseJsonc, type ThemeFormat } from '../src/theme-import/index.ts';
import { THEMES, buildCustomThemeDefinition } from '../src/themes/index.ts';
import { coerceConfig } from '../src/config/validation.ts';
import { DesktopThemesSchema } from '../src/config/schema.ts';
import { contrastRatio, hexToRgb } from '../src/utils/color.ts';
import { scheduledTheme } from '../src/studio/schedule.ts';
import { createDefaultConfig } from '../src/config/defaults.ts';

test('OKLCH round trips sRGB anchors and maps out-of-gamut colors to valid hex', () => {
  for (const hex of ['#000000','#FFFFFF','#FF0000','#00FF00','#0000FF','#8B93FF','#F4EFE5']) {
    const roundtrip = hexToRgb(oklchToHex(hexToOklch(hex)));
    const rgb = hexToRgb(hex);
    for (const channel of ['r','g','b'] as const) assert.ok(Math.abs(roundtrip[channel]-rgb[channel])<=1,hex);
  }
  assert.match(oklchToHex({l:0.7,c:0.4,h:260}),/^#[A-F0-9]{6}$/);
  assert.ok(hexToOklch(oklchToHex({l:0.7,c:0.4,h:260})).c < 0.4);
});

test('Studio history retains 20 steps, supports redo and drops divergent futures', () => {
  let state = {past:[] as number[], present:0, future:[] as number[]};
  for (let i=1;i<=30;i++) state=pushHistory(state,i);
  assert.equal(state.past.length,20);
  state=travelHistory(state,'undo'); assert.equal(state.present,29);
  state=travelHistory(state,'redo'); assert.equal(state.present,30);
  state=pushHistory(travelHistory(state,'undo'),99); assert.equal(state.future.length,0);
});

test('Studio variant generation preserves family identity and returns six readable variants', () => {
  const source={...draftFromTheme('quantum-blue',[]),id:'custom-family'};
  for (const variant of ['light','dark','high-contrast','colorblind','oled','paper'] as const) {
    const result=makeVariant(source,variant);
    assert.equal(result.variantOf,source.id);
    assert.deepEqual(draftIssues(result),[],variant);
    if (variant==='oled') assert.equal(result.colors.background,'#000000');
  }
});

test('family schedule is opt-in and switches only between explicit light/dark siblings', () => {
  const config=createDefaultConfig();
  config.customThemes=[{...draftFromTheme('mint-breeze',[]),id:'custom-light',variantOf:'family',variant:'light'},{...draftFromTheme('quantum-blue',[]),id:'custom-dark',variantOf:'family',variant:'dark'}];
  config.themeSchedule={enabled:false,family:'family'};
  assert.equal(scheduledTheme(config,12),undefined);
  config.themeSchedule.enabled=true;
  assert.equal(scheduledTheme(config,7),'custom-light');
  assert.equal(scheduledTheme(config,18),'custom-light');
  assert.equal(scheduledTheme(config,19),'custom-dark');
  assert.equal(scheduledTheme(config,0),'custom-dark');
  config.customThemes.pop();assert.equal(scheduledTheme(config,20),undefined);
});

test('contrast gate blocks conflicting foregrounds and repair checks derived surfaces', () => {
  const draft=draftFromTheme('quantum-blue',[]);
  draft.colors.text=draft.colors.background;draft.colors.primary=draft.colors.background;
  assert.ok(draftIssues(draft).length);
  assert.deepEqual(draftIssues(repairDraft(draft)),[]);
});

test('format exports re-import backgrounds for every built-in palette', () => {
  for(const theme of THEMES) for(const format of ['vscode','base16','base24','shadcn','iterm','dsh'] as ThemeFormat[]) {
    const draft=draftFromTheme(theme.id,[]);
    const output=exportTheme(draft,format);
    const parsed=importTheme(output.text,format,'Imported',theme.palette.colorScheme);
    const actual=hexToRgb(parsed.theme.colors.background), expected=hexToRgb(draft.colors.background);
    for(const ch of ['r','g','b'] as const) assert.ok(Math.abs(actual[ch]-expected[ch])<=1,`${theme.id}/${format}`);
    assert.equal(parsed.theme.ansi?.length,16);
  }
});

test('JSONC preserves quoted URLs and removes comments and trailing commas', () => {
  assert.deepEqual(parseJsonc('{"url":"https://example.com/a,}", // hi\n "a":[1,2,],}'),{url:'https://example.com/a,}',a:[1,2]});
  assert.deepEqual(parseJsonc('{/* hi */"a":1}'),{a:1});
});

test('malformed, oversized, unsupported and transparent input fails without importing CSS', () => {
  assert.throws(()=>importTheme('x'.repeat(1024*1024+1),'vscode'));
  assert.throws(()=>importTheme('{}','vscode'));
  assert.throws(()=>importTheme(':root{--background: url(https://example.com)}','shadcn','x','light'));
  assert.equal(parseColor('url(javascript:alert(1))'),undefined);
  assert.equal(parseColor('#00000000'),undefined);
  assert.equal(parseColor('oklch(50% 0.1 240)')?.length,7);
  assert.ok(parseColor('240 10% 20%'));
});

test('CSS light and dark blocks are selected independently', () => {
  const css=':root {--background: #ffffff;--foreground:#121212;} .dark {--background:#111111;--foreground:#eeeeee;}';
  assert.equal(importTheme(css,'shadcn','x','light').theme.colors.background,'#FFFFFF');
  assert.equal(importTheme(css,'shadcn','x','dark').theme.colors.background,'#111111');
});

test('syntax colors and family metadata survive host schema and config validation', () => {
  const theme={...draftFromTheme('quantum-blue',[]),id:'custom-import',variantOf:'family',variant:'dark',source:'vscode',syntax:{keyword:'#FF99CC'},ansi:Array(16).fill('#445566')};
  const host=DesktopThemesSchema({customThemes:[theme]});
  const config=coerceConfig({...host,theme:theme.id});
  assert.equal(config.customThemes[0].syntax?.keyword,'#FF99CC');
  assert.equal(config.customThemes[0].variantOf,'family');
  assert.equal(config.customThemes[0].ansi?.length,16);
  const bad=coerceConfig({customThemes:[{...theme,syntax:{keyword:'url(bad)',evil:'#123456'}}]});
  assert.deepEqual(bad.customThemes[0].syntax,{});
});

test('native theme transfer preserves structural base, family and provenance', () => {
  const theme={...draftFromTheme('sunset-flow',[]),variantOf:'family',variant:'dark',source:'vscode'};
  const parsed=importTheme(exportTheme(theme,'dsh').text,'dsh').theme;
  assert.equal(parsed.base,'sunset-flow');
  assert.equal(parsed.variantOf,'family');
  assert.equal(parsed.source,'vscode');
  assert.deepEqual(parsed.colors,theme.colors);
});

test('imported syntax is readable on the actual code surface', () => {
  const theme={...draftFromTheme('quantum-blue',[]),id:'custom-import',syntax:{keyword:'#000000'}};
  const def=buildCustomThemeDefinition(theme);
  assert.ok(contrastRatio(def.tokens['--shiki-token-keyword'],draftPalette(theme).codeBlock)>=4.5);
});

test('ten real community themes map every core color from Base16 YAML', () => {
  const dir=new URL('./fixtures/themes/',import.meta.url);
  const files=readdirSync(dir).filter(name=>name.endsWith('.yaml'));
  assert.equal(files.length,10);
  for(const file of files) {
    const result=importTheme(readFileSync(new URL(file,dir),'utf8'),'base16');
    assert.equal(result.coverage,100,file);
    const fixed=repairDraft(result.theme);
    assert.deepEqual(draftIssues(fixed),[],file);
  }
});
