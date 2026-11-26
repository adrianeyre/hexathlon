/**
 * Fixed-timestep clock. The simulation advances in exact 1/60 s steps however
 * fast the display refreshes; rendering happens once per display frame.
 *
 * The clock itself has no DOM dependency, so it runs the same in Node tests.
 * `startLoop` wires it to `requestAnimationFrame` in the browser.
 */

/** Length of one simulation step in milliseconds (60 Hz). */
export const FRAME_MS = 1000 / 60;

/**
 * Longest wall-clock gap the clock will catch up on in one go. Anything longer
 * (a background tab, a debugger pause) is dropped instead of replayed as a burst.
 */
export const MAX_GAP_MS = 250;

/**
 * Fixed-step accumulator. Step boundaries are computed as `origin + n * FRAME_MS`
 * rather than by repeated addition, so they don't drift.
 */
export class FixedStepClock {
  /** Time at which step 0 started; moved forward when a long gap is dropped. */
  origin: number;
  /** Number of steps taken so far, which is also the index of the next step. */
  frame: number;
  maxGapMs: number;

  /**
   * @param startTime  Timestamp in ms (same clock as `performance.now()`).
   */
  constructor(startTime: number, maxGapMs: number = MAX_GAP_MS) {
    this.origin = startTime;
    this.frame = 0;
    this.maxGapMs = maxGapMs;
  }

  /** Time at which the next step ends. */
  get nextStepEnd() {
    return this.origin + (this.frame + 1) * FRAME_MS;
  }

  /**
   * Run every step that is due by `now`.
   *
   * @param onStep  Called once per
   *   step with the step index and the timestamp the step ends at. Inputs with a
   *   timestamp before `stepEnd` belong to this step.
   * @returns Interpolation factor in [0, 1) between the last step and the next.
   */
  advance(now: number, onStep: (frame: number, stepEnd: number) => void): number {
    const stepStart = this.origin + this.frame * FRAME_MS;
    const behind = now - stepStart;
    if (behind > this.maxGapMs) {
      // Drop the excess time: keep at most maxGapMs worth of steps.
      this.origin += behind - this.maxGapMs;
    }
    while (this.nextStepEnd <= now) {
      const stepEnd = this.nextStepEnd;
      onStep(this.frame, stepEnd);
      this.frame += 1;
    }
    const alpha = (now - (this.origin + this.frame * FRAME_MS)) / FRAME_MS;
    return Math.min(Math.max(alpha, 0), 1 - Number.EPSILON);
  }
}

export interface LoopCallbacks {
  /** One fixed simulation step. */
  step: (frame: number, stepEnd: number) => void;
  /** Draw the current state, once per display frame. */
  render: (alpha: number) => void;
}

/**
 * Start the browser loop. Returns a function that stops it.
 */
export function startLoop({ step, render }: LoopCallbacks): () => void {
  const clock = new FixedStepClock(performance.now());
  let handle = 0;
  const tick = (now: number) => {
    const alpha = clock.advance(now, step);
    render(alpha);
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(handle);
}
