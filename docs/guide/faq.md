# FAQ

[Back to README](../../README.md)

### My athlete barely moves. What am I doing wrong?

Alternate the two run keys (`Z` then `X`, over and over). Pressing the same
key twice in a row adds no speed, and holding a key down counts as one press.
See [The speed meter](events.md#the-speed-meter).

### Why was my jump or throw a foul?

The foul banner says why. In the Long Jump, take off before the foul line;
in the Javelin Throw, let go before the line and don't run over it
afterwards; in the Hammer Throw, let go while the hammer faces down the field.
Every Event also has a time limit. See [Events](events.md).

### How long should I hold ACTION?

About half a second for the Long Jump, Javelin Throw and Hammer Throw (40 to
48 degrees), and about two thirds of a second for the High Jump (55 to 65
degrees). The angle dial shows the window. Easy makes the windows wider.

### Do I have to beat the Rival?

No. Only the Standard decides whether you qualify. The Rival's time is shown
for comparison.

### Why did my Session end?

A Mark missed the Standard, or there was no Mark (a foul, a disqualifying
false start, or no clearance in the High Jump). There are no continues.

### Why didn't I get to use all three Attempts?

In Arcade, the field Events end as soon as a Mark reaches the Standard. Use
Practice to take as many Attempts as you like.

### Why are the Standards and Points the values they are?

They are provisional, set so every Event is playable, and will be replaced
by values measured from the original. See
[Calibration and parity](calibration-and-parity.md).

### Can two people play?

Yes, on one keyboard (or with two gamepads). Choose TWO PLAYER from the main
menu. See [Two Player](how-to-play.md#two-player).

### Some key combinations don't work on my keyboard.

That is keyboard ghosting. Check it in Settings > Key Test, and if needed
remap the keys in Settings > Controls. See [Controls](controls.md).

### How do I leave the Key Test?

Hold `Esc` for one second, or tap BACK. A quick press of `Esc` is just
another key to test.

### Does Hexathlon use cookies or track me?

No. It sets no cookies and has no ads, analytics or tracking. Settings,
controls, Personal Bests and High Scores stay in your browser's local
storage. See [Settings](settings.md#what-is-stored).

### How do I reset my High Scores and Personal Bests?

Clear this site's data in your browser's settings. That removes the saved
settings and controls as well.

### Does changing the difficulty affect my High Scores?

High Scores and Personal Bests are shared across levels. A Session keeps the
level it started with. See [Difficulty](settings.md#difficulty).

### How do I play full screen?

Press `F`, or turn on FULL SCREEN in Settings. The game then fills 100% of
the screen. Press `F` or `Esc` to leave. See [Full Screen](settings.md#full-screen).

### Full Screen turned itself off.

Leaving full screen with the browser's own control (such as `Esc`) turns
the setting off. If it is on, it comes back on your first key press or tap
after loading, because browsers only allow full screen after a gesture.

### There is no sound.

Browsers only allow sound after a key press or tap, so it starts with your
first one. Check SOUND and VOLUME in Settings. Attract Mode is silent.

### Can I play offline?

Yes, after one visit over HTTPS. You can also install it as an app. See
[Installing and offline play](installing-and-offline.md).

### I changed some code but the browser shows the old version.

`pnpm start` serves with caching disabled, and the local service worker
fetches from the network first, so a reload should pick it up. If not, use a
hard reload or clear the site's data.

### I added a new file and the tests fail.

If the game loads it other than by import, add it to `STATIC` in `build.ts`. See
[Development](development.md#adding-a-runtime-file).

### How do I check the frame rate?

Add `?fps` to the URL.
