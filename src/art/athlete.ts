/**
 * The Hexathlon athlete: code-defined frames shared by every Event.
 *
 * Proportions (see `docs/style-guide.md`): drawn here as 16x22 pixels and
 * stretched to 16x28 by `defineTallSprite` (every other row below the neck is
 * doubled), side view facing right: the head (rows 0-6, a quarter of the
 * height), a long torso (rows 8-14) and long legs (rows 15-27). The anchor is between the
 * feet on the bottom row. Near limbs use the `k` skin role and far limbs the
 * shaded `n` role, so arms and legs read even at this size.
 *
 * Roles: `o` outline/eye, `k` skin, `n` shaded skin, `h` hair, `b` headband,
 * `s` vest, `t` bib, `p` shorts, `q` shaded shorts, `e` shoes. Colours come
 * from a kit in `colours.js`.
 */

import { defineSprite, defineTallSprite } from './sprite.ts';
import { PROPORTIONS } from './style.ts';

/** Width and height of every upright athlete frame. */
export const ATHLETE_WIDTH = PROPORTIONS.width;
export const ATHLETE_HEIGHT = PROPORTIONS.height;

/** The head, shared by the upright frames. */
const HEAD = [
  '......hhhh......',
  '.....hhhhhhh....',
  '....hhhhhhhhh...',
  '....bbbbbbbbb...',
  '....hhkkkkkok...',
  '....hkkkkkkkkk..',
  '.....kkkkkkk....',
  '.......kkk......',
];

/**
 * @param body  Rows 8 to 21.
 */
const upright = (name: string, body: readonly string[], points: Record<string, readonly [number, number]>) => defineTallSprite(name, [...HEAD, ...body], { anchor: [8, 21], points });

/** Run cycle: four frames, played in order. Contact, passing, contact, passing. */
export const RUN = Object.freeze([
  upright(
    'run-1',
    [
      '......sssss.....',
      '.....sssssstnn..',
      '...kksssssst.nn.',
      '..kk..sssss.....',
      '......sssss.....',
      '......ppppp.....',
      '.....qqqpppp....',
      '....qqq...ppkk..',
      '...nnn.....kkk..',
      '..nnn.......kk..',
      '.eee........kk..',
      '.ee.........kk..',
      '............kk..',
      '...........eeee.',
    ],
    { hand: [2, 11] },
  ),
  upright(
    'run-2',
    [
      '......sssss.....',
      '......sssssst...',
      '......sssssstk..',
      '....nnsssss..k..',
      '...nn.sssss.....',
      '......ppppp.....',
      '......pppppp....',
      '.......qq.ppkk..',
      '.......nn..kk...',
      '.......nn.kk....',
      '.......nn.eee...',
      '.......nn.......',
      '.......nn.......',
      '.......eeee.....',
    ],
    { hand: [13, 11] },
  ),
  upright(
    'run-3',
    [
      '......sssss.....',
      '.....sssssstkk..',
      '...nnsssssst.kk.',
      '..nn..sssss.....',
      '......sssss.....',
      '......ppppp.....',
      '.....pppqqqq....',
      '....ppp...qqnn..',
      '...kkk.....nnn..',
      '..kkk.......nn..',
      '.eee........nn..',
      '.ee.........nn..',
      '............nn..',
      '...........eeee.',
    ],
    { hand: [14, 10] },
  ),
  upright(
    'run-4',
    [
      '......sssss.....',
      '......sssssst...',
      '......sssssstn..',
      '....kksssss..n..',
      '...kk.sssss.....',
      '......ppppp.....',
      '......qqqqqq....',
      '.......pp.qqnn..',
      '.......kk..nn...',
      '.......kk.nn....',
      '.......kk.eee...',
      '.......kk.......',
      '.......kk.......',
      '.......eeee.....',
    ],
    { hand: [3, 12] },
  ),
]);

/** Standing still, arms at the sides. */
export const STAND = upright('stand', [
  '......sssss.....',
  '.....nsssssk....',
  '.....nsssstk....',
  '.....nsssssk....',
  '.....nssssskk...',
  '.....nppppp.....',
  '......ppppp.....',
  '......qq.pp.....',
  '......nn.kk.....',
  '......nn.kk.....',
  '......nn.kk.....',
  '......nn.kk.....',
  '......nn.kk.....',
  '.....eee.eee....',
], { hand: [11, 12] });

/** Arms raised after a good Mark or a win. */
export const CHEER = defineTallSprite(
  'cheer',
  [
    '.k............k.',
    '.k....hhhh....k.',
    '..k..hhhhhhh.k..',
    '..k.hhhhhhhhhk..',
    '...kbbbbbbbbk...',
    '...khhkkkkkok...',
    '....hkkkkkkkkk..',
    '.....kkkkkkk....',
    '.....sskkkss....',
    '......sssss.....',
    '......sssst.....',
    '......sssss.....',
    '......sssss.....',
    '......ppppp.....',
    '......ppppp.....',
    '......qq.pp.....',
    '......nn.kk.....',
    '......nn.kk.....',
    '......nn.kk.....',
    '......nn.kk.....',
    '......nn.kk.....',
    '.....eee.eee....',
  ],
  { anchor: [8, 21] },
);

/**
 * The celebration after passing an Event: arms high, jumping up and down.
 * Frame 0 is in the air (legs straight, the same as `CHEER`), frame 1 is
 * landing between jumps (knees bent, body lower). A renderer lifts the
 * athlete off the ground for frame 0 (see `render/reaction.js`).
 */
export const CELEBRATE = Object.freeze([
  CHEER,
  defineTallSprite(
    'celebrate-land',
    [
      '................',
      '................',
      '.k............k.',
      '.k....hhhh....k.',
      '..k..hhhhhhh.k..',
      '..k.hhhhhhhhhk..',
      '...kbbbbbbbbk...',
      '...khhkkkkkok...',
      '....hkkkkkkkkk..',
      '.....kkkkkkk....',
      '.....sskkkss....',
      '......sssss.....',
      '......sssst.....',
      '......sssss.....',
      '......sssss.....',
      '......ppppp.....',
      '.....pppppppp...',
      '....qq.....pp...',
      '....nn......kk..',
      '....nn......kk..',
      '.....nn....kk...',
      '....eee...eee...',
    ],
    { anchor: [8, 21], from: 9 },
  ),
]);

/** The body of a disappointed athlete: shoulders slumped, arms hanging. Rows 8 to 21. */
const SLUMPED = [
  '.......kk.......',
  '.....ssssss.....',
  '....nsssssk.....',
  '....nsssstk.....',
  '....nssssskk....',
  '.....nppppp.....',
  '......ppppp.....',
  '......qq.pp.....',
  '......nn.kk.....',
  '......nn.kk.....',
  '......nn.kk.....',
  '......nn.kk.....',
  '......nn.kk.....',
  '.....eee.eee....',
];

/** The head bowed and turned one way (face down to the right). Rows 0 to 7. */
const BOWED_RIGHT = [
  '................',
  '......hhhh......',
  '.....hhhhhhh....',
  '....hhhhhhhhb...',
  '....hhhhhhbbk...',
  '....hhhhbbkkok..',
  '.....hhkkkkkkk..',
  '.......kkkkk....',
];

/** The head bowed and turned the other way (face down to the left). */
const BOWED_LEFT = [
  '................',
  '......hhhh......',
  '....hhhhhhh.....',
  '...bhhhhhhhh....',
  '...kbbhhhhhh....',
  '..kokbbhhhhh....',
  '..kkkkkkkhh.....',
  '....kkkkk.......',
];

/**
 * Failing an Event: the head bowed, shaking from side to side. The two
 * frames alternate (see `render/reaction.js`).
 */
export const DEJECTED = Object.freeze([
  defineTallSprite('dejected-right', [...BOWED_RIGHT, ...SLUMPED], { anchor: [8, 21] }),
  defineTallSprite('dejected-left', [...BOWED_LEFT, ...SLUMPED], { anchor: [8, 21] }),
]);

/**
 * Start crouch for running Events: "on your marks" (knee down) then "set"
 * (hips up). 22x14, facing right, hands on the line at the front.
 */
export const CROUCH = Object.freeze([
  defineSprite(
    'crouch-marks',
    [
      '..........hhhh........',
      '.........hhhhhhh......',
      '........hhhhhhhhh.....',
      '........bbbbbbbbb.....',
      '.....sssshhkkkkkok....',
      '...sssssshkkkkkkkk....',
      '..ssssssst.kkkkkk.....',
      '..ppppsssst..kk.......',
      '.qqppp..ssk..k........',
      'nn..ppp...k..k........',
      'n.....pkkk...k........',
      'e......kk....k........',
      'e.....kk.....kk.......',
      '.....eekkkkkk.........',
    ],
    { anchor: [11, 13] },
  ),
  defineSprite(
    'crouch-set',
    [
      '.....pp...............',
      '....pppps.............',
      '...qqppssss..hhhh.....',
      '..nn...ssssshhhhhhh...',
      '..n.....sssssbbbbbbb..',
      '..n......sssthkkkkok..',
      '..n.......sstkkkkkkkk.',
      '.n.......k.k..kkkkk...',
      '.n......k..k..........',
      '.n.....k...k..........',
      'n.....kk...k..........',
      'e.....k....k..........',
      'e....kk....kk.........',
      '....eee...............',
    ],
    { anchor: [11, 13] },
  ),
]);

/** Every upright and crouch frame, for the sprite sheet and tests. */
export const ATHLETE_FRAMES = Object.freeze([...RUN, STAND, CHEER, CELEBRATE[1], ...DEJECTED, ...CROUCH]);
