/**
 * Live effect previews for the settings UI. Each preview renders from the
 * current config so dragging a slider or switching a preset gives immediate,
 * comparable feedback.
 */

import type { CSSProperties } from 'react';
import { resolveGlass } from '../appearance/glass.ts';
import { codeFontStack, uiFontStack } from '../appearance/fonts.ts';
import { rgba } from '../utils/color.ts';
import { resolvePalette } from '../themes/index.ts';
import { buildSyntaxTokens } from '../themes/palette.ts';
import { buildContentLayer, effectiveContentStyle } from '../appearance/content.ts';
import { CODE_PREVIEW_TEXT, FONT_PREVIEW_TEXT } from '../fonts/presets.ts';
import type { DesktopThemesConfig } from '../config/types.ts';

function previewBackdrop(config: DesktopThemesConfig): CSSProperties {
  const palette = resolvePalette(config.theme, config.customThemes);
  const base = palette?.bgBase ?? '#1a1b26';
  const accent = palette?.accent ?? '#7aa2f7';
  const glow = palette?.glow ?? '#bb9af7';
  return {
    background: [
      `radial-gradient(circle at 18% 30%, ${rgba(accent, 0.44)} 0, transparent 38%)`,
      `radial-gradient(circle at 82% 72%, ${rgba(glow, 0.5)} 0, transparent 42%)`,
      `linear-gradient(135deg, ${base}, ${palette?.bgSurface2 ?? '#3b4261'})`,
    ].join(', '),
  };
}

function PreviewSurface(props: { style: CSSProperties; backdrop: CSSProperties; text: string; value: string }) {
  return (
    <div className="dth-preview" role="img" aria-label={props.text} style={props.backdrop}>
      <div className="dth-preview-surface" style={props.style}>
        <span className="dth-preview-text">{props.text}</span>
        <span className="dth-preview-value">{props.value}</span>
      </div>
    </div>
  );
}

/** Preview of the base-surface transparency (windowOpacity). */
export function TransparencyPreview(props: { config: DesktopThemesConfig }) {
  const appearance = props.config.appearance;
  const alpha = appearance.transparencyEnabled ? appearance.windowOpacity : 1;
  const palette = resolvePalette(props.config.theme, props.config.customThemes);
  const style: CSSProperties = {
    background: rgba(palette?.bgSurface ?? '#1a1b26', alpha),
    border: `1px solid ${rgba(palette?.textPrimary ?? '#ffffff', 0.12)}`,
  };
  return <PreviewSurface style={style} backdrop={previewBackdrop(props.config)} text="透明度预览" value={`${Math.round(alpha * 100)}%`} />;
}

/** Preview of the glassmorphism surface (blur + saturation + shadow). */
export function GlassPreview(props: { config: DesktopThemesConfig }) {
  const glass = props.config.glass;
  const resolved = resolveGlass(glass);
  const palette = resolvePalette(props.config.theme, props.config.customThemes);
  const blur = glass.enabled && resolved.applyBlur ? `blur(${resolved.blurPx}px) saturate(${glass.saturation})` : 'none';
  const style: CSSProperties = {
    background: rgba(palette?.bgSurface3 ?? '#111113', glass.panelOpacity),
    backdropFilter: blur,
    WebkitBackdropFilter: blur,
    border: `1px solid ${rgba(palette?.textPrimary ?? '#ffffff', glass.borderHighlight * 0.14)}`,
    boxShadow: resolved.shadowStrength > 0 ? `0 8px 24px rgba(0, 0, 0, ${(resolved.shadowStrength * 0.4).toFixed(2)})` : 'none',
  };
  const value = glass.enabled && resolved.applyBlur ? `blur ${resolved.blurPx}px` : '无模糊';
  return <PreviewSurface style={style} backdrop={previewBackdrop(props.config)} text="毛玻璃预览" value={value} />;
}

/** Large live preview of the currently selected UI + code fonts. */
export function LiveFontPreview(props: { config: DesktopThemesConfig }) {
  const font = props.config.font;
  return (
    <div className="dth-font-live" role="img" aria-label="Font preview">
      <div className="dth-font-live-line" style={{ fontFamily: uiFontStack(font) }}>
        {FONT_PREVIEW_TEXT}
      </div>
      <code className="dth-font-live-code" style={{ fontFamily: codeFontStack(font) }}>
        {CODE_PREVIEW_TEXT}
      </code>
    </div>
  );
}

/** Palette preview for the two surfaces users inspect most: chat code and diff. */
export function ContentPreview(props: { config: DesktopThemesConfig }) {
  const palette = resolvePalette(props.config.theme, props.config.customThemes);
  if (palette === undefined) return null;
  const refined = effectiveContentStyle(props.config) === 'refined';
  const layer = buildContentLayer(palette, { style: 'refined', tint: props.config.appearance.diffTint });
  const syntax = refined ? buildSyntaxTokens(palette) : palette.colorScheme === 'dark'
    ? { '--shiki-token-keyword': '#faa2c1', '--shiki-token-function': '#b197fc', '--shiki-token-constant': '#4dabf7' }
    : { '--shiki-token-keyword': '#d6336c', '--shiki-token-function': '#6741d9', '--shiki-token-constant': '#1c7ed6' };
  const token = (name: string) => layer[name]?.light;
  const added = refined ? token('--dsw-alias-file-diff-added-bg') : '#e6f4e7';
  const deleted = refined ? token('--dsw-alias-file-diff-deleted-bg') : '#fbe9e8';
  const paper = refined ? token('--dth-content-surface') : palette.bgSurface;
  return (
    <div className="dth-content-preview" style={{ background: paper, color: palette.textPrimary, borderColor: rgba(palette.textPrimary, 0.12) }}>
      <div className="dth-content-preview-label" style={{ color: palette.textSecondary }}>Code · Diff</div>
      <div className="dth-content-preview-code" style={{ background: palette.codeBlock, borderColor: rgba(palette.textPrimary, 0.12) }}>
        <span style={{ color: palette.textSecondary }}>ts</span>
        <code><span style={{ color: syntax['--shiki-token-keyword'] }}>const</span> total = items.<span style={{ color: syntax['--shiki-token-function'] }}>reduce</span>((sum, item) =&gt; sum + item.price, <span style={{ color: syntax['--shiki-token-constant'] }}>0</span>);</code>
      </div>
      <div className="dth-content-preview-diff" style={{ background: paper, borderColor: rgba(palette.textPrimary, 0.12) }}>
        <div style={{ background: deleted, borderInlineStartColor: refined ? token('--dsw-alias-file-diff-deleted-marker') : '#ce4e5a' }}>− const total = items.length;</div>
        <div style={{ background: added, borderInlineStartColor: refined ? token('--dsw-alias-file-diff-added-marker') : '#01a241' }}>+ const total = sum(items);</div>
      </div>
    </div>
  );
}

const DENSITY_DOTS: Record<string, number> = { off: 0, low: 10, medium: 16, high: 24 };

/** Compact animated particle preview from the current effect settings. */
export function ParticlesPreview(props: { config: DesktopThemesConfig }) {
  const effects = props.config.effects;
  const palette = resolvePalette(props.config.theme, props.config.customThemes);
  const auto = effects.autoThemeColors || effects.particleColors.length === 0;
  const colors = auto
    ? palette?.particleColors ?? ['#3D7EFF']
    : effects.particleColors;
  const count = effects.enabled ? DENSITY_DOTS[effects.density] ?? 16 : 0;
  const size = effects.particleSize;

  const dots = Array.from({ length: count }, (_, i) => ({
    color: colors[i % colors.length],
    left: (i * 37 + 7) % 96,
    top: (i * 53 + 13) % 88,
    delay: (i * 0.35) % 4,
    dur: 3.5 + (i % 5) * 0.7,
  }));

  return (
    <div
      className="dth-effect-preview"
      data-still={effects.animationSpeed === 'still' ? 'true' : 'false'}
      aria-hidden="true"
    >
      {count === 0 ? (
        <span className="dth-effect-preview-empty">·</span>
      ) : (
        dots.map((d, i) => (
          <i
            key={i}
            className="dth-preview-dot"
            style={{
              background: d.color,
              width: size * 2,
              height: size * 2,
              left: `${d.left}%`,
              top: `${d.top}%`,
              opacity: effects.particleOpacity,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.dur}s`,
            }}
          />
        ))
      )}
    </div>
  );
}

const GLOW_ALPHA: Record<string, number> = { off: 0, soft: 0.18, standard: 0.32, bright: 0.48 };

/** Compact ambient-glow preview from the current light-intensity setting. */
export function GlowPreview(props: { config: DesktopThemesConfig }) {
  const effects = props.config.effects;
  const palette = resolvePalette(props.config.theme, props.config.customThemes);
  const auto = effects.autoThemeColors || effects.glowColors.length === 0;
  const colors = auto
    ? palette?.glowColors ?? ['#3D7EFF']
    : effects.glowColors.length > 0
      ? effects.glowColors
      : effects.particleColors;
  const alpha = GLOW_ALPHA[effects.glowIntensity] ?? 0;
  const c0 = colors[0] ?? '#3D7EFF';
  const c1 = colors[1] ?? c0;

  return (
    <div
      className="dth-glow-preview"
      aria-hidden="true"
      style={{
        background: [
          `radial-gradient(circle at 30% 30%, ${rgba(c0, alpha)} 0%, transparent 60%)`,
          `radial-gradient(circle at 72% 66%, ${rgba(c1, alpha * 0.7)} 0%, transparent 60%)`,
        ].join(', '),
      }}
    />
  );
}
