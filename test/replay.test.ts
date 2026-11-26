import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatReport, checkCase, compareResult, runTrace, strictProblems, toleranceFor } from '../calibration/harness.ts';
import { loadCases, runComparison } from '../calibration/compare.ts';
import { EVENT_SIMS } from '../src/sim/registry.ts';
import { placeholderSim } from '../src/sim/placeholder.ts';

export type InputTrace = import('../calibration/types.ts').InputTrace;
export type ReferenceMark = import('../calibration/types.ts').ReferenceMark;

// The parity gate: every committed Input Trace is replayed against its
// Reference Mark. Traces for Events without a simulation are skipped.
describe('parity: Input Traces vs Reference Marks', () => {
  const cases = loadCases();
  it('diff report', (t) => {
    const rows = cases.flatMap((c) => checkCase(c, EVENT_SIMS));
    t.diagnostic(`\n${formatReport(rows)}`);
  });
  for (const c of cases) {
    const rows = checkCase(c, EVENT_SIMS);
    const skip = rows.every((r) => r.status === 'skip') ? rows[0].reason : false;
    it(c.id, { skip }, () => {
      for (const row of rows) {
        assert.notEqual(
          row.status,
          'fail',
          `${row.trace} P${row.player ?? '-'}: ${row.reason} (mark ${row.mark}, reference ${row.reference}, error ${row.error}, tolerance ±${row.tolerance})`,
        );
      }
    });
  }
});

/**
 * A synthetic, original-sourced trace for the placeholder sim, standing in for
 * a real Event so the harness itself can be tested.
 * @param pressEvery  Frames between presses.
 */
function placeholderTrace(pressEvery: number): InputTrace {
  const inputs: InputTrace['inputs'] = [];
  for (let f = 0, i = 0; f < 600; f += pressEvery, i++) {
    const action = i % 2 ? 'RUN_B' : 'RUN_A';
    inputs.push({ frame: f, player: 1, action, type: 'press' }, { frame: f + 1, player: 1, action, type: 'release' });
  }
  return {
    formatVersion: 1,
    id: 'sprint/test-fixture',
    event: 'sprint',
    cycle: 1,
    players: 1,
    frames: 700,
    source: 'original',
    inputs,
  };
}

const referenceOf = (value: number | null, outcome: 'valid' | 'foul' = 'valid'): ReferenceMark => ({
  formatVersion: 1,
  trace: 'sprint/test-fixture',
  event: 'sprint',
  marks: [{ player: 1, outcome, value, unit: 'frames', display: null }],
});

describe('replay harness', () => {
  const sims = { sprint: placeholderSim };
  const trace = placeholderTrace(4);
  const simulated = runTrace(placeholderSim, trace)?.marks[0].value ?? -1;

  it('runs a trace through init/step/getResult', () => {
    assert.ok(simulated > 0);
    assert.equal(runTrace(placeholderSim, trace)?.marks[0].value, simulated, 'deterministic');
  });

  it('passes within tolerance and reports the diff', () => {
    const rows = checkCase({ id: trace.id, trace, reference: referenceOf(simulated + 3) }, sims);
    assert.equal(rows[0].status, 'pass');
    assert.equal(rows[0].error, -3);
    assert.equal(rows[0].tolerance, 3);
  });

  it('fails out of tolerance', () => {
    const rows = checkCase({ id: trace.id, trace, reference: referenceOf(simulated + 4) }, sims);
    assert.equal(rows[0].status, 'fail');
    assert.match(formatReport(rows), /FAIL.*sprint\/test-fixture.*out of tolerance/);
  });

  it('fails a mismatched outcome', () => {
    const rows = checkCase({ id: trace.id, trace, reference: referenceOf(null, 'foul') }, sims);
    assert.equal(rows[0].status, 'fail');
  });

  it('fails a trace with no Reference Mark', () => {
    assert.equal(checkCase({ id: trace.id, trace, reference: null }, sims)[0].status, 'fail');
  });

  it('fails when the sim never finishes', () => {
    const short = { ...trace, frames: 10 };
    assert.equal(checkCase({ id: trace.id, trace: short, reference: referenceOf(simulated) }, sims)[0].status, 'fail');
  });

  it('skips Events without a simulation', () => {
    const rows = checkCase({ id: trace.id, trace, reference: referenceOf(simulated) }, {});
    assert.equal(rows[0].status, 'skip');
    assert.match(rows[0].reason ?? '', /no simulation/);
  });

  it('skips synthetic traces', () => {
    const rows = checkCase({ id: trace.id, trace: { ...trace, source: 'synthetic' }, reference: null }, sims);
    assert.equal(rows[0].status, 'skip');
  });

  it('uses the PRD 7.4 tolerances', () => {
    assert.equal(toleranceFor('frames', 640), 3);
    assert.equal(toleranceFor('pixels', 250), 2.5);
    const ref = { ...referenceOf(250), marks: [{ player: (1 as 1), outcome: ('valid' as 'valid'), value: 250, unit: ('pixels' as 'pixels'), display: null }] };
    const at = (v: number) =>
      compareResult('x', { marks: [{ player: 1, outcome: 'valid', value: v, unit: 'pixels' }] }, ref)[0].status;
    assert.equal(at(252.5), 'pass');
    assert.equal(at(247.5), 'pass');
    assert.equal(at(252.6), 'fail');
  });
});

describe('strict parity mode (--strict)', () => {
  const sims = { sprint: placeholderSim };
  const trace = placeholderTrace(4);
  const simulated = runTrace(placeholderSim, trace)?.marks[0].value ?? -1;
  const captured = { id: trace.id, trace, reference: referenceOf(simulated) };

  it('passes when every Event with a simulation has a captured trace that matches', () => {
    assert.deepEqual(strictProblems([captured], sims), []);
    assert.equal(runComparison([captured], sims, { strict: true }).ok, true);
  });

  it('fails when an Event with a simulation has no captured traces', () => {
    const run = runComparison([], sims, { strict: true });
    assert.equal(run.ok, false);
    assert.match(run.report, /sprint: has a simulation but no captured traces/);
    assert.equal(runComparison([], sims).ok, true, 'the normal run still passes with nothing to check');
  });

  it("doesn't count synthetic traces as captured", () => {
    const synthetic = { ...captured, trace: { ...trace, source: ('synthetic' as const) } };
    assert.equal(strictProblems([synthetic], sims).length, 1);
  });

  it('fails when a trace is marked as expected to fail, which the normal run skips', () => {
    const marked = { ...captured, trace: { ...trace, expectedToFail: '#80: model differs' }, reference: referenceOf(simulated + 10) };
    const normal = checkCase(marked, sims);
    assert.equal(normal[0].status, 'skip');
    assert.match(normal[0].reason ?? '', /expected to fail: #80/);
    assert.equal(runComparison([marked], sims).ok, true);
    const strict = runComparison([marked], sims, { strict: true });
    assert.equal(strict.ok, false);
    assert.match(strict.report, /marked as expected to fail \(#80: model differs\)/);
  });

  it('every registered simulation is checked', () => {
    assert.equal(strictProblems([], EVENT_SIMS).length, Object.keys(EVENT_SIMS).length);
  });

  it('is a pnpm script and not part of CI', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['compare:strict'], 'node calibration/compare.ts --strict');
    assert.doesNotMatch(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'), /--strict|compare:strict/);
  });
});

describe('simulation has no DOM dependencies', () => {
  const simDir = fileURLToPath(new URL('../src/sim/', import.meta.url));
  for (const name of readdirSync(simDir).filter((n) => n.endsWith('.js'))) {
    it(`src/sim/${name}`, () => {
      const source = readFileSync(join(simDir, name), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      assert.doesNotMatch(source, /\b(window|document|navigator|requestAnimationFrame|performance|localStorage|HTMLCanvasElement|CanvasRenderingContext2D)\b/);
      assert.doesNotMatch(source, /from\s+['"](?!\.\/|\.\.\/\.\.\/data\/[\w-]+\.json['"]\s+with\s+\{\s*type:\s*'json'\s*\})/, 'only imports sibling sim modules and the data files');
    });
  }
});
