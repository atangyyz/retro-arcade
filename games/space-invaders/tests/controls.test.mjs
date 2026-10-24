import test from 'node:test';
import assert from 'node:assert/strict';
import { detectControlMode, orientationAxis, installTilt } from '../controls.mjs';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, values = {}) { for (const fn of [...(this.listeners.get(type) ?? [])]) fn(values); }
}

function fixture(configure = () => {}) {
  const win = new Target();
  const doc = { hidden: false };
  win.isSecureContext = true;
  win.DeviceOrientationEvent = {};
  win.screen = { orientation: new Target() };
  win.screen.orientation.angle = 0;
  const timers = new Map();
  let next = 1;
  win.setTimeout = fn => { const id = next++; timers.set(id, fn); return id; };
  win.clearTimeout = id => timers.delete(id);
  win.expire = () => { const fns = [...timers.values()]; timers.clear(); fns.forEach(fn => fn()); };
  win.timers = () => timers.size;
  configure(win, doc);
  const events = { ready: 0, rotate: 0, unavailable: [] };
  const tilt = installTilt({
    win, doc,
    onReady: () => events.ready++,
    onUnavailable: message => events.unavailable.push(message),
    onRotate: () => events.rotate++,
  });
  const orient = (beta, gamma) => win.emit('deviceorientation', { beta, gamma });
  return { win, doc, tilt, events, orient };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('control mode is tilt for coarse primary pointers and keyboard otherwise', () => {
  assert.equal(detectControlMode({ matchMedia: q => ({ matches: q === '(pointer: coarse)' }) }), 'tilt');
  assert.equal(detectControlMode({ matchMedia: () => ({ matches: false }) }), 'keyboard');
  assert.equal(detectControlMode({}), 'keyboard');
});

test('orientation axis follows screen rotation and rejects invalid readings', () => {
  assert.equal(orientationAxis({ beta: 30, gamma: 10 }, 0), 10);
  assert.ok(Math.abs(orientationAxis({ beta: 30, gamma: 10 }, 90) - 30) < 1e-9);
  assert.ok(Math.abs(orientationAxis({ beta: 30, gamma: 10 }, 270) + 30) < 1e-9);
  assert.equal(orientationAxis({ beta: null, gamma: 10 }), null);
  assert.equal(orientationAxis({ beta: 30, gamma: NaN }), null);
});

test('permission is requested synchronously, then the first valid reading calibrates', async () => {
  let calls = 0;
  const f = fixture(win => {
    win.DeviceOrientationEvent.requestPermission = () => { calls++; return Promise.resolve('granted'); };
  });
  f.tilt.request();
  assert.equal(calls, 1);
  f.tilt.request();
  assert.equal(calls, 1);
  await tick();
  assert.equal(f.tilt.offset(0.05), null);
  f.orient(null, null);
  assert.equal(f.events.ready, 0);
  f.orient(40, 10);
  assert.equal(f.events.ready, 1);
  assert.equal(f.win.timers(), 0);
  assert.equal(f.tilt.offset(0.05), 0);
  f.orient(40, 11.5);
  assert.equal(f.tilt.offset(0.05), 0);
  f.orient(40, 30);
  const first = f.tilt.offset(0.05);
  assert.ok(first > 0 && first < 18);
  assert.ok(f.tilt.offset(0.05) > first);
  f.orient(40, -10);
  let offset;
  for (let i = 0; i < 40; i++) offset = f.tilt.offset(0.05);
  assert.ok(Math.abs(offset + 18) < 0.1);
});

test('a second request recalibrates to the current hold without re-asking permission', async () => {
  let calls = 0;
  const f = fixture(win => { win.DeviceOrientationEvent.requestPermission = () => { calls++; return 'granted'; }; });
  f.tilt.request();
  await tick();
  f.orient(40, 10);
  f.orient(40, 30);
  assert.ok(f.tilt.offset(0.05) > 0);
  f.tilt.request();
  assert.equal(calls, 1);
  assert.equal(f.tilt.offset(0.05), null);
  f.orient(40, 30);
  assert.equal(f.events.ready, 2);
  assert.equal(f.tilt.offset(0.05), 0);
});

test('unsupported, denied, throwing, rejected, or silent sensors report unavailable', async () => {
  for (const [configure, pattern] of [
    [win => { win.isSecureContext = false; }, /HTTPS/],
    [win => { delete win.DeviceOrientationEvent; }, /HTTPS/],
    [win => { win.DeviceOrientationEvent.requestPermission = () => 'denied'; }, /denied/],
    [win => { win.DeviceOrientationEvent.requestPermission = () => Promise.reject(Error('no')); }, /denied/],
    [win => { win.DeviceOrientationEvent.requestPermission = () => { throw Error('no'); }; }, /could not start/],
    [() => {}, /No tilt readings/],
  ]) {
    const f = fixture(configure);
    f.tilt.request();
    await tick();
    f.win.expire();
    f.orient(40, 10);
    assert.equal(f.events.ready, 0);
    assert.equal(f.events.unavailable.length, 1);
    assert.match(f.events.unavailable[0], pattern);
    assert.equal(f.tilt.offset(0.05), null);
  }
});

test('cancel invalidates late grants and pending calibration', async () => {
  let resolve;
  const f = fixture(win => { win.DeviceOrientationEvent.requestPermission = () => new Promise(done => { resolve = done; }); });
  f.tilt.request();
  f.tilt.cancel();
  resolve('granted');
  await tick();
  f.orient(40, 10);
  assert.equal(f.events.ready, 0);
  f.tilt.request();
  resolve('granted');
  await tick();
  f.tilt.cancel();
  f.orient(40, 10);
  assert.equal(f.events.ready, 0);
  assert.equal(f.win.timers(), 0);
  assert.deepEqual(f.events.unavailable, []);
});

test('hidden pages ignore readings and rotation resets calibration', async () => {
  const f = fixture();
  f.tilt.request();
  await tick();
  f.doc.hidden = true;
  f.orient(40, 10);
  assert.equal(f.events.ready, 0);
  f.doc.hidden = false;
  f.orient(40, 10);
  assert.equal(f.events.ready, 1);
  f.win.screen.orientation.emit('change');
  assert.equal(f.events.rotate, 1);
  assert.equal(f.tilt.offset(0.05), null);
  f.orient(80, 10);
  assert.equal(f.tilt.offset(0.05), 0);
  f.tilt.destroy();
  f.win.emit('orientationchange');
  assert.equal(f.events.rotate, 1);
});
