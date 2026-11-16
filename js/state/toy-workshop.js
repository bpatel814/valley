import db from './db.js';
import { isCreationRow } from './creation-frame.js';
import { normalizeToyWorkshop, normalizeToyDraft, editToyDraft, cloneToyWorkshop,
  TOY_MAX_UNDO, TOY_MAX_ITEMS, toyWorkshopError } from '../data/toy-workshop.js';

export const TOY_WORKSHOP_KEY = 'toy-workshop:v1';
let state = normalizeToyWorkshop(), loaded = false, tail = Promise.resolve(), issue = null;
let writeRevision = 0;
const makeId = prefix => `${prefix}_${Date.now().toString(36)}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2)}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function persist() {
  const snapshot = cloneToyWorkshop(state);
  const revision = ++writeRevision;
  const write = () => db.put('kv', TOY_WORKSHOP_KEY, snapshot);
  tail = tail.then(write, write);
  void tail.then(() => {
    if (revision === writeRevision) issue = db.status().persistent ? null : 'toy-temporary';
  }, () => { if (revision === writeRevision) issue = 'toy-write'; });
  return tail;
}
function accept(candidate) {
  try { state = normalizeToyWorkshop(candidate); issue = null; }
  catch (error) { issue = error.code || 'toy-write'; return false; }
  void persist().catch(() => {});
  return true;
}
export async function loadToyWorkshop({ force = false, io = db } = {}) {
  if (!loaded || force) {
    loaded = false;
    await tail;
    const raw = await (io.getStrict || io.get)('kv', TOY_WORKSHOP_KEY);
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw Object.assign(new Error('This toy workshop could not be opened safely.'), {code:'toy-invalid'});
    const incoming = normalizeToyWorkshop(raw || {});
    const countMatches = (original, normalized) => original == null || (Array.isArray(original) && original.length === normalized.length);
    const draftMatches = (original, normalized) => !original || (typeof original === 'object' && !Array.isArray(original) && (original.asset == null || original.asset === normalized.asset));
    if (!countMatches(raw?.assets,incoming.assets) || !countMatches(raw?.toys,incoming.toys) || !countMatches(raw?.undo,incoming.undo) ||
        !draftMatches(raw?.draft,incoming.draft) || (raw?.undo || []).some((row,index) => !draftMatches(row,incoming.undo[index]))) {
      throw Object.assign(new Error('Some saved toys need a newer or repaired workshop. They were kept.'), {code:'toy-invalid'});
    }
    state = incoming;
    loaded = true;
  }
  return getToyWorkshop();
}
export function getToyWorkshop() { return cloneToyWorkshop(state); }
export function changeToyDraft(action) {
  const next = editToyDraft(state.draft, action);
  if (same(next, state.draft)) return false;
  return accept({ ...state, draft: next, undo: [...state.undo, state.draft].slice(-TOY_MAX_UNDO) });
}
export function useToyPicture(row) {
  if (!isCreationRow(row)) { issue = 'toy-picture-invalid'; return false; }
  let asset = state.assets.find(item => item.sourceRef === row.key && item.png === row.png);
  if (!asset) asset = { id: makeId('toy-art'), sourceRef: row.key, png: row.png, at: Date.now() };
  const draft = { ...state.draft, asset: asset.id, assembled: state.draft.asset === asset.id && state.draft.assembled };
  if (same(draft, state.draft)) return false;
  return accept({ ...state, assets: state.assets.some(item => item.id === asset.id) ? state.assets : [...state.assets, asset],
    draft, undo: [...state.undo, state.draft].slice(-TOY_MAX_UNDO) });
}
export function undoToyWorkshop() {
  if (!state.undo.length) return false;
  return accept({ ...state, draft: state.undo[state.undo.length - 1], undo: state.undo.slice(0, -1) });
}
export async function keepToy(child = 'shared') {
  // This call owns a snapshot even if the child begins another toy during saving.
  const draft = normalizeToyDraft(state.draft);
  if (!draft.asset) throw toyWorkshopError('toy-picture-needed');
  if (!draft.assembled) throw toyWorkshopError('toy-parts-needed');
  const owner = child === 'rayna' || child === 'veer' ? child : 'shared';
  const existing = state.toys.find(item => item.owner === owner && item.asset === draft.asset
    && item.behavior === draft.behavior && same(item.pattern, draft.pattern) && item.name === draft.name);
  if (existing) { await persist(); return { ...cloneToyWorkshop(existing), persistent: db.status().persistent }; }
  if (state.toys.length >= TOY_MAX_ITEMS) throw toyWorkshopError('toy-basket-full');
  const toy = { id: makeId('toy'), asset: draft.asset, behavior: draft.behavior,
    pattern: [...draft.pattern], name: draft.name, owner, at: Date.now() };
  const before = state;
  const candidate = normalizeToyWorkshop({ ...state, draft: { ...draft, toyId: toy.id }, toys: [...state.toys, toy] });
  state = candidate;
  try {
    await persist();
    issue = db.status().persistent ? null : 'toy-temporary';
    return { ...cloneToyWorkshop(toy), persistent: db.status().persistent };
  } catch (error) {
    if (state === candidate) state = before;
    else {
      state = normalizeToyWorkshop({ ...state, toys: state.toys.filter(item => item.id !== toy.id),
        draft: state.draft.toyId === toy.id ? { ...state.draft, toyId: '' } : state.draft });
      // Later queued drafts may contain the rejected keep. Correct that snapshot
      // after those writes without discarding the child's intervening edits.
      void persist().catch(() => { issue = 'toy-write'; });
    }
    issue = 'toy-write'; throw error;
  }
}
export function reopenToy(toyId) {
  const toy = state.toys.find(item => item.id === toyId);
  if (!toy) return false;
  const next = normalizeToyDraft({ ...toy, toyId: toy.id, assembled: true });
  if (same(state.draft, next)) return false;
  return accept({ ...state, draft: next, undo: [...state.undo, state.draft].slice(-TOY_MAX_UNDO) });
}
export function flushToyWorkshop() { return tail; }
export async function retryToyWorkshopWrites() {
  // A failed write owns the latest in-memory toy; do not reload over it.
  if (!loaded && issue !== 'toy-write') await loadToyWorkshop();
  await persist();
  return { persistent: db.status().persistent };
}
export function toyWorkshopStatus() { return { issue, ...db.status() }; }
