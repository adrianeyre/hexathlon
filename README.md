# Hexathlon

Hexathlon is an arcade-style athletics game for the browser. Mash two keys in
turn to build speed, then time your jumps and throws, across six Events played
in a fixed order: 100m Dash, Long Jump, Javelin Throw, 110m Hurdles, Hammer
Throw and High Jump. Reach the Standard in every Event to start the next Cycle,
where the Standards get tougher. The mechanics are tuned by measurement to
match the classic arcade games of this genre; everything you see and hear is
original work. It is written in TypeScript and drawn on a Canvas, built into
one minified script with no backend.

<p align="center">
  <img src="docs/screenshots/title.png" alt="Hexathlon title screen: the logo over a floodlit stadium" width="640">
</p>

> **Status:** early development. All six Events are playable, and Arcade is a
> full Session with Standards, Points and a High Score table. Two players can
> play a Session on one keyboard. The numbers in `data/events.json`,
> `data/standards.json`, `data/points.json` and `data/two-player.json` are
> **provisional**: they make the game playable but haven't been measured from
> the original yet. See
> [Calibration and parity](docs/guide/calibration-and-parity.md).

## Play

Once the repository is public, the game will be served by GitHub Pages at
<https://adrianeyre.github.io/hexathlon/> (the deploy job is disabled until
then; see [Deployment](docs/guide/deployment.md)). It can be installed as an
app and played offline.

| Action | Player 1 | Player 2 | Touch | Gamepad |
|---|---|---|---|---|
| Run (alternate) | `Z` / `X` | `,` / `.` | the two RUN buttons | A / B, or the shoulder buttons |
| Action (hold to set the angle) | `C` | `/` | ACTION | X or right trigger |
| Pause | `Esc` or `P` | `Esc` or `P` | the pause button | Back or Start |
| Menus | Arrow keys, `Enter`, `Esc` | | tap, or the on-screen pad | D-pad or left stick |
| Full screen | `F` | `F` | Settings → FULL SCREEN | Settings → FULL SCREEN |

Every key and pad button can be remapped. Full details are in
[Controls](docs/guide/controls.md).

## Run locally

You need Node.js 26 (see `.nvmrc`) and pnpm 12 (`corepack enable`).

```sh
pnpm install
pnpm start       # builds the minified site into dist/ and serves it at http://localhost:8080
pnpm build       # just the build (dist/ is exactly what GitHub Pages serves)
pnpm typecheck   # tsc over the TypeScript
pnpm test        # unit tests and the replay harness (Node runs the TypeScript directly)
```

`pnpm icons` and `pnpm screenshots` regenerate the icons, screenshots and
social card. Every script, `?fps`, the test suites, the size budget and CI
are in
[Development](docs/guide/development.md).

## Features

- **Six Events** in a fixed order, each with its own rules: races against the
  Rival, three-Attempt field Events with foul lines and angle windows, a
  hammer release window and a rising High Jump bar.
- **Arcade Sessions**: a Standard per Event per Cycle, Points for every Mark,
  and a ten-row High Score table with three-letter initials.
- **Two Player** on one keyboard (or two gamepads): side by side in the
  races, taking turns in the field Events, each with their own Points.
- **Practice** any Event with unlimited Attempts, and **Personal Bests** per
  Event.
- **Attract Mode** demos when the title is left idle.
- **Arcade presentation**: an announcer calls "On your marks", "Get set",
  "Foul", "Qualify", the Event names and more; a status panel along the top
  of the 100m and Hurdles (time, Standard, best, speed, Points); a track
  drawn in perspective; a foul judge and a measurer at the Long Jump; an
  overview of the Hammer field; and athletes who jump for joy when they
  pass, or bow and shake their heads when they don't.
- **Difficulty**: Easy, Normal or Hard. Normal is the parity target.
- **Keyboard, touch and gamepad**, with remapping and a Key Test for
  keyboard ghosting.
- **Accessibility**: Reduced Flash, keyboard-only menus, a colour-blind-safe
  palette and 64-pixel touch targets.
- **Full Screen**, **installable** and **offline** (PWA).
- **No cookies, no tracking**: everything is kept in local storage on your
  device.
- **All original**: code-drawn pixel art and font, synthesised music and
  sound, and the announcer spoken by the browser's speech synthesis. No
  image, font or sound files.

## Documentation

### Guide

| Page | What it covers |
|---|---|
| [Overview](docs/guide/overview.md) | What the game is, its features, its status and the technology in brief |
| [How to play](docs/guide/how-to-play.md) | Sessions, Cycles, Standards, Points, results, High Scores, initials, Practice, Attract Mode, Pause and Two Player |
| [Events](docs/guide/events.md) | How each of the six Events plays: controls, Attempts, fouls, the Mark and the Standard |
| [Controls](docs/guide/controls.md) | Keyboard, touch and gamepad, remapping and the Key Test |
| [Settings](docs/guide/settings.md) | Every Settings item, and what is kept in local storage |
| [Accessibility](docs/guide/accessibility.md) | Reduced Flash, keyboard-only play, colour and touch |
| [Installing and offline play](docs/guide/installing-and-offline.md) | Installing the app, the service worker and browser support |
| [Development](docs/guide/development.md) | Prerequisites, scripts, tests, type checking, the size budget and CI |
| [Architecture](docs/guide/architecture.md) | Project layout and how the loop, input, scenes, simulation, rendering and art fit together |
| [Deployment](docs/guide/deployment.md) | The GitHub Pages deploy job, service worker versioning and the site address |
| [Calibration and parity](docs/guide/calibration-and-parity.md) | The parity goal, the capture protocol and the replay harness |
| [FAQ](docs/guide/faq.md) | Short answers to common questions |

### Project documents

- [Product requirements](docs/product-requirements-document/)
- [Style guide](docs/style-guide.md): palette, athletes, stadium and title, and how they differ from the original
- [Architectural decision records](docs/architectural-decision-record/)
- [Glossary](GLOSSARY.md): the domain terms (Session, Cycle, Event, Attempt, Mark, Standard and so on) used everywhere
- [Calibration protocol](calibration/PROTOCOL.md): how reference data is captured and what may be committed
- [SEO, social previews and icons](docs/seo-and-icons.md)
- [Credits](CREDITS.md)

## Screenshots

### Title and menus

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/title.png" alt="Title screen with the Hexathlon logo, PRESS START and the F FULL SCREEN hint" width="280"><br>Title screen</td>
    <td align="center"><img src="docs/screenshots/attract.png" alt="Attract Mode replaying an Event demo" width="280"><br>Attract Mode</td>
    <td align="center"><img src="docs/screenshots/main-menu.png" alt="Main menu: Arcade, Practice, Two Player, High Scores, Settings, with the F FULL SCREEN hint" width="280"><br>Main menu</td>
  </tr>
</table>

### The six Events

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/sprint.png" alt="100m Dash against the Rival" width="280"><br>1. 100m Dash</td>
    <td align="center"><img src="docs/screenshots/long-jump.png" alt="Long Jump Run-up towards the foul line" width="280"><br>2. Long Jump</td>
    <td align="center"><img src="docs/screenshots/javelin.png" alt="Javelin Throw in flight" width="280"><br>3. Javelin Throw</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/hurdles.png" alt="110m Hurdles against the Rival" width="280"><br>4. 110m Hurdles</td>
    <td align="center"><img src="docs/screenshots/hammer.png" alt="Hammer Throw spinning in the circle" width="280"><br>5. Hammer Throw</td>
    <td align="center"><img src="docs/screenshots/high-jump.png" alt="High Jump at the bar" width="280"><br>6. High Jump</td>
  </tr>
</table>

### Session flow

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/pause.png" alt="Pause menu over an Event" width="280"><br>Pause</td>
    <td align="center"><img src="docs/screenshots/results.png" alt="Results with the Mark, Standard and Points" width="280"><br>Results</td>
    <td align="center"><img src="docs/screenshots/initials.png" alt="New High Score initials entry" width="280"><br>Initials entry</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/high-scores.png" alt="High Score table" width="280"><br>High Scores</td>
    <td align="center"><img src="docs/screenshots/practice.png" alt="Practice menu with Personal Bests" width="280"><br>Practice</td>
    <td></td>
  </tr>
</table>

### Settings and pages

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/settings.png" alt="Settings menu" width="280"><br>Settings</td>
    <td align="center"><img src="docs/screenshots/controls.png" alt="Controls remapping screen" width="280"><br>Controls</td>
    <td align="center"><img src="docs/screenshots/key-test.png" alt="Key Test showing held keys" width="280"><br>Key Test</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/cookie-policy.png" alt="Cookie Policy page" width="280"><br>Cookie Policy</td>
    <td align="center"><img src="docs/screenshots/credits.png" alt="Credits page" width="280"><br>Credits</td>
    <td></td>
  </tr>
</table>

### Touch

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/touch.png" alt="Phone-sized view with the on-screen RUN, ACTION and pause buttons" width="420"><br>On-screen touch buttons on a phone</td>
  </tr>
</table>

## Licence

[MIT](LICENSE). Third-party material and its licences are listed in [CREDITS.md](CREDITS.md).
