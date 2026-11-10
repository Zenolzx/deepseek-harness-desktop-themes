/** Runs the real client presenter against a minimal official-service adapter. */
import { createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { coerceConfig } from '../src/config/validation.ts';
import { createDefaultConfig } from '../src/config/defaults.ts';
import regression from '../tests/fixtures/artwork-scroll.json';
import { deformingArtwork } from '../tests/fixtures/deforming-artwork.ts';
import { apply } from '../src/client/index.tsx';
const root=createRoot(document.getElementById('root')!);
const definitions=new Map<string,any>(),overrides=new Map<string,any>(),panels=new Map<string,any>(),cleanups:Array<()=>void>=[];
let active='mint-breeze';
const writes:any[]=[];
const paint=()=>{
  const def=definitions.get(active);if(!def)return;
  for(const [k,v] of Object.entries(def.tokens))document.documentElement.style.setProperty(k,String(v));
  for(const tokens of overrides.values())for(const [k,v] of Object.entries(tokens))document.documentElement.style.setProperty(k,(v as any)[def.colorScheme]);
  document.body.toggleAttribute('data-ds-dark-theme',def.colorScheme==='dark');
  document.documentElement.style.colorScheme=def.colorScheme;
};
const theme={register:(def:any)=>{definitions.set(def.id,def);return()=>definitions.delete(def.id);},setTheme:(id:string)=>{active=id;paint();},getTheme:()=>({active:{id:active,colorScheme:definitions.get(active)?.colorScheme},themes:[...definitions.values()]}),overrideTokens:(id:string,tokens:any)=>{overrides.set(id,tokens);paint();return()=>{overrides.delete(id);paint();};}};
const show=(id:string|null)=>{const component=panels.get(id??'desktop-themes');if(component)root.render(createElement(component as ComponentType<any>,{}));};
const services:any={theme,slots:{inject:(_name:string,fn:()=>void)=>fn(),register:(options:any,component:any)=>{if(options.name==='main'||options.name==='settings.section')panels.set(options.key??options.id,component);return()=>{};}},layout:{selectPanel:show},configForms:{get:()=>({getSnapshot:()=>({status:'unavailable'}),subscribe:()=>()=>{},set:async(field:string,value:any)=>{writes.push({field,value});return true;}})}};
const ctx:any={get:(name:string)=>services[name],inject:(_names:string[],fn:(ctx:any)=>void)=>fn(ctx),effect:(fn:()=>void|(()=>void))=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);},on:()=>{}};
if(new URL(location.href).searchParams.has('scroll')){
 const config=coerceConfig({...createDefaultConfig(),theme:regression.draft.id,customThemes:[regression.draft],appearance:regression.appearance,glass:regression.glass});
 if(new URL(location.href).searchParams.has('deforming'))config.customThemes=[{...regression.draft,artwork:deformingArtwork()}];
 localStorage.setItem('dsh-desktop-themes:explicit-config:v4',JSON.stringify({savedAt:Date.now(),config}));
}
apply(ctx);show(new URL(location.href).searchParams.has('studio')?'desktop-themes-studio':null);
(window as any).__runtime={writes,show,active:()=>active,dispose:()=>{root.unmount();cleanups.reverse().forEach(fn=>fn());}};
const css=document.createElement('style');css.textContent='html,body,#root{margin:0;height:100%;}body{font:14px system-ui;background-color:#f1efec}';document.head.append(css);

if(new URL(location.href).searchParams.has('scroll')){
 root.render(<div className="regression-shell"><aside><h2>工作区</h2>{Array.from({length:40},(_,i)=><button key={i}>主题测试 {i+1}</button>)}</aside><main id="scroll-pane"><header><h2>持续滚动与可读性</h2><button className="regression-highlight">当前选择</button></header>{Array.from({length:100},(_,i)=><article key={i}><h3>阅读段落 {i+1}</h3><p>这是一段固定测试内容，用于检查滚动时背景是否稳定。图层应在界面下方，不裁切文字，也不制造逐字高亮色块。 Pattern, lighting and motion stay behind the interface.</p><a href="#sample">示例链接</a><pre>const background = 'behind-content';</pre></article>)}<textarea defaultValue="保持清楚的输入面"/></main><aside><h2>文档预览</h2><p>这是独立的稳定面板。</p></aside></div>);
 const style=document.createElement('style');style.textContent=`.regression-shell{height:100vh;display:grid;grid-template-columns:210px 1fr 240px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}.regression-shell aside{overflow:auto;padding:20px;background:var(--dsw-alias-bg-layer-1)}.regression-shell aside button{display:block;margin:10px 0}.regression-shell main{overflow:auto;padding:25px 60px}.regression-shell article{margin:45px 0;line-height:1.8}.regression-shell button,.regression-shell textarea{background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);padding:10px;border-radius:8px}.regression-shell .regression-highlight{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.regression-shell a{color:var(--dsw-alias-brand-primary)}.regression-shell pre{padding:14px;background:var(--dsw-alias-markdown-code-block)}`;document.head.append(style);
}
