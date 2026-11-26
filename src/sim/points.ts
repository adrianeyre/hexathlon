/**
 * Points: what a Mark earns in its Event (GLOSSARY). A linear conversion per
 * Event from `data/points.json`: Points = (Mark - zero) x perUnit, rounded,
 * never below zero. Times use a negative perUnit, so faster earns more.
 * No Mark (a foul, a false start, a failed High Jump) earns nothing. Pure.
 */

export interface PointsRule {
  /** The Mark, in sim units, that earns no Points. */
  zero: number;
  /** Points per sim unit beyond `zero`. */
  perUnit: number;
}

export function pointsFor(mark: import('./types.ts').PlayerMark | null | undefined, rule: PointsRule): number {
  if (!mark || mark.outcome !== 'valid' || mark.value === null) return 0;
  return Math.max(0, Math.round((mark.value - rule.zero) * rule.perUnit));
}
