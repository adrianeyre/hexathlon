import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { tapIn, wasPressed } from './manager.ts';

/** Characters allowed in initials, in the order Up and Down cycle through them. */
export const INITIALS_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789. ';

/** Centre x of each letter slot. */
const SLOT_X = [SCREEN_WIDTH / 2 - 36, SCREEN_WIDTH / 2, SCREEN_WIDTH / 2 + 36];
const LETTER_Y = 112;
/** Touch areas: up arrow, letter and down arrow per slot, plus the END button. */
const UP_Y = LETTER_Y - 44;
const DOWN_Y = LETTER_Y + 20;
const ARROW_H = 26;
const SLOT_W = 34;
export const END_BUTTON = Object.freeze({ x: SCREEN_WIDTH / 2 - 40, y: 168, w: 80, h: 28 });

/**
 * Arcade-style initials entry for a qualifying Session total. After a
 * two-player Session each qualifying player enters theirs in turn: `queue`
 * holds the players still to come, each checked again once the one before
 * is on the table.
 *
 * Keyboard: type a letter or digit, or use Up/Down to change the current
 * letter and Left/Right to move; START confirms each letter. Touch: tap the
 * arrows above and below a letter, tap a letter to move to it, tap END.
 * Escape deletes back a letter.
 */
export function createInitialsScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene & { readonly initials: string; } {
  let points = 0;
  /** Null after a one-player Session. */
  let player: 1 | 2 | null = null;
  let queue: { player: 1 | 2; points: number; }[] = [];
  /** Index into INITIALS_CHARS per slot. */
  let letters = [0, 0, 0];
  let cursor = 0;
  let frame = 0;

  const initials = () => letters.map((i) => INITIALS_CHARS[i]).join('');

  const cycle = (slot: number, direction: -1 | 1) => {
    letters[slot] = (letters[slot] + direction + INITIALS_CHARS.length) % INITIALS_CHARS.length;
    services.sounds.move();
  };

  const save = () => {
    services.sounds.select();
    const rank = services.storage.addHighScore({ initials: initials(), points });
    const next = queue.findIndex((q) => services.storage.qualifiesForHighScore(q.points));
    if (next >= 0) manager.change('initials', { ...queue[next], queue: queue.slice(next + 1) });
    else manager.change('highScores', { back: 'title', highlight: rank });
  };

  const confirm = () => {
    if (cursor < 2) {
      cursor += 1;
      services.sounds.select();
    } else save();
  };

  return {
    get initials() {
      return initials();
    },

    enter(params) {
      points = typeof params.points === 'number' ? params.points : 0;
      player = params.player === 1 || params.player === 2 ? params.player : null;
      queue = Array.isArray(params.queue) ? (params.queue as { player: 1 | 2, points: number }[]) : [];
      letters = [0, 0, 0];
      cursor = 0;
      frame = 0;
    },

    step(input) {
      frame += 1;
      for (const key of input.keys ?? []) {
        if (key.type !== 'press') continue;
        const m = /^(?:Key|Digit|Numpad)([A-Z0-9])$/.exec(key.code);
        const ch = m ? m[1] : key.code === 'Period' ? '.' : null;
        if (ch === null) continue;
        letters[cursor] = INITIALS_CHARS.indexOf(ch);
        // Typing fills the slot and moves on, but never saves by itself.
        if (cursor < 2) cursor += 1;
        services.sounds.move();
      }
      if (wasPressed(input, 'UP')) cycle(cursor, 1);
      if (wasPressed(input, 'DOWN')) cycle(cursor, -1);
      if (wasPressed(input, 'LEFT')) cursor = Math.max(0, cursor - 1);
      if (wasPressed(input, 'RIGHT')) cursor = Math.min(2, cursor + 1);
      // Escape or Backspace steps back. (Not the PAUSE action: P is a letter here.)
      const back =
        (input.keys ?? []).some((k) => k.type === 'press' && (k.code === 'Escape' || k.code === 'Backspace')) ||
        input.edges.some((e) => e.type === 'press' && e.action === 'PAUSE' && e.player !== 0);
      if (back) cursor = Math.max(0, cursor - 1);
      SLOT_X.forEach((x, slot) => {
        const left = x - SLOT_W / 2;
        if (tapIn(input, { x: left, y: UP_Y, w: SLOT_W, h: ARROW_H })) {
          cursor = slot;
          cycle(slot, 1);
        }
        if (tapIn(input, { x: left, y: UP_Y + ARROW_H, w: SLOT_W, h: DOWN_Y - UP_Y - ARROW_H })) cursor = slot;
        if (tapIn(input, { x: left, y: DOWN_Y, w: SLOT_W, h: ARROW_H })) {
          cursor = slot;
          cycle(slot, -1);
        }
      });
      if (tapIn(input, END_BUTTON)) save();
      else if (wasPressed(input, 'START')) confirm();
    },

    render(ctx) {
      ctx.fillStyle = PALETTE.background;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      drawText(ctx, 'NEW HIGH SCORE', SCREEN_WIDTH / 2, 20, { scale: 2, color: PALETTE.highlight });
      drawText(ctx, player ? `PLAYER ${player}   ${points} POINTS` : `${points} POINTS`, SCREEN_WIDTH / 2, 42);
      drawText(ctx, 'ENTER YOUR INITIALS', SCREEN_WIDTH / 2, 56, { color: PALETTE.dim });
      const steady = services.settings.get().reducedFlash;
      SLOT_X.forEach((x, slot) => {
        const active = slot === cursor;
        const color = active ? PALETTE.highlight : PALETTE.text;
        drawText(ctx, '▲', x, UP_Y + ARROW_H / 2, { scale: 2, color: active ? color : PALETTE.dim });
        drawText(ctx, '▼', x, DOWN_Y + ARROW_H / 2, { scale: 2, color: active ? color : PALETTE.dim });
        const ch = INITIALS_CHARS[letters[slot]];
        drawText(ctx, ch === ' ' ? '_' : ch, x, LETTER_Y, { scale: 3, color });
        // The active slot is underlined as well as coloured.
        if (active && (steady || frame % 40 < 30)) {
          ctx.fillStyle = color;
          ctx.fillRect(x - 9, LETTER_Y + 13, 18, 2);
        }
      });
      const { x, y, w, h } = END_BUTTON;
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(x, y, w, h);
      drawText(ctx, 'END', x + w / 2, y + h / 2, { scale: 2 });
      drawText(ctx, 'TYPE OR ▲▼  ENTER NEXT  ESC BACK', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 14, { color: PALETTE.dim });
    },
  };
}
