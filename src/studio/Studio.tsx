import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { CustomThemeColors, CustomThemeConfig, DesktopThemesConfig } from '../config/types.ts';
import type { Store } from '../utils/store.ts';
import { THEMES, buildCustomThemeDefinition } from '../themes/index.ts';
import { draftFromTheme, draftIssues, draftPalette, makeVariant, pushHistory, repairDraft, travelHistory, type History, type Variant } from './model.ts';
import { hexToOklch, oklchToHex } from './oklch.ts';
import { ansiFor, exportTheme, importTheme, type ThemeFormat, type ThemeImport } from '../theme-import/index.ts';
import { generateHarmony, HARMONY_KINDS, type HarmonyKind } from '../custom-theme/colors.ts';
import { contrastRatio, mixHex } from '../utils/color.ts';
import { buildSyntaxTokens } from '../themes/palette.ts';
import studioCss from './studio.css';
import { STYLE_PACKS, applyStylePack } from '../workspace/recipes.ts';
import { PackThumbnail, WorkspaceControls } from '../workspace/WorkspaceHome.tsx';
import { themeFromWallpaper } from '../workspace/wallpaper-colors.ts';
import { downloadFile, downloadPreviewCard, exportStyleBundle, parseStyleBundle, mergeStyleBundle, PACK_LIMIT, type StyleBundle } from '../workspace/sharing.ts';
import { putWallpaper, newWallpaperId, deleteWallpaper } from '../storage/wallpaper-store.ts';
import { buildUiStack, buildCodeStack } from '../fonts/presets.ts';
import { COMMUNITY_THEMES } from '../workspace/community.ts';

export { studioCss };
export function StudioIcon({size = 18}:{size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 10h18M10 10v11"/><circle cx="15.5" cy="15.5" r="2.5" fill="currentColor" stroke="none"/></svg>;
}
export interface StudioProps { store: Store<DesktopThemesConfig>; commit: (config: DesktopThemesConfig) => void; close?: () => void; preview?: (config: DesktopThemesConfig) => void; cancelPreview?: () => void; saveNow?: () => Promise<boolean> }
const labels: Record<keyof CustomThemeColors,string> = { background:'画布',panel:'面板',text:'正文',primary:'主强调色',accent:'辅助色',particle:'粒子',glow:'光晕' };
const formatLabels: Record<ThemeFormat,string> = { vscode:'VS Code JSON / JSONC',base16:'Base16 JSON / YAML',base24:'Base24 JSON / YAML',iterm:'iTerm .itermcolors',shadcn:'shadcn / Tweakcn CSS',dsh:'DSH 原生主题' };
const variantLabels: Record<Variant,string> = { light:'浅色',dark:'深色','high-contrast':'高对比',colorblind:'蓝橙配色',oled:'OLED',paper:'纸感' };

export function Studio(props: StudioProps) {
  const config = useSyncExternalStore(props.store.subscribe,props.store.get,props.store.get);
  const [history,setHistory] = useState<History<CustomThemeConfig>>(()=>({past:[],present:draftFromTheme(config.theme,config.customThemes),future:[]}));
  const draft = history.present;
  const [baseline,setBaseline] = useState(()=>structuredClone(draft));
  const [baselineEnvironment,setBaselineEnvironment] = useState(()=>structuredClone(config));
  const [compare,setCompare] = useState(false);
  const [selected,setSelected] = useState<keyof CustomThemeColors>('primary');
  const [format,setFormat] = useState<ThemeFormat>('vscode');
  const [scheme,setScheme] = useState<'light'|'dark'>('dark');
  const [importText,setImportText] = useState('');
  const [report,setReport] = useState<ThemeImport | null>(null);
  const [message,setMessage] = useState('草稿仅在画布中预览，保存后应用到工作台。');
  const [harmony,setHarmony] = useState<HarmonyKind>('muted');
  const [professional,setProfessional] = useState(false);
  const [environment,setEnvironment] = useState(()=>structuredClone(config));
  const [sample,setSample] = useState<'conversation'|'document'|'review'|'menu'>('conversation');
  const [bundle,setBundle] = useState<StyleBundle|null>(null);
  const [busy,setBusy] = useState(false);
  const [deleted,setDeleted] = useState<{theme:CustomThemeConfig;active:boolean}|null>(null);
  const transientWallpapers = useRef(new Map<string,string>());
  useEffect(()=>()=>{props.cancelPreview?.();for(const [id,url] of transientWallpapers.current){if(props.store.get().wallpaper.sourceId!==id){URL.revokeObjectURL(url);void deleteWallpaper(id);}}},[]);
  const [trial,setTrial] = useState(false);
  const trialTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const trialBase = useRef<DesktopThemesConfig|null>(null);
  const stopTrial = () => {const active=trialBase.current!==null;if(trialTimer.current)clearTimeout(trialTimer.current);trialTimer.current=null;props.cancelPreview?.();trialBase.current=null;setTrial(false);if(active)setMessage('试用已结束，工作台已恢复。');};
  useEffect(()=>()=>{if(trialTimer.current)clearTimeout(trialTimer.current);props.cancelPreview?.();},[]);
  const trialDraft = () => {
    if(!props.preview || draftIssues(draft).length)return;
    stopTrial();trialBase.current=structuredClone(props.store.get());
    const temp={...draft,id:'custom-live-preview'};
    props.preview({...environment,theme:temp.id,customThemes:[...config.customThemes.filter(t=>t.id!==temp.id),temp]});
    setTrial(true);setMessage('正在宿主中临时试用，20 秒后自动恢复；关闭工作室也会恢复。');
    trialTimer.current=setTimeout(stopTrial,20_000);
  };
  const gesture = useRef(false);
  const gestureRecorded = useRef(false);
  const sequence = useRef(0);
  const colorFrame = useRef(0);
  const pendingColor = useRef<CustomThemeConfig | null>(null);
  useEffect(()=>()=>{ sequence.current++; if(colorFrame.current)cancelAnimationFrame(colorFrame.current); },[]);
  const change = (next: CustomThemeConfig) => {
    sequence.current++;
    if(colorFrame.current)cancelAnimationFrame(colorFrame.current);
    colorFrame.current=0;pendingColor.current=null;
    setCompare(false);
    setHistory(h => {
      if (gesture.current && gestureRecorded.current) return { ...h, present: next, future: [] };
      if (gesture.current) gestureRecorded.current = true;
      return pushHistory(h,next);
    });
  };
  const load = (id: string) => {
    sequence.current++;
    stopTrial();
    const next = draftFromTheme(id,props.store.get().customThemes);
    change(next); setBaseline(structuredClone(next)); setBaselineEnvironment(structuredClone(environment)); setReport(null);
  };
  const issues = draftIssues(draft);
  const color = draft.colors[selected];
  const lch = hexToOklch(color);
  const setColor = (value: string) => change({...draft,colors:{...draft.colors,[selected]:value}});
  const queueColor = (value: string) => {
    pendingColor.current={...draft,colors:{...draft.colors,[selected]:value}};
    if(colorFrame.current)return;
    colorFrame.current=requestAnimationFrame(()=>{
      colorFrame.current=0;
      const next=pendingColor.current;
      if(next)change(next);
    });
  };
  const save = (copy = false) => {
    if(busy)return;
    if(bundle){void installPack();return;}
    const candidate=pendingColor.current ?? draft;
    if (draftIssues(candidate).length) { setMessage('请先修复可读性问题，再保存。'); return; }
    const current = trialBase.current ?? props.store.get();
    stopTrial();
    const existing = !copy && current.customThemes.some(t=>t.id === draft.id);
    if (!existing && current.customThemes.length >= 50) { setMessage('主题库已达 50 套，请先在自定义主题中删除不用的主题。'); return; }
    const saved = { ...candidate, id: existing ? candidate.id : 'custom-'+crypto.randomUUID().slice(0,24), name: candidate.name.trim().slice(0,64) || 'Studio theme' };
    const next={...current,workspace:environment.workspace,font:environment.font,appearance:environment.appearance,wallpaper:environment.wallpaper,glass:environment.glass,effects:environment.effects};
    props.commit({...next, scene:'',theme:saved.id,themeSchedule:{...current.themeSchedule,enabled:false},customThemes:existing ? current.customThemes.map(t=>t.id===saved.id ? saved : t) : [...current.customThemes,saved]});
    change(saved); setBaseline(structuredClone(saved)); setBaselineEnvironment(structuredClone(next)); setMessage('已保存并应用配色、排版与氛围。伙伴偏好保持不变。');
    if(props.saveNow){const request=sequence.current;setMessage('正在保存…');void props.saveNow().then(ok=>{if(request===sequence.current)setMessage(ok?'已保存并应用配色、排版与氛围。伙伴偏好保持不变。':'外观已本地应用，但宿主保存失败。请在设置页重试保存。');}).catch(()=>setMessage('宿主保存失败，请在设置页重试。'));}
  };
  const parse = (text: string) => {
    try {
      const result = importTheme(text,format,'Imported theme',scheme);
      change(result.theme); setReport(result); setMessage('已导入为草稿，请检查预览和可读性。');
    } catch (error) { setReport(null); setMessage(error instanceof Error ? error.message : '主题解析失败'); }
  };
  const download = () => {
    const output = exportTheme(draft,format);
    const url = URL.createObjectURL(new Blob([output.text],{type:format === 'shadcn' ? 'text/css' : 'text/plain'}));
    const link = document.createElement('a'); link.href=url; link.download=(draft.name.replace(/[^\p{L}\p{N}_-]/gu,'-') || 'theme')+'.'+output.extension; link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setMessage('已导出当前草稿。');
  };
  const selectPack = (id: typeof STYLE_PACKS[number]['id']) => {
    stopTrial();const next=applyStylePack(environment,id);setEnvironment(next);load(next.theme);setBaselineEnvironment(structuredClone(next));setBundle(null);
    setMessage('风格包已载入草稿。保存后应用，或先在宿主中临时试用。');
  };
  const importPack = async (file:File) => {
    if(file.size>PACK_LIMIT){setMessage('风格包超过 38 MB');return;}
    const request=++sequence.current;
    try {const next=parseStyleBundle(await file.text());if(request!==sequence.current)return;stopTrial();setBundle(next);setEnvironment({...next.config,wallpaper:{...next.config.wallpaper,path:next.wallpaper?.data ?? ''}});change(next.config.customThemes.find(t=>t.id===next.config.theme)!);setMessage('风格包已预览。点击“安装此风格包”或顶部保存后安装。');}
    catch(e){setMessage(e instanceof Error?e.message:'风格包读取失败');}
  };
  const installPack = async () => {
    if(busy)return;
    if(!bundle)return;
    setBusy(true);
    try {
      stopTrial();let wallpaper;
      if(draftIssues(draft).length)throw new Error('请先修复可读性再安装');
      if(props.store.get().customThemes.length>=50)throw new Error('主题库已达 50 套，请先删除不用的主题');
      if(bundle.wallpaper){
        const [header,bytes]=bundle.wallpaper.data.split(',');
        const type=header.slice(5,header.indexOf(';'));
        const data=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0));
        const image=await createImageBitmap(new Blob([data],{type}));image.close();
        const id=newWallpaperId();
        if(!await putWallpaper(id,bundle.wallpaper.name,new Blob([data],{type})))throw new Error('壁纸保存失败，未安装风格包');
        wallpaper={id,name:bundle.wallpaper.name,url:URL.createObjectURL(new Blob([data],{type}))};
      }
      const edited={...bundle,config:{...bundle.config,workspace:environment.workspace,font:environment.font,appearance:environment.appearance,glass:environment.glass,effects:environment.effects,theme:draft.id || 'custom-shared',customThemes:[{...draft,id:draft.id || 'custom-shared'}]}};const next=mergeStyleBundle(props.store.get(),edited,wallpaper);props.commit(next);setEnvironment(next);change(draftFromTheme(next.theme,next.customThemes));setBundle(null);const saved=props.saveNow?await props.saveNow():true;setMessage(saved?'风格包已安装并应用。伙伴与性能偏好保留。':'风格包已本地应用，但宿主保存失败，请在设置页重试。');
    }catch(e){setMessage(e instanceof Error?e.message:'安装失败');}finally{setBusy(false);}
  };
  const sharePack = async () => {setBusy(true);try{downloadFile(await exportStyleBundle(environment,draft,bundle?.wallpaper),`${draft.name}.dsh-style.json`);setMessage('完整风格包已导出。个人壁纸随包保存，字体文件不打包。');}catch(e){setMessage(e instanceof Error?e.message:'导出失败');}finally{setBusy(false);}};
  const deleteTheme = (theme:CustomThemeConfig) => {
    stopTrial();const current=props.store.get();const active=current.theme===theme.id;
    const fallback=THEMES.some(t=>t.id===theme.base)?theme.base:'mint-breeze';
    const next={...current,customThemes:current.customThemes.filter(t=>t.id!==theme.id),theme:active?fallback:current.theme};
    props.commit(next);setDeleted({theme:structuredClone(theme),active});setMessage('主题已删除，可在顶部撤销。');
    if(active){setEnvironment(next);change(draftFromTheme(next.theme,next.customThemes));}
  };
  const restoreDeleted = () => {
    if(!deleted)return;stopTrial();const current=props.store.get();
    if(current.customThemes.length>=50){setMessage('主题库已满，请先释放一个位置再恢复。');return;}
    const next={...current,customThemes:[...current.customThemes.filter(t=>t.id!==deleted.theme.id),deleted.theme],theme:deleted.active?deleted.theme.id:current.theme};props.commit(next);setEnvironment(next);if(deleted.active)change(structuredClone(deleted.theme));setDeleted(null);setMessage('已恢复删除的主题。');
  };
  return <section className="dth-studio" aria-label="外观工作室" onKeyDown={event=>{
    if (event.key === 'Escape') {setCompare(false);stopTrial();}
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault(); setHistory(h=>travelHistory(h,event.shiftKey ? 'redo':'undo'));
    }
  }}>
    <header className="dth-studio-header"><div><span className="dth-studio-eyebrow">DESKTOP THEMES / STUDIO</span><h1>让工作台，成为你的作品。</h1><p role="status">{message}</p></div>
      <div className="dth-studio-actions"><button disabled={!history.past.length} onClick={()=>{setCompare(false);setHistory(h=>travelHistory(h,'undo'));}}>撤销</button><button disabled={!history.future.length} onClick={()=>{setCompare(false);setHistory(h=>travelHistory(h,'redo'));}}>重做</button><button aria-pressed={compare} onClick={()=>setCompare(v=>!v)}>{compare ? '返回草稿 B' : '查看基线 A'}</button><button className="dth-studio-primary" disabled={busy||issues.length>0} onClick={()=>save()}>保存并应用</button>{deleted && <button onClick={restoreDeleted}>撤销删除</button>}{props.close && <button onClick={props.close}>返回会话</button>}</div>
    </header>
    <div className="dth-studio-layout">
      <aside className="dth-studio-library"><h2>精选风格</h2><p>从一套完成的设计开始。</p><div className="dth-studio-pack-list">{STYLE_PACKS.map(pack=><button key={pack.id} className="dth-pack-card" aria-pressed={environment.workspace.style===pack.id} onClick={()=>selectPack(pack.id)}><PackThumbnail id={pack.theme}/><span className="dth-pack-copy"><small>{pack.en}</small><strong>{pack.name}</strong><span>{pack.material}</span></span></button>)}</div>
        <details><summary>全部配色 · 六套经典</summary><div className="dth-studio-theme-list">{THEMES.map(theme=><button key={theme.id} onClick={()=>load(theme.id)} aria-label={`编辑 ${theme.name}`}><PackThumbnail id={theme.id}/><strong>{theme.name}</strong></button>)}</div></details>
        <details open={config.customThemes.length>0}><summary>我的主题家族 · {config.customThemes.length}</summary>{config.customThemes.length ? config.customThemes.map(theme=><div className="dth-saved-row" key={theme.id}><button className="dth-studio-saved" onClick={()=>load(theme.id)}><i style={{background:theme.colors.primary}}/>{theme.name}<small>{theme.variant || '自定义'}</small></button><button aria-label={`删除 ${theme.name}`} onClick={()=>deleteTheme(theme)}>×</button></div>) : <p>保存第一套作品，让灵感留下来。</p>}</details>
        <ScheduleControl store={props.store} commit={props.commit}/>
      </aside>
      <main className="dth-studio-canvas"><div className="dth-studio-canvas-heading"><div><span className="dth-studio-eyebrow">LIVE CANVAS</span><h2>{compare ? baseline.name : draft.name}</h2></div><span className="dth-studio-badge">{compare ? 'A · 基线' : 'B · 草稿'}</span></div>
        <div className="dth-preview-tabs" aria-label="预览内容">{([ ['conversation','会话与代码'],['document','长文与表格'],['review','代码评审'],['menu','菜单与状态'] ] as const).map(([id,label])=><button key={id} aria-pressed={sample===id} onClick={()=>setSample(id)}>{label}</button>)}</div><StudioPreview draft={compare ? baseline : draft} config={compare ? baselineEnvironment : environment} sample={sample}/>
        <div className="dth-studio-variants"><span>生成家族变体</span>{(Object.keys(variantLabels) as Variant[]).map(v=><button key={v} onClick={()=>change(makeVariant(draft,v))}>{variantLabels[v]}</button>)}</div>
        <p className="dth-studio-note">预览使用示例会话与代码，不读取你的会话内容。蓝橙变体用于减少红绿依赖，尚未做色觉认证。</p>
        <details className="dth-studio-transfer"><summary>专业格式互通 · 导入 / 导出单主题</summary><h2>把熟悉的配色带进来</h2><div className="dth-studio-actions"><label>格式<select aria-label="格式" value={format} onChange={e=>{setFormat(e.target.value as ThemeFormat);setReport(null);}}>{Object.entries(formatLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>CSS 配色块<select aria-label="CSS 配色块" value={scheme} onChange={e=>setScheme(e.target.value as 'light'|'dark')}><option value="dark">深色 .dark</option><option value="light">浅色 :root</option></select></label>
          <label className="dth-studio-file">选择文件<input type="file" accept=".json,.jsonc,.yaml,.yml,.css,.itermcolors" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;if(file.size>1024*1024){setMessage('文件超过 1 MB');return;}const request=++sequence.current;try {const text=await file.text();if(request!==sequence.current)return;setImportText(text);parse(text);}catch{setMessage('文件读取失败');}}}/></label></div>
          <textarea aria-label="主题导入内容" value={importText} onChange={e=>setImportText(e.target.value)} placeholder="粘贴主题 JSON、Base16 YAML、CSS 或 iTerm 配色…" maxLength={1024*1024}/><div className="dth-studio-actions"><button disabled={!importText.trim()} onClick={()=>parse(importText)}>导入到草稿</button><button onClick={download}>导出当前草稿</button></div>
          {report && <div className="dth-studio-import-report"><strong>核心配色映射 {report.coverage}% · {report.mapped.length}/7</strong>{report.warnings.map((warning,i)=><p key={i}>{warning}</p>)}</div>}
        </details>
        <details className="dth-community-gallery"><summary>精选社区配色 · 离线可用</summary><p>来自 Catppuccin、Nord 与 Rosé Pine 的 Base16 配色，经 DSH 可读性适配。</p><div className="dth-community-grid">{COMMUNITY_THEMES.map(item=><div key={item.id}><button onClick={()=>{stopTrial();setBundle(null);change(structuredClone(item.theme));setMessage(item.adapted?'已载入社区适配配色，部分颜色为可读性做过调整。':'已载入社区适配配色。');}}><span>{Object.values(item.theme.colors).slice(0,5).map((color,i)=><i key={i} style={{background:color}}/>)}</span><strong>{item.theme.name}</strong><small>{item.adapted?'可读性适配':'Base16 适配'}</small></button><a href={item.url} target="_blank" rel="noreferrer">原作与作者 ↗</a></div>)}</div></details><section className="dth-studio-sharing"><h2>从壁纸开始，或把作品带走。</h2><p>本机提取图片色彩，生成经过可读性检查的配色。风格包可携带个人壁纸。</p><div className="dth-studio-actions"><label className="dth-studio-file">从壁纸生成配色<input aria-label="从壁纸生成配色" type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;const request=++sequence.current;setBusy(true);try{const next=await themeFromWallpaper(f,draftPalette(draft).colorScheme==='dark');if(request!==sequence.current)return;stopTrial();const id=newWallpaperId();if(!await putWallpaper(id,f.name,f))throw new Error('壁纸保存失败，配色未应用');if(request!==sequence.current){void deleteWallpaper(id);return;}const url=URL.createObjectURL(f);transientWallpapers.current.set(id,url);setEnvironment({...environment,wallpaper:{...environment.wallpaper,enabled:true,sourceId:id,path:url,name:f.name,opacity:0.32,overlay:0.42,safeArea:'strong'}});change(next);setBundle(null);setMessage('已从壁纸生成配色与阅读安全区。先预览，再保存应用。');}catch(error){setMessage(error instanceof Error?error.message:'图片解析失败');}finally{setBusy(false);}}}/></label><button disabled={busy||issues.length>0} onClick={sharePack}>导出完整风格包</button><button onClick={()=>{try{downloadPreviewCard(draft,environment);setMessage('已生成代表性界面预览卡，不含真实会话。');}catch(e){setMessage(String(e));}}}>导出预览卡 PNG</button><label className="dth-studio-file">导入风格包<input aria-label="导入风格包" type="file" accept=".json" disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void importPack(f);}}/></label></div>{bundle&&<div className="dth-pack-install"><p>{bundle.name} · 配色、排版、材质、氛围{bundle.wallpaper?'、内嵌壁纸':''}</p><button disabled={busy} onClick={installPack}>安装此风格包</button><button onClick={()=>{setBundle(null);setMessage('已取消安装，草稿保留。');}}>取消安装</button></div>}<details><summary>支持范围与隐私</summary><p>预览使用固定样例，不读取真实会话。宿主主题、字体与代码色由官方接口应用；材质和容器造型完整作用于插件界面。终端 ANSI 仅预览与导出。字体文件不随包分发，接收方可在字体设置下载。</p></details></section>
      </main>
      <aside className="dth-studio-inspector"><div className="dth-editor-switch"><button aria-pressed={!professional} onClick={()=>setProfessional(false)}>快速调整</button><button aria-pressed={professional} onClick={()=>setProfessional(true)}>专业编辑</button></div><h2>{professional ? '色彩检查器' : '让环境适合你'}</h2><label>主题名称<input value={draft.name} maxLength={64} onChange={e=>change({...draft,name:e.target.value})}/></label>
        {!professional && <><WorkspaceControls config={environment} onChange={next=>{stopTrial();setEnvironment(next);}}/><label>主强调色<input aria-label="快速主强调色" type="color" value={draft.colors.primary} onChange={e=>change({...draft,colors:{...draft.colors,primary:e.target.value}})}/></label><label>排版<select aria-label="快速排版" value={environment.font.uiPreset} onChange={e=>setEnvironment({...environment,font:{...environment.font,uiPreset:e.target.value}})}><option value="system">系统 · 清晰无衬线</option><option value="lxgw-wenkai">文楷 · 需在字体设置下载</option><option value="noto-sans-sc">思源黑体 · 需系统安装</option><option value="custom">保留自定义字体</option></select></label></>}{professional && <><div className="dth-studio-token-grid">{(Object.keys(labels) as Array<keyof CustomThemeColors>).map(key=><button key={key} aria-pressed={selected===key} onClick={()=>setSelected(key)}><i style={{background:draft.colors[key]}}/><span>{labels[key]}<small>{draft.colors[key]}</small></span></button>)}</div>
        <div className="dth-studio-color"><input aria-label={`${labels[selected]}颜色`} type="color" value={color} onChange={e=>setColor(e.target.value.toUpperCase())}/><code>{color}</code></div>
        {(['l','c','h'] as const).map(key=><label key={key} className="dth-studio-slider">{({l:'感知亮度',c:'彩度',h:'色相'})[key]}<output>{lch[key].toFixed(key==='h'?0:3)}</output><input aria-label={key} type="range" min="0" max={key==='l'?1:key==='c'?0.4:360} step={key==='h'?1:0.001} value={lch[key]} onPointerDown={()=>{gesture.current=true;gestureRecorded.current=false;}} onPointerUp={()=>{gesture.current=false;}} onPointerCancel={()=>{gesture.current=false;}} onBlur={()=>{gesture.current=false;}} onChange={e=>queueColor(oklchToHex({...lch,[key]:Number(e.target.value)}))}/></label>)}
        <p className="dth-studio-note">OKLCH 超出 sRGB 时自动降低彩度，保留色相与亮度。</p>
        <label>七色协调<select value={harmony} onChange={e=>setHarmony(e.target.value as HarmonyKind)}>{HARMONY_KINDS.map(kind=><option key={kind}>{kind}</option>)}</select></label><button onClick={()=>change({...draft,colors:generateHarmony(harmony,draft.colors.primary,draftPalette(draft).colorScheme==='dark')})}>用主强调色生成</button>
        </>}<div className={`dth-studio-readability${issues.length?' is-warning':''}`}><strong>{issues.length ? `${issues.length} 项需要调整` : '可读性检查通过'}</strong><p>检查正文、次级文字、强调色、按钮与状态色。</p>{issues.length>0 && <><ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul><button onClick={()=>change(repairDraft(draft))}>修复可读性</button></>}</div>
        {props.preview && <button disabled={issues.length>0} onClick={trial ? stopTrial : trialDraft}>{trial ? '结束试用并恢复' : '在宿主中试用 20 秒'}</button>}<button disabled={busy||issues.length>0} onClick={()=>save(true)}>另存为新主题</button>
        <p className="dth-studio-message">草稿修改后，点击顶部“保存并应用”。</p>
      </aside>
    </div>
  </section>;
}

function ScheduleControl({store,commit}:StudioProps) {
  const config=useSyncExternalStore(store.subscribe,store.get,store.get);
  const families=[...new Set(config.customThemes.map(theme=>theme.variantOf).filter((family):family is string=>Boolean(family)))].filter(family=>['light','dark'].every(variant=>config.customThemes.some(theme=>theme.variantOf===family && theme.variant===variant)));
  return <details><summary>自动昼夜 · {config.themeSchedule.enabled ? '运行中' : '已暂停'}</summary><p>本地时间 07:00–19:00 使用浅色，其余时间使用深色。先分别保存同一家族的浅色、深色变体。</p><label>主题家族<select value={config.themeSchedule.family} onChange={e=>commit({...store.get(),themeSchedule:{enabled:false,family:e.target.value}})}><option value="">选择家族</option>{families.map(family=><option key={family} value={family}>{config.customThemes.find(theme=>theme.variantOf===family)?.name.replace(/ · .+$/,'') ?? family}</option>)}</select></label><label><input type="checkbox" disabled={!families.includes(config.themeSchedule.family)} checked={config.themeSchedule.enabled} onChange={e=>commit({...store.get(),themeSchedule:{...store.get().themeSchedule,enabled:e.target.checked}})}/>启用自动昼夜</label></details>;
}

export function StudioPreview({draft,config,sample='conversation'}:{draft:CustomThemeConfig;config?:DesktopThemesConfig;sample?:'conversation'|'document'|'review'|'menu'}) {
  const p = draftPalette(draft);
  const syntax = { ...buildSyntaxTokens(p), ...Object.fromEntries(Object.entries(buildCustomThemeDefinition({...draft,id:'custom-preview'}).tokens).filter(([key])=>key.startsWith('--shiki-token-'))) };
  const style = { '--sp-bg':p.bgBase,'--sp-panel':p.bgSurface,'--sp-raised':p.bgSurface2,'--sp-ink':p.textPrimary,'--sp-muted':p.textMuted,'--sp-accent':p.accent,'--sp-accent-ink':p.accentForeground,'--sp-sidebar':p.sidebarFill,'--sp-code':p.codeBlock,'--sp-success':p.success,'--sp-danger':p.danger,'--sp-warm':mixHex('#7EABC7','#D7A677',config?.workspace.warmth ?? 0.5),'--sp-depth':config?.workspace.depth ?? 0.65,'--sp-ui-font':config ? buildUiStack(config.font.uiPreset,config.font.uiCustomFamily):'system-ui','--sp-code-font':config ? buildCodeStack(config.font.codePreset,config.font.codeCustomFamily):'monospace','--sp-font-size':`${config?.font.fontSize ?? 14}px`,'--sp-code-size':`${config?.font.codeFontSize ?? 13}px`,'--sp-line-height':config?.font.lineHeight ?? 1.75,'--sp-wallpaper':config?.wallpaper.enabled && config.wallpaper.path ? `url("${config.wallpaper.path.replace(/["\\\n\r]/g,'')}")`:'none','--sp-wallpaper-opacity':config?.wallpaper.opacity ?? 0.32 } as CSSProperties;
  return <div className="dth-preview-environment" data-material={config?.workspace.style ?? 'paper'} style={style}><div className="dth-studio-preview" aria-label="会话与代码预览">
    <div className="dth-studio-preview-title"><span>◉　HARNESS</span><span>Workspace / Design</span><span>•••</span></div>
    <div className="dth-studio-preview-body"><nav aria-label="示例侧边栏"><strong>工作空间</strong><span className="is-selected">◈　视觉探索</span><span>◇　产品方案</span><span>◇　代码评审</span><small>LOCAL WORKSPACE</small></nav><article>{sample==='document' ? <><small className="dth-document-kicker">DESIGN NOTES / 001</small><h2>在安静的环境里，把复杂的事情想清楚。</h2><p>界面承载着注意力。长篇阅读需要稳定的底色、清楚的段落和恰当的行长。当内容开始增长，信息之间的关系应当依然清晰。</p><blockquote>给重点留出位置，也给思考留出呼吸。</blockquote><h3>本周工作计划</h3><table><thead><tr><th>任务</th><th>状态</th><th>负责人</th></tr></thead><tbody><tr><td>视觉方向</td><td>已完成</td><td>设计</td></tr><tr><td>可读性验收</td><td>进行中</td><td>研发</td></tr><tr><td>发布说明</td><td>待评审</td><td>产品</td></tr></tbody></table><p>中文、English 与 <code>inlineCode()</code> 混排，也需要一致的阅读节奏。滚动后，阅读面保持稳定。</p></> : sample==='review' ? <><h2>workspace.ts <small>+ 3 / − 2</small></h2><pre className="dth-rich-diff"><span>  18  export const workspace = &#123;</span><del>− 19    surface: "flat",</del><del>− 20    effects: "always",</del><ins>+ 19    surface: "layered",</ins><ins>+ 20    effects: "adaptive",</ins><ins>+ 21    reading: "opaque",</ins><span>  22  &#125;;</span></pre><p>变更行使用标记条、增删符号与色彩共同表达，阅读时装饰自动收敛。</p></> : sample==='menu' ? <><h2>每一种状态，都清楚可见。</h2><div className="dth-sample-menu"><strong>工作空间</strong><span>新建会话 <kbd>Ctrl N</kbd></span><span className="is-selected">外观工作室 <kbd>↵</kbd></span><span>导出风格包</span></div><p style={{color:p.success}}>✓ 保存成功 · 配置已更新</p><p style={{color:p.danger}}>! 网络不可用 · 请重试</p><p>键盘焦点、选中状态与提示文字共同建立方向感。</p></> : <><div className="dth-studio-sample-user">让界面安静一点，让重点更清楚。</div><strong>层次来自明度，个性来自点缀。</strong><p>用中性表面承载内容，让强调色只出现在值得关注的地方。长时间阅读，也能保持舒适。</p><pre><code><span style={{color:syntax['--shiki-token-comment']}}>// Make space for your ideas.</span>{'\n'}<span style={{color:syntax['--shiki-token-keyword']}}>const </span>theme = {'{'}{'\n'}　name: <span style={{color:syntax['--shiki-token-string']}}>"{draft.name}"</span>,{'\n'}　focus: <span style={{color:syntax['--shiki-token-constant']}}>true</span>{'\n'}{'};'}</code></pre><div className="dth-studio-diff"><span>−　background: previous</span><span>+　background: intentional</span></div><div className="dth-studio-composer"><span>继续探索你的想法…</span><button tabIndex={-1} aria-label="预览发送按钮">↑</button></div></>}</article></div>
    <div className="dth-studio-terminal"><code>❯ theme preview <span>✓ ready</span></code><div aria-label="终端 ANSI 色板">{ansiFor(draft).map((color,i)=><i key={i} title={`ANSI ${i} · ${color} · ${contrastRatio(color,p.bgBase).toFixed(2)}:1`} style={{background:color}}/>)}</div></div>
  </div></div>;
}
