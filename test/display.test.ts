import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCREEN_HEIGHT, SCREEN_WIDTH, fitLetterbox } from '../src/render/display.ts';

describe('fitLetterbox', () => {
  it('keeps the aspect ratio for any viewport', () => {
    for (const [w, h, dpr] of [
      [360, 640, 3],
      [640, 360, 3],
      [1366, 768, 1],
      [3840, 2160, 1],
      [1920, 1080, 2],
      [300, 200, 1],
    ]) {
      const box = fitLetterbox(w, h, dpr);
      assert.ok(
        Math.abs(box.cssWidth / box.cssHeight - SCREEN_WIDTH / SCREEN_HEIGHT) < 1e-9,
        `aspect ratio at ${w}x${h}@${dpr}`,
      );
      assert.ok(box.cssWidth <= w + 1e-9, `fits width at ${w}x${h}@${dpr}`);
      assert.ok(box.cssHeight <= h + 1e-9, `fits height at ${w}x${h}@${dpr}`);
    }
  });

  it('uses whole device pixels per internal pixel when it can', () => {
    assert.equal(fitLetterbox(1366, 768, 1).scale, 3);
    assert.equal(fitLetterbox(3840, 2160, 1).scale, 9);
    assert.equal(fitLetterbox(360, 640, 3).scale, 3);
  });

  it('never overflows a 360px-wide portrait phone', () => {
    const box = fitLetterbox(360, 740, 1);
    assert.ok(box.cssWidth <= 360);
  });

  it('falls back to a fractional scale on tiny viewports', () => {
    const box = fitLetterbox(160, 120, 1);
    assert.equal(box.scale, 0.5);
    assert.equal(box.cssWidth, 160);
  });
});
