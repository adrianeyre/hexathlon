#!/usr/bin/env node
/**
 * Check the captured results committed under calibration/captures/: what
 * capture.lua wrote for each issue, one folder per issue (`issue-13/` and so
 * on). Every Input Trace is checked against the schema and paired with its
 * answers, so a capture can be committed with confidence. `pnpm test` runs
 * the same check over every committed folder.
 *
 *   pnpm capture:check              (checks every issue folder)
 *   pnpm capture:check 13           (checks only #13)
 *   pnpm capture:check 13 --print   (also prints #13 as one JSON bundle)
 *
 * The files hold only Input Traces, typed answers and session facts
 * (date, MAME version, refresh rate): nothing from the ROM.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { INPUT_TRACE_SCHEMA } from '../files.ts';
import { checkTrace } from '../types.ts';
import { validate } from '../validate.ts';
import { buildPlans } from './plans.ts';

/** Where capture.lua writes, one folder per issue. Committed. */
export const CAPTURES_DIR = fileURLToPath(new URL('../captures/', import.meta.url));

/** The folder for one issue's results. @param issue */
export const issueDir = (issue: number | string, root = CAPTURES_DIR) => join(root, `issue-${issue}`);

/**
 * The issues with results in their folder, in order (empty folders don't count).
 */
export function capturedIssues(root: string = CAPTURES_DIR): number[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((name) => /^issue-(\d+)$/.exec(name))
    .filter((m) => m !== null && statSync(join(root, m[0])).isDirectory() && readdirSync(join(root, m[0])).some((n) => n.endsWith('.json')))
    .map((m) => Number((m as RegExpExecArray)[1]))
    .sort((a, b) => a - b);
}

export interface CaptureBundle {
  formatVersion: 1;
  /** The session facts: date, tool, refresh rate, screen size. */
  sessions: unknown[];
  runs: { trace: import('../types.ts').InputTrace, issue: number | null, savestate: string | null, answers: Record<string, string> }[];
  /** Anything that needs looking at; empty when all is well. */
  problems: string[];
}

/**
 * Check one issue's folder and gather it into one bundle.
 */
export function pack(dir: string): CaptureBundle {
  const names = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')).sort() : [];
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const problems: string[] = [];
  const runs: CaptureBundle['runs'] = [];
  for (const name of names.filter((n) => n.endsWith('.trace.json'))) {
    const trace = read(name);
    const errors = [...validate(INPUT_TRACE_SCHEMA, trace), ...(typeof trace?.id === 'string' ? checkTrace(trace) : [])];
    for (const e of errors) problems.push(`${name}: ${e}`);
    const answersName = name.replace(/\.trace\.json$/, '.answers.json');
    const answers = names.includes(answersName) ? read(answersName) : null;
    if (!answers) problems.push(`${name}: no answers file (${answersName})`);
    else if (answers.trace !== trace?.id) problems.push(`${answersName}: is for ${answers.trace}, not ${trace?.id}`);
    runs.push({ trace, issue: answers?.issue ?? null, savestate: answers?.savestate ?? null, answers: answers?.answers ?? {} });
  }
  for (const name of names.filter((n) => n.endsWith('.answers.json'))) {
    if (!names.includes(name.replace(/\.answers\.json$/, '.trace.json'))) problems.push(`${name}: no trace file`);
  }
  const sessions = names.filter((n) => /^session(-\d+)?\.json$/.test(n)).map(read);
  if (runs.length === 0) problems.push(`no runs found in ${dir}: run capture.lua first`);
  else if (sessions.length === 0) problems.push(`no session file in ${dir}`);
  return { formatVersion: 1, sessions, runs, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const asked = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const issues = asked.length > 0 ? asked : capturedIssues();
  if (issues.length === 0) console.log(`Nothing captured yet in ${CAPTURES_DIR}: run capture.lua first.`);
  const plans = buildPlans();
  for (const issue of issues) {
    const bundle = pack(issueDir(issue));
    const planned = plans.find((p) => p.issue === issue)?.runs.map((r) => r.id) ?? [];
    const missing = planned.filter((id) => !bundle.runs.some((r) => r.trace?.id === id));
    if (process.argv.includes('--print')) console.log(`${JSON.stringify(bundle, null, 2)}\n`);
    console.log(`#${issue}: ${bundle.runs.length} of ${planned.length} runs captured in ${issueDir(issue)}${bundle.problems.length === 0 ? ', no problems' : ''}`);
    if (missing.length > 0) console.log(`  still to capture: ${missing.length} (next: CAPTURE_SET=${issue} CAPTURE_FROM=${planned.indexOf(missing[0]) + 1})`);
    for (const p of bundle.problems) console.log(`  problem: ${p}`);
    if (bundle.problems.length > 0) process.exitCode = 1;
  }
  if (issues.length > 0 && !process.exitCode) console.log('Ready to commit: git add calibration/captures');
}
