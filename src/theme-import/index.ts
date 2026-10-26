import type { CustomThemeConfig } from '../config/types.ts';
import { hexToRgb, hslToHex, relativeLuminance } from '../utils/color.ts';
import { hexToOklch, oklchToHex } from '../studio/oklch.ts';
import { draftFromTheme, draftPalette } from '../studio/model.ts';
import { buildSyntaxTokens } from '../themes/palette.ts';
import { getTheme } from '../themes/index.ts';

export type ThemeFormat = 'vscode' | 'base16' | 'base24' | 'iterm' | 'shadcn' | 'dsh';
export interface ThemeImport { theme: CustomThemeConfig; coverage: number; mapped: string[]; warnings: string[] }
const object = (v: unknown): Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const ansiKeys = ['black','red','green','yellow','blue','magenta','cyan','white','brightBlack','brightRed','brightGreen','brightYellow','brightBlue','brightMagenta','brightCyan','brightWhite'];

export function parseColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (/^#?[0-9a-f]{6}$/i.test(s)) return '#' + s.replace('#','').toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + s.slice(1).split('').map(c=>c+c).join('').toUpperCase();
  // Flatten alpha over the matching source surface would require full source
  // semantics. Do not silently interpret transparent UI colors as opaque.
  const ok = s.match(/^oklch\(\s*([\d.]+)(%)?\s+([\d.]+)\s+([\d.-]+)(?:deg)?\s*\)$/i);
  if (ok) {
    const l=Number(ok[1])/(ok[2] ? 100 : 1), c=Number(ok[3]), h=Number(ok[4]);
    if (![l,c,h].every(Number.isFinite) || l<0 || l>1 || c<0) return undefined;
    return oklchToHex({l,c,h});
  }
  const hsl = s.match(/^(?:hsl\()?\s*([\d.-]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)?$/i);
  if (hsl && [Number(hsl[1]),Number(hsl[2]),Number(hsl[3])].every(Number.isFinite)) return hslToHex(Number(hsl[1]), Number(hsl[2])/100, Number(hsl[3])/100).toUpperCase();
  return undefined;
}

/** JSONC comments/trailing commas, without changing quoted strings. */
export function parseJsonc(text: string): unknown {
  let out = '', quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i+1];
    if (quoted) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') { quoted = true; out += c; }
    else if (c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; }
    else if (c === '/' && next === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i+1] === '/')) i++; i++; }
    else if (c === ',') { let j = i+1; while (/\s/.test(text[j] ?? '') && j < text.length) j++; if (!['}',']'].includes(text[j])) out += c; }
    else out += c;
  }
  return JSON.parse(out);
}

export function importTheme(text: string, format: ThemeFormat, name = 'Imported theme', scheme: 'light' | 'dark' = 'dark'): ThemeImport {
  if (text.length > 1024*1024) throw new Error('主题文件超过 1 MB');
  const mapped = new Set<string>();
  const warnings: string[] = [];
  let background: string | undefined;
  let values: Record<string, unknown> = {};
  let syntax: Record<string,string> = {};
  let states: Record<string,string> = {};
  let ansi: string[] = [];
  let title = name;
  let family = '', variant = '';
  let nativeBase = '', nativeSource = '';
  if (format === 'vscode') {
    const source = object(parseJsonc(text));
    if (source.include) warnings.push('include 外部文件未加载，请导入完整主题');
    const colors = object(source.colors);
    if (source.type === 'light') scheme = 'light';
    if (typeof source.name === 'string') title = source.name;
    values = { background: colors['editor.background'], panel: colors['sideBar.background'] ?? colors['panel.background'], text: colors['editor.foreground'], primary: colors['button.background'] ?? colors['focusBorder'], accent: colors['textLink.foreground'], glow: colors['focusBorder'], particle: colors['terminal.ansiBlue'] };
    const scopes: Record<string,string> = { comment: 'comment', string: 'string', keyword: 'keyword', constant: 'constant', 'entity.name.function': 'function', 'variable.parameter': 'parameter', punctuation: 'punctuation' };
    for (const rule of Array.isArray(source.tokenColors) ? source.tokenColors : []) {
      const color = parseColor(object(rule.settings).foreground);
      if (!color) continue;
      const scope = Array.isArray(rule.scope) ? rule.scope.join(',') : String(rule.scope ?? '');
      for (const [prefix,key] of Object.entries(scopes)) if (scope.split(',').some((s: string) => s.trim() === prefix || s.trim().startsWith(prefix+'.'))) syntax[key] = color;
    }
    ansi = ansiKeys.map(key => parseColor(colors['terminal.ansi'+key[0].toUpperCase()+key.slice(1)]) ?? '');
    states = Object.fromEntries(Object.entries({success:colors['testing.iconPassed'] ?? ansi[2], warning:colors['editorWarning.foreground'] ?? ansi[3], danger:colors['errorForeground'] ?? ansi[1]}).map(([key,value])=>[key,parseColor(value)]).filter((entry):entry is [string,string]=>Boolean(entry[1])));
  } else if (format === 'base16' || format === 'base24') {
    let source: Record<string,any>;
    try { source = object(parseJsonc(text)); }
    catch {
      source = {};
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*(base[0-9a-f]{2}|scheme|name)\s*:\s*["']?([^"'\r\n]+?)["']?\s*(?:\s+#.*)?$/i);
        if (match) source[match[1]] = match[2].trim();
      }
    }
    if (typeof (source.name ?? source.scheme) === 'string') title = source.name ?? source.scheme;
    const p = object(source.palette ?? source);
    values = { background: p.base00, panel: p.base01, text: p.base05, primary: p.base0D, accent: p.base0E, glow: p.base0D, particle: p.base0C };
    for (const [key,index] of Object.entries({ comment: '03', string: '0B', keyword: '0E', constant: '09', function: '0D', parameter: '08', punctuation: '05' })) {
      const color = parseColor(p['base'+index]); if (color) syntax[key] = color;
    }
    ansi = ['00','08','0B','0A','0D','0E','0C','05','03','08','0B','0A','0D','0E','0C','07'].map(index=>parseColor(p['base'+index]) ?? '');
    if (format === 'base24') ['12','0B','13','14','15','16','17'].forEach((index,i)=>{ ansi[i+9] = parseColor(p['base'+index]) ?? ansi[i+9]; });
    states = Object.fromEntries([['success',parseColor(p.base0B)],['warning',parseColor(p.base0A)],['danger',parseColor(p.base08)]].filter((entry):entry is [string,string]=>Boolean(entry[1])));
  } else if (format === 'shadcn') {
    const blocks = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const selector = scheme === 'dark' ? /(?:^|[\s,])\.dark\b/ : /:root/;
    const block = blocks.find(match=>selector.test(match[1]));
    if (!block) throw new Error(`找不到 ${scheme === 'dark' ? '.dark' : ':root'} 配色块`);
    const css: Record<string,string> = {};
    for (const match of block[2].matchAll(/--([\w-]+)\s*:\s*([^;{}]+);?/g)) css[match[1]] = match[2].trim();
    values = { background: css.background, panel: css.card ?? css.sidebar, text: css.foreground, primary: css.primary, accent: css.ring, glow: css.ring, particle: css['chart-1'] ?? css.primary };
    const danger=parseColor(css.destructive);if(danger)states.danger=danger;
  } else if (format === 'iterm') {
    // Read only RGB numeric dictionaries. No XML parser, entity resolution,
    // external resource loading or execution of plist content.
    const colors: Record<string,string> = {};
    for (const match of text.matchAll(/<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g)) {
      const channels = ['Red','Green','Blue'].map(channel => {
        const m = match[2].match(new RegExp('<key>'+channel+' Component<\\/key>\\s*<(?:real|integer)>([\\d.eE+-]+)<\\/(?:real|integer)>'));
        return m ? Number(m[1]) : NaN;
      });
      if (channels.every(v=>Number.isFinite(v) && v >= 0 && v <= 1)) colors[match[1]] = '#'+channels.map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('').toUpperCase();
    }
    values = { background: colors['Background Color'], panel: colors['Background Color'], text: colors['Foreground Color'], primary: colors['Ansi 4 Color'], accent: colors['Ansi 5 Color'], glow: colors['Ansi 4 Color'], particle: colors['Ansi 6 Color'] };
    ansi = Array.from({length:16},(_,i)=>colors[`Ansi ${i} Color`] ?? '');
    states=Object.fromEntries([['success',ansi[2]],['warning',ansi[3]],['danger',ansi[1]]].filter((entry):entry is [string,string]=>Boolean(entry[1])));
  } else {
    const source = object(parseJsonc(text));
    const theme = object(source.theme ?? source);
    values = object(theme.colors);
    if (typeof theme.name === 'string') title = theme.name;
    if (typeof theme.variantOf === 'string') family = theme.variantOf.slice(0,64);
    if (typeof theme.variant === 'string') variant = theme.variant.slice(0,32);
    if (typeof theme.base === 'string' && getTheme(theme.base)) nativeBase = theme.base;
    if (typeof theme.source === 'string') nativeSource = theme.source.slice(0,64);
    if (typeof theme.base === 'string' && ['mint-breeze','sakura-mist'].includes(theme.base)) scheme = 'light';
    syntax = Object.fromEntries(Object.entries(object(theme.syntax)).filter(([,v])=>parseColor(v)).map(([k,v])=>[k,parseColor(v)!]));
    ansi = Array.isArray(theme.ansi) ? theme.ansi.map((v: unknown)=>parseColor(v) ?? '') : [];
    states=Object.fromEntries(Object.entries(object(theme.states)).filter(([key,value])=>['success','warning','danger'].includes(key)&&parseColor(value)).map(([key,value])=>[key,parseColor(value)!]));
  }
  background = parseColor(values.background);
  if (!background) throw new Error('未找到有效背景色，请检查主题格式');
  if (format !== 'shadcn') scheme = relativeLuminance(background) > 0.4 ? 'light' : 'dark';
  const base = nativeBase || (scheme === 'light' ? 'mint-breeze' : 'quantum-blue');
  const theme = draftFromTheme(base, []);
  theme.name = title.slice(0,64);
  theme.source = nativeSource || format;
  theme.variantOf = family;
  theme.variant = variant;
  for (const key of Object.keys(theme.colors) as Array<keyof typeof theme.colors>) {
    const color = parseColor(values[key]);
    if (color) { theme.colors[key] = color; mapped.add(key); }
  }
  theme.syntax = syntax;
  theme.states = states;
  const fallbackAnsi = ansiFor(theme);
  theme.ansi = Array.from({length:16}, (_,i)=>ansi[i] || fallbackAnsi[i]);
  const missing = Object.keys(theme.colors).filter(key=>!mapped.has(key));
  if (missing.length) warnings.push('以下颜色使用语义回退：'+missing.join(', '));
  warnings.push('导入色将经过可读性检查；终端色保留用于预览与导出，当前未联动宿主终端。');
  return { theme, coverage: Math.round(mapped.size/7*100), mapped: [...mapped], warnings };
}

export function ansiFor(theme: CustomThemeConfig): string[] {
  const p = draftPalette(theme);
  const basic = [p.bgBase,p.danger,p.success,p.warning,p.accent,'#C5ABF2','#73BFC4',p.textPrimary,p.textMuted,p.danger,p.success,p.warning,p.accent,'#D8BFF5','#9CDBDE',p.textPrimary];
  return basic.map((color,i)=>parseColor(theme.ansi?.[i]) ?? color);
}
export function exportTheme(theme: CustomThemeConfig, format: ThemeFormat): { text: string; extension: string } {
  const p = draftPalette(theme), ansi = ansiFor(theme);
  const syntax = { ...buildSyntaxTokens(p), ...Object.fromEntries(Object.entries(theme.syntax ?? {}).map(([key,value])=>['--shiki-token-'+key,value])) };
  if (format === 'dsh') return { text: JSON.stringify({ format: 'dsh-theme', version: 1, theme },null,2), extension: 'json' };
  if (format === 'vscode') {
    const colors: Record<string,string> = { 'editor.background': p.bgBase, 'editor.foreground': p.textPrimary, 'sideBar.background': p.bgSurface, 'button.background': p.accent, 'focusBorder': p.glow, 'textLink.foreground': theme.colors.accent, 'testing.iconPassed':p.success, 'editorWarning.foreground':p.warning, 'errorForeground':p.danger };
    ansiKeys.forEach((key,i)=>{ colors['terminal.ansi'+key[0].toUpperCase()+key.slice(1)] = ansi[i]; });
    return { text: JSON.stringify({ name: theme.name, type: p.colorScheme, colors, tokenColors: Object.entries({ comment:'comment',string:'string',keyword:'keyword',constant:'constant',function:'entity.name.function',parameter:'variable.parameter',punctuation:'punctuation' }).map(([key,scope])=>({scope, settings:{foreground: syntax['--shiki-token-'+key]}})) },null,2), extension:'json' };
  }
  if (format === 'shadcn') {
    const css = { background:p.bgBase, foreground:p.textPrimary, card:p.bgSurface, 'card-foreground':p.textPrimary, primary:p.accent, 'primary-foreground':p.accentForeground, ring:theme.colors.accent, border:p.bgSurface3, muted:p.bgSurface2, 'muted-foreground':p.textMuted, destructive:p.danger };
    return { text: `${p.colorScheme === 'dark' ? '.dark' : ':root'} {\n` + Object.entries(css).map(([key,value])=>{const c=hexToOklch(value);return `  --${key}: oklch(${c.l.toFixed(5)} ${c.c.toFixed(5)} ${c.h.toFixed(3)});`;}).join('\n')+'\n}', extension:'css' };
  }
  if (format === 'iterm') {
    const colors = { 'Background Color':p.bgBase, 'Foreground Color':p.textPrimary, ...Object.fromEntries(ansi.map((v,i)=>[`Ansi ${i} Color`,v])) };
    return { text: '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>\n'+Object.entries(colors).map(([key,value])=>{const c=hexToRgb(value);return `<key>${key}</key><dict>`+[['Red',c.r],['Green',c.g],['Blue',c.b]].map(([channel,v])=>`<key>${channel} Component</key><real>${Number(v)/255}</real>`).join('')+'</dict>';}).join('\n')+'\n</dict></plist>', extension:'itermcolors' };
  }
  const palette = [p.bgBase,p.bgSurface,p.bgSurface2,p.textMuted,p.textSecondary,p.textPrimary,p.textPrimary,p.textPrimary,p.danger,p.warning,p.warning,p.success,theme.colors.particle,p.accent,theme.colors.accent,p.danger];
  if (format === 'base24') palette.push(ansi[0],ansi[7],...ansi.slice(9,15));
  return { text: JSON.stringify({ system:format, name:theme.name, palette:Object.fromEntries(palette.map((v,i)=>['base'+i.toString(16).toUpperCase().padStart(2,'0'),v])) },null,2), extension:'json' };
}
