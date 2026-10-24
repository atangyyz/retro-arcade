import {
  WIDTH, HEIGHT, SHIP_Y, SHIP_RADIUS, MOVE_SPEED,
  createGame, startGame, setTarget, togglePause, stepGame,
} from './game.js';
import { installControls, readBest, writeBest } from './controls.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const score = document.getElementById('score');
const stars = document.getElementById('stars');
const best = document.getElementById('best');
const start = document.getElementById('start');
const pause = document.getElementById('pause');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayCopy = document.getElementById('overlay-copy');
const status = document.getElementById('game-status');
const controlStatus = document.getElementById('control-status');
const game = createGame({ best: readBest(window) });
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let lastStatus = '';
let savedBest = game.best;
let previousTime = null;

function begin() {
  if (game.status !== 'ready' && game.status !== 'gameover') return;
  startGame(game);
  controls.reset();
  previousTime = null;
  syncUI();
  canvas.focus({ preventScroll: true });
}

function pauseGame(toggle = false) {
  if (game.status === 'playing' || (toggle && game.status === 'paused')) {
    togglePause(game);
    controls.reset();
    previousTime = null;
    syncUI();
    if (game.status === 'playing') canvas.focus({ preventScroll: true });
  }
}

const controls = installControls({
  win: window, doc: document, canvas,
  tiltButton: document.getElementById('tilt'),
  recalibrateButton: document.getElementById('recalibrate'),
  width: WIDTH, moveSpeed: MOVE_SPEED,
  getX: () => game.x,
  isPlaying: () => game.status === 'playing',
  onTarget: x => setTarget(game, x),
  onPause: pauseGame,
  onStart: begin,
  onStatus: message => { controlStatus.textContent = message; },
});
start.addEventListener('click', begin);
pause.addEventListener('click', () => pauseGame(true));

function syncUI() {
  score.textContent = String(Math.floor(game.score));
  stars.textContent = String(game.starsCollected);
  best.textContent = String(Math.floor(game.best));
  if (game.best > savedBest) {
    savedBest = game.best;
    writeBest(window, game.best);
  }
  if (lastStatus === game.status) return;
  lastStatus = game.status;
  overlay.hidden = game.status === 'playing';
  start.disabled = game.status === 'playing' || game.status === 'paused';
  start.textContent = game.status === 'gameover' ? 'Retry flight' : 'Start flight';
  pause.disabled = game.status === 'ready' || game.status === 'gameover';
  pause.textContent = game.status === 'paused' ? 'Resume' : 'Pause';
  if (game.status === 'ready') {
    overlayTitle.textContent = 'Find your flow.';
    overlayCopy.textContent = 'Dodge meteors. Chase stars. Stay in the sky.';
    status.textContent = 'Ready to fly · start when you’re set.';
  } else if (game.status === 'playing') {
    status.textContent = 'In flight · dodge meteors, collect stars.';
  } else if (game.status === 'paused') {
    overlayTitle.textContent = 'Take a breath.';
    overlayCopy.textContent = 'Flight paused. Press Resume when you’re ready.';
    status.textContent = 'Paused · choose Resume to continue.';
  } else {
    overlayTitle.textContent = 'One more flight?';
    overlayCopy.textContent = `Score ${Math.floor(game.score)} · ${game.starsCollected} stars · Best ${Math.floor(game.best)}`;
    status.textContent = `Flight over. Score ${Math.floor(game.score)}. Choose Retry to fly again.`;
  }
}

function drawStar(x, y, radius) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 ? radius * 0.45 : radius;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function draw() {
  ctx.fillStyle = '#0b1127';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const drift = reducedMotion ? 0 : game.elapsed * 12;
  for (let i = 0; i < 48; i++) {
    ctx.fillStyle = i % 3 ? '#39466a' : '#8797bd';
    ctx.fillRect((i * 79 + 17) % WIDTH, ((i * 113 + drift) % HEIGHT), i % 3 ? 1 : 2, 2);
  }
  ctx.strokeStyle = '#1c2b47';
  ctx.setLineDash([3, 12]);
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(20, HEIGHT);
  ctx.moveTo(WIDTH - 20, 0);
  ctx.lineTo(WIDTH - 20, HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const obstacle of game.obstacles) {
    ctx.fillStyle = '#fa7897';
    ctx.strokeStyle = '#ffb0c3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const r = obstacle.radius * (i % 2 ? 0.85 : 1);
      const x = obstacle.x + Math.cos(angle) * r;
      const y = obstacle.y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b94b73';
    ctx.beginPath();
    ctx.arc(obstacle.x - obstacle.radius * 0.25, obstacle.y - obstacle.radius * 0.15, obstacle.radius * 0.23, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffda81';
  for (const star of game.stars) drawStar(star.x, star.y, star.radius);
  ctx.save();
  ctx.translate(game.x, SHIP_Y);
  if (!reducedMotion && game.status === 'playing') {
    ctx.fillStyle = '#ffda81';
    ctx.beginPath();
    ctx.moveTo(-4, SHIP_RADIUS);
    ctx.lineTo(0, SHIP_RADIUS + 9 + Math.sin(game.elapsed * 18) * 3);
    ctx.lineTo(4, SHIP_RADIUS);
    ctx.fill();
  }
  ctx.fillStyle = '#77f4da';
  ctx.strokeStyle = '#c2fff0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -SHIP_RADIUS - 5);
  ctx.lineTo(SHIP_RADIUS + 4, SHIP_RADIUS);
  ctx.lineTo(0, SHIP_RADIUS - 3);
  ctx.lineTo(-SHIP_RADIUS - 4, SHIP_RADIUS);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1b5570';
  ctx.fillRect(-3, -4, 6, 8);
  ctx.restore();
}

function frame(time) {
  const dt = previousTime === null ? 0 : Math.min(Math.max((time - previousTime) / 1000, 0), 0.05);
  previousTime = time;
  controls.update(dt);
  stepGame(game, dt);
  syncUI();
  draw();
  window.requestAnimationFrame(frame);
}
syncUI();
draw();
window.requestAnimationFrame(frame);
