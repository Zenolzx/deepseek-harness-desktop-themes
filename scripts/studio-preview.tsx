import { createRoot } from 'react-dom/client';
import { useSyncExternalStore } from 'react';
import { Studio, studioCss } from '../src/studio/Studio.tsx';
import { createStore } from '../src/utils/store.ts';
import { createDefaultConfig } from '../src/config/defaults.ts';
import { THEMES } from '../src/themes/index.ts';
import { buildWorkspaceCss } from '../src/workspace/recipes.ts';
import { WorkspaceHome } from '../src/workspace/WorkspaceHome.tsx';
import { draftFromTheme } from '../src/studio/model.ts';
import type { AiTransport } from '../src/studio/ai-client.ts';
import { applyDesignOutput, type DesignRequest } from '../src/studio/ai-contract.ts';
const store=createStore(createDefaultConfig());
const theme=THEMES.find(t=>t.id===new URL(location.href).searchParams.get('theme')) ?? THEMES[2];
store.set({...store.get(),theme:theme.id,workspace:{...store.get().workspace,style:theme.id==='mint-breeze'||theme.id==='sakura-mist'?'paper':theme.id==='obsidian-gold'||theme.id==='sunset-flow'?'nocturne':'mineral'}});
const style=document.createElement('style');style.textContent=studioCss+'\nhtml,body,#root{margin:0;height:100%;}';document.head.append(style);
for(const [key,value] of Object.entries(theme.definition.tokens))document.documentElement.style.setProperty(key,value);
const dynamic=document.createElement('style');document.head.append(dynamic);
const paint=()=>{const c=store.get(),p=THEMES.find(t=>t.id===c.theme)?.definition ?? THEMES.find(t=>t.id===draftFromTheme(c.theme,c.customThemes).base)?.definition;if(p)for(const [key,value] of Object.entries(p.tokens))document.documentElement.style.setProperty(key,value);dynamic.textContent=buildWorkspaceCss(c);};
store.subscribe(paint);paint();
(window as any).__studioStore=store;
let base:ReturnType<typeof createDefaultConfig>|null=null;
const commit=(next:ReturnType<typeof createDefaultConfig>)=>{base=null;store.set(next);localStorage.setItem('studio-committed',JSON.stringify(next));(window as any).__studioSaves=((window as any).__studioSaves??0)+1;};
const preview=(next:ReturnType<typeof createDefaultConfig>)=>{base??=structuredClone(store.get());store.set(next);};
const cancelPreview=()=>{if(base){const c=base;base=null;store.set(c);}};
function Home(){const config=useSyncExternalStore(store.subscribe,store.get,store.get);return <div className="dth-studio"><WorkspaceHome config={config} commit={commit} preview={preview} cancelPreview={cancelPreview} openStudio={()=>location.href='/'}/></div>;}
const ai:AiTransport|undefined=new URL(location.href).searchParams.has('ai')?{async call<T>(endpoint:string,payload:unknown):Promise<T>{
  if(endpoint==='models')return {current:{provider:'fixture',model:'vision'},models:[{provider:'fixture',model:'vision',name:'预览测试模型',vision:true}],imagesAvailable:true} as T;
  const request=payload as DesignRequest;
  (window as any).__aiRequests=[...((window as any).__aiRequests??[]),request];
  // Deliberately ignore cancellation to verify that the UI discards late results.
  await new Promise(resolve=>setTimeout(resolve,request.prompt.includes('慢速')?900:60));
  if(request.prompt.includes('失败'))throw new Error('模拟模型不可用，草稿保留');
  return applyDesignOutput(request.snapshot,{theme:{name:request.prompt.slice(0,64)},environment:{font:{fontSize:18}},summary:'已更新主题名称与字号。',limitations:[]},request.baseVersion) as T;
}}:undefined;
createRoot(document.getElementById('root')!).render(new URL(location.href).searchParams.has('home')?<Home/>:<Studio store={store} commit={commit} preview={preview} cancelPreview={cancelPreview} ai={ai}/>);
