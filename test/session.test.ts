import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INTRO_FRAMES } from '../src/audio.ts';
import { HURDLE_COLOURS } from '../src/art/hurdles.ts';
import { ART, PLAYER_1 } from '../src/art/colours.ts';
import { HIGH_JUMP_GROUND } from '../src/art/high-jump.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH, fitFill } from '../src/render/display.ts';
import { HIGH_JUMP_VIEW, highJumpCamera, renderHighJump } from '../src/render/high-jump.ts';
import { hurdlesCamera, renderHurdles } from '../src/render/hurdles.ts';
import { OUTLINE_COLOURS, renderJavelin } from '../src/render/javelin.ts';
import { formatMark } from '../src/render/marks.ts';
import { PALETTE } from '../src/render/palette.ts';
import { BAR_PLAN, SERIES_PLAN } from '../src/scenes/attempt-plans.ts';
import { EVENT_RENDERERS, EVENT_SOUNDS, createCatalogue } from '../src/scenes/catalogue.ts';
import { EVENT_INTRO_FRAMES } from '../src/scenes/event.ts';
import { highJumpSounds, hurdlesSounds } from '../src/scenes/event-sounds.ts';
import { registerScenes } from '../src/scenes/index.ts';
import { SceneManager } from '../src/scenes/manager.ts';
import { RESULTS_DELAY, heightsLine } from '../src/scenes/results.ts';
import { COOKIE_POLICY, CREDITS, REPO_URL } from '../src/scenes/text-page.ts';
import { DIFFICULTIES, applyDifficulty } from '../src/sim/difficulty.ts';
import { EVENT_IDS } from '../src/sim/events.ts';
import { barSeriesMark, createBarSeries, createHighJumpSim, recordJump } from '../src/sim/high-jump.ts';
import { createHurdlesSim, hurdlePositions, jumpHeightAt } from '../src/sim/hurdles.ts';
import { pointsFor } from '../src/sim/points.ts';
import {
  DIFFICULTY_DATA,
  EVENT_SIMS,
  POINTS_DATA,
  SIM_PARAMS,
  STANDARDS_DATA,
  eventPoints,
  eventStandard,
  simFor,
  simParamsFor,
} from '../src/sim/registry.ts';
import { advance, createSession, currentEvent, recordEvent } from '../src/sim/session.ts';
import { meetsStandard, standardFor } from '../src/sim/standards.ts';
import { makeAttractTrace } from '../tools/make-attract-traces.ts';
import { recordingSounds, testServices } from './helpers/fakes.ts';

export type InputEdge = import('../src/sim/types.ts').InputEdge;
export type AnySim = import('../src/sim/types.ts').EventSim<any>;

const edge = (action: 'RUN_A' | 'RUN_B' | 'ACTION', type: 'press' | 'release' = 'press'): InputEdge => ({ player: 1, action, type });

/**
 * Drive a sim frame by frame with a plan of edges per frame.
 */
function drive(sim: AnySim, plan: (frame: number, state: any) => InputEdge[], init: Partial<import('../src/sim/types.ts').EventInit> = {}) {
  let state = sim.init({ cycle: 1, players: 1, ...init });
  const states = [state];
  for (let f = 0; f < 5000; f++) {
    state = sim.step(state, { frame: f, edges: plan(f, state) });
    states.push(state);
    const result = sim.getResult(state);
    if (result) return { state, states, result };
  }
  return { state, states, result: null };
}

/** Alternate run presses every `every` frames from `from`. @param every @param [from] */
const mash = (every: number, from: number = 0) => (f: number) => (f >= from && (f - from) % every === 0 ? [edge(((f - from) / every) % 2 ? 'RUN_B' : 'RUN_A')] : []);

/** A canvas stand-in recording every rectangle with its colour. */
function colourCtx() {
  const rects: { x: number; y: number; w: number; h: number; colour: string; }[] = [];
  return {
    rects,
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, colour: String(this.fillStyle) });
    },
    uses(c: string) {
      return rects.some((r) => r.colour === c);
    },
  };
}

const HURDLES = SIM_PARAMS.hurdles;
const HIGH_JUMP = SIM_PARAMS.highJump;
const signal = HURDLES.startSignalFrame + 2;

/**
 * Hurdles plan: mash from the signal, and jump when the next hurdle is `lead` pixels ahead.
 */
const hurdlesPlan = (lead: number) => (f: number, s: any) => {
  const edges = mash(5, signal)(f);
  const ahead = hurdlePositions(HURDLES)[s.nextHurdle] - s.x;
  if (s.phase === 'race' && s.jumpFrame === null && ahead < lead) edges.push(edge('ACTION'));
  return edges;
};

describe('110m Hurdles (#46)', () => {
  const sim = (EVENT_SIMS.hurdles as AnySim);

  it('places the hurdles from data', () => {
    const xs = hurdlePositions(HURDLES);
    assert.equal(xs.length, HURDLES.hurdleCount);
    assert.equal(xs[0], HURDLES.firstHurdle);
    assert.equal(xs[1] - xs[0], HURDLES.hurdleSpacing);
    assert.ok(xs[xs.length - 1] < HURDLES.distance);
  });

  it('a jump rises and falls over its frames from data', () => {
    assert.equal(jumpHeightAt(0, HURDLES), 0);
    assert.equal(jumpHeightAt(HURDLES.jumpFrames / 2, HURDLES), HURDLES.jumpHeight);
    assert.equal(jumpHeightAt(HURDLES.jumpFrames, HURDLES), 0);
  });

  it('clears every hurdle with well-timed jumps, and is timed from the start signal', () => {
    const { state, result } = drive(sim, hurdlesPlan(34));
    assert.deepEqual(state.hit, Array(HURDLES.hurdleCount).fill(false));
    assert.equal(result?.marks[0].outcome, 'valid');
    assert.equal(result?.marks[0].value, state.raceFrame);
    assert.equal(result?.marks[0].unit, 'frames');
  });

  it('hits every hurdle without ACTION: each hit costs speed, stumbles and is slower overall', () => {
    const clean = drive(sim, hurdlesPlan(34));
    const crash = drive(sim, (f) => mash(5, signal)(f));
    assert.deepEqual(crash.state.hit, Array(HURDLES.hurdleCount).fill(true));
    assert.ok((crash.result?.marks[0].value as number) > (clean.result?.marks[0].value as number));
    const i = crash.states.findIndex((s) => s.hit.length === 1);
    const before = crash.states[i - 1];
    const after = crash.states[i];
    assert.ok(after.meter.value < before.meter.value * (1 - HURDLES.collisionSpeedLoss) + 0.01, 'speed lost');
    assert.equal(after.stumble, HURDLES.stumbleFrames);
  });

  it('adds no speed for run presses while stumbling', () => {
    const crash = drive(sim, (f) => mash(1, signal)(f));
    const i = crash.states.findIndex((s) => s.hit.length === 1);
    for (let k = i + 1; k < i + HURDLES.stumbleFrames; k++) assert.ok(crash.states[k].meter.value <= crash.states[k - 1].meter.value);
  });

  it('only clears inside the clear window: jumping too early hits the hurdle', () => {
    const early = drive(sim, hurdlesPlan(150));
    assert.ok(early.state.hit.some(Boolean));
  });

  it('takes the clear window from data', () => {
    const shut = createHurdlesSim({ ...HURDLES, clearWindow: { from: 100, to: 100 } });
    assert.ok(drive(shut, hurdlesPlan(34)).state.hit.every(Boolean));
  });

  it('false starts as the 100m does, and races the Rival', () => {
    const jumpy = drive(sim, mash(5, 0));
    assert.equal(jumpy.result?.marks[0].outcome, 'falseStart');
    const { result } = drive(sim, hurdlesPlan(34));
    assert.equal(result?.rival?.unit, 'frames');
    assert.ok((result?.rival?.value as number) > 0);
  });

  it('is deterministic', () => {
    assert.deepEqual(drive(sim, hurdlesPlan(34)).result, drive(sim, hurdlesPlan(34)).result);
  });
});

/**
 * High Jump plan: mash, press ACTION `distance` pixels before the bar, hold for `hold` frames.
 */
function highJumpPlan(distance: number, hold: number) {
  let pressedAt: number | null = null;
  return (f: number, s: any) => {
    const edges = s.phase === 'runup' ? mash(5)(f) : [];
    if (s.phase === 'runup' && pressedAt === null && HIGH_JUMP.barX - s.x < distance) {
      pressedAt = f;
      edges.push(edge('ACTION'));
    }
    if (pressedAt !== null && f === pressedAt + hold) edges.push(edge('ACTION', 'release'));
    return edges;
  };
}

describe('High Jump (#47)', () => {
  const sim = (EVENT_SIMS.highJump as AnySim);

  it('starts at the starting height from data, or the bar height it is given', () => {
    assert.equal(sim.init({ cycle: 1, players: 1 }).barHeight, HIGH_JUMP.startHeight);
    assert.equal(sim.init({ cycle: 1, players: 1, barHeight: 40 }).barHeight, 40);
  });

  it('clears a bar with a good take-off: the Mark is the bar height', () => {
    const { result, states } = drive(sim, highJumpPlan(45, 40), { barHeight: 30 });
    assert.deepEqual(result?.marks[0], { player: 1, outcome: 'valid', value: 30, unit: 'pixels' });
    assert.ok(Math.max(...states.map((s) => s.y)) >= 30);
  });

  it('knocks a bar that is too high', () => {
    const { result, state } = drive(sim, highJumpPlan(45, 40), { barHeight: 90 });
    assert.equal(result?.marks[0].outcome, 'failed');
    assert.equal(result?.marks[0].value, null);
    assert.equal(state.fail, 'knocked');
  });

  it('fails when running into the bar without taking off, or out of time', () => {
    assert.equal(drive(sim, mash(5)).state.fail, 'baulk');
    assert.equal(drive(sim, () => []).state.fail, 'time');
  });

  it('jumps higher inside the angle window than outside it', () => {
    const peak = (hold: number) => Math.max(...drive(sim, highJumpPlan(45, hold), { barHeight: 200 }).states.map((s) => s.y));
    assert.ok(peak(40) > peak(10));
  });

  it('raises the bar by the increment after a clearance, and ends after the failures per height from data', () => {
    let series = createBarSeries(HIGH_JUMP);
    const valid = ({ player: 1, outcome: 'valid', value: HIGH_JUMP.startHeight, unit: 'pixels' } as const);
    const failed = ({ player: 1, outcome: 'failed', value: null, unit: 'pixels' } as const);
    series = recordJump(series, valid, HIGH_JUMP);
    assert.equal(series.height, HIGH_JUMP.startHeight + HIGH_JUMP.increment);
    assert.equal(series.best, HIGH_JUMP.startHeight);
    for (let i = 1; i < HIGH_JUMP.attemptsPerHeight; i++) {
      series = recordJump(series, failed, HIGH_JUMP);
      assert.equal(series.over, false);
    }
    series = recordJump(series, { ...valid, value: series.height }, HIGH_JUMP);
    assert.equal(series.failures, 0, 'a clearance resets the failures');
    for (let i = 0; i < HIGH_JUMP.attemptsPerHeight; i++) series = recordJump(series, failed, HIGH_JUMP);
    assert.equal(series.over, true);
    assert.deepEqual(barSeriesMark(series), { player: 1, outcome: 'valid', value: HIGH_JUMP.startHeight + HIGH_JUMP.increment, unit: 'pixels' });
    assert.equal(barSeriesMark(createBarSeries(HIGH_JUMP)).outcome, 'failed');
  });

  it('the bar plan starts each Attempt at the current height and numbers it within the height', () => {
    let series = BAR_PLAN.create(1);
    assert.deepEqual(BAR_PLAN.next(series), { attempt: 1, barHeight: HIGH_JUMP.startHeight });
    series = BAR_PLAN.record(series, { player: 1, outcome: 'failed', value: null, unit: 'pixels' });
    assert.deepEqual(BAR_PLAN.next(series), { attempt: 2, barHeight: HIGH_JUMP.startHeight });
    assert.match(BAR_PLAN.between(series, 'highJump')[0], /FAILED/);
  });

  it('takes its geometry from data', () => {
    const near = createHighJumpSim({ ...HIGH_JUMP, barX: 50 });
    assert.equal(drive(near, mash(5)).state.x, 50);
  });
});

describe('Standards and Cycle scaling (#52)', () => {
  it('reads every Event per Cycle from data/standards.json', () => {
    for (const id of EVENT_IDS) {
      const data = STANDARDS_DATA.events[id];
      data.cycles.forEach((value, i) => assert.deepEqual(eventStandard(id, i + 1), { value, unit: data.unit }));
    }
  });

  it('keeps tightening past the listed Cycles by the step, up to the limit', () => {
    const sprint = STANDARDS_DATA.events.sprint;
    const n = sprint.cycles.length;
    assert.equal(eventStandard('sprint', n + 1).value, sprint.cycles[n - 1] + sprint.beyondStep);
    assert.equal(eventStandard('sprint', 999).value, sprint.limit);
    const jump = STANDARDS_DATA.events.longJump;
    assert.equal(eventStandard('longJump', n + 2).value, Math.min(jump.limit, jump.cycles[n - 1] + 2 * jump.beyondStep));
    assert.equal(eventStandard('longJump', 999).value, jump.limit);
    for (const id of EVENT_IDS) {
      for (let c = 1; c < 12; c++) {
        const a = eventStandard(id, c).value;
        const b = eventStandard(id, c + 1).value;
        assert.ok(STANDARDS_DATA.events[id].unit === 'frames' ? b <= a : b >= a, `${id} cycle ${c + 1} no easier`);
      }
    }
  });

  it('a time qualifies at or under, a distance or height at or over', () => {
    const time = { value: 700, unit: ('frames' as const) };
    assert.ok(meetsStandard({ player: 1, outcome: 'valid', value: 700, unit: 'frames' }, time));
    assert.ok(!meetsStandard({ player: 1, outcome: 'valid', value: 701, unit: 'frames' }, time));
    const far = { value: 100, unit: ('pixels' as const) };
    assert.ok(meetsStandard({ player: 1, outcome: 'valid', value: 100, unit: 'pixels' }, far));
    assert.ok(!meetsStandard({ player: 1, outcome: 'valid', value: 99, unit: 'pixels' }, far));
    assert.ok(!meetsStandard({ player: 1, outcome: 'foul', value: null, unit: 'pixels' }, far));
    assert.ok(!meetsStandard(null, far));
  });

  it('the demos reach the first Cycle Standard in every Event (the provisional values are playable)', () => {
    for (const id of EVENT_IDS) {
      const trace = makeAttractTrace(id);
      const sim = (EVENT_SIMS[id] as AnySim);
      let state = sim.init({ cycle: 1, players: 1, ...(trace.barHeight === undefined ? {} : { barHeight: trace.barHeight }) });
      for (let f = 0; f < trace.frames; f++) state = sim.step(state, { frame: f, edges: trace.inputs.filter((e) => e.frame === f) });
      assert.ok(meetsStandard(sim.getResult(state)?.marks[0], eventStandard(id, 1)), id);
    }
  });
});

describe('Points (#53)', () => {
  it('converts a Mark with the rule from data/points.json, never below zero', () => {
    const rule = POINTS_DATA.events.sprint;
    const mark = ({ player: 1, outcome: 'valid', value: 600, unit: 'frames' } as const);
    assert.equal(eventPoints('sprint', mark), Math.round((600 - rule.zero) * rule.perUnit));
    assert.equal(pointsFor({ ...mark, value: 5000 }, rule), 0);
    assert.equal(pointsFor({ player: 1, outcome: 'falseStart', value: null, unit: 'frames' }, rule), 0);
  });

  it('faster times and longer Marks earn more in every Event', () => {
    for (const id of EVENT_IDS) {
      const unit = STANDARDS_DATA.events[id].unit;
      const better = unit === 'frames' ? 600 : 120;
      const worse = unit === 'frames' ? 800 : 60;
      assert.ok(eventPoints(id, { player: 1, outcome: 'valid', value: better, unit }) > eventPoints(id, { player: 1, outcome: 'valid', value: worse, unit }), id);
    }
  });
});

describe('Sessions (#52, #53)', () => {
  it('plays the six Events in order, then starts the next Cycle', () => {
    let s = createSession();
    const order = [];
    for (let i = 0; i < 7; i++) {
      order.push(`${s.cycle}:${currentEvent(s)}`);
      s = advance(recordEvent(s, null, { value: 0, unit: 'frames' }, true, 10));
    }
    assert.deepEqual(order, [...EVENT_IDS.map((id) => `1:${id}`), '2:sprint']);
    assert.equal(s.points, 70);
  });

  it('ends when a Standard is missed', () => {
    const s = recordEvent(createSession(), null, { value: 0, unit: 'frames' }, false, 0);
    assert.equal(s.over, true);
    assert.equal(advance(s), s);
  });
});

/** A full game on the real Events. @param [settings] */
function game(settings: Partial<import('../src/storage.ts').Settings> = {}) {
  const services = testServices({ catalogue: createCatalogue(EVENT_SIMS, EVENT_RENDERERS, EVENT_SOUNDS) });
  services.settings.update(settings);
  const manager = new SceneManager({});
  const scenes = registerScenes(manager, services);
  const step = (extra: Partial<import('../src/scenes/manager.ts').SceneInput> = {}) => manager.step({ frame: 0, edges: [], ...extra });
  const start = () => step({ edges: [{ player: 0, action: 'START', type: 'press' }] });
  return { services, manager, scenes, step, start };
}

/**
 * Replay an Event's demo in the event scene until the results show.
 */
function playDemo(g: ReturnType<typeof game>) {
  const scene = (g.scenes.event as any);
  const id = currentEvent(scene.session);
  const demo = makeAttractTrace(id);
  g.start(); // skip the intro card
  for (let i = 0; i < 40000 && g.manager.currentName === 'event'; i++) {
    const f = scene.attemptFrame;
    // The High Jump demo is one Attempt: it replays at every height until the bar beats it.
    g.step({ edges: demo.inputs.filter((e) => e.frame === f) });
  }
}

describe('Arcade Session flow (#52, #53)', () => {
  it('opens a Session on the intro card for as long as the fanfare, and START skips it', () => {
    const g = game();
    g.manager.change('event', { entry: g.services.catalogue.arcade, mode: 'arcade', sessionStart: true });
    const scene = (g.scenes.event as any);
    assert.equal(scene.intro, INTRO_FRAMES);
    g.step();
    assert.equal(scene.attemptFrame, 0, 'the Event waits');
    g.start();
    assert.equal(scene.intro, 0);
    g.manager.render((colourCtx() as any), 0);
  });

  it('plays all six Events in a Cycle, scores each, shows the total, then Cycle 2', () => {
    const g = game();
    g.manager.change('event', { entry: g.services.catalogue.arcade, mode: 'arcade', sessionStart: true });
    let total = 0;
    for (const [i, id] of EVENT_IDS.entries()) {
      const scene = (g.scenes.event as any);
      assert.equal(g.manager.currentName, 'event', id);
      assert.equal(currentEvent(scene.session), id);
      if (i > 0) assert.equal(scene.intro, EVENT_INTRO_FRAMES);
      playDemo(g);
      assert.equal(g.manager.currentName, 'results', id);
      const results = (g.scenes.results as any);
      const played = results.session.played[i];
      assert.equal(played.eventId, id);
      assert.equal(played.qualified, true, `${id} qualifies`);
      assert.equal(played.points, eventPoints(id, results.result.marks[0]));
      total += played.points;
      assert.equal(results.session.points, total);
      g.manager.render((colourCtx() as any), 0);
      for (let k = 0; k <= RESULTS_DELAY; k++) g.step();
      g.start();
    }
    const scene = (g.scenes.event as any);
    assert.equal(g.manager.currentName, 'event');
    assert.equal(scene.session.cycle, 2);
    assert.equal(currentEvent(scene.session), 'sprint');
    assert.deepEqual(scene.state.rival.x, 0);
  });

  it('ends the Session on a missed Standard: High Score entry when the total qualifies', () => {
    const g = game();
    g.manager.change('event', { entry: g.services.catalogue.arcade, mode: 'arcade' });
    g.start();
    // A false start disqualifies: no Mark, Standard missed.
    for (let i = 0; i < 400 && g.manager.currentName === 'event'; i++) g.step({ edges: i % 5 === 0 ? [edge(i % 10 ? 'RUN_B' : 'RUN_A')] : [] });
    const results = (g.scenes.results as any);
    assert.equal(results.session.over, true);
    assert.equal(results.session.points, 0);
    for (let k = 0; k <= RESULTS_DELAY; k++) g.step();
    g.start();
    assert.equal(g.manager.currentName, 'title', 'no Points, no High Score');
  });

  it('the High Jump in Arcade runs the bar progression and lists heights with O and X', () => {
    const g = game();
    const entry = g.services.catalogue.events.find((e) => e.id === 'highJump');
    g.manager.change('event', { entry, mode: 'arcade' });
    playDemo(g);
    const results = (g.scenes.results as any);
    assert.ok(results.result.heights.length >= HIGH_JUMP.attemptsPerHeight);
    assert.ok(results.result.marks[0].value >= HIGH_JUMP.startHeight);
    const line = heightsLine(results.result);
    assert.match(line, /O/);
    assert.match(line, /XXX$/);
  });

  it('the field Event plan keeps the three-Attempt series', () => {
    assert.equal(SERIES_PLAN.create(3).limit, 3);
  });
});

describe('Difficulty: Easy, Normal and Hard', () => {
  it('has the three levels, Normal by default, and Normal changes nothing', () => {
    assert.deepEqual([...DIFFICULTIES], ['easy', 'normal', 'hard']);
    assert.equal(DIFFICULTY_DATA.default, 'normal');
    assert.equal(simParamsFor('normal'), SIM_PARAMS);
    assert.equal(simFor('sprint', 'normal'), EVENT_SIMS.sprint);
    assert.deepEqual(applyDifficulty(SIM_PARAMS.hurdles, DIFFICULTY_DATA.levels.normal), SIM_PARAMS.hurdles);
  });

  it('Easy is faster to mash, with a slower Rival, wider windows and easier Standards; Hard the opposite', () => {
    const easy = simParamsFor('easy');
    const hard = simParamsFor('hard');
    assert.ok(easy.sprint.speed.gainPerAlternation > SIM_PARAMS.sprint.speed.gainPerAlternation);
    assert.ok(hard.sprint.speed.gainPerAlternation < SIM_PARAMS.sprint.speed.gainPerAlternation);
    assert.ok(easy.sprint.rival.cycles[0].topSpeed < SIM_PARAMS.sprint.rival.cycles[0].topSpeed);
    assert.ok(hard.hurdles.rival.cycles[0].topSpeed > SIM_PARAMS.hurdles.rival.cycles[0].topSpeed);
    assert.ok(easy.longJump.angleWindow.max - easy.longJump.angleWindow.min > SIM_PARAMS.longJump.angleWindow.max - SIM_PARAMS.longJump.angleWindow.min);
    assert.ok(hard.hurdles.clearWindow.to - hard.hurdles.clearWindow.from < HURDLES.clearWindow.to - HURDLES.clearWindow.from);
    assert.ok(easy.hammer.releaseWindow.halfWidth > SIM_PARAMS.hammer.releaseWindow.halfWidth);
    assert.ok(eventStandard('sprint', 1, 'easy').value > eventStandard('sprint', 1).value, 'more time');
    assert.ok(eventStandard('longJump', 1, 'hard').value > eventStandard('longJump', 1).value, 'further');
  });

  it('the same mashing finishes sooner on Easy than on Hard', () => {
    const time = (d: import('../src/sim/difficulty.ts').Difficulty) => drive(simFor('sprint', d), mash(7, SIM_PARAMS.sprint.startSignalFrame + 2)).result?.marks[0].value;
    assert.ok((time('easy') as number) < (time('normal') as number));
    assert.ok((time('normal') as number) < (time('hard') as number));
  });

  it('a Session plays at the difficulty set in Settings, and keeps it', () => {
    const g = game({ difficulty: 'easy' });
    g.manager.change('event', { entry: g.services.catalogue.arcade, mode: 'arcade' });
    const scene = (g.scenes.event as any);
    assert.equal(scene.session.difficulty, 'easy');
    g.services.settings.update({ difficulty: 'hard' });
    assert.equal(scene.session.difficulty, 'easy');
    g.manager.render((colourCtx() as any), 0);
  });

  it('Practice follows the setting too', () => {
    const g = game({ difficulty: 'hard' });
    const entry = g.services.catalogue.events.find((e) => e.id === 'sprint');
    g.manager.change('event', { entry, mode: 'practice' });
    const scene = (g.scenes.event as any);
    assert.equal(scene.session, null);
    // Mash identically at Normal and compare the speed after a second of racing.
    const at = (s: any) => s.meter.value;
    for (let i = 0; i < SIM_PARAMS.sprint.startSignalFrame + 60; i++) g.step({ edges: i > SIM_PARAMS.sprint.startSignalFrame && i % 5 === 0 ? [edge(i % 10 ? 'RUN_B' : 'RUN_A')] : [] });
    const normal = drive((EVENT_SIMS.sprint as AnySim), (f) => (f > SIM_PARAMS.sprint.startSignalFrame - 1 && (f + 1) % 5 === 0 ? [edge((f + 1) % 10 ? 'RUN_B' : 'RUN_A')] : []));
    const normalAt = normal.states[SIM_PARAMS.sprint.startSignalFrame + 60];
    assert.ok(at(scene.state) < at(normalAt));
  });
});

describe('renderers for the new Events (#49, #51)', () => {
  it('Hurdles: hurdles in both lanes, and a hit one lies down', () => {
    const sim = (EVENT_SIMS.hurdles as AnySim);
    const crash = drive(sim, (f) => mash(5, signal)(f));
    const hitState = crash.states.find((s) => s.hit.length === 1 && s.stumble > 0);
    const ctx = colourCtx();
    renderHurdles((ctx as any), hitState);
    assert.ok(ctx.uses(HURDLE_COLOURS.w) && ctx.uses(HURDLE_COLOURS.f));
    assert.ok(ctx.uses(PLAYER_1.s));
    const cams = crash.states.map((s) => hurdlesCamera(s, HURDLES));
    assert.ok(cams[cams.length - 1] > cams[200]);
  });

  it('High Jump: the bar is drawn at its height above the apron, and the camera holds it in view', () => {
    const sim = (EVENT_SIMS.highJump as AnySim);
    const state = sim.init({ cycle: 1, players: 1, barHeight: 40 });
    const ctx = colourCtx();
    renderHighJump((ctx as any), state);
    const barY = HIGH_JUMP_GROUND.feetY - 40;
    assert.ok(ctx.rects.some((r) => r.y === barY && (r.colour === ART.bar || r.colour === ART.barStripe)));
    const run = drive(sim, mash(5));
    const last = run.states[run.states.length - 1];
    const barScreenX = HIGH_JUMP_VIEW.startX + HIGH_JUMP.barX - highJumpCamera(last, HIGH_JUMP);
    assert.ok(barScreenX > 0 && barScreenX < SCREEN_WIDTH);
  });

  it('High Jump: shows the bar height in metres, and a failure clearly', () => {
    const sim = (EVENT_SIMS.highJump as AnySim);
    const failed = drive(sim, mash(5)).state;
    const ctx = colourCtx();
    renderHighJump((ctx as any), failed);
    assert.ok(ctx.uses(PALETTE.warning));
    assert.match(formatMark(HIGH_JUMP.startHeight, 'pixels', 'highJump'), /^\d\.\d\d M$/);
  });

  it('Javelin: outlined and shadowed in flight, so it reads against the crowd (#43)', () => {
    const sim = (EVENT_SIMS.javelin as AnySim);
    const trace = makeAttractTrace('javelin');
    let state = sim.init({ cycle: 1, players: 1 });
    for (let f = 0; f < trace.frames && !(state.flight && state.flight.y > 20); f++) state = sim.step(state, { frame: f, edges: trace.inputs.filter((e) => e.frame === f) });
    const ctx = colourCtx();
    renderJavelin((ctx as any), state);
    assert.ok(ctx.uses(OUTLINE_COLOURS.m));
  });

  it('the new Events have sounds: a clatter for a hurdle hit and a knocked bar', () => {
    const sounds = recordingSounds();
    const sim = (EVENT_SIMS.hurdles as AnySim);
    const crash = drive(sim, (f) => mash(5, signal)(f));
    const i = crash.states.findIndex((s) => s.hit.length === 1);
    hurdlesSounds(crash.states[i - 1], crash.states[i], { frame: 0, edges: [] }, sounds);
    assert.ok(sounds.played.includes('thud'));
    const knocked = drive((EVENT_SIMS.highJump as AnySim), highJumpPlan(45, 40), { barHeight: 90 });
    const k = knocked.states.findIndex((s) => s.overBar === false);
    const jumpSounds = recordingSounds();
    highJumpSounds(knocked.states[k - 1], knocked.states[k], { frame: 0, edges: [] }, jumpSounds);
    assert.ok(jumpSounds.played.includes('thud'));
  });
});

describe('Settings: Cookie Policy and Credits', () => {
  it('the Credits start with Adrian Eyre and open the repository', () => {
    const first = CREDITS.lines.find((l) => (typeof l === 'string' ? l : l.text) && !(typeof l !== 'string' && l.heading));
    assert.equal(first, 'ADRIAN EYRE');
    assert.equal(REPO_URL, 'https://github.com/adrianeyre/hexathlon');
    const opened: string[] = [];
    const services = testServices({ openUrl: (url) => opened.push(url) });
    const manager = new SceneManager({});
    registerScenes(manager, services);
    manager.change('settings');
    manager.change('credits');
    manager.render((colourCtx() as any), 0);
    assert.equal((manager.current as any).focus, 'back', 'BACK is the default button');
    manager.step({ frame: 0, edges: [{ player: 0, action: 'LEFT', type: 'press' }] });
    manager.step({ frame: 0, edges: [{ player: 0, action: 'START', type: 'press' }] });
    assert.deepEqual(opened, [REPO_URL]);
    manager.step({ frame: 0, edges: [{ player: 0, action: 'PAUSE', type: 'press' }] });
    assert.equal(manager.currentName, 'settings');
    manager.change('credits');
    manager.step({ frame: 0, edges: [{ player: 0, action: 'START', type: 'press' }] });
    assert.equal(manager.currentName, 'settings', 'START on arrival goes back');
    assert.deepEqual(opened, [REPO_URL]);
  });

  it('the Cookie Policy says no cookies are set and what local storage keeps', () => {
    const text = COOKIE_POLICY.lines.map((l) => (typeof l === 'string' ? l : l.text)).join(' ');
    assert.match(text, /DOES NOT SET ANY COOKIES/);
    assert.match(text, /LOCAL STORAGE/);
    assert.match(text, /DIFFICULTY/);
    const services = testServices();
    const manager = new SceneManager({});
    const scenes = registerScenes(manager, services);
    manager.change('cookiePolicy');
    manager.render((colourCtx() as any), 0);
    manager.step({ frame: 0, edges: [{ player: 0, action: 'DOWN', type: 'press' }] });
    assert.equal((scenes.cookiePolicy as any).scroll, 1, 'it scrolls');
    manager.render((colourCtx() as any), 0);
  });
});

describe('full screen', () => {
  it('fills 100% of the viewport, whatever its shape', () => {
    for (const [w, h] of [
      [1920, 1080],
      [390, 844],
      [1024, 768],
    ]) {
      const box = fitFill(w, h);
      assert.equal(box.cssWidth, w);
      assert.equal(box.cssHeight, h);
    }
    assert.equal(fitFill(SCREEN_WIDTH * 3, SCREEN_HEIGHT * 3).scale, 3);
  });

  it('is a saved setting, off by default', () => {
    const g = game();
    assert.equal(g.services.storage.getSettings().fullScreen, false);
    g.services.settings.update({ fullScreen: true });
    assert.equal(g.services.storage.getSettings().fullScreen, true);
  });
});
