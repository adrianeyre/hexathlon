/**
 * The Events the menus can offer, each pairing a pure simulation with its
 * renderer and sound hooks. An Event without a simulation is listed but not
 * playable yet. The placeholder Event stands in until the real ones exist.
 */

import { renderPlaceholder } from '../render/placeholder.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { renderHammer } from '../render/hammer.ts';
import { renderHighJump } from '../render/high-jump.ts';
import { renderHurdles, renderHurdlesDuo } from '../render/hurdles.ts';
import { renderJavelin } from '../render/javelin.ts';
import { renderLongJump } from '../render/long-jump.ts';
import { renderSprint, renderSprintDuo } from '../render/sprint.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { EVENT_IDS } from '../sim/events.ts';
import { placeholderSim } from '../sim/placeholder.ts';
import { EVENT_ATTEMPTS, EVENT_SIMS, simFor } from '../sim/registry.ts';
import { fieldSounds, highJumpSounds, hurdlesSounds, sprintSounds } from './event-sounds.ts';

export type EventId = import('../sim/types.ts').EventId;
export type FrameInput = import('../sim/types.ts').FrameInput;

export interface EventEntry {
  /** The EventId, or 'placeholder'. */
  id: string;
  /** On-screen name. */
  name: string;
  /** Null for the placeholder, which has no Personal Best. */
  eventId: EventId | null;
  /** Null until the Event is built. Plays at Normal difficulty. */
  sim: import('../sim/types.ts').EventSim<any> | null;
  /** The same Event at a difficulty level; missing for test stand-ins, which play `sim` at every level. */
  simAt?: (difficulty: import('../sim/difficulty.ts').Difficulty) => import('../sim/types.ts').EventSim<any>;
  /** Reads sim state; never mutates it. */
  render: EventRenderer;
  /** Running Events: draws a two-player race (`createDuoRace` state). */
  renderDuo?: EventRenderer;
  /** Plays sound effects for what changed during one step. */
  sounds?: EventSounds;
  /** Attempts in one go at the Event in Arcade (three in the field Events). */
  attempts: number;
}

export interface RenderOptions {
  reducedFlash?: boolean;
  difficulty?: import('../sim/difficulty.ts').Difficulty;
  /** Whose Attempt it is, for the athlete's kit. */
  player?: 1 | 2;
  /** Two-player races: each player's lane. */
  lanes?: { 1: number, 2: number };
  /** The Standard to reach (Arcade), for the athlete's reaction; null in Practice. */
  standard?: import('../sim/standards.ts').Standard | null;
  /** Frames since the Attempt was decided (for the reaction and the measurer); null while it runs. */
  after?: number | null;
  /** The running Events' status panel at the top of the screen. */
  stats?: RaceStats;
}

/** The lines the running Events show along the top of the screen. */
export interface RaceStats {
  /** The Session's Points (or "PRACTICE"). */
  points: string;
  /** The Standard as a time, in Arcade. */
  qualify: string | null;
  /** The Personal Best for the Event, if there is one. */
  best: string | null;
}
export type EventRenderer = (ctx: CanvasRenderingContext2D, state: any, options?: RenderOptions) => void;
export type EventSounds = (prev: any, next: any, input: FrameInput, sounds: import('../audio.ts').Sounds) => void;

/** The renderer of each built Event. */
export const EVENT_RENDERERS = Object.freeze(
  ({
    sprint: renderSprint,
    longJump: renderLongJump,
    javelin: renderJavelin,
    hurdles: renderHurdles,
    hammer: renderHammer,
    highJump: renderHighJump,
  } as Partial<Record<EventId, EventRenderer>>),
);

/** The two-player race renderer of each running Event. */
export const EVENT_DUO_RENDERERS = Object.freeze(
  ({
    sprint: renderSprintDuo,
    hurdles: renderHurdlesDuo,
  } as Partial<Record<EventId, EventRenderer>>),
);

/** The sound effects of each built Event. */
export const EVENT_SOUNDS = Object.freeze(
  ({
    sprint: sprintSounds,
    longJump: fieldSounds,
    javelin: fieldSounds,
    hurdles: hurdlesSounds,
    hammer: fieldSounds,
    highJump: highJumpSounds,
  } as Partial<Record<EventId, EventSounds>>),
);

/** On-screen Event names, in the original's order. */
export const EVENT_NAMES = Object.freeze(
  ({
    sprint: '100M DASH',
    longJump: 'LONG JUMP',
    javelin: 'JAVELIN THROW',
    hurdles: '110M HURDLES',
    hammer: 'HAMMER THROW',
    highJump: 'HIGH JUMP',
  } as Record<EventId, string>),
);

/**
 * Fallback drawing for an Event whose renderer hasn't been written yet.
 */
function renderUnstyled(ctx: CanvasRenderingContext2D, state: { frame?: number; }) {
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  drawText(ctx, 'NO RENDERER YET', SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
  if (typeof state.frame === 'number') drawText(ctx, `FRAME ${state.frame}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 16);
}

export const PLACEHOLDER_ENTRY: EventEntry = Object.freeze({
  id: 'placeholder',
  name: 'TEST EVENT',
  eventId: null,
  sim: placeholderSim,
  render: renderPlaceholder,
  attempts: 1,
  sounds(prev: import('../sim/placeholder.ts').PlaceholderState, next: import('../sim/placeholder.ts').PlaceholderState, input: FrameInput, sounds: import('../audio.ts').Sounds) {
    if (prev.frame === 0) sounds.pistol();
    if (next.finishFrame === null) {
      for (const edge of input.edges) {
        if (edge.player === 1 && edge.type === 'press' && (edge.action === 'RUN_A' || edge.action === 'RUN_B')) {
          sounds.footstep(edge.action === 'RUN_A');
        }
      }
    }
    sounds.crowd(next.finishFrame !== null ? 1 : Math.min(1, 0.2 + next.speed / 3));
    if (prev.finishFrame === null && next.finishFrame !== null) sounds.finish();
  },
});

/**
 * @param [renderers]  Missing ones fall back to a plain screen.
 */
export function createCatalogue(sims: Partial<Record<EventId, import('../sim/types.ts').EventSim<any>>> = EVENT_SIMS, renderers: Partial<Record<EventId, EventRenderer>> = {}, sounds: Partial<Record<EventId, EventSounds>> = {}) {
  const events: EventEntry[] = EVENT_IDS.map((id) => ({
    id,
    name: EVENT_NAMES[id],
    eventId: id,
    sim: sims[id] ?? null,
    // The real Events can be rebuilt at any difficulty; a stand-in sim can't.
    ...(sims[id] && sims[id] === EVENT_SIMS[id] ? { simAt: (d: import('../sim/difficulty.ts').Difficulty) => simFor(id, d) } : {}),
    render: renderers[id] ?? renderUnstyled,
    ...(renderers[id] && renderers[id] === EVENT_RENDERERS[id] && EVENT_DUO_RENDERERS[id] ? { renderDuo: EVENT_DUO_RENDERERS[id] } : {}),
    ...(sounds[id] ? { sounds: sounds[id] } : {}),
    attempts: EVENT_ATTEMPTS[id],
  }));
  const allBuilt = events.every((e) => e.sim);

  return {
    /** The six Events in order, playable or not. */
    events,

    /** Entries the practice picker lists: the six Events, then the placeholder while any is missing. */
    get practice() {
      return allBuilt ? events : [...events, PLACEHOLDER_ENTRY];
    },

    /** What Arcade plays: the first Event, or the placeholder until it is built. */
    get arcade() {
      return events[0].sim ? events[0] : PLACEHOLDER_ENTRY;
    },

    /**
     * The playable entry for an Event, with the placeholder standing in for one not built yet.
     * Used by Attract Mode, whose Input Traces are recorded per Event.
     */
    playableFor(id: EventId) {
      const entry = events.find((e) => e.id === id);
      return entry?.sim ? entry : PLACEHOLDER_ENTRY;
    },
  };
}

export type Catalogue = ReturnType<typeof createCatalogue>;
