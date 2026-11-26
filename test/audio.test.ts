import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DRUM, FINISH_FANFARE, INTRO_BPM, INTRO_FANFARE, INTRO_FRAMES, RECORD_JINGLE, THEME, THEME_BPM, createAudio, createSounds, pitchToHz } from '../src/audio.ts';
import { FakeAudioContext, fakeAudio } from './helpers/fakes.ts';

describe('audio unlock', () => {
  it('creates and resumes the context on the Start gesture', async () => {
    const { ctx, audio } = fakeAudio();
    assert.equal(audio.running, false);
    assert.equal(await audio.unlock(), true);
    assert.equal(ctx.state, 'running');
    assert.equal(audio.running, true);
  });

  it('copes without Web Audio', async () => {
    assert.equal(await createAudio(() => null).unlock(), false);
    assert.equal(
      await createAudio(() => {
        throw new Error('blocked');
      }).unlock(),
      false,
    );
  });

  it('makes no sound, and no context, before the Start gesture', () => {
    let created = 0;
    const audio = createAudio(() => {
      created++;
      return null;
    });
    audio.tone({ freq: 440, duration: 0.1 });
    audio.noise({ duration: 0.1 });
    audio.setCrowd(1);
    audio.playMelody(FINISH_FANFARE);
    assert.equal(created, 0);
    const { ctx, sounds } = fakeAudio();
    sounds.pistol();
    sounds.footstep();
    sounds.crowd(1);
    sounds.finish();
    assert.deepEqual(ctx.created, []);
  });
});

describe('synth voices', () => {
  it('play tones and noise through the master gain once unlocked', async () => {
    const { ctx, audio, sounds } = fakeAudio();
    await audio.unlock();
    const base = ctx.created.length; // master and buses
    sounds.pistol();
    sounds.footstep(true);
    sounds.footstep(false);
    assert.ok(ctx.created.slice(base).includes('oscillator'));
    assert.ok(ctx.created.slice(base).includes('bufferSource'));
    sounds.crowd(0.5);
    sounds.crowd(1);
    const crowdSources = ctx.created.filter((k) => k === 'bufferSource').length;
    sounds.crowd(0.2);
    assert.equal(ctx.created.filter((k) => k === 'bufferSource').length, crowdSources, 'one looping crowd voice');
    sounds.finish();
    sounds.record();
    sounds.move();
    sounds.select();
    sounds.error();
    sounds.foul();
    audio.hush();
  });

  it('play melodies note by note', async () => {
    const { ctx, audio } = fakeAudio();
    await audio.unlock();
    const before = ctx.created.filter((k) => k === 'oscillator').length;
    const length = audio.playMelody(RECORD_JINGLE, { bpm: 120 });
    const notes = RECORD_JINGLE.filter((n) => n.pitch !== null).length;
    assert.equal(ctx.created.filter((k) => k === 'oscillator').length - before, notes);
    assert.ok(Math.abs(length - (0.02 + RECORD_JINGLE.reduce((t, n) => t + n.beats, 0) * 0.5)) < 1e-9);
  });

  it('tunes pitches from A4', () => {
    assert.equal(pitchToHz(0), 440);
    assert.equal(pitchToHz(12), 880);
  });
});

describe('volume and mute', () => {
  it('scale the master gain', async () => {
    const { audio } = fakeAudio();
    audio.setVolume(0.5);
    assert.equal(audio.volume, 0.5);
    audio.setVolume(3);
    assert.equal(audio.volume, 1);
    audio.setVolume(Number.NaN);
    assert.equal(audio.volume, 0);
    await audio.unlock();
    audio.setVolume(0.6);
    audio.setMuted(true);
    assert.equal(audio.muted, true);
  });
});

describe('songs and the theme', () => {
  it('play every part of a song together', async () => {
    const { ctx, audio } = fakeAudio();
    await audio.unlock();
    const before = ctx.created.filter((k) => k === 'oscillator').length;
    const length = audio.playSong(THEME, { bpm: THEME_BPM });
    const notes = THEME.flatMap((part) => part.notes).filter((n) => n.pitch !== null).length;
    assert.equal(ctx.created.filter((k) => k === 'oscillator').length - before, notes);
    assert.ok(length > 10 && length < 20, `${length} s`);
  });

  it('wait for the Start press when asked for before audio is unlocked', async () => {
    const { ctx, audio, sounds } = fakeAudio();
    sounds.theme();
    assert.equal(audio.songPending, true);
    assert.equal(ctx.created.length, 0, 'nothing made before the gesture');
    await audio.unlock();
    assert.equal(audio.songPending, false);
    assert.ok(ctx.created.includes('oscillator'), 'the theme starts on unlock');
  });

  it('start a waiting song as soon as the browser lets the context run, without another gesture', async () => {
    const listeners: (() => void)[] = [];
    let state = 'suspended';
    const ctx = (new FakeAudioContext() as any);
    Object.defineProperty(ctx, 'state', { get: () => state });
    ctx.resume = async () => {};
    ctx.addEventListener = (type: string, fn: () => void) => {
      if (type === 'statechange') listeners.push(fn);
    };
    const audio = createAudio(() => ctx);
    createSounds(audio).theme();
    assert.equal(await audio.unlock(), false, 'blocked until the browser allows it');
    assert.equal(audio.songPending, true);
    state = 'running';
    for (const fn of listeners) fn();
    assert.equal(audio.songPending, false);
    assert.ok(ctx.created.includes('oscillator'), 'the theme starts the moment audio runs');
  });

  it('forget a waiting song when the music is stopped', async () => {
    const { ctx, audio, sounds } = fakeAudio();
    sounds.theme();
    sounds.stopMusic();
    assert.equal(audio.songPending, false);
    await audio.unlock();
    assert.ok(!ctx.created.includes('oscillator'));
  });

  it('the intro fanfare: four parts (lead, harmony, bass, drums) lasting the same eight bars, and the intro card lasts as long', () => {
    const beats = INTRO_FANFARE.map((part) => part.notes.reduce((sum, n) => sum + n.beats, 0));
    assert.equal(new Set(beats).size, 1);
    assert.equal(beats[0], 32);
    assert.equal(INTRO_FANFARE.length, 4);
    assert.equal(INTRO_FANFARE.filter((p) => p.drum).length, 1);
    assert.equal(INTRO_FRAMES, Math.ceil((beats[0] * 3600) / INTRO_BPM));
    const drums = new Set(INTRO_FANFARE.find((p) => p.drum)?.notes.map((n) => n.pitch).filter((p) => p !== null));
    assert.deepEqual([...drums].sort(), [DRUM.kick, DRUM.snare, DRUM.hat]);
  });

  it('plays the intro fanfare as a song', async () => {
    const { ctx, audio, sounds } = fakeAudio();
    await audio.unlock();
    sounds.intro();
    // Every tuned note, kick and snare makes an oscillator; snares and hats make noise.
    const tuned = INTRO_FANFARE.filter((p) => !p.drum).flatMap((part) => part.notes).filter((n) => n.pitch !== null).length;
    const drums = (INTRO_FANFARE.find((p) => p.drum) as import('../src/audio.ts').SongPart).notes;
    const count = (d: number) => drums.filter((n) => n.pitch === d).length;
    assert.equal(ctx.created.filter((k) => k === 'oscillator').length, tuned + count(DRUM.kick) + count(DRUM.snare));
    assert.equal(ctx.created.filter((k) => k === 'bufferSource').length, count(DRUM.snare) + count(DRUM.hat));
  });

  it('the theme parts last the same number of beats, in whole bars', () => {
    const beats = THEME.map((part) => part.notes.reduce((sum, n) => sum + n.beats, 0));
    assert.equal(new Set(beats).size, 1);
    assert.equal(beats[0] % 4, 0);
  });
});
