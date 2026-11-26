/**
 * Screen geometry: a fixed low internal resolution, letterboxed and scaled to
 * fit any viewport, or stretched to fill it in full-screen mode. No DOM access here so the maths can be unit-tested in Node.
 */

/** Internal canvas width in our own pixels (not the original's sim pixels; see ADR-0004). */
export const SCREEN_WIDTH = 320;
/** Internal canvas height in our own pixels. */
export const SCREEN_HEIGHT = 240;

export interface Letterbox {
  /** Device pixels per internal pixel. */
  scale: number;
  /** Canvas width in CSS pixels. */
  cssWidth: number;
  /** Canvas height in CSS pixels. */
  cssHeight: number;
}

/**
 * Fit the internal resolution inside a viewport, keeping the aspect ratio.
 *
 * Scaling is done in device pixels. When at least one whole device pixel per
 * internal pixel fits, the scale is floored to an integer so every internal
 * pixel is the same size (crisp). Smaller viewports fall back to a fractional
 * scale so the whole screen stays visible.
 *
 * @param viewportWidth  Viewport width in CSS pixels.
 * @param viewportHeight  Viewport height in CSS pixels.
 * @param [width]  Internal width.
 * @param [height]  Internal height.
 */
export function fitLetterbox(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number = 1,
  width: number = SCREEN_WIDTH,
  height: number = SCREEN_HEIGHT,
): Letterbox {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const fit = Math.min((viewportWidth * dpr) / width, (viewportHeight * dpr) / height);
  const scale = fit >= 1 ? Math.floor(fit) : Math.max(fit, 0);
  return {
    scale,
    cssWidth: (width * scale) / dpr,
    cssHeight: (height * scale) / dpr,
  };
}

/**
 * Fill the whole viewport: the internal resolution is stretched to 100% of
 * its width and height, so there are no black bars (pixels may be a little
 * wider than tall, or the other way round). Used in full-screen mode.
 *
 * @param viewportWidth  CSS pixels.
 * @param viewportHeight  CSS pixels.
 * @returns  `scale` is the smaller of the two axes' scales, in CSS pixels.
 */
export function fitFill(viewportWidth: number, viewportHeight: number, width = SCREEN_WIDTH, height = SCREEN_HEIGHT): Letterbox {
  const w = Math.max(0, viewportWidth);
  const h = Math.max(0, viewportHeight);
  return { scale: Math.min(w / width, h / height), cssWidth: w, cssHeight: h };
}
