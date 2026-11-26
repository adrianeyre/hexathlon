# Calibration notes

One file per capture topic. Each starts as a template listing what to measure,
with every value blank. Fill them in while capturing by following
[`../PROTOCOL.md`](../PROTOCOL.md); never enter an estimate.

| File | Topic | Issue |
|---|---|---|
| [sprint.md](sprint.md) | 100m Dash | #13 |
| [long-jump.md](long-jump.md) | Long Jump | #14 |
| [javelin.md](javelin.md) | Javelin Throw | #15 |
| [hurdles.md](hurdles.md) | 110m Hurdles | #16 |
| [hammer.md](hammer.md) | Hammer Throw | #17 |
| [high-jump.md](high-jump.md) | High Jump | #18 |
| [rival.md](rival.md) | Rival pace and behaviour | #19 |
| [standards.md](standards.md) | Standards and Cycle scaling | #20 |
| [points-and-display.md](points-and-display.md) | Points conversion and Mark display | #21 |
| [two-player.md](two-player.md) | Two-player structure | #22 |

Until a topic is captured, the game runs on provisional values in
[`../../data/events.json`](../../data/events.json) and the other files in
[`../../data/`](../../data/) (each marked `"provisional": true`; the two-player
structure is in [`two-player.json`](../../data/two-player.json)).
Those are for playability only: never copy one into these notes. When a
measured value lands here, replace the matching value in `data/events.json`
and the replay harness checks it against the Reference Marks.
