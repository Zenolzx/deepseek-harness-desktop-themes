import type { DesktopThemesConfig, WorkspaceConfig } from '../config/types.ts';
import { switchTheme } from '../themes/switch.ts';
import { resolvePalette } from '../themes/index.ts';
import { rgba, mixHex } from '../utils/color.ts';

export const STYLE_PACKS = [
  { id: 'paper', name: '纸感工作室', en: 'Paper Atelier', theme: 'mint-breeze', description: '暖纸、陶土与墨色，为长篇阅读留白。', material: '细纸纹 · 暖白阅读面', font: '系统无衬线 / JetBrains Mono' },
  { id: 'mineral', name: '矿物工作台', en: 'Mineral Desk', theme: 'quantum-blue', description: '雾蓝与冷灰，工具清晰，内容沉静。', material: '磨砂 · 冷灰工具面', font: '系统无衬线 / JetBrains Mono' },
  { id: 'nocturne', name: '夜幕工作室', en: 'Nocturne', theme: 'obsidian-gold', description: '炭黑与琥珀，让环境光停留在边缘。', material: '局部光照 · 炭黑阅读面', font: '系统无衬线 / JetBrains Mono' },
] as const;
export const MODES = [{id:'create',name:'创作'}, {id:'focus',name:'专注'}, {id:'review',name:'评审'}, {id:'present',name:'演示'}] as const;
export const AMBIENCES = [{id:'quiet',name:'安静'}, {id:'balanced',name:'平衡'}, {id:'immersive',name:'沉浸'}] as const;

/** Work modes never switch palette, assets, font families or companion preference. */
export function applyWorkspace(config: DesktopThemesConfig, patch: Partial<WorkspaceConfig>): DesktopThemesConfig {
  const workspace = { ...config.workspace, ...patch };
  const immersive = workspace.ambience === 'immersive' && workspace.mode !== 'focus' && workspace.mode !== 'review';
  const present = workspace.mode === 'present';
  return {
    ...config, scene: '', workspace,
    appearance: { ...config.appearance, contentStyle:'refined', contentWidth: present || workspace.mode==='review' ? 'wide' : workspace.mode==='focus' ? 'compact' : 'standard', windowOpacity:immersive ? 0.94 : 1, sidebarOpacity:immersive ? 0.94 : 1, panelOpacity:1, inputOpacity:1, diffTint:workspace.mode==='review' ? 1 : 0.65 },
    font: { ...config.font, fontSize:present ? 17 : 14, codeFontSize:present ? 15 : 13, lineHeight:workspace.style==='paper' ? 1.75 : 1.6 },
    wallpaper:{ ...config.wallpaper, opacity:workspace.ambience==='quiet' ? 0.12 : immersive ? 0.62 : 0.32, overlay:immersive ? 0.32 : 0.42, safeArea:'strong' },
    glass:{ ...config.glass, enabled:immersive, blurLevel:immersive ? 'light':'off', panelOpacity:0.96 },
    effects:{ ...config.effects, enabled:immersive, preset:immersive ? workspace.style==='nocturne' ? 'gold-dust':'breathing' : 'none', density:immersive ? 'low':'off', particleCount:0, particleOpacity:0.16, connectLines:false, cursorGlow:false, parallax:false, glowIntensity:immersive ? 'soft':'off', animationSpeed:immersive ? 'gentle':'still' },
  };
}

export function applyStylePack(config: DesktopThemesConfig, id: WorkspaceConfig['style']): DesktopThemesConfig {
  const pack = STYLE_PACKS.find(p=>p.id===id)!;
  const next = switchTheme(config, pack.theme, 'ambience');
  return applyWorkspace({ ...next, themeSchedule:{...next.themeSchedule,enabled:false} }, {style:id, warmth:id==='paper' ? 0.7 : id==='mineral' ? 0.22 : 0.6, depth:0.65});
}

/** Static ambient paint; no host DOM guesses or full-screen animated overlay. */
export function buildWorkspaceCss(config: DesktopThemesConfig): string {
  const p = resolvePalette(config.theme,config.customThemes);
  if(!p)return '';
  const w=config.workspace;
  const intensity = w.ambience==='quiet' || w.mode==='focus' || w.mode==='review' ? 0.045 : w.ambience==='immersive' ? 0.16 : 0.095;
  const light = rgba(p.accent,intensity);
  const warm = rgba(mixHex('#7EABC7','#D7A677',w.warmth), intensity);
  const texture = w.style==='paper' ? `repeating-linear-gradient(115deg,${rgba(p.textPrimary,0.016)} 0 1px,transparent 1px 5px),` : '';
  return `:root,body{--dth-solid-base:${p.bgBase};--dth-solid-panel:${p.bgSurface};--dth-environment:radial-gradient(ellipse at 8% 0%,${warm},transparent 48%),radial-gradient(ellipse at 95% 18%,${light},transparent 48%);--dth-material:${texture}linear-gradient(130deg,${rgba(p.bgSurface,0.98)},${rgba(p.bgBase,0.97)});--dth-depth:${w.depth};--dth-pack-accent:${p.accent};}
html{background-color:${p.bgBase};}
body{background-image:var(--dth-environment);background-attachment:fixed;}
.dth-panel{background-color:var(--dth-solid-base);background-image:var(--dth-environment);}
.dth-content{background:var(--dth-material);}
.dth-topbar,.dth-subnav{background:var(--dth-solid-base);}
.dth-studio{background-image:var(--dth-environment);}
.dth-section,.dth-studio-inspector{box-shadow:0 ${Math.round(6*w.depth)}px ${Math.round(32*w.depth)}px ${rgba(p.textPrimary,0.035)};}
${w.mode==='focus'||w.mode==='review'?'.dth-pet{visibility:hidden}':''}
@media(prefers-reduced-transparency:reduce){body,.dth-panel,.dth-studio{background-image:none}.dth-studio-preview{background:${p.bgBase}}}`;
}
