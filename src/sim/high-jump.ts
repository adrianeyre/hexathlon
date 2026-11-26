/**
 * High Jump. One Attempt is one jump at one bar height (GLOSSARY): mash along
 * the Run-up, press ACTION to take off, hold it to raise the take-off angle
 * and release to jump. The bar is cleared when the athlete is above it as
 * they pass it; otherwise it is knocked off. Running into the bar without
 * taking off, or running out of Run-up time, also fails.
 *
 * The bar progression (starting height, increments, Attempts per height, and
 * the end of the Event after failing every Attempt at a height) is a separate
 * pure series below, so an Input Trace stays one Attempt.
 *
 * Every number comes from `data/events.json` (`highJump`, `field` and the
 * shared `speed`). Phases: `runup`, `takeoff`, `flight`, `landed`, `done`.
 * The Mark of a cleared Attempt is the bar height in pixels.
 */

import { launch, startAngle, stepAngle, stepFlight } from './field.ts';
import { createMeter, hasEdge, stepMeter, velocityOf } from './speed.ts';

export type SpeedParams = import('./speed.ts').SpeedParams;
export type PlayerMark = import('./types.ts').PlayerMark;

export interface HighJumpOwnParams {
  speed: SpeedParams;
  field: import('./field.ts').FieldParams & { maxRunUpFrames: number, settleFrames: number };
  /** Start of the Run-up to the bar, in pixels. */
  barX: number;
  /** First bar height, in pixels. */
  startHeight: number;
  /** Pixels the bar rises after a clearance. */
  increment: number;
  /** Failures at one height that end the Event. */
  attemptsPerHeight: number;
}

export type HighJumpParams = HighJumpOwnParams & import('./field.ts').LaunchParams;

export interface HighJumpState {
  phase: 'runup' | 'takeoff' | 'flight' | 'landed' | 'done';
  frame: number;
  /** 1-based Attempt number at this height. */
  attempt: number;
  /** Pixels. */
  barHeight: number;
  /** Pixels from the start of the Run-up. */
  x: number;
  /** Pixels above the ground. */
  y: number;
  meter: import('./speed.ts').Meter;
  takeoffX: number;
  takeoffSpeed: number;
  hold: import('./field.ts').AngleHold | null;
  flight: import('./field.ts').Flight | null;
  /** Whether the athlete was above the bar as they passed it; null before. */
  overBar: boolean | null;
  settle: number;
  outcome: 'valid' | 'failed' | null;
  fail: 'knocked' | 'baulk' | 'time' | null;
}

export function createHighJumpSim(params: HighJumpParams): import('./types.ts').EventSim<HighJumpState> {
  const { field } = params;

  const failed = (state: HighJumpState, fail: 'knocked' | 'baulk' | 'time'): HighJumpState => ({ ...state, phase: 'landed', outcome: 'failed', fail, settle: 0 });

  return {
    id: 'highJump',

    init({ attempt = 1, barHeight = params.startHeight }) {
      return {
        phase: 'runup',
        frame: 0,
        attempt,
        barHeight,
        x: 0,
        y: 0,
        meter: createMeter(),
        takeoffX: Number.NaN,
        takeoffSpeed: 0,
        hold: null,
        flight: null,
        overBar: null,
        settle: 0,
        outcome: null,
        fail: null,
      };
    },

    step(prev, input) {
      if (prev.phase === 'done') return prev;
      let state: HighJumpState = { ...prev, frame: prev.frame + 1 };
      const pressed = hasEdge(input.edges, 1, 'ACTION', 'press');
      const released = hasEdge(input.edges, 1, 'ACTION', 'release');

      if (state.phase === 'runup') {
        if (pressed) {
          const hold = stepAngle(startAngle(field.angle), false, field.angle);
          state = { ...state, phase: 'takeoff', takeoffX: state.x, takeoffSpeed: velocityOf(state.meter.value, params.speed), hold };
          if (!released) return state;
          state = { ...state, hold: { ...hold, committed: true } };
        } else {
          const meter = stepMeter(state.meter, input.edges, 1, params.speed);
          const x = Math.min(params.barX, state.x + velocityOf(meter.value, params.speed));
          state = { ...state, meter, x };
          if (x >= params.barX) return failed(state, 'baulk');
          if (state.frame >= field.maxRunUpFrames) return failed(state, 'time');
          return state;
        }
      }

      if (state.phase === 'takeoff') {
        const hold = state.hold && !state.hold.committed ? stepAngle(state.hold, released, field.angle) : state.hold;
        if (!hold || !hold.committed) return { ...state, hold };
        const flight = launch(state.takeoffSpeed, hold.angle, params, field.efficiencyFloor);
        return { ...state, hold, flight, phase: 'flight' };
      }

      if (state.phase === 'flight' && state.flight) {
        const flight = stepFlight(state.flight, params.gravity);
        const x = state.takeoffX + flight.x;
        let { overBar } = state;
        // Judge the clearance on the frame the athlete passes the bar, at the bar itself.
        if (overBar === null && x >= params.barX && state.flight.vx > 0) {
          const t = (params.barX - state.takeoffX - state.flight.x) / state.flight.vx;
          const yAtBar = state.flight.y + (state.flight.vy - params.gravity) * Math.max(0, Math.min(1, t));
          overBar = yAtBar >= state.barHeight;
        }
        if (!flight.landed) return { ...state, flight, x, y: flight.y, overBar };
        // Landing short of the bar never passed it: the bar comes down.
        if (overBar === true) return { ...state, flight, x, y: 0, overBar, phase: 'landed', outcome: 'valid', settle: 0 };
        return failed({ ...state, flight, x, y: 0, overBar: overBar ?? false }, 'knocked');
      }

      if (state.phase === 'landed') {
        const settle = state.settle + 1;
        return { ...state, settle, phase: settle >= field.settleFrames ? 'done' : 'landed' };
      }
      return state;
    },

    getResult(state) {
      if (state.phase !== 'done' || state.outcome === null) return null;
      const value = state.outcome === 'valid' ? state.barHeight : null;
      return { marks: [{ player: 1, outcome: state.outcome, value, unit: 'pixels' }] };
    },
  };
}

/** The bar progression for one go at the High Jump. */
export interface BarSeries {
  /** The current bar height, in pixels. */
  height: number;
  /** Failed Attempts at the current height. */
  failures: number;
  /** Highest bar cleared, or null. */
  best: number | null;
  /** Every Attempt's Mark, in order. */
  marks: (PlayerMark | null)[];
  /** The bar height of each Attempt, in order. */
  heights: number[];
  over: boolean;
}

export function createBarSeries(params: Pick<HighJumpParams, 'startHeight'>, startHeight: number = params.startHeight): BarSeries {
  return { height: startHeight, failures: 0, best: null, marks: [], heights: [], over: false };
}

/**
 * Record an Attempt: a clearance raises the bar by the increment; failing
 * every Attempt at a height ends the Event.
 */
export function recordJump(series: BarSeries, mark: PlayerMark | null, params: Pick<HighJumpParams, 'increment' | 'attemptsPerHeight'>): BarSeries {
  const marks = [...series.marks, mark];
  const heights = [...series.heights, series.height];
  if (mark && mark.outcome === 'valid') {
    return { ...series, marks, heights, best: series.height, height: series.height + params.increment, failures: 0 };
  }
  const failures = series.failures + 1;
  return { ...series, marks, heights, failures, over: failures >= params.attemptsPerHeight };
}

/**
 * The Event's Mark: the highest bar cleared, or a failed Mark.
 */
export function barSeriesMark(series: BarSeries): PlayerMark {
  return series.best === null
    ? { player: 1, outcome: 'failed', value: null, unit: 'pixels' }
    : { player: 1, outcome: 'valid', value: series.best, unit: 'pixels' };
}
