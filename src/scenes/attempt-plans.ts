/**
 * How a go at an Event is split into Attempts, for the event scene. The
 * three-Attempt field series and a single Attempt share one plan; the High
 * Jump's bar progression (rising heights, Attempts per height) has its own.
 * Each plan is pure: series are plain data.
 */

import { formatMark } from '../render/marks.ts';
import { bestMark, createSeries, nextAttempt, recordAttempt, seriesOver } from '../sim/field.ts';
import { barSeriesMark, createBarSeries, recordJump } from '../sim/high-jump.ts';
import { SIM_PARAMS } from '../sim/registry.ts';
import { describeMark } from '../render/marks.ts';

export type PlayerMark = import('../sim/types.ts').PlayerMark;
export type EventId = import('../sim/types.ts').EventId;

export interface AttemptPlan {
  /** A fresh series; `limit` is the Attempts allowed (field series only). */
  create: (limit: number) => any;
  record: (series: any, mark: PlayerMark | null) => any;
  over: (series: any) => boolean;
  /** What the next Attempt starts with. */
  next: (series: any) => { attempt: number, barHeight?: number };
  /** The Event's Mark so far. */
  best: (series: any) => PlayerMark | null;
  /** Whether the go was a single Attempt (its raw result is the Event's). */
  single: (series: any) => boolean;
  /** The two lines shown between Attempts. */
  between: (series: any, eventId: EventId | null) => [string, string];
  /** The line saying what the series' next Attempt is (the second line of `between`). */
  upcoming: (series: any) => string;
  /** What the results screen lists. */
  extra: (series: any) => Partial<import('../sim/types.ts').EventResult>;
}

export const SERIES_PLAN: AttemptPlan = Object.freeze({
  create: (limit: number) => createSeries(limit),
  record: recordAttempt,
  over: seriesOver,
  next: (series) => ({ attempt: nextAttempt(series) }),
  best: bestMark,
  single: (series) => series.limit <= 1,
  between: (series, eventId) => [`ATTEMPT ${series.marks.length}: ${describeMark(series.marks[series.marks.length - 1], eventId)}`, SERIES_PLAN.upcoming(series)],
  upcoming: (series) => `NEXT: ATTEMPT ${nextAttempt(series)} OF ${series.limit}`,
  extra: (series) => ({ attempts: series.marks }),
} satisfies AttemptPlan);

/** The High Jump's rising bar, from `data/events.json`. */
export const BAR_PLAN: AttemptPlan = Object.freeze({
  create: () => createBarSeries(SIM_PARAMS.highJump),
  record: (series, mark) => recordJump(series, mark, SIM_PARAMS.highJump),
  over: (series) => series.over,
  next: (series) => ({ attempt: series.failures + 1, barHeight: series.height }),
  best: barSeriesMark,
  single: () => false,
  between: (series) => {
    const last = series.marks[series.marks.length - 1];
    const height = series.heights[series.heights.length - 1];
    return [`${formatMark(height, 'pixels', 'highJump')}: ${last?.outcome === 'valid' ? 'CLEARED' : 'FAILED'}`, BAR_PLAN.upcoming(series)];
  },
  upcoming: (series) => `NEXT: ${formatMark(series.height, 'pixels', 'highJump')} ATTEMPT ${series.failures + 1} OF ${SIM_PARAMS.highJump.attemptsPerHeight}`,
  extra: (series) => ({ attempts: series.marks, heights: series.heights }),
} satisfies AttemptPlan);

/**
 * The plan for an Event.
 */
export function planFor(eventId: EventId | null): AttemptPlan {
  return eventId === 'highJump' ? BAR_PLAN : SERIES_PLAN;
}
