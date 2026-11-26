import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { wasPressed } from './manager.ts';
import { createMenu } from './menu.ts';
import { DIFFICULTIES } from '../sim/difficulty.ts';
import { difficultyLevel } from '../sim/registry.ts';
import { VERSION } from '../version.ts';

/** Volume changes in steps of this much. */
export const VOLUME_STEP = 0.1;

/**
 * Settings: difficulty (Easy, Normal or Hard), full screen (filling 100% of
 * the screen), audio (sound on or off, volume, and the announcer's
 * callouts), accessibility (reduced flash), controls (remapping and the key
 * test), the Cookie Policy and the Credits, with the game's version along
 * the bottom. Changes are saved (in local
 * storage) and applied at once; a difficulty change applies from the next
 * Event or Session.
 */
export function createSettingsScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene & { readonly versionLine: string; } {
  const { settings } = services;
  const onOff = (on: boolean) => (on ? 'ON' : 'OFF');
  const menu = createMenu(
    [
      {
        label: 'DIFFICULTY',
        value: () => difficultyLevel(settings.get().difficulty).label,
        adjust: (direction) => {
          const i = DIFFICULTIES.indexOf(settings.get().difficulty);
          const next = DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, (i < 0 ? 1 : i) + direction))];
          settings.update({ difficulty: next });
        },
      },
      {
        label: 'FULL SCREEN',
        value: () => onOff(settings.get().fullScreen),
        adjust: () => settings.update({ fullScreen: !settings.get().fullScreen }),
      },
      {
        label: 'SOUND',
        value: () => onOff(!settings.get().muted),
        adjust: () => settings.update({ muted: !settings.get().muted }),
      },
      {
        label: 'VOLUME',
        value: () => `${Math.round(settings.get().volume * 100)}%`,
        adjust: (direction) => {
          const next = Math.round((settings.get().volume + direction * VOLUME_STEP) * 10) / 10;
          settings.update({ volume: Math.min(1, Math.max(0, next)) });
        },
      },
      {
        label: 'ANNOUNCER',
        value: () => onOff(settings.get().announcer),
        adjust: () => settings.update({ announcer: !settings.get().announcer }),
      },
      {
        label: 'REDUCED FLASH',
        value: () => onOff(settings.get().reducedFlash),
        adjust: () => settings.update({ reducedFlash: !settings.get().reducedFlash }),
      },
      { label: 'CONTROLS', select: () => manager.change('controls') },
      { label: 'KEY TEST', select: () => manager.change('keyTest') },
      { label: 'COOKIE POLICY', select: () => manager.change('cookiePolicy') },
      { label: 'CREDITS', select: () => manager.change('credits') },
      { label: 'BACK', select: () => manager.change('menu') },
    ],
    { top: 48, rowHeight: 15, left: 32, right: SCREEN_WIDTH - 32 },
    services.sounds,
  );

  /** The line along the bottom naming the game's version. */
  const versionLine = `VERSION: ${VERSION}`;

  return {
    get versionLine() {
      return versionLine;
    },
    enter() {
      menu.reset();
    },
    step(input) {
      if (menu.step(input)) return;
      if (wasPressed(input, 'PAUSE')) manager.change('menu');
    },
    render(ctx) {
      ctx.fillStyle = PALETTE.background;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      drawText(ctx, 'SETTINGS', SCREEN_WIDTH / 2, 28, { scale: 2, color: PALETTE.highlight });
      menu.render(ctx);
      drawText(ctx, '◀▶ CHANGE   ESC BACK', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 18, { color: PALETTE.dim });
      drawText(ctx, versionLine, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 6, { color: PALETTE.dim });
    },
  };
}
