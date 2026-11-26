import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFpsMeter } from '../src/render/fps.ts';
import { PERF_BUDGET, frameStats } from '../tools/perf-check.ts';
import { BUDGET, measure } from '../tools/size-check.ts';
import { fakeCtx } from './helpers/fakes.ts';

describe('size and load budget (PRD 2, 9)', () => {
  it('measures the built site: the page, the one bundled script and the service worker', async () => {
    const { files } = await measure();
    const names = files.map((f) => f.file);
    for (const name of ['index.html', 'js/main.js', 'sw.js', 'css/style.css']) assert.ok(names.includes(name), name);
    assert.ok(!names.some((n) => n.endsWith('.ts')), 'no TypeScript is shipped');
  });

  it('keeps the total transfer under 2 MB', async () => {
    const { bytes } = await measure();
    assert.ok(bytes < BUDGET.bytes, `${bytes} bytes`);
  });

  it('keeps the estimated broadband load under 2 seconds', async () => {
    const { seconds } = await measure();
    assert.ok(seconds < BUDGET.seconds, `${seconds.toFixed(2)} s`);
  });
});

describe('browser performance check (pnpm perf, #61)', () => {
  it('summarises frame times: rate, 95th percentile, worst and stutters', () => {
    const steady = Array.from({ length: 121 }, (_, i) => i * (1000 / 60));
    const s = frameStats(steady);
    assert.equal(Math.round(s.fps), 60);
    assert.ok(Math.abs(s.p95FrameMs - 1000 / 60) < 0.01);
    assert.equal(s.slowFrames, 0);
    const hitch = [...steady.slice(0, 60), ...steady.slice(60).map((t) => t + 50)];
    const h = frameStats(hitch);
    assert.equal(h.slowFrames, 1, 'one 67 ms gap');
    assert.ok(h.worstFrameMs > 60);
    assert.deepEqual(frameStats([]), { frames: 0, fps: 0, p95FrameMs: 0, worstFrameMs: 0, slowFrames: 0 });
  });

  it('holds the PRD targets: 60 FPS on a mid-range phone, a load under 2 s on broadband', () => {
    assert.ok(PERF_BUDGET.fps >= 58);
    assert.ok(PERF_BUDGET.p95FrameMs <= 20);
    assert.equal(PERF_BUDGET.loadMs, BUDGET.seconds * 1000);
    assert.equal(PERF_BUDGET.network.downloadBitsPerSecond, BUDGET.bitsPerSecond, 'the same broadband as pnpm size');
  });
});

describe('FPS meter', () => {
  it('reports frames per second and the slowest frame once a second', () => {
    const meter = createFpsMeter();
    const ctx = (fakeCtx() as any);
    for (let i = 0; i <= 60; i++) meter.frame(ctx, i * (1000 / 60) + (i === 30 ? 20 : 0));
    assert.match(meter.label, /^6[01] FPS {2}MAX 3[67]\.\d MS$/);
  });
});
