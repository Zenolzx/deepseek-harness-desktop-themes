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
import { artwork } from '../tests/fixtures/artwork.ts';
import type { CreatorReply } from '../src/design/creator-contract.ts';
import { ArtworkRuntime } from '../src/design/runtime.ts';
import { persistArtwork, embedArtworkAssets } from '../src/design/assets.ts';
import { exportStyleBundle, parseStyleBundle } from '../src/workspace/sharing.ts';
(window as any).__artworkTools={draftFromTheme,ArtworkRuntime,artwork,persistArtwork,embedArtworkAssets,exportStyleBundle,parseStyleBundle};
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
  const creator=new URL(location.href).searchParams.has('creator');
  if(endpoint==='models')return {current:{provider:'fixture',model:'vision'},models:[{provider:'fixture',model:'vision',name:'预览测试模型',vision:true}],imagesAvailable:true,creatorAvailable:creator} as T;
  if(endpoint==='cancel')return null as T;
  if(endpoint==='inspect'){
    const call=payload as {inspection:{samples:unknown[];roundTrip:boolean;errors:string[]}};
    (window as any).__inspection=call.inspection;
    if(call.inspection.samples.length!==4||!call.inspection.roundTrip||call.inspection.errors.length)throw new Error('实际渲染检查失败');
    return {kind:'complete',result:(window as any).__candidate,review:'manual',evidence:['真实渲染通过，需人工审阅']} as T;
  }
  const request=payload as DesignRequest;
  (window as any).__aiRequests=[...((window as any).__aiRequests??[]),request];
  // Deliberately ignore cancellation to verify that the UI discards late results.
  await new Promise(resolve=>setTimeout(resolve,request.prompt.includes('慢速')?900:60));
  if(request.prompt.includes('失败'))throw new Error('模拟模型不可用，草稿保留');
  if(creator){
    if(request.prompt==='需要追问')return {kind:'question',question:'以边缘纹理还是中央主体表达意向？',recommendation:'推荐边缘纹理，保护阅读区。'} as T;
    const result=applyDesignOutput(request.snapshot,{theme:{name:request.prompt.slice(0,64)},summary:'已创作可编辑的自然曲线与动态纹理。',limitations:[]},request.baseVersion);
    result.snapshot.draft.artwork=artwork();result.changes.push('theme.artwork');(window as any).__candidate=result;
    return {kind:'render',runId:'fixture-run',nonce:'fixture-nonce',digest:'fixture-digest',snapshot:result.snapshot} satisfies CreatorReply as T;
  }
  return applyDesignOutput(request.snapshot,{theme:{name:request.prompt.slice(0,64)},environment:{font:{fontSize:18}},summary:'已更新主题名称与字号。',limitations:[]},request.baseVersion) as T;
}}:undefined;
createRoot(document.getElementById('root')!).render(new URL(location.href).searchParams.has('home')?<Home/>:<Studio store={store} commit={commit} preview={preview} cancelPreview={cancelPreview} ai={ai}/>);
