#!/usr/bin/env node
/**
 * Capture plans for the reference-data issues #13–#22: for each issue, the
 * runs `capture.lua` plays in MAME, each one an Input Trace (exactly the
 * presses and releases, frame by frame), the savestate it starts from, and
 * the questions to answer about what the original showed afterwards.
 *
 *   pnpm capture:plans   (writes calibration/capture/plans.lua for capture.lua, not committed,
 *                         and makes calibration/captures/issue-<n>/ for the results, which are)
 *
 * The plans are built here, in tested JavaScript, so the Lua side only has to
 * replay data. Every trace is checked against the Input Trace schema.
 *
 * Assumptions to revisit after the first real session:
 * - Running Events: the start signal comes within `GO_FRAME` frames of frame
 *   zero, so mashing starts there (earlier would be a false start).
 * - Field Events accept input from frame zero, so the run-up starts at once.
 * - `RUN_FRAMES` is long enough for the original to show its result.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export type InputTrace = import('../types.ts').InputTrace;
export type TraceInput = import('../types.ts').TraceInput;
export type EventId = import('../../src/sim/types.ts').EventId;

/** Frame the running Events start mashing on: after the start signal (6 s at 60 Hz). */
export const GO_FRAME = 360;
/** How long each run lasts, in frames, by Event: long enough to reach the result. */
export const RUN_FRAMES = Object.freeze(
  ({ sprint: 1500, longJump: 900, javelin: 900, hurdles: 1800, hammer: 900, highJump: 900 } as Record<EventId, number>),
);
/** Every run is played this many times, to show whether the original has any randomness. */
export const REPEATS = 2;

/**
 * Savestates the runs start from, one per Event and Cycle (and two-player),
 * each saved paused on frame zero: the first frame the Event accepts input.
 * MAME names a savestate made from its menu by one key, so each is a letter.
 */
export const STATES: Readonly<Record<string, { key: string; event: EventId; cycle: number; players: 1 | 2; what: string; }>> = Object.freeze({
  'sprint-c1': { key: 'a', event: 'sprint', cycle: 1, players: 1, what: '100m, Cycle 1' },
  'longJump-c1': { key: 'b', event: 'longJump', cycle: 1, players: 1, what: 'Long Jump, Cycle 1, first Attempt' },
  'javelin-c1': { key: 'c', event: 'javelin', cycle: 1, players: 1, what: 'Javelin, Cycle 1, first Attempt' },
  'hurdles-c1': { key: 'd', event: 'hurdles', cycle: 1, players: 1, what: '110m Hurdles, Cycle 1' },
  'hammer-c1': { key: 'e', event: 'hammer', cycle: 1, players: 1, what: 'Hammer, Cycle 1, first Attempt' },
  'highJump-c1': { key: 'f', event: 'highJump', cycle: 1, players: 1, what: 'High Jump, Cycle 1, first Attempt at the first height' },
  'sprint-c2': { key: 'g', event: 'sprint', cycle: 2, players: 1, what: '100m, Cycle 2' },
  'sprint-c3': { key: 'h', event: 'sprint', cycle: 3, players: 1, what: '100m, Cycle 3' },
  'hurdles-c2': { key: 'i', event: 'hurdles', cycle: 2, players: 1, what: '110m Hurdles, Cycle 2' },
  'hurdles-c3': { key: 'j', event: 'hurdles', cycle: 3, players: 1, what: '110m Hurdles, Cycle 3' },
  'longJump-c2': { key: 'k', event: 'longJump', cycle: 2, players: 1, what: 'Long Jump, Cycle 2, first Attempt' },
  'longJump-c3': { key: 'l', event: 'longJump', cycle: 3, players: 1, what: 'Long Jump, Cycle 3, first Attempt' },
  'javelin-c2': { key: 'm', event: 'javelin', cycle: 2, players: 1, what: 'Javelin, Cycle 2, first Attempt' },
  'javelin-c3': { key: 'n', event: 'javelin', cycle: 3, players: 1, what: 'Javelin, Cycle 3, first Attempt' },
  'hammer-c2': { key: 'o', event: 'hammer', cycle: 2, players: 1, what: 'Hammer, Cycle 2, first Attempt' },
  'hammer-c3': { key: 'p', event: 'hammer', cycle: 3, players: 1, what: 'Hammer, Cycle 3, first Attempt' },
  'highJump-c2': { key: 'q', event: 'highJump', cycle: 2, players: 1, what: 'High Jump, Cycle 2, first height' },
  'highJump-c3': { key: 'r', event: 'highJump', cycle: 3, players: 1, what: 'High Jump, Cycle 3, first height' },
  'sprint-2p': { key: 's', event: 'sprint', cycle: 1, players: 2, what: 'Two players: 100m, Cycle 1' },
  'longJump-2p': { key: 't', event: 'longJump', cycle: 1, players: 2, what: "Two players: Long Jump, Cycle 1, player 1's first Attempt" },
  'hurdles-2p': { key: 'u', event: 'hurdles', cycle: 1, players: 2, what: 'Two players: 110m Hurdles, Cycle 1' },
});

export type StateName = keyof typeof STATES;

/** A question asked in the terminal after a run, answered with what the original showed. */
export type Question = { key: string, ask: string };

const Q: Record<string, Question> = {
  mark: { key: 'mark', ask: 'Mark shown, exactly as displayed (Enter if none)' },
  outcome: { key: 'outcome', ask: 'Outcome: valid, foul, false start or failed' },
  rival: { key: 'rival', ask: "Rival's time shown (Enter if none)" },
  points: { key: 'points', ask: 'Points awarded for this Event (Enter if none)' },
  standard: { key: 'standard', ask: 'Qualifying Standard shown for this Event' },
  qualified: { key: 'qualified', ask: 'Did it say you qualified? (y/n)' },
  skipped: { key: 'skipped', ask: 'If you qualified before your last Attempt, were the rest skipped? (y/n/-)' },
  bar: { key: 'bar', ask: 'Bar height shown' },
  cleared: { key: 'cleared', ask: 'Bar cleared? (y/n)' },
  lanes: { key: 'lanes', ask: 'Lanes, counting from the top: player 1, player 2 (e.g. 3,2)' },
  rivalIn: { key: 'rivalIn', ask: 'Was the Rival in the race too? (y/n)' },
  turns: { key: 'turns', ask: 'Order of turns, e.g. 1,2,1,2 or 1,1,1,2,2,2' },
  marks2: { key: 'marks', ask: 'Marks shown for player 1 and player 2 (e.g. 10.52, 11.03)' },
  elimination: { key: 'elimination', ask: 'If one player missed the Standard, what happened to them?' },
};

/**
 * Alternate or same-key presses, every `every` frames from `from` up to `to`.
 *   `every` can be a list of gaps used in turn, for an uneven rhythm. `hold` is how long each press is held.
 */
export function mash({ player = 1, every, from, to, keys = ['RUN_A', 'RUN_B'], hold = 1 }: { player?: 1 | 2; every: number | number[]; from: number; to: number; keys?: ('RUN_A' | 'RUN_B')[]; hold?: number; }): TraceInput[] {
  const gaps = Array.isArray(every) ? every : [every];
  const out: TraceInput[] = [];
  let i = 0;
  for (let f = from; f + hold < to; i++) {
    const action = keys[i % keys.length];
    out.push({ frame: f, player, action, type: 'press' }, { frame: f + hold, player, action, type: 'release' });
    f += Math.max(hold + 1, gaps[i % gaps.length]);
  }
  return out;
}

/**
 * Hold ACTION for `frames` frames from `from`.
 */
export const action = ({ player = 1, from, frames }: { player?: 1 | 2; from: number; frames: number; }): TraceInput[] => [
  { frame: from, player, action: 'ACTION', type: 'press' },
  { frame: from + Math.max(1, frames), player, action: 'ACTION', type: 'release' },
];

/** Inputs in frame order (stable for presses and releases on the same frame). @param inputs */
const sorted = (inputs: TraceInput[]) => inputs.map((e, i) => ({ e, i })).sort((a, b) => a.e.frame - b.e.frame || a.i - b.i).map(({ e }) => e);

export interface Run {
  /** The trace id: '<event>/<slug>'. */
  id: string;
  state: StateName;
  /** The savestate's key. */
  key: string;
  /** Short, for the on-screen overlay. */
  title: string;
  questions: Question[];
  trace: InputTrace;
}

export interface Plan {
  issue: number;
  title: string;
  /** Savestates the runs need. */
  states: StateName[];
  runs: Run[];
}

/**
 * One run, played `REPEATS` times.
 * @param slug  Without the Cycle; it's prefixed with c<cycle>.
 */
function run(state: StateName, slug: string, title: string, inputs: TraceInput[], questions: Question[]): Run[] {
  const s = STATES[state];
  const frames = RUN_FRAMES[s.event];
  return Array.from({ length: REPEATS }, (_, r) => {
    const id = `${s.event}/c${s.cycle}${s.players === 2 ? '-2p' : ''}-${slug}-r${r + 1}`;
    return {
      id,
      state,
      key: s.key,
      title,
      questions,
      trace: {
        formatVersion: 1,
        id,
        event: s.event,
        cycle: s.cycle,
        players: s.players,
        frames,
        source: 'original',
        description: `${title} (run ${r + 1} of ${REPEATS}), played by calibration/capture/capture.lua from savestate "${s.key}" (${s.what}).`,
        inputs: sorted(inputs.filter((e) => e.frame < frames)),
      },
    };
  });
}

/** Mash rates, as frames between presses: slow (~4/s), typical (~8/s), fast (12/s) and the maximum (every 2 frames). */
const RATES = ([
  ['4hz', 15],
  ['8hz', 8],
  ['12hz', 5],
  ['max', 2],
] as const);

/**
 * A field Event's run-up and take-off or release: mash at `rate`, then hold ACTION.
 */
function fieldRuns(state: StateName, questions: Question[]) {
  const end = RUN_FRAMES[STATES[state].event];
  return [
    // Take-off or release timing: one frame sweep in 30-frame steps, a medium hold.
    ...[90, 120, 150, 180, 210].flatMap((at) => run(state, `takeoff-${at}f`, `ACTION at frame ${at}, hold 16`, [...mash({ every: 8, from: 0, to: at }), ...action({ from: at, frames: 16 })], questions)),
    // Angle: the same take-off, ACTION held for longer and longer.
    ...[4, 10, 16, 24, 32, 40].flatMap((h) => run(state, `hold-${h}f`, `ACTION at 150, hold ${h}`, [...mash({ every: 8, from: 0, to: 150 }), ...action({ from: 150, frames: h })], questions)),
    // Run-up speed: the same take-off at each mash rate.
    ...RATES.map(([name, every]) => ([name, every] as const)).flatMap(([name, every]) =>
      run(state, `rate-${name}`, `Mash ${name}, ACTION at 150`, [...mash({ every, from: 0, to: 150 }), ...action({ from: 150, frames: 16 })], questions),
    ),
    // No ACTION at all: runs through the line (a foul?).
    ...run(state, 'no-action', 'Mash 8hz, never press ACTION', mash({ every: 8, from: 0, to: end - 1 }), questions),
  ];
}

export function buildPlans(): Plan[] {
  const sprintQ = [Q.mark, Q.outcome, Q.rival];
  const fieldQ = [Q.mark, Q.outcome];
  const go = GO_FRAME;
  return [
    {
      issue: 13,
      title: '100m Dash',
      states: ['sprint-c1'],
      runs: [
        ...RATES.flatMap(([name, every]) => run('sprint-c1', `mash-${name}`, `Mash ${name}`, mash({ every, from: go, to: RUN_FRAMES.sprint }), sprintQ)),
        ...run('sprint-c1', 'same-key-8hz', 'Same key only, 8hz', mash({ every: 8, from: go, to: RUN_FRAMES.sprint, keys: ['RUN_A'] }), sprintQ),
        ...run('sprint-c1', 'uneven', 'Uneven rhythm: 4 then 12 frames', mash({ every: [4, 12], from: go, to: RUN_FRAMES.sprint }), sprintQ),
        ...run('sprint-c1', 'held-presses', 'Mash 8hz, each press held 4 frames', mash({ every: 8, from: go, to: RUN_FRAMES.sprint, hold: 4 }), sprintQ),
        // Speed meter build-up then decay: mash for 3 s, stop for 2 s, mash again.
        ...run('sprint-c1', 'build-stop-build', 'Mash 3s, stop 2s, mash again', [...mash({ every: 5, from: go, to: go + 180 }), ...mash({ every: 5, from: go + 300, to: RUN_FRAMES.sprint })], sprintQ),
        ...run('sprint-c1', 'false-start-once', 'One press at frame 30, then mash after the signal', [...mash({ every: 8, from: 30, to: 32 }), ...mash({ every: 8, from: go + 240, to: RUN_FRAMES.sprint })], sprintQ),
        ...run('sprint-c1', 'false-start-twice', 'Presses at frame 30 and again at 300', [...mash({ every: 8, from: 30, to: 32 }), ...mash({ every: 8, from: 300, to: 302 }), ...mash({ every: 8, from: go + 540, to: RUN_FRAMES.sprint })], sprintQ),
        ...run('sprint-c1', 'no-input', 'No input at all', [], sprintQ),
      ],
    },
    { issue: 14, title: 'Long Jump', states: ['longJump-c1'], runs: fieldRuns('longJump-c1', fieldQ) },
    { issue: 15, title: 'Javelin Throw', states: ['javelin-c1'], runs: fieldRuns('javelin-c1', fieldQ) },
    {
      issue: 16,
      title: '110m Hurdles',
      states: ['hurdles-c1'],
      runs: [
        // Jump every k frames from a few starting offsets: some clear, some hit.
        ...[24, 30, 36, 42].flatMap((k) =>
          [0, 10].flatMap((offset) =>
            run('hurdles-c1', `jump-every-${k}f-at-${offset}`, `Mash 10hz, ACTION every ${k} from +${offset}`, [...mash({ every: 6, from: go, to: RUN_FRAMES.hurdles }), ...interval(go + 60 + offset, k, RUN_FRAMES.hurdles)], sprintQ),
          ),
        ),
        ...run('hurdles-c1', 'no-jumps', 'Mash 10hz, never jump (hits every hurdle)', mash({ every: 6, from: go, to: RUN_FRAMES.hurdles }), sprintQ),
        ...run('hurdles-c1', 'false-start', 'One press at frame 30, then mash', [...mash({ every: 8, from: 30, to: 32 }), ...mash({ every: 6, from: go + 240, to: RUN_FRAMES.hurdles })], sprintQ),
      ],
    },
    {
      issue: 17,
      title: 'Hammer Throw',
      states: ['hammer-c1'],
      runs: [
        ...RATES.flatMap(([name, every]) => run('hammer-c1', `spin-${name}`, `Spin ${name} for 4s, release at 240`, [...mash({ every, from: 0, to: 240 }), ...action({ from: 240, frames: 16 })], fieldQ)),
        ...[120, 180, 240, 300, 360].flatMap((at) => run('hammer-c1', `release-${at}f`, `Spin 8hz, release at ${at}`, [...mash({ every: 8, from: 0, to: at }), ...action({ from: at, frames: 16 })], fieldQ)),
        ...[4, 10, 16, 24, 32, 40].flatMap((h) => run('hammer-c1', `hold-${h}f`, `Spin 8hz, release at 240, hold ${h}`, [...mash({ every: 8, from: 0, to: 240 }), ...action({ from: 240, frames: h })], fieldQ)),
        ...run('hammer-c1', 'no-release', 'Spin 8hz, never release', mash({ every: 8, from: 0, to: RUN_FRAMES.hammer - 1 }), fieldQ),
      ],
    },
    { issue: 18, title: 'High Jump', states: ['highJump-c1'], runs: fieldRuns('highJump-c1', [Q.bar, Q.cleared, Q.mark]) },
    {
      issue: 19,
      title: 'Rival pace and behaviour',
      states: ['sprint-c1', 'sprint-c2', 'sprint-c3', 'hurdles-c1', 'hurdles-c2', 'hurdles-c3'],
      runs: (['sprint-c1', 'sprint-c2', 'sprint-c3', 'hurdles-c1', 'hurdles-c2', 'hurdles-c3'] as StateName[]).flatMap((state) => {
        const end = RUN_FRAMES[STATES[state].event];
        const jumps = STATES[state].event === 'hurdles' ? interval(go + 60, 30, end) : [];
        // Slow and fast, to see whether the Rival reacts to the player.
        return [
          ...run(state, 'rival-vs-4hz', 'Rival vs a slow player (4hz)', [...mash({ every: 15, from: go, to: end }), ...jumps], [Q.rival, Q.mark]),
          ...run(state, 'rival-vs-max', 'Rival vs a fast player (max)', [...mash({ every: 2, from: go, to: end }), ...jumps], [Q.rival, Q.mark]),
          ...run(state, 'rival-alone', 'Rival with no player input', [], [Q.rival]),
        ];
      }),
    },
    {
      issue: 20,
      title: 'Standards and Cycle scaling',
      states: Object.keys(STATES).filter((s) => /-c[123]$/.test(s)),
      // No input: just show each Event at each Cycle and ask for its Standard.
      runs: Object.keys(STATES)
        .filter((s) => /-c[123]$/.test(s))
        .flatMap((state) => run((state as StateName), 'standard', 'Read the Standard', [], [Q.standard, Q.skipped]).slice(0, 1)),
    },
    {
      issue: 21,
      title: 'Points conversion and Mark display',
      states: ['sprint-c1', 'longJump-c1', 'javelin-c1', 'hurdles-c1', 'hammer-c1', 'highJump-c1'],
      // A spread of Marks per Event, each with the Points it earned.
      runs: [
        ...RATES.flatMap(([name, every]) => run('sprint-c1', `points-${name}`, `Points: mash ${name}`, mash({ every, from: go, to: RUN_FRAMES.sprint }), [Q.mark, Q.points, Q.qualified])),
        ...RATES.flatMap(([name, every]) =>
          run('hurdles-c1', `points-${name}`, `Points: mash ${name}, jump every 30`, [...mash({ every, from: go, to: RUN_FRAMES.hurdles }), ...interval(go + 60, 30, RUN_FRAMES.hurdles)], [Q.mark, Q.points, Q.qualified]),
        ),
        ...((['longJump-c1', 'javelin-c1', 'hammer-c1', 'highJump-c1'] as StateName[])).flatMap((state) =>
          RATES.flatMap(([name, every]) => run(state, `points-${name}`, `Points: mash ${name}, ACTION at 150`, [...mash({ every, from: 0, to: 150 }), ...action({ from: 150, frames: 16 })], [Q.mark, Q.points, Q.qualified])),
        ),
      ],
    },
    {
      issue: 22,
      title: 'Two-player structure',
      states: ['sprint-2p', 'longJump-2p', 'hurdles-2p'],
      runs: [
        ...run('sprint-2p', 'race', 'P1 mashes 12hz, P2 mashes 4hz', [...mash({ player: 1, every: 5, from: go, to: RUN_FRAMES.sprint }), ...mash({ player: 2, every: 15, from: go, to: RUN_FRAMES.sprint })], [Q.lanes, Q.rivalIn, Q.marks2, Q.elimination]),
        ...run('hurdles-2p', 'race', 'P1 mashes 10hz and jumps, P2 mashes 4hz and never jumps', [...mash({ player: 1, every: 6, from: go, to: RUN_FRAMES.hurdles }), ...interval(go + 60, 30, RUN_FRAMES.hurdles), ...mash({ player: 2, every: 15, from: go, to: RUN_FRAMES.hurdles })], [Q.lanes, Q.rivalIn, Q.marks2]),
        // Field: both players press throughout, so whoever's turn it is plays the same Attempt.
        ...run('longJump-2p', 'turns', 'Both mash 8hz and press ACTION every 150 frames', [...mash({ player: 1, every: 8, from: 0, to: RUN_FRAMES.longJump }), ...mash({ player: 2, every: 8, from: 4, to: RUN_FRAMES.longJump }), ...interval(150, 150, RUN_FRAMES.longJump, 1), ...interval(150, 150, RUN_FRAMES.longJump, 2)], [Q.turns, Q.marks2]),
      ],
    },
  ];
}

/**
 * ACTION taps every `every` frames from `from`.
 */
function interval(from: number, every: number, to: number, player: 1 | 2 = 1): TraceInput[] {
  const out: TraceInput[] = [];
  for (let f = from; f + 6 < to; f += every) out.push(...action({ player, from: f, frames: 6 }));
  return out;
}

/** Lua string literal. @param s */
const luaString = (s: string) => JSON.stringify(s).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => `\\u{${h}}`);

/**
 * The plans as a Lua module for capture.lua: per issue, the runs with their
 * savestate key, overlay title, questions, frame count, inputs, and the
 * trace's JSON without its inputs (`"inputs":[]` last), which capture.lua
 * fills in.
 */
export function toLua(plans: Plan[]) {
  const lines = ['-- Generated by calibration/capture/plans.ts (pnpm capture:plans). Do not edit.', 'return {'];
  for (const plan of plans) {
    lines.push(`  [${luaString(String(plan.issue))}] = {`, `    title = ${luaString(plan.title)},`, '    states = {');
    for (const name of plan.states) lines.push(`      { key = ${luaString(STATES[name].key)}, what = ${luaString(STATES[name].what)} },`);
    lines.push('    },', '    runs = {');
    for (const r of plan.runs) {
      lines.push('      {');
      lines.push(`        id = ${luaString(r.id)}, key = ${luaString(r.key)}, title = ${luaString(r.title)}, frames = ${r.trace.frames}, players = ${r.trace.players},`);
      lines.push(`        questions = { ${r.questions.map((q) => `{ key = ${luaString(q.key)}, ask = ${luaString(q.ask)} }`).join(', ')} },`);
      lines.push(`        inputs = { ${r.trace.inputs.map((e) => `{ ${e.frame}, ${e.player}, ${luaString(e.action)}, ${e.type === 'press' ? 1 : 0} }`).join(', ')} },`);
      lines.push(`        trace = ${luaString(JSON.stringify({ ...r.trace, inputs: [] }))},`);
      lines.push('      },');
    }
    lines.push('    },', '  },');
  }
  lines.push('}', '');
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = new URL('./plans.lua', import.meta.url);
  const plans = buildPlans();
  writeFileSync(out, toLua(plans));
  for (const p of plans) mkdirSync(new URL(`../captures/issue-${p.issue}/`, import.meta.url), { recursive: true });
  for (const p of plans) console.log(`#${p.issue} ${p.title}: ${p.runs.length} runs from savestate${p.states.length > 1 ? 's' : ''} ${p.states.map((s) => STATES[s].key).join(', ')}`);
  console.log('Results will be saved to calibration/captures/issue-<n>/, to commit.');
}
