#!/usr/bin/env node
/**
 * Replay every Input Trace under calibration/traces/ and print the diff
 * against its Reference Mark. Exits non-zero if any trace fails.
 *
 *   node calibration/compare.js            (pnpm compare)
 *   node calibration/compare.js --strict   (pnpm compare:strict)
 *
 * --strict also fails when an Event with a simulation has no captured traces,
 * or a trace is marked `expectedToFail`. It's for the parity sign-off (#62) and
 * isn't run in CI, which would fail until every capture has landed.
 *
 * `pnpm test` runs the same comparison through test/replay.test.js.
 */
import { pathToFileURL } from 'node:url';
import { EVENT_SIMS } from '../src/sim/registry.ts';
import { REFERENCE_DIR, TRACES_DIR, listJson, readJson } from './files.ts';
import { checkCase, formatReport, strictProblems } from './harness.ts';

export type TraceCase = import('./harness.ts').TraceCase;

/**
 * Load every trace and its reference (if any).
 */
export function loadCases(): TraceCase[] {
  const references = new Map(listJson(REFERENCE_DIR).map((r) => [r.id, r.path]));
  return listJson(TRACES_DIR).map(({ id, path }) => {
    const referencePath = references.get(id);
    return {
      id,
      trace: (readJson(path) as import('./types.ts').InputTrace),
      reference: referencePath ? (readJson(referencePath) as import('./types.ts').ReferenceMark) : null,
    };
  });
}

/** Run every case against the registered simulations. */
export function compareAll() {
  return loadCases().flatMap((c) => checkCase(c, EVENT_SIMS));
}

/**
 * The report and exit code for a run.
 */
export function runComparison(cases: readonly TraceCase[], sims: import('./harness.ts').SimRegistry, { strict = false }: { strict?: boolean; } = {}): { report: string; ok: boolean; } {
  const rows = cases.flatMap((c) => checkCase(c, sims));
  const problems = strict ? strictProblems(cases, sims) : [];
  const lines = [formatReport(rows)];
  if (strict) lines.push('', problems.length === 0 ? 'Strict: every Event with a simulation has captured traces, none expected to fail.' : ['Strict mode failed:', ...problems.map((p) => `- ${p}`)].join('\n'));
  return { report: lines.join('\n'), ok: !rows.some((r) => r.status === 'fail') && problems.length === 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { report, ok } = runComparison(loadCases(), EVENT_SIMS, { strict: process.argv.includes('--strict') });
  console.log(report);
  if (!ok) process.exitCode = 1;
}
