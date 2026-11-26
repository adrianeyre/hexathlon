/**
 * Hexathlon's logo mark, defined once as geometry and drawn two ways: as an
 * SVG (`svg()`) and as an anti-aliased raster (`rasterise()`), so every app
 * icon, favicon and the social card come from the same code-defined art. No
 * image editor or third-party asset is involved. Development only.
 *
 * The mark: a gold hexagon (the six Events) around a floodlit night sky over a
 * blue running track (the style guide's evening meet), with a hurdle standing
 * on the track that also reads as an "H". Colours are the style guide's.
 *
 * Coordinates are in a 512x512 design box. A `tile` is the background the mark
 * sits on: a rounded square (`rounded`), a full-bleed square for platforms that
 * mask the icon themselves (`square`), or nothing (`none`).
 */

/** 0-255, alpha 0-1 */
export type RGBA = [number, number, number, number];
export type Tile = 'rounded' | 'square' | 'none';

export interface MarkOptions {
  /** Background tile. Default 'rounded'. */
  tile?: Tile;
  /** Size of the mark relative to the box, for safe zones. Default 1. */
  scale?: number;
  /** Bolder, less detailed version for 16 to 48 px. */
  simple?: boolean;
  /** Draw everything in one colour (Safari pinned tab). */
  monochrome?: string;
}

export const COLOURS = Object.freeze({
  /** Tile gradient, top to bottom: the game's panel and background navy. */
  tileTop: '#1f2a52',
  tileBottom: '#0b1024',
  /** Gold hexagon ring (the interface highlight), lighter at the top. */
  goldTop: '#ffe27a',
  goldBottom: '#f5b800',
  /** Night sky inside the hexagon, with a floodlight glow. */
  skyGlow: '#33427f',
  sky: '#10162f',
  /** Track and lane lines. */
  track: '#2e5eaa',
  trackShade: '#244b8a',
  lane: '#e8f0ff',
  /** Hurdle: white with a dark band, as in the game. */
  hurdle: '#ffffff',
  hurdleBand: '#141020',
});

const BOX = 512;
const CX = 256;
const CY = 256;
const COS30 = Math.cos(Math.PI / 6);

/** Geometry for the full and simple versions. */
function geometry(simple: boolean) {
  const outer = simple ? 196 : 190; // circumradius of the gold ring
  const inner = simple ? 150 : 160;
  return {
    radius: 112, // tile corner
    outer,
    inner,
    // Track: a horizontal band across the lower half, clipped to the hexagon.
    trackTop: simple ? 300 : 306,
    // Lane lines (y of each line's centre) and their thickness.
    lanes: simple ? [300] : [306, 340, 374],
    laneWidth: simple ? 14 : 7,
    // Hurdle that reads as an H: two posts and a crossbar.
    posts: simple
      ? [
          [162, 140, 60, 166],
          [290, 140, 60, 166],
        ]
      : [
          [180, 150, 40, 156],
          [292, 150, 40, 156],
        ],
    bar: simple ? [150, 186, 212, 56] : [164, 192, 184, 40],
    /** Dark bands on the top board, as on the game's hurdles (0 for none). */
    barBands: 0,
    feet: simple
      ? []
      : [
          [168, 300, 64, 10],
          [280, 300, 64, 10],
        ],
  };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number) {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const k = Math.min(1, Math.max(0, t));
  return ([ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k] as [number, number, number]);
}

/** Inside a pointy-top hexagon of circumradius `r` centred on the box. */
function inHex(x: number, y: number, r: number) {
  const dx = Math.abs(x - CX);
  const dy = Math.abs(y - CY);
  const apothem = r * COS30;
  return dx <= apothem && 0.5 * dx + COS30 * dy <= apothem;
}

/** Inside a rounded square covering the whole box. */
function inTile(x: number, y: number, radius: number) {
  if (x < 0 || y < 0 || x > BOX || y > BOX) return false;
  const qx = Math.max(radius - x, x - (BOX - radius), 0);
  const qy = Math.max(radius - y, y - (BOX - radius), 0);
  return qx * qx + qy * qy <= radius * radius;
}

const inRect = (x: number, y: number, [rx, ry, w, h]: number[]) => x >= rx && x < rx + w && y >= ry && y < ry + h;

/**
 * The colour of one point of the mark, in design-box coordinates, or null
 * where it is transparent.
 */
export function colourAt(px: number, py: number, { tile = 'rounded', scale = 1, simple = false, monochrome }: MarkOptions = {}): [number, number, number] | null {
  const g = geometry(simple);
  const mono = monochrome ? rgb(monochrome) : null;
  // Background tile, in the box's own coordinates.
  let colour: [number, number, number] | null = null;
  if (tile === 'square' || (tile === 'rounded' && inTile(px, py, g.radius))) {
    colour = mix(COLOURS.tileTop, COLOURS.tileBottom, py / BOX);
  }
  // The mark, scaled about the centre.
  const x = CX + (px - CX) / scale;
  const y = CY + (py - CY) / scale;
  if (!inHex(x, y, g.outer)) return mono && colour ? null : colour;
  if (!inHex(x, y, g.inner)) {
    return mono ?? mix(COLOURS.goldTop, COLOURS.goldBottom, (y - (CY - g.outer)) / (2 * g.outer));
  }
  // Hurdle on top of the scene.
  if (inRect(x, y, g.bar)) {
    if (mono) return mono;
    if (g.barBands) {
      const band = Math.floor(((x - g.bar[0]) / g.bar[2]) * g.barBands);
      return rgb(band % 2 ? COLOURS.hurdleBand : COLOURS.hurdle);
    }
    return rgb(COLOURS.hurdle);
  }
  if (g.posts.some((r) => inRect(x, y, r)) || g.feet.some((r) => inRect(x, y, r))) return mono ?? rgb(COLOURS.hurdle);
  if (mono) {
    // The pinned-tab mask: track lane lines show as solid, everything else is cut out.
    return g.lanes.some((l) => Math.abs(y - l) <= g.laneWidth / 2) ? mono : null;
  }
  if (g.lanes.some((l) => Math.abs(y - l) <= g.laneWidth / 2)) return rgb(COLOURS.lane);
  if (y >= g.trackTop) return mix(COLOURS.track, COLOURS.trackShade, (y - g.trackTop) / (CY + g.inner - g.trackTop));
  // Sky: a floodlight glow at the top fading into the night.
  const d = Math.hypot(x - CX, y - (CY - g.inner * 0.55)) / (g.inner * 1.4);
  return mix(COLOURS.skyGlow, COLOURS.sky, d);
}

/**
 * Render the mark to RGBA pixels by supersampling, for crisp anti-aliased
 * edges at any size. The mark is centred in a `width` x `height` image at
 * `size` pixels square (default: the smaller side).
 */
export function rasterise(width: number, height: number, options: MarkOptions & { size?: number; background?: string; } = {}): (x: number, y: number) => RGBA {
  const size = options.size ?? Math.min(width, height);
  const ox = (width - size) / 2;
  const oy = (height - size) / 2;
  const background = options.background ? rgb(options.background) : null;
  // More samples per pixel at small sizes, where every edge pixel counts.
  const n = size <= 64 ? 16 : size <= 256 ? 8 : 4;
  return (x, y) => {
    let r = 0;
    let gr = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < n; sy++) {
      for (let sx = 0; sx < n; sx++) {
        const dx = ((x - ox + (sx + 0.5) / n) / size) * BOX;
        const dy = ((y - oy + (sy + 0.5) / n) / size) * BOX;
        const c = colourAt(dx, dy, options) ?? background;
        if (!c) continue;
        r += c[0];
        gr += c[1];
        b += c[2];
        a += 1;
      }
    }
    if (a === 0) return [0, 0, 0, 0];
    return [Math.round(r / a), Math.round(gr / a), Math.round(b / a), a / (n * n)];
  };
}

function hexPoints(r: number, cy: number = CY) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3;
    return `${round(CX + r * Math.cos(angle))},${round(cy + r * Math.sin(angle))}`;
  }).join(' ');
}

const round = (n: number) => Math.round(n * 100) / 100;

const rect = ([x, y, w, h]: number[], fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

/**
 * The mark as an SVG document, matching `colourAt`.
 */
export function svg({ tile = 'rounded', scale = 1, simple = false, monochrome, title = 'Hexathlon' }: MarkOptions & { title?: string; } = {}) {
  const g = geometry(simple);
  const body = [];
  const defs = [];
  if (!monochrome) {
    defs.push(
      `<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${COLOURS.tileTop}"/><stop offset="1" stop-color="${COLOURS.tileBottom}"/></linearGradient>`,
      `<linearGradient id="gold" x1="0" y1="${CY - g.outer}" x2="0" y2="${CY + g.outer}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${COLOURS.goldTop}"/><stop offset="1" stop-color="${COLOURS.goldBottom}"/></linearGradient>`,
      `<radialGradient id="sky" cx="${CX}" cy="${round(CY - g.inner * 0.55)}" r="${round(g.inner * 1.4)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${COLOURS.skyGlow}"/><stop offset="1" stop-color="${COLOURS.sky}"/></radialGradient>`,
      `<linearGradient id="track" x1="0" y1="${g.trackTop}" x2="0" y2="${CY + g.inner}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${COLOURS.track}"/><stop offset="1" stop-color="${COLOURS.trackShade}"/></linearGradient>`,
    );
    if (tile === 'rounded') body.push(`<rect width="${BOX}" height="${BOX}" rx="${g.radius}" fill="url(#tile)"/>`);
    if (tile === 'square') body.push(`<rect width="${BOX}" height="${BOX}" fill="url(#tile)"/>`);
  }
  defs.push(`<clipPath id="inner"><polygon points="${hexPoints(g.inner)}"/></clipPath>`);
  const fill = (c: string) => monochrome ?? c;
  const mark = [];
  mark.push(
    `<path fill-rule="evenodd" fill="${fill('url(#gold)')}" d="M${hexPoints(g.outer).replaceAll(' ', 'L')}ZM${hexPoints(g.inner).replaceAll(' ', 'L')}Z"/>`,
  );
  const scene = [];
  if (!monochrome) {
    scene.push(`<rect width="${BOX}" height="${BOX}" fill="url(#sky)"/>`);
    scene.push(rect([0, g.trackTop, BOX, BOX - g.trackTop], 'url(#track)'));
  }
  for (const l of g.lanes) scene.push(rect([0, l - g.laneWidth / 2, BOX, g.laneWidth], fill(COLOURS.lane)));
  for (const r of [...g.posts, ...g.feet]) scene.push(rect(r, fill(COLOURS.hurdle)));
  scene.push(rect(g.bar, fill(COLOURS.hurdle)));
  if (!monochrome && g.barBands) {
    const w = g.bar[2] / g.barBands;
    for (let i = 1; i < g.barBands; i += 2) scene.push(rect([g.bar[0] + i * w, g.bar[1], w, g.bar[3]], COLOURS.hurdleBand));
  }
  mark.push(`<g clip-path="url(#inner)">${scene.join('')}</g>`);
  const transform = scale === 1 ? '' : ` transform="translate(${round(CX * (1 - scale))} ${round(CY * (1 - scale))}) scale(${scale})"`;
  body.push(`<g${transform}>${mark.join('')}</g>`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}" width="${BOX}" height="${BOX}" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    `<defs>${defs.join('')}</defs>`,
    ...body,
    '</svg>',
    '',
  ].join('\n');
}
