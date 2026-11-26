import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

/**
 * ADR-0001: the original's title, its other release title and its publisher
 * must never appear in public-facing files. The patterns are assembled from
 * fragments so this test file doesn't contain the names either.
 */
const BANNED = [
  new RegExp(['tr', 'ack', "[\\s_'-]*(and|&|n|\\+)?[\\s_'-]*", 'fi', 'eld'].join(''), 'i'),
  new RegExp(['hyper', '[\\s_-]*', 'olymp'].join(''), 'i'),
  new RegExp(['hyper', '[\\s_-]*', 'sports'].join(''), 'i'),
  new RegExp(['ko', 'nami'].join(''), 'i'),
];

const ROOT = new URL('..', import.meta.url).pathname;

/** Folders that are never part of the product. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.impeccable', '.tmp', 'dist']);

/**
 * Internal records that ADR-0001's amendment allows to name the original,
 * in their text and filenames. Every other doc is public-facing and scanned.
 */
const INTERNAL_DIRS = new Set(['docs/architectural-decision-record', 'docs/product-requirements-document']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return SKIP_DIRS.has(name) || INTERNAL_DIRS.has(relative(ROOT, path)) ? [] : files(path);
    }
    return [path];
  });
}

describe('original-name guard (ADR-0001)', () => {
  const all = files(ROOT).filter((p) => !p.endsWith('pnpm-lock.yaml'));

  it('skips only the internal records ADR-0001 allows to name the original', () => {
    const names = all.map((p) => relative(ROOT, p));
    assert.ok(!names.some((n) => [...INTERNAL_DIRS].some((d) => n.startsWith(`${d}/`))));
    assert.ok(names.some((n) => n.startsWith('docs/guide/')), 'public guides are scanned');
  });

  it('finds the public-facing files', () => {
    const names = all.map((p) => relative(ROOT, p));
    for (const expected of [
      'README.md',
      'LICENSE',
      'CREDITS.md',
      'index.html',
      'package.json',
      'src/main.ts',
      'docs/guide/overview.md',
      'docs/style-guide.md',
      'GLOSSARY.md',
    ]) {
      assert.ok(names.includes(expected), `${expected} is scanned`);
    }
  });

  for (const path of all) {
    const name = relative(ROOT, path);
    it(`${name} has no original-game names or marks`, () => {
      for (const pattern of BANNED) {
        assert.doesNotMatch(name, pattern, 'file path');
        assert.doesNotMatch(readFileSync(path, 'utf8'), pattern);
      }
    });
  }
});
