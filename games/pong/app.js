import { FIELD, createGame, startGame, togglePause, updateGame } from "./game.js";

const byId = (id) => document.getElementById(id);
const canvas = byId("game");
const ctx = canvas.getContext("2d");
const court = byId("court");
const mode = byId("mode");
const keys = new Set();
const touch = new Map();
let game = createGame(mode.value);
let last = 0;
let displayedState = "";

function clearInput() {
  keys.clear();
  touch.clear();
}

function reset() {
  game = createGame(mode.value);
  clearInput();
  syncUI();
}

function play() {
  if (game.phase === "won") reset();
  if (game.phase === "ready") startGame(game);
  else if (game.phase === "paused") togglePause(game);
  court.focus({ preventScroll: true });
  syncUI();
}

function pause() {
  togglePause(game);
  clearInput();
  if (game.phase === "playing") court.focus({ preventScroll: true });
  syncUI();
}

function syncUI() {
  const state = [game.phase, ...game.scores, game.mode, game.serveTimer > 0].join(":");
  if (state === displayedState) return;
  displayedState = state;
  const rightName = game.mode === "solo" ? "CPU" : "PLAYER 02";
  byId("right-name").textContent = rightName;
  byId("left-score").textContent = String(game.scores[0]).padStart(2, "0");
  byId("right-score").textContent = String(game.scores[1]).padStart(2, "0");
  byId("pause").disabled = !["playing", "paused"].includes(game.phase);
  byId("pause").firstChild.textContent = game.phase === "paused" ? "Resume " : "Pause ";
  byId("overlay").hidden = game.phase === "playing";
  let message;
  if (game.phase === "ready") {
    byId("overlay-kicker").textContent = "READY WHEN YOU ARE";
    byId("overlay-title").textContent = "LET'S PLAY.";
    byId("overlay-text").textContent = game.mode === "solo"
      ? "Take the left paddle. Outplay the machine." : "Grab a friend. Settle it on the court.";
    byId("play").firstChild.textContent = "Start match ";
    message = "Ready · Choose your mode and start a match.";
  } else if (game.phase === "paused") {
    byId("overlay-kicker").textContent = "TAKE A BREATHER";
    byId("overlay-title").textContent = "PAUSED.";
    byId("overlay-text").textContent = "Your rally will be right here.";
    byId("play").firstChild.textContent = "Resume match ";
    message = "Paused · Press P or select Resume.";
  } else if (game.phase === "won") {
    const winner = game.winner === 0 ? "PLAYER 01" : rightName;
    byId("overlay-kicker").textContent = "THAT'S A MATCH";
    byId("overlay-title").textContent = `${winner} WINS!`;
    byId("overlay-text").textContent = `${game.scores[0]} — ${game.scores[1]} · One more round?`;
    byId("play").firstChild.textContent = "Play again ";
    message = `${winner} wins! Final score ${game.scores[0]} to ${game.scores[1]}.`;
  } else {
    message = game.serveTimer > 0 ? "Point scored · Next serve in a moment." : "Match live · Keep the rally going.";
    message += ` Score ${game.scores[0]} to ${game.scores[1]}.`;
  }
  byId("status").textContent = message;
  document.querySelectorAll('[data-control^="arrow"]').forEach((button) => {
    button.disabled = game.mode === "solo";
  });
}

function draw() {
  ctx.fillStyle = "#091218";
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.strokeStyle = "#23353e";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  ctx.moveTo(FIELD.width / 2, 16);
  ctx.lineTo(FIELD.width / 2, FIELD.height - 16);
  ctx.stroke();
  ctx.setLineDash([]);
  ["#b5f56a", "#ffac73"].forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(index === 0 ? FIELD.inset : FIELD.width - FIELD.inset - FIELD.paddleWidth,
      game.paddles[index], FIELD.paddleWidth, FIELD.paddleHeight);
  });
  ctx.fillStyle = "#edf4ed";
  ctx.fillRect(game.ball.x - FIELD.radius, game.ball.y - FIELD.radius, FIELD.radius * 2, FIELD.radius * 2);
}

function frame(timestamp) {
  const dt = last ? Math.min((timestamp - last) / 1000, 0.05) : 0;
  last = timestamp;
  const pressed = (key) => keys.has(key) || [...touch.values()].includes(key);
  updateGame(game, {
    left: Number(pressed("s")) - Number(pressed("w")),
    right: Number(pressed("arrowdown")) - Number(pressed("arrowup")),
  }, dt);
  syncUI();
  draw();
  requestAnimationFrame(frame);
}

byId("play").addEventListener("click", play);
byId("pause").addEventListener("click", pause);
byId("restart").addEventListener("click", reset);
mode.addEventListener("change", reset);

document.addEventListener("keydown", (event) => {
  if (event.target.closest("button, select, input, textarea, a") || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (!["w", "s", "arrowup", "arrowdown", " ", "p", "r"].includes(key)) return;
  event.preventDefault();
  if (event.repeat) return;
  if (key === "r") reset();
  else if (key === " " || key === "p") {
    if (key === " " && ["ready", "won"].includes(game.phase)) play();
    else pause();
  } else keys.add(key);
});
document.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
document.querySelectorAll("[data-control]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    if (button.disabled) return;
    button.setPointerCapture(event.pointerId);
    touch.set(event.pointerId, button.dataset.control);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((name) => {
    button.addEventListener(name, (event) => touch.delete(event.pointerId));
  });
});
function suspend() {
  clearInput();
  if (game.phase === "playing") pause();
  last = 0;
}
window.addEventListener("blur", suspend);
document.addEventListener("visibilitychange", () => { if (document.hidden) suspend(); });
syncUI();
requestAnimationFrame(frame);
