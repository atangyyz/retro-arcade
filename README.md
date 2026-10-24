# Retro Arcade

Seven playable browser games in one static site: **Pong**, **Frogger**,
**Space Invaders**, **Asteroids**, **Snake**, **Gauntlet**, and **Tilt Dodger**. Choose a game on the homepage, play,
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
npm test            # Site navigation checks, then all seven game test suites
npm run test:site   # Homepage, return links, assets, Pages subpaths, focus styles
npm run test:games  # All seven game suites, including Tilt Dodger simulation and control tests
```

To test just one game, use `npm --prefix games/pong test` (replace `pong`
with `frogger`, `space-invaders`, `asteroids`, `snake`, `gauntlet`, or `tilt-dodger`). Asteroids also retains
its original `npm --prefix games/asteroids run check` command; Snake has
`npm --prefix games/snake run check`.
No framework, bundler, backend, or external test dependencies are needed.

## Layout and source projects

| Game | Local entry point | Original source |
| --- | --- | --- |
| Pong | `games/pong/index.html` | [atangyyz/retro-pong](https://github.com/atangyyz/retro-pong) |
| Frogger | `games/frogger/index.html` | [atangyyz/retro-frogger](https://github.com/atangyyz/retro-frogger) |
| Space Invaders | `games/space-invaders/index.html` | [atangyyz/retro-space-invaders](https://github.com/atangyyz/retro-space-invaders) |
| Asteroids | `games/asteroids/index.html` | [atangyyz/retro-asteroids](https://github.com/atangyyz/retro-asteroids) |
| Snake | `games/snake/index.html` | Built for this arcade |
| Gauntlet | `games/gauntlet/index.html` | Built for this arcade |
| Tilt Dodger | `games/tilt-dodger/index.html` | Built for this arcade |

The four original games were imported from the source projects' `main` branches
on 2026-10-05. Their folders retain the complete source snapshots, including READMEs,
package metadata, styles, game logic, and tests. Only each game's HTML was
adjusted to include the shared return link and its stylesheet; Asteroids'
existing brand/home link now also returns to the arcade homepage.
The original repositories are unchanged. Original package license declarations
are retained; importing these projects does not grant a new license.

Snake is self-contained in `games/snake/`: `index.html` and `style.css` provide
the page, `game.js` is the DOM-free grid simulation, `main.js` handles canvas,
keyboard and on-screen controls, and `game.test.js` uses Node's built-in runner.
Select **Start game**, steer with **arrow keys / WASD** or the direction buttons,
and eat food for 10 points, growth, and increasing speed. Walls and your own body
end the round; **Restart game** starts fresh. Use **P / Space** with the board
focused or the **Pause / Resume** button to pause. Leaving the window also pauses;
resuming is manual. Best score persists in browser storage when available.

Gauntlet is self-contained in `games/gauntlet/`: explore with the arrow keys /
WASD or direction buttons, attack with Space or the Attack button, collect
treasure and potions, find the key, and reach the exit. Its grid-based engine
and deterministic tests are independent of the other games.

Tilt Dodger is self-contained in `games/tilt-dodger/`: tilt your device left or
right to steer a spaceship, dodge falling asteroid rows, and collect stars.
Tilt is the only steering input. Survival earns 10 points per second;
each star adds 50. Asteroids accelerate and rows arrive more frequently, but
each row leaves a two-lane gap that shifts by at most one lane, preserving a
reachable escape route. Best scores persist locally when storage is available.
Use the large Start, Pause / Resume, and Retry controls; leaving the page
pauses the round and requires manual resume.

Tilt steering requires a secure context (HTTPS or localhost), a supported
orientation sensor, and, on some phones, permission after tapping Start or Resume.
Hold the phone comfortably during calibration; recalibrate after changing your
grip. Rotating the screen pauses flight and recalibrates before manual resume.
Denied permission or missing sensor readings prevent flight; there is no touch
or keyboard steering fallback. Start expands the game to the viewport and requests
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
