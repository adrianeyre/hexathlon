/**
 * Text drawing with Hexathlon's code-defined pixel font (`font.js`).
 * Text is snapped to whole internal pixels so it stays crisp at any scale.
 */

import { GLYPH_HEIGHT, ADVANCE, glyphRuns, textWidth } from './font.ts';

export interface TextOptions {
  /** Whole-number multiple of the 5x7 glyph size (1 = 7 pixels tall). */
  scale?: number;
  color?: string;
  /** 'left', 'center' or 'right' of `x`. */
  align?: CanvasTextAlign;
}

/**
 * Draw one line of text, vertically centred on `y`.
 */
export function drawText(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, text: string, x: number, y: number, { scale = 1, color = '#ffffff', align = 'center' }: TextOptions = {}) {
  const s = Math.max(1, Math.round(scale));
  const width = textWidth(text, s);
  let left = x;
  if (align === 'center') left = x - width / 2;
  else if (align === 'right' || align === 'end') left = x - width;
  left = Math.round(left);
  const top = Math.round(y - (GLYPH_HEIGHT * s) / 2);
  ctx.fillStyle = color;
  let cx = left;
  for (const ch of text) {
    for (const [gx, gy, w] of glyphRuns(ch)) ctx.fillRect(cx + gx * s, top + gy * s, w * s, s);
    cx += ADVANCE * s;
  }
}

export { textWidth };
