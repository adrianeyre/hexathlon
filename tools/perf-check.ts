#!/usr/bin/env node
/**
 * Performance check in a real browser (PRD 2, 9, 13; #61): loads the game in
 * headless Chrome over a throttled broadband connection and times the load,
 * then plays the 100m (the busiest scene: crowd, two athletes, HUD) while
 * recording every animation frame, first at full CPU speed and again with
 * the CPU slowed down to stand in for a mid-range phone.
 *
 *   pnpm perf                 (CHROME=/path/to/chrome to choose the browser)
 *   pnpm perf --json          (print the measurements as JSON)
 *   pnpm perf --screenshots   (also save what each run ended on, as PNGs in the system temp folder)
 *
 * The slowed-down run is an emulation, not a phone: confirm on a real
 * mid-range phone with `?fps` in the URL before release. Not run in CI,
 * which has no browser and whose timings would be noise.
 *
 * Talks to Chrome over the DevTools protocol with Node's built-in WebSocket,
 * so it needs no dependencies.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from '../build.ts';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';


/** What counts as passing, and the conditions the measurements are taken under. */
export const PERF_BUDGET = Object.freeze({
  /** Average frames per second while playing. */
  fps: 58,
  /** 95th percentile gap between frames, in milliseconds (a 60 Hz frame is 16.7). */
  p95FrameMs: 20,
  /** Load, from navigation to the load event, in milliseconds. */
  loadMs: 2000,
  /** Broadband for the load: 10 Mbit/s down, 50 ms added latency, as `pnpm size` assumes. */
  network: Object.freeze({ downloadBitsPerSecond: 10e6, uploadBitsPerSecond: 2e6, latencyMs: 50 }),
  /** CPU slow-down standing in for a mid-range phone (Chrome DevTools' "mid-tier mobile" preset). */
  phoneCpuSlowdown: 4,
  /** How long to wait for the start signal before mashing, in milliseconds (the 100m's signal comes 2 s in). */
  startWaitMs: 2600,
  /** How long to mash while recording frames, in milliseconds. */
  playMs: 8000,
});

const MIME = Object.freeze({
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
});

/**
 * Summarise animation frame timestamps.
 * @param times  Milliseconds, in order.
 */
export function frameStats(times: readonly number[]): { frames: number; fps: number; p95FrameMs: number; worstFrameMs: number; slowFrames: number; } {
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  if (gaps.length === 0) return { frames: times.length, fps: 0, p95FrameMs: 0, worstFrameMs: 0, slowFrames: 0 };
  const sorted = [...gaps].sort((a, b) => a - b);
  const span = times[times.length - 1] - times[0];
  return {
    frames: times.length,
    fps: span > 0 ? (gaps.length * 1000) / span : 0,
    p95FrameMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    worstFrameMs: sorted[sorted.length - 1],
    // A frame that took longer than about two 60 Hz frames: a visible stutter.
    slowFrames: gaps.filter((g) => g > 1000 / 30).length,
  };
}

/** Build the site (`build.ts`, as deployed) and serve `dist/` over http on a free port. */
export async function serve(): Promise<{ url: string; close: () => void; }> {
  const { outDir } = await build({ quiet: true });
  const SITE = join(outDir, '/');
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = normalize(join(SITE, path.endsWith('/') ? `${path}index.html` : path));
    if (!file.startsWith(SITE) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[(extname(file) as keyof typeof MIME)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
    });
  });
}

/** The Chrome to drive: $CHROME, or a usual install location. */
function findChrome() {
  const candidates = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((c) => c && existsSync(c));
  if (!found) throw new Error('No Chrome found: set CHROME to its path.');
  return found;
}

/**
 * Start headless Chrome and connect to it.
 */
export async function launch(): Promise<{ send: (method: string, params?: object, sessionId?: string) => Promise<any>; wait: (event: string, sessionId?: string) => Promise<any>; close: () => void; }> {
  const profile = mkdtempSync(join(tmpdir(), 'perf-check-'));
  const chrome = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=960,540', 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const wsUrl = await new Promise((resolve, reject) => {
    let log = '';
    chrome.stderr.on('data', (d) => {
      log += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (m) resolve(m[1]);
    });
    chrome.on('exit', (code) => reject(new Error(`Chrome exited (${code}): ${log}`)));
  });
  const ws = new WebSocket((wsUrl as string));
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; }> = new Map();
  const waiters: { event: string; sessionId?: string; resolve: (v: any) => void; }[] = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(`${msg.error.message}`));
      else p?.resolve(msg.result);
      return;
    }
    const i = waiters.findIndex((w) => w.event === msg.method && (!w.sessionId || w.sessionId === msg.sessionId));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg.params);
  });
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    wait(event, sessionId) {
      return new Promise((resolve) => waiters.push({ event, sessionId, resolve }));
    },
    close() {
      ws.close();
      chrome.kill();
      // Chrome may still hold files in the profile for a moment.
      setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Measure the load and the frame rate while playing the 100m.
 */
export async function measure({ screenshots = false }: { screenshots?: boolean; } = {}): Promise<{ loadMs: number; transferBytes: number; laptop: ReturnType<typeof frameStats>; phone: ReturnType<typeof frameStats>; screenshots: string[]; }> {
  const saved: string[] = [];
  const server = await serve();
  const browser = await launch();
  try {
    /** Open a fresh tab. @param options */
    const open = async ({ cpu = 1, network = false }: { cpu?: number; network?: boolean; }) => {
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (m: string, p: object = {}) => browser.send(m, p, sessionId);
      await send('Page.enable');
      await send('Network.enable');
      await send('Network.setCacheDisabled', { cacheDisabled: true });
      await send('Network.setBypassServiceWorker', { bypass: true });
      if (network) {
        const n = PERF_BUDGET.network;
        await send('Network.emulateNetworkConditions', { offline: false, latency: n.latencyMs, downloadThroughput: n.downloadBitsPerSecond / 8, uploadThroughput: n.uploadBitsPerSecond / 8 });
      }
      if (cpu > 1) await send('Emulation.setCPUThrottlingRate', { rate: cpu });
      const loaded = browser.wait('Page.loadEventFired', sessionId);
      await send('Page.navigate', { url: server.url });
      await loaded;
      return { send, close: () => browser.send('Target.closeTarget', { targetId }) };
    };
    const evaluate = async (send: (m: string, p?: object) => Promise<any>, expression: string) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

    // 1. Load over broadband, nothing cached.
    const loadTab = await open({ network: true });
    const load = await evaluate(
      loadTab.send,
      `(() => { const n = performance.getEntriesByType('navigation')[0]; const r = performance.getEntriesByType('resource');
        return { loadMs: n.loadEventEnd - n.startTime, transferBytes: n.transferSize + r.reduce((s, e) => s + e.transferSize, 0) }; })()`,
    );
    await loadTab.close();

    /** 2. Play the 100m and record frames. @param cpu */
    const play = async (cpu: number) => {
      const tab = await open({ cpu });
      const tap = async (code: string, key: string) => {
        await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key });
        await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key });
      };
      await sleep(500);
      await tap('Enter', 'Enter'); // title -> main menu
      await sleep(300);
      await tap('Enter', 'Enter'); // ARCADE
      await sleep(500);
      await tap('Enter', 'Enter'); // skip the intro card
      await sleep(200);
      await evaluate(tab.send, `window.__frames = []; (function f(t) { window.__frames.push(t); requestAnimationFrame(f); })(performance.now()); true`);
      // Wait out the start sequence (a press before the signal is a false start), then mash.
      await sleep(PERF_BUDGET.startWaitMs);
      const end = Date.now() + PERF_BUDGET.playMs;
      for (let i = 0; Date.now() < end; i++) {
        await tap(i % 2 ? 'KeyX' : 'KeyZ', i % 2 ? 'x' : 'z');
        await sleep(70);
      }
      const times = await evaluate(tab.send, 'window.__frames');
      if (screenshots) {
        const { data } = await tab.send('Page.captureScreenshot', { format: 'png' });
        const file = join(tmpdir(), `perf-check-cpu${cpu}x.png`);
        writeFileSync(file, Buffer.from(data, 'base64'));
        saved.push(file);
      }
      await tab.close();
      return frameStats(times);
    };
    const laptop = await play(1);
    const phone = await play(PERF_BUDGET.phoneCpuSlowdown);
    return { ...load, laptop, phone, screenshots: saved };
  } finally {
    browser.close();
    server.close();
  }
}

const passes = (s: ReturnType<typeof frameStats>) => s.fps >= PERF_BUDGET.fps && s.p95FrameMs <= PERF_BUDGET.p95FrameMs;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await measure({ screenshots: process.argv.includes('--screenshots') });
  if (process.argv.includes('--json')) console.log(JSON.stringify({ budget: PERF_BUDGET, ...result }, null, 2));
  else {
    const row = (name: string, s: ReturnType<typeof frameStats>) =>
      `${name.padEnd(24)} ${s.fps.toFixed(1).padStart(5)} FPS  p95 ${s.p95FrameMs.toFixed(1)} ms  worst ${s.worstFrameMs.toFixed(1)} ms  stutters ${s.slowFrames}  ${passes(s) ? 'OK' : 'OVER BUDGET'}`;
    console.log(`Load over 10 Mbit/s:     ${Math.round(result.loadMs)} ms (budget ${PERF_BUDGET.loadMs})  ${(result.transferBytes / 1024).toFixed(0)} KB transferred  ${result.loadMs <= PERF_BUDGET.loadMs ? 'OK' : 'OVER BUDGET'}`);
    console.log(row('100m, full CPU', result.laptop));
    console.log(row(`100m, CPU ${PERF_BUDGET.phoneCpuSlowdown}x slower`, result.phone));
    for (const file of result.screenshots) console.log(`Saved ${file}`);
    console.log('\nThe slowed-down run stands in for a mid-range phone; confirm on a real one with ?fps in the URL.');
  }
  if (!(result.loadMs <= PERF_BUDGET.loadMs && passes(result.laptop) && passes(result.phone))) process.exitCode = 1;
}
