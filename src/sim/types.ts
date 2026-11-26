/**
 * Shared simulation types. Everything under `src/sim/` is pure: no DOM, no
 * canvas, no timers. Positions are in the original's screen pixels and time is
 * in 60 Hz frames (ADR-0004).
 */

/**
 * A normalised action, whatever the device.
 * `START` is a menu-level action (Enter, Space or a tap) used outside Events.
 * `UP`, `DOWN`, `LEFT` and `RIGHT` navigate menus; Event simulations ignore them.
 */
export type Action = 'RUN_A' | 'RUN_B' | 'ACTION' | 'PAUSE' | 'START' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

/**
 * Player number. 1 and 2 are players; 0 means "any player" and is used for
 * shared keys such as pause.
 */
export type PlayerId = 0 | 1 | 2;

/** One press or release of an action, already assigned to a frame. */
export interface InputEdge {
  player: PlayerId;
  action: Action;
  type: 'press' | 'release';
}

/** Everything the simulation receives for one fixed step. */
export interface FrameInput {
  /** Index of this step, starting at 0. */
  frame: number;
  /** Presses and releases in the order they happened. */
  edges: InputEdge[];
}

/** Identifier of a real Event, in the original's order. */
export type EventId = 'sprint' | 'longJump' | 'javelin' | 'hurdles' | 'hammer' | 'highJump';

/**
 * Unit a Mark is measured in: frames for times, the original's pixels for
 * distances and heights.
 */
export type MarkUnit = 'frames' | 'pixels';

/** How an Attempt ended. */
export type Outcome = 'valid' | 'foul' | 'falseStart' | 'failed';

/** The Mark one player achieved in an Attempt, in sim units. */
export interface PlayerMark {
  player: 1 | 2;
  outcome: Outcome;
  /** Null when there is no Mark (e.g. a foul). */
  value: number | null;
  unit: MarkUnit;
}

/** The Rival's Mark in a running Event, in sim units. */
export interface RivalMark {
  value: number | null;
  unit: MarkUnit;
}

/** The finished result of an Attempt. */
export interface EventResult {
  marks: PlayerMark[];
  /** Running Events against the Rival. */
  rival?: RivalMark;
  /** Field Events: each Attempt's Mark for player 1, in order. */
  attempts?: (PlayerMark | null)[];
  /** High Jump: the bar height of each Attempt, in order. */
  heights?: number[];
}

/** Options passed to an Event when an Attempt starts. */
export interface EventInit {
  /** 1-based Cycle number. */
  cycle: number;
  /** Number of human players. */
  players: 1 | 2;
  /** 1-based Attempt number in a field Event; 1 when omitted. */
  attempt?: number;
  /** High Jump: the bar height in pixels; the starting height when omitted. */
  barHeight?: number;
}

/**
 * The interface every Event simulation implements. State is plain data so it
 * can be cloned, compared and serialised.
 */
export interface EventSim<S> {
  id: string;
  init: (options: EventInit) => S;
  step: (state: S, input: FrameInput) => S;
  /** Null while the Attempt is still running. */
  getResult: (state: S) => EventResult | null;
}

export {};
