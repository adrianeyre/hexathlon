import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { build } from '../build.ts';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { ICONS } from '../tools/make-icons.ts';

/** Where the sandboxed worker pretends to be served from. */
const ORIGIN = 'https://example.test/';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const readJson = (path: string) => JSON.parse(read(path));

/** A build of the site in a temporary folder, per service worker version. */
const builds = new Map<string, Promise<{ outDir: string; assets: string[] }>>();
const built = (version = 'dev') => {
  if (!builds.has(version)) builds.set(version, build({ outDir: mkdtempSync(join(tmpdir(), `hexathlon-${version}-`)), version, quiet: true }));
  return builds.get(version) as Promise<{ outDir: string; assets: string[] }>;
};
after(async () => {
  for (const b of builds.values()) rmSync((await b).outDir, { recursive: true, force: true });
});

/**
 * Every file the built page loads, found by following index.html, the
 * manifest and the Attract Mode playlist (which main.js fetches), and the
 * one bundled script.
 */
function loadedFiles(dir: string) {
  const files = new Set<string>(['index.html']);
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  // Absolute URLs (the canonical link) point at the deployed site, not a file.
  for (const [, ref] of html.matchAll(/(?:href|src)="([^"]+)"/g)) if (!/^https?:/.test(ref)) files.add(ref);
  for (const icon of JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8')).icons) files.add(icon.src);
  files.add('data/attract.json');
  for (const trace of JSON.parse(readFileSync(join(dir, 'data/attract.json'), 'utf8')).traces) files.add(trace);
  return [...files].sort();
}

/**
 * Run the built sw.js in a sandbox with fake Cache Storage.
 * @param [version]  The deploy job's SW_VERSION; 'dev' locally.
 */
async function loadWorker(version = 'dev') {
  const { outDir, assets } = await built(version);
  const source = readFileSync(join(outDir, 'sw.js'), 'utf8');
  const stores: Map<string, Map<string, string>> = new Map([['hexathlon-old', new Map()], ['other-app', new Map()]]);
  const listeners: Record<string, Function> = {};
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = (stores.get(name) as Map<string, string>);
      return {
        async addAll(requests: { url: string }[]) {
          for (const r of requests) store.set(r.url, `cached ${r.url}`);
        },
        async match(r: { url: string } | string) {
          return store.get(new URL(typeof r === 'string' ? r : r.url, ORIGIN).href);
        },
        async put(r: { url: string }, body: string) {
          store.set(r.url, body);
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };
  let skipped = false;
  let claimed = false;
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener: (type: string, fn: Function) => (listeners[type] = fn),
    skipWaiting: async () => (skipped = true),
    clients: { claim: async () => (claimed = true) },
  };
  const fetched: string[] = [];
  const context = vm.createContext({
    self,
    caches,
    Request: class {
      url: string;
      constructor(url: string) {
        this.url = new URL(url, ORIGIN).href;
      }
    },
    Response: { error: () => 'network error' },
    URL,
    fetch: async (r: { url: string }) => {
      fetched.push(r.url);
      return 'from network';
    },
  });
  vm.runInContext(source, context);
  const dispatch = async (type: string, extra: object = {}) => {
    const waits: Promise<unknown>[] = [];
    let response: Promise<unknown> | null = null;
    listeners[type]({
      ...extra,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      respondWith: (p: Promise<unknown>) => (response = p),
    });
    await Promise.all(waits);
    return response;
  };
  return { assets, outDir, stores, dispatch, fetched, flags: () => ({ skipped, claimed }) };
}

describe('web app manifest', () => {
  const manifest = readJson('manifest.webmanifest');

  it('has what browsers need to offer installation', () => {
    assert.equal(manifest.name, 'Hexathlon');
    assert.ok(manifest.short_name);
    assert.ok(['standalone', 'fullscreen'].includes(manifest.display));
    for (const key of ['start_url', 'scope', 'id']) assert.equal(manifest[key], './', `${key} is relative for the subpath`);
    const sizes = manifest.icons.map((i: any) => `${i.sizes}:${i.purpose}`);
    assert.ok(sizes.includes('192x192:any'));
    assert.ok(sizes.includes('512x512:any'));
    assert.ok(sizes.includes('512x512:maskable'));
  });

  it('is linked from the page with an Apple touch icon', () => {
    const html = read('index.html');
    assert.match(html, /<link rel="manifest" href="manifest.webmanifest"/);
    assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon.png"/);
  });

  it('has a monochrome icon for themed icons and an SVG that scales to any size', () => {
    const purposes = manifest.icons.map((i: any) => i.purpose);
    assert.ok(purposes.includes('monochrome'));
    assert.ok(manifest.icons.some((i: any) => i.type === 'image/svg+xml' && i.sizes === 'any'));
  });

  it('icons are real PNGs of the stated size, generated from the code-defined art', () => {
    for (const icon of manifest.icons.filter((i: any) => i.type === 'image/png')) {
      const buf = readFileSync(join(ROOT, icon.src));
      assert.equal(buf.subarray(1, 4).toString(), 'PNG');
      const [w, h] = icon.sizes.split('x').map(Number);
      assert.equal(buf.readUInt32BE(16), w);
      assert.equal(buf.readUInt32BE(20), h);
    }
    for (const { file, render } of ICONS) {
      const expected = render();
      const actual = readFileSync(join(ROOT, file));
      assert.ok(typeof expected === 'string' ? actual.toString('utf8') === expected : actual.equals(expected), `${file} is stale: run pnpm icons`);
    }
  });
});

describe('service worker', () => {
  it('precaches every file the built game loads, so it plays offline', async () => {
    const { assets, outDir } = await loadWorker();
    const missing = loadedFiles(outDir).filter((f) => !assets.includes(f));
    assert.deepEqual(missing, [], 'build.ts runtimeFiles() missed these');
    assert.ok(assets.includes('js/main.js'), 'the one bundled script');
  });

  it('lists only built files that exist, with relative paths', async () => {
    const { assets, outDir } = await loadWorker();
    for (const asset of assets) {
      assert.ok(!asset.startsWith('/'), `${asset} must be relative`);
      if (asset !== './') assert.ok(existsSync(join(outDir, asset)), `${asset} does not exist`);
    }
    assert.equal(new Set(assets).size, assets.length, 'no duplicates');
  });

  it('is registered relative to the page', () => {
    assert.match(read('src/main.ts'), /serviceWorker\.register\('sw\.js'\)/);
  });

  it('caches a new version on install and deletes old versions on activate', async () => {
    const worker = await loadWorker('abc123');
    await worker.dispatch('install');
    const store = worker.stores.get('hexathlon-abc123');
    assert.ok(store);
    assert.equal(store.size, worker.assets.length);
    await worker.dispatch('activate');
    assert.deepEqual([...worker.stores.keys()].sort(), ['hexathlon-abc123', 'other-app'], 'other apps untouched');
    assert.deepEqual(worker.flags(), { skipped: true, claimed: true });
  });

  it('serves from the cache in a release, falling back to the network', async () => {
    const worker = await loadWorker('abc123');
    await worker.dispatch('install');
    const request = (url: string, mode = 'no-cors') => ({ request: { url, method: 'GET', mode } });
    assert.equal(await worker.dispatch('fetch', request(`${ORIGIN}js/main.js`)), `cached ${ORIGIN}js/main.js`);
    assert.equal(await worker.dispatch('fetch', request('https://example.test/unknown.txt')), 'from network');
    // Navigations to any URL fall back to the cached page.
    assert.equal(await worker.dispatch('fetch', request(`${ORIGIN}play?utm=x`, 'navigate')), `cached ${ORIGIN}`);
    // Other origins are left alone.
    assert.equal(await worker.dispatch('fetch', request('https://elsewhere.test/a.js')), null);
  });

  it('goes to the network first in development', async () => {
    const worker = await loadWorker();
    await worker.dispatch('install');
    assert.equal(await worker.dispatch('fetch', { request: { url: 'https://example.test/x.js', method: 'GET', mode: 'no-cors' } }), 'from network');
    assert.deepEqual(worker.fetched, ['https://example.test/x.js']);
  });

  it('gets a new VERSION on every deploy', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.match(ci, /SW_VERSION: \$\{\{ github\.sha \}\}/);
    assert.match(ci, /path: dist/, 'the built site is what gets deployed');
  });
});

describe('build and release', () => {
  const pkg = readJson('package.json');

  it('pnpm start serves the same minified build that is deployed', () => {
    assert.match(pkg.scripts.start, /^node build\.ts && http-server dist /);
    assert.equal(pkg.scripts.build, 'node build.ts');
  });

  it('ships minified JavaScript, never TypeScript', async () => {
    const { outDir } = await built();
    const main = readFileSync(join(outDir, 'js/main.js'), 'utf8');
    assert.ok(main.split('\n').length < 10, 'minified onto a few lines');
    assert.doesNotMatch(main, /\.ts['"]/, 'no TypeScript imports left');
    assert.ok(!existsSync(join(outDir, 'src/main.ts')));
  });

  it('semantic-release runs on pushes to main and only sets the version (no npm publish)', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.match(ci, /run: pnpm release/);
    assert.match(ci, /github\.ref == 'refs\/heads\/main'/);
    const config = readJson('.releaserc.json');
    assert.deepEqual(config.branches, ['main']);
    const npm = config.plugins.find((p: unknown) => Array.isArray(p) && p[0] === '@semantic-release/npm');
    assert.equal(npm?.[1].npmPublish, false);
    const git = config.plugins.find((p: unknown) => Array.isArray(p) && p[0] === '@semantic-release/git');
    assert.deepEqual(git?.[1].assets, ['package.json'], 'the new version is committed back for the Settings screen');
  });
});
