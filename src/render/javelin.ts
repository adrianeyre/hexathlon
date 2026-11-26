/**
 * The Javelin renderer. Reads the sim state only. Sim pixels map to screen
 * pixels one to one; the camera follows the athlete, then the javelin in
 * flight. Every phase has its own frames: run with the javelin carried,
 * wind-up while the angle is set, release and follow-through, the javelin
 * turning along its path, and stuck in the turf where it lands.
 */

import { RUN, STAND } from '../art/athlete.ts';
import { ART, PLAYER_1, PLAYER_2 } from '../art/colours.ts';
import { FLAG_COLOURS, FLAG_FOUL, FLAG_VALID } from '../art/field.ts';
import { CARRY_ANGLE, JAVELIN_COLOURS, JAVELIN_FEET_Y, JAVELIN_GROUND, JAVELIN_STUCK, THROW, TUFT_COLOURS, drawJavelinGround, javelinFor } from '../art/javelin.ts';
import { SHADOW } from '../art/stadium.ts';
import { drawSprite, pointAt } from '../art/sprite.ts';
import { runStepFrames } from '../art/style.ts';
import { simParamsFor } from '../sim/registry.ts';
import { drawFieldHud } from './field-hud.ts';
import { metresPerPixel } from './marks.ts';
import { reactionFor, reactionPose } from './reaction.ts';

export type JavelinState = import('../sim/javelin.ts').JavelinState;
export type JavelinParams = import('../sim/javelin.ts').JavelinParams;

/** World layout: where the Run-up starts and where the camera holds what it follows. */
export const JAVELIN_VIEW = Object.freeze({
  startX: 30,
  followX: 120,
  releaseFrames: 8,
  /** Frames on the landed javelin before the camera goes back to the thrower. */
  backFrames: 40,
  /** Offsets the javelin's outline is drawn at, under the javelin itself. */
  outline: Object.freeze([[-1, 0], [1, 0], [0, -1], [0, 1]]),
});

const SHADOW_COLOURS = Object.freeze({ x: ART.shadow });
/** Every part of the javelin in one dark colour, for its outline in flight. */
export const OUTLINE_COLOURS = Object.freeze({ m: PLAYER_1.o, g: PLAYER_1.o, d: PLAYER_1.o });

/**
 * World x of the javelin's grip while in the air, or null.
 */
const javelinWorldX = (state: JavelinState) => (state.flight && Number.isFinite(state.releaseX) ? JAVELIN_VIEW.startX + state.releaseX + state.flight.x : null);

/**
 * World x at the left edge of the screen.
 * @param [since]  Frames since the throw was decided.
 */
export function javelinCamera(state: JavelinState, since: number | null = null) {
  // Once the landing has been seen, the camera cuts back to the thrower for their reaction.
  const back = since !== null && since >= JAVELIN_VIEW.backFrames;
  const follow = (back ? null : javelinWorldX(state)) ?? JAVELIN_VIEW.startX + state.x;
  return Math.max(0, follow - JAVELIN_VIEW.followX);
}

export function renderJavelin(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, state: JavelinState, { reducedFlash = false, difficulty = 'normal', player = 1, standard = null, after = null }: import('../scenes/catalogue.ts').RenderOptions = ({} as import('../scenes/catalogue.ts').RenderOptions), params: JavelinParams = simParamsFor(difficulty).javelin) {
  const decidedEarly = state.phase === 'landed' || state.phase === 'done';
  const since = after ?? (decidedEarly ? state.settle : null);
  const cameraX = javelinCamera(state, since);
  const foulX = JAVELIN_VIEW.startX + params.foulLine - cameraX;
  const speed01 = params.speed.max > 0 ? state.meter.value / params.speed.max : 0;
  const scale = metresPerPixel('javelin');
  const decided = state.phase === 'landed' || state.phase === 'done';
  drawJavelinGround(ctx, cameraX, {
    foulX,
    markerSpacing: scale ? Math.max(8, Math.round(10 / scale)) : 40,
    frame: state.frame,
    excitement: decided ? (state.outcome === 'valid' ? 1 : 0.1) : 0.2 + 0.6 * speed01,
    reducedFlash,
  });

  const athleteX = JAVELIN_VIEW.startX + state.x - cameraX;
  const feetY = JAVELIN_FEET_Y;
  const inHand = state.phase === 'runup' || state.phase === 'throwing' || (decided && !state.flight);
  let sprite: import('../art/sprite.ts').Sprite = STAND;
  if (state.phase === 'runup') sprite = state.meter.value > 0.05 ? RUN[Math.floor(state.frame / runStepFrames(speed01)) % RUN.length] : STAND;
  else if (state.phase === 'throwing') sprite = THROW[0];
  else if (state.flight) {
    const sinceRelease = state.flight.vx > 0 ? state.flight.x / state.flight.vx : 0;
    sprite = sinceRelease < JAVELIN_VIEW.releaseFrames ? THROW[1] : THROW[2];
  }
  // Once the throw is decided the athlete reacts: jumping for joy, or head bowed and shaking.
  const reaction = reactionFor('javelin', state, standard);
  let lift = 0;
  const reacting = reaction !== null && since !== null && since >= (state.outcome === 'valid' ? 0 : 10);
  if (reacting) ({ sprite, lift } = reactionPose(reaction, since ?? 0, reducedFlash));
  drawSprite(ctx, SHADOW, athleteX, feetY + 1, SHADOW_COLOURS);
  drawSprite(ctx, sprite, athleteX, feetY - lift, player === 2 ? PLAYER_2 : PLAYER_1);
  if (inHand && !reacting) {
    const [hx, hy] = pointAt(sprite, 'hand', athleteX, feetY);
    const angle = state.phase === 'throwing' && state.hold ? state.hold.angle : CARRY_ANGLE;
    drawSprite(ctx, javelinFor(angle), hx, hy, JAVELIN_COLOURS);
  }

  // The javelin in flight, pointing along its path; stuck in the turf once landed.
  const grip = javelinWorldX(state);
  if (state.flight && grip !== null) {
    const x = grip - cameraX;
    if (state.flight.landed) {
      drawSprite(ctx, JAVELIN_STUCK.javelin, x, feetY - 6, JAVELIN_COLOURS);
      drawSprite(ctx, JAVELIN_STUCK.tuft, x + 8, feetY + 2, TUFT_COLOURS);
    } else {
      const degrees = (Math.atan2(state.flight.vy, state.flight.vx) * 180) / Math.PI;
      const sprite = javelinFor(degrees);
      const y = feetY - 14 - Math.round(state.flight.y) + params.releaseHeight;
      // A shadow on the turf under it, and a dark outline, so it reads against the crowd at the top of its arc.
      drawSprite(ctx, SHADOW, x, feetY + 1, SHADOW_COLOURS);
      for (const [dx, dy] of JAVELIN_VIEW.outline) drawSprite(ctx, sprite, x + dx, y + dy, OUTLINE_COLOURS);
      drawSprite(ctx, sprite, x, y, JAVELIN_COLOURS);
    }
  }
  if (decided) {
    const flag = state.outcome === 'foul' ? FLAG_FOUL : FLAG_VALID;
    drawSprite(ctx, flag, foulX + 4, JAVELIN_GROUND.runwayTop - 2, FLAG_COLOURS);
  }
  drawFieldHud(ctx, state, params, 'javelin');
}
