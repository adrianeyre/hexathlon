/**
 * Two-player rules and the pieces that let the one-player Event simulations
 * run for two players (#58). The rules come from `data/two-player.json` and
 * are provisional until the original's structure is captured (#22).
 *
 * - `asPlayer` lets any one-player sim be played with player 2's keys.
 * - `createDuoRace` runs a running Event for both players side by side: two
 *   copies of the one-player sim sharing one start sequence, with no Rival.
 *
 * Pure: state is plain data.
 */

import TWO_PLAYER_DATA from '../../data/two-player.json' with { type: 'json' };

export type FrameInput = import('./types.ts').FrameInput;
export type EventResult = import('./types.ts').EventResult;
export type PlayerMark = import('./types.ts').PlayerMark;

export interface TwoPlayerRules {
  provisional: boolean;
  /** Running Events: each player's lane (1 to 4). */
  lanes: { 1: number, 2: number };
  /** Field Events: take turns per Attempt, or each player takes all their Attempts in turn. */
  fieldTurns: 'alternate' | 'consecutive';
  /** When missing Standards ends the Session. */
  sessionEnds: 'allOut' | 'anyOut';
}

/**
 * Check two-player rules, throwing on anything the game can't play.
 */
export function parseTwoPlayerRules(value: unknown): TwoPlayerRules {
  const v = (value as any);
  const lane = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 4;
  if (!v || typeof v !== 'object') throw new Error('two-player rules must be an object');
  if (!lane(v.lanes?.['1']) || !lane(v.lanes?.['2']) || v.lanes['1'] === v.lanes['2']) throw new Error('two-player lanes must be two different lanes, 1 to 4');
  if (v.fieldTurns !== 'alternate' && v.fieldTurns !== 'consecutive') throw new Error(`unknown fieldTurns "${v.fieldTurns}"`);
  if (v.sessionEnds !== 'allOut' && v.sessionEnds !== 'anyOut') throw new Error(`unknown sessionEnds "${v.sessionEnds}"`);
  return Object.freeze({ provisional: v.provisional === true, lanes: Object.freeze({ 1: v.lanes['1'], 2: v.lanes['2'] }), fieldTurns: v.fieldTurns, sessionEnds: v.sessionEnds });
}

/** The rules in `data/two-player.json`. */
export const TWO_PLAYER = parseTwoPlayerRules(TWO_PLAYER_DATA);

/**
 * One player's input, as player 1's: the one-player sims only read player 1.
 */
export function inputFor(input: FrameInput, player: 1 | 2): FrameInput {
  return { ...input, edges: input.edges.filter((e) => e.player === player).map((e) => ({ ...e, player: 1 })) };
}

/**
 * A one-player Mark, relabelled for a player.
 */
export const markFor = (mark: PlayerMark | null | undefined, player: 1 | 2): PlayerMark | null => (mark ? { ...mark, player } : null);

/**
 * A one-player sim played by player 1 or 2: it reads that player's keys and
 * its Marks are theirs.
 */
export function asPlayer<S>(sim: import('./types.ts').EventSim<S>, player: 1 | 2): import('./types.ts').EventSim<S> {
  if (player === 1) return sim;
  return {
    id: sim.id,
    init: (options) => sim.init({ ...options, players: 1 }),
    step: (state, input) => sim.step(state, inputFor(input, player)),
    getResult(state) {
      const result = sim.getResult(state);
      if (!result) return null;
      const { rival, ...rest } = result;
      return {
        ...rest,
        ...(rival ? { rival } : {}),
        marks: result.marks.map((m) => (markFor(m, player) as PlayerMark)),
        ...(result.attempts ? { attempts: result.attempts.map((m) => markFor(m, player)) } : {}),
      };
    },
  };
}

/** The state every running Event shares: a start sequence, then a race. */
export type RaceLike = { phase: 'set' | 'race' | 'done', frame: number, setFrame: number, raceFrame: number, falseStarts: number, outcome: string | null };

/** Two runners in one race. */
export interface DuoRaceState<S extends RaceLike> {
  /** Player 1's race, then player 2's. */
  runners: [S, S];
  /** 'set' until the start signal, 'done' once both have finished or been disqualified. */
  phase: 'set' | 'race' | 'done';
  frame: number;
}

/**
 * A running Event for two players side by side, with no Rival: each player
 * runs their own copy of the one-player sim, and a false start by either
 * sends both back to the blocks. A player who is disqualified stops; the
 * race ends when both have finished or been disqualified.
 * @param sim  A one-player running Event.
 */
export function createDuoRace<S extends RaceLike>(sim: import('./types.ts').EventSim<S>): import('./types.ts').EventSim<DuoRaceState<S>> {
  const phaseOf = (runners: [S, S]) =>
    runners.every((r) => r.phase === 'done') ? 'done' : runners.every((r) => r.phase === 'set' || (r.phase === 'done' && r.outcome === 'falseStart')) ? 'set' : 'race';

  return {
    id: sim.id,

    init(options) {
      const runner = () => sim.init({ ...options, players: 1 });
      return { runners: [runner(), runner()], phase: 'set', frame: 0 };
    },

    step(state, input) {
      if (state.phase === 'done') return state;
      let runners: [S, S] = [sim.step(state.runners[0], inputFor(input, 1)), sim.step(state.runners[1], inputFor(input, 2))];
      // A false start by either player restarts the start sequence for both.
      const falseStart = runners.some((r, i) => r.falseStarts > state.runners[i].falseStarts);
      if (falseStart) runners = (runners.map((r) => (r.phase === 'set' ? { ...r, setFrame: 0 } : r)) as [S, S]);
      return { runners, phase: phaseOf(runners), frame: state.frame + 1 };
    },

    getResult(state) {
      if (state.phase !== 'done') return null;
      const results = state.runners.map((r) => sim.getResult(r));
      if (results.some((r) => r === null)) return null;
      const marks = results.map((r, i) => markFor(r?.marks.find((m) => m.player === 1), ((i + 1) as 1 | 2)));
      return { marks: (marks.filter((m) => m !== null) as PlayerMark[]) };
    },
  };
}

/**
 * Who takes the next field Attempt.
 * @param players  Players still taking Attempts, in order.
 * @param last  Who took the last one; null before the first.
 * @returns  Null when nobody has Attempts left.
 */
export function nextTurn(players: readonly (1 | 2)[], last: 1 | 2 | null, turns: TwoPlayerRules['fieldTurns']): 1 | 2 | null {
  if (players.length === 0) return null;
  if (last === null || !players.includes(last)) return players.find((p) => last === null || p > last) ?? players[0];
  if (turns === 'consecutive') return last;
  const i = players.indexOf(last);
  return players[(i + 1) % players.length];
}
