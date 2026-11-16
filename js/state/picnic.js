import db from './db.js';
import { isLocalPNG } from './creation-frame.js';
import { newPicnic, normalizePicnic, normalizeCafeMessage, applyPicnic, picnicSame, clonePicnic } from '../data/picnic.js';
import { picturePNGSize } from '../data/picture-view.js';
export const PICNIC_KEY = 'picnic:v1';
export const PICNIC_MAX_SAVES = 1000;
export const PICNIC_MAX_BYTES = 64 * 1024 * 1024;
export const PICNIC_MAX_CLOTH_CHARS = 1_500_000;
let store = { v: 1, draft: newPicnic(), undo: [], saves: [], assets: [] };
let loaded = false, tail = Promise.resolve(), issue = null, writeRevision = 0;
function problem(code) { const error = new Error(code); error.code = code; return error; }
export function picnicStoreBytes(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
function checkBytes(value) { if (picnicStoreBytes(value) > PICNIC_MAX_BYTES) throw problem('capacity'); }
export function prunePicnicAssets(value) {
  const used = new Set([value.draft, ...value.undo, ...value.saves.map(s => s.scene)].flatMap(s => [s.cloth, s.cafe?.sign?.asset]).filter(Boolean));
  return { ...value, assets: value.assets.filter(a => used.has(a.id)) };
}
export function picnicSavedPage(saves, page = 0, size = 8) {
  const count = Math.max(1, Math.ceil(saves.length / size)), index = Math.max(0, Math.min(count - 1, Math.floor(Number(page) || 0)));
  return { page: index, count, rows: saves.slice(index * size, (index + 1) * size) };
}

export function normalizePicnicStore(raw) {
  if (raw?.v != null && raw.v !== 1) throw problem('picnic-version');
  const seen = new Set();
  const assets = (Array.isArray(raw?.assets) ? raw.assets : []).filter(a =>
    a && typeof a.id === 'string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(a.id) && isLocalPNG(a.png) && a.png.length <= PICNIC_MAX_CLOTH_CHARS && !seen.has(a.id) && seen.add(a.id))
    .map(a => ({ id: a.id, sourceRef: String(a.sourceRef || '').slice(0, 180), png: a.png }));
  const assetIds = new Set(assets.map(a => a.id));
  const scene = input => {
    const n = normalizePicnic(input); if (!assetIds.has(n.cloth)) n.cloth = '';
    if (n.cafe) {
      if (!assetIds.has(n.cafe.sign.asset)) { n.cafe.sign.asset = ''; delete n.cafe.sign.frame; }
      else if (n.cafe.sign.frame) {
        const size = picturePNGSize(assets.find(asset => asset.id === n.cafe.sign.asset).png), frame = n.cafe.sign.frame;
        if (!size || size.width !== frame.sourceWidth || size.height !== frame.sourceHeight) throw problem('picture-view-source');
      }
    }
    return n;
  };
  const saves = (Array.isArray(raw?.saves) ? raw.saves : []).filter(s => s && typeof s.id === 'string');
  if (saves.length > PICNIC_MAX_SAVES) throw problem('tables-full');
  const clean = { v: 1, draft: raw?.draft ? scene(raw.draft) : newPicnic(),
    undo: (Array.isArray(raw?.undo) ? raw.undo : []).slice(-24).map(scene), assets,
    saves: saves
      .map(s => ({ id: s.id.slice(0, 180), at: Number.isFinite(Number(s.at)) && Number(s.at) > 0 && Number(s.at) <= 8640000000000000 ? Math.round(Number(s.at)) : 0, scene: scene(s.scene) })),
  };
  const retained = prunePicnicAssets(clean); checkBytes(retained); return retained;
}
function write() {
  const captured = clonePicnic(store), revision = ++writeRevision;
  const work = () => db.put('kv', PICNIC_KEY, captured);
  tail = tail.then(work, work).then(result => {
    if (revision === writeRevision) issue = db.status().persistent ? null : 'temporary';
    return result;
  }, error => {
    if (revision === writeRevision) issue = 'write';
    throw error;
  });
  return tail;
}
export async function load({ force = false, io = db } = {}) {
  if (loaded && !force) return get();
  loaded = false;
  await tail;
  const raw = await (io.getStrict || io.get)('kv', PICNIC_KEY);
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw problem('picnic-invalid');
  const incoming = normalizePicnicStore(raw);
  const countMatches = (original, normalized) => original == null || (Array.isArray(original) && original.length === normalized.length);
  const sceneMatches = (original, normalized) => !original || (typeof original === 'object' && !Array.isArray(original) &&
    countMatches(original.pieces, normalized.pieces) && (original.cloth == null || original.cloth === normalized.cloth) &&
    (original.cafe?.sign?.asset == null || original.cafe.sign.asset === normalized.cafe?.sign?.asset));
  if (!countMatches(raw?.assets,incoming.assets) || !countMatches(raw?.saves,incoming.saves) || !countMatches(raw?.undo,incoming.undo) ||
      !sceneMatches(raw?.draft,incoming.draft) || (raw?.undo || []).some((row,index) => !sceneMatches(row,incoming.undo[index])) ||
      (raw?.saves || []).some((row,index) => row?.id !== incoming.saves[index]?.id || !sceneMatches(row?.scene,incoming.saves[index]?.scene))) {
    throw problem('picnic-invalid');
  }
  store = incoming; loaded = true;
  return get();
}
export function get() { return { ...store, draft: clonePicnic(store.draft), undo: store.undo.map(clonePicnic), saves: store.saves.map(s => ({ ...s, scene: clonePicnic(s.scene) })), assets: store.assets.map(a => ({ ...a })) }; }
export function change(action) {
  issue = null;
  if (action?.type === 'cafe-sign' && action.asset && !store.assets.some(asset => asset.id === action.asset)) { issue = 'invalid-picture'; return false; }
  if (action?.type === 'cafe-sign-view' && action.frame != null) {
    const size = picturePNGSize(store.assets.find(asset => asset.id === action.asset)?.png);
    if (!size || size.width !== action.frame.sourceWidth || size.height !== action.frame.sourceHeight) { issue = 'invalid-picture'; return false; }
  }
  const next = applyPicnic(store.draft, action);
  if (picnicSame(store.draft, next)) return false;
  const candidate = prunePicnicAssets({ ...store, undo: [...store.undo, clonePicnic(store.draft)].slice(-24), draft: next });
  try { checkBytes(candidate); } catch (error) { issue = error.code; return false; }
  store = candidate; void write().catch(() => {}); return true;
}
export function undo() {
  const previous = store.undo.pop(); if (!previous) return false;
  store.draft = previous; store = prunePicnicAssets(store); void write().catch(() => {}); return true;
}
export async function usePicture(row, role = 'cloth') {
  issue = null;
  if (!['cloth', 'cafe-sign'].includes(role)) { issue = 'invalid-picture-role'; return false; }
  if (typeof row?.key !== 'string' || !row.key || !isLocalPNG(row.png)) { issue = 'invalid-picture'; return false; }
  if (row.png.length > PICNIC_MAX_CLOTH_CHARS) { issue = 'picture-size'; return false; }
  let asset = store.assets.find(a => a.sourceRef === row.key && a.png === row.png);
  if (!asset) {
    asset = { id: (role === 'cloth' ? 'cloth_' : 'cafe_sign_') + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6), sourceRef: row.key, png: row.png };
  }
  const opened = role === 'cafe-sign' ? applyPicnic(store.draft, { type: 'cafe-open' }) : store.draft;
  const next = applyPicnic(opened, { type: role, asset: asset.id });
  if (picnicSame(next, store.draft)) return true;
  const previous = store;
  const candidate = prunePicnicAssets({ ...store, assets: store.assets.some(a => a.id === asset.id) ? store.assets : [...store.assets, asset],
    draft: next, undo: [...store.undo, clonePicnic(store.draft)].slice(-24) });
  try { checkBytes(candidate); } catch (error) { issue = error.code; return false; }
  store = candidate;
  try { await write(); if (!db.status().persistent) issue = 'temporary'; return true; }
  catch (_) {
    // Only roll back this picture if no later child edit has taken ownership of it.
    if (store === candidate) store = previous;
    issue = 'write'; return false;
  }
}
export function useCloth(row) { return usePicture(row, 'cloth'); }
export async function useCafeMessage(raw, { accept = () => true } = {}) {
  issue = null;
  const message = normalizeCafeMessage(raw);
  if (!accept()) return false;
  if (message.png.length > PICNIC_MAX_CLOTH_CHARS) { issue = 'picture-size'; return false; }
  const previous = store;
  let assets = store.assets, asset;
  if (message.messageDay.use === 'cafe-sign') {
    asset = assets.find(row => row.sourceRef === message.sourceRef && row.png === message.png);
    if (!asset) {
      asset = { id: 'cafe_sign_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6), sourceRef: message.sourceRef, png: message.png };
      assets = [...assets, asset];
    }
  }
  const draft = applyPicnic(store.draft, { type: 'cafe-message', message, asset: asset?.id });
  if (picnicSame(draft, store.draft)) return true;
  const candidate = prunePicnicAssets({ ...store, assets, draft, undo: [...store.undo, clonePicnic(store.draft)].slice(-24) });
  try { checkBytes(candidate); } catch (error) { issue = error.code; return false; }
  if (!accept()) return false;
  store = candidate;
  try { await write(); if (!db.status().persistent) issue = 'temporary'; return true; }
  catch {
    if (store === candidate) store = previous;
    issue = 'write'; return false;
  }
}
export async function saveTable() {
  await load();
  const existing = store.saves.find(s => picnicSame(s.scene, store.draft));
  if (existing) { await write(); return { ...clonePicnic(existing), persistent: db.status().persistent }; }
  if (store.saves.length >= PICNIC_MAX_SAVES) throw problem('tables-full');
  const saved = { id: 'picnic_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6), at: Date.now(), scene: clonePicnic(store.draft) };
  const candidate = { ...store, saves: [saved, ...store.saves] }; checkBytes(candidate);
  store = candidate;
  try { await write(); return { ...saved, scene: clonePicnic(saved.scene), persistent: db.status().persistent }; }
  catch (error) { store.saves = store.saves.filter(s => s.id !== saved.id); issue = 'write'; throw error; }
}
export function reopen(id) {
  const saved = store.saves.find(s => s.id === id); if (!saved) return false;
  const candidate = prunePicnicAssets({ ...store, undo: [...store.undo, clonePicnic(store.draft)].slice(-24), draft: clonePicnic(saved.scene) });
  try { checkBytes(candidate); } catch (error) { issue = error.code; return false; }
  store = candidate; void write().catch(() => {}); return true;
}
export function flush() { return tail; }
export function retryPicnicWrites() { return write(); }
export function lastIssue() { return issue; }
export async function reset() { await tail.catch(() => {}); store = normalizePicnicStore(null); issue = null; loaded = true; await write(); }
export default { load, get, change, undo, usePicture, useCloth, useCafeMessage, saveTable, reopen, flush, retry: retryPicnicWrites, reset, lastIssue };
