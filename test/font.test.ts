import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ADVANCE, GLYPHS, GLYPH_HEIGHT, GLYPH_WIDTH, MISSING, glyphRuns, textWidth } from '../src/render/font.ts';
import { drawText } from '../src/render/text.ts';
import { fakeCtx } from './helpers/fakes.ts';

describe('pixel font', () => {
  it('defines every glyph as 7 rows of 5 pixels', () => {
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      assert.equal(rows.length, GLYPH_HEIGHT, `${ch} height`);
      for (const row of rows) assert.match(row, /^[#.]{5}$/, `${ch} row`);
    }
  });

  it('covers capitals, digits and the punctuation the game uses', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;!?-+=_/\'"()[]<>%#*') {
      assert.ok(GLYPHS[ch], `missing ${JSON.stringify(ch)}`);
    }
  });

  it('has every character in the on-screen text of the scenes', () => {
    const dir = new URL('../src/', import.meta.url);
    const sources = ['scenes', 'render']
      .flatMap((sub) => readdirSync(new URL(`${sub}/`, dir)).map((f) => new URL(`${sub}/${f}`, dir)))
      .map((url) => readFileSync(url, 'utf8'));
    // Quoted strings that look like on-screen text: capitals, digits, spaces and punctuation.
    const texts = sources.flatMap((src) => [...src.matchAll(/'([A-Z0-9][A-Z0-9 .,:!?\-/%*()\\u25A-F0-9]*)'/g)].map((m) => m[1]));
    const chars = new Set(texts.join('').replace(/\\u25(B2|BC|C0|B6)/g, ''));
    for (const ch of chars) assert.ok(GLYPHS[ch] || GLYPHS[ch.toUpperCase()], `no glyph for ${JSON.stringify(ch)}`);
  });

  it('draws lowercase as capitals and unknown characters as a box', () => {
    assert.equal(glyphRuns('a'), glyphRuns('A'));
    assert.equal(glyphRuns('é'), glyphRuns(MISSING));
  });

  it('measures text', () => {
    assert.equal(textWidth(''), 0);
    assert.equal(textWidth('A'), GLYPH_WIDTH);
    assert.equal(textWidth('AB', 2), (2 * ADVANCE - 1) * 2);
  });

  it('draws whole pixels, aligned and scaled', () => {
    const ctx = fakeCtx();
    drawText((ctx as any), 'I', 100.4, 50.6, { scale: 2, align: 'left' });
    for (const rect of ctx.rects) for (const n of rect) assert.ok(Number.isInteger(n));
    // "I" is three runs wide at the top: .###.
    assert.deepEqual(ctx.rects[0], [100 + 2, 51 - 7, 6, 2]);
    const centred = fakeCtx();
    drawText((centred as any), 'I', 100, 50);
    assert.equal(Math.min(...centred.rects.map((r) => r[0])), Math.round(100 - GLYPH_WIDTH / 2) + 1);
  });

  it('is small: well under a few kilobytes of source', () => {
    const size = readFileSync(new URL('../src/render/font.ts', import.meta.url)).length;
    assert.ok(size < 12_000, `${size} bytes`);
  });
});
