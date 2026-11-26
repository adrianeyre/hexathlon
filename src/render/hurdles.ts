/**
 * The 110m Hurdles renderer and HUD. Reads the sim state only, never changes
 * it, and maps sim pixels to screen pixels one to one, with the camera
 * following the athlete. The athlete runs in lane 3 and the Rival in lane 2,
 * each with a row of hurdles. A hurdle the athlete hit lies knocked over, and
 * the athlete stumbles for as long as the sim says. In a two-player race
 * player 2 takes the Rival's place, with their own jumps and hits.
 */

import { CHEER, CROUCH, RUN, STAND } from '../art/athlete.ts';
import { ART, PLAYER_1, PLAYER_2, RIVAL } from '../art/colours.ts';
import { CLEAR, HURDLE, HURDLE_COLOURS, HURDLE_DOWN, STUMBLE } from '../art/hurdles.ts';
import { drawSprintBackdrop } from '../art/sprint.ts';
import { SHADOW, laneFeetY, trackShear } from '../art/stadium.ts';
import { drawSprite } from '../art/sprite.ts';
import { runStepFrames } from '../art/style.ts';
import { hurdlePositions } from '../sim/hurdles.ts';
import { simParamsFor } from '../sim/registry.ts';
import { rivalAfter } from '../sim/rival.ts';
import { SCREEN_WIDTH } from './display.ts';
import { HUD, drawHudText, drawMessage, drawRaceStats } from './hud.ts';
import { PALETTE } from './palette.ts';
import { duoReactions, reactionFor, reactionPose, rivalBeatenAfter } from './reaction.ts';
import { LABEL_RISE, PLAYER_2_OPPONENT, duoView } from './sprint.ts';
import { drawText } from './text.ts';

export type HurdlesState = import('../sim/hurdles.ts').HurdlesState;
export type HurdlesParams = import('../sim/hurdles.ts').HurdlesParams;

/** Screen layout, as for the 100m. `rivalHop` is how close (pixels) the Rival must be to a hurdle to be drawn clearing it. */
export const HURDLES_VIEW = Object.freeze({ startX: 40, followX: 110, playerLane: 3, rivalLane: 2, rivalHop: 14 });

const SHADOW_COLOURS = Object.freeze({ x: ART.shadow });

/**
 * World x at the left edge of the screen.
 * @param [both]  Two-player: keep both runners in view (centred between them), the leader always.
 */
export function hurdlesCamera(state: HurdlesState, params: HurdlesParams, both: boolean = false) {
  const lead = Math.max(state.x, Math.min(state.rival.x, state.x + 60));
  let target = HURDLES_VIEW.startX + lead - HURDLES_VIEW.followX;
  if (both) {
    const front = Math.max(state.x, state.rival.x);
    target = Math.max(HURDLES_VIEW.startX + (state.x + state.rival.x) / 2 - SCREEN_WIDTH / 2, HURDLES_VIEW.startX + front - (SCREEN_WIDTH - 40));
  }
  const end = HURDLES_VIEW.startX + params.distance + 60 - SCREEN_WIDTH;
  return Math.max(0, Math.min(end, target));
}

const runFrame = (frame: number, speed01: number) => RUN[Math.floor(frame / runStepFrames(speed01)) % RUN.length];

export function renderHurdles(
  ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>,
  state: HurdlesState,
  { reducedFlash = false, difficulty = 'normal', player = 1, lanes, opponent, stats, standard = null, after = null }: import('../scenes/catalogue.ts').RenderOptions & { opponent?: import('./sprint.ts').Opponent; } = ({} as import('../scenes/catalogue.ts').RenderOptions & { opponent?: import('./sprint.ts').Opponent }),
  params: HurdlesParams = simParamsFor(difficulty).hurdles,
) {
  const playerLane = lanes?.[1] ?? HURDLES_VIEW.playerLane;
  const rivalLane = lanes?.[2] ?? HURDLES_VIEW.rivalLane;
  const kit = player === 2 ? PLAYER_2 : PLAYER_1;
  /** Player 2 in the Rival's place: their own jumps and hits. */
  const other: Partial<HurdlesState> & { x: number; } = (state.rival as any);
  const cameraX = hurdlesCamera(state, params, opponent !== undefined);
  const topSpeed = params.speed.max * params.speed.velocityPerUnit;
  const speed01 = topSpeed > 0 ? (state.meter.value * params.speed.velocityPerUnit) / topSpeed : 0;
  drawSprintBackdrop(ctx, cameraX, {
    startX: HURDLES_VIEW.startX - cameraX,
    finishX: HURDLES_VIEW.startX + params.distance - cameraX,
    frame: state.frame,
    excitement: state.phase === 'done' ? 1 : state.phase === 'race' ? 0.3 + 0.7 * speed01 : 0.15,
    reducedFlash,
    blocks: state.phase === 'set' ? [rivalLane, playerLane] : [],
  });

  // The hurdles in both lanes; the player's are down once hit.
  const hurdles = hurdlePositions(params);
  const rivalY = laneFeetY(rivalLane);
  const playerY = laneFeetY(playerLane);
  for (const [i, hx] of hurdles.entries()) {
    const sx = HURDLES_VIEW.startX + hx - cameraX;
    if (sx < -20 || sx > SCREEN_WIDTH + 20) continue;
    drawSprite(ctx, other.hit?.[i] ? HURDLE_DOWN : HURDLE, sx + trackShear(rivalY), rivalY, HURDLE_COLOURS);
    drawSprite(ctx, state.hit[i] ? HURDLE_DOWN : HURDLE, sx + trackShear(playerY), playerY, HURDLE_COLOURS);
  }

  // Once the athlete has won, the Rival still running carries on to the line, then shakes its head.
  const rival = !opponent && state.phase === 'done' && state.outcome === 'valid' ? rivalAfter(state.rival, params.rival, state.cycle, state.raceFrame, after ?? 0, params.distance) : state.rival;
  const beatenAfter = rivalBeatenAfter(state, rival);
  const rivalX = HURDLES_VIEW.startX + rival.x - cameraX + trackShear(rivalY);
  const playerX = HURDLES_VIEW.startX + state.x - cameraX + trackShear(playerY);
  const rivalWon = state.rival.finishFrame !== null && (state.finishFrame === null || state.rival.finishFrame < state.finishFrame);

  let rivalSprite: import('../art/sprite.ts').Sprite = CROUCH[1];
  let rivalLift = 0;
  let playerSprite: import('../art/sprite.ts').Sprite = STAND;
  let playerLift = 0;
  // Once the race is decided the athlete reacts: jumping for joy, or head bowed and shaking.
  const reaction = opponent?.athleteReaction !== undefined ? opponent.athleteReaction : reactionFor('hurdles', state, standard);
  if (state.phase === 'set') {
    rivalSprite = CROUCH[state.setFrame >= params.startSignalFrame / 2 ? 1 : 0];
    playerSprite = rivalSprite;
  } else {
    // The Rival hops each hurdle as it reaches it.
    const near = hurdles.find((hx) => Math.abs(hx - rival.x) < HURDLES_VIEW.rivalHop);
    if (beatenAfter !== null) {
      const pose = reactionPose('dejected', (after ?? 0) - beatenAfter, reducedFlash);
      rivalSprite = pose.sprite;
      rivalLift = pose.lift;
    } else if (opponent?.reaction) {
      const pose = reactionPose(opponent.reaction, after ?? 0, reducedFlash);
      rivalSprite = pose.sprite;
      rivalLift = pose.lift;
    } else if (state.rival.finishFrame !== null) rivalSprite = rivalWon ? CHEER : STAND;
    else if (other.jumpFrame !== undefined) {
      // Player 2: drawn from their own race.
      if ((other.stumble ?? 0) > 0) rivalSprite = STUMBLE;
      else if (other.jumpFrame !== null) rivalSprite = CLEAR[other.jumpFrame < params.jumpFrames / 2 ? 0 : 1];
      else if (state.rival.speed > 0) rivalSprite = runFrame(state.frame, topSpeed > 0 ? state.rival.speed / topSpeed : 0);
      else rivalSprite = STAND;
      rivalLift = Math.round(other.y ?? 0);
    } else if (near !== undefined) {
      rivalSprite = CLEAR[rival.x < near ? 0 : 1];
      const u = (rival.x - near + HURDLES_VIEW.rivalHop) / (2 * HURDLES_VIEW.rivalHop);
      rivalLift = Math.round(4 * params.jumpHeight * u * (1 - u));
    } else if (rival.speed > 0) rivalSprite = runFrame(state.frame + (after ?? 0), topSpeed > 0 ? rival.speed / topSpeed : 0);
    if (reaction) {
      const pose = reactionPose(reaction, after ?? 0, reducedFlash);
      playerSprite = pose.sprite;
      playerLift = pose.lift;
    } else if (state.stumble > 0) playerSprite = STUMBLE;
    else if (state.jumpFrame !== null) playerSprite = CLEAR[state.jumpFrame < params.jumpFrames / 2 ? 0 : 1];
    else if (state.meter.value > 0.05) playerSprite = runFrame(state.frame, speed01);
  }
  drawSprite(ctx, SHADOW, rivalX, rivalY + 1, SHADOW_COLOURS);
  drawSprite(ctx, rivalSprite, rivalX, rivalY - rivalLift, opponent?.kit ?? RIVAL);
  drawSprite(ctx, SHADOW, playerX, playerY + 1, SHADOW_COLOURS);
  drawSprite(ctx, playerSprite, playerX, playerY - Math.round(state.y) - playerLift, kit);
  drawText(ctx, opponent?.label ?? 'RIVAL', Math.max(4, Math.min(SCREEN_WIDTH - 40, rivalX - 14)), rivalY - LABEL_RISE, { align: 'left', color: PALETTE.dim });
  if (opponent) drawText(ctx, 'P1', Math.max(4, Math.min(SCREEN_WIDTH - 40, playerX - 6)), playerY - LABEL_RISE, { align: 'left', color: PALETTE.dim });

  drawRaceStats(ctx, state.phase === 'set' ? 0 : (state.finishFrame ?? state.raceFrame), stats, [{ fraction: speed01, label: opponent ? 'P1' : 'SPEED' }, ...(opponent?.bar ? [opponent.bar] : [])]);
  const hits = state.hit.filter(Boolean).length;
  drawHudText(ctx, `HURDLES ${state.nextHurdle}/${hurdles.length}  HIT ${hits}`, HUD.belowStats.x, HUD.belowStats.y);
  if (state.phase === 'set') {
    drawMessage(ctx, state.setFrame < params.startSignalFrame / 2 ? 'ON YOUR MARKS' : 'SET');
    if (state.falseStarts > 0) drawMessage(ctx, `FALSE START ${state.falseStarts} OF ${params.falseStartsAllowed + 1}`, { color: PALETTE.warning, scale: 1, y: HUD.message.y + 22 });
  } else if (state.phase === 'race' && state.raceFrame < 40) {
    drawMessage(ctx, 'GO!');
  } else if (state.phase === 'race' && state.stumble > 0) {
    drawMessage(ctx, 'HIT!', { color: PALETTE.text, scale: 1 });
  } else if (state.phase === 'done') {
    if (opponent?.message) drawMessage(ctx, opponent.message, { color: PALETTE.warning });
    else if (state.outcome === 'falseStart') drawMessage(ctx, 'DISQUALIFIED', { color: PALETTE.warning });
    else drawMessage(ctx, rivalWon ? (opponent?.wins ?? 'RIVAL WINS') : (opponent?.youWin ?? 'YOU WIN'));
  }
}

/**
 * A two-player 110m Hurdles: player 1 in their lane, player 2 in the Rival's place.
 */
export function renderHurdlesDuo(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, duo: import('../sim/two-player.ts').DuoRaceState<HurdlesState>, options: import('../scenes/catalogue.ts').RenderOptions = {}, params: HurdlesParams = simParamsFor(options.difficulty ?? 'normal').hurdles) {
  const { view, message } = duoView(duo, params.speed);
  const b = duo.runners[1];
  const state = { ...view, rival: { ...view.rival, y: b.y, jumpFrame: b.jumpFrame, stumble: b.stumble, hit: b.hit } };
  const topSpeed = params.speed.max * params.speed.velocityPerUnit;
  const bar = { fraction: topSpeed > 0 ? (b.meter.value * params.speed.velocityPerUnit) / topSpeed : 0, label: 'P2' };
  // Once both are over the line, the one beaten to it shakes their head.
  const [athleteReaction, reaction] = duo.phase === 'done' ? duoReactions('hurdles', duo.runners, options.standard) : [undefined, null];
  renderHurdles(ctx, state, { ...options, player: 1, opponent: { ...PLAYER_2_OPPONENT, message, bar, reaction, athleteReaction } }, params);
}
