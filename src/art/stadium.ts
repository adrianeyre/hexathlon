/**
 * The stadium backdrop shared by every Event, drawn in code: a night sky with
 * floodlight towers, a banked stand of seat blocks with a sparse crowd, an
 * advertising wall, and the ground below. Layers scroll at different speeds
 * (parallax) as the camera follows the athlete.
 *
 * Everything is drawn with `fillRect`, in our internal pixels (320x240), with
 * `cameraX` being the world x at the left edge of the screen.
 */

import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { drawText } from '../render/text.ts';
import { ART } from './colours.ts';
import { defineSprite, drawSprite } from './sprite.ts';
import { FRAME_TIMING } from './style.ts';

/**
 * Where each layer sits on screen, as data. The ground starts at `groundTop`;
 * what is drawn on it (lanes, runway, field) is up to each Event.
 */
export const STADIUM = Object.freeze({
  standTop: 26,
  standRows: 7,
  rowHeight: 8,
  wallTop: 82,
  wallHeight: 12,
  groundTop: 94,
  /** Parallax factors: how far each layer moves per pixel of camera movement. */
  parallax: Object.freeze({ sky: 0.1, lights: 0.25, stand: 0.5, wall: 1 }),
  /** Floodlight towers repeat every this many sky pixels. */
  towerSpacing: 200,
  /** Seat blocks are this wide, with one pixel of gap. */
  seatWidth: 6,
  /** Wall boards repeat every this many pixels. */
  boardWidth: 96,
});

/** Slogans on the wall boards. Original text; no real brands. */
export const WALL_BOARDS = Object.freeze(['HEXATHLON', 'GO GO GO', 'SIX EVENTS', 'FAST FEET']);

/**
 * Deterministic 0-1 value for an integer, so the crowd looks random but is
 * the same every frame and every run.
 */
export function hash01(n: number) {
  let h = Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

/** Floodlight tower: a lamp bank on a lattice pole. */
export const FLOODLIGHT = defineSprite(
  'floodlight',
  [
    'LLLLLLLLL',
    'LllllllLL',
    'LLLLLLLLL',
    'LllllllLL',
    'LLLLLLLLL',
    '....P....',
    '...P.P...',
    '....P....',
    '...P.P...',
    '....P....',
    '...P.P...',
    '....P....',
    '...P.P...',
    '....P....',
    '...P.P...',
    '....P....',
    '...P.P...',
    '....P....',
    '...P.P...',
    '....P....',
    '...P.P...',
    '....P....',
  ],
  { anchor: [4, 21] },
);

const FLOODLIGHT_COLOURS = Object.freeze({ L: ART.floodlightPole, l: ART.floodlight, P: ART.floodlightPole });

/** A seated fan, 4x5: head, top, and arms up when `up`. */
const FAN = Object.freeze({
  sitting: defineSprite('fan', ['.ff.', '.ff.', 'tttt', 'tttt', '....'], { anchor: [0, 4] }),
  cheering: defineSprite('fan-up', ['f..f', 'tfft', '.tt.', 'tttt', '....'], { anchor: [0, 4] }),
});

const FAN_TOPS = Object.freeze([ART.fanA, ART.fanB, ART.fanC, ART.fanD, ART.fanE]);

const wrap = (value: number, period: number) => ((value % period) + period) % period;

export interface BackdropOptions {
  /** Animation frame (60 Hz), for the crowd. */
  frame?: number;
  /** 0 to 1: how many fans are on their feet. */
  excitement?: number;
  /** Hold the crowd still and skip the lamp twinkle. */
  reducedFlash?: boolean;
}

/**
 * The sky and floodlight towers.
 */
export function drawSky(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number) {
  ctx.fillStyle = ART.sky;
  ctx.fillRect(0, 0, SCREEN_WIDTH, STADIUM.standTop);
  // A band of glow just above the stand, from the floodlights.
  ctx.fillStyle = ART.skyGlow;
  ctx.fillRect(0, STADIUM.standTop - 4, SCREEN_WIDTH, 4);
  const offset = Math.round(cameraX * STADIUM.parallax.lights);
  const first = Math.floor(offset / STADIUM.towerSpacing) - 1;
  for (let i = first; i <= first + Math.ceil(SCREEN_WIDTH / STADIUM.towerSpacing) + 1; i++) {
    const x = i * STADIUM.towerSpacing + 60 - offset;
    drawSprite(ctx, FLOODLIGHT, x, STADIUM.standTop + 2, FLOODLIGHT_COLOURS);
  }
}

/**
 * The banked stand and its crowd.
 */
export function drawStand(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, { frame = 0, excitement = 0.2, reducedFlash = false }: BackdropOptions = {}) {
  const { standTop, standRows, rowHeight, seatWidth } = STADIUM;
  ctx.fillStyle = ART.standDark;
  ctx.fillRect(0, standTop, SCREEN_WIDTH, standRows * rowHeight);
  const offset = Math.round(cameraX * STADIUM.parallax.stand);
  const pitch = seatWidth + 1;
  const firstColumn = Math.floor(offset / pitch);
  for (let row = 0; row < standRows; row++) {
    const y = standTop + row * rowHeight;
    // Each row is a step: a lit seat edge over a dark riser.
    ctx.fillStyle = ART.standRail;
    ctx.fillRect(0, y + rowHeight - 1, SCREEN_WIDTH, 1);
    for (let c = firstColumn; c <= firstColumn + Math.ceil(SCREEN_WIDTH / pitch) + 1; c++) {
      const x = c * pitch - offset + (row % 2) * 3;
      const seed = c * 31 + row * 7919;
      // Seats come in blocks of eight separated by an aisle.
      if (wrap(c, 9) === 8) continue;
      ctx.fillStyle = wrap(c, 18) < 9 ? ART.standSeat : ART.standSeatAlt;
      ctx.fillRect(x, y + 3, seatWidth, rowHeight - 4);
      const r = hash01(seed);
      if (r > 0.55) continue; // An empty seat.
      const top = FAN_TOPS[Math.floor(hash01(seed + 1) * FAN_TOPS.length)];
      // Fans stand and wave in turn; with reduced flash they stay put.
      const wave = reducedFlash ? 0 : Math.floor(frame / FRAME_TIMING.crowdWave + hash01(seed + 2) * 8) % 8;
      const up = !reducedFlash && hash01(seed + 3) < excitement && wave < 4;
      const sprite = up ? FAN.cheering : FAN.sitting;
      drawSprite(ctx, sprite, x + 1, y + rowHeight - 2 - (up ? 1 : 0), { f: ART.fanSkin, t: top });
    }
  }
  // Hexagon banners hang from the front of the stand.
  const bannerOffset = wrap(offset, 128);
  for (let x = -bannerOffset; x < SCREEN_WIDTH; x += 128) {
    drawSprite(ctx, BANNER, x + 40, standTop + standRows * rowHeight - 1, { g: ART.banner, w: ART.laneLine });
  }
}

/** A hexagon banner, the game's emblem, hung on the stand front. */
export const BANNER = defineSprite(
  'banner',
  ['...gggg...', '..gwwwwg..', '.gwggggwg.', 'gwgggggggw', '.gwggggwg.', '..gwwwwg..', '...gggg...'],
  { anchor: [5, 6] },
);

/**
 * The advertising wall between the stand and the ground.
 */
export function drawWall(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number) {
  const { wallTop, wallHeight, boardWidth } = STADIUM;
  ctx.fillStyle = ART.wall;
  ctx.fillRect(0, wallTop, SCREEN_WIDTH, wallHeight);
  const offset = Math.round(cameraX * STADIUM.parallax.wall);
  const first = Math.floor(offset / boardWidth);
  for (let i = first; i <= first + Math.ceil(SCREEN_WIDTH / boardWidth) + 1; i++) {
    const x = i * boardWidth - offset;
    ctx.fillStyle = ART.shadow;
    ctx.fillRect(x, wallTop, 1, wallHeight);
    drawText(ctx, WALL_BOARDS[wrap(i, WALL_BOARDS.length)], x + boardWidth / 2, wallTop + wallHeight / 2, {
      color: ART.wallText,
    });
  }
}

/**
 * Sky, stand and wall: everything above the ground.
 */
export function drawBackdrop(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, options: BackdropOptions = {}) {
  drawSky(ctx, cameraX);
  drawStand(ctx, cameraX, options);
  drawWall(ctx, cameraX);
}

/** Texture cell sizes, in pixels: one grain streak or grass blade at most per cell. */
export const TEXTURE = Object.freeze({
  /** Track grain: short horizontal streaks, up to one per cell this wide and tall. */
  grainWidth: 10,
  grainHeight: 2,
  /** Grass blades: up to one per cell this wide and tall. */
  bladeWidth: 6,
  bladeHeight: 3,
  /** Mown stripes on the grass are this wide. */
  stripe: 16,
});

/**
 * Marks fixed to the world (so they scroll with the camera), at most one per
 * cell: a `light` mark where the cell's hash is under `lightShare`, a `dark`
 * one where it is over `1 - darkShare`. A mark is `markW` pixels wide (up to
 * `maxW` when given, picked by the hash) and `markH` tall. Drawn one colour at
 * a time, so there are few style changes.
 *
 * @param area  Screen rectangle to texture.
 */
function speckle(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, area: { x: number; y: number; w: number; h: number; }, look: { cellW: number; cellH: number; seed: number; markW: number; maxW?: number; markH: number; light: string; lightShare: number; dark: string; darkShare: number; }) {
  const { cellW, cellH, seed, markW, maxW = markW, markH, light, lightShare, dark, darkShare } = look;
  const camera = Math.round(cameraX);
  const x0 = Math.floor((area.x + camera) / cellW);
  const x1 = Math.ceil((area.x + area.w + camera) / cellW);
  const right = area.x + area.w;
  const bottom = area.y + area.h;
  const lights: [number, number, number][] = [];
  const darks: [number, number, number][] = [];
  for (let row = 0; row * cellH < area.h; row++) {
    const y = area.y + row * cellH;
    for (let cx = x0; cx < x1; cx++) {
      const r = hash01(cx * 7919 + y * 104729 + seed);
      if (r >= lightShare && r <= 1 - darkShare) continue;
      // Where in the cell the mark sits, and how long it is, from the same hash, so it doesn't look gridded.
      const w = markW + (Math.floor(r * 4111) % (maxW - markW + 1));
      const px = cx * cellW - camera + (Math.floor(r * 997) % Math.max(1, cellW - w + 1));
      const py = y + (Math.floor(r * 7907) % cellH);
      const left = Math.max(area.x, px);
      const width = Math.min(right, px + w) - left;
      if (width <= 0 || py >= bottom) continue;
      (r < lightShare ? lights : darks).push([left, py, width]);
    }
  }
  ctx.fillStyle = light;
  for (const [px, py, w] of lights) ctx.fillRect(px, py, w, Math.min(markH, bottom - py));
  ctx.fillStyle = dark;
  for (const [px, py, w] of darks) ctx.fillRect(px, py, w, 1);
}

/**
 * A stretch of track (or runway) surface: the orange-brown base with a grain
 * of short lighter and darker streaks fixed to the world, like the cinder-look
 * tracks of the arcade originals. Lines are drawn on top by the caller.
 */
export function drawTrackSurface(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, x: number, y: number, w: number, h: number) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = ART.track;
  ctx.fillRect(x, y, w, h);
  speckle(ctx, cameraX, { x, y, w, h }, {
    cellW: TEXTURE.grainWidth,
    cellH: TEXTURE.grainHeight,
    seed: 11,
    markW: 2,
    maxW: 5,
    markH: 1,
    light: ART.trackGrain,
    lightShare: 0.16,
    dark: ART.trackGrainDark,
    darkShare: 0.12,
  });
}

/**
 * A stretch of grass: mown stripes fixed to the world, with blades of lighter
 * and darker green scattered over them, like the textured infield of the
 * arcade originals. Fills from `top` to the bottom of the screen by default.
 */
export function drawGrass(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, top: number, bottom: number = SCREEN_HEIGHT) {
  const h = bottom - top;
  if (h <= 0) return;
  ctx.fillStyle = ART.infield;
  ctx.fillRect(0, top, SCREEN_WIDTH, h);
  const { stripe } = TEXTURE;
  const offset = wrap(Math.round(cameraX), stripe * 2);
  ctx.fillStyle = ART.infieldDark;
  for (let x = -offset; x < SCREEN_WIDTH; x += stripe * 2) ctx.fillRect(x, top, stripe, h);
  speckle(ctx, cameraX, { x: 0, y: top, w: SCREEN_WIDTH, h }, {
    cellW: TEXTURE.bladeWidth,
    cellH: TEXTURE.bladeHeight,
    seed: 29,
    markW: 1,
    markH: 2,
    light: ART.grassLight,
    lightShare: 0.22,
    dark: ART.grassDark,
    darkShare: 0.1,
  });
}

/**
 * Lanes for running Events, seen from high in the stand: the far lane (1)
 * is the narrowest and each nearer lane is taller, and lines across the
 * track lean (`skew` pixels sideways per pixel down), so the track reads as
 * a 3D surface rather than flat stripes.
 */
export interface TrackLayout {
  /** Screen y of the track's top edge. */
  top: number;
  lanes: number;
  /** Screen height of each lane, far (lane 1) to near. */
  laneHeights: readonly number[];
  /** How far a line across the track shifts left per pixel down. */
  skew: number;
}

export const TRACK: Readonly<TrackLayout> = Object.freeze({ top: STADIUM.groundTop + 6, lanes: 4, laneHeights: Object.freeze([20, 24, 28, 32]), skew: 0.4 });

/**
 * Screen y of the top of a lane (1-based), or of the track's near edge for `lanes + 1`.
 */
export function laneTopY(lane: number, layout: TrackLayout = TRACK) {
  let y = layout.top;
  for (let i = 0; i < lane - 1 && i < layout.lanes; i++) y += layout.laneHeights[i];
  return y;
}

/** Screen y of the track's near (bottom) edge. @param [layout] */
export const trackBottom = (layout: TrackLayout = TRACK) => laneTopY(layout.lanes + 1, layout);

/**
 * Screen y of the feet of an athlete running in a lane (1-based, far first):
 * a little above the lane's near line, further for the taller near lanes.
 */
export function laneFeetY(lane: number, layout: TrackLayout = TRACK) {
  const h = layout.laneHeights[Math.max(0, Math.min(layout.lanes - 1, lane - 1))];
  return laneTopY(lane, layout) + h - Math.round(h / 6);
}

/**
 * The sideways shift that makes lines across the track lean in perspective:
 * zero halfway down the track, to the right above, to the left below. Add it
 * to the screen x of anything standing on the track at screen y.
 */
export function trackShear(y: number, layout: TrackLayout = TRACK) {
  const middle = (layout.top + trackBottom(layout)) / 2;
  return Math.round((middle - y) * layout.skew);
}

/**
 * The ground for running Events: the textured grass infield, a raised kerb
 * along the far edge, the textured orange-brown lanes (taller as they come nearer) with lines that thicken
 * towards the viewer and a shaded camber, the track's near edge face, and
 * leaning distance marks on the infield that scroll with the camera.
 */
export function drawTrack(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, cameraX: number, layout: TrackLayout = TRACK) {
  const { top, lanes, laneHeights } = layout;
  const bottom = trackBottom(layout);
  // Grass beyond the far kerb and in front of the track (not under it, to save draw calls).
  drawGrass(ctx, cameraX, STADIUM.groundTop, top - 3);
  drawGrass(ctx, cameraX, bottom + 4);
  drawTrackSurface(ctx, cameraX, 0, top, SCREEN_WIDTH, bottom - top);
  for (let lane = 1; lane <= lanes; lane++) {
    const y = laneTopY(lane, layout);
    const h = laneHeights[lane - 1];
    // A darker band at the near side of each lane, deeper for nearer lanes: the camber.
    ctx.fillStyle = ART.trackDark;
    const band = Math.round(h / 6);
    ctx.fillRect(0, y + h - band - 1, SCREEN_WIDTH, band);
    // Lane lines: thin far away, thicker close up.
    ctx.fillStyle = ART.laneLine;
    ctx.fillRect(0, y, SCREEN_WIDTH, lane > 2 ? 2 : 1);
  }
  ctx.fillStyle = ART.laneLine;
  ctx.fillRect(0, bottom - 2, SCREEN_WIDTH, 2);
  // The kerb along the far edge: a lit top and a shaded face.
  ctx.fillStyle = ART.metal;
  ctx.fillRect(0, top - 3, SCREEN_WIDTH, 1);
  ctx.fillStyle = ART.metalDark;
  ctx.fillRect(0, top - 2, SCREEN_WIDTH, 2);
  // The track's near edge: its depth seen from above.
  ctx.fillStyle = ART.trackDark;
  ctx.fillRect(0, bottom, SCREEN_WIDTH, 4);
  ctx.fillStyle = ART.shadow;
  ctx.fillRect(0, bottom + 4, SCREEN_WIDTH, 1);
  // Leaning ticks across the lane lines every 64 pixels: the track's cross lines, in perspective.
  const tickOffset = wrap(Math.round(cameraX), 64);
  ctx.fillStyle = ART.laneLine;
  for (let x = -tickOffset; x < SCREEN_WIDTH + 64; x += 64) {
    for (let lane = 2; lane <= lanes; lane++) {
      const y = laneTopY(lane, layout);
      const reach = Math.round(laneHeights[lane - 1] / 6);
      for (let dy = -reach; dy <= reach; dy++) ctx.fillRect(x + trackShear(y + dy, layout), y + dy, 1, 1);
    }
  }
  // Distance marks on the infield every 32 pixels, leaning like the track's cross lines, so the speed shows.
  const offset = wrap(Math.round(cameraX), 32);
  ctx.fillStyle = ART.infieldDark;
  for (let x = -offset - 32; x < SCREEN_WIDTH + 32; x += 32) {
    for (let dy = 0; dy < 3; dy++) {
      const farY = STADIUM.groundTop + 1 + dy;
      ctx.fillRect(x + trackShear(farY, layout), farY, 14, 1);
      const nearY = bottom + 8 + dy * 2;
      ctx.fillRect(x + 8 + trackShear(nearY, layout), nearY, 16, 2);
    }
  }
}

/**
 * A line across the lanes at a world x (start or finish), leaning with the
 * track's perspective. `screenX` is where it crosses the middle of the track.
 */
export function drawTrackLine(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, screenX: number, colour: string, layout: TrackLayout = TRACK) {
  ctx.fillStyle = colour;
  const x = Math.round(screenX);
  for (let y = layout.top; y < trackBottom(layout); y++) ctx.fillRect(x + trackShear(y, layout), y, 2, 1);
}

/** A small shadow under an athlete's feet, so they sit on the ground. */
export const SHADOW = defineSprite('shadow', ['.xxxxxxxxxx.', 'xxxxxxxxxxxx', '.xxxxxxxxxx.'], { anchor: [6, 1] });
