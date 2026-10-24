import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as engine from './game.js';
import { orientationAxis, readBest, writeBest, installControls, detectControlMode } from './controls.js';

class Target {
  constructor(tagName = 'DIV') {
    this.tagName = tagName;
    this.listeners = new Map();
    this.attributes = {};
    this.disabled = false;
    this.hidden = false;
    this.textChanges = 0;
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
    };
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
    'overlay-title', 'overlay-copy', 'game-status', 'control-status', 'recalibrate', 'exit-flight',
    'control-hint', 'instructions',
  ];
  const elements = Object.fromEntries(ids.map(id => [
    id, new Target(['start', 'pause', 'recalibrate', 'exit-flight'].includes(id) ? 'BUTTON' : 'DIV'),
  ]));
  for (const element of Object.values(elements)) {
    element.focus = options => { doc.activeElement = element; element.focusOptions = options; };
  }
  const canvas = elements.game;
  canvas.tagName = 'CANVAS';
  const captures = new Set();
  canvas.getBoundingClientRect = () => ({ left: 20, width: 180 });
  canvas.setPointerCapture = id => captures.add(id);
  canvas.hasPointerCapture = id => captures.has(id);
  canvas.releasePointerCapture = id => {
    captures.delete(id);
    canvas.emit('lostpointercapture', { pointerId: id });
  };
  canvas.getContext = () => new Proxy({}, { get: () => () => {} });
  doc.getElementById = id => elements[id];
  const arcade = new Target();
  doc.querySelector = selector => selector === '.arcade' ? arcade : null;
  doc.body = new Target('BODY');
  doc.hidden = false;
  doc.activeElement = null;
  win.isSecureContext = true;
  win.DeviceOrientationEvent = {};
  win.screen = { orientation: new Target() };
  win.screen.orientation.angle = 0;
  win.coarsePointer = true;
  win.matchMedia = query => ({ matches: query === '(pointer: coarse)' && win.coarsePointer });
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
  return { win, doc, elements, canvas, captures, storage, arcade };
}

function controlsFixture(configure = () => {}, mode = 'tilt') {
  const env = browser();
  configure(env);
  const targets = [];
  const statuses = [];
  const pauses = [];
  let starts = 0;
  let ready = 0;
  let unavailable = 0;
  let x = 180;
  let playing = true;
  const controls = installControls({
    ...env, recalibrateButton: env.elements.recalibrate,
    width: 360, mode, getX: () => x, isPlaying: () => playing,
    onTarget: value => targets.push(value), onPause: toggle => pauses.push(toggle),
    onStart: () => starts++, onStatus: value => statuses.push(value),
    onReady: () => ready++, onUnavailable: () => unavailable++,
  });
  return {
    ...env, controls, targets, statuses, pauses,
    get starts() { return starts; },
    get ready() { return ready; },
    get unavailable() { return unavailable; },
    setX(value) { x = value; },
    setPlaying(value) { playing = value; },
  };
}

const tick = () => Promise.resolve();
const requestTilt = f => f.controls.activate();
const orient = (f, beta, gamma) => f.win.emit('deviceorientation', { beta, gamma });
const pointer = (f, type, pointerId, clientX = 110) => f.canvas.emit(type, { pointerId, clientX, button: 0 });
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);

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

test('pointer, touch, mouse and keyboard cannot steer; session keyboard shortcuts still work', () => {
  const f = controlsFixture();
  f.canvas.focus();
  pointer(f, 'pointerdown', 1, 65);
  pointer(f, 'pointermove', 1, 500);
  f.canvas.emit('touchmove', { touches: [{ clientX: 20 }] });
  f.canvas.emit('mousemove', { clientX: 20 });
  for (const key of ['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D']) {
    f.win.emit('keydown', { key, target: f.canvas });
    f.controls.update(0.05);
  }
  assert.deepEqual(f.targets, []);
  assert.equal(f.captures.size, 0);
  f.win.emit('keydown', { key: 'p', target: f.canvas });
  f.win.emit('keydown', { key: 'p', target: f.canvas, repeat: true });
  assert.deepEqual(f.pauses, [true]);
  f.win.emit('keydown', { key: 'Enter', target: f.canvas });
  assert.equal(f.starts, 1);
  f.win.emit('keydown', { key: 'p', target: f.elements.recalibrate });
  assert.deepEqual(f.pauses, [true]);
  f.controls.destroy();
});

test('unsupported or insecure devices cannot steer or become ready', () => {
  for (const configure of [
    f => { f.win.isSecureContext = false; },
    f => { delete f.win.DeviceOrientationEvent; },
  ]) {
    const f = controlsFixture(configure);
    assert.match(f.statuses.at(-1), /requires HTTPS/);
    requestTilt(f);
    pointer(f, 'pointerdown', 1);
    assert.deepEqual(f.targets, []);
    assert.equal(f.ready, 0);
    assert.equal(f.unavailable, 1);
    f.controls.destroy();
  }
});

test('permission is requested synchronously only by a click, then readings calibrate', async () => {
  let calls = 0;
  const f = controlsFixture(({ win }) => {
    win.DeviceOrientationEvent.requestPermission = () => { calls++; return Promise.resolve('granted'); };
  });
  assert.equal(calls, 0);
  requestTilt(f);
  assert.equal(calls, 1);
  assert.equal(f.win.listeners.get('deviceorientation')?.size ?? 0, 0);
  assert.equal(f.elements.recalibrate.disabled, true);
  await tick();
  assert.equal(f.ready, 0);
  assert.equal(f.elements.recalibrate.disabled, true);
  orient(f, 30, 14);
  assert.equal(f.ready, 1);
  assert.equal(f.elements.recalibrate.disabled, false);
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 180);
  assert.equal(f.win.timerCount(), 0);
  assert.match(f.statuses.at(-1), /ready/);
  f.controls.destroy();
});

test('denied, rejected, and throwing permission requests leave flight unavailable', async () => {
  for (const request of [
    () => Promise.resolve('denied'),
    () => Promise.reject(Error('denied')),
    () => { throw Error('blocked'); },
  ]) {
    const f = controlsFixture(({ win }) => { win.DeviceOrientationEvent.requestPermission = request; });
    requestTilt(f);
    await tick();
    assert.equal(f.elements.recalibrate.disabled, true);
    assert.equal(f.unavailable, 1);
    assert.equal(f.ready, 0);
    assert.match(f.statuses.at(-1), /denied|could not start/);
    pointer(f, 'pointerdown', 1, 50);
    assert.deepEqual(f.targets, []);
    f.controls.destroy();
  }
});

test('late permission grants cannot enable tilt after cancellation, blur, hiding, or destruction', async () => {
  for (const cancel of [
    f => f.controls.cancel(),
    f => f.win.emit('blur'),
    f => { f.doc.hidden = true; f.doc.emit('visibilitychange'); },
    f => { f.doc.hidden = true; },
    f => f.controls.destroy(),
  ]) {
    let resolve;
    const f = controlsFixture(({ win }) => {
      win.DeviceOrientationEvent.requestPermission = () => new Promise(done => { resolve = done; });
    });
    requestTilt(f);
    cancel(f);
    resolve('granted');
    await tick();
    assert.equal(f.elements.recalibrate.disabled, true);
    assert.equal(f.ready, 0);
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
  requestTilt(f);
  f.controls.cancel();
  requestTilt(f);
  resolves[0]('granted');
  await tick();
  assert.equal(f.unavailable, 0);
  assert.equal(f.ready, 0);
  resolves[1]('denied');
  await tick();
  assert.equal(f.unavailable, 1);
  assert.equal(f.win.listeners.get('deviceorientation')?.size ?? 0, 0);
  f.controls.destroy();
});

test('missing and invalid readings fail safely without starting flight', async () => {
  const f = controlsFixture();
  requestTilt(f);
  await tick();
  orient(f, null, null);
  orient(f, Infinity, 20);
  assert.equal(f.win.timerCount(), 1);
  f.win.expireTimers();
  assert.match(f.statuses.at(-1), /No tilt readings/);
  assert.equal(f.elements.recalibrate.disabled, true);
  assert.equal(f.ready, 0);
  assert.equal(f.unavailable, 1);
  assert.equal(f.win.listeners.get('deviceorientation').size, 0);
  f.controls.destroy();
});

test('tilt has deadzone, smoothing, no drag override, recalibration, and rotation reset', async () => {
  const f = controlsFixture();
  requestTilt(f);
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
  f.controls.update(0.05);
  assert.ok(f.targets.at(-1) > first);
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
    ...engine, installControls, detectControlMode, readBest, writeBest,
    window: env.win, document: env.doc, console,
  });
  vm.runInContext(`${source}\nglobalThis.testGame = game;`, context, { filename: 'main.js' });
  return { ...env, game: context.testGame };
}

async function startFlight(f) {
  f.elements.start.emit('click');
  await tick();
  orient(f, 35, 12);
}

test('browser main starts only after valid tilt, pauses, resumes, retries, and persists best', async () => {
  const f = mainFixture(({ storage }) => storage.set('tilt-dodger-best', '50'));
  assert.equal(f.game.status, 'ready');
  assert.equal(f.elements.best.textContent, '50');
  assert.equal(f.elements.pause.disabled, true);
  f.elements.start.emit('click');
  assert.equal(f.game.status, 'ready');
  assert.equal(f.elements.start.disabled, true);
  assert.match(f.elements.start.textContent, /Waiting/);
  assert.ok(f.arcade.classList.contains('flight-mode'));
  await tick();
  orient(f, null, null);
  assert.equal(f.game.status, 'ready');
  orient(f, 35, 12);
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

test('main auto-pauses on hiding or blur and requires tilt again before manual resume', async () => {
  for (const hide of [
    f => { f.doc.hidden = true; f.doc.emit('visibilitychange'); },
    f => f.win.emit('blur'),
  ]) {
    const f = mainFixture();
    await startFlight(f);
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
    assert.equal(f.game.status, 'paused');
    await tick();
    orient(f, 35, 12);
    assert.equal(f.game.status, 'playing');
    f.win.frame(100016);
    assert.equal(f.game.elapsed, elapsed);
    f.win.frame(100032);
    assert.ok(f.game.elapsed - elapsed < 0.02);
  }
});

test('Resume restores focus and tilt steering without enabling keyboard movement', async () => {
  const f = mainFixture();
  await startFlight(f);
  f.win.frame(0);
  f.win.frame(16);
  f.elements.pause.focus();
  f.elements.pause.emit('click');
  assert.equal(f.game.status, 'paused');
  assert.equal(f.doc.activeElement, f.elements.pause);
  f.elements.pause.focus();
  f.elements.pause.emit('click');
  assert.equal(f.game.status, 'playing');
  assert.equal(f.doc.activeElement, f.canvas);
  assert.equal(f.canvas.focusOptions.preventScroll, true);
  f.win.emit('keydown', { key: 'ArrowRight', target: f.doc.activeElement });
  f.win.frame(32);
  f.win.frame(48);
  assert.equal(f.game.x, 180);
  orient(f, 35, 35);
  f.win.frame(64);
  assert.ok(f.game.x > 180);
  f.win.emit('keyup', { key: 'ArrowRight' });
  f.win.emit('keydown', { key: 'p', target: f.doc.activeElement });
  assert.equal(f.game.status, 'paused');
  f.win.emit('keydown', { key: 'p', target: f.doc.activeElement });
  assert.equal(f.game.status, 'playing');
  const x = f.game.x;
  f.win.emit('keydown', { key: 'a', target: f.doc.activeElement });
  f.win.frame(80);
  f.win.frame(96);
  assert.equal(f.game.x, x);
});

test('main works with blocked storage and Enter requests tilt without bypassing calibration', async () => {
  const f = mainFixture(({ win }) => {
    Object.defineProperty(win, 'localStorage', { get() { throw Error('denied'); } });
  });
  f.canvas.focus();
  f.win.emit('keydown', { key: 'Enter', target: f.canvas });
  assert.equal(f.game.status, 'ready');
  await tick();
  orient(f, 35, 12);
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
  await startFlight(f);
  f.game.status = 'gameover';
  f.game.x = 310;
  orient(f, 35, 12);
  f.elements.start.emit('click');
  assert.equal(f.game.x, 180);
  f.win.frame(0);
  f.win.frame(16);
  assert.equal(f.game.targetX, 180);
  assert.equal(f.game.x, 180);
});

test('denied, absent or unavailable sensors never start a flight or leave it expanded', async () => {
  for (const configure of [
    ({ win }) => { win.DeviceOrientationEvent.requestPermission = () => Promise.resolve('denied'); },
    ({ win }) => { win.isSecureContext = false; },
    ({ win }) => { delete win.DeviceOrientationEvent; },
    () => {},
  ]) {
    const f = mainFixture(configure);
    f.elements.start.emit('click');
    await tick();
    f.win.expireTimers();
    assert.equal(f.game.status, 'ready');
    assert.equal(f.elements.start.disabled, false);
    assert.equal(f.arcade.classList.contains('flight-mode'), false);
    assert.equal(f.doc.body.classList.contains('in-flight'), false);
    pointer(f, 'pointerdown', 1, 20);
    f.win.emit('keydown', { key: 'ArrowLeft', target: f.canvas });
    f.win.frame(0);
    f.win.frame(1000);
    assert.equal(f.game.x, 180);
    assert.equal(f.game.elapsed, 0);
  }
});

test('fullscreen is requested in the start gesture, with viewport fallback on rejection or no API', async () => {
  for (const fullscreen of ['supported', 'rejected', 'throws', 'absent']) {
    const calls = [];
    const f = mainFixture(({ win, doc, arcade }) => {
      win.DeviceOrientationEvent.requestPermission = () => { calls.push('permission'); return 'granted'; };
      if (fullscreen !== 'absent') arcade.requestFullscreen = () => {
        calls.push('fullscreen');
        if (fullscreen === 'throws') throw Error('blocked');
        if (fullscreen === 'rejected') return Promise.reject(Error('blocked'));
        doc.fullscreenElement = arcade;
        doc.emit('fullscreenchange');
        return Promise.resolve();
      };
      doc.exitFullscreen = () => {
        calls.push('exit');
        doc.fullscreenElement = null;
        doc.emit('fullscreenchange');
        return Promise.resolve();
      };
    });
    f.elements.start.emit('click');
    assert.deepEqual(calls, fullscreen === 'absent' ? ['permission'] : ['permission', 'fullscreen']);
    assert.ok(f.arcade.classList.contains('flight-mode'));
    await tick();
    orient(f, 35, 12);
    assert.equal(f.game.status, 'playing');
    assert.ok(f.doc.body.classList.contains('in-flight'));
    f.elements['exit-flight'].emit('click');
    assert.equal(f.game.status, 'paused');
    assert.equal(f.arcade.classList.contains('flight-mode'), false);
    assert.equal(f.doc.body.classList.contains('in-flight'), false);
    assert.equal(f.doc.activeElement, f.elements.pause);
    if (fullscreen === 'supported') assert.equal(calls.at(-1), 'exit');
  }
});

test('native fullscreen exit pauses and returns to the normal layout', async () => {
  const f = mainFixture(({ doc, arcade }) => {
    arcade.requestFullscreen = () => {
      doc.fullscreenElement = arcade;
      doc.emit('fullscreenchange');
      return Promise.resolve();
    };
  });
  await startFlight(f);
  f.doc.fullscreenElement = null;
  f.doc.emit('fullscreenchange');
  assert.equal(f.game.status, 'paused');
  assert.equal(f.arcade.classList.contains('flight-mode'), false);
  f.elements.pause.emit('click');
  await tick();
  orient(f, 35, 12);
  assert.equal(f.game.status, 'playing');
  assert.ok(f.arcade.classList.contains('flight-mode'));
});

test('late fullscreen entry is exited after permission denial or user cancellation', async () => {
  for (const cancel of ['denied', 'exit']) {
    let enterFullscreen;
    let exits = 0;
    const f = mainFixture(({ win, doc, arcade }) => {
      win.DeviceOrientationEvent.requestPermission = () => cancel === 'denied' ? 'denied' : 'granted';
      arcade.requestFullscreen = () => new Promise(resolve => {
        enterFullscreen = () => {
          doc.fullscreenElement = arcade;
          doc.emit('fullscreenchange');
          resolve();
        };
      });
      doc.exitFullscreen = () => {
        exits++;
        doc.fullscreenElement = null;
        doc.emit('fullscreenchange');
        return Promise.resolve();
      };
    });
    f.elements.start.emit('click');
    if (cancel === 'exit') f.elements['exit-flight'].emit('click');
    await tick();
    assert.equal(f.arcade.classList.contains('flight-mode'), false);
    enterFullscreen();
    await tick();
    assert.equal(exits, 1);
    assert.equal(f.doc.fullscreenElement, null);
    assert.equal(f.arcade.classList.contains('flight-mode'), false);
    assert.equal(f.game.status, 'ready');
  }
});

test('exit while awaiting permission invalidates late grants and permits a fresh start', async () => {
  let resolve;
  const f = mainFixture(({ win }) => {
    win.DeviceOrientationEvent.requestPermission = () => new Promise(done => { resolve = done; });
  });
  f.elements.start.emit('click');
  f.elements['exit-flight'].emit('click');
  resolve('granted');
  await tick();
  orient(f, 35, 12);
  assert.equal(f.game.status, 'ready');
  assert.equal(f.arcade.classList.contains('flight-mode'), false);
  assert.equal(f.elements.start.disabled, false);
  f.elements.start.emit('click');
  resolve('granted');
  await tick();
  orient(f, 35, 12);
  assert.equal(f.game.status, 'playing');
});

test('rotation pauses flight, recalibrates, and never auto-resumes', async () => {
  const f = mainFixture();
  await startFlight(f);
  f.win.screen.orientation.angle = 90;
  f.win.screen.orientation.emit('change');
  assert.equal(f.game.status, 'paused');
  orient(f, 35, 12);
  assert.equal(f.game.status, 'paused');
  f.elements.pause.emit('click');
  assert.equal(f.game.status, 'playing');
  f.win.screen.orientation.emit('change');
  f.win.expireTimers();
  assert.equal(f.game.status, 'paused');
  assert.match(f.elements['control-status'].textContent, /No tilt readings/);
});

test('control mode is tilt for touch-first devices and keyboard otherwise', () => {
  const { win } = browser();
  assert.equal(detectControlMode(win), 'tilt');
  win.coarsePointer = false;
  assert.equal(detectControlMode(win), 'keyboard');
  assert.equal(detectControlMode({}), 'keyboard');
});

test('keyboard mode steers with arrows and A/D, never asks for motion, and releases on blur', () => {
  let permission = 0;
  const f = controlsFixture(({ win }) => {
    win.DeviceOrientationEvent.requestPermission = () => { permission++; return 'granted'; };
  }, 'keyboard');
  assert.match(f.statuses.at(-1), /Keyboard steering/);
  f.controls.activate();
  assert.equal(f.ready, 1);
  assert.equal(permission, 0);
  assert.equal(f.elements.recalibrate.disabled, true);
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 180);
  for (const [key, expected] of [['ArrowLeft', 0], ['a', 0], ['ArrowRight', 360], ['D', 360]]) {
    const event = f.win.emit('keydown', { key, target: f.elements.pause });
    assert.ok(event.defaultPrevented);
    f.controls.update(0.05);
    assert.equal(f.targets.at(-1), expected);
    f.win.emit('keyup', { key });
  }
  f.win.emit('keydown', { key: 'ArrowLeft', target: f.canvas });
  f.win.emit('keydown', { key: 'ArrowRight', target: f.canvas });
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 180);
  f.win.emit('keyup', { key: 'ArrowRight' });
  f.win.emit('blur');
  f.setX(120);
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 120);
  assert.deepEqual(f.pauses, [undefined]);
  orient(f, 35, 40);
  f.win.screen.orientation.emit('change');
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 120);
  f.win.emit('keydown', { key: 'ArrowLeft', target: new Target('INPUT') });
  f.controls.update(0.05);
  assert.equal(f.targets.at(-1), 120);
  f.controls.destroy();
});

test('laptops start keyboard flights immediately in the normal layout and see the controls up front', () => {
  const requests = [];
  const f = mainFixture(({ win, arcade }) => {
    win.coarsePointer = false;
    win.DeviceOrientationEvent.requestPermission = () => { requests.push('permission'); return 'granted'; };
    arcade.requestFullscreen = () => { requests.push('fullscreen'); return Promise.resolve(); };
  });
  assert.ok(f.doc.body.classList.contains('keyboard-controls'));
  assert.match(f.elements['control-hint'].textContent, /Keyboard controls/);
  assert.match(f.elements.instructions.textContent, /A \/ D/);
  assert.match(f.elements['control-status'].textContent, /Keyboard steering/);
  f.elements.start.emit('click');
  assert.equal(f.game.status, 'playing');
  assert.deepEqual(requests, []);
  assert.equal(f.arcade.classList.contains('flight-mode'), false);
  assert.equal(f.doc.body.classList.contains('in-flight'), false);
  assert.equal(f.doc.activeElement, f.canvas);
  f.win.emit('keydown', { key: 'ArrowRight', target: f.canvas });
  f.win.frame(0);
  f.win.frame(16);
  f.win.frame(32);
  assert.ok(f.game.x > 180);
  f.win.emit('keyup', { key: 'ArrowRight' });
  f.win.emit('keydown', { key: 'p', target: f.canvas });
  assert.equal(f.game.status, 'paused');
  f.win.emit('keydown', { key: 'p', target: f.canvas });
  assert.equal(f.game.status, 'playing');
  f.game.status = 'gameover';
  f.canvas.focus();
  f.win.emit('keydown', { key: 'Enter', target: f.canvas });
  assert.equal(f.game.status, 'playing');
});

test('touch devices are told about tilt and full view before starting', () => {
  const f = mainFixture();
  assert.ok(f.doc.body.classList.contains('tilt-controls'));
  assert.match(f.elements['control-hint'].textContent, /tilt your device/);
  assert.match(f.elements['control-hint'].textContent, /fills the screen/);
  assert.match(f.elements.instructions.textContent, /allow motion access/);
});
