/**
 * The 100m Dash renderer and HUD. Reads the sim state only, never changes
 * it, and maps sim pixels to screen pixels one to one, with the camera
 * following the athlete. The athlete runs in lane 3, the Rival in lane 2.
 * In a two-player race player 2 takes the Rival's place, in the lanes the
 * two-player rules give.
 */

import { ATHLETE_HEIGHT, CHEER, CROUCH, RUN, STAND } from '../art/athlete.ts';
import { ART, PLAYER_1, PLAYER_2, RIVAL } from '../art/colours.ts';
import { drawSprintBackdrop } from '../art/sprint.ts';
import { SHADOW, laneFeetY, trackShear } from '../art/stadium.ts';
import { drawSprite } from '../art/sprite.ts';
import { runStepFrames } from '../art/style.ts';
import { simParamsFor } from '../sim/registry.ts';
import { rivalAfter } from '../sim/rival.ts';
import { velocityOf } from '../sim/speed.ts';
import { SCREEN_WIDTH } from './display.ts';
import { HUD, drawMessage, drawRaceStats } from './hud.ts';
import { PALETTE } from './palette.ts';
import { duoReactions, reactionFor, reactionPose, rivalBeatenAfter } from './reaction.ts';
import { drawText } from './text.ts';

export type SprintState = import('../sim/sprint.ts').SprintState;
export type SprintParams = import('../sim/sprint.ts').SprintParams;
export type RenderOptions = import('../scenes/catalogue.ts').RenderOptions;


/** How far above an athlete's feet their lane label sits: clear of the head. */
export const LABEL_RISE = ATHLETE_HEIGHT + 6;
/** Who runs in the Rival's place, for a two-player race. */
export interface Opponent {
  kit: import('../art/sprite.ts').ColourMap;
  label: string;
  /** Shown when the opponent wins. */
  wins: string;
  /** Shown when the athlete wins. */
  youWin: string;
  /** Replaces the finish message. */
  message?: string | null;
  /** Their speed bar in the status panel. */
  bar?: import('./hud.ts').PanelBar;
  /** How they react once the race is over. */
  reaction?: import('./reaction.ts').Reaction | null;
  /** How player 1 reacts once the race is over, in place of the reaction to the Standard. */
  athleteReaction?: import('./reaction.ts').Reaction | null;
}

/** Player 2, running in the Rival's place. */
export const PLAYER_2_OPPONENT: Opponent = Object.freeze({ kit: PLAYER_2, label: 'P2', wins: 'P2 WINS', youWin: 'P1 WINS' });

/**
 * A two-player race as a one-player race: player 1 is the athlete and player 2
 * runs in the Rival's place.
 */
export function duoView<S extends { phase: 'set' | 'race' | 'done'; frame: number; setFrame: number; raceFrame: number; falseStarts: number; x: number; meter: { value: number }; finishFrame: number | null; outcome: string | null }>(duo: import('../sim/two-player.ts').DuoRaceState<S>, speed: import('../sim/speed.ts').SpeedParams): { view: S & { rival: { x: number; speed: number; rng: number; finishFrame: number | null; }; }; message: string | null; } {
  const [a, b] = duo.runners;
  const dq = duo.runners.map((r) => r.outcome === 'falseStart');
  let message: string | null = null;
  if (dq[0] && dq[1]) message = 'BOTH DISQUALIFIED';
  else if (dq[0]) message = 'P1 DISQUALIFIED';
  else if (dq[1]) message = 'P2 DISQUALIFIED';
  const view = {
    ...a,
    phase: duo.phase,
    frame: duo.frame,
    raceFrame: Math.max(a.raceFrame, b.raceFrame),
    falseStarts: Math.max(a.falseStarts, b.falseStarts),
    // Player 1's outcome only decides the finish message once everyone is done.
    outcome: dq[0] ? 'falseStart' : a.outcome,
    rival: { x: b.x, speed: velocityOf(b.meter.value, speed), rng: 0, finishFrame: b.finishFrame },
  };
  return { view, message: duo.phase === 'done' && (dq[0] || dq[1]) ? message : null };
}

/** Screen layout: where the start line sits in the world, and where the camera keeps the athlete. */
export const SPRINT_VIEW = Object.freeze({ startX: 40, followX: 110, playerLane: 3, rivalLane: 2 });

const SHADOW_COLOURS = Object.freeze({ x: ART.shadow });

/**
 * World x at the left edge of the screen.
 * @param [both]  Two-player: keep both runners in view (centred between them), the leader always.
 */
export function sprintCamera(state: SprintState, params: SprintParams, both: boolean = false) {
  const lead = Math.max(state.x, Math.min(state.rival.x, state.x + 60));
  let target = SPRINT_VIEW.startX + lead - SPRINT_VIEW.followX;
  if (both) {
    const front = Math.max(state.x, state.rival.x);
    target = Math.max(SPRINT_VIEW.startX + (state.x + state.rival.x) / 2 - SCREEN_WIDTH / 2, SPRINT_VIEW.startX + front - (SCREEN_WIDTH - 40));
  }
  const end = SPRINT_VIEW.startX + params.distance + 60 - SCREEN_WIDTH;
  return Math.max(0, Math.min(end, target));
}

/**
 * The sprite for an athlete at a speed, from its run cycle.
 */
const runFrame = (frame: number, speed01: number) => RUN[Math.floor(frame / runStepFrames(speed01)) % RUN.length];

export function renderSprint(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, state: SprintState, { reducedFlash = false, difficulty = 'normal', player = 1, lanes, opponent, stats, standard = null, after = null }: import('../scenes/catalogue.ts').RenderOptions & { opponent?: import('./sprint.ts').Opponent; } = ({} as RenderOptions & { opponent?: Opponent }), params: SprintParams = simParamsFor(difficulty).sprint) {
  const playerLane = lanes?.[1] ?? SPRINT_VIEW.playerLane;
  const rivalLane = lanes?.[2] ?? SPRINT_VIEW.rivalLane;
  const kit = player === 2 ? PLAYER_2 : PLAYER_1;
  const rivalKit = opponent?.kit ?? RIVAL;
  const cameraX = sprintCamera(state, params, opponent !== undefined);
  const topSpeed = params.speed.max * params.speed.velocityPerUnit;
  const speed01 = topSpeed > 0 ? (state.meter.value * params.speed.velocityPerUnit) / topSpeed : 0;
  const excitement = state.phase === 'done' ? 1 : state.phase === 'race' ? 0.3 + 0.7 * speed01 : 0.15;
  drawSprintBackdrop(ctx, cameraX, {
    startX: SPRINT_VIEW.startX - cameraX,
    finishX: SPRINT_VIEW.startX + params.distance - cameraX,
    frame: state.frame,
    excitement,
    reducedFlash,
    blocks: state.phase === 'set' ? [rivalLane, playerLane] : [],
  });

  // Rival first, so the player is drawn over it. Each stands where the track's perspective puts it.
  const rivalY = laneFeetY(rivalLane);
  // Once the athlete has won, the Rival still running carries on to the line, then shakes its head.
  const rival = !opponent && state.phase === 'done' && state.outcome === 'valid' ? rivalAfter(state.rival, params.rival, state.cycle, state.raceFrame, after ?? 0, params.distance) : state.rival;
  const beatenAfter = rivalBeatenAfter(state, rival);
  const rivalWorldX = rival.x;
  const rivalX = SPRINT_VIEW.startX + rivalWorldX - cameraX + trackShear(rivalY);
  const playerY = laneFeetY(playerLane);
  const playerX = SPRINT_VIEW.startX + state.x - cameraX + trackShear(playerY);
  const rivalWon = state.rival.finishFrame !== null && (state.finishFrame === null || state.rival.finishFrame < state.finishFrame);
  // Once the race is decided the athlete reacts: jumping for joy, or head bowed and shaking.
  const reaction = opponent?.athleteReaction !== undefined ? opponent.athleteReaction : reactionFor('sprint', state, standard);
  const athletes: [number, number, import('../art/sprite.ts').Sprite, import('../art/sprite.ts').ColourMap, number][] = [];
  if (state.phase === 'set') {
    const crouch = CROUCH[state.setFrame >= params.startSignalFrame / 2 ? 1 : 0];
    athletes.push([rivalX, rivalY, crouch, rivalKit, 0], [playerX, playerY, crouch, kit, 0]);
  } else {
    const rivalSpeed01 = topSpeed > 0 ? rival.speed / topSpeed : 0;
    let rivalPose: { sprite: import('../art/sprite.ts').Sprite; lift: number; } = { sprite: rival.speed > 0 ? runFrame(state.frame + (after ?? 0), rivalSpeed01) : CROUCH[1], lift: 0 };
    if (beatenAfter !== null) rivalPose = reactionPose('dejected', (after ?? 0) - beatenAfter, reducedFlash);
    else if (opponent?.reaction) rivalPose = reactionPose(opponent.reaction, after ?? 0, reducedFlash);
    else if (state.rival.finishFrame !== null) rivalPose = { sprite: rivalWon ? CHEER : STAND, lift: 0 };
    let playerPose: { sprite: import('../art/sprite.ts').Sprite; lift: number; } = { sprite: state.meter.value > 0.05 ? runFrame(state.frame, speed01) : STAND, lift: 0 };
    if (reaction) playerPose = reactionPose(reaction, after ?? 0, reducedFlash);
    athletes.push([rivalX, rivalY, rivalPose.sprite, rivalKit, rivalPose.lift], [playerX, playerY, playerPose.sprite, kit, playerPose.lift]);
  }
  for (const [x, y, sprite, colours, lift] of athletes) {
    drawSprite(ctx, SHADOW, x, y + 1, SHADOW_COLOURS);
    drawSprite(ctx, sprite, x, y - lift, colours);
  }
  drawText(ctx, opponent?.label ?? 'RIVAL', Math.max(4, Math.min(SCREEN_WIDTH - 40, rivalX - 14)), rivalY - LABEL_RISE, { align: 'left', color: PALETTE.dim });
  if (opponent) drawText(ctx, 'P1', Math.max(4, Math.min(SCREEN_WIDTH - 40, playerX - 6)), playerY - LABEL_RISE, { align: 'left', color: PALETTE.dim });

  // HUD: the status panel along the top (time, Standard, best, speed, Points), and the start sequence.
  drawRaceStats(ctx, state.phase === 'set' ? 0 : (state.finishFrame ?? state.raceFrame), stats, [{ fraction: speed01, label: opponent ? 'P1' : 'SPEED' }, ...(opponent?.bar ? [opponent.bar] : [])]);
  if (state.phase === 'set') {
    const early = state.setFrame < params.startSignalFrame / 2;
    drawMessage(ctx, early ? 'ON YOUR MARKS' : 'SET');
    if (state.falseStarts > 0) drawMessage(ctx, `FALSE START ${state.falseStarts} OF ${params.falseStartsAllowed + 1}`, { color: PALETTE.warning, scale: 1, y: HUD.message.y + 22 });
  } else if (state.phase === 'race' && state.raceFrame < 40) {
    drawMessage(ctx, 'GO!');
  } else if (state.phase === 'done') {
    if (opponent?.message) drawMessage(ctx, opponent.message, { color: PALETTE.warning });
    else if (state.outcome === 'falseStart') drawMessage(ctx, 'DISQUALIFIED', { color: PALETTE.warning });
    else drawMessage(ctx, rivalWon ? (opponent?.wins ?? 'RIVAL WINS') : (opponent?.youWin ?? 'YOU WIN'));
  }
}

/**
 * A two-player 100m: player 1 in their lane, player 2 in the Rival's place.
 */
export function renderSprintDuo(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, duo: import('../sim/two-player.ts').DuoRaceState<SprintState>, options: RenderOptions = {}, params: SprintParams = simParamsFor(options.difficulty ?? 'normal').sprint) {
  const { view, message } = duoView(duo, params.speed);
  const topSpeed = params.speed.max * params.speed.velocityPerUnit;
  const bar = { fraction: topSpeed > 0 ? (duo.runners[1].meter.value * params.speed.velocityPerUnit) / topSpeed : 0, label: 'P2' };
  // Once both are over the line, the one beaten to it shakes their head.
  const [athleteReaction, reaction] = duo.phase === 'done' ? duoReactions('sprint', duo.runners, options.standard) : [undefined, null];
  renderSprint(ctx, view, { ...options, player: 1, opponent: { ...PLAYER_2_OPPONENT, message, bar, reaction, athleteReaction } }, params);
}
