/**
 * Input layer: turns device events into normalised, timestamped actions per
 * player, queued until the fixed step they fall in consumes them.
 *
 * The keyboard is handled here; touch (`touch.js`) and gamepads (`gamepad.js`)
 * feed the same queue.
 */

export type Action = import('./sim/types.ts').Action;
export type PlayerId = import('./sim/types.ts').PlayerId;
export type InputEdge = import('./sim/types.ts').InputEdge;

export type PlayerAction = 'RUN_A' | 'RUN_B' | 'ACTION';
export type SharedAction = 'PAUSE' | 'START';

/**
 * Remappable key bindings by `KeyboardEvent.code` (layout-independent physical
 * keys). Plain data, so remapping replaces it and storage persists it.
 */
export interface KeyBindings {
  player1: Record<PlayerAction, string[]>;
  player2: Record<PlayerAction, string[]>;
  /** Keys any player can use. */
  shared: Record<SharedAction, string[]>;
}

export const DEFAULT_KEY_BINDINGS: Readonly<KeyBindings> = Object.freeze({
  player1: { RUN_A: ['KeyZ'], RUN_B: ['KeyX'], ACTION: ['KeyC'] },
  player2: { RUN_A: ['Comma'], RUN_B: ['Period'], ACTION: ['Slash'] },
  shared: { PAUSE: ['KeyP'], START: ['Space'] },
});

/**
 * Keys that always work and can't be remapped, so the menus (including the
 * remap screen itself) can never be locked out: arrows to move, Enter to pick,
 * Escape to pause or go back.
 */
export const UI_KEYS: Readonly<Record<'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'START' | 'PAUSE', readonly string[]>> = Object.freeze({
  UP: ['ArrowUp'],
  DOWN: ['ArrowDown'],
  LEFT: ['ArrowLeft'],
  RIGHT: ['ArrowRight'],
  START: ['Enter', 'NumpadEnter'],
  PAUSE: ['Escape'],
});

/** Every key code reserved by `UI_KEYS`. */
export const RESERVED_KEYS = new Set(Object.values(UI_KEYS).flat());

/** One remappable binding: an action for a player (0 for shared actions). */
export type BindingSlot = { group: 'player1' | 'player2', action: PlayerAction } | { group: 'shared', action: SharedAction };

/** Every remappable slot, in the order the remap screen lists them. */
export const REMAPPABLE_SLOTS = (Object.freeze([
    { group: 'player1', action: 'RUN_A' },
    { group: 'player1', action: 'RUN_B' },
    { group: 'player1', action: 'ACTION' },
    { group: 'player2', action: 'RUN_A' },
    { group: 'player2', action: 'RUN_B' },
    { group: 'player2', action: 'ACTION' },
    { group: 'shared', action: 'PAUSE' },
    { group: 'shared', action: 'START' },
  ]) as readonly BindingSlot[]);

export interface Binding {
  player: PlayerId;
  action: Action;
}

/**
 * Build a lookup from key code to the action it triggers, including the fixed UI keys.
 */
export function bindingMap(bindings: KeyBindings): Map<string, Binding> {
  const map: Map<string, Binding> = new Map();
  const add = (player: PlayerId, actions: Partial<Record<Action, readonly string[]>>) => {
    for (const [action, codes] of Object.entries(actions)) {
      for (const code of codes ?? []) map.set(code, { player, action: (action as Action) });
    }
  };
  add(1, bindings.player1);
  add(2, bindings.player2);
  add(0, bindings.shared);
  add(0, UI_KEYS);
  return map;
}

/**
 * Deep copy, so callers can edit bindings without touching the defaults.
 */
export function cloneKeyBindings(bindings: KeyBindings): KeyBindings {
  return {
    player1: { RUN_A: [...bindings.player1.RUN_A], RUN_B: [...bindings.player1.RUN_B], ACTION: [...bindings.player1.ACTION] },
    player2: { RUN_A: [...bindings.player2.RUN_A], RUN_B: [...bindings.player2.RUN_B], ACTION: [...bindings.player2.ACTION] },
    shared: { PAUSE: [...bindings.shared.PAUSE], START: [...bindings.shared.START] },
  };
}

/**
 * The codes bound to a slot.
 */
export function slotCodes(bindings: KeyBindings, slot: BindingSlot): string[] {
  return slot.group === 'shared' ? bindings.shared[slot.action] : bindings[slot.group][slot.action];
}

/**
 * Which slot, if any, a code is bound to.
 */
export function slotForCode(bindings: KeyBindings, code: string): BindingSlot | null {
  return REMAPPABLE_SLOTS.find((slot) => slotCodes(bindings, slot).includes(code)) ?? null;
}

/** The key that turns full screen on and off, the same as Settings → FULL SCREEN. */
export const FULLSCREEN_KEY = 'KeyF';

/**
 * Scenes where any key can mean something else, so F doesn't toggle full
 * screen there: typing initials, choosing a key on the remap screen, and the
 * key test.
 */
export const FULLSCREEN_KEY_OFF_IN: ReadonlySet<string> = new Set(['initials', 'controls', 'keyTest']);

/**
 * Whether a key press should toggle full screen: F on its own (no modifier,
 * not auto-repeat), outside the scenes above, and only while F isn't remapped
 * to a game control.
 * @param scene  The current scene's name.
 */
export function isFullscreenShortcut(event: Pick<KeyLike, 'code' | 'repeat' | 'altKey' | 'ctrlKey' | 'metaKey'> & { shiftKey?: boolean }, scene: string | null, bindings: KeyBindings): boolean {
  if (event.code !== FULLSCREEN_KEY || event.repeat) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (scene !== null && FULLSCREEN_KEY_OFF_IN.has(scene)) return false;
  return slotForCode(bindings, FULLSCREEN_KEY) === null;
}

export type RemapResult = { ok: true, bindings: KeyBindings } | { ok: false, reason: 'reserved' } | { ok: false, reason: 'conflict', slot: BindingSlot };

/**
 * Bind `code` to `slot`, replacing what the slot had. Refuses (and changes
 * nothing) when the code is a reserved UI key or already used by another slot,
 * so two actions can never share a key.
 */
export function remapKey(bindings: KeyBindings, slot: BindingSlot, code: string): RemapResult {
  if (RESERVED_KEYS.has(code)) return { ok: false, reason: 'reserved' };
  const owner = slotForCode(bindings, code);
  if (owner && (owner.group !== slot.group || owner.action !== slot.action)) {
    return { ok: false, reason: 'conflict', slot: owner };
  }
  const next = cloneKeyBindings(bindings);
  if (slot.group === 'shared') next.shared[slot.action] = [code];
  else next[slot.group][slot.action] = [code];
  return { ok: true, bindings: next };
}

const CODE = /^[A-Za-z0-9]{1,32}$/;

/**
 * Validate stored bindings. Anything malformed, reserved or conflicting falls
 * back to the defaults, slot by slot where possible.
 */
export function sanitizeKeyBindings(value: unknown): KeyBindings {
  const next = cloneKeyBindings(DEFAULT_KEY_BINDINGS);
  if (typeof value !== 'object' || value === null) return next;
  const v = (value as Record<string, Record<string, unknown>>);
  const used: Set<string> = new Set();
  for (const slot of REMAPPABLE_SLOTS) {
    const raw = v[slot.group]?.[slot.action];
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const codes = raw.filter((c) => typeof c === 'string' && CODE.test(c) && !RESERVED_KEYS.has(c));
    if (codes.length !== raw.length) continue;
    if (slot.group === 'shared') next.shared[slot.action] = codes;
    else next[slot.group][slot.action] = codes;
  }
  // If any code ends up bound twice, the stored data can't be trusted.
  for (const slot of REMAPPABLE_SLOTS) {
    for (const code of slotCodes(next, slot)) {
      if (used.has(code)) return cloneKeyBindings(DEFAULT_KEY_BINDINGS);
      used.add(code);
    }
  }
  return next;
}

/**
 * Short on-screen name for a key code, e.g. `KeyZ` → `Z`, `Comma` → `,`.
 */
export function keyLabel(code: string) {
  const named = ({
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: 'BSLASH',
    Minus: '-',
    Equal: '=',
    Backquote: 'BQUOTE',
    Space: 'SPACE',
    Enter: 'ENTER',
    NumpadEnter: 'ENTER',
    Escape: 'ESC',
    ArrowUp: '▲',
    ArrowDown: '▼',
    ArrowLeft: '◀',
    ArrowRight: '▶',
    ShiftLeft: 'LSHIFT',
    ShiftRight: 'RSHIFT',
    ControlLeft: 'LCTRL',
    ControlRight: 'RCTRL',
    AltLeft: 'LALT',
    AltRight: 'RALT',
    MetaLeft: 'LMETA',
    MetaRight: 'RMETA',
    Backspace: 'BKSP',
    CapsLock: 'CAPS',
  } as Record<string, string>);
  if (named[code]) return named[code];
  const m = /^(?:Key|Digit)(.)$/.exec(code) ?? /^Numpad(\w+)$/.exec(code);
  if (m) return code.startsWith('Numpad') ? `NUM${m[1]}`.toUpperCase().slice(0, 8) : m[1];
  return code.toUpperCase().slice(0, 8);
}

/** An input edge with the timestamp it happened at. */
export type TimedEdge = InputEdge & { time: number };

/**
 * Queue of timestamped items. Each fixed step drains the items that happened
 * before the step's end time, so every item lands in exactly one frame and
 * none are dropped, however fast they arrive.

 */
export class TimedQueue<T extends { time: number }> {
  pending: T[] = [];

  push(item: T) {
    // Events normally arrive in order; insert in place if one doesn't.
    let i = this.pending.length;
    while (i > 0 && this.pending[i - 1].time > item.time) i--;
    this.pending.splice(i, 0, item);
  }

  /**
   * Remove and return every item with `time < stepEnd`, oldest first.
   */
  take(stepEnd: number): T[] {
    let n = 0;
    while (n < this.pending.length && this.pending[n].time < stepEnd) n++;
    return this.pending.splice(0, n);
  }

  /** Drop everything queued. */
  clear() {
    this.pending.length = 0;
  }

  get size() {
    return this.pending.length;
  }
}

/**
 * Queue of timestamped presses and releases of normalised actions.
 */
export class InputQueue extends TimedQueue<TimedEdge> {
  /**
   * Remove and return every edge with `time < stepEnd`, oldest first.
   */
  drain(stepEnd: number): InputEdge[] {
    return this.take(stepEnd).map(({ player, action, type }) => ({ player, action, type }));
  }
}

/**
 * A raw key press or release by physical key code, whether bound or not. Used
 * by the remap and key test screens.
 */
export interface RawKey {
  code: string;
  type: 'press' | 'release';
}

export type TimedRawKey = RawKey & { time: number };

/** The parts of a KeyboardEvent the handler reads. */
export interface KeyLike {
  code: string;
  repeat: boolean;
  timeStamp: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault?: () => void;
}

/**
 * Keyboard handler logic, separated from the DOM so it can be unit-tested.
 *
 * @param [rawQueue]  Receives every key, bound or not.
 */
export function createKeyboardHandler(queue: InputQueue, bindings: KeyBindings = DEFAULT_KEY_BINDINGS, rawQueue?: TimedQueue<TimedRawKey>) {
  let map = bindingMap(bindings);
  /** Bound codes currently held down, so releases can be synthesised on blur. */
  const held: Map<string, Binding> = new Map();
  /** Every code currently held, bound or not. */
  const rawHeld: Set<string> = new Set();

  return {
    /**
     * Switch to new bindings, releasing every held key first.
     * @param [time]  When the release happens; now by default.
     */
    setBindings(next: KeyBindings, time: number = performance.now()) {
      this.releaseAll(time);
      map = bindingMap(next);
    },

    keydown(event: KeyLike) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!event.repeat && !rawHeld.has(event.code)) {
        rawHeld.add(event.code);
        rawQueue?.push({ code: event.code, type: 'press', time: event.timeStamp });
      }
      const binding = map.get(event.code);
      if (!binding) return;
      event.preventDefault?.();
      if (event.repeat || held.has(event.code)) return;
      held.set(event.code, binding);
      queue.push({ ...binding, type: 'press', time: event.timeStamp });
    },

    keyup(event: KeyLike) {
      if (rawHeld.delete(event.code)) rawQueue?.push({ code: event.code, type: 'release', time: event.timeStamp });
      const binding = held.get(event.code);
      if (!binding) return;
      event.preventDefault?.();
      held.delete(event.code);
      queue.push({ ...binding, type: 'release', time: event.timeStamp });
    },

    /**
     * The window lost focus: keyup events won't arrive, so release everything.
     */
    releaseAll(time: number) {
      for (const binding of held.values()) queue.push({ ...binding, type: 'release', time });
      held.clear();
      for (const code of rawHeld) rawQueue?.push({ code, type: 'release', time });
      rawHeld.clear();
    },
  };
}

export type KeyboardHandler = ReturnType<typeof createKeyboardHandler>;

/**
 * Listen to the keyboard in the browser. Returns the handler (to change
 * bindings) and a function that stops listening.
 */
export function attachKeyboard(queue: InputQueue, bindings: KeyBindings = DEFAULT_KEY_BINDINGS, rawQueue: TimedQueue<TimedRawKey>, target: Window = window) {
  const handler = createKeyboardHandler(queue, bindings, rawQueue);
  const down = (e: KeyboardEvent) => handler.keydown(e);
  const up = (e: KeyboardEvent) => handler.keyup(e);
  const blur = () => handler.releaseAll(performance.now());
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', blur);
  const detach = () => {
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
    target.removeEventListener('blur', blur);
  };
  return { handler, detach };
}
