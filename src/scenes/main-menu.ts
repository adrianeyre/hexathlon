import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { wasPressed } from './manager.ts';
import { createMenu } from './menu.ts';

/**
 * Main menu: Arcade, Practice, Two-player, High Scores and Settings.
 * Two-player is keyboard only (PRD 6.1), so it is hidden on touch-only devices.
 * Escape goes back to the title.
 */
export function createMainMenuScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene {
  const menu = createMenu(
    [
      {
        label: 'ARCADE',
        select: () => manager.change('event', { entry: services.catalogue.arcade, mode: 'arcade', sessionStart: true }),
      },
      { label: 'PRACTICE', select: () => manager.change('practice') },
      {
        label: 'TWO PLAYER',
        hidden: () => services.touchOnly,
        select: () => manager.change('event', { entry: services.catalogue.arcade, mode: 'arcade', sessionStart: true, players: 2 }),
      },
      { label: 'HIGH SCORES', select: () => manager.change('highScores', { back: 'menu' }) },
      { label: 'SETTINGS', select: () => manager.change('settings') },
    ],
    { top: 84, rowHeight: 22 },
    services.sounds,
  );

  return {
    step(input) {
      if (menu.step(input)) return;
      if (wasPressed(input, 'PAUSE')) manager.change('title');
    },
    render(ctx) {
      ctx.fillStyle = PALETTE.background;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      drawText(ctx, 'HEXATHLON', SCREEN_WIDTH / 2, 36, { scale: 3, color: PALETTE.highlight });
      menu.render(ctx);
      drawText(ctx, services.touchOnly ? 'TAP TO CHOOSE' : '▲▼ MOVE  ENTER CHOOSE  ESC BACK  F FULL SCREEN', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 14, {
        color: PALETTE.dim,
      });
    },
  };
}
