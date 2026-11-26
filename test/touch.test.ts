import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InputQueue } from '../src/input.ts';
import { MIN_TARGET, TOUCH_BUTTONS, buttonAt, createTouchHandler, touchLayout } from '../src/touch.ts';

/** Phones and tablets in both orientations, down to the narrowest the PRD supports. */
const VIEWPORTS = [
  [320, 568],
  [360, 640],
  [390, 844],
  [640, 360],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1920, 1080],
];

const overlaps = (a: { x: number; y: number; w: number; h: number; }, b: { x: number; y: number; w: number; h: number; }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('touch layout', () => {
  for (const mode of (['event', 'menu'] as const)) {
    for (const [width, height] of VIEWPORTS) {
      it(`${mode} buttons at ${width}x${height} are at least 64px, on screen and apart`, () => {
        const buttons = touchLayout(mode, width, height);
        assert.equal(buttons.length, TOUCH_BUTTONS[mode].length);
        for (const b of buttons) {
          assert.ok(b.w >= MIN_TARGET && b.h >= MIN_TARGET, `${b.id} is ${b.w}x${b.h}`);
          assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= width && b.y + b.h <= height, `${b.id} is on screen`);
        }
        for (const a of buttons) for (const b of buttons) if (a !== b) assert.ok(!overlaps(a, b), `${a.id} and ${b.id}`);
      });
    }
  }

  it('puts the run buttons on the left and action on the right', () => {
    const [runA, runB, action] = touchLayout('event', 390, 844);
    assert.equal(runA.action, 'RUN_A');
    assert.equal(runB.action, 'RUN_B');
    assert.equal(action.action, 'ACTION');
    assert.ok(runA.x < runB.x && runB.x < action.x);
  });

  it('drives player 1 in Events and the shared menu actions elsewhere', () => {
    for (const b of TOUCH_BUTTONS.event) assert.equal(b.player, b.action === 'PAUSE' ? 0 : 1);
    for (const b of TOUCH_BUTTONS.menu) assert.equal(b.player, 0);
    assert.deepEqual(
      TOUCH_BUTTONS.menu.map((b) => b.action).sort(),
      ['DOWN', 'LEFT', 'PAUSE', 'RIGHT', 'START', 'UP'],
    );
  });

  it('finds the button under a point', () => {
    const buttons = touchLayout('event', 360, 640);
    const [runA] = buttons;
    assert.equal(buttonAt(buttons, runA.x + 1, runA.y + 1)?.id, 'run-a');
    assert.equal(buttonAt(buttons, 180, 300), null);
  });
});

describe('touch pointers', () => {
  const setup = () => {
    const queue = new InputQueue();
    const buttons = touchLayout('event', 360, 640);
    const changes: string[] = [];
    const handler = createTouchHandler(queue, () => buttons, (id, held) => changes.push(`${id}:${held}`));
    const centre = (id: string) => {
      const b = (buttons.find((x) => x.id === id) as import('../src/touch.ts').TouchButton);
      return ([b.x + b.w / 2, b.y + b.h / 2] as const);
    };
    const drain = () => queue.drain(Infinity).map((e) => `${e.type} ${e.action}`);
    return { handler, centre, drain, changes };
  };

  it('hold both run buttons and action together, one finger each', () => {
    const { handler, centre, drain } = setup();
    handler.down(1, ...centre('run-a'), 1);
    handler.down(2, ...centre('run-b'), 2);
    handler.down(3, ...centre('action'), 3);
    assert.deepEqual(drain(), ['press RUN_A', 'press RUN_B', 'press ACTION']);
    assert.deepEqual(handler.held.sort(), ['action', 'run-a', 'run-b']);
    handler.up(3, 4);
    assert.deepEqual(drain(), ['release ACTION']);
    handler.up(1, 5);
    handler.up(2, 6);
    assert.deepEqual(drain(), ['release RUN_A', 'release RUN_B']);
  });

  it('mash with alternating taps, every tap a press and a release', () => {
    const { handler, centre, drain } = setup();
    for (let i = 0; i < 6; i++) {
      const id = i % 2 ? 'run-b' : 'run-a';
      handler.down(10 + i, ...centre(id), i * 10);
      handler.up(10 + i, i * 10 + 5);
    }
    const events = drain();
    assert.equal(events.length, 12);
    assert.deepEqual(events.slice(0, 4), ['press RUN_A', 'release RUN_A', 'press RUN_B', 'release RUN_B']);
  });

  it('slide a finger from one run button to the other', () => {
    const { handler, centre, drain } = setup();
    handler.down(1, ...centre('run-a'), 1);
    handler.move(1, ...centre('run-a'), 2);
    handler.move(1, ...centre('run-b'), 3);
    handler.move(1, 180, 300, 4);
    assert.deepEqual(drain(), ['press RUN_A', 'release RUN_A', 'press RUN_B', 'release RUN_B']);
    handler.move(1, ...centre('action'), 5);
    handler.up(1, 6);
    assert.deepEqual(drain(), ['press ACTION', 'release ACTION']);
  });

  it('keep a button held while any finger is still on it', () => {
    const { handler, centre, drain, changes } = setup();
    handler.down(1, ...centre('action'), 1);
    handler.down(2, ...centre('action'), 2);
    handler.up(1, 3);
    assert.deepEqual(drain(), ['press ACTION']);
    handler.up(2, 4);
    assert.deepEqual(drain(), ['release ACTION']);
    assert.deepEqual(changes, ['action:true', 'action:false']);
  });

  it('ignore touches that start off the buttons, and moves of unknown fingers', () => {
    const { handler, centre, drain } = setup();
    assert.equal(handler.down(1, 180, 300, 1), false);
    handler.move(1, ...centre('run-a'), 2);
    handler.move(9, ...centre('run-a'), 3);
    handler.up(1, 4);
    assert.deepEqual(drain(), []);
  });

  it('release everything when cancelled or hidden', () => {
    const { handler, centre, drain } = setup();
    handler.down(1, ...centre('run-a'), 1);
    handler.down(2, ...centre('action'), 2);
    handler.releaseAll(3);
    assert.deepEqual(drain(), ['press RUN_A', 'press ACTION', 'release RUN_A', 'release ACTION']);
    assert.deepEqual(handler.held, []);
  });

  it('stamp edges with the pointer time so the fixed step can place them', () => {
    const queue = new InputQueue();
    const buttons = touchLayout('event', 360, 640);
    const handler = createTouchHandler(queue, () => buttons);
    const [runA] = buttons;
    handler.down(1, runA.x + 1, runA.y + 1, 100);
    handler.up(1, 120);
    assert.deepEqual(queue.drain(110), [{ player: 1, action: 'RUN_A', type: 'press' }]);
    assert.deepEqual(queue.drain(130), [{ player: 1, action: 'RUN_A', type: 'release' }]);
  });
});
