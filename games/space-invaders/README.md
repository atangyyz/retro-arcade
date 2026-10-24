# Space Invaders · Orbital Defense

A playable, retro arcade shooter made with vanilla HTML, CSS, and JavaScript.
No runtime dependencies, downloads, external assets, tracking, or build step.

## Play locally

This game is part of Retro Arcade and is published with the rest of the site.
Serve the repository root with any static HTTP server. For example, with Python 3:

```sh
python3 -m http.server 8000
```

Open **http://localhost:8000/games/space-invaders/** and select **Start game**. Use an HTTP server
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

Controls are chosen when the page loads, and the start screen says which apply:

- **Phones and tablets** (coarse primary pointer): tilt left or right to move and
  hold the on-screen Fire button. Start, Resume, and Restart ask for motion access
  (HTTPS required), calibrate to how you are holding the device, and expand to
  full view (best held sideways). Exit full view returns to the page and pauses;
  rotating the device pauses and recalibrates on resume. If the sensor is
  unavailable or access is denied, on-screen ◀ ▶ buttons appear instead.
- **Laptops and desktops**: keyboard only, in the normal page layout.

The game automatically pauses when the window loses focus or the tab is hidden;
resume manually when ready.

Clear formations for points and increasingly difficult waves. Enemy shots cost
one of your three lives, with a short protection period after a hit. If the
formation reaches your ship, the mission ends regardless of remaining lives.
Restart resets score, lives, and difficulty. Progress is not persisted.

Instructions, statistics, and important status changes are available as text.
Controls have visible focus indicators and ship flashing respects reduced-motion
preferences. Gameplay is visual and is not a screen-reader-only experience.

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
- `app.mjs` — canvas rendering, input wiring, full view, and browser lifecycle.
- `controls.mjs` — control-mode detection and tilt calibration.
- `game.mjs` — browser-independent game simulation.
- `tests/game.test.mjs` — focused deterministic game-logic tests.
- `tests/controls.test.mjs` — tilt and control-mode tests.
- `tests/app.test.mjs` — browser wiring tests with a fake DOM.
