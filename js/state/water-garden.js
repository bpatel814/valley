import db from './db.js';
import { normalizeWaterGarden, WATER_GARDEN_MODES } from '../data/water-garden.js';
export const WATER_GARDEN_KEY = 'water-garden:v1';
export const WATER_GARDEN_MAX_SAVES = 1000;
export const WATER_GARDEN_GALLERY_PAGE_SIZE = 12;
const clone = value => JSON.parse(JSON.stringify(value));
const token = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
export function normalizeWaterGardenStore(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const drafts = {};
  for (const mode of WATER_GARDEN_MODES) {
    const draft = raw.drafts?.[mode] || {};
    const history = (Array.isArray(draft.history) ? draft.history : []).slice(-40).map(garden => normalizeWaterGarden(garden, mode));
    // Undo snapshots are optional; current ink is never pruned to make room.
    while (history.length && JSON.stringify(history).length > 250_000) history.shift();
    drafts[mode] = { garden: normalizeWaterGarden(draft.garden, mode), history };
  }
  const gallery = (Array.isArray(raw.gallery) ? raw.gallery : [])
    .filter(row => token(row?.id) && WATER_GARDEN_MODES.includes(row?.garden?.mode))
    .map(row => ({ id: token(row.id), at: Math.max(0, Number.isFinite(Number(row.at)) ? Number(row.at) : 0), garden: normalizeWaterGarden(row.garden, row.garden.mode) }));
  if (gallery.length > WATER_GARDEN_MAX_SAVES) throw Object.assign(new Error('This garden album exceeds the 1,000-keepsake limit. Existing work has not been changed.'), { code: 'gardens-full' });
  return { v: 1, active: WATER_GARDEN_MODES.includes(raw.active) ? raw.active : 'pip', drafts, gallery };
}
let tail = Promise.resolve();
export async function loadWaterGarden({ io = db } = {}) {
  await tail;
  const raw = await (io.getStrict || io.get)('kv', WATER_GARDEN_KEY);
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw) || (raw.v != null && raw.v !== 1))) throw Object.assign(new Error('This water garden could not be opened safely.'), {code:'water-invalid'});
  const incoming = normalizeWaterGardenStore(raw || {});
  const countMatches = (original, normalized) => original == null || (Array.isArray(original) && original.length === normalized.length);
  const gardenMatches = (original, normalized) => {
    if (!original) return true;
    if (typeof original !== 'object' || Array.isArray(original) || !normalized || !countMatches(original.paths, normalized.paths) || !countMatches(original.decorations, normalized.decorations)) return false;
    return !(original.paths || []).some((path,index) => !countMatches(path,normalized.paths[index]) || path.some((point,i) => point?.x !== normalized.paths[index][i].x || point?.y !== normalized.paths[index][i].y));
  };
  if (raw?.drafts != null && (typeof raw.drafts !== 'object' || Array.isArray(raw.drafts) || Object.keys(raw.drafts).some(mode => !WATER_GARDEN_MODES.includes(mode)))) throw Object.assign(new Error('Some saved gardens need a newer or repaired garden. They were kept.'), {code:'water-invalid'});
  if (!countMatches(raw?.gallery,incoming.gallery) || (raw?.gallery || []).some((row,index) => row?.id !== incoming.gallery[index]?.id || !gardenMatches(row?.garden,incoming.gallery[index]?.garden))) throw Object.assign(new Error('Some saved gardens need a newer or repaired garden. They were kept.'), {code:'water-invalid'});
  for (const mode of WATER_GARDEN_MODES) {
    const draft = raw?.drafts?.[mode], next = incoming.drafts[mode];
    if (draft && (typeof draft !== 'object' || Array.isArray(draft) || !gardenMatches(draft.garden,next.garden) || !countMatches(draft.history,next.history) || (draft.history || []).some((garden,index) => !gardenMatches(garden,next.history[index])))) throw Object.assign(new Error('Some saved gardens need a newer or repaired garden. They were kept.'), {code:'water-invalid'});
  }
  return incoming;
}
export function saveWaterGarden(raw) {
  const snapshot = normalizeWaterGardenStore(raw);
  const work = () => db.put('kv', WATER_GARDEN_KEY, snapshot).then(() => clone(snapshot));
  tail = tail.then(work, work);
  return tail;
}
export function flushWaterGarden() { return tail; }
export function waterGardenStorageStatus() { return db.status(); }
export function waterGardenKeepPlan(store) {
  const garden = JSON.stringify(store.drafts[store.active].garden);
  const duplicate = store.gallery.find(row => JSON.stringify(row.garden) === garden);
  return { duplicate: duplicate?.id || null, full: store.gallery.length >= WATER_GARDEN_MAX_SAVES };
}
export function waterGardenGalleryPage(entries, page = 0) {
  const pages = Math.max(1, Math.ceil(entries.length / WATER_GARDEN_GALLERY_PAGE_SIZE));
  const index = Math.max(0, Math.min(pages - 1, Math.floor(Number(page) || 0)));
  const start = index * WATER_GARDEN_GALLERY_PAGE_SIZE;
  return { page: index, pages, start, items: entries.slice(start, start + WATER_GARDEN_GALLERY_PAGE_SIZE) };
}
export function keepWaterGarden(store, at = Date.now()) {
  const next = normalizeWaterGardenStore(store);
  const plan = waterGardenKeepPlan(next);
  if (plan.duplicate || plan.full) return next;
  const id = `garden_${at.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  next.gallery.push({ id, at, garden: clone(next.drafts[next.active].garden) });
  return next;
}
export function reopenWaterGarden(store, id) {
  const next = normalizeWaterGardenStore(store);
  const row = next.gallery.find(item => item.id === id);
  if (!row) return next;
  const mode = row.garden.mode;
  next.active = mode;
  next.drafts[mode] = { garden: clone(row.garden), history: [...next.drafts[mode].history, clone(next.drafts[mode].garden)].slice(-40) };
  return next;
}
