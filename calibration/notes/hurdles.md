# 110m Hurdles

> **Status: not captured yet.** Every value below is blank until it has been
> measured from the original by following [`../PROTOCOL.md`](../PROTOCOL.md).
> Never fill a cell with an estimate: leave it blank and add an open question.

Tracking issue: #16. Mash plus ACTION to clear each hurdle, raced against the Rival; the Mark is a time in frames.

| Captured by | Date | Tool and version | Original's refresh rate (Hz) |
|---|---|---|---|
| | | | |

## Acceptance checklist

- [ ] Input Traces committed under `calibration/traces/` in the agreed format
- [ ] Reference Marks committed under `calibration/reference/`
- [ ] Controlled inputs cover slow, typical and maximum mash rates
- [ ] Includes clean clears, early/late jumps and hurdle collisions
- [ ] Measured parameter values recorded in calibration notes (this file)
- [ ] No copyrighted assets committed

## Measured parameters

| Parameter | Value | Unit | Derived from (trace ids) | Notes |
|---|---|---|---|---|
| Speed gain per valid alternation | | meterUnits | | |
| Same-key repeat gain | | meterUnits | | |
| Speed decay per frame without presses | | meterUnits/frame | | |
| Maximum speed | | meterUnits | | |
| Speed to velocity mapping | | pixels/frame per meterUnit | | |
| Race distance | | pixels | | |
| Number of hurdles | | count | | |
| Position of each hurdle | | pixels | | |
| Clear window (earliest and latest jump frame relative to the hurdle) | | frames | | |
| Jump duration | | frames | | |
| Collision speed penalty | | meterUnits | | |
| Recovery after a collision | | - | | |
| False-start rule | | - | | |

## Capture plan

Planned Input Traces (`calibration/traces/hurdles/<slug>.json`) with a
matching Reference Mark each. Tick a row when both files are committed.

| Done | Slug | What it isolates |
|---|---|---|
| [ ] | `c1-alternate-4hz` | Slow strict alternation (press every 15 frames) |
| [ ] | `c1-alternate-8hz` | Typical strict alternation (every 7–8 frames) |
| [ ] | `c1-alternate-max` | Maximum strict alternation (every 2 frames, and every frame if accepted) |
| [ ] | `c1-same-key-8hz` | One key only, to measure same-key repeat behaviour |
| [ ] | `c1-uneven-alternate` | Long-short alternation, to see how uneven mashing counts |
| [ ] | `c1-jump-window-sweep-hNN-fNN` | Move the jump at hurdle NN one frame at a time across the window |
| [ ] | `c1-collide-every-hurdle` | Never press ACTION |
| [ ] | `c1-jump-early` | Jump a few frames too early |
| [ ] | `c1-jump-late` | Jump a few frames too late |

## Findings

_Observations that aren't a single number: rules, edge cases, surprises._

## Open questions

_Anything that couldn't be measured yet, and why._
