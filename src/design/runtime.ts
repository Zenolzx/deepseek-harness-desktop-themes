import { drawArtwork, loadArtworkImages, parseArtwork, type Artwork } from './artwork.ts';
import { resolveArtworkAsset } from './assets.ts';
/** Background only: host content owns its paint and never gets punched out. */
export class ArtworkRuntime {
  private canvas:HTMLCanvasElement|null=null;
  private raf=0;private epoch=0;private cleanup:()=>void=()=>{};private key='';
  update(raw:Artwork|undefined,forceStatic=false){
    const key=JSON.stringify([raw,forceStatic]);if(key===this.key)return;this.dispose();this.key=key;if(!raw)return;
    const art=parseArtwork(raw),epoch=++this.epoch;
    const canvas=document.createElement('canvas');canvas.className='dth-artwork-runtime';canvas.setAttribute('aria-hidden','true');
    Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'0',pointerEvents:'none',contain:'strict'});document.body.prepend(canvas);this.canvas=canvas;
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    let dirty=true,last=0,slow=0,staticMode=forceStatic;
    const resize=()=>{canvas.width=Math.min(1920,innerWidth);canvas.height=Math.min(1200,innerHeight);dirty=true;};resize();
    const mark=()=>{dirty=true;};motion.addEventListener('change',mark);document.addEventListener('visibilitychange',mark);window.addEventListener('resize',resize);
    this.cleanup=()=>{motion.removeEventListener('change',mark);document.removeEventListener('visibilitychange',mark);window.removeEventListener('resize',resize);};
    const context=canvas.getContext('2d');if(!context)return;let elapsed=0;
    void loadArtworkImages(art,resolveArtworkAsset).then(images=>{
      if(epoch!==this.epoch)return;
      const frame=(now:number)=>{
        if(epoch!==this.epoch)return;this.raf=requestAnimationFrame(frame);
        if(document.hidden){last=now;return;}if(now-last<33)return;
        const delta=last?Math.min(.1,(now-last)/1000):0;last=now;
        const still=staticMode||motion.matches||!art.duration;if(still&&!dirty)return;
        if(!still)elapsed+=delta;
        const ms=drawArtwork(context,art,canvas.width,canvas.height,still?0:elapsed,images);dirty=false;
        canvas.dataset.frameMs=ms.toFixed(2);canvas.dataset.phase=(still?0:elapsed).toFixed(3);
        slow=ms>30?slow+1:0;if(slow>5){staticMode=true;dirty=true;canvas.dataset.degraded='true';}
      };frame(performance.now());
    }).catch(error=>{if(epoch===this.epoch){canvas.dataset.error=error instanceof Error?error.message:'素材缺失';canvas.remove();}});
  }
  dispose(){this.epoch++;cancelAnimationFrame(this.raf);this.cleanup();this.canvas?.remove();this.canvas=null;this.key='';}
}
