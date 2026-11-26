/**
 * A tiny software canvas: enough of CanvasRenderingContext2D (`fillStyle` and
 * `fillRect`) to render the game's code-defined art in Node, for the sprite
 * sheet and for tests. Development only.
 */
import { encodePng } from './png.ts';

/**
 * @param style  `#rgb`, `#rrggbb` or `rgba(r, g, b, a)`
 * @returns RGB 0-255 and alpha 0-1
 */
export function parseColour(style: string): [number, number, number, number] {
  let m = /^#([0-9a-f]{6})$/i.exec(style);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(style);
  if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16), 1];
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(style);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  throw new Error(`Unsupported colour: ${style}`);
}

export class RasterCtx {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  fillStyle: string;

  constructor(width: number, height: number, background: string = '#000000') {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 3);
    this.fillStyle = background;
    this.fillRect(0, 0, width, height);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    const [r, g, b, a] = parseColour(String(this.fillStyle));
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py * this.width + px) * 3;
        this.data[i] = this.data[i] * (1 - a) + r * a;
        this.data[i + 1] = this.data[i + 1] * (1 - a) + g * a;
        this.data[i + 2] = this.data[i + 2] * (1 - a) + b * a;
      }
    }
  }

  pixel(x: number, y: number): [number, number, number] {
    const i = (y * this.width + x) * 3;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  /**
   * @param [scale]  Whole-number upscale.
   */
  toPng(scale: number = 1, filter: (rgb: [number, number, number]) => readonly [number, number, number] = (rgb) => rgb) {
    return encodePng(this.width * scale, this.height * scale, (x, y) =>
      filter(this.pixel(Math.floor(x / scale), Math.floor(y / scale))),
    );
  }
}
