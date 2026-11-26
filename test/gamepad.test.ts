import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_PAD_BINDINGS,
  createGamepadPoller,
  remapPadButton,
  sanitizePadBindings,
} from '../src/gamepad.ts';
import { InputQueue, TimedQueue } from '../src/input.ts';

/**
 * A pad in the standard mapping with the given buttons held.
 */
const pad = (index: number, held: number[] = [], axes: number[] = [0, 0, 0, 0]) => ({
  index,
  connected: true,
  mapping: 'standard',
  buttons: Array.from({ length: 17 }, (_, b) => ({ pressed: held.includes(b), value: held.includes(b) ? 1 : 0 })),
  axes,
});

const drain = (queue: InputQueue) => queue.drain(Infinity).map((e) => `${e.player}:${e.action}:${e.type}`);

describe('gamepad poller', () => {
  it('maps the standard layout to actions', () => {
    const queue = new InputQueue();
    const poller = createGamepadPoller(queue);
    poller.poll([pad(0, [0])], 1);
    poller.poll([pad(0, [1])], 2);
    poller.poll([pad(0, [1, 2])], 3);
    poller.poll([pad(0, [])], 4);
    assert.deepEqual(drain(queue), [
      '1:RUN_A:press',
      '1:RUN_A:release',
      '1:RUN_B:press',
      '1:ACTION:press',
      '1:RUN_B:release',
      '1:ACTION:release',
    ]);
  });

  it('emits nothing while buttons stay the same', () => {
    const queue = new InputQueue();
    const poller = createGamepadPoller(queue);
    poller.poll([pad(0, [0])], 1);
    for (let t = 2; t < 10; t++) poller.poll([pad(0, [0])], t);
    assert.equal(queue.size, 1);
  });

  it('gives two pads to two players', () => {
    const queue = new InputQueue();
    const poller = createGamepadPoller(queue);
    poller.poll([null, pad(1, [0]), pad(2, [0]), pad(3, [0])], 1);
    assert.deepEqual(drain(queue), ['1:RUN_A:press', '2:RUN_A:press']);
    assert.deepEqual([...poller.players], [
      [1, 1],
      [2, 2],
    ]);
  });

  it('keeps player numbers when a pad disconnects, releasing what it held', () => {
    const queue = new InputQueue();
    const poller = createGamepadPoller(queue);
    poller.poll([pad(0, [0]), pad(1, [])], 1);
    poller.poll([null, pad(1, [1])], 2);
    assert.deepEqual(drain(queue), ['1:RUN_A:press', '1:RUN_A:release', '2:RUN_B:press']);
    poller.poll([pad(0, [0]), pad(1, [1])], 3);
    assert.deepEqual(drain(queue), ['1:RUN_A:press'], 'the reconnected pad is player 1 again');
  });

  it('uses the d-pad and left stick for menus, with hysteresis', () => {
    const queue = new InputQueue();
    const poller = createGamepadPoller(queue);
    poller.poll([pad(0, [12])], 1);
    poller.poll([pad(0, [])], 2);
    poller.poll([pad(0, [], [0, 0.7])], 3);
    poller.poll([pad(0, [], [0, 0.5])], 4); // still held: above the release point
    poller.poll([pad(0, [], [0, 0.3])], 5);
    assert.deepEqual(drain(queue), ['1:UP:press', '1:UP:release', '1:DOWN:press', '1:DOWN:release']);
  });

  it('treats analogue triggers as buttons past half travel', () => {
    const queue = new InputQueue();
    const poller = createGamepadPoller(queue);
    const p = pad(0);
    p.buttons[7] = { pressed: false, value: 0.8 };
    poller.poll([p], 1);
    assert.deepEqual(drain(queue), ['1:ACTION:press']);
  });

  it('reports raw buttons for the remap and key test screens', () => {
    const queue = new InputQueue();
    const raw: TimedQueue<import('../src/gamepad.ts').TimedRawPadButton> = new TimedQueue();
    const poller = createGamepadPoller(queue, DEFAULT_PAD_BINDINGS, raw);
    poller.poll([pad(0, [11])], 1);
    assert.deepEqual(raw.take(10), [{ player: 1, button: 11, type: 'press', time: 1 }]);
    assert.equal(queue.size, 0, 'button 11 is unbound');
  });

  it('applies remapped buttons', () => {
    const queue = new InputQueue();
    const poller = createGamepadPoller(queue);
    const result = remapPadButton(DEFAULT_PAD_BINDINGS, 'RUN_A', 3);
    assert.ok(result.ok);
    poller.setBindings(result.bindings, 0);
    poller.poll([pad(0, [3])], 1);
    poller.poll([pad(0, [3, 0])], 2);
    assert.deepEqual(drain(queue), ['1:RUN_A:press']);
  });
});

describe('pad remapping', () => {
  it('refuses the d-pad and buttons used by another action', () => {
    assert.deepEqual(remapPadButton(DEFAULT_PAD_BINDINGS, 'ACTION', 13), { ok: false, reason: 'reserved' });
    assert.deepEqual(remapPadButton(DEFAULT_PAD_BINDINGS, 'ACTION', 0), { ok: false, reason: 'conflict', action: 'RUN_A' });
  });

  it('sanitises stored bindings', () => {
    assert.deepEqual(sanitizePadBindings({ RUN_A: [3] }).RUN_A, [3]);
    assert.deepEqual(sanitizePadBindings({ RUN_A: [99] }), DEFAULT_PAD_BINDINGS);
    assert.deepEqual(sanitizePadBindings({ RUN_A: [1] }), DEFAULT_PAD_BINDINGS, 'conflicts with RUN_B');
  });
});
