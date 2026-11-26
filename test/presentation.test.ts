import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import CALLOUTS from '../data/callouts.json' with { type: 'json' };
import { CELEBRATE, CHEER, DEJECTED } from '../src/art/athlete.ts';
import { ART } from '../src/art/colours.ts';
import { FLAG_FOUL, FLAG_VALID } from '../src/art/field.ts';
import { HAMMER_GROUND, fieldPoint } from '../src/art/hammer.ts';
import { JUDGE, MEASURER } from '../src/art/officials.ts';
import { TRACK, laneFeetY, laneTopY, trackBottom, trackShear } from '../src/art/stadium.ts';
import { createSounds } from '../src/audio.ts';
import { HAMMER_VIEW, hammerCamera, renderHammer } from '../src/render/hammer.ts';
import { LONG_JUMP_VIEW, longJumpCamera, renderLongJump } from '../src/render/long-jump.ts';
import { REACTION_TIMING, duoReactions, reactionFor, reactionPose, rivalBeatenAfter } from '../src/render/reaction.ts';
import { renderSprint } from '../src/render/sprint.ts';
import { EVENT_RENDERERS, EVENT_SOUNDS, createCatalogue } from '../src/scenes/catalogue.ts';
import { fieldSounds, sprintSounds } from '../src/scenes/event-sounds.ts';
import { PALETTE } from '../src/render/palette.ts';
import { FAILED_REACTION_FRAMES, LOSER_REACTION_FRAMES, REACTION_FRAMES } from '../src/scenes/event.ts';
import { rivalAfter } from '../src/sim/rival.ts';
import { registerScenes } from '../src/scenes/index.ts';
import { SceneManager } from '../src/scenes/manager.ts';
import { EVENT_IDS } from '../src/sim/events.ts';
import { EVENT_SIMS, SIM_PARAMS, eventStandard } from '../src/sim/registry.ts';
import { PHRASES, createVoice, isCallout } from '../src/voice.ts';
import { makeAttractTrace } from '../tools/make-attract-traces.ts';
import { RasterCtx } from '../tools/raster.ts';
import { fakeAudio, recordingSounds, testServices } from './helpers/fakes.ts';

export type AnySim = import('../src/sim/types.ts').EventSim<any>;

/**
 * Every state of a demo run, plus `extra` frames after it ends.
 */
function demoStates(id: import('../src/sim/types.ts').EventId, extra: number = 0) {
  const sim = (EVENT_SIMS[id] as AnySim);
  const trace = makeAttractTrace(id);
  let state = sim.init({ cycle: 1, players: 1 });
  const states = [state];
  for (let f = 0; f < trace.frames + extra; f++) {
    state = sim.step(state, { frame: f, edges: trace.inputs.filter((i) => i.frame === f) });
    states.push(state);
  }
  return states;
}

/** A canvas stand-in recording every rectangle and its colour. */
function colourCtx() {
  const rects: { x: number; y: number; w: number; h: number; colour: string; }[] = [];
  return {
    rects,
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, colour: String(this.fillStyle) });
    },
  };
}

/** Whether two rasters differ anywhere. @param a @param b */
const differ = (a: RasterCtx, b: RasterCtx) => Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) !== 0;

describe('the athlete reacts once an Attempt is decided', () => {
  const standard = eventStandard('longJump', 1, 'normal');

  it('passing celebrates and failing hangs the head, by the Standard in Arcade', () => {
    const valid = { outcome: 'valid', mark: standard.value + 1 };
    assert.equal(reactionFor('longJump', valid, standard), 'celebrate');
    assert.equal(reactionFor('longJump', { ...valid, mark: standard.value - 1 }, standard), 'dejected', 'short of the Standard');
    assert.equal(reactionFor('longJump', { outcome: 'foul', mark: null }, standard), 'dejected');
    assert.equal(reactionFor('longJump', { outcome: null, mark: null }, standard), null, 'still under way');
    assert.equal(reactionFor('longJump', { ...valid, mark: 1 }, null), 'celebrate', 'any valid Mark in Practice');
    assert.equal(reactionFor('highJump', { outcome: 'valid' }, standard), 'celebrate', 'each clearance');
    assert.equal(reactionFor('highJump', { outcome: 'failed' }, standard), 'dejected');
  });

  it('a race: the Standard in Arcade, beating the Rival in Practice, and a false start fails', () => {
    const sprintStd = eventStandard('sprint', 1, 'normal');
    const race = { phase: 'done', outcome: 'valid', finishFrame: sprintStd.value - 10, rival: { finishFrame: sprintStd.value - 20 } };
    assert.equal(reactionFor('sprint', race, sprintStd), 'celebrate', 'qualified, even beaten');
    assert.equal(reactionFor('sprint', { ...race, finishFrame: sprintStd.value + 1 }, sprintStd), 'dejected');
    assert.equal(reactionFor('sprint', race, null), 'dejected', 'beaten in Practice');
    assert.equal(reactionFor('sprint', { ...race, rival: { finishFrame: null } }, null), 'celebrate');
    assert.equal(reactionFor('sprint', { ...race, outcome: 'falseStart', finishFrame: null }, sprintStd), 'dejected');
    assert.equal(reactionFor('sprint', { ...race, phase: 'race' }, sprintStd), null);
  });

  it('celebrating jumps up and down with the arms up; failing shakes the bowed head', () => {
    const { jump, landing, jumpHeight, shake } = REACTION_TIMING;
    const lifts = Array.from({ length: jump + landing }, (_, t) => reactionPose('celebrate', t).lift);
    assert.equal(Math.max(...lifts), jumpHeight);
    assert.equal(reactionPose('celebrate', jump / 2).sprite, CHEER, 'arms up in the air');
    assert.equal(reactionPose('celebrate', jump + 1).sprite, CELEBRATE[1], 'knees bent between jumps');
    assert.equal(reactionPose('dejected', 0).sprite, DEJECTED[0]);
    assert.equal(reactionPose('dejected', shake).sprite, DEJECTED[1], 'the head turns the other way');
    assert.equal(reactionPose('dejected', 0).lift, 0);
  });

  it('holds still with reduced flash', () => {
    assert.equal(reactionPose('celebrate', 7, true).lift, 0);
    assert.equal(reactionPose('dejected', REACTION_TIMING.shake, true).sprite, DEJECTED[0]);
  });

  it('the 100m draws the reaction after the finish', () => {
    const states = demoStates('sprint');
    const done = states[states.length - 1];
    const draw = (after: number) => {
      const ctx = new RasterCtx(320, 240);
      renderSprint((ctx as any), done, { after, standard: eventStandard('sprint', 1, 'normal') });
      return ctx;
    };
    assert.ok(differ(draw(0), draw(REACTION_TIMING.jump / 2)), 'the athlete jumps');
  });
});

describe('the Long Jump officials', () => {
  const states = demoStates('longJump', 200);
  const landed = states.find((s) => s.phase === 'landed');
  const done = states[states.length - 1];

  it('a judge sits at the board and raises a white flag for a valid jump, the foul flag for a foul', () => {
    const before = colourCtx();
    renderLongJump((before as any), states[50]);
    assert.ok(!before.rects.some((r) => r.colour === ART.foulFlag && r.w === 1 && r.h === 1 && r.y < 120), 'no flag while running');
    assert.equal(JUDGE[1].points.hand[1], 0, 'the flag arm is raised');
    for (const [state, flag] of ([[done, FLAG_VALID], [{ ...done, outcome: 'foul', foul: 'overstep', mark: null }, FLAG_FOUL]] as const)) {
      const ctx = new RasterCtx(320, 240);
      renderLongJump((ctx as any), state, { after: 0 });
      const plain = new RasterCtx(320, 240);
      renderLongJump((plain as any), { ...state, phase: 'flight' }, { after: null });
      assert.ok(differ(ctx, plain), `${flag.name} is shown`);
    }
  });

  it('the camera holds the board (and the judge) in view once the athlete reaches it', () => {
    const params = SIM_PARAMS.longJump;
    const boardScreenX = (s: any) => LONG_JUMP_VIEW.startX + params.foulLine - longJumpCamera(s, params);
    assert.ok(boardScreenX(done) >= LONG_JUMP_VIEW.boardScreenX - 1);
    assert.ok(LONG_JUMP_VIEW.startX + done.x - longJumpCamera(done, params) < 320, 'the athlete stays on screen');
  });

  it('the measurer walks the tape out to the mark, and the Mark shows once it is measured', () => {
    assert.ok(landed && landed.outcome === 'valid');
    const tapeAt = (after: number) => {
      const ctx = colourCtx();
      renderLongJump((ctx as any), done, { after });
      const tape = ctx.rects.filter((r) => r.colour === ART.tape && r.h === 1);
      return { length: Math.max(0, ...tape.map((r) => r.w)), ctx };
    };
    const early = tapeAt(LONG_JUMP_VIEW.measureDelay + 10);
    const late = tapeAt(REACTION_FRAMES + 45);
    assert.ok(late.length > early.length, 'the tape runs out as the measurer walks');
    const markRows = (ctx: ReturnType<typeof colourCtx>) => ctx.rects.filter((r) => r.colour === PALETTE.highlight).length;
    assert.ok(markRows(late.ctx) > markRows(early.ctx), 'the Mark appears once measured');
    assert.ok(MEASURER.walk.length === 2 && MEASURER.crouch.points.hand);
  });
});

describe('the Hammer overview', () => {
  const states = demoStates('hammer', 200);

  it('the sector fans out from the circle and is squashed by the view, so it fits on screen', () => {
    const [x0, y0] = fieldPoint(0, 100, 0);
    const [, yFar] = fieldPoint(0, 100, HAMMER_GROUND.sectorHalfAngle);
    const [, yNear] = fieldPoint(0, 100, -HAMMER_GROUND.sectorHalfAngle);
    assert.equal(x0, 100);
    assert.equal(y0, HAMMER_GROUND.circleY);
    assert.ok(yFar < y0 && yNear > y0, 'the far side is up the screen');
    assert.ok(y0 - yFar < 100 * Math.tan((HAMMER_GROUND.sectorHalfAngle * Math.PI) / 180), 'squashed by the tilt');
  });

  it('the camera follows the ball, then goes back to the circle for the reaction', () => {
    const flying = states.filter((s) => s.flight && !s.flight.landed);
    assert.ok(hammerCamera(flying[flying.length - 1]) > hammerCamera(flying[0]));
    const done = states[states.length - 1];
    assert.ok(hammerCamera(done, 0) > 0);
    assert.equal(hammerCamera(done, HAMMER_VIEW.backFrames), 0);
  });

  it('draws the ball with its shadow on the grass while it flies', () => {
    const flying = states.filter((s) => s.flight && !s.flight.landed);
    const ctx = colourCtx();
    renderHammer((ctx as any), flying[Math.floor(flying.length / 2)]);
    assert.ok(ctx.rects.some((r) => r.colour === ART.metal));
    assert.ok(ctx.rects.some((r) => r.colour === ART.shadow));
  });
});

describe('the running track in perspective', () => {
  it('lanes get taller towards the viewer and stay inside the track', () => {
    for (let i = 1; i < TRACK.lanes; i++) assert.ok(TRACK.laneHeights[i] > TRACK.laneHeights[i - 1]);
    for (let lane = 1; lane <= TRACK.lanes; lane++) {
      assert.ok(laneFeetY(lane) > laneTopY(lane) && laneFeetY(lane) < laneTopY(lane + 1), `lane ${lane}`);
    }
    assert.equal(trackBottom(), laneTopY(TRACK.lanes + 1));
  });

  it('lines across the track lean: further right at the far side, left at the near side', () => {
    assert.ok(trackShear(TRACK.top) > 0);
    assert.ok(trackShear(trackBottom()) < 0);
    assert.ok(Math.abs(trackShear((TRACK.top + trackBottom()) / 2)) <= 1);
  });
});

describe('the announcer', () => {
  it('has a phrase for every callout the game makes, and every Event name', () => {
    for (const id of ['onYourMarks', 'getSet', 'falseStart', 'foul', 'failed', 'qualify', 'notQualified', 'newRecord', 'gameOver', 'player1', 'player2', ...EVENT_IDS]) {
      assert.ok(isCallout(id), id);
      assert.ok(PHRASES[(id as keyof typeof PHRASES)].length > 0);
    }
    assert.equal(CALLOUTS.provisional, true, 'until the wording is checked against a capture');
  });

  it('speaks through speech synthesis, following mute, volume and the setting', () => {
    const spoken: any[] = [];
    let cancelled = 0;
    const voice = createVoice(
      () => ({ speak: (u) => spoken.push(u), cancel: () => cancelled++ }),
      (text) => ({ text, volume: 1, rate: 1, pitch: 1, lang: '' }),
    );
    voice.setVolume(0.5);
    assert.ok(voice.say('onYourMarks'));
    assert.equal(spoken[0].text, PHRASES.onYourMarks);
    assert.equal(spoken[0].volume, 0.5);
    assert.ok(!voice.say(('nonsense' as any)));
    voice.setMuted(true);
    assert.ok(!voice.say('foul'));
    assert.ok(cancelled > 0, 'muting stops speech');
    voice.setMuted(false);
    voice.setEnabled(false);
    assert.ok(!voice.say('foul'));
    voice.setEnabled(true);
    voice.setVolume(0);
    assert.ok(!voice.say('foul'));
    assert.equal(spoken.length, 1);
  });

  it('cancel stops speech at once and silences anything still queued', () => {
    const spoken: any[] = [];
    let cancelled = 0;
    const voice = createVoice(
      () => ({ speak: (u) => spoken.push(u), cancel: () => cancelled++ }),
      (text) => ({ text, volume: 1, rate: 1, pitch: 1, lang: '' }),
    );
    voice.say('sprint');
    voice.say('onYourMarks');
    voice.cancel();
    assert.equal(cancelled, 1);
    assert.deepEqual(spoken.map((u) => u.volume), [0, 0], 'queued phrases cannot start after quitting');
  });

  it('the starter\'s calls interrupt a long Event name, so "Get set" is heard before the gun', () => {
    const spoken: any[] = [];
    let cancelled = 0;
    const voice = createVoice(
      () => ({ speak: (u) => spoken.push(u), cancel: () => cancelled++ }),
      (text) => ({ text, volume: 1, rate: 1, pitch: 1, lang: '' }),
    );
    voice.say('sprint');
    assert.equal(cancelled, 0, 'an ordinary callout waits its turn');
    voice.say('getSet', { interrupt: true });
    assert.equal(cancelled, 1, 'the start call cuts in');
    assert.equal(spoken[0].volume, 0, 'the Event name is silenced');
    assert.equal(spoken[1].text, PHRASES.getSet);
  });

  it('the scene manager tells listeners which scene became active', () => {
    const manager = new SceneManager({ a: { step() {}, render() {} }, b: { step() {}, render() {} } });
    const seen: string[] = [];
    manager.onChange((name) => seen.push(name));
    manager.change('a');
    manager.change('b');
    assert.deepEqual(seen, ['a', 'b']);
  });

  it('is silent where there is no speech synthesis', () => {
    const voice = createVoice(() => null, () => ({ volume: 1, rate: 1, pitch: 1, lang: '' }));
    assert.equal(voice.say('foul'), false);
    voice.cancel();
  });

  it('Sounds pass callouts to the announcer, and work without one', () => {
    const said: string[] = [];
    const { audio } = fakeAudio();
    createSounds(audio, ({ say: (id: string) => said.push(id), cancel() {} } as any)).say('getSet');
    assert.deepEqual(said, ['getSet']);
    createSounds(audio).say('getSet');
  });

  it('the starter calls "On your marks", "Get set", then the gun; a false start is called', () => {
    const sounds = recordingSounds();
    const sim = (EVENT_SIMS.sprint as AnySim);
    let state = sim.init({ cycle: 1, players: 1 });
    for (let f = 0; f < SIM_PARAMS.sprint.startSignalFrame + 2; f++) {
      const input = { frame: f, edges: [] };
      const next = sim.step(state, input);
      sprintSounds(state, next, input, sounds);
      state = next;
    }
    const order = sounds.played.filter((p) => p === 'say:onYourMarks' || p === 'say:getSet' || p === 'pistol');
    assert.deepEqual(order, ['say:onYourMarks', 'say:getSet', 'pistol']);
    const early = recordingSounds();
    const fresh = sim.init({ cycle: 1, players: 1 });
    const press = { frame: 0, edges: [{ player: 1, action: 'RUN_A', type: 'press' }] };
    sprintSounds(fresh, sim.step(fresh, (press as any)), (press as any), early);
    assert.ok(early.played.includes('say:falseStart'));
  });

  it('calls "Foul" for a foul in the field Events', () => {
    const sounds = recordingSounds();
    const base = { phase: 'runup', outcome: null, meter: { value: 0 } };
    fieldSounds(base, { ...base, phase: 'landed', outcome: 'foul' }, { frame: 0, edges: [] }, sounds);
    assert.ok(sounds.played.includes('say:foul'));
  });

  it('the event scene names the Event, holds for the reaction, and calls "Qualify" on reaching the Standard', () => {
    const services = testServices({ catalogue: createCatalogue(EVENT_SIMS, EVENT_RENDERERS, EVENT_SOUNDS) });
    const manager = new SceneManager({});
    const scenes = registerScenes(manager, services);
    const entry = services.catalogue.events.find((e) => e.id === 'longJump');
    manager.change('event', { entry, mode: 'arcade' });
    assert.ok(services.sounds.played.includes('say:longJump'), 'the Event is named');
    manager.step({ frame: 0, edges: [{ player: 0, action: 'START', type: 'press' }] });
    const scene = (scenes.event as any);
    const demo = makeAttractTrace('longJump');
    let heldFor = 0;
    for (let i = 0; i < 3000 && manager.currentName === 'event'; i++) {
      const done = scene.state.phase === 'done';
      manager.step({ frame: i, edges: done ? [] : demo.inputs.filter((e) => e.frame === scene.attemptFrame) });
      if (done && manager.currentName === 'event') heldFor += 1;
    }
    assert.equal(manager.currentName, 'results');
    assert.ok(heldFor >= REACTION_FRAMES - 1, `held ${heldFor} frames for the reaction`);
    assert.ok(services.sounds.played.includes('say:qualify'), 'the demo jump qualifies');
  });

  it('holds on a failed Attempt for a few seconds, so the athlete is seen shaking their head before the game moves on', () => {
    const services = testServices({ catalogue: createCatalogue(EVENT_SIMS, EVENT_RENDERERS, EVENT_SOUNDS) });
    const manager = new SceneManager({});
    const scenes = registerScenes(manager, services);
    const entry = services.catalogue.events.find((e) => e.id === 'sprint');
    manager.change('event', { entry, mode: 'arcade' });
    manager.step({ frame: 0, edges: [{ player: 0, action: 'START', type: 'press' }] });
    const scene = (scenes.event as any);
    // Two false starts: run before the gun, twice.
    let heldFor = 0;
    for (let i = 0; i < 3000 && manager.currentName === 'event'; i++) {
      const done = scene.state.phase === 'done';
      const press: import('../src/sim/types.ts').InputEdge[] = !done && scene.attemptFrame % 4 === 0 ? [{ player: 1, action: scene.attemptFrame % 8 === 0 ? 'RUN_A' : 'RUN_B', type: 'press' }] : [];
      manager.step({ frame: i, edges: press });
      if (done && manager.currentName === 'event') heldFor += 1;
    }
    assert.equal(manager.currentName, 'results');
    assert.ok(heldFor >= FAILED_REACTION_FRAMES - 1, `held ${heldFor} frames for the head shake`);
    assert.ok(FAILED_REACTION_FRAMES >= 180, 'at least three seconds');
  });
});

describe('the loser of a race shakes their head before the game moves on', () => {
  for (const id of (['sprint', 'hurdles'] as const)) {
    it(`${id}: once the athlete wins, the scene holds until the Rival is over the line, then three seconds more`, () => {
      const services = testServices({ catalogue: createCatalogue(EVENT_SIMS, EVENT_RENDERERS, EVENT_SOUNDS) });
      const manager = new SceneManager({});
      const scenes = registerScenes(manager, services);
      const entry = services.catalogue.events.find((e) => e.id === id);
      manager.change('event', { entry, mode: 'practice' });
      const scene = (scenes.event as any);
      const demo = makeAttractTrace(id);
      let heldFor = 0;
      let finished: any = null;
      for (let i = 0; i < 5000 && manager.currentName === 'event'; i++) {
        const done = scene.state.phase === 'done';
        if (done && !finished) finished = scene.state;
        manager.step({ frame: i, edges: done ? [] : demo.inputs.filter((e) => e.frame === scene.attemptFrame) });
        if (done && manager.currentName === 'event') heldFor += 1;
      }
      assert.equal(manager.currentName, 'results');
      assert.equal(finished.outcome, 'valid');
      assert.equal(finished.rival.finishFrame, null, 'the demo beats the Rival');
      const rivalTime = (scenes.results as any).result.rival.value;
      const toLine = rivalTime - finished.raceFrame;
      assert.ok(toLine > 0);
      // The frame that moves on to the results isn't counted as held.
      assert.equal(heldFor, toLine + LOSER_REACTION_FRAMES - 1);
    });
  }

  it('the beaten Rival runs on to the line, exactly as its time is projected, then shakes its head', () => {
    const states = demoStates('sprint');
    const done = states[states.length - 1];
    const params = SIM_PARAMS.sprint;
    const result = (EVENT_SIMS.sprint as AnySim).getResult(done);
    const toLine = (result?.rival?.value as number) - done.raceFrame;
    const at = (after: number) => rivalAfter(done.rival, params.rival, done.cycle, done.raceFrame, after, params.distance);
    assert.equal(rivalBeatenAfter(done, at(toLine - 1)), null, 'still running');
    assert.equal(rivalBeatenAfter(done, at(toLine)), toLine, 'over the line');
    const draw = (after: number) => {
      const ctx = new RasterCtx(320, 240);
      renderSprint((ctx as any), done, { after });
      return ctx;
    };
    assert.ok(differ(draw(toLine + 1), draw(toLine + 1 + REACTION_TIMING.shake)), 'the head turns the other way');
  });

  it('in a two-player race the player beaten to the line shakes their head, even with the Standard reached', () => {
    const std = eventStandard('sprint', 1, 'normal');
    const runner = (finishFrame: number | null, outcome = 'valid') => ({ phase: 'done', outcome, finishFrame });
    assert.deepEqual(duoReactions('sprint', [runner(std.value - 20), runner(std.value - 10)], std), ['celebrate', 'dejected']);
    assert.deepEqual(duoReactions('sprint', [runner(std.value + 20), runner(std.value - 10)], std), ['dejected', 'celebrate']);
    assert.deepEqual(duoReactions('sprint', [runner(std.value - 10), runner(std.value - 10)], std), ['celebrate', 'celebrate'], 'a dead heat');
    assert.deepEqual(duoReactions('sprint', [runner(null, 'falseStart'), runner(std.value - 10)], std), ['dejected', 'celebrate']);
  });
});
