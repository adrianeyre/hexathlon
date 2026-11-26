import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_KEY_BINDINGS,
  InputQueue,
  REMAPPABLE_SLOTS,
  TimedQueue,
  bindingMap,
  FULLSCREEN_KEY_OFF_IN,
  createKeyboardHandler,
  isFullscreenShortcut,
  keyLabel,
  remapKey,
  sanitizeKeyBindings,
} from '../src/input.ts';
import { FRAME_MS, FixedStepClock } from '../src/loop.ts';

const key = (code: string, timeStamp: number, repeat: boolean = false) => ({ code, timeStamp, repeat });

describe('default key bindings', () => {
  it('match the PRD layout', () => {
    const map = bindingMap(DEFAULT_KEY_BINDINGS);
    assert.deepEqual(map.get('KeyZ'), { player: 1, action: 'RUN_A' });
    assert.deepEqual(map.get('KeyX'), { player: 1, action: 'RUN_B' });
    assert.deepEqual(map.get('KeyC'), { player: 1, action: 'ACTION' });
    assert.deepEqual(map.get('Comma'), { player: 2, action: 'RUN_A' });
    assert.deepEqual(map.get('Period'), { player: 2, action: 'RUN_B' });
    assert.deepEqual(map.get('Slash'), { player: 2, action: 'ACTION' });
    assert.deepEqual(map.get('Escape'), { player: 0, action: 'PAUSE' });
    assert.deepEqual(map.get('KeyP'), { player: 0, action: 'PAUSE' });
  });

  it('come from a replaceable config object', () => {
    const queue = new InputQueue();
    const handler = createKeyboardHandler(queue, {
      ...DEFAULT_KEY_BINDINGS,
      player1: { RUN_A: ['KeyA'], RUN_B: ['KeyS'], ACTION: ['KeyD'] },
    });
    handler.keydown(key('KeyZ', 1));
    handler.keydown(key('KeyA', 2));
    assert.deepEqual(queue.drain(10), [{ player: 1, action: 'RUN_A', type: 'press' }]);
  });
});

describe('keyboard handler', () => {
  it('ignores auto-repeat', () => {
    const queue = new InputQueue();
    const handler = createKeyboardHandler(queue);
    handler.keydown(key('KeyZ', 1));
    handler.keydown(key('KeyZ', 30, true));
    handler.keydown(key('KeyZ', 60, true));
    handler.keyup(key('KeyZ', 90));
    assert.deepEqual(queue.drain(100), [
      { player: 1, action: 'RUN_A', type: 'press' },
      { player: 1, action: 'RUN_A', type: 'release' },
    ]);
  });

  it('ignores unbound keys and shortcuts with modifiers', () => {
    const queue = new InputQueue();
    const handler = createKeyboardHandler(queue);
    handler.keydown(key('KeyQ', 1));
    handler.keydown({ ...key('KeyZ', 2), metaKey: true });
    assert.equal(queue.size, 0);
  });

  it('prevents the browser default for bound keys', () => {
    const queue = new InputQueue();
    const handler = createKeyboardHandler(queue);
    let prevented = 0;
    handler.keydown({ ...key('Slash', 1), preventDefault: () => prevented++ });
    handler.keydown({ ...key('KeyQ', 1), preventDefault: () => prevented++ });
    assert.equal(prevented, 1);
  });

  it('releases held keys when focus is lost', () => {
    const queue = new InputQueue();
    const handler = createKeyboardHandler(queue);
    handler.keydown(key('KeyC', 1));
    handler.keydown(key('Comma', 2));
    handler.releaseAll(50);
    handler.keyup(key('KeyC', 60)); // the late keyup is not double-counted
    const edges = queue.drain(100);
    assert.equal(edges.filter((e) => e.type === 'release').length, 2);
  });
});

describe('InputQueue', () => {
  it('hands each edge to the step it falls in', () => {
    const queue = new InputQueue();
    queue.push({ player: 1, action: 'RUN_A', type: 'press', time: 5 });
    queue.push({ player: 1, action: 'RUN_B', type: 'press', time: 20 });
    assert.equal(queue.drain(FRAME_MS).length, 1);
    assert.equal(queue.drain(FRAME_MS * 2).length, 1);
    assert.equal(queue.size, 0);
  });

  it('keeps edges in time order if one arrives late', () => {
    const queue = new InputQueue();
    queue.push({ player: 1, action: 'RUN_B', type: 'press', time: 10 });
    queue.push({ player: 1, action: 'RUN_A', type: 'press', time: 5 });
    assert.deepEqual(
      queue.drain(100).map((e) => e.action),
      ['RUN_A', 'RUN_B'],
    );
  });

  for (const rate of [12, 15, 20, 30]) {
    it(`never drops presses at ${rate} presses per second`, () => {
      const queue = new InputQueue();
      const handler = createKeyboardHandler(queue);
      const clock = new FixedStepClock(0);
      const interval = 1000 / rate;
      const seconds = 5;
      const total = rate * seconds;
      const pressFrames: number[] = [];
      let nextPress = 3;
      let pressed = 0;
      let codeIndex = 0;
      // Render at an uneven ~50 Hz while keys arrive between frames.
      for (let now = 0; now <= seconds * 1000 + 100; now += 19.3) {
        while (pressed < total && nextPress <= now) {
          const code = codeIndex++ % 2 === 0 ? 'KeyZ' : 'KeyX';
          handler.keydown(key(code, nextPress));
          handler.keyup(key(code, nextPress + interval / 2));
          pressed++;
          nextPress += interval;
        }
        clock.advance(now, (frame, stepEnd) => {
          for (const edge of queue.drain(stepEnd)) if (edge.type === 'press') pressFrames.push(frame);
        });
      }
      assert.equal(pressFrames.length, total);
      // Each press lands in the frame its timestamp falls in.
      pressFrames.forEach((frame, i) => {
        assert.equal(frame, Math.floor((3 + i * interval) / FRAME_MS));
      });
    });
  }
});

describe('menu keys', () => {
  it('arrows, Enter and Escape always work and cannot be remapped away', () => {
    const map = bindingMap(DEFAULT_KEY_BINDINGS);
    assert.deepEqual(map.get('ArrowUp'), { player: 0, action: 'UP' });
    assert.deepEqual(map.get('ArrowDown'), { player: 0, action: 'DOWN' });
    assert.deepEqual(map.get('ArrowLeft'), { player: 0, action: 'LEFT' });
    assert.deepEqual(map.get('ArrowRight'), { player: 0, action: 'RIGHT' });
    assert.deepEqual(map.get('Enter'), { player: 0, action: 'START' });
    assert.deepEqual(map.get('Space'), { player: 0, action: 'START' });
  });
});

describe('remapping', () => {
  it('replaces a slot with a free key', () => {
    const result = remapKey(DEFAULT_KEY_BINDINGS, { group: 'player2', action: 'ACTION' }, 'KeyM');
    assert.ok(result.ok);
    assert.deepEqual(result.bindings.player2.ACTION, ['KeyM']);
    assert.deepEqual(DEFAULT_KEY_BINDINGS.player2.ACTION, ['Slash'], 'defaults untouched');
    assert.deepEqual(bindingMap(result.bindings).get('KeyM'), { player: 2, action: 'ACTION' });
    assert.equal(bindingMap(result.bindings).get('Slash'), undefined);
  });

  it('refuses a key bound to another action', () => {
    const result = remapKey(DEFAULT_KEY_BINDINGS, { group: 'player1', action: 'RUN_A' }, 'Comma');
    assert.deepEqual(result, { ok: false, reason: 'conflict', slot: { group: 'player2', action: 'RUN_A' } });
  });

  it('refuses the reserved menu keys', () => {
    for (const code of ['ArrowUp', 'Enter', 'Escape']) {
      assert.deepEqual(remapKey(DEFAULT_KEY_BINDINGS, { group: 'shared', action: 'PAUSE' }, code), {
        ok: false,
        reason: 'reserved',
      });
    }
  });

  it('allows rebinding a slot to the key it already has', () => {
    assert.ok(remapKey(DEFAULT_KEY_BINDINGS, { group: 'player1', action: 'RUN_A' }, 'KeyZ').ok);
  });

  it('covers every action for both players', () => {
    assert.equal(REMAPPABLE_SLOTS.length, 8);
  });

  it('sanitises stored bindings slot by slot', () => {
    const next = sanitizeKeyBindings({ player1: { RUN_A: ['KeyQ'], RUN_B: 'x', ACTION: [42] } });
    assert.deepEqual(next.player1, { RUN_A: ['KeyQ'], RUN_B: ['KeyX'], ACTION: ['KeyC'] });
    assert.deepEqual(sanitizeKeyBindings(null), DEFAULT_KEY_BINDINGS);
  });

  it('labels keys for the screen', () => {
    assert.equal(keyLabel('KeyZ'), 'Z');
    assert.equal(keyLabel('Digit4'), '4');
    assert.equal(keyLabel('Comma'), ',');
    assert.equal(keyLabel('Space'), 'SPACE');
    assert.equal(keyLabel('Numpad7'), 'NUM7');
    assert.equal(keyLabel('IntlBackslash'), 'INTLBACK');
  });

  it('applies new bindings to a live handler, releasing held keys', () => {
    const queue = new InputQueue();
    const handler = createKeyboardHandler(queue);
    handler.keydown(key('KeyZ', 1));
    const result = remapKey(DEFAULT_KEY_BINDINGS, { group: 'player1', action: 'RUN_A' }, 'KeyQ');
    assert.ok(result.ok);
    handler.setBindings(result.bindings, 1.5);
    handler.keydown(key('KeyQ', 2));
    handler.keydown(key('KeyZ', 3));
    const edges = queue.drain(Infinity);
    assert.deepEqual(
      edges.map((e) => `${e.action}:${e.type}`),
      ['RUN_A:press', 'RUN_A:release', 'RUN_A:press'],
    );
  });
});

describe('raw keys', () => {
  it('reports every key, bound or not, without auto-repeat', () => {
    const queue = new InputQueue();
    const raw: TimedQueue<import('../src/input.ts').TimedRawKey> = new TimedQueue();
    const handler = createKeyboardHandler(queue, DEFAULT_KEY_BINDINGS, raw);
    handler.keydown(key('KeyQ', 1));
    handler.keydown(key('KeyQ', 2, true));
    handler.keydown(key('KeyZ', 3));
    handler.keyup(key('KeyQ', 4));
    handler.releaseAll(5);
    assert.deepEqual(
      raw.take(10).map((k) => `${k.code}:${k.type}`),
      ['KeyQ:press', 'KeyZ:press', 'KeyQ:release', 'KeyZ:release'],
    );
    assert.equal(queue.drain(10).length, 2, 'only Z is an action');
  });
});

describe('F toggles full screen', () => {
  const f = { code: 'KeyF', repeat: false };

  it('on the title, the menus and during an Event, with the default keys', () => {
    for (const scene of ['title', 'menu', 'settings', 'event', 'results', 'highScores', 'attract']) {
      assert.equal(isFullscreenShortcut(f, scene, DEFAULT_KEY_BINDINGS), true, scene);
    }
  });

  it('not for other keys, auto-repeat or with a modifier (browser shortcuts stay theirs)', () => {
    assert.equal(isFullscreenShortcut({ code: 'KeyG', repeat: false }, 'menu', DEFAULT_KEY_BINDINGS), false);
    assert.equal(isFullscreenShortcut({ ...f, repeat: true }, 'menu', DEFAULT_KEY_BINDINGS), false);
    for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
      assert.equal(isFullscreenShortcut({ ...f, [mod]: true }, 'menu', DEFAULT_KEY_BINDINGS), false, mod);
    }
  });

  it('not while typing initials, choosing a key to remap, or testing keys', () => {
    for (const scene of FULLSCREEN_KEY_OFF_IN) assert.equal(isFullscreenShortcut(f, scene, DEFAULT_KEY_BINDINGS), false, scene);
    assert.deepEqual([...FULLSCREEN_KEY_OFF_IN].sort(), ['controls', 'initials', 'keyTest']);
  });

  it('not once F is remapped to a game control', () => {
    const result = remapKey(DEFAULT_KEY_BINDINGS, { group: 'player1', action: 'ACTION' }, 'KeyF');
    assert.ok(result.ok);
    assert.equal(isFullscreenShortcut(f, 'event', result.bindings), false);
  });
});
