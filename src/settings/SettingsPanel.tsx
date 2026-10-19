/**
 * The desktop-themes settings section: grouped left navigation + right
 * content. Registered into the product's `settings.section` slot. All state
 * reads go through the injected reactive store (`useSyncExternalStore`); all
 * writes go through `commit`, which applies live and persists (debounced)
 * through the settings scope. The component owns no persistence and no DOM
 * side effects.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type DragEvent } from 'react';
import type { DesktopThemesConfig, SettingsField, CustomThemeConfig, CustomThemeColors, ThemeId, VoiceStyle } from '../config/types.ts';
import { createDefaultConfig, DEFAULT_APPEARANCE, DEFAULT_FONT, DEFAULT_PET, RECOMMENDED_OPACITY } from '../config/defaults.ts';
import { exportConfigJson, parseImportedConfig } from '../config/transfer.ts';
import { THEMES, resolvePalette, type DesktopTheme } from '../themes/index.ts';
import type { ThemePalette } from '../themes/palette.ts';
import { WALLPAPER_EXTENSIONS } from '../appearance/wallpaper.ts';
import { effectiveContentStyle, supportsContentVariant } from '../appearance/content.ts';
import {
  CODE_FONT_PRESETS,
  UI_FONT_PRESETS,
  CUSTOM_PRESET_KEY,
  CODE_PREVIEW_TEXT,
  FONT_PREVIEW_TEXT,
  isFontAvailable,
} from '../fonts/presets.ts';
import { generateHarmony, HARMONY_KINDS, contrastIssues, fixContrast, type HarmonyKind } from '../custom-theme/colors.ts';
import type { Store } from '../utils/store.ts';
import {
  Button,
  ColorPicker,
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
  type ThemeCardModel,
} from './controls.tsx';
import { VOICE_STYLE_IDS } from '../pet/speech.ts';
import { GlassPreview, GlowPreview, LiveFontPreview, ParticlesPreview, TransparencyPreview } from './EffectPreview.tsx';
import { detectLang, makeTranslator, type I18nKey, type Lang, type Translate } from './i18n.ts';
import { PLUGIN_BUILD_ID, PLUGIN_VERSION } from '../build-info.ts';
import { applyBuiltinThemePreset, builtinWallpaperThumbnail } from '../client/theme-presets.ts';

export type WallpaperPickResult = { ok: true } | { ok: false; reason: string };

/** Business face injected by the client `apply` and merged into props. */
export interface SettingsFace {
  store: Store<DesktopThemesConfig>;
  saveNotifier: Store<{ saving: boolean; saved: boolean; failed: boolean }>;
  saveNow: () => Promise<boolean>;
  commit: (next: DesktopThemesConfig) => void;
  chooseWallpaper: (file: File) => Promise<WallpaperPickResult>;
  clearWallpaper: () => void;
  restoreWallpaper: (id: string) => Promise<boolean>;
  listRecentWallpapers: () => Promise<Array<{ id: string; name: string }>>;
}

interface SettingsPanelProps extends SettingsFace {
  close?: () => void;
}

type SectionId = 'theme' | 'font' | 'wallpaper' | 'pet' | 'light' | 'particles' | 'glass' | 'custom' | 'performance' | 'transfer';

const NAV: ReadonlyArray<{ id: SectionId; key: I18nKey }> = [
  { id: 'theme', key: 'nav.theme' },
  { id: 'font', key: 'nav.font' },
  { id: 'wallpaper', key: 'nav.wallpaper' },
  { id: 'pet', key: 'nav.pet' },
  { id: 'light', key: 'nav.light' },
  { id: 'particles', key: 'nav.particles' },
  { id: 'glass', key: 'nav.glass' },
  { id: 'custom', key: 'nav.custom' },
  { id: 'performance', key: 'nav.performance' },
  { id: 'transfer', key: 'nav.transfer' },
];

const FIT_OPTIONS = ['cover', 'contain', 'stretch', 'center', 'tile'] as const;
const BLUR_OPTIONS = ['off', 'light', 'standard', 'strong'] as const;
const GLOW_OPTIONS = ['off', 'soft', 'standard', 'bright'] as const;
const DENSITY_OPTIONS = ['off', 'low', 'medium', 'high'] as const;
const SPEED_OPTIONS = ['still', 'gentle', 'standard', 'active'] as const;
const PERFORMANCE_OPTIONS = ['power-saver', 'balanced', 'quality'] as const;
const PRESET_OPTIONS = ['none', 'tech-data', 'starfield', 'aurora-flow', 'fireflies', 'bubbles', 'sakura', 'gold-dust', 'breathing', 'custom'] as const;

const PRESET_SWATCHES = ['#3D7EFF', '#22D3EE', '#8B5CF6', '#14B8A6', '#FF7A59', '#C9A962', '#F472B6'];

function patchTop(config: DesktopThemesConfig, field: SettingsField, value: unknown): DesktopThemesConfig {
  return { ...config, [field]: value };
}

function themeNameKey(id: string): I18nKey {
  return `theme.name.${id}` as I18nKey;
}

function tagKey(tag: string): I18nKey {
  return `theme.tag.${tag.toLowerCase()}` as I18nKey;
}

function builtinCardModel(t: Translate, theme: DesktopTheme): ThemeCardModel {
  const p = theme.palette;
  return {
    id: theme.id,
    name: t(themeNameKey(theme.id)),
    description: theme.description,
    tag: t(tagKey(theme.tag)),
    wallpaper: builtinWallpaperThumbnail(theme.id as ThemeId),
    colors: { bg: p.bgBase, panel: p.bgSurface, text: p.textPrimary, accent: p.accent, particles: p.particleColors },
  };
}

function customCardModel(theme: CustomThemeConfig, customThemes: CustomThemeConfig[]): ThemeCardModel {
  const palette = resolvePalette(theme.id, customThemes);
  const p = palette ?? resolvePalette(theme.base) ?? THEMES[0].palette;
  return {
    id: theme.id,
    name: theme.name,
    description: `Custom · ${theme.base}`,
    tag: 'Custom',
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

export function SettingsPanel(props: SettingsPanelProps) {
  const config = useSyncExternalStore(props.store.subscribe, props.store.get);
  const saveState = useSyncExternalStore(props.saveNotifier.subscribe, props.saveNotifier.get);
  const [section, setSection] = useState<SectionId>('theme');
  const [lang] = useState<Lang>(() => detectLang());
  const t = makeTranslator(lang);
  const commit = props.commit;

  const update = useCallback((next: DesktopThemesConfig) => commit(next), [commit]);

  return (
    <div className="dth-panel" data-dth-animations={config.appearance.animationsEnabled ? 'true' : 'false'}>
      <nav className="dth-nav" aria-label="Desktop Themes">
        <ul className="dth-nav-list" role="tablist" aria-orientation="vertical">
          {NAV.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="tab"
                id={`dth-nav-${item.id}`}
                aria-selected={section === item.id}
                aria-controls={`dth-panel-${item.id}`}
                className={`dth-nav-item${section === item.id ? ' is-active' : ''}`}
                onClick={() => setSection(item.id)}
              >
                {t(item.key)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="dth-content" role="tabpanel" id={`dth-panel-${section}`} aria-labelledby={`dth-nav-${section}`}>
        <div className="dth-savebar">
          <span className="dth-savebar-hint">{t('common.saveHint')}</span>
          <Button variant="primary" disabled={saveState.saving} onClick={() => void props.saveNow()}>
            {saveState.saving ? t('common.saving') : t('common.saveAll')}
          </Button>
        </div>
        {saveState.saved ? <Notice tone="info">{t('common.saved')}</Notice> : saveState.failed ? <Notice tone="error">{t('common.saveFailed')}</Notice> : null}
        {section === 'theme' ? <ThemeSection config={config} t={t} update={update} /> : null}
        {section === 'font' ? <FontSection config={config} t={t} update={update} /> : null}
        {section === 'wallpaper' ? (
          <WallpaperSection config={config} t={t} update={update} chooseWallpaper={props.chooseWallpaper} clearWallpaper={props.clearWallpaper} restoreWallpaper={props.restoreWallpaper} listRecentWallpapers={props.listRecentWallpapers} />
        ) : null}
        {section === 'pet' ? <PetSection config={config} t={t} update={update} /> : null}
        {section === 'light' ? <LightSection config={config} t={t} update={update} /> : null}
        {section === 'particles' ? <ParticlesSection config={config} t={t} update={update} /> : null}
        {section === 'glass' ? <GlassSection config={config} t={t} update={update} /> : null}
        {section === 'custom' ? <CustomThemeSection config={config} t={t} update={update} /> : null}
        {section === 'performance' ? <PerformanceSection config={config} t={t} update={update} /> : null}
        {section === 'transfer' ? <TransferSection config={config} t={t} update={update} /> : null}
      </div>
    </div>
  );
}

function ThemeSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const active = resolvePalette(props.config.theme, props.config.customThemes);
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
    props.update({ ...props.config, customThemes: [...props.config.customThemes, custom], theme: id });
  };

  return (
    <>
      <Section title={props.t('theme.title')}>
        <div className="dth-theme-grid">
          {THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={builtinCardModel(props.t, theme)}
              selected={props.config.theme === theme.id}
              onSelect={() => props.update(applyBuiltinThemePreset(props.config, theme.id as ThemeId))}
            />
          ))}
          {props.config.customThemes.map((custom) => (
            <ThemeCard
              key={custom.id}
              theme={customCardModel(custom, props.config.customThemes)}
              selected={props.config.theme === custom.id}
              onSelect={() => props.update(patchTop(props.config, 'theme', custom.id))}
            />
          ))}
        </div>
      </Section>
      {active !== undefined ? (
        <Section title={props.t('theme.palette')} actions={<Button onClick={duplicateBuiltin}>{props.t('custom.duplicate')}</Button>}>
          <div className="dth-swatch-grid">
            <Swatch color={active.bgBase} label="Background" />
            <Swatch color={active.bgSurface} label="Panel" />
            <Swatch color={active.textPrimary} label="Text" />
            <Swatch color={active.textSecondary} label="Text · secondary" />
            <Swatch color={active.accent} label="Accent" />
            <Swatch color={active.success} label="Success" />
            <Swatch color={active.warning} label="Warning" />
            <Swatch color={active.danger} label="Danger" />
            {active.particleColors.map((c, i) => (
              <Swatch key={`p${i}`} color={c} label={`Particle ${i + 1}`} />
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function FontSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const font = props.config.font;
  const setFont = (patch: Partial<typeof font>) => props.update(patchTop(props.config, 'font', { ...font, ...patch }));

  const byInstalled = (a: { key: string; family: string }, b: { key: string; family: string }) => {
    if (a.key === CUSTOM_PRESET_KEY) return 1;
    if (b.key === CUSTOM_PRESET_KEY) return -1;
    return Number(isFontAvailable(b.family)) - Number(isFontAvailable(a.family));
  };
  const uiOptions = [
    ...UI_FONT_PRESETS.map((p) => ({ key: p.key, label: p.key === 'system' ? props.t('font.preset.system') : p.label, family: p.family })),
    { key: CUSTOM_PRESET_KEY, label: props.t('font.custom'), family: font.uiCustomFamily },
  ].sort(byInstalled);
  const codeOptions = [
    ...CODE_FONT_PRESETS.map((p) => ({ key: p.key, label: p.key === 'system-mono' ? props.t('font.preset.systemMono') : p.label, family: p.family })),
    { key: CUSTOM_PRESET_KEY, label: props.t('font.custom'), family: font.codeCustomFamily },
  ].sort(byInstalled);

  return (
    <Section title={props.t('font.title')} actions={<Button onClick={() => setFont({ ...DEFAULT_FONT })}>{props.t('font.restore')}</Button>}>
      <LiveFontPreview config={props.config} />
      <div className="dth-field">
        <div className="dth-field-label"><label>{props.t('font.uiFamily')}</label></div>
        <div className="dth-font-grid">
          {uiOptions.map((o) => (
            <FontCard
              key={o.key}
              label={o.label}
              family={o.family}
              installed={isFontAvailable(o.family)}
              selected={font.uiPreset === o.key}
              onSelect={() => setFont({ uiPreset: o.key })}
              installedText={props.t('common.installed')}
              fallbackText={props.t('common.fallback')}
              preview={FONT_PREVIEW_TEXT}
              codePreview={CODE_PREVIEW_TEXT}
            />
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
        <div className="dth-field-label"><label>{props.t('font.codeFamily')}</label></div>
        <div className="dth-font-grid">
          {codeOptions.map((o) => (
            <FontCard
              key={o.key}
              label={o.label}
              family={o.family}
              installed={isFontAvailable(o.family)}
              selected={font.codePreset === o.key}
              onSelect={() => setFont({ codePreset: o.key })}
              installedText={props.t('common.installed')}
              fallbackText={props.t('common.fallback')}
              preview={FONT_PREVIEW_TEXT}
              codePreview={CODE_PREVIEW_TEXT}
            />
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
      <Slider id="dth-font-size" label={props.t('font.fontSize')} min={10} max={24} step={1} value={font.fontSize} onChange={(v) => setFont({ fontSize: v })} format={(v) => `${v}px`} />
      <Slider id="dth-font-code-size" label={props.t('font.codeFontSize')} min={9} max={24} step={1} value={font.codeFontSize} onChange={(v) => setFont({ codeFontSize: v })} format={(v) => `${v}px`} />
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
    props.update(patchTop(props.config, 'wallpaper', { ...wallpaper, ...patch }));
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [recent, setRecent] = useState<Array<{ id: string; name: string }>>([]);
  const accept = (WALLPAPER_EXTENSIONS as readonly string[]).map((ext) => `.${ext}`).join(',');

  useEffect(() => {
    void props.listRecentWallpapers().then(setRecent);
  }, [props.listRecentWallpapers, props.config.wallpaper.sourceId]);

  const onPickFile = async (file: File | undefined) => {
    if (file === undefined) return;
    const result = await props.chooseWallpaper(file);
    setError(result.ok ? null : result.reason === 'unsupported-type' ? props.t('wallpaper.error.type') : props.t('wallpaper.error.size'));
    if (result.ok) void props.listRecentWallpapers().then(setRecent);
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
      {wallpaper.enabled && wallpaper.path.length > 0 ? (
        <div className="dth-wallpaper-preview" aria-label={props.t('wallpaper.preview')}>
          <img src={wallpaper.path} alt="" onError={(event) => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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
      <Slider id="dth-wp-x" label={props.t('wallpaper.positionX')} min={0} max={100} step={1} value={wallpaper.positionX} onChange={(v) => setWallpaper({ positionX: v })} format={(v) => `${v}%`} disabled={!wallpaper.enabled} />
      <Slider id="dth-wp-y" label={props.t('wallpaper.positionY')} min={0} max={100} step={1} value={wallpaper.positionY} onChange={(v) => setWallpaper({ positionY: v })} format={(v) => `${v}%`} disabled={!wallpaper.enabled} />
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
  const setPet = (patch: Partial<typeof pet>) => props.update(patchTop(props.config, 'pet', { ...pet, ...patch }));

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
  const setEffects = (patch: Partial<typeof effects>) => props.update(patchTop(props.config, 'effects', { ...effects, ...patch }));
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
  const setEffects = (patch: Partial<typeof effects>) => props.update(patchTop(props.config, 'effects', { ...effects, ...patch }));
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
      <Slider id="dth-p-count" label={props.t('particles.count')} min={0} max={200} step={1} value={effects.particleCount} onChange={(v) => setEffects({ particleCount: v })} format={(v) => (v === 0 ? 'Auto' : String(v))} disabled={!effects.enabled} />
      <Slider id="dth-p-size" label={props.t('particles.size')} min={1} max={6} step={0.5} value={effects.particleSize} onChange={(v) => setEffects({ particleSize: v })} format={(v) => v.toFixed(1)} disabled={!effects.enabled} />
      <Slider id="dth-p-speed" label={props.t('particles.speed')} min={0.2} max={3} step={0.1} value={effects.particleSpeed} onChange={(v) => setEffects({ particleSpeed: v })} format={(v) => `${v.toFixed(1)}×`} disabled={!effects.enabled} />
      <Slider id="dth-p-opacity" label={props.t('particles.opacity')} min={0} max={1} step={0.01} value={effects.particleOpacity} onChange={(v) => setEffects({ particleOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!effects.enabled} />
      <Toggle id="dth-p-connect" label={props.t('particles.connect')} checked={effects.connectLines} onChange={(v) => setEffects({ connectLines: v })} disabled={!effects.enabled} />
      <Toggle id="dth-p-mouse" label={props.t('particles.mouse')} checked={effects.mouseInteraction} onChange={(v) => setEffects({ mouseInteraction: v })} disabled={!effects.enabled} />
      <Toggle id="dth-p-auto" label={props.t('particles.autoColors')} checked={effects.autoThemeColors} onChange={(v) => setEffects({ autoThemeColors: v })} disabled={!effects.enabled} />
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
  const setAppearance = (patch: Partial<typeof appearance>) => props.update(patchTop(props.config, 'appearance', { ...appearance, ...patch }));
  const setGlass = (patch: Partial<typeof glass>) => props.update(patchTop(props.config, 'glass', { ...glass, ...patch }));

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
        disabled={!supportsContentVariant(props.config.theme)}
      />
      <Segmented<'0.5' | '1'>
        id="dth-content-tint"
        label={props.t('content.tint')}
        value={appearance.diffTint <= 0.5 ? '0.5' : '1'}
        options={[
          { value: '0.5', label: props.t('content.tint.soft') },
          { value: '1', label: props.t('content.tint.standard') },
        ]}
        onChange={(v) => setAppearance({ diffTint: Number(v) })}
      />
      <Notice tone="info">{props.t('content.hint')}</Notice>
      {supportsContentVariant(props.config.theme) ? null : <Notice tone="info">{props.t('content.variantOnly')}</Notice>}

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

function CustomThemeSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = props.config.customThemes.find((th) => th.id === editingId) ?? null;
  const issues = editing !== null ? contrastIssues(editing.colors) : [];

  const basePalette = (id: string): ThemePalette => resolvePalette(id, props.config.customThemes) ?? THEMES[0].palette;

  const newTheme = () => {
    const base = THEMES[0];
    const id = `custom-${Date.now().toString(36)}`;
    const custom: CustomThemeConfig = { id, name: `${base.name} Copy`, base: base.id, colors: colorsFromPalette(base.palette) };
    props.update({ ...props.config, customThemes: [...props.config.customThemes, custom] });
    setEditingId(id);
  };

  const saveEditing = () => {
    if (editing === null) return;
    const name = editing.name.trim().length > 0 ? editing.name.trim() : 'Custom';
    const updated = { ...editing, name };
    props.update({
      ...props.config,
      customThemes: props.config.customThemes.map((th) => (th.id === editing.id ? updated : th)),
    });
  };

  const updateEditing = (patch: Partial<CustomThemeConfig>) => {
    if (editing === null) return;
    props.update({
      ...props.config,
      customThemes: props.config.customThemes.map((th) => (th.id === editing.id ? { ...th, ...patch } : th)),
    });
  };

  const updateColors = (patch: Partial<CustomThemeColors>) => {
    if (editing === null) return;
    updateEditing({ colors: { ...editing.colors, ...patch } });
  };

  const applyHarmony = (kind: HarmonyKind) => {
    if (editing === null) return;
    const base = basePalette(editing.base);
    const seed = editing.colors.primary;
    const isDark = base.colorScheme === 'dark';
    updateEditing({ colors: generateHarmony(kind, seed, isDark) });
  };

  return (
    <Section title={props.t('custom.title')} actions={<Button variant="primary" onClick={newTheme}>{props.t('custom.create')}</Button>}>
      {props.config.customThemes.length === 0 ? <Notice tone="info">{props.t('custom.empty')}</Notice> : (
        <div className="dth-custom-list">
          {props.config.customThemes.map((th) => (
            <div key={th.id} className="dth-custom-item">
              <button
                type="button"
                className={`dth-custom-item-name${props.config.theme === th.id ? ' is-active' : ''}`}
                onClick={() => { props.update(patchTop(props.config, 'theme', th.id)); setEditingId(th.id); }}
              >
                {th.name}
              </button>
              <div className="dth-row-actions">
                <Button onClick={() => setEditingId(th.id)}>{props.t('custom.save')}</Button>
                <Button onClick={() => {
                  const copy = { ...th, id: `custom-${Date.now().toString(36)}`, name: `${th.name} Copy` };
                  props.update({ ...props.config, customThemes: [...props.config.customThemes, copy] });
                }}>{props.t('custom.copy')}</Button>
                <Button variant="danger" onClick={() => {
                  const remaining = props.config.customThemes.filter((x) => x.id !== th.id);
                  const theme = props.config.theme === th.id ? (remaining[0]?.id ?? 'quantum-blue') : props.config.theme;
                  props.update({ ...props.config, customThemes: remaining, theme });
                }}>{props.t('custom.delete')}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing !== null ? (
        <div className="dth-custom-editor">
          <div className="dth-field">
            <div className="dth-field-label"><label>{props.t('custom.name')}</label></div>
            <input type="text" className="dth-input" value={editing.name} onChange={(e) => updateEditing({ name: e.currentTarget.value })} />
          </div>
          <Select
            id="dth-custom-base"
            label={props.t('custom.base')}
            value={editing.base}
            options={THEMES.map((th) => ({ value: th.id as string, label: th.name }))}
            onChange={(v) => updateEditing({ base: v })}
          />
          <ColorPicker id="dth-c-primary" label={props.t('custom.primary')} value={editing.colors.primary} onChange={(v) => updateColors({ primary: v })} />
          <ColorPicker id="dth-c-accent" label={props.t('custom.accent')} value={editing.colors.accent} onChange={(v) => updateColors({ accent: v })} />
          <ColorPicker id="dth-c-bg" label={props.t('custom.background')} value={editing.colors.background} onChange={(v) => updateColors({ background: v })} />
          <ColorPicker id="dth-c-panel" label={props.t('custom.panel')} value={editing.colors.panel} onChange={(v) => updateColors({ panel: v })} />
          <ColorPicker id="dth-c-text" label={props.t('custom.text')} value={editing.colors.text} onChange={(v) => updateColors({ text: v })} />
          <ColorPicker id="dth-c-particle" label={props.t('custom.particle')} value={editing.colors.particle} onChange={(v) => updateColors({ particle: v })} />
          <ColorPicker id="dth-c-glow" label={props.t('custom.glow')} value={editing.colors.glow} onChange={(v) => updateColors({ glow: v })} />
          <div className="dth-field">
            <div className="dth-field-label"><label>{props.t('custom.harmony')}</label></div>
            <div className="dth-harmony">
              {HARMONY_KINDS.map((kind) => (
                <Button key={kind} onClick={() => applyHarmony(kind)}>{props.t(`custom.harmony.${kind}` as I18nKey)}</Button>
              ))}
            </div>
          </div>
          {issues.length > 0 ? (
            <div className="dth-row-actions">
              <Notice tone="warn">{props.t('custom.contrast.warn')}</Notice>
              <Button onClick={() => updateColors(fixContrast(editing.colors))}>{props.t('custom.contrast.fix')}</Button>
            </div>
          ) : null}
          <div className="dth-row-actions">
            <Button variant="primary" onClick={saveEditing}>{props.t('custom.save')}</Button>
            <Button onClick={() => props.update(patchTop(props.config, 'theme', editing.id))}>{props.t('theme.title')}</Button>
          </div>
        </div>
      ) : null}
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
        onChange={(v) => props.update(patchTop(props.config, 'performance', { ...perf, level: v }))}
      />
      {perf.level === 'quality' ? <Notice tone="warn">{props.t('performance.level.quality.desc')}</Notice> : null}
      <Segmented
        id="dth-perf-speed"
        label={props.t('performance.animationSpeed')}
        value={effects.animationSpeed}
        options={SPEED_OPTIONS.map((v) => ({ value: v, label: props.t(`performance.speed.${v}` as I18nKey) }))}
        onChange={(v) => props.update(patchTop(props.config, 'effects', { ...effects, animationSpeed: v }))}
      />
    </Section>
  );
}

function TransferSection(props: { config: DesktopThemesConfig; t: Translate; update: (n: DesktopThemesConfig) => void }) {
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const doExport = () => {
    const text = exportConfigJson(props.config);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'dsh-desktop-themes.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

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

  const activePalette = resolvePalette(props.config.theme, props.config.customThemes);

  return (
    <Section title={props.t('transfer.title')}>
      <div className="dth-row-actions">
        <Button variant="primary" onClick={doExport}>{props.t('transfer.export')}</Button>
        <input ref={importRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={doImport} />
        <Button onClick={() => importRef.current?.click()}>{props.t('transfer.import')}</Button>
      </div>
      <Notice tone="info">{props.t('transfer.import.desc')}</Notice>
      {message !== null ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="dth-row-actions">
        <Button onClick={() => props.update(patchTop(props.config, 'font', { ...DEFAULT_FONT }))}>{props.t('reset.section')}</Button>
        <Button onClick={() => props.update(patchTop(props.config, 'appearance', { ...DEFAULT_APPEARANCE }))}>{props.t('reset.section')}</Button>
        {activePalette !== undefined ? <Button onClick={() => props.update(applyBuiltinThemePreset(props.config, 'obsidian-gold'))}>{props.t('reset.theme')}</Button> : null}
      </div>
      <Notice tone="info">{props.t('reset.all.desc')}</Notice>
      <div className="dth-row-actions">
        <Button variant="danger" onClick={() => props.update(createDefaultConfig())}>{props.t('reset.all')}</Button>
      </div>
    </Section>
  );
}
