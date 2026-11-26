/**
 * 110m Hurdles art: the hurdle-clearing frames (lead leg out, then trail leg
 * through), a stumble for hitting a hurdle, and the hurdle standing and
 * knocked over. The runners use the shared run cycle and start crouch, and the
 * track comes from `stadium.js`.
 */

import { CROUCH, RUN } from './athlete.ts';
import { ART } from './colours.ts';
import { defineSprite, defineTallSprite } from './sprite.ts';

/** Clearing a hurdle, two frames: lead leg reaching over, then the trail leg coming through. */
export const CLEAR = Object.freeze([
  defineTallSprite(
    'hurdles-lead',
    [
      '......hhhh..........',
      '.....hhhhhhh........',
      '....hhhhhhhhh.......',
      '....bbbbbbbbb.......',
      '....hhkkkkkok.......',
      '....hkkkkkkkkk......',
      '.....kkkkkkk........',
      '.......kkk..........',
      '......sssss.kk......',
      '...nnssssssk.kk.....',
      '..nn..sssst....k....',
      '......sssss.........',
      '......pppppppkkkkkee',
      '.....qqqpppp.kkkkkee',
      '....qq..............',
      '...nn...............',
      '..nnn...............',
      '.ee.................',
    ],
    { anchor: [8, 17] },
  ),
  defineTallSprite(
    'hurdles-trail',
    [
      '........hhhh........',
      '.......hhhhhhh......',
      '......hhhhhhhhh.....',
      '......bbbbbbbbb.....',
      '......hhkkkkkok.....',
      '......hkkkkkkkkk....',
      '.......kkkkkkk......',
      '.........kkk........',
      '....kk..sssss.......',
      '......kssssssnn.....',
      '........sssst..n....',
      '........sssss.......',
      '..nnnnqqqppppp......',
      '..nn......ppkk......',
      '...........kk.......',
      '...........kk.......',
      '...........kk.......',
      '..........eeee......',
    ],
    { anchor: [11, 17] },
  ),
]);

/** Hitting a hurdle: pitched forward, arms thrown out. */
export const STUMBLE = defineSprite(
  'hurdles-stumble',
  [
    '...........hhhh.....',
    '..........hhhhhhh.k.',
    '.........hhhhhhhhhk.',
    '.........bbbbbbbbbk.',
    '.......kssshkkkkkok.',
    '......k.ssshkkkkkkkk',
    '.....k.sssstkkkkkk..',
    '......ssssst..kkk...',
    '.....ssssss.........',
    '....ppppp...........',
    '...qqpppp...........',
    '..nn....kk..........',
    '.nn......kk.........',
    '.nn.......kk........',
    'ee.........kk.......',
    '...........eee......',
  ],
  { anchor: [10, 15] },
);

/** A hurdle seen side-on: striped top board on a post with a base. */
export const HURDLE = defineSprite(
  'hurdle',
  [
    'wwxxwwxxww',
    'wwxxwwxxww',
    '....f.....',
    '....f.....',
    '....f.....',
    '....f.....',
    '....f.....',
    '....f.....',
    '....f.....',
    '....f.....',
    'ffffffffff',
  ],
  { anchor: [4, 10] },
);

/** A knocked-over hurdle lying on the track. */
export const HURDLE_DOWN = defineSprite(
  'hurdle-down',
  ['.........w', '.........w', '.........x', 'fffffffffx', 'f........w', 'f........w'],
  { anchor: [4, 5] },
);

/** Colours for the hurdles. */
export const HURDLE_COLOURS = Object.freeze({ w: ART.hurdleBar, x: ART.hurdleStripe, f: ART.hurdleFrame });

/** Every Hurdles frame. */
export const HURDLES_FRAMES = Object.freeze({ run: RUN, crouch: CROUCH, clear: CLEAR, stumble: STUMBLE });
