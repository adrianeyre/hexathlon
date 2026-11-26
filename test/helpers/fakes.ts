/**
 * Test doubles shared by the scene and audio tests.
 */
import { createAudio, createSounds } from '../../src/audio.ts';
import { createCatalogue } from '../../src/scenes/catalogue.ts';
import { MemoryBackend, createStorage } from '../../src/storage.ts';

/** A Web Audio stand-in that records the nodes it makes. */
export class FakeAudioContext {
  state = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = { name: 'destination' };
  created: string[] = [];

  async resume() {
    this.state = 'running';
  }
  param(value = 0) {
    return {
      value,
      setValueAtTime(v: number) {
        this.value = v;
      },
      linearRampToValueAtTime(v: number) {
        this.value = v;
      },
      exponentialRampToValueAtTime(v: number) {
        this.value = v;
      },
      setTargetAtTime(v: number) {
        this.value = v;
      },
    };
  }
  node(kind: string, extra = {}) {
    this.created.push(kind);
    return { kind, connect() {}, start() {}, stop() {}, ...extra };
  }
  createGain() {
    return this.node('gain', { gain: this.param(1) });
  }
  createOscillator() {
    return this.node('oscillator', { type: 'sine', frequency: this.param(440) });
  }
  createBufferSource() {
    return this.node('bufferSource', { buffer: null, loop: false });
  }
  createBiquadFilter() {
    return this.node('filter', { type: 'lowpass', frequency: this.param(350), Q: this.param(1) });
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

/** A Sounds object that just records which effects were played. */
export function recordingSounds() {
  const played: string[] = [];
  const sounds = new Proxy(({} as import('../../src/audio.ts').Sounds), {
    // The announcer's callouts are recorded as `say:<id>`.
    get: (_, name) => (name === 'played' ? played : (id: unknown) => played.push(name === 'say' ? `say:${id}` : String(name))),
  });
  return (sounds as import('../../src/audio.ts').Sounds & { played: string[] });
}

/**
 * Services for scene tests, backed by in-memory storage.
 */
export function testServices(overrides: Partial<import('../../src/scenes/services.ts').Services> = {}): import('../../src/scenes/services.ts').Services & { sounds: ReturnType<typeof recordingSounds>; } {
  const storage = createStorage(new MemoryBackend());
  let settings = storage.getSettings();
  let controls = storage.getControls();
  return ({
    storage,
    sounds: recordingSounds(),
    settings: {
      get: () => settings,
      update(changes: Partial<import('../../src/storage.ts').Settings>) {
        settings = storage.saveSettings(changes);
        return settings;
      },
    },
    controls: {
      get: () => controls,
      set(next: import('../../src/storage.ts').Controls) {
        controls = storage.saveControls(next);
        return controls;
      },
    },
    catalogue: createCatalogue({}),
    attract: [],
    touchOnly: false,
    ...overrides,
  } as any);
}

/** Real audio engine on a fake context. */
export function fakeAudio() {
  const ctx = new FakeAudioContext();
  const audio = createAudio(() => (ctx as any));
  return { ctx, audio, sounds: createSounds(audio) };
}

/** A canvas context that ignores drawing but records fillRect calls and text colours. */
export function fakeCtx() {
  const rects: [number, number, number, number][] = [];
  return {
    rects,
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push([x, y, w, h]);
    },
  };
}
