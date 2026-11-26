/**
 * Standards: the Mark a player must reach in an Event to qualify, per Cycle
 * (GLOSSARY). The values come from `data/standards.json`; Cycles beyond the
 * listed ones move by a fixed step per Cycle up to a limit. Times (frames)
 * qualify at or under the Standard, distances and heights (pixels) at or over.
 * Pure.
 */

export type EventId = import('./types.ts').EventId;
export type MarkUnit = import('./types.ts').MarkUnit;
export type PlayerMark = import('./types.ts').PlayerMark;

export interface EventStandards {
  unit: MarkUnit;
  /** Cycle 1 first, in sim units. */
  cycles: number[];
  /** Added per Cycle past the last listed one (negative for times). */
  beyondStep: number;
  /** The Standard never moves past this. */
  limit: number;
}

export interface StandardsData {
  /** After a field Mark reaches the Standard: end the Event, or play the remaining Attempts. */
  remainingAttempts: 'skip' | 'play';
  events: Record<EventId, EventStandards>;
}

export interface Standard {
  /** Sim units. */
  value: number;
  unit: MarkUnit;
}

/**
 * The Standard for an Event and Cycle, scaled for the difficulty
 * (`standardScale` above 1 is tougher: shorter times, longer distances).
 * @param cycle  1-based.
 */
export function standardFor(data: EventStandards, cycle: number, standardScale: number = 1): Standard {
  const n = Math.max(1, Math.floor(cycle));
  const listed = data.cycles;
  let value = n <= listed.length ? listed[n - 1] : listed[listed.length - 1] + data.beyondStep * (n - listed.length);
  value = data.unit === 'frames' ? Math.max(data.limit, value) : Math.min(data.limit, value);
  if (standardScale !== 1) value = data.unit === 'frames' ? value / standardScale : value * standardScale;
  return { value: Math.round(value), unit: data.unit };
}

/**
 * Whether a Mark reaches a Standard.
 */
export function meetsStandard(mark: PlayerMark | null | undefined, standard: Standard) {
  if (!mark || mark.outcome !== 'valid' || mark.value === null) return false;
  return standard.unit === 'frames' ? mark.value <= standard.value : mark.value >= standard.value;
}
