import db from './db.js';
import { isCreationRow, isLocalPNG } from './creation-frame.js';
import { savedWorld } from './saved-world.js';
import { normalizeMusicBand, normalizeMusicDraft, editMusicDraft, musicClone, musicError,
  musicNotesFromToy, musicId, MUSIC_MAX_UNDO, MUSIC_MAX_KEPT } from '../data/music-band.js';

export const MUSIC_BAND_KEY = 'music-band:v1';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const makeId = prefix => `${prefix}_${Date.now().toString(36)}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2)}`;

// Rows, libraries and queued snapshots are replaced, never mutated. A note tap
// clones only the bounded draft. Library-wide validation occurs on load/import/keep.
export function createMusicBandStore({ database = db, child = savedWorld.id } = {}) {
  let state = normalizeMusicBand(), loaded = false, loading = null, tail = Promise.resolve(), issue = null;
  const explicitOwner = ['rayna', 'veer', 'shared'].includes(child) ? child : 'shared';
  function persist() {
    const snapshot = state;
    const write = () => database.put('kv', MUSIC_BAND_KEY, snapshot);
    tail = tail.then(write, write);
    const next = tail;
    void next.then(() => { issue = database.status().persistent ? null : 'music-temporary'; }, () => { issue = 'music-write'; });
    return next;
  }
  function accept(draft, assets = state.assets, validate = false) {
    const candidate = { ...state, draft: normalizeMusicDraft(draft), assets, undo: [...state.undo, state.draft].slice(-MUSIC_MAX_UNDO) };
    try { state = validate ? normalizeMusicBand(candidate) : candidate; }
    catch (error) { issue = error.code || 'music-write'; return false; }
    void persist().catch(() => {}); return true;
  }
  async function load({ force = false } = {}) {
    if (loading) return loading;
    if (loaded && !force) return get();
    loaded = false;
    loading = (async () => {
      await tail;
      const raw = await (database.getStrict || database.get)('kv', MUSIC_BAND_KEY);
      if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw Object.assign(new Error('This tune could not be opened safely.'), {code:'music-invalid'});
      const incoming = normalizeMusicBand(raw || {});
      const countMatches = (original, normalized) => original == null || (Array.isArray(original) && original.length === normalized.length);
      const signMatches = (original, normalized) => original?.sign == null || original.sign === normalized.sign;
      const scoreMatches = (original, normalized) => !original || typeof original === 'object' && !Array.isArray(original) &&
        countMatches(original.notes, normalized.notes) && signMatches(original, normalized) &&
        (!original.performed || !!normalized.performed && countMatches(original.performed.notes, normalized.performed.notes) && signMatches(original.performed, normalized.performed));
      if (!countMatches(raw?.kept, incoming.kept) || !countMatches(raw?.assets, incoming.assets) ||
          !countMatches(raw?.undo, incoming.undo) || !scoreMatches(raw?.draft, incoming.draft) ||
          (raw?.kept || []).some((row, index) => !scoreMatches(row, incoming.kept[index])) ||
          (raw?.undo || []).some((row, index) => !scoreMatches(row, incoming.undo[index]))) {
        throw Object.assign(new Error('Some saved music needs a newer or repaired player. It was kept.'), {code:'music-invalid'});
      }
      state = incoming; loaded = true;
      return get();
    })();
    try { return await loading; } finally { loading = null; }
  }
  function get() { return musicClone(state); }
  function draft() { return musicClone(state.draft); }
  function change(action) {
    const next = editMusicDraft(state.draft, action.type === 'add' ? { ...action, id: makeId('note') } : action.type === 'duplicate' ? { ...action, newId: makeId('note') } : action);
    if (same(next, state.draft)) return false;
    return accept(next);
  }
  function undo() {
    if (!state.undo.length) return false;
    state = { ...state, draft: state.undo.at(-1), undo: state.undo.slice(0, -1) };
    void persist().catch(() => {}); return true;
  }
  function picture(row) {
    if (!isCreationRow(row)) { issue = 'music-picture-invalid'; return false; }
    return attach(row.png, row.key);
  }
  function attach(png, sourceRef, next = state.draft) {
    if (!isLocalPNG(png)) { issue = 'music-picture-invalid'; return false; }
    let asset = state.assets.find(row => row.png === png && row.sourceRef === sourceRef);
    if (!asset) asset = { id: makeId('band-sign'), png, sourceRef: musicId(sourceRef) };
    const draft = { ...next, sign: asset.id };
    if (same(draft, state.draft)) return false;
    return accept(draft, state.assets.some(row => row.id === asset.id) ? state.assets : [...state.assets, asset], true);
  }
  function toy(snapshot) {
    if (!snapshot || !isLocalPNG(snapshot.png) || !musicId(snapshot.toyRef || snapshot.id) || !['rayna', 'veer', 'shared'].includes(snapshot.owner) || (explicitOwner !== 'shared' && snapshot.owner !== explicitOwner && snapshot.owner !== 'shared')) { issue = 'music-toy-invalid'; return false; }
    const notes = musicNotesFromToy(snapshot.pattern, () => makeId('note'));
    // An empty decoration remains an exact band sign; it does not erase a tune.
    return attach(snapshot.png, snapshot.toyRef || snapshot.id, { ...state.draft, ...(notes.length ? { notes } : {}) });
  }
  function performed(score) {
    const result = { ...normalizeMusicDraft(score), at: Date.now() };
    // Ignore a completion belonging to a composition changed during playback.
    const fields = row => ({ notes: row.notes, tempo: row.tempo, repeat: row.repeat, mama: row.mama, veer: row.veer, sign: row.sign });
    if (!same(fields(result), fields(state.draft))) return false;
    // Playback is an observation, not an authored tune change. Keep it durable
    // without filling Undo with listens or hiding the child's last edit.
    state = { ...state, draft: normalizeMusicDraft({ ...state.draft, performed: result }) };
    void persist().catch(() => {}); return true;
  }
  async function keep() {
    const draft = normalizeMusicDraft(state.draft);
    if (!draft.notes.length) throw musicError('music-notes-needed');
    const content = row => ({ notes: row.notes.map(note => note.instrument), tempo: row.tempo, repeat: row.repeat, mama: row.mama, veer: row.veer, sign: row.sign });
    const existing = state.kept.find(row => row.owner === explicitOwner && same(content(row), content(draft)));
    if (existing) { await persist(); return { ...musicClone(existing), persistent: database.status().persistent }; }
    if (state.kept.length >= MUSIC_MAX_KEPT) throw musicError('music-shelf-full');
    const row = { ...draft, id: makeId('tune'), owner: explicitOwner, at: Date.now() }, before = state;
    const candidate = normalizeMusicBand({ ...state, draft: { ...draft, keptId: row.id }, kept: [...state.kept, row] });
    state = candidate;
    try { await persist(); return { ...musicClone(row), persistent: database.status().persistent }; }
    catch (error) {
      if (state === candidate) state = before;
      else state = { ...state, kept: state.kept.filter(item => item.id !== row.id), draft: state.draft.keptId === row.id ? { ...state.draft, keptId: '' } : state.draft,
        undo: state.undo.map(item => item.keptId === row.id ? { ...item, keptId: '' } : item) };
      // Correct later queued snapshots, without discarding the child's later notes.
      void persist().catch(() => {}); issue = 'music-write'; throw error;
    }
  }
  function reopen(id) {
    const row = state.kept.find(item => item.id === id && (item.owner === explicitOwner || item.owner === 'shared'));
    if (!row) return false;
    const next = normalizeMusicDraft({ ...row, keptId: row.id });
    return same(next, state.draft) ? false : accept(next);
  }
  function sign(id = state.draft.sign) { return state.assets.find(row => row.id === id)?.png || ''; }
  return { load, get, draft, change, undo, picture, toy, performed, keep, reopen, sign,
    retry: persist, flush: () => tail, status: () => ({ issue, owner: explicitOwner, canUndo: !!state.undo.length, ...database.status() }) };
}
const store = createMusicBandStore();
export const loadMusicBand = store.load;
export const getMusicBand = store.get;
export const getMusicDraft = store.draft;
export const changeMusicDraft = store.change;
export const undoMusicBand = store.undo;
export const useMusicPicture = store.picture;
export const useMusicToy = store.toy;
export const finishMusicPerformance = store.performed;
export const keepMusicBand = store.keep;
export const reopenMusicBand = store.reopen;
export const musicSign = store.sign;
export const flushMusicBand = store.flush;
export const retryMusicBandWrites = store.retry;
export const musicBandStatus = store.status;
