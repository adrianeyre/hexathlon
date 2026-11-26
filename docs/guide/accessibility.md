# Accessibility

[Back to README](../../README.md)

What Hexathlon does so more people can play it, and where each part lives in
the code and tests.

## Reduced Flash

Settings > Reduced Flash stops blinking and flashing effects:

- PRESS START and other blinking text (the NEW PERSONAL BEST line, the new
  High Score row, the active initial's underline) stay steady;
- the title's hexagons are held steady;
- the crowd in the stand stops waving and the lamps stop twinkling.

On a first visit, before any setting is saved, it starts ON if the system
asks for reduced motion (`prefers-reduced-motion: reduce`). It can be turned
off again in Settings. `test/accessibility.test.ts` checks the title holds
steady and keeps PRESS START on screen every frame.

## Keyboard only

Every screen works from the keyboard alone: arrow keys move, `Enter` chooses
and `Esc` goes back. These keys are reserved and can't be remapped, so the
menus can never be locked out. `test/accessibility.test.ts` walks every menu,
plays, pauses and quits an Event, and enters initials using keys only.

## Remappable controls and the Key Test

Every player key, Pause, Start and the gamepad buttons can be remapped, and
the Key Test screen shows which keys your keyboard registers when held
together. See [Controls](controls.md#remapping).

## Colour

The colours that carry meaning (the kits, the foul strip, the distance
markers, the bar) come from the Okabe-Ito colour-blind-safe set.
`test/style-guide.test.ts` checks every pair that must differ, for normal
vision and for simulated protanopia, deuteranopia, tritanopia and
achromatopsia, and that interface text is at least 4.5:1 against its
background. The rules and the simulated renders are in the
[style guide](../style-guide.md#colour-blind-safety).

Meaning never rests on colour alone. A foul is spelled out (for example OVER
THE LINE) and flagged with a crossed flag, the speed bar has notches every
quarter, the three kits differ in headband, bib and shorts as well as vest
colour, and the active letter on the initials screen is underlined as well as
coloured.

## Touch

On-screen buttons are at least 64 CSS pixels, each has an accessible name
(for example "Run, left foot" and "Jump or throw"), and several fingers can be
held at once. See [Controls](controls.md#touch).

## Sound

Nothing depends on hearing. The start signal, fouls and results are all shown
on screen. Sound can be turned off or its volume set in
[Settings](settings.md#sound-and-volume).

## Difficulty

Easy gives more speed per press, a slower Rival, wider timing windows and
easier Standards. See [Settings](settings.md#difficulty).

## Pausing

An Event can be paused at any time, and pauses itself when the page is
hidden. Resuming continues from exactly the same frame. See
[Pause](how-to-play.md#pause).
