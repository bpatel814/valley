import db from './db.js';
import { savedWorld } from './saved-world.js';
import { isCreationRow, isLocalPNG } from './creation-frame.js';
import { normalizeRiverRun, normalizeRiverScene, editRiverScene, riverDayReadiness, riverClone, riverError, riverId, riverSavedPage, RIVER_MAX_KEPT, RIVER_MAX_UNDO } from '../data/river-run.js';

export const RIVER_RUN_KEY = 'river-run:v1';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const makeId = prefix => `${prefix}_${Date.now().toString(36)}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2)}`;
export function createRiverRunStore({ database = db, child = savedWorld.id } = {}) {
  const owner = ['rayna', 'veer', 'shared'].includes(child) ? child : 'shared';
  let state = normalizeRiverRun(), loaded = false, loading = null, tail = Promise.resolve(), issue = null;
  function persist() {
    const snapshot = state, write = () => database.put('kv', RIVER_RUN_KEY, snapshot);
    tail = tail.then(write, write); const pending = tail;
    void pending.then(() => { issue = database.status().persistent ? null : 'river-temporary'; }, () => { issue = 'river-write'; }); return pending;
  }
  function accept(current, assets = state.assets, validate = false) {
    const candidate = { ...state, current: normalizeRiverScene(current), assets, undo: [...state.undo, state.current].slice(-RIVER_MAX_UNDO) };
    try { state = validate || current.riverDay || state.current.riverDay || current.pictureView || state.current.pictureView ? normalizeRiverRun(candidate) : candidate; issue = null; }
    catch (error) { issue = error.code || 'river-write'; return false; }
    void persist().catch(() => {}); return true;
  }
  async function load({ force = false } = {}) {
    if (loading) return loading; if (loaded && !force) return view();
    loaded = false;
    loading = (async () => {
      await tail;
      const raw = await (database.getStrict || database.get)('kv', RIVER_RUN_KEY);
      if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw Object.assign(new Error('This river could not be opened safely.'), {code:'river-invalid'});
      const incoming = normalizeRiverRun(raw || {});
      const countMatches = (original, normalized) => original == null || (Array.isArray(original) && original.length === normalized.length);
      const sceneMatches = (original, normalized) => !original || (typeof original === 'object' && !Array.isArray(original) &&
        (!original.instance || !!normalized?.instance && original.instance.id === normalized.instance.id && original.instance.asset === normalized.instance.asset));
      if (!countMatches(raw?.assets,incoming.assets) || !countMatches(raw?.kept,incoming.kept) || !countMatches(raw?.undo,incoming.undo) ||
          !sceneMatches(raw?.current,incoming.current) || (raw?.undo || []).some((row,index) => !sceneMatches(row,incoming.undo[index])) ||
          (raw?.kept || []).some((row,index) => !sceneMatches(row?.scene,incoming.kept[index]?.scene))) {
        throw Object.assign(new Error('Some saved river play needs a newer or repaired river. It was kept.'), {code:'river-invalid'});
      }
      state = incoming; loaded = true; return view();
    })();
    try { return await loading; } finally { loading = null; }
  }
  function view() { return { current: riverClone(state.current), undoCount: state.undo.length, keptCount: state.kept.length }; }
  function change(action) {
    if (action.type === 'picture-view' && (!state.current.instance || action.instanceId !== state.current.instance.id
      || action.assetId !== state.current.instance.asset || action.png !== png())) throw riverError('river-picture-view-stale');
    const next = editRiverScene(state.current, action); return same(next, state.current) ? false : accept(next);
  }
  function startDay(episode) {
    const ready = riverDayReadiness(state.current, episode);
    if (!ready.ready) { issue = ready.reason; return false; }
    return change({ type: 'river-day-start', episode });
  }
  function undo() { if (!state.undo.length) return false; state = { ...state, current: state.undo.at(-1), undo: state.undo.slice(0, -1) }; void persist().catch(() => {}); return true; }
  function select(png, sourceRef, toy = null) {
    if (!isLocalPNG(png)) { issue = 'river-picture-invalid'; return false; }
    let asset = state.assets.find(row => row.png === png && row.sourceRef === sourceRef);
    if (!asset) asset = { id: makeId('river-art'), sourceRef: riverId(sourceRef), png };
    const instance = { id: makeId('float'), asset: asset.id, toyRef: toy ? riverId(toy.toyRef || toy.id) : '', owner: toy?.owner || owner,
      pattern: toy?.pattern || [] };
    return accept(editRiverScene(state.current, { type: 'instance', instance }), state.assets.some(row => row.id === asset.id) ? state.assets : [...state.assets, asset], true);
  }
  function picture(row) { if (!isCreationRow(row)) { issue = 'river-picture-invalid'; return false; } return select(row.png, row.key); }
  function toy(row) {
    if (!row || !riverId(row.toyRef || row.id) || !['rayna', 'veer', 'shared'].includes(row.owner) || (owner !== 'shared' && row.owner !== owner && row.owner !== 'shared')) { issue = 'river-toy-invalid'; return false; }
    return select(row.png, row.toyRef || row.id, row);
  }
  function png(asset = state.current.instance?.asset) { return state.assets.find(row => row.id === asset)?.png || ''; }
  async function keep() {
    const scene = normalizeRiverScene(state.current);
    if (!scene.instance || !scene.attached) throw riverError(!scene.instance ? 'river-picture-needed' : 'river-float-needed');
    const sameContent = row => ({ ...row, instance: row.instance ? { ...row.instance, id: '' } : null });
    const existing = state.kept.find(row => row.owner === owner && same(sameContent(row.scene), sameContent(scene)));
    if (existing) { await persist(); return { id: existing.id, persistent: database.status().persistent }; }
    if (state.kept.length >= RIVER_MAX_KEPT) throw riverError('river-full');
    const row = { id: makeId('river-trip'), owner, at: Date.now(), scene }, before = state;
    const candidate = normalizeRiverRun({ ...state, kept: [...state.kept, row] }); state = candidate;
    try { await persist(); return { id: row.id, persistent: database.status().persistent }; }
    catch (error) { state = state === candidate ? before : { ...state, kept: state.kept.filter(item => item.id !== row.id) }; void persist().catch(() => {}); issue = 'river-write'; throw error; }
  }
  function reopen(id) { const row = state.kept.find(item => item.id === id && (item.owner === owner || item.owner === 'shared')); return row && !same(row.scene, state.current) ? accept(row.scene) : false; }
  return { load, view, change, startDay, undo, picture, toy, png, keep, reopen, page: page => riverSavedPage(state.kept, page, owner),
    get: () => riverClone(state), retry: persist, flush: () => tail, status: () => ({ issue, owner, ...database.status() }) };
}
const store = createRiverRunStore();
export const loadRiverRun = store.load;
export const riverRunView = store.view;
export const getRiverRun = store.get;
export const changeRiverRun = store.change;
export const startRiverDay = store.startDay;
export const undoRiverRun = store.undo;
export const useRiverPicture = store.picture;
export const useRiverToy = store.toy;
export const riverPicture = store.png;
export const keepRiverRun = store.keep;
export const reopenRiverRun = store.reopen;
export const riverRunPage = store.page;
export const flushRiverRun = store.flush;
export const retryRiverRunWrites = store.retry;
export const riverRunStatus = store.status;
