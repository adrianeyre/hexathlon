/**
 * The Hammer renderer, seen from high above (an overview of the field). Reads
 * the sim state only. The thrower turns in the circle with the ball swinging
 * round them on its wire, a dial shows the spin against the release window,
 * and after release the ball flies out across the sector, its shadow on the
 * grass, with the camera following it. A throw into the cage leaves the ball
 * against the net. Once the throw is decided the camera goes back to the
 * circle, where the official's flag is up and the thrower reacts: jumping for
 * joy after a pass, head bowed and shaking after a foul or a short throw.
 */

import { ART, PLAYER_1, PLAYER_2 } from '../art/colours.ts';
import { FLAG_COLOURS, FLAG_FOUL, FLAG_VALID } from '../art/field.ts';
import { BALL, CIRCLE_FEET_Y, HAMMER_COLOURS, HAMMER_GROUND, RELEASE, SPIN, drawCageFront, drawHammerGround, drawWire, fieldPoint } from '../art/hammer.ts';
import { SHADOW } from '../art/stadium.ts';
import { defineSprite, drawLine, drawSprite, pointAt } from '../art/sprite.ts';
import { simParamsFor } from '../sim/registry.ts';
import { drawFieldHud } from './field-hud.ts';
import { metresPerPixel } from './marks.ts';
import { PALETTE } from './palette.ts';
import { reactionFor, reactionPose } from './reaction.ts';
import { drawText } from './text.ts';

export type HammerState = import('../sim/hammer.ts').HammerState;
export type HammerParams = import('../sim/hammer.ts').HammerParams;

/**
 * Layout: the circle's centre in the world, where the camera holds the ball,
 * the ball's swing round the thrower (radius across the field, and height
 * above it), how high a throw is drawn per sim pixel of height, how long the
 * camera stays on the landing, and the spin dial.
 */
export const HAMMER_VIEW = Object.freeze({
  circleX: 44,
  followX: 180,
  swing: 20,
  swingHeight: 8,
  heightScale: 0.6,
  backFrames: 40,
  dial: Object.freeze({ x: 160, y: 40, r: 12 }),
});

const SHADOW_COLOURS = Object.freeze({ x: ART.shadow });

/** The ball's shadow on the grass. */
const BALL_SHADOW = defineSprite('hammer-ball-shadow', ['.xxx.', 'xxxxx', '.xxx.'], { anchor: [2, 1] });

/**
 * Where the ball is over the field while it flies or after it lands: its
 * ground point (world x, screen y) and its height above the grass, or null.
 */
function ballOverField(state: HammerState): { x: number; y: number; height: number; } | null {
  if (!state.flight) return null;
  const [x, y] = fieldPoint(HAMMER_VIEW.circleX, state.flight.x, state.releaseOffset ?? 0);
  return { x, y, height: state.flight.y * HAMMER_VIEW.heightScale };
}

/**
 * World x at the left edge of the screen: on the circle, then following the
 * ball out across the field, and back to the circle once the landing has been seen.
 * @param [since]  Frames since the throw was decided.
 */
export function hammerCamera(state: HammerState, since: number | null = null) {
  const ball = ballOverField(state);
  if (!ball || (since !== null && since >= HAMMER_VIEW.backFrames)) return 0;
  return Math.max(0, ball.x - HAMMER_VIEW.followX);
}

/**
 * The spin step the thrower shows for the ball's direction: side-on with
 * the ball down the field, back to us with it on the far side, side-on the
 * other way with it behind, facing us with it on the near side.
 */
function spinStep(spin: number) {
  const a = (((spin % 360) + 360) % 360 + 45) % 360;
  return [SPIN[1], SPIN[2], SPIN[3], SPIN[0]][Math.floor(a / 90)];
}

/**
 * The spin dial: a ring with the release window marked and a needle at the
 * hammer's direction (0 degrees, straight down the field, is to the right).
 */
function drawSpinDial(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, spin: number, window: { centre: number; halfWidth: number; }) {
  const { x, y, r } = HAMMER_VIEW.dial;
  ctx.fillStyle = PALETTE.overlay;
  ctx.fillRect(x - r - 3, y - r - 3, r * 2 + 6, r * 2 + 6);
  for (let a = 0; a < 360; a += 15) {
    const offset = Math.abs(((((a - window.centre) % 360) + 540) % 360) - 180);
    const rad = (a * Math.PI) / 180;
    ctx.fillStyle = offset <= window.halfWidth ? PALETTE.highlight : PALETTE.dim;
    const size = offset <= window.halfWidth ? 2 : 1;
    ctx.fillRect(Math.round(x + Math.cos(rad) * r), Math.round(y - Math.sin(rad) * r), size, size);
  }
  const rad = (spin * Math.PI) / 180;
  drawLine(ctx, x, y, x + Math.cos(rad) * (r - 2), y - Math.sin(rad) * (r - 2), PALETTE.text);
  drawText(ctx, 'AIM', x, y + r + 8, { color: PALETTE.dim });
}

export function renderHammer(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, state: HammerState, { reducedFlash = false, difficulty = 'normal', player = 1, standard = null, after = null }: import('../scenes/catalogue.ts').RenderOptions = ({} as import('../scenes/catalogue.ts').RenderOptions), params: HammerParams = simParamsFor(difficulty).hammer) {
  const decided = state.phase === 'landed' || state.phase === 'done';
  const since = after ?? (decided ? state.settle : null);
  const cameraX = hammerCamera(state, since);
  const circleX = HAMMER_VIEW.circleX - cameraX;
  const scale = metresPerPixel('hammer');
  const spin01 = params.speed.max > 0 ? state.meter.value / params.speed.max : 0;
  drawHammerGround(ctx, cameraX, {
    circleX,
    markerSpacing: scale ? Math.max(8, Math.round(10 / scale)) : 40,
    frame: state.frame,
    excitement: decided ? (state.outcome === 'valid' ? 1 : 0.1) : 0.2 + 0.6 * spin01,
    reducedFlash,
  });
  const kit = player === 2 ? PLAYER_2 : PLAYER_1;
  const feetY = CIRCLE_FEET_Y;
  const spinning = state.phase === 'spin' || state.phase === 'release';

  // Where the ball is: swinging round the thrower, against the cage, or out over the field.
  let ball: { x: number; y: number; height: number; } | null = null;
  if (spinning) {
    const [x, y] = fieldPoint(circleX, HAMMER_VIEW.swing, state.spin);
    ball = { x, y, height: HAMMER_VIEW.swingHeight };
  } else if (state.foul === 'cage' && state.releaseOffset !== null) {
    const [x, y] = fieldPoint(circleX, HAMMER_GROUND.cageRadiusX - 2, state.spin);
    ball = { x, y, height: HAMMER_GROUND.cageHeight / 2 };
  } else {
    const over = ballOverField(state);
    if (over) ball = { ...over, x: over.x - cameraX };
  }
  const drawBall = () => {
    if (!ball) return;
    drawSprite(ctx, BALL_SHADOW, ball.x, ball.y, SHADOW_COLOURS);
    drawSprite(ctx, BALL, ball.x, ball.y - Math.round(ball.height), HAMMER_COLOURS);
  };

  // The thrower: turning, letting go, then reacting once the throw is decided.
  const reaction = reactionFor('hammer', state, standard);
  const step = spinStep(state.spin);
  let sprite: import('../art/sprite.ts').Sprite = spinning ? step.sprite : RELEASE;
  const flip = spinning ? step.flip : false;
  let lift = 0;
  if (reaction && since !== null && since >= (state.outcome === 'valid' ? HAMMER_VIEW.backFrames : 10)) {
    ({ sprite, lift } = reactionPose(reaction, since, reducedFlash));
  }
  // The ball behind the thrower is drawn first, in front of them after.
  const ballBehind = ball !== null && ball.y < feetY - 1;
  if (ballBehind) drawBall();
  drawSprite(ctx, SHADOW, circleX, feetY + 1, SHADOW_COLOURS);
  drawSprite(ctx, sprite, circleX, feetY - lift, kit, { flip });
  if (spinning && ball) drawWire(ctx, pointAt(sprite, 'hand', circleX, feetY, { flip }), [ball.x, ball.y - ball.height]);
  if (!ballBehind) drawBall();
  drawCageFront(ctx, circleX);

  if (decided) {
    // The official's flag at the front of the circle: white for a fair throw, the foul flag for a foul.
    const flag = state.outcome === 'foul' ? FLAG_FOUL : FLAG_VALID;
    drawSprite(ctx, flag, Math.max(4, circleX + HAMMER_GROUND.cageRadiusX + 6), HAMMER_GROUND.circleY + 4, FLAG_COLOURS);
  }
  if (spinning) drawSpinDial(ctx, state.spin, params.releaseWindow);
  drawFieldHud(ctx, state, params, 'hammer', 'SPIN');
}
