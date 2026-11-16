import { isLocalPNG } from '../state/creation-frame.js';
import { normalizeWaterGarden, waterFriendOutcome } from './water-garden.js';
import { catCornerDayFields, applyCatCornerDay, reconcileCatCornerDay, catCornerDayInvitation, CAT_CORNER_DAY_GEOMETRY } from './cat-corner-day.js';
export { catCornerDayOutcome, catCornerDayInvitation } from './cat-corner-day.js';

export const ANIMAL_FRIENDS_VERSION = 1;
export const ANIMAL_MAX_KEEPS = 1000;
export const ANIMAL_MAX_UNDO = 24;
export const ANIMAL_MAX_BYTES = 64 * 1024 * 1024;
export const ANIMAL_PAGE_SIZE = 8;
export const ANIMAL_INVITATIONS = Object.freeze(['seek', 'corner', 'visit']);
export const ANIMAL_PLACES = Object.freeze(['leaf', 'basket', 'shelter']);
export const ANIMAL_RELATIONS = Object.freeze({ leaf: 'behind the leaves', basket: 'inside the basket', shelter: 'under the blanket shelter' });
// The generated cushion's measured x230..1300 is 28 table units wide.
export const ANIMAL_BED_WIDTH = CAT_CORNER_DAY_GEOMETRY.bedWidth;
export const ANIMAL_CUSHION_WIDTH = 28;
export const ANIMAL_REST_WIDTH = 22;
const clone = value => JSON.parse(JSON.stringify(value));
const id = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(value) ? value : '';
const coordinate = (value, fallback, lo, hi) => Number.isFinite(Number(value)) ? Math.round(Math.max(lo, Math.min(hi, Number(value))) * 10) / 10 : fallback;
const owner = value => ['rayna', 'veer'].includes(value) ? value : 'shared';
export const animalError = code => Object.assign(new Error(code), { code });
export function normalizeCatGardenDraft(raw = {}) {
  const normalize = garden => {
    if (garden?.v != null && garden.v !== 1) throw animalError('animal-outing-version');
    if ((garden?.paths?.length || 0) > 60 || (garden?.paths || []).some(path => path.length > 800) || (garden?.decorations?.length || 0) > 24) throw animalError('animal-capacity');
    return normalizeWaterGarden(garden, 'shade');
  };
  if ((raw.history?.length || 0) > 40) throw animalError('animal-capacity');
  return { garden: normalize(raw.garden), history: (Array.isArray(raw.history) ? raw.history : []).map(normalize) };
}
export function normalizeCatGardenEnding(raw) {
  if (!raw) return null;
  if (raw.v !== 1) throw animalError('animal-outing-version');
  if (!id(raw.id)) throw animalError('animal-outing-invalid');
  const draft = normalizeCatGardenDraft(raw.draft);
  return { v: 1, id: raw.id, draft, rested: waterFriendOutcome(draft.garden).resting };
}
export function normalizeCatOuting(raw) {
  if (!raw) return null;
  if (raw.v !== 1) throw animalError('animal-outing-version');
  if (!id(raw.id) || !raw.origin) throw animalError('animal-outing-invalid');
  return { v: 1, id: raw.id, origin: normalizeAnimalCorner(raw.origin), draft: normalizeCatGardenDraft(raw.draft) };
}
export function newAnimalCorner() {
  return { invitation: 'seek', phase: 'search', round: 0,
    places: [{ id: 'leaf', x: 24, y: 54, open: false }, { id: 'basket', x: 76, y: 54, open: false }, { id: 'shelter', x: 50, y: 38, open: false }],
    bed: { x: 50, y: 79, pillow: -5 }, cat: { place: 'leaf', x: 24, y: 54, pose: 'sit' }, picture: null, reaction: '' };
}
export function normalizeAnimalPicture(raw) {
  if (!raw || !isLocalPNG(raw.png) || !id(raw.sourceRef)) return null;
  return { sourceRef: id(raw.sourceRef), png: raw.png, x: coordinate(raw.x, 70, 16, 84), y: coordinate(raw.y, 70, 35, 78) };
}
export function normalizeAnimalCorner(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}, result = newAnimalCorner();
  Object.assign(result, catCornerDayFields(source));
  result.invitation = ANIMAL_INVITATIONS.includes(source.invitation) ? source.invitation : 'seek';
  result.phase = ['search', 'choose-hide', 'partner-search', 'revealed'].includes(source.phase) ? source.phase : 'search';
  result.round = Math.max(0, Math.min(2, Math.floor(Number(source.round) || 0)));
  result.places = result.places.map(place => { const candidate = (Array.isArray(source.places) ? source.places : []).find(row => row?.id === place.id); return { id: place.id, x: coordinate(candidate?.x, place.x, 18, 82), y: coordinate(candidate?.y, place.y, place.id === 'shelter' ? 38 : 45, 66), open: !!candidate?.open }; });
  result.bed = { x: coordinate(source.bed?.x, 50, 22, 78), y: coordinate(source.bed?.y, 79, 60, 84), pillow: coordinate(source.bed?.pillow, -5, -6, 6) };
  result.picture = normalizeAnimalPicture(source.picture);
  const place = [...ANIMAL_PLACES, 'floor', 'bed', 'picture'].includes(source.cat?.place) ? source.cat.place : 'leaf';
  result.cat = { place: place === 'picture' && !result.picture ? 'floor' : place,
    x: coordinate(source.cat?.x, 24, 16, 84), y: coordinate(source.cat?.y, 54, 34, 84), pose: ['sit', 'rest', 'play'].includes(source.cat?.pose) ? source.cat.pose : 'sit' };
  result.reaction = ['found', 'ready', 'rest', 'space', 'hello', 'picture'].includes(source.reaction) ? source.reaction : '';
  if (source.gardenVisit) result.gardenVisit = normalizeCatGardenEnding(source.gardenVisit);
  if (result.cat.place === 'bed' && cozyCornerOutcome(result).blocked.length) { result.cat.place = 'floor'; result.cat.pose = 'sit'; }
  return result;
}
export function cozyCornerOutcome(corner) {
  const bed = corner.bed, blocked = corner.places.filter(place => Math.abs(place.x - bed.x) < (ANIMAL_BED_WIDTH + (place.id === 'shelter' ? 30 : 26)) / 2 - 2 && Math.abs(place.y - bed.y) < 13).map(place => place.id);
  const dx = bed.pillow < 0 ? 3 : -3;
  return { blocked, resting: !blocked.length, x: bed.x + dx, y: bed.y - 2,
    catLeft: bed.x + dx - ANIMAL_REST_WIDTH / 2, catRight: bed.x + dx + ANIMAL_REST_WIDTH / 2,
    cushionLeft: bed.x - ANIMAL_CUSHION_WIDTH / 2, cushionRight: bed.x + ANIMAL_CUSHION_WIDTH / 2 };
}
export function animalCatPosition(corner) {
  if (ANIMAL_PLACES.includes(corner.cat.place)) { const place = corner.places.find(row => row.id === corner.cat.place); return { x: place.x, y: place.y, hidden: !place.open, pose: corner.cat.place === 'shelter' ? 'rest' : corner.cat.pose }; }
  if (corner.cat.place === 'bed') { const fit = cozyCornerOutcome(corner); return { x: fit.x, y: fit.y, hidden: false, pose: 'rest' }; }
  if (corner.cat.place === 'picture' && corner.picture) return { x: Math.max(16, corner.picture.x - 13), y: Math.min(84, corner.picture.y + 8), hidden: false, pose: 'play' };
  return { x: corner.cat.x, y: corner.cat.y, hidden: false, pose: corner.cat.pose };
}
export function editAnimalCorner(raw, action = {}) {
  const corner = normalizeAnimalCorner(raw);
  if (typeof action.type === 'string' && action.type.startsWith('cat-day-')) return normalizeAnimalCorner(applyCatCornerDay(corner, action));
  if (action.type === 'invitation' && ANIMAL_INVITATIONS.includes(action.invitation)) {
    corner.invitation = action.invitation; corner.reaction = '';
    if (action.invitation === 'seek') { corner.phase = 'search'; corner.places.forEach(place => { place.open = false; }); corner.cat.place = ANIMAL_PLACES[corner.round]; corner.cat.pose = 'sit'; }
    else { corner.places.forEach(place => { place.open = true; }); corner.cat = { place: 'floor', x: 20, y: 78, pose: 'sit' }; }
  } else if (action.type === 'open' && ANIMAL_PLACES.includes(action.place)) {
    const place = corner.places.find(row => row.id === action.place); place.open = !place.open;
    if (corner.invitation === 'seek' && corner.phase === 'choose-hide') { corner.cat.place = place.id; corner.cat.pose = 'sit'; place.open = true; corner.reaction = ''; }
    else if (place.open && corner.cat.place === place.id) { corner.phase = 'revealed'; corner.reaction = 'found'; }
    else corner.reaction = '';
  } else if (action.type === 'hide-turn') { corner.invitation = 'seek'; corner.phase = 'choose-hide'; corner.places.forEach(place => { place.open = true; }); corner.reaction = ''; }
  else if (action.type === 'ready' && corner.phase === 'choose-hide' && ANIMAL_PLACES.includes(corner.cat.place)) { corner.phase = 'partner-search'; corner.places.forEach(place => { place.open = false; }); corner.reaction = 'ready'; }
  else if (action.type === 'new-search') { corner.round = (corner.round + 1) % 3; return editAnimalCorner(corner, { type: 'invitation', invitation: 'seek' }); }
  else if (action.type === 'place-move' && ANIMAL_PLACES.includes(action.place)) { const place = corner.places.find(row => row.id === action.place); place.x = coordinate(action.x, place.x, 18, 82); place.y = coordinate(action.y, place.y, place.id === 'shelter' ? 38 : 45, 66); corner.reaction = ''; }
  else if (action.type === 'bed-move') { corner.bed.x = coordinate(action.x, corner.bed.x, 22, 78); corner.bed.y = coordinate(action.y, corner.bed.y, 60, 84); corner.reaction = ''; }
  else if (action.type === 'pillow') { corner.bed.pillow = coordinate(action.x, corner.bed.pillow, -6, 6); corner.reaction = ''; }
  else if (action.type === 'picture') { const picture = normalizeAnimalPicture(action.picture); if (picture) corner.picture = picture; }
  else if (action.type === 'picture-move' && corner.picture) { corner.picture.x = coordinate(action.x, corner.picture.x, 16, 84); corner.picture.y = coordinate(action.y, corner.picture.y, 35, 78); }
  else if (action.type === 'rest') { const fit = cozyCornerOutcome(corner); corner.cat = fit.resting ? { place: 'bed', x: fit.x, y: fit.y, pose: 'rest' } : { place: 'floor', x: Math.max(16, corner.bed.x - 22), y: corner.bed.y, pose: 'sit' }; corner.reaction = fit.resting ? 'rest' : 'space'; }
  else if (action.type === 'pet' && !animalCatPosition(corner).hidden) { corner.cat.pose = corner.cat.place === 'bed' ? 'rest' : 'play'; corner.reaction = 'hello'; }
  else if (action.type === 'follow-picture' && corner.picture) { corner.cat.place = 'picture'; corner.cat.pose = 'play'; corner.reaction = 'picture'; }
  else if (action.type === 'return') { corner.cat = { place: 'floor', x: 20, y: 78, pose: 'sit' }; corner.reaction = ''; }
  if (corner.catDay && ['invitation', 'hide-turn', 'ready', 'pet', 'follow-picture', 'return'].includes(action.type)) { corner.catDay.episode = 'free'; corner.catDay.restTarget = null; corner.catDay.outcome = 'free'; }
  return normalizeAnimalCorner(reconcileCatCornerDay(corner));
}
export function animalInvitationText(corner) {
  if (corner.catDay) return catCornerDayInvitation(corner);
  if (corner.reaction === 'space') return 'The cat can sit here. Move the bed or nearby things to make more room.';
  if (corner.reaction === 'rest') return 'Your cat curls up on the cushion. You can rearrange this cozy corner.';
  if (corner.reaction === 'hello') return 'A gentle hello! The cat likes playing with you.';
  if (corner.reaction === 'picture') return 'Your cat came to your own picture. Move it to make another little visit.';
  if (corner.invitation === 'seek') {
    if (corner.phase === 'choose-hide') return 'Choose where the cat will hide. Then close the places for your friend to look.';
    if (corner.phase === 'partner-search') return 'Your friend can open the places to find the cat. There is no hurry.';
    if (corner.phase === 'revealed') return `You found the cat ${ANIMAL_RELATIONS[corner.cat.place] || 'here'}! You can hide it for someone else.`;
    return `The cat is ${ANIMAL_RELATIONS[corner.cat.place]}. Open a place and look.`;
  }
  return corner.invitation === 'corner' ? 'Move the bed, pillow or nearby things. Let the cat try your cozy corner.' : 'Say hello to the cat. Invite it to your picture or let it rest, then return to play.';
}
export function normalizeAnimalFriends(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  if (source.v != null && source.v !== ANIMAL_FRIENDS_VERSION) throw animalError('animal-version');
  // Present typed stories refuse even in old invalid rows or Undo frames that
  // the legacy envelope would otherwise omit. Validate before any filtering.
  for (const corner of [source.current, ...(Array.isArray(source.undo) ? source.undo : []), ...(Array.isArray(source.saved) ? source.saved.map(row => row?.corner) : []), source.outing?.origin]) catCornerDayFields(corner);
  const saved = [], ids = new Set();
  for (const row of Array.isArray(source.saved) ? source.saved : []) {
    if (!id(row?.id) || ids.has(row.id) || !row.corner || !Number.isFinite(row.at) || row.at < 0 || row.at > 8640000000000000) continue;
    ids.add(row.id); saved.push({ id: row.id, at: Math.round(row.at), owner: owner(row.owner), corner: normalizeAnimalCorner(row.corner) });
  }
  if (saved.length > ANIMAL_MAX_KEEPS) throw animalError('animal-full');
  const result = { v: 1, current: normalizeAnimalCorner(source.current), undo: (Array.isArray(source.undo) ? source.undo : []).slice(-ANIMAL_MAX_UNDO).map(normalizeAnimalCorner), saved, outing: normalizeCatOuting(source.outing) };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > ANIMAL_MAX_BYTES) throw animalError('animal-capacity');
  return result;
}
export function animalSavedPage(saved, page = 0, child = null) {
  const rows = child ? saved.filter(row => row.owner === child || row.owner === 'shared') : saved, pages = Math.max(1, Math.ceil(rows.length / ANIMAL_PAGE_SIZE));
  const index = Math.max(0, Math.min(pages - 1, Math.floor(Number(page) || 0))); return { page: index, pages, items: clone(rows.slice(index * ANIMAL_PAGE_SIZE, (index + 1) * ANIMAL_PAGE_SIZE)) };
}
export { clone as cloneAnimalFriends };
