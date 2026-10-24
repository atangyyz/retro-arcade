# Retro Arcade

Four playable browser games in one static site: **Tilt Dodger**,
**Space Invaders**, **Asteroids**, and **Frogger**. Choose a game on the homepage, play,
then use **← Back to Arcade** to choose another.

## Run locally

Requires Python 3 for the local server, and Node.js 22+ with npm for all tests
(matching Space Invaders' documented requirement).
There are no dependencies to install and no build step.

```sh
npm start
```

Open <http://127.0.0.1:8000/>. Serve over HTTP rather than opening HTML files
directly, since the games use JavaScript modules. Stop the server with Ctrl+C.
Without npm, use `python3 -m http.server 8000 --bind 127.0.0.1`.

## Checks and tests

Run from the repository root:

```sh
npm run check       # Syntax-check all game entry points and engines
npm test            # Site navigation checks, then all four game test suites
npm run test:site   # Homepage, return links, assets, Pages subpaths, focus styles
npm run test:games  # All four game suites, including Tilt Dodger simulation and control tests
```

To test just one game, use `npm --prefix games/frogger test` (replace `frogger`
with `space-invaders`, `asteroids`, or `tilt-dodger`). Asteroids also retains
its original `npm --prefix games/asteroids run check` command.
No framework, bundler, backend, or external test dependencies are needed.

## Layout and source projects

| Game | Local entry point | Original source |
| --- | --- | --- |
| Tilt Dodger | `games/tilt-dodger/index.html` | Built for this arcade |
| Space Invaders | `games/space-invaders/index.html` | [atangyyz/retro-space-invaders](https://github.com/atangyyz/retro-space-invaders) |
| Asteroids | `games/asteroids/index.html` | [atangyyz/retro-asteroids](https://github.com/atangyyz/retro-asteroids) |
| Frogger | `games/frogger/index.html` | [atangyyz/retro-frogger](https://github.com/atangyyz/retro-frogger) |

The three remaining original games were imported from the source projects' `main` branches
on 2026-10-05. Their folders retain the complete source snapshots, including READMEs,
package metadata, styles, game logic, and tests. Only each game's HTML was
adjusted to include the shared return link and its stylesheet; Asteroids'
existing brand/home link now also returns to the arcade homepage.
The original repositories are unchanged. Original package license declarations
are retained; importing these projects does not grant a new license.

Tilt Dodger is self-contained in `games/tilt-dodger/`: steer a spaceship, dodge
falling asteroid rows, and collect stars. Touch-first devices (primary pointer
is coarse) steer only by tilting in full view; laptops and desktops steer only
with ← → or A / D in the normal page layout. The page tells players which
controls apply before they start. Survival earns 10 points per second;
each star adds 50. Asteroids accelerate and rows arrive more frequently, but
each row leaves a two-lane gap that shifts by at most one lane, preserving a
reachable escape route. Best scores persist locally when storage is available.
Use the large Start, Pause / Resume, and Retry controls; leaving the page
pauses the round and requires manual resume.

On touch devices, tilt steering requires a secure context (HTTPS or localhost), a supported
orientation sensor, and, on some phones, permission after tapping Start or Resume.
Hold the phone comfortably during calibration; recalibrate after changing your
grip. Rotating the screen pauses flight and recalibrates before manual resume.
Denied permission or missing sensor readings prevent flight; touch devices have
no touch or keyboard steering fallback. In tilt mode, Start expands the game to the viewport and requests
native fullscreen where supported. The portrait playfield scales without
stretching or cropping, and Pause, Recalibrate, Retry, and Exit full view remain
accessible. Exit full view returns to the normal page and pauses an active flight.
Real sensor behavior and fullscreen permissions should also be checked on a phone.
The DOM-free simulation tests include a 90-second safe-route run.

The homepage lives in `index.html`; `assets/arcade.css` styles it and
`assets/navigation.css` styles only the shared return links. Game implementations
remain independent, including their keyboard, touch, audio, and canvas behavior.
Each game page explains its controls. Homepage illustrations are inline SVG;
no remote fonts, images, or scripts are required.

## Publish with GitHub Pages

After merging this work into the destination repository's default branch:

1. Open **Settings → Pages** in `atangyyz/retro-arcade`.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the default branch (usually `main`) and **/ (root)**; click **Save**.
4. Wait for the Pages deployment to finish, then visit
   <https://atangyyz.github.io/retro-arcade/>.

No generated output or custom Actions workflow is needed. All navigation,
stylesheets, and module imports use relative paths so the site works at
`/retro-arcade/` as well as at a domain root. Pages publishes the static files;
the npm commands are local development and test conveniences only.

Before publishing, check each game in a browser: launch it, try its keyboard
and on-screen controls, and follow the return link. Also try Tab/Enter
navigation, a narrow viewport, and the system's reduced-motion setting.
