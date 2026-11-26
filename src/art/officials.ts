/**
 * The officials who stand by the field Events: the foul judge, who sits on a
 * stool beside the take-off board and raises a flag (white for a valid jump,
 * the crossed foul flag for a foul), and the measurer, who walks out along
 * the pit with the tape. Drawn in the `OFFICIAL` kit (`colours.js`), with `c`
 * for the stool.
 */

import { ART, OFFICIAL } from './colours.ts';
import { defineSprite } from './sprite.ts';

/** The judge's colours: the official's kit and a wooden stool. */
export const JUDGE_COLOURS = Object.freeze({ ...OFFICIAL, c: ART.wood });

/** The judge's head under a white hat, facing left (towards the Run-up). */
const JUDGE_HEAD = [
  '....hhhhh.....',
  '...hhhhhhh....',
  '.hhbbbbbbbh...',
  '...okkkkhh....',
  '..kkkkkkkh....',
  '....kkkkk.....',
];

/** Seated on the stool: thighs forward, shins down, the stool under. */
const JUDGE_SEATED = [
  '....pppppp....',
  '..ppppppppp...',
  '..nn...cccccc.',
  '..nn...c....c.',
  '..nn...c....c.',
  '.eee...c....c.',
];

/**
 * The foul judge, watching with hands on knees, then raising the flag.
 * Frame 0 watches; frame 1 has the near arm up, with the flag's pole at the
 * `hand` point.
 */
export const JUDGE = Object.freeze([
  defineSprite(
    'judge-watch',
    [
      '..............',
      '..............',
      '..............',
      ...JUDGE_HEAD,
      '....stttss....',
      '...ssstsss....',
      '...ssssssss...',
      '..kkssssssss..',
      '..k.sssssss...',
      ...JUDGE_SEATED,
    ],
    { anchor: [7, 19], points: { hand: [2, 11] } },
  ),
  defineSprite(
    'judge-flag',
    [
      '........k.....',
      '........k.....',
      '.......kk.....',
      ...JUDGE_HEAD.map((row, i) => (i < 3 ? row : `${row.slice(0, 8)}${i === 3 ? 'ss' : 's'}${row.slice(i === 3 ? 10 : 9)}`)),
      '....stttsss...',
      '...ssstsss....',
      '...ssssssss...',
      '..kksssssss...',
      '..k.sssssss...',
      ...JUDGE_SEATED,
    ],
    { anchor: [7, 19], points: { hand: [8, 0] } },
  ),
]);

/**
 * The measurer: walking out with the tape (two steps), then crouched at the
 * landing mark holding the tape to the sand.
 */
export const MEASURER = Object.freeze({
  walk: Object.freeze([
    defineSprite(
      'measurer-walk-1',
      [
        '...hhhhh....',
        '..hhhhhhh...',
        '.hbbbbbbbhh.',
        '...hkkkkok..',
        '...kkkkkkk..',
        '....kkkkk...',
        '....stts....',
        '...ssttss...',
        '..nsssssk...',
        '..nsssssk...',
        '..n.sssskk..',
        '....pppp....',
        '...pp..pp...',
        '...nn...kk..',
        '..nn....kk..',
        '.eee....eee.',
      ],
      { anchor: [6, 15], points: { hand: [9, 10] } },
    ),
    defineSprite(
      'measurer-walk-2',
      [
        '...hhhhh....',
        '..hhhhhhh...',
        '.hbbbbbbbhh.',
        '...hkkkkok..',
        '...kkkkkkk..',
        '....kkkkk...',
        '....stts....',
        '...ssttss...',
        '...nssssk...',
        '...nssssk...',
        '...nsssskk..',
        '....pppp....',
        '....pppp....',
        '....nkk.....',
        '....nkk.....',
        '...eeee.....',
      ],
      { anchor: [6, 15], points: { hand: [9, 10] } },
    ),
  ]),
  crouch: defineSprite(
    'measurer-crouch',
    [
      '............',
      '............',
      '............',
      '............',
      '....hhhhh...',
      '...hhhhhhh..',
      '..hbbbbbbbhh',
      '....hkkkkok.',
      '....kkkkkkk.',
      '...sskkkkk..',
      '..sssttsss..',
      '..ssssssssk.',
      '..pppppp..k.',
      '.pppp.kk..k.',
      '.nn....kk.k.',
      '.eee..eeee..',
    ],
    { anchor: [6, 15], points: { hand: [10, 15] } },
  ),
});

/** Every official frame, for the sprite sheet and tests. */
export const OFFICIAL_FRAMES = Object.freeze([...JUDGE, ...MEASURER.walk, MEASURER.crouch]);
