/**
 * The High Jump renderer. Reads the sim state only. Sim pixels map to screen
 * pixels one to one, so the bar sits exactly `barHeight` pixels above the
 * apron. The camera follows the Run-up and holds the bar and mat in view.
 * Every phase has its frame: run, take-off (angle rising), over the bar
 * (arched while rising, kicking clear while falling), knocking the bar, and
 * landing on the mat; the bar falls when knocked. The HUD shows the current
 * bar height, the Attempt at this height, the speed bar and the angle dial.
 */

import { RUN, STAND } from '../art/athlete.ts';
import { ART, PLAYER_1, PLAYER_2 } from '../art/colours.ts';
import { CLEAR, HIGH_JUMP_GROUND, KNOCK, LAND, TAKEOFF, drawHighJumpGround, drawNearUpright } from '../art/high-jump.ts';
import { SHADOW } from '../art/stadium.ts';
import { drawSprite } from '../art/sprite.ts';
import { runStepFrames } from '../art/style.ts';
import { simParamsFor } from '../sim/registry.ts';
import { HUD, drawAngle, drawAttempts, drawHudText, drawMessage, drawSpeedBar } from './hud.ts';
import { formatMark } from './marks.ts';
import { PALETTE } from './palette.ts';
import { REACTION_TIMING, reactionFor, reactionPose } from './reaction.ts';

export type HighJumpState = import('../sim/high-jump.ts').HighJumpState;
export type HighJumpParams = import('../sim/high-jump.ts').HighJumpParams;

/** World layout: where the Run-up starts, where the camera holds the athlete, and how far it can scroll past the bar. */
export const HIGH_JUMP_VIEW = Object.freeze({ startX: 30, followX: 120, barScreenX: 220 });

/** Why an Attempt failed, in words. */
export const FAIL_REASONS = Object.freeze({ knocked: 'BAR DOWN', baulk: 'RAN INTO THE BAR', time: 'OUT OF TIME' });

const SHADOW_COLOURS = Object.freeze({ x: ART.shadow });

/**
 * World x at the left edge of the screen: follows the athlete, but stops
 * once the bar reaches its place on screen.
 */
export function highJumpCamera(state: HighJumpState, params: HighJumpParams) {
  const follow = HIGH_JUMP_VIEW.startX + state.x - HIGH_JUMP_VIEW.followX;
  const stop = HIGH_JUMP_VIEW.startX + params.barX - HIGH_JUMP_VIEW.barScreenX;
  return Math.max(0, Math.min(stop, follow));
}

export function renderHighJump(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, state: HighJumpState, { reducedFlash = false, difficulty = 'normal', player = 1, standard = null, after = null }: import('../scenes/catalogue.ts').RenderOptions = ({} as import('../scenes/catalogue.ts').RenderOptions), params: HighJumpParams = simParamsFor(difficulty).highJump) {
  const cameraX = highJumpCamera(state, params);
  const speed01 = params.speed.max > 0 ? state.meter.value / params.speed.max : 0;
  const { feetY } = HIGH_JUMP_GROUND;
  const barX = HIGH_JUMP_VIEW.startX + params.barX - cameraX;
  const decided = state.phase === 'landed' || state.phase === 'done';
  const knocked = state.overBar === false || state.fail === 'knocked';
  const bar: 'up' | 'falling' | 'down' = knocked ? (decided && state.settle > 8 ? 'down' : 'falling') : 'up';
  drawHighJumpGround(ctx, cameraX, {
    barX,
    barY: feetY - state.barHeight,
    bar,
    frame: state.frame,
    excitement: decided ? (state.outcome === 'valid' ? 1 : 0.1) : 0.2 + 0.6 * speed01,
    reducedFlash,
  });

  const athleteX = HIGH_JUMP_VIEW.startX + state.x - cameraX;
  let sprite: import('../art/sprite.ts').Sprite = STAND;
  if (state.phase === 'runup') sprite = state.meter.value > 0.05 ? RUN[Math.floor(state.frame / runStepFrames(speed01)) % RUN.length] : STAND;
  else if (state.phase === 'takeoff') sprite = TAKEOFF;
  else if (state.phase === 'flight') sprite = knocked ? KNOCK : CLEAR[(state.flight?.vy ?? 0) > 0 ? 0 : 1];
  else if (decided) sprite = state.outcome === 'valid' ? LAND : state.fail === 'knocked' ? KNOCK : STAND;
  // Once the Attempt is decided the athlete gets up and reacts: jumping for joy at a clearance, head bowed and shaking at a failure.
  const reaction = reactionFor('highJump', state, standard);
  const since = after ?? (decided ? state.settle : null);
  let lift = 0;
  if (reaction && since !== null && since >= REACTION_TIMING.pause) ({ sprite, lift } = reactionPose(reaction, since - REACTION_TIMING.pause, reducedFlash));
  drawSprite(ctx, SHADOW, athleteX, feetY + 1, SHADOW_COLOURS);
  drawSprite(ctx, sprite, athleteX, feetY - Math.round(state.y) - lift, player === 2 ? PLAYER_2 : PLAYER_1);
  drawNearUpright(ctx, barX);

  // HUD: the bar height, the Attempt at this height, speed and angle.
  drawHudText(ctx, `BAR ${formatMark(state.barHeight, 'pixels', 'highJump')}`, HUD.timer.x, HUD.timer.y);
  drawAttempts(ctx, state.attempt, params.attemptsPerHeight);
  drawSpeedBar(ctx, speed01);
  drawAngle(ctx, state.hold ? state.hold.angle : null, params.angleWindow);
  if (state.outcome === 'valid') drawMessage(ctx, 'CLEARED');
  else if (state.outcome === 'failed') {
    drawMessage(ctx, 'FAILED', { color: PALETTE.warning, scale: 3 });
    if (state.fail) drawMessage(ctx, FAIL_REASONS[state.fail], { color: PALETTE.text, scale: 1, y: HUD.message.y + 24 });
  }
}
