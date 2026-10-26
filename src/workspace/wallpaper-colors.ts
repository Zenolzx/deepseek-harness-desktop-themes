import type { CustomThemeConfig } from '../config/types.ts';
import { hexToOklch, oklchToHex } from '../studio/oklch.ts';
import { repairDraft, draftIssues } from '../studio/model.ts';

/** Quantized, saturation-weighted dominant hue, ignoring transparent pixels. */
export function paletteFromPixels(pixels: ArrayLike<number>, dark: boolean): CustomThemeConfig {
  const bins = new Map<number,{weight:number;r:number;g:number;b:number}>();
  for(let i=0;i+3<pixels.length;i+=4){
    if(pixels[i+3]<200)continue;
    const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]];
    const weight=0.1+(Math.max(r,g,b)-Math.min(r,g,b))/255;
    const key=(r>>5)*64+(g>>5)*8+(b>>5);
    const bin=bins.get(key)??{weight:0,r:0,g:0,b:0};
    bin.weight+=weight;bin.r+=r*weight;bin.g+=g*weight;bin.b+=b*weight;bins.set(key,bin);
  }
  const bin=[...bins.values()].sort((a,b)=>b.weight-a.weight)[0];
  if(!bin)throw new Error('图片没有可用的不透明像素');
  const hex='#'+[bin.r,bin.g,bin.b].map(v=>Math.round(v/bin.weight).toString(16).padStart(2,'0')).join('');
  const hue=hexToOklch(hex).h;
  const color=(l:number,c:number,h=hue)=>oklchToHex({l,c,h});
  const draft=repairDraft({id:'',name:'壁纸灵感',base:dark?'quantum-blue':'mint-breeze',source:'wallpaper',colors:{background:color(dark?0.17:0.95,0.015),panel:color(dark?0.23:0.99,0.009),text:color(dark?0.94:0.22,0.012),primary:color(dark?0.76:0.48,0.13),accent:color(dark?0.72:0.5,0.09,hue+28),particle:color(0.7,0.1),glow:color(0.65,0.1)}});
  if(draftIssues(draft).length)throw new Error('无法生成合格配色，请改用另一张壁纸');
  return draft;
}

export async function themeFromWallpaper(file: File, dark: boolean): Promise<CustomThemeConfig> {
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>25*1024*1024)throw new Error('请选择 25 MB 内的 PNG、JPEG、WebP 或 GIF');
  const image=await createImageBitmap(file,{resizeWidth:96,resizeHeight:96,resizeQuality:'low'});
  try {
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('无法读取图片');
    ctx.drawImage(image,0,0,96,96);
    return {...paletteFromPixels(ctx.getImageData(0,0,96,96).data,dark),name:file.name.replace(/\.[^.]+$/,'').slice(0,48)+' · 灵感'};
  } finally { image.close(); }
}
