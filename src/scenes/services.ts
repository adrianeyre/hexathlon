/**
 * What scenes may use besides input: storage, sound, settings, controls and
 * the Event catalogue. Passed in rather than imported, so tests can supply
 * fakes and scenes stay free of browser globals.
 */

/** A recorded Input Trace with the Event entry that replays it, for Attract Mode. */
export interface AttractReel {
  trace: import('../../calibration/types.ts').InputTrace;
  entry: import('./catalogue.ts').EventEntry;
}

export interface Services {
  storage: ReturnType<typeof import('../storage.ts').createStorage>;
  sounds: import('../audio.ts').Sounds;
  /** Settings that take effect as soon as they are saved. */
  settings: { get: () => import('../storage.ts').Settings, update: (changes: Partial<import('../storage.ts').Settings>) => import('../storage.ts').Settings };
  /** Remapped controls, applied to the devices as soon as they are saved. */
  controls: { get: () => import('../storage.ts').Controls, set: (next: import('../storage.ts').Controls) => import('../storage.ts').Controls };
  catalogue: import('./catalogue.ts').Catalogue;
  /** Filled in once the Input Traces have loaded. */
  attract: AttractReel[];
  /** True on devices with a touch screen and no fine pointer (so likely no keyboard). */
  touchOnly: boolean;
  /** Open an address in a new tab (the Credits' link to the repository). */
  openUrl?: (url: string) => void;
}

export {};
