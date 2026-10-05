const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const MAP = [
  '###############',
  '#.....#.......#',
  '#.###.#.###.#.#',
  '#.#...#...#.#.#',
  '#.#.#####.#...#',
  '#...#...#...#.#',
  '###.#.#.#####.#',
  '#...#.#.......#',
  '#.###.#####.#.#',
  '#.............#',
  '###############'
];

const INITIAL_ENEMIES = [
  { x: 11, y: 1, health: 2 },
  { x: 3, y: 3, health: 2 },
  { x: 11, y: 5, health: 2 },
  { x: 7, y: 9, health: 2 }
];
const KEY = { x: 13, y: 1 };
const POTIONS = [{ x: 1, y: 9 }, { x: 13, y: 7 }];
const TREASURE = [{ x: 5, y: 1 }, { x: 7, y: 5 }, { x: 9, y: 9 }];

function copyEntities(entities) {
  return entities.map(entity => ({ ...entity }));
}

function isFloor(x, y) {
  return MAP[y]?.[x] === '.';
}

function at(entities, x, y) {
  return entities.findIndex(entity => entity.x === x && entity.y === y);
}

export function createGame({ best = 0 } = {}) {
  const game = { best };
  startGame(game);
  game.status = 'ready';
  return game;
}

export function startGame(game) {
  game.player = { x: 1, y: 1, facing: 'right' };
  game.enemies = copyEntities(INITIAL_ENEMIES);
  game.potions = copyEntities(POTIONS);
  game.treasure = copyEntities(TREASURE);
  game.key = { ...KEY, collected: false };
  game.score = 0;
  game.health = 5;
  game.turns = 0;
  game.status = 'playing';
  game.reason = '';
}

export function togglePause(game) {
  if (game.status === 'playing') game.status = 'paused';
  else if (game.status === 'paused') game.status = 'playing';
}

function collectItems(game) {
  const { x, y } = game.player;
  const treasureIndex = at(game.treasure, x, y);
  if (treasureIndex !== -1) {
    game.treasure.splice(treasureIndex, 1);
    game.score += 100;
  }
  const potionIndex = at(game.potions, x, y);
  if (potionIndex !== -1) {
    game.potions.splice(potionIndex, 1);
    game.health = Math.min(5, game.health + 2);
  }
  if (x === game.key.x && y === game.key.y) game.key.collected = true;
  if (game.key.collected && x === 13 && y === 9) {
    game.status = 'won';
    game.score += 500;
  }
  game.best = Math.max(game.best, game.score);
}

function attack(game) {
  const direction = DIRECTIONS[game.player.facing];
  const enemyIndex = at(game.enemies, game.player.x + direction.x, game.player.y + direction.y);
  if (enemyIndex === -1) return;
  const enemy = game.enemies[enemyIndex];
  enemy.health--;
  if (enemy.health <= 0) {
    game.enemies.splice(enemyIndex, 1);
    game.score += 50;
    game.best = Math.max(game.best, game.score);
  }
}

function nextEnemyStep(game, enemy, occupied) {
  const queue = [{ x: enemy.x, y: enemy.y }];
  const visited = new Set([`${enemy.x},${enemy.y}`]);
  const previous = new Map();
  let target = null;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    if (cell.x === game.player.x && cell.y === game.player.y) {
      target = cell;
      break;
    }
    for (const direction of Object.values(DIRECTIONS)) {
      const next = { x: cell.x + direction.x, y: cell.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (!isFloor(next.x, next.y) || occupied.has(key) || visited.has(key)) continue;
      visited.add(key);
      previous.set(key, cell);
      queue.push(next);
    }
  }
  if (!target) return null;
  let step = target;
  while (previous.has(`${step.x},${step.y}`)) {
    const parent = previous.get(`${step.x},${step.y}`);
    if (parent.x === enemy.x && parent.y === enemy.y) return step;
    step = parent;
  }
  return null;
}

function moveEnemies(game) {
  const occupied = new Set(game.enemies.map(enemy => `${enemy.x},${enemy.y}`));
  for (const enemy of game.enemies) {
    occupied.delete(`${enemy.x},${enemy.y}`);
    const distance = Math.abs(enemy.x - game.player.x) + Math.abs(enemy.y - game.player.y);
    if (distance === 1) {
      enemy.cooldown = (enemy.cooldown ?? 0) - 1;
      if (enemy.cooldown <= 0) {
        game.health--;
        enemy.cooldown = 3;
      }
    } else {
      const next = nextEnemyStep(game, enemy, occupied);
      if (next && !(next.x === game.player.x && next.y === game.player.y)) {
        enemy.x = next.x;
        enemy.y = next.y;
      }
    }
    occupied.add(`${enemy.x},${enemy.y}`);
  }
  if (game.health <= 0) {
    game.health = 0;
    game.status = 'gameover';
    game.reason = 'overwhelmed';
  }
}

export function stepGame(game, command) {
  if (game.status !== 'playing') return false;
  if (command !== 'attack' && !Object.hasOwn(DIRECTIONS, command)) return false;

  game.turns++;
  if (command === 'attack') {
    attack(game);
  } else {
    game.player.facing = command;
    const direction = DIRECTIONS[command];
    const x = game.player.x + direction.x;
    const y = game.player.y + direction.y;
    if (isFloor(x, y) && at(game.enemies, x, y) === -1) {
      game.player.x = x;
      game.player.y = y;
      collectItems(game);
    }
  }

  if (game.status === 'playing' && game.turns % 2 === 0) moveEnemies(game);
  return true;
}

export function getTile(game, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !MAP[y]?.[x]) return 'wall';
  if (game.key.collected && x === 13 && y === 9) return 'exit';
  return MAP[y][x] === '#' ? 'wall' : 'floor';
}

export const BOARD = Object.freeze({ width: MAP[0].length, height: MAP.length });
