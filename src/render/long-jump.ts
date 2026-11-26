/**
 * The Long Jump renderer. Reads the sim state only. Sim pixels map to screen
 * pixels one to one; the camera follows the athlete down the runway and
 * over the pit. Every phase has its own frame: run cycle, take-off, flight
 * (hang while rising, sail while falling), landing, and a standing athlete
 * beside a foul flag after a foul.
 */

import { RUN, STAND } from '../art/athlete.ts';
import { ART, OFFICIAL, PLAYER_1, PLAYER_2 } from '../art/colours.ts';
import { FLAG_COLOURS, FLAG_FOUL, FLAG_VALID } from '../art/field.ts';
import { FLIGHT, LAND, LONG_JUMP_GROUND, RUNWAY_FEET_Y, TAKEOFF, drawLongJumpGround } from '../art/long-jump.ts';
import { SHADOW } from '../art/stadium.ts';
import { JUDGE, JUDGE_COLOURS, MEASURER } from '../art/officials.ts';
import { drawSprite, pointAt } from '../art/sprite.ts';
import { runStepFrames } from '../art/style.ts';
import { simParamsFor } from '../sim/registry.ts';
import { SCREEN_WIDTH } from './display.ts';
import { drawFieldHud } from './field-hud.ts';
import { metresPerPixel } from './marks.ts';
import { REACTION_TIMING, reactionFor, reactionPose } from './reaction.ts';

export type LongJumpState = import('../sim/long-jump.ts').LongJumpState;
export type LongJumpParams = import('../sim/long-jump.ts').LongJumpParams;

/** World layout: where the Run-up starts, where the camera holds the athlete, and the pit. */
export const LONG_JUMP_VIEW = Object.freeze({
  startX: 30,
  followX: 120,
  pitGap: 12,
  pitLength: 260,
  /** Where the board settles on screen once the camera holds. */
  boardScreenX: 44,
  /** The foul judge's stool, this far from the board (before it: beside the runway, not over the sand). */
  judgeGap: -8,
  /** The measurer sets off this many frames after the landing, at this many pixels per frame. */
  measureDelay: 12,
  measureSpeed: 1.5,
  /** The measurer walks this far below the runway's near edge. */
  measurerBelow: 18,
});

const SHADOW_COLOURS = Object.freeze({ x: ART.shadow });

/**
 * World x at the left edge of the screen: follows the athlete down the
 * runway, then holds once the board is `boardScreenX` from the left, so the
 * foul judge, the jump and the measurer all stay in view.
 */
export function longJumpCamera(state: LongJumpState, params?: LongJumpParams) {
  const follow = Math.max(0, LONG_JUMP_VIEW.startX + state.x - LONG_JUMP_VIEW.followX);
  if (!params) return follow;
  const hold = Math.max(0, LONG_JUMP_VIEW.startX + params.foulLine - LONG_JUMP_VIEW.boardScreenX);
  // Never let the athlete run off the right of the screen.
  const keep = LONG_JUMP_VIEW.startX + state.x - (SCREEN_WIDTH - 40);
  return Math.max(keep, Math.min(follow, hold));
}

export function renderLongJump(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, state: LongJumpState, { reducedFlash = false, difficulty = 'normal', player = 1, standard = null, after = null }: import('../scenes/catalogue.ts').RenderOptions = ({} as import('../scenes/catalogue.ts').RenderOptions), params: LongJumpParams = simParamsFor(difficulty).longJump) {
  const cameraX = longJumpCamera(state, params);
  const boardX = LONG_JUMP_VIEW.startX + params.foulLine - cameraX;
  const speed01 = params.speed.max > 0 ? state.meter.value / params.speed.max : 0;
  const scale = metresPerPixel('longJump');
  const athleteX = LONG_JUMP_VIEW.startX + state.x - cameraX;
  const landed = state.phase === 'landed' || state.phase === 'done';
  drawLongJumpGround(ctx, cameraX, {
    boardX,
    pitStartX: boardX + LONG_JUMP_VIEW.pitGap,
    pitEndX: boardX + LONG_JUMP_VIEW.pitGap + LONG_JUMP_VIEW.pitLength,
    markerSpacing: scale ? Math.max(8, Math.round(1 / scale)) : 24,
    marks: landed && state.outcome === 'valid' ? [athleteX - 3] : [],
    frame: state.frame,
    excitement: landed ? (state.outcome === 'valid' ? 1 : 0.1) : 0.2 + 0.6 * speed01,
    reducedFlash,
  });

  const feetY = RUNWAY_FEET_Y;
  // Frames since the Attempt was decided (Attract Mode has no scene clock, so the sim's settle count stands in).
  const since = after ?? (landed ? state.settle : null);
  const reaction = reactionFor('longJump', state, standard);
  const { runwayTop, runwayHeight } = LONG_JUMP_GROUND;

  // The foul judge sits on a stool across the runway from us, level with the board, and raises a flag once the jump is decided.
  const judgeX = boardX + LONG_JUMP_VIEW.judgeGap;
  const judge = landed ? JUDGE[1] : JUDGE[0];
  drawSprite(ctx, SHADOW, judgeX, runwayTop - 1, SHADOW_COLOURS);
  drawSprite(ctx, judge, judgeX, runwayTop - 2, JUDGE_COLOURS);
  if (landed) {
    const [hx, hy] = pointAt(judge, 'hand', judgeX, runwayTop - 2);
    drawSprite(ctx, state.outcome === 'foul' ? FLAG_FOUL : FLAG_VALID, hx, hy, FLAG_COLOURS);
  }

  let sprite: import('../art/sprite.ts').Sprite = STAND;
  let lift = 0;
  if (state.phase === 'runup') sprite = state.meter.value > 0.05 ? RUN[Math.floor(state.frame / runStepFrames(speed01)) % RUN.length] : STAND;
  else if (state.phase === 'takeoff') sprite = TAKEOFF;
  else if (state.phase === 'flight') sprite = FLIGHT[(state.flight?.vy ?? 0) > 0 ? 0 : 1];
  else if (landed) {
    // A good jump sits in the sand a moment first; a foul reacts almost at once.
    const pause = state.outcome === 'valid' ? REACTION_TIMING.pause : 10;
    const t = (since ?? 0) - pause;
    if (t < 0 || !reaction) sprite = state.outcome === 'valid' ? LAND : STAND;
    else ({ sprite, lift } = reactionPose(reaction, t, reducedFlash));
  }
  drawSprite(ctx, SHADOW, athleteX, feetY + 1, SHADOW_COLOURS);
  drawSprite(ctx, sprite, athleteX, feetY - Math.round(state.y) - lift, player === 2 ? PLAYER_2 : PLAYER_1);

  // The measurer walks out from the board along the near side of the pit with the tape, and crouches at the landing mark.
  let measured = false;
  if (landed && state.outcome === 'valid') {
    const t = Math.max(0, (since ?? 0) - LONG_JUMP_VIEW.measureDelay);
    const from = Math.max(-10, boardX);
    const markX = athleteX - 3;
    const x = Math.min(markX, from + t * LONG_JUMP_VIEW.measureSpeed);
    measured = x >= markX;
    const y = runwayTop + runwayHeight + LONG_JUMP_VIEW.measurerBelow;
    const official = measured ? MEASURER.crouch : MEASURER.walk[Math.floor(t / 8) % MEASURER.walk.length];
    // The tape runs from the board to the measurer's hand.
    const [hx, hy] = pointAt(official, 'hand', x, y);
    ctx.fillStyle = ART.tape;
    ctx.fillRect(Math.round(from), hy, Math.max(0, Math.round(hx - from)), 1);
    drawSprite(ctx, SHADOW, x, y + 1, SHADOW_COLOURS);
    drawSprite(ctx, official, x, y, OFFICIAL);
  }
  drawFieldHud(ctx, state, params, 'longJump', undefined, { showMark: measured || since === null });
}
