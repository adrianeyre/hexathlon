/**
 * An Arcade Session (GLOSSARY): the six Events in order, each with a Standard
 * for the current Cycle. Reaching every Standard starts the next Cycle;
 * missing one ends the Session. Points add up across every Event played.
 *
 * With two players (#58), each has their own Points; a player who misses a
 * Standard is out, and the Session ends as `data/two-player.json` says.
 * Pure: a Session is plain data and each function returns a new one.
 */

import { EVENT_IDS } from './events.ts';
import { TWO_PLAYER } from './two-player.ts';

export type EventId = import('./types.ts').EventId;
export type PlayerMark = import('./types.ts').PlayerMark;

export interface SessionEvent {
  player: 1 | 2;
  cycle: number;
  eventId: EventId;
  mark: PlayerMark | null;
  standard: import('./standards.ts').Standard;
  qualified: boolean;
  points: number;
}

export interface Session {
  /** 1-based. */
  cycle: number;
  /** Index into the Event order of the Event being played. */
  index: number;
  /** Player 1's total so far. */
  points: number;
  /** One per player, player 1 first. */
  players: SessionPlayer[];
  played: SessionEvent[];
  over: boolean;
  /** Fixed for the whole Session. */
  difficulty: import('./difficulty.ts').Difficulty;
}

export interface SessionPlayer {
  player: 1 | 2;
  /** Total so far. */
  points: number;
  /** Missed a Standard. */
  out: boolean;
}

export interface PlayerEventResult {
  player: 1 | 2;
  mark: PlayerMark | null;
  qualified: boolean;
  points: number;
}

/**
 * @param [index]  Start at this Event (0 is the 100m).
 */
export function createSession(difficulty: import('./difficulty.ts').Difficulty = 'normal', index: number = 0, playerCount: 1 | 2 = 1): Session {
  const players: SessionPlayer[] = playerCount === 2 ? [{ player: 1, points: 0, out: false }, { player: 2, points: 0, out: false }] : [{ player: 1, points: 0, out: false }];
  return { cycle: 1, index, points: 0, players, played: [], over: false, difficulty };
}

/** Players still in the Session, in order. @param session @returns */
export function activePlayers(session: Session): (1 | 2)[] {
  return session.players.filter((p) => !p.out).map((p) => p.player);
}

/** The Event to play now. @param session */
export function currentEvent(session: Session) {
  return EVENT_IDS[session.index];
}

/**
 * Record the finished Event.
 */
export function recordEvent(session: Session, mark: PlayerMark | null, standard: import('./standards.ts').Standard, qualified: boolean, points: number): Session {
  return recordEventFor(session, [{ player: 1, mark, qualified, points }], standard);
}

/**
 * Record the finished Event for every player who took part. Anyone who missed
 * the Standard is out.
 */
export function recordEventFor(session: Session, results: readonly PlayerEventResult[], standard: import('./standards.ts').Standard, rules: import('./two-player.ts').TwoPlayerRules = TWO_PLAYER): Session {
  const eventId = currentEvent(session);
  const events: SessionEvent[] = results.map((r) => ({ player: r.player, cycle: session.cycle, eventId, mark: r.mark, standard, qualified: r.qualified, points: r.points }));
  const players = session.players.map((p) => {
    const r = results.find((x) => x.player === p.player);
    return r ? { ...p, points: p.points + r.points, out: p.out || !r.qualified } : p;
  });
  const over = rules.sessionEnds === 'anyOut' ? players.some((p) => p.out) : players.every((p) => p.out);
  return { ...session, points: players[0].points, players, played: [...session.played, ...events], over };
}

/** Every player's record of the last Event played. @param session */
export function lastEvents(session: Session) {
  const last = lastEvent(session);
  return last ? session.played.filter((e) => e.cycle === last.cycle && e.eventId === last.eventId) : [];
}

/** The last Event recorded. @param session */
export function lastEvent(session: Session) {
  return session.played[session.played.length - 1] ?? null;
}

/**
 * Move on to the next Event, or the first Event of the next Cycle.
 */
export function advance(session: Session): Session {
  if (session.over) return session;
  const index = session.index + 1;
  return index < EVENT_IDS.length ? { ...session, index } : { ...session, index: 0, cycle: session.cycle + 1 };
}
