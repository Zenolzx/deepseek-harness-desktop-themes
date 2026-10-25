/**
 * Font system: fallback stack construction and CSS generation.
 *
 * Strategy: override the product font tokens (`--dsw-font-family` for UI,
 * `--ds-font-family-code` for code) on **both `:root` and `body`**, because the
 * product's own base sheet redefines them on `body` from its user font-family
 * setting. Also fill the product's `--dsh-font-family-*` seats, and add a small
 * explicit rule set for the places the product hard-codes a family:
 *
 *  - the composer editor declares `font-family: Inter, var(--dsw-font-family)`,
 *    which pins Latin text to Inter and makes a custom UI font appear to do
 *    nothing on an English UI;
 *  - form controls inherit the browser default instead of the product token
 *    in some surfaces.
 *
 * Each stack carries the font's localized family names (e.g. `霞鹜文楷`) next
 * to its English name, so a font installed by the OS under a localized name is
 * still found. Missing fonts fall through the stack — never a blank surface.
 */

import type { FontConfig } from '../config/types.ts';
import { buildCodeStack, buildUiStack } from '../fonts/presets.ts';

/**
 * Generate the CSS that applies the font configuration. Injected once by the
 * presenter and rewritten (idempotently) when the config changes.
 */
export function buildFontCss(font: FontConfig): string {
  const uiStack = buildUiStack(font.uiPreset, font.uiCustomFamily);
  const codeStack = buildCodeStack(font.codePreset, font.codeCustomFamily);
  const smoothing = font.smoothing
    ? `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;`
    : `-webkit-font-smoothing: auto; -moz-osx-font-smoothing: auto; text-rendering: auto;`;
  const ligatures = font.ligatures
    ? `font-variant-ligatures: contextual common-ligatures;`
    : `font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0;`;

  return [
    // The product defines `--dsw-font-family` on `:root` *and* redefines it on
    // `body` from its own user font-family setting:
    //
    //   body { --dsw-font-family: var(--dsh-font-family-text, ...), ...; }
    //
    // A root-only override therefore loses for every descendant of body — the
    // settings panel still inherits the body font, but the conversation and
    // chrome do not. Write the override on both elements, and also fill the
    // product's own `--dsh-font-family-*` seats so its fallback path uses the
    // chosen font too.
    `:root, body {`,
    `  --dsw-font-family: ${uiStack} !important;`,
    `  --ds-font-family-code: ${codeStack} !important;`,
    `  --dsw-font-mono: ${codeStack} !important;`,
    `  --dsh-font-family-text: ${uiStack} !important;`,
    `  --dsh-font-family-code: ${codeStack} !important;`,
    `  --dsh-font-family-terminal: ${codeStack} !important;`,
    `  --dsh-font-family-text-default: ${uiStack} !important;`,
    `  --dsh-font-family-code-default: ${codeStack} !important;`,
    `}`,
    // Use the stack directly as well: a later product rule may rewrite the
    // variables above, but an `!important` font-family declaration on the
    // element still wins for body and form controls.
    `html, body {`,
    `  font-family: ${uiStack} !important;`,
    `}`,
    // The composer pins Latin glyphs to Inter before the token; override the
    // control itself so the chosen font is actually visible. The xterm helper
    // textarea stays untouched (it positions the IME caret, not text).
    `body textarea:not(.xterm-helper-textarea),`,
    `body input:not(.xterm-helper-textarea),`,
    `body select {`,
    `  font-family: ${uiStack} !important;`,
    `}`,
    `body {`,
    `  font-size: ${font.fontSize}px;`,
    `  line-height: ${font.lineHeight};`,
    `  font-weight: ${font.fontWeight};`,
    `  ${smoothing}`,
    `}`,
    `pre, code, kbd, samp {`,
    `  font-family: ${codeStack} !important;`,
    `  font-size: ${font.codeFontSize}px;`,
    `  ${ligatures}`,
    `}`,
  ].join('\n');
}

/** The UI font stack as a plain string (for preview rendering). */
export function uiFontStack(font: FontConfig): string {
  return buildUiStack(font.uiPreset, font.uiCustomFamily);
}

/** The code font stack as a plain string (for preview rendering). */
export function codeFontStack(font: FontConfig): string {
  return buildCodeStack(font.codePreset, font.codeCustomFamily);
}
