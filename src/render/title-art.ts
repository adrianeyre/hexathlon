/**
 * The title screen's artwork: the floodlit stadium, the HEXATHLON logo on a
 * panel with a row of six hexagons (one per Event), and athletes in all three
 * kits running laps of the track. Original to Hexathlon; see the style guide.
 */

import { RUN } from '../art/athlete.ts';
import { ART, KITS } from '../art/colours.ts';
import { SHADOW, drawBackdrop, drawTrack, laneFeetY, trackBottom } from '../art/stadium.ts';
import { drawSprite } from '../art/sprite.ts';
import { runStepFrames } from '../art/style.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './display.ts';
import { PALETTE } from './palette.ts';
import { drawText } from './text.ts';

/** Where the title's parts sit, in internal pixels. */
export const TITLE_LAYOUT = Object.freeze({
  panel: Object.freeze({ x: 16, y: 12, w: SCREEN_WIDTH - 32, h: 68 }),
  logoY: 34,
  hexY: 64,
  hexRadius: 7,
  hexSpacing: 22,
  pressStartY: trackBottom() + 14,
});

/** The runners on the title: lane, kit and speed in pixels per frame. */
const RUNNERS = Object.freeze([
  { lane: 1, kit: KITS.rival, speed: 1.6, phase: 40 },
  { lane: 2, kit: KITS.player1, speed: 1.9, phase: 0 },
  { lane: 3, kit: KITS.player2, speed: 1.75, phase: 120 },
]);

/** Frames per run-cycle step at the title's jogging pace. */
const STRIDE_FRAMES = runStepFrames(0.55);

/**
 * Fill a flat-topped hexagon.
 * @param r  Distance from the centre to a corner.
 */
export function fillHexagon(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cx: number, cy: number, r: number, colour: string) {
  const h = Math.round((r * Math.sqrt(3)) / 2);
  ctx.fillStyle = colour;
  for (let dy = -h; dy <= h; dy++) {
    const half = Math.round(r - Math.abs(dy) / Math.sqrt(3));
    ctx.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2 + 1, 1);
  }
}

export interface TitleArtOptions {
  /** Frames since the title appeared. */
  frame: number;
  /** Hold the hexagons steady and the crowd still. */
  reducedFlash: boolean;
}

/**
 * Everything on the title except its prompts.
 */
export function drawTitleArt(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, { frame, reducedFlash }: TitleArtOptions) {
  // The camera drifts slowly so the stand scrolls behind the logo.
  const cameraX = frame * 0.5;
  drawBackdrop(ctx, cameraX, { frame, excitement: 0.5, reducedFlash });
  drawTrack(ctx, cameraX);

  for (const { lane, kit, speed, phase } of RUNNERS) {
    const lap = SCREEN_WIDTH + 40;
    const x = ((frame * (speed - 0.5) + phase) % lap) - 20;
    const y = laneFeetY(lane);
    drawSprite(ctx, SHADOW, x, y + 1, { x: ART.shadow });
    drawSprite(ctx, RUN[Math.floor((frame + phase) / STRIDE_FRAMES) % RUN.length], x, y, kit);
  }

  const { panel, logoY, hexY, hexRadius, hexSpacing } = TITLE_LAYOUT;
  ctx.fillStyle = PALETTE.overlay;
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.fillStyle = ART.standRail;
  ctx.fillRect(panel.x, panel.y, panel.w, 1);
  ctx.fillRect(panel.x, panel.y + panel.h - 1, panel.w, 1);
  // The logo, with a drop shadow so it lifts off the panel.
  drawText(ctx, 'HEXATHLON', SCREEN_WIDTH / 2 + 2, logoY + 2, { scale: 4, color: ART.shadow });
  drawText(ctx, 'HEXATHLON', SCREEN_WIDTH / 2, logoY, { scale: 4, color: PALETTE.highlight });
  // Six hexagons, one per Event. One at a time is lit, stepping along once a
  // second; with reduced flash they all stay lit.
  const lit = Math.floor(frame / 60) % 6;
  for (let i = 0; i < 6; i++) {
    const cx = SCREEN_WIDTH / 2 + (i - 2.5) * hexSpacing;
    const on = reducedFlash || i === lit;
    fillHexagon(ctx, cx, hexY, hexRadius + 1, ART.standRail);
    fillHexagon(ctx, cx, hexY, hexRadius, on ? PALETTE.highlight : ART.standSeat);
    drawText(ctx, String(i + 1), cx + 1, hexY, { color: on ? ART.sky : ART.standRail });
  }
}
