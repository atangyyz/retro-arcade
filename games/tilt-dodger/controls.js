export function pointerTarget(clientX, rect, width) {
  if (!Number.isFinite(clientX) || !Number.isFinite(rect.left)
    || !Number.isFinite(rect.width) || rect.width <= 0) return null;
  return Math.max(0, Math.min(width, (clientX - rect.left) * width / rect.width));
}

export function orientationAxis(event, angle = 0) {
  if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return null;
  const radians = (Number.isFinite(angle) ? angle : 0) * Math.PI / 180;
  return event.gamma * Math.cos(radians) + event.beta * Math.sin(radians);
}

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
  win, doc, canvas, tiltButton, recalibrateButton, width, moveSpeed,
  getX, isPlaying, onTarget, onPause, onStart, onStatus,
}) {
  let pointer = null;
  const keys = new Set();
  const removers = [];
  let generation = 0;
  let pending = false;
  let enabled = false;
  let timeout = null;
  let axis = null;
  let baseline = null;
  let originX = width / 2;
  let smoothed = 0;
  const available = win.isSecureContext === true && !!win.DeviceOrientationEvent;
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  }
  function buttons() {
    tiltButton.textContent = pending ? 'Cancel tilt' : enabled ? 'Disable tilt' : 'Enable tilt';
    tiltButton.setAttribute('aria-pressed', String(enabled));
    recalibrateButton.disabled = !enabled;
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
    if (message) onStatus(message);
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
      onStatus('Tilt ready · drag always works.');
    }
  }
  function requestTilt() {
    if (enabled || pending) {
      stopTilt('Touch steering · tilt off.');
      return;
    }
    if (!available) {
      onStatus('Tilt unavailable here · drag to steer.');
      return;
    }
    if (doc.hidden) return;
    const token = ++generation;
    pending = true;
    buttons();
    onStatus('Requesting tilt · touch still works.');
    let permission;
    try {
      // Keep this call synchronous with the click for iOS user activation.
      permission = typeof win.DeviceOrientationEvent.requestPermission === 'function'
        ? win.DeviceOrientationEvent.requestPermission() : 'granted';
    } catch {
      stopTilt('Tilt could not start · drag to steer.');
      return;
    }
    Promise.resolve(permission).then(result => {
      if (token !== generation) return;
      if (doc.hidden) {
        stopTilt('Tilt off while away · drag or enable again.');
        return;
      }
      if (result !== 'granted') {
        stopTilt('Tilt permission denied · drag to steer.');
        return;
      }
      pending = false;
      enabled = true;
      buttons();
      onStatus('Hold comfortably · waiting for tilt.');
      win.addEventListener('deviceorientation', orientation);
      timeout = win.setTimeout(() => {
        stopTilt('No tilt readings · drag to steer.');
      }, 3500);
    }, () => {
      if (token === generation) stopTilt('Tilt permission denied · drag to steer.');
    });
  }
  function endPointer(event) {
    if (event.pointerId !== pointer) return;
    const old = pointer;
    pointer = null;
    calibrate();
    if (canvas.hasPointerCapture?.(old)) canvas.releasePointerCapture(old);
  }
  function clearInput() {
    keys.clear();
    if (pointer !== null) endPointer({ pointerId: pointer });
  }
  function suspend() {
    clearInput();
    onPause();
    if (enabled || pending) stopTilt('Tilt off while away · drag or enable again.');
  }
  listen(canvas, 'pointerdown', event => {
    if (pointer !== null || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    pointer = event.pointerId;
    keys.clear();
    try { canvas.setPointerCapture(pointer); } catch { /* Window pointerup is a fallback. */ }
    const target = pointerTarget(event.clientX, canvas.getBoundingClientRect(), width);
    if (target !== null) onTarget(target);
  });
  listen(canvas, 'pointermove', event => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    const target = pointerTarget(event.clientX, canvas.getBoundingClientRect(), width);
    if (target !== null) onTarget(target);
  });
  listen(win, 'pointerup', endPointer);
  listen(win, 'pointercancel', endPointer);
  listen(canvas, 'lostpointercapture', endPointer);
  listen(canvas, 'blur', clearInput);
  listen(win, 'keydown', event => {
    const target = event.target;
    if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === 'p') {
      if (!event.repeat) onPause(true);
      event.preventDefault();
    } else if (doc.activeElement === canvas) {
      if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) {
        keys.add(key);
        event.preventDefault();
      } else if (key === 'enter' && !event.repeat) {
        event.preventDefault();
        onStart();
      }
    }
  });
  listen(win, 'keyup', event => keys.delete(event.key.toLowerCase()));
  listen(win, 'blur', suspend);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) suspend(); });
  const rotate = () => {
    axis = baseline = null;
    smoothed = 0;
    if (enabled) {
      onStatus('Screen rotated · hold to recalibrate.');
      if (timeout !== null) win.clearTimeout(timeout);
      timeout = win.setTimeout(() => stopTilt('No tilt readings · drag to steer.'), 3500);
    }
  };
  listen(win, 'orientationchange', rotate);
  if (win.screen?.orientation?.addEventListener) listen(win.screen.orientation, 'change', rotate);
  listen(tiltButton, 'click', requestTilt);
  listen(recalibrateButton, 'click', () => {
    if (!enabled) return;
    calibrate();
    onStatus(axis === null ? 'Hold comfortably · waiting for tilt.' : 'Tilt centered at your hold angle.');
  });
  buttons();
  if (!available) onStatus('Touch steering · tilt unavailable here.');
  return {
    update(dt) {
      if (!isPlaying() || pointer !== null || !Number.isFinite(dt) || dt <= 0) return;
      const direction = Number(keys.has('arrowright') || keys.has('d'))
        - Number(keys.has('arrowleft') || keys.has('a'));
      if (keys.size) {
        onTarget(getX() + direction * moveSpeed * Math.min(dt, 0.05));
      } else if (enabled && axis !== null && baseline !== null) {
        const delta = ((axis - baseline + 540) % 360) - 180;
        const desired = Math.abs(delta) <= 2 ? 0 : Math.sign(delta) * (Math.abs(delta) - 2);
        smoothed += (desired - smoothed) * (1 - Math.exp(-8 * Math.min(dt, 0.05)));
        onTarget(Math.max(0, Math.min(width, originX + smoothed * width / 50)));
      }
    },
    reset() {
      clearInput();
      calibrate();
    },
    destroy() {
      clearInput();
      stopTilt();
      removers.forEach(remove => remove());
    },
  };
}
