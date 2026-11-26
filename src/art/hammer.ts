/**
 * Hammer Throw art: four spin frames (front, side, back, other side), the
 * release, the hammer (ball and wire), and the overview of the field: the
 * throwing circle in its cage and the landing sector with its distance arcs.
 */

import { ART } from './colours.ts';
import { STADIUM, drawBackdrop, drawGrass, drawTrackSurface } from './stadium.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { drawText } from '../render/text.ts';
import { defineSprite, defineTallSprite, drawLine } from './sprite.ts';

/** Spinning, facing the camera with the arms swung out to the right. */
const SPIN_FRONT = defineTallSprite(
  'hammer-spin-front',
  [
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '....bbbbbbbb....',
    '....hkokkokh....',
    '....hkkkkkkh....',
    '.....kkkkkk.....',
    '.....kkookk.....',
    '.......kk.......',
    '.....ssssss.....',
    '....sssssssskk..',
    '....sssttsss.kk.',
    '....sssttsss..kk',
    '....ssssssss....',
    '....pppppppp....',
    '....pppppppp....',
    '....pp....pp....',
    '....kk....kk....',
    '....kk....kk....',
    '...kk......kk...',
    '...kk......kk...',
    '...kk......kk...',
    '..eee......eee..',
  ],
  { anchor: [8, 21], points: { hand: [15, 11] } },
);

/** Spinning, side-on with the arms out in front. */
const SPIN_SIDE = defineTallSprite(
  'hammer-spin-side',
  [
    '......hhhh......',
    '.....hhhhhhh....',
    '....hhhhhhhhh...',
    '....bbbbbbbbb...',
    '....hhkkkkkok...',
    '....hkkkkkkkkk..',
    '.....kkkkkkk....',
    '.......kkk......',
    '......sssss.....',
    '......sssssskkkk',
    '......ssssstnnnn',
    '......sssss.....',
    '......sssss.....',
    '......ppppp.....',
    '.....qqppppp....',
    '.....qq...pp....',
    '.....nn...kk....',
    '.....nn....kk...',
    '....nn.....kk...',
    '....nn.....kk...',
    '....nn.....kk...',
    '...eee.....eee..',
  ],
  { anchor: [8, 21], points: { hand: [15, 9] } },
);

/** Spinning, back to the camera with the arms swung out to the left. */
const SPIN_BACK = defineTallSprite(
  'hammer-spin-back',
  [
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '....bbbbbbbb....',
    '....hhhhhhhh....',
    '....hhhhhhhh....',
    '.....hhhhhh.....',
    '.....kkkkkk.....',
    '.......kk.......',
    '.....ssssss.....',
    '..kkssssssss....',
    '.kk.ssssssss....',
    'kk..ssssssss....',
    '....ssssssss....',
    '....pppppppp....',
    '....pppppppp....',
    '....pp....pp....',
    '....kk....kk....',
    '....kk....kk....',
    '...kk......kk...',
    '...kk......kk...',
    '...kk......kk...',
    '..eee......eee..',
  ],
  { anchor: [8, 21], points: { hand: [0, 11] } },
);

/**
 * One turn of the spin, in order. The fourth step is the side frame mirrored.
 */
export const SPIN: readonly { sprite: import('./sprite.ts').Sprite; flip: boolean; }[] = Object.freeze([
  { sprite: SPIN_FRONT, flip: false },
  { sprite: SPIN_SIDE, flip: false },
  { sprite: SPIN_BACK, flip: false },
  { sprite: SPIN_SIDE, flip: true },
]);

/** Letting go: leaning back, arms flung up and forward. */
export const RELEASE = defineTallSprite(
  'hammer-release',
  [
    '...........kk...',
    '......hhhhkk....',
    '.....hhhhhhh....',
    '....hhhhhhhhh...',
    '....bbbbbbbbb...',
    '....hhkkkkkok...',
    '....hkkkkkkkkk..',
    '.....kkkkkkk....',
    '.......kkk......',
    '.....sssss......',
    '.....sssssn.....',
    '.....sssst.n....',
    '.....sssss......',
    '.....sssss......',
    '.....ppppp......',
    '....qqppppp.....',
    '....qq....pp....',
    '...nn.....kk....',
    '...nn......kk...',
    '..nn.......kk...',
    '..nn.......kk...',
    '.eee.......eee..',
  ],
  { anchor: [8, 21], points: { hand: [12, 0] }, from: 9 },
);

/** The hammer's ball, anchored at its centre. */
export const BALL = defineSprite('hammer-ball', ['.mmm.', 'mmmmd', 'mmmdd', 'mmddd', '.ddd.'], { anchor: [2, 2] });

/** Colours for the hammer and the cage. */
export const HAMMER_COLOURS = Object.freeze({ m: ART.metal, d: ART.metalDark, w: ART.metal, c: ART.cage });

/**
 * Draw the wire from the hand to the ball.
 */
export function drawWire(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, hand: readonly [number, number], ball: readonly [number, number]) {
  drawLine(ctx, hand[0], hand[1], ball[0], ball[1], ART.metalDark);
}

/** Every Hammer frame. */
export const HAMMER_FRAMES = Object.freeze({ spin: SPIN, release: RELEASE, ball: BALL });

/**
 * The Hammer is seen from high above (an overview), as in the arcade
 * originals: the throwing circle near the bottom left inside its cage, and
 * the landing sector fanning out across the field to the right with an arc
 * every ten metres. Distances across the screen are squashed by `yScale`,
 * the view's tilt, so the whole sector fits.
 */
export const HAMMER_GROUND = Object.freeze({
  /** Screen y of the circle's centre. */
  circleY: 186,
  circleRadiusX: 14,
  circleRadiusY: 7,
  /** The cage: a ring of posts round the circle, open towards the field. */
  cageRadiusX: 28,
  cageRadiusY: 14,
  cageHeight: 30,
  /** Degrees either side of straight down the field left open. */
  cageOpening: 40,
  /** Screen pixels up the screen per pixel across the field (the view's tilt). */
  yScale: 0.5,
  /** Half the sector's angle, in degrees (34.92 degrees in all). */
  sectorHalfAngle: 17.46,
  /** The strip of running track along the top of the field. */
  trackTop: STADIUM.groundTop,
  trackHeight: 7,
  /** Kept for the side-on still in the sprite sheet: how far the cage reaches either side of the circle. */
  cageHalfWidth: 28,
});

/** Screen y of the thrower's feet in the circle. */
export const CIRCLE_FEET_Y = HAMMER_GROUND.circleY + 2;

/**
 * Where a point on the field lies on screen, from the circle's centre: `distance`
 * pixels away in the direction `degrees` (0 is straight down the field, positive turns
 * towards the far side).
 * @param circleX  Screen x of the circle's centre.
 */
export function fieldPoint(circleX: number, distance: number, degrees: number): [number, number] {
  const rad = (degrees * Math.PI) / 180;
  return [circleX + Math.cos(rad) * distance, HAMMER_GROUND.circleY - Math.sin(rad) * distance * HAMMER_GROUND.yScale];
}

/**
 * Fill an ellipse row by row.
 */
function fillEllipse(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cx: number, cy: number, rx: number, ry: number, colour: string) {
  ctx.fillStyle = colour;
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
  }
}

/**
 * Posts of the cage on one side of the circle: the far half (behind the
 * thrower) or the near half (in front).
 * @returns  Ground points of the posts, in order round the cage.
 */
function cagePosts(cx: number, side: 'far' | 'near'): [number, number][] {
  const { cageRadiusX, cageRadiusY, circleY, cageOpening } = HAMMER_GROUND;
  const posts: [number, number][] = [];
  for (let a = cageOpening; a <= 360 - cageOpening; a += (360 - 2 * cageOpening) / 8) {
    const rad = (a * Math.PI) / 180;
    const y = circleY - Math.sin(rad) * cageRadiusY;
    if ((side === 'far') === y < circleY + 0.5) posts.push([Math.round(cx + Math.cos(rad) * cageRadiusX), Math.round(y)]);
  }
  return posts;
}

/**
 * One side of the cage: posts, a rail along their tops and netting between.
 */
function drawCage(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cx: number, side: 'far' | 'near') {
  const { cageHeight } = HAMMER_GROUND;
  const posts = cagePosts(cx, side);
  ctx.fillStyle = ART.cage;
  for (let i = 0; i + 1 < posts.length; i++) {
    const [x0, y0] = posts[i];
    const [x1, y1] = posts[i + 1];
    const step = x1 >= x0 ? 1 : -1;
    // The rail along the post tops, and on the far side netting: a sparse grid of dots, so the thrower shows through.
    for (let x = x0; x !== x1; x += step) {
      const t = (x - x0) / (x1 - x0);
      const ground = Math.round(y0 + (y1 - y0) * t);
      ctx.fillRect(x, ground - cageHeight, 1, 1);
      if (side === 'far' && (x - x0) % 4 === 0) for (let y = ground - cageHeight + 4; y < ground; y += 4) ctx.fillRect(x, y, 1, 1);
    }
  }
  for (const [x, y] of posts) ctx.fillRect(x, y - cageHeight, 1, cageHeight);
}

/**
 * The overview: stadium, a strip of running track, mown grass, the sector
 * lines fanning out from the circle with distance arcs, the throwing circle
 * on its pad, and the far side of the cage. Draw the thrower next, then
 * `drawCageFront`.
 */
export function drawHammerGround(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, { circleX, markerSpacing = 40, ...rest }: { circleX: number; markerSpacing?: number; frame?: number; excitement?: number; reducedFlash?: boolean; }) {
  const { circleY, circleRadiusX, circleRadiusY, trackTop, trackHeight, yScale, sectorHalfAngle } = HAMMER_GROUND;
  drawBackdrop(ctx, cameraX, rest);
  const top = trackTop + trackHeight;
  // The running track round the infield, seen from above.
  drawTrackSurface(ctx, cameraX, 0, trackTop, SCREEN_WIDTH, trackHeight);
  ctx.fillStyle = ART.laneLine;
  ctx.fillRect(0, trackTop + 3, SCREEN_WIDTH, 1);
  ctx.fillRect(0, top - 1, SCREEN_WIDTH, 1);
  // Grass, mown in stripes fixed to the field so they scroll.
  drawGrass(ctx, cameraX, top);

  // The sector lines, as runs along each screen row.
  const slope = Math.tan((sectorHalfAngle * Math.PI) / 180) * yScale;
  const cx = Math.round(circleX);
  ctx.fillStyle = ART.sector;
  for (let k = 0; ; k++) {
    const from = Math.max(cx + circleRadiusX + 2, Math.round(cx + (k - 0.5) / slope));
    const to = Math.round(cx + (k + 0.5) / slope);
    if (from > SCREEN_WIDTH || circleY - k < top) break;
    if (to > from && to > 0) {
      ctx.fillRect(Math.max(0, from), circleY - k, Math.min(SCREEN_WIDTH, to) - Math.max(0, from), 1);
      if (circleY + k < SCREEN_HEIGHT) ctx.fillRect(Math.max(0, from), circleY + k, Math.min(SCREEN_WIDTH, to) - Math.max(0, from), 1);
    }
  }
  // Distance arcs across the sector every `markerSpacing` pixels (ten metres), labelled at the far end.
  for (let n = 1; ; n++) {
    const r = circleRadiusX + n * markerSpacing;
    if (cx + r * Math.cos((sectorHalfAngle * Math.PI) / 180) > SCREEN_WIDTH + 16) break;
    if (cx + r < -16) continue;
    ctx.fillStyle = ART.sector;
    for (let a = -sectorHalfAngle; a <= sectorHalfAngle; a += 1.5) {
      const [x, y] = fieldPoint(cx, r, a);
      if (y >= top && y < SCREEN_HEIGHT) ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    const [lx, ly] = fieldPoint(cx, r, sectorHalfAngle);
    if (n % 2 === 0) drawText(ctx, String(n * 10), Math.round(lx), Math.max(top + 6, Math.round(ly) - 7), { color: ART.marker });
  }

  // The circle: a concrete pad, the white ring, and the stop board at the front.
  fillEllipse(ctx, cx, circleY, circleRadiusX + 5, circleRadiusY + 3, ART.circlePad);
  ctx.fillStyle = ART.circle;
  for (let dy = -circleRadiusY; dy <= circleRadiusY; dy++) {
    const half = Math.round(circleRadiusX * Math.sqrt(1 - (dy / circleRadiusY) ** 2));
    ctx.fillRect(cx - half, circleY + dy, 1, 1);
    ctx.fillRect(cx + half - 1, circleY + dy, 1, 1);
    if (Math.abs(dy) === circleRadiusY) ctx.fillRect(cx - half, circleY + dy, half * 2, 1);
  }
  drawCage(ctx, cx, 'far');
}

/**
 * The near side of the cage, drawn over the thrower.
 */
export function drawCageFront(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, circleX: number) {
  drawCage(ctx, Math.round(circleX), 'near');
}
