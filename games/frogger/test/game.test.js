import test from 'node:test';
import assert from 'node:assert/strict';
import { GOALS, LANES, createGame, startGame, togglePause, laneObjects, moveFrog, updateGame, speedMultiplier } from '../game.js';

function playing() {
  const game = createGame();
  startGame(game);
  return game;
}

test('ready state ignores input and starting resets the entire session', () => {
  const game = createGame();
  moveFrog(game, 'up');
  updateGame(game, 1);
  assert.deepEqual(game, createGame());
  startGame(game);
  game.score = 1000;
  game.lives = 1;
  game.goals[0] = true;
  startGame(game);
  assert.deepEqual(game, playing());
});

test('safe movement stays on the board and rewards forward progress only once', () => {
  const game = playing();
  for (let i = 0; i < 20; i++) moveFrog(game, 'left');
  assert.equal(game.frog.x, 0.5);
  moveFrog(game, 'down');
  assert.equal(game.frog.row, 12);
  game.frog.row = 6;
  game.furthest = 7;
  moveFrog(game, 'left');
  assert.equal(game.score, 10);
  moveFrog(game, 'right');
  assert.equal(game.score, 10);
});

test('traffic collision loses exactly one life and respawn briefly locks input', () => {
  const game = playing();
  const lane = LANES.find(lane => lane.row === 11);
  const car = laneObjects(game, lane).find(object => object.x >= 0);
  game.frog = { x: car.x + car.length / 2, row: lane.row };
  updateGame(game, 0.02);
  assert.equal(game.lives, 2);
  assert.deepEqual(game.frog, { x: 5.5, row: 12 });
  moveFrog(game, 'up');
  assert.equal(game.frog.row, 12);
  updateGame(game, 0.2);
  assert.equal(game.lives, 2);
});

test('landing input checks traffic immediately without waiting for a frame', () => {
  const game = playing();
  game.frog = { x: 0.5, row: 12 };
  moveFrog(game, 'up');
  assert.equal(game.lives, 2);
});

test('river requires full log support and carries the frog with its log', () => {
  const game = playing();
  const lane = LANES.find(lane => lane.row === 5);
  const log = laneObjects(game, lane).find(object => object.x >= 0);
  game.frog = { x: log.x + 1, row: lane.row };
  const before = game.frog.x;
  updateGame(game, 0.2);
  assert.ok(Math.abs(game.frog.x - before - lane.speed * 0.2) < 1e-9);
  assert.equal(game.lives, 3);
  game.frog.x = log.x + lane.length + 0.7;
  updateGame(game, 0.02);
  assert.equal(game.lives, 2);
});

test('logs carrying the frog off-screen cost a life', () => {
  const game = playing();
  game.frog = { x: 10.71, row: 5 };
  updateGame(game, 0.02);
  assert.equal(game.lives, 2);
  assert.match(game.message, /edge/);
});

test('empty goals score and respawn; occupied or missed goals are unsafe', () => {
  const game = playing();
  game.frog = { x: 1.5, row: 1 };
  moveFrog(game, 'up');
  assert.equal(game.goals[0], true);
  assert.equal(game.score, 180);
  assert.equal(game.lives, 3);
  game.cooldown = 0;
  game.frog = { x: 1.5, row: 1 };
  moveFrog(game, 'up');
  assert.equal(game.lives, 2);
  assert.match(game.message, /occupied/);
  game.cooldown = 0;
  game.frog = { x: 2.5, row: 1 };
  moveFrog(game, 'up');
  assert.equal(game.lives, 1);
  assert.match(game.message, /Missed/);
});

test('all five goals advance the level, speed up lanes, and shorten the clock', () => {
  const game = playing();
  game.elapsed = 10;
  game.goals = [true, true, true, true, false];
  const before = laneObjects(game, LANES[0]);
  game.frog = { x: GOALS[4] + 0.5, row: 1 };
  moveFrog(game, 'up');
  assert.equal(game.level, 2);
  assert.equal(game.score, 680);
  assert.equal(game.time, 33);
  assert.equal(speedMultiplier(game), 1.18);
  assert.ok(game.goals.every(goal => !goal));
  const after = laneObjects(game, LANES[0]);
  assert.ok(Math.abs(before[0].x - after[0].x) < 1e-9);
});

test('pause freezes all simulation and input; resuming continues', () => {
  const game = playing();
  togglePause(game);
  const paused = structuredClone(game);
  updateGame(game, 1);
  moveFrog(game, 'up');
  assert.deepEqual(game, paused);
  togglePause(game);
  updateGame(game, 0.1);
  assert.equal(game.status, 'playing');
  assert.ok(game.time < 35);
});

test('timeout ends the final life and game over cannot resume or move', () => {
  const game = playing();
  game.lives = 1;
  game.time = 0.01;
  updateGame(game, 0.1);
  assert.equal(game.status, 'gameover');
  assert.equal(game.lives, 0);
  const ended = structuredClone(game);
  moveFrog(game, 'up');
  togglePause(game);
  updateGame(game, 1);
  assert.deepEqual(game, ended);
});

test('lane repetition covers both screen edges for either direction', () => {
  const game = playing();
  for (const elapsed of [0, 1, 1000]) {
    game.elapsed = elapsed;
    for (const lane of LANES) {
      const objects = laneObjects(game, lane);
      assert.ok(objects[0].x <= 0);
      assert.ok(objects.at(-1).x < 11);
      for (let i = 1; i < objects.length; i++) {
        assert.ok(Math.abs(objects[i].x - objects[i - 1].x - lane.length - lane.gap) < 1e-9);
      }
    }
  }
});

test('large frame deltas are substepped so traffic cannot tunnel through the frog', () => {
  const game = playing();
  game.level = 20;
  game.frog = { x: 2, row: 11 };
  updateGame(game, 1);
  assert.equal(game.lives, 2);
});
