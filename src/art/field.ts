/**
 * Art shared by the field Events: the landing field with its sector lines and
 * distance markers (Javelin and Hammer), and the officials' flags that show a
 * valid Attempt or a foul. The flags differ in shape as well as colour, so a
 * foul reads without colour vision.
 */

import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { drawText } from '../render/text.ts';
import { ART } from './colours.ts';
import { STADIUM, drawGrass, drawTrackSurface } from './stadium.ts';
import { defineSprite } from './sprite.ts';

/** Valid Attempt: a plain white flag. */
export const FLAG_VALID = defineSprite(
  'flag-valid',
  ['pwwwwww', 'pwwwwww', 'pwwwwww', 'pwwwwww', 'p......', 'p......', 'p......', 'p......'],
  { anchor: [0, 7] },
);

/** Foul: a vermilion flag with a white cross. */
export const FLAG_FOUL = defineSprite(
  'flag-foul',
  ['pfwfffw', 'pffwfwf', 'pffwfwf', 'pfwfffw', 'p......', 'p......', 'p......', 'p......'],
  { anchor: [0, 7] },
);

export const FLAG_COLOURS = Object.freeze({ p: ART.metal, w: ART.board, f: ART.foulFlag });

export interface FieldOptions {
  /** Screen x the distances are measured from (foul line or circle centre). */
  originX: number;
  /** Screen y of the field's top edge. */
  top?: number;
  /** Screen pixels between distance markers. */
  markerSpacing?: number;
  /** Label every nth marker. */
  markerLabelEvery?: number;
  /** Text for the nth marker; numbers by default. */
  label?: (n: number) => string;
}

/**
 * The landing field: infield grass in mown stripes, two sector lines fanning
 * out from the origin, and distance markers.
 */
export function drawLandingField(
  ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>,
  cameraX: number,
  { originX, top = STADIUM.groundTop, markerSpacing = 40, markerLabelEvery = 2, label = (n) => String(n * 10) }: FieldOptions,
) {
  // Textured grass in mown stripes, fixed to the world so they scroll.
  drawGrass(ctx, cameraX, top);
  // Sector lines: from the origin, one rising gently, one falling, so the field reads as a fan.
  const midY = top + Math.round((SCREEN_HEIGHT - top) / 2);
  ctx.fillStyle = ART.sector;
  for (let x = Math.max(0, Math.round(originX)); x < SCREEN_WIDTH; x++) {
    const spread = Math.floor((x - originX) / 6);
    const upper = midY - 4 - spread;
    const lower = midY + 4 + spread;
    if (upper > top) ctx.fillRect(x, upper, 1, 1);
    if (lower < SCREEN_HEIGHT) ctx.fillRect(x, lower, 1, 1);
  }
  // Distance markers: a short post with a number every few.
  for (let n = 1; ; n++) {
    const x = Math.round(originX + n * markerSpacing);
    if (x > SCREEN_WIDTH + 16) break;
    if (x < -16) continue;
    ctx.fillStyle = ART.marker;
    ctx.fillRect(x, top + 2, 1, 6);
    if (n % markerLabelEvery === 0) drawText(ctx, label(n), x, top + 13, { color: ART.marker });
  }
}

/**
 * A runway strip for the Javelin, ending at a foul line with its strip.
 *
 * @param foulX  Screen x of the foul line.
 * @param top  Screen y of the runway's top edge.
 * @param [cameraX]  So the surface's grain scrolls with the camera.
 */
export function drawRunway(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, foulX: number, top: number, height: number, cameraX: number = 0) {
  const end = Math.round(foulX);
  if (end <= 0) return;
  drawTrackSurface(ctx, cameraX, 0, top, end, height);
  ctx.fillStyle = ART.laneLine;
  ctx.fillRect(0, top, end, 1);
  ctx.fillRect(0, top + height - 1, end, 1);
  ctx.fillRect(end - 3, top, 3, height);
  ctx.fillStyle = ART.foulStrip;
  ctx.fillRect(end, top, 2, height);
}
