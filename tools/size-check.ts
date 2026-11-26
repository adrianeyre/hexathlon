/**
 * Size and load-time budget check (PRD 2, 9 and 13): everything a player
 * downloads must come to under 2 MB, and the game should load in under 2
 * seconds on broadband. Run with `pnpm size`; CI runs it on every push.
 *
 * It measures the built site (`build.ts`, the same `dist/` that is
 * deployed): the service worker plus its precache list, which is exactly
 * what a first visit fetches.
 *
 * The load time is an estimate, not a measurement: the gzipped bytes at a
 * modest broadband speed, plus one round trip each for the page, then its
 * stylesheet and its one bundled script (fetched side by side), then the
 * Attract Mode data it fetches. Check the real figure in the browser before
 * release.
 */
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from '../build.ts';

/** Budgets and the network the estimate assumes. */
export const BUDGET = Object.freeze({
  /** Total transfer, uncompressed, in bytes (2 MB). */
  bytes: 2 * 1024 * 1024,
  /** Estimated load time in seconds. */
  seconds: 2,
  /** Broadband speed assumed by the estimate, in bits per second. */
  bitsPerSecond: 10e6,
  /** Round-trip time assumed by the estimate, in seconds. */
  roundTrip: 0.05,
});

/** Round trips before everything has arrived: the page, then its stylesheet and script, then the data the script fetches. */
export const ROUND_TRIPS = 3;

/**
 * Build the site into a temporary folder and measure every file a first
 * visit downloads (the service worker and its precache list).
 */
export async function measure() {
  const outDir = mkdtempSync(join(tmpdir(), 'hexathlon-size-'));
  try {
    const { assets } = await build({ outDir, quiet: true });
    const files = ['sw.js', ...assets.filter((f) => f !== './')].map((file) => {
      const path = join(outDir, file);
      return { file, bytes: statSync(path).size, gzip: gzipSync(readFileSync(path), { level: 9 }).length };
    });
    const bytes = files.reduce((sum, f) => sum + f.bytes, 0);
    const gzip = files.reduce((sum, f) => sum + f.gzip, 0);
    const seconds = (gzip * 8) / BUDGET.bitsPerSecond + ROUND_TRIPS * BUDGET.roundTrip;
    return { files, bytes, gzip, roundTrips: ROUND_TRIPS, seconds };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { files, bytes, gzip, roundTrips, seconds } = await measure();
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`.padStart(10);
  for (const f of [...files].sort((a, b) => b.bytes - a.bytes)) console.log(`${kb(f.bytes)} ${kb(f.gzip)}  ${f.file}`);
  console.log(`\n${files.length} files: ${kb(bytes)} raw, ${kb(gzip)} gzipped (budget ${kb(BUDGET.bytes)})`);
  console.log(
    `Estimated load: ${seconds.toFixed(2)} s at ${BUDGET.bitsPerSecond / 1e6} Mbit/s with ${roundTrips} round trips of ${BUDGET.roundTrip * 1000} ms (budget ${BUDGET.seconds} s)`,
  );
  let failed = false;
  if (bytes > BUDGET.bytes) {
    console.error(`FAIL: total transfer ${kb(bytes)} is over the ${kb(BUDGET.bytes)} budget`);
    failed = true;
  }
  if (seconds > BUDGET.seconds) {
    console.error(`FAIL: estimated load ${seconds.toFixed(2)} s is over the ${BUDGET.seconds} s budget`);
    failed = true;
  }
  process.exitCode = failed ? 1 : 0;
}
