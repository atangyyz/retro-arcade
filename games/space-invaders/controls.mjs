// Phones and tablets report a coarse primary pointer; laptops and desktops report a fine one.
export function detectControlMode(win) {
  return win.matchMedia?.('(pointer: coarse)').matches ? 'tilt' : 'keyboard';
}

export function orientationAxis(event, angle = 0) {
  if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return null;
  const radians = (Number.isFinite(angle) ? angle : 0) * Math.PI / 180;
  return event.gamma * Math.cos(radians) + event.beta * Math.sin(radians);
}

export const DEADZONE = 2;
const TIMEOUT = 3500;

export function installTilt({ win, doc, onReady, onUnavailable, onRotate }) {
  const available = win.isSecureContext === true && !!win.DeviceOrientationEvent;
  let generation = 0;
  let pending = false;
  let enabled = false;
  let waiting = false;
  let timeout = null;
  let axis = null;
  let baseline = null;
  let smoothed = 0;

  function clearTimer() {
    if (timeout !== null) win.clearTimeout(timeout);
    timeout = null;
  }
  function fail(message) {
    generation++;
    pending = waiting = enabled = false;
    axis = baseline = null;
    clearTimer();
    win.removeEventListener('deviceorientation', orientation);
    onUnavailable(message);
  }
  function awaitReading() {
    waiting = true;
    baseline = null;
    smoothed = 0;
    clearTimer();
    timeout = win.setTimeout(() => fail('No tilt readings from this device.'), TIMEOUT);
  }
  function orientation(event) {
    if (!enabled || doc.hidden) return;
    const angle = win.screen?.orientation?.angle ?? win.orientation ?? 0;
    const next = orientationAxis(event, angle);
    if (next === null) return;
    axis = next;
    if (baseline === null) {
      baseline = axis;
      smoothed = 0;
    }
    if (waiting) {
      waiting = false;
      clearTimer();
      onReady();
    }
  }
  function rotate() {
    if (!enabled) return;
    baseline = null;
    smoothed = 0;
    onRotate();
  }
  win.addEventListener('orientationchange', rotate);
  win.screen?.orientation?.addEventListener?.('change', rotate);

  return {
    available,
    // Must run synchronously inside the user's tap so iOS grants motion access.
    request() {
      if (enabled) {
        awaitReading();
        return;
      }
      if (pending) return;
      if (!available) {
        fail('Tilt needs HTTPS and a motion sensor.');
        return;
      }
      const token = ++generation;
      pending = true;
      let permission;
      try {
        permission = typeof win.DeviceOrientationEvent.requestPermission === 'function'
          ? win.DeviceOrientationEvent.requestPermission() : 'granted';
      } catch {
        fail('Motion access could not start.');
        return;
      }
      Promise.resolve(permission).then(result => {
        if (token !== generation) return;
        if (result !== 'granted') {
          fail('Motion access was denied.');
          return;
        }
        pending = false;
        enabled = true;
        win.addEventListener('deviceorientation', orientation);
        awaitReading();
      }, () => {
        if (token === generation) fail('Motion access was denied.');
      });
    },
    cancel() {
      if (pending) {
        generation++;
        pending = false;
      }
      waiting = false;
      clearTimer();
    },
    // Smoothed tilt in degrees past the deadzone, or null before calibration.
    offset(dt) {
      if (!enabled || axis === null || baseline === null) return null;
      const delta = ((axis - baseline + 540) % 360) - 180;
      const desired = Math.abs(delta) <= DEADZONE ? 0 : Math.sign(delta) * (Math.abs(delta) - DEADZONE);
      const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0;
      smoothed += (desired - smoothed) * (1 - Math.exp(-8 * step));
      return smoothed;
    },
    destroy() {
      generation++;
      pending = waiting = enabled = false;
      clearTimer();
      win.removeEventListener('deviceorientation', orientation);
      win.removeEventListener('orientationchange', rotate);
      win.screen?.orientation?.removeEventListener?.('change', rotate);
    },
  };
}
