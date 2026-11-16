import * as db from './db.js';
import { normalizeBuild, emptyBuild, applyBuildAction } from '../data/build-lab.js';
import { isLocalPNG } from './creation-frame.js';
export const BUILD_LAB_KEY = 'buildLabV1';
export const BUILD_LAB_MAX_SAVES = 8;
export const BUILD_LAB_MAX_UNDO = 24;
const clone = value => JSON.parse(JSON.stringify(value));
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(id);
const validTime = at => Number.isFinite(at) && at > 0 && at <= 8_640_000_000_000_000;
let serial = 0;
export function buildLabGalleryKey(entry) { return `build-lab_${entry.id}`; }
export function buildLabGalleryRow(entry) {
  if (!entry || !validId(entry.id) || !isLocalPNG(entry.png) || entry.png.length > 2_000_000 || !validTime(entry.at)) return null;
  return { kind: 'build-lab', id: 'bridge', buildId: entry.id, at: entry.at,
    day: new Date(entry.at).toISOString().slice(0, 10), png: entry.png,
    source: { kind: 'build-lab', version: 1, id: entry.id, build: normalizeBuild(entry.build) } };
}
export function normalizeBuildLabState(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return { schema: 2, current: normalizeBuild(value.current), undo: (Array.isArray(value.undo) ? value.undo : []).slice(-BUILD_LAB_MAX_UNDO).map(normalizeBuild),
    saved: (Array.isArray(value.saved) ? value.saved : []).slice(-BUILD_LAB_MAX_SAVES).filter(s => s && validTime(s.at)).map((s, i) => ({
      id: validId(s.id) ? s.id : `legacy-${Math.round(s.at)}-${i}`, at: Math.round(s.at), build: normalizeBuild(s.build),
      png: isLocalPNG(s.png) && s.png.length <= 2_000_000 ? s.png : null })) };
}
let state = normalizeBuildLabState(null), loaded = false, writes = Promise.resolve(), writeFailed = false;
function trackWrite(pending) {
  writes = pending; void pending.then(() => { if (writes === pending) writeFailed = false; }, () => { if (writes === pending) writeFailed = true; }); return pending;
}
function persist(io = db) { const copy = clone(state); return trackWrite(writes.catch(() => {}).then(() => io.put('kv', BUILD_LAB_KEY, copy))); }
export function hasBuildWriteFailure() { return writeFailed; }
export async function load({ force = false, io = db } = {}) {
  if (!loaded || force) {
    loaded = false;
    await writes;
    const raw = await (io.getStrict || io.get)('kv', BUILD_LAB_KEY);
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw) || (raw.schema != null && raw.schema !== 1 && raw.schema !== 2))) {
      throw Object.assign(new Error('This saved workshop could not be opened safely.'), {code:'build-invalid'});
    }
    const incoming = normalizeBuildLabState(raw);
    if (raw?.saved != null && (!Array.isArray(raw.saved) || raw.saved.length !== incoming.saved.length || raw.saved.some(entry =>
      (entry.id != null && !validId(entry.id)) || (entry.png != null && (!isLocalPNG(entry.png) || entry.png.length > 2_000_000)) ||
      !entry.build || typeof entry.build !== 'object' || Array.isArray(entry.build)))) {
      throw Object.assign(new Error('Some saved builds need a newer or repaired workshop. They were kept.'), {code:'build-invalid'});
    }
    // Repair an interrupted state -> gallery commit. Older gallery builds stay owned.
    for (const entry of incoming.saved) {
      const row = buildLabGalleryRow(entry);
      if (row && !await (io.getStrict || io.get)('gallery', buildLabGalleryKey(entry))) await io.put('gallery', buildLabGalleryKey(entry), row);
    }
    state = incoming; loaded = true;
  }
  return get();
}
export function get() { return clone(state); }
// Idle guidance only needs a boolean; do not clone saved picture data on each timer.
export function hasBuildParts() { return !!(state.current.planks.length || state.current.supports.length); }
export function isBuildDelivered() { return !!state.current.delivered; }
export function apply(action) {
  const next = applyBuildAction(state.current, action);
  if (JSON.stringify(next) === JSON.stringify(state.current)) return get();
  state.undo.push(clone(state.current)); state.undo = state.undo.slice(-BUILD_LAB_MAX_UNDO); state.current = next;
  void persist(); return get();
}
export function undo() { if (state.undo.length) { state.current = state.undo.pop(); void persist(); } return get(); }
export function saveBuild(now = Date.now(), png = null, io = db) {
  if (!validTime(now)) return get();
  // Repeated Keep on an unchanged rendered build reuses its immutable gallery ID.
  const current = clone(state.current), image = isLocalPNG(png) && png.length <= 2_000_000 ? png : null;
  const existing = image && state.saved.find(s => s.png === image && JSON.stringify(s.build) === JSON.stringify(current));
  if (existing) {
    const row = buildLabGalleryRow(existing);
    trackWrite(writes.then(() => io.put('gallery', buildLabGalleryKey(existing), row)));
    return get();
  }
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${++serial}-${Math.random().toString(36).slice(2, 9)}`;
  const entry = { id: `bridge-${Math.round(now)}-${suffix}`, at: now, build: current, png: image };
  state.saved.push(entry); state.saved = state.saved.slice(-BUILD_LAB_MAX_SAVES); void persist(io);
  const row = buildLabGalleryRow(entry);
  if (row) trackWrite(writes.then(() => io.put('gallery', buildLabGalleryKey(entry), row)));
  return get();
}
export function reopen(index) { const saved = state.saved[index]; if (!saved) return get(); state.undo.push(clone(state.current)); state.undo = state.undo.slice(-BUILD_LAB_MAX_UNDO); state.current = clone(saved.build); void persist(); return get(); }
export function reopenSource(raw) {
  if (raw?.kind !== 'build-lab') return null;
  const source = raw.source?.kind === 'build-lab' ? raw.source : raw;
  if (source.version !== 1 || !source.build || typeof source.build !== 'object') return null;
  state.undo.push(clone(state.current)); state.undo = state.undo.slice(-BUILD_LAB_MAX_UNDO);
  state.current = normalizeBuild(source.build); void persist(); return get();
}
export async function reopenGallery(key, { isCurrent = () => true } = {}) {
  await writes; const row = await db.getStrict('gallery', String(key));
  return isCurrent() ? reopenSource(row) : null;
}
export async function checkpointBuildLab({ io = db } = {}) {
  await persist(io);
  const snapshot = get();
  for (const entry of snapshot.saved) {
    const row = buildLabGalleryRow(entry);
    if (row && !await (io.getStrict || io.get)('gallery', buildLabGalleryKey(entry))) {
      trackWrite(writes.then(() => io.put('gallery', buildLabGalleryKey(entry), row)));
      await writes;
    }
  }
  return { persistent: io.status().persistent };
}
export function flush() { return writes; }
export default { load, get, hasBuildParts, isBuildDelivered, hasBuildWriteFailure, apply, undo, saveBuild, reopen, reopenSource, reopenGallery, checkpointBuildLab, flush };
