/**
 * A placeholder Event used to exercise the loop, input and scenes before the
 * real Events exist. Its numbers are made up and are not calibrated: it is not
 * the 100m Dash (see the speed meter and sprint issues for that).
 *
 * Alternate RUN_A and RUN_B to run to the finish line.
 */

export type PlaceholderSim = import('./types.ts').EventSim<PlaceholderState>;

export interface PlaceholderState {
  /** Frames since the start. */
  frame: number;
  /** Distance covered, in pixels. */
  x: number;
  /** Pixels per frame. */
  speed: number;
  /** Last run key pressed, for alternation. */
  lastRun: 'RUN_A' | 'RUN_B' | null;
  finishFrame: number | null;
}

export const PLACEHOLDER_DISTANCE = 200;
const GAIN = 0.12;
const DECAY = 0.985;
const MAX_SPEED = 3;

export const placeholderSim: PlaceholderSim = {
  id: 'placeholder',

  init() {
    return { frame: 0, x: 0, speed: 0, lastRun: null, finishFrame: null };
  },

  step(state, input) {
    if (state.finishFrame !== null) return state;
    let { speed, lastRun } = state;
    for (const edge of input.edges) {
      if (edge.player !== 1 || edge.type !== 'press') continue;
      if (edge.action !== 'RUN_A' && edge.action !== 'RUN_B') continue;
      if (edge.action !== lastRun) speed = Math.min(MAX_SPEED, speed + GAIN);
      lastRun = edge.action;
    }
    speed *= DECAY;
    const frame = state.frame + 1;
    const x = state.x + speed;
    const finishFrame = x >= PLACEHOLDER_DISTANCE ? frame : null;
    return { frame, x, speed, lastRun, finishFrame };
  },

  getResult(state) {
    if (state.finishFrame === null) return null;
    return { marks: [{ player: 1, outcome: 'valid', value: state.finishFrame, unit: 'frames' }] };
  },
};
