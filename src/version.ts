/**
 * The game's version, from `package.json`. semantic-release sets it on each
 * release from `main`, and the Settings screen shows it.
 */

import PACKAGE from '../package.json' with { type: 'json' };

/** The released version, e.g. "1.0.0". */
export const VERSION = PACKAGE.version;
