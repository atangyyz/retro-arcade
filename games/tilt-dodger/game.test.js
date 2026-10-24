import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startGame, setTarget, togglePause, stepGame,
  WIDTH, HEIGHT, SHIP_Y, SHIP_RADIUS, MOVE_SPEED
} from './game.js';

function advance(game, seconds) {
  for (let i = 0; i < Math.round(seconds * 120); i++) stepGame(game, 1 / 120);
}

test('ready, pause, resume, and game over gate simulation', () => {
  const game = createGame();
  stepGame(game, 0.1);
  assert.equal(game.elapsed, 0);
  startGame(game);
  togglePause(game);
  advance(game, 1);
  assert.equal(game.elapsed, 0);
  togglePause(game);
  stepGame(game, 0.1);
  assert.ok(game.elapsed > 0);
  game.obstacles.push({ x: game.x, y: SHIP_Y, radius: 17 });
  stepGame(game, 1 / 120);
  assert.equal(game.status, 'gameover');
  const elapsed = game.elapsed;
  advance(game, 1);
  assert.equal(game.elapsed, elapsed);
  togglePause(game);
  assert.equal(game.status, 'gameover');
});

test('target steering is bounded and speed-limited for tilt', () => {
  const game = createGame();
  startGame(game);
  setTarget(game, -100);
  assert.equal(game.targetX, SHIP_RADIUS);
  stepGame(game, 0.1);
  assert.ok(Math.abs(game.x - (WIDTH / 2 - MOVE_SPEED * 0.1)) < 1e-8);
  advance(game, 0.5);
  assert.equal(game.x, SHIP_RADIUS);
  setTarget(game, Infinity);
  assert.equal(game.targetX, SHIP_RADIUS);
  setTarget(game, WIDTH + 100);
  assert.equal(game.targetX, WIDTH - SHIP_RADIUS);
});

test('survival and stars score once and best survives retry', () => {
  const game = createGame({ best: 5 });
  startGame(game);
  game.stars.push({ x: game.x, y: SHIP_Y, radius: 9 });
  stepGame(game, 0.1);
  assert.equal(game.starsCollected, 1);
  assert.equal(game.stars.length, 0);
  advance(game, 0.2);
  assert.equal(game.score, Math.floor(game.elapsed * 10) + 50);
  assert.equal(game.best, game.score);
  const best = game.best;
  startGame(game);
  assert.equal(game.best, best);
  assert.equal(game.score, 0);
  assert.equal(game.starsCollected, 0);
  assert.equal(game.obstacles.length, 0);
  assert.equal(game.status, 'playing');
});

test('collision detection catches fast crossings and does not collect through an asteroid', () => {
  const game = createGame();
  startGame(game);
  game.elapsed = 80;
  game.obstacles.push({ x: game.x, y: SHIP_Y - 35, radius: 17 });
  game.stars.push({ x: game.x, y: SHIP_Y - 35, radius: 9 });
  stepGame(game, 0.25);
  assert.equal(game.status, 'gameover');
  assert.equal(game.starsCollected, 0);
});

test('invalid deltas are ignored, long frames bounded, offscreen objects removed', () => {
  const game = createGame({ best: -1 });
  assert.equal(game.best, 0);
  startGame(game);
  for (const dt of [0, -1, NaN, Infinity]) stepGame(game, dt);
  assert.equal(game.elapsed, 0);
  game.obstacles.push({ x: 20, y: HEIGHT + 40, radius: 17 });
  game.stars.push({ x: 20, y: HEIGHT + 40, radius: 9 });
  stepGame(game, 10);
  assert.ok(game.elapsed <= 0.250001);
  assert.equal(game.obstacles.length, 0);
  assert.equal(game.stars.length, 0);
});

test('each wave has a wide, reachable escape corridor and a collectible star', () => {
  // Check every possible movement of the gap, including both boundaries.
  for (const random of [() => 0, () => 0.5, () => 0.99999]) {
    const game = createGame({ random });
    startGame(game);
    let previousGap = game.gap;
    for (let wave = 0; wave < 100; wave++) {
      game.obstacles = [];
      game.stars = [];
      game.nextWave = 0;
      stepGame(game, 1 / 120);
      const star = game.stars[0];
      assert.equal(game.obstacles.length, 7);
      assert.ok(Math.abs(game.gap - previousGap) <= 1);
      assert.ok(game.gap >= 0 && game.gap <= 7);
      assert.equal(star.x, (game.gap + 1) * 40);
      assert.ok(40 / MOVE_SPEED < game.nextWave);
      assert.ok(game.obstacles.every(rock => Math.abs(star.x - rock.x) > SHIP_RADIUS + rock.radius));
      previousGap = game.gap;
    }
  }
});

test('safe route remains playable for 90 seconds as speed rises and rows coexist', () => {
  let seed = 17;
  const game = createGame({ random: () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  } });
  startGame(game);
  let peakObjects = 0;
  for (let frame = 0; frame < 90 * 120; frame++) {
    const upcoming = game.obstacles.filter(rock => rock.y <= SHIP_Y + SHIP_RADIUS + rock.radius)
      .sort((a, b) => b.y - a.y)[0];
    if (upcoming) {
      const row = game.obstacles.filter(rock => rock.y === upcoming.y);
      const gap = Array.from({ length: 9 }, (_, lane) => lane)
        .filter(lane => !row.some(rock => rock.x === (lane + 0.5) * 40));
      setTarget(game, (gap[0] + 1) * 40);
    }
    stepGame(game, 1 / 120);
    peakObjects = Math.max(peakObjects, game.obstacles.length);
    assert.equal(game.status, 'playing', `Collision at ${game.elapsed}s`);
  }
  assert.ok(game.speed > 100 && game.speed <= 270);
  assert.ok(game.starsCollected > 40);
  assert.ok(peakObjects <= 42);
  assert.ok(game.score >= 900);
});
