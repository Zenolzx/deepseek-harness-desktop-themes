import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectsEngine } from '../src/effects/engine.ts';
import { DEFAULT_EFFECTS } from '../src/config/defaults.ts';

test('effect lifecycle respects static motion, resize tiers, visibility and disposal', () => {
  const keys = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const saved = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const frames = new Map<number, FrameRequestCallback>();
  const nodes: any[] = [];
  let id = 0;
  const listeners = new Map<string, () => void>();
  const context = new Proxy({}, { get: () => () => {}, set: () => true });
  const doc = {
    hidden: false,
    addEventListener: (key: string, fn: () => void) => listeners.set(key, fn),
    removeEventListener: (key: string) => listeners.delete(key),
    body: { appendChild: (node: any) => nodes.push(node) },
    createElement: () => ({ dataset: {}, style: { setProperty() {} }, setAttribute() {}, getContext: () => context,
      remove() { nodes.splice(nodes.indexOf(this), 1); } }),
  };
  Object.assign(globalThis, {
    window: { innerWidth: 1200, innerHeight: 800, devicePixelRatio: 2, addEventListener() {}, removeEventListener() {} },
    document: doc,
    requestAnimationFrame: (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (key: number) => frames.delete(key),
  });
  const engine = new EffectsEngine();
  const input = { effects: { ...DEFAULT_EFFECTS, enabled: true, preset: 'starfield' as const, density: 'low' as const, animationSpeed: 'gentle' as const },
    performance: 'quality' as const, colors: { particles: ['#ABCDEF'], glows: ['#ABCDEF'] }, reducedMotion: false };
  try {
    engine.update(input);
    assert.equal(frames.size, 1);
    const state = engine as any;
    const position = { x: state.particles[0].x, y: state.particles[0].y };
    engine.update(input);
    assert.equal(state.particles[0].x, position.x);
    assert.equal(state.particles[0].y, position.y);
    assert.equal(frames.size, 1);
    state.resize();
    assert.equal(state.dpr, 1.75);
    engine.update({ ...input, reducedMotion: true });
    assert.equal(frames.size, 0);
    engine.update({ ...input, effects: { ...input.effects, animationSpeed: 'still' } });
    assert.equal(frames.size, 0);
    engine.update(input);
    doc.hidden = true;
    listeners.get('visibilitychange')?.();
    assert.equal(frames.size, 0);
    doc.hidden = false;
    listeners.get('visibilitychange')?.();
    assert.equal(frames.size, 1);
    engine.update({ ...input, effects: { ...input.effects, enabled: false, cursorGlow: true } });
    assert.equal(nodes.length, 0);
    assert.equal(frames.size, 0);
    listeners.get('visibilitychange')?.();
    assert.equal(frames.size, 0);
  } finally {
    engine.dispose();
    assert.equal(nodes.length, 0);
    keys.forEach((key, index) => {
      if (saved[index]) Object.defineProperty(globalThis, key, saved[index]!);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
