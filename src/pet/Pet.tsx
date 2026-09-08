/**
 * Desktop pet (桌面小人).
 *
 * Registered into the `shell.overlay` slot — a frame-wide floating layer above
 * every column. The pet is:
 *  - Moonfox-specific organic head, tail, blink, and breathing motion;
 *  - draggable (position persisted as viewport percentages);
 *  - clickable, opening a compact quick menu with theme / font / wallpaper /
 *    effects / pet controls — the same business face the settings panel uses,
 *    so every change goes through `commit` and persists like the full UI.
 *
 * All state reads go through the injected reactive store; all writes through
 * `commit`. The component owns no persistence and no DOM side effects outside
 * its own subtree.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { DesktopThemesConfig, EffectPresetId, PetConfig, VoiceStyle } from '../config/types.ts';
import { DEFAULT_PET, DEFAULT_PET_SPEECH_LINES } from '../config/defaults.ts';
import { THEMES, resolvePalette } from '../themes/index.ts';
import { CODE_FONT_PRESETS, CUSTOM_PRESET_KEY, UI_FONT_PRESETS } from '../fonts/presets.ts';
import { EFFECT_PRESETS } from '../effects/presets.ts';
import type { Store } from '../utils/store.ts';
import { detectLang, makeTranslator, type I18nKey } from '../settings/i18n.ts';
import { SpeechLinesEditor } from '../settings/controls.tsx';
import type { WallpaperPickResult } from '../settings/SettingsPanel.tsx';
import { speakLine, VOICE_STYLE_IDS } from './speech.ts';
import moonfoxSrc from '../assets/pets/moonfox.jpg';
import { applyBuiltinThemePreset, isBuiltinThemeId } from '../client/theme-presets.ts';

/** Loose view of the global `useSessions` selector hook (session list + running bits). */
interface SessionsSnapshot {
  byId?: Record<string, { running?: boolean }>;
}

type SessionsHook = <S>(selector: (snapshot: SessionsSnapshot) => S) => S;

const EMPTY_SESSIONS: SessionsSnapshot = { byId: {} };
const FALLBACK_SESSIONS_HOOK: SessionsHook = (selector) => selector(EMPTY_SESSIONS);

/** Business face injected by the client `apply` and merged into props. */
export interface PetFace {
  store: Store<DesktopThemesConfig>;
  commit: (next: DesktopThemesConfig) => void;
  chooseWallpaper: (file: File) => Promise<WallpaperPickResult>;
  clearWallpaper: () => void;
  restoreWallpaper: (id: string) => Promise<boolean>;
  listRecentWallpapers: () => Promise<Array<{ id: string; name: string }>>;
  /** Global session-list selector hook, used to detect turn completion. */
  useSessions?: SessionsHook;
}

type TabId = 'theme' | 'font' | 'wallpaper' | 'effects' | 'pet';

const TABS: ReadonlyArray<{ id: TabId; key: I18nKey }> = [
  { id: 'theme', key: 'pet.quick.theme' },
  { id: 'font', key: 'pet.quick.font' },
  { id: 'wallpaper', key: 'pet.quick.wallpaper' },
  { id: 'effects', key: 'pet.quick.effects' },
  { id: 'pet', key: 'pet.quick.pet' },
];

const GLOW_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'soft', label: 'Soft' },
  { value: 'standard', label: 'Standard' },
  { value: 'bright', label: 'Bright' },
];

type MoonfoxMotion = 'idle' | 'head-shake' | 'tail-wag';

interface MoonfoxMotionProfile {
  id: MoonfoxMotion;
  run: number;
  headAngle: number;
  headDuration: number;
  tailAngle: number;
  tailDuration: number;
  tailDelay: number;
  tailRebounds: 1 | 2;
}

const IDLE_MOONFOX_MOTION: MoonfoxMotionProfile = {
  id: 'idle',
  run: 0,
  headAngle: 0,
  headDuration: 1000,
  tailAngle: 0,
  tailDuration: 1000,
  tailDelay: 100,
  tailRebounds: 2,
};

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min);

function createMoonfoxMotion(id: Exclude<MoonfoxMotion, 'idle'>, run: number): MoonfoxMotionProfile {
  const direction = Math.random() < 0.5 ? -1 : 1;
  return {
    id,
    run,
    headAngle: direction * randomBetween(8, 13),
    headDuration: randomBetween(900, 1250),
    tailAngle: -direction * randomBetween(15, 23),
    tailDuration: randomBetween(920, 1320),
    tailDelay: randomBetween(80, 120),
    tailRebounds: Math.random() < 0.5 ? 1 : 2,
  };
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Moonfox — split into silhouette layers so head and tail move independently. */
function MoonfoxLayer(props: { part: 'body' | 'head' | 'tail' }) {
  const clipId = `dth-moonfox-clip-${props.part}`;
  const paths = props.part === 'head'
    ? ['M62 112 C82 126 96 140 108 142 L128 88 C140 108 145 129 153 141 C180 127 207 129 226 142 L266 68 C285 99 294 139 290 174 C287 217 270 253 244 277 C216 301 164 306 119 288 C78 271 56 231 58 184 C58 153 60 130 62 112 Z']
    : props.part === 'body'
      ? ['M119 258 C96 274 78 307 69 344 C65 364 78 386 96 398 C112 420 144 430 171 424 C193 438 226 435 248 421 C279 421 308 407 331 387 C311 358 291 314 258 276 C224 256 161 249 119 258 Z']
      : [
          'M258 248 C270 220 288 202 306 181 C334 195 354 221 361 253 C370 293 351 330 320 356 C296 378 290 405 323 421 C307 432 283 419 275 399 C266 379 255 367 244 354 C231 339 230 319 238 298 C245 278 250 263 258 248 Z',
          'M322 318 C340 323 347 341 345 360 C343 379 351 393 356 414 L346 431 L337 414 C340 393 331 381 332 360 C334 344 328 332 322 318 Z',
        ];
  return (
    <svg className={`dth-moonfox-layer dth-moonfox-${props.part}`} viewBox="0 0 400 500" aria-hidden="true">
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          {paths.map((path, index) => <path key={index} d={path} />)}
        </clipPath>
      </defs>
      <image href={moonfoxSrc} width="400" height="500" preserveAspectRatio="none" clipPath={`url(#${clipId})`} />
    </svg>
  );
}

function MoonfoxFigure(props: { motion: MoonfoxMotionProfile; blinking: boolean }) {
  const motionStyle: CSSProperties & Record<`--dth-${string}`, string> = {
    '--dth-head-angle': `${props.motion.headAngle.toFixed(2)}deg`,
    '--dth-head-reverse': `${(-props.motion.headAngle * 0.78).toFixed(2)}deg`,
    '--dth-head-rebound': `${(props.motion.headAngle * 0.38).toFixed(2)}deg`,
    '--dth-head-rebound-c': `${(-props.motion.headAngle * 0.14).toFixed(2)}deg`,
    '--dth-head-duration': `${props.motion.headDuration.toFixed(0)}ms`,
    '--dth-tail-angle': `${props.motion.tailAngle.toFixed(2)}deg`,
    '--dth-tail-rebound-a': `${(-props.motion.tailAngle * 0.52).toFixed(2)}deg`,
    '--dth-tail-rebound-b': `${(props.motion.tailAngle * 0.28).toFixed(2)}deg`,
    '--dth-tail-rebound-c': `${(-props.motion.tailAngle * 0.12).toFixed(2)}deg`,
    '--dth-tail-duration': `${props.motion.tailDuration.toFixed(0)}ms`,
    '--dth-tail-delay': `${props.motion.tailDelay.toFixed(0)}ms`,
  };
  return (
    <span
      key={props.motion.run}
      className="dth-pet-figure dth-moonfox-stage"
      data-motion={props.motion.id}
      data-tail-rebounds={props.motion.tailRebounds}
      style={motionStyle}
      aria-hidden="true"
    >
      <MoonfoxLayer part="body" />
      <MoonfoxLayer part="head" />
      <MoonfoxLayer part="tail" />
      {props.blinking ? (
        <span className="dth-moonfox-eyelids">
          <span className="dth-moonfox-lid dth-moonfox-lid-left" />
          <span className="dth-moonfox-lid dth-moonfox-lid-right" />
        </span>
      ) : null}
      <span className="dth-moonfox-tail-trail" />
      <span className="dth-moonfox-star dth-moonfox-star-a" />
      <span className="dth-moonfox-star dth-moonfox-star-b" />
    </span>
  );
}

export function Pet(props: PetFace) {
  const config = useSyncExternalStore(props.store.subscribe, props.store.get);
  const pet = config.pet;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('theme');
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [recent, setRecent] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const livePosRef = useRef<{ x: number; y: number } | null>(null);

  const [moonfoxMotion, setMoonfoxMotion] = useState<MoonfoxMotionProfile>(IDLE_MOONFOX_MOTION);
  const [moonfoxBlinking, setMoonfoxBlinking] = useState(false);
  const [speechText, setSpeechText] = useState<string>(() => {
    const source = pet.speechLines.length > 0 ? pet.speechLines : DEFAULT_PET_SPEECH_LINES;
    return source.length > 0 ? source[Math.floor(Math.random() * source.length)] : '';
  });
  const [speechVisible, setSpeechVisible] = useState(false);
  const motionResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionRunRef = useRef(0);
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLineRef = useRef<string>('');
  const prevRunningRef = useRef<string>('');
  const lastTapRef = useRef(0);

  // Global session-list subscription (a running → idle edge means a turn finished).
  const useSessions = props.useSessions ?? FALLBACK_SESSIONS_HOOK;
  const runningKey = useSessions((sessions) =>
    Object.entries(sessions.byId ?? {})
      .filter(([, summary]) => summary.running === true)
      .map(([id]) => id)
      .sort()
      .join('\u0000'),
  );

  const t = useMemo(() => makeTranslator(detectLang()), []);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const still = reduced || !pet.animations || config.performance.level === 'power-saver';

  const x = pos?.x ?? pet.positionX;
  const y = pos?.y ?? pet.positionY;

  const lines = useMemo(
    () => (pet.speechLines.length > 0 ? pet.speechLines : DEFAULT_PET_SPEECH_LINES),
    [pet.speechLines],
  );

  const pickLine = useCallback(() => {
    if (lines.length === 0) return '';
    if (lines.length === 1) return lines[0];
    const last = lastLineRef.current;
    let next = lines[Math.floor(Math.random() * lines.length)];
    if (next === last) next = lines[(lines.indexOf(next) + 1) % lines.length];
    lastLineRef.current = next;
    return next;
  }, [lines]);

  const clearMotionReset = useCallback(() => {
    if (motionResetRef.current !== null) {
      clearTimeout(motionResetRef.current);
      motionResetRef.current = null;
    }
  }, []);

  const playMoonfoxMotion = useCallback((id: Exclude<MoonfoxMotion, 'idle'>) => {
    if (still) return;
    clearMotionReset();
    motionRunRef.current += 1;
    const run = motionRunRef.current;
    const profile = createMoonfoxMotion(id, run);
    setMoonfoxMotion(profile);
    const headEnd = id === 'head-shake' ? profile.headDuration : 0;
    const tailEnd = profile.tailDelay + profile.tailDuration;
    motionResetRef.current = setTimeout(
      () => {
        if (motionRunRef.current === run) setMoonfoxMotion({ ...IDLE_MOONFOX_MOTION, run });
      },
      Math.max(headEnd, tailEnd) + 60,
    );
  }, [clearMotionReset, still]);

  const showSpeech = useCallback((text: string, holdMs: number) => {
    setSpeechText(text);
    setSpeechVisible(true);
    if (speechTimerRef.current !== null) clearTimeout(speechTimerRef.current);
    speechTimerRef.current = setTimeout(() => setSpeechVisible(false), holdMs);
  }, []);

  // Single click responds immediately. A second tap within 300ms replaces the
  // former delayed-click timer with a random action, so opening the menu no
  // longer feels sluggish.
  const singleClick = useCallback(() => {
    const line = pickLine();
    if (line.length > 0) {
      showSpeech(line, 3600);
      if (pet.voiceEnabled) speakLine(line, pet.voiceStyle, pet.style);
    }
    playMoonfoxMotion('head-shake');
    setOpen(true);
  }, [pickLine, showSpeech, playMoonfoxMotion, pet.style, pet.voiceEnabled, pet.voiceStyle]);

  const onTurnComplete = useCallback(() => {
    const line = pickLine();
    if (line.length === 0) return;
    showSpeech(line, 4200);
    playMoonfoxMotion('head-shake');
    if (pet.voiceEnabled) speakLine(line, pet.voiceStyle, pet.style);
  }, [pickLine, showSpeech, playMoonfoxMotion, pet.style, pet.voiceEnabled, pet.voiceStyle]);

  // Independent irregular timers avoid a visibly repeating idle cycle.
  useEffect(() => {
    if (still) {
      clearMotionReset();
      setMoonfoxMotion(IDLE_MOONFOX_MOTION);
      setMoonfoxBlinking(false);
      return;
    }
    let alive = true;
    let motionTimer: ReturnType<typeof setTimeout> | null = null;
    let motionReset: ReturnType<typeof setTimeout> | null = null;
    let blinkTimer: ReturnType<typeof setTimeout> | null = null;
    let blinkReset: ReturnType<typeof setTimeout> | null = null;

    const scheduleMotion = () => {
      motionTimer = setTimeout(() => {
        if (!alive) return;
        motionRunRef.current += 1;
        const chosen = createMoonfoxMotion(Math.random() < 0.55 ? 'tail-wag' : 'head-shake', motionRunRef.current);
        setMoonfoxMotion(chosen);
        const headEnd = chosen.id === 'head-shake' ? chosen.headDuration : 0;
        motionReset = setTimeout(() => {
          if (!alive) return;
          if (motionRunRef.current === chosen.run) {
            setMoonfoxMotion({ ...IDLE_MOONFOX_MOTION, run: chosen.run });
          }
          scheduleMotion();
        }, Math.max(headEnd, chosen.tailDelay + chosen.tailDuration) + 60);
      }, randomBetween(1400, 4000));
    };
    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => {
        if (!alive) return;
        setMoonfoxBlinking(true);
        blinkReset = setTimeout(() => {
          if (!alive) return;
          setMoonfoxBlinking(false);
          scheduleBlink();
        }, 115 + Math.random() * 65);
      }, 900 + Math.random() * 2500);
    };
    scheduleMotion();
    scheduleBlink();
    return () => {
      alive = false;
      if (motionTimer !== null) clearTimeout(motionTimer);
      if (motionReset !== null) clearTimeout(motionReset);
      if (blinkTimer !== null) clearTimeout(blinkTimer);
      if (blinkReset !== null) clearTimeout(blinkReset);
    };
  }, [still, clearMotionReset]);

  // Clear any pending timers when the pet unmounts.
  useEffect(
    () => () => {
      clearMotionReset();
      if (speechTimerRef.current !== null) clearTimeout(speechTimerRef.current);
    },
    [clearMotionReset],
  );

  // Celebrate + read a line when a conversation finishes (running → idle edge).
  useEffect(() => {
    const prev = prevRunningRef.current;
    prevRunningRef.current = runningKey;
    if (prev === '') return;
    const prevIds = new Set(prev.split('\u0000').filter(Boolean));
    const currIds = new Set(runningKey.split('\u0000').filter(Boolean));
    for (const id of prevIds) {
      if (!currIds.has(id)) {
        onTurnComplete();
        break;
      }
    }
  }, [runningKey, onTurnComplete]);

  // Close on outside pointerdown / Escape while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: globalThis.PointerEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Refresh the recent-wallpaper list while the wallpaper tab is visible.
  useEffect(() => {
    if (!open || tab !== 'wallpaper') return;
    let alive = true;
    void props.listRecentWallpapers().then((items) => {
      if (alive) setRecent(items);
    });
    return () => {
      alive = false;
    };
  }, [open, tab, props.listRecentWallpapers, config.wallpaper.sourceId]);

  const commitPet = useCallback(
    (patch: Partial<PetConfig>) => {
      props.commit({ ...config, pet: { ...config.pet, ...patch } });
    },
    [props.commit, config],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    livePosRef.current = { x: pet.positionX, y: pet.positionY };
    setDrag({ startX: event.clientX, startY: event.clientY, baseX: pet.positionX, baseY: pet.positionY, moved: false });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag === null) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const moved = drag.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
    const size = pet.size;
    const maxX = clamp(size / window.innerWidth, 0, 0.5);
    const maxY = clamp(size / window.innerHeight, 0, 0.5);
    const nx = clamp(drag.baseX + (dx / window.innerWidth) * 100, maxX * 100, 100 - maxX * 100);
    const ny = clamp(drag.baseY + (dy / window.innerHeight) * 100, maxY * 100, 100 - maxY * 100);
    livePosRef.current = { x: nx, y: ny };
    setDrag({ ...drag, moved });
    setPos({ x: nx, y: ny });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag === null) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer capture may already be released */
    }
    const wasDrag = drag.moved;
    const finalPos = livePosRef.current;
    setDrag(null);
    setPos(null);
    livePosRef.current = null;
    if (wasDrag && finalPos !== null) {
      props.commit({ ...config, pet: { ...config.pet, positionX: finalPos.x, positionY: finalPos.y } });
    } else {
      const now = Date.now();
      if (now - lastTapRef.current <= 300) {
        lastTapRef.current = 0;
        playMoonfoxMotion('tail-wag');
      } else {
        lastTapRef.current = now;
        singleClick();
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      singleClick();
    }
  };

  const pickWallpaper = async (file: File | undefined) => {
    if (file === undefined) return;
    const result = await props.chooseWallpaper(file);
    setError(result.ok ? null : result.reason === 'unsupported-type' ? t('wallpaper.error.type') : t('wallpaper.error.size'));
    if (result.ok) void props.listRecentWallpapers().then(setRecent);
  };

  const setTheme = (id: string) => props.commit(isBuiltinThemeId(id) ? applyBuiltinThemePreset(config, id) : { ...config, theme: id });
  const setFont = (patch: Partial<DesktopThemesConfig['font']>) =>
    props.commit({ ...config, font: { ...config.font, ...patch } });
  const setEffects = (patch: Partial<DesktopThemesConfig['effects']>) =>
    props.commit({ ...config, effects: { ...config.effects, ...patch } });

  const uiFontOptions = UI_FONT_PRESETS.map((p) => ({ value: p.key, label: p.key === 'system' ? t('font.preset.system') : p.label }));
  const codeFontOptions = CODE_FONT_PRESETS.map((p) => ({ value: p.key, label: p.key === 'system-mono' ? t('font.preset.systemMono') : p.label }));

  if (!pet.enabled) return null;

  const rootStyle: CSSProperties & { '--dth-pet-shift-x': string } = {
    left: `${x}%`,
    top: `${y}%`,
    width: `${pet.size}px`,
    '--dth-pet-shift-x': '0px',
  };

  const menuUp = y > 55;
  const menuLeft = x > 55;

  return (
    <div ref={rootRef} className="dth-pet" style={rootStyle} data-still={still ? 'true' : 'false'} data-dragging={drag !== null ? 'true' : 'false'} data-open={open ? 'true' : 'false'} data-style="moonfox">
      <div className="dth-pet-anchor">
        <button
          type="button"
          className="dth-pet-figure-btn"
          aria-label={t('pet.title')}
          aria-haspopup="menu"
          aria-expanded={open}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
          onMouseEnter={() => {
            setHover(true);
            setSpeechText(pickLine());
            playMoonfoxMotion('tail-wag');
          }}
          onMouseLeave={() => setHover(false)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <MoonfoxFigure motion={moonfoxMotion} blinking={moonfoxBlinking} />
        </button>
        {pet.speech && (hover || open || speechVisible) ? (
          <span className="dth-pet-bubble" role="status">
            {speechText}
          </span>
        ) : null}
        {open ? (
          <div className="dth-pet-menu" role="dialog" aria-label={t('pet.title')} data-up={menuUp ? 'true' : 'false'} data-left={menuLeft ? 'true' : 'false'}>
            <div className="dth-pet-menu-tabs" role="tablist" aria-label={t('pet.title')}>
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={`dth-pet-tab${tab === item.id ? ' is-active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  {t(item.key)}
                </button>
              ))}
            </div>
            <div className="dth-pet-menu-body" role="tabpanel">
              {tab === 'theme' ? (
                <div className="dth-pet-themes">
                  {THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className={`dth-pet-chip${config.theme === theme.id ? ' is-active' : ''}`}
                      onClick={() => setTheme(theme.id)}
                      title={theme.name}
                    >
                      <span className="dth-pet-chip-dot" style={{ background: theme.palette.accent }} />
                      <span className="dth-pet-chip-name">{theme.name}</span>
                    </button>
                  ))}
                  {config.customThemes.map((custom) => {
                    const palette = resolvePalette(custom.id, config.customThemes);
                    return (
                      <button
                        key={custom.id}
                        type="button"
                        className={`dth-pet-chip${config.theme === custom.id ? ' is-active' : ''}`}
                        onClick={() => setTheme(custom.id)}
                        title={custom.name}
                      >
                        <span className="dth-pet-chip-dot" style={{ background: palette?.accent ?? '#888888' }} />
                        <span className="dth-pet-chip-name">{custom.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {tab === 'font' ? (
                <div className="dth-pet-stack">
                  <label className="dth-pet-label" htmlFor="dth-pet-ui-font">
                    {t('pet.quick.uiFont')}
                  </label>
                  <select
                    id="dth-pet-ui-font"
                    className="dth-select"
                    value={config.font.uiPreset}
                    onChange={(event) => setFont({ uiPreset: event.currentTarget.value })}
                  >
                    {uiFontOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    <option value={CUSTOM_PRESET_KEY}>{t('font.custom')}</option>
                  </select>
                  <label className="dth-pet-label" htmlFor="dth-pet-code-font">
                    {t('pet.quick.codeFont')}
                  </label>
                  <select
                    id="dth-pet-code-font"
                    className="dth-select"
                    value={config.font.codePreset}
                    onChange={(event) => setFont({ codePreset: event.currentTarget.value })}
                  >
                    {codeFontOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    <option value={CUSTOM_PRESET_KEY}>{t('font.custom')}</option>
                  </select>
                </div>
              ) : null}
              {tab === 'wallpaper' ? (
                <div className="dth-pet-stack">
                  <div className="dth-row-actions">
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.gif"
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        void pickWallpaper(event.currentTarget.files?.[0]);
                        event.currentTarget.value = '';
                      }}
                    />
                    <button type="button" className="dth-btn dth-btn-ghost" onClick={() => fileRef.current?.click()}>
                      {t('pet.quick.choose')}
                    </button>
                    <button type="button" className="dth-btn dth-btn-danger" onClick={() => props.clearWallpaper()}>
                      {t('pet.quick.clear')}
                    </button>
                  </div>
                  {error !== null ? <p className="dth-notice dth-notice-error">{error}</p> : null}
                  {recent.length > 0 ? (
                    <div className="dth-pet-stack">
                      <span className="dth-pet-label">{t('pet.quick.recent')}</span>
                      <div className="dth-pet-recents">
                        {recent.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="dth-pet-recent"
                            onClick={() => void props.restoreWallpaper(item.id)}
                            title={item.name}
                          >
                            {item.name || item.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {tab === 'effects' ? (
                <div className="dth-pet-stack">
                  <label className="dth-pet-label" htmlFor="dth-pet-particle-preset">
                    {t('pet.quick.particles')}
                  </label>
                  <select
                    id="dth-pet-particle-preset"
                    className="dth-select"
                    value={config.effects.preset}
                    disabled={!config.effects.enabled}
                    onChange={(event) => setEffects({ preset: event.currentTarget.value as EffectPresetId })}
                  >
                    {EFFECT_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {t(`particles.preset.${preset.id}` as I18nKey)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.effects.enabled}
                    className={`dth-toggle${config.effects.enabled ? ' is-on' : ''}`}
                    onClick={() => setEffects({ enabled: !config.effects.enabled })}
                  >
                    <span className="dth-toggle-knob" />
                    <span className="dth-toggle-text">{config.effects.enabled ? 'On' : 'Off'}</span>
                  </button>
                  <label className="dth-pet-label" htmlFor="dth-pet-glow">
                    {t('pet.quick.glow')}
                  </label>
                  <select
                    id="dth-pet-glow"
                    className="dth-select"
                    value={config.effects.glowIntensity}
                    onChange={(event) => setEffects({ glowIntensity: event.currentTarget.value as DesktopThemesConfig['effects']['glowIntensity'] })}
                  >
                    {GLOW_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {tab === 'pet' ? (
                <div className="dth-pet-stack">
                  <label className="dth-pet-label" htmlFor="dth-pet-size">
                    {t('pet.size')} · {pet.size}px
                  </label>
                  <input
                    id="dth-pet-size"
                    type="range"
                    min={64}
                    max={288}
                    step={4}
                    value={pet.size}
                    onChange={(event) => commitPet({ size: Number(event.currentTarget.value) })}
                  />
                  <div className="dth-row-actions">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pet.animations}
                      className={`dth-toggle${pet.animations ? ' is-on' : ''}`}
                      onClick={() => commitPet({ animations: !pet.animations })}
                    >
                      <span className="dth-toggle-knob" />
                      <span className="dth-toggle-text">{t('pet.animations')}</span>
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pet.speech}
                      className={`dth-toggle${pet.speech ? ' is-on' : ''}`}
                      onClick={() => commitPet({ speech: !pet.speech })}
                    >
                      <span className="dth-toggle-knob" />
                      <span className="dth-toggle-text">{t('pet.speech')}</span>
                    </button>
                  </div>
                  <div className="dth-row-actions">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pet.voiceEnabled}
                      className={`dth-toggle${pet.voiceEnabled ? ' is-on' : ''}`}
                      onClick={() => commitPet({ voiceEnabled: !pet.voiceEnabled })}
                    >
                      <span className="dth-toggle-knob" />
                      <span className="dth-toggle-text">{t('pet.voice')}</span>
                    </button>
                  </div>
                  {pet.voiceEnabled ? (
                    <select
                      id="dth-pet-voice-style"
                      className="dth-select"
                      value={pet.voiceStyle}
                      onChange={(event) => commitPet({ voiceStyle: event.currentTarget.value as VoiceStyle })}
                    >
                      {VOICE_STYLE_IDS.map((style) => (
                        <option key={style} value={style}>
                          {t(`pet.voiceStyle.${style}` as I18nKey)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <SpeechLinesEditor
                    id="dth-pet-lines"
                    label={t('pet.speechLines')}
                    value={pet.speechLines}
                    onChange={(speechLines) => commitPet({ speechLines })}
                  />
                  <div className="dth-row-actions">
                    <button type="button" className="dth-btn dth-btn-ghost" onClick={() => commitPet({ positionX: DEFAULT_PET.positionX, positionY: DEFAULT_PET.positionY })}>
                      {t('pet.position.reset')}
                    </button>
                    <button type="button" className="dth-btn dth-btn-danger" onClick={() => commitPet({ enabled: false })}>
                      {t('pet.quick.hide')}
                    </button>
                  </div>
                  <p className="dth-notice dth-notice-info">{t('pet.quick.moreHint')}</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
