/**
 * Host-side schemastery schema for the `ui-desktop-themes` settings namespace.
 *
 * This schema is registered on the Host and serialized over the wire; the
 * Client settings scope validates incoming sections against that serialized
 * schema, so it is the authoritative durable shape. It mirrors the defaults
 * in `defaults.ts` exactly (a resolved empty section must equal the defaults).
 *
 * Only imported by the Host entry and tests — it must never be bundled into
 * the Client (the Client re-validates against the wire schema automatically).
 */
import z from '@deepseek-ai/schemastery';
import { SCHEMA_VERSION } from './types.ts';
import { DEFAULT_PET_SPEECH_LINES } from './defaults.ts';

const FIT_MODES = ['cover', 'contain', 'stretch', 'center', 'tile'] as const;
const BLUR_LEVELS = ['off', 'light', 'standard', 'strong'] as const;
const PERFORMANCE_LEVELS = ['power-saver', 'balanced', 'quality'] as const;
const ANIMATION_SPEEDS = ['still', 'gentle', 'standard', 'active'] as const;
const PARTICLE_DENSITIES = ['off', 'low', 'medium', 'high'] as const;
const LIGHT_INTENSITIES = ['off', 'soft', 'standard', 'bright'] as const;
const RADIUS_LEVELS = ['compact', 'standard', 'soft'] as const;
const WIDTH_LEVELS = ['compact', 'standard', 'wide'] as const;
const CONTENT_STYLES = ['classic', 'refined'] as const;
const PET_STYLES = ['moonfox'] as const;
const VOICE_STYLES = ['normal', 'gentle', 'cheerful', 'playful', 'calm', 'robot'] as const;
const EFFECT_PRESETS = [
  'none',
  'tech-data',
  'starfield',
  'aurora-flow',
  'fireflies',
  'bubbles',
  'sakura',
  'gold-dust',
  'breathing',
  'custom',
] as const;

/**
 * Mark a field volatile when the running schemastery supports it.
 *
 * DSH 0.2.x exposes a plugin's `Config` schema as its settings entry and serves
 * only `.volatile()` fields through `settings.describe`/`configForms`. DSH
 * 0.1.x ships schemastery 3.18.1, which has no `.volatile()`; there the same
 * schema stays ordinary and is registered through `ctx.settings.register()`.
 */
const volatile = <T>(schema: T): T => {
  const candidate = schema as T & { volatile?: () => T };
  return typeof candidate.volatile === 'function' ? candidate.volatile() : schema;
};

const fontSchema = z.object({
  uiPreset: z.string().default('system'),
  codePreset: z.string().default('jetbrains-mono'),
  uiCustomFamily: z.string().default(''),
  codeCustomFamily: z.string().default(''),
  // Legacy v1 fields, kept optional so old persisted sections survive host
  // re-validation; the client migrates them into the preset fields.
  uiFamily: z.string(),
  codeFamily: z.string(),
  chineseFamily: z.string(),
  fontSize: z.number().min(10).max(24).step(1).default(14),
  codeFontSize: z.number().min(9).max(24).step(1).default(13),
  lineHeight: z.number().min(1).max(2.5).step(0.05).default(1.6),
  fontWeight: z.number().min(100).max(900).step(100).default(400),
  ligatures: z.boolean().default(true),
  smoothing: z.boolean().default(true),
});

const appearanceSchema = z.object({
  transparencyEnabled: z.boolean().default(true),
  windowOpacity: z.number().min(0.55).max(1).step(0.01).default(0.94),
  sidebarOpacity: z.number().min(0.55).max(1).step(0.01).default(0.94),
  panelOpacity: z.number().min(0.55).max(1).step(0.01).default(0.96),
  inputOpacity: z.number().min(0.55).max(1).step(0.01).default(0.98),
  borderRadius: z.union(RADIUS_LEVELS).default('soft'),
  contentWidth: z.union(WIDTH_LEVELS).default('standard'),
  animationsEnabled: z.boolean().default(true),
  contentStyle: z.union(CONTENT_STYLES).default('refined'),
  diffTint: z.number().min(0.25).max(2).step(0.25).default(0.75),
});

const wallpaperSchema = z.object({
  enabled: z.boolean().default(true),
  sourceId: z.string().default('builtin:obsidian-gold'),
  path: z.string().default(''),
  name: z.string().default('Obsidian Gold · Built-in'),
  fit: z.union(FIT_MODES).default('cover'),
  positionX: z.number().min(0).max(100).step(1).default(50),
  positionY: z.number().min(0).max(100).step(1).default(50),
  scale: z.number().min(0.5).max(3).step(0.05).default(1),
  opacity: z.number().min(0).max(1).step(0.01).default(0.58),
  blur: z.number().min(0).max(50).step(1).default(0),
  overlay: z.number().min(0).max(1).step(0.01).default(0.46),
  saturation: z.number().min(0).max(2).step(0.05).default(0.9),
  brightness: z.number().min(0.5).max(1.5).step(0.05).default(0.9),
  tintEnabled: z.boolean().default(true),
  tintStrength: z.number().min(0).max(1).step(0.01).default(0.14),
});

const effectsSchema = z.object({
  enabled: z.boolean().default(true),
  preset: z.union(EFFECT_PRESETS).default('gold-dust'),
  density: z.union(PARTICLE_DENSITIES).default('low'),
  particleCount: z.number().min(0).max(400).step(1).default(0),
  particleSize: z.number().min(1).max(6).step(0.5).default(2.5),
  particleSpeed: z.number().min(0.2).max(3).step(0.1).default(0.7),
  particleOpacity: z.number().min(0).max(1).step(0.01).default(0.45),
  connectLines: z.boolean().default(false),
  mouseInteraction: z.boolean().default(false),
  parallax: z.boolean().default(false),
  cursorGlow: z.boolean().default(false),
  glowIntensity: z.union(LIGHT_INTENSITIES).default('soft'),
  animationSpeed: z.union(ANIMATION_SPEEDS).default('gentle'),
  autoThemeColors: z.boolean().default(true),
  particleColors: z.array(z.string()).default([]),
  glowColors: z.array(z.string()).default([]),
});

const performanceSchema = z.object({
  level: z.union(PERFORMANCE_LEVELS).default('balanced'),
});

const glassSchema = z.object({
  enabled: z.boolean().default(true),
  blurLevel: z.union(BLUR_LEVELS).default('light'),
  strength: z.number().min(0).max(40).step(1).default(0),
  saturation: z.number().min(0.5).max(2).step(0.05).default(1.05),
  panelOpacity: z.number().min(0).max(1).step(0.01).default(0.94),
  borderHighlight: z.number().min(0).max(1).step(0.01).default(0.36),
  shadow: z.number().min(0).max(1).step(0.01).default(0.2),
});

const customThemeColorsSchema = z.object({
  primary: z.string().default('#3b82f6'),
  accent: z.string().default('#22d3ee'),
  background: z.string().default('#0b1120'),
  panel: z.string().default('#131c31'),
  text: z.string().default('#e6edf7'),
  particle: z.string().default('#22d3ee'),
  glow: z.string().default('#3b82f6'),
});

const customThemeSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  base: z.string().default('quantum-blue'),
  colors: customThemeColorsSchema,
});

const petSchema = z.object({
  enabled: z.boolean().default(true),
  style: z.union(PET_STYLES).default('moonfox'),
  positionX: z.number().min(0).max(100).step(1).default(89),
  positionY: z.number().min(0).max(100).step(1).default(82),
  size: z.number().min(64).max(288).step(1).default(144),
  animations: z.boolean().default(true),
  speech: z.boolean().default(true),
  speechLines: z.array(z.string()).default([...DEFAULT_PET_SPEECH_LINES]),
  voiceEnabled: z.boolean().default(false),
  voiceStyle: z.union(VOICE_STYLES).default('playful'),
});

export const DesktopThemesSchema = z.object({
  schemaVersion: volatile(z.number().min(1).max(SCHEMA_VERSION).default(SCHEMA_VERSION)),
  // Built-in or custom theme id (custom ids are `custom-<n>`).
  theme: volatile(z.string().default('obsidian-gold')),
  font: volatile(fontSchema),
  appearance: volatile(appearanceSchema),
  wallpaper: volatile(wallpaperSchema),
  glass: volatile(glassSchema),
  effects: volatile(effectsSchema),
  performance: volatile(performanceSchema),
  customThemes: volatile(z.array(customThemeSchema).default([])),
  recentWallpapers: volatile(z.array(z.string()).default([])),
  pet: volatile(petSchema),
});

export type DesktopThemesSchemaType = ReturnType<typeof DesktopThemesSchema>;
