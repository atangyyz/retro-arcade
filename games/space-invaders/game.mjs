export const WIDTH = 800;
export const HEIGHT = 600;

const PLAYER_SPEED = 340;
const FIRE_COOLDOWN = 0.24;
const STEP = 1 / 120;
const WAVE_DELAY = 0.75;
const INVULNERABILITY = 1.5;

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x
    && a.y < b.y + b.h && a.y + a.h > b.y;
}

function sweptShot(shot, oldY) {
  return {
    x: shot.x,
    y: Math.min(oldY, shot.y),
    w: shot.w,
    h: shot.h + Math.abs(shot.y - oldY),
  };
}

export class Game {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this._reset();
    this.status = 'ready';
  }

  _reset() {
    this.score = 0;
    this.wave = 1;
    this.lives = 3;
    this.player = { x: 380, y: 548, w: 40, h: 24, invulnerable: 0 };
    this.playerShots = [];
    this.enemyShots = [];
    this.waveDelay = 0;
    this._fireCooldown = 0;
    this._spawnWave();
  }

  _spawnWave() {
    this.aliens = [];
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        this.aliens.push({
          x: 140 + col * 52,
          y: 72 + row * 40,
          w: 32,
          h: 24,
          row,
          col,
          alive: true,
        });
      }
    }
    this._direction = 1;
    this._alienSpeed = 26 + (this.wave - 1) * 10;
    this._enemyCountdown = Math.max(0.3, 1 - (this.wave - 1) * 0.08);
  }

  start() {
    this._reset();
    this.status = 'playing';
  }

  pause() {
    if (this.status === 'playing') this.status = 'paused';
  }

  resume() {
    if (this.status === 'paused') this.status = 'playing';
  }

  update(dt, { left = false, right = false, fire = false } = {}) {
    if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    // Bound stalled frames, then subdivide movement and use swept projectile hits.
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-10 && this.status === 'playing') {
      const step = Math.min(STEP, remaining);
      this._step(step, left, right, fire);
      remaining -= step;
    }
  }

  _step(dt, left, right, fire) {
    const player = this.player;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.x = Math.max(0, Math.min(WIDTH - player.w,
      player.x + (Number(right) - Number(left)) * PLAYER_SPEED * dt));
    this._fireCooldown = Math.max(0, this._fireCooldown - dt);

    if (this.waveDelay > 0) {
      this.waveDelay = Math.max(0, this.waveDelay - dt);
      if (this.waveDelay <= 1e-10) {
        this.waveDelay = 0;
        this._spawnWave();
        player.invulnerable = INVULNERABILITY;
      }
      return;
    }

    let living = this.aliens.filter(alien => alien.alive);
    if (!living.length) {
      this._nextWave();
      return;
    }

    if (fire && this._fireCooldown <= 1e-10) {
      this.playerShots.push({
        x: player.x + player.w / 2 - 2,
        y: player.y - 12,
        w: 4,
        h: 12,
        vy: -560,
      });
      this._fireCooldown = FIRE_COOLDOWN;
    }

    const minX = Math.min(...living.map(alien => alien.x));
    const maxX = Math.max(...living.map(alien => alien.x + alien.w));
    const travel = this._direction * this._alienSpeed * dt;
    const boundedTravel = Math.max(16 - minX, Math.min(WIDTH - 16 - maxX, travel));
    const bounce = boundedTravel !== travel;
    for (const alien of living) {
      alien.x += boundedTravel;
      if (bounce) alien.y += 18;
    }
    if (bounce) this._direction *= -1;
    if (living.some(alien => alien.y + alien.h >= player.y)) {
      this.status = 'gameover';
      return;
    }

    this.playerShots = this.playerShots.filter(shot => {
      const oldY = shot.y;
      shot.y += shot.vy * dt;
      const path = sweptShot(shot, oldY);
      // Hit the nearest target first even when a fast shot crosses several rows.
      const targets = living.filter(alien => alien.alive && overlaps(path, alien));
      targets.sort((a, b) => shot.vy < 0 ? b.y - a.y : a.y - b.y);
      if (targets.length) {
        targets[0].alive = false;
        this.score += Math.max(10, 50 - targets[0].row * 10);
        return false;
      }
      return shot.y + shot.h >= 0 && shot.y <= HEIGHT;
    });

    living = living.filter(alien => alien.alive);
    if (!living.length) {
      this._nextWave();
      return;
    }

    this._enemyCountdown -= dt;
    if (this._enemyCountdown <= 0) {
      const columns = new Map();
      for (const alien of living) {
        const column = alien.col ?? alien.x;
        if (!columns.has(column) || columns.get(column).y < alien.y) {
          columns.set(column, alien);
        }
      }
      const shooters = [...columns.values()];
      const index = Math.min(shooters.length - 1,
        Math.max(0, Math.floor(this.random() * shooters.length)));
      const shooter = shooters[index];
      this.enemyShots.push({
        x: shooter.x + shooter.w / 2 - 3,
        y: shooter.y + shooter.h,
        w: 6,
        h: 12,
        vy: 200 + this.wave * 20,
      });
      this._enemyCountdown = Math.max(0.22, 1.3 - (this.wave - 1) * 0.09)
        * (0.8 + this.random() * 0.4);
    }

    this.enemyShots = this.enemyShots.filter(shot => {
      const oldY = shot.y;
      shot.y += shot.vy * dt;
      if (overlaps(sweptShot(shot, oldY), player)) {
        if (player.invulnerable === 0 && this.status === 'playing') {
          this.lives -= 1;
          player.invulnerable = INVULNERABILITY;
          if (this.lives <= 0) this.status = 'gameover';
        }
        return false;
      }
      return shot.y <= HEIGHT && shot.y + shot.h >= 0;
    });
  }

  _nextWave() {
    this.wave += 1;
    this.waveDelay = WAVE_DELAY;
    this.aliens = [];
    this.playerShots = [];
    this.enemyShots = [];
    this._fireCooldown = 0;
    this.player.invulnerable = INVULNERABILITY;
  }
}
