# Gauntlet · Dungeon Run

A self-contained, browser-based dungeon crawler built for Retro Arcade with
vanilla HTML, CSS, and JavaScript. Explore a maze, fight pursuing monsters,
collect treasure and healing potions, find the key, and escape through the exit.
No external assets, frameworks, or runtime dependencies are used.

## Play

Use a local web server from the repository root (`npm start`) and open
<http://127.0.0.1:8000/games/gauntlet/>.

| Action | Controls |
| --- | --- |
| Move one tile | Arrow keys / WASD, direction buttons, or swipe the board |
| Attack | Walk into a monster, or press Space / Attack to strike the way you face |
| Pause / resume | P or Pause button |
| Start / restart | Start run button |

Find the key in the upper-right and reach the exit in the lower-right to win;
you can dodge monsters instead of defeating them. Monsters act every other
move or attack. Treasure is worth 100 points, defeating a monster is worth 50,
and escaping with the key awards 500. Potions restore up to two health points,
to a maximum of five. Best score is saved in local browser storage when available.

## Checks

From this directory, run `npm test` and `npm run check`. Both use Node's built-in
tools and do not require installing dependencies.
