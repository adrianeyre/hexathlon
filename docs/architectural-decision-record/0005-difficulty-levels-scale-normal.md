# Difficulty levels scale the measured values, and Normal is the parity target

Players asked for Easy, Normal and Hard. Parity (ADR-0002) is measured against one game, so only one level can be the measured one: Normal plays `data/events.json` and `data/standards.json` exactly, and the replay harness only ever runs at Normal. Easy and Hard apply a small set of factors from `data/difficulty.json` on top: speed gained per run press, the Rival's pace, the Standards, and the width of the angle, release and hurdle windows. Distances, foul lines, hurdle positions and bar heights never change, so the renderers and Marks stay comparable across levels.

The level is a saved setting. An Arcade Session keeps the level it started with, so changing it mid-Session can't help a qualification. Personal Bests and High Scores are shared across levels.

## Consequences

- Capturing reference data never needs to consider difficulty.
- Easy and Hard are tuned by hand, not measured, and can change freely.
- If separate tables per level are wanted later, the storage schema needs a new version.
