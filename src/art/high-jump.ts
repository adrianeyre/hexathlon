/**
 * High Jump art: take-off, two clearance frames (arched over the bar, then
 * legs kicking clear), knocking the bar, and landing on the mat; plus the
 * bar, the uprights with their height pegs, and the mat. The Run-up uses the
 * shared run cycle.
 */

import { RUN } from './athlete.ts';
import { ART } from './colours.ts';
import { STADIUM, drawBackdrop, drawGrass, drawTrackSurface } from './stadium.ts';
import { defineSprite, defineTallSprite } from './sprite.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';

/** Springing up off the take-off foot, knee and arms driving up. */
export const TAKEOFF = defineTallSprite(
  'high-jump-takeoff',
  [
    '.....k....k.....',
    '.....khhhhk.....',
    '.....hhhhhhh....',
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
    '......pppppkk...',
    '......qqpppkkk..',
    '......qq....kk..',
    '......nn...eee..',
    '......nn........',
    '......nn........',
    '......nn........',
    '......nn........',
    '.....eee........',
  ],
  { anchor: [7, 21], from: 9 },
);

/** Over the bar, two frames: back arched with hips highest, then legs kicking up and over. */
export const CLEAR = Object.freeze([
  defineSprite(
    'high-jump-arch',
    [
      '..........ssssspp.........',
      '........ssssssssppqq......',
      '......sssssttsss.pqqnn....',
      '....kksssssss.....qqnnn...',
      '..hhhhhkk...........nnkk..',
      '.hhhhhhhh............kkkk.',
      'hhbbkkkkkk.............eee',
      'hhbbkkkkok..............ee',
      'hhbbkkkkkk................',
      '.hbbkkkkk.................',
      '..hhkkkk..................',
    ],
    { anchor: [13, 0] },
  ),
  defineSprite(
    'high-jump-kick',
    [
      '....................eee...',
      '..................kkeee...',
      '................kkkknn....',
      '..............qqkkknnn....',
      '..........sspppqq.nn......',
      '........ssssspppq.........',
      '......sssssttss...........',
      '....kksssssss.............',
      '..hhhhhkk.................',
      '.hhhhhhhh.................',
      'hhbbkkkkkk................',
      'hhbbkkkkok................',
      'hhbbkkkkkk................',
      '.hbbkkkkk.................',
      '..hhkkkk..................',
    ],
    { anchor: [13, 5] },
  ),
]);

/** Knocking the bar: crumpled, falling backwards with arms up. */
export const KNOCK = defineSprite(
  'high-jump-knock',
  [
    '.k..............ee....',
    '..k...........kkee....',
    '...k.hhhh....kkk......',
    '....hhhhhhh.pkkn......',
    '...hhhhhhhhqppnn......',
    '...bbbbbbbbsppnn......',
    '...hhkkkkokssp.ee.....',
    '...hkkkkkkkssss.......',
    '....kkkkkkksst........',
    '......kkk.ssss........',
    '........kk............',
    '.........kk...........',
  ],
  { anchor: [10, 5] },
);

/** Landed on the mat, lying on the back. */
export const LAND = defineSprite(
  'high-jump-land',
  [
    '...hhhh.................',
    '..hhhhhhh..........ee...',
    '.hhbbkkkk.k.......kee...',
    'hhbbkkkkkk.k....kkkk....',
    'hhbbkkkkokssssspppkk....',
    'hhbbkkkkkksssstqqqnn....',
    '.hhbkkkkk.ssssqqq.nn....',
    '..hhkkkk...........ee...',
  ],
  { anchor: [12, 7] },
);

/** Every High Jump frame. */
export const HIGH_JUMP_FRAMES = Object.freeze({ run: RUN, takeoff: TAKEOFF, clear: CLEAR, knock: KNOCK, land: LAND });

/** Where the High Jump apron, uprights and mat sit on screen. */
export const HIGH_JUMP_GROUND = Object.freeze({
  apronTop: STADIUM.groundTop + 40,
  feetY: STADIUM.groundTop + 70,
  matWidth: 56,
  matHeight: 12,
  uprightHeight: 72,
  pegSpacing: 6,
});

export interface HighJumpOptions {
  /** Screen x of the bar's centre (between the uprights). */
  barX: number;
  /** Screen y of the bar's top edge (the current height). */
  barY: number;
  /** The bar resting, knocked off, or on the ground. */
  bar?: 'up' | 'falling' | 'down';
  frame?: number;
  excitement?: number;
  reducedFlash?: boolean;
}

/**
 * Stadium, apron, mat, the far upright and the bar. Draw the athlete next,
 * then `drawNearUpright`.
 */
export function drawHighJumpGround(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, { barX, barY, bar = 'up', ...rest }: HighJumpOptions) {
  const { apronTop, feetY, matWidth, matHeight } = HIGH_JUMP_GROUND;
  drawBackdrop(ctx, cameraX, rest);
  drawGrass(ctx, cameraX, STADIUM.groundTop);
  // The apron the Run-up crosses.
  drawTrackSurface(ctx, cameraX, 0, apronTop, SCREEN_WIDTH, feetY - apronTop + 8);
  ctx.fillStyle = ART.trackDark;
  ctx.fillRect(0, feetY + 4, SCREEN_WIDTH, 4);
  // The mat beyond the bar: a thick block with a lighter top.
  const matLeft = Math.round(barX) - 6;
  ctx.fillStyle = ART.mat;
  ctx.fillRect(matLeft, feetY - matHeight + 2, matWidth, matHeight);
  ctx.fillStyle = ART.matTop;
  ctx.fillRect(matLeft, feetY - matHeight + 2, matWidth, 3);
  drawUpright(ctx, barX - 3, feetY - 4);
  drawBar(ctx, barX, barY, bar);
}

/** Half the bar's on-screen length (it is seen nearly end-on, slightly from the side). */
export const BAR_HALF = 8;

/**
 * The bar: striped so it reads at any height, tilting as it falls.
 */
export function drawBar(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, barX: number, barY: number, state: 'up' | 'falling' | 'down') {
  const x = Math.round(barX) - BAR_HALF;
  const y = state === 'down' ? HIGH_JUMP_GROUND.feetY - 1 : Math.round(barY);
  for (let i = 0; i < BAR_HALF * 2; i++) {
    const drop = state === 'falling' ? Math.floor(i / 3) : 0;
    ctx.fillStyle = Math.floor(i / 3) % 2 ? ART.barStripe : ART.bar;
    ctx.fillRect(x + i, y + drop, 1, 2);
  }
}

/**
 * One upright: a white pole with a peg mark every `pegSpacing` pixels.
 */
export function drawUpright(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, x: number, baseY: number) {
  const { uprightHeight, pegSpacing } = HIGH_JUMP_GROUND;
  const left = Math.round(x);
  ctx.fillStyle = ART.upright;
  ctx.fillRect(left, baseY - uprightHeight, 2, uprightHeight);
  ctx.fillRect(left - 3, baseY, 8, 2);
  ctx.fillStyle = ART.metalDark;
  for (let y = baseY - pegSpacing; y > baseY - uprightHeight; y -= pegSpacing) ctx.fillRect(left + 2, y, 1, 1);
}

/**
 * The near upright, drawn over the athlete.
 */
export function drawNearUpright(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, barX: number) {
  drawUpright(ctx, barX + 2, HIGH_JUMP_GROUND.feetY);
}
