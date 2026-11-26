import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PAD_BINDINGS } from '../src/gamepad.ts';
import { DEFAULT_KEY_BINDINGS } from '../src/input.ts';
import {
  DEFAULT_SETTINGS,
  HIGH_SCORE_ROWS,
  KEYS,
  MemoryBackend,
  SCHEMA_VERSION,
  createStorage,
  resolveBackend,
} from '../src/storage.ts';

const envelope = (key: string, data: unknown, version: number = SCHEMA_VERSION) => {
  const backend = new MemoryBackend();
  backend.setItem(key, JSON.stringify({ version, data }));
  return backend;
};

/** A backend whose every call throws, like Safari with storage blocked. */
const throwing = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('SecurityError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

describe('keys', () => {
  it('are namespaced hexathlon:*', () => {
    for (const key of Object.values(KEYS)) assert.match(key, /^hexathlon:/);
  });

  it('store values in a versioned envelope', () => {
    const backend = new MemoryBackend();
    createStorage(backend).saveSettings({ muted: true });
    const raw = JSON.parse((backend.getItem(KEYS.settings) as string));
    assert.equal(raw.version, SCHEMA_VERSION);
    assert.equal(raw.data.muted, true);
  });
});

describe('fallback to memory', () => {
  it('when localStorage access throws', () => {
    const backend = resolveBackend(() => {
      throw new Error('SecurityError');
    });
    assert.ok(backend instanceof MemoryBackend);
  });

  it('when every call throws', () => {
    assert.ok(resolveBackend(() => throwing) instanceof MemoryBackend);
  });

  it('when localStorage is missing (Node)', () => {
    const storage = createStorage();
    assert.equal(storage.isMemoryOnly, true);
    storage.saveSettings({ volume: 0.3 });
    assert.equal(storage.getSettings().volume, 0.3);
  });

  it('when a write fails mid-session (quota), keeping earlier data', () => {
    let full = false;
    const backend = new MemoryBackend();
    const flaky = {
      getItem: (k: string) => backend.getItem(k),
      setItem: (k: string, v: string) => {
        if (full) throw new Error('QuotaExceededError');
        backend.setItem(k, v);
      },
      removeItem: (k: string) => backend.removeItem(k),
    };
    const storage = createStorage(flaky);
    storage.saveSettings({ muted: true });
    full = true;
    assert.equal(storage.recordPersonalBest('sprint', { value: 700, unit: 'frames' }), true);
    assert.equal(storage.isMemoryOnly, true);
    assert.equal(storage.getSettings().muted, true);
    assert.deepEqual(storage.getPersonalBests().sprint, { value: 700, unit: 'frames' });
  });

  it('never throws when reads fail on a live backend', () => {
    const storage = createStorage(throwing);
    assert.deepEqual(storage.getSettings(), DEFAULT_SETTINGS);
    assert.deepEqual(storage.getHighScores(), []);
    storage.saveSettings({ muted: true });
    assert.equal(storage.getSettings().muted, true);
  });
});

describe('missing and corrupted data', () => {
  it('returns defaults when nothing is stored', () => {
    const storage = createStorage(new MemoryBackend());
    assert.deepEqual(storage.getSettings(), DEFAULT_SETTINGS);
    assert.deepEqual(storage.getPersonalBests(), {});
    assert.deepEqual(storage.getHighScores(), []);
  });

  it('returns defaults for unparseable JSON', () => {
    const backend = new MemoryBackend();
    backend.setItem(KEYS.settings, '{not json');
    backend.setItem(KEYS.highScores, 'undefined');
    const storage = createStorage(backend);
    assert.deepEqual(storage.getSettings(), DEFAULT_SETTINGS);
    assert.deepEqual(storage.getHighScores(), []);
  });

  it('returns defaults for a bare value without an envelope', () => {
    const backend = new MemoryBackend();
    backend.setItem(KEYS.settings, JSON.stringify({ muted: true }));
    assert.deepEqual(createStorage(backend).getSettings(), DEFAULT_SETTINGS);
  });

  it('ignores data from an unknown future schema version', () => {
    const storage = createStorage(envelope(KEYS.settings, { muted: true }, SCHEMA_VERSION + 1));
    assert.deepEqual(storage.getSettings(), DEFAULT_SETTINGS);
  });

  it('repairs bad fields individually', () => {
    const storage = createStorage(envelope(KEYS.settings, { muted: 'yes', volume: 7, reducedFlash: 1 }));
    assert.deepEqual(storage.getSettings(), { muted: false, volume: 1, reducedFlash: false, difficulty: 'normal', fullScreen: false, announcer: true });
  });

  it('drops invalid Personal Bests and unknown Events', () => {
    const storage = createStorage(
      envelope(KEYS.personalBests, {
        sprint: { value: 650, unit: 'frames' },
        longJump: { value: 'far', unit: 'pixels' },
        javelin: { value: -3, unit: 'pixels' },
        hammer: { value: 120, unit: 'metres' },
        marathon: { value: 1, unit: 'frames' },
      }),
    );
    assert.deepEqual(storage.getPersonalBests(), { sprint: { value: 650, unit: 'frames' } });
  });

  it('drops invalid High Score rows and re-sorts', () => {
    const storage = createStorage(
      envelope(KEYS.highScores, [
        { initials: 'AAA', points: 100 },
        { initials: 'toolong', points: 900 },
        { initials: 'BBB', points: 1.5 },
        null,
        { initials: 'CCC', points: 300 },
      ]),
    );
    assert.deepEqual(storage.getHighScores(), [
      { initials: 'CCC', points: 300 },
      { initials: 'AAA', points: 100 },
    ]);
  });
});

describe('settings', () => {
  it('merges partial updates', () => {
    const storage = createStorage(new MemoryBackend());
    storage.saveSettings({ muted: true });
    storage.saveSettings({ volume: 0.25 });
    assert.deepEqual(storage.getSettings(), { muted: true, volume: 0.25, reducedFlash: false, difficulty: 'normal', fullScreen: false, announcer: true });
  });

  it('saves the difficulty, Normal by default, and repairs an unknown one', () => {
    const backend = new MemoryBackend();
    const storage = createStorage(backend);
    assert.equal(storage.getSettings().difficulty, 'normal');
    storage.saveSettings({ difficulty: 'hard' });
    assert.equal(createStorage(backend).getSettings().difficulty, 'hard', 'kept in local storage');
    const bad = createStorage(envelope(KEYS.settings, { difficulty: 'impossible' }));
    assert.equal(bad.getSettings().difficulty, 'normal');
  });

  it('persists reduced flash', () => {
    const backend = new MemoryBackend();
    createStorage(backend).saveSettings({ reducedFlash: true });
    assert.equal(createStorage(backend).getSettings().reducedFlash, true);
  });

  it('knows whether settings were ever saved', () => {
    const storage = createStorage(new MemoryBackend());
    assert.equal(storage.hasSavedSettings(), false);
    storage.saveSettings({ muted: true });
    assert.equal(storage.hasSavedSettings(), true);
  });
});

describe('controls', () => {
  it('default to the PRD layout', () => {
    const controls = createStorage(new MemoryBackend()).getControls();
    assert.deepEqual(controls.keys, DEFAULT_KEY_BINDINGS);
    assert.deepEqual(controls.pads, DEFAULT_PAD_BINDINGS);
  });

  it('persist remapped keys and pad buttons', () => {
    const backend = new MemoryBackend();
    const storage = createStorage(backend);
    const controls = storage.getControls();
    controls.keys.player1.RUN_A = ['KeyQ'];
    controls.pads.ACTION = [3];
    storage.saveControls(controls);
    const reloaded = createStorage(backend).getControls();
    assert.deepEqual(reloaded.keys.player1.RUN_A, ['KeyQ']);
    assert.deepEqual(reloaded.pads.ACTION, [3]);
  });

  it('fall back to defaults when stored bindings conflict or are malformed', () => {
    const conflicting = createStorage(
      envelope(KEYS.controls, {
        keys: { ...DEFAULT_KEY_BINDINGS, player2: { RUN_A: ['KeyZ'], RUN_B: ['Period'], ACTION: ['Slash'] } },
        pads: { ...DEFAULT_PAD_BINDINGS, RUN_A: [1] },
      }),
    );
    assert.deepEqual(conflicting.getControls().keys, DEFAULT_KEY_BINDINGS);
    assert.deepEqual(conflicting.getControls().pads, DEFAULT_PAD_BINDINGS);
    const junk = createStorage(envelope(KEYS.controls, { keys: { player1: { RUN_A: ['ArrowUp'] } }, pads: 'x' }));
    assert.deepEqual(junk.getControls().keys, DEFAULT_KEY_BINDINGS, 'reserved keys are refused');
    assert.deepEqual(junk.getControls().pads, DEFAULT_PAD_BINDINGS);
  });
});

describe('Personal Bests', () => {
  it('keeps the lower time and the higher distance', () => {
    const storage = createStorage(new MemoryBackend());
    assert.equal(storage.recordPersonalBest('sprint', { value: 700, unit: 'frames' }), true);
    assert.equal(storage.recordPersonalBest('sprint', { value: 720, unit: 'frames' }), false);
    assert.equal(storage.recordPersonalBest('sprint', { value: 690, unit: 'frames' }), true);
    assert.equal(storage.recordPersonalBest('longJump', { value: 140, unit: 'pixels' }), true);
    assert.equal(storage.recordPersonalBest('longJump', { value: 130, unit: 'pixels' }), false);
    assert.deepEqual(storage.getPersonalBests(), {
      sprint: { value: 690, unit: 'frames' },
      longJump: { value: 140, unit: 'pixels' },
    });
  });

  it('rejects invalid Marks', () => {
    const storage = createStorage(new MemoryBackend());
    assert.equal(storage.recordPersonalBest('sprint', { value: Number.NaN, unit: 'frames' }), false);
  });
});

describe('High Scores', () => {
  it('ranks entries highest first and caps the table', () => {
    const storage = createStorage(new MemoryBackend());
    for (let i = 0; i < HIGH_SCORE_ROWS; i++) storage.addHighScore({ initials: 'AAA', points: (i + 1) * 100 });
    assert.equal(storage.getHighScores().length, HIGH_SCORE_ROWS);
    assert.equal(storage.qualifiesForHighScore(50), false);
    assert.equal(storage.addHighScore({ initials: 'LOW', points: 50 }), -1);
    assert.equal(storage.qualifiesForHighScore(550), true);
    assert.equal(storage.addHighScore({ initials: 'MID', points: 550 }), 5);
    const table = storage.getHighScores();
    assert.equal(table.length, HIGH_SCORE_ROWS);
    assert.deepEqual(table[5], { initials: 'MID', points: 550 });
    assert.equal(table[HIGH_SCORE_ROWS - 1].points, 200);
  });

  it('ranks ties below existing entries', () => {
    const storage = createStorage(new MemoryBackend());
    storage.addHighScore({ initials: 'OLD', points: 100 });
    assert.equal(storage.addHighScore({ initials: 'NEW', points: 100 }), 1);
  });

  it('rejects invalid initials', () => {
    const storage = createStorage(new MemoryBackend());
    assert.equal(storage.addHighScore({ initials: 'ab', points: 10 }), -1);
  });
});
