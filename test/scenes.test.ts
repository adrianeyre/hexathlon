import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_KEY_BINDINGS } from '../src/input.ts';
import { ATTRACT_HOLD_FRAMES, loadAttractReels } from '../src/scenes/attract.ts';
import { PLACEHOLDER_ENTRY, createCatalogue } from '../src/scenes/catalogue.ts';
import { CAPTURE_TIMEOUT } from '../src/scenes/controls.ts';
import { PAUSE_ICON } from '../src/scenes/event.ts';
import { registerScenes } from '../src/scenes/index.ts';
import { END_BUTTON } from '../src/scenes/initials.ts';
import { EXIT_HOLD_FRAMES } from '../src/scenes/key-test.ts';
import { SceneManager, anyPress, tapIn, wasPressed } from '../src/scenes/manager.ts';
import { RESULTS_DELAY } from '../src/scenes/results.ts';
import { IDLE_TABLE_FRAMES, TITLE_IDLE_FRAMES } from '../src/scenes/title.ts';
import { placeholderSim } from '../src/sim/placeholder.ts';
import { createSession } from '../src/sim/session.ts';
import { VERSION } from '../src/version.ts';
import PACKAGE from '../package.json' with { type: 'json' };
import { fakeCtx, testServices } from './helpers/fakes.ts';

export type InputEdge = import('../src/sim/types.ts').InputEdge;
export type SceneInput = import('../src/scenes/manager.ts').SceneInput;
export type Action = import('../src/sim/types.ts').Action;

const input = (extra: Partial<SceneInput> = {}): SceneInput => ({ frame: 0, edges: [], ...extra });
const press = (action: Action, player: 0 | 1 | 2 = 0): SceneInput => input({ edges: [{ player, action, type: 'press' }] });
const tap = (x: number, y: number) => input({ taps: [{ x, y }] });
const key = (code: string, type: 'press' | 'release' = 'press') => input({ keys: [{ code, type }] });

/**
 * A full game's scenes on fake services.
 */
function game(overrides?: Parameters<typeof testServices>[0]) {
  const services = testServices(overrides);
  const manager = new SceneManager({});
  const scenes = registerScenes(manager, services);
  const step = (i: SceneInput = input(), times: number = 1) => {
    for (let n = 0; n < times; n++) manager.step(i);
  };
  // Every scene must draw without throwing, whatever its state.
  const draw = () => manager.render((fakeCtx() as any), 0);
  return { services, manager, scenes, step, draw };
}

/** Alternate run presses until the placeholder Event finishes. */
function runToFinish(g: ReturnType<typeof game>) {
  for (let i = 0; i < 3000 && g.manager.currentName === 'event'; i++) {
    g.step(i % 4 === 0 ? press((i / 4) % 2 ? 'RUN_B' : 'RUN_A', 1) : input());
  }
}

describe('SceneManager', () => {
  it('calls enter, step, render and exit hooks', () => {
    const log: string[] = [];
    const scene = (name: string) => ({
      enter: () => log.push(`${name}.enter`),
      exit: () => log.push(`${name}.exit`),
      step: () => log.push(`${name}.step`),
      render: () => log.push(`${name}.render`),
    });
    const manager = new SceneManager({ a: scene('a'), b: scene('b') });
    manager.change('a');
    manager.step(input());
    manager.render(({} as any), 0);
    manager.change('b');
    assert.deepEqual(log, ['a.enter', 'a.step', 'a.render', 'a.exit', 'b.enter']);
  });

  it('defers a change requested mid-step until the step ends', () => {
    const log: string[] = [];
    const manager: SceneManager = new SceneManager({
      a: {
        step: () => {
          manager.change('b', { from: 'a' });
          log.push('a.step-end');
        },
        exit: () => log.push('a.exit'),
        render: () => {},
      },
      b: { enter: (p) => log.push(`b.enter:${p.from}`), step: () => {}, render: () => {} },
    });
    manager.change('a');
    manager.step(input());
    assert.deepEqual(log, ['a.step-end', 'a.exit', 'b.enter:a']);
    assert.equal(manager.currentName, 'b');
  });

  it('rejects unknown scenes', () => {
    assert.throws(() => new SceneManager({}).change('nope'));
  });

  it('wasPressed filters by action and player', () => {
    const i = press('ACTION', 2);
    assert.ok(wasPressed(i, 'ACTION'));
    assert.ok(wasPressed(i, 'ACTION', 2));
    assert.ok(!wasPressed(i, 'ACTION', 1));
    assert.ok(!wasPressed(i, 'RUN_A'));
  });

  it('anyPress and tapIn see every device', () => {
    assert.ok(!anyPress(input()));
    assert.ok(anyPress(press('RUN_A', 1)));
    assert.ok(anyPress(tap(1, 1)));
    assert.ok(anyPress(key('KeyQ')));
    assert.ok(anyPress(input({ pads: [{ player: 1, button: 3, type: 'press' }] })));
    assert.ok(!anyPress(key('KeyQ', 'release')));
    assert.deepEqual(tapIn(tap(5, 5), { x: 0, y: 0, w: 10, h: 10 }), { x: 5, y: 5 });
    assert.equal(tapIn(tap(15, 5), { x: 0, y: 0, w: 10, h: 10 }), null);
  });

  it('passes suspend to the current scene', () => {
    let suspended = 0;
    const manager = new SceneManager({ a: { step() {}, render() {}, suspend: () => suspended++ } });
    manager.suspend(); // no scene yet
    manager.change('a');
    manager.suspend();
    assert.equal(suspended, 1);
  });
});

describe('game flow', () => {
  it('goes title -> menu -> arcade event -> results -> title, drawing every scene', () => {
    const g = game();
    g.manager.change('title');
    g.draw();
    g.step(press('START'));
    assert.equal(g.manager.currentName, 'menu');
    g.draw();
    g.step(press('START')); // ARCADE
    assert.equal(g.manager.currentName, 'event');
    g.draw();
    runToFinish(g);
    assert.equal(g.manager.currentName, 'results');
    g.draw();
    g.step(input(), RESULTS_DELAY);
    g.draw();
    g.step(press('START'));
    assert.equal(g.manager.currentName, 'title');
  });

  it('a tap on the title opens the menu', () => {
    const g = game();
    g.manager.change('title');
    g.step(tap(100, 100));
    assert.equal(g.manager.currentName, 'menu');
  });
});

describe('main menu', () => {
  it('moves with the arrow keys and picks with Enter', () => {
    const g = game();
    g.manager.change('menu');
    g.step(press('DOWN'));
    g.step(press('START'));
    assert.equal(g.manager.currentName, 'practice');
    assert.deepEqual(g.services.sounds.played.slice(-2), ['move', 'select']);
  });

  it('wraps around and reaches Settings and High Scores', () => {
    const g = game();
    g.manager.change('menu');
    g.step(press('UP')); // wraps to the last item
    g.step(press('START'));
    assert.equal(g.manager.currentName, 'settings');
    g.manager.change('menu');
    // The cursor is remembered between visits: still on SETTINGS.
    g.step(press('UP'));
    g.step(press('START'));
    assert.equal(g.manager.currentName, 'highScores');
  });

  it('picks a row when it is tapped', () => {
    const g = game();
    g.manager.change('menu');
    // Rows are 22 px apart from y = 84: ARCADE, PRACTICE, TWO PLAYER, HIGH SCORES, SETTINGS.
    g.step(tap(160, 84 + 22));
    assert.equal(g.manager.currentName, 'practice');
  });

  it('hides Two-player on touch-only devices', () => {
    const keyboard = game();
    keyboard.manager.change('menu');
    keyboard.step(tap(160, 84 + 22 * 4));
    assert.equal(keyboard.manager.currentName, 'settings', 'five rows with a keyboard');

    const touch = game({ touchOnly: true });
    touch.manager.change('menu');
    touch.step(tap(160, 84 + 22 * 2));
    assert.equal(touch.manager.currentName, 'highScores', 'Two-player row is gone');
    touch.manager.change('menu');
    touch.step(tap(160, 84 + 22 * 3));
    assert.equal(touch.manager.currentName, 'settings');
  });

  it('Escape goes back to the title', () => {
    const g = game();
    g.manager.change('menu');
    g.step(press('PAUSE'));
    assert.equal(g.manager.currentName, 'title');
  });
});

describe('settings', () => {
  it('shows "VERSION: x.y.z" with the version in package.json', () => {
    assert.equal(VERSION, PACKAGE.version);
    assert.match(VERSION, /^\d+\.\d+\.\d+/);
    const g = game();
    g.manager.change('settings');
    g.draw();
    assert.equal((g.scenes.settings as any).versionLine, `VERSION: ${PACKAGE.version}`);
  });

  it('toggles sound, changes volume, the announcer and reduced flash, and saves them', () => {
    const g = game();
    g.manager.change('settings');
    g.draw();
    g.step(press('DOWN'));
    g.step(press('START')); // FULL SCREEN
    assert.equal(g.services.storage.getSettings().fullScreen, true);
    g.step(press('START'));
    assert.equal(g.services.storage.getSettings().fullScreen, false);
    g.step(press('DOWN'));
    g.step(press('START')); // SOUND
    assert.equal(g.services.storage.getSettings().muted, true);
    g.step(press('RIGHT'));
    assert.equal(g.services.storage.getSettings().muted, false);
    g.step(press('DOWN'));
    g.step(press('LEFT'));
    assert.equal(g.services.storage.getSettings().volume, 0.7);
    for (let i = 0; i < 5; i++) g.step(press('RIGHT'));
    assert.equal(g.services.storage.getSettings().volume, 1, 'clamped at 100%');
    g.step(press('DOWN'));
    g.step(press('START'));
    assert.equal(g.services.storage.getSettings().announcer, false);
    g.step(press('DOWN'));
    g.step(press('START'));
    assert.equal(g.services.storage.getSettings().reducedFlash, true);
  });

  it('changes the volume by tapping either end of its row', () => {
    const g = game();
    g.manager.change('settings');
    g.step(tap(300, 48 + 16 * 3));
    assert.equal(g.services.storage.getSettings().volume, 0.9);
    g.step(tap(170, 48 + 16 * 3));
    assert.equal(g.services.storage.getSettings().volume, 0.8);
  });

  it('opens the controls and key test screens', () => {
    const g = game();
    g.manager.change('settings');
    g.step(tap(60, 48 + 15 * 6));
    assert.equal(g.manager.currentName, 'controls');
    g.manager.change('settings');
    g.step(tap(60, 48 + 15 * 7));
    assert.equal(g.manager.currentName, 'keyTest');
  });
});

describe('practice', () => {
  /** A stand-in sprint sim, so the picker has a real Event to offer. */
  const sprintCatalogue = () => createCatalogue({ sprint: placeholderSim });

  it('lists the six Events, disabling those not built yet', () => {
    const g = game();
    g.manager.change('practice');
    g.draw();
    // Only the placeholder is playable, so the cursor starts there.
    g.step(press('START'));
    assert.equal(g.manager.currentName, 'event');
    assert.equal((g.scenes.event as any).state.frame, 0);
    g.manager.change('practice');
    g.step(tap(60, 52)); // 100M DASH, not built
    assert.equal(g.manager.currentName, 'practice');
    assert.equal(g.services.sounds.played.at(-1), 'error');
  });

  it('allows unlimited Attempts', () => {
    const g = game();
    g.manager.change('event', { entry: PLACEHOLDER_ENTRY, mode: 'practice' });
    for (let attempt = 0; attempt < 3; attempt++) {
      runToFinish(g);
      assert.equal(g.manager.currentName, 'results');
      g.step(input(), RESULTS_DELAY);
      g.step(press('START')); // TRY AGAIN
      assert.equal(g.manager.currentName, 'event');
    }
  });

  it('records Personal Bests', () => {
    const g = game({ catalogue: sprintCatalogue() });
    g.manager.change('practice');
    g.step(press('START')); // 100M DASH
    runToFinish(g);
    assert.equal(g.manager.currentName, 'results');
    assert.equal(g.scenes.results.newPersonalBest, true);
    assert.ok(g.services.storage.getPersonalBests().sprint);
    assert.ok(g.services.sounds.played.includes('record'));
    g.draw();
    g.step(input(), RESULTS_DELAY);
    g.step(press('DOWN'));
    g.step(press('START')); // CHOOSE EVENT
    assert.equal(g.manager.currentName, 'practice');
    g.draw();
  });

  it('does not record Personal Bests for the placeholder', () => {
    const g = game();
    g.manager.change('event', { entry: PLACEHOLDER_ENTRY, mode: 'practice' });
    runToFinish(g);
    assert.deepEqual(g.services.storage.getPersonalBests(), {});
  });
});

describe('pause', () => {
  const startEvent = (g: ReturnType<typeof game>, mode = 'arcade') => g.manager.change('event', { entry: PLACEHOLDER_ENTRY, mode });

  it('PAUSE opens the overlay and freezes the Attempt; resuming continues from the same frame', () => {
    const g = game();
    startEvent(g);
    g.step(press('RUN_A', 1));
    g.step(input(), 9);
    const frame = g.scenes.event.attemptFrame;
    const state = g.scenes.event.state;
    g.step(press('PAUSE'));
    assert.equal(g.scenes.event.paused, true);
    g.draw();
    g.step(press('RUN_B', 1), 100); // ignored while paused
    assert.equal(g.scenes.event.attemptFrame, frame);
    assert.equal(g.scenes.event.state, state);
    g.step(press('START')); // RESUME
    assert.equal(g.scenes.event.paused, false);
    g.step(input());
    assert.equal(g.scenes.event.attemptFrame, frame + 1);
  });

  it('gives the same result as an unpaused Attempt', () => {
    const play = (withPause: boolean) => {
      const g = game();
      startEvent(g);
      for (let i = 0; g.manager.currentName === 'event'; i++) {
        if (withPause && i % 50 === 25) {
          g.step(press('PAUSE'));
          g.step(input(), 30);
          g.step(press('PAUSE'));
        }
        g.step(i % 4 === 0 ? press((i / 4) % 2 ? 'RUN_B' : 'RUN_A', 1) : input());
      }
      return g.scenes.results.result;
    };
    const plain = play(false);
    assert.ok(plain?.marks[0].value);
    assert.deepEqual(play(true), plain);
  });

  it('the pause icon pauses, and auto-pause happens when the page is hidden', () => {
    const g = game();
    startEvent(g);
    g.step(tap(PAUSE_ICON.x + 5, PAUSE_ICON.y + 5));
    assert.equal(g.scenes.event.paused, true);
    g.step(press('PAUSE'));
    assert.equal(g.scenes.event.paused, false);
    g.manager.suspend();
    assert.equal(g.scenes.event.paused, true);
  });

  it("a pad's Start pauses but Enter does not", () => {
    const g = game();
    startEvent(g);
    g.step(press('START', 0));
    assert.equal(g.scenes.event.paused, false);
    g.step(press('START', 1));
    assert.equal(g.scenes.event.paused, true);
  });

  it('Return to menu abandons the Attempt', () => {
    const g = game();
    startEvent(g);
    g.step(press('RUN_A', 1));
    g.step(press('PAUSE'));
    g.step(press('DOWN'));
    const before = g.services.sounds.played.length;
    g.step(press('START')); // QUIT TO MENU
    assert.equal(g.manager.currentName, 'menu');
    assert.ok(g.services.sounds.played.slice(before).includes('quiet'), 'quitting silences the announcer');
    g.step(press('START')); // ARCADE again starts a fresh Attempt
    assert.equal(g.scenes.event.attemptFrame, 0);
  });

  it('Practice also offers restarting the Attempt', () => {
    const g = game();
    startEvent(g, 'practice');
    g.step(press('RUN_A', 1), 5);
    g.step(press('PAUSE'));
    g.step(press('DOWN'));
    g.step(press('START')); // RESTART ATTEMPT
    assert.equal(g.scenes.event.paused, false);
    assert.equal(g.scenes.event.attemptFrame, 0);
  });

  it('only run and action input reaches the simulation', () => {
    const g = game();
    startEvent(g);
    g.step(press('UP', 1));
    g.step(press('LEFT', 0));
    assert.equal((g.scenes.event.state as any).speed, 0);
  });
});

describe('sprint sounds on the placeholder', () => {
  it('plays the pistol, footsteps, crowd and finish', () => {
    const g = game();
    g.manager.change('event', { entry: PLACEHOLDER_ENTRY, mode: 'arcade' });
    runToFinish(g);
    const played = new Set(g.services.sounds.played);
    for (const name of ['pistol', 'footstep', 'crowd', 'finish']) assert.ok(played.has(name), name);
  });
});

describe('High Scores', () => {
  it('initials entry by keyboard: arrows, typing and Enter', () => {
    const g = game();
    g.manager.change('initials', { points: 5000 });
    g.draw();
    g.step(press('UP')); // A -> B
    g.step(press('START'));
    g.step(key('KeyZ')); // typed
    g.step(press('DOWN')); // A -> space (wraps backwards)
    assert.equal(g.scenes.initials.initials, 'BZ ');
    g.step(key('Escape')); // back to the second letter
    g.step(key('Digit7'));
    assert.equal(g.scenes.initials.initials, 'B7 ');
    g.step(key('KeyP')); // P is a letter here, not pause
    assert.equal(g.scenes.initials.initials, 'B7P');
    g.step(press('START'));
    assert.equal(g.manager.currentName, 'highScores');
    assert.deepEqual(g.services.storage.getHighScores(), [{ initials: 'B7P', points: 5000 }]);
    g.draw();
  });

  it('initials entry by touch', () => {
    const g = game();
    g.manager.change('initials', { points: 10 });
    // Up arrow over the first slot, twice: A -> C. Down arrow under the third: A -> space.
    g.step(tap(160 - 36, 70));
    g.step(tap(160 - 36, 70));
    g.step(tap(160 + 36, 140));
    g.step(tap(END_BUTTON.x + 5, END_BUTTON.y + 5));
    assert.deepEqual(g.services.storage.getHighScores(), [{ initials: 'CA ', points: 10 }]);
  });

  it('results go to initials entry when the Session total qualifies', () => {
    const g = game();
    const session = { ...createSession(), points: 120, over: true };
    g.manager.change('results', { entry: PLACEHOLDER_ENTRY, result: null, mode: 'arcade', session });
    g.step(input(), RESULTS_DELAY);
    g.step(press('START'));
    assert.equal(g.manager.currentName, 'initials');
  });

  it('the table is shown from the title screen when idle, then Attract Mode', () => {
    const g = game();
    g.services.storage.addHighScore({ initials: 'ABC', points: 300 });
    g.manager.change('title');
    g.step(input(), TITLE_IDLE_FRAMES - 1);
    assert.equal(g.manager.currentName, 'title');
    g.step(input());
    assert.equal(g.manager.currentName, 'highScores');
    g.draw();
    g.step(input(), IDLE_TABLE_FRAMES);
    // No Attract reels loaded in this test, so Attract Mode hands straight back.
    assert.equal(g.manager.currentName, 'title');
  });

  it('any key on the title resets the idle timer', () => {
    const g = game();
    g.manager.change('title');
    g.step(input(), TITLE_IDLE_FRAMES - 10);
    g.step(press('RUN_A', 1));
    g.step(input(), 20);
    assert.equal(g.manager.currentName, 'title');
  });

  it('the table returns where it came from', () => {
    const g = game();
    g.manager.change('menu');
    g.step(press('UP'));
    g.step(press('UP'));
    g.step(press('START'));
    assert.equal(g.manager.currentName, 'highScores');
    g.step(input(), 11);
    g.step(press('PAUSE'));
    assert.equal(g.manager.currentName, 'menu');
  });
});

describe('Attract Mode', () => {
  const trace: import('../calibration/types.ts').InputTrace = {
    formatVersion: 1,
    id: 'sprint/test',
    event: 'sprint',
    cycle: 1,
    players: 1,
    frames: 400,
    source: 'synthetic',
    inputs: Array.from({ length: 60 }, (_, i) => ({
      frame: i * 6,
      player: (1 as 1),
      action: ((i % 2 ? 'RUN_B' : 'RUN_A') as 'RUN_A' | 'RUN_B'),
      type: ('press' as 'press'),
    })),
  };
  const reels = () => [
    { trace, entry: PLACEHOLDER_ENTRY },
    { trace: { ...trace, id: 'sprint/test-2' }, entry: PLACEHOLDER_ENTRY },
  ];

  it('replays each Input Trace through its Event, then returns to the title', () => {
    const g = game({ attract: reels() });
    g.manager.change('attract');
    g.draw();
    g.step(input(), 200);
    assert.ok((g.scenes.attract.state as any).x > 0, 'the trace drives the runner');
    let steps = 0;
    while (g.scenes.attract.reel === 0 && steps++ < 2000) g.step();
    assert.equal(g.scenes.attract.reel, 1, 'moves on to the next Event');
    while (g.manager.currentName === 'attract' && steps++ < 4000) g.step();
    assert.equal(g.manager.currentName, 'title');
    assert.ok(steps > ATTRACT_HOLD_FRAMES);
  });

  it('is deterministic: the same trace gives the same state', () => {
    const a = game({ attract: reels() });
    const b = game({ attract: reels() });
    a.manager.change('attract');
    b.manager.change('attract');
    a.step(input(), 150);
    b.step(input(), 150);
    assert.deepEqual(a.scenes.attract.state, b.scenes.attract.state);
  });

  it('any input returns to the title, and plays no sound', () => {
    for (const i of [press('RUN_A', 1), press('START'), tap(1, 1), key('KeyQ')]) {
      const g = game({ attract: reels() });
      g.manager.change('attract');
      g.step(input(), 30);
      g.step(i);
      assert.equal(g.manager.currentName, 'title');
      // Attract Mode only silences the music; the theme starts again back on the title.
      assert.deepEqual(g.services.sounds.played, ['stopMusic', 'theme']);
    }
  });

  it('loads the playlist, skipping broken traces and standing in for Events not built yet', async () => {
    const files: Record<string, unknown> = {
      'data/attract.json': { traces: ['a.json', 'missing.json', 'b.json'] },
      'a.json': trace,
      'b.json': { ...trace, event: 'javelin' },
    };
    const fetchJson = async (path: string) => {
      if (!(path in files)) throw new Error('404');
      return files[path];
    };
    const catalogue = createCatalogue({ sprint: placeholderSim });
    const loaded = await loadAttractReels(fetchJson, catalogue);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].entry.id, 'sprint');
    assert.equal(loaded[1].entry, PLACEHOLDER_ENTRY);
    assert.deepEqual(await loadAttractReels(async () => Promise.reject(new Error('offline')), catalogue), []);
  });
});

describe('controls screen', () => {
  it('remaps a key and saves it', () => {
    const g = game();
    g.manager.change('controls');
    g.draw();
    g.step(press('START')); // P1 RUN A
    assert.equal(g.scenes.controls.capturing, 'P1 RUN A');
    g.draw();
    g.step(key('KeyQ'));
    assert.equal(g.scenes.controls.capturing, null);
    assert.deepEqual(g.services.storage.getControls().keys.player1.RUN_A, ['KeyQ']);
  });

  it('ignores the key that opened the capture', () => {
    const g = game();
    g.manager.change('controls');
    g.step(input({ edges: [{ player: 0, action: 'START', type: 'press' }], keys: [{ code: 'Enter', type: 'press' }] }));
    assert.equal(g.scenes.controls.capturing, 'P1 RUN A');
  });

  it('refuses conflicting and reserved keys', () => {
    const g = game();
    g.manager.change('controls');
    g.step(press('START'));
    g.step(key('KeyX')); // P1 RUN B's key
    assert.match(g.scenes.controls.message, /USED BY P1 RUN B/);
    assert.equal(g.scenes.controls.capturing, 'P1 RUN A', 'still waiting');
    g.step(key('ArrowUp'));
    assert.match(g.scenes.controls.message, /KEPT FOR THE MENUS/);
    assert.deepEqual(g.services.storage.getControls().keys, DEFAULT_KEY_BINDINGS);
    g.step(key('Escape'));
    assert.equal(g.scenes.controls.capturing, null);
  });

  it('remaps pad buttons, refusing the d-pad and conflicts', () => {
    const g = game();
    g.manager.change('controls');
    for (let i = 0; i < 8; i++) g.step(press('DOWN'));
    g.step(press('START')); // PAD RUN A
    assert.equal(g.scenes.controls.capturing, 'PAD RUN A');
    g.step(input({ pads: [{ player: 2, button: 12, type: 'press' }] }));
    assert.match(g.scenes.controls.message, /D-PAD/);
    g.step(input({ pads: [{ player: 2, button: 1, type: 'press' }] }));
    assert.match(g.scenes.controls.message, /USED BY PAD RUN B/);
    g.step(input({ pads: [{ player: 2, button: 3, type: 'press' }] }));
    assert.deepEqual(g.services.storage.getControls().pads.RUN_A, [3]);
  });

  it('gives up waiting after a timeout, and resets to defaults', () => {
    const g = game();
    g.manager.change('controls');
    g.step(press('START'));
    g.step(input(), CAPTURE_TIMEOUT + 1);
    assert.equal(g.scenes.controls.capturing, null);
    g.step(press('START'));
    g.step(key('KeyQ'));
    g.step(press('UP'));
    g.step(press('UP'));
    g.step(press('START')); // RESET TO DEFAULTS
    assert.deepEqual(g.services.storage.getControls().keys, DEFAULT_KEY_BINDINGS);
  });
});

describe('key test screen', () => {
  it('shows every held key live, and leaves on a long Escape', () => {
    const g = game();
    g.manager.change('keyTest');
    g.step(input({ keys: ['KeyZ', 'KeyX', 'KeyC', 'Comma', 'Period', 'Slash'].map((code) => ({ code, type: 'press' })) }));
    assert.equal(g.scenes.keyTest.held.size, 6);
    g.step(input({ pads: [{ player: 1, button: 0, type: 'press' }] }));
    g.draw();
    g.step(key('KeyX', 'release'));
    assert.equal(g.scenes.keyTest.held.has('KeyX'), false);
    g.step(key('Escape'));
    g.step(input(), EXIT_HOLD_FRAMES - 2);
    assert.equal(g.manager.currentName, 'keyTest', 'a short Escape is just a key');
    g.step(input(), 2);
    assert.equal(g.manager.currentName, 'settings');
  });
});

describe('title theme', () => {
  it('asks for the theme on the title and opens an Arcade Session with the intro fanfare', () => {
    const g = game();
    g.manager.change('title');
    assert.deepEqual(g.services.sounds.played, ['theme']);
    g.step(press('START'));
    g.step(press('START')); // ARCADE
    assert.equal(g.manager.currentName, 'event');
    assert.ok(g.services.sounds.played.includes('intro'));
    assert.ok(!g.services.sounds.played.includes('stopMusic'));
    g.draw();
  });

  it('stops the music without a fanfare in Practice', () => {
    const g = game();
    g.manager.change('event', { entry: PLACEHOLDER_ENTRY, mode: 'practice' });
    assert.ok(g.services.sounds.played.includes('stopMusic'));
    assert.ok(!g.services.sounds.played.includes('intro'));
  });
});
