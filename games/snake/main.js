import { createGame, startGame, turn, togglePause, stepGame } from './game.js';

const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const score = document.querySelector('#score');
const best = document.querySelector('#best');
const startButton = document.querySelector('#start');
const pauseButton = document.querySelector('#pause');
const status = document.querySelector('#status');
const overlay = document.querySelector('#overlay');
const overlayTitle = document.querySelector('#overlay-title');
const overlayHint = document.querySelector('#overlay-hint');
const storageKey = 'retro-arcade-snake-best';

let savedBest = 0;
try {
  const value = Number(localStorage.getItem(storageKey));
  if (Number.isSafeInteger(value) && value >= 0) savedBest = value;
} catch {
  // The game also works when browser storage is unavailable.
}
const game = createGame({ best: savedBest });
let lastMove = null;

function draw() {
  const cell = canvas.width / game.size;
  ctx.fillStyle = '#0c1420';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#182635';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < game.size; i++) {
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, canvas.height);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(canvas.width, i * cell);
  }
  ctx.stroke();
  if (game.food) {
    ctx.fillStyle = '#ffc28f';
    ctx.beginPath();
    ctx.arc((game.food.x + 0.5) * cell, (game.food.y + 0.5) * cell, cell * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  game.snake.forEach((segment, index) => {
    ctx.fillStyle = index === 0 ? '#dbfff1' : '#91f3cf';
    ctx.fillRect(segment.x * cell + 2, segment.y * cell + 2, cell - 4, cell - 4);
  });
  const head = game.snake[0];
  ctx.fillStyle = '#0b1019';
  const vertical = game.direction === 'up' || game.direction === 'down';
  const forward = game.direction === 'up' || game.direction === 'left' ? 0.3 : 0.7;
  for (const side of [0.3, 0.7]) {
    ctx.fillRect((head.x + (vertical ? side : forward)) * cell - 2,
      (head.y + (vertical ? forward : side)) * cell - 2, 4, 4);
  }
}

function syncUI() {
  score.textContent = game.score;
  best.textContent = game.best;
  startButton.textContent = game.status === 'ready' ? 'Start game' : 'Restart game';
  pauseButton.disabled = !['playing', 'paused'].includes(game.status);
  pauseButton.textContent = game.status === 'paused' ? 'Resume' : 'Pause';
  overlay.hidden = game.status === 'playing';
  const messages = {
    ready: ['Ready to grow?', 'Select Start game to begin.', 'Ready. Select Start game to begin.'],
    playing: ['', '', `Playing. Score ${game.score}. Use P or Space to pause.`],
    paused: ['Paused', 'Select Resume or press P / Space.', 'Paused. Select Resume or press P or Space to continue.'],
    gameover: ['Game over', `${game.reason === 'wall' ? 'You hit a wall.' : 'You hit your own body.'} Try again?`,
      `Game over. ${game.reason === 'wall' ? 'Wall collision.' : 'Self collision.'} Final score ${game.score}. Select Restart game.`],
    won: ['Board complete!', 'Every bite counts. Play again?',
      `You filled the board! Final score ${game.score}. Select Restart game.`]
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
      // Keep the session's best score even if saving is blocked.
    }
  }
}

function start() {
  startGame(game);
  lastMove = null;
  syncUI();
  draw();
  canvas.focus({ preventScroll: true });
}

function pause() {
  togglePause(game);
  lastMove = null;
  syncUI();
}

startButton.addEventListener('click', start);
pauseButton.addEventListener('click', pause);
document.querySelectorAll('[data-direction]').forEach(button => {
  button.addEventListener('click', () => turn(game, button.dataset.direction));
});

const keys = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right'
};
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (keys[key]) {
    if (game.status === 'playing' || event.target === canvas) event.preventDefault();
    if (!event.repeat) turn(game, keys[key]);
  } else if (key === 'p' || ((key === ' ' || key === 'Enter') && event.target === canvas)) {
    event.preventDefault();
    if (event.repeat) return;
    if (key === 'Enter') start();
    else pause();
  }
});

function autoPause() {
  if (game.status === 'playing') pause();
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});

function frame(timestamp) {
  if (game.status === 'playing') {
    if (lastMove === null) lastMove = timestamp;
    if (timestamp - lastMove >= game.tickMs) {
      stepGame(game);
      lastMove = timestamp;
      draw();
      syncUI();
    }
  }
  requestAnimationFrame(frame);
}

draw();
syncUI();
requestAnimationFrame(frame);
