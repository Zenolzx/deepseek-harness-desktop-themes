import { useEffect, useRef, useState } from 'react';
import type { DesktopThemesConfig } from '../config/types.ts';
import { createDefaultConfig } from '../config/defaults.ts';
import { draftFromTheme } from './model.ts';
import type { AiTransport } from './ai-client.ts';
import type { DesignMessage, DesignResult, DesignSnapshot, ModelCatalog, ReferenceImage } from './ai-contract.ts';
import { deleteDesignSession, loadDesignSession, saveDesignSession, type DesignSession } from './ai-session.ts';
import { deleteWallpaper, getWallpaper, newWallpaperId, putWallpaper } from '../storage/wallpaper-store.ts';
import { hydrateBuiltinWallpaper } from '../client/theme-presets.ts';
import { inspectArtwork } from '../design/inspect-client.ts';
import { persistArtwork, removeArtworkAsset } from '../design/assets.ts';
import type { CreatorReply } from '../design/creator-contract.ts';

interface Props { snapshot:DesignSnapshot; transport?:AiTransport; apply(snapshot:DesignSnapshot):void; official():DesktopThemesConfig }
function fresh(snapshot:DesignSnapshot):DesignSession {
  const id=crypto.randomUUID();return {id:'active',version:1,messages:[],versions:[{id,title:'设计起点',snapshot:structuredClone(snapshot),messages:[]}],selected:id,images:[],input:'',redesign:false,ownedWallpapers:[]};
}
export function AiDesigner(props:Props){
  const [session,setSession]=useState(()=>fresh(props.snapshot));
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[catalog,setCatalog]=useState<ModelCatalog|null>(null);
  const [status,setStatus]=useState('正在恢复本地设计会话…');
  const [storageError,setStorageError]=useState('');
  const [loadingImage,setLoadingImage]=useState(false);
  const [refreshingModels,setRefreshingModels]=useState(false);
  const live=useRef(props);live.current=props;
  const generation=useRef(0),controller=useRef<AbortController|null>(null),mounted=useRef(true);
  const urls=useRef(new Map<string,string>());
  const pendingRun=useRef<string>();
  const snapshotKey=JSON.stringify(props.snapshot);
  const cancel=()=>{generation.current++;controller.current?.abort();controller.current=null;if(pendingRun.current){void live.current.transport?.call('cancel',{runId:pendingRun.current}).catch(()=>undefined);pendingRun.current=undefined;}setBusy(false);};
  useEffect(()=>{mounted.current=true;let disposed=false;
    if(!props.transport){setReady(true);return ()=>{mounted.current=false;};}
    void loadDesignSession().then(async saved=>{
      if(saved){
        for(const snapshot of [...saved.versions.map(v=>v.snapshot),...(saved.working?[saved.working]:[])]){
          snapshot.environment=hydrateBuiltinWallpaper(snapshot.environment);
          const wallpaper=snapshot.environment.wallpaper;
          if(wallpaper.sourceId && !wallpaper.sourceId.startsWith('builtin:')){
            let url=urls.current.get(wallpaper.sourceId);
            if(!url){const record=await getWallpaper(wallpaper.sourceId);if(disposed)return;if(record){url=URL.createObjectURL(record.blob);urls.current.set(wallpaper.sourceId,url);}}
            wallpaper.path=url ?? '';if(!url)wallpaper.enabled=false;
          }
        }
        if(disposed)return;
        setSession(saved);live.current.apply(structuredClone(saved.working ?? saved.versions.find(v=>v.id===saved.selected)!.snapshot));
      }
      if(!disposed){setReady(true);setStatus(saved?'已恢复设计会话，可继续修改或回到历史版本。':'描述想要的外观，也可以添加参考图。');}
    }).catch(e=>{if(!disposed){setReady(true);setStorageError(String(e instanceof Error?e.message:e));setStatus('可以继续设计；本地恢复不可用。');}});
    return ()=>{disposed=true;mounted.current=false;generation.current++;controller.current?.abort();for(const [id,url] of urls.current)if(live.current.official().wallpaper.sourceId!==id)URL.revokeObjectURL(url);};
  },[]);
  useEffect(()=>{
    if(!props.transport)return;
    const abort=new AbortController();
    void props.transport.call<ModelCatalog>('models',{},abort.signal).then(value=>{if(!abort.signal.aborted)setCatalog(value);}).catch(e=>{if(!abort.signal.aborted)setStatus(e instanceof Error?e.message:'AI 服务不可用');});
    return ()=>abort.abort();
  },[props.transport]);
  useEffect(()=>{if(ready&&props.transport)void saveDesignSession({...session,working:structuredClone(live.current.snapshot)}).then(()=>{if(mounted.current)setStorageError('');}).catch(e=>{if(mounted.current)setStorageError(e instanceof Error?e.message:'本地保存失败');});},[session,ready,snapshotKey]);
  useEffect(()=>{if(controller.current){cancel();setStatus('草稿已变化，已取消旧请求。');}},[snapshotKey]);
  const update=(patch:Partial<DesignSession>)=>setSession(old=>({...old,...patch}));
  const refreshModels=async()=>{
    if(!props.transport)return;
    setRefreshingModels(true);
    try{const value=await props.transport.call<ModelCatalog>('models',{});if(mounted.current){setCatalog(value);setStatus('模型列表已刷新。');}}
    catch(e){if(mounted.current)setStatus(e instanceof Error?e.message:'模型列表读取失败');}
    finally{if(mounted.current)setRefreshingModels(false);}
  };
  const generate=async()=>{
    if(busy||!ready||!session.input.trim()||!props.transport)return;
    cancel();const token=++generation.current,abort=new AbortController();controller.current=abort;setBusy(true);
    const baseKey=JSON.stringify(live.current.snapshot),baseVersion=crypto.randomUUID();
    const base=session.redesign?(()=>{const c=createDefaultConfig();return {environment:{...live.current.snapshot.environment,workspace:c.workspace,font:c.font,appearance:c.appearance,glass:c.glass,effects:c.effects},draft:draftFromTheme(c.theme,c.customThemes)};})():structuredClone(live.current.snapshot);
    const prompt=session.input;
    setStatus('正在设计主题；通过校验后更新预览…');
    try{
      const current=await props.transport.call<ModelCatalog>('models',{},abort.signal);
      if(token!==generation.current||!mounted.current)return;
      setCatalog(current);
      const model=session.model ?? current.current;
      if(session.images.length&&(!current.imagesAvailable||!current.models.some(m=>m.vision&&(current.creatorAvailable||m.provider===model.provider&&m.model===model.model))))throw new Error('当前模型或宿主服务不支持图片，请配置看图模型；输入已保留。');
      const request={baseVersion,prompt,snapshot:base,history:session.messages.slice(-40).map(m=>({...m,text:m.text.slice(0,12000)})),images:session.images,model,redesign:session.redesign};
      let result:DesignResult;
      if(current.creatorAvailable){
        let reply=await props.transport.call<CreatorReply>('create',request,abort.signal);
        while(reply.kind==='render'){
          pendingRun.current=reply.runId;
          if(token!==generation.current||!mounted.current||abort.signal.aborted){void props.transport.call('cancel',{runId:reply.runId}).catch(()=>undefined);return;}
          setStatus('正在实际绘制与检查多尺寸预览；必要时自动修正…');
          const inspection=await inspectArtwork(reply.snapshot,abort.signal,hashes=>{if(mounted.current)setSession(old=>({...old,ownedArtworkAssets:[...new Set([...(old.ownedArtworkAssets ?? []),...hashes])]}));});
          reply=await props.transport.call<CreatorReply>('inspect',{runId:reply.runId,nonce:reply.nonce,digest:reply.digest,inspection},abort.signal);
          pendingRun.current=undefined;
        }
        if(reply.kind==='question'){
          if(token!==generation.current||!mounted.current||abort.signal.aborted)return;
          setSession(old=>({...old,input:'',messages:[...old.messages,{role:'user',text:prompt},{role:'assistant',text:reply.question+'\n推荐：'+reply.recommendation}]}));
          setStatus('补充这一点后继续；也可以回复“按推荐处理”。');return;
        }
        result=reply.result;
        if(result.snapshot.draft.artwork){const persisted=await persistArtwork(result.snapshot.draft.artwork);result.snapshot.draft.artwork=persisted.artwork;}
      }else result=await props.transport.call<DesignResult>('generate',request,abort.signal);
      if(!mounted.current||token!==generation.current||JSON.stringify(live.current.snapshot)!==baseKey||result.baseVersion!==baseVersion)return;
      const messages:DesignMessage[]=[...session.messages,{role:'user',text:prompt},{role:'assistant',text:result.summary+(result.limitations.length?'\n限制：'+result.limitations.join('；'):'')}];
      const id=crypto.randomUUID();
      setSession(old=>({...old,input:'',redesign:false,messages,selected:id,versions:[...old.versions,{id,parent:old.selected,title:prompt.slice(0,48),snapshot:result.snapshot,messages}]}));
      controller.current=null;live.current.apply(result.snapshot);
      setStatus(result.changes.length?`预览已更新，共修改 ${result.changes.length} 项。满意后点击“保存并应用”。`:'本轮未修改主题，请查看设计说明。');
    }catch(e){if(mounted.current&&token===generation.current)setStatus(e instanceof Error?e.message:'生成失败，已有草稿保留。');}
    finally{if(mounted.current&&token===generation.current){controller.current=null;setBusy(false);}}
  };
  const imageEpoch=useRef(0);
  const readImage=async(file:File,wallpaper:boolean)=>{
    const epoch=++imageEpoch.current;setLoadingImage(true);
    try{
      if(file.size>2*1024*1024||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw new Error('请选择不超过 2 MB 的 PNG、JPEG、WebP 或 GIF');
      const bitmap=await createImageBitmap(file);const pixels=bitmap.width*bitmap.height;bitmap.close();if(pixels>32_000_000)throw new Error('图片尺寸过大');
      if(epoch!==imageEpoch.current||!mounted.current)return;
      if(wallpaper){
        cancel();const id=newWallpaperId();if(!await putWallpaper(id,file.name,file))throw new Error('壁纸保存失败');
        if(epoch!==imageEpoch.current||!mounted.current){await deleteWallpaper(id);return;}
        const path=URL.createObjectURL(file);urls.current.set(id,path);
        const snapshot=structuredClone(live.current.snapshot);snapshot.environment.wallpaper={...snapshot.environment.wallpaper,enabled:true,sourceId:id,path,name:file.name};
        const version=crypto.randomUUID();setSession(old=>({...old,ownedWallpapers:[...old.ownedWallpapers,id],selected:version,versions:[...old.versions,{id:version,parent:old.selected,title:'选择壁纸：'+file.name,snapshot,messages:old.messages}]}));
        live.current.apply(snapshot);setStatus('实际壁纸已进入草稿，未发送给模型。');
      }else{
        const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('图片读取失败'));r.readAsDataURL(file);});
        if(epoch!==imageEpoch.current||!mounted.current)return;
        const image:ReferenceImage={id:crypto.randomUUID(),name:file.name,data};
        setSession(old=>({...old,images:[...old.images,image].slice(0,3)}));setStatus('参考图已添加。提交设计时会将下列参考图发送给所选模型。');
      }
    }catch(e){if(mounted.current)setStatus(e instanceof Error?e.message:'图片读取失败');}
    finally{if(mounted.current&&epoch===imageEpoch.current)setLoadingImage(false);}
  };
  const removeSession=async()=>{
    cancel();imageEpoch.current++;setLoadingImage(false);
    try{
      await deleteDesignSession();
      for(const id of session.ownedWallpapers)if(live.current.official().wallpaper.sourceId!==id){await deleteWallpaper(id);const url=urls.current.get(id);if(url)URL.revokeObjectURL(url);urls.current.delete(id);}
      const savedAssets=new Set(live.current.official().customThemes.flatMap(t=>t.artwork?.assets.map(a=>a.sha256) ?? []));
      for(const hash of session.ownedArtworkAssets ?? [])if(!savedAssets.has(hash))await removeArtworkAsset(hash);
      const c=live.current.official(),snapshot={draft:draftFromTheme(c.theme,c.customThemes),environment:structuredClone(c)};
      live.current.apply(snapshot);setSession(fresh(snapshot));setStorageError('');setStatus('会话、参考图与历史草稿已删除，已回到当前主题。');
    }catch(e){setStatus(e instanceof Error?e.message:'删除失败');}
  };
  const selectedModel=session.model ?? catalog?.current;
  const vision=!!catalog?.models.some(m=>m.vision&&(catalog.creatorAvailable||m.provider===selectedModel?.provider&&m.model===selectedModel?.model));
  return <section className="dth-ai" aria-label="AI 主题设计助手" aria-busy={busy}>
    <div className="dth-ai-heading"><div><span className="dth-studio-eyebrow">AI THEME DESIGN</span><h2>一起设计你的主题</h2></div><button disabled={!ready} onClick={()=>void removeSession()}>删除设计会话</button></div>
    <p>描述你想表达的意向，也可以添加参考图。AI 会按需追问，创作构图、图案与动态，再检查实际预览。</p>
    <label>设计模型<select aria-label="设计模型" disabled={busy} value={session.model?JSON.stringify(session.model):''} onChange={e=>update({model:e.target.value?JSON.parse(e.target.value):undefined})}><option value="">沿用 DSH 默认模型{catalog?` · ${catalog.current.model}`:''}</option>{catalog?.models.map(m=><option key={JSON.stringify([m.provider,m.model])} value={JSON.stringify({provider:m.provider,model:m.model})}>{m.provider} / {m.name}{m.vision?' · 支持看图':''}</option>)}</select></label>
    <button disabled={busy||refreshingModels||!props.transport} onClick={()=>void refreshModels()}>{refreshingModels?'正在刷新…':'刷新模型列表'}</button>
    <div className="dth-ai-messages" aria-label="主题设计对话">{session.messages.map((m,i)=><div className={`dth-ai-message is-${m.role}`} key={i}><strong>{m.role==='user'?'你':'主题设计助手'}</strong><p>{m.text}</p></div>)}</div>
    <label>设计要求<textarea aria-label="设计要求" rows={4} maxLength={12000} disabled={!ready||busy} value={session.input} onChange={e=>update({input:e.target.value})} placeholder="例如：参考图片的暖灰和纸张质感。正文要清楚，强调色用低饱和蓝色。保留当前字体。"/></label>
    <div className="dth-ai-images" aria-label="本轮发送的参考图">{session.images.map(image=><figure key={image.id}><img src={image.data} alt={`参考图：${image.name}`}/><figcaption>{image.name}</figcaption>{catalog?.creatorAvailable&&<label className="dth-ai-check"><input type="checkbox" checked={image.allowInArtwork===true} disabled={busy} onChange={e=>update({images:session.images.map(i=>i.id===image.id?{...i,allowInArtwork:e.target.checked}:i)})}/>允许作为作品素材使用</label>}<button disabled={busy} onClick={()=>update({images:session.images.filter(i=>i.id!==image.id)})} aria-label={`移除参考图 ${image.name}`}>移除</button></figure>)}</div>
    <div className="dth-studio-actions"><label className="dth-studio-file">添加参考图<input aria-label="添加参考图" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={!ready||busy||loadingImage||session.images.length>=3} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void readImage(f,false);}}/></label><label className="dth-studio-file">选择实际壁纸<input aria-label="选择实际壁纸" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={!ready||busy||loadingImage} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void readImage(f,true);}}/></label></div>
    {!!session.images.length&&<p className="dth-studio-note">提交时将发送上方 {session.images.length} 张参考图。{!vision?'当前模型未确认支持看图，请选择支持看图的模型。':''}{catalog&&!catalog.imagesAvailable?'宿主图片服务不可用。':''}</p>}
    <label className="dth-ai-check"><input type="checkbox" checked={session.redesign} disabled={busy} onChange={e=>update({redesign:e.target.checked})}/>重新设计整套主题（默认只改本轮要求）</label>
    <div className="dth-studio-actions"><button className="dth-studio-primary" disabled={!ready||busy||loadingImage||!props.transport||!session.input.trim()||!!session.images.length&&(!vision||!catalog?.imagesAvailable)} onClick={()=>void generate()}>生成预览</button>{busy&&<button onClick={()=>{cancel();setStatus('已取消生成，已有草稿保留。');}}>取消生成</button>}</div>
    <p role="status">{props.transport?status:'当前环境未连接 DSH 模型服务。'}</p>{storageError&&<p role="alert">{storageError}</p>}
    <label>设计版本<select aria-label="设计版本" disabled={!ready} value={session.selected} onChange={e=>{cancel();const version=session.versions.find(v=>v.id===e.target.value)!;update({selected:version.id,messages:version.messages});live.current.apply(structuredClone(version.snapshot));setStatus('已回到所选版本，可以继续设计。');}}>{session.versions.map((v,i)=><option value={v.id} key={v.id}>{i+1} · {v.title}</option>)}</select></label>
    <p className="dth-studio-note">对话、参考图和版本保存在本机。预览使用固定样例；满意后点击工作室的“保存并应用”。</p>
  </section>;
}
