import test from "node:test";
import assert from "node:assert/strict";
import { AsteroidsGame, distance, wrap, WORLD_WIDTH, WORLD_HEIGHT } from "./game.js";

function createGame() {
  let seed = 42;
  const game = new AsteroidsGame(() => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  game.start();
  return game;
}

function advance(game, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) game.update(1 / 120, input);
}

function stationaryRock(game, size, x, y) {
  return { ...game.createAsteroid(size, { x, y }), vx: 0, vy: 0, spin: 0 };
}

test("wrap handles both edges and travel over multiple screen widths", () => {
  assert.equal(wrap(-3, 1000), 997);
  assert.equal(wrap(1003, 1000), 3);
  assert.equal(wrap(3000, 1000), 0);
  assert.equal(wrap(-2003, 1000), 997);
  assert.equal(distance({ x: 2, y: 2 }, { x: 998, y: 698 }), Math.hypot(4, 4));
});

test("launch starts with three lives and a safe, shielded first wave", () => {
  const game = createGame();
  assert.equal(game.state, "playing");
  assert.equal(game.lives, 3);
  assert.equal(game.score, 0);
  assert.equal(game.wave, 1);
  assert.equal(game.asteroids.length, 4);
  assert.equal(game.ship.invulnerable, 3);
  assert.ok(game.asteroids.every(rock => rock.size === 2 && distance(rock, game.ship) >= 230));
});

test("wave spawning remains safe even with a pathological random source", () => {
  const game = new AsteroidsGame(() => .5);
  game.start();
  assert.ok(game.asteroids.every(rock => distance(rock, game.ship) >= 230));
});

test("rotation, thrust, coasting, speed limiting, and ship wrapping", () => {
  const game = createGame();
  game.asteroids = [stationaryRock(game, 0, 50, 50)];
  const angle = game.ship.angle;
  advance(game, .2, { right: true });
  assert.ok(game.ship.angle > angle);
  advance(game, .2, { left: true });
  assert.ok(Math.abs(game.ship.angle - angle) < 1e-10);
  advance(game, .4, { thrust: true });
  assert.ok(game.ship.vy < 0);
  const y = game.ship.y;
  advance(game, .1);
  assert.ok(game.ship.y < y, "ship coasts after releasing thrust");
  advance(game, 5, { thrust: true });
  assert.ok(Math.hypot(game.ship.vx, game.ship.vy) <= 440);
  game.ship.x = WORLD_WIDTH - 1;
  game.ship.y = WORLD_HEIGHT - 1;
  game.ship.vx = 100;
  game.ship.vy = 100;
  game.update(.02);
  assert.ok(game.ship.x < 2 && game.ship.y < 2);
});

test("held fire repeats with a cooldown, bullet cap, and expiry", () => {
  const game = createGame();
  game.asteroids = [stationaryRock(game, 0, 50, 50)];
  game.fire();
  game.fire();
  assert.equal(game.bullets.length, 1);
  advance(game, .4, { fire: true });
  assert.equal(game.bullets.length, 3);
  advance(game, 1.1);
  assert.equal(game.bullets.length, 0);
  for (let i = 0; i < 12; i++) {
    game.ship.cooldown = 0;
    game.fire();
  }
  assert.equal(game.bullets.length, 8);
});

test("asteroids and bullets wrap along both axes", () => {
  const game = createGame();
  const rock = stationaryRock(game, 0, 999, 699);
  rock.vx = 120;
  rock.vy = 120;
  game.asteroids = [rock];
  game.bullets = [{ x: 999, y: 699, vx: 240, vy: 240, radius: 2, life: .01 }];
  game.update(1 / 60);
  assert.equal(rock.x, 1);
  assert.equal(rock.y, 1);
  assert.equal(game.bullets.length, 0);
});

test("laser hits award size-based points and split large and medium rocks", () => {
  const game = createGame();
  for (const [size, points, children] of [[2, 20, 2], [1, 50, 2], [0, 100, 0]]) {
    game.asteroids = [stationaryRock(game, size, 100, 100)];
    const previousScore = game.score;
    game.bullets = [{ x: 100, y: 100, vx: 0, vy: 0, radius: 2, life: 1 }];
    game.update(1 / 120);
    assert.equal(game.score - previousScore, points);
    assert.equal(game.asteroids.length, children);
    assert.ok(game.asteroids.every(rock => rock.size === size - 1));
    assert.equal(game.bullets.length, 0, "one bullet cannot hit multiple rocks");
  }
});

test("bullets hit rocks across a wraparound seam", () => {
  const game = createGame();
  game.asteroids = [stationaryRock(game, 0, 998, 698)];
  game.bullets = [{ x: 2, y: 2, vx: 0, vy: 0, radius: 2, life: 1 }];
  game.update(1 / 120);
  assert.equal(game.score, 100);
  assert.equal(game.asteroids.length, 0);
});

test("clearing a wave advances after a delay with more and faster rocks", () => {
  const game = createGame();
  game.asteroids = [];
  advance(game, 1);
  assert.equal(game.wave, 1);
  advance(game, 1);
  assert.equal(game.wave, 2);
  assert.equal(game.asteroids.length, 5);
  assert.ok(game.asteroids.every(rock => Math.hypot(rock.vx, rock.vy) >= 40 * 1.12));
  game.wave = 50;
  game.spawnWave();
  assert.equal(game.asteroids.length, 14, "rock count is bounded in later waves");
});

test("pause freezes physics, cooldowns, and the next-wave timer", () => {
  const game = createGame();
  game.fire();
  game.togglePause();
  const snapshot = JSON.stringify(game);
  advance(game, 3, { thrust: true, fire: true, right: true });
  assert.equal(JSON.stringify(game), snapshot);
  game.togglePause();
  assert.equal(game.state, "playing");
  advance(game, .1, { thrust: true });
  assert.ok(game.ship.vy < 0);
});

test("collision costs one life, then respawns safely with a shield", () => {
  const game = createGame();
  game.ship.x = 2;
  game.ship.y = 2;
  game.ship.invulnerable = 0;
  game.asteroids = [stationaryRock(game, 0, 998, 698)];
  game.update(1 / 120);
  assert.equal(game.lives, 2);
  assert.equal(game.ship.active, false);
  advance(game, .5);
  assert.equal(game.lives, 2);
  advance(game, .8);
  assert.equal(game.ship.active, true);
  assert.ok(game.ship.invulnerable > 2.8);
  assert.ok(distance(game.ship, game.asteroids[0]) > 180);
  game.asteroids = [stationaryRock(game, 0, game.ship.x, game.ship.y)];
  game.update(1 / 120);
  assert.equal(game.lives, 2, "the respawn shield prevents immediate loss");
});

test("last life ends the game; restart resets all gameplay state", () => {
  const game = createGame();
  game.lives = 1;
  game.score = 450;
  game.wave = 3;
  game.ship.invulnerable = 0;
  game.asteroids = [stationaryRock(game, 0, game.ship.x, game.ship.y)];
  game.update(1 / 120);
  assert.equal(game.state, "gameover");
  assert.equal(game.lives, 0);
  assert.equal(game.score, 450);
  advance(game, 2, { thrust: true, fire: true });
  assert.equal(game.lives, 0);
  assert.equal(game.bullets.length, 0);
  game.togglePause();
  assert.equal(game.state, "gameover");
  game.start();
  assert.equal(game.state, "playing");
  assert.equal(game.lives, 3);
  assert.equal(game.score, 0);
  assert.equal(game.wave, 1);
  assert.equal(game.asteroids.length, 4);
  assert.equal(game.particles.length, 0);
  assert.equal(game.waveDelay, 0);
  assert.equal(game.respawnDelay, 0);
});
