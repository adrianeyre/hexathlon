/**
 * Gamepad input. The Gamepad API has no events for buttons, so pads are polled
 * once per fixed step and button changes become the same normalised action
 * edges the keyboard produces.
 *
 * The first connected pad plays as player 1 and the second as player 2. Both
 * use the same remappable button layout. The d-pad and left stick always
 * navigate menus.
 */

export type Action = import('./sim/types.ts').Action;
export type InputQueue = import('./input.ts').InputQueue;

export type PadAction = 'RUN_A' | 'RUN_B' | 'ACTION' | 'PAUSE' | 'START';

/**
 * Button indices per action, using the W3C "standard" mapping
 * (https://w3c.github.io/gamepad/#remapping).
 */
export type PadBindings = Record<PadAction, number[]>;

/**
 * Defaults for the standard mapping: the bottom and right face buttons (or the
 * shoulder buttons) to run, the left face button or right trigger for the
 * action, Back/Select to pause and Start to start.
 */
export const DEFAULT_PAD_BINDINGS: Readonly<PadBindings> = Object.freeze({
  RUN_A: [0, 4],
  RUN_B: [1, 5],
  ACTION: [2, 7],
  PAUSE: [8],
  START: [9],
});

/** Remappable pad actions, in the order the remap screen lists them. */
export const PAD_ACTIONS = (Object.freeze(['RUN_A', 'RUN_B', 'ACTION', 'PAUSE', 'START']) as readonly PadAction[]);

/** D-pad buttons in the standard mapping. Reserved for menu navigation. */
export const DPAD = Object.freeze({ UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 });

export const RESERVED_BUTTONS: ReadonlySet<number> = new Set(Object.values(DPAD));

/** Highest button index accepted in stored bindings. */
const MAX_BUTTON = 31;

/** A button counts as held above this value (analogue triggers report 0 to 1). */
export const BUTTON_THRESHOLD = 0.5;
/** Stick deflection that counts as a direction press. */
export const AXIS_PRESS = 0.6;
/** Stick deflection below which a direction counts as released (hysteresis). */
export const AXIS_RELEASE = 0.4;

/** The parts of a Gamepad the poller reads. */
export interface PadLike {
  index: number;
  connected: boolean;
  mapping?: string;
  buttons: readonly { pressed: boolean, value: number }[];
  axes: readonly number[];
}

/** A raw pad button change, for the remap and key test screens. */
export interface RawPadButton {
  player: 1 | 2;
  button: number;
  type: 'press' | 'release';
}

export type TimedRawPadButton = RawPadButton & { time: number };

export function clonePadBindings(bindings: PadBindings): PadBindings {
  return {
    RUN_A: [...bindings.RUN_A],
    RUN_B: [...bindings.RUN_B],
    ACTION: [...bindings.ACTION],
    PAUSE: [...bindings.PAUSE],
    START: [...bindings.START],
  };
}

export type PadRemapResult = { ok: true, bindings: PadBindings } | { ok: false, reason: 'reserved' } | { ok: false, reason: 'conflict', action: PadAction };

/**
 * Bind one button to an action, replacing what it had. Refuses the d-pad and
 * buttons already bound to another action.
 */
export function remapPadButton(bindings: PadBindings, action: PadAction, button: number): PadRemapResult {
  if (RESERVED_BUTTONS.has(button)) return { ok: false, reason: 'reserved' };
  const owner = PAD_ACTIONS.find((a) => a !== action && bindings[a].includes(button));
  if (owner) return { ok: false, reason: 'conflict', action: owner };
  const next = clonePadBindings(bindings);
  next[action] = [button];
  return { ok: true, bindings: next };
}

/**
 * Validate stored pad bindings, falling back to the defaults when anything is
 * malformed or conflicting.
 */
export function sanitizePadBindings(value: unknown): PadBindings {
  const fallback = clonePadBindings(DEFAULT_PAD_BINDINGS);
  if (typeof value !== 'object' || value === null) return fallback;
  const v = (value as Record<string, unknown>);
  const next = clonePadBindings(DEFAULT_PAD_BINDINGS);
  for (const action of PAD_ACTIONS) {
    const raw = v[action];
    if (
      Array.isArray(raw) &&
      raw.length > 0 &&
      raw.every((b) => Number.isInteger(b) && b >= 0 && b <= MAX_BUTTON && !RESERVED_BUTTONS.has(b))
    ) {
      next[action] = [...raw];
    }
  }
  const all = PAD_ACTIONS.flatMap((a) => next[a]);
  return new Set(all).size === all.length ? next : fallback;
}

/**
 * Pad poller logic, independent of `navigator` so it can be unit-tested.
 */
export function createGamepadPoller(queue: InputQueue, bindings: PadBindings = DEFAULT_PAD_BINDINGS, rawQueue?: import('./input.ts').TimedQueue<TimedRawPadButton>) {
  let actionsByButton: Map<number, Action[]> = buttonMap(bindings);
  /**
   * Per pad index: which buttons and stick directions were held last poll.
   */
  const pads: Map<number, { player: 1 | 2; buttons: Set<number>; dirs: Set<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>; }> = new Map();

  const emit = (player: 1 | 2, action: Action, type: 'press' | 'release', time: number) => queue.push({ player, action, type, time });

  const actionsFor = (button: number): Action[] => {
    const dir = (Object.entries(DPAD) as [Action, number][]).find(([, b]) => b === button);
    return dir ? [dir[0]] : (actionsByButton.get(button) ?? []);
  };

  const releasePad = (index: number, time: number) => {
    const pad = pads.get(index);
    if (!pad) return;
    for (const button of pad.buttons) {
      for (const action of actionsFor(button)) emit(pad.player, action, 'release', time);
      rawQueue?.push({ player: pad.player, button, type: 'release', time });
    }
    for (const dir of pad.dirs) emit(pad.player, dir, 'release', time);
    pads.delete(index);
  };

  return {
    /**
     * Switch to new bindings, releasing every held button first.
     * @param [time]  When the release happens; now by default.
     */
    setBindings(next: PadBindings, time: number = performance.now()) {
      for (const index of [...pads.keys()]) {
        const pad = pads.get(index);
        releasePad(index, time);
        // Keep the slot so the player assignment doesn't change.
        if (pad) pads.set(index, { player: pad.player, buttons: new Set(), dirs: new Set() });
      }
      actionsByButton = buttonMap(next);
    },

    /**
     * Read every pad and queue the changes since the last poll.
     * @param gamepads  As returned by `navigator.getGamepads()`.
     * @param time  Timestamp to give the edges.
     */
    poll(gamepads: readonly (PadLike | null)[], time: number) {
      const connected = gamepads.filter(
        (p): p is PadLike => p !== null && p !== undefined && p.connected,
      );
      // Pads that went away release whatever they were holding.
      for (const index of [...pads.keys()]) {
        if (!connected.some((p) => p.index === index)) releasePad(index, time);
      }
      for (const gp of connected) {
        let pad = pads.get(gp.index);
        if (!pad) {
          const taken = new Set([...pads.values()].map((p) => p.player));
          const player = !taken.has(1) ? 1 : !taken.has(2) ? 2 : null;
          if (player === null) continue; // Only two players.
          pad = { player, buttons: new Set(), dirs: new Set() };
          pads.set(gp.index, pad);
        }
        gp.buttons.forEach((b, button) => {
          const down = b.pressed || b.value > BUTTON_THRESHOLD;
          const was = (pad as NonNullable<typeof pad>).buttons.has(button);
          if (down === was) return;
          const p = (pad as NonNullable<typeof pad>);
          const type = down ? 'press' : 'release';
          if (down) p.buttons.add(button);
          else p.buttons.delete(button);
          rawQueue?.push({ player: p.player, button, type, time });
          for (const action of actionsFor(button)) emit(p.player, action, type, time);
        });
        const [x = 0, y = 0] = gp.axes;
        const dirs: ['UP' | 'DOWN' | 'LEFT' | 'RIGHT', number][] = [
          ['UP', -y],
          ['DOWN', y],
          ['LEFT', -x],
          ['RIGHT', x],
        ];
        for (const [dir, amount] of dirs) {
          const was = pad.dirs.has(dir);
          if (!was && amount > AXIS_PRESS) {
            pad.dirs.add(dir);
            emit(pad.player, dir, 'press', time);
          } else if (was && amount < AXIS_RELEASE) {
            pad.dirs.delete(dir);
            emit(pad.player, dir, 'release', time);
          }
        }
      }
    },

    /** Player number per connected pad index. */
    get players() {
      return new Map([...pads].map(([index, pad]) => [index, pad.player]));
    },
  };
}

function buttonMap(bindings: PadBindings): Map<number, Action[]> {
  const map: Map<number, Action[]> = new Map();
  for (const action of PAD_ACTIONS) {
    for (const button of bindings[action]) map.set(button, [...(map.get(button) ?? []), action]);
  }
  return map;
}

export type GamepadPoller = ReturnType<typeof createGamepadPoller>;
