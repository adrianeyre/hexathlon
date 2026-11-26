/**
 * The 100m Dash: a start sequence with false starts, a mash-only race against
 * the Rival, and a finish time in frames from the start signal. All numbers
 * come from `data/events.json` (`sprint`, plus the shared `speed`).
 *
 * Phases: `set` (waiting for the start signal; a run press here is a false
 * start), `race`, then `done`. Pure: state is plain data.
 */

import { createRival, stepRival } from './rival.ts';
import { createMeter, runPresses, stepMeter, velocityOf } from './speed.ts';

export type SpeedParams = import('./speed.ts').SpeedParams;
export type Meter = import('./speed.ts').Meter;
export type RivalParams = import('./rival.ts').RivalParams;
export type RivalState = import('./rival.ts').RivalState;

export interface SprintParams {
  speed: SpeedParams;
  /** Start line to finish line, in pixels. */
  distance: number;
  /** Frames from the start of the set phase to the start signal. */
  startSignalFrame: number;
  /** False starts forgiven; the next one disqualifies. */
  falseStartsAllowed: number;
  rival: RivalParams;
}

export interface SprintState {
  phase: 'set' | 'race' | 'done';
  /** Frames stepped this Attempt. */
  frame: number;
  /** Frames into the current set phase. */
  setFrame: number;
  /** Frames since the start signal. */
  raceFrame: number;
  falseStarts: number;
  cycle: number;
  /** Athlete's distance from the start line, in pixels. */
  x: number;
  meter: Meter;
  /** Race frames to the finish line. */
  finishFrame: number | null;
  rival: RivalState;
  outcome: 'valid' | 'falseStart' | null;
}

export function createSprintSim(params: SprintParams): import('./types.ts').EventSim<SprintState> {
  return {
    id: 'sprint',

    init({ cycle }) {
      return {
        phase: 'set',
        frame: 0,
        setFrame: 0,
        raceFrame: 0,
        falseStarts: 0,
        cycle,
        x: 0,
        meter: createMeter(),
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
          // Back to the blocks: the start sequence begins again.
          return { ...state, frame, falseStarts, setFrame: 0 };
        }
        const setFrame = state.setFrame + 1;
        return { ...state, frame, setFrame, phase: setFrame >= params.startSignalFrame ? 'race' : 'set' };
      }
      const raceFrame = state.raceFrame + 1;
      const meter = stepMeter(state.meter, input.edges, 1, params.speed);
      const rival = stepRival(state.rival, params.rival, state.cycle, raceFrame, params.distance);
      const x = state.x + velocityOf(meter.value, params.speed);
      const finishFrame = state.finishFrame ?? (x >= params.distance ? raceFrame : null);
      // The race ends when the athlete finishes; the Rival's time is projected if it hasn't.
      const done = finishFrame !== null;
      return { ...state, frame, raceFrame, meter, rival, x, finishFrame, phase: done ? 'done' : 'race', outcome: done ? 'valid' : null };
    },

    getResult(state) {
      if (state.phase !== 'done') return null;
      const rivalTime = rivalFinish(state.rival, state.raceFrame, params, state.cycle);
      if (state.outcome === 'falseStart') {
        return { marks: [{ player: 1, outcome: 'falseStart', value: null, unit: 'frames' }], rival: { value: rivalTime, unit: 'frames' } };
      }
      return { marks: [{ player: 1, outcome: 'valid', value: state.finishFrame, unit: 'frames' }], rival: { value: rivalTime, unit: 'frames' } };
    },
  };
}

/**
 * The Rival's finish time in race frames: its actual time if it has
 * finished, otherwise the rest of the race run on from where it is.
 * @param params  A running Event's parameters.
 */
export function rivalFinish(rival: RivalState, raceFrame: number, params: { rival: RivalParams; distance: number; }, cycle: number = 1) {
  let r = rival;
  let f = raceFrame;
  while (r.finishFrame === null && f < raceFrame + 60 * 120) {
    f += 1;
    r = stepRival(r, params.rival, cycle, f, params.distance);
  }
  return r.finishFrame;
}
