/**
 * 100m Dash art: start blocks, the finish post and the track backdrop with
 * its start and finish lines. The athletes are the shared frames in
 * `athlete.js` (run cycle and start crouch); the Rival wears the `RIVAL` kit.
 */

import { drawText } from '../render/text.ts';
import { RUN, CROUCH, CHEER, STAND } from './athlete.ts';
import { ART } from './colours.ts';
import { TRACK, drawBackdrop, drawTrack, drawTrackLine, laneFeetY, trackBottom, trackShear } from './stadium.ts';
import { defineSprite, drawSprite } from './sprite.ts';

/** Starting blocks, seen from the side, front edge at the anchor. */
export const START_BLOCKS = defineSprite(
  'start-blocks',
  ['.......m', '.....mmm', '..m.mmmm', '.mmmmmmm', 'dddddddd'],
  { anchor: [7, 4] },
);

/** The finish post: a striped pole with a hexagon timer on top. */
export const FINISH_POST = defineSprite(
  'finish-post',
  [
    '..ggg..',
    '.gwwwg.',
    'gwgwgwg',
    '.gwwwg.',
    '..ggg..',
    '...w...',
    '...x...',
    '...w...',
    '...x...',
    '...w...',
    '...x...',
    '...w...',
    '...x...',
    '...w...',
    '...x...',
    '...w...',
  ],
  { anchor: [3, 15] },
);

/** Colours for the props above. */
export const SPRINT_PROPS = Object.freeze({
  m: ART.metal,
  d: ART.metalDark,
  g: ART.banner,
  w: ART.laneLine,
  x: ART.hurdleStripe,
});

/** The frames a 100m renderer needs, by name. */
export const SPRINT_FRAMES = Object.freeze({ run: RUN, crouch: CROUCH, stand: STAND, cheer: CHEER });

export interface SprintBackdropOptions {
  /** Screen x of the start line. */
  startX: number;
  /** Screen x of the finish line. */
  finishX: number;
  frame?: number;
  excitement?: number;
  reducedFlash?: boolean;
  /** Lanes that have start blocks out (before the gun). */
  blocks?: readonly number[];
}

/**
 * The whole 100m backdrop: stadium, lanes with numbers, start and finish lines.
 *
 * @param cameraX  World x at the left edge of the screen.
 */
export function drawSprintBackdrop(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, { startX, finishX, frame = 0, excitement, reducedFlash, blocks = [] }: SprintBackdropOptions) {
  drawBackdrop(ctx, cameraX, { frame, excitement, reducedFlash });
  drawTrack(ctx, cameraX);
  drawTrackLine(ctx, startX, ART.laneLine);
  // The finish line is chequered so it reads without colour, and leans with the track.
  const fx = Math.round(finishX);
  for (let y = TRACK.top; y < trackBottom(); y += 2) {
    ctx.fillStyle = ((y - TRACK.top) / 2) % 2 ? ART.laneLine : ART.hurdleStripe;
    ctx.fillRect(fx + trackShear(y), y, 2, 2);
  }
  drawSprite(ctx, FINISH_POST, finishX + trackShear(TRACK.top), TRACK.top, SPRINT_PROPS);
  for (let lane = 1; lane <= TRACK.lanes; lane++) {
    const y = laneFeetY(lane);
    drawText(ctx, String(lane), startX - 10 + trackShear(y - 6), y - 6, { color: ART.laneLine });
    if (blocks.includes(lane)) drawSprite(ctx, START_BLOCKS, startX - 2 + trackShear(y), y, SPRINT_PROPS);
  }
}
