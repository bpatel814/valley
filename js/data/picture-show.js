// A kept child's tune and exact picture, detached from the Music shelf.
import { MUSIC_INSTRUMENTS, MUSIC_TEMPOS, MUSIC_MAX_NOTES, musicId, musicPerformance } from './music-band.js';
import { isLocalPNG } from '../state/creation-frame.js';

export const PICTURE_SHOW_VERSION = 1;
export const PICTURE_SHOW_MAX_PNG_CHARS = 2_000_000;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const clone = value => JSON.parse(JSON.stringify(value));
function composition(raw) {
  if (!raw || raw.v !== 1) fail('picture-show-version');
  if (!musicId(raw.tuneId) || !['rayna', 'veer', 'shared'].includes(raw.owner)) fail('picture-show-owner');
  if (!Array.isArray(raw.notes) || !raw.notes.length || raw.notes.length > MUSIC_MAX_NOTES) fail('picture-show-notes');
  const ids = new Set();
  const notes = raw.notes.map(note => {
    if (!musicId(note?.id) || ids.has(note.id) || !MUSIC_INSTRUMENTS.some(row => row.id === note.instrument)) fail('picture-show-notes');
    ids.add(note.id); return { id: note.id, instrument: note.instrument };
  });
  if (!Object.hasOwn(MUSIC_TEMPOS, raw.tempo) || ![1, 2, 3].includes(raw.repeat)) fail('picture-show-pace');
  return { v: 1, tuneId: raw.tuneId, owner: raw.owner, notes, tempo: raw.tempo, repeat: raw.repeat, mama: raw.mama === true, veer: raw.veer === true };
}
export function normalizePictureShowSource(raw) {
  const score = composition(raw);
  if (!isLocalPNG(raw.sign?.png) || raw.sign.png.length > PICTURE_SHOW_MAX_PNG_CHARS) fail('picture-show-picture');
  return { ...score, sign: { png: raw.sign.png, sourceRef: musicId(raw.sign.sourceRef), aspect: Number.isFinite(raw.sign.aspect) && raw.sign.aspect >= .2 && raw.sign.aspect <= 5 ? raw.sign.aspect : 1 } };
}
export function detachKeptMusicShow(tune, sign) {
  return normalizePictureShowSource({ ...clone(tune), v: 1, tuneId: tune.id, sign: { png: sign?.png, sourceRef: sign?.sourceRef || tune.sign, aspect: sign?.aspect } });
}
/** Scene/history snapshots reference the scene's owned asset pool, never a shelf. */
export function normalizePictureShowSnapshot(raw, assetIds) {
  if (raw == null) return null;
  const score = composition(raw);
  if (!musicId(raw.signAssetId) || (assetIds && !assetIds.has(raw.signAssetId)) || !musicId(raw.propId)) fail('picture-show-missing-picture');
  const performed = raw.performed && Number.isSafeInteger(raw.performed.at) && raw.performed.at > 0 && raw.performed.at <= 8640000000000000
    ? { at: raw.performed.at, performerActorId: musicId(raw.performed.performerActorId) } : null;
  return { ...score, signAssetId: raw.signAssetId, propId: raw.propId, performed };
}
export function pictureShowPlan(snapshot) { return musicPerformance(normalizePictureShowSnapshot(snapshot)); }
export function pictureShowEquivalent(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
