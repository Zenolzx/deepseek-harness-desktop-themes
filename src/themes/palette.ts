/**
 * Theme palette → `--dsw-alias-*` token mapping.
 *
 * DeepSeek Harness themes are expressed as overrides on the semantic alias
 * token layer (see `design-platform.css`). Each theme supplies a compact
 * `ThemePalette`; `buildThemeTokens` derives the full alias-token dictionary
 * so the themes never repeat hard-coded values and every surface — background,
 * text, accent, borders, states, code, sidebar, scrollbars, buttons — stays
 * consistent from one place.
 *
 * The palette also carries plugin-specific effect metadata (particle / glow
 * colors, shadow, glow) which is emitted as `--dth-*` custom properties and
 * consumed by the effect engine and settings previews.
 */

import type { CustomThemeColors } from '../config/types.ts';
import { adjustLightness, contrastRatio, mixHex, readableOn, rgba } from '../utils/color.ts';

export interface ThemePalette {
  /** Built-in theme id. */
  id: string;
  /** Base color scheme (drives `body[data-ds-dark-theme]`). */
  colorScheme: 'light' | 'dark';
  /** Application base background. */
  bgBase: string;
  /** Raised surface (layer-1) background — panels. */
  bgSurface: string;
  /** Nested surface (layer-2) background — secondary panels. */
  bgSurface2: string;
  /** Deepest raised surface (layer-3) — menus, tooltips. */
  bgSurface3: string;
  /** Overlay / popover background. */
  bgOverlay: string;
  /** Primary text. */
  textPrimary: string;
  /** Secondary text. */
  textSecondary: string;
  /** Muted / tertiary text. */
  textMuted: string;
  /** Accent color. */
  accent: string;
  /** Accent hover color. */
  accentHover: string;
  /** Foreground (text) color placed on top of the accent. */
  accentForeground: string;
  /** Success state color. */
  success: string;
  /** Warning state color. */
  warning: string;
  /** Danger / error state color. */
  danger: string;
  /** Markdown code block background. */
  codeBlock: string;
  /** Inline code background. */
  inlineCode: string;
  /** Sidebar column fill. */
  sidebarFill: string;
  /** Soft shadow color (for glass panels). */
  shadow: string;
  /** Ambient glow color (for the breathing / aurora layers). */
  glow: string;
  /** Particle colors (the effect engine samples from these). */
  particleColors: string[];
  /** Dynamic glow colors (the effect engine samples from these). */
  glowColors: string[];
}

/** Derive a muted text tone: mix primary text toward the background. */
function mute(text: string, bg: string, weight: number): string {
  return mixHex(text, bg, weight);
}

/** Build hover/secondary shades that never leave the readable range. */
function deriveAccentHover(accent: string, bg: string): string {
  const hover = contrastRatio(accent, bg) >= 3 ? adjustLightness(accent, 0.06) : adjustLightness(accent, -0.06);
  return hover;
}

/**
 * Ink drawn on top of `label-primary`-filled surfaces — the semantic inverse of
 * the primary label color (`design-platform.css` maps it to the opposite end of
 * the neutral ramp per scheme). The product wordmark paints its HARNESS chip
 * glyphs with `--dsw-alias-label-primary-inverted` over a `currentColor`
 * (label-primary) background, so deriving it from the same source as
 * `label-primary` makes the glyph invisible (same color on same color).
 */
function invertedLabelInk(ink: string): string {
  const light = '#FFFFFF';
  const dark = '#111113';
  return contrastRatio(ink, light) >= contrastRatio(ink, dark) ? light : dark;
}

/**
 * Emit the full alias-token dictionary for a palette. Ink-derived tokens
 * (borders, hover/active fills, scrollbars) are derived from the palette's
 * `textPrimary` so light themes get dark ink and dark themes get light ink
 * with a single code path.
 */
export function buildThemeTokens(p: ThemePalette): Record<string, string> {
  const ink = p.textPrimary;
  const tokens: Record<string, string> = {
    // Backgrounds.
    '--dsw-alias-bg-base': p.bgBase,
    '--dsw-alias-bg-layer-1': p.bgSurface,
    '--dsw-alias-bg-layer-2': p.bgSurface2,
    '--dsw-alias-bg-layer-3': p.bgSurface3,
    '--dsw-alias-bg-overlay': p.bgOverlay,
    '--dsw-alias-bg-module-platform': p.bgSurface3,
    '--dsw-alias-bg-multi-select': p.bgSurface2,
    '--dsw-alias-bg-skeleton': rgba(ink, 0.08),
    '--dsw-alias-bg-mask-1': rgba('#000000', 0.5),
    '--dsw-alias-bg-mask-2': rgba('#000000', 0.2),
    '--dsw-alias-bg-mask-3': rgba('#000000', 0.48),
    '--dsw-alias-bg-mask-photo': rgba('#000000', 0.88),
    '--dsw-alias-bg-mask-drop': rgba('#000000', 0.7),

    // Borders.
    '--dsw-alias-border-l1': rgba(ink, 0.06),
    '--dsw-alias-border-l2': rgba(ink, 0.12),
    '--dsw-alias-border-l2-darkmode-thin': rgba(ink, 0.06),
    '--dsw-alias-border-l3': rgba(ink, 0.16),
    '--dsw-alias-border-l4': rgba(ink, 0.2),
    '--dsw-alias-border-inverted': rgba(ink, 0.06),
    '--dsw-alias-border-inverted2': rgba(ink, 0.08),

    // Brand / accent.
    '--dsw-alias-brand-primary': p.accent,
    '--dsw-alias-brand-primary-invert': p.accentForeground,
    '--dsw-alias-brand-primary-new-colorprimary-new-color': p.accent,
    '--dsw-alias-brand-text': p.textPrimary,

    // Text.
    '--dsw-alias-label-primary': p.textPrimary,
    '--dsw-alias-label-secondary': p.textSecondary,
    '--dsw-alias-label-tertiary': p.textMuted,
    '--dsw-alias-label-caption': p.textMuted,
    '--dsw-alias-label-dimmed': mute(p.textPrimary, p.bgBase, 0.5),
    '--dsw-alias-label-primary-bluish': p.textPrimary,
    '--dsw-alias-label-primary-dimmed': p.textSecondary,
    '--dsw-alias-label-primary-foreground': p.accentForeground,
    '--dsw-alias-label-primary-inverted': invertedLabelInk(ink),

    // Interactive surfaces.
    '--dsw-alias-interactive-bg-hover': rgba(ink, 0.08),
    '--dsw-alias-interactive-bg-active': rgba(ink, 0.14),
    '--dsw-alias-interactive-bg-hover-solid': p.bgSurface3,
    '--dsw-alias-interactive-bg-hover-accent': rgba(p.accent, 0.24),
    '--dsw-alias-interactive-bg-hover-danger': rgba(p.danger, 0.15),

    // Buttons.
    '--dsw-alias-button-primary-fill': p.accent,
    '--dsw-alias-button-primary-hover': p.accentHover,
    '--dsw-alias-button-primary-dimmed': p.bgSurface3,
    '--dsw-alias-button-elevated-fill': p.bgSurface3,
    '--dsw-alias-button-floating-fill': p.bgSurface2,
    '--dsw-alias-button-floating-hover': p.bgSurface3,
    '--dsw-alias-button-ghost-active-border': p.textMuted,
    '--dsw-alias-button-ghost-active-fill': p.bgSurface3,
    '--dsw-alias-button-ghost-active-hover': p.bgSurface2,
    '--dsw-alias-button-contrast-fill': p.textPrimary,
    '--dsw-alias-button-info-fill': p.accent,
    '--dsw-alias-button-info-hover': p.accentHover,
    '--dsw-alias-button-tool-bar-fill': rgba('#545557', 0.5),
    '--dsw-alias-button-tool-bar-fill-invisible': rgba('#1f1f1f', 0.36),
    '--dsw-alias-button-tool-bar-hover': rgba('#545557', 0.6),

    // Markdown / code.
    '--dsw-alias-markdown-code-block': p.codeBlock,
    '--dsw-alias-markdown-code-block-banner': p.bgSurface3,
    '--dsw-alias-markdown-inline-code': p.inlineCode,
    '--dsw-alias-markdown-code-segment-selected': p.bgSurface3,
    '--dsw-alias-markdown-code-segment-unselected': p.codeBlock,
    '--dsw-alias-markdown-citation': p.inlineCode,
    '--dsw-alias-markdown-tag': p.inlineCode,
    '--dsw-alias-markdown-placeholder': p.bgSurface2,

    // Scrollbars.
    '--dsw-alias-scrollbar-bg-l1': rgba(p.textSecondary, 0.4),
    '--dsw-alias-scrollbar-bg-l2': rgba(p.textSecondary, 0.5),
    '--dsw-alias-scrollbar-hover-l1': rgba(p.textSecondary, 0.55),
    '--dsw-alias-scrollbar-hover-l2': rgba(p.textSecondary, 0.65),

    // States.
    '--dsw-alias-state-success-primary': p.success,
    '--dsw-alias-state-success-secondary': p.success,
    '--dsw-alias-state-success-tertiary': rgba(p.success, 0.2),
    '--dsw-alias-state-warn-primary': p.warning,
    '--dsw-alias-state-warn-secondary': p.warning,
    '--dsw-alias-state-warn-tertiary': rgba(p.warning, 0.2),
    '--dsw-alias-state-warn-label': p.warning,
    '--dsw-alias-state-error-primary': p.danger,
    '--dsw-alias-state-error-secondary': p.danger,
    '--dsw-alias-state-business-primary': p.accent,
    '--dsw-alias-state-business-tertiary': rgba(p.accent, 0.2),

    // Toast / tooltip.
    '--dsw-alias-toast-bg': p.bgSurface3,
    '--dsw-alias-tooltip-bg': p.bgSurface3,

    // Specific surfaces.
    '--dsw-specific-sidebar-fill': p.sidebarFill,
    '--dsw-specific-sidebar-nav-item-active': rgba(p.textPrimary, 0.1),
    '--dsw-specific-sidebar-nav-item-active-accent': rgba(p.accent, 0.2),
    '--dsw-specific-sidebar-nav-item-hover': rgba(p.textPrimary, 0.06),
    '--dsw-specific-menu': p.bgSurface3,
    '--dsw-specific-selector': p.bgSurface3,
    '--dsw-specific-input-major': p.bgSurface2,
    '--dsw-specific-login-input': p.bgBase,
    '--dsw-specific-bubble': p.bgSurface2,
    '--dsw-specific-bubble-highlight': p.bgSurface3,
    '--dsw-specific-tip': p.bgSurface3,

    // Plugin-specific effect tokens (consumed by the effect engine + previews).
    '--dth-shadow-color': p.shadow,
    '--dth-glow-color': p.glow,
  };
  p.particleColors.forEach((color, i) => {
    tokens[`--dth-particle-${i}`] = color;
  });
  p.glowColors.forEach((color, i) => {
    tokens[`--dth-glow-${i}`] = color;
  });
  return tokens;
}

/**
 * Build a full palette from a custom theme's seven colors plus the structural
 * base (success/warning/danger and surface relationships). Hover, borders and
 * secondary backgrounds are derived automatically; text contrast is enforced.
 */
export function paletteFromCustomColors(colors: CustomThemeColors, base: ThemePalette): ThemePalette {
  const isDark = base.colorScheme === 'dark';
  const bgSurface = colors.panel;
  const bgSurface2 = isDark ? adjustLightness(bgSurface, -0.04) : adjustLightness(bgSurface, 0.02);
  const bgSurface3 = isDark ? adjustLightness(bgSurface, 0.06) : adjustLightness(bgSurface, 0.04);
  const textPrimary = colors.text;
  const accentForeground = readableOn(colors.primary, colors.background, '#ffffff');
  const accentHover = deriveAccentHover(colors.primary, bgSurface);
  return {
    id: 'custom',
    colorScheme: base.colorScheme,
    bgBase: colors.background,
    bgSurface,
    bgSurface2,
    bgSurface3,
    bgOverlay: bgSurface3,
    textPrimary,
    textSecondary: mute(textPrimary, colors.background, 0.28),
    textMuted: mute(textPrimary, colors.background, 0.5),
    accent: colors.primary,
    accentHover,
    accentForeground,
    success: base.success,
    warning: base.warning,
    danger: base.danger,
    codeBlock: isDark ? adjustLightness(colors.background, -0.03) : adjustLightness(colors.background, 0.02),
    inlineCode: bgSurface2,
    sidebarFill: isDark ? adjustLightness(colors.background, -0.02) : adjustLightness(colors.background, 0.01),
    shadow: colors.glow,
    glow: colors.glow,
    particleColors: [colors.particle, colors.accent],
    glowColors: [colors.glow, colors.accent, colors.primary],
  };
}
