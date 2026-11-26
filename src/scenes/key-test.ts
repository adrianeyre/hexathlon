import { PAD_ACTIONS } from '../gamepad.ts';
import { REMAPPABLE_SLOTS, keyLabel, slotCodes } from '../input.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { slotName } from './controls.ts';
import { tapIn } from './manager.ts';

/** Hold Escape this long to leave (a quick press is just another key to test). */
export const EXIT_HOLD_FRAMES = 60;
export const BACK_BUTTON = Object.freeze({ x: SCREEN_WIDTH / 2 - 32, y: SCREEN_HEIGHT - 30, w: 64, h: 24 });

/**
 * Ghosting test: shows every key and pad button held right now, live. Cheap
 * keyboards can't register some combinations of held keys; holding the run and
 * action keys of both players together shows whether this one can.
 */
export function createKeyTestScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene & { readonly held: ReadonlySet<string>; } {
  const held: Set<string> = new Set();
  const padHeld: Map<1 | 2, Set<number>> = new Map();
  let escapeFrames = 0;

  return {
    get held() {
      return held;
    },

    enter() {
      held.clear();
      padHeld.clear();
      escapeFrames = 0;
    },

    step(input) {
      for (const key of input.keys ?? []) {
        if (key.type === 'press') held.add(key.code);
        else held.delete(key.code);
      }
      for (const pad of input.pads ?? []) {
        const set = padHeld.get(pad.player) ?? new Set();
        if (pad.type === 'press') set.add(pad.button);
        else set.delete(pad.button);
        padHeld.set(pad.player, set);
      }
      escapeFrames = held.has('Escape') ? escapeFrames + 1 : 0;
      if (escapeFrames >= EXIT_HOLD_FRAMES || tapIn(input, BACK_BUTTON)) manager.change('settings');
    },

    render(ctx) {
      ctx.fillStyle = PALETTE.background;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      drawText(ctx, 'KEY TEST', SCREEN_WIDTH / 2, 12, { color: PALETTE.highlight });
      drawText(ctx, 'HOLD KEYS TOGETHER TO SEE WHICH REGISTER', SCREEN_WIDTH / 2, 26, { color: PALETTE.dim });

      // Game keys: a box per action, lit while its key is held.
      const keys = services.controls.get().keys;
      REMAPPABLE_SLOTS.forEach((slot, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 12 + col * 76;
        const y = 40 + row * 30;
        const codes = slotCodes(keys, slot);
        const on = codes.some((c) => held.has(c));
        ctx.fillStyle = on ? PALETTE.highlight : PALETTE.panel;
        ctx.fillRect(x, y, 70, 24);
        const color = on ? PALETTE.background : PALETTE.text;
        drawText(ctx, slotName(slot), x + 35, y + 7, { color });
        drawText(ctx, on ? `[${codes.map(keyLabel).join(' ')}]` : codes.map(keyLabel).join(' '), x + 35, y + 17, { color });
      });

      // Every held key, bound or not, and the count.
      const list = [...held].map(keyLabel);
      drawText(ctx, `${list.length} KEYS HELD`, SCREEN_WIDTH / 2, 110, { color: PALETTE.accent });
      const perLine = 8;
      for (let line = 0; line * perLine < list.length && line < 3; line++) {
        drawText(ctx, list.slice(line * perLine, (line + 1) * perLine).join(' '), SCREEN_WIDTH / 2, 124 + line * 11);
      }

      // Pads.
      [1, 2].forEach((player, i) => {
        const buttons = [...(padHeld.get((player as 1 | 2)) ?? [])].sort((a, b) => a - b);
        const pads = services.controls.get().pads;
        const actions = PAD_ACTIONS.filter((a) => pads[a].some((b) => buttons.includes(b))).map((a) => a.replace('_', ' '));
        const text = buttons.length ? `${buttons.map((b) => `B${b}`).join(' ')}  ${actions.join(' ')}` : '-';
        drawText(ctx, `PAD ${player}: ${text}`, 12, 166 + i * 12, { align: 'left', color: buttons.length ? PALETTE.text : PALETTE.dim });
      });

      const { x, y, w, h } = BACK_BUTTON;
      ctx.fillStyle = PALETTE.panel;
      ctx.fillRect(x, y, w, h);
      drawText(ctx, 'BACK', x + w / 2, y + h / 2);
      drawText(ctx, 'HOLD ESC', SCREEN_WIDTH - 8, y + h / 2, { align: 'right', color: PALETTE.dim });
    },
  };
}
