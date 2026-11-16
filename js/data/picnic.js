// Tangible food ownership: each half is unique and retains its original fruit.
import { normalizePostPaper, validPostPNG } from './picture-post.js';
import { MESSAGE_DAY_GUESTS, messageDayFields, messageDayError } from './message-day.js';
import { normalizeToyOuting, TOY_OUTING_PLACES } from './toy-outing.js';
import { normalizeGardenCafe, applyGardenCafe } from './garden-cafe.js';
export const PICNIC_FRUITS = ['apple', 'strawberry'];
export const PICNIC_GUESTS = ['rayna', 'veer', 'ishan', 'mama', 'daddy', 'ba', 'dada', 'pip'];
export const PICNIC_SCENARIOS = ['invite', 'mix', 'free'];
const PLACES = ['board', 'bowl', 'left', 'right', 'visitor'];
export const PICNIC_MAX_PIECES = 24;
export const PICNIC_CAPACITY = Object.freeze({ board: 24, bowl: 8, left: 6, right: 6, visitor: 6 });
const copy = value => JSON.parse(JSON.stringify(value));
const cleanId = value => String(value || '').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 180);

export function newPicnic(scenario = 'invite', batch = 1) {
  return {
    scenario: PICNIC_SCENARIOS.includes(scenario) ? scenario : 'invite',
    guests: ['veer', 'ishan'], batch, cloth: '', mixed: false, invitation: null,
    pieces: Array.from({ length: 6 }, (_, i) => ({
      id: `fruit_${batch}_${i}`, origin: `fruit_${batch}_${i}`, kind: PICNIC_FRUITS[i % 2],
      units: 2, place: 'board', eaten: false, salad: false,
    })),
  };
}

export function normalizePicnicInvitation(raw) {
  const day = messageDayFields(raw);
  if (!raw || raw.kind !== 'picture-post' || !validPostPNG(raw.png) || !PICNIC_GUESTS.includes(raw.recipient)) return null;
  return { kind: 'picture-post', png: raw.png, document: normalizePostPaper(raw.document), recipient: raw.recipient,
    situation: ['picnic', 'home-picture', 'free'].includes(raw.situation) ? raw.situation : 'picnic', sourceRef: cleanId(raw.sourceRef || raw.key || raw.id), ...day };
}

export function normalizeCafeMessage(raw) {
  const message = normalizePicnicInvitation(raw);
  if (!message?.messageDay || !MESSAGE_DAY_GUESTS.includes(raw.recipient) || !['cafe-sign', 'cafe-invite'].includes(message.messageDay.use) || !message.sourceRef) throw messageDayError();
  return message;
}

export function normalizePicnic(raw) {
  const fresh = newPicnic(raw?.scenario);
  if (!raw || typeof raw !== 'object') return fresh;
  const cafe = raw.cafe != null ? normalizeGardenCafe(raw.cafe) : null;
  const seen = new Set();
  const originAmounts = new Map();
  const originKinds = new Map();
  const pieces = (Array.isArray(raw.pieces) ? raw.pieces : []).flatMap(p => {
    // A meal reaction belongs to the actual taster, never the next person at
    // that seat. Older portions keep no actor field: their eater is unknown.
    const knownEater = p != null && Object.hasOwn(p, 'enjoyedBy');
    if (knownEater && (p.eaten !== true || !PICNIC_GUESTS.includes(p.enjoyedBy)))
      throw Object.assign(new Error('picnic-enjoyed-by'), { code: 'picnic-enjoyed-by' });
    const id = cleanId(p?.id), origin = cleanId(p?.origin);
    if (!id || !origin || seen.has(id) || !PICNIC_FRUITS.includes(p.kind)) return [];
    const units = p.units === 1 ? 1 : 2;
    const prior = originAmounts.get(origin) || 0;
    if (prior + units > 2 || (originKinds.has(origin) && originKinds.get(origin) !== p.kind)) return [];
    originAmounts.set(origin, prior + units);
    originKinds.set(origin, p.kind);
    seen.add(id);
    return [{ id, origin, kind: p.kind, units,
      place: PLACES.includes(p.place) && (p.place !== 'visitor' || cafe?.visitor) ? p.place : 'board', eaten: !!p.eaten,
      salad: p.salad === true || (p.salad == null && raw.mixed === true && p.place === 'bowl' && !p.eaten),
      ...(knownEater ? { enjoyedBy: p.enjoyedBy } : {}) }];
  });
  if (pieces.length > PICNIC_MAX_PIECES) throw Object.assign(new Error('picnic-pieces-full'), { code: 'picnic-pieces-full' });
  return {
    scenario: PICNIC_SCENARIOS.includes(raw.scenario) ? raw.scenario : 'invite',
    guests: [0, 1].map(i => PICNIC_GUESTS.includes(raw.guests?.[i]) ? raw.guests[i] : fresh.guests[i]),
    batch: Math.max(1, Math.min(100000, Math.floor(Number(raw.batch) || 1))),
    cloth: cleanId(raw.cloth), mixed: !!raw.mixed, pieces, invitation: normalizePicnicInvitation(raw.invitation),
    ...(raw.outing != null ? { outing: normalizeToyOuting(raw.outing) } : {}),
    ...(cafe ? { cafe } : {}),
  };
}

export function picnicUnits(scene, place, includeEaten = true) {
  return scene.pieces.filter(p => (!place || p.place === place) && (includeEaten || !p.eaten))
    .reduce((sum, p) => sum + p.units, 0);
}

export function picnicOutcome(scene) {
  const left = picnicUnits(scene, 'left'), right = picnicUnits(scene, 'right');
  return { left, right, bothServed: left > 0 && right > 0, equal: left > 0 && left === right,
    mixed: scene.mixed && scene.pieces.some(p => p.place === 'bowl' && !p.eaten),
    enjoying: scene.pieces.some(p => p.eaten) };
}

export function picnicLivePieces(scene, place) { return scene.pieces.filter(p => !p.eaten && (!place || p.place === place)); }
export function picnicEnjoyedPieces(scene, place, guest) { return scene.pieces.filter(p => p.eaten && p.place === place && p.enjoyedBy === guest); }
export function picnicCutIds(scene, id) {
  const existing = new Set(scene.pieces.map(p => p.id));
  return ['a', 'b'].map(suffix => { const base = `${String(id).slice(0, 150)}_${suffix}`; let value = base, count = 0; while (existing.has(value)) value = `${base}_${++count}`; existing.add(value); return value; });
}
export function picnicCanFit(scene, place, incoming = []) {
  if (!PLACES.includes(place) || (place === 'visitor' && !scene.cafe?.visitor)) return false;
  const incomingIds = new Set(incoming.map(p => p.id));
  return picnicLivePieces(scene, place).filter(p => !incomingIds.has(p.id)).length + incoming.length <= PICNIC_CAPACITY[place];
}
function picnicCutFits(scene, piece) {
  // One whole becomes two halves. Count the extra slot directly so an existing
  // imported half ID cannot accidentally remove a neighbor from this count.
  return scene.pieces.length < PICNIC_MAX_PIECES && (piece.place !== 'visitor' || !!scene.cafe?.visitor) &&
    picnicLivePieces(scene, piece.place).length < PICNIC_CAPACITY[piece.place];
}
export function picnicActionNotice(scene, action = {}) {
  const piece = scene.pieces.find(p => p.id === action.id && !p.eaten);
  if (['move', 'serve-bowl', 'enjoy'].includes(action.type) && action.place === 'visitor' && !scene.cafe?.visitor) return 'Choose a visitor before sharing food at this place.';
  if (action.type === 'move' && piece && !picnicCanFit(scene, action.place, [piece])) return action.place === 'bowl' ? 'The bowl is full. Serve some fruit, or put a piece back on the cloth.' : 'This plate is full. Try the other plate, or let your friend enjoy a piece.';
  if (action.type === 'serve-bowl' && !picnicCanFit(scene, action.place, picnicLivePieces(scene, 'bowl'))) return 'All these ingredients need more room. Give a few pieces separately, or let your friend enjoy some first.';
  if (action.type === 'cut' && piece?.units === 2 && !picnicCutFits(scene, piece)) return 'These two halves need room. Put the whole fruit on the cloth before cutting.';
  if (action.type === 'more' && picnicLivePieces(scene).length + 6 > PICNIC_MAX_PIECES) return 'There is plenty of fruit here. Share or enjoy some before bringing more.';
  return '';
}

export function applyPicnic(scene, action) {
  const next = normalizePicnic(scene);
  const piece = next.pieces.find(p => p.id === action?.id);
  switch (action?.type) {
    case 'outing': {
      const outing = normalizeToyOuting(action.outing);
      if (!outing) break;
      next.outing = outing;
      if (action.withMama === true && outing.river.mama === true) next.guests[0] = 'mama';
      break;
    }
    case 'outing-place':
      if (next.outing && TOY_OUTING_PLACES.includes(action.placement)) next.outing.placement = action.placement;
      break;
    case 'outing-remove': delete next.outing; break;
    case 'move':
      if (piece && !piece.eaten && PLACES.includes(action.place) && picnicCanFit(next, action.place, [piece])) {
        piece.place = action.place;
        if (action.place === 'bowl') next.mixed = false;
      }
      break;
    case 'cut':
      if (piece && !piece.eaten && piece.units === 2 && picnicCutFits(next, piece)) {
        const index = next.pieces.indexOf(piece);
        next.pieces.splice(index, 1, ...picnicCutIds(next, piece.id).map(id => ({ ...piece, id, units: 1 })));
      }
      break;
    case 'mix':
      if (picnicLivePieces(next, 'bowl').length >= 2) { next.mixed = true; picnicLivePieces(next, 'bowl').forEach(p => { p.salad = true; }); }
      break;
    case 'serve-bowl':
      if (['left', 'right', 'visitor'].includes(action.place) && picnicCanFit(next, action.place, picnicLivePieces(next, 'bowl'))) {
        next.pieces.filter(p => p.place === 'bowl' && !p.eaten).forEach(p => { p.place = action.place; });
        next.mixed = false;
      }
      break;
    case 'enjoy':
      if (['left', 'right', 'visitor'].includes(action.place) && (action.place !== 'visitor' || next.cafe?.visitor)) {
        const food = picnicLivePieces(next, action.place).find(p => !action.id || p.id === action.id);
        if (food) {
          food.eaten = true;
          food.enjoyedBy = action.place === 'visitor' ? next.cafe.visitor : next.guests[action.place === 'right' ? 1 : 0];
        }
      }
      break;
    case 'guest':
      if ([0, 1].includes(action.slot) && PICNIC_GUESTS.includes(action.guest)) next.guests[action.slot] = action.guest;
      break;
    case 'cloth': next.cloth = cleanId(action.asset); break;
    case 'cafe-open': case 'cafe-move': case 'cafe-visitor': case 'cafe-sign': case 'cafe-sign-view': case 'cafe-phase': case 'cafe-note': case 'cafe-role': case 'cafe-performed': {
      const cafe = applyGardenCafe(next.cafe, action);
      if (cafe) {
        next.cafe = cafe;
        if (!cafe.visitor) next.pieces.forEach(p => { if (p.place === 'visitor') p.place = 'board'; });
      }
      break;
    }
    case 'cafe-message': {
      const invitation = normalizeCafeMessage(action.message);
      next.cafe = applyGardenCafe(next.cafe, { type: 'cafe-open' });
      next.invitation = invitation;
      if (invitation.messageDay.use === 'cafe-sign') next.cafe = applyGardenCafe(next.cafe, { type: 'cafe-sign', asset: action.asset });
      else if (!next.guests.includes(invitation.recipient) && next.cafe.visitor !== invitation.recipient) {
        // A changed invitation does not give a departed visitor's served food
        // to the newcomer. The actual portions return to the shared basket.
        next.pieces.forEach(piece => { if (piece.place === 'visitor') piece.place = 'board'; });
        next.cafe = applyGardenCafe(next.cafe, { type: 'cafe-visitor', guest: invitation.recipient });
      }
      break;
    }
    case 'invitation': {
      const invitation = normalizePicnicInvitation(action.invitation);
      if (!invitation) break;
      next.invitation = invitation;
      const other = next.guests[1] === invitation.recipient ? (invitation.recipient === 'rayna' ? 'veer' : 'rayna') : next.guests[1];
      next.guests = [invitation.recipient, other]; break;
    }
    case 'scenario':
      if (PICNIC_SCENARIOS.includes(action.scenario)) next.scenario = action.scenario;
      break;
    case 'more': {
      const uneaten = next.pieces.filter(p => !p.eaten);
      if (uneaten.length + 6 > PICNIC_MAX_PIECES) break;
      do { next.batch = next.batch >= 100000 ? 1 : next.batch + 1; } while (uneaten.some(p => p.origin.startsWith(`fruit_${next.batch}_`)));
      next.pieces = [...uneaten, ...newPicnic(next.scenario, next.batch).pieces];
      // Past meals are represented by saved scenes; new food is a new batch.
      break;
    }
  }
  return next;
}

export function picnicSame(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export { copy as clonePicnic };
