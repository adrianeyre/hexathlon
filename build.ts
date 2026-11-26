/**
 * Builds the playable site into `dist/`: the TypeScript game bundled and
 * minified into one script, the service worker likewise, the stylesheet and
 * page minified, and the static files (icons, manifest, Attract Mode
 * traces) copied alongside. `pnpm start` serves the result locally and the
 * deploy job publishes exactly the same folder to GitHub Pages.
 *
 * The service worker's precache list (`ASSETS`) is generated here from what
 * the page actually loads, so it is always complete, and its `VERSION` comes
 * from the `SW_VERSION` environment variable (the commit SHA in the deploy
 * job), or 'dev' locally, which makes the worker go to the network first.
 *
 *   node build.ts              build into dist/
 *   SW_VERSION=abc node build.ts
 */
import { build as esbuild, transform } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

/** Files and folders copied as they are. */
export const STATIC = Object.freeze([
  'favicon.ico',
  'manifest.webmanifest',
  'browserconfig.xml',
  'robots.txt',
  'sitemap.xml',
  'icons',
  'images',
  'data/attract.json',
  'data/attract',
]);

/** Browsers the bundle targets: anything with ES modules, JSON module imports aside (they're inlined). */
export const TARGET = ['es2022', 'chrome100', 'firefox100', 'safari15'];

export interface BuildOptions {
  /** Where to write the site; emptied first. */
  outDir?: string;
  /** The service worker's cache version; 'dev' goes to the network first. */
  version?: string;
  /** Minify the scripts, stylesheet and page. */
  minify?: boolean;
  /** Log what was written. */
  quiet?: boolean;
}

/**
 * Collapse the whitespace between tags and drop comments. The page has no
 * `<pre>` or whitespace-sensitive inline text, so this is safe for it.
 */
export function minifyHtml(html: string): string {
  return html
    .replace(/<!--(?!\[)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\n\s*/g, ' ')
    .trim();
}

/**
 * Every file the built page loads, relative to `dir`: what `index.html`
 * links, the manifest's icons, the script and stylesheet, and the Attract
 * Mode playlist with its traces (fetched at run time). This is the service
 * worker's precache list, so the game plays offline.
 */
export function runtimeFiles(dir: string): string[] {
  const read = (file: string) => readFileSync(join(dir, file), 'utf8');
  const files = new Set<string>(['index.html']);
  // Absolute URLs (the canonical link, the social card) point at the deployed site, not a file to precache.
  for (const [, ref] of read('index.html').matchAll(/(?:href|src)="([^"]+)"/g)) if (!/^(?:https?:|#|mailto:)/.test(ref)) files.add(ref);
  for (const icon of JSON.parse(read('manifest.webmanifest')).icons) files.add(icon.src);
  files.add('data/attract.json');
  for (const trace of JSON.parse(read('data/attract.json')).traces) files.add(trace);
  return [...files].sort();
}

/** Total size of a folder in bytes. */
function folderBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? folderBytes(path) : statSync(path).size;
  }
  return total;
}

/** Build the site. Returns the output folder and the precache list. */
export async function build({ outDir = join(ROOT, 'dist'), version = process.env.SW_VERSION || 'dev', minify = true, quiet = false }: BuildOptions = {}) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const path of STATIC) {
    const from = join(ROOT, path);
    if (!existsSync(from)) continue;
    cpSync(from, join(outDir, path), { recursive: true });
  }

  // The game: every module and the JSON data it imports, in one minified script.
  // Of package.json only the version is needed (for the Settings screen), so only it is bundled.
  const { version: gameVersion } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  await esbuild({
    plugins: [
      {
        name: 'package-version-only',
        setup(b) {
          b.onLoad({ filter: /[\\/]package\.json$/ }, () => ({ contents: JSON.stringify({ version: gameVersion }), loader: 'json' }));
        },
      },
    ],
    entryPoints: [join(ROOT, 'src/main.ts')],
    outfile: join(outDir, 'js/main.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: TARGET,
    minify,
    legalComments: 'none',
    logLevel: 'error',
  });

  const css = readFileSync(join(ROOT, 'css/style.css'), 'utf8');
  mkdirSync(join(outDir, 'css'), { recursive: true });
  writeFileSync(join(outDir, 'css/style.css'), minify ? (await transform(css, { loader: 'css', minify: true })).code : css);

  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  writeFileSync(join(outDir, 'index.html'), minify ? minifyHtml(html) : html);

  // The service worker, with its precache list and version filled in.
  const assets = ['./', ...runtimeFiles(outDir)];
  await esbuild({
    entryPoints: [join(ROOT, 'sw.ts')],
    outfile: join(outDir, 'sw.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: TARGET,
    minify,
    legalComments: 'none',
    logLevel: 'error',
    define: { __ASSETS__: JSON.stringify(assets), __VERSION__: JSON.stringify(version) },
  });

  if (!quiet) console.log(`Built ${relative(ROOT, outDir) || '.'}: ${assets.length} precached files, ${(folderBytes(outDir) / 1024).toFixed(1)} KB in all (service worker version '${version}').`);
  return { outDir, assets };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await build();
}
