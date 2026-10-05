export const COLS = 11;
export const ROWS = 13;
export const GOALS = [1, 3, 5, 7, 9];
export const LANES = [
  { row: 1, kind: 'log', speed: 0.7, length: 2.7, gap: 1.5, offset: 0 },
  { row: 2, kind: 'log', speed: -0.9, length: 2.1, gap: 1.3, offset: 0.8 },
  { row: 3, kind: 'log', speed: 1.1, length: 2.6, gap: 1.8, offset: 1.7 },
  { row: 4, kind: 'log', speed: -0.8, length: 2.8, gap: 1.4, offset: 0.3 },
  { row: 5, kind: 'log', speed: 0.65, length: 2.4, gap: 1.3, offset: 0 },
  { row: 7, kind: 'car', speed: -1.3, length: 1.4, gap: 2.6, offset: 1.2 },
  { row: 8, kind: 'car', speed: 1.6, length: 0.9, gap: 2.3, offset: 0 },
  { row: 9, kind: 'car', speed: -1.1, length: 1.8, gap: 2.4, offset: 2 },
  { row: 10, kind: 'car', speed: 1.8, length: 0.9, gap: 2.5, offset: 1.1 },
  { row: 11, kind: 'car', speed: -1.2, length: 1.2, gap: 2.8, offset: 0 },
];

export function createGame() {
  return {
    status: 'ready', score: 0, lives: 3, level: 1, time: 35,
    elapsed: 0, goals: GOALS.map(() => false),
    frog: { x: 5.5, row: 12 }, furthest: 12, cooldown: 0,
    message: 'Ready to cross. Select Start game.',
  };
}

export function startGame(game) {
  Object.assign(game, createGame(), { status: 'playing', message: 'Reach an empty lily pad!' });
}

export function togglePause(game) {
  if (game.status === 'playing') {
    game.status = 'paused';
    game.message = 'Paused. Resume when you are ready.';
  } else if (game.status === 'paused') {
    game.status = 'playing';
    game.message = 'Back to the crossing!';
  }
}

export function speedMultiplier(game) {
  return 1 + (game.level - 1) * 0.18;
}

export function laneObjects(game, lane) {
  const period = lane.length + lane.gap;
  const offset = ((lane.offset + game.elapsed * lane.speed * speedMultiplier(game)) % period + period) % period;
  const objects = [];
  for (let x = offset - period; x < COLS; x += period) {
    objects.push({ x, length: lane.length });
  }
  return objects;
}

function respawn(game) {
  game.frog = { x: 5.5, row: 12 };
  game.furthest = 12;
  game.time = Math.max(20, 35 - (game.level - 1) * 2);
  game.cooldown = 0.65;
}

function loseLife(game, reason) {
  game.lives -= 1;
  game.message = `${reason} ${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left.`;
  respawn(game);
  if (game.lives === 0) {
    game.status = 'gameover';
    game.message = `${reason} Game over. Final score: ${game.score}.`;
  }
}

function checkPosition(game) {
  const { x, row } = game.frog;
  if (x < 0.3 || x > COLS - 0.3) {
    loseLife(game, 'Swept off the edge!');
    return;
  }
  if (row === 0) {
    const goal = GOALS.findIndex(column => Math.abs(x - (column + 0.5)) <= 0.35);
    if (goal === -1 || game.goals[goal]) {
      loseLife(game, goal === -1 ? 'Missed the lily pad!' : 'That pad is already occupied!');
      return;
    }
    game.goals[goal] = true;
    game.score += 100 + Math.ceil(game.time) * 2;
    game.message = 'Safe landing! Find another empty pad.';
    if (game.goals.every(Boolean)) {
      game.level += 1;
      game.score += 500;
      game.goals.fill(false);
      // Preserve lane positions when the new level changes their speed.
      game.elapsed *= (1 + (game.level - 2) * 0.18) / speedMultiplier(game);
      game.message = `Level ${game.level}! Traffic is faster.`;
    }
    respawn(game);
    return;
  }
  const lane = LANES.find(item => item.row === row);
  if (!lane) return;
  const objects = laneObjects(game, lane);
  if (lane.kind === 'car') {
    if (objects.some(object => x + 0.28 > object.x && x - 0.28 < object.x + object.length)) {
      loseLife(game, 'Traffic got you!');
    }
  } else if (!objects.some(object => x - 0.25 >= object.x && x + 0.25 <= object.x + object.length)) {
    loseLife(game, 'Splash! Stay on the logs.');
  }
}

export function moveFrog(game, direction) {
  if (game.status !== 'playing' || game.cooldown > 0) return;
  const moves = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const move = moves[direction];
  if (!move) return;
  game.frog.x = Math.max(0.5, Math.min(COLS - 0.5, game.frog.x + move[0]));
  game.frog.row = Math.max(0, Math.min(ROWS - 1, game.frog.row + move[1]));
  if (game.frog.row < game.furthest) {
    game.score += 10;
    game.furthest = game.frog.row;
  }
  checkPosition(game);
}

export function updateGame(game, dt) {
  if (game.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  // Small simulation steps prevent objects tunneling through the frog.
  let remaining = Math.min(dt, 1);
  while (remaining > 0 && game.status === 'playing') {
    const step = Math.min(remaining, 0.02);
    remaining -= step;
    game.elapsed += step;
    if (game.cooldown > 0) {
      game.cooldown = Math.max(0, game.cooldown - step);
      continue;
    }
    game.time -= step;
    if (game.time <= 0) {
      loseLife(game, 'Time ran out!');
      continue;
    }
    const lane = LANES.find(item => item.row === game.frog.row && item.kind === 'log');
    if (lane) game.frog.x += lane.speed * speedMultiplier(game) * step;
    checkPosition(game);
  }
}
