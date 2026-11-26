# Rival pace and behaviour

> **Status: not captured yet.** Every value below is blank until it has been
> measured from the original by following [`../PROTOCOL.md`](../PROTOCOL.md).
> Never fill a cell with an estimate: leave it blank and add an open question.

Tracking issue: #19. How the Rival runs in the 100m Dash and 110m Hurdles, per Cycle. Rival positions go in each Reference Mark as the `rivalX` measurement (one value per frame).

| Captured by | Date | Tool and version | Original's refresh rate (Hz) |
|---|---|---|---|
| | | | |

## Acceptance checklist

- [ ] Rival position per frame recorded for each running Event and at least Cycles 1–3
- [ ] Notes on any reaction to the player (catch-up, fixed pace, randomness)
- [ ] If randomness exists, its distribution is characterised
- [ ] Data committed, no assets

## Measured parameters

| Parameter | Value | Unit | Derived from (trace ids) | Notes |
|---|---|---|---|---|
| 100m: Rival finish frame, Cycle 1 | | frames | | |
| 100m: Rival finish frame, Cycle 2 | | frames | | |
| 100m: Rival finish frame, Cycle 3 | | frames | | |
| Hurdles: Rival finish frame, Cycle 1 | | frames | | |
| Hurdles: Rival finish frame, Cycle 2 | | frames | | |
| Hurdles: Rival finish frame, Cycle 3 | | frames | | |
| Does the Rival react to the player? How? | | - | | |
| Run-to-run variation (same input, repeated) | | frames | | |

## Capture plan

Planned Input Traces (`calibration/traces/sprint/<slug>.json`) with a
matching Reference Mark each. Tick a row when both files are committed.

| Done | Slug | What it isolates |
|---|---|---|
| [ ] | `c1-idle` | Player does nothing: Rival alone, Cycle 1 |
| [ ] | `c2-idle` | Same, Cycle 2 |
| [ ] | `c3-idle` | Same, Cycle 3 |
| [ ] | `c1-alternate-max` | Player at maximum speed, to see if the Rival reacts |
| [ ] | `c1-idle-repeat-N` | Repeat the idle run N times to measure randomness |

Repeat the same plan for `hurdles/`.

## Findings

_Observations that aren't a single number: rules, edge cases, surprises._

## Open questions

_Anything that couldn't be measured yet, and why._
