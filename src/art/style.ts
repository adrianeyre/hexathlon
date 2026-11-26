/**
 * The style guide's rules as data (see `docs/style-guide.md`), so the tests
 * can hold every sprite to them and renderers can read the animation timing.
 */

/** Athlete proportions, in sprite pixels. */
export const PROPORTIONS = Object.freeze({
  /**
   * Upright frames are this size, feet on the bottom row. They are drawn
   * 22 rows tall and stretched (`defineTallSprite`) to the tall, lanky build
   * of the arcade originals.
   */
  width: 16,
  height: 28,
  /** Rows 0 to 6 are the head (a quarter of the height). */
  headRows: 7,
  /** Rows 8 to 14 are the vest. */
  torsoRows: 7,
  /** Rows 15 to 27 are shorts and legs. */
  legRows: 13,
});

/**
 * How many frames each animation has. Every renderer animates with these and
 * the tests check the sprite modules provide exactly this many.
 */
export const FRAME_COUNTS = Object.freeze({
  run: 4,
  crouch: 2,
  stand: 1,
  cheer: 1,
  celebrate: 2,
  dejected: 2,
  judge: 2,
  measurerWalk: 2,
  longJumpTakeoff: 1,
  longJumpFlight: 2,
  longJumpLand: 1,
  javelinThrow: 3,
  javelinAngles: 9,
  hurdleClear: 2,
  hurdleStumble: 1,
  hammerSpin: 4,
  hammerRelease: 1,
  highJumpTakeoff: 1,
  highJumpClear: 2,
  highJumpKnock: 1,
  highJumpLand: 1,
});

/**
 * Animation timing in 60 Hz frames per step. The run cycle speeds up with the
 * athlete: a renderer picks a step length between `runSlowest` (barely
 * moving) and `runFastest` (top speed).
 */
export const FRAME_TIMING = Object.freeze({
  runSlowest: 10,
  runFastest: 3,
  hammerSpinSlowest: 12,
  hammerSpinFastest: 3,
  crowdWave: 12,
});

/**
 * Frames per run-cycle step for a speed between 0 (still) and 1 (top speed).
 */
export function runStepFrames(speed01: number) {
  const s = Math.min(1, Math.max(0, speed01));
  return Math.round(FRAME_TIMING.runSlowest + (FRAME_TIMING.runFastest - FRAME_TIMING.runSlowest) * s);
}
