# High Jump

> **Status: not captured yet.** Every value below is blank until it has been
> measured from the original by following [`../PROTOCOL.md`](../PROTOCOL.md).
> Never fill a cell with an estimate: leave it blank and add an open question.

Tracking issue: #18. Run-up, take-off timing and angle, rising bar heights; the Mark is a height in pixels.

| Captured by | Date | Tool and version | Original's refresh rate (Hz) |
|---|---|---|---|
| | | | |

## Acceptance checklist

- [ ] Input Traces committed under `calibration/traces/` in the agreed format
- [ ] Reference Marks committed under `calibration/reference/`
- [ ] Controlled inputs cover slow, typical and maximum mash rates
- [ ] Includes bar progression, Attempts per height and failed Attempts
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
| Starting bar height | | pixels | | |
| Bar height increments | | pixels | | |
| Attempts per height | | count | | |
| Take-off window | | frames | | |
| Angle rise rate while ACTION is held | | angle units/frame | | |
| Clearance rule (what knocks the bar) | | - | | |
| When the Event ends | | - | | |

## Capture plan

Planned Input Traces (`calibration/traces/highJump/<slug>.json`) with a
matching Reference Mark each. Tick a row when both files are committed.

| Done | Slug | What it isolates |
|---|---|---|
| [ ] | `c1-alternate-4hz` | Slow strict alternation (press every 15 frames) |
| [ ] | `c1-alternate-8hz` | Typical strict alternation (every 7–8 frames) |
| [ ] | `c1-alternate-max` | Maximum strict alternation (every 2 frames, and every frame if accepted) |
| [ ] | `c1-same-key-8hz` | One key only, to measure same-key repeat behaviour |
| [ ] | `c1-uneven-alternate` | Long-short alternation, to see how uneven mashing counts |
| [ ] | `c1-hNNN-clear` | A clean clear at height NNN |
| [ ] | `c1-hNNN-fail-early` | Take off too early at height NNN |
| [ ] | `c1-hNNN-fail-angle` | Bad angle at height NNN |
| [ ] | `c1-three-fails` | Three failures at one height, to see the end of the Event |

## Findings

_Observations that aren't a single number: rules, edge cases, surprises._

## Open questions

_Anything that couldn't be measured yet, and why._
