import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, turn, togglePause, stepGame } from './game.js';

function playing(size = 20) {
  const game = createGame({ size, random: () => 0 });
  startGame(game);
  return game;
}

test('ready board has three segments and food outside the snake; starts moving one cell per tick', () => {
  const game = createGame({ random: () => 0 });
  assert.equal(game.status, 'ready');
  assert.equal(game.snake.length, 3);
  assert.ok(!game.snake.some(cell => cell.x === game.food.x && cell.y === game.food.y));
  const before = structuredClone(game.snake);
  stepGame(game);
  assert.deepEqual(game.snake, before);
  startGame(game);
  stepGame(game);
  assert.deepEqual(game.snake[0], { x: 11, y: 10 });
  assert.equal(game.snake.length, 3);
  assert.equal(game.score, 0);
});

test('turns follow the grid and reject reversals, invalid directions and multiple turns per tick', () => {
  const game = playing();
  assert.equal(turn(game, 'left'), false);
  assert.equal(turn(game, 'right'), false);
  assert.equal(turn(game, 'toString'), false);
  assert.equal(turn(game, 'diagonal'), false);
  assert.equal(turn(game, 'up'), true);
  assert.equal(turn(game, 'left'), false);
  stepGame(game);
  assert.deepEqual(game.snake[0], { x: 10, y: 9 });
  assert.equal(turn(game, 'down'), false);
  assert.equal(turn(game, 'left'), true);
  stepGame(game);
  assert.deepEqual(game.snake[0], { x: 9, y: 9 });
  turn(game, 'down');
  stepGame(game);
  assert.deepEqual(game.snake[0], { x: 9, y: 10 });
});

test('food grows the snake, updates score and best, increases speed and respawns in a free cell', () => {
  const game = playing();
  game.food = { x: 11, y: 10 };
  stepGame(game);
  assert.equal(game.snake.length, 4);
  assert.equal(game.score, 10);
  assert.equal(game.best, 10);
  assert.equal(game.tickMs, 154);
  assert.ok(!game.snake.some(cell => cell.x === game.food.x && cell.y === game.food.y));
  assert.ok(game.food.x >= 0 && game.food.x < game.size);
  assert.ok(game.food.y >= 0 && game.food.y < game.size);
});

test('food placement can select the last free cell and never overlaps the initial body', () => {
  const game = createGame({ size: 4, random: () => 0.999999 });
  assert.deepEqual(game.food, { x: 3, y: 3 });
  assert.throws(() => createGame({ size: 3 }), RangeError);
  assert.throws(() => createGame({ size: 4.5 }), RangeError);
});

for (const [direction, head] of [
  ['right', { x: 19, y: 10 }], ['left', { x: 0, y: 10 }],
  ['up', { x: 10, y: 0 }], ['down', { x: 10, y: 19 }]
]) {
  test(`${direction} wall collision ends the game without moving out of bounds`, () => {
    const game = playing();
    game.direction = direction;
    game.snake = [head];
    stepGame(game);
    assert.equal(game.status, 'gameover');
    assert.equal(game.reason, 'wall');
    assert.deepEqual(game.snake, [head]);
    stepGame(game);
    togglePause(game);
    assert.equal(turn(game, 'up'), false);
    assert.equal(game.status, 'gameover');
  });
}

test('self collision ends play, but moving into the vacating tail is legal', () => {
  const game = playing();
  game.snake = [
    { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 },
    { x: 1, y: 2 }, { x: 1, y: 1 }
  ];
  game.direction = 'left';
  stepGame(game);
  assert.equal(game.status, 'gameover');
  assert.equal(game.reason, 'self');
  startGame(game);
  game.snake = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }];
  game.direction = 'left';
  stepGame(game);
  assert.equal(game.status, 'playing');
  assert.deepEqual(game.snake[0], { x: 1, y: 2 });
  assert.equal(game.snake.length, 4);
});

test('pause freezes movement, food and score; resume preserves the pending turn', () => {
  const game = playing();
  turn(game, 'up');
  togglePause(game);
  const before = { ...game, snake: structuredClone(game.snake) };
  stepGame(game);
  assert.equal(turn(game, 'left'), false);
  assert.deepEqual(game, before);
  togglePause(game);
  stepGame(game);
  assert.equal(game.status, 'playing');
  assert.deepEqual(game.snake[0], { x: 10, y: 9 });
});

test('restart resets all round state while keeping the best score', () => {
  const game = playing();
  game.food = { x: 11, y: 10 };
  stepGame(game);
  turn(game, 'up');
  togglePause(game);
  startGame(game);
  assert.equal(game.status, 'playing');
  assert.equal(game.score, 0);
  assert.equal(game.best, 10);
  assert.equal(game.tickMs, 160);
  assert.equal(game.direction, 'right');
  assert.equal(game.pendingDirection, null);
  assert.equal(game.reason, '');
  assert.equal(game.snake.length, 3);
  assert.deepEqual(game.snake[0], { x: 10, y: 10 });
  game.status = 'gameover';
  startGame(game);
  assert.equal(game.status, 'playing');
  const ready = createGame();
  togglePause(ready);
  assert.equal(ready.status, 'ready');
});

test('filling the board wins without looping for food; speed has a playable floor', () => {
  const game = playing(4);
  game.snake = [
    { x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 },
    { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 },
    { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 3 },
    { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }
  ];
  game.food = { x: 3, y: 0 };
  game.score = 200;
  stepGame(game);
  assert.equal(game.status, 'won');
  assert.equal(game.snake.length, 16);
  assert.equal(game.food, null);
  assert.equal(game.tickMs, 70);
  stepGame(game);
  togglePause(game);
  assert.equal(game.score, 210);
  assert.equal(game.status, 'won');
  startGame(game);
  assert.equal(game.status, 'playing');
  assert.ok(game.food);
});
