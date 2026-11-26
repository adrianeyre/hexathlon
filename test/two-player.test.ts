import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PLAYER_1, PLAYER_2, RIVAL } from '../src/art/colours.ts';
import { EVENT_DUO_RENDERERS, EVENT_RENDERERS, EVENT_SOUNDS, createCatalogue } from '../src/scenes/catalogue.ts';
import { pointsLine } from '../src/scenes/event.ts';
import { registerScenes } from '../src/scenes/index.ts';
import { SceneManager } from '../src/scenes/manager.ts';
import { RESULTS_DELAY } from '../src/scenes/results.ts';
import { EVENT_SIMS, SIM_PARAMS } from '../src/sim/registry.ts';
import { activePlayers, createSession, currentEvent, recordEventFor } from '../src/sim/session.ts';
import { TWO_PLAYER, asPlayer, createDuoRace, nextTurn, parseTwoPlayerRules } from '../src/sim/two-player.ts';
import { makeAttractTrace } from '../tools/make-attract-traces.ts';
import { testServices } from './helpers/fakes.ts';

export type InputEdge = import('../src/sim/types.ts').InputEdge;

const DATA = JSON.parse(readFileSync(new URL('../data/two-player.json', import.meta.url), 'utf8'));
const STANDARD = ({ value: 100, unit: 'pixels' } as const);

function colourCtx() {
  const rects: { x: number; y: number; w: number; h: number; colour: string; }[] = [];
  return {
    rects,
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, colour: String(this.fillStyle) });
    },
    uses(c: string) {
      return rects.some((r) => r.colour === c);
    },
  };
}

/**
 * Run a sim with a function giving each frame's edges, until it finishes.
 */
function run(sim: import('../src/sim/types.ts').EventSim<any>, edgesAt: (frame: number) => InputEdge[], init: Partial<import('../src/sim/types.ts').EventInit> = {}) {
  let state = sim.init({ cycle: 1, players: 2, ...init });
  for (let frame = 0; frame < 6000 && !sim.getResult(state); frame++) state = sim.step(state, { frame, edges: edgesAt(frame) });
  return { state, result: sim.getResult(state) };
}

/**
 * Mash after the start signal: a press every `every` frames, alternating feet.
 * @param from  First frame to press on.
 */
const masher = (player: 1 | 2, every: number, from: number): (frame: number) => InputEdge[] => (frame) => {
  if (frame < from || (frame - from) % every !== 0) return [];
  const action = ((frame - from) / every) % 2 ? 'RUN_B' : 'RUN_A';
  return [
    { player, action, type: 'press' },
    { player, action, type: 'release' },
  ];
};

function game() {
  const services = testServices({ catalogue: createCatalogue(EVENT_SIMS, EVENT_RENDERERS, EVENT_SOUNDS) });
  const manager = new SceneManager({});
  const scenes = registerScenes(manager, services);
  const step = (extra: Partial<import('../src/scenes/manager.ts').SceneInput> = {}) => manager.step({ frame: 0, edges: [], ...extra });
  const start = () => step({ edges: [{ player: 0, action: 'START', type: 'press' }] });
  return { services, manager, scenes, step, start };
}

/**
 * Play the current two-player Event in the event scene with its demo trace,
 * replayed for both players in a race and for whoever's turn it is in a field Event.
 * @param [plays]  Which players press anything; the others stand still.
 * @returns  Whose turn each Attempt was, in order.
 */
function playTwoPlayer(g: ReturnType<typeof game>, plays: (player: 1 | 2) => boolean = () => true): (1 | 2)[] {
  const scene = (g.scenes.event as any);
  const demo = makeAttractTrace(currentEvent(scene.session));
  g.start(); // skip the intro card
  const turns: (1 | 2)[] = [];
  let lastFrame = -1;
  for (let i = 0; i < 60000 && g.manager.currentName === 'event'; i++) {
    const f = scene.attemptFrame;
    if (f === 0 && lastFrame !== 0) turns.push(scene.turn);
    lastFrame = f;
    const at = demo.inputs.filter((e) => e.frame === f);
    const who = ((scene.state?.runners ? [1, 2] : [scene.turn]) as (1 | 2)[]);
    g.step({ edges: who.filter(plays).flatMap((player) => at.map((e) => ({ player, action: e.action, type: e.type }))) });
  }
  return turns;
}

describe('two-player rules come from data (#58)', () => {
  it('data/two-player.json is provisional and parses', () => {
    assert.equal(DATA.provisional, true, 'provisional until #22 is captured');
    assert.deepEqual(TWO_PLAYER, parseTwoPlayerRules(DATA));
    assert.equal(TWO_PLAYER.fieldTurns, 'alternate');
    assert.equal(TWO_PLAYER.sessionEnds, 'allOut');
    assert.equal(Math.abs(TWO_PLAYER.lanes[1] - TWO_PLAYER.lanes[2]), 1, 'adjacent lanes');
  });

  it('rejects rules the game cannot play', () => {
    assert.throws(() => parseTwoPlayerRules({ ...DATA, fieldTurns: 'random' }));
    assert.throws(() => parseTwoPlayerRules({ ...DATA, sessionEnds: 'never' }));
    assert.throws(() => parseTwoPlayerRules({ ...DATA, lanes: { 1: 2, 2: 2 } }));
    assert.throws(() => parseTwoPlayerRules({ ...DATA, lanes: { 1: 3, 2: 9 } }));
  });

  it('the turn order follows the data', () => {
    assert.equal(nextTurn([1, 2], null, 'alternate'), 1);
    assert.equal(nextTurn([1, 2], 1, 'alternate'), 2);
    assert.equal(nextTurn([1, 2], 2, 'alternate'), 1);
    assert.equal(nextTurn([2], 2, 'alternate'), 2, 'player 1 has finished');
    assert.equal(nextTurn([1, 2], 1, 'consecutive'), 1);
    assert.equal(nextTurn([2], 1, 'consecutive'), 2);
    assert.equal(nextTurn([], 1, 'alternate'), null);
  });

  it('when the Session ends follows the data', () => {
    const one = recordEventFor(createSession('normal', 0, 2), [
      { player: 1, mark: null, qualified: false, points: 0 },
      { player: 2, mark: null, qualified: true, points: 10 },
    ], STANDARD);
    assert.equal(one.over, false, 'allOut: player 2 plays on');
    const any = recordEventFor(createSession('normal', 0, 2), [
      { player: 1, mark: null, qualified: false, points: 0 },
      { player: 2, mark: null, qualified: true, points: 10 },
    ], STANDARD, { ...TWO_PLAYER, sessionEnds: 'anyOut' });
    assert.equal(any.over, true);
  });
});

describe('two-player races: side by side, no Rival (#58)', () => {
  const sprint = createDuoRace((EVENT_SIMS.sprint as any));
  const signal = SIM_PARAMS.sprint.startSignalFrame;

  it('both players race in their own lanes and each gets a time; there is no Rival', () => {
    const { state, result } = run(sprint, (f) => [...masher(1, 4, signal + 1)(f), ...masher(2, 6, signal + 1)(f)]);
    assert.ok(result);
    assert.equal(result.rival, undefined, 'no Rival');
    const [p1, p2] = [1, 2].map((p) => result.marks.find((m) => m.player === p));
    assert.equal(p1?.outcome, 'valid');
    assert.equal(p2?.outcome, 'valid');
    assert.ok((p1?.value as number) < (p2?.value as number), 'the faster masher wins');
    assert.equal(state.phase, 'done');
  });

  it('only reads each player’s own keys', () => {
    const { result } = run(sprint, masher(1, 4, signal + 1), {});
    // Player 2 never presses, so the race never ends; stop it after a while.
    assert.equal(result, null);
  });

  it('a false start by either player sends both back to the blocks; too many disqualifies only that player', () => {
    let state = sprint.init({ cycle: 1, players: 2 });
    for (let f = 0; f < 50; f++) state = sprint.step(state, { frame: f, edges: [] });
    state = sprint.step(state, { frame: 50, edges: [{ player: 2, action: 'RUN_A', type: 'press' }] });
    assert.deepEqual(state.runners.map((r) => r.setFrame), [0, 0], 'both restart');
    assert.equal(state.runners[1].falseStarts, 1);
    assert.equal(state.runners[0].falseStarts, 0);
    for (let k = 0; k < SIM_PARAMS.sprint.falseStartsAllowed; k++) state = sprint.step(state, { frame: 51 + k, edges: [{ player: 2, action: 'RUN_B', type: 'press' }] });
    assert.equal(state.runners[1].outcome, 'falseStart');
    assert.notEqual(state.phase, 'done', 'player 1 still races');
    // Player 1 is back in the blocks too: mash from the next start signal.
    assert.equal(state.runners[0].setFrame, 0);
    const { result } = run({ ...sprint, init: () => state }, masher(1, 4, signal + 1));
    assert.deepEqual(result?.marks.map((m) => [m.player, m.outcome]), [[1, 'valid'], [2, 'falseStart']]);
  });

  it('the hurdles race works the same way, with each player’s own jumps', () => {
    const hurdles = createDuoRace((EVENT_SIMS.hurdles as any));
    const demo = makeAttractTrace('hurdles');
    const { result } = run(hurdles, (f) => demo.inputs.filter((e) => e.frame === f).flatMap((e) => [1, 2].map((player) => ({ player: (player as 1 | 2), action: e.action, type: e.type }))));
    assert.equal(result?.marks.length, 2);
    assert.equal(result?.marks[0].value, result?.marks[1].value, 'the same inputs give the same time');
    assert.equal(result?.rival, undefined);
  });

  it('draws both players in the two-player lanes in their own kits, not the Rival’s', () => {
    const { state } = run(sprint, (f) => [...masher(1, 4, signal + 1)(f), ...masher(2, 6, signal + 1)(f)]);
    for (const [id, s] of [['sprint', state], ['hurdles', createDuoRace((EVENT_SIMS.hurdles as any)).init({ cycle: 1, players: 2 })]]) {
      const ctx = colourCtx();
      EVENT_DUO_RENDERERS[(id as 'sprint' | 'hurdles')]?.((ctx as any), s, { lanes: TWO_PLAYER.lanes });
      assert.ok(ctx.uses(PLAYER_1.s), `${id}: player 1`);
      assert.ok(ctx.uses(PLAYER_2.s), `${id}: player 2`);
      assert.ok(!ctx.uses(RIVAL.s), `${id}: no Rival`);
    }
  });
});

describe('two-player field Events: alternate Attempts (#58)', () => {
  it('a one-player sim can be played with player 2’s keys, and the Mark is theirs', () => {
    const sim = asPlayer((EVENT_SIMS.longJump as any), 2);
    const demo = makeAttractTrace('longJump');
    const asP1 = run((EVENT_SIMS.longJump as any), (f) => demo.inputs.filter((e) => e.frame === f).map((e) => ({ ...e, player: (1 as 1) })));
    const asP2 = run(sim, (f) => demo.inputs.filter((e) => e.frame === f).map((e) => ({ ...e, player: (2 as 2) })));
    assert.equal(asP2.result?.marks[0].player, 2);
    assert.equal(asP2.result?.marks[0].value, asP1.result?.marks[0].value);
  });

  it('in Arcade the players take turns, Attempt by Attempt, each with their own series', () => {
    const g = game();
    const longJump = g.services.catalogue.events[1];
    g.manager.change('event', { entry: longJump, mode: 'arcade', session: { ...createSession('normal', 1, 2) } });
    // Nobody presses, so every Attempt ends without a Mark and both players take all three.
    const turns = playTwoPlayer(g, () => false);
    assert.deepEqual(turns, [1, 2, 1, 2, 1, 2]);
    assert.equal(g.manager.currentName, 'results');
  });
});

describe('two-player High Jump: turns at the rising bar (#58)', () => {
  it('the players alternate jumps, each with their own bar, until both are out', () => {
    const g = game();
    g.manager.change('event', { entry: g.services.catalogue.events[5], mode: 'arcade', session: createSession('normal', 5, 2) });
    const turns = playTwoPlayer(g, () => false);
    const per = SIM_PARAMS.highJump.attemptsPerHeight;
    assert.deepEqual(turns, Array.from({ length: 2 * per }, (_, i) => (((i % 2) + 1) as 1 | 2)), 'both fail every jump at the first height');
    assert.equal(g.manager.currentName, 'results');
    const results = (g.scenes.results as any);
    assert.deepEqual(results.session.played.map((e: any) => [e.player, e.qualified]), [[1, false], [2, false]]);
    assert.equal(results.session.over, true);
  });
});

describe('two-player Sessions: elimination, separate Points and High Scores (#58)', () => {
  it('a player who misses a Standard is out, and the Session ends when both are out', () => {
    let s = createSession('normal', 0, 2);
    s = recordEventFor(s, [
      { player: 1, mark: null, qualified: true, points: 300 },
      { player: 2, mark: null, qualified: false, points: 120 },
    ], STANDARD);
    assert.deepEqual(activePlayers(s), [1]);
    assert.equal(s.over, false);
    s = recordEventFor(s, [{ player: 1, mark: null, qualified: false, points: 50 }], STANDARD);
    assert.equal(s.over, true);
    assert.deepEqual(s.players.map((p) => [p.player, p.points, p.out]), [[1, 350, true], [2, 120, true]]);
    assert.equal(pointsLine(s), 'P1 OUT  P2 OUT');
  });

  it('TWO PLAYER on the main menu plays a 100m with both players, then scores each', () => {
    const g = game();
    g.manager.change('menu');
    const menuOrder = ['ARCADE', 'PRACTICE', 'TWO PLAYER'];
    for (let i = 0; i < menuOrder.indexOf('TWO PLAYER'); i++) g.step({ edges: [{ player: 0, action: 'DOWN', type: 'press' }] });
    g.start();
    assert.equal(g.manager.currentName, 'event');
    const scene = (g.scenes.event as any);
    assert.deepEqual(scene.players, [1, 2]);
    assert.ok(Array.isArray(scene.state.runners), 'one race for both');
    g.manager.render((colourCtx() as any), 0);
    playTwoPlayer(g);
    assert.equal(g.manager.currentName, 'results');
    const results = (g.scenes.results as any);
    assert.deepEqual(results.session.played.map((e: any) => e.player), [1, 2]);
    assert.ok(results.session.players.every((p: any) => p.points > 0), 'both scored');
    g.manager.render((colourCtx() as any), 0);
  });

  it('only players still in take part in the next Event', () => {
    const g = game();
    const out2 = { ...createSession('normal', 3, 2), players: [{ player: 1, points: 10, out: false }, { player: 2, points: 5, out: true }] };
    g.manager.change('event', { entry: g.services.catalogue.events[3], mode: 'arcade', session: out2 });
    const scene = (g.scenes.event as any);
    assert.deepEqual(scene.players, [1]);
    assert.equal(scene.state.runners, undefined, 'player 1 races the Rival alone');
  });

  it('each qualifying player enters their own initials, and both go on the table', () => {
    const g = game();
    const session = {
      ...createSession('normal', 0, 2),
      over: true,
      points: 400,
      players: [{ player: (1 as 1), points: 400, out: true }, { player: (2 as 2), points: 250, out: true }],
    };
    g.manager.change('results', { entry: g.services.catalogue.events[0], result: { marks: [] }, mode: 'arcade', session, players: [1, 2] });
    for (let k = 0; k <= RESULTS_DELAY; k++) g.step();
    g.start();
    assert.equal(g.manager.currentName, 'initials');
    const type = (letters: string) => {
      for (const ch of letters) g.step({ keys: [{ code: `Key${ch}`, type: 'press' }] });
      g.start();
    };
    type('AAA');
    assert.equal(g.manager.currentName, 'initials', 'now player 2');
    type('BBB');
    assert.equal(g.manager.currentName, 'highScores');
    const table = g.services.storage.getHighScores();
    assert.deepEqual(table.slice(0, 2).map((r) => [r.initials, r.points]), [['AAA', 400], ['BBB', 250]]);
  });
});
