import { hexToRgb } from '../utils/color.ts';

export interface Oklch { l: number; c: number; h: number }
const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));

export function hexToOklch(hex: string): Oklch {
  const rgb = hexToRgb(hex);
  const linear = (v: number) => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4;
  const r = linear(rgb.r), g = linear(rgb.g), b = linear(rgb.b);
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  const L = 0.2104542553*l + 0.793617785*m - 0.0040720468*s;
  const a = 1.9779984951*l - 2.428592205*m + 0.4505937099*s;
  const B = 0.0259040371*l + 0.7827717662*m - 0.808675766*s;
  return { l: L, c: Math.hypot(a, B), h: (Math.atan2(B, a)*180/Math.PI + 360)%360 };
}

function linearRgb({ l: L, c, h }: Oklch): number[] {
  const a = c*Math.cos(h*Math.PI/180), b = c*Math.sin(h*Math.PI/180);
  const l = (L + 0.3963377774*a + 0.2158037573*b)**3;
  const m = (L - 0.1055613458*a - 0.0638541728*b)**3;
  const s = (L - 0.0894841775*a - 1.291485548*b)**3;
  return [4.0767416621*l-3.3077115913*m+0.2309699292*s, -1.2684380046*l+2.6097574011*m-0.3413193965*s, -0.0041960863*l-0.7034186147*m+1.707614701*s];
}

/** Map to sRGB by reducing chroma rather than clipping individual channels. */
export function oklchToHex(value: Oklch): string {
  const safe = { l: clamp(value.l), c: clamp(value.c, 0, 0.4), h: ((value.h%360)+360)%360 };
  let rgb = linearRgb(safe);
  if (rgb.some(v => v < -0.000001 || v > 1.000001)) {
    let lo = 0, hi = safe.c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo+hi)/2;
      const candidate = linearRgb({ ...safe, c: mid });
      if (candidate.every(v => v >= -0.000001 && v <= 1.000001)) lo = mid;
      else hi = mid;
    }
    rgb = linearRgb({ ...safe, c: lo });
  }
  return '#' + rgb.map(v => Math.round(clamp(v <= 0.0031308 ? 12.92*v : 1.055*v**(1/2.4)-0.055)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
