import { COLS, ROWS, GOALS, LANES, createGame, startGame, togglePause, laneObjects, moveFrog, updateGame } from './game.js';

const canvas = document.querySelector('#board');
const ctx = canvas.getContext('2d');
const game = createGame();
const tile = canvas.width / COLS;
const overlay = document.querySelector('#overlay');
const startButton = document.querySelector('#start');
const pauseButton = document.querySelector('#pause');
const status = document.querySelector('#status');
const fields = Object.fromEntries(['score', 'lives', 'level', 'time'].map(key => [key, document.querySelector(`#${key}`)]));
let previous = 0;
let lastHop = -Infinity;

function frog(x, y, small = false) {
  const s = small ? 0.8 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#83d94f';
  ctx.fillRect(-13, -11, 26, 24);
  ctx.fillRect(-19, -15, 9, 11);
  ctx.fillRect(10, -15, 9, 11);
  ctx.fillRect(-19, 7, 8, 11);
  ctx.fillRect(11, 7, 8, 11);
  ctx.fillStyle = '#eaffcb';
  ctx.fillRect(-13, -13, 6, 6);
  ctx.fillRect(7, -13, 6, 6);
  ctx.fillStyle = '#152b25';
  ctx.fillRect(-11, -12, 3, 4);
  ctx.fillRect(8, -12, 3, 4);
  ctx.fillRect(-6, 6, 12, 3);
  ctx.restore();
}

function draw() {
  for (let row = 0; row < ROWS; row++) {
    ctx.fillStyle = row === 0 || row === 6 || row === 12 ? '#345b39' : row < 6 ? '#123b50' : '#26303a';
    ctx.fillRect(0, row * tile, canvas.width, tile);
    if (row > 0 && row < 6) {
      ctx.fillStyle = '#205268';
      for (let x = 0; x < COLS; x++) {
        ctx.fillRect(x * tile + ((game.elapsed * 8 + row * 13) % 32), row * tile + 14, 12, 2);
        ctx.fillRect(x * tile + 8, row * tile + 35, 7, 2);
      }
    }
    if (row > 6 && row < 12) {
      ctx.fillStyle = '#54616a';
      for (let x = 0; x < COLS; x++) ctx.fillRect(x * tile + 8, row * tile, 22, 2);
    }
    if (row === 6 || row === 12) {
      ctx.fillStyle = '#527344';
      for (let x = 0; x < COLS; x++) ctx.fillRect(x * tile + 9, row * tile + 20, 3, 8);
    }
  }
  GOALS.forEach((column, index) => {
    const x = (column + 0.5) * tile;
    ctx.fillStyle = game.goals[index] ? '#5b9942' : '#a4c95b';
    ctx.beginPath();
    ctx.ellipse(x, tile / 2, 20, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#345b39';
    ctx.fillRect(x, 7, 4, 12);
    if (game.goals[index]) frog(x, tile / 2, true);
  });
  for (const lane of LANES) {
    for (const object of laneObjects(game, lane)) {
      const x = object.x * tile;
      const y = lane.row * tile;
      const width = object.length * tile;
      if (lane.kind === 'log') {
        ctx.fillStyle = '#493226';
        ctx.fillRect(x, y + 8, width, 34);
        ctx.fillStyle = '#ac7850';
        ctx.fillRect(x + 2, y + 10, width - 4, 27);
        ctx.fillStyle = '#775036';
        ctx.fillRect(x + 8, y + 17, width - 16, 3);
        ctx.fillRect(x + 14, y + 29, width - 28, 2);
      } else {
        ctx.fillStyle = '#111b23';
        ctx.fillRect(x + 6, y + 5, width - 12, 38);
        ctx.fillStyle = ['#ffbd63', '#ef7581', '#8ba8f4'][lane.row % 3];
        ctx.fillRect(x, y + 10, width, 28);
        ctx.fillStyle = '#b8e3e6';
        ctx.fillRect(x + width * 0.3, y + 13, width * 0.3, 22);
        ctx.fillStyle = '#fff0bd';
        ctx.fillRect(lane.speed > 0 ? x + width - 4 : x, y + 13, 4, 6);
        ctx.fillRect(lane.speed > 0 ? x + width - 4 : x, y + 29, 4, 6);
      }
    }
  }
  if (game.status !== 'gameover') {
    ctx.globalAlpha = game.cooldown > 0 ? 0.55 : 1;
    frog(game.frog.x * tile, (game.frog.row + 0.5) * tile);
    ctx.globalAlpha = 1;
  }
}

function syncUI() {
  fields.score.textContent = String(game.score).padStart(5, '0');
  fields.lives.textContent = game.lives;
  fields.level.textContent = game.level;
  fields.time.textContent = Math.max(0, Math.ceil(game.time));
  if (status.textContent !== game.message) status.textContent = game.message;
  overlay.hidden = game.status === 'playing';
  pauseButton.disabled = game.status === 'ready' || game.status === 'gameover';
  pauseButton.firstChild.textContent = game.status === 'paused' ? 'Resume ' : 'Pause ';
  const titles = { ready: 'Take the leap.', paused: 'Catch your breath.', gameover: 'One more crossing?' };
  if (!overlay.hidden) {
    document.querySelector('#overlay-title').textContent = titles[game.status];
    document.querySelector('#overlay-copy').textContent = game.status === 'gameover'
      ? `Final score: ${game.score} · Level ${game.level}`
      : game.status === 'paused' ? 'The river can wait. Your game is saved right here.' : 'Five lily pads. Three lives. One very busy crossing.';
    startButton.textContent = game.status === 'paused' ? 'Resume game' : game.status === 'gameover' ? 'Play again' : 'Start game';
  }
}

function begin() {
  if (game.status === 'paused') togglePause(game);
  else startGame(game);
  lastHop = -Infinity;
  syncUI();
  canvas.focus({ preventScroll: true });
}

function pause() {
  togglePause(game);
  syncUI();
}

function hop(direction) {
  const now = performance.now();
  if (now - lastHop < 110) return;
  moveFrog(game, direction);
  lastHop = now;
  syncUI();
}

startButton.addEventListener('click', begin);
pauseButton.addEventListener('click', () => {
  pause();
  if (game.status === 'playing') canvas.focus({ preventScroll: true });
});
document.querySelector('#restart').addEventListener('click', () => {
  startGame(game);
  lastHop = -Infinity;
  syncUI();
  canvas.focus({ preventScroll: true });
});
document.querySelectorAll('[data-direction]').forEach(button => {
  button.addEventListener('click', () => hop(button.dataset.direction));
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

onSwipe(canvas, hop, () => hop('up'));

const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
canvas.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (keys[key]) {
    event.preventDefault();
    hop(keys[key]);
  } else if (key === 'p' || key === 'Escape') {
    event.preventDefault();
    if (!event.repeat) pause();
  } else if (key === 'r') {
    event.preventDefault();
    if (!event.repeat) {
      startGame(game);
      lastHop = -Infinity;
      syncUI();
    }
  }
});
document.addEventListener('visibilitychange', () => {
  previous = 0;
  if (document.hidden && game.status === 'playing') pause();
});
window.addEventListener('blur', () => {
  if (game.status === 'playing') pause();
});

function frame(timestamp) {
  updateGame(game, previous ? Math.min((timestamp - previous) / 1000, 0.05) : 0);
  previous = timestamp;
  draw();
  syncUI();
  requestAnimationFrame(frame);
}
syncUI();
requestAnimationFrame(frame);
