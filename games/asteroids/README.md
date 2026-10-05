# Asteroids · Orbit Arcade

A standalone, browser-based take on the classic space arcade game. Neon vector
graphics, drifting rocks, a tiny ship, and one more shot at your personal best.
Built entirely in this repository with vanilla HTML, CSS, and JavaScript — no
frameworks, external assets, third-party services, or runtime dependencies.

## Play locally

With Python 3 installed:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open **http://localhost:8000** in a modern browser. Run the command from the
repository root. If Node.js/npm is also installed, `npm start` runs the same server.
No dependency installation or build step is needed.

Use a local web server, not `file://`: the game uses JavaScript modules. To publish,
serve this repository's static files on any static host (for example, GitHub Pages
with deployment from the repository root).

## Flight manual

| Action | Keyboard |
| --- | --- |
| Launch / restart | Space, or the on-screen button |
| Rotate left / right | ← / → or A / D |
| Thrust forward | ↑ or W |
| Fire lasers | Space (hold for repeated fire) |
| Pause / resume | Escape or P, or the on-screen buttons |

On mobile and tablets, **hold the touch buttons** to rotate, thrust, and fire.
Multiple buttons can be held at once. Release thrust to coast; there are no brakes.
The game pauses when the browser loses focus or moves to the background. Resume
explicitly when you return.

- Ships, rocks, and lasers wrap around every screen edge.
- Large rocks split into two medium rocks; medium rocks split into two small ones.
- Large / medium / small rocks award **20 / 50 / 100 points**.
- Clear all rocks to advance. Later waves have more rocks (up to 14 initial rocks)
  and faster movement.
- Start with **three lives**. After a collision, a short respawn delay and a
  temporary shield give you time to recover.
- Your best score is saved in this browser's local storage. If storage is blocked,
  the game still works and keeps your best score for the current session.
- Sound is optional and off by default. Turn it on with **Sound off**; effects are
  generated locally, with no audio downloads.

The interface includes visible instructions, labeled buttons, keyboard focus
indicators, and screen-reader announcements for key game events. Reduced-motion
preferences disable decorative particles and shield/thruster flicker. The
real-time canvas gameplay itself is visual.

## Checks

With **Node.js 18 or newer**:

```sh
npm run check
npm test
```

Tests use Node's built-in test runner and deterministic randomness. They cover
movement, wraparound (including collisions across seams), firing, asteroid
splitting, points, wave progression, pause, respawn shields, game over, and restart.

## Files

- `index.html`, `styles.css`: responsive arcade cabinet, instructions, and controls.
- `game.js`: independent game simulation with a fixed 1/120-second browser timestep.
- `main.js`: canvas rendering, input, optional audio, UI, and local high scores.
- `game.test.js`: dependency-free simulation regression tests.

This project is self-contained and does not use or modify `atangyyz/miles-middleschool`.
