import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_KEY_BINDINGS, InputQueue, TimedQueue, createKeyboardHandler } from '../src/input.ts';
import { registerScenes } from '../src/scenes/index.ts';
import { EXIT_HOLD_FRAMES } from '../src/scenes/key-test.ts';
import { SceneManager } from '../src/scenes/manager.ts';
import { RESULTS_DELAY } from '../src/scenes/results.ts';
import { TITLE_LAYOUT, drawTitleArt } from '../src/render/title-art.ts';
import { SCREEN_WIDTH } from '../src/render/display.ts';
import { RasterCtx } from '../tools/raster.ts';
import { testServices } from './helpers/fakes.ts';

/**
 * PRD 9 accessibility checks that span scenes. Colour-blind safety is in
 * style-guide.test.js and touch target sizes in touch.test.js.
 */

/**
 * The whole game driven by the real keyboard handler and nothing else: no
 * taps, no pads, no hand-made action edges.
 */
function keyboardOnly() {
  const services = testServices();
  const manager = new SceneManager({});
  registerScenes(manager, services);
  manager.change('title');
  const queue = new InputQueue();
  const raw: TimedQueue<import('../src/input.ts').TimedRawKey> = new TimedQueue();
  const keyboard = createKeyboardHandler(queue, DEFAULT_KEY_BINDINGS, raw);
  let time = 0;
  const step = (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      time += 1000 / 60;
      manager.step({
        frame: 0,
        edges: queue.drain(time),
        keys: raw.take(time).map(({ code, type }) => ({ code, type })),
      });
    }
  };
  /** Press and release a key within one frame, then let a few frames pass. @param code */
  const tap = (code: string) => {
    keyboard.keydown({ code, repeat: false, timeStamp: time + 1 });
    keyboard.keyup({ code, repeat: false, timeStamp: time + 2 });
    step(2);
  };
  const hold = (code: string, frames: number) => {
    keyboard.keydown({ code, repeat: false, timeStamp: time + 1 });
    step(frames);
    keyboard.keyup({ code, repeat: false, timeStamp: time + 1 });
    step();
  };
  const down = (n: number) => {
    for (let i = 0; i < n; i++) tap('ArrowDown');
  };
  return { services, manager, step, tap, hold, down, scene: () => manager.currentName };
}

describe('every menu works from the keyboard alone', () => {
  it('title opens the main menu, and Escape goes back', () => {
    const g = keyboardOnly();
    g.tap('Enter');
    assert.equal(g.scene(), 'menu');
    g.tap('Escape');
    assert.equal(g.scene(), 'title');
    g.tap('Space');
    assert.equal(g.scene(), 'menu');
  });

  /** Main-menu rows in order, with the scene each opens. */
  const MAIN = [
    ['ARCADE', 'event'],
    ['PRACTICE', 'practice'],
    ['TWO PLAYER', 'event'],
    ['HIGH SCORES', 'highScores'],
    ['SETTINGS', 'settings'],
  ];
  MAIN.forEach(([label, target], i) => {
    it(`main menu reaches ${label}`, () => {
      const g = keyboardOnly();
      g.tap('Enter');
      g.down(i);
      g.tap('Enter');
      assert.equal(g.scene(), target);
    });
  });

  it('plays an Event, pauses it, resumes, quits, all by key', () => {
    const g = keyboardOnly();
    g.tap('Enter');
    g.tap('Enter'); // ARCADE
    assert.equal(g.scene(), 'event');
    g.tap('KeyP');
    const event = (g.manager.current as any);
    assert.equal(event.paused, true);
    g.tap('Enter'); // RESUME
    assert.equal(event.paused, false);
    g.tap('Escape');
    assert.equal(event.paused, true);
    g.down(1);
    g.tap('Enter'); // QUIT TO MENU
    assert.equal(g.scene(), 'menu');
  });

  it('runs an Event to its result and continues past it', () => {
    const g = keyboardOnly();
    g.tap('Enter');
    g.tap('Enter');
    for (let i = 0; i < 2000 && g.scene() === 'event'; i++) g.tap(i % 2 ? 'KeyX' : 'KeyZ');
    assert.equal(g.scene(), 'results');
    g.step(RESULTS_DELAY);
    g.tap('Enter');
    assert.equal(g.scene(), 'title');
  });

  it('Practice picks an Event and goes back', () => {
    const g = keyboardOnly();
    g.tap('Enter');
    g.down(1);
    g.tap('Enter');
    assert.equal(g.scene(), 'practice');
    g.tap('Enter'); // The first playable entry.
    assert.equal(g.scene(), 'event');
    g.tap('Escape');
    g.down(2);
    g.tap('Enter'); // QUIT TO MENU
    assert.equal(g.scene(), 'menu');
  });

  it('Settings changes every option and reaches Controls and Key Test', () => {
    const g = keyboardOnly();
    g.tap('Enter');
    g.down(4);
    g.tap('Enter');
    assert.equal(g.scene(), 'settings');
    const before = { ...g.services.settings.get() };
    g.tap('ArrowRight'); // DIFFICULTY
    g.down(2); // past FULL SCREEN (it needs a real browser)
    g.tap('ArrowRight'); // SOUND
    g.down(1);
    g.tap('ArrowLeft'); // VOLUME
    g.down(1);
    g.tap('ArrowRight'); // ANNOUNCER
    g.down(1);
    g.tap('ArrowRight'); // REDUCED FLASH
    const after = g.services.settings.get();
    assert.notEqual(after.announcer, before.announcer);
    assert.notEqual(after.muted, before.muted);
    assert.ok(after.volume < before.volume);
    assert.notEqual(after.reducedFlash, before.reducedFlash);
    assert.equal(after.difficulty, 'hard');
    g.down(1);
    g.tap('Enter');
    assert.equal(g.scene(), 'controls');
    g.tap('Escape');
    assert.equal(g.scene(), 'settings');
    g.down(7); // The cursor starts at the top again.
    g.tap('Enter');
    assert.equal(g.scene(), 'keyTest');
    g.hold('Escape', EXIT_HOLD_FRAMES + 1);
    assert.equal(g.scene(), 'settings');
    g.down(8);
    g.tap('Enter');
    assert.equal(g.scene(), 'cookiePolicy');
    g.tap('ArrowDown'); // scrolls
    g.tap('Enter'); // BACK
    assert.equal(g.scene(), 'settings');
    g.down(9);
    g.tap('Enter');
    assert.equal(g.scene(), 'credits');
    g.tap('Enter'); // BACK is the default
    assert.equal(g.scene(), 'settings');
    g.down(10);
    g.tap('Enter'); // BACK
    assert.equal(g.scene(), 'menu');
  });

  it('High Scores closes with a key', () => {
    const g = keyboardOnly();
    g.tap('Enter');
    g.down(3);
    g.tap('Enter');
    assert.equal(g.scene(), 'highScores');
    g.step(12);
    g.tap('Escape');
    assert.equal(g.scene(), 'menu');
  });

  it('initials are entered by typing', () => {
    const g = keyboardOnly();
    g.manager.change('initials', { points: 5000 });
    g.tap('KeyA');
    g.tap('KeyB');
    g.tap('KeyC');
    g.tap('Enter');
    assert.equal(g.scene(), 'highScores');
    assert.equal(g.services.storage.getHighScores()[0].initials, 'ABC');
  });
});

describe('reduced flash', () => {
  /** The fill of each of the title's six hexagons at a frame. @param frame @param reducedFlash */
  const hexRow = (frame: number, reducedFlash: boolean) => {
    const ctx = new RasterCtx(SCREEN_WIDTH, 240);
    drawTitleArt(ctx, { frame, reducedFlash });
    const fills = [];
    for (let i = 0; i < 6; i++) {
      const cx = SCREEN_WIDTH / 2 + (i - 2.5) * TITLE_LAYOUT.hexSpacing;
      fills.push(ctx.pixel(Math.round(cx) - TITLE_LAYOUT.hexRadius + 2, TITLE_LAYOUT.hexY).join(','));
    }
    return fills.join(' ');
  };

  it('holds the title hexagons steady', () => {
    assert.equal(new Set([0, 60, 120, 300].map((f) => hexRow(f, true))).size, 1);
    assert.ok(new Set([0, 60, 120, 300].map((f) => hexRow(f, false))).size > 1, 'they step along without it');
  });

  it('keeps PRESS START on screen every frame', () => {
    const g = keyboardOnly();
    g.services.settings.update({ reducedFlash: true });
    for (let frame = 0; frame < 60; frame++) {
      const ys: number[] = [];
      const ctx = ({ fillStyle: '', fillRect: (_x = 0, y = 0) => ys.push(y) } as any);
      g.manager.render(ctx, 0);
      assert.ok(
        ys.some((y) => Math.abs(y - TITLE_LAYOUT.pressStartY) < 8),
        `frame ${frame} draws the prompt`,
      );
      g.step();
    }
  });
});
