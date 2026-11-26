import { DEFAULT_PAD_BINDINGS, PAD_ACTIONS, clonePadBindings, remapPadButton } from '../gamepad.ts';
import { DEFAULT_KEY_BINDINGS, REMAPPABLE_SLOTS, cloneKeyBindings, keyLabel, remapKey, slotCodes } from '../input.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { wasPressed } from './manager.ts';
import { createMenu } from './menu.ts';

export type BindingSlot = import('../input.ts').BindingSlot;
export type PadAction = import('../gamepad.ts').PadAction;

/** Frames to wait for a key or button before giving up on a remap. */
export const CAPTURE_TIMEOUT = 8 * 60;

const actionName = (action: string) => action.replace('_', ' ');

/**
 * On-screen name of a keyboard slot, e.g. "P1 RUN A" or "PAUSE".
 */
export function slotName(slot: BindingSlot) {
  if (slot.group === 'shared') return actionName(slot.action);
  return `${slot.group === 'player1' ? 'P1' : 'P2'} ${actionName(slot.action)}`;
}

/**
 * Remap screen: every keyboard action for both players, Pause and Start, and
 * the gamepad layout (shared by both pads). Pick a row, then press the new key
 * or button. A key already used by another action, or reserved for the menus
 * (arrows, Enter, Escape), is refused with a message, so bindings never
 * conflict. Changes are saved and applied immediately.
 */
export function createControlsScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene & { readonly capturing: string | null; readonly message: string; } {
  let capture: { kind: 'key'; slot: BindingSlot; } | { kind: 'pad'; action: PadAction; } | null = null;
  let captureFrames = 0;
  let message = '';

  const beginKey = (slot: BindingSlot) => {
    capture = { kind: 'key', slot };
    captureFrames = 0;
    message = `PRESS A KEY FOR ${slotName(slot)}`;
  };

  const beginPad = (action: PadAction) => {
    capture = { kind: 'pad', action };
    captureFrames = 0;
    message = `PRESS A PAD BUTTON FOR ${actionName(action)}`;
  };

  const menu = createMenu(
    [
      ...REMAPPABLE_SLOTS.map((slot) => ({
        label: slotName(slot),
        value: () => slotCodes(services.controls.get().keys, slot).map(keyLabel).join(' '),
        select: () => beginKey(slot),
      })),
      ...PAD_ACTIONS.map((action) => ({
        label: `PAD ${actionName(action)}`,
        value: () => services.controls.get().pads[action].map((b) => `B${b}`).join(' '),
        select: () => beginPad(action),
      })),
      {
        label: 'RESET TO DEFAULTS',
        select: () => {
          services.controls.set({ keys: cloneKeyBindings(DEFAULT_KEY_BINDINGS), pads: clonePadBindings(DEFAULT_PAD_BINDINGS) });
          message = 'DEFAULTS RESTORED';
        },
      },
      { label: 'BACK', select: () => manager.change('settings') },
    ],
    { top: 30, rowHeight: 12, left: 16, right: SCREEN_WIDTH - 16 },
    services.sounds,
  );

  const stepCapture = (input: import('./manager.ts').SceneInput) => {
    if (!capture) return;
    captureFrames += 1;
    const cancel =
      captureFrames > CAPTURE_TIMEOUT ||
      (input.taps?.length ?? 0) > 0 ||
      (input.keys ?? []).some((k) => k.type === 'press' && k.code === 'Escape');
    if (cancel) {
      capture = null;
      message = 'CANCELLED';
      return;
    }
    const controls = services.controls.get();
    if (capture.kind === 'key') {
      const key = (input.keys ?? []).find((k) => k.type === 'press');
      if (!key) return;
      const { slot } = capture;
      const result = remapKey(controls.keys, slot, key.code);
      if (result.ok) {
        services.controls.set({ ...controls, keys: result.bindings });
        services.sounds.select();
        message = `${slotName(slot)} = ${keyLabel(key.code)}`;
        capture = null;
      } else {
        services.sounds.error();
        message =
          result.reason === 'reserved'
            ? `${keyLabel(key.code)} IS KEPT FOR THE MENUS`
            : `${keyLabel(key.code)} IS USED BY ${slotName(result.slot)}`;
      }
    } else {
      const press = (input.pads ?? []).find((p) => p.type === 'press');
      if (!press) return;
      const { action } = capture;
      const result = remapPadButton(controls.pads, action, press.button);
      if (result.ok) {
        services.controls.set({ ...controls, pads: result.bindings });
        services.sounds.select();
        message = `PAD ${actionName(action)} = B${press.button}`;
        capture = null;
      } else {
        services.sounds.error();
        message =
          result.reason === 'reserved'
            ? 'THE D-PAD IS KEPT FOR THE MENUS'
            : `B${press.button} IS USED BY PAD ${actionName(result.action)}`;
      }
    }
  };

  return {
    get capturing() {
      if (!capture) return null;
      return capture.kind === 'key' ? slotName(capture.slot) : `PAD ${actionName(capture.action)}`;
    },
    get message() {
      return message;
    },

    enter() {
      capture = null;
      message = '';
      menu.reset();
    },

    step(input) {
      if (capture) {
        stepCapture(input);
        return;
      }
      // The press that opens a capture must not be captured itself, so
      // capture starts with the next step's input.
      if (menu.step(input)) return;
      if (wasPressed(input, 'PAUSE')) manager.change('settings');
    },

    render(ctx) {
      ctx.fillStyle = PALETTE.background;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      drawText(ctx, 'CONTROLS', SCREEN_WIDTH / 2, 12, { color: PALETTE.highlight });
      menu.render(ctx);
      if (message) drawText(ctx, message, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 24, { color: capture ? PALETTE.highlight : PALETTE.accent });
      drawText(ctx, capture ? 'ESC OR TAP TO CANCEL' : 'ENTER TO CHANGE   ESC BACK', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 10, {
        color: PALETTE.dim,
      });
    },
  };
}
