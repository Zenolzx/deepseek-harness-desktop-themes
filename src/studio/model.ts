import type { CustomThemeConfig, CustomThemeColors } from '../config/types.ts';
import { getTheme, resolvePalette } from '../themes/index.ts';
import type { ThemePalette } from '../themes/palette.ts';
import { auditPalette } from '../themes/contrast.ts';
import { contrastRatio, adjustLightness, readableOn } from '../utils/color.ts';
import { generateHarmony } from '../custom-theme/colors.ts';

export function colorsFromPalette(p: ThemePalette): CustomThemeColors {
  return { primary: p.accent, accent: p.glow, background: p.bgBase, panel: p.bgSurface, text: p.textPrimary, particle: p.particleColors[0] ?? p.accent, glow: p.glow };
}
export function draftFromTheme(id: string, customs: CustomThemeConfig[]): CustomThemeConfig {
  const custom = customs.find(t => t.id === id);
  const p = resolvePalette(id, customs) ?? getTheme('quantum-blue')!.palette;
  return custom ? structuredClone(custom) : { id: '', name: `${getTheme(id)?.name ?? 'Theme'} Studio`, base: id, colors: colorsFromPalette(p) };
}
export function draftPalette(draft: CustomThemeConfig): ThemePalette {
  return resolvePalette('custom-studio-preview', [{ ...draft, id: 'custom-studio-preview' }])!;
}
export function draftIssues(draft: CustomThemeConfig): string[] {
  const p = draftPalette(draft);
  return auditPalette(p).issues.map(i => `${i.label} ${i.ratio.toFixed(2)}:1 / ${i.required}:1`);
}
/** Repair against the actual derived surfaces, not only the two input colors. */
export function repairDraft(draft: CustomThemeConfig): CustomThemeConfig {
  let next = structuredClone(draft);
  for (let i = 0; i < 60; i++) {
    const issues = auditPalette(draftPalette(next)).issues;
    if (issues.length === 0) break;
    const dark = draftPalette(next).colorScheme === 'dark';
    if (issues.some(issue => issue.id.startsWith('primary.'))) next.colors.text = adjustLightness(next.colors.text, dark ? 0.025 : -0.025);
    if (issues.some(issue => issue.id.startsWith('accent.'))) next.colors.primary = adjustLightness(next.colors.primary, dark ? 0.025 : -0.025);
    for (const key of ['success','warning','danger'] as const) {
      if (issues.some(issue=>issue.id.startsWith(key+'.'))) {
        const current=draftPalette(next)[key];
        next.states={...next.states,[key]:adjustLightness(current,dark?0.025:-0.025)};
      }
    }
  }
  return next;
}
export type Variant = 'light' | 'dark' | 'high-contrast' | 'colorblind' | 'oled' | 'paper';
export function makeVariant(draft: CustomThemeConfig, variant: Variant): CustomThemeConfig {
  const dark = !['light','paper'].includes(variant);
  const colors = generateHarmony(variant === 'high-contrast' ? 'high-contrast' : 'muted', draft.colors.primary, dark);
  if (variant === 'oled') { colors.background = '#000000'; colors.panel = '#101012'; }
  if (variant === 'paper') { colors.background = '#F4F1EB'; colors.panel = '#FFFDFA'; }
  if (variant === 'colorblind') { colors.primary = '#73B8F0'; colors.accent = '#E5B26D'; colors.particle = '#73B8F0'; colors.glow = '#73B8F0'; }
  return repairDraft({ ...draft, id: '', name: `${draft.name.replace(/ · .+$/, '')} · ${variant}`, base: dark ? 'quantum-blue' : 'mint-breeze', colors, syntax: {}, ansi: [], states: {},
    variantOf: draft.variantOf || draft.id || draft.name, variant, source: 'studio' });
}

export interface History<T> { past: T[]; present: T; future: T[] }
export function pushHistory<T>(state: History<T>, value: T): History<T> {
  if (JSON.stringify(state.present) === JSON.stringify(value)) return state;
  return { past: [...state.past, state.present].slice(-20), present: value, future: [] };
}
export function travelHistory<T>(state: History<T>, direction: 'undo' | 'redo'): History<T> {
  if (direction === 'undo') {
    if (!state.past.length) return state;
    return { past: state.past.slice(0,-1), present: state.past[state.past.length-1], future: [state.present, ...state.future].slice(0,20) };
  }
  if (!state.future.length) return state;
  return { past: [...state.past,state.present].slice(-20), present: state.future[0], future: state.future.slice(1) };
}
export function readableSyntax(color: string, background: string): string {
  return contrastRatio(color, background) >= 4.5 ? color : readableOn(background, '#111113', '#FFFFFF');
}
