/**
 * Single-player touch controls: on-screen buttons that feed the same
 * normalised actions as the keyboard (PRD 6.1, F4).
 *
 * During an Event there are two run buttons and an action button (with a
 * pause button), and every finger is tracked by its pointer id, so both run
 * buttons and action can be held together and a finger can slide from one
 * button to another. In menus the buttons become a pad (arrows, OK and back).
 *
 * The layout and the pointer tracking are plain functions of numbers, so they
 * are unit-tested in Node; `attachTouch` wires them to the DOM. Sizes are in
 * CSS pixels, never below `MIN_TARGET` (PRD 9: touch targets at least 64px).
 */

export type Action = import('./sim/types.ts').Action;
export type PlayerId = import('./sim/types.ts').PlayerId;
export type InputQueue = import('./input.ts').InputQueue;

/** Smallest touch target, in CSS pixels. */
export const MIN_TARGET = 64;
/** Largest button, so they don't swamp a tablet. */
export const MAX_TARGET = 96;
/** Space between the buttons and the edge of the screen, in CSS pixels. */
export const MARGIN = 12;
/** Space between neighbouring buttons. */
export const GAP = 8;

export type TouchMode = 'event' | 'menu';

export interface ButtonSpec {
  id: string;
  action: Action;
  player: PlayerId;
  /** Shown on the button. */
  label: string;
  /** Accessible name. */
  name: string;
}

/**
 * The buttons in each mode. Event buttons drive player 1; pause and the menu
 * pad are shared (player 0), like the fixed UI keys.
 */
export const TOUCH_BUTTONS: Readonly<Record<TouchMode, readonly ButtonSpec[]>> = Object.freeze({
  event: ([
    { id: 'run-a', action: 'RUN_A', player: 1, label: 'RUN', name: 'Run, left foot' },
    { id: 'run-b', action: 'RUN_B', player: 1, label: 'RUN', name: 'Run, right foot' },
    { id: 'action', action: 'ACTION', player: 1, label: 'ACTION', name: 'Jump or throw' },
    { id: 'pause', action: 'PAUSE', player: 0, label: 'II', name: 'Pause' },
  ] as readonly ButtonSpec[]),
  menu: ([
    { id: 'left', action: 'LEFT', player: 0, label: '◀', name: 'Left' },
    { id: 'up', action: 'UP', player: 0, label: '▲', name: 'Up' },
    { id: 'down', action: 'DOWN', player: 0, label: '▼', name: 'Down' },
    { id: 'right', action: 'RIGHT', player: 0, label: '▶', name: 'Right' },
    { id: 'back', action: 'PAUSE', player: 0, label: 'BACK', name: 'Back' },
    { id: 'ok', action: 'START', player: 0, label: 'OK', name: 'OK' },
  ] as readonly ButtonSpec[]),
});

/** A button placed on screen, in CSS pixels from the viewport's top-left. */
export type TouchButton = ButtonSpec & { x: number, y: number, w: number, h: number };

/**
 * Place the buttons for a mode inside a viewport.
 *
 * Event: the two run buttons side by side at the bottom left, action at the
 * bottom right (big, for mashing with thumbs), pause in the top right corner.
 * Menu: a row of arrows along the bottom, with Back above the left end and OK
 * above the right end.
 *
 * @param width  Viewport width in CSS pixels.
 * @param height  Viewport height in CSS pixels.
 */
export function touchLayout(mode: TouchMode, width: number, height: number): TouchButton[] {
  const specs = TOUCH_BUTTONS[mode];
  const spec = (id: string) => (specs.find((s) => s.id === id) as ButtonSpec);
  // Buttons scale with the screen, within the limits, and always fit across it.
  const across = mode === 'menu' ? 4 : 3;
  const fit = Math.floor((width - 2 * MARGIN - (across - 1) * GAP - (mode === 'event' ? GAP * 2 : 0)) / across);
  const size = Math.max(MIN_TARGET, Math.min(MAX_TARGET, Math.round(Math.min(width, height) * 0.2), fit));
  const bottom = height - MARGIN - size;

  if (mode === 'event') {
    const pause = Math.max(MIN_TARGET, Math.round(size * 0.75));
    return [
      { ...spec('run-a'), x: MARGIN, y: bottom, w: size, h: size },
      { ...spec('run-b'), x: MARGIN + size + GAP, y: bottom, w: size, h: size },
      { ...spec('action'), x: width - MARGIN - size, y: bottom, w: size, h: size },
      { ...spec('pause'), x: width - MARGIN - pause, y: MARGIN, w: pause, h: pause },
    ];
  }
  const row = ['left', 'up', 'down', 'right'].map((id, i) => ({
    ...spec(id),
    x: MARGIN + i * (size + GAP),
    y: bottom,
    w: size,
    h: size,
  }));
  const above = bottom - GAP - size;
  return [
    ...row,
    { ...spec('back'), x: MARGIN, y: above, w: size, h: size },
    { ...spec('ok'), x: width - MARGIN - size, y: above, w: size, h: size },
  ];
}

/**
 * The button under a point, if any.
 */
export function buttonAt(buttons: readonly TouchButton[], x: number, y: number): TouchButton | null {
  return buttons.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null;
}

/**
 * Pointer tracking, separated from the DOM so it can be unit-tested. Each
 * pointer id remembers the button it is on; a button is pressed when its
 * first finger arrives and released when its last one leaves, so holding a
 * button with two fingers and lifting one doesn't release it.
 *
 * @param getButtons  The buttons currently shown.
 * @param [onChange]  A button became held or free (for drawing).
 */
export function createTouchHandler(queue: InputQueue, getButtons: () => readonly TouchButton[], onChange?: (id: string, held: boolean) => void) {
  /** Button id under each tracked pointer (null: tracked but on no button). */
  const pointers: Map<number, TouchButton | null> = new Map();
  /** Fingers on each button, by button id. */
  const counts: Map<string, number> = new Map();

  const hold = (button: TouchButton, time: number) => {
    const n = (counts.get(button.id) ?? 0) + 1;
    counts.set(button.id, n);
    if (n === 1) {
      queue.push({ player: button.player, action: button.action, type: 'press', time });
      onChange?.(button.id, true);
    }
  };

  const free = (button: TouchButton, time: number) => {
    const n = (counts.get(button.id) ?? 0) - 1;
    if (n > 0) {
      counts.set(button.id, n);
      return;
    }
    counts.delete(button.id);
    queue.push({ player: button.player, action: button.action, type: 'release', time });
    onChange?.(button.id, false);
  };

  return {
    /**
     * A finger touched down. Only touches that start on a button are tracked.
     * @param id  Pointer id.
     * @returns Whether it landed on a button.
     */
    down(id: number, x: number, y: number, time: number): boolean {
      const button = buttonAt(getButtons(), x, y);
      if (!button) return false;
      const previous = pointers.get(id);
      if (previous) free(previous, time);
      pointers.set(id, button);
      hold(button, time);
      return true;
    },

    /**
     * A tracked finger moved: sliding onto another button releases the old one
     * and presses the new one.
     */
    move(id: number, x: number, y: number, time: number) {
      if (!pointers.has(id)) return;
      const current = pointers.get(id) ?? null;
      const next = buttonAt(getButtons(), x, y);
      if (next?.id === current?.id) return;
      if (current) free(current, time);
      if (next) hold(next, time);
      pointers.set(id, next);
    },

    /**
     * A finger lifted, or the browser cancelled it.
     */
    up(id: number, time: number) {
      const current = pointers.get(id);
      pointers.delete(id);
      if (current) free(current, time);
    },

    /**
     * Let go of everything: the buttons changed, or the page was hidden.
     */
    releaseAll(time: number) {
      for (const id of [...pointers.keys()]) this.up(id, time);
    },

    /** Ids of the buttons currently held. */
    get held() {
      return [...counts.keys()];
    },
  };
}

export type TouchHandler = ReturnType<typeof createTouchHandler>;

/**
 * Put touch buttons on the page and route their pointers into the queue.
 * The overlay is hidden until `show` is called with a mode.
 *
 * @param overlay  An empty, full-viewport element.
 */
export function attachTouch(queue: InputQueue, overlay: HTMLElement) {
  let mode: TouchMode | null = null;
  let buttons: TouchButton[] = [];
  const elements: Map<string, HTMLElement> = new Map();

  const handler = createTouchHandler(
    queue,
    () => buttons,
    (id, held) => elements.get(id)?.classList.toggle('held', held),
  );

  const layout = () => {
    if (!mode) return;
    const viewport = window.visualViewport;
    const width = viewport ? viewport.width : window.innerWidth;
    const height = viewport ? viewport.height : window.innerHeight;
    buttons = touchLayout(mode, width, height);
    overlay.replaceChildren();
    elements.clear();
    for (const b of buttons) {
      const el = document.createElement('div');
      el.className = `touch-button touch-${b.id}`;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', b.name);
      el.textContent = b.label;
      el.style.left = `${b.x}px`;
      el.style.top = `${b.y}px`;
      el.style.width = `${b.w}px`;
      el.style.height = `${b.h}px`;
      overlay.append(el);
      elements.set(b.id, el);
    }
  };

  const down = (e: PointerEvent) => {
    if (handler.down(e.pointerId, e.clientX, e.clientY, e.timeStamp)) {
      e.preventDefault();
      // Keep receiving this finger's moves even when it slides off the button.
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {
        /* Not supported for this pointer; moves still bubble. */
      }
    }
  };
  const move = (e: PointerEvent) => handler.move(e.pointerId, e.clientX, e.clientY, e.timeStamp);
  const up = (e: PointerEvent) => handler.up(e.pointerId, e.timeStamp);

  overlay.addEventListener('pointerdown', down);
  overlay.addEventListener('pointermove', move);
  overlay.addEventListener('pointerup', up);
  overlay.addEventListener('pointercancel', up);
  // Long presses on a button must not open a menu or select text.
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());

  const relayout = () => {
    handler.releaseAll(performance.now());
    layout();
  };
  window.addEventListener('resize', relayout);
  window.visualViewport?.addEventListener('resize', relayout);

  return {
    handler,

    /**
     * Show the buttons for a mode, or hide them with null. Changing mode lets
     * go of every held button first.
     */
    show(next: TouchMode | null) {
      if (next === mode) return;
      handler.releaseAll(performance.now());
      mode = next;
      overlay.hidden = next === null;
      if (next) layout();
      else {
        buttons = [];
        overlay.replaceChildren();
        elements.clear();
      }
    },

    get mode() {
      return mode;
    },
  };
}
