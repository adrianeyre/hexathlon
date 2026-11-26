/**
 * The announcer: speaks the callouts in `data/callouts.json` ("On your
 * marks", "Get set", "Foul", the Event names and so on) with the browser's
 * built-in speech synthesis. Nothing is recorded or sampled, so this keeps to
 * the rule that all audio is generated (PRD 7.5).
 *
 * It follows the game's mute and volume, and the ANNOUNCER setting turns it
 * off. Where the browser has no speech synthesis it says nothing.
 */

import CALLOUTS from '../data/callouts.json' with { type: 'json' };

export type CalloutId = keyof typeof CALLOUTS.phrases;

/** The phrase for each callout. */
export const PHRASES: Readonly<Record<CalloutId, string>> = Object.freeze({ ...CALLOUTS.phrases });

export const isCallout = (id: unknown): id is CalloutId => typeof id === 'string' && Object.hasOwn(PHRASES, id);

/** The parts of the Web Speech API the announcer uses, so tests can supply a fake. */
export interface SynthLike {
  speak: (utterance: any) => void;
  cancel: () => void;
}

/**
 * @param getSynth  The speech synthesiser, or null where there is none.
 */
export function createVoice(getSynth: () => SynthLike | null, makeUtterance: (text: string) => { volume: number; rate: number; pitch: number; lang: string; }) {
  let enabled = true;
  let muted = false;
  let volume = 0.8;
  /** Utterances handed to the synthesiser that haven't finished. */
  const queued: Set<{ volume: number; }> = new Set();

  const api = {
    setEnabled(value: boolean) {
      enabled = value;
      if (!enabled) api.cancel();
    },
    setMuted(value: boolean) {
      muted = value;
      if (muted) api.cancel();
    },
    /** @param value  0 to 1. */
    setVolume(value: number) {
      volume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
    },

    /**
     * Say a callout, after anything already being said, or at once with
     * `interrupt` (the starter's calls must land on their cue, not wait
     * behind a long Event name).
     * @returns Whether it was spoken.
     */
    say(id: CalloutId, { interrupt = false }: { interrupt?: boolean; } = {}): boolean {
      if (!enabled || muted || volume === 0 || !isCallout(id)) return false;
      if (interrupt) api.cancel();
      let synth;
      try {
        synth = getSynth();
      } catch {
        synth = null;
      }
      if (!synth) return false;
      try {
        const u = makeUtterance(PHRASES[id]);
        u.volume = volume;
        u.rate = CALLOUTS.rate;
        u.pitch = CALLOUTS.pitch;
        u.lang = 'en-GB';
        queued.add(u);
        const forget = () => queued.delete(u);
        (u as any).onend = forget;
        (u as any).onerror = forget;
        synth.speak(u);
        return true;
      } catch {
        return false;
      }
    },

    /**
     * Stop speaking now and drop anything queued (pausing, quitting, closing
     * the page, muting). Each queued utterance is also silenced, because
     * some browsers let a queued phrase start after `cancel()`.
     */
    cancel() {
      for (const u of queued) u.volume = 0;
      queued.clear();
      try {
        getSynth()?.cancel();
      } catch {
        /* nothing to stop */
      }
    },
  };
  return api;
}

export type Voice = ReturnType<typeof createVoice>;

/** The browser's announcer. */
export const voice = createVoice(
  () => ((globalThis.speechSynthesis ?? null) as SynthLike | null),
  (text) => {
    const Ctor = (globalThis as any).SpeechSynthesisUtterance;
    if (!Ctor) throw new Error('no speech');
    return new Ctor(text);
  },
);
