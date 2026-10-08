import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, createGame, getTile, startGame, stepGame, togglePause } from './game.js';

test('starts in a ready dungeon with player, key, potions, treasure and enemies', () => {
  const game = createGame();
  assert.equal(game.status, 'ready');
  assert.deepEqual(game.player, { x: 1, y: 1, facing: 'right' });
  assert.equal(game.enemies.length, 4);
  assert.equal(game.potions.length, 2);
  assert.equal(game.treasure.length, 3);
  assert.equal(game.health, 5);
  assert.equal(getTile(game, 0, 0), 'wall');
  assert.equal(getTile(game, 1, 1), 'floor');
  assert.equal(BOARD.width, 15);
});

test('moves through corridors, changes facing and blocks walls and invalid commands', () => {
  const game = createGame();
  startGame(game);
  assert.equal(stepGame(game, 'down'), true);
  assert.deepEqual(game.player, { x: 1, y: 2, facing: 'down' });
  assert.equal(stepGame(game, 'left'), true);
  assert.equal(game.player.x, 1);
  assert.equal(game.player.y, 2);
  assert.equal(game.player.facing, 'left');
  assert.equal(stepGame(game, 'diagonal'), false);
  assert.equal(game.turns, 2);
});

test('collects treasure and the key, then escapes through the exit', () => {
  const game = createGame();
  startGame(game);
  game.player = { x: 4, y: 1, facing: 'right' };
  stepGame(game, 'right');
  assert.equal(game.score, 100);
  assert.equal(game.treasure.length, 2);
  game.player = { x: 12, y: 1, facing: 'right' };
  stepGame(game, 'right');
  assert.equal(game.key.collected, true);
  assert.equal(getTile(game, 13, 9), 'exit');
  game.player = { x: 12, y: 9, facing: 'right' };
  stepGame(game, 'right');
  assert.equal(game.status, 'won');
  assert.equal(game.score, 600);
  assert.equal(game.best, 600);
});

test('melee attacks defeat an adjacent enemy and increase score', () => {
  const game = createGame();
  startGame(game);
  game.player = { x: 10, y: 1, facing: 'right' };
  game.enemies = [{ x: 11, y: 1, health: 2 }];
  stepGame(game, 'attack');
  assert.equal(game.enemies[0].health, 1);
  stepGame(game, 'attack');
  assert.equal(game.enemies.length, 0);
  assert.equal(game.score, 50);
  assert.equal(game.best, 50);
});

test('walking into a monster attacks it and delays its first hit on the player', () => {
  const game = createGame();
  startGame(game);
  game.player = { x: 9, y: 1, facing: 'right' };
  game.enemies = [{ x: 10, y: 1, health: 2 }];

  stepGame(game, 'right');
  assert.deepEqual(game.player, { x: 9, y: 1, facing: 'right' });
  assert.equal(game.enemies[0].health, 1);
  assert.equal(game.health, 5);

  stepGame(game, 'right');
  assert.equal(game.enemies.length, 0);
  assert.equal(game.health, 5);
  assert.equal(game.score, 50);
});

test('a monster gives the player two enemy turns before its first attack', () => {
  const game = createGame();
  startGame(game);
  game.player = { x: 9, y: 1, facing: 'right' };
  game.enemies = [{ x: 10, y: 1, health: 3 }];

  stepGame(game, 'up');
  stepGame(game, 'attack');
  assert.equal(game.health, 5);
  stepGame(game, 'up');
  stepGame(game, 'attack');
  assert.equal(game.health, 4);
});

test('enemies pursue through corridors, attacks have a cooldown, and health can reach game over', () => {
  const game = createGame();
  startGame(game);
  game.player = { x: 9, y: 1, facing: 'left' };
  game.enemies = [{ x: 11, y: 1, health: 2 }];
  stepGame(game, 'left');
  stepGame(game, 'left');
  assert.deepEqual({ x: game.enemies[0].x, y: game.enemies[0].y }, { x: 10, y: 1 });
  game.player = { x: 9, y: 1, facing: 'up' };
  for (let i = 0; i < 30 && game.status === 'playing'; i++) stepGame(game, 'attack');
  assert.equal(game.status, 'gameover');
  assert.equal(game.health, 0);
  assert.equal(game.reason, 'overwhelmed');
});

test('potions restore health only up to the maximum', () => {
  const game = createGame();
  startGame(game);
  game.health = 3;
  game.player = { x: 2, y: 9, facing: 'right' };
  stepGame(game, 'left');
  assert.equal(game.health, 5);
  assert.equal(game.potions.length, 1);
  game.player = { x: 12, y: 7, facing: 'right' };
  game.health = 5;
  stepGame(game, 'right');
  assert.equal(game.health, 5);
  assert.equal(game.potions.length, 0);
});

test('pause freezes the dungeon and restart preserves the best score', () => {
  const game = createGame({ best: 200 });
  startGame(game);
  const before = structuredClone(game);
  togglePause(game);
  assert.equal(stepGame(game, 'right'), false);
  assert.deepEqual({ ...game, status: before.status }, before);
  togglePause(game);
  assert.equal(stepGame(game, 'right'), true);
  startGame(game);
  assert.equal(game.status, 'playing');
  assert.equal(game.score, 0);
  assert.equal(game.best, 200);
  assert.equal(game.health, 5);
});
