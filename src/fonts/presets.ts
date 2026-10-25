/**
 * Font preset registry: the fonts selectable through the settings UI.
 *
 * Two things make a preset work on a real machine:
 *
 * 1. **Family aliases.** A font has one family name per locale. LXGW WenKai
 *    registers as `霞鹜文楷` on a Chinese Windows and as `LXGW WenKai` on an
 *    English one, so a stack that only names the English family silently falls
 *    back on the majority of this plugin's users. Every preset therefore
 *    carries the localized, English and Nerd-Font spellings, and the built
 *    stack places all of them before the generic fallbacks.
 * 2. **Optional webfont downloads.** When a preset has a `download`, the
 *    settings UI can install the font into the plugin itself (IndexedDB +
 *    FontFace), which works even when the OS has never seen the font and does
 *    not depend on the localized family name at all.
 *
 * The plugin still bundles no font files; downloads are explicit, one font at
 * a time, from the upstream project or its Fontsource mirror.
 */

export type FontCategory = 'ui' | 'code';

/** A font file that can be installed into the plugin on demand. */
export interface FontDownload {
  /** Stable resource id (may be shared by two presets of the same file). */
  id: string;
  url: string;
  fileName: string;
  /** Exact byte size, used for progress and the pre-download hint. */
  sizeBytes: number;
  /** CSS `font-weight` descriptor for the generated `FontFace`. */
  weight: string;
  format: 'woff2';
  license: string;
  licenseUrl: string;
  homepage: string;
  /** Where the bytes are served from (shown in the UI). */
  source: string;
}

export interface FontPreset {
  /** Stable key stored in the config. */
  key: string;
  /** Display label (the font's own name; "system" entries are translated). */
  label: string;
  /** Primary CSS family name ('' = platform default). */
  family: string;
  /** Localized / Nerd-Font / legacy family spellings, in priority order. */
  aliases: readonly string[];
  /** Extra fallbacks placed after the primary family and its aliases. */
  fallbacks: readonly string[];
  /** Present when the font can be installed into the plugin. */
  download?: FontDownload;
}

export const UI_FALLBACKS: readonly string[] = [
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'Microsoft YaHei UI',
  'PingFang SC',
  'Noto Sans SC',
  'sans-serif',
] as const;

export const CODE_FALLBACKS: readonly string[] = [
  'JetBrains Mono',
  'Maple Mono',
  'Cascadia Code',
  'SFMono-Regular',
  'Consolas',
  'Menlo',
  'PingFang SC',
  'Microsoft YaHei',
  'monospace',
] as const;

const SYSTEM_MONO_FALLBACKS: readonly string[] = [
  'ui-monospace',
  'SFMono-Regular',
  'Cascadia Code',
  'Consolas',
  'Menlo',
  'PingFang SC',
  'Microsoft YaHei',
  'monospace',
] as const;

const OFL = 'OFL-1.1';
const OFL_URL = 'https://openfontlicense.org/open-font-license-official-text/';

/**
 * Single-file webfonts served by jsDelivr (CORS-enabled, versioned). The
 * Fontsource packages win for Latin code fonts because each weight is one
 * small woff2; the Maple release repository carries a 131 KB variable woff2.
 */
const DOWNLOAD_LXGW_WENKAI: FontDownload = {
  id: 'lxgw-wenkai',
  url: 'https://cdn.jsdelivr.net/npm/@fontsource/lxgw-wenkai@5.3.0/files/lxgw-wenkai-latin-500-normal.woff2',
  fileName: 'lxgw-wenkai-500.woff2',
  sizeBytes: 7231496,
  weight: '400 600',
  format: 'woff2',
  license: OFL,
  licenseUrl: OFL_URL,
  homepage: 'https://github.com/lxgw/LxgwWenKai',
  source: 'Fontsource · LXGW WenKai 5.3.0',
};

const DOWNLOAD_MAPLE_MONO: FontDownload = {
  id: 'maple-mono',
  url: 'https://cdn.jsdelivr.net/gh/subframe7536/maple-font@v7.9/woff2/var/MapleMono%5Bwght%5D-VF.woff2',
  fileName: 'maple-mono-vf.woff2',
  sizeBytes: 130908,
  weight: '100 900',
  format: 'woff2',
  license: OFL,
  licenseUrl: OFL_URL,
  homepage: 'https://github.com/subframe7536/maple-font',
  source: 'Maple Mono v7.9 · variable woff2',
};

const DOWNLOAD_JETBRAINS_MONO: FontDownload = {
  id: 'jetbrains-mono',
  url: 'https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@latest/files/jetbrains-mono-latin-400-normal.woff2',
  fileName: 'jetbrains-mono-400.woff2',
  sizeBytes: 21168,
  weight: '400',
  format: 'woff2',
  license: OFL,
  licenseUrl: OFL_URL,
  homepage: 'https://github.com/JetBrains/JetBrainsMono',
  source: 'Fontsource · JetBrains Mono',
};

const DOWNLOAD_CASCADIA: FontDownload = {
  id: 'cascadia-code',
  url: 'https://cdn.jsdelivr.net/npm/@fontsource/cascadia-code@latest/files/cascadia-code-latin-400-normal.woff2',
  fileName: 'cascadia-code-400.woff2',
  sizeBytes: 29452,
  weight: '400',
  format: 'woff2',
  license: OFL,
  licenseUrl: OFL_URL,
  homepage: 'https://github.com/microsoft/cascadia-code',
  source: 'Fontsource · Cascadia Code',
};

const DOWNLOAD_FIRA: FontDownload = {
  id: 'fira-code',
  url: 'https://cdn.jsdelivr.net/npm/@fontsource/fira-code@latest/files/fira-code-latin-400-normal.woff2',
  fileName: 'fira-code-400.woff2',
  sizeBytes: 23312,
  weight: '400',
  format: 'woff2',
  license: OFL,
  licenseUrl: OFL_URL,
  homepage: 'https://github.com/tonsky/FiraCode',
  source: 'Fontsource · Fira Code',
};

const DOWNLOAD_SOURCE_CODE: FontDownload = {
  id: 'source-code-pro',
  url: 'https://cdn.jsdelivr.net/npm/@fontsource/source-code-pro@latest/files/source-code-pro-latin-400-normal.woff2',
  fileName: 'source-code-pro-400.woff2',
  sizeBytes: 11656,
  weight: '400',
  format: 'woff2',
  license: OFL,
  licenseUrl: OFL_URL,
  homepage: 'https://github.com/adobe-fonts/source-code-pro',
  source: 'Fontsource · Source Code Pro',
};

const DOWNLOAD_IBM_PLEX: FontDownload = {
  id: 'ibm-plex-mono',
  url: 'https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@latest/files/ibm-plex-mono-latin-400-normal.woff2',
  fileName: 'ibm-plex-mono-400.woff2',
  sizeBytes: 14708,
  weight: '400',
  format: 'woff2',
  license: OFL,
  licenseUrl: OFL_URL,
  homepage: 'https://github.com/IBM/plex',
  source: 'Fontsource · IBM Plex Mono',
};

export const UI_FONT_PRESETS: readonly FontPreset[] = [
  { key: 'system', label: 'System Default', family: '', aliases: [], fallbacks: UI_FALLBACKS },
  {
    key: 'lxgw-wenkai',
    label: 'LXGW WenKai',
    family: 'LXGW WenKai',
    aliases: ['霞鹜文楷', 'LXGW WenKai GB', '霞鹜文楷 GB', 'LXGW WenKai Screen', '霞鹜文楷 Screen'],
    fallbacks: UI_FALLBACKS,
    download: DOWNLOAD_LXGW_WENKAI,
  },
  {
    key: 'maple-ui',
    label: 'Maple UI',
    family: 'Maple Mono',
    aliases: ['Maple UI', 'Maple Mono NF CN', 'Maple Mono NF', 'Maple Mono CN'],
    fallbacks: UI_FALLBACKS,
    download: DOWNLOAD_MAPLE_MONO,
  },
  { key: 'misans', label: 'MiSans', family: 'MiSans', aliases: ['MiSans VF', 'MiSans Normal'], fallbacks: UI_FALLBACKS },
  {
    key: 'harmonyos-sans',
    label: 'HarmonyOS Sans SC',
    family: 'HarmonyOS Sans SC',
    aliases: ['HarmonyOS Sans', 'HarmonyOS Sans SC Regular'],
    fallbacks: UI_FALLBACKS,
  },
  {
    key: 'noto-sans-sc',
    label: 'Noto Sans SC',
    family: 'Noto Sans SC',
    aliases: ['Noto Sans CJK SC', 'Source Han Sans SC', '思源黑体'],
    fallbacks: UI_FALLBACKS,
  },
  {
    key: 'ms-yahei-ui',
    label: 'Microsoft YaHei UI',
    family: 'Microsoft YaHei UI',
    aliases: ['微软雅黑 UI', 'Microsoft YaHei', '微软雅黑'],
    fallbacks: UI_FALLBACKS,
  },
  { key: 'pingfang-sc', label: 'PingFang SC', family: 'PingFang SC', aliases: ['苹方-简', 'PingFang HK', 'PingFang TC'], fallbacks: UI_FALLBACKS },
  { key: 'kaiti', label: 'KaiTi (楷体)', family: 'KaiTi', aliases: ['楷体', 'KaiTi_GB2312', 'STKaiti', '华文楷体'], fallbacks: UI_FALLBACKS },
] as const;

export const CODE_FONT_PRESETS: readonly FontPreset[] = [
  {
    key: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: 'JetBrains Mono',
    aliases: ['JetBrains Mono NL', 'JetBrainsMono Nerd Font', 'JetBrains Mono Nerd Font'],
    fallbacks: CODE_FALLBACKS,
    download: DOWNLOAD_JETBRAINS_MONO,
  },
  {
    key: 'maple-mono',
    label: 'Maple Mono',
    family: 'Maple Mono',
    aliases: ['Maple Mono NF CN', 'Maple Mono NF', 'Maple Mono CN', 'Maple Mono Normal NF CN'],
    fallbacks: CODE_FALLBACKS,
    download: DOWNLOAD_MAPLE_MONO,
  },
  {
    key: 'cascadia-code',
    label: 'Cascadia Code',
    family: 'Cascadia Code',
    aliases: ['Cascadia Code NF', 'Cascadia Mono', 'Cascadia Code PL'],
    fallbacks: CODE_FALLBACKS,
    download: DOWNLOAD_CASCADIA,
  },
  {
    key: 'fira-code',
    label: 'Fira Code',
    family: 'Fira Code',
    aliases: ['FiraCode Nerd Font', 'Fira Code Retina', 'Fira Code Light'],
    fallbacks: CODE_FALLBACKS,
    download: DOWNLOAD_FIRA,
  },
  {
    key: 'source-code-pro',
    label: 'Source Code Pro',
    family: 'Source Code Pro',
    aliases: ['Source Code Pro NF', 'SourceCodePro'],
    fallbacks: CODE_FALLBACKS,
    download: DOWNLOAD_SOURCE_CODE,
  },
  {
    key: 'ibm-plex-mono',
    label: 'IBM Plex Mono',
    family: 'IBM Plex Mono',
    aliases: ['IBM Plex Mono Text', 'IBMPlexMono'],
    fallbacks: CODE_FALLBACKS,
    download: DOWNLOAD_IBM_PLEX,
  },
  { key: 'consolas', label: 'Consolas', family: 'Consolas', aliases: [], fallbacks: CODE_FALLBACKS },
  { key: 'system-mono', label: 'System Monospace', family: '', aliases: [], fallbacks: SYSTEM_MONO_FALLBACKS },
] as const;

export const CUSTOM_PRESET_KEY = 'custom';

export function getUiPreset(key: string): FontPreset | undefined {
  return UI_FONT_PRESETS.find((p) => p.key === key);
}

export function getCodePreset(key: string): FontPreset | undefined {
  return CODE_FONT_PRESETS.find((p) => p.key === key);
}

/** The preset family a download installs ('' when the id is unknown). */
export function familyForDownload(id: string): string {
  for (const preset of [...UI_FONT_PRESETS, ...CODE_FONT_PRESETS]) {
    if (preset.download?.id === id) return preset.family;
  }
  return '';
}

/** Human label for a download resource id. */
export function labelForDownload(id: string): string {
  for (const preset of [...UI_FONT_PRESETS, ...CODE_FONT_PRESETS]) {
    if (preset.download?.id === id) return preset.label;
  }
  return id;
}

/** Every downloadable font, de-duplicated by resource id. */
export function listDownloads(): readonly FontDownload[] {
  const byId = new Map<string, FontDownload>();
  for (const preset of [...UI_FONT_PRESETS, ...CODE_FONT_PRESETS]) {
    if (preset.download !== undefined && !byId.has(preset.download.id)) {
      byId.set(preset.download.id, preset.download);
    }
  }
  return [...byId.values()];
}

/** Resolve the primary family for a UI font selection. */
export function resolveUiFamily(presetKey: string, customFamily: string): string {
  if (presetKey === CUSTOM_PRESET_KEY) return customFamily.trim();
  return getUiPreset(presetKey)?.family ?? '';
}

/** Resolve the primary family for a code font selection. */
export function resolveCodeFamily(presetKey: string, customFamily: string): string {
  if (presetKey === CUSTOM_PRESET_KEY) return customFamily.trim();
  return getCodePreset(presetKey)?.family ?? '';
}

/** Wrap a font name in quotes when it contains anything but plain identifiers. */
export function quoteFont(name: string): string {
  return /^[a-zA-Z0-9-]+$/.test(name) ? name : `"${name}"`;
}

/** Primary family followed by every alias, deduplicated case-insensitively. */
export function presetFamilies(preset: FontPreset | undefined, primary: string): string[] {
  const families: string[] = [];
  const push = (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    if (families.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) return;
    families.push(trimmed);
  };
  push(primary);
  for (const alias of preset?.aliases ?? []) push(alias);
  return families;
}

function buildStack(families: readonly string[], fallbacks: readonly string[]): string {
  const parts: string[] = [];
  const push = (name: string) => {
    const quoted = quoteFont(name);
    if (parts.some((existing) => existing.toLowerCase() === quoted.toLowerCase())) return;
    parts.push(quoted);
  };
  for (const family of families) push(family);
  for (const fallback of fallbacks) push(fallback);
  return parts.join(', ');
}

/** UI font-family stack (primary + aliases + safe fallbacks). */
export function buildUiStack(presetKey: string, customFamily: string): string {
  const primary = resolveUiFamily(presetKey, customFamily);
  const preset = getUiPreset(presetKey);
  return buildStack(presetFamilies(preset, primary), preset?.fallbacks ?? UI_FALLBACKS);
}

/** Code font-family stack. */
export function buildCodeStack(presetKey: string, customFamily: string): string {
  const primary = resolveCodeFamily(presetKey, customFamily);
  const preset = getCodePreset(presetKey);
  return buildStack(presetFamilies(preset, primary), preset?.fallbacks ?? CODE_FALLBACKS);
}

/** Preview text (mixed Chinese/English/code) for font cards. */
export const FONT_PREVIEW_TEXT = 'DeepSeek Harness · 你好，世界';
export const CODE_PREVIEW_TEXT = 'const answer = await model.generate();';

let measureCanvas: HTMLCanvasElement | null = null;
const availabilityCache = new Map<string, boolean>();

/** Measure a probe string under a given `font` shorthand (cached canvas). */
function measureWidth(font: string): number {
  if (typeof document === 'undefined' || !document.body) return -1;
  if (measureCanvas === null) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (ctx === null) return -1;
  ctx.font = font;
  return ctx.measureText(FONT_PROBE).width;
}

/** A probe string whose glyph widths differ sharply between fonts. */
const FONT_PROBE = 'MmmmIIIIllll0123456789 汉字测试';

function familyAvailable(name: string): boolean {
  const clean = name.replace(/"/g, '').trim();
  if (clean.length === 0) return true;
  const base = measureWidth('20px monospace');
  const withFont = measureWidth(`20px "${clean}", monospace`);
  if (base < 0) return true;
  return Math.abs(withFont - base) > 0.5;
}

/**
 * Best-effort installed check via canvas width comparison. Every alias is
 * probed, because the browser may expose only the localized family name
 * (`霞鹜文楷`) where the preset's canonical name is English (`LXGW WenKai`).
 * `document.fonts.check` is deliberately avoided because it can report false
 * positives for absent system families.
 */
export function isFontAvailable(family: string, aliases: readonly string[] = []): boolean {
  if (family.trim().length === 0) return true;
  if (typeof document === 'undefined') return true;
  const names = [family, ...aliases].map((name) => name.trim()).filter((name) => name.length > 0);
  const key = names.join('|');
  const cached = availabilityCache.get(key);
  if (cached !== undefined) return cached;
  let available = false;
  try {
    available = names.some((name) => familyAvailable(name));
  } catch {
    available = true;
  }
  availabilityCache.set(key, available);
  return available;
}

/** Drop cached availability after a download/removal. */
export function invalidateFontAvailability(): void {
  availabilityCache.clear();
}

/** True when a preset can be installed into the plugin. */
export function isDownloadablePreset(presetKey: string): boolean {
  return getUiPreset(presetKey)?.download !== undefined || getCodePreset(presetKey)?.download !== undefined;
}
