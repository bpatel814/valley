import db from './db.js';
import { normalizeAnimalFriends, normalizeAnimalCorner, normalizeCatGardenDraft, editAnimalCorner, animalCatPosition, catCornerDayOutcome, cloneAnimalFriends, animalSavedPage, animalError, ANIMAL_MAX_UNDO, ANIMAL_MAX_KEEPS, ANIMAL_MAX_BYTES } from '../data/animal-friends.js';
export const ANIMAL_FRIENDS_KEY = 'animal-friends:v1';
let state = normalizeAnimalFriends(), loaded = false, tail = Promise.resolve(), issue = null;
let transferring = false, outingBaseBytes = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const makeId = () => `animal_${Date.now().toString(36)}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2)}`;
function persist() { const snapshot = cloneAnimalFriends(state); tail = tail.then(() => db.put('kv', ANIMAL_FRIENDS_KEY, snapshot), () => db.put('kv', ANIMAL_FRIENDS_KEY, snapshot)); const pending = tail; void pending.then(() => { issue = db.status().persistent ? null : 'animal-temporary'; }, () => { issue = 'animal-write'; }); return pending; }
function accept(candidate) { try { state = normalizeAnimalFriends(candidate); issue = null; } catch (error) { issue = error.code || 'animal-write'; return false; } void persist().catch(() => { issue = 'animal-write'; }); return true; }
export async function loadAnimalFriends({ force = false, io = db } = {}) {
  if (!loaded || force) {
    loaded = false; await tail;
    const raw = await (io.getStrict || io.get)('kv', ANIMAL_FRIENDS_KEY);
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw Object.assign(new Error('This cat corner could not be opened safely.'), {code:'animal-invalid'});
    const incoming = normalizeAnimalFriends(raw || {});
    const countMatches = (original, normalized) => original == null || (Array.isArray(original) && original.length === normalized.length);
    const cornerMatches = (original, normalized) => !original || (typeof original === 'object' && !Array.isArray(original) &&
      (!original.picture || !!normalized?.picture && original.picture.sourceRef === normalized.picture.sourceRef && original.picture.png === normalized.picture.png));
    if (!countMatches(raw?.saved,incoming.saved) || !countMatches(raw?.undo,incoming.undo) || !cornerMatches(raw?.current,incoming.current) ||
        (raw?.undo || []).some((row,index) => !cornerMatches(row,incoming.undo[index])) ||
        (raw?.saved || []).some((row,index) => !cornerMatches(row?.corner,incoming.saved[index]?.corner)) ||
        (raw?.outing && (!incoming.outing || raw.outing.id !== incoming.outing.id || !cornerMatches(raw.outing.origin,incoming.outing.origin)))) {
      throw Object.assign(new Error('Some saved cat play needs a newer or repaired corner. It was kept.'), {code:'animal-invalid'});
    }
    state = incoming; outingBaseBytes = 0; loaded = true;
  }
  return animalFriendsView();
}
export function getAnimalFriends() { return cloneAnimalFriends(state); }
export function animalFriendsView() { return { current: cloneAnimalFriends(state.current), undoCount: state.undo.length, savedCount: state.saved.length, outingId: state.outing?.id || null, outingCornerChanged: !!state.outing && !same(state.current, state.outing.origin), ...(state.current.catDay ? { catDayOutcome: catCornerDayOutcome(state.current) } : {}) }; }
export function changeAnimalFriends(action) { if (transferring) return false; outingBaseBytes = 0; const next = editAnimalCorner(state.current, action); if (same(next, state.current)) return false; return accept({ ...state, current: next, undo: [...state.undo, state.current].slice(-ANIMAL_MAX_UNDO) }); }
export function undoAnimalFriends() { if (transferring || !state.undo.length) return false; outingBaseBytes = 0; return accept({ ...state, current: state.undo.at(-1), undo: state.undo.slice(0, -1) }); }
export function animalFriendsPage(page = 0, child = null) { return animalSavedPage(state.saved, page, child); }
export function reopenAnimalFriends(id) { if (transferring) return false; outingBaseBytes = 0; const row = state.saved.find(item => item.id === id); if (!row || same(row.corner, state.current)) return false; return accept({ ...state, current: row.corner, undo: [...state.undo, state.current].slice(-ANIMAL_MAX_UNDO) }); }
export async function keepAnimalFriends(child = 'shared') {
  if (transferring) throw animalError('animal-busy');
  outingBaseBytes = 0;
  const current = normalizeAnimalCorner(state.current), owner = ['rayna', 'veer'].includes(child) ? child : 'shared';
  const existing = state.saved.find(row => row.owner === owner && same(row.corner, current));
  if (existing) { await persist(); issue = db.status().persistent ? null : 'animal-temporary'; return { id: existing.id, persistent: db.status().persistent }; }
  if (state.saved.length >= ANIMAL_MAX_KEEPS) { issue = 'animal-full'; throw animalError(issue); }
  const row = { id: makeId(), at: Date.now(), owner, corner: current }, before = state; let candidate;
  try { candidate = normalizeAnimalFriends({ ...state, saved: [...state.saved, row] }); } catch (error) { issue = error.code || 'animal-write'; throw error; }
  state = candidate;
  try { await persist(); issue = db.status().persistent ? null : 'animal-temporary'; return { id: row.id, persistent: db.status().persistent }; }
  catch (error) { if (state === candidate) state = before; else { state = normalizeAnimalFriends({ ...state, saved: state.saved.filter(item => item.id !== row.id) }); void persist().catch(() => { issue = 'animal-write'; }); } issue = 'animal-write'; throw error; }
}
export function flushAnimalFriends() { return tail; }
export function retryAnimalFriendsWrites() { return persist(); }
export function animalFriendsStatus() { return { issue, ...db.status() }; }

// Route transfers are accepted only after their captured typed snapshot writes.
async function transfer(build, valid = () => true) {
  if (transferring) throw animalError('animal-busy');
  transferring = true;
  try {
    await tail;
    if (!valid()) throw animalError('animal-stale');
    const before = state, candidate = normalizeAnimalFriends(build(before));
    tail = tail.then(() => db.put('kv', ANIMAL_FRIENDS_KEY, candidate));
    await tail;
    state = candidate; outingBaseBytes = 0; issue = db.status().persistent ? null : 'animal-temporary';
    return valid();
  } catch (error) { issue = error.code || 'animal-write'; throw error; }
  finally { transferring = false; }
}
export function catOutingView(id) { return state.outing?.id === id ? cloneAnimalFriends(state.outing) : null; }
export async function beginCatOuting({ revisit = false, adoptCurrent = false, valid = () => true } = {}) {
  let outingId;
  const accepted = await transfer(before => {
    if (before.outing) { outingId = before.outing.id; return adoptCurrent ? { ...before, outing: { ...before.outing, origin: before.current } } : before; }
    if (animalCatPosition(before.current).hidden) throw animalError('animal-cat-hidden');
    outingId = makeId();
    return { ...before, outing: { v: 1, id: outingId, origin: before.current,
      draft: revisit && before.current.gardenVisit ? before.current.gardenVisit.draft : normalizeCatGardenDraft() } };
  }, valid);
  return accepted ? outingId : null;
}
export function saveCatOutingGarden(id, rawDraft) {
  if (transferring || state.outing?.id !== id) return Promise.reject(animalError(transferring ? 'animal-busy' : 'animal-stale'));
  try {
    const draft = normalizeCatGardenDraft(rawDraft), outing = { ...state.outing, draft };
    if (!outingBaseBytes) outingBaseBytes = new TextEncoder().encode(JSON.stringify({ ...state, outing: null })).byteLength;
    if (outingBaseBytes + new TextEncoder().encode(JSON.stringify(outing)).byteLength > ANIMAL_MAX_BYTES) throw animalError('animal-capacity');
    // Internal records are immutable. Reuse the captured library rather than
    // serializing/cloning all prior PNGs for each partial channel checkpoint.
    state = { ...state, outing }; const snapshot = state;
    tail = tail.then(() => db.put('kv', ANIMAL_FRIENDS_KEY, snapshot), () => db.put('kv', ANIMAL_FRIENDS_KEY, snapshot));
    void tail.then(() => { issue = db.status().persistent ? null : 'animal-temporary'; }, () => { issue = 'animal-write'; });
    return tail;
  } catch (error) { issue = error.code || 'animal-write'; return Promise.reject(error); }
}
export async function returnCatOuting(id, valid = () => true) {
  return transfer(before => {
    const outing = before.outing;
    if (outing?.id !== id) throw animalError('animal-stale');
    if (!same(before.current, outing.origin)) throw animalError('animal-corner-changed');
    const current = editAnimalCorner(outing.origin, { type: 'rest' }); current.invitation = 'corner';
    current.gardenVisit = { v: 1, id, draft: outing.draft };
    return { ...before, current, outing: null, undo: [...before.undo, before.current].slice(-ANIMAL_MAX_UNDO) };
  }, valid);
}
