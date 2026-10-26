/**
 * The desktop-themes settings section: a five-group navigation (appearance /
 * ambience / typography / companion / advanced), a searchable, autosaving
 * toolbar, and reversible theme switching. All state reads go through the
 * injected reactive store (`useSyncExternalStore`); all writes go through
 * `commit`, which applies live and persists (debounced) through the settings
 * scope. Previews go through `preview`/`cancelPreview`, which never persist.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import type {
  CustomThemeColors,
  CustomThemeConfig,
  DesktopThemesConfig,
  ThemeId,
  VoiceStyle,
  WallpaperSafeArea,
} from '../config/types.ts';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_EFFECTS,
  DEFAULT_FONT,
  DEFAULT_GLASS,
  DEFAULT_PET,
  DEFAULT_WALLPAPER,
  RECOMMENDED_OPACITY,
  createDefaultConfig,
} from '../config/defaults.ts';
import { downloadConfigJson, parseImportedConfig } from '../config/transfer.ts';
import { THEMES, resolvePalette, type DesktopTheme } from '../themes/index.ts';
import type { ThemePalette } from '../themes/palette.ts';
import { auditPalette, describeContrast, type ThemeContrastReport } from '../themes/contrast.ts';
import { WALLPAPER_EXTENSIONS } from '../appearance/wallpaper.ts';
import { effectiveContentStyle } from '../appearance/content.ts';
import { applyScene } from '../scenes/presets.ts';
import { WorkspaceHome } from '../workspace/WorkspaceHome.tsx';
import {
  CODE_FONT_PRESETS,
  UI_FONT_PRESETS,
  CUSTOM_PRESET_KEY,
  CODE_PREVIEW_TEXT,
  FONT_PREVIEW_TEXT,
  buildCodeStack,
  buildUiStack,
  isFontAvailable,
  type FontPreset,
} from '../fonts/presets.ts';
import { FontInstallError, fontsRevision, installFont, installedFontIds, removeInstalledFont, subscribeFonts } from '../fonts/runtime.ts';

import type { Store } from '../utils/store.ts';
import {
  Button,
  ColorSwatches,
  FontCard,
  Notice,
  Section,
  Segmented,
  Select,
  Slider,
  SpeechLinesEditor,
  Swatch,
  ThemeCard,
  Toggle,
  SettingsResetContext,
  UiTextContext,
  type ThemeCardModel,
} from './controls.tsx';
import { VOICE_STYLE_IDS } from '../pet/speech.ts';
import { ContentPreview, GlassPreview, GlowPreview, LiveFontPreview, ParticlesPreview, TransparencyPreview } from './EffectPreview.tsx';
import { detectLang, makeTranslator, type I18nKey, type Lang, type Translate } from './i18n.ts';
import { PLUGIN_BUILD_ID, PLUGIN_VERSION } from '../build-info.ts';
import { builtinWallpaperThumbnail, switchTheme, type ThemeSwitchMode } from '../client/theme-presets.ts';

export type WallpaperPickResult = { ok: true } | { ok: false; reason: string };

/** Business face injected by the client `apply` and merged into props. */
export interface SettingsFace {
  openStudio?: () => void;
  store: Store<DesktopThemesConfig>;
  saveNotifier: Store<{ saving: boolean; saved: boolean; failed: boolean }>;
  saveNow: () => Promise<boolean>;
  commit: (next: DesktopThemesConfig) => void;
  /** Apply a live preview without persisting it (theme card Space gesture). */
  preview: (next: DesktopThemesConfig) => void;
  /** Roll back the last {@link preview}. */
  cancelPreview: () => void;
  chooseWallpaper: (file: File) => Promise<WallpaperPickResult>;
  clearWallpaper: () => void;
  restoreWallpaper: (id: string) => Promise<boolean>;
  listRecentWallpapers: () => Promise<Array<{ id: string; name: string }>>;
}

interface SettingsPanelProps extends SettingsFace {
  close?: () => void;
}

type GroupId = 'appearance' | 'ambience' | 'font' | 'pet' | 'advanced';
type SectionId =
  | 'scenes'
  | 'theme'
  | 'font'
  | 'wallpaper'
  | 'pet'
  | 'light'
  | 'particles'
  | 'glass'
  | 'custom'
  | 'performance'
  | 'transfer'
  | 'about';

interface NavGroup {
  id: GroupId;
  key: I18nKey;
  hint: I18nKey;
  sections: ReadonlyArray<{ id: SectionId; key: I18nKey }>;
}

const NAV: readonly NavGroup[] = [
  {
    id: 'appearance',
    key: 'nav.group.appearance',
    hint: 'nav.group.appearance.hint',
    sections: [
      { id: 'scenes', key: 'sub.scenes' },
      { id: 'theme', key: 'sub.theme' },
      { id: 'wallpaper', key: 'sub.wallpaper' },


    ],
  },
  {
    id: 'ambience',
    key: 'nav.group.ambience',
    hint: 'nav.group.ambience.hint',
    sections: [
      { id: 'light', key: 'sub.light' },
      { id: 'particles', key: 'sub.particles' },
      { id: 'glass', key: 'sub.glass' },
      { id: 'performance', key: 'sub.performance' },
    ],
  },
  {
    id: 'font',
    key: 'nav.group.font',
    hint: 'nav.group.font.hint',
    sections: [{ id: 'font', key: 'nav.font' }],
  },
  {
    id: 'pet',
    key: 'nav.group.pet',
    hint: 'nav.group.pet.hint',
    sections: [{ id: 'pet', key: 'nav.pet' }],
  },
  {
    id: 'advanced',
    key: 'nav.group.advanced',
    hint: 'nav.group.advanced.hint',
    sections: [
      { id: 'transfer', key: 'sub.transfer' },
      { id: 'about', key: 'sub.about' },
    ],
  },
];

const FIT_OPTIONS = ['cover', 'contain', 'stretch', 'center', 'tile'] as const;
const SAFE_AREA_OPTIONS: readonly WallpaperSafeArea[] = ['off', 'balanced', 'strong'];
const BLUR_OPTIONS = ['off', 'light', 'standard', 'strong'] as const;
const GLOW_OPTIONS = ['off', 'soft', 'standard', 'bright'] as const;
const DENSITY_OPTIONS = ['off', 'low', 'medium', 'high'] as const;
const SPEED_OPTIONS = ['still', 'gentle', 'standard', 'active'] as const;
const PERFORMANCE_OPTIONS = ['power-saver', 'balanced', 'quality'] as const;
const PRESET_OPTIONS = ['none', 'tech-data', 'starfield', 'aurora-flow', 'fireflies', 'bubbles', 'sakura', 'gold-dust', 'breathing', 'custom'] as const;

const PRESET_SWATCHES = ['#3D7EFF', '#22D3EE', '#8B5CF6', '#14B8A6', '#FF7A59', '#C9A962', '#F472B6'];

/** Controls that the settings search can jump to directly. */
const SEARCH_INDEX: ReadonlyArray<{ id?: string; key: I18nKey; group: GroupId; section: SectionId }> = [
  { key: 'scene.title', group: 'appearance', section: 'scenes' },
  { key: 'theme.title', group: 'appearance', section: 'theme' },
  { key: 'nav.wallpaper', group: 'appearance', section: 'wallpaper' },
  { key: 'wallpaper.opacity', id: 'dth-wp-opacity', group: 'appearance', section: 'wallpaper' },
  { key: 'wallpaper.blur', id: 'dth-wp-blur', group: 'appearance', section: 'wallpaper' },
  { key: 'wallpaper.safeArea', id: 'dth-wp-safe', group: 'appearance', section: 'wallpaper' },
  { key: 'transparency.enabled', id: 'dth-tr-enabled', group: 'ambience', section: 'glass' },
  { key: 'transparency.window', id: 'dth-tr-window', group: 'ambience', section: 'glass' },
  { key: 'glass.blurLevel', id: 'dth-glass-blur', group: 'ambience', section: 'glass' },

  { key: 'light.glowIntensity', id: 'dth-light-intensity', group: 'ambience', section: 'light' },
  { key: 'particles.enabled', id: 'dth-p-enabled', group: 'ambience', section: 'particles' },
  { key: 'particles.density', id: 'dth-p-density', group: 'ambience', section: 'particles' },
  { key: 'particles.preset', id: 'dth-p-preset', group: 'ambience', section: 'particles' },
  { key: 'performance.level', id: 'dth-perf-level', group: 'ambience', section: 'performance' },
  { key: 'performance.animationSpeed', id: 'dth-perf-speed', group: 'ambience', section: 'performance' },
  { key: 'font.fontSize', id: 'dth-font-size', group: 'font', section: 'font' },
  { key: 'font.codeFontSize', id: 'dth-font-code-size', group: 'font', section: 'font' },
  { key: 'font.lineHeight', id: 'dth-font-lh', group: 'font', section: 'font' },
  { key: 'font.fontWeight', id: 'dth-font-weight', group: 'font', section: 'font' },
  { key: 'pet.size', id: 'dth-pet-size', group: 'pet', section: 'pet' },
  { key: 'pet.voice', id: 'dth-pet-voice', group: 'pet', section: 'pet' },
  { key: 'transfer.title', group: 'advanced', section: 'transfer' },
  { key: 'about.readability', group: 'advanced', section: 'about' },
];

function themeNameKey(id: string): I18nKey {
  return `theme.name.${id}` as I18nKey;
}

function themeDescKey(id: string): I18nKey {
  return `theme.desc.${id}` as I18nKey;
}

function tagKey(tag: string): I18nKey {
  return `theme.tag.${tag.toLowerCase()}` as I18nKey;
}

function builtinCardModel(t: Translate, theme: DesktopTheme): ThemeCardModel {
  const p = theme.palette;
  return {
    id: theme.id,
    name: t(themeNameKey(theme.id)),
    description: t(themeDescKey(theme.id)),
    tag: t(tagKey(theme.tag)),
    wallpaper: builtinWallpaperThumbnail(theme.id as ThemeId),
    readability: auditPalette(p).grade,
    colors: { bg: p.bgBase, panel: p.bgSurface, text: p.textPrimary, accent: p.accent, particles: p.particleColors },
  };
}

function customCardModel(theme: CustomThemeConfig, customThemes: CustomThemeConfig[], t: Translate): ThemeCardModel {
  const palette = resolvePalette(theme.id, customThemes);
  const p = palette ?? resolvePalette(theme.base) ?? THEMES[0].palette;
  return {
    id: theme.id,
    name: theme.name,
    description: `${t('theme.tag.custom')} · ${t(themeNameKey(theme.base))}`,
    tag: t('theme.tag.custom'),
    readability: auditPalette(p).grade,
    colors: { bg: p.bgBase, panel: p.bgSurface, text: p.textPrimary, accent: p.accent, particles: p.particleColors },
  };
}

function colorsFromPalette(p: ThemePalette): CustomThemeColors {
  return {
    primary: p.accent,
    accent: p.glow,
    background: p.bgBase,
    panel: p.bgSurface,
    text: p.textPrimary,
    particle: p.particleColors[0] ?? p.accent,
    glow: p.glow,
  };
}

type ThemeSnapshot = Pick<DesktopThemesConfig, 'scene' | 'theme' | 'font' | 'wallpaper' | 'appearance' | 'glass' | 'effects'>;

function snapshotTheme(config: DesktopThemesConfig): ThemeSnapshot {
  return {
    scene: config.scene,
    theme: config.theme,
    font: { ...config.font },
    wallpaper: { ...config.wallpaper },
    appearance: { ...config.appearance },
    glass: { ...config.glass },
    effects: { ...config.effects },
  };
}

interface ThemeUndo {
  key: number;
  name: string;
  before: ThemeSnapshot;
}

/** Roving tablist keyboard behaviour shared by the group nav and sub-nav. */
function handleTabArrow<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  order: readonly T[],
  current: T,
  select: (id: T) => void,
  idPrefix: string,
): void {
  const index = order.indexOf(current);
  if (index < 0) return;
  let next: number | null = null;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % order.length;
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + order.length) % order.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = order.length - 1;
  if (next === null) return;
  event.preventDefault();
  const id = order[next];
  select(id);
  requestAnimationFrame(() => document.getElementById(`${idPrefix}${id}`)?.focus());
}

export function SettingsPanel(props: SettingsPanelProps) {
  const config = useSyncExternalStore(props.store.subscribe, props.store.get);
  const saveState = useSyncExternalStore(props.saveNotifier.subscribe, props.saveNotifier.get);
  const [group, setGroup] = useState<GroupId>('appearance');
  const [section, setSection] = useState<SectionId>('scenes');
  const [query, setQuery] = useState('');
  const [undo, setUndo] = useState<ThemeUndo | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ kind: 'theme' | 'scene'; id: string } | null>(null);
  const [switchMode, setSwitchMode] = useState<ThemeSwitchMode>('palette');
  const [lang] = useState<Lang>(() => detectLang());
  const t = makeTranslator(lang);
  const commit = props.commit;
  const previewBaseRef = useRef<DesktopThemesConfig | null>(null);

  const update = useCallback((next: DesktopThemesConfig) => commit(next), [commit]);
  const groupDef = NAV.find((item) => item.id === group) ?? NAV[0];
  const sectionKeys = groupDef.sections.map((item) => item.id);

  const selectGroup = useCallback((id: GroupId) => {
    setGroup(id);
    const next = NAV.find((item) => item.id === id);
    if (next !== undefined) setSection(next.sections[0].id);
  }, []);

  useEffect(() => {
    if (!groupDef.sections.some((item) => item.id === section)) setSection(groupDef.sections[0].id);
  }, [groupDef, section]);

  useEffect(() => {
    if (undo === null) return;
    const timer = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(timer);
  }, [undo]);

  const themeName = useCallback((id: string): string => {
    const custom = config.customThemes.find((item) => item.id === id);
    return custom !== undefined ? custom.name : t(themeNameKey(id));
  }, [config.customThemes, t]);

  const endPreview = useCallback(() => {
    if (previewBaseRef.current === null) return;
    previewBaseRef.current = null;
    setPreviewTarget(null);
    props.cancelPreview();
  }, [props.cancelPreview]);

  const startPreview = useCallback((kind: 'theme' | 'scene', id: string) => {
    if (previewBaseRef.current !== null) endPreview();
    const base = props.store.get();
    previewBaseRef.current = base;
    setPreviewTarget({ kind, id });
    props.preview(kind === 'scene' ? applyScene(base, id) : switchTheme(base, id, switchMode));
  }, [endPreview, props.store, props.preview, switchMode]);

  const commitTheme = useCallback((id: string, mode: ThemeSwitchMode = switchMode) => {
    const base = previewBaseRef.current ?? props.store.get();
    const next = { ...switchTheme(base, id, mode), scene: '' };
    previewBaseRef.current = null;
    setPreviewTarget(null);
    update(next);
    setUndo({ key: Date.now(), name: themeName(id), before: snapshotTheme(base) });
  }, [update, props.store, switchMode, themeName]);


  // Esc cancels a held preview even if focus moved off the card.
  useEffect(() => {
    if (previewTarget === null) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        endPreview();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Unmounting must never leave a preview applied. Avoid setState here (the
      // component may already be gone); the ref tells us whether a preview is
      // still live.
      if (previewBaseRef.current !== null) {
        previewBaseRef.current = null;
        props.cancelPreview();
      }
    };
  }, [previewTarget, endPreview, props.cancelPreview]);

  // Leaving the section that owns the preview must not strand it on screen.
  useEffect(() => {
    if (previewTarget?.kind === 'theme' && section !== 'theme') endPreview();
    if (previewTarget?.kind === 'scene' && section !== 'scenes') endPreview();
  }, [section, previewTarget, endPreview]);

  const undoTheme = () => {
    if (undo === null) return;
    update({ ...config, ...undo.before });
    setUndo(null);
  };

  const resetHandlers = useMemo(() => {
    const r: Record<string, () => void> = {};
    const setFont = (patch: Partial<typeof config.font>) => update({ ...config, font: { ...config.font, ...patch } });
    const setWp = (patch: Partial<typeof config.wallpaper>) => update({ ...config, wallpaper: { ...config.wallpaper, ...patch } });
    const setAppearance = (patch: Partial<typeof config.appearance>) => update({ ...config, appearance: { ...config.appearance, ...patch } });
    const setGlass = (patch: Partial<typeof config.glass>) => update({ ...config, glass: { ...config.glass, ...patch } });
    const setEffects = (patch: Partial<typeof config.effects>) => update({ ...config, effects: { ...config.effects, ...patch } });
    const setPet = (patch: Partial<typeof config.pet>) => update({ ...config, pet: { ...config.pet, ...patch } });

    r['dth-font-size'] = () => setFont({ fontSize: DEFAULT_FONT.fontSize });
    r['dth-font-code-size'] = () => setFont({ codeFontSize: DEFAULT_FONT.codeFontSize });
    r['dth-font-lh'] = () => setFont({ lineHeight: DEFAULT_FONT.lineHeight });
    r['dth-font-weight'] = () => setFont({ fontWeight: DEFAULT_FONT.fontWeight });
    r['dth-font-ligatures'] = () => setFont({ ligatures: DEFAULT_FONT.ligatures });
    r['dth-font-smoothing'] = () => setFont({ smoothing: DEFAULT_FONT.smoothing });

    r['dth-wp-enabled'] = () => setWp({ enabled: DEFAULT_WALLPAPER.enabled });
    r['dth-wp-fit'] = () => setWp({ fit: DEFAULT_WALLPAPER.fit });
    r['dth-wp-x'] = () => setWp({ positionX: DEFAULT_WALLPAPER.positionX });
    r['dth-wp-y'] = () => setWp({ positionY: DEFAULT_WALLPAPER.positionY });
    r['dth-wp-fx'] = () => setWp({ focusX: DEFAULT_WALLPAPER.focusX });
    r['dth-wp-fy'] = () => setWp({ focusY: DEFAULT_WALLPAPER.focusY });
    r['dth-wp-safe'] = () => setWp({ safeArea: DEFAULT_WALLPAPER.safeArea });
    r['dth-wp-scale'] = () => setWp({ scale: DEFAULT_WALLPAPER.scale });
    r['dth-wp-opacity'] = () => setWp({ opacity: DEFAULT_WALLPAPER.opacity });
    r['dth-wp-blur'] = () => setWp({ blur: DEFAULT_WALLPAPER.blur });
    r['dth-wp-overlay'] = () => setWp({ overlay: DEFAULT_WALLPAPER.overlay });
    r['dth-wp-sat'] = () => setWp({ saturation: DEFAULT_WALLPAPER.saturation });
    r['dth-wp-bright'] = () => setWp({ brightness: DEFAULT_WALLPAPER.brightness });
    r['dth-wp-tint'] = () => setWp({ tintEnabled: DEFAULT_WALLPAPER.tintEnabled });
    r['dth-wp-tint-strength'] = () => setWp({ tintStrength: DEFAULT_WALLPAPER.tintStrength });

    r['dth-tr-enabled'] = () => setAppearance({ transparencyEnabled: DEFAULT_APPEARANCE.transparencyEnabled });
    r['dth-tr-window'] = () => setAppearance({ windowOpacity: DEFAULT_APPEARANCE.windowOpacity });
    r['dth-tr-sidebar'] = () => setAppearance({ sidebarOpacity: DEFAULT_APPEARANCE.sidebarOpacity });
    r['dth-tr-panel'] = () => setAppearance({ panelOpacity: DEFAULT_APPEARANCE.panelOpacity });
    r['dth-tr-input'] = () => setAppearance({ inputOpacity: DEFAULT_APPEARANCE.inputOpacity });
    r['dth-content-style'] = () => setAppearance({ contentStyle: DEFAULT_APPEARANCE.contentStyle });
    r['dth-content-tint'] = () => setAppearance({ diffTint: DEFAULT_APPEARANCE.diffTint });
    r['dth-glass-enabled'] = () => setGlass({ enabled: DEFAULT_GLASS.enabled });
    r['dth-glass-blur'] = () => setGlass({ blurLevel: DEFAULT_GLASS.blurLevel });
    r['dth-glass-strength'] = () => setGlass({ strength: DEFAULT_GLASS.strength });
    r['dth-glass-sat'] = () => setGlass({ saturation: DEFAULT_GLASS.saturation });
    r['dth-glass-opacity'] = () => setGlass({ panelOpacity: DEFAULT_GLASS.panelOpacity });
    r['dth-glass-border'] = () => setGlass({ borderHighlight: DEFAULT_GLASS.borderHighlight });
    r['dth-glass-shadow'] = () => setGlass({ shadow: DEFAULT_GLASS.shadow });

    r['dth-light-intensity'] = () => setEffects({ glowIntensity: DEFAULT_EFFECTS.glowIntensity });
    r['dth-light-cursor'] = () => setEffects({ cursorGlow: DEFAULT_EFFECTS.cursorGlow });
    r['dth-light-parallax'] = () => setEffects({ parallax: DEFAULT_EFFECTS.parallax });
    r['dth-p-enabled'] = () => setEffects({ enabled: DEFAULT_EFFECTS.enabled });
    r['dth-p-preset'] = () => setEffects({ preset: DEFAULT_EFFECTS.preset });
    r['dth-p-density'] = () => setEffects({ density: DEFAULT_EFFECTS.density });
    r['dth-p-count'] = () => setEffects({ particleCount: DEFAULT_EFFECTS.particleCount });
    r['dth-p-size'] = () => setEffects({ particleSize: DEFAULT_EFFECTS.particleSize });
    r['dth-p-speed'] = () => setEffects({ particleSpeed: DEFAULT_EFFECTS.particleSpeed });
    r['dth-p-opacity'] = () => setEffects({ particleOpacity: DEFAULT_EFFECTS.particleOpacity });
    r['dth-p-connect'] = () => setEffects({ connectLines: DEFAULT_EFFECTS.connectLines });
    r['dth-p-mouse'] = () => setEffects({ mouseInteraction: DEFAULT_EFFECTS.mouseInteraction });
    r['dth-p-auto'] = () => setEffects({ autoThemeColors: DEFAULT_EFFECTS.autoThemeColors });

    r['dth-perf-level'] = () => update({ ...config, performance: { level: 'balanced' } });
    r['dth-perf-speed'] = () => setEffects({ animationSpeed: DEFAULT_EFFECTS.animationSpeed });

    r['dth-pet-enabled'] = () => setPet({ enabled: DEFAULT_PET.enabled });
    r['dth-pet-size'] = () => setPet({ size: DEFAULT_PET.size });
    r['dth-pet-animations'] = () => setPet({ animations: DEFAULT_PET.animations });
    r['dth-pet-speech'] = () => setPet({ speech: DEFAULT_PET.speech });
    r['dth-pet-lines'] = () => setPet({ speechLines: [...DEFAULT_PET.speechLines] });
    r['dth-pet-voice'] = () => setPet({ voiceEnabled: DEFAULT_PET.voiceEnabled });
    r['dth-pet-voice-style'] = () => setPet({ voiceStyle: DEFAULT_PET.voiceStyle });
    return r;
  }, [config, update]);

  const uiText = useMemo(
    () => ({ on: t('common.on'), off: t('common.off'), reset: t('common.reset') }),
    [t],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (normalizedQuery.length === 0) return [];
    return SEARCH_INDEX.filter((entry) => {
      const haystack = `${t(entry.key)} ${t(groupLabelKey(entry.group))} ${t(sectionLabelKey(entry.section))}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    }).slice(0, 8);
  }, [normalizedQuery, t]);

  const gotoResult = (entry: (typeof SEARCH_INDEX)[number]) => {
    setGroup(entry.group);
    setSection(entry.section);
    setQuery('');
    const id = entry.id;
    if (id === undefined) return;
    setTimeout(() => {
      const element = document.getElementById(id);
      if (element === null) return;
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element.classList.add('is-highlight');
      setTimeout(() => element.classList.remove('is-highlight'), 1600);
    }, 40);
  };

  const statusText = saveState.saving
    ? t('common.saving')
    : saveState.failed
      ? t('common.saveFailed')
      : saveState.saved
        ? t('common.saved')
        : t('common.autosave');

  return (
    <UiTextContext.Provider value={uiText}>
      <SettingsResetContext.Provider value={resetHandlers}>
        <div className="dth-panel" data-dth-animations={config.appearance.animationsEnabled ? 'true' : 'false'}>
          <nav className="dth-nav" aria-label="Desktop Themes">
            <ul className="dth-nav-list" role="tablist" aria-orientation="vertical">
              {NAV.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="tab"
                    id={`dth-nav-${item.id}`}
                    aria-selected={group === item.id}
                    aria-controls="dth-group-panel"
                    className={`dth-nav-item${group === item.id ? ' is-active' : ''}`}
                    onClick={() => selectGroup(item.id)}
                    onKeyDown={(event) => handleTabArrow(event, NAV_GROUP_IDS, group, selectGroup, 'dth-nav-')}
                  >
                    <span className="dth-nav-item-label">{t(item.key)}</span>
                    <span className="dth-nav-item-hint">{t(item.hint)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="dth-content" role="tabpanel" id="dth-group-panel" aria-labelledby={`dth-nav-${group}`}>
            <div className="dth-topbar">
              {props.openStudio && <button type="button" className="dth-button" onClick={() => { props.close?.(); props.openStudio?.(); }}>外观工作室 ↗</button>}
              <div className="dth-search">
                <input
                  type="search"
                  className="dth-input dth-search-input"
                  value={query}
                  placeholder={t('settings.search.placeholder')}
                  aria-label={t('settings.search')}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setQuery('');
                    if (event.key === 'Enter' && searchResults.length > 0) gotoResult(searchResults[0]);
                  }}
                />
                {normalizedQuery.length > 0 ? (
                  <div className="dth-search-results" role="listbox" aria-label={t('settings.search')}>
                    {searchResults.length === 0 ? (
                      <p className="dth-search-empty">{t('settings.search.empty')}</p>
                    ) : (
                      searchResults.map((entry) => (
                        <button
                          key={`${entry.key}-${entry.id ?? entry.section}`}
                          type="button"
                          role="option"
                          aria-selected="false"
                          className="dth-search-result"
                          onClick={() => gotoResult(entry)}
                        >
                          <span>{t(entry.key)}</span>
                          <span className="dth-search-result-group">{t(groupLabelKey(entry.group))} · {t(sectionLabelKey(entry.section))}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <div className="dth-topbar-actions">
                <span className={`dth-save-state${saveState.failed ? ' is-error' : saveState.saving ? ' is-saving' : ''}`} role="status">
                  {statusText}
                </span>
                {saveState.failed ? <Button onClick={() => void props.saveNow()}>{t('common.retrySave')}</Button> : null}
                {undo !== null ? (
                  <Button variant="ghost" onClick={undoTheme} title={t('common.undoHint')}>
                    {t('common.undo')}
                  </Button>
                ) : null}
                <Button onClick={() => downloadConfigJson(config)}>{t('common.exportBackup')}</Button>
              </div>
            </div>

            <div className="dth-subnav" role="tablist" aria-label={t(groupDef.key)}>
              {groupDef.sections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`dth-sub-${item.id}`}
                  aria-selected={section === item.id}
                  aria-controls="dth-section-panel"
                  className={`dth-subnav-item${section === item.id ? ' is-active' : ''}`}
                  onClick={() => setSection(item.id)}
                  onKeyDown={(event) => handleTabArrow(event, sectionKeys, section, setSection, 'dth-sub-')}
                >
                  {t(item.key)}
                </button>
              ))}
            </div>

            <div className="dth-section-shell" id="dth-section-panel" role="tabpanel" aria-labelledby={`dth-sub-${section}`}>
              {section === 'scenes' ? (
                <WorkspaceHome config={config} commit={update} openStudio={()=>{props.close?.();props.openStudio?.();}} preview={props.preview} cancelPreview={props.cancelPreview}/>
              ) : null}
              {section === 'theme' ? (
                <ThemeSection
                  config={config}
                  t={t}
                  update={update}
                  switchMode={switchMode}
                  onSwitchModeChange={(mode) => { endPreview(); setSwitchMode(mode); }}
                  onCommit={commitTheme}
                  onPreviewStart={(id) => startPreview('theme', id)}
                  onPreviewEnd={endPreview}
                  openStudio={()=>{props.close?.();props.openStudio?.();}}
                  previewTheme={previewTarget?.kind === 'theme' ? previewTarget.id : null}
                />
              ) : null}
              {section === 'font' ? <FontSection config={config} t={t} update={update} /> : null}
              {section === 'wallpaper' ? (
                <WallpaperSection
                  config={config}
                  t={t}
                  update={update}
                  chooseWallpaper={props.chooseWallpaper}
                  clearWallpaper={props.clearWallpaper}
                  restoreWallpaper={props.restoreWallpaper}
                  listRecentWallpapers={props.listRecentWallpapers}
                />
              ) : null}
              {section === 'pet' ? <PetSection config={config} t={t} update={update} /> : null}
              {section === 'light' ? <LightSection config={config} t={t} update={update} /> : null}
              {section === 'particles' ? <ParticlesSection config={config} t={t} update={update} /> : null}
              {section === 'glass' ? <GlassSection config={config} t={t} update={update} /> : null}

              {section === 'performance' ? <PerformanceSection config={config} t={t} update={update} /> : null}
              {section === 'transfer' ? <TransferSection config={config} t={t} update={update} /> : null}
              {section === 'about' ? <AboutSection config={config} t={t} /> : null}
            </div>
            {undo !== null ? (
              <div className="dth-undo" role="status" aria-live="polite">
                <span>{t('theme.undo').replace('{{name}}', undo.name)}</span>
                <button type="button" className="dth-undo-action" onClick={undoTheme}>
                  {t('common.undo')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </SettingsResetContext.Provider>
    </UiTextContext.Provider>
  );
}

const NAV_GROUP_IDS: readonly GroupId[] = NAV.map((item) => item.id);

function groupLabelKey(id: GroupId): I18nKey {
  return `nav.group.${id}` as I18nKey;
}

function sectionLabelKey(id: SectionId): I18nKey {
  switch (id) {
    case 'scenes':
      return 'sub.scenes';
    case 'theme':
      return 'sub.theme';
    case 'wallpaper':
      return 'sub.wallpaper';
    case 'glass':
      return 'sub.glass';
    case 'custom':
      return 'sub.custom';
    case 'light':
      return 'sub.light';
    case 'particles':
      return 'sub.particles';
    case 'performance':
      return 'sub.performance';
    case 'font':
      return 'nav.font';
    case 'pet':
      return 'nav.pet';
    case 'transfer':
      return 'sub.transfer';
    case 'about':
      return 'sub.about';
  }
}

function ThemeSection(props: {
  config: DesktopThemesConfig;
  t: Translate;
  update: (n: DesktopThemesConfig) => void;
  switchMode: ThemeSwitchMode;
  onSwitchModeChange: (mode: ThemeSwitchMode) => void;
  onCommit: (id: string, mode?: ThemeSwitchMode) => void;
  onPreviewStart: (id: string) => void;
  onPreviewEnd: () => void;
  previewTheme: string | null;
  openStudio?: () => void;
}) {
  const active = resolvePalette(props.config.theme, props.config.customThemes);
  const report = active !== undefined ? auditPalette(active) : undefined;

  const duplicateBuiltin = () => {
    const builtin = THEMES.find((th) => th.id === props.config.theme);
    if (builtin === undefined) return;
    const id = `custom-${Date.now().toString(36)}`;
    const custom: CustomThemeConfig = {
      id,
      name: `${builtin.name} Copy`,
      base: builtin.id,
      colors: colorsFromPalette(builtin.palette),
    };
    if(props.config.customThemes.length>=50)return;
    props.update({ ...props.config, customThemes: [...props.config.customThemes, custom], theme: id, scene: '' });
    props.openStudio?.();
  };

  return (
    <>
      <Section title={props.t('theme.title')}>
        <Segmented<ThemeSwitchMode>
          id="dth-theme-switch-mode"
          label={props.t('theme.switchMode')}
          value={props.switchMode}
          options={[
            { value: 'palette', label: props.t('theme.switchMode.palette') },
            { value: 'ambience', label: props.t('theme.switchMode.ambience') },
          ]}
          onChange={props.onSwitchModeChange}
        />
        <Notice tone="info">{props.t('theme.switchMode.hint')}</Notice>
        <Notice tone="info">{props.t('theme.previewHint')}</Notice>
        <div className="dth-theme-grid">
          {THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={builtinCardModel(props.t, theme)}
              selected={props.config.theme === theme.id}
              previewing={props.previewTheme === theme.id}
              onSelect={() => props.onCommit(theme.id)}
              onPreviewStart={() => props.onPreviewStart(theme.id)}
              onPreviewEnd={props.onPreviewEnd}
            />
          ))}
          {props.config.customThemes.map((custom) => (
            <ThemeCard
              key={custom.id}
              theme={customCardModel(custom, props.config.customThemes, props.t)}
              selected={props.config.theme === custom.id}
              onSelect={() => props.onCommit(custom.id, 'palette')}
            />
          ))}
        </div>
      </Section>
      {active !== undefined ? (
        <Section title={props.t('theme.palette')} actions={<Button onClick={duplicateBuiltin}>{props.t('custom.duplicate')}</Button>}>
          {report !== undefined ? (
            <div className="dth-readability" data-grade={report.grade}>
              <span className={`dth-grade is-${report.grade}`}>{report.grade}</span>
              <div>
                <strong>{props.t('theme.readability')}</strong>
                <p>{props.t('theme.readability.desc')}</p>
                <p>{report.issues.length === 0 ? props.t('theme.readability.pass') : props.t('theme.readability.fail').replace('{{count}}', String(report.issues.length))}</p>
                {report.issues.length > 0 ? (
                  <ul className="dth-contrast-list">
                    {report.issues.slice(0, 6).map((issue) => (
                      <li key={issue.id}>{issue.label} · {issue.ratio.toFixed(2)}:1 &lt; {issue.required}:1</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="dth-swatch-grid">
            <Swatch color={active.bgBase} label={props.t('theme.swatch.background')} />
            <Swatch color={active.bgSurface} label={props.t('theme.swatch.panel')} />
            <Swatch color={active.textPrimary} label={props.t('theme.swatch.text')} />
            <Swatch color={active.textSecondary} label={props.t('theme.swatch.textSecondary')} />
            <Swatch color={active.accent} label={props.t('theme.swatch.accent')} />
            <Swatch color={active.success} label={props.t('theme.swatch.success')} />
            <Swatch color={active.warning} label={props.t('theme.swatch.warning')} />
            <Swatch color={active.danger} label={props.t('theme.swatch.danger')} />
            {active.particleColors.map((c, i) => (
              <Swatch key={`p${i}`} color={c} label={`${props.t('theme.swatch.particle')} ${i + 1}`} />
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

interface FontOption {
  key: string;
  label: string;
  family: string;
  aliases: readonly string[];
  download?: FontPreset['download'];
}

interface FontJob {
  id: string;
  loaded: number;
  total: number;
  phase: 'download' | 'install';
}

function formatFontBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fontErrorMessage(error: unknown, t: Translate): string {
  if (!(error instanceof FontInstallError)) return t('font.error.network');
  switch (error.code) {
    case 'quota':
      return t('font.error.quota');
    case 'http':
      return t('font.error.http');
    case 'invalid':
      return t('font.error.invalid');
    case 'storage':
      return t('font.error.storage');
    case 'unsupported':
      return t('font.error.unsupported');
    case 'aborted':
      return '';
    default:
      return t('font.error.network');
  }
}

function FontSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const font = props.config.font;
  const t = props.t;
  const configRef = useRef(props.config);
  configRef.current = props.config;
  const setFont = (patch: Partial<typeof font>) =>
    props.update({ ...configRef.current, font: { ...configRef.current.font, ...patch } });

  const revision = useSyncExternalStore(subscribeFonts, fontsRevision);
  const downloaded = useMemo(() => installedFontIds(), [revision]);
  const [job, setJob] = useState<FontJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const isReady = (option: FontOption): boolean => {
    if (option.key === CUSTOM_PRESET_KEY) {
      return option.family.trim().length === 0 || isFontAvailable(option.family);
    }
    if (option.download !== undefined && downloaded.includes(option.download.id)) return true;
    return isFontAvailable(option.family, option.aliases);
  };

  const statusFor = (option: FontOption): { text: string; tone: 'ok' | 'warn' | 'muted' } => {
    if (option.download !== undefined && downloaded.includes(option.download.id)) {
      return { text: t('font.status.plugin'), tone: 'ok' };
    }
    if (isReady(option)) return { text: t('common.installed'), tone: 'ok' };
    if (option.download !== undefined) return { text: t('font.status.downloadable'), tone: 'warn' };
    return { text: t('common.fallback'), tone: 'muted' };
  };

  const startDownload = async (option: FontOption, target: 'ui' | 'code') => {
    const download = option.download;
    if (download === undefined || job !== null) return;
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setJob({ id: download.id, loaded: 0, total: download.sizeBytes, phase: 'download' });
    try {
      await installFont(
        download,
        (progress) => setJob({ id: download.id, loaded: progress.loaded, total: progress.total, phase: progress.phase }),
        controller.signal,
      );
      setFont(target === 'ui' ? { uiPreset: option.key } : { codePreset: option.key });
    } catch (caught) {
      const message = fontErrorMessage(caught, t);
      if (message.length > 0) setError(message);
    } finally {
      abortRef.current = null;
      setJob(null);
    }
  };

  const removeFont = async (id: string) => {
    setError(null);
    await removeInstalledFont(id);
  };

  const renderAction = (option: FontOption, target: 'ui' | 'code') => {
    const download = option.download;
    if (download === undefined) return undefined;
    if (job !== null && job.id === download.id) {
      const percent = job.total > 0 ? Math.min(100, Math.round((job.loaded / job.total) * 100)) : 0;
      return (
        <div className="dth-font-progress" role="status" aria-live="polite">
          <span className="dth-font-progress-track" aria-hidden="true">
            <span className="dth-font-progress-fill" style={{ width: `${percent}%` }} />
          </span>
          <span className="dth-font-progress-text">
            {job.phase === 'install' ? t('font.installing') : `${t('font.downloading')} ${percent}%`}
          </span>
          <button type="button" className="dth-font-link" onClick={() => abortRef.current?.abort()}>
            {t('font.cancel')}
          </button>
        </div>
      );
    }
    if (downloaded.includes(download.id)) {
      return (
        <div className="dth-font-action-row">
          <span className="dth-font-action-state">{t('font.status.plugin')}</span>
          <button type="button" className="dth-font-link" onClick={() => void removeFont(download.id)}>
            {t('font.remove')}
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        className="dth-font-download"
        disabled={job !== null}
        onClick={() => void startDownload(option, target)}
        title={download.source}
      >
        <span aria-hidden="true">↓</span>
        {t('font.download')} · {formatFontBytes(download.sizeBytes)}
      </button>
    );
  };

  const byInstalled = (a: FontOption, b: FontOption) => {
    const rank = (option: FontOption) => (option.key === CUSTOM_PRESET_KEY ? -1 : Number(isReady(option)));
    return rank(b) - rank(a);
  };

  const uiOptions: FontOption[] = [
    ...UI_FONT_PRESETS.map((preset) => ({
      key: preset.key,
      label: preset.key === 'system' ? t('font.preset.system') : preset.label,
      family: preset.family,
      aliases: preset.aliases,
      download: preset.download,
    })),
    { key: CUSTOM_PRESET_KEY, label: t('font.custom'), family: font.uiCustomFamily, aliases: [] },
  ].sort(byInstalled);
  const codeOptions: FontOption[] = [
    ...CODE_FONT_PRESETS.map((preset) => ({
      key: preset.key,
      label: preset.key === 'system-mono' ? t('font.preset.systemMono') : preset.label,
      family: preset.family,
      aliases: preset.aliases,
      download: preset.download,
    })),
    { key: CUSTOM_PRESET_KEY, label: t('font.custom'), family: font.codeCustomFamily, aliases: [] },
  ].sort(byInstalled);

  const installedSummary = useMemo(() => {
    const ids = new Set<string>();
    let bytes = 0;
    for (const preset of [...UI_FONT_PRESETS, ...CODE_FONT_PRESETS]) {
      const download = preset.download;
      if (download === undefined || ids.has(download.id) || !downloaded.includes(download.id)) continue;
      ids.add(download.id);
      bytes += download.sizeBytes;
    }
    return { count: ids.size, bytes };
  }, [downloaded]);

  const selectedUi = uiOptions.find((option) => option.key === font.uiPreset);
  const selectedCode = codeOptions.find((option) => option.key === font.codePreset);
  const isMissing = (option: FontOption | undefined): boolean =>
    option !== undefined &&
    option.key !== 'system' &&
    option.key !== 'system-mono' &&
    !isReady(option);
  const missingUi = isMissing(selectedUi);
  const missingCode = isMissing(selectedCode);

  const previewStackFor = (option: FontOption): string | undefined => {
    if (option.key === 'system') return buildUiStack('system', '');
    if (option.key === 'system-mono') return buildCodeStack('system-mono', '');
    return undefined;
  };

  const cardProps = (option: FontOption) => {
    const status = statusFor(option);
    return {
      label: option.label,
      family: option.family,
      previewFamily: previewStackFor(option),
      installed: isReady(option),
      selected: option.key === font.uiPreset,
      onSelect: () => setFont({ uiPreset: option.key }),
      installedText: t('common.installed'),
      fallbackText: t('common.fallback'),
      preview: FONT_PREVIEW_TEXT,
      codePreview: CODE_PREVIEW_TEXT,
      statusText: status.text,
      statusTone: status.tone,
      action: renderAction(option, 'ui'),
    };
  };

  const codeCardProps = (option: FontOption) => {
    const status = statusFor(option);
    return {
      label: option.label,
      family: option.family,
      previewFamily: previewStackFor(option),
      installed: isReady(option),
      selected: option.key === font.codePreset,
      onSelect: () => setFont({ codePreset: option.key }),
      installedText: t('common.installed'),
      fallbackText: t('common.fallback'),
      preview: FONT_PREVIEW_TEXT,
      codePreview: CODE_PREVIEW_TEXT,
      statusText: status.text,
      statusTone: status.tone,
      action: renderAction(option, 'code'),
    };
  };

  return (
    <Section title={props.t('font.title')} actions={<Button onClick={() => setFont({ ...DEFAULT_FONT })}>{props.t('font.restore')}</Button>}>
      <LiveFontPreview config={props.config} />
      <Notice tone="info">
        {t('font.library.hint')}
        {installedSummary.count > 0 ? ` ${t('font.library.installed')} ${installedSummary.count} · ${formatFontBytes(installedSummary.bytes)}` : ''}
      </Notice>
      {error !== null ? <Notice tone="error">{error}</Notice> : null}
      {missingUi ? <Notice tone="warn">{t('font.selectedMissingUi')}</Notice> : null}
      {missingCode ? <Notice tone="warn">{t('font.selectedMissingCode')}</Notice> : null}
      <div className="dth-field">
        <div className="dth-field-label">
          <label>{props.t('font.uiFamily')}</label>
          <span className="dth-field-hint">{t('font.aliasHint')}</span>
        </div>
        <div className="dth-font-grid">
          {uiOptions.map((option) => (
            <FontCard key={option.key} {...cardProps(option)} />
          ))}
        </div>
      </div>
      {font.uiPreset === CUSTOM_PRESET_KEY ? (
        <input
          type="text"
          className="dth-input"
          value={font.uiCustomFamily}
          placeholder="Font family name"
          onChange={(e) => setFont({ uiCustomFamily: e.currentTarget.value })}
        />
      ) : null}
      <div className="dth-field">
        <div className="dth-field-label">
          <label>{props.t('font.codeFamily')}</label>
        </div>
        <div className="dth-font-grid">
          {codeOptions.map((option) => (
            <FontCard key={option.key} {...codeCardProps(option)} />
          ))}
        </div>
      </div>
      {font.codePreset === CUSTOM_PRESET_KEY ? (
        <input
          type="text"
          className="dth-input"
          value={font.codeCustomFamily}
          placeholder="Monospace family name"
          onChange={(e) => setFont({ codeCustomFamily: e.currentTarget.value })}
        />
      ) : null}
      <Slider id="dth-font-size" label={props.t('font.fontSize')} min={12} max={24} step={1} value={font.fontSize} onChange={(v) => setFont({ fontSize: v })} format={(v) => `${v}px`} />
      <Slider id="dth-font-code-size" label={props.t('font.codeFontSize')} min={11} max={24} step={1} value={font.codeFontSize} onChange={(v) => setFont({ codeFontSize: v })} format={(v) => `${v}px`} />
      <Slider id="dth-font-lh" label={props.t('font.lineHeight')} min={1} max={2.5} step={0.05} value={font.lineHeight} onChange={(v) => setFont({ lineHeight: v })} format={(v) => v.toFixed(2)} />
      <Slider id="dth-font-weight" label={props.t('font.fontWeight')} min={100} max={900} step={100} value={font.fontWeight} onChange={(v) => setFont({ fontWeight: v })} />
      <Toggle id="dth-font-ligatures" label={props.t('font.ligatures')} checked={font.ligatures} onChange={(v) => setFont({ ligatures: v })} />
      <Toggle id="dth-font-smoothing" label={props.t('font.smoothing')} checked={font.smoothing} onChange={(v) => setFont({ smoothing: v })} />
      <Notice tone="info">{props.t('font.customHint')}</Notice>
    </Section>
  );
}

function WallpaperSection(props: {
  config: DesktopThemesConfig;
  t: Translate;
  update: (n: DesktopThemesConfig) => void;
  chooseWallpaper: (file: File) => Promise<WallpaperPickResult>;
  clearWallpaper: () => void;
  restoreWallpaper: (id: string) => Promise<boolean>;
  listRecentWallpapers: () => Promise<Array<{ id: string; name: string }>>;
}) {
  const wallpaper = props.config.wallpaper;
  const setWallpaper = (patch: Partial<typeof wallpaper>) =>
    props.update({ ...props.config, wallpaper: { ...wallpaper, ...patch } });
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [recent, setRecent] = useState<Array<{ id: string; name: string }>>([]);
  const accept = (WALLPAPER_EXTENSIONS as readonly string[]).map((ext) => `.${ext}`).join(',');

  useEffect(() => {
    setLoadFailed(false);
  }, [wallpaper.path, wallpaper.sourceId]);

  useEffect(() => {
    void props.listRecentWallpapers().then(setRecent);
  }, [props.listRecentWallpapers, props.config.wallpaper.sourceId]);

  const onPickFile = async (file: File | undefined) => {
    if (file === undefined) return;
    const result = await props.chooseWallpaper(file);
    setError(result.ok ? null : result.reason === 'unsupported-type' ? props.t('wallpaper.error.type') : props.t('wallpaper.error.size'));
    if (result.ok) {
      setLoadFailed(false);
      void props.listRecentWallpapers().then(setRecent);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    void onPickFile(event.dataTransfer.files?.[0]);
  };

  return (
    <Section title={props.t('nav.wallpaper')}>
      <Toggle id="dth-wp-enabled" label={props.t('wallpaper.enabled')} checked={wallpaper.enabled} onChange={(v) => setWallpaper({ enabled: v })} />
      <div
        className={`dth-dropzone${dragOver ? ' is-drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <span>{props.t('wallpaper.dropHint')}</span>
        <div className="dth-row-actions">
          <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={(e) => { void onPickFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
          <Button onClick={() => inputRef.current?.click()}>{props.t('wallpaper.choose')}</Button>
          <Button variant="danger" onClick={() => props.clearWallpaper()}>{props.t('wallpaper.clear')}</Button>
        </div>
      </div>
      {error !== null ? <Notice tone="error">{error}</Notice> : null}
      {wallpaper.enabled && wallpaper.path.length > 0 && !loadFailed ? (
        <div className="dth-wallpaper-preview" aria-label={props.t('wallpaper.preview')}>
          <img src={wallpaper.path} alt="" onError={() => setLoadFailed(true)} />
        </div>
      ) : null}
      {wallpaper.enabled && wallpaper.path.length > 0 && loadFailed ? (
        <div className="dth-wallpaper-empty" role="status">
          <p>{props.t('wallpaper.loadFailed')}</p>
          <Button onClick={() => inputRef.current?.click()}>{props.t('wallpaper.chooseAgain')}</Button>
        </div>
      ) : null}
      {wallpaper.enabled && wallpaper.path.length === 0 ? (
        <div className="dth-wallpaper-empty" role="status">
          <p>{props.t('wallpaper.none')}</p>
        </div>
      ) : null}
      {recent.length > 0 ? (
        <div className="dth-field">
          <div className="dth-field-label"><label>{props.t('wallpaper.recent')}</label></div>
          <div className="dth-recent">
            {recent.map((item) => (
              <button key={item.id} type="button" className="dth-recent-item" onClick={() => void props.restoreWallpaper(item.id)} title={item.name}>
                {item.name || item.id}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <Segmented
        id="dth-wp-fit"
        label={props.t('wallpaper.fit')}
        value={wallpaper.fit}
        options={FIT_OPTIONS.map((v) => ({ value: v, label: props.t(`wallpaper.fit.${v}` as I18nKey) }))}
        onChange={(v) => setWallpaper({ fit: v })}
        disabled={!wallpaper.enabled}
      />
      <Segmented<WallpaperSafeArea>
        id="dth-wp-safe"
        label={props.t('wallpaper.safeArea')}
        value={wallpaper.safeArea}
        options={SAFE_AREA_OPTIONS.map((v) => ({ value: v, label: props.t(`wallpaper.safeArea.${v}` as I18nKey) }))}
        onChange={(v) => setWallpaper({ safeArea: v })}
        disabled={!wallpaper.enabled}
      />
      <Notice tone="info">{props.t('wallpaper.safeArea.hint')}</Notice>
      <Slider id="dth-wp-x" label={props.t('wallpaper.positionX')} min={0} max={100} step={1} value={wallpaper.positionX} onChange={(v) => setWallpaper({ positionX: v })} format={(v) => `${v}%`} disabled={!wallpaper.enabled} />
      <Slider id="dth-wp-y" label={props.t('wallpaper.positionY')} min={0} max={100} step={1} value={wallpaper.positionY} onChange={(v) => setWallpaper({ positionY: v })} format={(v) => `${v}%`} disabled={!wallpaper.enabled} />
      <Slider id="dth-wp-fx" label={props.t('wallpaper.focusX')} min={0} max={100} step={1} value={wallpaper.focusX} onChange={(v) => setWallpaper({ focusX: v })} format={(v) => `${v}%`} disabled={!wallpaper.enabled || wallpaper.safeArea === 'off'} />
      <Slider id="dth-wp-fy" label={props.t('wallpaper.focusY')} min={0} max={100} step={1} value={wallpaper.focusY} onChange={(v) => setWallpaper({ focusY: v })} format={(v) => `${v}%`} disabled={!wallpaper.enabled || wallpaper.safeArea === 'off'} />
      <Slider id="dth-wp-scale" label={props.t('wallpaper.scale')} min={0.5} max={3} step={0.05} value={wallpaper.scale} onChange={(v) => setWallpaper({ scale: v })} format={(v) => `${v.toFixed(2)}×`} disabled={!wallpaper.enabled} />
      <Slider id="dth-wp-opacity" label={props.t('wallpaper.opacity')} min={0} max={1} step={0.01} value={wallpaper.opacity} onChange={(v) => setWallpaper({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!wallpaper.enabled} />
      <Slider id="dth-wp-blur" label={props.t('wallpaper.blur')} min={0} max={50} step={1} value={wallpaper.blur} onChange={(v) => setWallpaper({ blur: v })} format={(v) => `${v}px`} disabled={!wallpaper.enabled} />
      <Slider id="dth-wp-overlay" label={props.t('wallpaper.overlay')} min={0} max={1} step={0.01} value={wallpaper.overlay} onChange={(v) => setWallpaper({ overlay: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!wallpaper.enabled} />
      <Slider id="dth-wp-sat" label={props.t('wallpaper.saturation')} min={0} max={2} step={0.05} value={wallpaper.saturation} onChange={(v) => setWallpaper({ saturation: v })} format={(v) => v.toFixed(2)} disabled={!wallpaper.enabled} />
      <Slider id="dth-wp-bright" label={props.t('wallpaper.brightness')} min={0.5} max={1.5} step={0.05} value={wallpaper.brightness} onChange={(v) => setWallpaper({ brightness: v })} format={(v) => v.toFixed(2)} disabled={!wallpaper.enabled} />
      <Toggle id="dth-wp-tint" label={props.t('wallpaper.tint')} checked={wallpaper.tintEnabled} onChange={(v) => setWallpaper({ tintEnabled: v })} disabled={!wallpaper.enabled} />
      <Slider id="dth-wp-tint-strength" label={props.t('wallpaper.tintStrength')} min={0} max={1} step={0.01} value={wallpaper.tintStrength} onChange={(v) => setWallpaper({ tintStrength: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!wallpaper.enabled || !wallpaper.tintEnabled} />
    </Section>
  );
}

function PetSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const pet = props.config.pet;
  const setPet = (patch: Partial<typeof pet>) => props.update({ ...props.config, pet: { ...pet, ...patch } });

  return (
    <Section title={props.t('pet.title')}>
      <Toggle id="dth-pet-enabled" label={props.t('pet.enabled')} checked={pet.enabled} onChange={(v) => setPet({ enabled: v })} />
      <Slider id="dth-pet-size" label={props.t('pet.size')} min={64} max={288} step={4} value={pet.size} onChange={(v) => setPet({ size: v })} format={(v) => `${v}px`} disabled={!pet.enabled} />
      <Toggle id="dth-pet-animations" label={props.t('pet.animations')} checked={pet.animations} onChange={(v) => setPet({ animations: v })} disabled={!pet.enabled} />
      <Toggle id="dth-pet-speech" label={props.t('pet.speech')} checked={pet.speech} onChange={(v) => setPet({ speech: v })} disabled={!pet.enabled} />
      <SpeechLinesEditor
        id="dth-pet-lines"
        label={props.t('pet.speechLines')}
        hint={props.t('pet.speechLinesHint')}
        value={pet.speechLines}
        onChange={(v) => setPet({ speechLines: v })}
        disabled={!pet.enabled}
      />
      <Toggle id="dth-pet-voice" label={props.t('pet.voice')} checked={pet.voiceEnabled} onChange={(v) => setPet({ voiceEnabled: v })} disabled={!pet.enabled} />
      {pet.voiceEnabled ? (
        <>
          <Segmented
            id="dth-pet-voice-style"
            label={props.t('pet.voiceStyle')}
            value={pet.voiceStyle}
            options={VOICE_STYLE_IDS.map((v) => ({ value: v, label: props.t(`pet.voiceStyle.${v}` as I18nKey) }))}
            onChange={(v) => setPet({ voiceStyle: v as VoiceStyle })}
            disabled={!pet.enabled}
          />
          <Notice tone="info">{props.t('pet.voiceHint')}</Notice>
        </>
      ) : null}
      <div className="dth-row-actions">
        <Button onClick={() => setPet({ positionX: DEFAULT_PET.positionX, positionY: DEFAULT_PET.positionY })}>
          {props.t('pet.position.reset')}
        </Button>
      </div>
      <Notice tone="info">{props.t('pet.dragHint')}</Notice>
      <Notice tone="info">{props.t('plugin.version')}: {PLUGIN_VERSION} · {PLUGIN_BUILD_ID}</Notice>
    </Section>
  );
}

function LightSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const effects = props.config.effects;
  const setEffects = (patch: Partial<typeof effects>) => props.update({ ...props.config, effects: { ...effects, ...patch } });
  return (
    <Section title={props.t('light.title')}>
      <GlowPreview config={props.config} />
      <Segmented
        id="dth-light-intensity"
        label={props.t('light.glowIntensity')}
        value={effects.glowIntensity}
        options={GLOW_OPTIONS.map((v) => ({ value: v, label: props.t(`light.intensity.${v}` as I18nKey) }))}
        onChange={(v) => setEffects({ glowIntensity: v })}
      />
      <Toggle id="dth-light-cursor" label={props.t('light.cursorGlow')} checked={effects.cursorGlow} onChange={(v) => setEffects({ cursorGlow: v })} />
      <Toggle id="dth-light-parallax" label={props.t('light.parallax')} checked={effects.parallax} onChange={(v) => setEffects({ parallax: v })} />
      <Notice tone="info">{props.t('light.breathingHint')}</Notice>
    </Section>
  );
}

function ParticlesSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const effects = props.config.effects;
  const setEffects = (patch: Partial<typeof effects>) => props.update({ ...props.config, effects: { ...effects, ...patch } });
  return (
    <Section title={props.t('particles.title')}>
      <ParticlesPreview config={props.config} />
      <Toggle id="dth-p-enabled" label={props.t('particles.enabled')} checked={effects.enabled} onChange={(v) => setEffects({ enabled: v })} />
      <Select
        id="dth-p-preset"
        label={props.t('particles.preset')}
        value={effects.preset}
        options={PRESET_OPTIONS.map((v) => ({ value: v, label: props.t(`particles.preset.${v}` as I18nKey) }))}
        onChange={(v) => setEffects({ preset: v })}
        disabled={!effects.enabled}
      />
      <Segmented
        id="dth-p-density"
        label={props.t('particles.density')}
        value={effects.density}
        options={DENSITY_OPTIONS.map((v) => ({ value: v, label: props.t(`particles.density.${v}` as I18nKey) }))}
        onChange={(v) => setEffects({ density: v })}
        disabled={!effects.enabled}
      />
      <details className="dth-advanced-controls"><summary>高级粒子参数</summary><Slider id="dth-p-count" label={props.t('particles.count')} min={0} max={200} step={1} value={effects.particleCount} onChange={(v) => setEffects({ particleCount: v })} format={(v) => (v === 0 ? 'Auto' : String(v))} disabled={!effects.enabled} />
      <Slider id="dth-p-size" label={props.t('particles.size')} min={1} max={6} step={0.5} value={effects.particleSize} onChange={(v) => setEffects({ particleSize: v })} format={(v) => v.toFixed(1)} disabled={!effects.enabled} />
      <Slider id="dth-p-speed" label={props.t('particles.speed')} min={0.2} max={3} step={0.1} value={effects.particleSpeed} onChange={(v) => setEffects({ particleSpeed: v })} format={(v) => `${v.toFixed(1)}×`} disabled={!effects.enabled} />
      <Slider id="dth-p-opacity" label={props.t('particles.opacity')} min={0} max={1} step={0.01} value={effects.particleOpacity} onChange={(v) => setEffects({ particleOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!effects.enabled} />
      <Toggle id="dth-p-connect" label={props.t('particles.connect')} checked={effects.connectLines} onChange={(v) => setEffects({ connectLines: v })} disabled={!effects.enabled} />
      <Toggle id="dth-p-mouse" label={props.t('particles.mouse')} checked={effects.mouseInteraction} onChange={(v) => setEffects({ mouseInteraction: v })} disabled={!effects.enabled} />
      </details><Toggle id="dth-p-auto" label={props.t('particles.autoColors')} checked={effects.autoThemeColors} onChange={(v) => setEffects({ autoThemeColors: v })} disabled={!effects.enabled} />
      {!effects.autoThemeColors ? (
        <>
          <div className="dth-field">
            <div className="dth-field-label"><label>{props.t('particles.colors')}</label></div>
            <ColorSwatches colors={PRESET_SWATCHES} onPick={(c) => setEffects({ particleColors: [...new Set([...effects.particleColors, c])].slice(0, 6) })} />
          </div>
          <div className="dth-field">
            <div className="dth-field-label"><label>{props.t('particles.glowColors')}</label></div>
            <ColorSwatches colors={PRESET_SWATCHES} onPick={(c) => setEffects({ glowColors: [...new Set([...effects.glowColors, c])].slice(0, 6) })} />
          </div>
        </>
      ) : null}
    </Section>
  );
}

function GlassSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const appearance = props.config.appearance;
  const glass = props.config.glass;
  const setAppearance = (patch: Partial<typeof appearance>) => props.update({ ...props.config, appearance: { ...appearance, ...patch } });
  const setGlass = (patch: Partial<typeof glass>) => props.update({ ...props.config, glass: { ...glass, ...patch } });

  return (
    <Section title={props.t('glass.title')} actions={<Button onClick={() => setAppearance({ ...DEFAULT_APPEARANCE, ...RECOMMENDED_OPACITY })}>{props.t('transparency.recommended')}</Button>}>
      <Toggle id="dth-tr-enabled" label={props.t('transparency.enabled')} checked={appearance.transparencyEnabled} onChange={(v) => setAppearance({ transparencyEnabled: v })} />
      <Slider id="dth-tr-window" label={props.t('transparency.window')} min={0.55} max={1} step={0.01} value={appearance.windowOpacity} onChange={(v) => setAppearance({ windowOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!appearance.transparencyEnabled} />
      <Slider id="dth-tr-sidebar" label={props.t('transparency.sidebar')} min={0.55} max={1} step={0.01} value={appearance.sidebarOpacity} onChange={(v) => setAppearance({ sidebarOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!appearance.transparencyEnabled} />
      <Slider id="dth-tr-panel" label={props.t('transparency.panel')} min={0.55} max={1} step={0.01} value={appearance.panelOpacity} onChange={(v) => setAppearance({ panelOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!appearance.transparencyEnabled} />
      <Slider id="dth-tr-input" label={props.t('transparency.input')} min={0.55} max={1} step={0.01} value={appearance.inputOpacity} onChange={(v) => setAppearance({ inputOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!appearance.transparencyEnabled} />
      <TransparencyPreview config={props.config} />
      <Notice tone="info">{props.t('transparency.warn')}</Notice>

      <Segmented<'classic' | 'refined'>
        id="dth-content-style"
        label={props.t('content.style')}
        value={effectiveContentStyle(props.config)}
        options={[
          { value: 'classic', label: props.t('content.style.classic') },
          { value: 'refined', label: props.t('content.style.refined') },
        ]}
        onChange={(v) => setAppearance({ contentStyle: v })}
      />
      <Slider id="dth-content-tint" label={props.t('content.tint')} min={0.25} max={2} step={0.25} value={appearance.diffTint} onChange={(v) => setAppearance({ diffTint: v })} format={(v) => `${Math.round(v * 100)}%`} />
      <Notice tone="info">{props.t('content.hint')}</Notice>
      <ContentPreview config={props.config} />

      <Toggle id="dth-glass-enabled" label={props.t('glass.enabled')} checked={glass.enabled} onChange={(v) => setGlass({ enabled: v })} />
      <Segmented
        id="dth-glass-blur"
        label={props.t('glass.blurLevel')}
        value={glass.blurLevel}
        options={BLUR_OPTIONS.map((v) => ({ value: v, label: props.t(`glass.blur.${v}` as I18nKey) }))}
        onChange={(v) => setGlass({ blurLevel: v })}
        disabled={!glass.enabled}
      />
      <Slider id="dth-glass-strength" label={props.t('glass.strength')} min={0} max={40} step={1} value={glass.strength} onChange={(v) => setGlass({ strength: v })} format={(v) => `${v}px`} disabled={!glass.enabled} />
      <Slider id="dth-glass-sat" label={props.t('glass.saturation')} min={0.5} max={2} step={0.05} value={glass.saturation} onChange={(v) => setGlass({ saturation: v })} format={(v) => v.toFixed(2)} disabled={!glass.enabled} />
      <Slider id="dth-glass-opacity" label={props.t('glass.panelOpacity')} min={0} max={1} step={0.01} value={glass.panelOpacity} onChange={(v) => setGlass({ panelOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!glass.enabled} />
      <Slider id="dth-glass-border" label={props.t('glass.borderHighlight')} min={0} max={1} step={0.01} value={glass.borderHighlight} onChange={(v) => setGlass({ borderHighlight: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!glass.enabled} />
      <Slider id="dth-glass-shadow" label={props.t('glass.shadow')} min={0} max={1} step={0.01} value={glass.shadow} onChange={(v) => setGlass({ shadow: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!glass.enabled} />
      <GlassPreview config={props.config} />
      <Notice tone="info">{props.t('glass.previewHint')}</Notice>
    </Section>
  );
}

function PerformanceSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const perf = props.config.performance;
  const effects = props.config.effects;
  return (
    <Section title={props.t('performance.title')}>
      <Segmented
        id="dth-perf-level"
        label={props.t('performance.level')}
        value={perf.level}
        options={PERFORMANCE_OPTIONS.map((v) => ({ value: v, label: props.t(`performance.level.${v}` as I18nKey) }))}
        onChange={(v) => props.update({ ...props.config, performance: { ...perf, level: v } })}
      />
      {perf.level === 'quality' ? <Notice tone="warn">{props.t('performance.level.quality.desc')}</Notice> : null}
      <Segmented
        id="dth-perf-speed"
        label={props.t('performance.animationSpeed')}
        value={effects.animationSpeed}
        options={SPEED_OPTIONS.map((v) => ({ value: v, label: props.t(`performance.speed.${v}` as I18nKey) }))}
        onChange={(v) => props.update({ ...props.config, effects: { ...effects, animationSpeed: v } })}
      />
    </Section>
  );
}

function TransferSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const doImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file === undefined) return;
    const text = await file.text();
    const result = parseImportedConfig(text);
    if (result.ok) {
      props.update(result.config);
      setMessage({ tone: 'info', text: props.t('transfer.ok') });
    } else {
      setMessage({ tone: 'error', text: result.reason === 'parse' ? props.t('transfer.error.parse') : props.t('transfer.error.schema') });
    }
  };

  return (
    <Section title={props.t('transfer.title')}>
      <div className="dth-row-actions">
<Notice tone="info">使用顶部“导出备份”保存全部设置；可分享的风格包在工作室导出。</Notice>
        <input ref={importRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={doImport} />
        <Button onClick={() => importRef.current?.click()}>{props.t('transfer.import')}</Button>
      </div>
      <Notice tone="info">{props.t('transfer.import.desc')}</Notice>
      {message !== null ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="dth-row-actions">
        <Button onClick={() => props.update({ ...props.config, font: { ...DEFAULT_FONT } })}>恢复排版默认值</Button>
        <Button onClick={() => props.update({ ...props.config, appearance: { ...DEFAULT_APPEARANCE } })}>恢复界面默认值</Button>
      </div>
      <Notice tone="info">{props.t('reset.all.desc')}</Notice>
      <div className="dth-row-actions">
        <Button variant="danger" onClick={() => props.update(createDefaultConfig())}>{props.t('reset.all')}</Button>
      </div>
    </Section>
  );
}

function AboutSection(props: { config: DesktopThemesConfig; t: Translate }) {
  const palette = resolvePalette(props.config.theme, props.config.customThemes);
  const report: ThemeContrastReport | undefined = palette !== undefined ? auditPalette(palette) : undefined;
  return (
    <Section title={props.t('about.title')}>
      <div className="dth-about-grid">
        <span>{props.t('about.version')}</span>
        <code>{PLUGIN_VERSION}</code>
        <span>{props.t('about.build')}</span>
        <code>{PLUGIN_BUILD_ID}</code>
      </div>
      {report !== undefined ? (
        <div className="dth-readability" data-grade={report.grade}>
          <span className={`dth-grade is-${report.grade}`}>{report.grade}</span>
          <div>
            <strong>{props.t('about.readability')}</strong>
            <p>{describeContrast(report)}</p>
            {report.issues.length > 0 ? (
              <ul className="dth-contrast-list">
                {report.issues.map((issue) => (
                  <li key={issue.id}>{issue.label} · {issue.ratio.toFixed(2)}:1 &lt; {issue.required}:1</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
      <Notice tone="info">{props.t('about.storage')}: {props.t('about.storage.wallpaper')} {props.t('about.storage.font')}</Notice>
      <Notice tone="info">{props.t('about.privacy')}</Notice>
    </Section>
  );
}
