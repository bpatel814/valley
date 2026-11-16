// Optional v8-compatible play. Gallery originals never change after creation.
import db from './db.js';
import progress, { commitBooHollow, flushProgressWrites } from './progress.js';
import { today } from './session.js';
import { drawingHasMarks } from '../data/drawings.js';
import { isLocalPNG } from './creation-frame.js';

const MODES = ['dots', 'guide', 'free'];
const DOORS = ['ba', 'dada', 'mama', 'daddy', 'cousins'];
const PICTURE_DOOR = 'dada';
const PICTURE_GLYPH = 'pumpkin-face';
const sourceKey = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,200}$/.test(value);
const fail = (message, code = 'boo-invalid') => { throw Object.assign(new Error(message), { code }); };
const record = value => value != null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const savedAt = value => Number.isSafeInteger(value) && value >= 0;
function clone(value) {
  const visiting = new Set();
  const check = item => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number' && Number.isFinite(item)) return;
    if ((!Array.isArray(item) && !record(item)) || visiting.has(item)) fail('This saved drawing contains a value that cannot be kept exactly. Its original was kept.');
    visiting.add(item);
    for (const child of Array.isArray(item) ? item : Object.values(item)) check(child);
    visiting.delete(item);
  };
  try {
    check(value);
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    if (error?.code) throw error;
    fail('This saved drawing cannot be opened yet. Its original was kept.');
  }
}
let tail = Promise.resolve();
let issue = '';

function token(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(value)) fail('This ghost needs a valid drawing identity. Your marks were kept.');
  return value;
}

function validateStrokes(strokes) {
  if (!Array.isArray(strokes)) fail('This drawing cannot be opened yet. Its saved marks were kept.');
  if (strokes.length > 512) fail('This drawing needs more saving room. Your marks were kept.', 'boo-capacity');
  for (const stroke of strokes) {
    if (!Array.isArray(stroke) || stroke.length > 8192) fail('This drawing needs more saving room. Your marks were kept.', 'boo-capacity');
    for (const p of stroke) {
      if (!record(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y) || (Object.hasOwn(p, 'p') && !Number.isFinite(p.p)) || (Object.hasOwn(p, 't') && !Number.isFinite(p.t))) fail('This drawing contains a mark that cannot be opened. Its original was kept.');
    }
  }
}

function normaliseDrawingSnapshot(value, glyph) {
  if (!record(value) || value.version !== 1 || value.coordinateSpace !== 'glyph' || value.glyph !== glyph) fail('This drawing cannot be opened yet. Its saved marks were kept.');
  validateStrokes(value.strokes);
  if (Object.hasOwn(value, 'undo')) {
    if (!Array.isArray(value.undo)) fail('This drawing has saved Undo marks that cannot be opened. Its original was kept.');
    if (value.undo.length > 512) fail('This drawing needs more saving room. Your marks were kept.', 'boo-capacity');
    for (const strokes of value.undo) validateStrokes(strokes);
  }
  const checked = clone(value);
  // Refuse oversized snapshots without truncating a single coordinate or Undo.
  if (JSON.stringify(checked).length > 32 * 1024 * 1024) fail('This drawing needs more saving room. Your marks were kept.', 'boo-capacity');
  return checked;
}

export function normaliseBooSnapshot(value) { return normaliseDrawingSnapshot(value, 'ghost'); }

export function normaliseBooHollow(value) {
  if (value == null) return { v: 1, drafts: {}, ghosts: [], lane: {} };
  if (!record(value) || value.v !== 1 || !Array.isArray(value.ghosts) || !record(value.drafts) || !record(value.lane)) fail('This ghost world belongs to another version. Earlier play was kept.', 'boo-version');
  for (const [mode, draft] of Object.entries(value.drafts)) {
    if (!MODES.includes(mode) || !record(draft) || draft.mode !== mode || !savedAt(draft.at)) fail('This ghost drawing draft cannot be opened yet. Its saved marks were kept.');
    token(draft.attemptId); normaliseBooSnapshot(draft.snapshot);
  }
  const ids = new Set(), attempts = new Set(), sources = new Set();
  for (const ghost of value.ghosts) {
    if (!record(ghost) || !MODES.includes(ghost.mode) || !savedAt(ghost.at) || !sourceKey(ghost.sourceKey)) fail('This saved ghost reference cannot be opened yet. Its original was kept.');
    token(ghost.id); token(ghost.attemptId);
    if (ids.has(ghost.id) || attempts.has(ghost.attemptId) || sources.has(ghost.sourceKey)) fail('This saved ghost has a repeated drawing identity. Its originals were kept.');
    ids.add(ghost.id); attempts.add(ghost.attemptId); sources.add(ghost.sourceKey);
  }
  for (const [door, row] of Object.entries(value.lane)) {
    if (!DOORS.includes(door) || !record(row) || !Number.isInteger(row.treats) || row.treats < 0 || row.treats > (door === 'cousins' ? 2 : 5) || typeof row.complete !== 'boolean') fail('This ghost world has family-door play that cannot be opened yet. Earlier play was kept.');
    if (Object.hasOwn(row, 'sourceKey') && (door !== PICTURE_DOOR || !sourceKey(row.sourceKey))) fail('This saved family picture reference cannot be opened yet. Its original was kept.');
    if (Object.hasOwn(row, 'attemptId')) token(row.attemptId);
    if (door === 'cousins' && row.complete !== (row.treats === 2)) fail('This saved sharing visit cannot be opened yet. Earlier play was kept.');
  }
  if (Object.hasOwn(value, 'doorDrafts')) {
    if (!record(value.doorDrafts)) fail('This saved family drawing draft cannot be opened yet. Its marks were kept.');
    for (const [door, draft] of Object.entries(value.doorDrafts)) {
      if (door !== PICTURE_DOOR || !record(draft) || draft.door !== door || !savedAt(draft.at)) fail('This saved family drawing draft cannot be opened yet. Its marks were kept.');
      token(draft.attemptId); normaliseDrawingSnapshot(draft.snapshot, PICTURE_GLYPH);
    }
  }
  return clone(value);
}

function enqueue(work) {
  // Enter progress's single queue at the moment the action is accepted. A
  // second microtask queue could otherwise move this save behind a later reset.
  let pending;
  try { pending = work(); } catch (error) { pending = Promise.reject(error); }
  const next = Promise.resolve(pending).then(result => { issue = ''; return result; }, error => { issue = error?.message || 'Your ghost could not save. Your marks were kept.'; throw error; });
  tail = Promise.all([tail, next.catch(() => undefined)]).then(() => undefined);
  return next;
}

async function hydrate(ghost) {
  const row = await db.getStrict('gallery', ghost.sourceKey);
  const original = record(row) && row.id === 'ghost' && row.attemptId === ghost.attemptId && isLocalPNG(row.png);
  const snapshot = original ? normaliseBooSnapshot(row.snapshot || { version: 1, coordinateSpace: 'glyph', glyph: 'ghost', strokes: row.strokes }) : null;
  return { ...clone(ghost), png: original ? row.png : null, actorPng: original ? isLocalPNG(row.actorPng) ? row.actorPng : row.png : null,
    snapshot, missingOriginal: !original };
}

export async function loadBooHollow() {
  await flushBooHollowWrites();
  if (!progress.isLoaded()) await progress.load();
  const value = normaliseBooHollow(progress.get().booHollow);
  value.ghosts = await Promise.all(value.ghosts.map(hydrate));
  if (value.lane.dada?.sourceKey) value.lane.dada.picture = await hydrateDoorPicture(value.lane.dada.sourceKey, value.lane.dada.attemptId);
  return value;
}

export function saveBooDraft({ mode, snapshot, attemptId }) {
  if (!MODES.includes(mode)) return Promise.reject(new Error('Choose a drawing style.'));
  const draft = { mode, snapshot: normaliseBooSnapshot(snapshot), attemptId: token(attemptId), at: Date.now() };
  return enqueue(() => commitBooHollow(raw => {
    const value = normaliseBooHollow(raw);
    value.drafts[mode] = draft;
    return { value, result: clone(draft) };
  }));
}

export function clearBooDraft(mode, attemptId = null) {
  if (!MODES.includes(mode)) return Promise.reject(new Error('Choose a drawing style.'));
  if (attemptId != null) token(attemptId);
  return enqueue(() => commitBooHollow(raw => {
    const value = normaliseBooHollow(raw);
    if (!attemptId || value.drafts[mode]?.attemptId === attemptId) delete value.drafts[mode];
    return { value, result: clone(value) };
  }));
}

export function createBooGhost({ attemptId, mode, snapshot, png, actorPng }) {
  const identity = token(attemptId);
  const original = normaliseBooSnapshot(snapshot);
  if (!MODES.includes(mode) || !drawingHasMarks(original.strokes)) return Promise.reject(new Error('Make a mark for your ghost friend.'));
  if (!isLocalPNG(png) || (actorPng && !isLocalPNG(actorPng))) return Promise.reject(new Error('Your ghost picture could not save. Your marks were kept.'));
  if (png.length + (actorPng?.length || 0) > 32 * 1024 * 1024) return Promise.reject(Object.assign(new Error('This picture needs more saving room. Your marks were kept.'), { code: 'boo-capacity' }));
  return enqueue(async () => {
    const ghost = await commitBooHollow(async raw => {
      const value = normaliseBooHollow(raw);
      const previous = value.ghosts.find(item => item.attemptId === identity);
      if (previous) return { value, result: previous };
      const day = today(), at = Date.now();
      const sourceKey = `${day}_ghost_${identity}`;
      if (await db.getStrict('gallery', sourceKey)) fail('This ghost original already exists. It was kept.', 'boo-original-exists');
      const entry = { id: identity, attemptId: identity, mode, sourceKey, at };
      const row = { id: 'ghost', day, at, png, actorPng: actorPng || png, strokes: clone(original.strokes), snapshot: original,
        step: MODES.indexOf(mode), attemptId: identity, booHollow: { v: 1, ghostId: identity } };
      value.ghosts.push(entry);
      if (value.drafts[mode]?.attemptId === identity) delete value.drafts[mode];
      return { value, put: [['gallery', sourceKey, row]], result: entry };
    });
    return hydrate(ghost);
  });
}

export function saveBooDoor(door, patch) {
  if (!DOORS.includes(door)) return Promise.reject(new Error('Choose a family door.'));
  if (!record(patch) || Object.keys(patch).some(key => !['treats', 'complete'].includes(key)) || Object.hasOwn(patch, 'treats') && (!Number.isInteger(patch.treats) || patch.treats < 0 || patch.treats > (door === 'cousins' ? 2 : 5)) || Object.hasOwn(patch, 'complete') && typeof patch.complete !== 'boolean') return Promise.reject(new Error('This family-door play could not save. Earlier play was kept.'));
  const change = clone(patch);
  return enqueue(() => commitBooHollow(raw => {
    const value = normaliseBooHollow(raw);
    const old = value.lane[door] || { treats: 0, complete: false };
    value.lane[door] = { ...old, ...change };
    if (door === 'cousins') value.lane[door].complete = value.lane[door].treats === 2;
    return { value, result: clone(value.lane) };
  }));
}

function clearDoorDraft(value, door, attemptId) {
  if (value.doorDrafts?.[door] && (attemptId == null || value.doorDrafts[door].attemptId === attemptId)) {
    delete value.doorDrafts[door];
    if (!Object.keys(value.doorDrafts).length) delete value.doorDrafts;
  }
}

export function saveBooDoorDraft(door, { snapshot, attemptId }) {
  if (door !== PICTURE_DOOR) return Promise.reject(new Error('Choose the pumpkin drawing door.'));
  const draft = { door, snapshot: normaliseDrawingSnapshot(snapshot, PICTURE_GLYPH), attemptId: token(attemptId), at: Date.now() };
  return enqueue(() => commitBooHollow(raw => {
    const value = normaliseBooHollow(raw);
    value.doorDrafts = { ...value.doorDrafts, [door]: draft };
    return { value, result: clone(draft) };
  }));
}

export function clearBooDoorDraft(door, attemptId = null) {
  if (door !== PICTURE_DOOR) return Promise.reject(new Error('Choose the pumpkin drawing door.'));
  if (attemptId != null) token(attemptId);
  return enqueue(() => commitBooHollow(raw => {
    const value = normaliseBooHollow(raw);
    clearDoorDraft(value, door, attemptId);
    return { value, result: clone(value) };
  }));
}

async function hydrateDoorPicture(key, attemptId) {
  const row = await db.getStrict('gallery', key);
  const original = record(row) && row.id === 'pumpkin' && row.booHollow?.v === 1 && row.booHollow?.door === PICTURE_DOOR && typeof row.attemptId === 'string' && /^[A-Za-z0-9:_-]{1,160}$/.test(row.attemptId) && (attemptId == null || row.attemptId === attemptId) && isLocalPNG(row.png);
  return { sourceKey: key, attemptId: original ? row.attemptId : attemptId || null,
    png: original ? row.png : null, inkPng: original && isLocalPNG(row.inkPng) ? row.inkPng : null,
    snapshot: original ? normaliseDrawingSnapshot(row.snapshot, PICTURE_GLYPH) : null, missingOriginal: !original };
}

export function createBooDoorPicture({ door, attemptId, snapshot, png, inkPng }) {
  if (door !== PICTURE_DOOR) return Promise.reject(new Error('Choose the pumpkin drawing door.'));
  const identity = token(attemptId), original = normaliseDrawingSnapshot(snapshot, PICTURE_GLYPH);
  if (!original.strokes.some(stroke => stroke.length)) return Promise.reject(new Error('Give your pumpkin a little mark.'));
  if (!isLocalPNG(png) || (inkPng != null && !isLocalPNG(inkPng))) return Promise.reject(new Error('Your pumpkin picture could not save. Your marks were kept.'));
  if (png.length + (inkPng?.length || 0) > 32 * 1024 * 1024) return Promise.reject(Object.assign(new Error('This picture needs more saving room. Your marks were kept.'), { code: 'boo-capacity' }));
  return enqueue(async () => {
    const saved = await commitBooHollow(async raw => {
      const value = normaliseBooHollow(raw);
      // Stable attempt suffix finds an older original even after midnight or a
      // later pumpkin. A retry never rewrites it or replaces a newer Lane row.
      const suffix = `_pumpkin_${identity}`;
      const matches = (await db.keysStrict('gallery')).filter(key => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}_pumpkin_/.test(key) && key.slice(10) === suffix);
      if (matches.length) {
        if (matches.length !== 1) fail('This pumpkin has repeated saved originals. They were kept.', 'boo-original-exists');
        const old = await db.getStrict('gallery', matches[0]);
        if (old?.id !== 'pumpkin' || old.attemptId !== identity || old.booHollow?.v !== 1 || old.booHollow?.door !== door) fail('This pumpkin original already exists. It was kept.', 'boo-original-exists');
        if (!value.lane[door]?.sourceKey || value.lane[door].sourceKey === matches[0]) value.lane[door] = { ...(value.lane[door] || { treats: 0 }), complete: true, sourceKey: matches[0], attemptId: identity };
        clearDoorDraft(value, door, identity);
        return { value, result: { sourceKey: matches[0], attemptId: identity } };
      }
      const day = today(), at = Date.now(), key = `${day}_pumpkin_${identity}`;
      if (await db.getStrict('gallery', key)) fail('This pumpkin original already exists. It was kept.', 'boo-original-exists');
      const row = { id: 'pumpkin', day, at, png, strokes: clone(original.strokes), snapshot: original, step: 2,
        attemptId: identity, booHollow: { v: 1, door } };
      if (inkPng != null) row.inkPng = inkPng;
      value.lane[door] = { ...(value.lane[door] || { treats: 0 }), complete: true, sourceKey: key, attemptId: identity };
      clearDoorDraft(value, door, identity);
      return { value, put: [['gallery', key, row]], result: { sourceKey: key, attemptId: identity } };
    });
    return hydrateDoorPicture(saved.sourceKey, saved.attemptId);
  });
}

export function completeBooDoor(door) { return saveBooDoor(door, { complete: true }); }
export async function flushBooHollowWrites() {
  let pending;
  do { pending = tail; await pending; await flushProgressWrites(); } while (pending !== tail);
}
export function booHollowStatus() { return { issue, ...db.status() }; }
