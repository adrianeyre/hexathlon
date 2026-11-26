#!/usr/bin/env node
/**
 * Captures the screenshots used in the README and docs (`docs/screenshots/`)
 * and the social sharing card (`images/social-card.png`) by playing the real
 * game in headless Chrome. Run with `pnpm screenshots` after a visible change.
 *
 *   pnpm screenshots            (CHROME=/path/to/chrome to choose the browser)
 *   pnpm screenshots title hurdles   (only the named shots)
 *
 * Each game shot is the 320x240 canvas scaled 3x with nearest-neighbour, so
 * the pixel art stays crisp (960x720). The touch shot is the whole page on
 * an emulated phone, so the on-screen buttons show. Timing is real time, so
 * a shot can differ slightly from run to run; look at them before committing.
 *
 * Uses the DevTools protocol helpers from `tools/perf-check.js`, so it needs
 * no dependencies. Not run in CI.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';
import { launch, serve } from './perf-check.ts';

const ROOT = new URL('..', import.meta.url);
const SCALE = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Keys by name: [code, key]. */
const KEYS = ({
  enter: ['Enter', 'Enter'],
  esc: ['Escape', 'Escape'],
  up: ['ArrowUp', 'ArrowUp'],
  down: ['ArrowDown', 'ArrowDown'],
  left: ['ArrowLeft', 'ArrowLeft'],
  right: ['ArrowRight', 'ArrowRight'],
  z: ['KeyZ', 'z'],
  x: ['KeyX', 'x'],
  c: ['KeyC', 'c'],
  comma: ['Comma', ','],
  period: ['Period', '.'],
  slash: ['Slash', '/'],
  e: ['KeyE', 'e'],
  h: ['KeyH', 'h'],
} as const);

/**
 * A tab with helpers for driving the game.
 */
async function openTab(browser: Awaited<ReturnType<typeof launch>>, url: string, { phone = false }: { phone?: boolean; } = {}) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (m: string, p: object = {}) => browser.send(m, p, sessionId);
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.setBypassServiceWorker', { bypass: true });
  if (phone) {
    // A landscape phone: 844x390 CSS pixels at 3x, with touch.
    await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  } else {
    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false });
  }
  const loaded = browser.wait('Page.loadEventFired', sessionId);
  await send('Page.navigate', { url });
  await loaded;
  await sleep(600);

  const evaluate = async (expression: string) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  const keyEvent = (name: keyof typeof KEYS, type: 'keyDown' | 'keyUp') => send('Input.dispatchKeyEvent', { type, code: KEYS[name][0], key: KEYS[name][1] });

  return {
    send,
    evaluate,
    /** Press and release keys in turn. @param names */
    async press(...names: (keyof typeof KEYS)[]) {
      for (const name of names) {
        await keyEvent(name, 'keyDown');
        await sleep(40);
        await keyEvent(name, 'keyUp');
        await sleep(160);
      }
    },
    /** Hold a key for `ms`. @param name @param ms */
    async hold(name: keyof typeof KEYS, ms: number) {
      await keyEvent(name, 'keyDown');
      await sleep(ms);
      await keyEvent(name, 'keyUp');
    },
    /** Hold a key down (until `release`). @param name */
    down: (name: keyof typeof KEYS) => keyEvent(name, 'keyDown'),
    up: (name: keyof typeof KEYS) => keyEvent(name, 'keyUp'),
    /**
     * Alternate two run keys for `ms`, fast enough for full speed.
     * @param [gap]  Milliseconds between presses.
     */
    async mash(ms: number, keys: [keyof typeof KEYS, keyof typeof KEYS] = ['z', 'x'], gap: number = 45) {
      const end = Date.now() + ms;
      for (let i = 0; Date.now() < end; i++) {
        await keyEvent(keys[i % 2], 'keyDown');
        await keyEvent(keys[i % 2], 'keyUp');
        await sleep(gap);
      }
    },
    /** Tap the page at CSS pixel coordinates. @param x @param y */
    async tap(x: number, y: number) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(200);
    },
    /** The game canvas, scaled up crisply, as PNG bytes. */
    async canvas() {
      const data = await evaluate(`(() => {
        const screen = document.getElementById('screen');
        const out = document.createElement('canvas');
        out.width = screen.width * ${SCALE};
        out.height = screen.height * ${SCALE};
        const ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(screen, 0, 0, out.width, out.height);
        return out.toDataURL('image/png').split(',')[1];
      })()`);
      return Buffer.from(data, 'base64');
    },
    /** The whole page as PNG bytes. */
    async page() {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(data, 'base64');
    },
    close: () => browser.send('Target.closeTarget', { targetId }),
  };
}

export type Tab = Awaited<ReturnType<typeof openTab>>;

/** Practice menu rows, in order. */
const PRACTICE = ['sprint', 'longJump', 'javelin', 'hurdles', 'hammer', 'highJump'];

/** Open Practice and start an Event, skipping its intro card. @param t @param id */
async function practice(t: Tab, id: string) {
  await t.press('enter', 'down', 'enter'); // title -> menu -> PRACTICE
  for (let i = 0; i < PRACTICE.indexOf(id); i++) await t.press('down');
  await t.press('enter');
  await sleep(400);
  await t.press('enter'); // skip the intro card
}

/** Run up and take a field Event's action with an angle hold. @param t @param runMs @param holdMs */
async function runAndHold(t: Tab, runMs: number, holdMs: number) {
  await t.mash(runMs);
  await t.down('c');
  await sleep(holdMs);
  await t.up('c');
}

/**
 * Every shot: a name, what to do, and which capture.
 */
export const SHOTS: { name: string; phone?: boolean; run: (t: Tab) => Promise<Buffer>; }[] = [
  {
    name: 'title',
    run: async (t) => {
      await sleep(900);
      return t.canvas();
    },
  },
  {
    name: 'attract',
    run: async (t) => {
      // Left idle the title shows the High Score table (8 s), then Attract Mode.
      await sleep(10_000 + 8_000 + 4_500);
      return t.canvas();
    },
  },
  {
    name: 'main-menu',
    run: async (t) => {
      await t.press('enter');
      await sleep(300);
      return t.canvas();
    },
  },
  {
    name: 'sprint',
    run: async (t) => {
      await t.press('enter', 'enter'); // ARCADE
      await sleep(400);
      await t.press('enter'); // skip the intro card
      await sleep(2_400); // the start signal; a press before it is a false start
      await t.mash(3_200);
      return t.canvas();
    },
  },
  {
    name: 'long-jump',
    run: async (t) => {
      await practice(t, 'longJump');
      await sleep(600);
      await runAndHold(t, 2_200, 520);
      await sleep(250);
      return t.canvas();
    },
  },
  {
    name: 'javelin',
    run: async (t) => {
      await practice(t, 'javelin');
      await sleep(600);
      await runAndHold(t, 2_200, 680);
      await sleep(700);
      return t.canvas();
    },
  },
  {
    name: 'hurdles',
    run: async (t) => {
      await practice(t, 'hurdles');
      await sleep(2_400);
      // Mash, jumping at a steady rhythm.
      const end = Date.now() + 3_000;
      while (Date.now() < end) {
        await t.mash(520);
        await t.press('c');
      }
      return t.canvas();
    },
  },
  {
    name: 'hammer',
    run: async (t) => {
      await practice(t, 'hammer');
      await sleep(600);
      await t.mash(1_800);
      await t.down('c');
      await sleep(400);
      return t.canvas();
    },
  },
  {
    name: 'high-jump',
    run: async (t) => {
      await practice(t, 'highJump');
      await sleep(600);
      await runAndHold(t, 1_700, 600);
      await sleep(250);
      return t.canvas();
    },
  },
  {
    name: 'pause',
    run: async (t) => {
      await practice(t, 'sprint');
      await sleep(2_400);
      await t.mash(1_500);
      await t.press('esc');
      await sleep(300);
      return t.canvas();
    },
  },
  {
    name: 'results',
    run: async (t) => {
      await t.press('enter', 'enter');
      await sleep(400);
      await t.press('enter');
      await sleep(2_400);
      await t.mash(12_000);
      await sleep(2_500);
      return t.canvas();
    },
  },
  {
    name: 'initials',
    run: async (t) => {
      // Qualify in the 100m for some Points, then foul every Long Jump
      // Attempt (run past the board without jumping) to end the Session:
      // any Points on an empty table qualify for initials entry.
      await t.press('enter', 'enter');
      await sleep(400);
      await t.press('enter');
      await sleep(2_400);
      await t.mash(12_000);
      await sleep(2_500);
      await t.press('enter'); // results -> Long Jump
      await sleep(600);
      await t.press('enter'); // skip the intro card
      for (let attempt = 0; attempt < 3; attempt++) {
        await sleep(800);
        await t.mash(3_500);
        await sleep(3_000);
        await t.press('enter');
      }
      // The last Enter leaves the results for initials entry.
      await sleep(1_500);
      await t.press('h', 'e');
      await sleep(300);
      const png = await t.canvas();
      // Finish the entry, so the High Score table shot has a row.
      await t.press('x', 'enter', 'enter', 'enter');
      return png;
    },
  },
  {
    name: 'high-scores',
    run: async (t) => {
      await t.press('enter', 'down', 'down', 'down', 'enter');
      await sleep(400);
      return t.canvas();
    },
  },
  {
    name: 'practice',
    run: async (t) => {
      await t.press('enter', 'down', 'enter', 'down', 'down', 'down');
      await sleep(300);
      return t.canvas();
    },
  },
  {
    name: 'settings',
    run: async (t) => {
      await t.press('enter', 'down', 'down', 'down', 'down', 'enter');
      await sleep(300);
      return t.canvas();
    },
  },
  {
    name: 'controls',
    run: async (t) => {
      await t.press('enter', 'down', 'down', 'down', 'down', 'enter');
      for (let i = 0; i < 6; i++) await t.press('down');
      await t.press('enter');
      await sleep(300);
      return t.canvas();
    },
  },
  {
    name: 'key-test',
    run: async (t) => {
      await t.press('enter', 'down', 'down', 'down', 'down', 'enter');
      for (let i = 0; i < 7; i++) await t.press('down');
      await t.press('enter');
      await sleep(300);
      // Hold a few keys together, as a player would to test for ghosting.
      await t.down('z');
      await t.down('x');
      await t.down('c');
      await sleep(400);
      const png = await t.canvas();
      for (const k of (['z', 'x', 'c'] as const)) await t.up(k);
      return png;
    },
  },
  {
    name: 'cookie-policy',
    run: async (t) => {
      await t.press('enter', 'down', 'down', 'down', 'down', 'enter');
      for (let i = 0; i < 8; i++) await t.press('down');
      await t.press('enter');
      await sleep(300);
      return t.canvas();
    },
  },
  {
    name: 'credits',
    run: async (t) => {
      await t.press('enter', 'down', 'down', 'down', 'down', 'enter');
      for (let i = 0; i < 9; i++) await t.press('down');
      await t.press('enter');
      await sleep(300);
      return t.canvas();
    },
  },
  {
    name: 'touch',
    phone: true,
    run: async (t) => {
      await t.tap(422, 195); // title -> menu
      await t.tap(422, 150); // ARCADE (the first row)
      await sleep(400);
      await t.tap(422, 195); // skip the intro card
      await sleep(1_500);
      return t.page();
    },
  },
];

/**
 * The 1200x630 card shown when the site is shared on social media: the logo,
 * name and pitch beside a shot of the 100m, drawn in the game's pixel font.
 * @param shot  A 960x720 game screenshot.
 */
async function socialCard(browser: Awaited<ReturnType<typeof launch>>, url: string, shot: Buffer) {
  const t = await openTab(browser, url);
  // The page runs the bundled game, so bring the pixel font in as its own little bundle.
  const font = await esbuild({
    stdin: { contents: "export { drawText } from './src/render/text.ts';", resolveDir: fileURLToPath(ROOT), loader: 'ts' },
    bundle: true,
    format: 'iife',
    globalName: 'HexathlonFont',
    write: false,
    logLevel: 'error',
  });
  await t.evaluate(font.outputFiles[0].text);
  const data = await t.evaluate(`(async () => {
    const { drawText } = globalThis.HexathlonFont;
    const W = 1200, H = 630;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1f2a52');
    bg.addColorStop(1, '#0b1024');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const load = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
    // Game shot on the right, framed in gold like the logo.
    const shot = await load('data:image/png;base64,${shot.toString('base64')}');
    const sw = 640, sh = 480, sx = W - sw - 48, sy = (H - sh) / 2;
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(sx - 6, sy - 6, sw + 12, sh + 12);
    ctx.drawImage(shot, sx, sy, sw, sh);
    const left = Math.round((sx - 6) / 2);
    // Logo, name and pitch on the left, in the game's own pixel font.
    const logo = await load('icons/icon.svg');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(logo, left - 88, 52, 176, 176);
    ctx.imageSmoothingEnabled = false;
    const text = (s, y, scale, color) => drawText(ctx, s, left, y, { scale, color });
    text('HEXATHLON', 270, 7, '#ffd23f');
    text('ARCADE ATHLETICS', 340, 3, '#ffffff');
    text('SIX EVENTS: MASH AND TIME', 400, 2, '#3fb8ff');
    text('FREE IN YOUR BROWSER', 450, 2, '#8a93b8');
    text('NO DOWNLOAD, PLAYS OFFLINE', 480, 2, '#8a93b8');
    return c.toDataURL('image/png').split(',')[1];
  })()`);
  await t.close();
  return Buffer.from(data, 'base64');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const only = process.argv.slice(2);
  const server = await serve();
  const browser = await launch();
  mkdirSync(new URL('docs/screenshots/', ROOT), { recursive: true });
  mkdirSync(new URL('images/', ROOT), { recursive: true });
  try {
    // One at a time, each in a fresh tab: a background tab's frames are
    // throttled, and the shots share local storage (High Scores) in order.
    const wanted = SHOTS.filter((s) => only.length === 0 || only.includes(s.name) || (s.name === 'sprint' && only.includes('social-card')));
    const taken: Map<string, Buffer> = new Map();
    for (const shot of wanted) {
      const tab = await openTab(browser, server.url, { phone: shot.phone });
      try {
        const png = await shot.run(tab);
        taken.set(shot.name, png);
        writeFileSync(new URL(`docs/screenshots/${shot.name}.png`, ROOT), png);
        console.log(`wrote docs/screenshots/${shot.name}.png`);
      } finally {
        await tab.close();
      }
    }
    if (only.length === 0 || only.includes('social-card')) {
      const sprint = taken.get('sprint');
      if (!sprint) throw new Error('the social card needs the sprint shot');
      writeFileSync(new URL('images/social-card.png', ROOT), await socialCard(browser, server.url, sprint));
      console.log('wrote images/social-card.png');
    }
  } finally {
    browser.close();
    server.close();
  }
}
