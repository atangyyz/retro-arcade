export const WORLD_WIDTH = 1000;
export const WORLD_HEIGHT = 700;
export const ROCK_RADII = [17, 32, 58];
const ROCK_POINTS = [100, 50, 20];
const TAU = Math.PI * 2;

export function wrap(value, limit) {
  return ((value % limit) + limit) % limit;
}

export function distance(a, b, width = WORLD_WIDTH, height = WORLD_HEIGHT) {
  const dx = Math.abs(wrap(a.x - b.x, width));
  const dy = Math.abs(wrap(a.y - b.y, height));
  return Math.hypot(Math.min(dx, width - dx), Math.min(dy, height - dy));
}

export class AsteroidsGame {
  constructor(random = Math.random) {
    this.random = random;
    this.state = "ready";
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.bullets = [];
    this.particles = [];
    this.events = [];
    this.ship = this.createShip();
    this.asteroids = Array.from({ length: 6 }, () => this.createAsteroid(2));
    this.waveDelay = 0;
    this.respawnDelay = 0;
  }

  createShip() {
    return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, vx: 0, vy: 0, angle: -Math.PI / 2, radius: 12, cooldown: 0, invulnerable: 3, active: true, thrusting: false };
  }

  createAsteroid(size, position) {
    const angle = this.random() * TAU;
    const speed = (40 + this.random() * 25) * (1 + (2 - size) * .5) * (1 + (this.wave - 1) * .12);
    return {
      x: position?.x ?? this.random() * WORLD_WIDTH,
      y: position?.y ?? this.random() * WORLD_HEIGHT,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: ROCK_RADII[size],
      size,
      angle,
      spin: (this.random() - .5) * 1.2,
      vertices: Array.from({ length: 12 }, () => .75 + this.random() * .25),
    };
  }

  start() {
    this.state = "playing";
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.ship = this.createShip();
    this.bullets = [];
    this.particles = [];
    this.events = [];
    this.waveDelay = 0;
    this.respawnDelay = 0;
    this.spawnWave();
  }

  spawnWave() {
    this.asteroids = Array.from({ length: Math.min(3 + this.wave, 14) }, () => {
      const rock = this.createAsteroid(2);
      for (let attempt = 0; attempt < 30 && distance(rock, this.ship) < 230; attempt++) {
        rock.x = this.random() * WORLD_WIDTH;
        rock.y = this.random() * WORLD_HEIGHT;
      }
      if (distance(rock, this.ship) < 230) {
        rock.x = wrap(this.ship.x + WORLD_WIDTH / 2, WORLD_WIDTH);
        rock.y = wrap(this.ship.y + WORLD_HEIGHT / 2, WORLD_HEIGHT);
      }
      return rock;
    });
    this.events.push({ type: "wave", wave: this.wave });
  }

  togglePause() {
    if (this.state === "playing") this.state = "paused";
    else if (this.state === "paused") this.state = "playing";
  }

  move(body, dt) {
    body.x = wrap(body.x + body.vx * dt, WORLD_WIDTH);
    body.y = wrap(body.y + body.vy * dt, WORLD_HEIGHT);
  }

  fire() {
    const ship = this.ship;
    if (!ship.active || ship.cooldown > 0 || this.bullets.length >= 8) return;
    this.bullets.push({
      x: wrap(ship.x + Math.cos(ship.angle) * 19, WORLD_WIDTH),
      y: wrap(ship.y + Math.sin(ship.angle) * 19, WORLD_HEIGHT),
      vx: Math.cos(ship.angle) * 650 + ship.vx,
      vy: Math.sin(ship.angle) * 650 + ship.vy,
      radius: 2,
      life: 1,
    });
    ship.cooldown = .17;
    this.events.push({ type: "fire" });
  }

  burst(body, count, color) {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU;
      const speed = 35 + this.random() * 140;
      this.particles.push({ x: body.x, y: body.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .3 + this.random() * .5, color });
    }
  }

  destroyAsteroid(index) {
    const rock = this.asteroids.splice(index, 1)[0];
    this.score += ROCK_POINTS[rock.size];
    this.burst(rock, 12, "mint");
    if (rock.size > 0) {
      for (let i = 0; i < 2; i++) {
        const child = this.createAsteroid(rock.size - 1, rock);
        child.x = wrap(child.x + (i ? 1 : -1) * child.radius * .5, WORLD_WIDTH);
        this.asteroids.push(child);
      }
    }
    this.events.push({ type: "hit" });
  }

  loseLife() {
    this.burst(this.ship, 30, "amber");
    this.ship.active = false;
    this.ship.thrusting = false;
    this.lives--;
    this.bullets = [];
    this.events.push({ type: "death", lives: this.lives });
    if (this.lives === 0) {
      this.state = "gameover";
      this.events.push({ type: "gameover", score: this.score, wave: this.wave });
    } else {
      this.respawnDelay = 1.2;
    }
  }

  respawn() {
    this.ship = this.createShip();
    let best = { x: this.ship.x, y: this.ship.y };
    let bestClearance = -Infinity;
    for (let i = 0; i < 30; i++) {
      const candidate = i === 0 ? best : { x: this.random() * WORLD_WIDTH, y: this.random() * WORLD_HEIGHT };
      const clearance = Math.min(...this.asteroids.map(rock => distance(candidate, rock) - rock.radius));
      if (clearance > bestClearance) {
        best = candidate;
        bestClearance = clearance;
      }
      if (clearance > 180) break;
    }
    this.ship.x = best.x;
    this.ship.y = best.y;
  }

  update(dt, input = {}) {
    if (this.state === "paused") return;
    for (const rock of this.asteroids) {
      this.move(rock, dt);
      rock.angle += rock.spin * dt;
    }
    for (const particle of this.particles) {
      this.move(particle, dt);
      particle.life -= dt;
    }
    this.particles = this.particles.filter(particle => particle.life > 0);
    if (this.state !== "playing") return;

    const ship = this.ship;
    if (ship.active) {
      ship.invulnerable = Math.max(0, ship.invulnerable - dt);
      ship.cooldown = Math.max(0, ship.cooldown - dt);
      ship.angle += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 4.5 * dt;
      ship.thrusting = Boolean(input.thrust);
      if (input.thrust) {
        ship.vx += Math.cos(ship.angle) * 270 * dt;
        ship.vy += Math.sin(ship.angle) * 270 * dt;
      }
      const speed = Math.hypot(ship.vx, ship.vy);
      const damping = Math.exp(-.15 * dt) * (speed > 440 ? 440 / speed : 1);
      ship.vx *= damping;
      ship.vy *= damping;
      this.move(ship, dt);
      if (input.fire) this.fire();
    } else {
      this.respawnDelay -= dt;
      if (this.respawnDelay <= 0) this.respawn();
    }

    for (const bullet of this.bullets) {
      this.move(bullet, dt);
      bullet.life -= dt;
      if (bullet.life <= 0) continue;
      const index = this.asteroids.findIndex(rock => distance(bullet, rock) < rock.radius + bullet.radius);
      if (index !== -1) {
        bullet.life = 0;
        this.destroyAsteroid(index);
      }
    }
    this.bullets = this.bullets.filter(bullet => bullet.life > 0);

    if (this.ship.active && this.ship.invulnerable <= 0 &&
        this.asteroids.some(rock => distance(this.ship, rock) < this.ship.radius + rock.radius)) {
      this.loseLife();
    }
    if (this.state !== "playing") return;
    if (this.asteroids.length === 0) {
      if (this.waveDelay === 0) {
        this.waveDelay = 1.8;
        this.bullets = [];
      }
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this.wave++;
        this.waveDelay = 0;
        this.ship.invulnerable = Math.max(this.ship.invulnerable, 2);
        this.spawnWave();
      }
    }
  }
}
