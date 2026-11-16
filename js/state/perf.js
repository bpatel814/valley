// perf.js - a cheap frame-gap recorder for the parent corner's Performance card.
// One rAF loop, two typed-array ring buffers, a rolling 60 second window. Nothing here
// allocates per frame, so the monitor itself never causes the drops it reports.

const WINDOW_MS = 60000;
const CAP = 4096;            // 60 s at 60 fps is 3600 samples
const DROP_MS = 20;          // a gap longer than this missed a 60 fps frame

const times = new Float64Array(CAP);
const gaps = new Float32Array(CAP);
let head = 0;                // next write index
let count = 0;               // total samples ever written
let rafId = 0;
let last = 0;
let running = false;

let longObserver = null;
const longs = [];            // {at, ms}

const clockNow = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

function frame(t) {
  if (!running) return;
  const nowMs = typeof t === "number" ? t : clockNow();
  if (last) {
    times[head] = nowMs;
    gaps[head] = nowMs - last;
    head = (head + 1) % CAP;
    count++;
  }
  last = nowMs;
  rafId = requestAnimationFrame(frame);
}

/** Start recording frame gaps (and long tasks where the browser supports them). */
export function startFrameMonitor() {
  if (running) return true;
  if (typeof requestAnimationFrame !== "function") return false;
  running = true;
  last = 0;
  rafId = requestAnimationFrame(frame);
  startLongTasks();
  return true;
}

export function stopFrameMonitor() {
  running = false;
  if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
  rafId = 0;
  last = 0;
  if (longObserver) { try { longObserver.disconnect(); } catch (_) {} longObserver = null; }
}

export function isRunning() { return running; }

function startLongTasks() {
  if (longObserver || typeof PerformanceObserver === "undefined") return;
  try {
    longObserver = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longs.push({ at: e.startTime, ms: e.duration });
      trimLongs();
    });
    longObserver.observe({ type: "longtask", buffered: true });
  } catch (_) {
    longObserver = null; // Safari and Firefox have no longtask entries; that is fine.
  }
}

function trimLongs() {
  const cut = clockNow() - WINDOW_MS;
  while (longs.length && longs[0].at < cut) longs.shift();
  if (longs.length > 500) longs.splice(0, longs.length - 500);
}

/** {fps, dropped, worstMs, samples} over the last 60 seconds. */
export function stats() {
  const nowMs = clockNow();
  const cut = nowMs - WINDOW_MS;
  const have = Math.min(count, CAP);
  let samples = 0, dropped = 0, worstMs = 0, oldest = nowMs, newest = 0;
  for (let i = 1; i <= have; i++) {
    const idx = (head - i + CAP) % CAP;
    const t = times[idx];
    if (t < cut) break;
    const g = gaps[idx];
    samples++;
    if (g > DROP_MS) dropped++;
    if (g > worstMs) worstMs = g;
    if (t < oldest) oldest = t;
    if (t > newest) newest = t;
  }
  const spanS = samples > 1 ? (newest - oldest) / 1000 : 0;
  const fps = spanS > 0.25 ? (samples - 1) / spanS : 0;
  return {
    fps: Math.round(fps * 10) / 10,
    dropped,
    worstMs: Math.round(worstMs * 10) / 10,
    samples,
  };
}

/** {count, worstMs, totalMs} of long tasks in the last 60 seconds. */
export function longTasks() {
  trimLongs();
  let worstMs = 0, totalMs = 0;
  for (const l of longs) { totalMs += l.ms; if (l.ms > worstMs) worstMs = l.ms; }
  return {
    count: longs.length,
    worstMs: Math.round(worstMs),
    totalMs: Math.round(totalMs),
    supported: !!longObserver,
  };
}

export function resetStats() {
  head = 0; count = 0; last = 0;
  longs.length = 0;
}

export const perf = { startFrameMonitor, stopFrameMonitor, stats, longTasks, resetStats, isRunning };
export default perf;
