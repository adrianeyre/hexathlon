/**
 * Interface colours, as data. Scenes refer to these names rather than hex
 * values so the style guide can retune them in one place.
 *
 * Meaning is never carried by hue alone: the cursor, disabled items and
 * warnings also differ in shape, text or brightness.
 */
export const PALETTE = Object.freeze({
  background: '#10162f',
  panel: '#1f2a52',
  text: '#ffffff',
  dim: '#8a93b8',
  disabled: '#4f5878',
  highlight: '#ffd23f',
  accent: '#3fb8ff',
  warning: '#ff8a3d',
  overlay: 'rgba(8, 10, 24, 0.78)',
  field: '#1d5c3a',
  track: '#b5543a',
  runner: '#ffd23f',
});
