// Authored instrument order, with no rhythm judgement or drawing recognition.
import { isLocalPNG } from '../state/creation-frame.js';

export const MUSIC_BAND_VERSION = 1;
export const MUSIC_MAX_NOTES = 12;
export const MUSIC_MAX_KEPT = 1000;
export const MUSIC_MAX_BYTES = 64 * 1024 * 1024;
export const MUSIC_PAGE_SIZE = 6;
export const MUSIC_MAX_UNDO = 24;
export const MUSIC_INSTRUMENTS = Object.freeze([
  Object.freeze({ id: 'drum', label: 'Drum', color: '#eea584', art: 'music-band/drum-v1', frequency: 150 }),
  Object.freeze({ id: 'shaker', label: 'Shaker', color: '#a7cba4', art: 'music-band/shaker-v1', frequency: 740 }),
  Object.freeze({ id: 'bell', label: 'Bell', color: '#efd489', art: 'music-band/bell-v1', frequency: 587.33 }),
  Object.freeze({ id: 'wood', label: 'Wood blocks', color: '#bca6d7', art: 'music-band/wood-v1', frequency: 330 }),
  Object.freeze({ id: 'rest', label: 'Quiet beat', color: '#c2d9e3', art: '', frequency: 0 }),
]);
export const MUSIC_TEMPOS = Object.freeze({ slow: 900, walking: 600, quick: 360 });
export const MUSIC_INVITATIONS = Object.freeze([
  Object.freeze({ id: 'invent', label: 'Make a tune', hint: 'Tap an instrument. It joins your tune.' }),
  Object.freeze({ id: 'change', label: 'Change and try', hint: 'Tap a note, then an instrument to change its sound. Try a different pace.' }),
  Object.freeze({ id: 'together', label: 'Play together', hint: 'Mama can keep the pulse. Veer can echo your tune. You choose who joins.' }),
]);
export const musicClone = value => JSON.parse(JSON.stringify(value));
export const musicError = code => Object.assign(new Error(code), { code });
export const musicId = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(value) ? value : '';
const instrument = value => MUSIC_INSTRUMENTS.some(row => row.id === value);
const owner = value => ['rayna', 'veer', 'shared'].includes(value) ? value : 'shared';
const time = value => Number.isFinite(value) && value >= 0 && value <= 8640000000000000 ? Math.round(value) : 0;
function notes(raw) {
  const out = [], ids = new Set();
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!musicId(row?.id) || ids.has(row.id) || !instrument(row.instrument)) continue;
    ids.add(row.id); out.push({ id: row.id, instrument: row.instrument });
  }
  if (out.length > MUSIC_MAX_NOTES) throw musicError('music-notes-full');
  return out;
}
function score(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return { notes: notes(source.notes), tempo: Object.hasOwn(MUSIC_TEMPOS, source.tempo) ? source.tempo : 'walking',
    repeat: [1, 2, 3].includes(source.repeat) ? source.repeat : 1,
    mama: !!source.mama, veer: !!source.veer, sign: musicId(source.sign) };
}
export function newMusicDraft() {
  return { ...score(), invitation: 'invent', keptId: '', performed: null };
}
export function normalizeMusicDraft(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return { ...score(source), invitation: MUSIC_INVITATIONS.some(row => row.id === source.invitation) ? source.invitation : 'invent',
    keptId: musicId(source.keptId), performed: source.performed ? { ...score(source.performed), at: time(source.performed.at) } : null };
}
export function normalizeMusicBand(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  if (source.v != null && source.v !== MUSIC_BAND_VERSION) throw musicError('music-version');
  const assets = [], ids = new Set();
  for (const row of Array.isArray(source.assets) ? source.assets : []) {
    if (!musicId(row?.id) || ids.has(row.id) || !isLocalPNG(row.png)) continue;
    ids.add(row.id); assets.push({ id: row.id, png: row.png, sourceRef: musicId(row.sourceRef) });
  }
  if (assets.length > MUSIC_MAX_KEPT + MUSIC_MAX_UNDO + 2) throw musicError('music-capacity');
  const clean = value => {
    const draft = normalizeMusicDraft(value);
    if (!ids.has(draft.sign)) draft.sign = '';
    if (draft.performed && !ids.has(draft.performed.sign)) draft.performed.sign = '';
    return draft;
  };
  const kept = [], keptIds = new Set();
  for (const row of Array.isArray(source.kept) ? source.kept : []) {
    if (!musicId(row?.id) || keptIds.has(row.id)) continue;
    keptIds.add(row.id); kept.push({ ...clean(row), id: row.id, owner: owner(row.owner), at: time(row.at) });
  }
  if (kept.length > MUSIC_MAX_KEPT) throw musicError('music-shelf-full');
  const result = { v: MUSIC_BAND_VERSION, draft: clean(source.draft), undo: (Array.isArray(source.undo) ? source.undo : []).slice(-MUSIC_MAX_UNDO).map(clean), kept, assets };
  const used = new Set([result.draft, ...result.undo, ...kept].flatMap(row => [row.sign, row.performed?.sign]).filter(Boolean));
  result.assets = assets.filter(row => used.has(row.id));
  if (musicBandBytes(result) > MUSIC_MAX_BYTES) throw musicError('music-capacity');
  return result;
}
export function musicBandBytes(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
export function editMusicDraft(raw, action = {}) {
  const next = normalizeMusicDraft(raw);
  if (action.type === 'add' && instrument(action.instrument) && musicId(action.id) && !next.notes.some(row => row.id === action.id) && next.notes.length < MUSIC_MAX_NOTES) next.notes.push({ id: action.id, instrument: action.instrument });
  else if (action.type === 'duplicate' && musicId(action.newId) && !next.notes.some(row => row.id === action.newId) && next.notes.length < MUSIC_MAX_NOTES) {
    const index = next.notes.findIndex(row => row.id === action.id);
    if (index >= 0) next.notes.splice(index + 1, 0, { id: action.newId, instrument: next.notes[index].instrument });
  }
  else if (action.type === 'replace' && instrument(action.instrument)) next.notes = next.notes.map(row => row.id === action.id ? { ...row, instrument: action.instrument } : row);
  else if (action.type === 'move' && [-1, 1].includes(action.direction)) {
    const from = next.notes.findIndex(row => row.id === action.id), to = from + action.direction;
    if (from >= 0 && to >= 0 && to < next.notes.length) {
      const [note] = next.notes.splice(from, 1); next.notes.splice(to, 0, note);
    }
  }
  else if (action.type === 'reverse') next.notes.reverse();
  else if (action.type === 'remove') next.notes = next.notes.filter(row => row.id !== action.id);
  else if (action.type === 'tempo' && Object.hasOwn(MUSIC_TEMPOS, action.tempo)) next.tempo = action.tempo;
  else if (action.type === 'repeat' && [1, 2, 3].includes(action.repeat)) next.repeat = action.repeat;
  else if (action.type === 'mama' || action.type === 'veer') next[action.type] = !!action.join;
  else if (action.type === 'invitation' && MUSIC_INVITATIONS.some(row => row.id === action.invitation)) next.invitation = action.invitation;
  else if (action.type === 'fresh') return newMusicDraft();
  return next;
}
/** The child phrase is never altered by accompaniment. Veer gets a separate echo turn. */
export function musicPerformance(raw) {
  const draft = normalizeMusicDraft(raw), beats = [];
  for (let pass = 0; pass < draft.repeat; pass++) {
    draft.notes.forEach((note, index) => beats.push({ index, pass, role: 'child', instrument: note.instrument, noteId: note.id, pulse: draft.mama && note.instrument !== 'rest' }));
    if (draft.veer) draft.notes.forEach((note, index) => beats.push({ index, pass, role: 'veer', instrument: note.instrument, noteId: note.id, pulse: draft.mama && note.instrument !== 'rest' }));
  }
  return { beats, interval: MUSIC_TEMPOS[draft.tempo], duration: beats.length * MUSIC_TEMPOS[draft.tempo] };
}
export function musicShelfPage(kept, page = 0, child = 'shared') {
  const rows = kept.filter(row => row.owner === child || row.owner === 'shared');
  const pages = Math.max(1, Math.ceil(rows.length / MUSIC_PAGE_SIZE)), index = Math.max(0, Math.min(pages - 1, Math.floor(Number(page) || 0)));
  return { page: index, pages, items: rows.slice(index * MUSIC_PAGE_SIZE, (index + 1) * MUSIC_PAGE_SIZE) };
}
/** Explicit pictured color-to-instrument choice, not recognition or an inferred tune. */
export function musicNotesFromToy(pattern, makeId) {
  const mapping = { coral: 'drum', mint: 'shaker', lilac: 'wood', sunshine: 'bell' };
  return (Array.isArray(pattern) ? pattern : []).filter(color => Object.hasOwn(mapping, color)).slice(0, MUSIC_MAX_NOTES).map(color => ({ id: makeId(), instrument: mapping[color] }));
}
