# PRD: Hexathlon (Mechanically Faithful Arcade Athletics, Original Presentation)

**Name:** Hexathlon (an original name; see ADR-0001). The repo is renamed to `hexathlon` in M0.
**Author:** Adi
**Status:** Draft v0.4
**Date:** 2026-11-25

**Changelog**
- v0.4: Named the product Hexathlon.
- v0.3: Decisions from a design review. Replaced the working title with the codename `athletics`. The simulation works in the original's pixels and frames. Added the Rival, Points, Personal Best and High Score, Attract Mode, pnpm scripts for local development, CI with GitHub Actions, and JSDoc type checking. Dropped the stretch events. Two-player is keyboard only. Closed every open question except the final name. Uses the terms in `GLOSSARY.md`. Decisions are recorded in `docs/architectural-decision-record/`.
- v0.2: Reframed as a mechanically faithful replica. Added the Fidelity Specification (section 7), calibration plan, parity checklist and rules for original presentation.
- v0.1: Initial draft.

---

## 1. Overview

A browser-based athletics game that plays like the 1983 arcade original. It has the same Events in the same order, the same button-mashing speed mechanic, and the same rules and progression. A player who knows the original should find the feel, timing and difficulty indistinguishable. The presentation is entirely original work in a retro style: sprites, backgrounds, music, sound effects, title and branding.

It is built with plain HTML, JavaScript ES modules (type-checked with JSDoc) and Canvas. There is no backend, and it is deployed as static files on GitHub Pages.

Domain terms (Session, Cycle, Event, Attempt, Mark, Standard, Rival, Points, etc.) are defined in [`GLOSSARY.md`](../../GLOSSARY.md).

## 2. Goals

- **Mechanical parity:** the mechanics, rules, timing windows, Points and progression match the original by measurement (ADR-0002).
- **Original presentation:** none of the art, audio or naming derives from the original.
- Capture the arcade feel: fast, frantic, instantly understandable, with "one more go" replayability.
- Playable on desktop (keyboard) and mobile (touch) from a single URL.
- Free, low-maintenance hosting on GitHub Pages, deployed through CI.
- Small footprint: under 2 MB total transfer, loading in under 2 seconds on broadband.
- Event parameters are data-driven, so parity tuning never requires code changes.

## 3. Non-Goals

- Any look that imitates the original's sprites, stage art, palette, fonts, UI graphics, title screen, music or sound effects.
- Using Konami's name, logo, character designs or any associated marks, or the original game's title.
- Events that aren't in the original six.
- Online multiplayer, accounts or personal data collection (v1).
- Coins, credits or continues.
- Two-player on touch devices.
- Native app packaging.
- Licensed Olympic branding of any kind.

## 4. IP and Legal Constraints

- **Free to replicate:** game rules, Event order, control scheme, speed mechanics and Points, timing windows, and general UI layout conventions (speed bar, angle indicator, Attempt counter).
- **Must be original:** all art, animation frames, palette, music, sound effects, title, logo, character designs and screen compositions.
- **Never use:** "Track & Field", "Track and Field", "Hyper Olympic", "Konami" or associated marks in the public title, repo name, description, code identifiers, storage keys or marketing copy (ADR-0001).
- **Music:** no melodies from, or recognisable paraphrases of, copyrighted film or classical-arrangement pieces associated with arcade games of the era.
- **Reference material:** footage, ROMs or screenshots may be used privately to measure mechanics only. They must never be redistributed or committed, and never traced or sampled for assets. Use only a copy you legally own. Only measured numbers are stored in the repo.
- All assets are made in-house. Any third-party tooling or fonts must have their licences recorded in `CREDITS.md`.
- The repo stays private until the original-asset audit passes.

## 5. Target Users and Platforms

| Item | Target |
|---|---|
| Users | Retro-game fans, casual players, families (including kids) |
| Desktop browsers | Latest Chrome, Edge, Firefox, Safari |
| Mobile browsers | iOS Safari, Android Chrome (touch controls, single player) |
| Screen sizes | 360px wide up to 4K, letterboxed canvas with a fixed internal resolution |
| Input | Keyboard, touch, optional gamepad (stretch) |

## 6. Core Gameplay

### 6.1 Controls

| Action | Player 1 keys | Player 2 keys | Touch (single player) |
|---|---|---|---|
| Run (alternate) | `Z` / `X` | `,` / `.` | Two large on-screen buttons |
| Action (jump / throw) | `C` (hold to set angle, release to commit) | `/` | Third button on the right |
| Pause | `Esc` or `P` | `Esc` or `P` | Pause icon |
| Menu | Arrow keys + `Enter` | | Tap |

- The default keysets sit at opposite ends of the keyboard to reduce ghosting when four run keys and two action keys are held together.
- All keys can be remapped. The remap menu includes a ghosting test screen that shows which key combinations the keyboard actually registers.
- Two-player is keyboard only (and gamepad later). Touch supports one player.

### 6.2 Events (original arcade order)

| # | Event | Mechanic | Mark |
|---|---|---|---|
| 1 | 100m Dash | Mash only, raced against a Rival | Time |
| 2 | Long Jump | Mash on the Run-up, action before the foul line, hold sets take-off angle | Distance |
| 3 | Javelin Throw | Mash on the Run-up, hold sets release angle, release before the foul line | Distance |
| 4 | 110m Hurdles | Mash plus action to clear each hurdle, raced against a Rival, hitting a hurdle slows the runner | Time |
| 5 | Hammer Throw | Mash to spin up, release timing and angle decide distance | Distance |
| 6 | High Jump | Run-up, take-off timing and angle, rising bar heights | Height |

There are no stretch events. Every Event is held to the same parity standard, and events outside the original six would have no reference to measure against.

### 6.3 Modes

- **Arcade (primary):** a Session plays all six Events in order. Each Event has a Standard for the current Cycle, and failing to reach it ends the Session. After the final Event, a new Cycle starts with tougher Standards. Start begins a Session. There are no credits or continues.
- **Two-player:** follows the original's player structure, capped at two players. Running Events are raced side by side, with player 2 taking the Rival's lane. Field Events alternate Attempts.
- **Practice (single Event):** unlimited Attempts, no qualification.
- **Attract Mode:** when idle, the title screen cycles into a demo that replays recorded Input Traces.

### 6.4 Rules

The rules match the original by measurement (section 7). The following behaviours are calibrated, not designed:

- Fouls and the three-Attempt limit in field Events.
- Qualifying in field Events: what happens to the remaining Attempts once a Mark reaches the Standard.
- False starts in running Events.
- High Jump: bar progression and Attempts per height.
- Rival pace and behaviour.
- Converting a Mark into Points.

### 6.5 Scoring and Records

- Each Mark earns **Points** for its Event. A Session's Points are the sum across all of its Events.
- A **Personal Best** is the best Mark per Event and is stored locally.
- **High Scores** are Session Points totals, ranked in a table with three-letter arcade-style initials and stored locally.

## 7. Fidelity Specification

This section defines how parity is achieved and verified (ADR-0002). Parameter values are never guessed. Each one is measured against the original, then stored in the data files.

**Units:** the simulation works in the original's screen pixels for position and 60 Hz frames for time (ADR-0004). Metres and seconds appear only when a Mark is formatted for display. The renderer maps sim units to our own internal resolution.

### 7.1 Parameters to Calibrate

| Parameter | Description |
|---|---|
| Speed gain per valid alternation | Increment added to the speed meter per correct left/right press |
| Same-key repeat behaviour | Whether repeated presses of one key add speed, and how much |
| Speed decay rate | How fast speed drops off when mashing slows |
| Max speed per Event | Speed ceiling, including any Event-specific differences |
| Speed to velocity mapping | Conversion from meter value to sim velocity, and from that to race time |
| Run-up length and foul line position | Distance from start to the foul line per field Event |
| Take-off angle window | Angle range giving the best distance, and the penalty curve on either side |
| Angle rise rate | How fast the angle changes while the action button is held |
| Hurdle spacing and clear window | Distance between hurdles, and timing tolerance for a clean jump |
| Hurdle collision penalty | Speed lost on contact, and recovery behaviour |
| Hammer spin-up and release window | Spins required, release timing tolerance, effect of angle |
| High Jump height progression | Starting height, increments, Attempts per height |
| Foul, false-start and qualification rules | As listed in 6.4 |
| Rival pace and behaviour | Per Event and per Cycle |
| Standards | Mark required per Event, per Cycle |
| Difficulty scaling per Cycle | How Standards tighten on each Cycle |
| Points conversion | Mark to Points per Event |
| Mark display | Rounding and display format |
| Two-player structure | Turn order and lane allocation |

### 7.2 Calibration Method

1. Capture reference data from a legally owned copy of the original: record gameplay with known inputs, then frame-step it to extract timings and positions in pixels and frames.
2. Use controlled inputs where possible (steady mash rate, fixed hold times) so each variable can be isolated.
3. Store each Input Trace alongside its Reference Mark.
4. The replay harness feeds Input Traces into the simulation and compares the resulting Marks with the Reference Marks.
5. Iterate until every result is within tolerance (7.4).
6. Keep the traces, Reference Marks and notes in `/calibration/`. This is data only, with no copyrighted assets.

### 7.3 Parity Checklist

- [ ] Event order and count match the original
- [ ] Alternating-key detection behaves identically for rapid, uneven and single-key mashing
- [ ] Speed meter build-up and decay curves match
- [ ] 100m times land in the original's range for equivalent mash rates
- [ ] Foul line, false-start and three-Attempt rules match
- [ ] Angle mechanics and optimal window match for Long Jump, Javelin and Hammer
- [ ] Hurdle timing window and collision penalty match
- [ ] High Jump height progression and Attempt rules match
- [ ] Rival pace matches for every Event and Cycle
- [ ] Standards match for every Event and Cycle
- [ ] Difficulty scaling matches for Cycle two and beyond
- [ ] Points conversion matches
- [ ] Marks display in the original's format and rounding
- [ ] Two-player turn order and lane allocation match

### 7.4 Tolerances

- Race times: within ±0.05 s (±3 frames) of the Reference Mark for the same Input Trace.
- Field distances and heights: within ±1% of the Reference Mark for the same Input Trace.
- Timing windows (hurdles, take-off, release): within ±1 frame at 60 Hz.
- Standards and Points: exact match.

### 7.5 Original Presentation Rules

- A retro low-resolution pixel look is fine, but all sprites, backgrounds and animation are drawn in-house from scratch.
- The colour palette, athlete designs, stadium layout and crowd treatment must differ from the original.
- All audio is procedural Web Audio chiptune with original melodies only, and no samples. The start pistol, crowd and impact sounds are synthesised.
- Use our own typeface (an open-licensed pixel font, credited) and our own title screen.
- Functional HUD elements (speed bar, angle indicator, Attempt counter, timer) may use any style, since they are interface conventions, not protected artwork.

## 8. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | Title screen with "Press Start", which also unlocks audio via a user gesture | Must |
| F2 | 100m Dash fully playable end to end, including the Rival | Must |
| F3 | Keyboard controls with alternating-key detection | Must |
| F4 | Single-player touch controls with multi-touch (both run buttons and action held together) | Must |
| F5 | All parameters loaded from data files in `/data` | Must |
| F6 | Replay harness: feed Input Traces into Events, output Marks, and compare them with Reference Marks | Must |
| F7 | Personal Bests per Event, and a High Score table with three-letter initials, persisted in `localStorage` | Must |
| F8 | Pause / resume and return to menu | Must |
| F9 | Long Jump, Javelin, Hurdles, Hammer Throw, High Jump | Must |
| F10 | Arcade mode with Standards and Cycle scaling | Must |
| F11 | Local running: `pnpm start` serves the game, `pnpm typecheck` type-checks it, `pnpm test` runs the replay harness | Must |
| F12 | Two-player on keyboard, following the original's player structure | Should |
| F13 | Mute toggle and volume control, persisted | Should |
| F14 | Key remapping with a ghosting test screen, plus accessibility options | Should |
| F15 | Attract Mode replaying Input Traces on the title screen | Should |
| F16 | Gamepad support | Could |
| F17 | Installable PWA with offline play | Could |
| F18 | Online leaderboard | Could (post-v1) |

## 9. Non-Functional Requirements

- **Determinism:** the simulation runs on a fixed 60 Hz timestep in sim units (pixels and frames) and doesn't depend on the render rate, so the same Input Trace always produces the same Mark.
- **Performance:** a steady 60 FPS on mid-range mobile devices.
- **Input handling:** read inputs with timestamps from `keydown` and pointer events, ignore `event.repeat`, and process them inside the fixed-step loop so no mashes are dropped.
- **Accessibility:** colour-blind-safe palette, remappable controls, reduced-flash option, large touch targets (minimum 64px).
- **Compatibility:** works under a repository subpath. All asset paths are relative.
- **Privacy:** no analytics or tracking. Storage is local only, wrapped in try/catch.
- **Size budget:** total transfer under 2 MB.
- **Type safety:** all code passes `tsc --checkJs --noEmit` (ADR-0003).

## 10. Technical Approach

### 10.1 Stack

- **Runtime for tooling:** Node.js 26 LTS (26.13.1 at the time of writing), pinned in `.nvmrc` and `engines`.
- **Package manager:** pnpm 12 (12.23.0), pinned via the `packageManager` field. `package.json` is for development tooling only. The deployed site has no build step.
- **Rendering:** HTML5 Canvas 2D at a fixed low internal resolution, scaled with `image-rendering: pixelated`.
- **Language:** vanilla JavaScript ES modules with JSDoc types, type-checked by TypeScript 7 (7.0.2) `tsc --checkJs --noEmit`. There is no bundler.
- **Local server:** `http-server` 14 (14.1.1), a devDependency, with caching disabled.
- **Audio:** Web Audio API, all procedural.
- **Storage:** `localStorage`.
- **Testing:** Node's built-in test runner (`node --test`) drives the replay harness and parity comparison. No browser is needed, because the simulation is deterministic and separate from rendering.
- **Alternative considered:** TypeScript + Vite, or Phaser. Rejected to keep deployment free of a build step (ADR-0003).

Use the latest stable versions of every dependency and GitHub Action when they are added. The versions above were current on 2026-11-25.

### 10.2 Scripts

| Script | Command | Purpose |
|---|---|---|
| `pnpm start` | `http-server . -p 8080 -c-1` | Serve the game at `http://localhost:8080` |
| `pnpm typecheck` | `tsc --checkJs --noEmit -p .` | JSDoc type check |
| `pnpm test` | `node --test` | Replay harness and parity comparison |

### 10.3 Proposed Structure

```
/
├── index.html
├── package.json             # dev tooling only
├── pnpm-lock.yaml
├── .nvmrc
├── tsconfig.json            # checkJs, noEmit
├── css/style.css
├── src/
│   ├── main.js              # boot, game loop
│   ├── input.js             # keyboard / touch / gamepad abstraction
│   ├── audio.js             # procedural chiptune and sfx
│   ├── storage.js           # Personal Bests, High Scores, settings
│   ├── sim/                 # pure simulation, no DOM or canvas, sim units
│   │   ├── speed.js
│   │   ├── rival.js
│   │   ├── sprint.js
│   │   ├── longJump.js
│   │   ├── javelin.js
│   │   ├── hurdles.js
│   │   ├── hammer.js
│   │   └── highJump.js
│   ├── render/              # drawing for each Event, sim units to screen
│   └── scenes/              # title, attract, menu, event, results, high scores
├── data/
│   ├── events.json          # per-Event parameters
│   ├── standards.json       # Standards per Cycle
│   └── points.json          # Mark-to-Points conversion
├── calibration/
│   ├── traces/              # Input Traces
│   ├── reference/           # Reference Marks (data only)
│   └── compare.js           # replay harness and diff report
├── test/                    # node --test suites
├── assets/                  # in-house sprites and font
├── .github/workflows/ci.yml
├── GLOSSARY.md
├── docs/
│   ├── architectural-decision-record/
│   └── product-requirements-document/
├── CREDITS.md
├── LICENSE
└── README.md
```

### 10.4 Architecture Notes

- **Simulation separate from rendering:** the `sim/` modules are pure functions of state and input, so they run identically in the browser and in the Node harness.
- **Event interface:** each Event exposes `init`, `step(input)` and `getResult` for the simulation, with a matching renderer.
- **Input layer:** emits normalised actions (`RUN_A`, `RUN_B`, `ACTION`, `PAUSE`) per player, whatever the device.
- **Data-driven:** parameters, Standards and Points live in JSON, so parity tuning never touches game code.

## 11. Deployment

- **Hosting:** GitHub Pages, deployed by GitHub Actions (Pages source set to "GitHub Actions").
- **CI (from M0):** on every push and pull request, set up Node and pnpm, install dependencies, then run `pnpm typecheck` and `pnpm test`. The build fails if parity drifts outside tolerance.
- **Deploy job:** `actions/configure-pages`, `actions/upload-pages-artifact` and `actions/deploy-pages` run on `main` once CI passes. The deploy job is enabled only after the repo goes public, since Pages on private repos needs a paid plan.
- **Action versions (2026-11-25):** `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`.
- **Paths:** relative only, so the `/repo-name/` subpath works.
- **Caching:** version query strings to avoid stale assets.
- **Custom domain (optional):** a `CNAME` file plus DNS records.

## 12. Milestones

| Milestone | Scope | Outcome |
|---|---|---|
| M0: Skeleton | Rename repo to `hexathlon`, `package.json` with pnpm scripts, `tsconfig.json`, CI workflow, canvas, fixed-step loop, input abstraction | `pnpm start` shows "hello canvas" and CI is green |
| M1: Reference capture | Record Input Traces and Reference Marks for all six Events, the Rival and Points | Calibration dataset |
| M2: Sprint parity | 100m simulation with Rival, replay harness, first parity pass | 100m within tolerance |
| M3: Core polish | HUD, original art and audio for the sprint, touch controls, pause, Personal Bests | Shippable single Event |
| M4: Jump and throw Events | Long Jump, Javelin, Hammer with angle and foul logic, parity pass | Four Events within tolerance |
| M5: Hurdles and High Jump | Hurdle timing, High Jump progression, parity pass | Six Events within tolerance |
| M6: Arcade mode | Standards, Cycle scaling, Points, High Score table with initials, Attract Mode | Full game loop |
| M7: Extras and release | Two-player, key remapping with ghosting test, accessibility, parity checklist sign-off, original-asset audit | Public-ready v1.0: repo made public, deploy job enabled |
| M8+: Stretch | Gamepad, PWA, optional online leaderboard | Post-v1 roadmap |

## 13. Success Criteria

- Every item on the parity checklist (7.3) is ticked, with results within the tolerances (7.4).
- Players familiar with the original report that the feel matches.
- The replay harness reproduces the Reference Marks from Input Traces in CI.
- Mash detection never drops legitimate alternating inputs at up to roughly 12 presses per second.
- 60 FPS on a mid-range phone and a typical laptop.
- The game loads and plays correctly from the GitHub Pages subpath on desktop and mobile.
- The public build contains no Konami-owned assets, marks or the original's title, confirmed by an asset audit before release.

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The original's exact values are hard to measure accurately | High | Controlled Input Traces, frame-stepping, measurement in native pixels and frames, iterative harness comparison |
| Parity feels different even when the numbers match | High | Side-by-side playtests with people who know the original, input latency testing |
| Browser input latency or key ghosting changes how mashing feels | High | Fixed-step input sampling, separated default keysets, ghosting test screen, remapping, real-device testing |
| Mobile multi-touch quirks | High | Single player only on touch, pointer events with per-pointer tracking, testing on real iOS and Android devices |
| IP complaint or takedown | Medium | Original name, in-house art, procedural audio, distinct visual style, private repo until audit, provenance in `CREDITS.md` |
| Legality of reference material | Medium | Use only legally owned copies, and keep only measured numbers in the repo |
| Asset size bloat | Low | Sprite atlases, procedural audio, size check before release |

## 15. Open Questions

None.

Resolved in v0.4: the name (Hexathlon). Resolved in v0.3: the reference capture method (frame-stepping a legally owned copy), the tolerance policy (7.4), the visual theme (original retro pixel art), the art source (in-house), music (procedural chiptune), repo visibility (private until audit), and the language (JS with JSDoc, ADR-0003).

## 16. Next Steps

1. Rename the private repo to `hexathlon` and set up M0: pnpm scripts, `tsconfig.json`, CI workflow, and the fixed-step loop.
2. Record the first set of 100m Input Traces and Reference Marks, including the Rival (M1).
3. Build the deterministic sprint simulation and replay harness, then run the first parity comparison (M2).
