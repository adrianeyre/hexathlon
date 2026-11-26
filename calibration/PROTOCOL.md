# Capture protocol

How to measure the original arcade game so Hexathlon can match it (ADR-0002),
and what the measurements look like when they're committed. Read this before
starting any of the "Capture reference data" issues.

Terms (Input Trace, Reference Mark, Attempt, Mark, Standard, Cycle, Rival...)
are defined in [`GLOSSARY.md`](../GLOSSARY.md).

## 1. Ground rules

- **Only a copy you legally own.** Original hardware, an official re-release
  you bought, or an emulator running a ROM you dumped from a board you own.
  Never download ROMs.
- **Only numbers are committed.** Footage, screenshots, audio, ROM files,
  savestates, input-recording files (`.inp`) and memory dumps stay on your own
  machine, outside this repo, and are deleted when you're done with them.
- **Measure, don't trace.** Never trace, sample or copy any graphic or sound.
  Nothing you look at while measuring may be used as a reference for art.
- **Never guess a value.** If something can't be measured, write that down in
  the notes as an open question instead of making up a number.

## 2. Units

The simulation works in the original's units (ADR-0004), so captures do too:

| Quantity | Unit | Notes |
|---|---|---|
| Time | frames | One frame of the original's video output. Count frames; never convert to seconds when capturing. |
| Position, distance, height | pixels | The original's native screen pixels (not scaled, not our canvas). |
| Speed | pixels per frame | Or the raw speed-meter value, recorded as `meterUnits`. |
| Angle | whatever the original shows | Record the on-screen value, plus degrees if measurable. |

Record the original's exact refresh rate (e.g. from the emulator's
video information) in your notes once. The simulation steps one sim frame per
original frame; seconds only appear when a Mark is displayed.

**Screen coordinates:** origin at the top-left of the original's visible
screen, x to the right, y down, in native pixels. If the screen scrolls,
record the world position (scroll offset + screen x) and say how you got the
scroll offset. Measure the same point of a sprite every time (e.g. the
leading edge of the front foot) and name it in the notes.

## 3. Tooling

You need something that can:

1. **Pause and advance one frame at a time.** In MAME: `P` pauses, and
   `Shift+P` advances one frame while paused.
2. **Show or count the frame number.** MAME's Lua console or a script can
   print `manager.machine.screens[":screen"]:frame_number()`.
3. **Play exact, repeatable inputs** (strongly preferred over hand-mashing).
   Use a small Lua script that presses and releases inputs on chosen frames,
   or record once with MAME's `-record` and replay with `-playback`.
4. **Read positions.** Either read the sprite's pixel position by stepping
   frames and measuring the screen (a private screenshot in an image editor
   with a pixel ruler works), or read the position from memory with the
   emulator's debugger if you've found the address. Note which method you
   used.

Write down the tool and its version in each Reference Mark's `capture.tool`.

[`capture/`](capture/README.md) has scripts that do most of this for you: a
MAME Lua script plays every test an issue needs from a savestate, shows what
it's testing, asks what the game showed, and saves the Input Traces and
answers to `captures/issue-<n>/`, to commit; `pnpm capture:check` checks them.

## 4. Frame zero

Every Input Trace starts at **frame 0 = the first frame on which the Event
accepts input**, so traces from different captures line up. Record anything
that happens before or around it as a measurement:

| Event | Frame 0 | Also record |
|---|---|---|
| 100m Dash, 110m Hurdles | First frame a run press is registered (the "set" position) | `startSignalFrame`: frame the start signal fires, relative to frame 0 |
| Long Jump, Javelin, High Jump | First frame the Run-up responds to a run press | `foulLineX` / bar position, in pixels |
| Hammer Throw | First frame a run press starts the spin | |

If you find that the original accepts input earlier than you thought, update
this table and re-capture rather than shifting frames by hand.

## 5. Controlled inputs

Isolate one variable at a time. A run of captures for an Event should cover:

- **Mash rates:** slow (about 4 presses per second, a press every 15
  frames), typical (about 8 per second, every 7–8 frames) and maximum (a
  press every 2 frames, and every frame if the original allows it).
- **Patterns:** strict alternation, same-key repeats (one key only), uneven
  alternation (e.g. long-short), and stopping mid-run to measure decay.
- **Hold times** for the action button (angle): a sweep in steps of a few
  frames from the shortest to the longest hold the original allows.
- **Timing sweeps** for take-off, release and hurdle jumps: the same input
  with the action moved one frame at a time across the window, so its edges
  are found to ±1 frame.
- **Edge cases:** fouls, false starts, hitting hurdles, knocking the bar.

Run every scripted input at least twice. If two runs of the same input give
different results, the original has randomness or hidden state: capture
enough repeats to describe it and say so in the notes.

## 6. Recording one Attempt

1. Load the Event and pause on frame 0 (section 4).
2. Run your input script (or play back a recording). Keep the frame numbers
   of every press and release: those become the Input Trace.
3. Frame-step through the Attempt and read the measurements you need (speed
   per frame, take-off frame, release angle, landing position, Rival position
   and so on).
4. Read the Mark the original displays, exactly as shown, and the Mark in
   sim units (finish frame, or landing distance in pixels).
5. Write the two files below, then run `pnpm test` to validate them.

## 7. Files

```
calibration/
├── PROTOCOL.md                      this file
├── schema/
│   ├── input-trace.schema.json      Input Trace format
│   └── reference-mark.schema.json   Reference Mark format
├── types.ts                         types and consistency checks
├── examples/                        synthetic examples of the formats (not data)
├── capture/                         MAME capture scripts (README.md)
├── captures/issue-<n>/              raw capture results per issue: traces, typed answers, session
├── traces/<event>/<slug>.json       Input Traces
├── reference/<event>/<slug>.json    Reference Marks, same <event>/<slug> as the trace
└── notes/<topic>.md                 measured parameters and findings
```

- `<event>` is one of `sprint`, `longJump`, `javelin`, `hurdles`, `hammer`,
  `highJump`.
- `<slug>` is lowercase words and digits joined by hyphens and says what the
  trace is: `c1-alternate-8hz`, `c1-foul-late-action`, `c2-hold-24f`. Start
  with the Cycle.
- The trace's `id` is `<event>/<slug>`; the reference's `trace` field repeats it.
- Set `"source": "original"` on captured traces. `"synthetic"` is only for
  examples and tests, and the replay harness never treats those as parity
  targets.

### Input Trace

See [`schema/input-trace.schema.json`](schema/input-trace.schema.json) and the
[example](examples/sprint-example-steady-10hz.trace.json). One file per
Attempt. `inputs` lists every press and release, in order, with its frame,
player (1 or 2) and action (`RUN_A`, `RUN_B`, `ACTION`). A key must be
released before it's pressed again. `frames` is how long to run the
simulation, which should be at least until the Mark is final.

### Reference Mark

See [`schema/reference-mark.schema.json`](schema/reference-mark.schema.json)
and the [example](examples/sprint-example-steady-10hz.reference.json).

- `marks`: one per player, with `outcome` (`valid`, `foul`, `falseStart`,
  `failed`), `value` in sim units (or `null`), `unit` (`frames` or `pixels`),
  and `display`: the text the original showed, character for character.
- `measurements`: any intermediate values, keyed by a camelCase name
  (`takeOffFrame`, `speedMeterPerFrame`, `releaseAngle`, `rivalX`). Arrays are
  one value per frame from frame 0. Give each one a unit in `units`.
- `capture`: `date`, `method` (`frame-step`), `tool`, `by`.

### Notes

`calibration/notes/<topic>.md` holds what isn't a single Attempt: parameter
values derived from many traces (speed gain per press, decay rate, angle
window), Standards per Cycle, Points tables, rules, and open questions. Each
value says which traces it was derived from.

## 8. What may and may not be committed

| May be committed | Must never be committed |
|---|---|
| Input Traces and Reference Marks (JSON numbers and text) | Video, GIFs, screenshots or photos of the original |
| Notes with measured values and how they were measured | ROMs, ROM hashes of dumps you made, BIOS files |
| On-screen Mark text, transcribed (e.g. `"10.20"`) | Savestates, `.inp` recordings, memory or tile dumps |
| Memory addresses and what they hold, if useful for capture | Traced or sampled graphics, audio or fonts |
| Capture scripts you wrote yourself that contain no game data | Anything copied from the original's code or data |

## 9. Checking your work

`pnpm test` validates every file under `traces/` and `reference/` against the
schemas, checks that each trace's inputs are consistent and has a matching
Reference Mark, and runs the replay harness. Fix every error before opening a
pull request. `pnpm compare` prints the same diff on its own.

### Model differences

If the original works differently from the sim (not just with different
numbers), still commit the captures. Add `"expectedToFail"` to each affected
trace, saying why and naming the issue tracking the rework, for example
`"#80: the Rival reacts to the player"`. A normal run reports those traces as
skipped instead of failing, so CI stays green while the rework is open. Remove
the field once the sim matches.

### Strict mode (sign-off)

`pnpm compare:strict` (`node calibration/compare.ts --strict`) also fails when:

- an Event with a simulation has no captured (`"source": "original"`) traces,
  which would otherwise pass with nothing to check, or
- any trace is marked `"expectedToFail"`.

It's required for the parity sign-off (#62). It isn't part of CI, which would
fail until every capture has landed.
