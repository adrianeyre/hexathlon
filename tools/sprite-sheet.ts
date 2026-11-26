/**
 * Renders the code-defined art to PNGs for review, using the game's own
 * drawing code on a software canvas. Run with `pnpm sprites`; the images go
 * to `docs/style-guide/` and are embedded in `docs/style-guide.md`.
 *
 * - `frames.png`: every sprite frame, athletes in all three kits.
 * - `scenes.png`: one still per Event, composed from the art as a renderer would.
 * - `sprint-<vision>.png`: the 100m still as seen with each colour-blindness type.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ATHLETE_FRAMES } from '../src/art/athlete.ts';
import { ART, KITS, OFFICIAL } from '../src/art/colours.ts';
import { FLAG_COLOURS, FLAG_FOUL, FLAG_VALID } from '../src/art/field.ts';
import * as hammer from '../src/art/hammer.ts';
import * as highJump from '../src/art/high-jump.ts';
import * as hurdles from '../src/art/hurdles.ts';
import * as javelin from '../src/art/javelin.ts';
import * as longJump from '../src/art/long-jump.ts';
import * as officials from '../src/art/officials.ts';
import { BANNER, FLOODLIGHT, SHADOW, TRACK, drawBackdrop, drawTrack, laneFeetY, trackShear } from '../src/art/stadium.ts';
import { drawSprite, pointAt } from '../src/art/sprite.ts';
import * as sprint from '../src/art/sprint.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../src/render/display.ts';
import { drawTitleArt } from '../src/render/title-art.ts';
import { drawText } from '../src/render/text.ts';
import { simulate } from './colour-vision.ts';
import { RasterCtx } from './raster.ts';

export type Sprite = import('../src/art/sprite.ts').Sprite;
export type Ctx = Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>;

/**
 * Sprites that wear a kit, grouped by Event.
 */
const KIT_ROWS: [string, Sprite[]][] = [
  ['ATHLETE', [...ATHLETE_FRAMES]],
  ['LONG JUMP', [longJump.TAKEOFF, ...longJump.FLIGHT, longJump.LAND]],
  ['JAVELIN', [...javelin.THROW]],
  ['HURDLES', [...hurdles.CLEAR, hurdles.STUMBLE]],
  ['HAMMER', [...hammer.SPIN.map((s) => s.sprite).slice(0, 3), hammer.RELEASE]],
  ['HIGH JUMP', [highJump.TAKEOFF, ...highJump.CLEAR, highJump.KNOCK, highJump.LAND]],
];

/**
 * Props, each with its own colours.
 */
const PROPS: [Sprite, import('../src/art/sprite.ts').ColourMap][] = [
  [sprint.START_BLOCKS, sprint.SPRINT_PROPS],
  [sprint.FINISH_POST, sprint.SPRINT_PROPS],
  [hurdles.HURDLE, hurdles.HURDLE_COLOURS],
  [hurdles.HURDLE_DOWN, hurdles.HURDLE_COLOURS],
  [hammer.BALL, hammer.HAMMER_COLOURS],
  [longJump.SAND_MARK, { d: ART.sandDark }],
  [FLAG_VALID, FLAG_COLOURS],
  [FLAG_FOUL, FLAG_COLOURS],
  ...officials.JUDGE.map((s) => ([s, officials.JUDGE_COLOURS] as [Sprite, import('../src/art/sprite.ts').ColourMap])),
  ...[...officials.MEASURER.walk, officials.MEASURER.crouch].map((s) => ([s, OFFICIAL] as [Sprite, import('../src/art/sprite.ts').ColourMap])),
  [BANNER, { g: ART.banner, w: ART.laneLine }],
  [FLOODLIGHT, { L: ART.floodlightPole, l: ART.floodlight, P: ART.floodlightPole }],
  [SHADOW, { x: ART.shadow }],
  ...javelin.JAVELIN.map((s) => ([s, javelin.JAVELIN_COLOURS] as [Sprite, import('../src/art/sprite.ts').ColourMap])),
];

const CELL = 30;
const ROW = 32;
const PROPS_ROW = 34;

/** Every frame on one sheet. */
export function framesSheet() {
  const columns = Math.max(...KIT_ROWS.map(([, s]) => s.length), 12);
  const kits = Object.values(KITS);
  const height = 12 + KIT_ROWS.length * kits.length * ROW + 16 + PROPS_ROW;
  const ctx = new RasterCtx(56 + columns * CELL, height, ART.sky);
  let y = 4;
  for (const [label, sprites] of KIT_ROWS) {
    for (const kit of kits) {
      ctx.fillStyle = ART.track;
      ctx.fillRect(52, y, columns * CELL, ROW - 2);
      drawText(ctx, label, 4, y + ROW / 2, { align: 'left', color: ART.laneLine });
      sprites.forEach((sprite, i) => drawSprite(ctx, ...bottomCentre(sprite, 52 + i * CELL + CELL / 2, y + ROW - 6), kit));
      y += ROW;
    }
  }
  y += 8;
  drawText(ctx, 'PROPS', 4, y + ROW / 2, { align: 'left', color: ART.laneLine });
  ctx.fillStyle = ART.infield;
  ctx.fillRect(52, y, columns * CELL, PROPS_ROW);
  let x = 56;
  for (const [sprite, colours] of PROPS) {
    drawSprite(ctx, ...bottomCentre(sprite, x + sprite.width / 2, y + PROPS_ROW - 4), colours);
    x += sprite.width + 4;
  }
  return ctx;
}

/**
 * Where to draw a sprite so its bottom row sits on `baseline`, centred on `x`,
 * whatever its anchor.
 */
function bottomCentre(sprite: Sprite, x: number, baseline: number): [Sprite, number, number] {
  const [ax, ay] = sprite.anchor;
  return [sprite, Math.round(x - sprite.width / 2 + ax), baseline - (sprite.height - 1 - ay)];
}

/**
 * One still per Event (and the title), composed the way a renderer would
 * draw it. Each draws onto any context, so tests can record its calls.
 */
export const SCENE_DRAWERS: Record<string, (ctx: Ctx) => void> = {
  sprint: (ctx) => {
    sprint.drawSprintBackdrop(ctx, 0, { startX: 40, finishX: 296, frame: 20, excitement: 0.6, blocks: [1] });
    // Each athlete stands where the track's perspective puts their lane.
    const on = (x: number, lane: number) => x + trackShear(laneFeetY(lane));
    athlete(ctx, sprint.SPRINT_FRAMES.crouch[1], on(46, 1), laneFeetY(1), KITS.rival);
    athlete(ctx, sprint.SPRINT_FRAMES.run[0], on(150, 2), laneFeetY(2), KITS.player1);
    athlete(ctx, sprint.SPRINT_FRAMES.run[2], on(180, 3), laneFeetY(3), KITS.player2);
    athlete(ctx, sprint.SPRINT_FRAMES.cheer, on(270, 4), laneFeetY(4), KITS.rival);
  },
  longJump: (ctx) => {
    longJump.drawLongJumpGround(ctx, 0, { boardX: 96, pitStartX: 130, pitEndX: 312, marks: [236] });
    const y = longJump.RUNWAY_FEET_Y;
    athlete(ctx, longJump.LONG_JUMP_FRAMES.run[1], 40, y, KITS.player1);
    athlete(ctx, longJump.TAKEOFF, 92, y, KITS.player1);
    drawSprite(ctx, longJump.FLIGHT[1], 170, y - 24, KITS.player1);
    athlete(ctx, longJump.LAND, 240, y, KITS.player1);
    // The foul judge by the board with the flag up, and the measurer with the tape out to the mark.
    const judge = officials.JUDGE[1];
    drawSprite(ctx, judge, 88, longJump.LONG_JUMP_GROUND.runwayTop - 2, officials.JUDGE_COLOURS);
    const [fx, fy] = pointAt(judge, 'hand', 88, longJump.LONG_JUMP_GROUND.runwayTop - 2);
    drawSprite(ctx, FLAG_VALID, fx, fy, FLAG_COLOURS);
    const my = longJump.LONG_JUMP_GROUND.runwayTop + longJump.LONG_JUMP_GROUND.runwayHeight + 18;
    const [, ty] = pointAt(officials.MEASURER.crouch, 'hand', 233, my);
    ctx.fillStyle = ART.tape;
    ctx.fillRect(96, ty, 233 - 96 + 4, 1);
    athlete(ctx, officials.MEASURER.crouch, 233, my, OFFICIAL);
  },
  javelin: (ctx) => {
    javelin.drawJavelinGround(ctx, 0, { foulX: 110 });
    const y = javelin.JAVELIN_FEET_Y;
    const run = javelin.JAVELIN_FRAMES.run[0];
    athlete(ctx, run, 36, y, KITS.player2);
    const [hx, hy] = pointAt(run, 'hand', 36, y);
    drawSprite(ctx, javelin.javelinFor(javelin.CARRY_ANGLE), hx, hy, javelin.JAVELIN_COLOURS);
    athlete(ctx, javelin.THROW[1], 92, y, KITS.player2);
    drawSprite(ctx, javelin.javelinFor(30), 200, 120, javelin.JAVELIN_COLOURS);
    drawSprite(ctx, javelin.JAVELIN_STUCK.javelin, 280, 190, javelin.JAVELIN_COLOURS);
    drawSprite(ctx, javelin.JAVELIN_STUCK.tuft, 280, 190, javelin.TUFT_COLOURS);
    drawSprite(ctx, FLAG_FOUL, 118, y - 26, FLAG_COLOURS);
  },
  hurdles: (ctx) => {
    drawBackdrop(ctx, 0, { frame: 40, excitement: 0.4 });
    drawTrack(ctx, 0);
    for (let lane = 1; lane <= TRACK.lanes; lane++) {
      for (let x = 60; x < SCREEN_WIDTH; x += 90) {
        const down = lane === 3 && x === 150;
        drawSprite(ctx, down ? hurdles.HURDLE_DOWN : hurdles.HURDLE, x + trackShear(laneFeetY(lane)), laneFeetY(lane), hurdles.HURDLE_COLOURS);
      }
    }
    const on = (x: number, lane: number) => x + trackShear(laneFeetY(lane));
    athlete(ctx, hurdles.CLEAR[0], on(58, 2), laneFeetY(2) - 10, KITS.player1);
    athlete(ctx, hurdles.CLEAR[1], on(158, 2), laneFeetY(2) - 4, KITS.player1);
    athlete(ctx, hurdles.STUMBLE, on(160, 3), laneFeetY(3), KITS.rival);
    athlete(ctx, hurdles.HURDLES_FRAMES.run[3], on(110, 1), laneFeetY(1), KITS.player2);
  },
  hammer: (ctx) => {
    // The overview: the thrower turning in the caged circle, a ball out over the sector with its shadow.
    hammer.drawHammerGround(ctx, 0, { circleX: 44 });
    const y = hammer.CIRCLE_FEET_Y;
    const { sprite, flip } = hammer.SPIN[1];
    athlete(ctx, sprite, 44, y, KITS.rival, flip);
    const hand = pointAt(sprite, 'hand', 44, y, { flip });
    const [bx, by] = hammer.fieldPoint(44, 20, 0);
    hammer.drawWire(ctx, hand, [bx, by - 8]);
    drawSprite(ctx, hammer.BALL, bx, by - 8, hammer.HAMMER_COLOURS);
    hammer.drawCageFront(ctx, 44);
    const [fx, fy] = hammer.fieldPoint(44, 200, 5);
    drawSprite(ctx, SHADOW, fx, fy, { x: ART.shadow });
    drawSprite(ctx, hammer.BALL, fx, fy - 30, hammer.HAMMER_COLOURS);
  },
  highJump: (ctx) => {
    const barX = 210;
    const barY = highJump.HIGH_JUMP_GROUND.feetY - 40;
    highJump.drawHighJumpGround(ctx, 0, { barX, barY });
    athlete(ctx, highJump.HIGH_JUMP_FRAMES.run[2], 60, highJump.HIGH_JUMP_GROUND.feetY, KITS.player1);
    athlete(ctx, highJump.TAKEOFF, 150, highJump.HIGH_JUMP_GROUND.feetY - 6, KITS.player1);
    drawSprite(ctx, highJump.CLEAR[0], barX, barY - 6, KITS.player1);
    highJump.drawNearUpright(ctx, barX);
  },
  title: (ctx) => drawTitleArt(ctx, { frame: 90, reducedFlash: false }),
};

/** The stills rendered to rasters, by name. */
export const SCENES = Object.fromEntries(
  Object.entries(SCENE_DRAWERS).map(([name, draw]) => [
    name,
    () => {
      const ctx = new RasterCtx(SCREEN_WIDTH, SCREEN_HEIGHT);
      draw(ctx);
      return ctx;
    },
  ]),
);

/**
 * An athlete with a shadow under the feet.
 */
function athlete(ctx: Ctx, sprite: Sprite, x: number, y: number, kit: import('../src/art/colours.ts').Kit, flip: boolean = false) {
  drawSprite(ctx, SHADOW, x, y + 1, { x: ART.shadow });
  drawSprite(ctx, sprite, x, y, kit, { flip });
}

/** All the Event stills on one sheet, two per row. */
export function scenesSheet() {
  const names = Object.keys(SCENES);
  const gap = 4;
  const cols = 2;
  const rows = Math.ceil(names.length / cols);
  const sheet = new RasterCtx(cols * (SCREEN_WIDTH + gap) + gap, rows * (SCREEN_HEIGHT + gap) + gap, '#000000');
  names.forEach((name, i) => {
    const shot = SCENES[name]();
    const ox = gap + (i % cols) * (SCREEN_WIDTH + gap);
    const oy = gap + Math.floor(i / cols) * (SCREEN_HEIGHT + gap);
    for (let y = 0; y < SCREEN_HEIGHT; y++) {
      for (let x = 0; x < SCREEN_WIDTH; x++) {
        const [r, g, b] = shot.pixel(x, y);
        sheet.fillStyle = `rgba(${r}, ${g}, ${b}, 1)`;
        sheet.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  });
  return sheet;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL('../docs/style-guide/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const write = (name: string, png: Buffer) => {
    writeFileSync(new URL(name, dir), png);
    console.log(`wrote docs/style-guide/${name}`);
  };
  write('frames.png', framesSheet().toPng(3));
  write('scenes.png', scenesSheet().toPng(2));
  const sprintShot = SCENES.sprint();
  for (const vision of (['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const)) {
    write(`sprint-${vision}.png`, sprintShot.toPng(2, (rgb) => simulate(rgb, vision)));
  }
}
