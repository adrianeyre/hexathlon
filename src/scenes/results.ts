import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { describeMark, formatMark } from '../render/marks.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { EVENT_IDS } from '../sim/events.ts';
import { advance, lastEvent, lastEvents } from '../sim/session.ts';
import { PLACEHOLDER_ENTRY } from './catalogue.ts';
import { wasPressed } from './manager.ts';
import { createMenu } from './menu.ts';

export type EventResult = import('../sim/types.ts').EventResult;
export type EventEntry = import('./catalogue.ts').EventEntry;
export type Session = import('../sim/session.ts').Session;

/** Frames before input is accepted, so a late mash doesn't skip the screen. */
export const RESULTS_DELAY = 30;

/** High Jump Attempts listed on the results, most recent last. */
export const HIGH_JUMP_LIST_HEIGHTS = 4;

/**
 * The High Jump's Attempts in the usual notation: each height with an O for
 * a clearance and an X for a failure, e.g. "1.30 O  1.40 XO  1.50 XXX".
 * Only the last few heights are listed, so the line fits.
 */
export function heightsLine(result: EventResult) {
  const rows: { height: number; marks: string; }[] = [];
  (result.heights ?? []).forEach((height, i) => {
    const mark = result.attempts?.[i]?.outcome === 'valid' ? 'O' : 'X';
    const last = rows[rows.length - 1];
    if (last && last.height === height) last.marks += mark;
    else rows.push({ height, marks: mark });
  });
  return rows
    .slice(-HIGH_JUMP_LIST_HEIGHTS)
    .map((r) => `${formatMark(r.height, 'pixels', 'highJump').replace(' M', '')} ${r.marks}`)
    .join('  ');
}

/**
 * Shows the Event's Mark and saves a new Personal Best (in every mode).
 *
 * In Arcade it also shows the Standard, whether it was reached, the Points
 * the Mark earned and the Session's total. START (or ACTION, or a tap) then
 * goes on to the next Event (after the High Jump, the first Event of the next
 * Cycle); when the Standard was missed the Session is over, and it goes to
 * High Score entry if the total qualifies, otherwise back to the title.
 * Practice offers another Attempt instead.
 *
 * With two players it lists each player's Mark, whether they qualified, their
 * Points and total, and who is out. At the end of the Session each player
 * whose total qualifies enters their initials in turn.
 */
export function createResultsScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene & { readonly newPersonalBest: boolean; readonly result: EventResult | null; readonly session: Session | null; } {
  let result: EventResult | null = null;
  let entry: EventEntry = PLACEHOLDER_ENTRY;
  let mode = 'arcade';
  let session: Session | null = null;
  let frame = 0;
  let newPersonalBest = false;
  /** Players who took part in the Event. */
  let players: (1 | 2)[] = [1];

  const practiceMenu = createMenu(
    [
      { label: 'TRY AGAIN', select: () => manager.change('event', { entry, mode: 'practice' }) },
      { label: 'CHOOSE EVENT', select: () => manager.change('practice', { entryId: entry.id }) },
      { label: 'MAIN MENU', select: () => manager.change('menu') },
    ],
    { top: SCREEN_HEIGHT - 76, rowHeight: 20 },
    services.sounds,
  );

  /** After an Arcade Event: the next Event, or the end of the Session. */
  const next = () => {
    if (!session || session.over) {
      // Each player whose total qualifies enters their initials, player 1 first.
      const twoPlayer = (session?.players.length ?? 1) > 1;
      const totals = twoPlayer ? (session?.players ?? []).map((p) => ({ player: p.player, points: p.points })) : [{ player: (1 as 1 | 2), points: session?.points ?? 0 }];
      const queue = totals.filter((q) => q.points > 0);
      const first = queue.findIndex((q) => services.storage.qualifiesForHighScore(q.points));
      if (first >= 0) {
        const { player, points } = queue[first];
        manager.change('initials', { points, ...(twoPlayer ? { player, queue: queue.slice(first + 1) } : {}) });
      } else manager.change('title');
      return;
    }
    const upcoming = advance(session);
    const nextEntry = services.catalogue.events[upcoming.index];
    if (!nextEntry?.sim) {
      manager.change('title');
      return;
    }
    manager.change('event', { entry: nextEntry, mode: 'arcade', session: upcoming });
  };

  /**
   * Two-player results: each player's Mark, qualification and Points.
   */
  const renderPlayers = (ctx: CanvasRenderingContext2D, reducedFlash: boolean) => {
    const records = session ? lastEvents(session) : [];
    players.forEach((player, i) => {
      const mark = result?.marks.find((m) => m.player === player);
      drawText(ctx, `P${player}  ${describeMark(mark, entry.eventId)}`, SCREEN_WIDTH / 2, 64 + i * 22, { scale: 2 });
    });
    if (newPersonalBest && (reducedFlash || frame % 40 < 28)) drawText(ctx, '* NEW PERSONAL BEST *', SCREEN_WIDTH / 2, 64 + players.length * 22, { color: PALETTE.highlight });
    const played = records[0];
    if (played) drawText(ctx, `QUALIFY ${formatMark(played.standard.value, played.standard.unit, entry.eventId)}`, SCREEN_WIDTH / 2, 124, { color: PALETTE.dim });
    (session?.players ?? []).forEach((p, i) => {
      const record = records.find((r) => r.player === p.player);
      const status = record ? (record.qualified ? 'QUALIFIED' : 'OUT') : 'OUT';
      const text = record ? `P${p.player} ${status}  +${record.points}  TOTAL ${p.points}` : `P${p.player} OUT  TOTAL ${p.points}`;
      drawText(ctx, text, SCREEN_WIDTH / 2, 142 + i * 14, { color: record?.qualified ? PALETTE.highlight : PALETTE.warning });
    });
    if (session?.over) drawText(ctx, 'GAME OVER', SCREEN_WIDTH / 2, 182, { color: PALETTE.warning });
    else if (session && session.index === EVENT_IDS.length - 1) drawText(ctx, `NEXT: CYCLE ${session.cycle + 1}`, SCREEN_WIDTH / 2, 182, { color: PALETTE.accent });
  };

  return {
    get newPersonalBest() {
      return newPersonalBest;
    },
    get result() {
      return result;
    },
    get session() {
      return session;
    },

    enter(params) {
      result = ((params.result ?? null) as EventResult | null);
      entry = (params.entry as EventEntry | undefined) ?? PLACEHOLDER_ENTRY;
      mode = params.mode === 'practice' ? 'practice' : 'arcade';
      session = (params.session as Session | null | undefined) ?? null;
      players = Array.isArray(params.players) && params.players.length > 0 ? (params.players as (1 | 2)[]) : [1];
      frame = 0;
      newPersonalBest = false;
      practiceMenu.reset();
      // Personal Bests (one per Event on this device) are recorded in every mode, Practice included.
      for (const player of players) {
        const mark = result?.marks.find((m) => m.player === player);
        if (entry.eventId && mark && mark.outcome === 'valid' && mark.value !== null) {
          if (services.storage.recordPersonalBest(entry.eventId, { value: mark.value, unit: mark.unit })) newPersonalBest = true;
        }
      }
      if (newPersonalBest) {
        services.sounds.record();
        services.sounds.say('newRecord');
      }
      // In Arcade the announcer calls a missed Standard, and the end of the Session.
      const missed = session ? lastEvents(session).some((r) => !r.qualified) : false;
      if (missed && players.length === 1) services.sounds.say('notQualified');
      if (session?.over) {
        services.sounds.foul();
        services.sounds.say('gameOver');
      }
    },

    step(input) {
      frame += 1;
      if (frame <= RESULTS_DELAY) return;
      if (mode === 'practice') {
        practiceMenu.step(input);
        return;
      }
      if (!wasPressed(input, 'START') && !wasPressed(input, 'ACTION') && !(input.taps?.length ?? 0)) return;
      next();
    },

    render(ctx) {
      ctx.fillStyle = PALETTE.background;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      const reducedFlash = services.settings.get().reducedFlash;
      const played = session ? lastEvent(session) : null;
      drawText(ctx, played ? `CYCLE ${played.cycle}  ${entry.name}` : entry.name, SCREEN_WIDTH / 2, 20, { color: PALETTE.dim });
      drawText(ctx, 'RESULT', SCREEN_WIDTH / 2, 40, { scale: 2, color: PALETTE.highlight });
      if (players.length > 1 || (session?.players.length ?? 1) > 1) {
        renderPlayers(ctx, reducedFlash);
        if (frame > RESULTS_DELAY) drawText(ctx, 'PRESS START', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 30, { scale: 2 });
        return;
      }
      const mark = result?.marks.find((m) => m.player === 1);
      drawText(ctx, describeMark(mark, entry.eventId), SCREEN_WIDTH / 2, 66, { scale: 2 });
      if (newPersonalBest && (reducedFlash || frame % 40 < 28)) {
        drawText(ctx, '* NEW PERSONAL BEST *', SCREEN_WIDTH / 2, 88, { color: PALETTE.highlight });
      } else if (entry.eventId && !newPersonalBest) {
        const best = services.storage.getPersonalBests()[entry.eventId];
        if (best) drawText(ctx, `PERSONAL BEST ${formatMark(best.value, best.unit, entry.eventId)}`, SCREEN_WIDTH / 2, 88, { color: PALETTE.dim });
      }
      // Running Events: the Rival's time. Field Events: every Attempt in the series (the High Jump: heights with O and X).
      if (result?.rival) {
        drawText(ctx, `RIVAL ${describeMark({ player: 2, outcome: 'valid', ...result.rival }, entry.eventId)}`, SCREEN_WIDTH / 2, 104, { color: PALETTE.text });
      } else if (result?.heights && result.heights.length > 0) {
        drawText(ctx, heightsLine(result), SCREEN_WIDTH / 2, 104, { color: PALETTE.text });
      } else if (result?.attempts && result.attempts.length > 1) {
        const list = result.attempts.map((m) => describeMark(m, entry.eventId)).join('  ');
        drawText(ctx, list, SCREEN_WIDTH / 2, 104, { color: PALETTE.text });
      }
      if (played) {
        drawText(ctx, `QUALIFY ${formatMark(played.standard.value, played.standard.unit, entry.eventId)}`, SCREEN_WIDTH / 2, 124, { color: PALETTE.dim });
        drawText(ctx, played.qualified ? 'QUALIFIED!' : 'NOT QUALIFIED', SCREEN_WIDTH / 2, 142, {
          scale: 2,
          color: played.qualified ? PALETTE.highlight : PALETTE.warning,
        });
        drawText(ctx, `POINTS +${played.points}   TOTAL ${session?.points ?? 0}`, SCREEN_WIDTH / 2, 164, { color: PALETTE.text });
        if (session?.over) drawText(ctx, 'GAME OVER', SCREEN_WIDTH / 2, 182, { color: PALETTE.warning });
        else if (session && session.index === EVENT_IDS.length - 1) drawText(ctx, `NEXT: CYCLE ${session.cycle + 1}`, SCREEN_WIDTH / 2, 182, { color: PALETTE.accent });
      }
      if (frame <= RESULTS_DELAY) return;
      if (mode === 'practice') practiceMenu.render(ctx);
      else drawText(ctx, 'PRESS START', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 30, { scale: 2 });
    },
  };
}
