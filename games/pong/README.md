# retro-pong

A playable, responsive arcade Pong game. Vanilla HTML, CSS and JavaScript:
no runtime dependencies, external assets, downloads or build step.

## Play

- **One player:** control the left paddle against the CPU.
- **Two players:** choose the local two-player mode.
- **Left paddle:** W / S. **Right paddle:** ↑ / ↓.
- **Space:** start or pause. **P:** pause/resume. **R:** reset to the ready screen.
- Use the on-screen paddle buttons on touch devices. They support simultaneous touches.
- First to **7** wins. Edge hits change the angle; returns speed up the ball.
- After each point, the next serve starts automatically after a short break.
- Restart or changing mode resets the score. Leaving the tab/window pauses play.

Click or focus the court to use keyboard shortcuts. Native buttons and the mode
selector keep their normal keyboard behavior; all controls have visible focus
states. Instructions, scores and match updates are available outside the canvas,
including a screen-reader live status. The real-time court is visual; there is
no nonvisual gameplay alternative.

## Run locally

From the repository root, use any static HTTP server, for example with Python 3:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>. Use HTTP rather than opening `index.html` directly:
JavaScript modules require serving. No npm install is needed.

## Tests

With Node.js 18 or newer:

```sh
npm test
```

Tests use Node's built-in test runner and cover paddle movement, CPU behavior,
wall/paddle collisions, shot angles/speed limits, scoring, serving, pause and
the win condition. The game itself needs only a modern browser.

## Deploy to GitHub Pages

1. Merge the game files into the repository's default branch.
2. Go to **Settings → Pages → Build and deployment**.
3. Choose **Deploy from a branch**, select the default branch and **/ (root)**,
   then save.
4. Wait for deployment and use the published link or **Visit site** in Pages settings.

Pages availability for private repositories depends on your GitHub plan and
organization policy. If unavailable, use a suitable plan or another static host;
making a repository public is optional and should be an intentional choice.
The expected project URL is `https://atangyyz.github.io/retro-pong/`, but verify
the actual published URL in Pages settings. Deployment is not configured by this code.

All asset paths are relative, so subdirectory hosting works. Other static hosts
only need `index.html`, `style.css`, `app.js` and `game.js`.

## Files

- `index.html` / `style.css`: responsive arcade layout and accessible controls.
- `app.js`: canvas rendering, input, UI and automatic pause on focus loss.
- `game.js`: independent game state and physics.
- `game.test.js`: focused core-logic tests.
- `package.json`: optional test command; no packages to install.
