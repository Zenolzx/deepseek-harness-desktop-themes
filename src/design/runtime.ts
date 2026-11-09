import { drawArtwork, loadArtworkImages, parseArtwork, type Artwork, type Rect } from './artwork.ts';
import { resolveArtworkAsset } from './assets.ts';
/** The same interpreter as the preview; generated layers never receive DOM access. */
export class ArtworkRuntime {
  private canvas:HTMLCanvasElement|null=null;
  private raf=0;private epoch=0;private cleanup:()=>void=()=>{};private key='';
  update(raw:Artwork|undefined,forceStatic=false){
    const key=JSON.stringify([raw,forceStatic]);if(key===this.key)return;this.dispose();this.key=key;if(!raw)return;
    const art=parseArtwork(raw),epoch=++this.epoch;
    const canvas=document.createElement('canvas');canvas.className='dth-artwork-runtime';canvas.setAttribute('aria-hidden','true');
    Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'3',pointerEvents:'none'});document.body.append(canvas);this.canvas=canvas;
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    let rectangles:Rect[]=[],changed=true,dirty=true,lastRects=0,last=0,slow=0,staticMode=forceStatic;
    const onResize=()=>{canvas.width=Math.min(1920,innerWidth);canvas.height=Math.min(1200,innerHeight);changed=true;};onResize();
    const mark=()=>{changed=true;dirty=true;};motion.addEventListener('change',mark);const observer=new MutationObserver(mark);observer.observe(document.getElementById('root') ?? document.body,{subtree:true,childList:true,characterData:true});
    window.addEventListener('resize',onResize);window.addEventListener('scroll',mark,true);window.addEventListener('pointerdown',mark,true);
    this.cleanup=()=>{observer.disconnect();motion.removeEventListener('change',mark);window.removeEventListener('resize',onResize);window.removeEventListener('scroll',mark,true);window.removeEventListener('pointerdown',mark,true);};
    const context=canvas.getContext('2d');if(!context)return;const start=performance.now();
    void loadArtworkImages(art,resolveArtworkAsset).then(images=>{
      if(epoch!==this.epoch)return;
      const frame=(now:number)=>{
        if(epoch!==this.epoch)return;this.raf=requestAnimationFrame(frame);if(document.hidden||now-last<33)return;last=now;
        if((staticMode||motion.matches||!art.duration)&&!dirty&&!changed)return;
        if(changed&&now-lastRects>100){
          rectangles=[];lastRects=now;changed=false;dirty=true;const sx=canvas.width/innerWidth,sy=canvas.height/innerHeight;
          const add=(rect:DOMRect)=>{if(rect.width&&rect.height&&rect.bottom>0&&rect.top<innerHeight)rectangles.push({x:(rect.left-6)*sx,y:(rect.top-5)*sy,width:(rect.width+12)*sx,height:(rect.height+10)*sy});};
          // Protect actual reading/interaction bounds; no guessed sidebar widths.
          for(const el of document.querySelectorAll('.dth-studio,.dth-settings,button,input,textarea,select,pre,p,blockquote,table,a,svg,img,h1,h2,h3,h4,h5,h6,[contenteditable="true"],[role="dialog"],[role="menu"],[role="button"],[role="tab"],[role="checkbox"],[role="switch"],[role="textbox"],[data-review-view]'))add(el.getBoundingClientRect());
          const walker=document.createTreeWalker(document.getElementById('root') ?? document.body,NodeFilter.SHOW_TEXT);let node:Node|null,count=0;
          while((node=walker.nextNode())&&count++<1800){if(!node.textContent?.trim()||node.parentElement?.closest('script,style,canvas'))continue;const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects())add(rect);}
        }
        const ms=drawArtwork(context,art,canvas.width,canvas.height,staticMode||motion.matches?0:(now-start)/1000,images,rectangles);dirty=false;
        if(ms>30&&++slow>5){staticMode=true;dirty=true;}
      };frame(performance.now()+34);
    }).catch(error=>{if(epoch===this.epoch){canvas.dataset.error=error instanceof Error?error.message:'素材缺失';canvas.remove();}});
  }
  dispose(){this.epoch++;cancelAnimationFrame(this.raf);this.cleanup();this.canvas?.remove();this.canvas=null;this.key='';}
}
