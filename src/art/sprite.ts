/**
 * Code-defined pixel art. A sprite is rows of characters, one per pixel, in
 * the same spirit as the font (`../render/font.js`): no image files are
 * loaded, so the art is a few kilobytes of source and identical everywhere.
 *
 * Characters are colour roles, not colours. A sprite is drawn with a colour
 * map (a kit, see `colours.js`) that says what each role looks like, so one
 * set of frames serves player 1, player 2 and the Rival. `.` is always
 * transparent; a role mapped to `null` is skipped too.
 *
 * Drawing uses `fillRect` and `fillStyle` only, so the same code renders in
 * the browser and in Node (`tools/sprite-sheet.js`).
 */

/** A point inside a sprite, in sprite pixels from its top-left corner. */
export type SpritePoint = readonly [x: number, y: number];

export interface Sprite {
  name: string;
  width: number;
  height: number;
  rows: readonly string[];
  /** The pixel placed at the draw position (an athlete's feet, a hurdle's base). */
  anchor: SpritePoint;
  /** Named attachment points (e.g. `hand` for a javelin or hammer wire). */
  points: Readonly<Record<string, SpritePoint>>;
  /** Horizontal runs of each role, so drawing needs few fillRects. */
  runs: ReadonlyMap<string, readonly (readonly [x: number, y: number, w: number])[]>;
}

/** Colours by role. `null` (or a missing role) draws nothing. */
export type ColourMap = Readonly<Record<string, string | null>>;

/** Pixels that are never drawn. */
export const TRANSPARENT = '.';

/**
 * Build a sprite from rows of role characters. Every row must be the same
 * width.
 *
 *   The anchor defaults to the bottom-centre pixel.
 */
export function defineSprite(name: string, rows: readonly string[], { anchor, points = {} }: { anchor?: SpritePoint; points?: Record<string, SpritePoint>; } = {}): Sprite {
  if (rows.length === 0) throw new Error(`${name}: no rows`);
  const width = rows[0].length;
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${name}: row ${y} is ${row.length} wide, expected ${width}`);
  });
  const runs: Map<string, [number, number, number][]> = new Map();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < width) {
      const role = row[x];
      const start = x;
      while (x < width && row[x] === role) x++;
      if (role === TRANSPARENT) continue;
      if (!runs.has(role)) runs.set(role, []);
      (runs.get(role) as [number, number, number][]).push([start, y, x - start]);
    }
  });
  return Object.freeze({
    name,
    width,
    height: rows.length,
    rows: Object.freeze([...rows]),
    anchor: anchor ?? ([Math.floor(width / 2), rows.length - 1] as SpritePoint),
    points: Object.freeze({ ...points }),
    runs,
  });
}

/**
 * Build a taller version of a figure: every other row from `from` up to (but
 * not including) `to` is doubled, so the body and legs lengthen while the
 * head keeps its size. The anchor and named points move with their rows. The
 * arcade originals draw lanky athletes, so the upright frames are drawn short
 * and stretched with this.
 *
 *   `from` defaults to 8 (the first row below the neck), `to` to the bottom row (shoes stay one row).
 */
export function defineTallSprite(name: string, rows: readonly string[], { anchor, points = {}, from = 8, to = rows.length - 1 }: { anchor?: SpritePoint; points?: Record<string, SpritePoint>; from?: number; to?: number; } = {}): Sprite {
  const out: string[] = [];
  const firstCopy: number[] = [];
  rows.forEach((row, y) => {
    firstCopy.push(out.length);
    out.push(row);
    if (y >= from && y < to && (y - from) % 2 === 1) out.push(row);
  });
  const move = ([x, y]: SpritePoint): SpritePoint => [x, y === rows.length - 1 ? out.length - 1 : (firstCopy[y] ?? y)];
  const moved = Object.fromEntries(Object.entries(points).map(([key, p]) => [key, move(p)]));
  return defineSprite(name, out, { anchor: move(anchor ?? [Math.floor((rows[0]?.length ?? 0) / 2), rows.length - 1]), points: moved });
}

/**
 * The roles a sprite uses, for tests and the style guide's checks.
 */
export function spriteRoles(sprite: Sprite) {
  return [...sprite.runs.keys()];
}

export interface DrawOptions {
  /** Mirror horizontally about the anchor (face left). */
  flip?: boolean;
  /** Whole-number pixel multiple. */
  scale?: number;
}

/**
 * Draw a sprite with its anchor at (x, y), snapped to whole pixels.
 */
export function drawSprite(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, sprite: Sprite, x: number, y: number, colours: ColourMap, { flip = false, scale = 1 }: DrawOptions = {}) {
  const s = Math.max(1, Math.round(scale));
  const [ax, ay] = sprite.anchor;
  const left = Math.round(x) - (flip ? sprite.width - 1 - ax : ax) * s;
  const top = Math.round(y) - ay * s;
  for (const [role, runs] of sprite.runs) {
    const colour = colours[role];
    if (!colour) continue;
    ctx.fillStyle = colour;
    for (const [rx, ry, w] of runs) {
      const px = flip ? sprite.width - rx - w : rx;
      ctx.fillRect(left + px * s, top + ry * s, w * s, s);
    }
  }
}

/**
 * Where a sprite's named point lands when the sprite is drawn at (x, y).
 */
export function pointAt(sprite: Sprite, point: string, x: number, y: number, { flip = false, scale = 1 }: DrawOptions = {}): [number, number] {
  const p = sprite.points[point] ?? sprite.anchor;
  const s = Math.max(1, Math.round(scale));
  const dx = flip ? sprite.anchor[0] - p[0] : p[0] - sprite.anchor[0];
  return [Math.round(x) + dx * s, Math.round(y) + (p[1] - sprite.anchor[1]) * s];
}

/**
 * Draw a one-pixel line between two points (Bresenham), for thin things such
 * as a javelin shaft or a hammer wire.
 */
export function drawLine(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, x0: number, y0: number, x1: number, y1: number, colour: string) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1;
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = colour;
  for (;;) {
    ctx.fillRect(x, y, 1, 1);
    if (x === tx && y === ty) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
