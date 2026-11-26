/**
 * Event simulations by id, built from the parameters in `data/events.json`,
 * plus the Standards (`data/standards.json`), Points (`data/points.json`) and
 * difficulty levels (`data/difficulty.json`). An Event that isn't listed has
 * no simulation yet; the replay harness skips its traces instead of failing.
 *
 * This is the only sim module that reads the data files: each simulation is a
 * factory taking its parameters, so tests can run them with any numbers.
 */

import DIFFICULTY from '../../data/difficulty.json' with { type: 'json' };
import EVENTS from '../../data/events.json' with { type: 'json' };
import POINTS from '../../data/points.json' with { type: 'json' };
import STANDARDS from '../../data/standards.json' with { type: 'json' };
import { applyDifficulty, isDifficulty } from './difficulty.ts';
import { createHammerSim } from './hammer.ts';
import { createHighJumpSim } from './high-jump.ts';
import { createHurdlesSim } from './hurdles.ts';
import { createJavelinSim } from './javelin.ts';
import { createLongJumpSim } from './long-jump.ts';
import { pointsFor } from './points.ts';
import { speedParams } from './speed.ts';
import { createSprintSim } from './sprint.ts';
import { meetsStandard, standardFor } from './standards.ts';

export type EventId = import('./types.ts').EventId;
export type Difficulty = import('./difficulty.ts').Difficulty;
export type AnySim = import('./types.ts').EventSim<any>;

/** The parameters as loaded; see `data/events.json` for what each one means. */
export const EVENT_DATA = (EVENTS as typeof EVENTS);

/** Standards per Event per Cycle, as loaded. */
export const STANDARDS_DATA = ((STANDARDS) as import('./standards.ts').StandardsData);

/** Points conversion per Event, as loaded. */
export const POINTS_DATA = ((POINTS) as { events: Record<EventId, import('./points.ts').PointsRule> });

/** Difficulty levels, as loaded. */
export const DIFFICULTY_DATA = ((DIFFICULTY) as { default: Difficulty, levels: Record<Difficulty, import('./difficulty.ts').DifficultyLevel> });

const field = { ...EVENT_DATA.field };

const speed = (overrides: Partial<import('./speed.ts').SpeedParams>) => speedParams(EVENT_DATA.speed, overrides);

/** Parameters each simulation is built with (Normal difficulty). */
export const SIM_PARAMS = Object.freeze({
  sprint: { ...EVENT_DATA.sprint, speed: speed(EVENT_DATA.sprint.speed) },
  longJump: { ...EVENT_DATA.longJump, speed: speed(EVENT_DATA.longJump.speed), field },
  javelin: { ...EVENT_DATA.javelin, speed: speed(EVENT_DATA.javelin.speed), field },
  hurdles: { ...EVENT_DATA.hurdles, speed: speed(EVENT_DATA.hurdles.speed) },
  hammer: { ...EVENT_DATA.hammer, speed: speed(EVENT_DATA.hammer.speed), field },
  highJump: { ...EVENT_DATA.highJump, speed: speed(EVENT_DATA.highJump.speed), field },
});

/** Attempts per Event in Arcade: the field Events from data, one for the running Events and the High Jump (whose bar progression decides its Attempts). */
export const EVENT_ATTEMPTS = Object.freeze(
  ({
    sprint: 1,
    longJump: field.attempts,
    javelin: field.attempts,
    hurdles: 1,
    hammer: field.attempts,
    highJump: 1,
  } as Record<EventId, number>),
);

/**
 * Every simulation, built from a set of parameters.
 */
const buildSims = (params: typeof SIM_PARAMS): Record<EventId, AnySim> => ({
  sprint: createSprintSim(params.sprint),
  longJump: createLongJumpSim(params.longJump),
  javelin: createJavelinSim(params.javelin),
  hurdles: createHurdlesSim(params.hurdles),
  hammer: createHammerSim(params.hammer),
  highJump: createHighJumpSim(params.highJump),
});

export const EVENT_SIMS: Partial<Record<EventId, AnySim>> = buildSims(SIM_PARAMS);

/** The difficulty level's settings, falling back to Normal. @param difficulty */
export function difficultyLevel(difficulty: unknown) {
  return DIFFICULTY_DATA.levels[isDifficulty(difficulty) ? difficulty : 'normal'];
}

const simsByDifficulty: Map<Difficulty, Record<EventId, AnySim>> = new Map([['normal', (EVENT_SIMS as Record<EventId, AnySim>)]]);

/**
 * Parameters at a difficulty level.
 */
export function simParamsFor(difficulty: unknown): typeof SIM_PARAMS {
  if (!isDifficulty(difficulty) || difficulty === 'normal') return SIM_PARAMS;
  let params = paramsByDifficulty.get(difficulty);
  if (!params) {
    const level = difficultyLevel(difficulty);
    params = (Object.freeze(Object.fromEntries(Object.entries(SIM_PARAMS).map(([id, p]) => [id, applyDifficulty(p, level)]))) as typeof SIM_PARAMS);
    paramsByDifficulty.set(difficulty, params);
  }
  return params;
}

const paramsByDifficulty: Map<Difficulty, typeof SIM_PARAMS> = new Map();

/**
 * The simulation of an Event at a difficulty level (built once, then reused).
 */
export function simFor(id: EventId, difficulty: unknown): AnySim {
  const key = isDifficulty(difficulty) ? difficulty : 'normal';
  let sims = simsByDifficulty.get(key);
  if (!sims) {
    sims = buildSims(simParamsFor(key));
    simsByDifficulty.set(key, sims);
  }
  return sims[id];
}

/**
 * The Standard for an Event in a Cycle, at a difficulty level.
 */
export function eventStandard(id: EventId, cycle: number, difficulty: unknown = 'normal') {
  return standardFor(STANDARDS_DATA.events[id], cycle, difficultyLevel(difficulty).standardScale);
}

/**
 * Points for a Mark in an Event.
 */
export function eventPoints(id: EventId, mark: import('./types.ts').PlayerMark | null | undefined) {
  return pointsFor(mark, POINTS_DATA.events[id]);
}

export { meetsStandard };
