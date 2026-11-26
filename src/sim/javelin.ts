/**
 * Javelin Throw: mash along the Run-up, press ACTION to start the throw,
 * hold it to raise the release angle and let go to release, all before the
 * foul line. After release the athlete slows to a stop; crossing the foul
 * line before the javelin lands is a foul. The Mark is the distance from the
 * foul line to where the javelin lands, in pixels.
 *
 * Phases: `runup`, `throwing` (ACTION held), `flight`, `landed`, `done`. Pure.
 */

import { launch, startAngle, stepAngle, stepFlight } from './field.ts';
import { createMeter, hasEdge, stepMeter, velocityOf } from './speed.ts';

export type JavelinParams = import('./long-jump.ts').RunUpParams & import('./field.ts').LaunchParams & {
  releaseHeight: number, followThroughDecay: number };

export interface JavelinState {
  phase: 'runup' | 'throwing' | 'flight' | 'landed' | 'done';
  frame: number;
  attempt: number;
  /** Athlete's distance from the start of the Run-up, in pixels. */
  x: number;
  /** Athlete's pixels per frame. */
  speed: number;
  meter: import('./speed.ts').Meter;
  hold: import('./field.ts').AngleHold | null;
  /** Where the javelin left the hand; NaN before. */
  releaseX: number;
  /** The javelin, from the release point. */
  flight: import('./field.ts').Flight | null;
  settle: number;
  outcome: 'valid' | 'foul' | null;
  foul: 'overstep' | 'time' | null;
  /** Pixels from the foul line to the landing. */
  mark: number | null;
}

export function createJavelinSim(params: JavelinParams): import('./types.ts').EventSim<JavelinState> {
  const { field } = params;

  const fouled = (state: JavelinState, foul: 'overstep' | 'time'): JavelinState => ({ ...state, phase: 'landed', outcome: 'foul', foul, mark: null, settle: 0 });

  const run = (state: JavelinState, speed: number) => ({ ...state, speed, x: state.x + speed });

  return {
    id: 'javelin',

    init({ attempt = 1 }) {
      return {
        phase: 'runup',
        frame: 0,
        attempt,
        x: 0,
        speed: 0,
        meter: createMeter(),
        hold: null,
        releaseX: Number.NaN,
        flight: null,
        settle: 0,
        outcome: null,
        foul: null,
        mark: null,
      };
    },

    step(prev, input) {
      if (prev.phase === 'done') return prev;
      let state: JavelinState = { ...prev, frame: prev.frame + 1 };
      const pressed = hasEdge(input.edges, 1, 'ACTION', 'press');
      const released = hasEdge(input.edges, 1, 'ACTION', 'release');

      if (state.phase === 'runup' || state.phase === 'throwing') {
        // The athlete keeps running (and mashing still counts) until the javelin is released.
        const meter = stepMeter(state.meter, input.edges, 1, params.speed);
        state = run({ ...state, meter }, velocityOf(meter.value, params.speed));
        if (state.phase === 'runup' && pressed) {
          state = { ...state, phase: 'throwing', hold: stepAngle(startAngle(field.angle), false, field.angle) };
          if (released) state = { ...state, hold: state.hold && { ...state.hold, committed: true } };
        } else if (state.phase === 'throwing' && state.hold) {
          state = { ...state, hold: stepAngle(state.hold, released, field.angle) };
        }
        if (state.x > params.foulLine) return fouled(state, 'overstep');
        if (state.phase === 'runup' && state.frame >= field.maxRunUpFrames) return fouled(state, 'time');
        if (state.phase === 'throwing' && state.hold?.committed) {
          const flight = launch(state.speed, state.hold.angle, params, field.efficiencyFloor, 1, params.releaseHeight);
          return { ...state, phase: 'flight', releaseX: state.x, flight };
        }
        return state;
      }

      if (state.phase === 'flight' && state.flight) {
        const javelin = state.flight;
        // Follow-through: the athlete slows to a stop and must stay behind the line.
        state = run(state, state.speed * params.followThroughDecay);
        if (state.x > params.foulLine) return fouled(state, 'overstep');
        const flight = stepFlight(javelin, params.gravity);
        if (!flight.landed) return { ...state, flight };
        const mark = Math.max(0, state.releaseX + flight.x - params.foulLine);
        return { ...state, flight, phase: 'landed', outcome: 'valid', mark, settle: 0 };
      }

      if (state.phase === 'landed') {
        state = run(state, state.speed * params.followThroughDecay);
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
