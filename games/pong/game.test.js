import test from "node:test";
import assert from "node:assert/strict";
import { FIELD, createGame, startGame, togglePause, updateGame } from "./game.js";

function playing(mode = "duo") {
  const game = createGame(mode);
  startGame(game);
  return game;
}

test("new games are ready with centered paddles and zero scores", () => {
  const game = createGame();
  assert.equal(game.mode, "solo");
  assert.equal(game.phase, "ready");
  assert.deepEqual(game.scores, [0, 0]);
  assert.equal(game.ball.x, FIELD.width / 2);
  const before = structuredClone(game);
  updateGame(game, { left: 1 }, 0.05);
  assert.deepEqual(game, before);
});

test("starting serves once and pause freezes the entire match", () => {
  const game = playing();
  assert.ok(game.ball.vx > 0);
  updateGame(game, {}, 0.02);
  const ball = { ...game.ball };
  startGame(game);
  assert.deepEqual(game.ball, ball);
  togglePause(game);
  const before = structuredClone(game);
  updateGame(game, { left: 1, right: 1 }, 0.05);
  assert.deepEqual(game, before);
  togglePause(game);
  updateGame(game, {}, 0.02);
  assert.notEqual(game.ball.x, ball.x);
});

test("both human paddles move independently and stay inside the court", () => {
  const game = playing();
  updateGame(game, { left: -1, right: 1 }, 0.05);
  assert.ok(game.paddles[0] < 222);
  assert.ok(game.paddles[1] > 222);
  game.paddles = [1, FIELD.height - FIELD.paddleHeight - 1];
  updateGame(game, { left: -1, right: 1 }, 0.05);
  assert.deepEqual(game.paddles, [0, FIELD.height - FIELD.paddleHeight]);
});

test("CPU tracks the ball at a bounded speed and ignores player-two input", () => {
  const game = playing("solo");
  game.ball.y = 450;
  updateGame(game, { right: -1 }, 0.05);
  assert.ok(game.paddles[1] > 222);
  assert.ok(game.paddles[1] - 222 <= FIELD.paddleSpeed * 0.72 * 0.05 + 1e-8);
});

test("top and bottom walls reflect the ball back into the field", () => {
  for (const [y, vy] of [[FIELD.radius + 1, -300], [FIELD.height - FIELD.radius - 1, 300]]) {
    const game = playing();
    game.ball = { x: 480, y, vx: 100, vy };
    updateGame(game, {}, 0.02);
    assert.equal(Math.sign(game.ball.vy), -Math.sign(vy));
    assert.ok(game.ball.y >= FIELD.radius && game.ball.y <= FIELD.height - FIELD.radius);
  }
});

test("both paddle faces return shots without repeated collisions", () => {
  for (const index of [0, 1]) {
    const game = playing();
    const face = index === 0 ? FIELD.inset + FIELD.paddleWidth : FIELD.width - FIELD.inset - FIELD.paddleWidth;
    game.ball = {
      x: face + (index === 0 ? 10 : -10), y: 270,
      vx: index === 0 ? -360 : 360, vy: 0,
    };
    updateGame(game, {}, 0.01);
    assert.equal(Math.sign(game.ball.vx), index === 0 ? 1 : -1);
    assert.ok(Math.hypot(game.ball.vx, game.ball.vy) > 360);
    const speed = Math.hypot(game.ball.vx, game.ball.vy);
    updateGame(game, {}, 0.01);
    assert.equal(Math.hypot(game.ball.vx, game.ball.vy), speed);
  }
});

test("paddle edge hits change angle and respect the speed limit", () => {
  const game = playing();
  game.ball = { x: 56, y: game.paddles[0] + 5, vx: -FIELD.maxBallSpeed, vy: 0 };
  updateGame(game, {}, 0.01);
  assert.ok(game.ball.vx > 0);
  assert.ok(game.ball.vy < 0);
  assert.ok(Math.hypot(game.ball.vx, game.ball.vy) <= FIELD.maxBallSpeed + 1e-8);
});

test("fast shots cannot tunnel through a paddle during a long frame", () => {
  const game = playing();
  game.ball = { x: 110, y: 270, vx: -FIELD.maxBallSpeed, vy: 0 };
  updateGame(game, {}, 0.1);
  assert.ok(game.ball.vx > 0);
  assert.deepEqual(game.scores, [0, 0]);
});

test("missed paddles award the opponent exactly one point and delay the serve", () => {
  for (const scorer of [0, 1]) {
    const game = playing();
    game.ball = { x: scorer === 0 ? 968 : -8, y: 30, vx: scorer === 0 ? 360 : -360, vy: 0 };
    updateGame(game, {}, 0.02);
    assert.equal(game.scores[scorer], 1);
    assert.equal(game.scores[1 - scorer], 0);
    assert.ok(game.serveTimer > 0);
    assert.equal(game.ball.vx, 0);
    for (let i = 0; i < 12; i += 1) updateGame(game, {}, 0.1);
    assert.equal(Math.sign(game.ball.vx), scorer === 0 ? 1 : -1);
    assert.equal(game.scores[scorer], 1);
  }
});

test("seven points ends the game and freezes play until a fresh game", () => {
  for (const scorer of [0, 1]) {
    const game = playing();
    game.scores[scorer] = 6;
    game.ball = { x: scorer === 0 ? 970 : -10, y: 30, vx: scorer === 0 ? 360 : -360, vy: 0 };
    updateGame(game, {}, 0.02);
    assert.equal(game.phase, "won");
    assert.equal(game.winner, scorer);
    assert.equal(game.scores[scorer], FIELD.winningScore);
    const before = structuredClone(game);
    togglePause(game);
    startGame(game);
    updateGame(game, { left: 1 }, 0.1);
    assert.deepEqual(game, before);
    assert.deepEqual(createGame(game.mode).scores, [0, 0]);
  }
});

test("invalid time deltas do not change state and long gaps are bounded", () => {
  const game = playing();
  const before = structuredClone(game);
  for (const dt of [0, -1, NaN, Infinity]) updateGame(game, {}, dt);
  assert.deepEqual(game, before);
  updateGame(game, {}, 10);
  assert.ok(game.ball.x - before.ball.x <= FIELD.ballSpeed * 0.1 + 1e-8);
});
