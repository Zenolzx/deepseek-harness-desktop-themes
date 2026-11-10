import { toPng } from 'html-to-image';
import type { DesignSnapshot } from '../studio/ai-contract.ts';
import { coerceConfig } from '../config/validation.ts';
import { draftIssues, draftPalette } from '../studio/model.ts';
import { drawArtwork, loadArtworkImages, parseArtwork } from './artwork.ts';
import { persistArtwork, resolveArtworkAsset } from './assets.ts';
import type { Inspection } from './creator-contract.ts';
import { measureLayerSignals } from './signals.ts';

/** Captures real Canvas2D output and stable reading samples; never real conversations. */
export async function inspectArtwork(snapshot:DesignSnapshot,signal:AbortSignal,onCreated:(hashes:string[])=>void=()=>{}):Promise<Inspection>{
  const art=parseArtwork(snapshot.draft.artwork),images=await loadArtworkImages(art,resolveArtworkAsset);
  const report:Inspection={samples:[],roundTrip:false,errors:draftIssues(snapshot.draft),signals:measureLayerSignals(art,images)};
  const persisted=await persistArtwork(art);
  if(persisted.created.length)onCreated(persisted.created);
  const reloaded=coerceConfig({...snapshot.environment,theme:'custom-inspection',customThemes:[{...snapshot.draft,id:'custom-inspection',artwork:persisted.artwork}]}).customThemes[0];
  report.roundTrip=JSON.stringify(reloaded.artwork)===JSON.stringify(persisted.artwork);
  const palette=draftPalette(snapshot.draft);
  const matrix=[{width:1280,height:800,phase:0,state:'reading'},{width:1280,height:800,phase:art.duration/3,state:'menu'},{width:390,height:844,phase:art.duration*2/3,state:'document'},{width:390,height:844,phase:0,state:'reduced-motion'}];
  for(const entry of matrix){
    if(signal.aborted)throw new DOMException('已取消','AbortError');
    const host=document.createElement('div');
    Object.assign(host.style,{position:'fixed',left:'-20000px',top:'0',width:`${entry.width}px`,height:`${entry.height}px`,overflow:'hidden',background:art.background,fontFamily:'system-ui,sans-serif',fontSize:'16px',color:palette.textPrimary});
    const canvas=document.createElement('canvas');canvas.width=entry.width;canvas.height=entry.height;Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%'});host.append(canvas);
    const panel=document.createElement('section');
    Object.assign(panel.style,{position:'absolute',left:entry.width<500?'20px':'240px',right:'20px',top:'120px',padding:'24px',borderRadius:'16px',background:palette.bgSurface,boxShadow:'0 8px 40px #00000015',lineHeight:'1.7'});
    const title=document.createElement('h2');title.textContent=snapshot.draft.name;panel.append(title);
    const body=document.createElement('p');body.textContent=entry.state==='document'?'文档阅读样例：图案、光影和纹理服务于氛围，正文在稳定的阅读面上保持清晰。':'主题创作 · 这是一段用于检查排版与可读性的固定样例。Design with clarity and atmosphere.';panel.append(body);
    const pre=document.createElement('pre');pre.textContent='const theme = { readable: true };';Object.assign(pre.style,{whiteSpace:'pre-wrap',background:palette.bgBase,padding:'12px',color:palette.textPrimary});panel.append(pre);
    const button=document.createElement('button');button.textContent=entry.state==='menu'?'菜单 · 保存 / 回退 / 导出':'继续创作';Object.assign(button.style,{color:palette.accentForeground,background:palette.accent,border:'0',padding:'12px 18px',borderRadius:'8px'});panel.append(button);host.append(panel);document.body.append(host);
    try{
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas2D 不可用');
      const bounds=panel.getBoundingClientRect(),view=host.getBoundingClientRect();
      if(bounds.bottom>view.bottom||bounds.right>view.right||panel.scrollWidth>panel.clientWidth)report.errors.push(`${entry.state} 阅读或操作区域超出视口`);
      // Warm up separately, then sample repeated actual draws. Report the slowest.
      drawArtwork(ctx,art,entry.width,entry.height,entry.phase,images);
      const times=Array.from({length:4},()=>drawArtwork(ctx,art,entry.width,entry.height,entry.phase,images));
      const image=await toPng(host,{pixelRatio:.65,skipFonts:true,cacheBust:false,style:{position:'relative',left:'0',top:'0'},includeStyleProperties:['position','left','right','top','bottom','width','height','display','box-sizing','overflow','padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','border-radius','background-color','color','font-family','font-size','font-weight','line-height','white-space','box-shadow','border','text-align','opacity']});
      const decoded=new Image();decoded.src=image;await decoded.decode();
      const probe=document.createElement('canvas');probe.width=1;probe.height=1;const probeContext=probe.getContext('2d');
      if(!probeContext)throw new Error('截图像素检查不可用');probeContext.drawImage(decoded,0,0,1,1);
      if(probeContext.getImageData(0,0,1,1).data[3]<250)throw new Error('渲染截图为空或不完整，不能进行视觉验收');
      if(signal.aborted)throw new DOMException('已取消','AbortError');
      report.samples.push({...entry,frameMs:Math.max(...times),image});
    }finally{host.remove();}
  }
  return report;
}
