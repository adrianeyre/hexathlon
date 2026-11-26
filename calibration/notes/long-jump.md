# Long Jump

> **Status: not captured yet.** Every value below is blank until it has been
> measured from the original by following [`../PROTOCOL.md`](../PROTOCOL.md).
> Never fill a cell with an estimate: leave it blank and add an open question.

Tracking issue: #14. Run-up mash, action before the foul line, hold to set take-off angle; the Mark is a distance in pixels.

| Captured by | Date | Tool and version | Original's refresh rate (Hz) |
|---|---|---|---|
| | | | |

## Acceptance checklist

- [ ] Input Traces committed under `calibration/traces/` in the agreed format
- [ ] Reference Marks committed under `calibration/reference/`
- [ ] Controlled inputs cover slow, typical and maximum mash rates
- [ ] Includes foul cases and a sweep of take-off angles
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
| Run-up length (start to foul line) | | pixels | | |
| Foul line position | | pixels | | |
| Angle rise rate while ACTION is held | | angle units/frame | | |
| Maximum angle / hold cap | | angle units | | |
| Optimal take-off angle window | | angle units | | |
| Distance penalty curve either side of the window | | - | | |
| Attempts per Event | | count | | |

## Capture plan

Planned Input Traces (`calibration/traces/longJump/<slug>.json`) with a
matching Reference Mark each. Tick a row when both files are committed.

| Done | Slug | What it isolates |
|---|---|---|
| [ ] | `c1-alternate-4hz` | Slow strict alternation (press every 15 frames) |
| [ ] | `c1-alternate-8hz` | Typical strict alternation (every 7–8 frames) |
| [ ] | `c1-alternate-max` | Maximum strict alternation (every 2 frames, and every frame if accepted) |
| [ ] | `c1-same-key-8hz` | One key only, to measure same-key repeat behaviour |
| [ ] | `c1-uneven-alternate` | Long-short alternation, to see how uneven mashing counts |
| [ ] | `c1-angle-sweep-hold-NNf` | One trace per hold length (replace NN with the hold in frames) |
| [ ] | `c1-foul-overstep` | Run past the foul line without pressing ACTION |
| [ ] | `c1-foul-late-action` | Press ACTION one frame after the line |

## Findings

_Observations that aren't a single number: rules, edge cases, surprises._

## Open questions

_Anything that couldn't be measured yet, and why._
