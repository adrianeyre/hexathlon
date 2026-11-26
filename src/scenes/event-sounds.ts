/**
 * Sound effects for each Event, played from what changed in one sim step.
 * Pure functions of (previous state, next state, input) plus the Sounds to
 * play them on, so the scene tests can check them with a recording fake.
 */

import { simParamsFor } from '../sim/registry.ts';

export type FrameInput = import('../sim/types.ts').FrameInput;

/** Frames into the start sequence when the starter calls "Get set" (halfway to the gun, when the athletes rise). */
const GET_SET_FRAME = Math.floor(simParamsFor('normal').sprint.startSignalFrame / 2);
export type Sounds = import('../audio.ts').Sounds;

/** The starter's calls interrupt the announcer, so they keep time with the start sequence. */
const START_CALL = Object.freeze({ interrupt: true });

/**
 * Footsteps for this frame's run presses.
 */
function footsteps(input: FrameInput, sounds: Sounds) {
  for (const edge of input.edges) {
    if (edge.player === 1 && edge.type === 'press' && (edge.action === 'RUN_A' || edge.action === 'RUN_B')) {
      sounds.footstep(edge.action === 'RUN_A');
    }
  }
}

export function sprintSounds(prev: import('../sim/sprint.ts').SprintState, next: import('../sim/sprint.ts').SprintState, input: FrameInput, sounds: Sounds) {
  // The starter: "On your marks" as the start sequence begins (again after a false start), "Get set" as the athletes rise, then the gun.
  // Each call cuts off anything still being said (the Event's name), so it is heard on its cue, before the gun and the Rival's start.
  if (next.phase === 'set' && prev.setFrame === 0 && next.setFrame === 1) sounds.say('onYourMarks', START_CALL);
  if (next.phase === 'set' && prev.setFrame < GET_SET_FRAME && next.setFrame >= GET_SET_FRAME) sounds.say('getSet', START_CALL);
  if (prev.phase === 'set' && next.phase === 'race') {
    sounds.quiet();
    sounds.pistol();
  }
  if (next.falseStarts > prev.falseStarts) {
    sounds.foul();
    sounds.say('falseStart', START_CALL);
  }
  if (prev.phase === 'race') footsteps(input, sounds);
  const excitement = next.phase === 'done' ? 1 : next.phase === 'race' ? 0.2 + next.meter.value / 15 : 0.1;
  sounds.crowd(Math.min(1, excitement));
  if (prev.finishFrame === null && next.finishFrame !== null) sounds.finish();
}

/**
 * Shared by the field Events: footsteps (or the spin) while mashing, a cheer
 * for a valid landing, the buzzer and the call of "Foul" for a foul.
 */
export function fieldSounds(prev: { phase: string; outcome: 'valid' | 'foul' | null; meter: { value: number; }; }, next: { phase: string; outcome: 'valid' | 'foul' | null; meter: { value: number; }; }, input: FrameInput, sounds: Sounds) {
  if (next.outcome === null) footsteps(input, sounds);
  if (prev.outcome === null && next.outcome === 'valid') sounds.finish();
  if (prev.outcome === null && next.outcome === 'foul') {
    sounds.foul();
    sounds.say('foul');
  }
  const excitement = next.outcome === 'valid' ? 1 : next.outcome === 'foul' ? 0.1 : 0.2 + next.meter.value / 15;
  sounds.crowd(Math.min(1, excitement));
}

/**
 * The 110m Hurdles: the 100m's sounds, plus a clatter for each hurdle hit.
 */
export function hurdlesSounds(prev: import('../sim/hurdles.ts').HurdlesState, next: import('../sim/hurdles.ts').HurdlesState, input: FrameInput, sounds: Sounds) {
  sprintSounds((prev as any), (next as any), input, sounds);
  if (next.hit.slice(prev.hit.length).some(Boolean)) sounds.thud();
}

/**
 * The High Jump: footsteps on the Run-up, a cheer for a clearance, a clatter
 * and the buzzer when the bar comes down.
 */
export function highJumpSounds(prev: import('../sim/high-jump.ts').HighJumpState, next: import('../sim/high-jump.ts').HighJumpState, input: FrameInput, sounds: Sounds) {
  if (next.phase === 'runup') footsteps(input, sounds);
  if (prev.overBar === null && next.overBar === false) sounds.thud();
  if (prev.outcome === null && next.outcome === 'valid') sounds.finish();
  if (prev.outcome === null && next.outcome === 'failed') {
    sounds.foul();
    sounds.say('failed');
  }
  const excitement = next.outcome === 'valid' ? 1 : next.outcome === 'failed' ? 0.1 : 0.2 + next.meter.value / 15;
  sounds.crowd(Math.min(1, excitement));
}
