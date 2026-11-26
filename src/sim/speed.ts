/**
 * The speed meter every Event shares: alternating RUN_A and RUN_B presses add
 * speed, the meter decays every frame and is capped at a per-Event maximum.
 * Every number comes from `data/events.json` (`speed`, overridden per Event).
 *
 * Pure: a meter is plain data, and each function returns a new one.
 */

export type InputEdge = import('./types.ts').InputEdge;
export type PlayerId = import('./types.ts').PlayerId;

export interface SpeedParams {
  /** meterUnits added by a press of the other run key. */
  gainPerAlternation: number;
  /** meterUnits added by pressing the same run key again. */
  sameKeyGain: number;
  /** meterUnits lost every frame. */
  decayPerFrame: number;
  /** Fraction of the meter lost every frame, on top of `decayPerFrame`. */
  decayRatio: number;
  /** Ceiling in meterUnits. */
  max: number;
  /** Pixels per frame per meterUnit. */
  velocityPerUnit: number;
}

export interface Meter {
  /** meterUnits. */
  value: number;
  /** The run key pressed last. */
  lastKey: 'RUN_A' | 'RUN_B' | null;
  /** Run presses counted, for animation and sound. */
  presses: number;
}

/**
 * Merge an Event's speed overrides onto the shared defaults.
 */
export function speedParams(defaults: SpeedParams, overrides: Partial<SpeedParams> = {}): SpeedParams {
  return Object.freeze({ ...defaults, ...overrides });
}

export function createMeter(): Meter {
  return { value: 0, lastKey: null, presses: 0 };
}

/**
 * One run-key press. A press of the other key adds `gainPerAlternation`; a
 * repeat of the same key adds `sameKeyGain`. The very first press counts as
 * an alternation.
 */
export function pressRun(meter: Meter, key: 'RUN_A' | 'RUN_B', params: SpeedParams): Meter {
  const gain = key === meter.lastKey ? params.sameKeyGain : params.gainPerAlternation;
  return { value: Math.min(params.max, meter.value + gain), lastKey: key, presses: meter.presses + 1 };
}

/**
 * One frame of decay.
 */
export function decayMeter(meter: Meter, params: SpeedParams): Meter {
  const value = Math.max(0, meter.value * (1 - params.decayRatio) - params.decayPerFrame);
  return { ...meter, value };
}

/**
 * The run presses a player made this frame, in order.
 */
export function runPresses(edges: readonly InputEdge[], player: PlayerId): ('RUN_A' | 'RUN_B')[] {
  const keys: ('RUN_A' | 'RUN_B')[] = [];
  for (const e of edges) {
    if (e.player === player && e.type === 'press' && (e.action === 'RUN_A' || e.action === 'RUN_B')) keys.push(e.action);
  }
  return keys;
}

/**
 * One frame of the meter: every run press this frame, then decay. Presses
 * are applied before decay, so none is lost however fast the mashing.
 */
export function stepMeter(meter: Meter, edges: readonly InputEdge[], player: PlayerId, params: SpeedParams): Meter {
  let next = meter;
  for (const key of runPresses(edges, player)) next = pressRun(next, key, params);
  return decayMeter(next, params);
}

/**
 * Velocity in pixels per frame for a meter value.
 */
export function velocityOf(value: number, params: SpeedParams) {
  return value * params.velocityPerUnit;
}

/**
 * Whether a player pressed or released an action this frame.
 */
export function hasEdge(edges: readonly InputEdge[], player: PlayerId, action: 'RUN_A' | 'RUN_B' | 'ACTION', type: 'press' | 'release') {
  return edges.some((e) => e.player === player && e.action === action && e.type === type);
}
