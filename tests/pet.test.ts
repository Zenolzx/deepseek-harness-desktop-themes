import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONFIG, DEFAULT_PET, createDefaultConfig } from '../src/config/defaults.ts';
import { coerceConfig, mergeConfig } from '../src/config/validation.ts';
import { DesktopThemesSchema } from '../src/config/schema.ts';
import { resolveVoiceProfile, VOICE_STYLE_IDS } from '../src/pet/speech.ts';
import { readFileSync } from 'node:fs';

test('default config has a full pet section', () => {
  assert.equal(DEFAULT_CONFIG.pet.enabled, false);
  assert.equal(DEFAULT_CONFIG.pet.style, 'moonfox');
  assert.equal(DEFAULT_CONFIG.pet.positionX, 89);
  assert.equal(DEFAULT_CONFIG.pet.positionY, 82);
  assert.equal(DEFAULT_CONFIG.pet.size, 144);
  assert.equal(DEFAULT_CONFIG.pet.animations, true);
  assert.equal(DEFAULT_CONFIG.pet.speech, true);
  assert.ok(DEFAULT_CONFIG.pet.speechLines.length > 0);
  assert.equal(DEFAULT_CONFIG.pet.voiceEnabled, false);
  assert.equal(DEFAULT_CONFIG.pet.voiceStyle, 'playful');
});

test('createDefaultConfig deep-copies the pet section', () => {
  const a = createDefaultConfig();
  const b = createDefaultConfig();
  assert.notEqual(a.pet, b.pet);
  assert.notEqual(a.pet.speechLines, b.pet.speechLines);
  a.pet.size = 999;
  a.pet.speechLines[0] = 'changed';
  assert.equal(b.pet.size, DEFAULT_PET.size);
  assert.notEqual(b.pet.speechLines[0], 'changed');
});

test('coerceConfig fills the pet defaults when missing', () => {
  const config = coerceConfig({});
  assert.deepEqual(config.pet, DEFAULT_PET);
});

test('coerceConfig accepts a valid pet section', () => {
  const config = coerceConfig({
    pet: {
      enabled: false,
      style: 'moonfox',
      positionX: 20,
      positionY: 30,
      size: 160,
      animations: false,
      speech: false,
      speechLines: ['hello', ' world ', 'hello'],
      voiceEnabled: true,
      voiceStyle: 'cheerful',
    },
  });
  assert.equal(config.pet.enabled, false);
  assert.equal(config.pet.style, 'moonfox');
  assert.equal(config.pet.positionX, 20);
  assert.equal(config.pet.positionY, 30);
  assert.equal(config.pet.size, 160);
  assert.equal(config.pet.animations, false);
  assert.equal(config.pet.speech, false);
  assert.deepEqual(config.pet.speechLines, ['hello', 'world']); // trimmed + deduped
  assert.equal(config.pet.voiceEnabled, true);
  assert.equal(config.pet.voiceStyle, 'cheerful');
});

test('coerceConfig accepts the moonfox pet style', () => {
  const config = coerceConfig({ pet: { style: 'moonfox' } });
  assert.equal(config.pet.style, 'moonfox');
});

test('coerceConfig migrates every removed pet style to moonfox', () => {
  for (const style of ['photo', 'ruan', 'ghost', 'slime', 'cat']) {
    assert.equal(coerceConfig({ pet: { style } }).pet.style, 'moonfox');
  }
});

test('coerceConfig clamps out-of-range pet values and rejects unknown styles', () => {
  const config = coerceConfig({
    pet: { style: 'dragon', positionX: 999, positionY: -5, size: 1 },
  });
  assert.equal(config.pet.style, 'moonfox'); // unknown style falls back
  assert.equal(config.pet.positionX, 100); // clamped to max
  assert.equal(config.pet.positionY, 0); // clamped to min
  assert.equal(config.pet.size, 64); // clamped to min
  assert.equal(config.pet.enabled, false); // companion is opt-in
});

test('coerceConfig clamps the pet size to the new 288px maximum and defaults bad voice style', () => {
  const config = coerceConfig({
    pet: { size: 9999, voiceStyle: 'screaming', voiceEnabled: true, speechLines: [] },
  });
  assert.equal(config.pet.size, 288);
  assert.equal(config.pet.voiceStyle, 'playful'); // unknown style falls back
  assert.equal(config.pet.voiceEnabled, true);
  assert.deepEqual(config.pet.speechLines, DEFAULT_PET.speechLines); // empty → defaults
});

test('mergeConfig keeps pet defaults when partial input lacks the section', () => {
  const merged = mergeConfig({ theme: 'obsidian-gold' });
  assert.equal(merged.theme, 'obsidian-gold');
  assert.deepEqual(merged.pet, DEFAULT_PET);
});

test('schema resolves the pet section to defaults for an empty input', () => {
  const resolved = DesktopThemesSchema({});
  assert.equal(resolved.pet.enabled, DEFAULT_PET.enabled);
  assert.equal(resolved.pet.style, DEFAULT_PET.style);
  assert.equal(resolved.pet.size, DEFAULT_PET.size);
  assert.equal(resolved.pet.voiceEnabled, DEFAULT_PET.voiceEnabled);
  assert.equal(resolved.pet.voiceStyle, DEFAULT_PET.voiceStyle);
  assert.deepEqual(resolved.pet.speechLines, DEFAULT_PET.speechLines);
});

test('schema accepts a valid pet override', () => {
  const resolved = DesktopThemesSchema({
    pet: { style: 'moonfox', size: 144, enabled: false, voiceEnabled: true, voiceStyle: 'robot', speechLines: ['hi'] },
  });
  assert.equal(resolved.pet.style, 'moonfox');
  assert.equal(resolved.pet.size, 144);
  assert.equal(resolved.pet.enabled, false);
  assert.equal(resolved.pet.voiceEnabled, true);
  assert.equal(resolved.pet.voiceStyle, 'robot');
  assert.deepEqual(resolved.pet.speechLines, ['hi']);
  assert.equal(resolved.pet.positionX, DEFAULT_PET.positionX); // untouched default
});

test('schema rejects an out-of-range pet size', () => {
  assert.throws(() => DesktopThemesSchema({ pet: { size: 9999 } } as any));
});

test('Moonfox motion uses joint anchors, random timing, lag and elastic rebounds', () => {
  const component = readFileSync(new URL('../src/pet/Pet.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/pet/pet.css', import.meta.url), 'utf8');
  assert.doesNotMatch(component, /style === '(ruan|ghost|slime|cat|photo)'|PET_PHOTO_SRC|RUAN_PHOTO_SRC/);
  assert.match(component, /randomBetween\(80, 120\)/);
  assert.match(component, /randomBetween\(8, 13\)/);
  assert.match(component, /randomBetween\(920, 1320\)/);
  assert.match(component, /tailRebounds: Math\.random\(\) < 0\.5 \? 1 : 2/);
  assert.match(component, /setMoonfoxBlinking\(true\)/);
  assert.match(css, /transform-origin: 49% 58%/);
  assert.match(css, /transform-origin: 64\.5% 50%/);
  assert.match(css, /cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/);
  assert.match(css, /dth-moonfox-tail-wag-two/);
  assert.match(css, /dth-moonfox-head-shake/);
  assert.match(css, /dth-moonfox-breathe/);
});

test('voice styles expose six clearly separated intonation presets', () => {
  assert.deepEqual(VOICE_STYLE_IDS, ['normal', 'gentle', 'cheerful', 'playful', 'calm', 'robot']);
  const gentle = resolveVoiceProfile('gentle', 'moonfox');
  const playful = resolveVoiceProfile('playful', 'moonfox');
  const calm = resolveVoiceProfile('calm', 'moonfox');
  assert.ok(playful.pitch - calm.pitch > 0.7);
  assert.ok(playful.rate - gentle.rate > 0.25);
});

test('Moonfox voice offset composes with an intonation preset', () => {
  assert.deepEqual(resolveVoiceProfile('normal', 'moonfox'), { pitch: 1.1, rate: 1.02 });
});
