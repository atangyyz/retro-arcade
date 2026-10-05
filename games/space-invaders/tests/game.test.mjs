import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, WIDTH, HEIGHT } from '../game.mjs';

function seeded(seed = 12345) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function advance(game, seconds, input = {}) {
  for (let remaining = seconds; remaining > 1e-9; remaining -= 0.05) {
    game.update(Math.min(0.05, remaining), input);
  }
}

function playing() {
  const game = new Game({ random: seeded() });
  game.start();
  return game;
}

function snapshot(game) {
  return JSON.stringify(game);
}

function enemyHit(game) {
  game.enemyShots.push({
    x: game.player.x + 10, y: game.player.y - 40, w: 6, h: 12, vy: 20000,
  });
  game.update(0.01);
}

test('initial state, lifecycle and full restart', () => {
  assert.equal(WIDTH, 800);
  assert.equal(HEIGHT, 600);
  const game = new Game({ random: seeded() });
  assert.equal(game.status, 'ready');
  const ready = snapshot(game);
  game.update(1, { fire: true });
  game.pause();
  game.resume();
  assert.equal(snapshot(game), ready);
  game.start();
  assert.equal(game.status, 'playing');
  assert.equal(game.lives, 3);
  assert.equal(game.wave, 1);
  assert.equal(game.score, 0);
  assert.equal(game.aliens.length, 50);
  assert.equal(new Set(game.aliens.map(alien => alien.row)).size, 5);
  assert.equal(game.player.y, 548);
  game.score = 500;
  game.wave = 5;
  game.lives = 0;
  game.waveDelay = 0.5;
  game.player.invulnerable = 2;
  game.playerShots.push({ x: 0, y: 0, w: 4, h: 12, vy: -560 });
  game.status = 'gameover';
  const over = snapshot(game);
  game.update(0.1, { left: true });
  game.resume();
  assert.equal(snapshot(game), over);
  game.start();
  assert.equal(game.status, 'playing');
  assert.equal(game.score, 0);
  assert.equal(game.wave, 1);
  assert.equal(game.lives, 3);
  assert.equal(game.waveDelay, 0);
  assert.equal(game.player.invulnerable, 0);
  assert.equal(game.player.x, 380);
  assert.deepEqual(game.playerShots, []);
  assert.deepEqual(game.enemyShots, []);
});

test('movement clamps to bounds, opposite directions cancel and dt is capped', () => {
  const game = playing();
  game.update(100, { right: true });
  assert.ok(Math.abs(game.player.x - 414) < 1e-8);
  const x = game.player.x;
  game.update(0.1, { left: true, right: true });
  assert.equal(game.player.x, x);
  for (const dt of [NaN, Infinity, -1, 0]) game.update(dt, { left: true });
  assert.equal(game.player.x, x);
  advance(game, 3, { left: true });
  assert.equal(game.player.x, 0);
  advance(game, 3, { right: true });
  assert.equal(game.player.x, WIDTH - game.player.w);
});

test('player firing is immediate, rate limited and shots leave the arena', () => {
  const game = playing();
  game.update(0.01, { fire: true });
  assert.equal(game.playerShots.length, 1);
  assert.equal(game.playerShots[0].vy, -560);
  assert.equal(game.playerShots[0].x, game.player.x + game.player.w / 2 - 2);
  advance(game, 0.2, { fire: true });
  assert.equal(game.playerShots.length, 1);
  advance(game, 0.05, { fire: true });
  assert.equal(game.playerShots.length, 2);
  game.playerShots = [{ x: 0, y: 1, w: 4, h: 12, vy: -560 }];
  game.enemyShots = [{ x: 0, y: HEIGHT - 1, w: 6, h: 12, vy: 220 }];
  game.update(0.1);
  assert.equal(game.playerShots.length, 0);
  assert.equal(game.enemyShots.length, 0);
});

test('swept player shots hit the nearest living alien and award row score once', () => {
  const game = playing();
  const top = { x: 200, y: 100, w: 32, h: 24, row: 0, col: 0, alive: true };
  const bottom = { ...top, y: 200, row: 4 };
  game.aliens = [top, bottom];
  game.playerShots = [{ x: 210, y: 400, w: 4, h: 12, vy: -40000 }];
  game.update(0.01);
  assert.equal(bottom.alive, false);
  assert.equal(top.alive, true);
  assert.equal(game.score, 10);
  assert.equal(game.playerShots.length, 0);
  game.update(0.1);
  assert.equal(game.score, 10);
});

test('enemy hits reduce lives, invulnerability protects and zero lives ends play', () => {
  const game = playing();
  enemyHit(game);
  assert.equal(game.lives, 2);
  assert.ok(game.player.invulnerable > 0);
  assert.equal(game.enemyShots.length, 0);
  enemyHit(game);
  assert.equal(game.lives, 2);
  game.enemyShots = [];
  game._enemyCountdown = 100;
  advance(game, 1.6);
  assert.equal(game.player.invulnerable, 0);
  enemyHit(game);
  assert.equal(game.lives, 1);
  game.player.invulnerable = 0;
  enemyHit(game);
  assert.equal(game.lives, 0);
  assert.equal(game.status, 'gameover');
});

test('cleared wave has a protected delay, clean projectiles and increased difficulty', () => {
  const game = playing();
  const speed = game._alienSpeed;
  const countdown = game._enemyCountdown;
  for (const alien of game.aliens) alien.alive = false;
  game.playerShots.push({ x: 0, y: 400, w: 4, h: 12, vy: -560 });
  game.enemyShots.push({ x: 0, y: 400, w: 6, h: 12, vy: 220 });
  game.update(0.01);
  assert.equal(game.wave, 2);
  assert.ok(game.waveDelay > 0);
  assert.ok(game.player.invulnerable > 0);
  assert.deepEqual(game.playerShots, []);
  assert.deepEqual(game.enemyShots, []);
  advance(game, 0.5, { fire: true });
  assert.ok(game.waveDelay > 0);
  assert.equal(game.aliens.length, 0);
  assert.equal(game.playerShots.length, 0);
  advance(game, 0.3);
  assert.equal(game.waveDelay, 0);
  assert.equal(game.aliens.length, 50);
  assert.ok(game._alienSpeed > speed);
  assert.ok(game._enemyCountdown < countdown);
  assert.ok(game.player.invulnerable > 1);
  game._enemyCountdown = 0;
  game.update(0.01);
  assert.equal(game.enemyShots[0].vy, 240);
});

test('enemy fire chooses bottom surviving aliens in reproducible random columns', () => {
  const a = playing();
  const b = playing();
  for (const game of [a, b]) {
    game.aliens.filter(alien => alien.col === 0 && alien.row === 4)
      .forEach(alien => { alien.alive = false; });
    game._enemyCountdown = 0;
    game.update(1 / 120);
    assert.equal(game.enemyShots.length, 1);
    const shot = game.enemyShots[0];
    const shooter = game.aliens.find(alien => alien.alive
      && Math.abs(alien.x + alien.w / 2 - 3 - shot.x) < 1e-8
      && Math.abs(alien.y + alien.h + shot.vy / 120 - shot.y) < 1e-8);
    assert.ok(shooter);
    assert.equal(shooter.row, shooter.col === 0 ? 3 : 4);
    assert.ok(Math.abs(shot.y - (shooter.y + shooter.h + shot.vy / 120)) < 1e-8);
  }
  assert.equal(snapshot(a), snapshot(b));
  advance(a, 4);
  advance(b, 4);
  assert.equal(snapshot(a), snapshot(b));
});

test('formation bounces, descends and invasion ends the game even while protected', () => {
  const game = playing();
  game.aliens = [{ x: WIDTH - 16 - 32, y: 100, w: 32, h: 24, row: 0, alive: true }];
  game.update(0.01);
  assert.equal(game._direction, -1);
  assert.equal(game.aliens[0].y, 118);
  assert.ok(game.aliens[0].x + game.aliens[0].w <= WIDTH - 16);
  game.aliens[0].x = 16;
  game.update(0.01);
  assert.equal(game._direction, 1);
  assert.equal(game.aliens[0].y, 136);
  game.aliens[0].y = game.player.y - game.aliens[0].h;
  game.player.invulnerable = 10;
  game.update(0.01);
  assert.equal(game.status, 'gameover');
  assert.equal(game.lives, 3);
});

test('paused updates freeze movement, projectiles, cooldowns and wave timers', () => {
  const game = playing();
  game.update(0.05, { fire: true });
  game.pause();
  assert.equal(game.status, 'paused');
  const before = snapshot(game);
  game.update(0.1, { right: true, fire: true });
  game.pause();
  assert.equal(snapshot(game), before);
  game.resume();
  assert.equal(game.status, 'playing');
  game.update(0.05, { right: true });
  assert.notEqual(game.player.x, JSON.parse(before).player.x);
  for (const alien of game.aliens) alien.alive = false;
  game.update(0.01);
  game.pause();
  const transition = snapshot(game);
  advance(game, 1);
  assert.equal(snapshot(game), transition);
  game.start();
  assert.equal(game.status, 'playing');
  assert.equal(game.waveDelay, 0);
});
