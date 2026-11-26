/**
 * Difficulty levels: Easy, Normal and Hard. Normal leaves every parameter as
 * it is in the data files, so parity is measured on Normal. Easy and Hard
 * scale a few values, as set in `data/difficulty.json`. Pure.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyLevel {
  /** On-screen name. */
  label: string;
  /** Multiplies the speed gained per run press. */
  speedGain: number;
  /** Multiplies the Rival's top speed (and its cap). */
  rivalPace: number;
  /** Above 1 makes Standards tougher, below 1 easier. */
  standardScale: number;
  /** Degrees added to each side of an angle window. */
  angleWindowWiden: number;
  /** Frames added to each side of the hurdle clear window. */
  clearWindowWiden: number;
}

/** The levels in menu order. */
export const DIFFICULTIES: readonly Difficulty[] = Object.freeze(['easy', 'normal', 'hard']);

export const isDifficulty = (value: unknown): value is Difficulty => typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);

/**
 * An Event's parameters at a difficulty level. Only the fields an Event has
 * are touched, and Normal (all factors 1, all widenings 0) returns an equal copy.
 */
export function applyDifficulty<P extends Record<string, any>>(params: P, level: DifficultyLevel): P {
  const next: Record<string, any> = { ...params };
  if (params.speed) {
    next.speed = Object.freeze({ ...params.speed, gainPerAlternation: params.speed.gainPerAlternation * level.speedGain, sameKeyGain: params.speed.sameKeyGain * level.speedGain });
  }
  if (params.rival) {
    next.rival = {
      ...params.rival,
      cycles: params.rival.cycles.map((c: { topSpeed: number }) => ({ ...c, topSpeed: c.topSpeed * level.rivalPace })),
      beyondTopSpeedStep: params.rival.beyondTopSpeedStep * level.rivalPace,
      topSpeedCap: params.rival.topSpeedCap * level.rivalPace,
    };
  }
  if (params.angleWindow) {
    const { min, max } = params.angleWindow;
    const widen = Math.max(level.angleWindowWiden, -(max - min) / 2);
    next.angleWindow = { min: min - widen, max: max + widen };
  }
  if (params.clearWindow) {
    const { from, to } = params.clearWindow;
    const widen = Math.max(level.clearWindowWiden, -Math.floor((to - from) / 2));
    next.clearWindow = { from: Math.max(0, from - widen), to: to + widen };
  }
  if (params.releaseWindow) {
    next.releaseWindow = { ...params.releaseWindow, halfWidth: Math.max(1, params.releaseWindow.halfWidth + level.angleWindowWiden) };
  }
  return (next as P);
}
