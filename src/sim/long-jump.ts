/**
 * Long Jump: mash along the Run-up, press ACTION before the foul line to
 * take off, hold it to raise the take-off angle and release to jump. The Mark
 * is the distance from the foul line to the landing, in pixels.
 *
 * Fouls: pressing ACTION past the foul line, running past it without taking
 * off, or not taking off before the Run-up time runs out.
 *
 * Phases: `runup`, `takeoff` (ACTION held, angle rising), `flight`, `landed`
 * (a short pause so the landing is seen), then `done`. Pure.
 */

import { launch, startAngle, stepAngle, stepFlight } from './field.ts';
import { createMeter, hasEdge, stepMeter, velocityOf } from './speed.ts';

export type SpeedParams = import('./speed.ts').SpeedParams;
export type FieldParams = import('./field.ts').FieldParams;
export type LaunchParams = import('./field.ts').LaunchParams;

export interface RunUpParams {
  speed: SpeedParams;
  field: FieldParams & { maxRunUpFrames: number, settleFrames: number };
  /** Start of the Run-up to the foul line, in pixels. */
  foulLine: number;
}

export type LongJumpParams = RunUpParams & LaunchParams;

export interface LongJumpState {
  phase: 'runup' | 'takeoff' | 'flight' | 'landed' | 'done';
  frame: number;
  /** 1-based. */
  attempt: number;
  /** Athlete's distance from the start of the Run-up, in pixels. */
  x: number;
  /** Height above the ground, in pixels. */
  y: number;
  meter: import('./speed.ts').Meter;
  /** Where the athlete took off; NaN before. */
  takeoffX: number;
  /** Pixels per frame at take-off. */
  takeoffSpeed: number;
  hold: import('./field.ts').AngleHold | null;
  flight: import('./field.ts').Flight | null;
  /** Frames spent in the `landed` phase. */
  settle: number;
  outcome: 'valid' | 'foul' | null;
  foul: 'overstep' | 'late' | 'time' | null;
  /** Pixels from the foul line to the landing. */
  mark: number | null;
}

export function createLongJumpSim(params: LongJumpParams): import('./types.ts').EventSim<LongJumpState> {
  const { field } = params;

  const fouled = (state: LongJumpState, foul: 'overstep' | 'late' | 'time'): LongJumpState => ({ ...state, phase: 'landed', outcome: 'foul', foul, mark: null, settle: 0 });

  return {
    id: 'longJump',

    init({ attempt = 1 }) {
      return {
        phase: 'runup',
        frame: 0,
        attempt,
        x: 0,
        y: 0,
        meter: createMeter(),
        takeoffX: Number.NaN,
        takeoffSpeed: 0,
        hold: null,
        flight: null,
        settle: 0,
        outcome: null,
        foul: null,
        mark: null,
      };
    },

    step(prev, input) {
      if (prev.phase === 'done') return prev;
      let state: LongJumpState = { ...prev, frame: prev.frame + 1 };
      const pressed = hasEdge(input.edges, 1, 'ACTION', 'press');
      const released = hasEdge(input.edges, 1, 'ACTION', 'release');

      if (state.phase === 'runup') {
        if (pressed) {
          if (state.x > params.foulLine) return fouled(state, 'late');
          const hold = stepAngle(startAngle(field.angle), false, field.angle);
          state = { ...state, phase: 'takeoff', takeoffX: state.x, takeoffSpeed: velocityOf(state.meter.value, params.speed), hold };
          // A tap (press and release in one frame) commits straight away.
          if (!released) return state;
          state = { ...state, hold: { ...hold, committed: true } };
        } else {
          const meter = stepMeter(state.meter, input.edges, 1, params.speed);
          const x = state.x + velocityOf(meter.value, params.speed);
          state = { ...state, meter, x };
          if (x > params.foulLine) return fouled(state, 'overstep');
          if (state.frame >= field.maxRunUpFrames) return fouled(state, 'time');
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
        if (!flight.landed) return { ...state, flight, x, y: flight.y };
        const mark = Math.max(0, x - params.foulLine);
        return { ...state, flight, x, y: 0, phase: 'landed', outcome: 'valid', mark, settle: 0 };
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
