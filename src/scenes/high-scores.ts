import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { HIGH_SCORE_ROWS } from '../storage.ts';
import { anyPress } from './manager.ts';

/**
 * The High Score table: Session Points totals with three-letter initials.
 * Shown from the main menu and as part of the title screen's idle cycle.
 *
 * Params: `back` is the scene any press returns to; `next` and `timeout`
 * (frames) move on automatically; `highlight` marks a freshly entered row.
 */
export function createHighScoresScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene {
  let back = 'title';
  let next: string | null = null;
  let timeout = 0;
  let highlight = -1;
  let frame = 0;
  let table: import('../storage.ts').HighScore[] = [];

  return {
    enter(params) {
      back = typeof params.back === 'string' ? params.back : 'title';
      next = typeof params.next === 'string' ? params.next : null;
      timeout = typeof params.timeout === 'number' ? params.timeout : 0;
      highlight = typeof params.highlight === 'number' ? params.highlight : -1;
      frame = 0;
      table = services.storage.getHighScores();
    },
    step(input) {
      frame += 1;
      // A short pause first, so the press that opened the table doesn't close it.
      if (frame > 10 && anyPress(input)) manager.change(back);
      else if (next && timeout > 0 && frame >= timeout) manager.change(next);
    },
    render(ctx) {
      ctx.fillStyle = PALETTE.background;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      drawText(ctx, 'HIGH SCORES', SCREEN_WIDTH / 2, 22, { scale: 2, color: PALETTE.highlight });
      const reducedFlash = services.settings.get().reducedFlash;
      for (let i = 0; i < HIGH_SCORE_ROWS; i++) {
        const y = 50 + i * 16;
        const row = table[i];
        const isNew = i === highlight;
        const color = isNew ? PALETTE.highlight : row ? PALETTE.text : PALETTE.disabled;
        if (isNew && !reducedFlash && frame % 30 >= 20) continue;
        const rank = `${i + 1}`.padStart(2, ' ');
        drawText(ctx, `${isNew ? '▶' : ' '}${rank}.`, 76, y, { color, align: 'left' });
        drawText(ctx, row ? row.initials : '---', 112, y, { color, align: 'left' });
        drawText(ctx, row ? `${row.points}` : '0', 244, y, { color, align: 'right' });
      }
      if (table.length === 0) drawText(ctx, 'NO HIGH SCORES YET', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 16, { color: PALETTE.dim });
    },
  };
}
