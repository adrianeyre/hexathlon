/**
 * Colour-vision simulation, used to check the palette is colour-blind safe
 * (`test/style-guide.test.js`) and to render simulated sprite sheets for
 * review (`tools/sprite-sheet.js`). Development only; never shipped.
 *
 * Dichromacy uses the Machado, Oliveira and Fernandes (2009) matrices at full
 * severity, applied in linear RGB. Achromatopsia keeps only luminance.
 * Differences are CIE76 ΔE in CIELAB (D65).
 */

export type Rgb = [number, number, number];
export type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

/** Every kind of colour vision the palette is checked against. */
export const VISIONS = (['normal', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const);

const MACHADO: Record<'protanopia' | 'deuteranopia' | 'tritanopia', readonly number[]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

/**
 * @param hex  `#rrggbb`
 * @returns 0 to 255
 */
export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** @param c 0 to 255 */
const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** @param v linear 0 to 1 */
const toSrgb = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
};

/**
 * A colour as someone with the given colour vision would see it.
 */
export function simulate(rgb: Rgb, vision: Vision): Rgb {
  if (vision === 'normal') return rgb;
  const [r, g, b] = rgb.map(toLinear);
  if (vision === 'achromatopsia') {
    const y = toSrgb(0.2126 * r + 0.7152 * g + 0.0722 * b);
    return [y, y, y];
  }
  const m = MACHADO[vision];
  return [
    toSrgb(m[0] * r + m[1] * g + m[2] * b),
    toSrgb(m[3] * r + m[4] * g + m[5] * b),
    toSrgb(m[6] * r + m[7] * g + m[8] * b),
  ];
}

/**
 * @returns L*, a*, b*
 */
export function toLab(rgb: Rgb): Rgb {
  const [r, g, b] = rgb.map(toLinear);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/**
 * CIE76 colour difference between two colours as seen with `vision`.
 * About 2.3 is just noticeable; the style guide asks for much more.
 * @param a  `#rrggbb`
 * @param b  `#rrggbb`
 */
export function deltaE(a: string, b: string, vision: Vision = 'normal') {
  const la = toLab(simulate(parseHex(a), vision));
  const lb = toLab(simulate(parseHex(b), vision));
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/**
 * WCAG relative luminance contrast ratio (1 to 21).
 */
export function contrastRatio(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = parseHex(hex).map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
