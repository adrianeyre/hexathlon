import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FRAME_MS, FixedStepClock, MAX_GAP_MS } from '../src/loop.ts';
import { placeholderSim } from '../src/sim/placeholder.ts';

/**
 * Drive a clock with the given display frame times and count steps.
 */
function stepsFor(times: number[]) {
  const clock = new FixedStepClock(0);
  let steps = 0;
  for (const t of times) clock.advance(t, () => steps++);
  return steps;
}

describe('FixedStepClock', () => {
  it('steps at exactly 60 Hz whatever the display rate', () => {
    for (const hz of [30, 50, 60, 75, 120, 144, 240]) {
      const times: number[] = [];
      for (let t = 1000 / hz; t <= 10_000 + 1e-6; t += 1000 / hz) times.push(t);
      times.push(10_000);
      assert.equal(stepsFor(times), 600, `${hz} Hz display`);
    }
  });

  it('reports interpolation in [0, 1)', () => {
    const clock = new FixedStepClock(0);
    const alpha = clock.advance(FRAME_MS * 2.5, () => {});
    assert.ok(Math.abs(alpha - 0.5) < 1e-9);
  });

  it('clamps a long gap instead of replaying it as a burst', () => {
    const clock = new FixedStepClock(0);
    let steps = 0;
    clock.advance(FRAME_MS, () => steps++);
    assert.equal(steps, 1);
    steps = 0;
    clock.advance(60_000, () => steps++); // a minute in a background tab
    const cap = Math.round(MAX_GAP_MS / FRAME_MS);
    assert.ok(steps >= cap - 1 && steps <= cap, `${steps} steps after a long gap`);
    steps = 0;
    clock.advance(60_000 + 10.5 * FRAME_MS, () => steps++);
    assert.equal(steps, 10, 'back to normal pace after the gap');
  });

  it('gives each step a non-decreasing end time', () => {
    const clock = new FixedStepClock(0);
    const ends: number[] = [];
    clock.advance(1000, (_f, end) => ends.push(end));
    clock.advance(9000, (_f, end) => ends.push(end));
    for (let i = 1; i < ends.length; i++) assert.ok(ends[i] > ends[i - 1]);
  });
});

/**
 * Deterministic pseudo-random sequence (mulberry32).
 */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a per-frame input sequence of random mashing.
 */
function randomInputs(seed: number, frames: number): import('../src/sim/types.ts').InputEdge[][] {
  const next = rng(seed);
  const out: import('../src/sim/types.ts').InputEdge[][] = [];
  for (let f = 0; f < frames; f++) {
    const edges: import('../src/sim/types.ts').InputEdge[] = [];
    if (next() < 0.25) edges.push({ player: 1, action: next() < 0.5 ? 'RUN_A' : 'RUN_B', type: 'press' });
    out.push(edges);
  }
  return out;
}

/**
 * @param displayTimes  Wall-clock render times driving the clock.
 */
function runSim(inputs: import('../src/sim/types.ts').InputEdge[][], displayTimes: number[]) {
  const clock = new FixedStepClock(0);
  let state = placeholderSim.init({ cycle: 1, players: 1 });
  for (const t of displayTimes) {
    clock.advance(t, (frame) => {
      if (frame < inputs.length) state = placeholderSim.step(state, { frame, edges: inputs[frame] });
    });
  }
  return state;
}

describe('simulation determinism', () => {
  it('gives identical state after N frames for identical inputs', () => {
    const inputs = randomInputs(42, 900);
    const even: number[] = [];
    for (let i = 1; i <= 900; i++) even.push(i * FRAME_MS);
    const next = rng(7);
    const jittery: number[] = [];
    for (let t = 0; t < 900 * FRAME_MS; ) {
      t += 4 + next() * 30; // uneven display frames, 4-34 ms
      jittery.push(Math.min(t, 900 * FRAME_MS));
    }
    const a = runSim(inputs, even);
    const b = runSim(inputs, even);
    const c = runSim(inputs, jittery);
    assert.deepEqual(a, b);
    assert.deepEqual(a, c, 'render rate does not change the simulation');
    assert.ok(a.frame > 0);
  });

  it('gives different state for different inputs', () => {
    const times: number[] = [];
    for (let i = 1; i <= 200; i++) times.push(i * FRAME_MS);
    const run = (seed: number) => runSim(randomInputs(seed, 200), times);
    assert.notDeepEqual(run(1), run(2));
  });
});
