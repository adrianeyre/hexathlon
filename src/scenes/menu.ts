/**
 * A vertical menu used by every menu screen. Arrow keys (or the d-pad) move,
 * Start or Action picks, Left and Right change a value; tapping a row picks it,
 * and tapping the left or right end of a value row changes the value.
 */

import { SCREEN_WIDTH } from '../render/display.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { wasPressed } from './manager.ts';

export type SceneInput = import('./manager.ts').SceneInput;

export interface MenuItem {
  label: string | (() => string);
  /** Shown on the right, with arrows when `adjust` is set. */
  value?: string | (() => string);
  select?: () => void;
  adjust?: (direction: -1 | 1) => void;
  disabled?: () => boolean;
  hidden?: () => boolean;
}

export interface MenuLayout {
  /** Centre of the first row, in internal pixels. */
  top: number;
  rowHeight: number;
  /** Left edge of the labels; centred when omitted. */
  left?: number;
  /** Right edge of the values. */
  right?: number;
}

const text = (v: string | (() => string) | undefined) => (typeof v === 'function' ? v() : (v ?? ''));

export function createMenu(items: MenuItem[], layout: MenuLayout, sounds: { move?: () => void; select?: () => void; error?: () => void; } = {}) {
  const visible = () => items.filter((item) => !item.hidden?.());
  const enabled = (item: MenuItem) => !item.disabled?.();
  const left = layout.left ?? null;
  const right = layout.right ?? SCREEN_WIDTH - 24;

  const menu = {
    /** Index into the visible items. */
    index: 0,

    /** The highlighted item. */
    get current() {
      return visible()[menu.index] ?? null;
    },

    /** Put the cursor on the first enabled item. */
    reset() {
      const list = visible();
      menu.index = Math.max(0, list.findIndex(enabled));
    },

    move(direction: -1 | 1) {
      const list = visible();
      if (list.length === 0) return;
      for (let i = 1; i <= list.length; i++) {
        const next = (menu.index + direction * i + list.length * i) % list.length;
        if (enabled(list[next])) {
          if (next !== menu.index) sounds.move?.();
          menu.index = next;
          return;
        }
      }
    },

    /**
     * Rectangle of a visible row, for hit-testing and drawing.
     */
    rowRect(i: number) {
      const y = layout.top + i * layout.rowHeight - layout.rowHeight / 2;
      return { x: 0, y, w: SCREEN_WIDTH, h: layout.rowHeight };
    },

    activate(item: MenuItem) {
      if (!enabled(item)) {
        sounds.error?.();
        return;
      }
      if (item.select) {
        sounds.select?.();
        item.select();
      } else if (item.adjust) {
        sounds.move?.();
        item.adjust(1);
      }
    },

    /**
     * Handle one step of input. Returns true if the menu used it.
     */
    step(input: SceneInput) {
      const list = visible();
      if (menu.index >= list.length) menu.index = Math.max(0, list.length - 1);
      let used = false;
      for (const tap of input.taps ?? []) {
        const i = list.findIndex((_, n) => {
          const r = menu.rowRect(n);
          return tap.y >= r.y && tap.y < r.y + r.h;
        });
        if (i === -1) continue;
        used = true;
        const item = list[i];
        menu.index = i;
        // Tapping either end of a value row nudges the value; elsewhere picks the row.
        if (item.adjust && enabled(item) && tap.x >= SCREEN_WIDTH / 2) {
          sounds.move?.();
          item.adjust(tap.x < (SCREEN_WIDTH / 2 + right) / 2 ? -1 : 1);
        } else {
          menu.activate(item);
        }
      }
      if (wasPressed(input, 'UP')) {
        menu.move(-1);
        used = true;
      }
      if (wasPressed(input, 'DOWN')) {
        menu.move(1);
        used = true;
      }
      const item = menu.current;
      if (item && item.adjust && enabled(item)) {
        if (wasPressed(input, 'LEFT')) {
          sounds.move?.();
          item.adjust(-1);
          used = true;
        }
        if (wasPressed(input, 'RIGHT')) {
          sounds.move?.();
          item.adjust(1);
          used = true;
        }
      }
      if (item && (wasPressed(input, 'START') || wasPressed(input, 'ACTION'))) {
        menu.activate(item);
        used = true;
      }
      return used;
    },

    render(ctx: CanvasRenderingContext2D) {
      visible().forEach((item, i) => {
        const y = layout.top + i * layout.rowHeight;
        const selected = i === menu.index;
        const color = !enabled(item) ? PALETTE.disabled : selected ? PALETTE.highlight : PALETTE.text;
        const label = text(item.label);
        const value = text(item.value);
        if (selected) {
          const r = menu.rowRect(i);
          ctx.fillStyle = PALETTE.panel;
          ctx.fillRect(8, Math.round(r.y + 1), SCREEN_WIDTH - 16, r.h - 2);
        }
        if (left === null && !value) {
          // Centred label, with the cursor shape as well as colour marking the selection.
          drawText(ctx, selected ? `▶ ${label} ◀` : label, SCREEN_WIDTH / 2, y, { color });
        } else {
          const x = left ?? 24;
          drawText(ctx, selected ? `▶ ${label}` : `  ${label}`, x, y, { color, align: 'left' });
          if (value) {
            const shown = item.adjust && enabled(item) ? `◀ ${value} ▶` : value;
            drawText(ctx, shown, right, y, { color, align: 'right' });
          }
        }
      });
    },
  };
  menu.reset();
  return menu;
}

export type Menu = ReturnType<typeof createMenu>;
