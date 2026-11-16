// session.js - how long Rayna has been playing, and when Mama should come for a break.
//
// Two soft moments: the calm music layer two minutes before the end, and the end itself.
// The end only fires between turns: screens call setBusy(true) while a turn is running,
// and a due end waits for setBusy(false). sessionMinutes 0 disables both, forever.

import * as settings from "./settings.js";
import { emit } from "../world/bus.js";
import { savedWorldStorageKey, temporaryDemo } from './saved-world.js';
import { hasWriteAccess } from './db.js';

const CALM_LEAD_MS = 120000; // the calm layer starts two minutes before the end
export const TIMER_STORAGE_KEY = savedWorldStorageKey("raynas-valley:session-timer:v1");

let nowFn = () => Date.now();
let startedAt = 0;
let ticker = null;
let calmFired = false;
let endFired = false;
let endPending = false;
let busy = false;
let breakLocked = false;

/** Live binding: true between turns. `import * as session` and the default object agree. */
export let idle = true;

/** Tests inject a fake clock. Pass nothing to go back to the wall clock. */
export function setNow(fn) { nowFn = typeof fn === "function" ? fn : () => Date.now(); }

export function now() { return nowFn(); }

function minutes() {
  const s = settings.get ? settings.get() : null;
  const m = s?.timerEnabled !== true ? 0 : s && typeof s.sessionMinutes === "number" ? s.sessionMinutes : 0;
  return Math.max(0, m);
}

function storage() {
  if (temporaryDemo) return null;
  try { return globalThis.localStorage; } catch (_) { return null; }
}

function persist() {
  if (!hasWriteAccess()) return;
  try { storage()?.setItem(TIMER_STORAGE_KEY, JSON.stringify({ startedAt, breakLocked })); } catch (_) {}
}

function beginTicker(opts) {
  stopTicker();
  if ((!opts || opts.ticker !== false) && typeof setInterval === "function") {
    ticker = setInterval(tick, 1000);
    if (ticker && typeof ticker.unref === "function") ticker.unref();
  }
}

/** Recover a saved clock, including an elapsed or already-entered break. */
export function restore(opts) {
  stopTicker();
  startedAt = 0;
  calmFired = false;
  endFired = false;
  endPending = false;
  breakLocked = false;
  busy = false;
  idle = true;
  let saved;
  try { saved = JSON.parse(storage()?.getItem(TIMER_STORAGE_KEY) ?? "null"); } catch (_) { return false; }
  const current = nowFn();
  if (!saved || !Number.isSafeInteger(saved.startedAt) || saved.startedAt <= 0 ||
      saved.startedAt > current || typeof saved.breakLocked !== "boolean") return false;
  startedAt = saved.startedAt;
  breakLocked = saved.breakLocked || (minutes() > 0 && endDue());
  if (breakLocked) {
    endFired = true;
    if (!saved.breakLocked) persist();
  } else beginTicker(opts);
  return true;
}

/** Begin (or restart) the session clock. `{ticker:false}` for tests. */
export function start(opts) {
  startedAt = nowFn();
  calmFired = false;
  endFired = false;
  endPending = false;
  busy = false;
  idle = true;
  breakLocked = false;
  beginTicker(opts);
  persist();
  emit("session:reset", { startedAt });
  return startedAt;
}

export function stopTicker() {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

/** Fresh clock for a new session (parent corner, or after Mama's break). */
export function reset(opts) { return start(opts); }

/** Explicit name for the clean-session boundary used after the family recap screen. */
export function startNewSession(opts) { return start(opts); }

/** Hold the timed Mama break until an adult explicitly starts a new session. */
export function lockForBreak() {
  if (!startedAt) startedAt = nowFn();
  breakLocked = true;
  endPending = false;
  endFired = true;
  stopTicker();
  persist();
}

export function isBreakLocked() { return breakLocked; }

export function startedAtMs() { return startedAt; }

export function elapsedMs() { return startedAt ? Math.max(0, nowFn() - startedAt) : 0; }

export function sessionMinutes() { return minutes(); }

export function remainingMs() {
  const m = minutes();
  if (!m) return Infinity;
  return Math.max(0, m * 60000 - elapsedMs());
}

export function calmDue() {
  const m = minutes();
  if (!m || !startedAt) return false;
  return elapsedMs() >= m * 60000 - CALM_LEAD_MS;
}

export function endDue() {
  const m = minutes();
  if (!m || !startedAt) return false;
  return elapsedMs() >= m * 60000;
}

/** Screens set this true while a turn is running, false the moment it finishes. */
export function setBusy(v) {
  busy = !!v;
  idle = !busy;
  if (!busy && endPending && !endFired && !breakLocked && endDue()) {
    endPending = false;
    endFired = true;
    emit("session:end", { elapsedMs: elapsedMs() });
  } else if (!busy && !endDue()) {
    endPending = false;
  }
  return busy;
}

export function isIdle() { return !busy; }

export function isEndPending() { return endPending && !endFired && !breakLocked && endDue(); }

/** One second of wall time. Exported so tests can step a fake clock by hand. */
export function tick() {
  if (!startedAt || breakLocked) return;
  if (!calmFired && calmDue()) {
    calmFired = true;
    emit("session:calm", { elapsedMs: elapsedMs() });
  }
  if (!endFired && endDue()) {
    if (busy) endPending = true;
    else { endFired = true; emit("session:end", { elapsedMs: elapsedMs() }); }
  }
}

/** Local calendar day, YYYY-MM-DD (never UTC: bedtime is local). */
export function today(at) {
  const d = new Date(typeof at === "number" ? at : nowFn());
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export const session = {
  start, reset, startNewSession, restore, lockForBreak, isBreakLocked,
  stopTicker, elapsedMs, calmDue, endDue, today, TIMER_STORAGE_KEY,
  setBusy, isIdle, isEndPending, tick,
  setNow, now, remainingMs, sessionMinutes, startedAtMs,
};
Object.defineProperty(session, "idle", { get: () => !busy, enumerable: true });
export default session;
