/**
 * Hexathlon's art palette and kits, as data. See `docs/style-guide.md` for
 * the reasoning, and `test/style-guide.test.js` for the colour-blind checks
 * every pair listed in `MUST_DIFFER` has to pass.
 *
 * The look is an evening meet under floodlights: a navy sky, an orange-brown
 * cinder-look track with white lane lines on a mown green infield (both
 * textured, as in the arcade originals of the genre), and a banked stand of seat blocks. Hues for things that
 * must be told apart (the athletes' kits) come from the Okabe-Ito set, which
 * is designed to stay distinct for the common kinds of colour blindness, and
 * they also differ in brightness and in shape.
 */

/** Scenery and props. Names, not hex values, are used everywhere else. */
export const ART = Object.freeze({
  // Sky and stadium
  sky: '#10162f',
  skyGlow: '#1f2a52',
  floodlight: '#fff6c8',
  floodlightPole: '#4f5878',
  standDark: '#1a1f3d',
  standSeat: '#2c3566',
  standSeatAlt: '#38427a',
  standRail: '#8a93b8',
  wall: '#0b3a40',
  wallText: '#8fd6c8',
  // Crowd (fans' tops; a mix that reads as "crowd", not as any one team)
  fanA: '#e69f00',
  fanB: '#56b4e9',
  fanC: '#f0e442',
  fanD: '#cc79a7',
  fanE: '#ffffff',
  fanSkin: '#c68642',
  banner: '#009e73',
  // Ground
  track: '#c8662e',
  trackDark: '#a04f22',
  /** Grain flecks in the track's surface: lighter and darker than `track`. */
  trackGrain: '#dd8048',
  trackGrainDark: '#a8532a',
  laneLine: '#e8f0ff',
  infield: '#1a4f22',
  infieldDark: '#15441d',
  /** Grass blades: lighter and darker than the mown stripes. */
  grassLight: '#2b6a2f',
  grassDark: '#0f3616',
  runway: '#c8662e',
  sand: '#e8c98a',
  sandDark: '#c9a965',
  board: '#ffffff',
  foulStrip: '#141020',
  /** The foul judge's red flag. */
  foulFlag: '#d55e00',
  sector: '#e8f0ff',
  marker: '#f0e442',
  // Equipment
  hurdleBar: '#ffffff',
  hurdleStripe: '#141020',
  hurdleFrame: '#8a93b8',
  bar: '#f0e442',
  barStripe: '#141020',
  upright: '#e8f0ff',
  mat: '#0072b2',
  matTop: '#3f9ad6',
  cage: '#8a93b8',
  circle: '#e8f0ff',
  circlePad: '#4f5878',
  metal: '#c8d0e0',
  metalDark: '#4f5878',
  wood: '#d9a066',
  shadow: '#0a1a2a',
  // Officials
  officialJacket: '#a8323e',
  officialJacketDark: '#7a2430',
  officialTrousers: '#3a3f58',
  officialHat: '#f4f4f4',
  tape: '#f0e442',
});

/**
 * An athlete's colours by sprite role. The roles are shared by every athlete
 * sprite: see `athlete.js`.
 *
 * - `o` outline and eye, `k` skin, `n` skin in shade (far limbs), `h` hair
 * - `b` headband (mapped to the hair colour for "no headband")
 * - `s` vest, `t` vest trim and number bib, `p` shorts, `q` shorts in shade, `e` shoes
 */
export type Kit = Readonly<Record<'o' | 'k' | 'n' | 'h' | 'b' | 's' | 't' | 'p' | 'q' | 'e', string>>;

/**
 * Player 1: orange vest, white headband and bib, navy shorts.
 */
export const PLAYER_1: Kit = Object.freeze({
  o: '#141020',
  k: '#f1c27d',
  n: '#c99a5b',
  h: '#5a3418',
  b: '#ffffff',
  s: '#e69f00',
  t: '#ffffff',
  p: '#1b2a5e',
  q: '#111b40',
  e: '#ffffff',
});

/**
 * Player 2: sky-blue vest, black headband, black bib, white shorts.
 */
export const PLAYER_2: Kit = Object.freeze({
  o: '#141020',
  k: '#8d5524',
  n: '#6b3e18',
  h: '#141020',
  b: '#141020',
  s: '#56b4e9',
  t: '#141020',
  p: '#e8f0ff',
  q: '#b8c2d8',
  e: '#141020',
});

/**
 * The CPU Rival: lime vest with a black bib, no headband, black shorts.
 */
export const RIVAL: Kit = Object.freeze({
  o: '#141020',
  k: '#c68642',
  n: '#9c6530',
  h: '#e8c15a',
  b: '#e8c15a',
  s: '#b8e986',
  t: '#141020',
  p: '#141020',
  q: '#0a0812',
  e: '#e8f0ff',
});

/**
 * The officials (the foul judge and the measurer): a white hat, a red
 * blazer over a white shirt and grey trousers. Not in `KITS`, which lists
 * the athletes; the colours are all in `ART`.
 */
export const OFFICIAL: Kit = Object.freeze({
  o: '#141020',
  k: '#f1c27d',
  n: '#c99a5b',
  h: ART.officialHat,
  b: ART.officialJacketDark,
  s: ART.officialJacket,
  t: ART.officialHat,
  p: ART.officialTrousers,
  q: ART.officialTrousers,
  e: '#141020',
});

/** Kits by who wears them. */
export const KITS = Object.freeze({ player1: PLAYER_1, player2: PLAYER_2, rival: RIVAL });

/**
 * Colour pairs that must stay distinguishable for every kind of colour
 * vision the style guide covers. Each entry is [what, colour A, colour B,
 * shape-backed]. The kits' vests are checked against each other and against
 * the track they run on; ground surfaces against what sits on them.
 *
 * Shape-backed pairs are also told apart by shape (the kits differ in
 * headband, bib and shorts, and the HUD labels each lane), so with no colour
 * vision at all they need not differ in brightness.
 *
 */
export const MUST_DIFFER: readonly (readonly [string, string, string, boolean?])[] = Object.freeze([
  ['player 1 vs player 2 vest', PLAYER_1.s, PLAYER_2.s, true],
  ['player 1 vs Rival vest', PLAYER_1.s, RIVAL.s, true],
  ['player 2 vs Rival vest', PLAYER_2.s, RIVAL.s, true],
  ['player 1 vest vs track', PLAYER_1.s, ART.track],
  ['player 2 vest vs track', PLAYER_2.s, ART.track],
  ['Rival vest vs track', RIVAL.s, ART.track],
  ['player 1 shorts vs track', PLAYER_1.p, ART.track],
  ['player 2 shorts vs track', PLAYER_2.p, ART.track],
  ['Rival shorts vs track', RIVAL.p, ART.track],
  ['track vs infield', ART.track, ART.infield],
  ['lane line vs track', ART.laneLine, ART.track],
  ['runway vs sand', ART.runway, ART.sand],
  ['take-off board vs foul strip', ART.board, ART.foulStrip],
  ['foul strip vs runway', ART.foulStrip, ART.runway],
  ['sector line vs infield', ART.sector, ART.infield],
  ['distance marker vs infield', ART.marker, ART.infield],
  ['hurdle bar vs track', ART.hurdleBar, ART.track],
  ['high-jump bar vs sky', ART.bar, ART.sky],
  ['high-jump bar vs mat', ART.bar, ART.mat],
  ['mat vs infield', ART.mat, ART.infield],
  ['hammer ball vs infield', ART.metal, ART.infield],
  ['javelin vs sky', ART.metal, ART.sky],
]);
