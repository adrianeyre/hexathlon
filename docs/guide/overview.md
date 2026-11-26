# Overview

[Back to README](../../README.md)

Hexathlon is an arcade-style athletics game for the browser. You mash two
keys in turn to build speed, then time your jumps and throws, across six
Events played in a fixed order:

1. 100m Dash
2. Long Jump
3. Javelin Throw
4. 110m Hurdles
5. Hammer Throw
6. High Jump

Reach the Standard in every Event and the next Cycle starts, with tougher
Standards. Miss one and the Session is over. Every Mark earns Points, and the
Session total goes into the High Score table.

The terms in capitals (Session, Cycle, Event, Attempt, Mark, Standard,
Points and so on) are defined in the [glossary](../../GLOSSARY.md).

## Features

- **Six Events**, each with its own rules: a race against the Rival in the
  100m Dash and 110m Hurdles, three Attempts in the Long Jump, Javelin Throw
  and Hammer Throw, and a rising bar in the High Jump. See
  [Events](events.md).
- **Arcade Sessions** with Standards per Cycle, Points per Mark and a
  ten-row High Score table with three-letter initials. See
  [How to play](how-to-play.md).
- **Practice** for any single Event, with unlimited Attempts and no
  Standards.
- **Personal Bests** per Event, kept in every mode.
- **Attract Mode**: left idle, the title shows the High Score table and then
  replays a demo of each Event.
- **Difficulty**: Easy, Normal (the default) or Hard.
- **Keyboard, touch and gamepad** controls, with remapping and a Key Test
  screen for keyboard ghosting. See [Controls](controls.md).
- **Accessibility**: a Reduced Flash setting, menus that work from the
  keyboard alone, a palette checked for colour blindness, and touch targets
  of at least 64 pixels. See [Accessibility](accessibility.md).
- **Full Screen** mode that fills 100% of the screen.
- **Installable and offline**: a Progressive Web App with a service worker.
  See [Installing and offline play](installing-and-offline.md).
- **Original presentation**: every sprite, the font, the theme, the intro
  fanfare and every sound effect are made for Hexathlon, drawn or
  synthesised in code. See [CREDITS.md](../../CREDITS.md) and the
  [style guide](../style-guide.md).
- **No cookies, no ads, no tracking.** Settings, controls, Personal Bests and
  High Scores stay in the browser's local storage. See
  [Settings](settings.md#what-is-stored).

## Status

Early development. All six Events are playable, and Arcade is a full
Session.

The aim is measured mechanical parity with the classic arcade games of this
genre ([ADR-0002](../architectural-decision-record/0002-measured-mechanical-parity-original-presentation.md)).
The numbers in `data/events.json`, `data/standards.json` and
`data/points.json` are **provisional**: each file says `"provisional": true`.
They make the game playable but have not been measured from the original
yet, so parity is still open until the reference data is captured. See
[Calibration and parity](calibration-and-parity.md).

Two players can play a Session on one keyboard: side by side in the races,
taking turns in the field Events, each with their own Points (see
[Two Player](how-to-play.md#two-player)). Its rules in
`data/two-player.json` are provisional too.

## Technology in brief

- Plain HTML, JavaScript ES modules and Canvas 2D. No framework, no
  bundler and no build step
  ([ADR-0003](../architectural-decision-record/0003-jsdoc-checkjs-no-build.md)).
- JSDoc types, checked by `tsc --checkJs --noEmit`.
- A fixed 60 Hz simulation that works in the original's pixels and frames
  ([ADR-0004](../architectural-decision-record/0004-sim-in-original-pixels-and-frames.md)),
  drawn on a 320x240 canvas that is scaled to fit the screen.
- Procedural Web Audio: no sound files.
- Code-defined pixel art and a code-defined 5x7 pixel font: no image or font
  files are loaded by the game itself (the app icons are the only images).
- No backend. The deployed site is just the files in the repository;
  `package.json` exists only for development tooling.
- An installable PWA (`manifest.webmanifest`, `sw.ts`) that plays offline.
- A download budget of 2 MB, checked in CI.

More detail is in [Architecture](architecture.md) and
[Development](development.md).
