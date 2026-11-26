# Capturing reference data with MAME

Issues #13 to #22 need numbers measured from the original game. These scripts
do the playing for you: `capture.lua` runs inside MAME and plays every test
an issue needs, frame by frame and exactly the same every time, with an
overlay saying what it's testing. After each test it asks you, in the
terminal, what the game showed (the Mark, the Points and so on), and saves
the results straight into the repo, in
[`calibration/captures/issue-<n>/`](../captures/README.md), ready to commit.

Read [`../PROTOCOL.md`](../PROTOCOL.md) first, especially section 1: use a
copy of the original you legally own, and never commit footage, screenshots,
ROMs or savestates. The scripts write nothing about the ROM.

## What you need

- MAME with Lua scripting (any recent version; 0.254 or later is best).
- Your own copy of the original, set up so `mame <romset>` starts it.
- This repo, with `pnpm install` done.

`<romset>` below means the name MAME knows your copy by.

## Once

1. **Generate the plans:** `pnpm capture:plans`. This writes `plans.lua`,
   which holds every test (it's generated, so it isn't committed), and makes
   the `calibration/captures/issue-<n>/` folders the results go in.
2. **Check the controls.** Run
   `CAPTURE_LIST=1 mame <romset> -autoboot_script calibration/capture/capture.lua`
   to print the machine's input names. In MAME's input menu (Tab, then
   Input Assignments), check which button is run and which is jump/throw, and
   set the names in [`controls.lua`](controls.lua) to match.
3. **Make the savestates.** Each test starts from a savestate saved paused at
   the start of an Event. Play to the Event, press `P` to pause, step with
   `Shift+P` to the last frame before the Event accepts input, then press
   `Shift+F7` and the key in the table to save. You only need the ones for the
   issues you're capturing.

| Key | Event | For |
|---|---|---|
| `a` | 100m, Cycle 1 | #13, #19, #20, #21 |
| `b` | Long Jump, Cycle 1, first Attempt | #14, #20, #21 |
| `c` | Javelin, Cycle 1, first Attempt | #15, #20, #21 |
| `d` | 110m Hurdles, Cycle 1 | #16, #19, #20, #21 |
| `e` | Hammer, Cycle 1, first Attempt | #17, #20, #21 |
| `f` | High Jump, Cycle 1, first height | #18, #20, #21 |
| `g`, `h` | 100m, Cycles 2 and 3 | #19, #20 |
| `i`, `j` | 110m Hurdles, Cycles 2 and 3 | #19, #20 |
| `k`, `l` | Long Jump, Cycles 2 and 3 | #20 |
| `m`, `n` | Javelin, Cycles 2 and 3 | #20 |
| `o`, `p` | Hammer, Cycles 2 and 3 | #20 |
| `q`, `r` | High Jump, Cycles 2 and 3 | #20 |
| `s` | Two players: 100m | #22 |
| `t` | Two players: Long Jump, player 1's first Attempt | #22 |
| `u` | Two players: 110m Hurdles | #22 |

## For each issue

```sh
CAPTURE_SET=13 mame <romset> -autoboot_script calibration/capture/capture.lua
```

Run it from a terminal, so you can answer the questions. The script loads the
savestate, plays the test and stops. The overlay in the top left shows:

```
CAPTURE #13  RUN 3/22
Mash 8hz
FRAME 412/1500
HELD 1:RUN_A
```

That's the issue, which test, the frame, and which buttons are held right now.
When a test ends the overlay says **ANSWER IN THE TERMINAL**. Type what the
game showed, exactly as it showed it (press Enter if it showed nothing). Then
the next test starts by itself. Each test's trace and answers are saved to
`calibration/captures/issue-<n>/` as soon as you've answered.

Each test is played twice, to show whether the original has any randomness.

| Issue | Tests | Asks |
|---|---|---|
| #13 100m Dash | 22 | Mark, outcome, the Rival's time |
| #14 Long Jump | 32 | Mark, outcome |
| #15 Javelin Throw | 32 | Mark, outcome |
| #16 110m Hurdles | 20 | Mark, outcome, the Rival's time |
| #17 Hammer Throw | 32 | Mark, outcome |
| #18 High Jump | 32 | Bar height, cleared or not, Mark |
| #19 Rival | 36 | The Rival's time, your Mark |
| #20 Standards | 18 | The Standard shown, whether Attempts were skipped |
| #21 Points | 48 | Mark, Points, whether you qualified |
| #22 Two-player | 6 | Lanes, whether the Rival ran, turn order, Marks, elimination |

To stop part-way, quit MAME: everything answered so far is saved. Pick up
again with `CAPTURE_FROM=<next run number>` (`pnpm capture:check` tells you
the number). `CAPTURE_ONLY=<n>` plays only `n`
tests, which is handy for a first try.

### First try

Start with `CAPTURE_SET=13 CAPTURE_ONLY=2`, then run
`CAPTURE_SET=13 CAPTURE_FROM=17 CAPTURE_ONLY=2` (the false-start test).
The mash test should run and finish normally, and the false-start test
should show a false start. If not, the savestate is on the wrong frame, or
the start signal comes later than the scripts expect: tell Claude what you
saw.

## Committing the results

```sh
pnpm capture:check 13
git add calibration/captures/issue-13
git commit -m "Capture reference data for #13"
```

`pnpm capture:check` checks every saved test against the Input Trace format,
pairs it with its answers, and says how many of the issue's tests are done
and, if any are left, which `CAPTURE_FROM` to resume with. Fix any problem it
reports (usually by playing that test again), then commit the folder: that
commit is the data the issue asks for. `pnpm test` runs the same check on
every committed folder. With no number, it checks every issue folder;
`--print` also prints an issue as one JSON bundle.

## How it works

- [`plans.ts`](plans.ts) builds every test as an Input Trace: exactly which
  button is pressed or released on which frame. It's tested in
  `test/capture.test.ts`.
- `plans.lua` is the same data for MAME.
- [`capture.lua`](capture.lua) loads each test's savestate and, from two
  frames after the load (frame 0), sets the inputs on the frames the trace
  says. Then it asks the questions and writes the trace and answers to
  `calibration/captures/issue-<n>/`.
- [`check.ts`](check.ts) checks what's been saved in `calibration/captures/`.

**Assumptions to check on the first real session:**
- The start signal comes within 6 seconds (frame 360) of the savestate, so
  the races mash from there.
- Field Events accept input straight away.
- MAME's savestate keys load by name.

The scripts were tested in a Lua 5.4 VM against a stand-in for MAME, not in
MAME itself, so the first session is their real test.
