import { INTRO_FRAMES } from '../audio.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { formatMark } from '../render/marks.ts';
import { reactionFor } from '../render/reaction.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText, textWidth } from '../render/text.ts';
import { isDifficulty } from '../sim/difficulty.ts';
import { EVENT_IDS, RUNNING_EVENTS } from '../sim/events.ts';
import { meetsStandard as reaches } from '../sim/standards.ts';
import { STANDARDS_DATA, difficultyLevel, eventPoints, eventStandard, meetsStandard } from '../sim/registry.ts';
import { activePlayers, createSession, recordEventFor } from '../sim/session.ts';
import { TWO_PLAYER, asPlayer, createDuoRace, inputFor, nextTurn } from '../sim/two-player.ts';
import { SERIES_PLAN, planFor } from './attempt-plans.ts';
import { PLACEHOLDER_ENTRY } from './catalogue.ts';
import { tapIn, wasPressed } from './manager.ts';
import { createMenu } from './menu.ts';

export type EventEntry = import('./catalogue.ts').EventEntry;
export type InputEdge = import('../sim/types.ts').InputEdge;
export type Session = import('../sim/session.ts').Session;
export type Mode = 'arcade' | 'practice';

/** Where the pause icon sits, in internal pixels. Tapping it pauses. */
export const PAUSE_ICON = Object.freeze({ x: SCREEN_WIDTH - 22, y: 2, w: 20, h: 20 });

/** Frames the Mark of one Attempt shows before the next Attempt starts. */
export const BETWEEN_ATTEMPTS_FRAMES = 90;

/**
 * Frames the scene holds on a finished Attempt before moving on, so the
 * athlete's reaction (jumping for joy or shaking their head) and the
 * officials can be seen. The simulation has already stopped, so this never
 * changes a Mark.
 */
export const REACTION_FRAMES = 90;

/**
 * Frames the scene holds on a failed Attempt (a foul, a false start, a Mark
 * short of the Standard, a lost race). As in the arcade originals the athlete
 * stands with their head bowed, shaking it, for a few seconds before the game
 * moves on (to the next Attempt, or the results and GAME OVER).
 */
export const FAILED_REACTION_FRAMES = 240;

/**
 * Frames the scene holds after the loser of a race crosses the line, once
 * someone has won it: the winner doesn't cut the race short, and the loser
 * (the Rival, or the other player) is seen shaking their head for three
 * seconds before the game moves on.
 */
export const LOSER_REACTION_FRAMES = 180;

/** Frames the intro card shows before each Arcade Event (the first of a Session lasts as long as the fanfare). */
export const EVENT_INTRO_FRAMES = 120;

/**
 * The Session's Points: the total, or each player's with two players ("OUT" once they're out).
 */
export function pointsLine(session: Session) {
  if (session.players.length < 2) return `POINTS ${session.points}`;
  return session.players.map((p) => `P${p.player} ${p.out ? 'OUT' : p.points}`).join('  ');
}

/** Actions an Event simulation receives; menu actions never reach it. */
const SIM_ACTIONS = new Set(['RUN_A', 'RUN_B', 'ACTION']);

/**
 * Plays one go at an Event: steps its pure simulation with the frame's
 * input, draws it with its renderer and plays its sound effects.
 *
 * Pausing (PAUSE, a pad's Start, the pause icon, or the page being hidden)
 * stops stepping the simulation. Its own frame counter stops too, so resuming
 * continues from exactly the same frame and the Attempt stays deterministic.
 * Returning to the menu abandons the Attempt.
 *
 * A go is split into Attempts by the Event's plan (`attempt-plans.js`): three
 * Attempts in the field Events in Arcade, the rising bar in the High Jump, one
 * Attempt otherwise. Each Attempt's Mark shows for a moment, the next starts,
 * and once the go is over the results show the Event's Mark.
 *
 * In Arcade the go is part of a Session: an intro card names the Cycle, the
 * Event and its Standard first (at the start of a Session, for as long as the
 * intro fanfare; START or ACTION skips it), the HUD shows the Standard and the
 * Session's Points, and the finished Event is scored and recorded in the
 * Session before the results. In the three-Attempt field Events, reaching the
 * Standard ends the go early when `data/standards.json` says to skip the
 * remaining Attempts. Practice has no Session: unlimited retries, no Standard.
 *
 * The Event plays at the difficulty set in Settings (the Session keeps the one
 * it started with).
 *
 * Two-player (#58, rules in `data/two-player.json`): the running Events are
 * one race with both players side by side and no Rival; in the field Events
 * the players take turns as the rules say, each with their own series. Only
 * players still in the Session take part, and each is scored separately.
 */
export function createEventScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene & { readonly paused: boolean; readonly attemptFrame: number; readonly state: unknown; readonly series: any; readonly turn: 1 | 2; readonly players: (1 | 2)[]; readonly session: Session | null; readonly intro: number; readonly after: number | null; } {
  let entry: EventEntry = PLACEHOLDER_ENTRY;
  let mode: Mode = 'arcade';
  let state: any = null;
  /** Frames the simulation has stepped this Attempt; the sim's frame index. */
  let attemptFrame = 0;
  let paused = false;
  let plan = SERIES_PLAN;
  /** Players taking part in this go, in order. */
  let players: (1 | 2)[] = [1];
  /** Whether this go is a two-player race (one sim for both players). */
  let duo = false;
  /** Whose Attempt it is. */
  let turn: 1 | 2 = 1;
  /** Attempts taken in this go at the Event, per player. */
  let seriesBy: Map<1 | 2, any> = new Map([[1, plan.create(1)]]);
  /** The two lines shown between Attempts. */
  let betweenLines: [string, string] = ['', ''];
  /** Frames left showing the last Attempt's Mark before the next; 0 while an Attempt runs. */
  let between = 0;
  /** Frames left of the intro card; 0 once the Event is under way. */
  let intro = 0;
  /** Frames since this Attempt was decided (landed, fouled, finished); null while it runs. */
  let after: number | null = null;
  /** Frames left holding on the finished Attempt for the reaction; 0 otherwise. */
  let outro = 0;
  /** The finished Attempt's result, waiting for the reaction to end. */
  let pending: import('../sim/types.ts').EventResult | null = null;
  let session: Session | null = null;
  let standard: import('../sim/standards.ts').Standard | null = null;
  let difficulty: import('../sim/difficulty.ts').Difficulty = 'normal';
  /** The Event at the chosen difficulty, for one player. */
  let baseSim: import('../sim/types.ts').EventSim<any> = (PLACEHOLDER_ENTRY.sim as any);
  /** What's stepped: `baseSim` for whoever's turn it is, or the two-player race. */
  let sim: import('../sim/types.ts').EventSim<any> = baseSim;

  const seriesOf = (p: 1 | 2) => seriesBy.get(p);
  const label = (p: 1 | 2) => (players.length > 1 || p !== 1 ? `P${p} ` : '');

  const start = () => {
    state = sim.init({ cycle: session?.cycle ?? 1, players: duo ? 2 : 1, ...plan.next(seriesOf(turn)) });
    attemptFrame = 0;
    paused = false;
    between = 0;
    after = null;
    outro = 0;
    pending = null;
    // Taking turns: the announcer names whose Attempt it is.
    if (players.length > 1 && !duo) services.sounds.say(turn === 2 ? 'player2' : 'player1');
  };

  /** Whether the running Attempt has been decided: the race is over, or the jump or throw has its outcome. */
  const decided = () => (duo ? state?.phase === 'done' : state?.phase === 'done' || (state?.outcome ?? null) !== null);

  /** The Attempt has just been decided: the announcer calls "Qualify" when it reaches the Standard. */
  const onDecided = () => {
    if (!standard || !entry.eventId) return;
    if (duo) return;
    const reaction = reactionFor(entry.eventId, state, standard);
    if (reaction !== 'celebrate') return;
    // In the High Jump every clearance is a pass, but only a clearance at the Standard qualifies.
    if (entry.eventId === 'highJump' && !reaches({ player: 1, outcome: 'valid', value: state.barHeight, unit: 'pixels' }, standard)) return;
    services.sounds.say('qualify');
  };

  /**
   * Whether the finished Attempt ends with an athlete hanging their head: the
   * player's reaction, or in a two-player race either player missing the Standard.
   */
  const failed = (result: import('../sim/types.ts').EventResult) => {
    if (!entry.eventId) return false;
    if (duo) return result.marks.some((m) => !standard || !meetsStandard(m, standard));
    return reactionFor(entry.eventId, state, standard) === 'dejected';
  };

  /**
   * Frames to hold on the finished Attempt before moving on. Once a race has
   * a winner, that's until the loser is over the line, then the loser's head
   * shake: a Rival beaten by the athlete is still running (its finish time is
   * projected), while a two-player race only ends once both are done.
   */
  const holdFor = (result: import('../sim/types.ts').EventResult) => {
    const hold = failed(result) ? FAILED_REACTION_FRAMES : REACTION_FRAMES;
    if (!entry.eventId || !RUNNING_EVENTS.includes(entry.eventId)) return hold;
    if (duo) {
      const [a, b] = state.runners;
      const raced = a.outcome === 'valid' && b.outcome === 'valid' && a.finishFrame !== b.finishFrame;
      return raced ? Math.max(hold, LOSER_REACTION_FRAMES) : hold;
    }
    const rivalTime = result.rival?.value ?? null;
    const won = state.outcome === 'valid' && state.rival?.finishFrame === null && rivalTime !== null;
    return won ? Math.max(hold, rivalTime - state.raceFrame + LOSER_REACTION_FRAMES) : hold;
  };

  /** Start a fresh go at the Event: a new series for each player, then the first Attempt. */
  const begin = () => {
    const limit = mode === 'arcade' ? entry.attempts : 1;
    seriesBy = new Map(players.map((p) => [p, plan.create(limit)]));
    turn = players[0];
    sim = duo ? createDuoRace(baseSim) : asPlayer(baseSim, turn);
    start();
  };

  /** Whether a player's go ends now that the Standard is reached (three-Attempt field Events in Arcade only). */
  const qualifiedEarly = (p: 1 | 2) => {
    const s = seriesOf(p);
    return standard !== null && plan === SERIES_PLAN && s.limit > 1 && STANDARDS_DATA.remainingAttempts === 'skip' && meetsStandard(plan.best(s), standard);
  };
  const finished = (p: 1 | 2) => plan.over(seriesOf(p)) || qualifiedEarly(p);

  const finishAttempt = (result: import('../sim/types.ts').EventResult) => {
    if (duo) {
      done(result);
      return;
    }
    const last = turn;
    seriesBy.set(last, plan.record(seriesOf(last), result.marks.find((m) => m.player === last) ?? null));
    const waiting = players.filter((p) => !finished(p));
    const next = nextTurn(waiting, last, TWO_PLAYER.fieldTurns);
    if (next !== null) {
      const [line1, line2] = plan.between(seriesOf(last), entry.eventId);
      turn = next;
      sim = asPlayer(baseSim, turn);
      betweenLines = [`${label(last)}${line1}`, next === last ? line2 : `${label(next)}${plan.upcoming(seriesOf(next))}`];
      between = BETWEEN_ATTEMPTS_FRAMES;
      return;
    }
    if (players.length === 1) {
      const s = seriesOf(last);
      done(plan.single(s) ? result : { marks: [plan.best(s)].filter((m) => m !== null), ...plan.extra(s) });
      return;
    }
    done({ marks: players.map((p) => plan.best(seriesOf(p))).filter((m) => m !== null) });
  };

  /** The go is over: score it for everyone who took part, then show the results. @param final */
  const done = (final: import('../sim/types.ts').EventResult) => {
    if (session && standard && entry.eventId) {
      const eventId = entry.eventId;
      const std = standard;
      const results = players.map((player) => {
        const mark = final.marks.find((m) => m.player === player) ?? null;
        return { player, mark, qualified: meetsStandard(mark, std), points: eventPoints(eventId, mark) };
      });
      session = recordEventFor(session, results, std);
    }
    manager.change('results', { entry, result: final, mode, session, players });
  };

  const pause = () => {
    if (paused) return;
    paused = true;
    pauseMenu.reset();
    services.sounds.crowd(0);
    services.sounds.quiet();
  };

  const pauseMenu = createMenu(
    [
      { label: 'RESUME', select: () => (paused = false) },
      { label: 'RESTART ATTEMPT', hidden: () => mode !== 'practice', select: () => begin() },
      {
        label: 'QUIT TO MENU',
        select: () => {
          services.sounds.quiet();
          services.sounds.stopMusic();
          manager.change('menu');
        },
      },
    ],
    { top: SCREEN_HEIGHT / 2 - 8, rowHeight: 22 },
    services.sounds,
  );

  return {
    get paused() {
      return paused;
    },
    get attemptFrame() {
      return attemptFrame;
    },
    get state() {
      return state;
    },
    get series() {
      return seriesOf(turn);
    },
    get turn() {
      return turn;
    },
    get players() {
      return players;
    },
    get session() {
      return session;
    },
    get intro() {
      return intro;
    },
    get after() {
      return after;
    },

    enter(params) {
      entry = (params.entry as EventEntry | undefined) ?? PLACEHOLDER_ENTRY;
      if (!entry.sim) throw new Error(`Event ${entry.id} has no simulation yet`);
      mode = params.mode === 'practice' ? 'practice' : 'arcade';
      const given = (params.session as Session | undefined);
      // An Arcade go at a real Event is part of a Session: the one passed in, or a new one starting at this Event.
      const playerCount = params.players === 2 ? 2 : 1;
      session =
        mode === 'arcade' && entry.eventId
          ? (given ?? createSession(services.settings.get().difficulty, Math.max(0, EVENT_IDS.indexOf(entry.eventId)), playerCount))
          : null;
      const chosen = session ? session.difficulty : services.settings.get().difficulty;
      difficulty = isDifficulty(chosen) ? chosen : 'normal';
      baseSim = entry.simAt ? entry.simAt(difficulty) : entry.sim;
      plan = planFor(entry.eventId);
      players = session ? activePlayers(session) : [1];
      if (players.length === 0) players = [1];
      duo = players.length === 2 && entry.eventId !== null && RUNNING_EVENTS.includes(entry.eventId);
      standard = session && entry.eventId ? eventStandard(entry.eventId, session.cycle, difficulty) : null;
      // A new Arcade Session opens with the intro fanfare; anything else starts in silence.
      const sessionStart = mode === 'arcade' && params.sessionStart === true;
      if (sessionStart) services.sounds.intro();
      else services.sounds.stopMusic();
      intro = session ? (sessionStart ? INTRO_FRAMES : EVENT_INTRO_FRAMES) : 0;
      // The announcer names the Event as it begins.
      if (entry.eventId) services.sounds.say(entry.eventId);
      begin();
    },

    exit() {
      services.sounds.crowd(0);
      // Leaving mid-Attempt (quitting to the menu) silences the announcer at once.
      if (pending === null) services.sounds.quiet();
    },

    suspend() {
      pause();
    },

    step(input) {
      if (paused) {
        if (pauseMenu.step(input)) return;
        if (wasPressed(input, 'PAUSE')) paused = false;
        return;
      }
      const iconTap = tapIn(input, PAUSE_ICON);
      // A pad's Start (player 1 or 2) pauses too; the keyboard's START (player 0) doesn't, so Enter can't pause by accident.
      const padStart = input.edges.some((e) => e.type === 'press' && e.action === 'START' && e.player !== 0);
      if (wasPressed(input, 'PAUSE') || padStart || iconTap) {
        pause();
        return;
      }
      if (intro > 0) {
        intro -= 1;
        if (wasPressed(input, 'START') || wasPressed(input, 'ACTION') || (input.taps?.length ?? 0) > 0) intro = 0;
        return;
      }
      if (outro > 0) {
        outro -= 1;
        after = (after ?? 0) + 1;
        if (outro === 0 && pending) finishAttempt(pending);
        return;
      }
      if (between > 0) {
        between -= 1;
        if (between === 0) start();
        return;
      }
      const edges = input.edges.filter((e) => e.player !== 0 && SIM_ACTIONS.has(e.action));
      const frameInput = { frame: attemptFrame, edges };
      const prev = state;
      state = sim.step(state, frameInput);
      attemptFrame += 1;
      // Sound effects follow player 1's race in a two-player race, otherwise whoever is playing.
      if (duo) entry.sounds?.(prev.runners[0], state.runners[0], inputFor(frameInput, 1), services.sounds);
      else entry.sounds?.(prev, state, inputFor(frameInput, turn), services.sounds);
      if (after !== null) after += 1;
      else if (decided()) {
        after = 0;
        onDecided();
      }
      const result = sim.getResult(state);
      if (result) {
        // Hold on the finished Attempt while the athlete reacts, then record it.
        pending = result;
        outro = holdFor(result);
      }
    },

    render(ctx) {
      const running = entry.eventId !== null && RUNNING_EVENTS.includes(entry.eventId);
      const best = entry.eventId ? services.storage.getPersonalBests()[entry.eventId] : undefined;
      const stats: import('./catalogue.ts').RaceStats = {
        points: session ? pointsLine(session) : 'PRACTICE',
        qualify: standard ? formatMark(standard.value, standard.unit, entry.eventId).replace(' SEC', '') : null,
        best: best ? formatMark(best.value, best.unit, entry.eventId).replace(' SEC', '') : null,
      };
      const options = { reducedFlash: services.settings.get().reducedFlash, difficulty, player: turn, standard, after, stats };
      if (!duo) entry.render(ctx, state, options);
      else if (entry.renderDuo) entry.renderDuo(ctx, state, { ...options, lanes: TWO_PLAYER.lanes });
      else entry.render(ctx, state.runners[0], options);
      if (players.length > 1 && !duo && intro === 0) {
        ctx.fillStyle = PALETTE.overlay;
        ctx.fillRect(SCREEN_WIDTH / 2 - 34, 30, 68, 12);
        drawText(ctx, `PLAYER ${turn}`, SCREEN_WIDTH / 2, 36, { color: PALETTE.highlight });
      }
      if (between > 0) {
        const [line1, line2] = betweenLines;
        ctx.fillStyle = PALETTE.overlay;
        ctx.fillRect(0, SCREEN_HEIGHT / 2 - 20, SCREEN_WIDTH, 40);
        drawText(ctx, line1, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 6, { scale: 2 });
        drawText(ctx, line2, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 12, { color: PALETTE.dim });
      }
      // Pause icon: two bars in a box, top right.
      const { x, y, w, h } = PAUSE_ICON;
      ctx.fillStyle = PALETTE.overlay;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = PALETTE.text;
      ctx.fillRect(x + 6, y + 5, 3, h - 10);
      ctx.fillRect(x + w - 9, y + 5, 3, h - 10);
      // The running Events show the Points and the Standard in their own panel along the top.
      if (mode === 'practice' && !running) drawText(ctx, 'PRACTICE', x - 6, 12, { align: 'right', color: PALETTE.dim });
      if (session && standard && !running) {
        const lines = ([
          [pointsLine(session), 12, PALETTE.text],
          [`QUALIFY ${formatMark(standard.value, standard.unit, entry.eventId)}`, 24, PALETTE.highlight],
        ] as const);
        for (const [text, ty, color] of lines) {
          ctx.fillStyle = PALETTE.overlay;
          ctx.fillRect(x - 8 - textWidth(text, 1), ty - 5, textWidth(text, 1) + 4, 10);
          drawText(ctx, text, x - 6, ty, { align: 'right', color });
        }
      }
      if (intro > 0 && session && standard) {
        ctx.fillStyle = PALETTE.background;
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        drawText(ctx, `CYCLE ${session.cycle}`, SCREEN_WIDTH / 2, 56, { color: PALETTE.dim });
        drawText(ctx, entry.name, SCREEN_WIDTH / 2, 84, { scale: 3, color: PALETTE.highlight });
        drawText(ctx, `EVENT ${session.index + 1} OF ${EVENT_IDS.length}`, SCREEN_WIDTH / 2, 110, { color: PALETTE.dim });
        drawText(ctx, `QUALIFY: ${formatMark(standard.value, standard.unit, entry.eventId)}`, SCREEN_WIDTH / 2, 136, { scale: 2 });
        drawText(ctx, `${difficultyLevel(difficulty).label}   ${pointsLine(session)}`, SCREEN_WIDTH / 2, 162, { color: PALETTE.text });
        drawText(ctx, 'PRESS ACTION TO START', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 30, { color: PALETTE.dim });
      }
      if (!paused) return;
      ctx.fillStyle = PALETTE.overlay;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      drawText(ctx, 'PAUSED', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 44, { scale: 3, color: PALETTE.highlight });
      pauseMenu.render(ctx);
    },
  };
}
