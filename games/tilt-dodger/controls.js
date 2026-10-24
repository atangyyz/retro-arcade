export function orientationAxis(event, angle = 0) {
  if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return null;
  const radians = (Number.isFinite(angle) ? angle : 0) * Math.PI / 180;
  return event.gamma * Math.cos(radians) + event.beta * Math.sin(radians);
}

// Phones and tablets report a coarse primary pointer; laptops and desktops report a fine one.
export function detectControlMode(win) {
  return win.matchMedia?.('(pointer: coarse)').matches ? 'tilt' : 'keyboard';
}

const STEER_KEYS = { arrowleft: -1, a: -1, arrowright: 1, d: 1 };

export function readBest(win) {
  try {
    const best = Number(win.localStorage.getItem('tilt-dodger-best'));
    return Number.isSafeInteger(Math.floor(best)) && best >= 0 ? Math.floor(best) : 0;
  } catch {
    return 0;
  }
}

export function writeBest(win, best) {
  try {
    win.localStorage.setItem('tilt-dodger-best', String(best));
  } catch {
    // Storage may be blocked or full; the in-memory best still works.
  }
}

export function installControls({
  win, doc, canvas, recalibrateButton, width, mode = 'tilt',
  getX, isPlaying, onTarget, onPause, onStart, onStatus, onReady, onUnavailable,
}) {
  const removers = [];
  let generation = 0;
  let pending = false;
  let enabled = false;
  let timeout = null;
  let axis = null;
  let baseline = null;
  let originX = width / 2;
  let smoothed = 0;
  const keyboard = mode === 'keyboard';
  const available = win.isSecureContext === true && !!win.DeviceOrientationEvent;
  const held = new Set();
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  }
  function buttons() {
    recalibrateButton.disabled = !enabled || baseline === null;
  }
  function calibrate() {
    baseline = axis;
    originX = getX();
    smoothed = 0;
  }
  function stopTilt(message) {
    generation++;
    pending = enabled = false;
    axis = baseline = null;
    smoothed = 0;
    if (timeout !== null) win.clearTimeout(timeout);
    timeout = null;
    win.removeEventListener('deviceorientation', orientation);
    buttons();
    if (message) {
      onStatus(message);
      onUnavailable();
    }
  }
  function orientation(event) {
    if (!enabled || doc.hidden) return;
    const angle = win.screen?.orientation?.angle ?? win.orientation ?? 0;
    const next = orientationAxis(event, angle);
    if (next === null) return;
    axis = next;
    if (timeout !== null) {
      win.clearTimeout(timeout);
      timeout = null;
    }
    if (baseline === null) {
      calibrate();
      buttons();
      onStatus('Tilt ready · tilt left or right to steer.');
      onReady();
    }
  }
  function activate() {
    if (keyboard) {
      onStatus('Keyboard steering · ← → or A / D.');
      onReady();
      return;
    }
    if (enabled && baseline !== null) {
      onReady();
      return;
    }
    if (enabled || pending) return;
    if (!available) {
      stopTilt('Tilt requires HTTPS and a device with an orientation sensor.');
      return;
    }
    if (doc.hidden) {
      stopTilt('Tilt off while away. Tap Start or Resume to enable it again.');
      return;
    }
    const token = ++generation;
    pending = true;
    buttons();
    onStatus('Allow motion access, then hold your device comfortably.');
    let permission;
    try {
      // Keep this call synchronous with the click for iOS user activation.
      permission = typeof win.DeviceOrientationEvent.requestPermission === 'function'
        ? win.DeviceOrientationEvent.requestPermission() : 'granted';
    } catch {
      stopTilt('Tilt could not start. Tap Start or Resume to try again.');
      return;
    }
    Promise.resolve(permission).then(result => {
      if (token !== generation) return;
      if (doc.hidden) {
        stopTilt('Tilt off while away. Tap Start or Resume to enable it again.');
        return;
      }
      if (result !== 'granted') {
        stopTilt('Motion permission denied. Allow motion access in your browser, then try again.');
        return;
      }
      pending = false;
      enabled = true;
      buttons();
      onStatus('Hold comfortably · waiting for tilt.');
      win.addEventListener('deviceorientation', orientation);
      timeout = win.setTimeout(() => {
        stopTilt('No tilt readings. Use a device with motion sensors and try again.');
      }, 3500);
    }, () => {
      if (token === generation) stopTilt('Motion permission denied. Allow motion access in your browser, then try again.');
    });
  }
  function suspend() {
    held.clear();
    onPause();
    if (enabled || pending) stopTilt('Tilt off while away. Tap Start or Resume to enable it again.');
  }
  listen(win, 'keydown', event => {
    const target = event.target;
    const key = event.key.toLowerCase();
    if (keyboard && key in STEER_KEYS && !(target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
      held.add(key);
      event.preventDefault();
      return;
    }
    if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName)) return;
    if (key === 'p') {
      if (!event.repeat) onPause(true);
      event.preventDefault();
    } else if (doc.activeElement === canvas) {
      if (key === 'enter' && !event.repeat) {
        event.preventDefault();
        onStart();
      }
    }
  });
  listen(win, 'keyup', event => { held.delete(event.key.toLowerCase()); });
  listen(win, 'blur', suspend);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) suspend(); });
  const rotate = () => {
    axis = baseline = null;
    smoothed = 0;
    buttons();
    if (enabled) {
      onPause();
      onStatus('Screen rotated · hold to recalibrate.');
      if (timeout !== null) win.clearTimeout(timeout);
      timeout = win.setTimeout(() => stopTilt('No tilt readings. Use a device with motion sensors and try again.'), 3500);
    }
  };
  if (!keyboard) {
    listen(win, 'orientationchange', rotate);
    if (win.screen?.orientation?.addEventListener) listen(win.screen.orientation, 'change', rotate);
  }
  listen(recalibrateButton, 'click', () => {
    if (!enabled) return;
    calibrate();
    onStatus(axis === null ? 'Hold comfortably · waiting for tilt.' : 'Tilt centered at your hold angle.');
  });
  buttons();
  if (keyboard) onStatus('Keyboard steering · ← → or A / D.');
  else if (!available) onStatus('Tilt requires HTTPS and a device with an orientation sensor.');
  return {
    mode: keyboard ? 'keyboard' : 'tilt',
    activate,
    cancel() { stopTilt(); },
    update(dt) {
      if (!isPlaying() || !Number.isFinite(dt) || dt <= 0) return;
      if (keyboard) {
        let direction = 0;
        for (const key of held) direction += STEER_KEYS[key];
        onTarget(direction < 0 ? 0 : direction > 0 ? width : getX());
        return;
      }
      if (enabled && axis !== null && baseline !== null) {
        const delta = ((axis - baseline + 540) % 360) - 180;
        const desired = Math.abs(delta) <= 2 ? 0 : Math.sign(delta) * (Math.abs(delta) - 2);
        smoothed += (desired - smoothed) * (1 - Math.exp(-8 * Math.min(dt, 0.05)));
        onTarget(Math.max(0, Math.min(width, originX + smoothed * width / 50)));
      }
    },
    reset() {
      calibrate();
    },
    destroy() {
      stopTilt();
      removers.forEach(remove => remove());
    },
  };
}
