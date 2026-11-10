/** Bounded drawing language: data and arithmetic only, never evaluated JavaScript. */
export type Expr = number | 'i' | 'n' | 't' | 'r' | [string,...Expr[]];
export type Paint = string | {linear?:[number,number,number,number];radial?:[number,number,number];stops:Array<[number,string]>};
export interface ArtworkAsset {id:string;name:string;data?:string;source:string;author:string;license:string;origin:'user'|'commons';sha256:string}
export interface DrawLayer {
  id:string;shape:'ellipse'|'rect'|'path'|'image';count:number;
  x:Expr;y:Expr;width:Expr;height:Expr;rotation:Expr;opacity:Expr;
  fill?:Paint;stroke?:Paint;lineWidth?:number;blur?:number;path?:Array<[string,...Expr[]]>;assetId?:string;
  region:'viewport'|'edges';blend:'source-over'|'screen'|'multiply'|'overlay';
}
export interface Artwork {
  version:1;seed:number;duration:number;background:string;
  layers:DrawLayer[];assets:ArtworkAsset[];
  decisions:Record<string,string>;
}
export const ARTWORK_LIMITS={layers:24,instances:1800,operations:100000,assetBytes:6*1024*1024,sourceBytes:384*1024,pathCommands:40};
export const DRAWING_GUIDE=`绘制程序 artwork JSON: {version:1,seed:整数,duration:0或4..60秒,background:'#RRGGBB',layers:[],assets:[],decisions:{intent,composition,colorAndReading,patternsAndAssets,materialsAndLighting,motionAndStates,adaptationAndDelivery}}。
decisions 七项均为具体中文设计决定。assets 由素材工具登记，你只能在 layer.assetId 引用登记的ID，不能自行提供图片字节。
每层 {id,shape:'ellipse'|'rect'|'path'|'image',count:1..600,x,y,width,height,rotation,opacity,fill?,stroke?,lineWidth?,blur?,path?,assetId?,region:'viewport'|'edges',blend:'source-over'|'screen'|'multiply'|'overlay'}。所有位置/大小为画布相对比例，rotation弧度，opacity为0..1。层按数组顺序合成。路径在宽高定义的局部0..1坐标绘制，支持 ['M',x,y],['L',x,y],['C',x1,y1,x2,y2,x,y],['Q',x1,y1,x,y],['Z']。
数值可以是常数、变量'i'(实例0..count-1),'n'(count),'t'(周期内秒数),'r'(实例固定0..1随机数)，或表达式数组：[操作,参数...]。支持 add/sub/mul/div/mod/pow/min/max/abs/sin/cos/sqrt/floor/ceil/noise/clamp/mix。noise(x,y)为连续确定性0..1噪声；clamp(x,min,max)，mix(a,b,t)。可嵌套12层。除零得到0；有限数值被限制在-1000..1000。禁止JS、CSS、DOM、URL和任意代码。
fill与stroke支持 #RRGGBB 或 #RRGGBBAA 颜色（末两位为透明度；渐变也支持透明色标），或{linear:[x0,y0,x1,y1],stops:[[0,'#HEX'],[1,'#HEX']]}, 或{radial:[cx,cy,r],stops:[...]}, 坐标相对于图形局部。最多8个色标。lineWidth画布比例0..0.05；blur为画布短边比例0..0.025（运行时最多24像素），用于图层柔化，不能采样或折射背后界面。
可自由构造几何、自然轮廓、纹理、图案、光带和粒子分布；不需要套用预设。最多24层、1800实例、100000次表达式操作；path每层最多40命令。duration=0静态，动态以t变化；静态回退为t=0。作品在整个宿主界面下方合成，不覆盖/挖洞/移动任何文字。输入、菜单等使用稳定实色表面。region=edges只显示左右各18%，不是主图案的默认范围。不提供真实背景折射/像素采样或任意布局修改。
完整主题需要设计七项职责；局部修改保留未修改的绘制层。
可见性必须依据实际合成判断：浅底上 screen 会进一步接近白色，不能用近白线+screen假装有纹理。采用 source-over 或 multiply 的深浅层次，透明渐变淡出而非不透明矩形/椭圆色块。主图案不能仅缩在边缘两条细线。
按意向设计可观测的形态与时间变化：流体的形变/传播、烟云的演变、几何的节奏与整体平移是不同实现。表达式可以进入 path 控制点、width/height/rotation/opacity；只平移一个静态符号不能自称完成形变或流动。周期应使用2π*t/duration保持首尾连续。低速和低密度不等于不可见。明确不能达到的要求，不能以图层名称或说明代替画面。`;
const areas=['intent','composition','colorAndReading','patternsAndAssets','materialsAndLighting','motionAndStates','adaptationAndDelivery'];
function obj(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v);}
function keys(v:Record<string,unknown>,allowed:readonly string[],label:string){for(const k of Object.keys(v))if(!allowed.includes(k))throw new Error(`${label} 不支持字段 ${k}`);}
function num(v:unknown,min:number,max:number,name:string):number{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`${name} 超出 ${min}..${max}`);return v;}
function color(v:unknown,alpha=false):string{if(typeof v!=='string'||!(alpha?/^#[\da-f]{6}(?:[\da-f]{2})?$/i:/^#[\da-f]{6}$/i).test(v))throw new Error('绘制颜色必须为 HEX，填充与描边可带两位透明度');return v;}
const arity:Record<string,[number,number]>={add:[2,6],sub:[2,2],mul:[2,6],div:[2,2],mod:[2,2],pow:[2,2],min:[2,6],max:[2,6],abs:[1,1],sin:[1,1],cos:[1,1],sqrt:[1,1],floor:[1,1],ceil:[1,1],noise:[1,2],clamp:[3,3],mix:[3,3]};
function expression(v:unknown,depth=0):{value:Expr;cost:number}{
  if(depth>12)throw new Error('绘制表达式嵌套超过12层');
  if(typeof v==='number')return {value:num(v,-1000,1000,'表达式'),cost:1};
  if(['i','n','t','r'].includes(String(v))&&typeof v==='string')return {value:v as Expr,cost:1};
  if(!Array.isArray(v)||typeof v[0]!=='string'||!Object.prototype.hasOwnProperty.call(arity,v[0]))throw new Error('绘制表达式操作无效');
  const [min,max]=arity[v[0]];if(v.length-1<min||v.length-1>max)throw new Error(`${v[0]} 参数数量错误`);
  const args=v.slice(1).map(x=>expression(x,depth+1));return {value:[v[0],...args.map(a=>a.value)],cost:1+args.reduce((s,a)=>s+a.cost,0)};
}
function paint(v:unknown):Paint{
  if(typeof v==='string')return color(v,true);
  if(!obj(v))throw new Error('填充格式错误');keys(v,['linear','radial','stops'],'填充');
  if(!!v.linear===!!v.radial)throw new Error('渐变需要一个 linear 或 radial');
  const coords=v.linear ?? v.radial;
  if(!Array.isArray(coords)||coords.length!==(v.linear?4:3))throw new Error('渐变坐标错误');
  coords.forEach(c=>num(c,-4,4,'渐变坐标'));if(v.radial)num(coords[2],0.001,4,'渐变半径');
  if(!Array.isArray(v.stops)||v.stops.length<2||v.stops.length>8)throw new Error('渐变需要2..8个色标');
  const stops:Array<[number,string]>=v.stops.map(s=>{if(!Array.isArray(s)||s.length!==2)throw new Error('色标格式错误');return [num(s[0],0,1,'色标'),color(s[1],true)];});
  return v.linear?{linear:coords as [number,number,number,number],stops}:{radial:coords as [number,number,number],stops};
}
export function parseArtwork(raw:unknown):Artwork{
  if(!obj(raw))throw new Error('绘制文档必须是对象');keys(raw,['version','seed','duration','background','layers','assets','decisions'],'绘制文档');
  if(raw.version!==1)throw new Error('不支持的绘制程序版本');
  if(!Array.isArray(raw.layers)||raw.layers.length>ARTWORK_LIMITS.layers)throw new Error('最多24个绘制层');
  const seed=num(raw.seed,0,2147483647,'随机种子');if(!Number.isInteger(seed))throw new Error('随机种子必须为整数');
  const duration=num(raw.duration,0,60,'动画周期');if(duration!==0&&duration<4)throw new Error('动画周期至少4秒，避免快速闪烁');
  if(!obj(raw.decisions)||areas.some(a=>typeof raw.decisions!=='object'||typeof (raw.decisions as Record<string,unknown>)[a]!=='string'||!String((raw.decisions as Record<string,unknown>)[a]).trim()||String((raw.decisions as Record<string,unknown>)[a]).length>2000))throw new Error('绘制作品需完整说明七项设计决定');
  keys(raw.decisions,areas,'设计决定');
  const assets:ArtworkAsset[]=[];let assetBytes=0;
  if(raw.assets!==undefined&&!Array.isArray(raw.assets))throw new Error('素材清单无效');
  for(const asset of (raw.assets ?? []) as unknown[]){
    if(!obj(asset))throw new Error('素材格式错误');keys(asset,['id','name','data','source','author','license','origin','sha256'],'素材');
    for(const k of ['id','name','source','author','license'])if(typeof asset[k]!=='string'||!String(asset[k]).trim()||String(asset[k]).length>2000)throw new Error(`素材缺少 ${k}`);
    if(!['user','commons'].includes(String(asset.origin))||typeof asset.sha256!=='string'||!/^sha256:[a-f0-9]{64}$/.test(asset.sha256))throw new Error('素材缺少来源或哈希');
    if(asset.data!==undefined&&(typeof asset.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.data)))throw new Error('作品素材仅支持 PNG、JPEG、WebP');
    assetBytes+=typeof asset.data==='string'?asset.data.length:0;if(assetBytes>ARTWORK_LIMITS.assetBytes)throw new Error('绘制素材总量超过6 MB');
    if(assets.some(a=>a.id===asset.id)||assets.length>=8)throw new Error('素材标识重复或超过8项');
    assets.push(asset as unknown as ArtworkAsset);
  }
  const withoutAssets=JSON.stringify({...raw,assets:[]});if(withoutAssets.length>ARTWORK_LIMITS.sourceBytes)throw new Error('绘制程序过大');
  let total=0,cost=0;const ids=new Set<string>();
  const layers=raw.layers.map((v):DrawLayer=>{
    if(!obj(v))throw new Error('绘制层无效');keys(v,['id','shape','count','x','y','width','height','rotation','opacity','fill','stroke','lineWidth','blur','path','assetId','region','blend'],'绘制层');
    if(typeof v.id!=='string'||!v.id||v.id.length>64||ids.has(v.id))throw new Error('图层标识无效或重复');ids.add(v.id);
    if(!['ellipse','rect','path','image'].includes(String(v.shape)))throw new Error('绘制形状不支持');
    const count=num(v.count ?? 1,1,600,'实例数');if(!Number.isInteger(count))throw new Error('实例数必须为整数');total+=count;
    const fields:Record<string,Expr>={};let layerCost=0;
    for(const [key,fallback] of Object.entries({x:0,y:0,width:1,height:1,rotation:0,opacity:1})){const e=expression(v[key] ?? fallback);fields[key]=e.value;layerCost+=e.cost;}
    let path:DrawLayer['path'];
    if(v.shape==='path'){
      if(!Array.isArray(v.path)||!v.path.length||v.path.length>ARTWORK_LIMITS.pathCommands)throw new Error('路径命令需要1..40项');
      path=v.path.map(command=>{if(!Array.isArray(command)||!['M','L','C','Q','Z'].includes(String(command[0])))throw new Error('路径命令无效');const needed:Record<string,number>={M:2,L:2,C:6,Q:4,Z:0};if(command.length!==needed[String(command[0])]+1)throw new Error('路径参数数量错误');const coords=command.slice(1).map(c=>expression(c));layerCost+=coords.reduce((s,c)=>s+c.cost,1);return [command[0],...coords.map(c=>c.value)] as [string,...Expr[]];});
    }else if(v.path!==undefined)throw new Error('只有path图层可以包含路径命令');
    if(v.shape==='image'&&(typeof v.assetId!=='string'||!assets.some(a=>a.id===v.assetId)))throw new Error('图片层需要登记的作品素材');
    if(v.shape!=='image'&&v.assetId!==undefined)throw new Error('非图片图层不能引用图片');
    const region=v.region ?? 'viewport',blend=v.blend ?? 'source-over';
    if(!['viewport','edges'].includes(String(region))||!['source-over','screen','multiply','overlay'].includes(String(blend)))throw new Error('区域或混合模式无效');
    cost+=count*(layerCost+20);
    return {id:v.id,shape:v.shape as DrawLayer['shape'],count,...fields,region,blend,...(v.fill!==undefined?{fill:paint(v.fill)}:{}),...(v.stroke!==undefined?{stroke:paint(v.stroke)}:{}),...(v.lineWidth!==undefined?{lineWidth:num(v.lineWidth,0,0.05,'线宽')}:{}),...(v.blur!==undefined?{blur:num(v.blur,0,0.025,'柔化半径')}:{}),...(path?{path}:{}),...(v.assetId?{assetId:String(v.assetId)}:{})} as DrawLayer;
  });
  if(total>ARTWORK_LIMITS.instances||cost>ARTWORK_LIMITS.operations)throw new Error('绘制实例或表达式计算量超出预算，请简化程序');
  for(const asset of assets)if(!layers.some(l=>l.assetId===asset.id))throw new Error(`未使用的素材不进入作品：${asset.name}`);
  return {version:1,seed,duration,background:color(raw.background),layers,assets,decisions:raw.decisions as Record<string,string>};
}
export function tryArtwork(value:unknown):Artwork|undefined{if(value===undefined)return undefined;try{return parseArtwork(value);}catch{return undefined;}}
const finite=(v:number)=>Number.isFinite(v)?Math.max(-1000,Math.min(1000,v)):0;
const hash=(x:number,y:number,seed:number)=>{const n=Math.sin(x*127.1+y*311.7+seed*.001)*43758.5453123;return n-Math.floor(n);};
function noise(x:number,y:number,seed:number){const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,s=u*u*(3-2*u),t=v*v*(3-2*v);return (hash(ix,iy,seed)*(1-s)+hash(ix+1,iy,seed)*s)*(1-t)+(hash(ix,iy+1,seed)*(1-s)+hash(ix+1,iy+1,seed)*s)*t;}
export function evalExpr(e:Expr,env:{i:number;n:number;t:number;r:number;seed:number}):number{
  if(typeof e==='number')return e;if(typeof e==='string')return env[e];
  const a=e.slice(1).map(v=>evalExpr(v as Expr,env));let v=0;
  switch(e[0]){case 'add':v=a.reduce((s,x)=>s+x,0);break;case 'sub':v=a[0]-a[1];break;case 'mul':v=a.reduce((s,x)=>s*x,1);break;case 'div':v=a[1]?a[0]/a[1]:0;break;case 'mod':v=a[1]?((a[0]%a[1])+a[1])%a[1]:0;break;case 'pow':v=Math.pow(a[0],Math.max(-8,Math.min(8,a[1])));break;case 'min':v=Math.min(...a);break;case 'max':v=Math.max(...a);break;case 'abs':v=Math.abs(a[0]);break;case 'sin':v=Math.sin(a[0]);break;case 'cos':v=Math.cos(a[0]);break;case 'sqrt':v=Math.sqrt(Math.max(0,a[0]));break;case 'floor':v=Math.floor(a[0]);break;case 'ceil':v=Math.ceil(a[0]);break;case 'noise':v=noise(a[0],a[1]??0,env.seed);break;case 'clamp':v=Math.min(a[2],Math.max(a[1],a[0]));break;case 'mix':v=a[0]+(a[1]-a[0])*Math.min(1,Math.max(0,a[2]));break;}
  return finite(v);
}
export async function loadArtworkImages(art:Artwork,resolve?:(asset:ArtworkAsset)=>Promise<string>):Promise<Map<string,HTMLImageElement>>{
  const images=new Map<string,HTMLImageElement>();let pixels=0;
  for(const asset of art.assets){const image=new Image();image.src=asset.data ?? (resolve?await resolve(asset):'');await image.decode();pixels+=image.width*image.height;if(image.width*image.height>16_000_000||pixels>24_000_000)throw new Error('作品素材像素预算超限（单图1600万、总计2400万）');images.set(asset.id,image);}return images;
}
function canvasPaint(ctx:CanvasRenderingContext2D,p:Paint,w:number,h:number):string|CanvasGradient{
  if(typeof p==='string')return p;
  let gradient:CanvasGradient;
  if(p.linear){const [a,b,c,d]=p.linear;gradient=ctx.createLinearGradient(a*w,b*h,c*w,d*h);}
  else{const [a,b,r]=p.radial!;gradient=ctx.createRadialGradient(a*w,b*h,0,a*w,b*h,r*Math.max(w,h));}
  for(const [stop,color] of p.stops)gradient.addColorStop(stop,color);return gradient;
}
export function drawArtwork(ctx:CanvasRenderingContext2D,art:Artwork,w:number,h:number,time=0,images=new Map<string,HTMLImageElement>()){
  const started=performance.now();ctx.clearRect(0,0,w,h);ctx.fillStyle=art.background;ctx.fillRect(0,0,w,h);
  for(let k=0;k<art.layers.length;k++){
    const l=art.layers[k];ctx.save();if(l.region==='edges'){ctx.beginPath();ctx.rect(0,0,w*.18,h);ctx.rect(w*.82,0,w*.18,h);ctx.clip();}
    ctx.globalCompositeOperation=l.blend;
    ctx.filter=l.blur?`blur(${Math.min(24,l.blur*Math.min(w,h))}px)`:'none';
    for(let i=0;i<l.count;i++){
      const env={i,n:l.count,t:art.duration?time%art.duration:0,r:hash(i,k,art.seed),seed:art.seed+k};const val=(e:Expr)=>evalExpr(e,env);
      const x=val(l.x)*w,y=val(l.y)*h,rw=Math.min(4,Math.abs(val(l.width)))*w,rh=Math.min(4,Math.abs(val(l.height)))*h;if(rw<.01||rh<.01)continue;
      ctx.save();ctx.translate(x,y);ctx.rotate(val(l.rotation));ctx.globalAlpha=Math.max(0,Math.min(1,val(l.opacity)));
      ctx.lineWidth=(l.lineWidth ?? .001)*Math.min(w,h);ctx.lineCap='round';ctx.lineJoin='round';
      if(l.fill)ctx.fillStyle=canvasPaint(ctx,l.fill,rw,rh);
      if(l.stroke)ctx.strokeStyle=canvasPaint(ctx,l.stroke,rw,rh);
      if(l.shape==='image'){const image=images.get(l.assetId!);if(image){const scale=Math.max(rw/image.width,rh/image.height);ctx.beginPath();ctx.rect(0,0,rw,rh);ctx.clip();ctx.drawImage(image,(rw-image.width*scale)/2,(rh-image.height*scale)/2,image.width*scale,image.height*scale);}}
      else{
        ctx.beginPath();if(l.shape==='ellipse')ctx.ellipse(rw/2,rh/2,rw/2,rh/2,0,0,Math.PI*2);
        else if(l.shape==='rect')ctx.rect(0,0,rw,rh);
        else for(const c of l.path ?? []){const a=c.slice(1).map(e=>val(e as Expr));switch(c[0]){case 'M':ctx.moveTo(a[0]*rw,a[1]*rh);break;case 'L':ctx.lineTo(a[0]*rw,a[1]*rh);break;case 'C':ctx.bezierCurveTo(a[0]*rw,a[1]*rh,a[2]*rw,a[3]*rh,a[4]*rw,a[5]*rh);break;case 'Q':ctx.quadraticCurveTo(a[0]*rw,a[1]*rh,a[2]*rw,a[3]*rh);break;case 'Z':ctx.closePath();break;}}
        if(l.fill)ctx.fill();if(l.stroke)ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  return performance.now()-started;
}
