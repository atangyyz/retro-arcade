export const WIDTH = 360;
export const HEIGHT = 540;
export const SHIP_Y = 470;
export const SHIP_RADIUS = 11;
export const MOVE_SPEED = 320;

const LANE_WIDTH = 40;
const LANES = WIDTH / LANE_WIDTH;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function createGame({ best = 0, random = Math.random } = {}) {
  return {
    status: 'ready', x: WIDTH / 2, targetX: WIDTH / 2,
    elapsed: 0, score: 0, best: Number.isSafeInteger(best) && best >= 0 ? best : 0,
    starsCollected: 0, obstacles: [], stars: [], speed: 100,
    nextWave: 0.9, gap: 3, random
  };
}

export function startGame(game) {
  Object.assign(game, createGame({ best: game.best, random: game.random }), { status: 'playing' });
}

export function setTarget(game, x) {
  if (Number.isFinite(x)) game.targetX = clamp(x, SHIP_RADIUS, WIDTH - SHIP_RADIUS);
}

export function togglePause(game) {
  if (game.status === 'playing') game.status = 'paused';
  else if (game.status === 'paused') game.status = 'playing';
}

function spawnWave(game) {
  const roll = clamp(game.random(), 0, 0.999999);
  game.gap = clamp(game.gap + Math.floor(roll * 3) - 1, 0, LANES - 2);
  for (let lane = 0; lane < LANES; lane++) {
    if (lane === game.gap || lane === game.gap + 1) continue;
    game.obstacles.push({ x: (lane + 0.5) * LANE_WIDTH, y: -24, radius: 17 });
  }
  game.stars.push({ x: (game.gap + 1) * LANE_WIDTH, y: -24, radius: 9 });
}

function touchesShip(game, object) {
  return Math.hypot(game.x - object.x, SHIP_Y - object.y) <= SHIP_RADIUS + object.radius;
}

function updateScore(game) {
  game.score = Math.floor(game.elapsed * 10) + game.starsCollected * 50;
  game.best = Math.max(game.best, game.score);
}

export function stepGame(game, seconds) {
  if (game.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
  // Small fixed substeps prevent fast objects tunneling through the ship.
  let remaining = Math.min(seconds, 0.25);
  while (remaining > 0 && game.status === 'playing') {
    const dt = Math.min(remaining, 1 / 120);
    remaining -= dt;
    game.elapsed += dt;
    game.speed = Math.min(270, 100 + game.elapsed * 2.8);
    game.x += clamp(game.targetX - game.x, -MOVE_SPEED * dt, MOVE_SPEED * dt);
    game.nextWave -= dt;
    if (game.nextWave <= 0) {
      spawnWave(game);
      game.nextWave += Math.max(1.05, 1.8 - game.elapsed * 0.0125);
    }
    // All rows share a speed, so later waves cannot overtake earlier ones.
    for (const object of [...game.obstacles, ...game.stars]) object.y += game.speed * dt;
    if (game.obstacles.some(object => touchesShip(game, object))) {
      game.status = 'gameover';
    } else {
      game.stars = game.stars.filter(star => {
        if (!touchesShip(game, star)) return true;
        game.starsCollected++;
        return false;
      });
    }
    game.obstacles = game.obstacles.filter(object => object.y - object.radius <= HEIGHT);
    game.stars = game.stars.filter(object => object.y - object.radius <= HEIGHT);
    updateScore(game);
  }
}
