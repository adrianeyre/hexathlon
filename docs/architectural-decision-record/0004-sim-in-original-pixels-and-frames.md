# The simulation works in the original's pixels and frames, not metres and seconds

Parity is measured by frame-stepping the original (ADR-0002), so every reference value arrives as original-screen pixels and 60 Hz frames. The simulation uses those units directly, so a comparison never goes through a conversion that could introduce rounding error. Metres and seconds exist only at the presentation edge, when a Mark is formatted for display. The renderer maps sim units to our own internal resolution, which is free to differ from the original's.
