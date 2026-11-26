import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { PALETTE } from '../render/palette.ts';
import { TITLE_LAYOUT, drawTitleArt } from '../render/title-art.ts';
import { drawText } from '../render/text.ts';
import { wasPressed } from './manager.ts';

/** Frames of inactivity on the title screen before the High Score table, then Attract Mode, take over. */
export const TITLE_IDLE_FRAMES = 10 * 60;
/** How long the High Score table shows during the idle cycle. */
export const IDLE_TABLE_FRAMES = 8 * 60;

/**
 * Title screen: the Hexathlon logo over a floodlit stadium, with the theme.
 * START (Enter, Space, a tap or a pad's Start) or Action opens the main menu.
 * The theme is asked for on entry. `main.js` tries to start audio as the app
 * opens; where the browser insists on a gesture first, the theme starts with
 * the first key press, click or tap (only an event handler counts as a
 * gesture, and this step runs from the frame loop).
 *
 * Left idle, it shows the High Score table and then Attract Mode.
 */
export function createTitleScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene {
  let frame = 0;
  return {
    enter() {
      frame = 0;
      services.sounds.theme();
    },
    step(input) {
      frame += 1;
      if (wasPressed(input, 'START') || wasPressed(input, 'ACTION') || (input.taps?.length ?? 0) > 0) {
        manager.change('menu');
      } else if (input.edges.some((e) => e.type === 'press') || (input.keys ?? []).some((k) => k.type === 'press')) {
        frame = 0; // Someone is there: stay on the title.
      } else if (frame >= TITLE_IDLE_FRAMES) {
        manager.change('highScores', { back: 'title', next: 'attract', timeout: IDLE_TABLE_FRAMES });
      }
    },
    render(ctx) {
      const reducedFlash = services.settings.get().reducedFlash;
      drawTitleArt(ctx, { frame, reducedFlash });
      // Blink at 1 Hz (40 frames on, 20 off), or hold steady with reduced flash.
      if (reducedFlash || frame % 60 < 40) {
        drawText(ctx, 'PRESS START', SCREEN_WIDTH / 2, TITLE_LAYOUT.pressStartY, { scale: 2, color: PALETTE.text });
      }
      drawText(ctx, services.touchOnly ? 'TAP TO START' : 'ENTER / SPACE / TAP   F FULL SCREEN', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 8, {
        color: PALETTE.dim,
      });
    },
  };
}
