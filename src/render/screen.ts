import { SCREEN_HEIGHT, SCREEN_WIDTH, fitFill, fitLetterbox } from './display.ts';

/** Whether the canvas fills the whole viewport (full-screen mode) instead of letterboxing. */
let fill = false;
/** Re-sizes the canvas; set once `setupScreen` has run. */
let resize = () => {};

/**
 * Size the canvas to the window and keep it sized on resize and rotation.
 * It is letterboxed at a crisp whole-number scale, or in full-screen mode
 * stretched to 100% of the screen.
 */
export function setupScreen(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.imageSmoothingEnabled = false;

  resize = () => {
    const viewport = window.visualViewport;
    const width = viewport ? viewport.width : window.innerWidth;
    const height = viewport ? viewport.height : window.innerHeight;
    const box = fill ? fitFill(width, height) : fitLetterbox(width, height, window.devicePixelRatio || 1);
    canvas.style.width = `${box.cssWidth}px`;
    canvas.style.height = `${box.cssHeight}px`;
  };

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  window.visualViewport?.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', () => resize());
  // devicePixelRatio changes (browser zoom, moving between monitors) don't fire resize everywhere.
  const watchDpr = () => {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener(
      'change',
      () => {
        resize();
        watchDpr();
      },
      { once: true },
    );
  };
  watchDpr();
  return ctx;
}

/** Whether the page is in the browser's full-screen mode. */
export function isFullscreen() {
  return Boolean(document.fullscreenElement);
}

/**
 * Turn full-screen mode on or off: the canvas fills 100% of the screen, and
 * the browser goes full screen where it can. The browser only allows that
 * shortly after a key press or tap, so turning it on from a menu works, and a
 * saved setting is re-applied by `resumeFullscreen` on the first gesture.
 * Where there is no Fullscreen API (an iPhone's Safari), the canvas still
 * fills the whole window.
 */
export function setFullscreen(on: boolean) {
  fill = on;
  resize();
  const root = document.documentElement;
  try {
    if (on && !document.fullscreenElement && typeof root.requestFullscreen === 'function') {
      root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        /* Not allowed right now (no recent gesture): the canvas still fills the window. */
      });
    } else if (!on && document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch(() => {});
    }
  } catch {
    /* Older browsers throw instead of rejecting. */
  }
}

/**
 * Call `onLeave` when the browser leaves full screen by itself (the player
 * pressed Escape or used the browser's own control), so the setting follows.
 */
export function onFullscreenLeave(onLeave: () => void) {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && fill) onLeave();
  });
}
