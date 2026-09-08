/**
 * Read-aloud helper for the desktop pet.
 *
 * Uses the browser's built-in Web Speech API (`speechSynthesis`), so there is
 * no network, no bundled audio, and no extra dependency. Every call is
 * best-effort: browsers without a voice or a user-gesture-policy block simply
 * do nothing, and the pet's animation still plays.
 */

import type { PetStyle, VoiceStyle } from '../config/types.ts';

export interface VoiceProfile {
  pitch: number;
  rate: number;
}

/** Six deliberately separated intonation bands. */
export const VOICE_STYLE_PRESETS: Readonly<Record<VoiceStyle, VoiceProfile>> = {
  normal: { pitch: 1, rate: 1 },
  gentle: { pitch: 0.9, rate: 0.86 },
  cheerful: { pitch: 1.24, rate: 1.1 },
  playful: { pitch: 1.55, rate: 1.18 },
  calm: { pitch: 0.72, rate: 0.78 },
  robot: { pitch: 0.48, rate: 0.94 },
};

export const VOICE_STYLE_IDS: readonly VoiceStyle[] = ['normal', 'gentle', 'cheerful', 'playful', 'calm', 'robot'];

const PET_VOICE_OFFSETS: Readonly<Record<PetStyle, VoiceProfile>> = {
  moonfox: { pitch: 0.1, rate: 0.02 },
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function resolveVoiceProfile(style: VoiceStyle, petStyle: PetStyle): VoiceProfile {
  const preset = VOICE_STYLE_PRESETS[style] ?? VOICE_STYLE_PRESETS.normal;
  const offset = PET_VOICE_OFFSETS[petStyle];
  return {
    pitch: clamp(preset.pitch + offset.pitch, 0.1, 2),
    rate: clamp(preset.rate + offset.rate, 0.5, 2),
  };
}

/**
 * Speak a line with a chosen emotion preset. Cancels any in-flight utterance
 * first so rapid turn completions do not queue up an ever-growing backlog.
 */
export function speakLine(text: string, style: VoiceStyle, petStyle: PetStyle): void {
  if (typeof window === 'undefined') return;
  const synth = window.speechSynthesis;
  if (synth === undefined || synth === null) return;
  const clean = text.trim();
  if (clean.length === 0) return;

  try {
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    const profile = resolveVoiceProfile(style, petStyle);
    utter.pitch = profile.pitch;
    utter.rate = profile.rate;
    utter.volume = 1;

    // Prefer a voice matching the document language so non-English lines
    // still read with a natural accent where the platform offers one.
    const lang = (document.documentElement.lang || navigator.language || 'en-US').toLowerCase();
    const voices = synth.getVoices();
    const zh = voices.filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith('zh'));
    const en = voices.filter((voice) => voice.lang.toLowerCase().replace('_', '-').startsWith('en'));
    const voiceIndex = VOICE_STYLE_IDS.indexOf(style);
    const pickVoice = (matching: SpeechSynthesisVoice[]) => matching.length === 0
      ? undefined
      : matching[Math.max(0, voiceIndex) % matching.length];
    if (lang.startsWith('zh')) {
      const voice = pickVoice(zh);
      if (voice !== undefined) utter.voice = voice;
      utter.lang = voice?.lang ?? 'zh-CN';
    } else {
      const voice = pickVoice(en);
      if (voice !== undefined) utter.voice = voice;
      utter.lang = voice?.lang ?? 'en-US';
    }

    synth.speak(utter);
  } catch {
    /* Speech synthesis is best-effort and must never break the pet. */
  }
}
