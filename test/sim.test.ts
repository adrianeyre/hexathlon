import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  angleEfficiency,
  bestMark,
  createSeries,
  landingDistance,
  launch,
  nextAttempt,
  recordAttempt,
  seriesOver,
  startAngle,
  stepAngle,
  stepFlight,
} from '../src/sim/field.ts';
import { angleDiff, createHammerSim } from '../src/sim/hammer.ts';
import { createJavelinSim } from '../src/sim/javelin.ts';
import { createLongJumpSim } from '../src/sim/long-jump.ts';
import { EVENT_ATTEMPTS, EVENT_DATA, EVENT_SIMS, SIM_PARAMS } from '../src/sim/registry.ts';
import { createRival, rivalCycle, stepRival } from '../src/sim/rival.ts';
import { createMeter, decayMeter, pressRun, speedParams, stepMeter, velocityOf } from '../src/sim/speed.ts';
import { createSprintSim } from '../src/sim/sprint.ts';

export type InputEdge = import('../src/sim/types.ts').InputEdge;
export type AnySim = import('../src/sim/types.ts').EventSim<any>;

const edge = (action: 'RUN_A' | 'RUN_B' | 'ACTION', type: 'press' | 'release' = 'press'): InputEdge => ({ player: 1, action, type });

/**
 * Drive a sim frame by frame. `plan(frame, state)` returns the frame's edges.
 */
function drive(sim: AnySim, plan: (frame: number, state: any) => InputEdge[], { frames = 3000, init = {} }: { frames?: number; init?: Partial<import('../src/sim/types.ts').EventInit>; } = {}) {
  let state = sim.init({ cycle: 1, players: 1, ...init });
  const states: any[] = [state];
  for (let f = 0; f < frames; f++) {
    state = sim.step(state, { frame: f, edges: plan(f, state) });
    states.push(state);
    const result = sim.getResult(state);
    if (result) return { state, states, result, frame: f };
  }
  return { state, states, result: null, frame: frames };
}

/**
 * Alternate run presses every `every` frames, from `from`.
 */
const mash = (every: number, from: number = 0) => (f: number) =>
  f >= from && (f - from) % every === 0 ? [edge(((f - from) / every) % 2 ? 'RUN_B' : 'RUN_A')] : [];

const SPEED = speedParams(EVENT_DATA.speed);

describe('speed meter (#24)', () => {
  it('adds the alternation gain for each press of the other key', () => {
    let m = createMeter();
    m = pressRun(m, 'RUN_A', SPEED);
    m = pressRun(m, 'RUN_B', SPEED);
    m = pressRun(m, 'RUN_A', SPEED);
    assert.equal(m.value, SPEED.gainPerAlternation * 3);
    assert.equal(m.presses, 3);
  });

  it('adds the same-key gain for repeats of one key, as set in data', () => {
    const params = speedParams(SPEED, { sameKeyGain: 0.25 });
    let m = pressRun(createMeter(), 'RUN_A', params);
    m = pressRun(m, 'RUN_A', params);
    assert.equal(m.value, params.gainPerAlternation + 0.25);
    assert.equal(pressRun(pressRun(createMeter(), 'RUN_A', SPEED), 'RUN_A', SPEED).value, SPEED.gainPerAlternation + SPEED.sameKeyGain);
  });

  it('caps at the per-Event maximum', () => {
    const params = speedParams(SPEED, { max: 2 });
    let m = createMeter();
    for (let i = 0; i < 10; i++) m = pressRun(m, i % 2 ? 'RUN_B' : 'RUN_A', params);
    assert.equal(m.value, 2);
  });

  it('decays every frame by the ratio and the constant, never below zero', () => {
    const m = { ...createMeter(), value: 10 };
    assert.equal(decayMeter(m, SPEED).value, 10 * (1 - SPEED.decayRatio) - SPEED.decayPerFrame);
    assert.equal(decayMeter({ ...m, value: 0.001 }, SPEED).value, 0);
  });

  it('drops no alternation at 12 presses a second, or two presses in one frame', () => {
    let m = createMeter();
    const params = speedParams(SPEED, { max: 1e9, decayRatio: 0, decayPerFrame: 0 });
    for (let f = 0; f < 600; f++) m = stepMeter(m, f % 5 === 0 ? [edge((f / 5) % 2 ? 'RUN_B' : 'RUN_A')] : [], 1, params);
    assert.equal(m.presses, 120);
    assert.ok(Math.abs(m.value - 120 * params.gainPerAlternation) < 1e-9);
    const both = stepMeter(createMeter(), [edge('RUN_A'), edge('RUN_B')], 1, params);
    assert.equal(both.value, 2 * params.gainPerAlternation);
  });

  it("ignores the other player's presses and releases", () => {
    const m = stepMeter(createMeter(), [{ player: 2, action: 'RUN_A', type: 'press' }, edge('RUN_B', 'release')], 1, SPEED);
    assert.equal(m.value, 0);
  });

  it('faster mashing settles at a higher speed', () => {
    const settled = (every: number) => {
      let m = createMeter();
      for (let f = 0; f < 1200; f++) m = stepMeter(m, mash(every)(f), 1, SPEED);
      return m.value;
    };
    assert.ok(settled(5) > settled(8));
    assert.ok(settled(8) > settled(15));
  });

  it('maps the meter to pixels per frame from data', () => {
    assert.equal(velocityOf(4, SPEED), 4 * EVENT_DATA.speed.velocityPerUnit);
  });

  it('takes every parameter from data/events.json, with per-Event overrides', () => {
    assert.deepEqual({ ...SIM_PARAMS.sprint.speed }, { ...EVENT_DATA.speed, ...EVENT_DATA.sprint.speed });
    assert.equal(SIM_PARAMS.hammer.speed.decayRatio, EVENT_DATA.hammer.speed.decayRatio);
    assert.equal(EVENT_DATA.provisional, true, 'still provisional until the reference capture lands');
  });
});

describe('100m Dash (#25)', () => {
  it('the Rival stays in the blocks until the gun, then waits its reaction time', () => {
    const params = SIM_PARAMS.sprint;
    const sim = createSprintSim(params);
    let state = sim.init({ cycle: 1, players: 1 });
    for (let f = 0; state.raceFrame < params.rival.cycles[0].reactionFrames; f++) {
      state = sim.step(state, { frame: f, edges: [] });
      assert.equal(state.rival.x, 0, `the Rival hasn't moved at frame ${f} (${state.phase})`);
    }
    state = sim.step(state, { frame: 999, edges: [] });
    assert.ok(state.rival.x > 0, 'and then it runs');
  });

  const sim = (EVENT_SIMS.sprint as AnySim);
  const { startSignalFrame, distance } = SIM_PARAMS.sprint;

  it('holds everyone in the blocks until the start signal', () => {
    const { states } = drive(sim, () => [], { frames: startSignalFrame + 5 });
    assert.equal(states[startSignalFrame - 1].phase, 'set');
    assert.equal(states[startSignalFrame].phase, 'race');
    assert.ok(states.every((s) => s.x === 0));
  });

  it('forgives the allowed false starts, restarting the sequence, then disqualifies', () => {
    const allowed = SIM_PARAMS.sprint.falseStartsAllowed;
    const presses = new Set(Array.from({ length: allowed + 1 }, (_, i) => 10 + i * 20));
    const { result, states } = drive(sim, (f) => (presses.has(f) ? [edge('RUN_A')] : []));
    assert.equal(states[11].setFrame, 0, 'back to the start of the sequence');
    assert.equal(states[11].falseStarts, 1);
    assert.equal(result?.marks[0].outcome, 'falseStart');
    assert.equal(result?.marks[0].value, null);
  });

  it('times the race in frames from the start signal to the finish line', () => {
    const { result, state } = drive(sim, mash(5, startSignalFrame + 1));
    assert.equal(result?.marks[0].outcome, 'valid');
    assert.equal(result?.marks[0].unit, 'frames');
    assert.equal(result?.marks[0].value, state.finishFrame);
    assert.ok(state.x >= distance);
    assert.equal(state.frame, startSignalFrame + (state.finishFrame as number));
  });

  it('is faster for faster mashing, and deterministic', () => {
    const fast = drive(sim, mash(5, startSignalFrame + 1)).result?.marks[0].value ?? 0;
    const slow = drive(sim, mash(9, startSignalFrame + 1)).result?.marks[0].value ?? 0;
    assert.ok(fast < slow);
    assert.equal(drive(sim, mash(5, startSignalFrame + 1)).result?.marks[0].value, fast);
  });

  it('moves the athlete by the meter mapped to pixels per frame', () => {
    const { states } = drive(sim, mash(5, startSignalFrame + 1), { frames: startSignalFrame + 40 });
    const a = states[startSignalFrame + 30];
    const b = states[startSignalFrame + 31];
    assert.ok(Math.abs(b.x - a.x - velocityOf(b.meter.value, SIM_PARAMS.sprint.speed)) < 1e-9);
  });

  it('uses the distance and start signal from its parameters', () => {
    const short = createSprintSim({ ...SIM_PARAMS.sprint, distance: 100, startSignalFrame: 10 });
    const { result } = drive(short, mash(5, 11));
    assert.ok((result?.marks[0].value ?? Infinity) < 120);
  });
});

describe('the Rival (#26)', () => {
  const params = SIM_PARAMS.sprint.rival;
  const race = (cycle: number) => {
    let r = createRival(params, cycle);
    const xs: number[] = [];
    for (let f = 1; r.finishFrame === null && f < 5000; f++) {
      r = stepRival(r, params, cycle, f, SIM_PARAMS.sprint.distance);
      xs.push(r.x);
    }
    return { r, xs };
  };

  it('runs the same race every time for a Cycle (seeded)', () => {
    assert.deepEqual(race(1).xs, race(1).xs);
  });

  it('waits its reaction time, then runs at its Cycle pace', () => {
    const { xs } = race(1);
    const { reactionFrames, topSpeed } = rivalCycle(params, 1);
    assert.equal(xs[reactionFrames - 1], 0);
    assert.ok(xs[reactionFrames] > 0);
    const late = xs[400] - xs[399];
    assert.ok(Math.abs(late - topSpeed) <= params.jitter + 1e-9);
  });

  it('gets faster each Cycle, including beyond the listed Cycles, up to the cap', () => {
    const times = [1, 2, 3, 4, 5].map((c) => (race(c).r.finishFrame as number));
    for (let i = 1; i < times.length; i++) assert.ok(times[i] < times[i - 1], `cycle ${i + 1}`);
    assert.equal(rivalCycle(params, 4).topSpeed, Math.min(params.topSpeedCap, params.cycles[2].topSpeed + params.beyondTopSpeedStep));
    assert.equal(rivalCycle(params, 99).topSpeed, params.topSpeedCap);
  });

  it("puts the Rival's time in the result for the results screen", () => {
    const sim = (EVENT_SIMS.sprint as AnySim);
    const { result } = drive(sim, mash(5, SIM_PARAMS.sprint.startSignalFrame + 1));
    assert.equal(result?.rival?.unit, 'frames');
    assert.equal(result?.rival?.value, race(1).r.finishFrame);
  });
});

describe('shared field rules (#36)', () => {
  const angle = EVENT_DATA.field.angle;

  it('raises the angle while ACTION is held, at the rate from data, and commits on release', () => {
    let hold = startAngle(angle);
    for (let i = 0; i < 10; i++) hold = stepAngle(hold, false, angle);
    assert.equal(hold.angle, angle.start + 10 * angle.riseRate);
    assert.equal(hold.committed, false);
    hold = stepAngle(hold, true, angle);
    assert.equal(hold.committed, true);
    assert.equal(stepAngle(hold, false, angle).angle, hold.angle, 'no change once committed');
  });

  it('stops at the maximum angle and commits after the longest hold', () => {
    let hold = startAngle(angle);
    for (let i = 0; i < angle.maxHoldFrames; i++) hold = stepAngle(hold, false, angle);
    assert.ok(hold.angle <= angle.max);
    assert.equal(hold.committed, true);
  });

  it('is fully efficient inside the angle window and falls off outside it', () => {
    const params = SIM_PARAMS.longJump;
    const floor = EVENT_DATA.field.efficiencyFloor;
    assert.equal(angleEfficiency(params.angleWindow.min, params, floor), 1);
    assert.equal(angleEfficiency(params.angleWindow.max, params, floor), 1);
    assert.ok(angleEfficiency(params.angleWindow.min - 10, params, floor) < 1);
    assert.ok(angleEfficiency(params.angleWindow.max + 10, params, floor) < angleEfficiency(params.angleWindow.max + 5, params, floor));
    assert.equal(angleEfficiency(-500, params, floor), floor);
  });

  it('flies a ballistic path and lands exactly on the ground', () => {
    const params = SIM_PARAMS.longJump;
    let f = launch(3, 45, params, 0.3);
    let frames = 0;
    while (!f.landed) {
      f = stepFlight(f, params.gravity);
      frames++;
    }
    assert.equal(f.y, 0);
    assert.ok(frames > 10);
    assert.equal(landingDistance(launch(3, 45, params, 0.3), params.gravity), f.x);
  });

  it('limits a series to the Attempts from data and keeps the best valid Mark', () => {
    assert.equal(EVENT_ATTEMPTS.longJump, EVENT_DATA.field.attempts);
    assert.equal(EVENT_ATTEMPTS.sprint, 1);
    const mark = (value: number | null): import('../src/sim/types.ts').PlayerMark => ({ player: 1, outcome: value === null ? 'foul' : 'valid', value, unit: 'pixels' });
    let s = createSeries(3);
    assert.equal(nextAttempt(s), 1);
    s = recordAttempt(s, mark(100));
    s = recordAttempt(s, mark(null));
    assert.equal(seriesOver(s), false);
    assert.equal(nextAttempt(s), 3);
    s = recordAttempt(s, mark(90));
    assert.equal(seriesOver(s), true);
    assert.equal(bestMark(s)?.value, 100);
    const fouls = recordAttempt(recordAttempt(createSeries(2), mark(null)), mark(null));
    assert.equal(bestMark(fouls)?.outcome, 'foul');
  });
});

/**
 * Run up at 12 presses a second, press ACTION when `when(state)` first holds,
 * and hold it for `hold` frames.
 */
function attempt(sim: AnySim, when: (state: any) => boolean, hold: number, { mashDuringHold = true, init }: { mashDuringHold?: boolean; init?: Partial<import('../src/sim/types.ts').EventInit>; } = {}) {
  let pressedAt: number | null = null;
  return drive(
    sim,
    (f, state) => {
      const edges: InputEdge[] = [];
      if (pressedAt === null && when(state)) {
        pressedAt = f;
        edges.push(edge('ACTION'));
      }
      if (pressedAt !== null && f === pressedAt + hold) edges.push(edge('ACTION', 'release'));
      if (pressedAt === null || mashDuringHold) edges.push(...mash(5)(f));
      return edges;
    },
    { init },
  );
}

describe('Long Jump (#37)', () => {
  const sim = (EVENT_SIMS.longJump as AnySim);
  const { foulLine } = SIM_PARAMS.longJump;
  const holdFor = (deg: number) => Math.round(deg / EVENT_DATA.field.angle.riseRate);

  it('measures a valid jump from the foul line to the landing', () => {
    const { result, state } = attempt(sim, (s) => s.x > foulLine - 6, holdFor(43), { mashDuringHold: false });
    assert.equal(result?.marks[0].outcome, 'valid');
    assert.equal(result?.marks[0].unit, 'pixels');
    assert.ok(Math.abs((result?.marks[0].value ?? 0) - (state.x - foulLine)) < 1e-9);
    assert.ok(state.takeoffX <= foulLine);
  });

  it('jumps further inside the angle window than outside it', () => {
    const jump = (deg: number) => attempt(sim, (s) => s.x > foulLine - 6, holdFor(deg), { mashDuringHold: false }).result?.marks[0].value ?? 0;
    assert.ok(jump(43) > jump(20));
    assert.ok(jump(43) > jump(70));
  });

  it('fouls when running past the foul line without taking off', () => {
    const { result, state } = attempt(sim, () => false, 0);
    assert.equal(result?.marks[0].outcome, 'foul');
    assert.equal(result?.marks[0].value, null);
    assert.equal(state.foul, 'overstep');
  });

  it('fouls when ACTION comes after the foul line', () => {
    const late = createLongJumpSim({ ...SIM_PARAMS.longJump, foulLine: 50 });
    // Take off one frame too late: the athlete is already past the line.
    let state = late.init({ cycle: 1, players: 1 });
    state = { ...state, x: 51 };
    state = late.step(state, { frame: 0, edges: [edge('ACTION')] });
    assert.equal(state.outcome, 'foul');
    assert.equal(state.foul, 'late');
  });

  it('fouls when the Run-up time runs out', () => {
    const { state } = drive(sim, () => []);
    assert.equal(state.foul, 'time');
    assert.equal(state.frame, EVENT_DATA.field.maxRunUpFrames + EVENT_DATA.field.settleFrames);
  });

  it('takes the foul line from data', () => {
    const near = createLongJumpSim({ ...SIM_PARAMS.longJump, foulLine: 100 });
    const { state } = attempt(near, () => false, 0);
    assert.ok(state.x > 100 && state.x < 110);
  });

  it('carries the Attempt number it was started with', () => {
    assert.equal(sim.init({ cycle: 1, players: 1, attempt: 3 }).attempt, 3);
    assert.equal(sim.init({ cycle: 1, players: 1 }).attempt, 1);
  });
});

describe('Javelin Throw (#38)', () => {
  const sim = (EVENT_SIMS.javelin as AnySim);
  const { foulLine } = SIM_PARAMS.javelin;

  it('throws a valid Mark when released early enough to stop behind the line', () => {
    const { result, state } = attempt(sim, (s) => s.x > foulLine - 150, 29);
    assert.equal(result?.marks[0].outcome, 'valid');
    assert.ok(state.x <= foulLine);
    assert.ok(Math.abs((result?.marks[0].value ?? 0) - (state.releaseX + state.flight.x - foulLine)) < 1e-9);
  });

  it('fouls when the athlete crosses the line, even after the release', () => {
    // Release just behind the line: the follow-through carries the athlete over it.
    const { result, state } = drive(sim, (f, s) => {
      if (s.phase === 'runup' && s.x > foulLine - 60) return [edge('ACTION')];
      if (s.phase === 'throwing' && s.x > foulLine - 6) return [edge('ACTION', 'release')];
      return mash(5)(f);
    });
    assert.equal(result?.marks[0].outcome, 'foul');
    assert.equal(state.foul, 'overstep');
    assert.ok(Number.isFinite(state.releaseX), 'released before crossing');
  });

  it('fouls when running through without throwing', () => {
    assert.equal(attempt(sim, () => false, 0).state.foul, 'overstep');
  });

  it('throws further inside the release angle window', () => {
    const at = (hold: number) => attempt(sim, (s) => s.x > foulLine - 200, hold).result?.marks[0].value ?? 0;
    assert.ok(at(30) > at(10));
    assert.ok(at(30) > at(50));
  });

  it('takes its parameters from data', () => {
    const custom = createJavelinSim({ ...SIM_PARAMS.javelin, foulLine: 200 });
    assert.equal(attempt(custom, () => false, 0).state.foul, 'overstep');
  });
});

describe('Hammer Throw (#39)', () => {
  const sim = (EVENT_SIMS.hammer as AnySim);
  const params = SIM_PARAMS.hammer;

  /**
   * Spin up, then press ACTION when the spin will reach `target` degrees off
   * the window centre after `hold` frames, assuming the current spin speed.
   */
  const throwAt = (target: number, hold: number = 29) =>
    attempt(sim, (s) => {
      if (s.frame < 240 || s.spinSpeed <= 0) return false;
      const predicted = angleDiff(s.spin + s.spinSpeed * (hold + 1), params.releaseWindow.centre);
      return Math.abs(predicted - target) <= s.spinSpeed / 2;
    }, hold);

  it('spins up from mashing', () => {
    const { states } = drive(sim, mash(5), { frames: 200 });
    assert.ok(states[200].spinSpeed > states[20].spinSpeed);
    assert.equal(states[200].spinSpeed, states[200].meter.value * params.spinPerUnit);
  });

  it('throws a valid Mark when released inside the window', () => {
    const { result, state } = throwAt(0);
    assert.equal(result?.marks[0].outcome, 'valid');
    assert.ok(Math.abs((state.releaseOffset as number)) <= params.releaseWindow.halfWidth);
    assert.ok((result?.marks[0].value ?? 0) > 0);
  });

  it('loses distance the further the release is from straight down the field', () => {
    const straight = throwAt(0).result?.marks[0].value ?? 0;
    const edgeOfWindow = throwAt(params.releaseWindow.halfWidth - 6).result?.marks[0].value ?? 0;
    assert.ok(straight > edgeOfWindow);
  });

  it('fouls into the cage outside the release window', () => {
    const { result, state } = throwAt(150);
    assert.equal(result?.marks[0].outcome, 'foul');
    assert.equal(state.foul, 'cage');
  });

  it('fouls when the thrower never lets go', () => {
    const { state } = drive(sim, mash(5));
    assert.equal(state.foul, 'time');
  });

  it('takes the release window from data', () => {
    const narrow = createHammerSim({ ...params, releaseWindow: { centre: 0, halfWidth: 0 } });
    let state = narrow.init({ cycle: 1, players: 1 });
    state = { ...state, spin: 10, meter: { ...state.meter, value: 5 } };
    state = narrow.step(state, { frame: 0, edges: [edge('ACTION'), edge('ACTION', 'release')] });
    assert.equal(state.foul, 'cage');
  });

  it('measures angles the short way round', () => {
    assert.equal(angleDiff(350, 0), -10);
    assert.equal(angleDiff(10, 350), 20);
  });
});
