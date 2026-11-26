import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as athlete from '../src/art/athlete.ts';
import { ART, KITS } from '../src/art/colours.ts';
import { FLAG_COLOURS, FLAG_FOUL, FLAG_VALID } from '../src/art/field.ts';
import * as hammer from '../src/art/hammer.ts';
import * as highJump from '../src/art/high-jump.ts';
import * as hurdles from '../src/art/hurdles.ts';
import * as javelin from '../src/art/javelin.ts';
import * as longJump from '../src/art/long-jump.ts';
import * as officials from '../src/art/officials.ts';
import { drawStand, hash01 } from '../src/art/stadium.ts';
import { defineSprite, drawLine, drawSprite, pointAt, spriteRoles } from '../src/art/sprite.ts';
import * as sprint from '../src/art/sprint.ts';
import { FRAME_COUNTS, PROPORTIONS, runStepFrames } from '../src/art/style.ts';
import { PALETTE } from '../src/render/palette.ts';
import { SCREEN_WIDTH } from '../src/render/display.ts';
import { RasterCtx } from '../tools/raster.ts';
import { SCENE_DRAWERS } from '../tools/sprite-sheet.ts';

export type Sprite = import('../src/art/sprite.ts').Sprite;

/** Every sprite that wears a kit. */
const KIT_SPRITES = ([
  ...athlete.ATHLETE_FRAMES,
  ...officials.OFFICIAL_FRAMES.filter((s) => !s.name.startsWith('judge')),
  longJump.TAKEOFF,
  ...longJump.FLIGHT,
  longJump.LAND,
  ...javelin.THROW,
  ...hurdles.CLEAR,
  hurdles.STUMBLE,
  ...hammer.SPIN.map((s) => s.sprite),
  hammer.RELEASE,
  highJump.TAKEOFF,
  ...highJump.CLEAR,
  highJump.KNOCK,
  highJump.LAND,
] as Sprite[]);

/** Props and their colours. */
const PROPS = ([
  [sprint.START_BLOCKS, sprint.SPRINT_PROPS],
  [sprint.FINISH_POST, sprint.SPRINT_PROPS],
  [hurdles.HURDLE, hurdles.HURDLE_COLOURS],
  [hurdles.HURDLE_DOWN, hurdles.HURDLE_COLOURS],
  [hammer.BALL, hammer.HAMMER_COLOURS],
  [FLAG_VALID, FLAG_COLOURS],
  [FLAG_FOUL, FLAG_COLOURS],
  ...officials.JUDGE.map((s) => ([s, officials.JUDGE_COLOURS] as [Sprite, Record<string, string | null>])),
  [javelin.JAVELIN_STUCK.tuft, javelin.TUFT_COLOURS],
  ...javelin.JAVELIN.map((s) => [s, javelin.JAVELIN_COLOURS]),
] as [Sprite, Record<string, string | null>][]);

/** Every colour the art and the interface may use. */
const PALETTE_COLOURS = new Set(
  [...Object.values(ART), ...Object.values(KITS).flatMap((k) => Object.values(k)), ...Object.values(PALETTE)].map((c) =>
    c.toLowerCase(),
  ),
);

/** A context that records every fillStyle used for a fillRect. */
function recordingCtx() {
  const colours: Set<string> = new Set();
  let calls = 0;
  return {
    colours,
    get calls() {
      return calls;
    },
    fillStyle: '',
    fillRect() {
      calls += 1;
      colours.add(String(this.fillStyle).toLowerCase());
    },
  };
}

describe('sprites', () => {
  it('reject rows of different widths', () => {
    assert.throws(() => defineSprite('bad', ['...', '..']), /row 1 is 2 wide/);
  });

  it('draw each role in its colour at the anchor, and mirror when flipped', () => {
    const s = defineSprite('t', ['ab.', '..c'], { anchor: [0, 1], points: { hand: [2, 0] } });
    const ctx = new RasterCtx(6, 4, '#000000');
    drawSprite(ctx, s, 2, 2, { a: '#ff0000', b: '#00ff00', c: '#0000ff' });
    assert.deepEqual(ctx.pixel(2, 1), [255, 0, 0]);
    assert.deepEqual(ctx.pixel(3, 1), [0, 255, 0]);
    assert.deepEqual(ctx.pixel(4, 2), [0, 0, 255]);
    assert.deepEqual(pointAt(s, 'hand', 2, 2), [4, 1]);

    const flipped = new RasterCtx(6, 4, '#000000');
    drawSprite(flipped, s, 4, 2, { a: '#ff0000', b: '#00ff00', c: '#0000ff' }, { flip: true });
    assert.deepEqual(flipped.pixel(4, 1), [255, 0, 0]);
    assert.deepEqual(flipped.pixel(3, 1), [0, 255, 0]);
    assert.deepEqual(flipped.pixel(2, 2), [0, 0, 255]);
    assert.deepEqual(pointAt(s, 'hand', 4, 2, { flip: true }), [2, 1]);
  });

  it('skip transparent pixels and roles mapped to null', () => {
    const s = defineSprite('t', ['ab']);
    const ctx = recordingCtx();
    drawSprite(ctx, s, 0, 0, { a: '#ffffff', b: null });
    assert.equal(ctx.calls, 1);
  });

  it('draw lines that reach both ends', () => {
    const ctx = new RasterCtx(10, 10, '#000000');
    drawLine(ctx, 1, 8, 8, 2, '#ffffff');
    assert.deepEqual(ctx.pixel(1, 8), [255, 255, 255]);
    assert.deepEqual(ctx.pixel(8, 2), [255, 255, 255]);
  });

  it('wearing a kit only use the kit roles, and every kit defines every role', () => {
    const roles = new Set(Object.keys(KITS.player1));
    for (const kit of Object.values(KITS)) assert.deepEqual(new Set(Object.keys(kit)), roles);
    for (const sprite of KIT_SPRITES) {
      for (const role of spriteRoles(sprite)) assert.ok(roles.has(role), `${sprite.name} uses unknown role ${role}`);
    }
  });

  it('for props have a colour for every role they use', () => {
    for (const [sprite, colours] of PROPS) {
      for (const role of spriteRoles(sprite)) assert.ok(colours[role], `${sprite.name}: no colour for ${role}`);
    }
  });

  it('keep their anchors and points inside the sprite', () => {
    for (const sprite of [...KIT_SPRITES, ...PROPS.map(([s]) => s)]) {
      for (const [x, y] of [sprite.anchor, ...Object.values(sprite.points)]) {
        assert.ok(x >= 0 && x < sprite.width && y >= 0 && y < sprite.height, `${sprite.name}: point ${x},${y}`);
      }
    }
  });

  it('have unique names', () => {
    const sprites = [...new Set([...KIT_SPRITES, ...PROPS.map(([s]) => s)])];
    const names = sprites.map((s) => s.name);
    assert.equal(new Set(names).size, names.length);
  });
});

describe('style guide rules', () => {
  it('upright athlete frames follow the proportions', () => {
    for (const sprite of [...athlete.RUN, athlete.STAND, athlete.CHEER, ...athlete.CELEBRATE, ...athlete.DEJECTED, ...javelin.THROW, hammer.RELEASE, highJump.TAKEOFF]) {
      assert.equal(sprite.width, PROPORTIONS.width, sprite.name);
      assert.equal(sprite.height, PROPORTIONS.height, sprite.name);
      assert.equal(sprite.anchor[1], PROPORTIONS.height - 1, `${sprite.name} stands on its bottom row`);
    }
    assert.equal(PROPORTIONS.headRows + 1 + PROPORTIONS.torsoRows + PROPORTIONS.legRows, PROPORTIONS.height);
  });

  it('every animation has the documented number of frames', () => {
    const actual: Record<keyof typeof FRAME_COUNTS, number> = {
      run: athlete.RUN.length,
      crouch: athlete.CROUCH.length,
      stand: 1,
      cheer: 1,
      celebrate: athlete.CELEBRATE.length,
      dejected: athlete.DEJECTED.length,
      judge: officials.JUDGE.length,
      measurerWalk: officials.MEASURER.walk.length,
      longJumpTakeoff: 1,
      longJumpFlight: longJump.FLIGHT.length,
      longJumpLand: 1,
      javelinThrow: javelin.THROW.length,
      javelinAngles: javelin.JAVELIN.length,
      hurdleClear: hurdles.CLEAR.length,
      hurdleStumble: 1,
      hammerSpin: hammer.SPIN.length,
      hammerRelease: 1,
      highJumpTakeoff: 1,
      highJumpClear: highJump.CLEAR.length,
      highJumpKnock: 1,
      highJumpLand: 1,
    };
    assert.deepEqual(actual, { ...FRAME_COUNTS });
  });

  it('the run cycle quickens with speed', () => {
    assert.ok(runStepFrames(1) < runStepFrames(0.5));
    assert.ok(runStepFrames(0.5) < runStepFrames(0));
    assert.equal(runStepFrames(2), runStepFrames(1));
  });

  it('javelin sprites point the way of their angle', () => {
    for (const s of javelin.JAVELIN) {
      const degrees = Number(s.name.replace('javelin-', ''));
      const [tx, ty] = (s.points.tip as readonly [number, number]);
      const [ax, ay] = s.anchor;
      assert.ok(tx > ax, `${s.name} points right`);
      if (degrees > 0) assert.ok(ty < ay, `${s.name} points up`);
      if (degrees < 0) assert.ok(ty > ay, `${s.name} points down`);
    }
    assert.equal(javelin.javelinFor(50).name, 'javelin-45');
  });
});

describe('scenery', () => {
  it('every Event still draws only palette colours, inside a draw-call budget', () => {
    for (const [name, draw] of Object.entries(SCENE_DRAWERS)) {
      const ctx = recordingCtx();
      draw(ctx);
      for (const colour of ctx.colours) assert.ok(PALETTE_COLOURS.has(colour), `${name} uses ${colour}, not in the palette`);
      // About 2,400 small rects is comfortably inside 60 FPS on a mid-range phone; the
      // textured track and grass add up to about 800 more one-pixel-high rects, still well inside it.
      assert.ok(ctx.calls < 3600, `${name}: ${ctx.calls} fillRects per frame`);
    }
  });

  it('the crowd and lamps hold still with reduced flash', () => {
    const frames = [0, 13, 50, 97].map((frame) => {
      const ctx = new RasterCtx(SCREEN_WIDTH, 100);
      drawStand(ctx, 40, { frame, excitement: 1, reducedFlash: true });
      return Buffer.from(ctx.data).toString('base64');
    });
    assert.equal(new Set(frames).size, 1);
    const moving = [0, 13, 50, 97].map((frame) => {
      const ctx = new RasterCtx(SCREEN_WIDTH, 100);
      drawStand(ctx, 40, { frame, excitement: 1 });
      return Buffer.from(ctx.data).toString('base64');
    });
    assert.ok(new Set(moving).size > 1, 'without reduced flash the crowd moves');
  });

  it('the crowd is the same on every run', () => {
    assert.equal(hash01(12345), hash01(12345));
    assert.notEqual(hash01(1), hash01(2));
    for (let i = 0; i < 100; i++) assert.ok(hash01(i) >= 0 && hash01(i) < 1);
  });
});
