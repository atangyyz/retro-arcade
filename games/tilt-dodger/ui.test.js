import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as engine from './game.js';
import { pointerTarget, orientationAxis, readBest, writeBest, installControls } from './controls.js';

class Target {
  constructor(tagName = 'DIV') {
    this.tagName = tagName;
    this.listeners = new Map();
    this.attributes = {};
    this.disabled = false;
    this.hidden = false;
    this.textChanges = 0;
  }
  set textContent(value) { this.text = value; this.textChanges++; }
  get textContent() { return this.text; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, values = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
    return event;
  }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function browser() {
  const win = new Target('WINDOW');
  const doc = new Target('DOCUMENT');
  const ids = [
    'game', 'score', 'stars', 'best', 'start', 'pause', 'overlay',
    'overlay-title', 'overlay-copy', 'game-status', 'control-status', 'tilt', 'recalibrate',
  ];
  const elements = Object.fromEntries(ids.map(id => [
    id, new Target(['start', 'pause', 'tilt', 'recalibrate'].includes(id) ? 'BUTTON' : 'DIV'),
  ]));
  const canvas = elements.game;
  canvas.tagName = 'CANVAS';
  const captures = new Set();
  canvas.getBoundingClientRect = () => ({ left: 20, width: 180 });
  canvas.focus = options => { doc.activeElement = canvas; canvas.focusOptions = options; };
  canvas.setPointerCapture = id => captures.add(id);
  canvas.hasPointerCapture = id => captures.has(id);
  canvas.releasePointerCapture = id => {
    captures.delete(id);
    canvas.emit('lostpointercapture', { pointerId: id });
  };
  canvas.getContext = () => new Proxy({}, { get: () => () => {} });
  doc.getElementById = id => elements[id];
  doc.hidden = false;
  doc.activeElement = null;
  win.isSecureContext = true;
  win.DeviceOrientationEvent = {};
  win.screen = { orientation: new Target() };
  win.screen.orientation.angle = 0;
  win.matchMedia = () => ({ matches: false });
  const storage = new Map();
  win.storageWrites = 0;
  win.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { win.storageWrites++; storage.set(key, value); },
  };
  const timers = new Map();
  let nextTimer = 1;
  win.setTimeout = fn => { const id = nextTimer++; timers.set(id, fn); return id; };
  win.clearTimeout = id => timers.delete(id);
  win.expireTimers = () => {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach(fn => fn());
  };
  win.timerCount = () => timers.size;
  const frames = [];
  win.requestAnimationFrame = fn => frames.push(fn);
  win.frame = time => { assert.ok(frames.length); frames.shift()(time); };
  return { win, doc, elements, canvas, captures, storage };
}

function controlsFixture(configure = () => {}) {
  const env = browser();
  configure(env);
  const targets = [];
  const statuses = [];
  const pauses = [];
  let starts = 0;
  let x = 180;
  let playing = true;
  const controls = installControls({
    ...env, tiltButton: env.elements.tilt, recalibrateButton: env.elements.recalibrate,
    width: 360, moveSpeed: 320, getX: () => x, isPlaying: () => playing,
    onTarget: value => targets.push(value), onPause: toggle => pauses.push(toggle),
    onStart: () => starts++, onStatus: value => statuses.push(value),
  });
  return {
    ...env, controls, targets, statuses, pauses,
    get starts() { return starts; },
    setX(value) { x = value; },
    setPlaying(value) { playing = value; },
  };
}

const tick = () => Promise.resolve();
const clickTilt = f => f.elements.tilt.emit('click');
const orient = (f, beta, gamma) => f.win.emit('deviceorientation', { beta, gamma });
const pointer = (f, type, pointerId, clientX = 110) => f.canvas.emit(type, { pointerId, clientX, button: 0 });
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

test('pointer target uses CSS bounds, offset, scaling, clamping, and invalid-bound guards', () => {
  const rect = { left: 20, width: 180 };
  assert.equal(pointerTarget(110, rect, 360), 180);
  assert.equal(pointerTarget(-50, rect, 360), 0);
  assert.equal(pointerTarget(500, rect, 360), 360);
  assert.equal(pointerTarget(10, { left: 0, width: 0 }, 360), null);
  assert.equal(pointerTarget(10, { left: NaN, width: 100 }, 360), null);
  assert.equal(pointerTarget(NaN, rect, 360), null);
});

test('orientation uses beta and gamma for screen rotation, rejects missing/nonfinite values', () => {
  approximately(orientationAxis({ beta: 30, gamma: 10 }, 0), 10);
  approximately(orientationAxis({ beta: 30, gamma: 10 }, 90), 30);
  approximately(orientationAxis({ beta: 30, gamma: 10 }, 180), -10);
  approximately(orientationAxis({ beta: 30, gamma: 10 }, 270), -30);
  approximately(orientationAxis({ beta: 30, gamma: 10 }, -90), -30);
  for (const invalid of [null, undefined, NaN, Infinity, '10']) {
    assert.equal(orientationAxis({ beta: invalid, gamma: 10 }), null);
    assert.equal(orientationAxis({ beta: 30, gamma: invalid }), null);
  }
});

test('best storage handles corrupt values, denied access, quota failure, and persistence', () => {
  const { win, storage } = browser();
  assert.equal(readBest(win), 0);
  for (const value of ['broken', '-1', 'Infinity', 'NaN', '1e100']) {
    storage.set('tilt-dodger-best', value);
    assert.equal(readBest(win), 0);
  }
  storage.set('tilt-dodger-best', '42.9');
  assert.equal(readBest(win), 42);
  writeBest(win, 99);
  assert.equal(readBest(win), 99);
  const blocked = { get localStorage() { throw new Error('blocked'); } };
  assert.equal(readBest(blocked), 0);
  assert.doesNotThrow(() => writeBest(blocked, 50));
  assert.doesNotThrow(() => writeBest({ localStorage: { setItem() { throw Error('quota'); } } }, 50));
});

test('drag captures one pointer, maps absolute target, and releases on up/cancel/lost capture', () => {
  for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const f = controlsFixture();
    assert.equal(pointer(f, 'pointerdown', 1, 65).defaultPrevented, true);
    assert.equal(f.doc.activeElement, f.canvas);
    assert.ok(f.captures.has(1));
    assert.equal(f.targets.at(-1), 90);
    pointer(f, 'pointerdown', 2, 200);
    pointer(f, 'pointermove', 2, 200);
    assert.equal(f.targets.length, 1);
    pointer(f, 'pointermove', 1, 500);
    assert.equal(f.targets.at(-1), 360);
    (ending === 'lostpointercapture' ? f.canvas : f.win).emit(ending, { pointerId: 1 });
    const count = f.targets.length;
    pointer(f, 'pointermove', 1, 20);
    assert.equal(f.targets.length, count);
    assert.equal(f.captures.size, 0);
    pointer(f, 'pointerdown', 3, 20);
    assert.equal(f.targets.at(-1), 0);
    f.controls.destroy();
  }
});

test('keyboard steers at engine speed, respects focus and form controls, and clears on blur', () => {
  const f = controlsFixture();
  f.win.emit('keydown', { key: 'ArrowLeft' });
  f.controls.update(0.05);
  assert.equal(f.targets.length, 0);
  f.canvas.focus();
  const key = f.win.emit('keydown', { key: 'ArrowLeft', target: f.canvas });
  assert.ok(key.defaultPrevented);
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 164);
  f.win.emit('keyup', { key: 'ArrowLeft' });
  f.win.emit('keydown', { key: 'D', target: f.canvas });
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 196);
  f.canvas.emit('blur');
  const count = f.targets.length;
  f.controls.update(0.05);
  assert.equal(f.targets.length, count);
  f.win.emit('keydown', { key: 'p', target: f.canvas });
  f.win.emit('keydown', { key: 'p', target: f.canvas, repeat: true });
  assert.deepEqual(f.pauses, [true]);
  f.win.emit('keydown', { key: 'Enter', target: f.canvas });
  assert.equal(f.starts, 1);
  f.win.emit('keydown', { key: 'p', target: f.elements.tilt });
  assert.deepEqual(f.pauses, [true]);
  f.controls.destroy();
});

test('touch is the default; unsupported or insecure tilt never requests permission', () => {
  for (const configure of [
    f => { f.win.isSecureContext = false; },
    f => { delete f.win.DeviceOrientationEvent; },
  ]) {
    const f = controlsFixture(configure);
    assert.match(f.statuses.at(-1), /unavailable/);
    clickTilt(f);
    assert.match(f.statuses.at(-1), /drag/);
    pointer(f, 'pointerdown', 1);
    assert.equal(f.targets.at(-1), 180);
    f.controls.destroy();
  }
});

test('permission is requested synchronously only by a click, then readings calibrate', async () => {
  let calls = 0;
  const f = controlsFixture(({ win }) => {
    win.DeviceOrientationEvent.requestPermission = () => { calls++; return Promise.resolve('granted'); };
  });
  assert.equal(calls, 0);
  clickTilt(f);
  assert.equal(calls, 1);
  assert.equal(f.win.listeners.get('deviceorientation')?.size ?? 0, 0);
  assert.equal(f.elements.tilt.textContent, 'Cancel tilt');
  await tick();
  assert.equal(f.elements.tilt.attributes['aria-pressed'], 'true');
  assert.equal(f.elements.recalibrate.disabled, false);
  orient(f, 30, 14);
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 180);
  assert.equal(f.win.timerCount(), 0);
  assert.match(f.statuses.at(-1), /ready/);
  f.controls.destroy();
});

test('denied, rejected, and throwing permission requests leave touch usable', async () => {
  for (const request of [
    () => Promise.resolve('denied'),
    () => Promise.reject(Error('denied')),
    () => { throw Error('blocked'); },
  ]) {
    const f = controlsFixture(({ win }) => { win.DeviceOrientationEvent.requestPermission = request; });
    clickTilt(f);
    await tick();
    assert.equal(f.elements.tilt.attributes['aria-pressed'], 'false');
    assert.match(f.statuses.at(-1), /drag/);
    pointer(f, 'pointerdown', 1, 50);
    assert.equal(f.targets.at(-1), 60);
    f.controls.destroy();
  }
});

test('late permission grants cannot enable tilt after cancellation, blur, hiding, or destruction', async () => {
  for (const cancel of [
    f => clickTilt(f),
    f => f.win.emit('blur'),
    f => { f.doc.hidden = true; f.doc.emit('visibilitychange'); },
    f => { f.doc.hidden = true; },
    f => f.controls.destroy(),
  ]) {
    let resolve;
    const f = controlsFixture(({ win }) => {
      win.DeviceOrientationEvent.requestPermission = () => new Promise(done => { resolve = done; });
    });
    clickTilt(f);
    cancel(f);
    resolve('granted');
    await tick();
    assert.equal(f.elements.tilt.attributes['aria-pressed'], 'false');
    assert.equal(f.win.listeners.get('deviceorientation')?.size ?? 0, 0);
    assert.equal(f.win.timerCount(), 0);
    f.controls.destroy();
  }
});

test('a stale request cannot replace a newer request', async () => {
  const resolves = [];
  const f = controlsFixture(({ win }) => {
    win.DeviceOrientationEvent.requestPermission = () => new Promise(resolve => resolves.push(resolve));
  });
  clickTilt(f);
  clickTilt(f);
  clickTilt(f);
  resolves[0]('granted');
  await tick();
  assert.equal(f.elements.tilt.textContent, 'Cancel tilt');
  resolves[1]('denied');
  await tick();
  assert.equal(f.elements.tilt.textContent, 'Enable tilt');
  assert.equal(f.win.listeners.get('deviceorientation')?.size ?? 0, 0);
  f.controls.destroy();
});

test('missing and invalid readings expire to touch without permission prompts', async () => {
  const f = controlsFixture();
  clickTilt(f);
  await tick();
  orient(f, null, null);
  orient(f, Infinity, 20);
  assert.equal(f.win.timerCount(), 1);
  f.win.expireTimers();
  assert.match(f.statuses.at(-1), /No tilt readings/);
  assert.equal(f.elements.tilt.attributes['aria-pressed'], 'false');
  assert.equal(f.win.listeners.get('deviceorientation').size, 0);
  f.controls.destroy();
});

test('tilt has deadzone, smoothing, drag override, recalibration, and rotation reset', async () => {
  const f = controlsFixture();
  clickTilt(f);
  await tick();
  orient(f, 40, 20);
  orient(f, 40, 21.5);
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 180);
  orient(f, 40, 40);
  f.controls.update(0.05);
  const first = f.targets.at(-1);
  assert.ok(first > 180 && first < 309.6);
  f.controls.update(0.05);
  assert.ok(f.targets.at(-1) > first);
  pointer(f, 'pointerdown', 1, 35);
  assert.equal(f.targets.at(-1), 30);
  const count = f.targets.length;
  f.controls.update(0.05);
  assert.equal(f.targets.length, count);
  f.setX(30);
  f.win.emit('pointerup', { pointerId: 1 });
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 30);
  orient(f, 40, 45);
  f.setX(70);
  f.elements.recalibrate.emit('click');
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 70);
  f.win.screen.orientation.angle = 90;
  f.win.screen.orientation.emit('change');
  assert.match(f.statuses.at(-1), /rotated/);
  orient(f, 60, -10);
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 70);
  orient(f, 80, -10);
  f.controls.update(0.05);
  assert.ok(f.targets.at(-1) > 70);
  f.setPlaying(false);
  const pausedCount = f.targets.length;
  f.controls.update(0.05);
  assert.equal(f.targets.length, pausedCount);
  f.controls.destroy();
});

function mainFixture(configure = () => {}) {
  const env = browser();
  configure(env);
  const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8')
    .replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '');
  const context = vm.createContext({
    ...engine, installControls, readBest, writeBest,
    window: env.win, document: env.doc, console,
  });
  vm.runInContext(`${source}\nglobalThis.testGame = game;`, context, { filename: 'main.js' });
  return { ...env, game: context.testGame };
}

test('browser main starts, pauses, resumes, retries, announces transitions, and persists best', () => {
  const f = mainFixture(({ storage }) => storage.set('tilt-dodger-best', '50'));
  assert.equal(f.game.status, 'ready');
  assert.equal(f.elements.best.textContent, '50');
  assert.equal(f.elements.pause.disabled, true);
  f.elements.start.emit('click');
  assert.equal(f.game.status, 'playing');
  assert.equal(f.elements.overlay.hidden, true);
  assert.equal(f.elements.start.disabled, true);
  const announcements = f.elements['game-status'].textChanges;
  f.win.frame(0);
  for (let i = 1; i <= 10; i++) f.win.frame(i * 16);
  assert.equal(f.elements['game-status'].textChanges, announcements);
  f.elements.pause.emit('click');
  assert.equal(f.game.status, 'paused');
  assert.equal(f.elements.pause.textContent, 'Resume');
  const elapsed = f.game.elapsed;
  f.win.frame(1000);
  f.win.frame(1100);
  assert.equal(f.game.elapsed, elapsed);
  f.elements.pause.emit('click');
  assert.equal(f.game.status, 'playing');
  f.game.elapsed = 6;
  f.game.obstacles = [{ x: f.game.x, y: engine.SHIP_Y, radius: 17 }];
  f.win.frame(1200);
  f.win.frame(1216);
  assert.equal(f.game.status, 'gameover');
  assert.equal(f.elements.start.textContent, 'Retry flight');
  assert.match(f.elements['game-status'].textContent, /Flight over/);
  assert.equal(readBest(f.win), 60);
  f.elements.start.emit('click');
  assert.equal(f.game.status, 'playing');
  assert.equal(f.game.score, 0);
  assert.equal(f.game.best, 60);
});

test('main auto-pauses on hiding or blur without auto-resume or a time jump', () => {
  for (const hide of [
    f => { f.doc.hidden = true; f.doc.emit('visibilitychange'); },
    f => f.win.emit('blur'),
  ]) {
    const f = mainFixture();
    f.elements.start.emit('click');
    f.win.frame(0);
    f.win.frame(16);
    pointer(f, 'pointerdown', 7);
    hide(f);
    assert.equal(f.game.status, 'paused');
    assert.equal(f.captures.size, 0);
    const elapsed = f.game.elapsed;
    f.doc.hidden = false;
    f.doc.emit('visibilitychange');
    f.win.emit('focus');
    f.win.frame(100000);
    assert.equal(f.game.status, 'paused');
    assert.equal(f.game.elapsed, elapsed);
    f.elements.pause.emit('click');
    f.win.frame(100016);
    assert.equal(f.game.elapsed, elapsed);
    f.win.frame(100032);
    assert.ok(f.game.elapsed - elapsed < 0.02);
  }
});

test('Resume restores canvas focus and keyboard steering without stealing focus on Pause', () => {
  const f = mainFixture();
  f.elements.start.emit('click');
  f.win.frame(0);
  f.win.frame(16);
  f.doc.activeElement = f.elements.pause;
  f.elements.pause.emit('click');
  assert.equal(f.game.status, 'paused');
  assert.equal(f.doc.activeElement, f.elements.pause);
  f.elements.pause.emit('click');
  assert.equal(f.game.status, 'playing');
  assert.equal(f.doc.activeElement, f.canvas);
  assert.equal(f.canvas.focusOptions.preventScroll, true);
  f.win.emit('keydown', { key: 'ArrowRight', target: f.doc.activeElement });
  f.win.frame(32);
  f.win.frame(48);
  assert.ok(f.game.x > 180);
  f.win.emit('keyup', { key: 'ArrowRight' });
  f.win.emit('keydown', { key: 'p', target: f.doc.activeElement });
  assert.equal(f.game.status, 'paused');
  f.win.emit('keydown', { key: 'p', target: f.doc.activeElement });
  assert.equal(f.game.status, 'playing');
  const x = f.game.x;
  f.win.emit('keydown', { key: 'a', target: f.doc.activeElement });
  f.win.frame(64);
  f.win.frame(80);
  assert.ok(f.game.x < x);
});

test('main works with blocked storage and canvas Enter starts without stealing button keys', () => {
  const f = mainFixture(({ win }) => {
    Object.defineProperty(win, 'localStorage', { get() { throw Error('denied'); } });
  });
  f.canvas.focus();
  f.win.emit('keydown', { key: 'Enter', target: f.canvas });
  assert.equal(f.game.status, 'playing');
  f.win.emit('keydown', { key: 'p', target: f.canvas });
  assert.equal(f.game.status, 'paused');
  f.win.emit('keydown', { key: 'p', target: f.canvas });
  assert.equal(f.game.status, 'playing');
  f.game.elapsed = 5;
  assert.doesNotThrow(() => { f.win.frame(0); f.win.frame(16); });
  assert.ok(f.game.best >= 50);
});

test('retry recenters active tilt at the reset ship position', async () => {
  const f = mainFixture();
  clickTilt(f);
  await tick();
  f.game.x = 310;
  orient(f, 35, 12);
  f.elements.start.emit('click');
  assert.equal(f.game.x, 180);
  f.win.frame(0);
  f.win.frame(16);
  assert.equal(f.game.targetX, 180);
  assert.equal(f.game.x, 180);
});
