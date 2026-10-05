# Space Invaders · Orbital Defense

A playable, retro arcade shooter made with vanilla HTML, CSS, and JavaScript.
No runtime dependencies, downloads, external assets, tracking, or build step.

## Play locally

Serve the repository with any static HTTP server. For example, with Python 3:

```sh
python3 -m http.server 8000
```

Open **http://localhost:8000** and select **Start game**. Use an HTTP server
rather than opening `index.html` directly: browsers restrict JavaScript modules
on `file://` URLs.

### Controls

| Action | Keyboard |
| --- | --- |
| Move | Left / Right arrows or A / D |
| Fire | Hold Space |
| Pause / resume | P or Escape |
| Restart | R |

The visible Start/Pause/Resume and Restart buttons work with keyboard navigation.
On phones and tablets, hold the on-screen movement and fire buttons together.
The game automatically pauses when the window loses focus or the tab is hidden;
resume manually when ready.

Clear formations for points and increasingly difficult waves. Enemy shots cost
one of your three lives, with a short protection period after a hit. If the
formation reaches your ship, the mission ends regardless of remaining lives.
Restart resets score, lives, and difficulty. Progress is not persisted.

Instructions, statistics, and important status changes are available as text.
Controls have visible focus indicators and ship flashing respects reduced-motion
preferences. Gameplay is visual and is not a screen-reader-only experience.

## Deploy to GitHub Pages

1. Merge the game files into the repository's default branch.
2. Go to **Settings → Pages → Build and deployment**.
3. Select **Deploy from a branch**, select that branch and **/ (root)**, and save.
4. Wait for deployment, then use the **Visit site** link in Pages settings.

The expected project URL is **https://atangyyz.github.io/retro-space-invaders/**,
but Pages settings is the source of truth for the published URL and deployment
status. Pages availability for a private repository depends on your GitHub plan;
if unavailable, use a supported plan or make the repository public if appropriate.
All asset paths are relative, so deployment under a project subdirectory works.
Any static host can serve these files unchanged; no npm installation is needed.

## Tests and structure

With Node.js 22 or newer:

```sh
npm test
# Equivalent, without npm:
node --test tests/*.test.mjs
```

Tests use Node's built-in test runner; there are no packages to install.

- `index.html` — accessible page, scoreboard, instructions, and controls.
- `styles.css` — responsive arcade presentation.
- `app.mjs` — canvas rendering, keyboard/pointer input, and browser lifecycle.
- `game.mjs` — browser-independent game simulation.
- `tests/game.test.mjs` — focused deterministic game-logic tests.
