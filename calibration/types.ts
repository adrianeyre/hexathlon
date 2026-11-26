/**
 * JSDoc types for the calibration formats, matching the JSON schemas in
 * `calibration/schema/`, plus the semantic checks a schema can't express.
 * Usable from the sim and the replay harness alike (no DOM, no Node APIs).
 */

export type EventId = import('../src/sim/types.ts').EventId;
export type MarkUnit = import('../src/sim/types.ts').MarkUnit;
export type Outcome = import('../src/sim/types.ts').Outcome;
export type FrameInput = import('../src/sim/types.ts').FrameInput;
export type InputEdge = import('../src/sim/types.ts').InputEdge;

/** One press or release in an Input Trace. */
export interface TraceInput {
  /** 0-based frame index. */
  frame: number;
  player: 1 | 2;
  action: 'RUN_A' | 'RUN_B' | 'ACTION';
  type: 'press' | 'release';
}

/** An Input Trace (calibration/schema/input-trace.schema.json). */
export interface InputTrace {
  formatVersion: 1;
  /** '<event>/<slug>', matching its path under calibration/traces/. */
  id: string;
  event: EventId;
  /** 1-based. */
  cycle: number;
  players: 1 | 2;
  /** Length in frames. */
  frames: number;
  source: 'original' | 'synthetic';
  description?: string;
  /** Why it's known to fail and the issue tracking the rework. */
  expectedToFail?: string;
  /** 1-based Attempt number, field Events. */
  attempt?: number;
  /** High Jump bar height in the original's pixels. */
  barHeight?: number;
  inputs: TraceInput[];
}

/** One player's Mark in a Reference Mark. */
export interface ReferencePlayerMark {
  player: 1 | 2;
  outcome: Outcome;
  /** Sim units, null when there is no Mark. */
  value: number | null;
  unit: MarkUnit;
  /** Exactly what the original showed. */
  display: string | null;
}

/** A Reference Mark (calibration/schema/reference-mark.schema.json). */
export interface ReferenceMark {
  formatVersion: 1;
  /** Id of the Input Trace. */
  trace: string;
  event: EventId;
  marks: ReferencePlayerMark[];
  measurements?: Record<string, number | (number | null)[] | null>;
  units?: Record<string, string>;
  capture?: { date?: string, method?: 'frame-step' | 'synthetic', tool?: string, by?: string };
  notes?: string;
}

/**
 * Checks beyond the schema: frames in order and inside the trace, presses and
 * releases alternating per key, players within range.
 * @returns Problems found; empty when consistent.
 */
export function checkTrace(trace: InputTrace): string[] {
  const problems: string[] = [];
  if (!trace.id.startsWith(`${trace.event}/`)) problems.push(`id "${trace.id}" must start with "${trace.event}/"`);
  const down: Map<string, boolean> = new Map();
  let last = 0;
  trace.inputs.forEach((input, i) => {
    if (input.frame < last) problems.push(`inputs/${i}: frame ${input.frame} is before frame ${last}`);
    last = Math.max(last, input.frame);
    if (input.frame >= trace.frames) problems.push(`inputs/${i}: frame ${input.frame} is past the end (${trace.frames})`);
    if (input.player > trace.players) problems.push(`inputs/${i}: player ${input.player} but trace has ${trace.players}`);
    const key = `${input.player}:${input.action}`;
    const isDown = down.get(key) ?? false;
    if (input.type === 'press' && isDown) problems.push(`inputs/${i}: ${key} pressed while already held`);
    if (input.type === 'release' && !isDown) problems.push(`inputs/${i}: ${key} released while not held`);
    down.set(key, input.type === 'press');
  });
  return problems;
}

/**
 * Checks that a Reference Mark fits its trace.
 */
export function checkReference(reference: ReferenceMark, trace: InputTrace): string[] {
  const problems: string[] = [];
  if (reference.trace !== trace.id) problems.push(`trace "${reference.trace}" does not match "${trace.id}"`);
  if (reference.event !== trace.event) problems.push(`event "${reference.event}" does not match "${trace.event}"`);
  const players = reference.marks.map((m) => m.player).sort();
  const expected = trace.players === 2 ? [1, 2] : [1];
  if (players.join() !== expected.join()) problems.push(`marks for players ${players} but trace has ${expected}`);
  for (const mark of reference.marks) {
    if (mark.outcome === 'valid' && mark.value === null) problems.push(`player ${mark.player}: valid Mark needs a value`);
  }
  return problems;
}

/**
 * Expand a trace into the per-frame input the simulation steps with.
 * @returns One entry per frame, `trace.frames` long.
 */
export function traceToFrameInputs(trace: InputTrace): FrameInput[] {
  const frames: FrameInput[] = Array.from({ length: trace.frames }, (_, frame) => ({ frame, edges: [] }));
  for (const { frame, player, action, type } of trace.inputs) {
    if (frame < trace.frames) frames[frame].edges.push({ player, action, type });
  }
  return frames;
}
