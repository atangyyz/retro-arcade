import { AsteroidsGame, WORLD_WIDTH, WORLD_HEIGHT } from "./game.js";

const game = new AsteroidsGame();
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const overlay = document.querySelector("#overlay");
const title = document.querySelector("#overlay-title");
const description = document.querySelector("#overlay-description");
const kicker = document.querySelector("#overlay-kicker");
const startButton = document.querySelector("#start-button");
const pauseButton = document.querySelector("#pause-button");
const soundButton = document.querySelector("#sound-button");
const announcer = document.querySelector("#announcer");
const waveBanner = document.querySelector("#wave-banner");
const scoreDisplay = document.querySelector("#score");
const highScoreDisplay = document.querySelector("#high-score");
const waveDisplay = document.querySelector("#wave");
const livesDisplay = document.querySelector("#lives");
const flightStatus = document.querySelector("#flight-status");
const hint = document.querySelector("#overlay-hint");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const keys = new Set();
const pointers = new Map();
const controlKeys = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "thrust", KeyW: "thrust", Space: "fire" };
const stars = Array.from({ length: 100 }, () => ({ x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT, radius: Math.random() < .85 ? 1 : 1.7, alpha: .15 + Math.random() * .5 }));
let highScore = 0;
let storageAvailable = true;
let soundEnabled = false;
let audio;
let bannerTime = 0;
let previousState = "";

try {
  const saved = Number(localStorage.getItem("orbit-arcade.high-score"));
  if (Number.isSafeInteger(saved) && saved >= 0) highScore = saved;
} catch {
  storageAvailable = false;
}

function announce(message) {
  announcer.textContent = message;
}

function clearInput() {
  keys.clear();
  pointers.clear();
  document.querySelectorAll("[data-control]").forEach(button => button.classList.remove("active"));
}

function enableAudio() {
  if (!soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error("Audio unavailable");
    audio ??= new AudioContext();
    audio.resume().catch(() => {});
  } catch {
    soundEnabled = false;
    soundButton.textContent = "SOUND UNAVAILABLE";
    soundButton.setAttribute("aria-pressed", "false");
    soundButton.disabled = true;
  }
}

function beep(type) {
  if (!soundEnabled || !audio || audio.state !== "running") return;
  const settings = { fire: [700, 180, .07], hit: [110, 40, .12], death: [160, 25, .4], wave: [300, 600, .2] }[type];
  if (!settings) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type === "fire" || type === "wave" ? "triangle" : "sawtooth";
  oscillator.frequency.setValueAtTime(settings[0], audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(settings[1], audio.currentTime + settings[2]);
  gain.gain.setValueAtTime(.045, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + settings[2]);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + settings[2]);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

function launch() {
  enableAudio();
  clearInput();
  if (game.state === "paused") game.togglePause();
  else game.start();
  syncInterface();
  canvas.focus({ preventScroll: true });
}

function pause() {
  clearInput();
  game.togglePause();
  syncInterface();
  if (game.state === "paused") startButton.focus({ preventScroll: true });
  else if (game.state === "playing") canvas.focus({ preventScroll: true });
}

startButton.addEventListener("click", launch);
pauseButton.addEventListener("click", pause);
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.textContent = soundEnabled ? "SOUND ON" : "SOUND OFF";
  enableAudio();
  if (soundEnabled) beep("wave");
  if (game.state === "playing") canvas.focus({ preventScroll: true });
});

window.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest("input, textarea, select")) return;
  if (["Escape", "KeyP"].includes(event.code)) {
    event.preventDefault();
    if (!event.repeat && ["playing", "paused"].includes(game.state)) pause();
    return;
  }
  if (event.target.closest("button, a")) return;
  if (!controlKeys[event.code]) return;
  event.preventDefault();
  if (event.code === "Space" && game.state !== "playing" && !event.repeat) {
    launch();
    return;
  }
  if (game.state === "playing") keys.add(event.code);
});
window.addEventListener("keyup", event => keys.delete(event.code));

for (const button of document.querySelectorAll("[data-control]")) {
  button.addEventListener("pointerdown", event => {
    if (game.state !== "playing") return;
    event.preventDefault();
    enableAudio();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button.dataset.control);
    button.classList.add("active");
  });
  const release = event => {
    pointers.delete(event.pointerId);
    if (![...pointers.values()].includes(button.dataset.control)) button.classList.remove("active");
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("contextmenu", event => event.preventDefault());
}

function suspend() {
  clearInput();
  if (game.state === "playing") {
    game.togglePause();
    syncInterface();
  }
}
window.addEventListener("blur", suspend);
document.addEventListener("visibilitychange", () => { if (document.hidden) suspend(); });

function syncInterface() {
  scoreDisplay.textContent = String(game.score).padStart(6, "0");
  if (game.score > highScore) {
    highScore = game.score;
    if (storageAvailable) {
      try { localStorage.setItem("orbit-arcade.high-score", String(highScore)); }
      catch { storageAvailable = false; }
    }
  }
  highScoreDisplay.textContent = String(highScore).padStart(6, "0");
  highScoreDisplay.title = storageAvailable ? "Saved on this browser" : "Storage unavailable; best score lasts for this session";
  waveDisplay.textContent = String(game.wave).padStart(2, "0");
  livesDisplay.textContent = game.lives > 0 ? Array(game.lives).fill("△").join(" ") : "—";
  livesDisplay.setAttribute("aria-label", `${game.lives} ${game.lives === 1 ? "life" : "lives"}`);
  if (previousState === game.state) return;
  previousState = game.state;
  overlay.hidden = game.state === "playing";
  pauseButton.disabled = !["playing", "paused"].includes(game.state);
  pauseButton.textContent = game.state === "paused" ? "RESUME ▷" : "PAUSE Ⅱ";
  flightStatus.textContent = { ready: "AWAITING PILOT", playing: "FLIGHT IN PROGRESS", paused: "FLIGHT PAUSED", gameover: "SIGNAL LOST" }[game.state];
  hint.hidden = game.state !== "ready";
  if (game.state === "paused") {
    kicker.textContent = "TAKE A BREATHER, PILOT";
    title.textContent = "Holding orbit.";
    description.textContent = "Your flight is paused. Ready when you are.";
    startButton.textContent = "RESUME FLIGHT ↗";
    announce("Game paused. Select Resume flight to continue.");
  } else if (game.state === "gameover") {
    clearInput();
    kicker.textContent = game.score > 0 && game.score === highScore ? "PERSONAL BEST. NICELY FLOWN." : "EVERY END IS A NEW BEGINNING";
    title.textContent = "Lost in space.";
    description.textContent = `Score ${game.score.toLocaleString()} · Wave ${game.wave}. Another run at the stars?`;
    startButton.textContent = "PLAY AGAIN ↗";
    announce(`Game over. Score ${game.score}. Wave ${game.wave}. Select Play again to restart.`);
    startButton.focus({ preventScroll: true });
  } else if (game.state === "playing") {
    announce(`Flight started. Wave ${game.wave}. ${game.lives} lives.`);
  }
}

function drawWrapped(body, radius, draw) {
  const xs = [0], ys = [0];
  if (body.x < radius) xs.push(WORLD_WIDTH);
  if (body.x > WORLD_WIDTH - radius) xs.push(-WORLD_WIDTH);
  if (body.y < radius) ys.push(WORLD_HEIGHT);
  if (body.y > WORLD_HEIGHT - radius) ys.push(-WORLD_HEIGHT);
  for (const x of xs) for (const y of ys) {
    ctx.save();
    ctx.translate(body.x + x, body.y + y);
    draw();
    ctx.restore();
  }
}

function render(time) {
  ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  for (const star of stars) {
    ctx.fillStyle = `rgba(180, 210, 232, ${star.alpha})`;
    ctx.fillRect(star.x, star.y, star.radius, star.radius);
  }
  ctx.lineWidth = 1.8;
  for (const rock of game.asteroids) {
    drawWrapped(rock, rock.radius, () => {
      ctx.rotate(rock.angle);
      ctx.strokeStyle = "#7c9baf";
      ctx.fillStyle = "#101c2980";
      ctx.beginPath();
      rock.vertices.forEach((vertex, i) => {
        const angle = i / rock.vertices.length * Math.PI * 2;
        const x = Math.cos(angle) * rock.radius * vertex;
        const y = Math.sin(angle) * rock.radius * vertex;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }
  if (!reducedMotion.matches) {
    for (const particle of game.particles) {
      ctx.globalAlpha = Math.min(1, particle.life * 2);
      ctx.fillStyle = particle.color === "mint" ? "#a8f5ce" : "#f6c785";
      ctx.fillRect(particle.x, particle.y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "#d4ffe8";
  ctx.shadowColor = "#a8f5ce";
  ctx.shadowBlur = 8;
  for (const bullet of game.bullets) {
    drawWrapped(bullet, 4, () => {
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  const ship = game.ship;
  if (ship.active && ["playing", "paused"].includes(game.state)) {
    drawWrapped(ship, 24, () => {
      ctx.rotate(ship.angle);
      ctx.strokeStyle = ship.invulnerable > 0 ? "#d9e9f5" : "#a8f5ce";
      ctx.globalAlpha = ship.invulnerable > 0 && !reducedMotion.matches ? .5 + .5 * Math.abs(Math.sin(time * 8)) : 1;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-12, -11);
      ctx.lineTo(-7, 0);
      ctx.lineTo(-12, 11);
      ctx.closePath();
      ctx.stroke();
      if (ship.thrusting) {
        ctx.strokeStyle = "#f6c785";
        ctx.beginPath();
        ctx.moveTo(-13, -6);
        ctx.lineTo(reducedMotion.matches ? -25 : -22 - Math.sin(time * 30) * 5, 0);
        ctx.lineTo(-13, 6);
        ctx.stroke();
      }
      if (ship.invulnerable > 0) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#a8f5ce35";
        ctx.beginPath();
        ctx.arc(0, 0, 27, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }
  ctx.shadowBlur = 0;
  waveBanner.hidden = bannerTime <= 0 || game.state !== "playing";
}

let lastTime;
let accumulator = 0;
function frame(timestamp) {
  const elapsed = lastTime === undefined ? 0 : Math.min((timestamp - lastTime) / 1000, .1);
  lastTime = timestamp;
  accumulator += elapsed;
  const input = {};
  for (const key of keys) input[controlKeys[key]] = true;
  for (const control of pointers.values()) input[control] = true;
  while (accumulator >= 1 / 120) {
    if (game.state !== "paused") bannerTime = Math.max(0, bannerTime - 1 / 120);
    game.update(1 / 120, input);
    accumulator -= 1 / 120;
  }
  for (const event of game.events.splice(0)) {
    beep(event.type);
    if (event.type === "wave") {
      bannerTime = 2;
      waveBanner.textContent = `WAVE ${String(event.wave).padStart(2, "0")}`;
      announce(`Wave ${event.wave}. Clear all asteroids.`);
    } else if (event.type === "death" && event.lives > 0) {
      announce(`${event.lives} ${event.lives === 1 ? "life" : "lives"} remaining. Respawning with a temporary shield.`);
    }
  }
  syncInterface();
  render(timestamp / 1000);
  requestAnimationFrame(frame);
}
syncInterface();
requestAnimationFrame(frame);
