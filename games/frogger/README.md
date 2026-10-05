# River Run · Retro Frogger

A playable, responsive arcade crossing game built with vanilla HTML, CSS, and
JavaScript. No runtime dependencies, external assets, downloads, or build step.

## Play locally

From the repository directory, run:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>. Use an HTTP server rather than opening `index.html`
directly: browsers restrict JavaScript modules on `file://` URLs.

Select **Start game**, then use **arrow keys / WASD** or the on-screen direction
buttons. **P / Escape** pauses and resumes; **R** restarts. Keyboard shortcuts
apply when the board has focus (starting or restarting focuses it). Tab reaches
all buttons, with visible focus outlines. Leaving the tab or window pauses play.

Dodge cars, ride logs, and reach the center of each empty lily pad. Fill all five
to advance to faster traffic and a shorter crossing timer. Water, traffic,
occupied/missed pads, drifting off-screen, and timeouts cost one of three lives.
Forward progress, safe landings, remaining time, and completed levels earn points.

## Deploy to GitHub Pages

1. Commit the files to your repository's publishing branch.
2. In **Settings → Pages → Build and deployment**, choose **Deploy from a branch**.
3. Select that branch and **/ (root)**, then save.
4. Once deployment finishes, use the **Visit site** link in Pages settings to find
   the actual published URL.

Pages availability for private repositories depends on your GitHub plan. Any
static host also works: serve `index.html`, `style.css`, `main.js`, and `game.js`
together. Relative paths support both a domain root and a repository subpath.

## Verification

Node.js 18+ is only needed for development tests, not for playing or hosting:

```sh
npm test
node --check game.js
node --check main.js
```

Tests use Node's built-in test runner and cover movement, collisions, log carrying,
goals, progression, timers, pause/restart, and lane wrapping. No install is needed.
`game.js` contains the DOM-free simulation; `main.js` renders it and handles input.
There is no bundler or separate lint configuration.

The canvas is visual gameplay, not a complete nonvisual equivalent. Instructions,
controls, and event announcements are accessible HTML; live announcements avoid
reading every timer tick. No audio or flashing effects are used.
