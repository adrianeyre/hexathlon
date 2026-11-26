/**
 * Rules shared by the field Events (Long Jump, Javelin, Hammer, and the
 * High Jump later): the angle that rises while ACTION is held and commits on
 * release, the launch with its angle window and penalty curve, the flight,
 * and the Attempt series with its limit. Every number comes from
 * `data/events.json` (`field` and each Event's block).
 *
 * Pure: everything is plain data in, plain data out.
 */

export interface AngleParams {
  /** Angle when ACTION is pressed, in degrees. */
  start: number;
  /** Degrees per frame while ACTION is held. */
  riseRate: number;
  /** The angle stops rising here. */
  max: number;
  /** Holding this long commits the angle anyway. */
  maxHoldFrames: number;
}

export interface FieldParams {
  /** Attempts per Event. */
  attempts: number;
  angle: AngleParams;
  /** Launch efficiency never drops below this, however bad the angle. */
  efficiencyFloor: number;
}

export interface LaunchParams {
  /** Full-efficiency angles, in degrees. */
  angleWindow: { min: number, max: number };
  /** Efficiency lost per degree outside the window. */
  penaltyPerDegree: number;
  /** Launch speed per pixel-per-frame of run speed. */
  launchFactor: number;
  /** Pixels per frame, per frame. */
  gravity: number;
}

export interface AngleHold {
  /** Degrees. */
  angle: number;
  /** Frames ACTION has been held. */
  held: number;
  committed: boolean;
}

export interface Flight {
  /** Pixels along the ground from the launch point. */
  x: number;
  /** Pixels above the ground. */
  y: number;
  vx: number;
  /** Up is positive. */
  vy: number;
  landed: boolean;
}

/**
 * ACTION has just been pressed.
 */
export function startAngle(params: AngleParams): AngleHold {
  return { angle: params.start, held: 0, committed: false };
}

/**
 * One frame of the angle hold: it rises while ACTION is held and commits on
 * release (or when held for `maxHoldFrames`).
 * @param released  ACTION was released this frame.
 */
export function stepAngle(hold: AngleHold, released: boolean, params: AngleParams): AngleHold {
  if (hold.committed) return hold;
  if (released) return { ...hold, committed: true };
  const held = hold.held + 1;
  const angle = Math.min(params.max, hold.angle + params.riseRate);
  return { angle, held, committed: held >= params.maxHoldFrames };
}

/**
 * Launch efficiency for an angle: 1 inside the window, falling by
 * `penaltyPerDegree` for every degree outside it, down to the floor.
 */
export function angleEfficiency(angle: number, params: LaunchParams, floor: number) {
  const { min, max } = params.angleWindow;
  const outside = angle < min ? min - angle : angle > max ? angle - max : 0;
  return Math.max(floor, 1 - outside * params.penaltyPerDegree);
}

/**
 * Start a flight.
 * @param speed  Run speed (or spin speed) in pixels per frame.
 * @param angle  Degrees.
 * @param floor  Efficiency floor.
 * @param [extra]  A further efficiency factor (the Hammer's direction).
 * @param [height]  Release height above the ground, in pixels.
 */
export function launch(speed: number, angle: number, params: LaunchParams, floor: number, extra: number = 1, height: number = 0): Flight {
  const v = speed * params.launchFactor * angleEfficiency(angle, params, floor) * extra;
  const rad = (angle * Math.PI) / 180;
  return { x: 0, y: height, vx: v * Math.cos(rad), vy: v * Math.sin(rad), landed: false };
}

/**
 * One frame of flight. On landing, x is placed exactly where the path meets
 * the ground, so the Mark doesn't depend on which frame it touched down.
 */
export function stepFlight(flight: Flight, gravity: number): Flight {
  if (flight.landed) return flight;
  const vy = flight.vy - gravity;
  const x = flight.x + flight.vx;
  const y = flight.y + vy;
  if (y > 0) return { x, y, vx: flight.vx, vy, landed: false };
  // Interpolate back to y = 0 within this frame.
  const t = vy === 0 ? 1 : flight.y / (flight.y - y);
  return { x: flight.x + flight.vx * Math.max(0, Math.min(1, t)), y: 0, vx: flight.vx, vy, landed: true };
}

/**
 * Where a flight will land, without stepping it frame by frame.
 */
export function landingDistance(flight: Flight, gravity: number) {
  let f = flight;
  for (let i = 0; i < 100000 && !f.landed; i++) f = stepFlight(f, gravity);
  return f.x;
}

export type PlayerMark = import('./types.ts').PlayerMark;

/** The Attempts a player has taken in one field Event. */
export interface AttemptSeries {
  limit: number;
  /** Each Attempt's Mark, in order. */
  marks: (PlayerMark | null)[];
}

export function createSeries(limit: number): AttemptSeries {
  return { limit, marks: [] };
}

export function recordAttempt(series: AttemptSeries, mark: PlayerMark | null): AttemptSeries {
  return { ...series, marks: [...series.marks, mark] };
}

export function seriesOver(series: AttemptSeries) {
  return series.marks.length >= series.limit;
}

/** 1-based number of the next Attempt. @param series */
export function nextAttempt(series: AttemptSeries) {
  return series.marks.length + 1;
}

/**
 * The best valid Mark (field Marks: higher is better), or the last Mark if
 * none was valid (so a series of fouls reports a foul).
 */
export function bestMark(series: AttemptSeries): PlayerMark | null {
  let best: PlayerMark | null = null;
  for (const m of series.marks) {
    if (m && m.outcome === 'valid' && m.value !== null && (!best || best.value === null || m.value > best.value)) best = m;
  }
  return best ?? series.marks[series.marks.length - 1] ?? null;
}
