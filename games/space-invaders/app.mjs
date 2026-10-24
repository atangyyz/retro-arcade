import { Game, WIDTH, HEIGHT } from "./game.mjs";
import { detectControlMode, installTilt } from "./controls.mjs";

const game = new Game();
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const ui = Object.fromEntries(
  ["score", "wave", "lives", "toggle", "restart", "mode", "overlay",
    "overlay-label", "overlay-title", "overlay-detail", "overlay-hint", "announcement", "exit-flight"]
    .map(id => [id, document.getElementById(id)])
);
const keys = new Set();
const pointers = new Map();
const controls = [...document.querySelectorAll("[data-control]")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const arcade = document.querySelector(".arcade");
const controlMode = detectControlMode(window);
const TILT_RANGE = 50;
let lastTime = null;
let lastSummary = "";
let fallback = false;
let pendingAction = null;
let originX = WIDTH / 2;
let nativeFullscreen = false;
let fallbackReason = "";

const sprites = [
  ["00100100", "00011000", "00111100", "01111110", "11011011", "11111111", "00100100", "01011010"],
  ["00111100", "11111111", "11011011", "11111111", "01111110", "00100100", "01000010", "10000001"],
  ["00011000", "00111100", "01111110", "11011011", "11111111", "01011010", "10000001", "01000010"]
];

function clearInput() {
  keys.clear();
  pointers.clear();
  controls.forEach(button => button.classList.remove("held"));
}

const tilt = controlMode === "tilt" ? installTilt({
  win: window,
  doc: document,
  onReady: flyWhenReady,
  onUnavailable: message => {
    fallback = true;
    fallbackReason = message;
    pendingAction = null;
    document.body.classList.add("tilt-fallback");
    lastSummary = "";
    updateUI();
  },
  onRotate: () => {
    if (game.status === "playing") game.pause();
    lastTime = null;
    updateUI();
  }
}) : null;
document.body.classList.add(controlMode === "tilt" ? "tilt-controls" : "keyboard-controls");
if (tilt && !tilt.available) {
  fallback = true;
  fallbackReason = "Tilt needs HTTPS and a motion sensor.";
  document.body.classList.add("tilt-fallback");
}
const tiltActive = () => tilt !== null && !fallback;

function controlHint() {
  if (controlMode === "keyboard") return "⌨️ Keyboard: ← → or A / D to move · hold Space to fire";
  if (fallback) return `${fallbackReason} Hold ◀ ▶ to move and Fire to shoot.`;
  return "📱 Tilt to move · hold Fire to shoot · full screen, best held sideways";
}

function enterFlightView() {
  if (controlMode !== "tilt") return;
  arcade.classList.add("flight-mode");
  document.body.classList.add("in-flight");
  if (!document.fullscreenElement && arcade.requestFullscreen) {
    try {
      Promise.resolve(arcade.requestFullscreen()).catch(() => {});
    } catch {
      // The fixed viewport layout still works without native fullscreen.
    }
  }
}

function leaveFlightView() {
  arcade.classList.remove("flight-mode");
  document.body.classList.remove("in-flight");
  if (document.fullscreenElement === arcade && document.exitFullscreen) {
    try { Promise.resolve(document.exitFullscreen()).catch(() => {}); } catch { /* Viewport layout already restored. */ }
  }
}

function perform(action) {
  if (action === "resume") game.resume();
  else game.start();
  originX = game.player.x + game.player.w / 2;
  lastTime = null;
  updateUI();
  if (game.status === "playing") canvas.focus({ preventScroll: true });
}

function flyWhenReady() {
  const action = pendingAction;
  pendingAction = null;
  if (action) perform(action);
}

function launch(action) {
  if (tiltActive()) {
    pendingAction = action;
    tilt.request();
    if (pendingAction) enterFlightView();
    updateUI();
    return;
  }
  enterFlightView();
  perform(action);
}

function updateUI() {
  ui.score.textContent = String(game.score).padStart(6, "0");
  ui.wave.textContent = String(game.wave).padStart(2, "0");
  ui.lives.textContent = game.lives;
  const summary = `${game.status}:${game.wave}:${game.lives}:${pendingAction}:${fallback}`;
  if (summary === lastSummary) return;
  lastSummary = summary;
  const messages = {
    ready: ["Incoming transmission", "DEFEND THE EARTH", "Move. Aim. Hold fire. Don't let them land.", "Start game", "Awaiting pilot"],
    playing: ["", "", "", "Pause", "Defense online"],
    paused: ["Transmission on hold", "GAME PAUSED", "Take a breath. Your sector can wait.", "Resume", "Paused"],
    gameover: ["Signal lost", "GAME OVER", `Final score: ${game.score}. Reboot and defend again.`, "Play again", "Mission ended"]
  };
  let [label, title, detail, action, mode] = messages[game.status];
  if (pendingAction) {
    [label, title, detail, action, mode] = ["Calibrating", "HOLD STEADY", "Allow motion access, then hold your device comfortably.", "Waiting for tilt…", "Waiting for tilt"];
  }
  ui.toggle.disabled = pendingAction !== null;
  ui["overlay-hint"].textContent = controlHint();
  ui.overlay.hidden = game.status === "playing" && !pendingAction;
  ui["overlay-label"].textContent = label;
  ui["overlay-title"].textContent = title;
  ui["overlay-detail"].textContent = detail;
  ui.toggle.textContent = action;
  ui.mode.textContent = mode;
  ui.announcement.textContent = `${mode}. Wave ${game.wave}. ${game.lives} lives. Score ${game.score}.`;
}

function toggleGame() {
  clearInput();
  if (pendingAction) return;
  if (game.status === "playing") {
    game.pause();
    updateUI();
  } else {
    launch(game.status === "paused" ? "resume" : "start");
  }
}

function restartGame() {
  clearInput();
  if (pendingAction) return;
  if (game.status === "playing") game.pause();
  launch("start");
}

function exitFlight() {
  autoPause();
  leaveFlightView();
  ui.toggle.focus({ preventScroll: true });
}
ui["exit-flight"].addEventListener("click", exitFlight);
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement === arcade) {
    if (!arcade.classList.contains("flight-mode")) leaveFlightView();
    else nativeFullscreen = true;
  } else if (nativeFullscreen) {
    nativeFullscreen = false;
    exitFlight();
  }
});

ui.toggle.addEventListener("click", toggleGame);
ui.restart.addEventListener("click", restartGame);

const steerKeys = ["ArrowLeft", "ArrowRight", "a", "d", "A", "D"];
window.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // Preserve Space/Enter activation of native buttons.
  if (event.target.closest("button") && (event.key === " " || event.key === "Enter")) return;
  if (event.key === " " || (steerKeys.includes(event.key) && !tiltActive())) {
    event.preventDefault();
    keys.add(event.key.toLowerCase());
  }
  if (event.repeat) return;
  if (["p", "P", "Escape"].includes(event.key)) {
    event.preventDefault();
    toggleGame();
  } else if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    restartGame();
  }
});
window.addEventListener("keyup", event => keys.delete(event.key.toLowerCase()));

for (const button of controls) {
  button.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button.dataset.control);
    button.classList.add("held");
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (![...pointers.values()].includes(button.dataset.control)) button.classList.remove("held");
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  // Native keyboard and assistive-technology button activation.
  button.addEventListener("click", event => {
    if (event.detail === 0 && game.status === "playing") {
      game.update(1 / 30, { [button.dataset.control]: true });
      updateUI();
    }
  });
}

function autoPause() {
  clearInput();
  if (pendingAction) {
    pendingAction = null;
    tilt?.cancel();
  }
  if (game.status === "playing") game.pause();
  lastTime = null;
  updateUI();
}
window.addEventListener("blur", autoPause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) autoPause();
});

function drawSprite(sprite, x, y, w, h, color) {
  ctx.fillStyle = color;
  sprite.forEach((row, iy) => {
    [...row].forEach((pixel, ix) => {
      if (pixel === "1") ctx.fillRect(Math.round(x + ix * w / 8), Math.round(y + iy * h / 8), Math.ceil(w / 8), Math.ceil(h / 8));
    });
  });
}

function draw(time) {
  ctx.fillStyle = "#060b17";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (let i = 0; i < 75; i++) {
    const x = (i * 137 + 31) % WIDTH;
    const y = (i * 89 + 17) % HEIGHT;
    ctx.fillStyle = i % 4 ? "#34475f" : "#7491a9";
    ctx.fillRect(x, y, i % 4 ? 1 : 2, i % 4 ? 1 : 2);
  }
  ctx.strokeStyle = "#213e45";
  ctx.beginPath();
  ctx.moveTo(18, HEIGHT - 22);
  ctx.lineTo(WIDTH - 18, HEIGHT - 22);
  ctx.stroke();
  for (const alien of game.aliens) {
    if (alien.alive) drawSprite(sprites[alien.row % 3], alien.x, alien.y, alien.w, alien.h, ["#ffc36c", "#aa9cff", "#79ffbc"][alien.row % 3]);
  }
  const p = game.player;
  if (p && (reducedMotion || p.invulnerable <= 0 || Math.floor(time / 110) % 2 === 0)) {
    drawSprite(["00011000", "00011000", "00111100", "00111100", "11111111", "11111111", "11111111", "11000011"], p.x, p.y, p.w, p.h, p.invulnerable > 0 ? "#e2eff5" : "#79ffbc");
  }
  ctx.fillStyle = "#b6ffdb";
  game.playerShots.forEach(shot => ctx.fillRect(shot.x, shot.y, shot.w, shot.h));
  ctx.fillStyle = "#ff8d8d";
  game.enemyShots.forEach(shot => ctx.fillRect(shot.x, shot.y, shot.w, shot.h));
  if (game.status === "playing" && game.waveDelay > 0) {
    ctx.fillStyle = "#79ffbc";
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.fillText("SECTOR CLEARED", WIDTH / 2, HEIGHT / 2);
  }
}

function frame(time) {
  const dt = lastTime === null ? 0 : (time - lastTime) / 1000;
  lastTime = time;
  const held = new Set(pointers.values());
  const input = { fire: keys.has(" ") || held.has("fire") };
  if (tiltActive()) {
    const offset = game.status === "playing" ? tilt.offset(dt) : null;
    if (offset !== null) input.targetX = originX + offset * WIDTH / TILT_RANGE;
  } else {
    input.left = keys.has("arrowleft") || keys.has("a") || held.has("left");
    input.right = keys.has("arrowright") || keys.has("d") || held.has("right");
  }
  game.update(dt, input);
  updateUI();
  draw(time);
  requestAnimationFrame(frame);
}

updateUI();
requestAnimationFrame(frame);
