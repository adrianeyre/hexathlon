/**
 * Local persistence for settings, Personal Bests and High Scores.
 *
 * Every value is stored under a `hexathlon:*` key, wrapped in an envelope with
 * a schema version. Every access is guarded: if `localStorage` is missing,
 * blocked or full, the game keeps working with an in-memory store. Corrupted,
 * missing or out-of-range data falls back to defaults field by field.
 */

import { isDifficulty } from './sim/difficulty.ts';
import { DEFAULT_PAD_BINDINGS, clonePadBindings, sanitizePadBindings } from './gamepad.ts';
import { DEFAULT_KEY_BINDINGS, cloneKeyBindings, sanitizeKeyBindings } from './input.ts';
import { EVENT_IDS } from './sim/events.ts';

export type EventId = import('./sim/types.ts').EventId;
export type MarkUnit = import('./sim/types.ts').MarkUnit;

/** Prefix for every key the game writes. */
export const KEY_PREFIX = 'hexathlon:';

/** Current schema version of every stored value. Bump it and add a migration when a shape changes. */
export const SCHEMA_VERSION = 1;

export const KEYS = Object.freeze({
  settings: `${KEY_PREFIX}settings`,
  personalBests: `${KEY_PREFIX}personal-bests`,
  highScores: `${KEY_PREFIX}high-scores`,
  controls: `${KEY_PREFIX}controls`,
});

/** Number of rows in the High Score table. */
export const HIGH_SCORE_ROWS = 10;

export interface Settings {
  muted: boolean;
  /** 0 to 1. */
  volume: number;
  /** Stop blinking and flashing effects. */
  reducedFlash: boolean;
  /** Easy, Normal or Hard; Normal plays the data as measured. */
  difficulty: import('./sim/difficulty.ts').Difficulty;
  /** Fill 100% of the screen, in the browser's full-screen mode where it has one. */
  fullScreen: boolean;
  /** The announcer calls the start, fouls, qualifying and the Event names. */
  announcer: boolean;
}

/** Remapped controls. */
export interface Controls {
  keys: import('./input.ts').KeyBindings;
  pads: import('./gamepad.ts').PadBindings;
}

/**
 * A Personal Best Mark in sim units: frames for times (lower is better),
 * pixels for distances and heights (higher is better).
 */
export interface PersonalBest {
  value: number;
  unit: MarkUnit;
}

export type PersonalBests = Partial<Record<EventId, PersonalBest>>;

export interface HighScore {
  /** Three characters, A-Z, 0-9, space or full stop. */
  initials: string;
  /** Non-negative integer. */
  points: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({ muted: false, volume: 0.8, reducedFlash: false, difficulty: ('normal' as import('./sim/difficulty.ts').Difficulty), fullScreen: false, announcer: true });

export const defaultControls = (): Controls => ({
  keys: cloneKeyBindings(DEFAULT_KEY_BINDINGS),
  pads: clonePadBindings(DEFAULT_PAD_BINDINGS),
});

/** The parts of the Web Storage API this module uses. */
export type StorageBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** In-memory stand-in used when `localStorage` is unavailable. */
export class MemoryBackend {
  map = new Map<string, string>();

  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

/**
 * Get a working backend: the given one if a read/write round-trip succeeds,
 * otherwise an in-memory store.
 */
export function resolveBackend(get: () => StorageBackend | null | undefined): StorageBackend {
  try {
    const backend = get();
    if (!backend) return new MemoryBackend();
    const probe = `${KEY_PREFIX}probe`;
    backend.setItem(probe, '1');
    const ok = backend.getItem(probe) === '1';
    backend.removeItem(probe);
    return ok ? backend : new MemoryBackend();
  } catch {
    return new MemoryBackend();
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function sanitizeSettings(value: unknown): Settings {
  const v = isObject(value) ? value : {};
  return {
    muted: typeof v.muted === 'boolean' ? v.muted : DEFAULT_SETTINGS.muted,
    volume:
      typeof v.volume === 'number' && Number.isFinite(v.volume)
        ? Math.min(1, Math.max(0, v.volume))
        : DEFAULT_SETTINGS.volume,
    reducedFlash: typeof v.reducedFlash === 'boolean' ? v.reducedFlash : DEFAULT_SETTINGS.reducedFlash,
    difficulty: isDifficulty(v.difficulty) ? v.difficulty : DEFAULT_SETTINGS.difficulty,
    fullScreen: typeof v.fullScreen === 'boolean' ? v.fullScreen : DEFAULT_SETTINGS.fullScreen,
    announcer: typeof v.announcer === 'boolean' ? v.announcer : DEFAULT_SETTINGS.announcer,
  };
}

export function sanitizeControls(value: unknown): Controls {
  const v = isObject(value) ? value : {};
  return { keys: sanitizeKeyBindings(v.keys), pads: sanitizePadBindings(v.pads) };
}

export function sanitizePersonalBests(value: unknown): PersonalBests {
  const out: PersonalBests = {};
  if (!isObject(value)) return out;
  for (const id of EVENT_IDS) {
    const pb = value[id];
    if (
      isObject(pb) &&
      typeof pb.value === 'number' &&
      Number.isFinite(pb.value) &&
      pb.value >= 0 &&
      (pb.unit === 'frames' || pb.unit === 'pixels')
    ) {
      out[id] = { value: pb.value, unit: pb.unit };
    }
  }
  return out;
}

const INITIALS = /^[A-Z0-9 .]{3}$/;

export function sanitizeHighScores(value: unknown): HighScore[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (row): row is HighScore =>
        isObject(row) &&
        typeof row.initials === 'string' &&
        INITIALS.test(row.initials) &&
        Number.isInteger(row.points) &&
        (row.points as number) >= 0,
    )
    .map(({ initials, points }) => ({ initials, points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, HIGH_SCORE_ROWS);
}

/**
 * Upgrades from older schema versions, keyed by the version they upgrade from.
 * Empty while only version 1 exists.
 */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {};

/**
 * True if `candidate` is a better Mark than `current` for that unit.
 */
export function isBetterMark(candidate: PersonalBest, current: PersonalBest | undefined) {
  if (!current || current.unit !== candidate.unit) return true;
  return candidate.unit === 'frames' ? candidate.value < current.value : candidate.value > current.value;
}

/**
 * Create the store.
 * @param [backend]  Defaults to `localStorage`, or memory if that fails.
 */
export function createStorage(backend: StorageBackend = resolveBackend(() => globalThis.localStorage)) {
  let store = backend;

  const read = <T>(key: string, sanitize: (data: unknown) => T): T => {
    let raw = null;
    try {
      raw = store.getItem(key);
    } catch {
      raw = null;
    }
    if (raw === null) return sanitize(undefined);
    try {
      const envelope = JSON.parse(raw);
      if (!isObject(envelope) || !Number.isInteger(envelope.version)) return sanitize(undefined);
      let { version } = envelope;
      let data = envelope.data;
      while ((version as number) < SCHEMA_VERSION && MIGRATIONS[(version as number)]) {
        data = MIGRATIONS[(version as number)](data);
        version = (version as number) + 1;
      }
      // Data from a newer version (or one with no migration) can't be trusted.
      if (version !== SCHEMA_VERSION) return sanitize(undefined);
      return sanitize(data);
    } catch {
      return sanitize(undefined);
    }
  };

  const write = (key: string, data: unknown) => {
    const raw = JSON.stringify({ version: SCHEMA_VERSION, data });
    try {
      store.setItem(key, raw);
    } catch {
      // Quota exceeded or storage revoked mid-session: carry on in memory.
      if (!(store instanceof MemoryBackend)) {
        const memory = new MemoryBackend();
        for (const k of Object.values(KEYS)) {
          if (k === key) continue;
          try {
            const existing = store.getItem(k);
            if (existing !== null) memory.setItem(k, existing);
          } catch {
            /* unreadable: leave it out */
          }
        }
        store = memory;
      }
      store.setItem(key, raw);
    }
  };

  return {
    /** True when data won't survive a reload. */
    get isMemoryOnly() {
      return store instanceof MemoryBackend;
    },

    /** Whether settings have ever been saved, so first-visit defaults apply only once. */
    hasSavedSettings() {
      try {
        return store.getItem(KEYS.settings) !== null;
      } catch {
        return false;
      }
    },

    getSettings(): Settings {
      return read(KEYS.settings, sanitizeSettings);
    },

    /**
     * Merge and save settings.
     */
    saveSettings(changes: Partial<Settings>): Settings {
      const next = sanitizeSettings({ ...this.getSettings(), ...changes });
      write(KEYS.settings, next);
      return next;
    },

    getControls(): Controls {
      return read(KEYS.controls, sanitizeControls);
    },

    /**
     * Save remapped controls.
     * @returns What was saved, after validation.
     */
    saveControls(controls: Controls): Controls {
      const next = sanitizeControls(controls);
      write(KEYS.controls, next);
      return next;
    },

    getPersonalBests(): PersonalBests {
      return read(KEYS.personalBests, sanitizePersonalBests);
    },

    /**
     * Save a Mark if it beats the Personal Best for that Event.
     * @returns Whether it was a new Personal Best.
     */
    recordPersonalBest(eventId: EventId, mark: PersonalBest): boolean {
      const bests = this.getPersonalBests();
      const candidate = sanitizePersonalBests({ [eventId]: mark })[eventId];
      if (!candidate || !isBetterMark(candidate, bests[eventId])) return false;
      bests[eventId] = candidate;
      write(KEYS.personalBests, bests);
      return true;
    },

    /** @returns Highest first. */
    getHighScores(): HighScore[] {
      return read(KEYS.highScores, sanitizeHighScores);
    },

    /**
     * Whether a Session total would make the table.
     */
    qualifiesForHighScore(points: number) {
      const table = this.getHighScores();
      return table.length < HIGH_SCORE_ROWS || points > table[table.length - 1].points;
    },

    /**
     * Insert a High Score. Ties rank below existing entries.
     * @returns Zero-based rank, or -1 if it didn't make the table or was invalid.
     */
    addHighScore(entry: HighScore): number {
      const [clean] = sanitizeHighScores([entry]);
      if (!clean) return -1;
      const table = this.getHighScores();
      let rank = table.findIndex((row) => clean.points > row.points);
      if (rank === -1) rank = table.length;
      if (rank >= HIGH_SCORE_ROWS) return -1;
      table.splice(rank, 0, clean);
      write(KEYS.highScores, table.slice(0, HIGH_SCORE_ROWS));
      return rank;
    },
  };
}
