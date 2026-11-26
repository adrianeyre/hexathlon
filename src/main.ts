import { audio, sounds } from './audio.ts';
import { createGamepadPoller } from './gamepad.ts';
import { InputQueue, TimedQueue, attachKeyboard, isFullscreenShortcut } from './input.ts';
import { startLoop } from './loop.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './render/display.ts';
import { createFpsMeter } from './render/fps.ts';
import { onFullscreenLeave, setFullscreen, setupScreen } from './render/screen.ts';
import { loadAttractReels } from './scenes/attract.ts';
import { EVENT_RENDERERS, EVENT_SOUNDS, createCatalogue } from './scenes/catalogue.ts';
import { registerScenes } from './scenes/index.ts';
import { SceneManager } from './scenes/manager.ts';
import { EVENT_SIMS } from './sim/registry.ts';
import { createStorage } from './storage.ts';
import { attachTouch } from './touch.ts';
import { voice } from './voice.ts';

const canvas = (document.getElementById('screen') as HTMLCanvasElement);
const ctx = setupScreen(canvas);
const storage = createStorage();

// Input: keyboard and gamepads feed normalised actions; raw keys, pad buttons
// and taps are kept too for the menus and the controls screens.
const queue = new InputQueue();
const rawKeys: TimedQueue<import('./input.ts').TimedRawKey> = new TimedQueue();
const rawPads: TimedQueue<import('./gamepad.ts').TimedRawPadButton> = new TimedQueue();
const taps: TimedQueue<{ x: number; y: number; time: number; }> = new TimedQueue();

let controls = storage.getControls();
const keyboard = attachKeyboard(queue, controls.keys, rawKeys).handler;
const pads = createGamepadPoller(queue, controls.pads, rawPads);

// Touch buttons appear once the screen has been touched (or straight away on
// touch-only devices): run and action during an Event, a pad in the menus.
const touch = attachTouch(queue, (document.getElementById('touch') as HTMLElement));
let touchSeen = false;
window.addEventListener(
  'pointerdown',
  (event) => {
    if (event.pointerType === 'touch') touchSeen = true;
  },
  { capture: true, passive: true },
);

canvas.addEventListener('pointerdown', (event) => {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  taps.push({
    x: ((event.clientX - rect.left) / rect.width) * SCREEN_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * SCREEN_HEIGHT,
    time: event.timeStamp,
  });
});

// Many browsers only allow audio to start inside a user-gesture handler, so
// resume it from every kind of gesture itself rather than from the frame loop:
// the title theme then starts with the very first key, click or tap.
for (const type of ['keydown', 'keyup', 'mousedown', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
  window.addEventListener(type, () => void audio.unlock(), { capture: true, passive: true });
}

const applySettings = (s: import('./storage.ts').Settings) => {
  audio.setVolume(s.volume);
  audio.setMuted(s.muted);
  voice.setVolume(s.volume);
  voice.setMuted(s.muted);
  voice.setEnabled(s.announcer);
  setFullscreen(s.fullScreen);
};
let settings = storage.getSettings();
// First visit: honour the system's reduced-motion preference.
if (!storage.hasSavedSettings() && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  settings = storage.saveSettings({ reducedFlash: true });
}
applySettings(settings);

/**
 * Which touch buttons a scene needs: none on the title and in Attract Mode
 * (any tap will do), run and action during an Event, the menu pad elsewhere
 * (including the pause menu).
 */
function touchModeFor(manager: SceneManager): import('./touch.ts').TouchMode | null {
  const name = manager.currentName;
  if (name === 'title' || name === 'attract') return null;
  if (name === 'event' && !((manager.current as { paused?: boolean }).paused)) return 'event';
  return 'menu';
}

/** Two-player is keyboard only; hide it where there's probably no keyboard. */
const touchOnly =
  (navigator.maxTouchPoints ?? 0) > 0 && !(window.matchMedia?.('(any-pointer: fine)').matches ?? true);

const services: import('./scenes/services.ts').Services = {
  storage,
  sounds,
  settings: {
    get: () => settings,
    update(changes) {
      settings = storage.saveSettings(changes);
      applySettings(settings);
      return settings;
    },
  },
  controls: {
    get: () => controls,
    set(next) {
      controls = storage.saveControls(next);
      keyboard.setBindings(controls.keys);
      pads.setBindings(controls.pads);
      return controls;
    },
  },
  catalogue: createCatalogue(EVENT_SIMS, EVENT_RENDERERS, EVENT_SOUNDS),
  attract: [],
  touchOnly,
  openUrl: (url) => {
    window.open(url, '_blank', 'noopener');
  },
};

touchSeen = touchOnly;

// Full screen is saved, but a browser only enters it after a gesture: re-apply
// it on the first key press or tap. Leaving full screen with the browser's own
// control (Escape) turns the setting off, so it reads true in Settings.
const resumeFullscreen = () => {
  window.removeEventListener('keydown', resumeFullscreen, true);
  window.removeEventListener('pointerup', resumeFullscreen, true);
  if (settings.fullScreen) setFullscreen(true);
};
window.addEventListener('keydown', resumeFullscreen, true);
window.addEventListener('pointerup', resumeFullscreen, true);
onFullscreenLeave(() => services.settings.update({ fullScreen: false }));

const scenes: SceneManager = new SceneManager({});
registerScenes(scenes, services);
// Try audio as soon as the app opens: where the browser allows sound without a
// gesture (an installed app, or a site it trusts) the title theme plays at once.
void audio.unlock();
// Quitting a game (back to the menu or the title) stops the announcer straight away.
scenes.onChange((name) => {
  if (name === 'menu' || name === 'title') voice.cancel();
});
scenes.change('title');

// F toggles full screen from anywhere it isn't a key in its own right (see
// isFullscreenShortcut), the same as Settings → FULL SCREEN, and is saved.
// A key press is a gesture, so the browser lets it go full screen.
window.addEventListener('keydown', (e) => {
  if (!isFullscreenShortcut(e, scenes.currentName, controls.keys)) return;
  e.preventDefault();
  services.settings.update({ fullScreen: !settings.fullScreen });
});

const fetchJson = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
};
loadAttractReels(fetchJson, services.catalogue).then((reels) => services.attract.push(...reels));

// Hiding the page (switching tabs, backgrounding the app) pauses an Event.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  keyboard.releaseAll(performance.now());
  touch.handler.releaseAll(performance.now());
  scenes.suspend();
  audio.hush();
  voice.cancel();
});

// Closing the tab or window (or navigating away) stops the announcer: speech
// synthesis is the operating system's, and would otherwise finish its queue.
const silence = () => {
  voice.cancel();
  audio.hush();
};
window.addEventListener('pagehide', silence);
window.addEventListener('beforeunload', silence);

// `?fps` in the URL shows the frame rate and the slowest frame, for checking
// the 60 FPS target on real devices (PRD 9).
const fps = new URLSearchParams(location.search).has('fps') ? createFpsMeter() : null;

startLoop({
  step(frame, stepEnd) {
    if (typeof navigator.getGamepads === 'function') {
      // Pads are polled, so their changes are stamped just inside this step.
      pads.poll(navigator.getGamepads(), stepEnd - 0.001);
    }
    scenes.step({
      frame,
      edges: queue.drain(stepEnd),
      keys: rawKeys.take(stepEnd).map(({ code, type }) => ({ code, type })),
      pads: rawPads.take(stepEnd).map(({ player, button, type }) => ({ player, button, type })),
      taps: taps.take(stepEnd).map(({ x, y }) => ({ x, y })),
    });
    touch.show(touchSeen ? touchModeFor(scenes) : null);
  },
  render(alpha) {
    scenes.render(ctx, alpha);
    fps?.frame(ctx, performance.now());
  },
});

// Offline play: the service worker caches the game after the first load.
// Only over https (or localhost), and relative so it works under a subpath.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* Offline play is optional; the game works without it. */
    });
  });
}

