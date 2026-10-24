import {
  WIDTH, HEIGHT, SHIP_Y, SHIP_RADIUS,
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
const arcade = document.querySelector('.arcade');
const game = createGame({ best: readBest(window) });
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
let lastStatus = '';
let savedBest = game.best;
let previousTime = null;
let pendingAction = null;
let nativeFullscreen = false;

function enterFlightView() {
  arcade.classList.add('flight-mode');
  document.body.classList.add('in-flight');
  if (!document.fullscreenElement && arcade.requestFullscreen) {
    try {
      Promise.resolve(arcade.requestFullscreen()).catch(() => {});
    } catch {
      // The viewport layout still works when fullscreen is unavailable.
    }
  }
}

function leaveFlightView() {
  arcade.classList.remove('flight-mode');
  document.body.classList.remove('in-flight');
  if (document.fullscreenElement === arcade && document.exitFullscreen) {
    try { Promise.resolve(document.exitFullscreen()).catch(() => {}); } catch { /* Keep the viewport fallback usable. */ }
  }
}

function flyWhenReady() {
  const action = pendingAction;
  pendingAction = null;
  if (action === 'start') startGame(game);
  else if (action === 'resume' && game.status === 'paused') togglePause(game);
  else return;
  controls.reset();
  previousTime = null;
  syncUI();
  canvas.focus({ preventScroll: true });
}

function begin() {
  if (pendingAction || (game.status !== 'ready' && game.status !== 'gameover')) return;
  pendingAction = 'start';
  syncUI();
  controls.requestTilt();
  if (pendingAction || game.status === 'playing') enterFlightView();
}

function pauseGame(toggle = false) {
  if (toggle && game.status === 'paused') {
    if (pendingAction) return;
    pendingAction = 'resume';
    syncUI();
    controls.requestTilt();
    if (pendingAction || game.status === 'playing') enterFlightView();
  } else if (game.status === 'playing') {
    togglePause(game);
    controls.reset();
    previousTime = null;
    syncUI();
    if (game.status === 'playing') canvas.focus({ preventScroll: true });
  }
}

const controls = installControls({
  win: window, doc: document, canvas,
  recalibrateButton: document.getElementById('recalibrate'),
  width: WIDTH,
  getX: () => game.x,
  isPlaying: () => game.status === 'playing',
  onTarget: x => setTarget(game, x),
  onPause: pauseGame,
  onStart: begin,
  onStatus: message => { controlStatus.textContent = message; },
  onReady: flyWhenReady,
  onUnavailable: () => {
    pendingAction = null;
    pauseGame();
    syncUI();
    if (game.status === 'ready' || game.status === 'gameover') leaveFlightView();
  },
});
start.addEventListener('click', begin);
pause.addEventListener('click', () => pauseGame(true));

function exitFlight() {
  pendingAction = null;
  controls.cancel();
  pauseGame();
  leaveFlightView();
  syncUI();
  (game.status === 'paused' ? pause : start).focus({ preventScroll: true });
}
document.getElementById('exit-flight').addEventListener('click', exitFlight);
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement === arcade) nativeFullscreen = true;
  else if (nativeFullscreen) {
    nativeFullscreen = false;
    exitFlight();
  }
});

function syncUI() {
  score.textContent = String(Math.floor(game.score));
  stars.textContent = String(game.starsCollected);
  best.textContent = String(Math.floor(game.best));
  if (game.best > savedBest) {
    savedBest = game.best;
    writeBest(window, game.best);
  }
  start.disabled = pendingAction !== null || game.status === 'playing' || game.status === 'paused';
  start.textContent = pendingAction === 'start' ? 'Waiting for tilt…' : game.status === 'gameover' ? 'Retry flight' : 'Start flight';
  pause.disabled = pendingAction !== null || game.status === 'ready' || game.status === 'gameover';
  pause.textContent = pendingAction === 'resume' ? 'Waiting for tilt…' : game.status === 'paused' ? 'Resume' : 'Pause';
  const uiStatus = pendingAction ? 'calibrating' : game.status;
  if (lastStatus === uiStatus) return;
  lastStatus = uiStatus;
  overlay.hidden = game.status === 'playing';
  if (pendingAction) {
    overlayTitle.textContent = 'Hold steady.';
    overlayCopy.textContent = 'Allow motion access and hold your device comfortably to center tilt.';
    status.textContent = 'Waiting for tilt · flight starts only when your sensor is ready.';
    return;
  }
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
