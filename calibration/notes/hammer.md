# Hammer Throw

> **Status: not captured yet.** Every value below is blank until it has been
> measured from the original by following [`../PROTOCOL.md`](../PROTOCOL.md).
> Never fill a cell with an estimate: leave it blank and add an open question.

Tracking issue: #17. Mash to spin up; release timing and angle decide the distance (in pixels).

| Captured by | Date | Tool and version | Original's refresh rate (Hz) |
|---|---|---|---|
| | | | |

## Acceptance checklist

- [ ] Input Traces committed under `calibration/traces/` in the agreed format
- [ ] Reference Marks committed under `calibration/reference/`
- [ ] Controlled inputs cover slow, typical and maximum mash rates
- [ ] Includes spin-up rates, release timings and angles, and fouls
- [ ] Measured parameter values recorded in calibration notes (this file)
- [ ] No copyrighted assets committed

## Measured parameters

| Parameter | Value | Unit | Derived from (trace ids) | Notes |
|---|---|---|---|---|
| Spin speed gain per valid press | | units | | |
| Spin speed decay | | units/frame | | |
| Maximum spin speed | | units | | |
| Spins required before release counts | | count | | |
| Release window (frames within a spin) | | frames | | |
| Angle rise rate while ACTION is held | | angle units/frame | | |
| Optimal angle window | | angle units | | |
| Sector / foul rule | | - | | |
| Attempts per Event | | count | | |

## Capture plan

Planned Input Traces (`calibration/traces/hammer/<slug>.json`) with a
matching Reference Mark each. Tick a row when both files are committed.

| Done | Slug | What it isolates |
|---|---|---|
| [ ] | `c1-alternate-4hz` | Slow strict alternation (press every 15 frames) |
| [ ] | `c1-alternate-8hz` | Typical strict alternation (every 7–8 frames) |
| [ ] | `c1-alternate-max` | Maximum strict alternation (every 2 frames, and every frame if accepted) |
| [ ] | `c1-same-key-8hz` | One key only, to measure same-key repeat behaviour |
| [ ] | `c1-uneven-alternate` | Long-short alternation, to see how uneven mashing counts |
| [ ] | `c1-release-sweep-fNN` | Same spin-up, release moved one frame at a time |
| [ ] | `c1-angle-sweep-hold-NNf` | One trace per hold length |
| [ ] | `c1-foul-release-out-of-sector` | Release at a bad point in the spin |

## Findings

_Observations that aren't a single number: rules, edge cases, surprises._

## Open questions

_Anything that couldn't be measured yet, and why._
