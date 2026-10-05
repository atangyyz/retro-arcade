export const FIELD = Object.freeze({
  width: 960, height: 540, paddleWidth: 14, paddleHeight: 96,
  inset: 32, radius: 8, paddleSpeed: 420, ballSpeed: 360,
  maxBallSpeed: 780, winningScore: 7,
});

export function createGame(mode = "solo") {
  return {
    mode, phase: "ready", scores: [0, 0], winner: null,
    paddles: [222, 222], ball: { x: 480, y: 270, vx: 0, vy: 0 },
    serveTimer: 0, serveDirection: 1,
  };
}

export function serve(game, direction = 1) {
  game.ball = {
    x: FIELD.width / 2, y: FIELD.height / 2,
    vx: direction * FIELD.ballSpeed, vy: FIELD.ballSpeed * 0.35,
  };
}

export function startGame(game) {
  if (game.phase !== "ready") return;
  game.phase = "playing";
  serve(game);
}

export function togglePause(game) {
  if (game.phase === "playing") game.phase = "paused";
  else if (game.phase === "paused") game.phase = "playing";
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function tick(game, input, dt) {
  const f = FIELD;
  const ball = game.ball;
  const left = clamp(input.left || 0, -1, 1);
  const target = game.serveTimer > 0 ? f.height / 2 : ball.y;
  const distance = target - (game.paddles[1] + f.paddleHeight / 2);
  const right = game.mode === "solo"
    ? (Math.abs(distance) > 12 ? Math.sign(distance) * 0.72 : 0)
    : clamp(input.right || 0, -1, 1);
  [left, right].forEach((movement, index) => {
    game.paddles[index] = clamp(
      game.paddles[index] + movement * f.paddleSpeed * dt,
      0, f.height - f.paddleHeight,
    );
  });
  if (game.serveTimer > 0) {
    game.serveTimer = Math.max(0, game.serveTimer - dt);
    if (game.serveTimer === 0) serve(game, game.serveDirection);
    return;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.y < f.radius && ball.vy < 0) {
    ball.y = f.radius;
    ball.vy = -ball.vy;
  } else if (ball.y > f.height - f.radius && ball.vy > 0) {
    ball.y = f.height - f.radius;
    ball.vy = -ball.vy;
  }

  const index = ball.vx < 0 ? 0 : 1;
  const face = index === 0 ? f.inset + f.paddleWidth : f.width - f.inset - f.paddleWidth;
  const touchingFace = index === 0
    ? ball.x - f.radius <= face && ball.x >= f.inset
    : ball.x + f.radius >= face && ball.x <= f.width - f.inset;
  const paddleY = game.paddles[index];
  if (touchingFace && ball.y + f.radius >= paddleY && ball.y - f.radius <= paddleY + f.paddleHeight) {
    const offset = clamp((ball.y - paddleY - f.paddleHeight / 2) / (f.paddleHeight / 2), -1, 1);
    const angle = offset * Math.PI / 3;
    const speed = Math.min(f.maxBallSpeed, Math.hypot(ball.vx, ball.vy) * 1.06);
    ball.x = face + (index === 0 ? f.radius : -f.radius);
    ball.vx = (index === 0 ? 1 : -1) * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
  }
  if (ball.x < -f.radius || ball.x > f.width + f.radius) {
    const scorer = ball.x < 0 ? 1 : 0;
    game.scores[scorer] += 1;
    if (game.scores[scorer] >= f.winningScore) {
      game.winner = scorer;
      game.phase = "won";
    } else {
      game.serveDirection = scorer === 0 ? 1 : -1;
      game.serveTimer = 1;
    }
    game.ball = { x: f.width / 2, y: f.height / 2, vx: 0, vy: 0 };
  }
}

export function updateGame(game, input = {}, seconds = 0) {
  if (game.phase !== "playing" || !Number.isFinite(seconds) || seconds <= 0) return;
  const duration = Math.min(seconds, 0.1);
  const steps = Math.ceil(duration * 120);
  for (let i = 0; i < steps && game.phase === "playing"; i += 1) {
    tick(game, input, duration / steps);
  }
}
