# Measured mechanical parity with the original, with original presentation

The mechanics (speed gain and decay, foul lines, angle windows, hurdle timing, height progression, Standards and Cycle scaling) are measured frame by frame from a legally owned copy of the original arcade game. They count as done only when they fall within tolerance: ±0.05 s for times, ±1% for distances and heights, ±1 frame at 60 Hz for timing windows, and an exact match for Standards. Everything presentational (art, animation, palette, audio, typeface, title screen and name) is original work, and only measured numbers are stored in the repo, never captured assets.

## Considered Options

- **Values tuned by playtesting**: rejected. The goal is for the game to feel indistinguishable to players who know the original, and playtesting alone can't guarantee that.
- **Matching the original's look as well**: rejected. Look and naming are where IP risk is concentrated (see ADR-0001), while game mechanics are free to replicate.

## Consequences

- Reference capture (M1) blocks every parity milestone.
- The fixed-step deterministic simulation and the replay harness are required for the parity comparison.
