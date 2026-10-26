import type { CustomThemeConfig, DesktopThemesConfig } from '../config/types.ts';
import { coerceConfig } from '../config/validation.ts';
import { draftIssues, draftPalette } from '../studio/model.ts';
import { getWallpaper } from '../storage/wallpaper-store.ts';
import { createDefaultConfig } from '../config/defaults.ts';

export function downloadFile(text: BlobPart, name: string, type='application/json') {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const PACK_LIMIT=38*1024*1024;
export interface StyleBundle { kind:'dsh-style-pack'; version:1; name:string; config:DesktopThemesConfig; wallpaper?:{name:string;data:string} }

export async function exportStyleBundle(config:DesktopThemesConfig,draft:CustomThemeConfig,embedded?:StyleBundle['wallpaper']):Promise<string> {
  if(draftIssues(draft).length)throw new Error('请先修复可读性再分享');
  const theme={...draft,id:'custom-shared'};
  const portable=coerceConfig({...createDefaultConfig(),workspace:config.workspace,font:config.font,appearance:config.appearance,wallpaper:config.wallpaper,glass:config.glass,effects:config.effects,theme:theme.id,customThemes:[theme],recentWallpapers:[],themeSchedule:{enabled:false,family:''}});
  portable.wallpaper.path='';
  const bundle:StyleBundle={kind:'dsh-style-pack',version:1,name:draft.name,config:portable,...(embedded?{wallpaper:embedded}:{})};
  const id=config.wallpaper.sourceId;
  if(id && !id.startsWith('builtin:')) {
    const record=await getWallpaper(id);
    if(!record)throw new Error('当前壁纸资源缺失，请重新选择后分享');
    const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('壁纸读取失败'));r.readAsDataURL(record.blob);});
    bundle.wallpaper={name:record.name,data};portable.wallpaper.sourceId='';
  }
  if(config.wallpaper.path && !id && !embedded)throw new Error('临时壁纸无法打包，请先重新选择并持久化');
  const text=JSON.stringify(bundle,null,2);
  if(text.length>PACK_LIMIT)throw new Error('风格包超过 38 MB');
  return text;
}

export function parseStyleBundle(text:string):StyleBundle {
  if(text.length>PACK_LIMIT)throw new Error('风格包超过 38 MB');
  const input=JSON.parse(text);
  if(input?.kind!=='dsh-style-pack'||input.version!==1||!input.config||typeof input.name!=='string'||input.name.length>64)throw new Error('不支持的风格包');
  const config=coerceConfig(input.config);
  const draft=config.customThemes.find(t=>t.id===config.theme);
  if(!draft||draftIssues(draft).length)throw new Error('风格包主题缺失或可读性不合格');
  if(config.wallpaper.enabled && config.wallpaper.sourceId.startsWith('builtin:') && !['mint-breeze','sakura-mist','quantum-blue','aurora-dream','sunset-flow','obsidian-gold'].includes(config.wallpaper.sourceId.slice(8)))throw new Error('风格包引用了不存在的内置壁纸');
  if(config.wallpaper.enabled && config.wallpaper.sourceId && !config.wallpaper.sourceId.startsWith('builtin:') && !input.wallpaper)throw new Error('风格包缺少壁纸资源');
  config.wallpaper.path='';config.recentWallpapers=[];config.themeSchedule={enabled:false,family:''};
  if(config.wallpaper.sourceId && !config.wallpaper.sourceId.startsWith('builtin:'))config.wallpaper.sourceId='';
  let wallpaper:StyleBundle['wallpaper'];
  if(input.wallpaper){
    if(typeof input.wallpaper.name!=='string'||input.wallpaper.name.length>256||typeof input.wallpaper.data!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.wallpaper.data))throw new Error('无效的风格包壁纸');
    wallpaper={name:input.wallpaper.name,data:input.wallpaper.data};
  }
  return {kind:'dsh-style-pack',version:1,name:input.name,config,wallpaper};
}

/** Import appearance only; never replace personal companions, performance or unrelated themes. */
export function mergeStyleBundle(current:DesktopThemesConfig,bundle:StyleBundle,wallpaper?:{id:string;name:string;url:string}):DesktopThemesConfig {
  if(current.customThemes.length>=50)throw new Error('主题库已达 50 套，请先删除不用的主题');
  const source=bundle.config.customThemes.find(t=>t.id===bundle.config.theme)!;
  const theme={...source,id:'custom-'+crypto.randomUUID().slice(0,24)};
  return {...current,scene:'',theme:theme.id,customThemes:[...current.customThemes,theme],workspace:bundle.config.workspace,font:bundle.config.font,appearance:bundle.config.appearance,wallpaper:wallpaper?{...bundle.config.wallpaper,sourceId:wallpaper.id,path:wallpaper.url,name:wallpaper.name}:bundle.config.wallpaper,glass:bundle.config.glass,effects:bundle.config.effects,themeSchedule:{...current.themeSchedule,enabled:false}};
}

/** A portable, representative preview card; contains no private conversation data. */
export function downloadPreviewCard(draft:CustomThemeConfig,config:DesktopThemesConfig) {
  const p=draftPalette(draft),canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;
  const c=canvas.getContext('2d');if(!c)throw new Error('无法生成预览卡');
  const rect=(x:number,y:number,w:number,h:number,color:string,r=16)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();};
  rect(0,0,1600,1000,p.bgBase,0);
  const glow=c.createRadialGradient(1250,70,0,1250,70,1000);glow.addColorStop(0,p.accent+'38');glow.addColorStop(1,p.bgBase+'00');c.fillStyle=glow;c.fillRect(0,0,1600,1000);
  const text=(s:string,x:number,y:number,size=24,color=p.textPrimary)=>{c.fillStyle=color;c.font=`${size}px "Segoe UI","Microsoft YaHei",sans-serif`;c.fillText(s,x,y,1520-x);};
  text('DSH  /  WORKSPACE COLLECTION',80,85,18,p.accent);text(draft.name,80,150,42);
  text(`${config.workspace.style.toUpperCase()}  ·  ${config.workspace.mode}  ·  ${config.workspace.ambience}`,80,192,18,p.textSecondary);
  c.shadowColor='#00000030';c.shadowBlur=50;rect(80,245,1440,590,p.bgSurface,22);c.shadowBlur=0;
  rect(80,245,230,590,p.sidebarFill,22);text('工作空间',108,298,20);text('视觉探索',108,362,20,p.accent);text('产品方案',108,410,20,p.textSecondary);text('代码评审',108,458,20,p.textSecondary);
  text('把喜欢的环境，变成每天的工作台。',355,317,28);text('稳定的阅读表面，让灵感有处安放。',355,365,22,p.textSecondary);
  rect(355,400,1115,260,p.codeBlock);text('const workspace = {',383,448,23,p.accent);text(`  theme: "${draft.name.slice(0,40)}",`,383,498,23);text('  focus: true,',383,548,23,p.success);text('};',383,598,23);
  rect(355,702,1115,70,p.bgSurface2);text('继续探索你的想法…',382,746,22,p.textSecondary);rect(1405,719,42,38,p.accent,10);text('↑',1416,746,24,p.accentForeground);
  [p.bgBase,p.bgSurface,p.textPrimary,p.accent,p.glow].forEach((color,i)=>rect(80+i*58,880,42,24,color,6));
  text('代表性界面预览 · 不含真实会话 · DSH Desktop Themes',80,954,18,p.textSecondary);
  text('风格包包含配色、材质、排版与氛围；字体文件需另行安装。',620,904,18,p.textSecondary);
  canvas.toBlob(blob=>{if(blob)downloadFile(blob,`${draft.name}-preview.png`,'image/png');},'image/png');
}
