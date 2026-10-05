const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const sameCell = (a, b) => a.x === b.x && a.y === b.y;

function placeFood(game) {
  const free = [];
  for (let y = 0; y < game.size; y++) {
    for (let x = 0; x < game.size; x++) {
      if (!game.snake.some(segment => sameCell(segment, { x, y }))) {
        free.push({ x, y });
      }
    }
  }
  if (!free.length) return null;
  return free[Math.floor(game.random() * free.length)];
}

export function createGame({ size = 20, random = Math.random, best = 0 } = {}) {
  if (!Number.isInteger(size) || size < 4) {
    throw new RangeError('Board size must be an integer of at least 4.');
  }
  const game = { size, random, best };
  startGame(game);
  game.status = 'ready';
  return game;
}

export function startGame(game) {
  const middle = Math.floor(game.size / 2);
  game.snake = [0, 1, 2].map(offset => ({ x: middle - offset, y: middle }));
  game.direction = 'right';
  game.pendingDirection = null;
  game.score = 0;
  game.tickMs = 160;
  game.status = 'playing';
  game.reason = '';
  game.food = placeFood(game);
}

export function turn(game, direction) {
  if (game.status !== 'playing' || game.pendingDirection !== null ||
      !Object.hasOwn(DIRECTIONS, direction) || direction === game.direction) return false;
  const current = DIRECTIONS[game.direction];
  const next = DIRECTIONS[direction];
  if (current.x + next.x === 0 && current.y + next.y === 0) return false;
  // Accept only one turn per tick so rapid inputs cannot reverse into the body.
  game.pendingDirection = direction;
  return true;
}

export function togglePause(game) {
  if (game.status === 'playing') game.status = 'paused';
  else if (game.status === 'paused') game.status = 'playing';
}

export function stepGame(game) {
  if (game.status !== 'playing') return;
  game.direction = game.pendingDirection ?? game.direction;
  game.pendingDirection = null;
  const direction = DIRECTIONS[game.direction];
  const head = {
    x: game.snake[0].x + direction.x,
    y: game.snake[0].y + direction.y
  };
  const eating = game.food !== null && sameCell(head, game.food);
  // The tail vacates its cell on a non-growing move.
  const body = eating ? game.snake : game.snake.slice(0, -1);
  if (head.x < 0 || head.y < 0 || head.x >= game.size || head.y >= game.size ||
      body.some(segment => sameCell(segment, head))) {
    game.status = 'gameover';
    game.reason = head.x < 0 || head.y < 0 || head.x >= game.size || head.y >= game.size
      ? 'wall' : 'self';
    return;
  }
  game.snake.unshift(head);
  if (!eating) {
    game.snake.pop();
    return;
  }
  game.score += 10;
  game.best = Math.max(game.best, game.score);
  game.tickMs = Math.max(70, 160 - (game.score / 10) * 6);
  game.food = placeFood(game);
  if (game.food === null) game.status = 'won';
}
