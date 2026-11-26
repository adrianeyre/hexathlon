/**
 * Javelin Throw art: wind-up, release and follow-through frames, the javelin
 * itself at every flight angle, and the runway and landing field. The Run-up
 * uses the shared run cycle with the javelin carried at the `hand` point.
 */

import { RUN } from './athlete.ts';
import { ART } from './colours.ts';
import { drawLandingField, drawRunway } from './field.ts';
import { STADIUM, drawBackdrop } from './stadium.ts';
import { defineTallSprite, defineSprite } from './sprite.ts';

/** Length of the javelin in pixels. */
export const JAVELIN_LENGTH = 24;

/** Angle the javelin is carried at during the Run-up, in degrees above horizontal. */
export const CARRY_ANGLE = 15;

/** Throwing frames: wind-up (leaning back, arm long behind), release (arm high), follow-through. */
export const THROW = Object.freeze([
  defineTallSprite(
    'javelin-windup',
    [
      '.......hhhh.....',
      '......hhhhhhh...',
      '.....hhhhhhhhh..',
      '.....bbbbbbbbb..',
      '.....hhkkkkkok..',
      '.....hkkkkkkkkk.',
      '......kkkkkkk...',
      '........kkk.....',
      '.......sssss....',
      '.kkk..sssssst...',
      '....kksssssstn..',
      '.......sssss.n..',
      '.......sssss....',
      '.......ppppp....',
      '......qqqpppp...',
      '.....qq....ppk..',
      '....nn......kk..',
      '...nn........k..',
      '..nn.........k..',
      '.nn..........k..',
      '.nn..........kk.',
      'eee.........eee.',
    ],
    { anchor: [8, 21], points: { hand: [1, 9] } },
  ),
  defineTallSprite(
    'javelin-release',
    [
      '.........k......',
      '......hhhkk.....',
      '.....hhhhhhk....',
      '....hhhhhhhhk...',
      '....bbbbbbbbb...',
      '....hhkkkkkok...',
      '....hkkkkkkkkk..',
      '.....kkkkkkk....',
      '.......kkk......',
      '......sssss.....',
      '....nnsssss.....',
      '...nn.sssst.....',
      '......sssst.....',
      '......sssss.....',
      '......ppppp.....',
      '.....qqqpppp....',
      '....nn....kk....',
      '...nn.....kk....',
      '..nn.......kk...',
      '.nn........kk...',
      '.nn.........kk..',
      'eee........eee..',
    ],
    { anchor: [8, 21], points: { hand: [9, 0] }, from: 9 },
  ),
  defineTallSprite(
    'javelin-follow',
    [
      '................',
      '.........hhhh...',
      '........hhhhhhh.',
      '.......hhhhhhhhh',
      '.......bbbbbbbbb',
      '.......hhkkkkkok',
      '.......hkkkkkkkk',
      '........kkkkkkk.',
      '.......sskkk....',
      '......ssssss....',
      '.....ssssssstk..',
      '.....sssssssk.k.',
      '......sssss...k.',
      '......ppppp.....',
      '.....qqqpppp....',
      '....qq....ppk...',
      '...nn......kk...',
      '..nn........k...',
      '.nn.........k...',
      '.n..........kk..',
      'nn...........k..',
      'ee..........eee.',
    ],
    { anchor: [8, 21], points: { hand: [14, 14] } },
  ),
]);

/** Flight angles the javelin sprites cover, in degrees above horizontal, steepest climb first. */
export const FLIGHT_ANGLES = Object.freeze([60, 45, 30, 15, 0, -15, -30, -45, -60]);

/**
 * A javelin drawn as pixel data at an angle: a pale metal shaft, a dark grip
 * cord just behind the middle and a dark tip. The anchor is the grip.
 * @param degrees  Above horizontal, pointing right.
 */
function javelinAt(degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = -Math.sin(rad);
  const half = JAVELIN_LENGTH / 2;
  const w = Math.ceil(Math.abs(dx) * JAVELIN_LENGTH) + 1;
  const h = Math.ceil(Math.abs(dy) * JAVELIN_LENGTH) + 1;
  const ox = dx >= 0 ? 0 : w - 1;
  const oy = dy >= 0 ? 0 : h - 1;
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  for (let i = 0; i <= JAVELIN_LENGTH; i++) {
    const x = Math.round(ox + dx * i);
    const y = Math.round(oy + dy * i);
    const role = i >= JAVELIN_LENGTH - 3 ? 'd' : i >= half - 3 && i <= half ? 'g' : 'm';
    grid[y][x] = role;
  }
  const gx = Math.round(ox + dx * (half - 1));
  const gy = Math.round(oy + dy * (half - 1));
  return defineSprite(
    `javelin-${degrees}`,
    grid.map((row) => row.join('')),
    { anchor: [gx, gy], points: { tip: [Math.round(ox + dx * JAVELIN_LENGTH), Math.round(oy + dy * JAVELIN_LENGTH)] } },
  );
}

/** The javelin at each angle in `FLIGHT_ANGLES`. */
export const JAVELIN = Object.freeze(FLIGHT_ANGLES.map(javelinAt));

/** Colours for the javelin sprites. */
export const JAVELIN_COLOURS = Object.freeze({ m: ART.metal, g: ART.wood, d: ART.metalDark });

/**
 * The javelin sprite closest to an angle.
 */
export function javelinFor(degrees: number) {
  let best = 0;
  FLIGHT_ANGLES.forEach((a, i) => {
    if (Math.abs(a - degrees) < Math.abs(FLIGHT_ANGLES[best] - degrees)) best = i;
  });
  return JAVELIN[best];
}

/** Stuck in the ground after landing: the javelin at -45 degrees with a tuft of turf. */
export const JAVELIN_STUCK = Object.freeze({ javelin: javelinAt(-45), tuft: defineSprite('tuft', ['.d.d.', 'ddddd'], { anchor: [2, 1] }) });

/** Every Javelin frame. */
export const JAVELIN_FRAMES = Object.freeze({ run: RUN, throw: THROW, javelin: JAVELIN });

/** Where the Javelin runway sits on screen. */
export const JAVELIN_GROUND = Object.freeze({ runwayTop: STADIUM.groundTop + 34, runwayHeight: 22 });

/** Screen y of an athlete's feet on the runway. */
export const JAVELIN_FEET_Y = JAVELIN_GROUND.runwayTop + JAVELIN_GROUND.runwayHeight - 6;

/**
 * Stadium, landing field, then the runway up to the foul line.
 */
export function drawJavelinGround(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, { foulX, markerSpacing = 40, ...rest }: { foulX: number; markerSpacing?: number; frame?: number; excitement?: number; reducedFlash?: boolean; }) {
  drawBackdrop(ctx, cameraX, rest);
  drawLandingField(ctx, cameraX, { originX: foulX, markerSpacing });
  drawRunway(ctx, foulX, JAVELIN_GROUND.runwayTop, JAVELIN_GROUND.runwayHeight, cameraX);
}

/** Turf colour for the tuft kicked up where the javelin lands. */
export const TUFT_COLOURS = Object.freeze({ d: ART.banner });
