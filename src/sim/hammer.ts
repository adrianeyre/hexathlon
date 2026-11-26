/**
 * Hammer Throw: mash to spin up, press ACTION to start the release, hold it
 * to raise the release angle and let go to throw. The spin keeps turning
 * throughout; letting go while the hammer faces outside the release window
 * sends it into the cage (a foul), and inside the window the distance falls
 * off with how far it is from straight down the field. The Mark is the
 * distance from the edge of the circle to the landing, in pixels.
 *
 * Phases: `spin`, `release` (ACTION held), `flight`, `landed`, `done`. Pure.
 */

import { launch, startAngle, stepAngle, stepFlight } from './field.ts';
import { createMeter, hasEdge, stepMeter, velocityOf } from './speed.ts';

export interface HammerOwnParams {
  speed: import('./speed.ts').SpeedParams;
  field: import('./field.ts').FieldParams & { settleFrames: number };
  /** Degrees of spin per frame per meterUnit. */
  spinPerUnit: number;
  /** Spin angle the thrower starts facing, in degrees (0 faces the field). */
  startSpin: number;
  /** Spin angles (degrees, 0 = facing the field) that throw into the field. */
  releaseWindow: { centre: number, halfWidth: number };
  /** Not letting go by then is a foul. */
  maxSpinFrames: number;
  /** Pixels above the ground. */
  releaseHeight: number;
  /** Pixels from the circle's centre to its front edge. */
  circleRadius: number;
}

export type HammerParams = HammerOwnParams & import('./field.ts').LaunchParams;

export interface HammerState {
  phase: 'spin' | 'release' | 'flight' | 'landed' | 'done';
  frame: number;
  attempt: number;
  meter: import('./speed.ts').Meter;
  /** Spin angle in degrees, 0 to 360; 0 faces the field. */
  spin: number;
  /** Degrees per frame. */
  spinSpeed: number;
  hold: import('./field.ts').AngleHold | null;
  /** Degrees from the window centre at release. */
  releaseOffset: number | null;
  /** The hammer, from the circle's centre. */
  flight: import('./field.ts').Flight | null;
  settle: number;
  outcome: 'valid' | 'foul' | null;
  foul: 'cage' | 'time' | null;
  mark: number | null;
}

/**
 * Signed difference between two angles, -180 to 180.
 */
export function angleDiff(a: number, b: number) {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

export function createHammerSim(params: HammerParams): import('./types.ts').EventSim<HammerState> {
  const { field } = params;

  return {
    id: 'hammer',

    init({ attempt = 1 }) {
      return {
        phase: 'spin',
        frame: 0,
        attempt,
        meter: createMeter(),
        spin: params.startSpin,
        spinSpeed: 0,
        hold: null,
        releaseOffset: null,
        flight: null,
        settle: 0,
        outcome: null,
        foul: null,
        mark: null,
      };
    },

    step(prev, input) {
      if (prev.phase === 'done') return prev;
      let state: HammerState = { ...prev, frame: prev.frame + 1 };
      const pressed = hasEdge(input.edges, 1, 'ACTION', 'press');
      const released = hasEdge(input.edges, 1, 'ACTION', 'release');

      if (state.phase === 'spin' || state.phase === 'release') {
        const meter = stepMeter(state.meter, input.edges, 1, params.speed);
        const spinSpeed = meter.value * params.spinPerUnit;
        state = { ...state, meter, spinSpeed, spin: (state.spin + spinSpeed) % 360 };
        if (state.phase === 'spin' && pressed) {
          state = { ...state, phase: 'release', hold: stepAngle(startAngle(field.angle), false, field.angle) };
          if (released) state = { ...state, hold: state.hold && { ...state.hold, committed: true } };
        } else if (state.phase === 'release' && state.hold) {
          state = { ...state, hold: stepAngle(state.hold, released, field.angle) };
        }
        if (state.phase === 'release' && state.hold?.committed) {
          const offset = angleDiff(state.spin, params.releaseWindow.centre);
          if (Math.abs(offset) > params.releaseWindow.halfWidth) {
            return { ...state, phase: 'landed', releaseOffset: offset, outcome: 'foul', foul: 'cage', settle: 0 };
          }
          const direction = Math.cos((offset * Math.PI) / 180);
          const speed = velocityOf(meter.value, params.speed);
          const flight = launch(speed, state.hold.angle, params, field.efficiencyFloor, direction, params.releaseHeight);
          return { ...state, phase: 'flight', releaseOffset: offset, flight };
        }
        if (state.frame >= params.maxSpinFrames) return { ...state, phase: 'landed', outcome: 'foul', foul: 'time', settle: 0 };
        return state;
      }

      if (state.phase === 'flight' && state.flight) {
        const flight = stepFlight(state.flight, params.gravity);
        if (!flight.landed) return { ...state, flight };
        const mark = Math.max(0, flight.x - params.circleRadius);
        return { ...state, flight, phase: 'landed', outcome: 'valid', mark, settle: 0 };
      }

      if (state.phase === 'landed') {
        const settle = state.settle + 1;
        return { ...state, settle, phase: settle >= field.settleFrames ? 'done' : 'landed' };
      }
      return state;
    },

    getResult(state) {
      if (state.phase !== 'done' || state.outcome === null) return null;
      return { marks: [{ player: 1, outcome: state.outcome, value: state.mark, unit: 'pixels' }] };
    },
  };
}
