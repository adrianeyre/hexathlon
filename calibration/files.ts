/**
 * Finding and loading calibration files from disk (Node only).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CALIBRATION_DIR = fileURLToPath(new URL('.', import.meta.url));
export const TRACES_DIR = join(CALIBRATION_DIR, 'traces');
export const REFERENCE_DIR = join(CALIBRATION_DIR, 'reference');

export type Schema = import('./validate.ts').Schema;

const loadSchema = (name: string) =>
  (JSON.parse(readFileSync(join(CALIBRATION_DIR, 'schema', name), 'utf8')) as Schema);

export const INPUT_TRACE_SCHEMA = loadSchema('input-trace.schema.json');
export const REFERENCE_MARK_SCHEMA = loadSchema('reference-mark.schema.json');

/**
 * Every `.json` file under `dir`, as `<event>/<slug>` ids with their paths.
 */
export function listJson(dir: string): { id: string; path: string; }[] {
  if (!existsSync(dir)) return [];
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((name) => {
      const path = join(d, name);
      return statSync(path).isDirectory() ? walk(path) : name.endsWith('.json') ? [path] : [];
    });
  return walk(dir)
    .map((path) => ({ id: relative(dir, path).split(sep).join('/').replace(/\.json$/, ''), path }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
