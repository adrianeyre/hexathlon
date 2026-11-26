# Calibration and parity

[Back to README](../../README.md)

## The goal

Hexathlon aims to play like the classic arcade athletics games of this genre:
the same Events in the same order, the same button-mashing speed mechanic and
the same rules and progression, so a player who knows the original finds the
feel, timing and difficulty indistinguishable. Everything you see and hear is
original work.

That is
[ADR-0002](../architectural-decision-record/0002-measured-mechanical-parity-original-presentation.md):
the mechanics (speed gain and decay, foul lines, angle windows, hurdle
timing, height progression, Standards and Cycle scaling) are **measured**
frame by frame from a legally owned copy of the original, not tuned by
playtesting. Only measured numbers are stored in the repository, never
captured assets.

## Where things stand

Not measured yet. `data/events.json`, `data/standards.json` and
`data/points.json` are marked `"provisional": true`. Their values make every
Event playable but are not parity targets. `calibration/traces/` and
`calibration/reference/` hold no captured data yet, so the parity gate in
`pnpm test` has nothing to compare.

When a measured value lands in `calibration/notes/`, it replaces the matching
provisional value in `data/`, and the replay harness checks it against the
Reference Marks.

## Tolerances

A Mark counts as matching when it is within:

| Quantity | Tolerance |
|---|---|
| Times | ±0.05 s (±3 frames at 60 Hz in the harness) |
| Distances and heights | ±1% of the Reference Mark |
| Timing windows | ±1 frame |
| Standards | exact |

## The capture protocol

[`calibration/PROTOCOL.md`](../../calibration/PROTOCOL.md) is the full
procedure. In short:

- **Ground rules.** Only a copy you legally own. Only numbers are committed:
  never footage, screenshots, audio, ROMs, savestates, input recordings or
  memory dumps. Measure, never trace. Never guess a value.
- **Units.** Frames and the original's native pixels, matching the
  simulation ([ADR-0004](../architectural-decision-record/0004-sim-in-original-pixels-and-frames.md)).
- **Frame zero** is the first frame on which the Event accepts input, so
  traces line up.
- **Controlled inputs.** Scripted mash rates, alternation patterns, hold
  times and one-frame timing sweeps, each run at least twice.
- **Files.** Each Attempt gives an Input Trace in
  `calibration/traces/<event>/<slug>.json` and a Reference Mark in
  `calibration/reference/<event>/<slug>.json`. Derived parameters and open
  questions go in `calibration/notes/<topic>.md`.

The formats are JSON Schemas in `calibration/schema/`, with synthetic
examples in `calibration/examples/`.

## Capturing with MAME

[`calibration/capture/`](../../calibration/capture/README.md) does the
playing for you. `pnpm capture:plans` writes `calibration/capture/plans.lua`,
every test the issues need (generated, so not committed). `capture.lua` then
runs inside MAME from a savestate at frame zero of each Event, plays each
test frame by frame with an overlay saying what it is testing, and asks in
the terminal what the game showed. It saves each test's Input Trace and
answers to `calibration/captures/issue-<n>/`, which is committed;
`pnpm capture:check` checks them first, and `pnpm test` checks every
committed folder. All of this
runs outside the game, from the terminal and MAME.

## Calibration notes

One note per topic, each a template waiting for measured values:

| Note | Topic |
|---|---|
| [sprint.md](../../calibration/notes/sprint.md) | 100m Dash |
| [long-jump.md](../../calibration/notes/long-jump.md) | Long Jump |
| [javelin.md](../../calibration/notes/javelin.md) | Javelin Throw |
| [hurdles.md](../../calibration/notes/hurdles.md) | 110m Hurdles |
| [hammer.md](../../calibration/notes/hammer.md) | Hammer Throw |
| [high-jump.md](../../calibration/notes/high-jump.md) | High Jump |
| [rival.md](../../calibration/notes/rival.md) | Rival pace and behaviour |
| [standards.md](../../calibration/notes/standards.md) | Standards and Cycle scaling |
| [points-and-display.md](../../calibration/notes/points-and-display.md) | Points conversion and Mark display |
| [two-player.md](../../calibration/notes/two-player.md) | Two-player structure |

## The replay harness

`calibration/harness.ts` runs an Input Trace through the pure Event
simulation for exactly the trace's number of frames and compares the
resulting Mark with the Reference Mark, within the tolerances above. It has
no DOM, so it runs in Node.

- `pnpm test` runs it through `test/replay.test.ts`: every committed trace
  is replayed, and CI fails if any is out of tolerance. Traces for an Event
  with no simulation are skipped, and synthetic traces are never treated as
  parity targets.
- `pnpm compare` prints the diff report on its own (`calibration/compare.ts`)
  and exits non-zero on a failure.
- `pnpm test` also validates every file in `traces/` and `reference/`
  against the schemas, and checks that each trace has a matching Reference
  Mark.

The harness only ever runs at Normal difficulty
([ADR-0005](../architectural-decision-record/0005-difficulty-levels-scale-normal.md)).

## Attract Mode uses the same format

Attract Mode replays Input Traces through the same simulations. The demos
in `data/attract/` are synthetic, generated by `pnpm attract` from the
current `data/events.json`. Captured traces can be added to the playlist in
`data/attract.json` as they land.
