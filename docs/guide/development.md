# Development

[Back to README](../../README.md)

How to run, test and check Hexathlon locally. The code layout is in
[Architecture](architecture.md).

## Prerequisites

- [Node.js](https://nodejs.org/) 26 LTS. The exact version is in `.nvmrc`
  (26.13.1); run `nvm use` if you use nvm. `package.json` requires
  `^26.13.0`.
- [pnpm](https://pnpm.io/) 12. Run `corepack enable` and the version pinned in
  `package.json` (`pnpm@12.23.0`) is used.

The game itself needs no tooling: it is plain files served as they are.
`package.json` exists only for development. Its dev dependencies are
TypeScript (type checking), http-server (the local server) and `@types/node`.

## Getting started

```sh
pnpm install
pnpm start
```

Then open <http://localhost:8080>.

## Scripts

| Script | Runs | What it does |
|---|---|---|
| `pnpm start` | `node build.ts && http-server dist -p 8080 -c-1` | Builds the minified site into `dist/` and serves it at <http://localhost:8080> with caching disabled: the same files GitHub Pages serves |
| `pnpm build` | `node build.ts` | Builds the minified site into `dist/` (see [Building](#building)) |
| `pnpm typecheck` | `tsc --noEmit -p .` | Type-checks all the TypeScript |
| `pnpm release` | `semantic-release` | Run by CI on pushes to `main` only: versions and tags a release (see [Releases](deployment.md#releases)) |
| `pnpm test` | `node --test` | Runs every `test/*.test.ts` suite, including the replay harness |
| `pnpm compare` | `node calibration/compare.ts` | Prints the replay harness diff report on its own, and fails if any trace is out of tolerance |
| `pnpm icons` | `node tools/make-icons.ts` | Regenerates the app icons in `icons/` from their code-defined art |
| `pnpm sprites` | `node tools/sprite-sheet.ts` | Redraws the style guide's review images in `docs/style-guide/` |
| `pnpm attract` | `node tools/make-attract-traces.ts` | Regenerates the Attract Mode demos in `data/attract/`; run it after changing `data/events.json` |
| `pnpm size` | `node tools/size-check.ts` | Checks the download is under 2 MB and loads in under 2 s (estimated) |
| `pnpm perf` | `node tools/perf-check.ts` | Times the load and the 100m's frame rate in headless Chrome (local only; set `CHROME` to choose the browser) |
| `pnpm screenshots` | `node tools/screenshots.ts` | Plays the game in headless Chrome and saves the README and docs screenshots (`docs/screenshots/`) and the social card (`images/social-card.png`); name shots to take only those. Local only; set `CHROME` to choose the browser |
| `pnpm capture:plans` | `node calibration/capture/plans.ts` | Writes the MAME capture plans (`calibration/capture/plans.lua`, not committed) and makes the `calibration/captures/issue-<n>/` results folders; see [Calibration and parity](calibration-and-parity.md#capturing-with-mame) |
| `pnpm capture:check` | `node calibration/capture/check.ts` | Checks the capture results saved in `calibration/captures/issue-<n>/` before committing them |
| `pnpm compare:strict` | `node calibration/compare.ts --strict` | Parity sign-off: like `pnpm compare`, but also fails if an Event has no captured traces |

## Showing the frame rate

Add `?fps` to the URL, for example <http://localhost:8080/?fps>, to show the
frame rate and the slowest frame. Use it to check the 60 FPS target on a real
device.

`pnpm perf` measures the same in headless Chrome: the load over a throttled
10 Mbit/s connection, then the 100m at full CPU speed and with the CPU slowed
4x to stand in for a mid-range phone.

## Testing on a phone

Serve the game with `pnpm start` and open it from the phone using your
computer's local network address. The service worker only registers over
HTTPS or on `localhost`, so offline play won't work over a plain local
network address, but everything else does.

## TypeScript

All the code is TypeScript, type-checked by `tsc --noEmit` in strict mode
([ADR-0006](../architectural-decision-record/0006-typescript-with-a-minified-build.md),
which supersedes ADR-0003). `tsconfig.json` covers `src/`, `calibration/`,
`test/`, `tools/`, `sw.ts` and `build.ts`.

Only erasable syntax is allowed (`erasableSyntaxOnly`: no enums, namespaces
or parameter properties), and relative imports name the `.ts` file, so Node
runs the tests, tools and calibration scripts straight from the sources
(`node --test`, `node tools/size-check.ts`) with no compile step.

## Building

`pnpm build` (`build.ts`, using esbuild) writes the playable site to `dist/`:

- `js/main.js`: every module and the JSON data it imports, bundled and
  minified into one script (of `package.json` only the version is included);
- `sw.js`: the service worker, minified, with its precache list generated
  from what the built page loads and its `VERSION` from `SW_VERSION`
  (`dev` when unset);
- `index.html` and `css/style.css`, minified;
- the icons, manifest, social card and Attract Mode traces, copied.

`pnpm start` serves that folder, and the deploy job publishes it, so what you
play locally is exactly what is deployed. `dist/` is not committed.

## Tests

`pnpm test` runs Node's built-in test runner over `test/`. No browser is
needed: the simulation is pure and deterministic, and the renderers draw
through a small fake canvas (`test/helpers/fakes.ts`).

| Suite | Covers |
|---|---|
| `sim.test.ts` | The speed meter, 100m Dash, the Rival, shared field rules, Long Jump, Javelin Throw and Hammer Throw |
| `session.test.ts` | 110m Hurdles, High Jump, Standards and Cycle scaling, Points, Sessions and the Arcade flow, difficulty, settings and full screen |
| `replay.test.ts` | The replay harness, the parity gate over every committed Input Trace, and a check that the simulation has no DOM dependencies |
| `calibration-format.test.ts` | The Input Trace and Reference Mark schemas, the validator and every committed calibration file |
| `loop.test.ts` | The fixed-step clock and simulation determinism |
| `scenes.test.ts` | The scene manager, game flow, menus, Settings, Practice, pause, High Scores, Attract Mode, Controls, Key Test and the title theme |
| `accessibility.test.ts` | Every menu works from the keyboard alone; reduced flash |
| `input.test.ts` | Default key bindings, the keyboard handler, the input queue, menu keys, remapping and raw keys |
| `touch.test.ts` | Touch layout and pointer tracking |
| `gamepad.test.ts` | Gamepad polling and pad remapping |
| `storage.test.ts` | Storage keys, the in-memory fallback, corrupted data, settings, controls, Personal Bests and High Scores |
| `event-render.test.ts` | Every Event renderer, Mark display, field Attempts and the Attract Mode demos |
| `art.test.ts` | Sprites, the style guide rules and the scenery |
| `style-guide.test.ts` | Colour-vision simulation and the colour-blind-safe palette |
| `font.test.ts` | The pixel font |
| `display.test.ts` | Letterbox scaling |
| `audio.test.ts` | Audio unlock, synth voices, volume and mute, songs and the theme |
| `pwa.test.ts` | The web app manifest and the service worker, including that `ASSETS` lists every runtime file |
| `budget.test.ts` | The size and load budget, and the FPS meter |
| `naming.test.ts` | The original-name guard ([ADR-0001](../architectural-decision-record/)) |

Run one suite with `node --test test/sim.test.ts`.

## Adding a runtime file

Modules and the JSON they import are bundled into `js/main.js`, so they need
nothing extra. A file the game loads some other way (linked from
`index.html` or the manifest, or fetched at run time) must be copied into
`dist/` by `build.ts` (`STATIC`); the service worker's precache list is then
generated from the built page. `pnpm test` builds the site and fails if a
file the page loads is missing from it. Use relative paths only, so the game
works under a subpath.

## Changing game data

The Event parameters, Standards, Points and difficulty factors are JSON in
`data/`, so tuning never touches game code. After changing
`data/events.json`, run `pnpm attract` so the Attract Mode demos still play
sensibly, then `pnpm test`. Measured values must follow the
[calibration protocol](../../calibration/PROTOCOL.md); see
[Calibration and parity](calibration-and-parity.md).

## Size budget

`pnpm size` builds the site and adds up the service worker and every file in
its precache list, which is exactly what a first visit downloads:

- the total must be under **2 MB**;
- the estimated load time must be under **2 seconds**. The estimate is the
  gzipped size at 10 Mbit/s plus three 50 ms round trips (the page, then its
  stylesheet and bundled script, then the data it fetches). It is an estimate; check the real figure in the
  browser before a release.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

1. Check out, set up pnpm and Node (from `.nvmrc`), and run
   `pnpm install --frozen-lockfile`.
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm size`

A newer run on the same branch cancels the older one. The deploy job is
described in [Deployment](deployment.md).

## Conventions

- Use the [glossary](../../GLOSSARY.md) terms (Session, Cycle, Event,
  Attempt, Mark, Standard, Points) in code, comments and docs.
- Never use the original game's name in any public-facing identifier
  ([ADR-0001](../architectural-decision-record/));
  `test/naming.test.ts` guards it.
- All art, sound and music is original and made in code. Add a row to
  [CREDITS.md](../../CREDITS.md) before merging anything that uses
  third-party work.
- New art follows the [style guide](../style-guide.md).
