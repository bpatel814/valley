// bus.js - tiny event emitter shared by every module. on() returns an unsubscribe.
const listeners = new Map();

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => off(evt, fn);
}

export function off(evt, fn) {
  listeners.get(evt)?.delete(fn);
}

export function once(evt, fn) {
  const un = on(evt, (d) => { un(); fn(d); });
  return un;
}

export function emit(evt, data) {
  const set = listeners.get(evt);
  if (!set) return;
  for (const fn of [...set]) {
    try { fn(data); } catch (e) { console.error("[bus:" + evt + "]", e); }
  }
}

export const bus = { on, off, once, emit };
export default bus;
