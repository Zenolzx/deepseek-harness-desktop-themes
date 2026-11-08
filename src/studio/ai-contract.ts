import type { CustomThemeConfig, DesktopThemesConfig } from '../config/types.ts';
import { coerceConfig } from '../config/validation.ts';
import { draftIssues, repairDraft } from './model.ts';

export const AI_CHANNEL = '/desktop-themes-ai';
export const AI_API_PREFIX = 'desktop-themes-ai';
export interface ModelChoice { provider: string; model: string }
export interface DesignSnapshot { draft: CustomThemeConfig; environment: DesktopThemesConfig }
export interface ReferenceImage { id: string; name: string; data: string }
export interface DesignMessage { role: 'user' | 'assistant'; text: string }
export interface DesignRequest {
  baseVersion: string; prompt: string; snapshot: DesignSnapshot;
  history: DesignMessage[]; images: ReferenceImage[]; model?: ModelChoice; redesign: boolean;
}
export interface DesignResult { baseVersion: string; snapshot: DesignSnapshot; summary: string; limitations: string[]; changes: string[] }
export interface ModelCatalog { current: ModelChoice; models: Array<ModelChoice & { name: string; vision: boolean }>; imagesAvailable: boolean }

export const environmentKeys = ['workspace','font','appearance','wallpaper','glass','effects'] as const;
const forbiddenWallpaper = ['path','sourceId','name'];
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function reject(message: string): never { throw new Error(message); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) reject(`不支持的字段：${path}.${key}`);
}
function mergeFields(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = {...base};
  for (const [key,value] of Object.entries(patch)) next[key] = object(value) && object(base[key]) ? mergeFields(base[key],value) : value;
  return next;
}
function checkAgainst(patch: Record<string, unknown>, normalized: Record<string, unknown>, path: string) {
  for (const [key,value] of Object.entries(patch)) {
    if (object(value) && object(normalized[key])) checkAgainst(value,normalized[key],`${path}.${key}`);
    else if (JSON.stringify(value)!==JSON.stringify(normalized[key])) reject(`字段值无效或超出范围：${path}.${key}`);
  }
}
/** Reject before coercion can silently replace invalid model output with defaults. */
export function applyDesignOutput(base: DesignSnapshot, raw: unknown, baseVersion: string, options:{repairReadability?:boolean}={}): DesignResult {
  if (!object(raw)) reject('模型必须返回 JSON 对象');
  exactKeys(raw,['theme','environment','summary','limitations'],'结果');
  if (typeof raw.summary!=='string' || !raw.summary.trim() || raw.summary.length>4000) reject('缺少改动说明');
  if (!Array.isArray(raw.limitations) || raw.limitations.length>20 || raw.limitations.some(v=>typeof v!=='string'||v.length>1000)) reject('限制说明格式错误');
  const theme = raw.theme ?? {}, env = raw.environment ?? {};
  if (!object(theme)||!object(env)) reject('主题修改格式错误');
  exactKeys(theme,['name','colors','syntax','states','ansi'],'theme');
  if (theme.name!==undefined && (typeof theme.name!=='string'||!theme.name.trim()||theme.name.length>64)) reject('主题名称无效');
  const maps: Record<string, readonly string[]> = {
    colors:Object.keys(base.draft.colors), syntax:['constant','string','comment','keyword','parameter','function','string-expression','punctuation','link'],states:['success','warning','danger'],
  };
  for (const [key,keys] of Object.entries(maps)) if (theme[key]!==undefined) {
    const values=theme[key]; if(!object(values)) reject(`${key} 必须为颜色对象`);
    exactKeys(values,keys,key);
    if(Object.values(values).some(v=>typeof v!=='string'||!/^#[\da-f]{6}$/i.test(v))) reject(`${key} 仅支持六位 HEX 颜色`);
  }
  if(theme.ansi!==undefined && (!Array.isArray(theme.ansi)||theme.ansi.length!==16||theme.ansi.some(v=>typeof v!=='string'||!/^#[\da-f]{6}$/i.test(v)))) reject('ANSI 必须为 16 个 HEX 颜色');
  exactKeys(env,environmentKeys,'environment');
  for(const [key,value] of Object.entries(env)) {
    if(!object(value)) reject(`${key} 必须为对象`);
    const known=base.environment[key as typeof environmentKeys[number]];
    exactKeys(value,Object.keys(known).filter(k=>key!=='wallpaper'||!forbiddenWallpaper.includes(k)),key);
    for(const [field,v] of Object.entries(value)) {
      const original=(known as unknown as Record<string,unknown>)[field];
      if(typeof v!==typeof original || (Array.isArray(original)!==Array.isArray(v))) reject(`${key}.${field} 类型错误`);
      if(typeof v==='string' && (v.length>256 || /[\x00-\x1f{};<>]/.test(v))) reject(`${key}.${field} 文本无效`);
      if(Array.isArray(v) && (v.length>6||v.some(c=>typeof c!=='string'||!/^#[\da-f]{6}$/i.test(c)))) reject(`${key}.${field} 颜色数组无效`);
    }
  }
  let draft=mergeFields(base.draft as unknown as Record<string,unknown>,theme) as unknown as CustomThemeConfig;
  const environment=mergeFields(base.environment as unknown as Record<string,unknown>,env) as unknown as DesktopThemesConfig;
  if(environment.wallpaper.enabled && !environment.wallpaper.sourceId && !environment.wallpaper.path) reject('请先选择实际壁纸，再启用壁纸');
  const normalized=coerceConfig({...environment,theme:'custom-ai-validation',customThemes:[{...draft,id:'custom-ai-validation'}]});
  const normalizedDraft=normalized.customThemes[0];
  checkAgainst(theme,normalizedDraft as unknown as Record<string,unknown>,'theme');
  checkAgainst(env,normalized as unknown as Record<string,unknown>,'environment');
  let summary=raw.summary;
  if(options.repairReadability && draftIssues(draft).length){
    const original=draft;
    draft=repairDraft(draft);
    const labels:Record<string,string>={primary:'主强调色',text:'正文色',success:'成功状态色',warning:'警告状态色',danger:'错误状态色'};
    const repaired=[...Object.keys(draft.colors).filter(k=>draft.colors[k as keyof typeof draft.colors]!==original.colors[k as keyof typeof original.colors]),...Object.keys(draft.states ?? {}).filter(k=>draft.states?.[k]!==original.states?.[k])];
    if(repaired.length)summary+='\n可读性自动修正：微调了'+repaired.map(k=>labels[k]??k).join('、')+'，以满足对比度要求。';
  }
  const issues=draftIssues(draft); if(issues.length) reject(`可读性检查失败：${issues.join('；')}`);
  const changes:string[]=[];
  const collect=(patch:Record<string,unknown>,old:Record<string,unknown>,prefix:string)=>{
    for(const [key,value] of Object.entries(patch)) {
      if(object(value))collect(value,object(old[key])?old[key]:{},`${prefix}${key}.`);
      else if(JSON.stringify(value)!==JSON.stringify(old[key]))changes.push(prefix+key);
    }
  };
  collect({...theme,colors:draft.colors,...(draft.states?{states:draft.states}:{})},base.draft as unknown as Record<string,unknown>,'theme.');
  collect(env,base.environment as unknown as Record<string,unknown>,'');
  return {baseVersion,snapshot:{draft,environment},summary,limitations:raw.limitations as string[],changes};
}

/** Only appearance data is sent to the model, never unrelated settings. */
export function modelSnapshot(snapshot:DesignSnapshot) {
  return {theme:{name:snapshot.draft.name,colors:snapshot.draft.colors,syntax:snapshot.draft.syntax,states:snapshot.draft.states,ansi:snapshot.draft.ansi},environment:Object.fromEntries(environmentKeys.map(key=>[key,key==='wallpaper'?Object.fromEntries(Object.entries(snapshot.environment.wallpaper).filter(([k])=>!forbiddenWallpaper.includes(k))):snapshot.environment[key]]))};
}
