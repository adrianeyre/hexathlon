/**
 * The Rival in the next lane of a running Event. Its pace comes from
 * `data/events.json` per Cycle; Cycles beyond the listed ones speed up by a
 * fixed step up to a cap. Its small pace variation is seeded, so the same
 * Input Trace always gives the same race.
 *
 * Pure: state is plain data.
 */

export interface RivalCycle {
  /** Pixels per frame. */
  topSpeed: number;
  /** Pixels per frame, per frame. */
  acceleration: number;
  /** Frames after the start signal before it moves. */
  reactionFrames: number;
}

export interface RivalParams {
  /** Cycle 1 first. */
  cycles: RivalCycle[];
  /** Added to the top speed per Cycle past the last listed one. */
  beyondTopSpeedStep: number;
  topSpeedCap: number;
  /** Largest per-frame pace variation, in pixels per frame. */
  jitter: number;
  seed: number;
}

export interface RivalState {
  /** Pixels from the start line. */
  x: number;
  /** Pixels per frame. */
  speed: number;
  /** Seeded generator state. */
  rng: number;
  /** Frames from the start signal to the finish line. */
  finishFrame: number | null;
}

/**
 * The Rival's pace for a Cycle.
 * @param cycle  1-based.
 */
export function rivalCycle(params: RivalParams, cycle: number): RivalCycle {
  const listed = params.cycles;
  const n = Math.max(1, Math.floor(cycle));
  if (n <= listed.length) return listed[n - 1];
  const last = listed[listed.length - 1];
  const topSpeed = Math.min(params.topSpeedCap, last.topSpeed + params.beyondTopSpeedStep * (n - listed.length));
  return { ...last, topSpeed };
}

/**
 * Mulberry32: a small deterministic generator. Returns [value 0-1, next state].
 */
export function nextRandom(state: number): [number, number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

export function createRival(params: RivalParams, cycle: number): RivalState {
  return { x: 0, speed: 0, rng: (params.seed + cycle * 7919) | 0, finishFrame: null };
}

/**
 * One frame of the Rival after the start signal.
 * @param raceFrame  Frames since the start signal, counting this one from 1.
 * @param distance  Race length in pixels.
 */
export function stepRival(rival: RivalState, params: RivalParams, cycle: number, raceFrame: number, distance: number): RivalState {
  if (rival.finishFrame !== null) return rival;
  const pace = rivalCycle(params, cycle);
  if (raceFrame <= pace.reactionFrames) return rival;
  const [r, rng] = nextRandom(rival.rng);
  const speed = Math.min(pace.topSpeed, rival.speed + pace.acceleration);
  const x = rival.x + Math.max(0, speed + (r * 2 - 1) * params.jitter);
  return { x, speed, rng, finishFrame: x >= distance ? raceFrame : null };
}

/**
 * The Rival `frames` frames on from `raceFrame`: once the athlete has won,
 * a Rival still running carries on to the line, exactly as the sim projects
 * its finish time.
 * @param raceFrame  The race frame the athlete's race stopped on.
 * @param frames  Frames since then.
 */
export function rivalAfter(rival: RivalState, params: RivalParams, cycle: number, raceFrame: number, frames: number, distance: number): RivalState {
  let r = rival;
  for (let i = 1; i <= frames && r.finishFrame === null; i++) r = stepRival(r, params, cycle, raceFrame + i, distance);
  return r;
}
