/**
 * The 110m Hurdles: the 100m's start sequence and speed meter, plus ACTION to
 * jump each hurdle. A hurdle is cleared when the athlete passes it inside the
 * clear window of a jump (frames since take-off); otherwise it is hit, the
 * hurdle goes down, the athlete loses a share of their speed and stumbles for
 * a few frames, during which mashing adds nothing. The Rival runs in the next
 * lane. The Mark is the time in frames from the start signal.
 *
 * Every number comes from `data/events.json` (`hurdles`, plus the shared
 * `speed`). Phases: `set`, `race`, `done`. Pure: state is plain data.
 */

import { createRival, stepRival } from './rival.ts';
import { createMeter, hasEdge, runPresses, stepMeter, velocityOf } from './speed.ts';
import { rivalFinish } from './sprint.ts';

export type SpeedParams = import('./speed.ts').SpeedParams;
export type RivalParams = import('./rival.ts').RivalParams;

export interface HurdlesParams {
  speed: SpeedParams;
  /** Start line to finish line, in pixels. */
  distance: number;
  /** Start line to the first hurdle, in pixels. */
  firstHurdle: number;
  /** Pixels between hurdles. */
  hurdleSpacing: number;
  hurdleCount: number;
  startSignalFrame: number;
  falseStartsAllowed: number;
  /** Frames a jump lasts. */
  jumpFrames: number;
  /** Peak height of a jump in pixels (for drawing). */
  jumpHeight: number;
  /** Frames since take-off in which passing a hurdle clears it. */
  clearWindow: { from: number, to: number };
  /** Share of the meter lost on hitting a hurdle, 0 to 1. */
  collisionSpeedLoss: number;
  /** Frames after a hit in which run presses add no speed. */
  stumbleFrames: number;
  rival: RivalParams;
}

export interface HurdlesState {
  phase: 'set' | 'race' | 'done';
  frame: number;
  setFrame: number;
  raceFrame: number;
  falseStarts: number;
  cycle: number;
  /** Pixels from the start line. */
  x: number;
  /** Height of the jump, in pixels. */
  y: number;
  meter: import('./speed.ts').Meter;
  /** Frames since take-off, or null on the ground. */
  jumpFrame: number | null;
  /** Frames of stumble left. */
  stumble: number;
  /** Index of the next hurdle to pass. */
  nextHurdle: number;
  /** Per hurdle passed: true if it was hit. */
  hit: boolean[];
  finishFrame: number | null;
  rival: import('./rival.ts').RivalState;
  outcome: 'valid' | 'falseStart' | null;
}

/**
 * World x of each hurdle, from the start line.
 */
export function hurdlePositions(params: Pick<HurdlesParams, 'firstHurdle' | 'hurdleSpacing' | 'hurdleCount'>): number[] {
  return Array.from({ length: params.hurdleCount }, (_, i) => params.firstHurdle + i * params.hurdleSpacing);
}

/**
 * Height of a jump `t` frames after take-off: a parabola peaking halfway.
 */
export function jumpHeightAt(t: number, params: Pick<HurdlesParams, 'jumpFrames' | 'jumpHeight'>) {
  const u = t / params.jumpFrames;
  return Math.max(0, 4 * params.jumpHeight * u * (1 - u));
}

export function createHurdlesSim(params: HurdlesParams): import('./types.ts').EventSim<HurdlesState> {
  const hurdles = hurdlePositions(params);
  return {
    id: 'hurdles',

    init({ cycle }) {
      return {
        phase: 'set',
        frame: 0,
        setFrame: 0,
        raceFrame: 0,
        falseStarts: 0,
        cycle,
        x: 0,
        y: 0,
        meter: createMeter(),
        jumpFrame: null,
        stumble: 0,
        nextHurdle: 0,
        hit: [],
        finishFrame: null,
        rival: createRival(params.rival, cycle),
        outcome: null,
      };
    },

    step(state, input) {
      if (state.phase === 'done') return state;
      const frame = state.frame + 1;
      if (state.phase === 'set') {
        if (runPresses(input.edges, 1).length > 0) {
          const falseStarts = state.falseStarts + 1;
          if (falseStarts > params.falseStartsAllowed) return { ...state, frame, falseStarts, phase: 'done', outcome: 'falseStart' };
          return { ...state, frame, falseStarts, setFrame: 0 };
        }
        const setFrame = state.setFrame + 1;
        return { ...state, frame, setFrame, phase: setFrame >= params.startSignalFrame ? 'race' : 'set' };
      }

      const raceFrame = state.raceFrame + 1;
      // A stumbling athlete's presses add nothing; the meter still decays.
      const edges = state.stumble > 0 ? input.edges.filter((e) => e.action === 'ACTION') : input.edges;
      let meter = stepMeter(state.meter, edges, 1, params.speed);
      let stumble = Math.max(0, state.stumble - 1);
      let jumpFrame = state.jumpFrame === null ? null : state.jumpFrame + 1;
      if (jumpFrame !== null && jumpFrame >= params.jumpFrames) jumpFrame = null;
      if (jumpFrame === null && hasEdge(input.edges, 1, 'ACTION', 'press')) jumpFrame = 0;

      const x = state.x + velocityOf(meter.value, params.speed);
      let { nextHurdle } = state;
      let hit = state.hit;
      while (nextHurdle < hurdles.length && x >= hurdles[nextHurdle]) {
        const cleared = jumpFrame !== null && jumpFrame >= params.clearWindow.from && jumpFrame <= params.clearWindow.to;
        if (!cleared) {
          meter = { ...meter, value: meter.value * (1 - params.collisionSpeedLoss) };
          stumble = params.stumbleFrames;
          jumpFrame = null;
        }
        hit = [...hit, !cleared];
        nextHurdle += 1;
      }
      const y = jumpFrame === null ? 0 : jumpHeightAt(jumpFrame, params);
      const rival = stepRival(state.rival, params.rival, state.cycle, raceFrame, params.distance);
      const finishFrame = state.finishFrame ?? (x >= params.distance ? raceFrame : null);
      const done = finishFrame !== null;
      return {
        ...state,
        frame,
        raceFrame,
        meter,
        stumble,
        jumpFrame,
        x,
        y,
        nextHurdle,
        hit,
        rival,
        finishFrame,
        phase: done ? 'done' : 'race',
        outcome: done ? 'valid' : null,
      };
    },

    getResult(state) {
      if (state.phase !== 'done') return null;
      const rivalTime = rivalFinish(state.rival, state.raceFrame, params, state.cycle);
      const rival = { value: rivalTime, unit: ('frames' as const) };
      if (state.outcome === 'falseStart') return { marks: [{ player: 1, outcome: 'falseStart', value: null, unit: 'frames' }], rival };
      return { marks: [{ player: 1, outcome: 'valid', value: state.finishFrame, unit: 'frames' }], rival };
    },
  };
}
