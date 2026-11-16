// Optional authored Café arrangement inside the existing exact meal scene.
// PICNIC_GUESTS is read only inside functions, after both modules initialize.
import { PICNIC_GUESTS } from './picnic.js';
import { normalizePictureView } from './picture-view.js';

export const GARDEN_CAFE_VERSION = 1;
export const CAFE_SEATS = Object.freeze(['left', 'right', 'visitor']);
export const CAFE_NOTES = Object.freeze(['drum', 'shaker', 'bell', 'wood', 'rest']);
export const CAFE_PHASES = Object.freeze(['welcome', 'share', 'music', 'kept']);
export const CAFE_BEATS = 6;
export const CAFE_PERFORMANCE_BEATS = CAFE_BEATS * 2;
const clone = value => JSON.parse(JSON.stringify(value));
const error = code => Object.assign(new Error(code), { code });
const id = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(value) ? value : '';
const coordinate = (value, fallback, minimum, maximum) => typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
const validRhythm = value => Array.isArray(value) && value.length === CAFE_BEATS && Array.from(value).every(note => CAFE_NOTES.includes(note));
const validRoles = value => value && PICNIC_GUESTS.includes(value.pulse) && PICNIC_GUESTS.includes(value.echo) && value.pulse !== value.echo;
const validTime = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8640000000000000;

export function newGardenCafe() {
  return { v: GARDEN_CAFE_VERSION,
    seats: { left: { x: .16, y: .72 }, right: { x: .84, y: .72 }, visitor: { x: .5, y: .44 } },
    sign: { asset: '', x: .18, y: .22 }, visitor: null,
    rhythm: ['bell', 'rest', 'bell', 'wood', 'rest', 'bell'], roles: { pulse: 'mama', echo: 'veer' }, phase: 'welcome', performed: null };
}

function performanceSnapshot(raw) {
  if (!raw || !validRhythm(raw.rhythm) || !validRoles(raw.roles) || !validTime(raw.at)) throw error('garden-cafe-performance');
  return { rhythm: [...raw.rhythm], roles: { pulse: raw.roles.pulse, echo: raw.roles.echo }, at: Math.round(raw.at) };
}

export function normalizeGardenCafe(raw) {
  const fresh = newGardenCafe();
  if (raw == null) return fresh;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw error('garden-cafe-invalid');
  if (raw.v != null && raw.v !== GARDEN_CAFE_VERSION) throw error('garden-cafe-version');
  if (raw.rhythm != null && !validRhythm(raw.rhythm)) throw error('garden-cafe-rhythm');
  const point = (value, fallback, minimumY) => ({ x: coordinate(value?.x, fallback.x, .1, .9), y: coordinate(value?.y, fallback.y, minimumY, .85) });
  const pulse = PICNIC_GUESTS.includes(raw.roles?.pulse) ? raw.roles.pulse : fresh.roles.pulse;
  const echo = PICNIC_GUESTS.includes(raw.roles?.echo) && raw.roles.echo !== pulse ? raw.roles.echo : pulse === 'veer' ? 'mama' : 'veer';
  return { v: GARDEN_CAFE_VERSION,
    seats: Object.fromEntries(CAFE_SEATS.map(seat => [seat, point(raw.seats?.[seat], fresh.seats[seat], .2)])),
    sign: { asset: id(raw.sign?.asset), ...point(raw.sign, fresh.sign, .1),
      ...(raw.sign?.frame != null ? { frame: normalizePictureView(raw.sign.frame) } : {}) },
    visitor: PICNIC_GUESTS.includes(raw.visitor) ? raw.visitor : null,
    rhythm: raw.rhythm ? [...raw.rhythm] : fresh.rhythm, roles: { pulse, echo },
    phase: CAFE_PHASES.includes(raw.phase) ? raw.phase : raw.phase === null ? null : fresh.phase,
    performed: raw.performed == null ? null : performanceSnapshot(raw.performed) };
}

export function applyGardenCafe(raw, action = {}) {
  if (raw == null && action.type !== 'cafe-open') return null;
  const next = normalizeGardenCafe(raw);
  if (action.type === 'cafe-move' && [...CAFE_SEATS, 'sign'].includes(action.part) && Number.isFinite(action.x) && Number.isFinite(action.y)) {
    const point = action.part === 'sign' ? next.sign : next.seats[action.part];
    point.x = Math.max(.1, Math.min(.9, action.x)); point.y = Math.max(action.part === 'sign' ? .1 : .2, Math.min(.85, action.y));
  } else if (action.type === 'cafe-visitor' && (action.guest === null || PICNIC_GUESTS.includes(action.guest))) next.visitor = action.guest;
  else if (action.type === 'cafe-sign' && (action.asset === '' || id(action.asset))) { next.sign.asset = action.asset; delete next.sign.frame; }
  else if (action.type === 'cafe-sign-view' && next.sign.asset && action.asset === next.sign.asset) {
    if (action.frame == null) delete next.sign.frame;
    else { try { next.sign.frame = normalizePictureView(action.frame); } catch { return next; } }
  }
  else if (action.type === 'cafe-phase' && (action.phase === null || CAFE_PHASES.includes(action.phase))) next.phase = action.phase;
  else if (action.type === 'cafe-note' && Number.isInteger(action.index) && action.index >= 0 && action.index < CAFE_BEATS && CAFE_NOTES.includes(action.note)) next.rhythm[action.index] = action.note;
  else if (action.type === 'cafe-role' && ['pulse', 'echo'].includes(action.role) && PICNIC_GUESTS.includes(action.guest)) {
    const other = action.role === 'pulse' ? 'echo' : 'pulse';
    if (next.roles[other] === action.guest) next.roles[other] = next.roles[action.role];
    next.roles[action.role] = action.guest;
  } else if (action.type === 'cafe-performed' && action.completed === true && action.playedBeats === CAFE_PERFORMANCE_BEATS && validRhythm(action.rhythm) && validRoles(action.roles) && validTime(action.at)) {
    // Only the controller's fully completed captured performance calls this.
    // The saved snapshot describes what played, not mastery or a correctness score.
    next.performed = performanceSnapshot(action);
  }
  return next;
}

/** Six pulse beats followed by the chosen family's six-beat echo, including rests. */
export function gardenCafePerformance(raw) {
  const cafe = normalizeGardenCafe(raw);
  return { interval: 600, beats: ['pulse', 'echo'].flatMap(role => cafe.rhythm.map((note, index) => ({ role, guest: cafe.roles[role], index, note }))),
    rhythm: [...cafe.rhythm], roles: clone(cafe.roles), duration: CAFE_PERFORMANCE_BEATS * 600 };
}

export function gardenCafeGuidance(raw) {
  const cafe = normalizeGardenCafe(raw);
  return { welcome: 'Choose who joins your café. Move a seat or add your picture sign.',
    share: 'Cut, mix or share the fruit. Each piece goes to the place you choose.',
    music: 'Change a welcome beat or leave a quiet rest. Choose who plays and echoes.',
    kept: 'Your café can come back. You can change it or play something different.' }[cafe.phase] || 'Arrange, share or play your welcome. You choose what happens next.';
}
