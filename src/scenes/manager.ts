/**
 * Minimal scene system. One scene is active at a time; each has enter, exit,
 * step and render hooks. Scene changes requested during a step take effect
 * after that step, so a scene never runs after its own exit.
 */

export type FrameInput = import('../sim/types.ts').FrameInput;
export type Action = import('../sim/types.ts').Action;
export type PlayerId = import('../sim/types.ts').PlayerId;

/** A tap or click on the screen, in internal pixels. */
export interface Tap {
  x: number;
  y: number;
}

/**
 * What a scene receives each fixed step: the normalised action edges an
 * Event sim gets, plus raw devices for menus and the controls screens.
 */
export type SceneInput = FrameInput & {
  taps?: Tap[],
  keys?: import('../input.ts').RawKey[],
  pads?: import('../gamepad.ts').RawPadButton[],
};

export interface Scene {
  /** Called when the scene becomes active. */
  enter?: (params: Record<string, unknown>) => void;
  /** Called when another scene replaces it. */
  exit?: () => void;
  /** The page was hidden (tab switched, app backgrounded). */
  suspend?: () => void;
  /** One fixed 60 Hz step. */
  step: (input: SceneInput) => void;
  /** Draw, once per display frame. */
  render: (ctx: CanvasRenderingContext2D, alpha: number) => void;
}

/** The part of the manager scenes use. */
export type SceneChanger = { change: (name: string, params?: Record<string, unknown>) => void };

export class SceneManager {
  scenes: Record<string, Scene>;
  currentName: string | null = null;
  current: Scene | null = null;
  pending: { name: string; params: Record<string, unknown> } | null = null;
  stepping = false;
  listeners: ((name: string) => void)[] = [];

  constructor(scenes: Record<string, Scene>) {
    this.scenes = scenes;
  }

  /**
   * Be told each time a scene becomes active (after the old one's exit).
   */
  onChange(listener: (name: string) => void) {
    this.listeners.push(listener);
  }

  /**
   * Switch to another scene. Inside a step the switch happens once the step ends.
   */
  change(name: string, params: Record<string, unknown> = {}) {
    if (!(name in this.scenes)) throw new Error(`Unknown scene: ${name}`);
    this.pending = { name, params };
    if (!this.stepping) this.applyPending();
  }

  private applyPending() {
    while (this.pending) {
      const { name, params } = this.pending;
      this.pending = null;
      this.current?.exit?.();
      this.currentName = name;
      this.current = this.scenes[name];
      for (const listener of this.listeners) listener(name);
      this.current.enter?.(params);
    }
  }

  step(input: SceneInput) {
    if (!this.current) return;
    this.stepping = true;
    try {
      this.current.step(input);
    } finally {
      this.stepping = false;
    }
    this.applyPending();
  }

  /** Tell the current scene the page was hidden, so it can pause. */
  suspend() {
    this.current?.suspend?.();
  }

  render(ctx: CanvasRenderingContext2D, alpha: number) {
    this.current?.render(ctx, alpha);
  }
}

/**
 * True if `action` was pressed this step (by `player`, or by anyone if omitted).
 */
export function wasPressed(input: FrameInput, action: Action, player?: PlayerId) {
  return input.edges.some(
    (e) => e.type === 'press' && e.action === action && (player === undefined || e.player === player),
  );
}

/**
 * True if anything at all was pressed or tapped this step.
 */
export function anyPress(input: SceneInput) {
  return (
    input.edges.some((e) => e.type === 'press') ||
    (input.taps?.length ?? 0) > 0 ||
    (input.keys ?? []).some((k) => k.type === 'press') ||
    (input.pads ?? []).some((p) => p.type === 'press')
  );
}

/**
 * The first tap inside a rectangle this step, if any.
 */
export function tapIn(input: SceneInput, rect: { x: number; y: number; w: number; h: number; }): Tap | null {
  return (
    (input.taps ?? []).find((t) => t.x >= rect.x && t.x < rect.x + rect.w && t.y >= rect.y && t.y < rect.y + rect.h) ??
    null
  );
}
