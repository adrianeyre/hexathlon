/**
 * How the athlete reacts once an Attempt is decided, as in the arcade
 * originals of the genre: passing it, they jump up and down with their arms
 * in the air; failing it, they bow their head and shake it.
 *
 * "Passing" means reaching the Standard in Arcade (any valid Mark in
 * Practice, or beating the Rival in a Practice race); a foul, a false start
 * or a Mark short of the Standard is a failure. In the High Jump each
 * clearance is a pass and each failure a failure, since clearing is what
 * keeps the athlete in. Pure: works from the sim state and the Standard.
 */

import { CELEBRATE, DEJECTED } from '../art/athlete.ts';
import { meetsStandard } from '../sim/standards.ts';

export type Reaction = 'celebrate' | 'dejected';

/** Animation timing, in 60 Hz frames. */
export const REACTION_TIMING = Object.freeze({
  /** One jump: up and back down. */
  jump: 20,
  /** How high the athlete jumps, in pixels. */
  jumpHeight: 6,
  /** Frames on the ground between jumps (knees bent). */
  landing: 6,
  /** Frames the head holds each way while shaking. */
  shake: 10,
  /** Frames a jumper sits in the sand (or a thrower holds the follow-through) before reacting. */
  pause: 30,
});

/**
 * Whether one player passed the Attempt, from a decided state.
 * @param state  The Event's sim state (one player's).
 * @param standard  Null in Practice.
 * @returns  Null while the Attempt is still under way.
 */
export function reactionFor(eventId: import('../sim/types.ts').EventId | null, state: any, standard: import('../sim/standards.ts').Standard | null | undefined): Reaction | null {
  if (!state || !eventId) return null;
  if (eventId === 'sprint' || eventId === 'hurdles') {
    if (state.phase !== 'done') return null;
    if (state.outcome !== 'valid' || state.finishFrame === null) return 'dejected';
    if (standard) return meetsStandard({ player: 1, outcome: 'valid', value: state.finishFrame, unit: 'frames' }, standard) ? 'celebrate' : 'dejected';
    const rivalWon = state.rival?.finishFrame !== null && state.rival?.finishFrame !== undefined && state.rival.finishFrame < state.finishFrame;
    return rivalWon ? 'dejected' : 'celebrate';
  }
  if (state.outcome === null || state.outcome === undefined) return null;
  if (eventId === 'highJump') return state.outcome === 'valid' ? 'celebrate' : 'dejected';
  if (state.outcome !== 'valid') return 'dejected';
  if (!standard) return 'celebrate';
  return meetsStandard({ player: 1, outcome: 'valid', value: state.mark, unit: 'pixels' }, standard) ? 'celebrate' : 'dejected';
}

/**
 * The sprite and lift for a reaction, `frames` after it started.
 * @param [reducedFlash]  Hold still: arms up on the ground, or head bowed without shaking.
 */
export function reactionPose(reaction: Reaction, frames: number, reducedFlash: boolean = false): { sprite: import('../art/sprite.ts').Sprite; lift: number; } {
  const t = Math.max(0, Math.floor(frames));
  if (reaction === 'dejected') {
    return { sprite: DEJECTED[reducedFlash ? 0 : Math.floor(t / REACTION_TIMING.shake) % DEJECTED.length], lift: 0 };
  }
  if (reducedFlash) return { sprite: CELEBRATE[0], lift: 0 };
  const { jump, jumpHeight, landing } = REACTION_TIMING;
  const u = t % (jump + landing);
  if (u >= jump) return { sprite: CELEBRATE[1], lift: 0 };
  const p = u / jump;
  return { sprite: CELEBRATE[0], lift: Math.round(4 * jumpHeight * p * (1 - p)) };
}

/**
 * Each player's reaction once a two-player race is over: as `reactionFor`,
 * except that the player beaten to the line shakes their head.
 * @param runners  Player 1's race, then player 2's, both finished or disqualified.
 */
export function duoReactions(eventId: import('../sim/types.ts').EventId | null, runners: readonly [any, any], standard: import('../sim/standards.ts').Standard | null | undefined): [Reaction | null, Reaction | null] {
  const [a, b] = runners;
  const own = (r: any, other: any) => reactionFor(eventId, { ...r, rival: { finishFrame: other.finishFrame } }, standard);
  const reactions: [Reaction | null, Reaction | null] = [own(a, b), own(b, a)];
  const bothFinished = runners.every((r) => r.outcome === 'valid' && r.finishFrame !== null);
  if (bothFinished && a.finishFrame !== b.finishFrame) reactions[a.finishFrame < b.finishFrame ? 1 : 0] = 'dejected';
  return reactions;
}

/**
 * How long after the athlete wins a race the beaten Rival crosses the line, in frames.
 * @param state  A running Event's state, from the frame the athlete finished.
 * @param rival  The Rival `after` frames later.
 * @returns  Null if the Rival hasn't crossed yet, or the athlete didn't win.
 */
export function rivalBeatenAfter(state: { outcome: string | null; raceFrame: number; rival: { finishFrame: number | null } }, rival: { finishFrame: number | null }): number | null {
  if (state.outcome !== 'valid' || state.rival.finishFrame !== null || rival.finishFrame === null) return null;
  return rival.finishFrame - state.raceFrame;
}
