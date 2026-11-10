import { drawArtwork, evalExpr, type Artwork, type Expr } from './artwork.ts';
import type { LayerSignal } from './creator-contract.ts';
export function timeDependent(value:Expr|undefined):boolean{return value==='t'||Array.isArray(value)&&value.some(x=>Array.isArray(x)||x==='t'?timeDependent(x as Expr):false);}
export function changesOverTime(value:Expr,duration:number,count:number,seed:number):boolean{
  if(!duration||!timeDependent(value))return false;
  return [0,Math.floor(count/2),count-1].some(i=>{const env={i,n:count,t:0,r:.37,seed},base=evalExpr(value,env);return Array.from({length:11},(_,index)=>(index+1)*duration/12).some(t=>Math.abs(evalExpr(value,{...env,t})-base)>.0001);});
}
/** Measure actual composition, not layer names or model claims. */
export function measureLayerSignals(art:Artwork,images:Map<string,HTMLImageElement>):LayerSignal[]{
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=160;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('图层测量不可用');
  const pixels=canvas.width*canvas.height,result:LayerSignal[]=[];
  drawArtwork(ctx,art,canvas.width,canvas.height,0,images);const previous=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  for(let index=0;index<art.layers.length;index++){
    const layer=art.layers[index];drawArtwork(ctx,{...art,layers:art.layers.filter((_,i)=>i!==index)},canvas.width,canvas.height,0,images);
    const next=ctx.getImageData(0,0,canvas.width,canvas.height).data;let changed=0,peak=0;
    for(let p=0;p<next.length;p+=4){const delta=Math.max(Math.abs(next[p]-previous[p]),Math.abs(next[p+1]-previous[p+1]),Math.abs(next[p+2]-previous[p+2]));if(delta>=3)changed++;peak=Math.max(peak,delta);}
    const changes=(value:Expr)=>changesOverTime(value,art.duration,layer.count,art.seed);
    const geometry=[layer.width,layer.height,layer.rotation,...(layer.path ?? []).flatMap(c=>c.slice(1) as Expr[])].some(changes);
    const motion=!art.duration?'static':geometry?'geometry':[layer.x,layer.y].some(changes)?'translation':changes(layer.opacity)?'opacity':'static';
    result.push({id:layer.id,coverage:changed/pixels,peakDelta:peak/255,motion});
  }
  return result;
}
