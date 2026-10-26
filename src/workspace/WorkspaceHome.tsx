import { useEffect, useState } from 'react';
import type { DesktopThemesConfig, WorkspaceConfig } from '../config/types.ts';
import { STYLE_PACKS, MODES, AMBIENCES, applyStylePack, applyWorkspace } from './recipes.ts';
import { draftFromTheme } from '../studio/model.ts';
import { resolvePalette } from '../themes/index.ts';
import paperPreview from '../assets/previews/mint-breeze.png';
import mineralPreview from '../assets/previews/quantum-blue.png';
import nocturnePreview from '../assets/previews/obsidian-gold.png';

export function PackThumbnail({id}:{id:string}) {
  const preview=({'mint-breeze':paperPreview,'quantum-blue':mineralPreview,'obsidian-gold':nocturnePreview} as Record<string,string>)[id];
  if(preview)return <span className="dth-pack-thumbnail is-captured"><img src={preview} alt="" loading="lazy"/></span>;
  const p=resolvePalette(id,[])!;
  return <span className="dth-pack-thumbnail" style={{background:`radial-gradient(ellipse at 0 0,${p.accent}38,transparent 65%),${p.bgBase}`,color:p.textPrimary}} aria-hidden="true"><span className="dth-pack-window" style={{background:p.bgSurface,borderColor:p.textMuted+'40'}}><span className="dth-pack-rail" style={{background:p.sidebarFill}}><i style={{background:p.accent}}/><i/><i/></span><span className="dth-pack-page"><b style={{background:p.accent}}/><i/><i/><span style={{background:p.codeBlock}}><em style={{background:p.accent}}/><em style={{background:p.success}}/></span><strong style={{background:p.bgSurface2}}/></span></span></span>;
}

export function WorkspaceControls({config,onChange}:{config:DesktopThemesConfig;onChange:(next:DesktopThemesConfig)=>void}) {
  const choose=(patch:Partial<WorkspaceConfig>)=>onChange(applyWorkspace(config,patch));
  return <div className="dth-workspace-controls"><fieldset><legend>工作模式</legend><div className="dth-choice-row">{MODES.map(m=><button key={m.id} aria-pressed={config.workspace.mode===m.id} onClick={()=>choose({mode:m.id})}>{m.name}</button>)}</div></fieldset><fieldset><legend>氛围</legend><div className="dth-choice-row">{AMBIENCES.map(m=><button key={m.id} aria-pressed={config.workspace.ambience===m.id} onClick={()=>choose({ambience:m.id})}>{m.name}</button>)}</div></fieldset><label>环境冷暖<input aria-label="环境冷暖" type="range" min="0" max="1" step="0.01" value={config.workspace.warmth} onChange={e=>onChange({...config,workspace:{...config.workspace,warmth:Number(e.target.value)}})}/></label><label>空间层次<input aria-label="空间层次" type="range" min="0" max="1" step="0.01" value={config.workspace.depth} onChange={e=>onChange({...config,workspace:{...config.workspace,depth:Number(e.target.value)}})}/></label><p className="dth-workspace-hint">工作模式保留配色。专注与评审自动收敛装饰，阅读面保持实心。</p></div>;
}

export function WorkspaceHome({config,commit,openStudio,preview,cancelPreview}:{config:DesktopThemesConfig;commit:(c:DesktopThemesConfig)=>void;openStudio?:()=>void;preview:(c:DesktopThemesConfig)=>void;cancelPreview:()=>void}) {
  useEffect(()=>()=>cancelPreview(),[cancelPreview]);
  const [undo,setUndo]=useState<DesktopThemesConfig|null>(null);
  const [message,setMessage]=useState('选择成品风格，或从你喜欢的配色继续。');
  const apply=(id:WorkspaceConfig['style'])=>{setUndo(structuredClone(config));commit(applyStylePack(config,id));setMessage('风格已应用。模式、字体家族、个人壁纸与伙伴偏好保留。');};
  return <section className="dth-environment-home"><div className="dth-environment-intro"><span>WORKSPACE COLLECTION / 01—03</span><h2>为每天的工作，留一个喜欢的环境。</h2><p>三套完整风格，独立的工作模式，恰到好处的氛围。</p></div><div className="dth-pack-grid">{STYLE_PACKS.map(pack=><button className="dth-pack-card" key={pack.id} aria-pressed={config.workspace.style===pack.id && draftFromTheme(config.theme,config.customThemes).base===pack.theme} onClick={()=>apply(pack.id)} onKeyDown={e=>{if(e.code==='Space'){e.preventDefault();if(!e.repeat)preview(applyStylePack(config,pack.id));}if(e.key==='Escape')cancelPreview();}} onKeyUp={e=>{if(e.code==='Space')cancelPreview();}} onBlur={cancelPreview}><PackThumbnail id={pack.theme}/><span className="dth-pack-copy"><small>{pack.en}</small><strong>{pack.name}</strong><span>{pack.description}</span><em>{pack.material}</em></span></button>)}</div><WorkspaceControls config={config} onChange={next=>{setUndo(structuredClone(config));commit(next);}}/><div className="dth-choice-row"><button onClick={openStudio} disabled={!openStudio}>进入工作室 · 壁纸灵感 / 编辑 / 分享 ↗</button>{undo&&<button onClick={()=>{cancelPreview();commit(undo);setUndo(null);setMessage('已恢复上一次外观。');}}>撤销上次调整</button>}</div><p role="status">{message}</p><details><summary>风格包会改变什么</summary><p>配色、内置壁纸配方、材质、空间层次、字号与氛围。字体家族与个人壁纸保留；工作室可导出完整风格包。</p><p>宿主通过主题 token 改变表面与代码配色；纹理、容器造型和毛玻璃完整作用于插件界面。ANSI 色板仅预览与导出。</p></details></section>;
}
