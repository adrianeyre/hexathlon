import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  CALIBRATION_DIR,
  INPUT_TRACE_SCHEMA,
  REFERENCE_DIR,
  REFERENCE_MARK_SCHEMA,
  TRACES_DIR,
  listJson,
  readJson,
} from '../calibration/files.ts';
import { checkReference, checkTrace, traceToFrameInputs } from '../calibration/types.ts';
import { validate } from '../calibration/validate.ts';

export type InputTrace = import('../calibration/types.ts').InputTrace;
export type ReferenceMark = import('../calibration/types.ts').ReferenceMark;

const EXAMPLES = join(CALIBRATION_DIR, 'examples');
const exampleTrace = (readJson(join(EXAMPLES, 'sprint-example-steady-10hz.trace.json')) as InputTrace);
const exampleReference = (readJson(join(EXAMPLES, 'sprint-example-steady-10hz.reference.json')) as ReferenceMark);

describe('example Input Trace and Reference Mark', () => {
  it('validate against the schemas', () => {
    assert.deepEqual(validate(INPUT_TRACE_SCHEMA, exampleTrace), []);
    assert.deepEqual(validate(REFERENCE_MARK_SCHEMA, exampleReference), []);
  });

  it('are internally consistent', () => {
    assert.deepEqual(checkTrace(exampleTrace), []);
    assert.deepEqual(checkReference(exampleReference, exampleTrace), []);
  });

  it('are marked synthetic so they can never be parity targets', () => {
    assert.equal(exampleTrace.source, 'synthetic');
    assert.equal(exampleReference.capture?.method, 'synthetic');
  });

  it('expand to one FrameInput per frame', () => {
    const frames = traceToFrameInputs(exampleTrace);
    assert.equal(frames.length, exampleTrace.frames);
    assert.deepEqual(frames[0], { frame: 0, edges: [{ player: 1, action: 'RUN_A', type: 'press' }] });
    assert.deepEqual(frames[1].edges, []);
    assert.deepEqual(frames[6].edges, [{ player: 1, action: 'RUN_B', type: 'press' }]);
    const total = frames.reduce((n, f) => n + f.edges.length, 0);
    assert.equal(total, exampleTrace.inputs.length);
  });
});

describe('schemas reject bad data', () => {
  const traceWith = (mutate: (t: any) => void) => {
    const t = structuredClone(exampleTrace);
    mutate(t);
    return validate(INPUT_TRACE_SCHEMA, t);
  };
  const referenceWith = (mutate: (r: any) => void) => {
    const r = structuredClone(exampleReference);
    mutate(r);
    return validate(REFERENCE_MARK_SCHEMA, r);
  };

  it('in traces', () => {
    assert.notDeepEqual(traceWith((t) => delete t.event), []);
    assert.notDeepEqual(traceWith((t) => (t.event = 'marathon')), []);
    assert.notDeepEqual(traceWith((t) => (t.cycle = 0)), []);
    assert.notDeepEqual(traceWith((t) => (t.players = 3)), []);
    assert.notDeepEqual(traceWith((t) => (t.formatVersion = 2)), []);
    assert.notDeepEqual(traceWith((t) => (t.id = 'Sprint/Bad Slug')), []);
    assert.notDeepEqual(traceWith((t) => (t.inputs[0].frame = 1.5)), []);
    assert.notDeepEqual(traceWith((t) => (t.inputs[0].action = 'PAUSE')), []);
    assert.notDeepEqual(traceWith((t) => (t.inputs[0].player = 0)), []);
    assert.notDeepEqual(traceWith((t) => (t.extra = true)), []);
  });

  it('in references', () => {
    assert.notDeepEqual(referenceWith((r) => (r.marks = [])), []);
    assert.notDeepEqual(referenceWith((r) => (r.marks[0].unit = 'metres')), []);
    assert.notDeepEqual(referenceWith((r) => (r.marks[0].value = -1)), []);
    assert.notDeepEqual(referenceWith((r) => delete r.marks[0].display), []);
    assert.notDeepEqual(referenceWith((r) => (r.measurements.bad = 'text')), []);
    assert.notDeepEqual(referenceWith((r) => (r.capture.date = 'yesterday')), []);
  });

  it('consistency checks catch what the schema cannot', () => {
    const t = structuredClone(exampleTrace);
    t.inputs.push({ frame: 0, player: 1, action: 'RUN_A', type: 'press' }); // out of order
    t.inputs.push({ frame: 9999, player: 2, action: 'ACTION', type: 'release' }); // past end, player 2, not held
    const problems = checkTrace(t);
    assert.ok(problems.some((p) => p.includes('before frame')));
    assert.ok(problems.some((p) => p.includes('past the end')));
    assert.ok(problems.some((p) => p.includes('player 2')));
    assert.ok(problems.some((p) => p.includes('released while not held')));

    const r = structuredClone(exampleReference);
    r.marks[0].value = null;
    r.event = 'hammer';
    const refProblems = checkReference(r, exampleTrace);
    assert.ok(refProblems.some((p) => p.includes('needs a value')));
    assert.ok(refProblems.some((p) => p.includes('does not match')));
  });
});

describe('validator', () => {
  it('refuses schema keywords it does not implement', () => {
    assert.throws(() => validate({ type: 'string', maxLength: 3 }, 'abc'), /maxLength/);
  });
});

describe('committed calibration data', () => {
  const traces = listJson(TRACES_DIR);
  const references = listJson(REFERENCE_DIR);

  for (const { id, path } of traces) {
    it(`trace ${id} is valid`, () => {
      const trace = (readJson(path) as InputTrace);
      assert.deepEqual(validate(INPUT_TRACE_SCHEMA, trace), []);
      assert.equal(trace.id, id, 'id matches the file path');
      assert.deepEqual(checkTrace(trace), []);
    });
  }

  for (const { id, path } of references) {
    it(`reference ${id} is valid and has a trace`, () => {
      const reference = (readJson(path) as ReferenceMark);
      assert.deepEqual(validate(REFERENCE_MARK_SCHEMA, reference), []);
      assert.equal(reference.trace, id, 'trace id matches the file path');
      const trace = traces.find((t) => t.id === id);
      assert.ok(trace, `calibration/traces/${id}.json exists`);
      assert.deepEqual(checkReference(reference, (readJson(trace.path) as InputTrace)), []);
    });
  }
});
