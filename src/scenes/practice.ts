import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { formatMark } from '../render/marks.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { wasPressed } from './manager.ts';
import { createMenu } from './menu.ts';

/**
 * Practice: pick any Event and play it with unlimited Attempts and no
 * qualification. Events that aren't built yet are listed but disabled.
 */
export function createPracticeScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene {
  const entries = services.catalogue.practice;
  const menu = createMenu(
    [
      ...entries.map((entry) => ({
        label: entry.name,
        value: () => {
          if (!entry.sim) return 'SOON';
          const best = entry.eventId ? services.storage.getPersonalBests()[entry.eventId] : undefined;
          return best ? `BEST ${formatMark(best.value, best.unit, entry.eventId)}` : '';
        },
        disabled: () => !entry.sim,
        select: () => manager.change('event', { entry, mode: 'practice' }),
      })),
      { label: 'BACK', select: () => manager.change('menu') },
    ],
    { top: 52, rowHeight: 18, left: 24, right: SCREEN_WIDTH - 24 },
    services.sounds,
  );

  return {
    enter(params: { entryId?: unknown; }) {
      menu.reset();
      // Coming back from an Event keeps the cursor on it.
      const i = entries.findIndex((e) => e.id === params.entryId);
      if (i >= 0) menu.index = i;
    },
    step(input) {
      if (menu.step(input)) return;
      if (wasPressed(input, 'PAUSE')) manager.change('menu');
    },
    render(ctx) {
      ctx.fillStyle = PALETTE.background;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      drawText(ctx, 'PRACTICE', SCREEN_WIDTH / 2, 22, { scale: 2, color: PALETTE.highlight });
      menu.render(ctx);
      drawText(ctx, 'UNLIMITED ATTEMPTS - NO STANDARDS', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 14, { color: PALETTE.dim });
    },
  };
}
