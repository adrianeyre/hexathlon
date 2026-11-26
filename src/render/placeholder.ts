import { PLACEHOLDER_DISTANCE } from '../sim/placeholder.ts';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './display.ts';
import { PALETTE } from './palette.ts';
import { drawText } from './text.ts';

/**
 * Draw the placeholder Event from its sim state. Reads the state only.
 */
export function renderPlaceholder(ctx: CanvasRenderingContext2D, state: import('../sim/placeholder.ts').PlaceholderState) {
  ctx.fillStyle = PALETTE.field;
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  const left = 40;
  const right = SCREEN_WIDTH - 40;
  const trackY = SCREEN_HEIGHT / 2;
  ctx.fillStyle = PALETTE.track;
  ctx.fillRect(left - 8, trackY - 12, right - left + 16, 24);
  ctx.fillStyle = PALETTE.text;
  ctx.fillRect(right, trackY - 12, 2, 24);
  const x = left + (Math.min(state.x, PLACEHOLDER_DISTANCE) / PLACEHOLDER_DISTANCE) * (right - left);
  ctx.fillStyle = PALETTE.runner;
  ctx.fillRect(Math.round(x) - 3, trackY - 6, 6, 12);
  drawText(ctx, 'PLACEHOLDER EVENT', SCREEN_WIDTH / 2, 24, { scale: 1 });
  drawText(ctx, 'ALTERNATE RUN KEYS', SCREEN_WIDTH / 2, SCREEN_HEIGHT - 24, { color: '#d8f0dd' });
  drawText(ctx, `${(state.frame / 60).toFixed(2)}`, 8, 12, { align: 'left' });
}
