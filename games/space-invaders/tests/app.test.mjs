import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as engine from '../game.mjs';
import * as controls from '../controls.mjs';

class Element {
  constructor(tag = 'DIV', doc = null) {
    this.tagName = tag;
    this.doc = doc;
    this.listeners = new Map();
    this.dataset = {};
    this.disabled = false;
    this.hidden = false;
    this.textContent = '';
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
    };
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, values = {}) {
    const event = { target: this, button: 0, preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
    return event;
  }
  focus() { if (this.doc) this.doc.activeElement = this; }
  closest(selector) { return selector === 'button' && this.tagName === 'BUTTON' ? this : null; }
  setPointerCapture() {}
}

const tick = () => new Promise(resolve => setImmediate(resolve));

function load({ coarse = true, configure = () => {} } = {}) {
  const win = new Element('WINDOW');
  const doc = new Element('DOCUMENT');
  const ids = ['score', 'wave', 'lives', 'toggle', 'restart', 'mode', 'overlay', 'overlay-label',
    'overlay-title', 'overlay-detail', 'overlay-hint', 'announcement', 'exit-flight'];
  const el = Object.fromEntries(ids.map(id => [id, new Element(['toggle', 'restart', 'exit-flight'].includes(id) ? 'BUTTON' : 'DIV', doc)]));
  el.canvas = new Element('CANVAS', doc);
  el.canvas.getContext = () => new Proxy({}, { get: () => () => {} });
  el.arcade = new Element('SECTION', doc);
  el.buttons = ['left', 'right', 'fire'].map(name => {
    const button = new Element('BUTTON', doc);
    button.dataset.control = name;
    return button;
  });
  doc.body = new Element('BODY');
  doc.hidden = false;
  doc.getElementById = id => el[id];
  doc.querySelector = selector => ({ '#game': el.canvas, '.arcade': el.arcade })[selector];
  doc.querySelectorAll = () => el.buttons;
  win.isSecureContext = true;
  win.DeviceOrientationEvent = {};
  win.screen = { orientation: new Element() };
  win.screen.orientation.angle = 0;
  win.setTimeout = () => 1;
  win.clearTimeout = () => {};
  const calls = [];
  const frames = [];
  configure({ win, doc, el, calls });
  const source = readFileSync(new URL('../app.mjs', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '');
  const context = vm.createContext({
    ...engine, ...controls, window: win, document: doc, console,
    matchMedia: q => ({ matches: q === '(pointer: coarse)' && coarse }),
    requestAnimationFrame: fn => frames.push(fn),
  });
  win.matchMedia = context.matchMedia;
  vm.runInContext(`${source}\nglobalThis.testGame = game;`, context);
  const frame = time => frames.shift()(time);
  const orient = (beta, gamma) => win.emit('deviceorientation', { beta, gamma });
  return { win, doc, el, calls, game: context.testGame, frame, orient };
}

test('computers play by keyboard in the normal layout with no motion prompt', () => {
  const f = load({ coarse: false, configure: ({ win, el, calls }) => {
    win.DeviceOrientationEvent.requestPermission = () => { calls.push('permission'); return 'granted'; };
    el.arcade.requestFullscreen = () => { calls.push('fullscreen'); return Promise.resolve(); };
  } });
  assert.ok(f.doc.body.classList.contains('keyboard-controls'));
  assert.match(f.el['overlay-hint'].textContent, /Keyboard: ← → or A \/ D/);
  f.el.toggle.emit('click');
  assert.equal(f.game.status, 'playing');
  assert.deepEqual(f.calls, []);
  assert.equal(f.el.arcade.classList.contains('flight-mode'), false);
  const x = f.game.player.x;
  f.win.emit('keydown', { key: 'ArrowRight', target: f.el.canvas });
  f.frame(0);
  f.frame(100);
  assert.ok(f.game.player.x > x);
});

test('phones see tilt instructions, ask permission before fullscreen, and steer only by tilt', async () => {
  const f = load({ configure: ({ win, el, calls }) => {
    win.DeviceOrientationEvent.requestPermission = () => { calls.push('permission'); return 'granted'; };
    el.arcade.requestFullscreen = () => { calls.push('fullscreen'); return Promise.resolve(); };
  } });
  assert.ok(f.doc.body.classList.contains('tilt-controls'));
  assert.match(f.el['overlay-hint'].textContent, /Tilt to move · hold Fire/);
  f.el.toggle.emit('click');
  assert.deepEqual(f.calls, ['permission', 'fullscreen']);
  assert.ok(f.el.arcade.classList.contains('flight-mode'));
  assert.equal(f.game.status, 'ready');
  assert.equal(f.el.toggle.disabled, true);
  assert.match(f.el['overlay-title'].textContent, /HOLD STEADY/);
  await tick();
  f.orient(40, 10);
  assert.equal(f.game.status, 'playing');
  assert.equal(f.doc.activeElement, f.el.canvas);
  const x = f.game.player.x;
  f.win.emit('keydown', { key: 'ArrowLeft', target: f.el.canvas });
  f.el.buttons[0].emit('pointerdown', { pointerId: 1 });
  f.frame(0);
  f.frame(100);
  assert.equal(f.game.player.x, x);
  f.orient(40, 30);
  for (let t = 200; t < 1500; t += 50) f.frame(t);
  assert.ok(f.game.player.x > x + 100);
  f.el.buttons[2].emit('pointerdown', { pointerId: 2 });
  f.frame(1550);
  assert.ok(f.game.playerShots.length > 0);
});

test('pause, resume recalibration, rotation, and exit full view', async () => {
  const f = load();
  f.el.toggle.emit('click');
  await tick();
  f.orient(40, 10);
  f.el.toggle.emit('click');
  assert.equal(f.game.status, 'paused');
  f.el.toggle.emit('click');
  assert.equal(f.game.status, 'paused');
  f.orient(40, 25);
  assert.equal(f.game.status, 'playing');
  const x = f.game.player.x;
  f.frame(0);
  f.frame(100);
  assert.equal(f.game.player.x, x);
  f.win.screen.orientation.emit('change');
  assert.equal(f.game.status, 'paused');
  f.el['exit-flight'].emit('click');
  assert.equal(f.el.arcade.classList.contains('flight-mode'), false);
  assert.equal(f.doc.activeElement, f.el.toggle);
});

test('denied or missing sensors fall back to on-screen arrow buttons', async () => {
  for (const configure of [
    ({ win }) => { win.DeviceOrientationEvent.requestPermission = () => 'denied'; },
    ({ win }) => { win.isSecureContext = false; },
  ]) {
    const f = load({ configure });
    f.el.toggle.emit('click');
    await tick();
    if (f.game.status !== 'playing') {
      assert.ok(f.doc.body.classList.contains('tilt-fallback'));
      assert.match(f.el['overlay-hint'].textContent, /Hold ◀ ▶/);
      assert.equal(f.el.toggle.disabled, false);
      f.el.toggle.emit('click');
    }
    assert.ok(f.doc.body.classList.contains('tilt-fallback'));
    assert.equal(f.game.status, 'playing');
    const x = f.game.player.x;
    f.el.buttons[0].emit('pointerdown', { pointerId: 1 });
    f.frame(0);
    f.frame(100);
    assert.ok(f.game.player.x < x);
  }
});

test('leaving the page while calibrating cancels the pending start', async () => {
  const f = load();
  f.el.toggle.emit('click');
  f.win.emit('blur');
  await tick();
  f.orient(40, 10);
  assert.equal(f.game.status, 'ready');
  assert.equal(f.el.toggle.disabled, false);
});
