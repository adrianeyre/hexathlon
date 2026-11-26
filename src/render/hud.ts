/**
 * Heads-up display pieces the Event renderers share: the speed bar, the
 * running Events' status panel, the Attempt counter, the angle indicator, the Mark readout and the
 * foul banner. Functional interface conventions (PRD 7.5), drawn with
 * fillRect only so they render in Node too. Meaning never rests on colour
 * alone: a foul is spelled out and flagged with a crossed flag.
 */

import { FLAG_COLOURS, FLAG_FOUL } from '../art/field.ts';
import { drawLine, drawSprite } from '../art/sprite.ts';
import { SCREEN_WIDTH } from './display.ts';
import { PALETTE } from './palette.ts';
import { drawText, textWidth } from './text.ts';

export type Ctx = Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>;

/** Where the HUD sits on screen. */
export const HUD = Object.freeze({
  bar: Object.freeze({ x: 8, y: 226, w: 120, h: 8 }),
  timer: Object.freeze({ x: 8, y: 10 }),
  attempts: Object.freeze({ x: 8, y: 22 }),
  angle: Object.freeze({ x: SCREEN_WIDTH - 44, y: 220, r: 26 }),
  message: Object.freeze({ y: 64 }),
  /**
   * The running Events' status panel along the top of the screen: two rows,
   * stopping short of the pause icon in the top right.
   */
  stats: Object.freeze({ h: 30, right: SCREEN_WIDTH - 28, row1: 8, row2: 21, bar: Object.freeze({ x: 6, y: 18, w: 104, h: 6 }) }),
  /** Where a running Event puts its own line under the status panel. */
  belowStats: Object.freeze({ x: 8, y: 38 }),
});

/** One speed bar in the status panel. */
export interface PanelBar {
  /** 0 to 1. */
  fraction: number;
  label: string;
}

/**
 * The running Events' status panel, along the top of the screen as in the
 * arcade originals: the race time, the Standard to qualify and the Personal
 * Best on the first row; the speed bar (one per player in a two-player race)
 * and the Points on the second.
 * @param frames  Race time so far.
 * @param stats  Missing outside the event scene (Attract Mode).
 */
export function drawRaceStats(ctx: Ctx, frames: number, stats: import('../scenes/catalogue.ts').RaceStats | undefined, bars: readonly PanelBar[]) {
  const { h, right, row1, row2, bar } = HUD.stats;
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, SCREEN_WIDTH, h);
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, h - 2, SCREEN_WIDTH, 2);
  /**
   * A dim label followed by a value.
   */
  const pair = (label: string, value: string, x: number, align: 'left' | 'right', colour: string) => {
    const lw = textWidth(`${label} `, 1);
    const vw = textWidth(value, 1);
    const left = align === 'left' ? x : x - lw - vw;
    drawText(ctx, label, left, row1, { align: 'left', color: PALETTE.dim });
    drawText(ctx, value, left + lw, row1, { align: 'left', color: colour });
  };
  pair('TIME', (Math.max(0, frames) / 60).toFixed(2), 6, 'left', PALETTE.text);
  if (stats?.qualify) pair('QUALIFY', stats.qualify, 168, 'right', PALETTE.highlight);
  if (stats?.best) pair('BEST', stats.best, right, 'right', PALETTE.accent);
  const width = bars.length > 1 ? 70 : bar.w;
  bars.forEach((b, i) => drawSpeedBar(ctx, b.fraction, b.label, { x: bar.x + i * (width + 34), y: bar.y, w: width, h: bar.h }));
  if (stats) drawText(ctx, stats.points, right, row2, { align: 'right', color: PALETTE.text });
}

/**
 * Speed bar: a frame with a fill from 0 to 1, with notches every quarter so
 * the level reads without colour.
 * @param fraction  0 to 1.
 * @param [box]  Where to draw it; the usual place when omitted.
 */
export function drawSpeedBar(ctx: Ctx, fraction: number, label: string = 'SPEED', box: { x: number; y: number; w: number; h: number; } = HUD.bar) {
  const { x, y, w, h } = box;
  const f = Math.max(0, Math.min(1, fraction));
  ctx.fillStyle = PALETTE.overlay;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = f >= 0.999 ? PALETTE.highlight : PALETTE.accent;
  ctx.fillRect(x, y, Math.round(w * f), h);
  ctx.fillStyle = PALETTE.background;
  for (let q = 1; q < 4; q++) ctx.fillRect(x + Math.round((w * q) / 4), y, 1, h);
  drawText(ctx, label, x + w + 6, y + h / 2, { align: 'left', color: PALETTE.text });
}

/**
 * A line of HUD text, left-aligned on a dark backing so it reads over the
 * floodlights and the crowd.
 * @param y  Centre of the line.
 */
export function drawHudText(ctx: Ctx, text: string, x: number, y: number) {
  ctx.fillStyle = PALETTE.overlay;
  ctx.fillRect(x - 2, y - 5, textWidth(text, 1) + 4, 10);
  drawText(ctx, text, x, y, { align: 'left', color: PALETTE.text });
}

/**
 * Attempt counter: "ATTEMPT 2/3" plus one pip per Attempt, filled once used.
 * @param attempt  1-based.
 */
export function drawAttempts(ctx: Ctx, attempt: number, limit: number) {
  const { x, y } = HUD.attempts;
  const text = limit > 1 ? `ATTEMPT ${attempt}/${limit}` : `ATTEMPT ${attempt}`;
  drawHudText(ctx, text, x, y);
}

/**
 * Angle indicator: a quarter dial from 0 to 90 degrees with a needle at the
 * angle, and the target window marked with ticks.
 * @param angle  Degrees, or null before ACTION is pressed.
 */
export function drawAngle(ctx: Ctx, angle: number | null, window: { min: number; max: number; }) {
  const { x, y, r } = HUD.angle;
  ctx.fillStyle = PALETTE.overlay;
  ctx.fillRect(x - 4, y - r - 4, r + 10, r + 8);
  // The dial's edge, a dot every 10 degrees.
  ctx.fillStyle = PALETTE.dim;
  for (let a = 0; a <= 90; a += 10) {
    const rad = (a * Math.PI) / 180;
    ctx.fillRect(Math.round(x + Math.cos(rad) * r), Math.round(y - Math.sin(rad) * r), 1, 1);
  }
  if (window) {
    for (const a of [window.min, window.max]) {
      const rad = (a * Math.PI) / 180;
      drawLine(ctx, x + Math.cos(rad) * (r - 4), y - Math.sin(rad) * (r - 4), x + Math.cos(rad) * (r + 2), y - Math.sin(rad) * (r + 2), PALETTE.highlight);
    }
  }
  ctx.fillStyle = PALETTE.dim;
  ctx.fillRect(x, y, r, 1);
  if (angle !== null) {
    const rad = (Math.max(0, Math.min(90, angle)) * Math.PI) / 180;
    drawLine(ctx, x, y, x + Math.cos(rad) * (r - 2), y - Math.sin(rad) * (r - 2), PALETTE.text);
  }
  drawText(ctx, angle === null ? 'ANGLE' : `${Math.round(angle)}`, x + r / 2, y - r - 10, { color: PALETTE.text });
}

/**
 * A centred message, such as "SET" or a Mark.
 */
export function drawMessage(ctx: Ctx, text: string, { color = PALETTE.highlight, scale = 2, y = HUD.message.y }: { color?: string; scale?: number; y?: number; } = {}) {
  ctx.fillStyle = PALETTE.overlay;
  const w = textWidth(text, scale) + 12;
  ctx.fillRect(Math.round(SCREEN_WIDTH / 2 - w / 2), y - 5 * scale, w, 10 * scale);
  drawText(ctx, text, SCREEN_WIDTH / 2, y, { scale, color });
}

/**
 * The foul banner: the crossed flag beside the word, so it reads without colour.
 * @param [detail]  Why, e.g. "OVERSTEPPED".
 */
export function drawFoul(ctx: Ctx, detail?: string) {
  drawMessage(ctx, 'FOUL', { color: PALETTE.warning, scale: 3 });
  drawSprite(ctx, FLAG_FOUL, SCREEN_WIDTH / 2 - 52, HUD.message.y + 6, FLAG_COLOURS, { scale: 2 });
  drawSprite(ctx, FLAG_FOUL, SCREEN_WIDTH / 2 + 40, HUD.message.y + 6, FLAG_COLOURS, { scale: 2 });
  if (detail) drawMessage(ctx, detail, { color: PALETTE.text, scale: 1, y: HUD.message.y + 24 });
}
