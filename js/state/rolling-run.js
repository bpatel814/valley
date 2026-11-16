import db from './db.js';
import { normalizeRollingRun, editRollingScene, normalizeRollingScene, cloneRollingRun,
  rollingSavedPage, rollingError, rollingDayReadiness, isRollingStarter, starterRollingInstance, newRollingScene, ROLLING_MAX_UNDO, ROLLING_MAX_SAVES } from '../data/rolling-run.js';

export const ROLLING_RUN_KEY = 'rolling-run:v1';
let state = normalizeRollingRun(), loaded = false, tail = Promise.resolve(), issue = null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const makeId = () => `run_${Date.now().toString(36)}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2)}`;
function persist() { const snapshot = cloneRollingRun(state); tail = tail.then(() => db.put('kv', ROLLING_RUN_KEY, snapshot), () => db.put('kv', ROLLING_RUN_KEY, snapshot)); const pending = tail; void pending.then(() => { issue = db.status().persistent ? null : 'rolling-temporary'; }, () => { issue = 'rolling-write'; }); return pending; }
function accept(candidate) {
  try { state = normalizeRollingRun(candidate); issue = null; }
  catch (error) { issue = error.code || 'rolling-write'; return false; }
  void persist().catch(() => { issue = 'rolling-write'; }); return true;
}
export async function loadRollingRun({ force = false, io = db } = {}) {
  if (!loaded || force) {
    loaded = false; await tail;
    const raw = await (io.getStrict || io.get)('kv', ROLLING_RUN_KEY);
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw Object.assign(new Error('This rolling run could not be opened safely.'), {code:'rolling-invalid'});
    const incoming = normalizeRollingRun(raw || {});
    const countMatches = (original, normalized) => original == null || (Array.isArray(original) && original.length === normalized.length);
    const sceneMatches = (original, normalized) => !original || (typeof original === 'object' && !Array.isArray(original) && (!original.instance || !!normalized?.instance && original.instance.id === normalized.instance.id));
    if (!countMatches(raw?.saved,incoming.saved) || !countMatches(raw?.undo,incoming.undo) || !sceneMatches(raw?.current,incoming.current) ||
        !sceneMatches(raw?.parked,incoming.parked) || (raw?.undo || []).some((row,index) => !sceneMatches(row,incoming.undo[index]))) {
      throw Object.assign(new Error('Some saved runs need a newer or repaired hill. They were kept.'), {code:'rolling-invalid'});
    }
    state = incoming; loaded = true;
  }
  return rollingRunView();
}
export function getRollingRun() { return cloneRollingRun(state); }
/** This small view avoids cloning the whole saved library for every tap. */
export function rollingRunView() { return { current: cloneRollingRun(state.current), parkedInstance: cloneRollingRun(state.parked?.instance || null), undoCount: state.undo.length, savedCount: state.saved.length }; }
// There are two recoverable kinds of run: authored starter and personal picture.
// Switching kinds parks the exact outgoing scene; it never alters Workshop art.
function withCurrent(next, undo) {
  const switching = next.instance && state.current.instance && isRollingStarter(next.instance) !== isRollingStarter(state.current.instance);
  return { ...state, current: next, parked: switching ? state.current : state.parked, undo };
}
export function chooseRollingStarter(child = 'shared') {
  if (isRollingStarter(state.current.instance)) return false;
  const next = isRollingStarter(state.parked?.instance) ? state.parked : { ...(state.current.instance ? newRollingScene() : state.current), instance: starterRollingInstance(child), outcome: null };
  return accept({ ...withCurrent(next, [...state.undo, state.current].slice(-ROLLING_MAX_UNDO)),
    parked: state.current.instance ? state.current : state.parked && !isRollingStarter(state.parked.instance) ? state.parked : null });
}
export function returnToRollingPicture() {
  if (!isRollingStarter(state.current.instance) || !state.parked?.instance || isRollingStarter(state.parked.instance)) return false;
  return accept(withCurrent(state.parked, [...state.undo, state.current].slice(-ROLLING_MAX_UNDO)));
}
export function changeRollingRun(action) {
  const next = editRollingScene(state.current, action);
  if (same(next, state.current)) return false;
  return accept(withCurrent(next, [...state.undo, state.current].slice(-ROLLING_MAX_UNDO)));
}
/** Prerequisites stay explicit: this does not choose or invent the child's toy. */
export function startRollingDay(episode) {
  const readiness = rollingDayReadiness(state.current, episode);
  if (!readiness.ready) { issue = readiness.reason; return false; }
  return changeRollingRun({ type: 'rolling-day-start', episode });
}
export function undoRollingRun() {
  if (!state.undo.length) return false;
  return accept(withCurrent(state.undo.at(-1), state.undo.slice(0, -1)));
}
export function rollingRunPage(page = 0, child = null) { return rollingSavedPage(state.saved, page, child); }
export function reopenRollingRun(id) {
  const row = state.saved.find(item => item.id === id); if (!row) return false;
  if (same(row.scene, state.current)) return false;
  return accept(withCurrent(row.scene, [...state.undo, state.current].slice(-ROLLING_MAX_UNDO)));
}
export async function keepRollingRun(child = 'shared') {
  const current = normalizeRollingScene(state.current), owner = ['rayna', 'veer'].includes(child) ? child : 'shared';
  if (!current.instance) throw rollingError('rolling-toy-needed');
  const existing = state.saved.find(row => row.owner === owner && same(row.scene, current));
  if (existing) { await persist(); issue = db.status().persistent ? null : 'rolling-temporary'; return { id: existing.id, persistent: db.status().persistent }; }
  if (state.saved.length >= ROLLING_MAX_SAVES) { issue = 'rolling-full'; throw rollingError(issue); }
  const row = { id: makeId(), at: Date.now(), owner, scene: current }, before = state;
  let candidate;
  try { candidate = normalizeRollingRun({ ...state, saved: [...state.saved, row] }); }
  catch (error) { issue = error.code || 'rolling-write'; throw error; }
  state = candidate;
  try { await persist(); issue = db.status().persistent ? null : 'rolling-temporary'; return { id: row.id, persistent: db.status().persistent }; }
  catch (error) {
    if (state === candidate) state = before;
    else { state = normalizeRollingRun({ ...state, saved: state.saved.filter(item => item.id !== row.id) }); void persist().catch(() => { issue = 'rolling-write'; }); }
    issue = 'rolling-write'; throw error;
  }
}
export function flushRollingRun() { return tail; }
export function retryRollingRunWrites() { return persist(); }
export function rollingRunStatus() { return { issue, ...db.status() }; }
export default { loadRollingRun, getRollingRun, rollingRunView, chooseRollingStarter, returnToRollingPicture, startRollingDay, changeRollingRun, undoRollingRun, rollingRunPage, reopenRollingRun, keepRollingRun, flushRollingRun, retryRollingRunWrites, rollingRunStatus };
