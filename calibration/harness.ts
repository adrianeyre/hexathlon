/**
 * Replay harness: runs Input Traces through the pure Event simulations and
 * compares the resulting Marks with Reference Marks (PRD 7.2, 7.4).
 * No DOM; runs in Node and the browser alike.
 */

import { traceToFrameInputs } from './types.ts';

export type InputTrace = import('./types.ts').InputTrace;
export type ReferenceMark = import('./types.ts').ReferenceMark;
export type EventId = import('../src/sim/types.ts').EventId;
export type EventResult = import('../src/sim/types.ts').EventResult;
export type MarkUnit = import('../src/sim/types.ts').MarkUnit;
export type SimRegistry = Partial<Record<EventId, import('../src/sim/types.ts').EventSim<any>>>;

/** Race times: ±0.05 s, i.e. ±3 frames at 60 Hz (PRD 7.4). */
export const TIME_TOLERANCE_FRAMES = 3;
/** Field distances and heights: ±1% of the Reference Mark (PRD 7.4). */
export const DISTANCE_TOLERANCE_RATIO = 0.01;

/**
 * Allowed absolute error for a Reference Mark value.
 */
export function toleranceFor(unit: MarkUnit, reference: number) {
  return unit === 'frames' ? TIME_TOLERANCE_FRAMES : Math.abs(reference) * DISTANCE_TOLERANCE_RATIO;
}

/**
 * Run one trace through a simulation for exactly `trace.frames` frames.
 */
export function runTrace(sim: import('../src/sim/types.ts').EventSim<any>, trace: InputTrace): EventResult | null {
  let state = sim.init({ cycle: trace.cycle, players: trace.players, attempt: trace.attempt ?? 1, ...(trace.barHeight === undefined ? {} : { barHeight: trace.barHeight }) });
  for (const input of traceToFrameInputs(trace)) state = sim.step(state, input);
  return sim.getResult(state);
}

export interface ComparisonRow {
  trace: string;
  /** Null for rows about the whole trace. */
  player: 1 | 2 | null;
  status: 'pass' | 'fail' | 'skip';
  /** Simulated outcome. */
  outcome: string | null;
  referenceOutcome: string | null;
  /** Simulated Mark in sim units. */
  mark: number | null;
  /** Reference Mark in sim units. */
  reference: number | null;
  /** mark - reference. */
  error: number | null;
  /** Allowed |error|. */
  tolerance: number | null;
  unit: MarkUnit | null;
  /** Why it was skipped or failed. */
  reason?: string;
}

const traceRow = (trace: string, status: 'fail' | 'skip', reason: string): ComparisonRow => ({
  trace,
  player: null,
  status,
  outcome: null,
  referenceOutcome: null,
  mark: null,
  reference: null,
  error: null,
  tolerance: null,
  unit: null,
  reason,
});

/**
 * Compare a simulated result with its Reference Mark, one row per player.
 */
export function compareResult(traceId: string, result: EventResult | null, reference: ReferenceMark): ComparisonRow[] {
  if (!result) return [traceRow(traceId, 'fail', 'simulation produced no result within the trace length')];
  return reference.marks.map((ref) => {
    const sim = result.marks.find((m) => m.player === ref.player);
    const row: ComparisonRow = {
      trace: traceId,
      player: ref.player,
      status: 'pass',
      outcome: sim?.outcome ?? null,
      referenceOutcome: ref.outcome,
      mark: sim?.value ?? null,
      reference: ref.value,
      error: null,
      tolerance: null,
      unit: ref.unit,
    };
    if (!sim) return { ...row, status: 'fail', reason: `no Mark for player ${ref.player}` };
    if (sim.unit !== ref.unit) return { ...row, status: 'fail', reason: `unit ${sim.unit} but reference is ${ref.unit}` };
    if (sim.outcome !== ref.outcome) return { ...row, status: 'fail', reason: 'outcome differs' };
    if (ref.value === null || sim.value === null) {
      return ref.value === sim.value ? row : { ...row, status: 'fail', reason: 'one Mark is missing' };
    }
    const error = sim.value - ref.value;
    const tolerance = toleranceFor(ref.unit, ref.value);
    // Tiny epsilon so a value exactly on the boundary isn't failed by float rounding.
    const pass = Math.abs(error) <= tolerance + 1e-9;
    return { ...row, error, tolerance, status: pass ? 'pass' : 'fail', ...(pass ? {} : { reason: 'out of tolerance' }) };
  });
}

export interface TraceCase {
  id: string;
  trace: InputTrace;
  /** Null if no reference file exists. */
  reference: ReferenceMark | null;
}

/**
 * Run and compare one trace.
 */
export function checkCase({ id, trace, reference }: TraceCase, sims: SimRegistry): ComparisonRow[] {
  if (trace.source !== 'original') return [traceRow(id, 'skip', 'synthetic trace, not a parity target')];
  const sim = sims[trace.event];
  if (!sim) return [traceRow(id, 'skip', `no simulation for ${trace.event} yet`)];
  if (!reference) return [traceRow(id, 'fail', 'no Reference Mark')];
  const rows = compareResult(id, runTrace(sim, trace), reference);
  if (trace.expectedToFail === undefined) return rows;
  // Known model difference with a rework issue: don't fail the normal run (strict mode still does).
  return rows.map((r) => (r.status === 'fail' ? { ...r, status: 'skip', reason: `expected to fail: ${trace.expectedToFail} (${r.reason})` } : r));
}

/**
 * What stops a strict parity run passing, beyond failing rows: an Event that has
 * a simulation but no captured (`source: "original"`) traces passes vacuously, and
 * a trace marked `expectedToFail` is parity not yet reached (PRD 7.3; #62 sign-off).
 * @returns  One line per problem; empty when strict mode passes.
 */
export function strictProblems(cases: readonly TraceCase[], sims: SimRegistry): string[] {
  const captured = cases.filter((c) => c.trace.source === 'original');
  const problems: string[] = [];
  for (const event of (Object.keys(sims) as EventId[])) {
    if (sims[event] && !captured.some((c) => c.trace.event === event)) problems.push(`${event}: has a simulation but no captured traces`);
  }
  for (const c of captured) {
    if (c.trace.expectedToFail !== undefined) problems.push(`${c.id}: marked as expected to fail (${c.trace.expectedToFail})`);
  }
  return problems;
}

const num = (n: number | null) => (n === null ? '-' : Number.isInteger(n) ? String(n) : n.toFixed(2));

/**
 * Plain-text diff report.
 */
export function formatReport(rows: ComparisonRow[]) {
  if (rows.length === 0) return 'No Input Traces found under calibration/traces/.';
  const header = ['status', 'trace', 'player', 'mark', 'reference', 'error', 'tolerance', 'unit', 'note'];
  const body = rows.map((r) => [
    r.status.toUpperCase(),
    r.trace,
    r.player === null ? '-' : `P${r.player}`,
    r.outcome && r.outcome !== 'valid' ? `${num(r.mark)} (${r.outcome})` : num(r.mark),
    r.referenceOutcome && r.referenceOutcome !== 'valid' ? `${num(r.reference)} (${r.referenceOutcome})` : num(r.reference),
    r.error === null ? '-' : `${r.error > 0 ? '+' : ''}${num(r.error)}`,
    r.tolerance === null ? '-' : `±${num(r.tolerance)}`,
    r.unit ?? '-',
    r.reason ?? '',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const r of rows) counts[r.status] += 1;
  return [
    line(header),
    line(widths.map((w) => '-'.repeat(w))),
    ...body.map(line),
    '',
    `${counts.pass} passed, ${counts.fail} failed, ${counts.skip} skipped`,
  ].join('\n');
}
