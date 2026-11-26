import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { runTrace } from '../calibration/harness.ts';
import { checkTrace } from '../calibration/types.ts';
import { PLAYER_1, RIVAL } from '../src/art/colours.ts';
import { HUD } from '../src/render/hud.ts';
import { describeMark, formatMark, metresPerPixel } from '../src/render/marks.ts';
import { PALETTE } from '../src/render/palette.ts';
import { renderHammer } from '../src/render/hammer.ts';
import { javelinCamera, renderJavelin } from '../src/render/javelin.ts';
import { longJumpCamera, renderLongJump } from '../src/render/long-jump.ts';
import { renderSprint, sprintCamera } from '../src/render/sprint.ts';
import { HURDLES_VIEW, hurdlesCamera, renderHurdles } from '../src/render/hurdles.ts';
import { HIGH_JUMP_VIEW, highJumpCamera, renderHighJump } from '../src/render/high-jump.ts';
import { OUTLINE_COLOURS } from '../src/render/javelin.ts';
import { HURDLE_COLOURS } from '../src/art/hurdles.ts';
import { BETWEEN_ATTEMPTS_FRAMES, LOSER_REACTION_FRAMES, REACTION_FRAMES } from '../src/scenes/event.ts';
import { EVENT_RENDERERS, EVENT_SOUNDS, createCatalogue } from '../src/scenes/catalogue.ts';
import { registerScenes } from '../src/scenes/index.ts';
import { SceneManager } from '../src/scenes/manager.ts';
import { RESULTS_DELAY } from '../src/scenes/results.ts';
import { EVENT_DATA, EVENT_SIMS, SIM_PARAMS, STANDARDS_DATA } from '../src/sim/registry.ts';
import { ATTRACT_EVENTS, attractPath, makeAttractTrace } from '../tools/make-attract-traces.ts';
import { testServices } from './helpers/fakes.ts';

export type InputEdge = import('../src/sim/types.ts').InputEdge;

/**
 * Skip an Arcade Event's intro card with START.
 */
function skipIntro(g: { manager: SceneManager; }) {
  g.manager.step({ frame: 0, edges: [{ player: 0, action: 'START', type: 'press' }] });
}
export type AnySim = import('../src/sim/types.ts').EventSim<any>;

/** A canvas stand-in that records every rectangle with the colour it was filled in. */
function colourCtx() {
  const rects: { x: number; y: number; w: number; h: number; colour: string; }[] = [];
  return {
    rects,
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, colour: String(this.fillStyle) });
    },
    uses(colour: string) {
      return rects.some((r) => r.colour === colour);
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * Every state of an Attempt played from an Input Trace.
 */
function statesOf(sim: AnySim, trace: import('../calibration/types.ts').InputTrace) {
  let state = sim.init({ cycle: 1, players: 1 });
  const states = [state];
  for (let f = 0; f < trace.frames; f++) {
    state = sim.step(state, { frame: f, edges: trace.inputs.filter((i) => i.frame === f) });
    states.push(state);
  }
  return states;
}

/**
 * States from a run that mashes and never presses ACTION (a foul in the
 * field Events, a false start in the 100m when mashing from frame 0).
 */
function foulStates(sim: AnySim, frames: number = 1400) {
  let state = sim.init({ cycle: 1, players: 1 });
  const states = [state];
  for (let f = 0; f < frames && !sim.getResult(state); f++) {
    const edges: InputEdge[] = f % 5 === 0 ? [{ player: 1, action: (f / 5) % 2 ? 'RUN_B' : 'RUN_A', type: 'press' }] : [];
    state = sim.step(state, { frame: f, edges });
    states.push(state);
  }
  return states;
}

const RENDERERS = ([
  ['sprint', renderSprint, ['set', 'race', 'done']],
  ['longJump', renderLongJump, ['runup', 'takeoff', 'flight', 'landed', 'done']],
  ['javelin', renderJavelin, ['runup', 'throwing', 'flight', 'landed', 'done']],
  ['hurdles', renderHurdles, ['set', 'race', 'done']],
  ['hammer', renderHammer, ['spin', 'release', 'flight', 'landed', 'done']],
  ['highJump', renderHighJump, ['runup', 'takeoff', 'flight', 'landed', 'done']],
] as const);

describe('Event renderers (#30, #41, #43, #45, #49, #51)', () => {
  for (const [id, render, phases] of RENDERERS) {
    const sim = (EVENT_SIMS[id] as AnySim);
    const valid = statesOf(sim, makeAttractTrace(id));
    const fouls = foulStates(sim);

    it(`${id}: draws every phase from frozen sim state, never changing it`, () => {
      const seen = new Set();
      for (const state of [...valid, ...fouls]) {
        seen.add(state.phase);
        const before = JSON.stringify(state);
        const ctx = colourCtx();
        render((ctx as any), deepFreeze(state));
        render((ctx as any), state, { reducedFlash: true });
        assert.equal(JSON.stringify(state), before);
        assert.ok(ctx.rects.length > 100);
      }
      for (const phase of phases) assert.ok(seen.has(phase), `phase ${phase} drawn`);
    });

    it(`${id}: draws the athlete with the code-defined sprites in player 1's kit`, () => {
      const ctx = colourCtx();
      render((ctx as any), valid[Math.floor(valid.length / 2)]);
      assert.ok(ctx.uses(PLAYER_1.s) && ctx.uses(PLAYER_1.h));
    });

    it(`${id}: shows a foul (or false start) clearly, and nothing like it on a valid Attempt`, () => {
      const fouled = colourCtx();
      render((fouled as any), fouls[fouls.length - 1]);
      assert.ok(fouled.uses(PALETTE.warning), 'warning banner');
      const fine = colourCtx();
      render((fine as any), valid[valid.length - 1]);
      assert.ok(!fine.uses(PALETTE.warning));
    });
  }

  it('100m: the speed bar fills with the meter, in the status panel at the top', () => {
    const states = statesOf((EVENT_SIMS.sprint as AnySim), makeAttractTrace('sprint'));
    const state = states[states.length - 50];
    const ctx = colourCtx();
    renderSprint((ctx as any), state);
    const { bar } = HUD.stats;
    const fill = ctx.rects.find((r) => r.x === bar.x && r.y === bar.y && r.h === bar.h && r.colour !== PALETTE.panel);
    const expected = Math.round(bar.w * (state.meter.value / SIM_PARAMS.sprint.speed.max));
    assert.equal(fill?.w, expected);
    assert.ok(bar.y + bar.h <= HUD.stats.h, 'inside the panel along the top');
  });

  it('100m: the status panel along the top shows the Standard and the best when there are some', () => {
    const states = statesOf((EVENT_SIMS.sprint as AnySim), makeAttractTrace('sprint'));
    const firstRow = (ctx: ReturnType<typeof colourCtx>, colour: string) => ctx.rects.some((r) => r.y < HUD.stats.bar.y - 2 && r.colour === colour);
    const ctx = colourCtx();
    renderSprint((ctx as any), states[400], { stats: { points: 'POINTS 1234', qualify: '12.00', best: '10.87' } });
    assert.ok(ctx.rects.some((r) => r.x === 0 && r.y === 0 && r.h === HUD.stats.h), 'a panel across the top');
    assert.ok(firstRow(ctx, PALETTE.highlight), 'the Standard to qualify');
    assert.ok(firstRow(ctx, PALETTE.accent), 'the best time');
    const bare = colourCtx();
    renderSprint((bare as any), states[400], { stats: { points: 'PRACTICE', qualify: null, best: null } });
    assert.ok(!firstRow(bare, PALETTE.highlight));
    assert.ok(!firstRow(bare, PALETTE.accent));
  });

  it('100m: draws the Rival in its own kit in the next lane', () => {
    const states = statesOf((EVENT_SIMS.sprint as AnySim), makeAttractTrace('sprint'));
    const ctx = colourCtx();
    renderSprint((ctx as any), states[200]);
    assert.ok(ctx.uses(RIVAL.s));
  });

  it('cameras follow the athlete (and the javelin in flight)', () => {
    const sprint = statesOf((EVENT_SIMS.sprint as AnySim), makeAttractTrace('sprint'));
    const cams = sprint.map((s) => sprintCamera(s, SIM_PARAMS.sprint));
    assert.ok(cams[cams.length - 1] > cams[200]);
    for (let i = 1; i < cams.length; i++) assert.ok(cams[i] >= cams[i - 1] - 3, 'no big jumps backwards');
    const lj = statesOf((EVENT_SIMS.longJump as AnySim), makeAttractTrace('longJump'));
    assert.ok(longJumpCamera(lj[lj.length - 1]) > longJumpCamera(lj[100]));
    const jav = statesOf((EVENT_SIMS.javelin as AnySim), makeAttractTrace('javelin'));
    const thrown = jav.findLast((s) => s.flight && !s.flight.landed);
    assert.ok(javelinCamera(thrown) > javelinCamera(jav.find((s) => s.phase === 'flight')));
  });

  it('every built Event has a renderer and sounds in the catalogue', () => {
    for (const id of Object.keys(EVENT_SIMS)) {
      assert.ok(EVENT_RENDERERS[(id as keyof typeof EVENT_RENDERERS)], id);
      assert.ok(EVENT_SOUNDS[(id as keyof typeof EVENT_SOUNDS)], id);
    }
  });
});

describe('Mark display at the presentation edge', () => {
  it('shows times in seconds and field distances in metres from data', () => {
    assert.equal(formatMark(630, 'frames'), '10.50 SEC');
    const scale = (metresPerPixel('longJump') as number);
    assert.equal(scale, EVENT_DATA.longJump.display.metresPerPixel);
    assert.equal(formatMark(100, 'pixels', 'longJump'), `${(100 * scale).toFixed(2)} M`);
    assert.equal(formatMark(100, 'pixels'), '100 PX');
  });

  it('spells out a missing Mark', () => {
    assert.equal(describeMark({ player: 1, outcome: 'foul', value: null, unit: 'pixels' }), 'FOUL');
    assert.equal(describeMark({ player: 1, outcome: 'falseStart', value: null, unit: 'frames' }), 'FALSE START');
    assert.equal(describeMark(null), '-');
  });
});

describe('Attempts in a field Event (#36)', () => {
  /** A full game with the real Events. */
  function game() {
    const services = testServices({ catalogue: createCatalogue(EVENT_SIMS, EVENT_RENDERERS, EVENT_SOUNDS) });
    const manager = new SceneManager({});
    const scenes = registerScenes(manager, services);
    return { services, manager, scenes };
  }

  /**
   * Play the Long Jump: each Attempt runs straight through the line (a foul),
   * or replays the demo for a valid jump.
   */
  function play(g: ReturnType<typeof game>, validAttempts: boolean[]) {
    const demo = makeAttractTrace('longJump');
    const scene = (g.scenes.event as any);
    skipIntro(g);
    let attemptIndex = 0;
    let frame = 0;
    for (let i = 0; i < 20000 && g.manager.currentName === 'event'; i++) {
      const before = scene.series.marks.length;
      const running = scene.state.phase !== 'done';
      let edges: InputEdge[] = [];
      if (running && validAttempts[attemptIndex]) edges = demo.inputs.filter((e) => e.frame === frame);
      else if (running && frame % 5 === 0) edges = [{ player: 1, action: (frame / 5) % 2 ? 'RUN_B' : 'RUN_A', type: 'press' }];
      g.manager.step({ frame: i, edges });
      frame = scene.attemptFrame;
      if (scene.series.marks.length > before) attemptIndex += 1;
    }
  }

  it('plays three Attempts in Arcade, showing each Mark, then the best on the results', () => {
    const g = game();
    const entry = g.services.catalogue.events.find((e) => e.id === 'longJump');
    assert.equal(entry?.attempts, EVENT_DATA.field.attempts);
    g.manager.change('event', { entry, mode: 'arcade' });
    play(g, [false, false, true]);
    assert.equal(g.manager.currentName, 'results');
    const results = (g.scenes.results as any);
    assert.equal(results.result.attempts.length, 3);
    assert.deepEqual(results.result.attempts.map((m: any) => m.outcome), ['foul', 'foul', 'valid']);
    assert.equal(results.result.marks[0].outcome, 'valid');
    assert.ok(results.newPersonalBest, 'the best Mark becomes the Personal Best');
    for (let i = 0; i < RESULTS_DELAY + 2; i++) g.manager.step({ frame: i, edges: [] });
    g.manager.render((colourCtx() as any), 0);
  });

  it('ends the go once a Mark reaches the Standard, when the data says to skip the remaining Attempts', () => {
    assert.equal(STANDARDS_DATA.remainingAttempts, 'skip');
    const g = game();
    const entry = g.services.catalogue.events.find((e) => e.id === 'longJump');
    g.manager.change('event', { entry, mode: 'arcade' });
    play(g, [false, true, true]);
    const results = (g.scenes.results as any);
    assert.deepEqual(results.result.attempts.map((m: any) => m.outcome), ['foul', 'valid']);
    assert.equal(results.session.played[0].qualified, true);
  });

  it('shows the last Mark between Attempts and numbers the next Attempt', () => {
    const g = game();
    const entry = g.services.catalogue.events.find((e) => e.id === 'longJump');
    g.manager.change('event', { entry, mode: 'arcade' });
    const scene = (g.scenes.event as any);
    skipIntro(g);
    for (let i = 0; i < 3000 && scene.series.marks.length === 0; i++) {
      g.manager.step({ frame: i, edges: i % 5 === 0 ? [{ player: 1, action: (i / 5) % 2 ? 'RUN_B' : 'RUN_A', type: 'press' }] : [] });
    }
    assert.equal(scene.series.marks[0].outcome, 'foul');
    g.manager.render((colourCtx() as any), 0);
    for (let i = 0; i < BETWEEN_ATTEMPTS_FRAMES; i++) g.manager.step({ frame: i, edges: [] });
    assert.equal(scene.state.attempt, 2);
    assert.equal(scene.state.phase, 'runup');
  });

  it('plays one Attempt at a time in Practice', () => {
    const g = game();
    const entry = g.services.catalogue.events.find((e) => e.id === 'longJump');
    g.manager.change('event', { entry, mode: 'practice' });
    play(g, [true]);
    assert.equal(g.manager.currentName, 'results');
    assert.equal((g.scenes.results as any).result.attempts, undefined);
  });

  it('plays the 100m start pistol at the start signal, and shows the Rival on the results', () => {
    const g = game();
    g.manager.change('event', { entry: g.services.catalogue.arcade, mode: 'arcade' });
    skipIntro(g);
    const demo = makeAttractTrace('sprint');
    // The demo, then the athlete's reaction (and the beaten Rival's, once over the line) before the results.
    for (let f = 0; f < demo.frames + REACTION_FRAMES + LOSER_REACTION_FRAMES + 600 && g.manager.currentName === 'event'; f++) {
      g.manager.step({ frame: f, edges: demo.inputs.filter((e) => e.frame === f) });
    }
    assert.ok(g.services.sounds.played.includes('pistol'));
    for (const call of ['say:sprint', 'say:onYourMarks', 'say:getSet']) assert.ok(g.services.sounds.played.includes(call), call);
    assert.ok(g.services.sounds.played.includes('finish'));
    assert.equal(g.manager.currentName, 'results');
    assert.equal((g.scenes.results as any).result.rival.unit, 'frames');
  });
});

describe('Attract Mode demos', () => {
  const playlist = JSON.parse(readFileSync(new URL('../data/attract.json', import.meta.url), 'utf8'));

  it('the playlist plays the demo of every built Event', () => {
    assert.deepEqual(playlist.traces, ATTRACT_EVENTS.map(attractPath));
  });

  for (const event of ATTRACT_EVENTS) {
    it(`${event}: the committed demo is current, consistent and makes a valid Mark (else run pnpm attract)`, () => {
      const trace = JSON.parse(readFileSync(new URL(`../${attractPath(event)}`, import.meta.url), 'utf8'));
      assert.deepEqual(checkTrace(trace), []);
      assert.equal(trace.source, 'synthetic');
      const result = runTrace((EVENT_SIMS[event] as AnySim), trace);
      assert.equal(result?.marks[0].outcome, 'valid');
      const { $schema, ...rest } = trace;
      assert.deepEqual(rest, makeAttractTrace(event));
    });
  }
});
