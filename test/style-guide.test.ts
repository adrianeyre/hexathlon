import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ART, KITS, MUST_DIFFER } from '../src/art/colours.ts';
import { PALETTE } from '../src/render/palette.ts';
import { VISIONS, contrastRatio, deltaE, simulate } from '../tools/colour-vision.ts';

/**
 * The style guide's colour rules (docs/style-guide.md, PRD 9): the palette
 * must stay readable for players with colour blindness.
 *
 * - Pairs that must differ do so by at least ΔE 20 (CIE76) for normal vision
 *   and for protanopia, deuteranopia and tritanopia.
 * - With no colour vision (achromatopsia) they still differ by ΔE 10 in
 *   brightness, unless the pair is also told apart by shape.
 * - Interface text is at least 4.5:1 against the backgrounds it sits on.
 */
const MIN_DELTA = 20;
const MIN_DELTA_ACHROMATIC = 10;

describe('colour-vision simulation', () => {
  it('leaves normal vision alone and greys out achromatopsia', () => {
    assert.deepEqual(simulate([12, 34, 56], 'normal'), [12, 34, 56]);
    const [r, g, b] = simulate([200, 30, 30], 'achromatopsia');
    assert.ok(r === g && g === b);
  });

  it('makes red and green hard to tell apart for red-green colour blindness', () => {
    const normal = deltaE('#d03030', '#30a030');
    assert.ok(deltaE('#d03030', '#30a030', 'deuteranopia') < normal / 2);
    assert.ok(deltaE('#d03030', '#30a030', 'protanopia') < normal / 2);
  });
});

describe('palette is colour-blind safe', () => {
  for (const [what, a, b, shapeBacked] of MUST_DIFFER) {
    it(`${what} stay distinct`, () => {
      for (const vision of VISIONS) {
        const min = vision === 'achromatopsia' ? (shapeBacked ? 0 : MIN_DELTA_ACHROMATIC) : MIN_DELTA;
        const d = deltaE(a, b, vision);
        assert.ok(d >= min, `${what}: ΔE ${d.toFixed(1)} with ${vision}, needs ${min}`);
      }
    });
  }

  it('checks every kit against the track it runs on', () => {
    const covered = new Set(MUST_DIFFER.filter(([, , b]) => b === ART.track).map(([, a]) => a));
    for (const kit of Object.values(KITS)) {
      assert.ok(covered.has(kit.s), 'vest');
      assert.ok(covered.has(kit.p), 'shorts');
    }
  });

  it('interface text is readable on its backgrounds', () => {
    for (const name of (['text', 'dim', 'highlight', 'accent', 'warning'] as const)) {
      for (const bg of (['background', 'panel'] as const)) {
        const ratio = contrastRatio(PALETTE[name], PALETTE[bg]);
        assert.ok(ratio >= 4.5, `${name} on ${bg}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  it('the selected menu item differs from the others for every colour vision except none at all', () => {
    // With achromatopsia the cursor arrows and the highlight bar carry it.
    for (const vision of VISIONS.filter((v) => v !== 'achromatopsia')) {
      assert.ok(deltaE(PALETTE.highlight, PALETTE.text, vision) >= MIN_DELTA, vision);
    }
  });
});
