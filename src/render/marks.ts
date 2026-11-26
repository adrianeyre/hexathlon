/**
 * Converting Marks from sim units to display text. This is the only place
 * frames become seconds and pixels become metres (ADR-0004). The metres per
 * pixel of each field Event come from `data/events.json` (`display`), and
 * are provisional until the Points and Mark display calibration (#21) lands,
 * along with the original's exact rounding and format.
 */

import EVENTS from '../../data/events.json' with { type: 'json' };

export type EventId = import('../sim/types.ts').EventId;

/**
 * Metres per sim pixel for an Event, if known.
 */
export function metresPerPixel(eventId: EventId | null | undefined): number | null {
  if (!eventId) return null;
  const display = (((EVENTS)[eventId] ?? {}) as { display?: { metresPerPixel?: number } }).display;
  return typeof display?.metresPerPixel === 'number' ? display.metresPerPixel : null;
}

/**
 * @param value  Sim units.
 * @param [eventId]  Needed to show distances in metres.
 */
export function formatMark(value: number | null, unit: import('../sim/types.ts').MarkUnit, eventId: EventId | null = null): string {
  if (value === null) return '-';
  if (unit === 'frames') return `${(value / 60).toFixed(2)} SEC`;
  const scale = metresPerPixel(eventId);
  if (scale !== null) return `${(value * scale).toFixed(2)} M`;
  return `${Math.round(value)} PX`;
}

/**
 * A Mark or the reason there isn't one.
 */
export function describeMark(mark: import('../sim/types.ts').PlayerMark | null | undefined, eventId: EventId | null = null) {
  if (!mark) return '-';
  if (mark.outcome === 'valid' && mark.value !== null) return formatMark(mark.value, mark.unit, eventId);
  return { foul: 'FOUL', falseStart: 'FALSE START', failed: 'NO MARK', valid: '-' }[mark.outcome];
}
