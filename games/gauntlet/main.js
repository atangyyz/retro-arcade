import { BOARD, createGame, startGame, stepGame, togglePause, getTile } from './game.js';

const canvas = document.querySelector('#board');
const context = canvas.getContext('2d');
const score = document.querySelector('#score');
const health = document.querySelector('#health');
const startButton = document.querySelector('#start');
const pauseButton = document.querySelector('#pause');
const attackButton = document.querySelector('#attack');
const status = document.querySelector('#status');
const overlay = document.querySelector('#overlay');
const overlayTitle = document.querySelector('#overlay-title');
const overlayHint = document.querySelector('#overlay-hint');
const storageKey = 'retro-arcade-gauntlet-best';

let savedBest = 0;
try {
  const value = Number(localStorage.getItem(storageKey));
  if (Number.isSafeInteger(value) && value >= 0) savedBest = value;
} catch {
  // Continue without browser storage.
}
const game = createGame({ best: savedBest });
const tileSize = canvas.width / BOARD.width;

function drawDungeon() {
  context.fillStyle = '#11130f';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < BOARD.height; y++) {
    for (let x = 0; x < BOARD.width; x++) {
      const px = x * tileSize;
      const py = y * tileSize;
      if (getTile(game, x, y) === 'wall') {
        context.fillStyle = '#392f23';
        context.fillRect(px, py, tileSize, tileSize);
        context.fillStyle = '#51412c';
        context.fillRect(px + 2, py + 2, tileSize - 4, tileSize - 7);
        context.fillStyle = '#2c261d';
        context.fillRect(px + 2, py + tileSize - 6, tileSize - 4, 4);
      } else {
        context.fillStyle = (x + y) % 2 ? '#171914' : '#1b1d17';
        context.fillRect(px, py, tileSize, tileSize);
        context.strokeStyle = '#27291f';
        context.strokeRect(px + 1, py + 1, tileSize - 2, tileSize - 2);
      }
    }
  }
}

function drawTreasure() {
  for (const item of game.treasure) {
    const x = (item.x + 0.5) * tileSize;
    const y = (item.y + 0.5) * tileSize;
    context.fillStyle = '#f5bd62';
    context.fillRect(x - 8, y - 7, 16, 14);
    context.fillStyle = '#fff0b3';
    context.fillRect(x - 3, y - 5, 5, 5);
  }
  for (const potion of game.potions) {
    const x = (potion.x + 0.5) * tileSize;
    const y = (potion.y + 0.5) * tileSize;
    context.fillStyle = '#79d8a1';
    context.fillRect(x - 6, y - 4, 12, 14);
    context.fillRect(x - 3, y - 8, 6, 5);
    context.fillStyle = '#d9ffe0';
    context.fillRect(x - 2, y, 4, 6);
  }
  if (!game.key.collected) {
    const x = (game.key.x + 0.5) * tileSize;
    const y = (game.key.y + 0.5) * tileSize;
    context.fillStyle = '#ffe9a0';
    context.beginPath();
    context.arc(x - 3, y - 4, 5, 0, Math.PI * 2);
    context.fill();
    context.fillRect(x, y - 1, 12, 4);
    context.fillRect(x + 7, y + 2, 3, 5);
  }
  if (game.key.collected) {
    const x = (13 + 0.5) * tileSize;
    const y = (9 + 0.5) * tileSize;
    context.fillStyle = '#ffe9a0';
    context.fillRect(x - 13, y - 16, 26, 32);
    context.fillStyle = '#1b1d17';
    context.fillRect(x - 6, y - 5, 12, 21);
  }
}

function drawCharacters() {
  for (const enemy of game.enemies) {
    const x = enemy.x * tileSize;
    const y = enemy.y * tileSize;
    context.fillStyle = '#d95c51';
    context.fillRect(x + 12, y + 15, 24, 23);
    context.fillRect(x + 10, y + 21, 28, 13);
    context.fillStyle = '#ffe9c3';
    context.fillRect(x + 17, y + 22, 4, 4);
    context.fillRect(x + 27, y + 22, 4, 4);
    context.fillStyle = '#44201c';
    context.fillRect(x + 18, y + 23, 2, 2);
    context.fillRect(x + 28, y + 23, 2, 2);
    context.fillStyle = '#251c18';
    context.fillRect(x + 15, y + 36, 7, 4);
    context.fillRect(x + 27, y + 36, 7, 4);
  }

  const x = game.player.x * tileSize;
  const y = game.player.y * tileSize;
  context.fillStyle = '#77a8e8';
  context.fillRect(x + 12, y + 14, 24, 25);
  context.fillStyle = '#dcecff';
  context.fillRect(x + 16, y + 7, 16, 14);
  context.fillStyle = '#252a32';
  context.fillRect(x + 19, y + 12, 3, 3);
  context.fillRect(x + 26, y + 12, 3, 3);
  const offsets = { up: [24, 7, 4, -8], down: [24, 39, 4, 8], left: [9, 27, -8, 4], right: [39, 27, 8, 4] };
  const [weaponX, weaponY, dx, dy] = offsets[game.player.facing];
  context.fillStyle = '#f5bd62';
  context.fillRect(x + weaponX + Math.min(0, dx), y + weaponY + Math.min(0, dy),
    Math.max(4, Math.abs(dx)), Math.max(4, Math.abs(dy)));
}

function draw() {
  drawDungeon();
  drawTreasure();
  drawCharacters();
}

function syncUI() {
  score.textContent = String(game.score);
  health.textContent = Array.from({ length: 5 }, (_, index) => index < game.health ? '♥' : '♡').join(' ');
  health.setAttribute('aria-label', `${game.health} health`);
  startButton.textContent = game.status === 'ready' ? 'Start run' : 'Restart run';
  pauseButton.disabled = !['playing', 'paused'].includes(game.status);
  pauseButton.textContent = game.status === 'paused' ? 'Resume' : 'Pause';
  overlay.hidden = game.status === 'playing';
  const messages = {
    ready: ['The dungeon awaits.', 'Move with arrows / WASD or swipe. Walk into monsters to attack.', 'Ready. Select Start run to begin.'],
    playing: ['', '', `Move one tile per input. Walk into a monster or press Space to attack. Score ${game.score}. Health ${game.health}.`],
    paused: ['Run paused.', 'Select Resume or press P.', 'Paused. Select Resume or press P to continue.'],
    won: ['Dungeon cleared!', `You escaped with ${game.score} points. Play again?`, `Dungeon cleared. Final score ${game.score}.`],
    gameover: ['Run over.', 'The monsters got you. Try again?', `Overwhelmed by monsters. Final score ${game.score}.`]
  };
  const [title, hint, announcement] = messages[game.status];
  overlayTitle.textContent = title;
  overlayHint.textContent = hint;
  if (status.textContent !== announcement) status.textContent = announcement;
  if (game.best > savedBest) {
    savedBest = game.best;
    try {
      localStorage.setItem(storageKey, String(savedBest));
    } catch {
      // Keep the session's best score when saving is unavailable.
    }
  }
}

function update() {
  draw();
  syncUI();
}

function start() {
  startGame(game);
  update();
  canvas.focus({ preventScroll: true });
}

function pause() {
  togglePause(game);
  update();
}

function command(value) {
  if (!stepGame(game, value)) return;
  update();
}

startButton.addEventListener('click', start);
pauseButton.addEventListener('click', pause);
attackButton.addEventListener('click', () => command('attack'));
document.querySelectorAll('[data-direction]').forEach(button => {
  button.addEventListener('click', () => command(button.dataset.direction));
});


function onSwipe(target, handler, onTap) {
  let origin = null;
  target.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    origin = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  target.addEventListener('pointerup', event => {
    if (!origin || origin.id !== event.pointerId) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    origin = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
      if (onTap) onTap();
      return;
    }
    handler(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  target.addEventListener('pointercancel', () => { origin = null; });
}

onSwipe(canvas, command, () => command('attack'));

const directions = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right'
};
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (directions[key]) {
    if (game.status === 'playing' || event.target === canvas) event.preventDefault();
    if (!event.repeat) command(directions[key]);
  } else if (key === ' ' && (event.target === canvas || game.status === 'playing')) {
    event.preventDefault();
    if (!event.repeat) command('attack');
  } else if (key === 'p' && (event.target === canvas || game.status === 'playing' || game.status === 'paused')) {
    event.preventDefault();
    if (!event.repeat) pause();
  } else if (key === 'Enter' && event.target === canvas && ['won', 'gameover'].includes(game.status)) {
    start();
  }
});

function autoPause() {
  if (game.status === 'playing') pause();
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});

draw();
syncUI();
