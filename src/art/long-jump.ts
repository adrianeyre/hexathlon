/**
 * Long Jump art: take-off, flight and landing frames, and the runway, the
 * take-off board (with its foul strip) and the sand pit. The Run-up uses the
 * shared run cycle in `athlete.js`.
 */

import { RUN } from './athlete.ts';
import { ART } from './colours.ts';
import { STADIUM, drawBackdrop, drawGrass, drawTrackSurface } from './stadium.ts';
import { defineSprite, defineTallSprite, drawSprite } from './sprite.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';

/** Driving off the board: lead knee up, arms swinging up, push-off leg long behind. */
export const TAKEOFF = defineTallSprite(
  'long-jump-takeoff',
  [
    '......hhhh..kk..',
    '.....hhhhhhhkk..',
    '....hhhhhhhhhk..',
    '....bbbbbbbbbk..',
    '....hhkkkkkok...',
    '....hkkkkkkkkk..',
    '.....kkkkkkk....',
    '.......kkk......',
    '......sssss.....',
    '.....sssssst....',
    '...nnsssssst....',
    '..nn..sssss.....',
    '......sssss.....',
    '......pppppkk...',
    '.....qqppppkkk..',
    '.....qq.....kk..',
    '....nn.....eee..',
    '....nn..........',
    '...nn...........',
    '...nn...........',
    '..nn............',
    '.eee............',
  ],
  { anchor: [3, 21] },
);

/** Flight, two frames: hang (upright, arms high) then sail (legs reaching forward). */
export const FLIGHT = Object.freeze([
  defineTallSprite(
    'long-jump-hang',
    [
      '...k......k.....',
      '...kkhhhhkk.....',
      '....khhhhhhhk...',
      '....hhhhhhhhh...',
      '....bbbbbbbbb...',
      '....hhkkkkkok...',
      '....hkkkkkkkkk..',
      '.....kkkkkkk....',
      '.......kkk......',
      '......sssss.....',
      '......sssst.....',
      '......sssst.....',
      '......sssss.....',
      '......ppppp.....',
      '.....qqqpppp....',
      '....nnn...kk....',
      '...nn.....kk....',
      '..nn.......kk...',
      '..ee........kk..',
      '...........eee..',
    ],
    { anchor: [8, 19], from: 9 },
  ),
  defineSprite(
    'long-jump-sail',
    [
      '.......hhhh.........',
      '......hhhhhhh.......',
      '.....hhhhhhhhh......',
      '.....bbbbbbbbb......',
      '.....hhkkkkkok......',
      '.....hkkkkkkkkk.....',
      '......kkkkkkk.......',
      '........kkk.kk......',
      '.......sssss.kk.....',
      '.......ssssst.kk....',
      '.......ssssst..k....',
      '.......sssss........',
      '.......pppppppkkkkee',
      '.......qqqqqqqnnnnee',
    ],
    { anchor: [10, 13] },
  ),
]);

/** Landed: sitting in the sand, legs out in front. */
export const LAND = defineSprite(
  'long-jump-land',
  [
    '......hhhh..........',
    '.....hhhhhhh........',
    '....hhhhhhhhh.......',
    '....bbbbbbbbb.......',
    '....hhkkkkkok.......',
    '....hkkkkkkkkk......',
    '.....kkkkkkk........',
    '.......kkk..........',
    '......ssssskk.......',
    '......sssst.kk......',
    '......sssst..k......',
    '......ssssppppkkkkee',
    '......qqqqqqqqnnnnee',
  ],
  { anchor: [9, 12] },
);

/** The dent the landing leaves in the sand. */
export const SAND_MARK = defineSprite('sand-mark', ['.dddd.', 'dddddd'], { anchor: [0, 1] });

/** Every Long Jump frame, Run-up first. */
export const LONG_JUMP_FRAMES = Object.freeze({ run: RUN, takeoff: TAKEOFF, flight: FLIGHT, land: LAND });

/**
 * Where the Long Jump ground sits on screen. The runway runs along the
 * ground's top part; the pit is cut into it beyond the board.
 */
export const LONG_JUMP_GROUND = Object.freeze({
  runwayTop: STADIUM.groundTop + 34,
  runwayHeight: 22,
  boardWidth: 4,
  foulStripWidth: 2,
});

/**
 * Screen y of an athlete's feet on the runway.
 */
export const RUNWAY_FEET_Y = LONG_JUMP_GROUND.runwayTop + LONG_JUMP_GROUND.runwayHeight - 6;

export interface LongJumpGroundOptions {
  /** Screen x of the board's front edge (the foul line). */
  boardX: number;
  /** Screen x where the sand starts. */
  pitStartX: number;
  /** Screen x where the sand ends. */
  pitEndX: number;
  /** Screen pixels between distance markers along the pit. */
  markerSpacing?: number;
  /** Screen x of landing dents. */
  marks?: readonly number[];
  frame?: number;
  excitement?: number;
  reducedFlash?: boolean;
}

/**
 * Stadium, runway, board and sand pit.
 */
export function drawLongJumpGround(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, { boardX, pitStartX, pitEndX, markerSpacing = 24, marks = [], ...rest }: LongJumpGroundOptions) {
  const { runwayTop, runwayHeight, boardWidth, foulStripWidth } = LONG_JUMP_GROUND;
  drawBackdrop(ctx, cameraX, rest);
  drawGrass(ctx, cameraX, STADIUM.groundTop);
  // Runway with white edges.
  drawTrackSurface(ctx, cameraX, 0, runwayTop, SCREEN_WIDTH, runwayHeight);
  ctx.fillStyle = ART.laneLine;
  ctx.fillRect(0, runwayTop, SCREEN_WIDTH, 1);
  ctx.fillRect(0, runwayTop + runwayHeight - 1, SCREEN_WIDTH, 1);
  // Sand pit: a darker rim around lighter sand.
  const left = Math.round(pitStartX);
  const width = Math.round(pitEndX) - left;
  ctx.fillStyle = ART.sandDark;
  ctx.fillRect(left - 2, runwayTop - 6, width + 4, runwayHeight + 12);
  ctx.fillStyle = ART.sand;
  ctx.fillRect(left, runwayTop - 4, width, runwayHeight + 8);
  for (const x of marks) drawSprite(ctx, SAND_MARK, x, runwayTop + runwayHeight - 5, { d: ART.sandDark });
  // Distance markers beside the pit, every `markerSpacing` pixels from the board.
  ctx.fillStyle = ART.marker;
  for (let x = Math.round(boardX) + markerSpacing; x < pitEndX; x += markerSpacing) {
    if (x >= pitStartX) ctx.fillRect(x, runwayTop + runwayHeight + 7, 1, 4);
  }
  // Take-off board, with the foul strip just past its front edge.
  ctx.fillStyle = ART.board;
  ctx.fillRect(Math.round(boardX) - boardWidth, runwayTop + 1, boardWidth, runwayHeight - 2);
  ctx.fillStyle = ART.foulStrip;
  ctx.fillRect(Math.round(boardX), runwayTop + 1, foulStripWidth, runwayHeight - 2);
}
