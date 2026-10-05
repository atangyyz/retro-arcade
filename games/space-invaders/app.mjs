import { Game, WIDTH, HEIGHT } from "./game.mjs";

const game = new Game();
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const ui = Object.fromEntries(
  ["score", "wave", "lives", "toggle", "restart", "mode", "overlay",
    "overlay-label", "overlay-title", "overlay-detail", "announcement"]
    .map(id => [id, document.getElementById(id)])
);
const keys = new Set();
const pointers = new Map();
const controls = [...document.querySelectorAll("[data-control]")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastTime = null;
let lastSummary = "";

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

function updateUI() {
  ui.score.textContent = String(game.score).padStart(6, "0");
  ui.wave.textContent = String(game.wave).padStart(2, "0");
  ui.lives.textContent = game.lives;
  const summary = `${game.status}:${game.wave}:${game.lives}`;
  if (summary === lastSummary) return;
  lastSummary = summary;
  const messages = {
    ready: ["Incoming transmission", "DEFEND THE EARTH", "Move. Aim. Hold fire. Don't let them land.", "Start game", "Awaiting pilot"],
    playing: ["", "", "", "Pause", "Defense online"],
    paused: ["Transmission on hold", "GAME PAUSED", "Take a breath. Your sector can wait.", "Resume", "Paused"],
    gameover: ["Signal lost", "GAME OVER", `Final score: ${game.score}. Reboot and defend again.`, "Play again", "Mission ended"]
  };
  const [label, title, detail, action, mode] = messages[game.status];
  ui.overlay.hidden = game.status === "playing";
  ui["overlay-label"].textContent = label;
  ui["overlay-title"].textContent = title;
  ui["overlay-detail"].textContent = detail;
  ui.toggle.textContent = action;
  ui.mode.textContent = mode;
  ui.announcement.textContent = `${mode}. Wave ${game.wave}. ${game.lives} lives. Score ${game.score}.`;
}

function toggleGame() {
  clearInput();
  if (game.status === "playing") game.pause();
  else if (game.status === "paused") game.resume();
  else game.start();
  updateUI();
  if (game.status === "playing") canvas.focus({ preventScroll: true });
}

function restartGame() {
  clearInput();
  game.start();
  updateUI();
  canvas.focus({ preventScroll: true });
}

ui.toggle.addEventListener("click", toggleGame);
ui.restart.addEventListener("click", restartGame);

const moveKeys = ["ArrowLeft", "ArrowRight", "a", "d", "A", "D", " "];
window.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // Preserve Space/Enter activation of native buttons.
  if (event.target.closest("button") && (event.key === " " || event.key === "Enter")) return;
  if (moveKeys.includes(event.key)) {
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
  game.update(dt, {
    left: keys.has("ArrowLeft".toLowerCase()) || keys.has("a") || held.has("left"),
    right: keys.has("ArrowRight".toLowerCase()) || keys.has("d") || held.has("right"),
    fire: keys.has(" ") || held.has("fire")
  });
  updateUI();
  draw(time);
  requestAnimationFrame(frame);
}

updateUI();
requestAnimationFrame(frame);
