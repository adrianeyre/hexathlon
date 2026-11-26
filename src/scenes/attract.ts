import { traceToFrameInputs } from '../../calibration/types.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../render/display.ts';
import { PALETTE } from '../render/palette.ts';
import { drawText } from '../render/text.ts';
import { anyPress } from './manager.ts';

/** Frames to linger on an Event after its Attempt ends, before the next one. */
export const ATTRACT_HOLD_FRAMES = 90;

/**
 * Attract Mode: replays recorded Input Traces through the Event simulations
 * and renderers, one Event after another, then returns to the title. It plays
 * silently and ignores the players' run and action input: any press or tap
 * goes straight back to the title screen.
 */
export function createAttractScene(manager: import('./manager.ts').SceneChanger, services: import('./services.ts').Services): import('./manager.ts').Scene & { readonly reel: number; readonly state: unknown; } {
  let reel = 0;
  let state: any = null;
  let frames: import('../sim/types.ts').FrameInput[] = [];
  let frame = 0;
  let hold = 0;
  let clock = 0;

  const load = (i: number) => {
    const { trace, entry } = services.attract[i];
    const sim = (entry.sim as NonNullable<typeof entry.sim>);
    reel = i;
    state = sim.init({ cycle: trace.cycle, players: trace.players, attempt: trace.attempt ?? 1, ...(trace.barHeight === undefined ? {} : { barHeight: trace.barHeight }) });
    frames = traceToFrameInputs(trace);
    frame = 0;
    hold = 0;
  };

  return {
    get reel() {
      return reel;
    },
    get state() {
      return state;
    },

    enter() {
      clock = 0;
      services.sounds.stopMusic(); // Attract Mode plays silently.
      if (services.attract.length === 0) {
        manager.change('title');
        return;
      }
      load(0);
    },

    step(input) {
      clock += 1;
      if (anyPress(input)) {
        manager.change('title');
        return;
      }
      const { entry } = services.attract[reel];
      const sim = (entry.sim as NonNullable<typeof entry.sim>);
      const finished = sim.getResult(state) !== null || frame >= frames.length;
      if (!finished) {
        state = sim.step(state, frames[frame]);
        frame += 1;
        return;
      }
      hold += 1;
      if (hold < ATTRACT_HOLD_FRAMES) return;
      if (reel + 1 < services.attract.length) load(reel + 1);
      else manager.change('title');
    },

    render(ctx) {
      if (!state) return;
      // Once the Attempt is over, the frames since (the sim's settle count plus the hold) animate the athlete's reaction.
      const after = hold > 0 ? (state.settle ?? 0) + hold : null;
      services.attract[reel].entry.render(ctx, state, { reducedFlash: services.settings.get().reducedFlash, after });
      ctx.fillStyle = PALETTE.overlay;
      ctx.fillRect(0, SCREEN_HEIGHT - 40, SCREEN_WIDTH, 28);
      drawText(ctx, services.attract[reel].entry.name, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 32, { color: PALETTE.dim });
      if (services.settings.get().reducedFlash || clock % 60 < 40) {
        drawText(ctx, 'PRESS START', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 20, { color: PALETTE.highlight });
      }
    },
  };
}

/** The playlist file: Input Trace paths, relative to the site root. */
export type AttractPlaylist = { traces: string[] };

/**
 * Load the Attract Mode playlist and its Input Traces. Traces that fail to load
 * are skipped; Events not built yet are replayed by the placeholder.
 */
export async function loadAttractReels(fetchJson: (path: string) => Promise<unknown>, catalogue: import('./catalogue.ts').Catalogue, playlist: string = 'data/attract.json'): Promise<import('./services.ts').AttractReel[]> {
  const reels: import('./services.ts').AttractReel[] = [];
  let list;
  try {
    list = ((await fetchJson(playlist)) as AttractPlaylist);
  } catch {
    return reels;
  }
  const paths = Array.isArray(list?.traces) ? list.traces.filter((p) => typeof p === 'string') : [];
  const traces = await Promise.all(paths.map((p) => fetchJson(p).catch(() => null)));
  for (const raw of traces) {
    const trace = (raw as import('../../calibration/types.ts').InputTrace | null);
    if (!trace || typeof trace !== 'object' || !Array.isArray(trace.inputs) || typeof trace.event !== 'string') continue;
    reels.push({ trace, entry: catalogue.playableFor(trace.event) });
  }
  return reels;
}
