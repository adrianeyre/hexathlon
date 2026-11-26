/**
 * The six Events, in the original's order.
 */
export const EVENT_IDS: readonly import('./types.ts').EventId[] = Object.freeze(['sprint', 'longJump', 'javelin', 'hurdles', 'hammer', 'highJump']);

/**
 * The running Events: a start sequence and a race, with the Rival in one-player
 * and both players side by side in two-player.
 */
export const RUNNING_EVENTS: readonly import('./types.ts').EventId[] = Object.freeze(['sprint', 'hurdles']);
