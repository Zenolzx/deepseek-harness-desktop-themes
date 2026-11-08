/**
 * Small, dependency-free color helpers shared by the theme token builder and
 * the appearance (transparency / glass) presenters. All inputs are `#RRGGBB`
 * or `#RRGGBBAA` hex strings; all outputs are CSS color strings.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse `#RGB`, `#RRGGBB`, or `#RRGGBBAA` into integer channels. */
export function hexToRgb(hex: string): Rgb {
  let value = hex.trim();
  if (value.startsWith('#')) value = value.slice(1);
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const int = parseInt(value.slice(0, 6), 16);
  if (Number.isNaN(int)) return { r: 0, g: 0, b: 0 };
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff,
  };
}

/** Build an `rgba(r, g, b, a)` string from a hex color and an alpha (0..1). */
export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Mix `from` toward `to` by `weight` (0..1, 0 = from, 1 = to) and return a
 * `#RRGGBB` string. Used to derive hover / dimmed shades without hand-tuning.
 */
export function mixHex(from: string, to: string, weight: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const w = Math.min(1, Math.max(0, weight));
  const channel = (x: number, y: number) => Math.round(x + (y - x) * w);
  return `#${[channel(a.r, b.r), channel(a.g, b.g), channel(a.b, b.b)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Relative luminance (0..1) of a hex color, per WCAG 2.x. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Parse a `#RRGGBB` color into its HSL components (h 0..360, s/l 0..1). */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

function hslToRgbChannel(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/** Build a `#RRGGBB` color from HSL components. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const lig = Math.min(1, Math.max(0, l));
  if (sat === 0) {
    const v = Math.round(lig * 255).toString(16).padStart(2, '0');
    return `#${v}${v}${v}`;
  }
  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
  const p = 2 * lig - q;
  const ch = (t: number) => Math.round(hslToRgbChannel(p, q, t) * 255).toString(16).padStart(2, '0');
  return `#${ch(hue / 360 + 1 / 3)}${ch(hue / 360)}${ch(hue / 360 - 1 / 3)}`;
}

/** Rotate a color's hue by `degrees` (may be negative). */
export function rotateHue(hex: string, degrees: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h + degrees, s, l);
}

/** Scale a color's saturation by `factor` (1 = unchanged, 0 = grayscale). */
export function adjustSaturation(hex: string, factor: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, Math.min(1, Math.max(0, s * factor)), l);
}

/** Lighten (amount > 0) or darken (amount < 0) toward white/black. */
export function adjustLightness(hex: string, amount: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.min(1, Math.max(0, l + amount)));
}

/**
 * Pick the more readable of two candidate foregrounds on a background. When
 * neither reaches `minRatio`, darken/lighten the winner until it does.
 */
export function readableOn(bg: string, dark: string, light: string, minRatio = 4.5): string {
  const darkRatio = contrastRatio(dark, bg);
  const lightRatio = contrastRatio(light, bg);
  let winner = darkRatio >= lightRatio ? dark : light;
  let ratio = Math.max(darkRatio, lightRatio);
  let guard = 0;
  // Mid-luminance accents can need black even though luminance is below 0.5.
  // Using that threshold could keep trying to lighten an already-white winner.
  const lighter = contrastRatio('#ffffff', bg) >= contrastRatio('#000000', bg);
  while (ratio < minRatio && guard < 40) {
    winner = lighter ? adjustLightness(winner, 0.04) : adjustLightness(winner, -0.04);
    ratio = contrastRatio(winner, bg);
    guard += 1;
  }
  return winner;
}

/** Adjust `fg` toward readable contrast against `bg` (returns fg when fine). */
export function ensureContrast(fg: string, bg: string, minRatio = 4.5): string {
  let current = fg;
  let ratio = contrastRatio(current, bg);
  let guard = 0;
  // Push the foreground away from the background: a darker-than-bg color gets
  // darker, a lighter-than-bg color gets lighter.
  const darken = relativeLuminance(current) < relativeLuminance(bg);
  while (ratio < minRatio && guard < 80) {
    current = darken ? adjustLightness(current, -0.03) : adjustLightness(current, 0.03);
    ratio = contrastRatio(current, bg);
    guard += 1;
  }
  return current;
}
