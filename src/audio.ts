import { voice } from './voice.ts';

/**
 * Procedural audio: every sound is synthesised with Web Audio. No samples.
 *
 * Browsers may keep audio suspended until a user gesture. `main.js` calls
 * `unlock()` as soon as the page opens, so the title theme plays straight
 * away wherever the browser allows it (an installed app, or a site the
 * browser lets play sound), and again from inside every key and pointer
 * handler, so otherwise it starts with the very first key press, click or
 * tap. Every sound is silently skipped until the context is running, except
 * a song, which waits and starts the moment it is.
 *
 * Signal path: voices → sfx bus / music bus → master gain (volume and mute) → output.
 */

/** The subset of the Web Audio API this module uses, so tests can supply a fake. */
export type AudioContextLike = Pick<AudioContext, 'state' | 'resume' | 'currentTime' | 'sampleRate' | 'destination' | 'createGain' | 'createOscillator' | 'createBufferSource' | 'createBiquadFilter' | 'createBuffer'>;

/** Oscillator shapes used for chiptune voices. */
export type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine';

/** A tone: one oscillator through an attack/decay envelope. */
export interface ToneOptions {
  wave?: Wave;
  /** Hz. */
  freq: number;
  /** Hz to glide to by the end of the note. */
  slideTo?: number;
  /** Start, in seconds from now. */
  at?: number;
  /** Seconds. */
  duration: number;
  /** Peak level, 0 to 1. */
  gain?: number;
  /** Seconds. */
  attack?: number;
  bus?: 'sfx' | 'music';
}

/** A burst of white noise through a filter. */
export interface NoiseOptions {
  filter?: BiquadFilterType;
  /** Filter frequency in Hz. */
  freq?: number;
  q?: number;
  at?: number;
  duration: number;
  gain?: number;
  bus?: 'sfx' | 'music';
}

/** One note of a melody, in semitones from A4 (440 Hz), or null for a rest. */
export interface Note {
  pitch: number | null;
  beats: number;
}

/** One voice of a song. */
export interface SongPart {
  notes: readonly Note[];
  wave?: Wave;
  gain?: number;
  transpose?: number;
  /** A drum part: each pitch picks a drum (`DRUM.kick`, `DRUM.snare`, `DRUM.hat`) instead of a note. */
  drum?: boolean;
}

/** Drum sounds a drum part's pitches pick. */
export const DRUM = Object.freeze({ kick: 0, snare: 1, hat: 2 });

/**
 * Frequency of a pitch in semitones from A4.
 */
export const pitchToHz = (semitones: number) => 440 * 2 ** (semitones / 12);

/** Floor for exponential ramps, which can't reach zero. */
const SILENT = 0.0001;

/**
 * @param create  Builds the context; returns null if unsupported.
 */
export function createAudio(create: () => AudioContextLike | null) {
  let ctx: AudioContextLike | null = null;
  let unsupported = false;
  let volume = 0.8;
  let muted = false;
  let master: GainNode | null = null;
  let buses: { sfx: GainNode; music: GainNode; } | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let crowd: { source: AudioBufferSourceNode; gain: GainNode; } | null = null;
  let musicVoices: AudioScheduledSourceNode[] = [];
  /** A song asked for before audio was unlocked; it starts on unlock. */
  let pendingSong: { parts: readonly SongPart[]; bpm: number; } | null = null;

  const level = () => (muted ? 0 : volume);

  /** @returns The context, only once it is running. */
  const live = (): AudioContextLike | null => (ctx && ctx.state === 'running' ? ctx : null);

  const build = (c: AudioContextLike) => {
    master = c.createGain();
    master.gain.value = level();
    master.connect(c.destination);
    const sfx = c.createGain();
    sfx.gain.value = 0.9;
    sfx.connect(master);
    const music = c.createGain();
    music.gain.value = 0.5;
    music.connect(master);
    buses = { sfx, music };
    // One second of white noise, reused by every noise voice.
    const length = Math.max(1, Math.floor(c.sampleRate));
    noiseBuffer = c.createBuffer(1, length, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    // A fixed-seed generator (Marsaglia's xorshift32) keeps the noise identical every session.
    let seed = 0x9e3779b9;
    for (let i = 0; i < length; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    }
  };

  const envelope = (c: AudioContextLike, gain: GainNode, start: number, peak: number, attack: number, end: number) => {
    gain.gain.setValueAtTime(SILENT, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(SILENT, end);
  };

  /**
   * Queue one part's notes on the music bus, starting now.
   * @param [drum]  Play the pitches as drums.
   * @returns Length in seconds.
   */
  const schedule = (notes: readonly Note[], bpm: number, wave: Wave, gain: number, transpose: number, drum: boolean = false): number => {
    const beat = 60 / bpm;
    let t = 0.02;
    for (const note of notes) {
      const duration = note.beats * beat;
      if (note.pitch !== null && drum) {
        for (const voice of drumHit(note.pitch, t, gain)) if (voice) musicVoices.push(voice);
      } else if (note.pitch !== null) {
        const osc = api.tone({
          wave,
          freq: pitchToHz(note.pitch + transpose),
          at: t,
          duration: duration * 0.9,
          gain,
          attack: 0.01,
          bus: 'music',
        });
        if (osc) musicVoices.push(osc);
      }
      t += duration;
    }
    return t;
  };

  /**
   * One drum hit on the music bus, synthesised: a kick is a falling sine
   * thump, a snare a burst of band-passed noise over a short tone, a hat a
   * tick of high-passed noise.
   * @param drum  One of `DRUM`.
   * @param at  Seconds from now.
   */
  const drumHit = (drum: number, at: number, gain: number) => {
    if (drum === DRUM.kick) return [api.tone({ wave: 'sine', freq: 150, slideTo: 45, at, duration: 0.14, gain: gain * 1.6, bus: 'music' })];
    if (drum === DRUM.snare) {
      return [
        api.noise({ filter: 'bandpass', freq: 1800, q: 0.8, at, duration: 0.1, gain, bus: 'music' }),
        api.tone({ wave: 'triangle', freq: 190, at, duration: 0.06, gain: gain * 0.6, bus: 'music' }),
      ];
    }
    return [api.noise({ filter: 'highpass', freq: 7000, at, duration: 0.03, gain: gain * 0.5, bus: 'music' })];
  };

  /** Start the song that was waiting for audio, once the context is running. */
  const startPendingSong = () => {
    if (!live() || !pendingSong) return;
    const { parts, bpm } = pendingSong;
    pendingSong = null;
    api.playSong(parts, { bpm });
  };

  const api = {
    /** Whether a context exists and is running. */
    get running() {
      return live() !== null;
    },

    /**
     * Create (on first call) and resume the context. Browsers that need a
     * user gesture only allow this inside a gesture's event handler; called
     * outside one it does no harm, and a waiting song starts as soon as the
     * context runs.
     * @returns Whether audio is now running.
     */
    async unlock(): Promise<boolean> {
      if (!ctx && !unsupported) {
        try {
          ctx = create();
        } catch {
          ctx = null;
        }
        unsupported = ctx === null;
        if (ctx) {
          build(ctx);
          // The context may start running without a call here (the browser
          // allows it a moment later): start a waiting song then.
          const target = (ctx as Partial<EventTarget>);
          target.addEventListener?.('statechange', startPendingSong);
        }
      }
      if (!ctx) return false;
      if (ctx.state !== 'running') {
        try {
          await ctx.resume();
        } catch {
          return false;
        }
      }
      startPendingSong();
      return ctx.state === 'running';
    },

    /** @param value  0 to 1. */
    setVolume(value: number) {
      volume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
      if (master && ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.01);
    },

    setMuted(value: boolean) {
      muted = value;
      if (master && ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.01);
    },

    get volume() {
      return volume;
    },

    get muted() {
      return muted;
    },

    /**
     * Play one synth tone. Does nothing until audio is unlocked.
     */
    tone({ wave = 'square', freq, slideTo, at = 0, duration, gain = 0.3, attack = 0.005, bus = 'sfx' }: ToneOptions) {
      const c = live();
      if (!c || !buses) return null;
      const start = c.currentTime + at;
      const end = start + duration;
      const osc = c.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, start);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, end);
      const g = c.createGain();
      envelope(c, g, start, gain, Math.min(attack, duration / 2), end);
      osc.connect(g);
      g.connect(buses[bus]);
      osc.start(start);
      osc.stop(end + 0.02);
      return osc;
    },

    /**
     * Play a burst of filtered noise. Does nothing until audio is unlocked.
     */
    noise({ filter = 'bandpass', freq = 1000, q = 1, at = 0, duration, gain = 0.3, bus = 'sfx' }: NoiseOptions) {
      const c = live();
      if (!c || !buses || !noiseBuffer) return null;
      const start = c.currentTime + at;
      const end = start + duration;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = filter;
      f.frequency.setValueAtTime(freq, start);
      f.Q.setValueAtTime(q, start);
      const g = c.createGain();
      envelope(c, g, start, gain, 0.002, end);
      src.connect(f);
      f.connect(g);
      g.connect(buses[bus]);
      src.start(start, (start * 7.13) % 1);
      src.stop(end + 0.02);
      return src;
    },

    /**
     * Play a melody on the music bus, replacing any melody already playing.
     * @returns Its length in seconds.
     */
    playMelody(notes: readonly Note[], { bpm = 140, wave = 'square', gain = 0.25, transpose = 0 }: { bpm?: number; wave?: Wave; gain?: number; transpose?: number; } = {}): number {
      api.stopMusic();
      return schedule(notes, bpm, wave, gain, transpose);
    },

    /**
     * Play several parts together (a lead and a bass line, say) on the music
     * bus, replacing any music already playing. Asked for before audio is
     * unlocked, the song waits and starts on unlock instead of being lost.
     * @returns Its length in seconds (0 while waiting for unlock).
     */
    playSong(parts: readonly SongPart[], { bpm = 140 }: { bpm?: number; } = {}): number {
      api.stopMusic();
      if (!live()) {
        pendingSong = { parts, bpm };
        return 0;
      }
      let length = 0;
      for (const part of parts) {
        length = Math.max(length, schedule(part.notes, bpm, part.wave ?? 'square', part.gain ?? 0.2, part.transpose ?? 0, part.drum ?? false));
      }
      return length;
    },

    /** Whether a song is waiting for audio to unlock. */
    get songPending() {
      return pendingSong !== null;
    },

    /** Stop the current music, including a song waiting for unlock. */
    stopMusic() {
      pendingSong = null;
      for (const voice of musicVoices) {
        try {
          voice.stop();
        } catch {
          /* already stopped */
        }
      }
      musicVoices = [];
    },

    /**
     * Set the crowd's roar, 0 (silent) to 1. Starts the looping crowd voice on
     * first use.
     */
    setCrowd(amount: number) {
      const c = live();
      if (!c || !buses || !noiseBuffer) return;
      if (!crowd) {
        const source = c.createBufferSource();
        source.buffer = noiseBuffer;
        source.loop = true;
        // Two band-passes give a broad "voices" band without a hiss.
        const low = c.createBiquadFilter();
        low.type = 'bandpass';
        low.frequency.value = 500;
        low.Q.value = 0.7;
        const high = c.createBiquadFilter();
        high.type = 'lowpass';
        high.frequency.value = 1800;
        const gain = c.createGain();
        gain.gain.value = SILENT;
        source.connect(low);
        low.connect(high);
        high.connect(gain);
        gain.connect(buses.sfx);
        source.start();
        crowd = { source, gain };
      }
      const target = Math.max(SILENT, Math.min(1, amount) * 0.18);
      crowd.gain.gain.setTargetAtTime(target, c.currentTime, 0.25);
    },

    /** Silence every looping voice and melody (e.g. on pause or leaving an Event). */
    hush() {
      api.stopMusic();
      const c = live();
      if (c && crowd) crowd.gain.gain.setTargetAtTime(SILENT, c.currentTime, 0.05);
    },
  };
  return api;
}

export type Audio = ReturnType<typeof createAudio>;

/**
 * The game's sound effects, built from the engine's voices, plus the
 * announcer's callouts.
 * @param [announcer]  Says the callouts; silent without one.
 */
export function createSounds(audio: Audio, announcer: import('./voice.ts').Voice | null = null) {
  return {
    /**
     * The announcer says a callout (`data/callouts.json`), after anything
     * being said, or at once with `interrupt`.
     */
    say(id: import('./voice.ts').CalloutId, options?: { interrupt?: boolean; }) {
      announcer?.say(id, options);
    },

    /** Stop the announcer mid-phrase (on pause). */
    quiet() {
      announcer?.cancel();
    },

    /** Starting pistol: a sharp crack over a low thump. */
    pistol() {
      audio.noise({ filter: 'highpass', freq: 1800, q: 0.7, duration: 0.18, gain: 0.7 });
      audio.noise({ filter: 'lowpass', freq: 400, q: 0.9, duration: 0.3, gain: 0.5 });
      audio.tone({ wave: 'triangle', freq: 110, slideTo: 40, duration: 0.2, gain: 0.4 });
    },

    /**
     * One footstep. Alternating feet get slightly different pitches.
     */
    footstep(left: boolean = true) {
      audio.noise({ filter: 'bandpass', freq: left ? 260 : 300, q: 3, duration: 0.05, gain: 0.35 });
      audio.tone({ wave: 'triangle', freq: left ? 90 : 100, slideTo: 50, duration: 0.04, gain: 0.25 });
    },

    /**
     * Crowd roar, 0 to 1.
     */
    crowd(amount: number) {
      audio.setCrowd(amount);
    },

    /** Crossing the line: a cheer swell and a rising fanfare. */
    finish() {
      audio.noise({ filter: 'bandpass', freq: 700, q: 0.6, duration: 1.2, gain: 0.25 });
      audio.playMelody(FINISH_FANFARE, { bpm: 300, wave: 'square', gain: 0.22 });
    },

    /** A foul or false start: a falling buzz. */
    foul() {
      audio.tone({ wave: 'sawtooth', freq: 220, slideTo: 110, duration: 0.35, gain: 0.25 });
    },

    /** Hitting a hurdle or knocking the bar: a dull clatter. */
    thud() {
      audio.noise({ filter: 'lowpass', freq: 400, duration: 0.18, gain: 0.35 });
      audio.tone({ wave: 'triangle', freq: 140, slideTo: 70, duration: 0.15, gain: 0.25 });
    },

    /** Menu cursor moved. */
    move() {
      audio.tone({ wave: 'square', freq: 880, duration: 0.04, gain: 0.12 });
    },

    /** Menu item chosen. */
    select() {
      audio.tone({ wave: 'square', freq: 660, duration: 0.05, gain: 0.15 });
      audio.tone({ wave: 'square', freq: 990, at: 0.05, duration: 0.07, gain: 0.15 });
    },

    /** Not allowed (e.g. a key that's already bound). */
    error() {
      audio.tone({ wave: 'square', freq: 150, duration: 0.15, gain: 0.18 });
    },

    /** A new Personal Best. */
    record() {
      audio.playMelody(RECORD_JINGLE, { bpm: 260, wave: 'triangle', gain: 0.3 });
    },

    /**
     * The Hexathlon theme, on the title screen. If audio isn't unlocked yet it
     * starts with the first key press or tap.
     */
    theme() {
      audio.playSong(THEME, { bpm: THEME_BPM });
    },

    /** The intro fanfare that opens an Arcade Session, replacing any music playing. */
    intro() {
      audio.playSong(INTRO_FANFARE, { bpm: INTRO_BPM });
    },

    /** Stop any music (the theme or a jingle). */
    stopMusic() {
      audio.stopMusic();
    },
  };
}

export type Sounds = ReturnType<typeof createSounds>;

/**
 * Original jingles, written for Hexathlon. Pitches in semitones from A4.
 */
export const FINISH_FANFARE: readonly Note[] = Object.freeze([
  { pitch: 3, beats: 1 },
  { pitch: 7, beats: 1 },
  { pitch: 10, beats: 1 },
  { pitch: 15, beats: 2 },
  { pitch: 12, beats: 1 },
  { pitch: 15, beats: 3 },
]);

export const RECORD_JINGLE: readonly Note[] = Object.freeze([
  { pitch: 0, beats: 1 },
  { pitch: 4, beats: 1 },
  { pitch: 2, beats: 1 },
  { pitch: 5, beats: 1 },
  { pitch: 9, beats: 1 },
  { pitch: null, beats: 1 },
  { pitch: 12, beats: 3 },
]);

/** Tempo of the theme, in beats per minute. */
export const THEME_BPM = 150;

/**
 * The Hexathlon theme: an original eight-bar march in C major, written for
 * this game (see CREDITS.md). A square-wave lead over a triangle bass, in
 * semitones from A4. It is deliberately built from stepwise runs and a
 * rising arpeggio rather than any well-known sports or film tune.
 */
export const THEME: readonly SongPart[] = Object.freeze([
  {
    wave: 'square',
    gain: 0.18,
    notes: Object.freeze([
      // Bar 1-2: rising call, held answer.
      { pitch: -2, beats: 1 }, { pitch: 3, beats: 1 }, { pitch: 7, beats: 1 }, { pitch: 10, beats: 1 },
      { pitch: 12, beats: 2 }, { pitch: 10, beats: 1 }, { pitch: 7, beats: 1 },
      // Bar 3-4: stepping down to rest on D.
      { pitch: 8, beats: 1 }, { pitch: 7, beats: 1 }, { pitch: 5, beats: 1 }, { pitch: 8, beats: 1 },
      { pitch: 5, beats: 3 }, { pitch: null, beats: 1 },
      // Bar 5-6: the call again, reaching higher.
      { pitch: 7, beats: 1 }, { pitch: 10, beats: 1 }, { pitch: 15, beats: 2 },
      { pitch: 14, beats: 1 }, { pitch: 12, beats: 1 }, { pitch: 10, beats: 1 }, { pitch: 8, beats: 1 },
      // Bar 7-8: home to C.
      { pitch: 7, beats: 0.5 }, { pitch: 8, beats: 0.5 }, { pitch: 7, beats: 1 }, { pitch: 5, beats: 1 }, { pitch: 2, beats: 1 },
      { pitch: 3, beats: 3 }, { pitch: null, beats: 1 },
    ]),
  },
  {
    wave: 'triangle',
    gain: 0.3,
    notes: Object.freeze([
      { pitch: -21, beats: 2 }, { pitch: -14, beats: 2 },
      { pitch: -16, beats: 2 }, { pitch: -21, beats: 2 },
      { pitch: -16, beats: 2 }, { pitch: -14, beats: 2 },
      { pitch: -14, beats: 2 }, { pitch: -19, beats: 2 },
      { pitch: -21, beats: 2 }, { pitch: -17, beats: 2 },
      { pitch: -16, beats: 2 }, { pitch: -14, beats: 2 },
      { pitch: -21, beats: 2 }, { pitch: -14, beats: 2 },
      { pitch: -21, beats: 3 }, { pitch: null, beats: 1 },
    ]),
  },
]);

/** Tempo of the intro fanfare, in beats per minute. */
export const INTRO_BPM = 210;

const n = (pitch: number | null, beats: number): Note => ({ pitch, beats });

/** One bar of the intro's main drum groove: kick, hat, snare, hat, kick, kick, snare, hat. */
const GROOVE = [n(0, 0.5), n(2, 0.5), n(1, 0.5), n(2, 0.5), n(0, 0.5), n(0, 0.5), n(1, 0.5), n(2, 0.5)];

/**
 * The intro fanfare that opens an Arcade Session: an original eight-bar
 * piece in C major, written for Hexathlon (see CREDITS.md). It opens on a
 * snare roll and the "da-da-da DAH" pickup, struts through a bouncy,
 * syncopated tune, climbs in a call-and-answer sequence, then sprints for
 * the line with a run up to top E and a trill, landing on a held top C.
 * Four parts: a square-wave lead, a quieter square harmony mostly a third or
 * sixth below, an oom-pah triangle bass jumping octaves, and a synthesised
 * drum kit. Pitches in semitones from A4. Not based on any existing melody.
 */
export const INTRO_FANFARE: readonly SongPart[] = Object.freeze([
  {
    wave: 'square',
    gain: 0.18,
    notes: Object.freeze([
      // 1: snare roll, then da-da-da DAH.
      n(null, 2), n(-2, 0.5), n(-2, 0.25), n(-2, 0.25), n(3, 1),
      // 2: a bounce up to top C.
      n(7, 0.5), n(5, 0.5), n(7, 0.5), n(10, 0.5), n(15, 1), n(10, 1),
      // 3-4: the strut, stepping down home.
      n(12, 0.5), n(10, 0.5), n(7, 0.5), n(10, 0.5), n(12, 0.75), n(10, 0.25), n(7, 1),
      n(8, 0.5), n(7, 0.5), n(5, 0.5), n(7, 0.5), n(3, 1.5), n(null, 0.5),
      // 5-6: the call again, a step higher, and its answer.
      n(10, 0.5), n(10, 0.25), n(10, 0.25), n(15, 1), n(14, 0.5), n(12, 0.5), n(14, 0.5), n(17, 0.5),
      n(15, 0.5), n(14, 0.5), n(12, 0.5), n(10, 0.5), n(12, 0.5), n(8, 0.5), n(5, 1),
      // 7: the sprint for the line: a run up to top E, then a trill.
      n(7, 0.25), n(10, 0.25), n(15, 0.25), n(19, 0.25), n(17, 0.5), n(15, 0.5), n(17, 0.25), n(19, 0.25), n(17, 0.25), n(19, 0.25), n(17, 1),
      // 8: home to a held top C.
      n(15, 3), n(null, 1),
    ]),
  },
  {
    wave: 'square',
    gain: 0.09,
    notes: Object.freeze([
      n(null, 2), n(-5, 0.5), n(-5, 0.25), n(-5, 0.25), n(-2, 1),
      n(3, 0.5), n(2, 0.5), n(3, 0.5), n(7, 0.5), n(10, 1), n(7, 1),
      n(7, 1), n(3, 1), n(8, 1), n(3, 1),
      n(5, 1), n(2, 1), n(-2, 1.5), n(null, 0.5),
      n(7, 0.5), n(7, 0.25), n(7, 0.25), n(10, 1), n(10, 1), n(14, 1),
      n(12, 1), n(8, 1), n(8, 1), n(2, 1),
      n(3, 1), n(10, 1), n(14, 1), n(14, 1),
      n(10, 3), n(null, 1),
    ]),
  },
  {
    wave: 'triangle',
    gain: 0.3,
    notes: Object.freeze([
      n(null, 2), n(-26, 1), n(-26, 1),
      n(-21, 0.5), n(-9, 0.5), n(-26, 0.5), n(-14, 0.5), n(-21, 0.5), n(-9, 0.5), n(-26, 0.5), n(-14, 0.5),
      n(-24, 0.5), n(-12, 0.5), n(-17, 0.5), n(-29, 0.5), n(-28, 0.5), n(-16, 0.5), n(-21, 0.5), n(-9, 0.5),
      n(-26, 0.5), n(-14, 0.5), n(-19, 0.5), n(-31, 0.5), n(-21, 0.5), n(-26, 0.5), n(-21, 1),
      n(-21, 0.5), n(-9, 0.5), n(-26, 0.5), n(-14, 0.5), n(-26, 0.5), n(-14, 0.5), n(-26, 0.5), n(-22, 0.5),
      n(-28, 0.5), n(-16, 0.5), n(-24, 0.5), n(-12, 0.5), n(-19, 0.5), n(-31, 0.5), n(-26, 0.5), n(-22, 0.5),
      n(-21, 0.5), n(-17, 0.5), n(-14, 0.5), n(-9, 0.5), n(-26, 0.5), n(-22, 0.5), n(-19, 0.5), n(-14, 0.5),
      n(-21, 3), n(null, 1),
    ]),
  },
  {
    drum: true,
    gain: 0.16,
    notes: Object.freeze([
      // 1: a two-beat snare roll, then hits under the pickup.
      ...Array.from({ length: 8 }, () => n(1, 0.25)), n(0, 0.5), n(1, 0.25), n(1, 0.25), n(0, 1),
      // 2-7: the groove.
      ...Array.from({ length: 6 }, () => GROOVE).flat(),
      // 8: kick, a one-beat roll, and the final hit.
      n(0, 1), n(1, 0.25), n(1, 0.25), n(1, 0.25), n(1, 0.25), n(0, 1), n(null, 1),
    ]),
  },
]);

/** The intro fanfare's length in 60 Hz frames, so the Session's intro card lasts as long as it. */
export const INTRO_FRAMES = Math.ceil((INTRO_FANFARE[0].notes.reduce((sum, note) => sum + note.beats, 0) * 60 * 60) / INTRO_BPM);

/** The browser's audio, shared by the whole game. */
export const audio = createAudio(() => {
  const Ctor = globalThis.AudioContext ?? (globalThis as any).webkitAudioContext;
  return Ctor ? (new Ctor() as AudioContextLike) : null;
});

/** Sound effects and the announcer on the shared audio. */
export const sounds = createSounds(audio, voice);
