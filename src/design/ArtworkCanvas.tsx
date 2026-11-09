import { useEffect, useRef, useState } from 'react';
import { drawArtwork, loadArtworkImages, type Artwork } from './artwork.ts';
import { resolveArtworkAsset } from './assets.ts';
export function ArtworkCanvas({artwork,still=false,time=0,className=''}:{artwork:Artwork;still?:boolean;time?:number;className?:string}){
  const ref=useRef<HTMLCanvasElement>(null),[error,setError]=useState('');
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
    let disposed=false,raf=0,last=0,slow=0,degraded=false,dirty=true;const start=performance.now();
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const mark=()=>{dirty=true;};motion.addEventListener('change',mark);
    const observer=new ResizeObserver(()=>{canvas.width=Math.min(1920,Math.max(1,canvas.clientWidth));canvas.height=Math.min(1200,Math.max(1,canvas.clientHeight));dirty=true;});observer.observe(canvas);
    canvas.width=Math.min(1920,Math.max(1,canvas.clientWidth));canvas.height=Math.min(1200,Math.max(1,canvas.clientHeight));
    setError('');
    void loadArtworkImages(artwork,resolveArtworkAsset).then(images=>{
      if(disposed)return;
      const frame=(now:number)=>{
        if(disposed)return;raf=requestAnimationFrame(frame);
        if(document.hidden||now-last<33)return;last=now;
        if((still||motion.matches||degraded||!artwork.duration)&&!dirty)return;dirty=false;
        const elapsed=still||motion.matches||degraded?time:(now-start)/1000;
        const ms=drawArtwork(ctx,artwork,canvas.width,canvas.height,elapsed,images);
        canvas.dataset.frameMs=ms.toFixed(2);canvas.dataset.phase=elapsed.toFixed(2);canvas.dataset.degraded=String(degraded);
        if(ms>30&&++slow>=5){degraded=true;dirty=true;setError('已采用静态预览以保持流畅');}
      };
      frame(performance.now()+34);
    }).catch(e=>{if(!disposed)setError(e instanceof Error?e.message:'作品素材读取失败');});
    return ()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();motion.removeEventListener('change',mark);ctx.clearRect(0,0,canvas.width,canvas.height);};
  },[artwork,still,time]);
  return <div className={`dth-artwork-frame ${className}`}><canvas ref={ref} aria-label="程序绘制作品"/>{error&&<p role="status">{error}</p>}</div>;
}
