/**
 * The HUD every field Event shows: speed bar, Attempt counter, angle
 * indicator, and once the Attempt is decided, the Mark or the foul.
 */

import { describeMark } from './marks.ts';
import { drawAngle, drawAttempts, drawFoul, drawMessage, drawSpeedBar } from './hud.ts';

export interface FieldHudState {
  attempt: number;
  meter: import('../sim/speed.ts').Meter;
  hold: import('../sim/field.ts').AngleHold | null;
  outcome: 'valid' | 'foul' | null;
  mark: number | null;
}

/** Why a foul was called, in words. */
export const FOUL_REASONS = Object.freeze({
  overstep: 'OVER THE LINE',
  late: 'TOO LATE - OVER THE LINE',
  time: 'OUT OF TIME',
  cage: 'INTO THE CAGE',
});

/**
 * @param [options]  `showMark: false` holds back a valid Mark (the Long Jump waits for the measurer).
 */
export function drawFieldHud(ctx: Pick<CanvasRenderingContext2D, 'fillRect' | 'fillStyle'>, state: FieldHudState & { foul: keyof typeof FOUL_REASONS | null; }, params: { speed: import('../sim/speed.ts').SpeedParams; field: { attempts: number; }; angleWindow: { min: number; max: number; }; }, eventId: import('../sim/types.ts').EventId, speedLabel?: string, { showMark = true }: { showMark?: boolean; } = {}) {
  drawAttempts(ctx, state.attempt, params.field.attempts);
  drawSpeedBar(ctx, params.speed.max > 0 ? state.meter.value / params.speed.max : 0, speedLabel);
  drawAngle(ctx, state.hold ? state.hold.angle : null, params.angleWindow);
  if (state.outcome === 'foul') drawFoul(ctx, state.foul ? FOUL_REASONS[state.foul] : undefined);
  else if (state.outcome === 'valid' && showMark) {
    drawMessage(ctx, describeMark({ player: 1, outcome: 'valid', value: state.mark, unit: 'pixels' }, eventId));
  }
}
