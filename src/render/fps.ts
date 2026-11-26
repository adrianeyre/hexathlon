/**
 * An on-screen frame-rate meter, shown with `?fps` in the URL, for checking
 * the 60 FPS target on real devices (PRD 9, 13). It reports the frames drawn
 * in the last second and the longest gap between two of them.
 */

import { SCREEN_HEIGHT } from './display.ts';
import { PALETTE } from './palette.ts';
import { drawText } from './text.ts';

export function createFpsMeter() {
  let windowStart = -1;
  let last = -1;
  let frames = 0;
  let worst = 0;
  let label = '-- FPS';

  return {
    /**
     * Count a drawn frame and draw the meter over it.
     * @param now  Milliseconds.
     */
    frame(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, now: number) {
      if (windowStart < 0) windowStart = now;
      if (last >= 0) worst = Math.max(worst, now - last);
      last = now;
      frames += 1;
      if (now - windowStart >= 1000) {
        label = `${Math.round((frames * 1000) / (now - windowStart))} FPS  MAX ${worst.toFixed(1)} MS`;
        windowStart = now;
        frames = 0;
        worst = 0;
      }
      ctx.fillStyle = PALETTE.overlay;
      ctx.fillRect(0, SCREEN_HEIGHT - 11, 128, 11);
      drawText(ctx, label, 2, SCREEN_HEIGHT - 5, { align: 'left', color: PALETTE.highlight });
    },

    get label() {
      return label;
    },
  };
}
