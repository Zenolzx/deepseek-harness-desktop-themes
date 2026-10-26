/**
 * Theme palette → host alias and Shiki syntax-token mapping.
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
import { adjustLightness, contrastRatio, ensureContrast, mixHex, readableOn, rgba } from '../utils/color.ts';

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
 * Hairline alpha per scheme. A light theme can take more ink before a 0.5px
 * line reads as a hard rule; a dark theme needs less white to stay a hairline.
 */
export const BORDER_ALPHA = {
  light: { l1: 0.09, l2: 0.16, l3: 0.23, l4: 0.31, thin: 0.1 },
  dark: { l1: 0.09, l2: 0.14, l3: 0.2, l4: 0.27, thin: 0.07 },
} as const;

/** Shiki's supported CSS-variable theme, tuned against each code surface. */
export function buildSyntaxTokens(p: ThemePalette): Record<string, string> {
  const dark = p.colorScheme === 'dark';
  const code = p.codeBlock;
  const readable = (color: string) => {
    const adjusted = ensureContrast(color, code, 4.5);
    return contrastRatio(adjusted, code) >= 4.5 ? adjusted : readableOn(code, '#111113', '#ffffff');
  };
  return {
    '--shiki-foreground': readable(p.textPrimary),
    '--shiki-background': code,
    '--shiki-token-constant': readable(p.accent),
    '--shiki-token-string': readable(dark ? '#86d7a3' : '#24764e'),
    '--shiki-token-comment': readable(dark ? '#a7a6a2' : '#687075'),
    '--shiki-token-keyword': readable(dark ? '#e8a0bd' : '#a23260'),
    '--shiki-token-parameter': readable(dark ? '#e6bf7a' : '#995214'),
    '--shiki-token-function': readable(dark ? '#c5abf2' : '#6741a6'),
    '--shiki-token-string-expression': readable(dark ? '#a0d8c0' : '#2b7059'),
    '--shiki-token-punctuation': readable(p.textSecondary),
    '--shiki-token-link': readable(p.accent),
  };
}

/**
 * Emit the full alias-token dictionary for a palette. Ink-derived tokens
 * (borders, hover/active fills, scrollbars) are derived from the palette's
 * `textPrimary` so light themes get dark ink and dark themes get light ink
 * with a single code path.
 */
export function buildThemeTokens(p: ThemePalette): Record<string, string> {
  const ink = p.textPrimary;
  const dark = p.colorScheme === 'dark';
  const border = BORDER_ALPHA[dark ? 'dark' : 'light'];
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

    // Borders. The Windows frame deliberately removes the sidebar hairline, so
    // the chrome/canvas colour step carries the split; these tokens make cards,
    // inputs and indicators legible on the now-distinct surfaces.
    '--dsw-alias-border-l1': rgba(ink, border.l1),
    '--dsw-alias-border-l2': rgba(ink, border.l2),
    '--dsw-alias-border-l2-darkmode-thin': rgba(ink, border.thin),
    '--dsw-alias-border-l3': rgba(ink, border.l3),
    '--dsw-alias-border-l4': rgba(ink, border.l4),
    '--dsw-alias-border-inverted': rgba(ink, border.l1),
    '--dsw-alias-border-inverted2': rgba(ink, border.l2),

    // Elevation. The product defaults assume its own neutral grey; on paper
    // and coloured cinematic grounds a theme-coloured shadow reads as depth
    // instead of a dirty halo.
    '--dsw-elevation-soft': `0 1px 2px ${rgba(p.shadow, dark ? 0.34 : 0.18)}`,
    '--dsw-elevation-panel': `0 8px 24px ${rgba(p.shadow, dark ? 0.46 : 0.12)}`,
    '--dsw-elevation-prominent': `0 16px 40px ${rgba(p.shadow, dark ? 0.56 : 0.18)}`,
    '--dsw-elevation-stroke-color': rgba(ink, border.l2),

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
    // `label-dimmed` is still body-adjacent copy (timestamps, hints), so it
    // reuses the muted tone rather than a 50% wash that fails AA on every
    // light theme and on the brighter dark panels.
    '--dsw-alias-label-dimmed': p.textMuted,
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
    //
    // The product draws a flat 5px thumb with no track, so the old
    // `rgba(textSecondary, .4)` read as a dark bar floating over pale content —
    // visible in every scrollable pane (the diff view's horizontal bar was the
    // worst offender). Ink-derived low alphas keep the thumb readable but let
    // it recede into the surface.
    '--dsw-alias-scrollbar-bg-l1': rgba(ink, 0.14),
    '--dsw-alias-scrollbar-bg-l2': rgba(ink, 0.18),
    '--dsw-alias-scrollbar-hover-l1': rgba(ink, 0.28),
    '--dsw-alias-scrollbar-hover-l2': rgba(ink, 0.34),

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
 * Lift a derived text tone until it clears AA on every surface the reader sees.
 * Custom backgrounds and panels can differ a lot, so adjusting against the base
 * alone is not enough: the raised panel is often the lighter (dark theme) or
 * darker (light theme) surface where the same ink fails first.
 */
function readableTone(start: string, backgrounds: readonly string[], isDark: boolean): string {
  let color = start;
  for (let i = 0; i < 60; i += 1) {
    if (backgrounds.every((background) => contrastRatio(color, background) >= 4.5)) return color;
    color = adjustLightness(color, isDark ? 0.02 : -0.02);
  }
  return color;
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
  const surfaces = [colors.background, bgSurface, bgSurface2, bgSurface3];
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
    // Derived tones can land anywhere depending on the user's background and
    // ink; lift them to the AA floor so a custom theme never ships unreadable
    // secondary or muted copy. The primary text stays exactly as picked so the
    // settings UI can still point at the failing pair and offer a fix.
    textSecondary: readableTone(mute(textPrimary, colors.background, 0.28), surfaces, isDark),
    textMuted: readableTone(mute(textPrimary, colors.background, 0.5), surfaces, isDark),
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
