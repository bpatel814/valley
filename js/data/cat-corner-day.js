// Toy-world ground relations, in the existing Animal scene's 100 x 62.5 units.
// Anchors are sprite ground contacts, not centers or a claim about real physics.
export const CAT_CORNER_DAY_VERSION = 1;
export const CAT_CORNER_DAY_EPISODES = Object.freeze(['resting-place', 'quiet-corner', 'little-welcome', 'free']);
export const CAT_CORNER_DAY_VISITORS = Object.freeze(['ishan', 'ba', 'dada']);
export const CAT_CORNER_DAY_ROLES = Object.freeze(['playing', 'watching']);
export const CAT_CORNER_DAY_OUTCOMES = Object.freeze(['free', 'find-cat', 'ready', 'bed-rest', 'floor-rest', 'needs-shade', 'needs-room', 'playing-nearby', 'quiet-rest', 'greeting', 'watching-rest', 'watching-ready', 'visitor-left']);
export const CAT_CORNER_DAY_GEOMETRY = Object.freeze({
  ratio: 1.6, canopyWidth: 57, canopySpan: 1280, canopyCenter: 768, canopyFoot: 840,
  opening: Object.freeze([190, 360, 1320, 840]),
  bedWidth: 28 * (1490 - 47) / (1300 - 230), cushionWidth: 28, restWidth: 22,
  bedSeatRise: (900 - 610) * 28 / 1070, restHeight: 1024 * 22 / 1536,
  tolerance: 1.5, nearbyX: 26, nearbyY: 18,
});
const own = (raw, key) => !!raw && Object.prototype.hasOwnProperty.call(raw, key);
const object = raw => !!raw && typeof raw === 'object' && !Array.isArray(raw);
const fields = (raw, keys) => object(raw) && Object.keys(raw).length === keys.length && keys.every(key => own(raw, key));
export function catCornerDayError(code = 'cat-day-invalid') { return Object.assign(new Error('This cat corner story cannot open with unsupported choices. Your earlier corner is kept.'), { code }); }
const finite = (value, lo, hi) => typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi;
function move(value, fallback, lo, hi) {
  if (value == null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw catCornerDayError();
  return Math.round(Math.max(lo, Math.min(hi, value)) * 10) / 10;
}
export function normalizeCatCornerDay(raw) {
  if (!object(raw)) throw catCornerDayError();
  if (raw.v !== 1) throw catCornerDayError('cat-day-version');
  if (!fields(raw, ['v', 'episode', 'canopy', 'visitor', 'restTarget', 'outcome'])
    || !CAT_CORNER_DAY_EPISODES.includes(raw.episode) || ![null, 'bed', 'floor'].includes(raw.restTarget)
    || !CAT_CORNER_DAY_OUTCOMES.includes(raw.outcome)
    || !fields(raw.canopy, ['x', 'y', 'on']) || !finite(raw.canopy.x, 35, 65) || !finite(raw.canopy.y, 65, 90) || typeof raw.canopy.on !== 'boolean') throw catCornerDayError();
  let visitor = null;
  if (raw.visitor !== null) {
    if (!fields(raw.visitor, ['id', 'x', 'y', 'arrived', 'role']) || !CAT_CORNER_DAY_VISITORS.includes(raw.visitor.id)
      || !finite(raw.visitor.x, 16, 84) || !finite(raw.visitor.y, 35, 84) || typeof raw.visitor.arrived !== 'boolean'
      || !CAT_CORNER_DAY_ROLES.includes(raw.visitor.role)) throw catCornerDayError();
    visitor = { ...raw.visitor };
  }
  return { v: 1, episode: raw.episode, canopy: { ...raw.canopy }, visitor, restTarget: raw.restTarget, outcome: raw.outcome };
}
export function catCornerDayFields(raw) { return own(raw, 'catDay') ? { catDay: normalizeCatCornerDay(raw.catDay) } : {}; }
export function newCatCornerDay(corner, episode = 'resting-place') {
  if (!CAT_CORNER_DAY_EPISODES.includes(episode)) throw catCornerDayError();
  return normalizeCatCornerDay({ v: 1, episode, canopy: { x: move(corner?.bed?.x, 50, 35, 65), y: move(corner?.bed?.y, 79, 65, 90), on: true },
    visitor: null, restTarget: episode === 'quiet-corner' ? 'bed' : null, outcome: 'ready' });
}
function visibleCat(corner) {
  const place = corner.places.find(row => row.id === corner.cat.place);
  if (place && !place.open) return null;
  if (corner.cat.place === 'bed') return { x: corner.bed.x + (corner.bed.pillow < 0 ? 3 : -3), y: corner.bed.y - CAT_CORNER_DAY_GEOMETRY.bedSeatRise * 1.6, place: 'bed', pose: 'rest' };
  if (corner.cat.place === 'picture' && corner.picture) return { x: Math.max(16, corner.picture.x - 13), y: Math.min(84, corner.picture.y + 8), place: 'picture', pose: 'play' };
  return { x: place?.x ?? corner.cat.x, y: place?.y ?? corner.cat.y, place: corner.cat.place, pose: corner.cat.place === 'shelter' ? 'rest' : corner.cat.pose };
}
function bedBlocked(corner) {
  return corner.places.filter(place => Math.abs(place.x - corner.bed.x) < (CAT_CORNER_DAY_GEOMETRY.bedWidth + (place.id === 'shelter' ? 30 : 26)) / 2 - 2 && Math.abs(place.y - corner.bed.y) < 13).map(place => place.id);
}
function floorBlocked(corner, point) {
  const obstacles = [...corner.places.map(place => ({ ...place, width: place.id === 'shelter' ? 30 : 26 })), { ...corner.bed, id: 'bed', width: CAT_CORNER_DAY_GEOMETRY.bedWidth }];
  return obstacles.filter(item => Math.abs(point.x - item.x) < (item.width + 22) / 2 - 2 && Math.abs(point.y - item.y) < 11).map(item => item.id);
}
export function catCornerDayShadeBounds(canopy) {
  const scale = 57 / 1280;
  return { left: canopy.x + (190 - 768) * scale, right: canopy.x + (1320 - 768) * scale,
    top: canopy.y + (360 - 840) * scale * 1.6, bottom: canopy.y };
}
function covered(day, point) {
  if (!day.canopy.on) return false;
  const shade = catCornerDayShadeBounds(day.canopy), t = CAT_CORNER_DAY_GEOMETRY.tolerance;
  return point.x - 11 >= shade.left - t && point.x + 11 <= shade.right + t
    && point.y - 956 * 22 / 1536 * 1.6 >= shade.top - t && point.y + 68 * 22 / 1536 * 1.6 <= shade.bottom + t;
}
function screenBetween(corner, visitor, target) {
  const leaf = corner.places.find(place => place.id === 'leaf');
  if (!leaf) return false;
  // Segment against the measured leafy sprite, excluding its end points. A
  // visible screen may make the corner quiet even when its hide flap is open.
  const box = { left: leaf.x - 13, right: leaf.x + 13, top: leaf.y - 846 * 26 / 1485 * 1.6, bottom: leaf.y + (1024 - 846) * 26 / 1485 * 1.6 };
  let lo = .15, hi = .85;
  for (const [start, delta, min, max] of [[visitor.x, target.x - visitor.x, box.left, box.right], [visitor.y, target.y - visitor.y, box.top, box.bottom]]) {
    if (Math.abs(delta) < .0001) { if (start < min || start > max) return false; continue; }
    const a = (min - start) / delta, b = (max - start) / delta;
    lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    if (lo > hi) return false;
  }
  return true;
}
function approach(corner, visitor) {
  const points = [-18, 18].map(dx => ({ x: move(visitor.x + dx, 20, 16, 84), y: move(visitor.y + 3, 78, 34, 84) }));
  const point = points.find(point => !floorBlocked(corner, point).length) || points[visitor.x < 50 ? 1 : 0];
  return { place: 'floor', ...point, pose: 'play' };
}
export function catCornerDayOutcome(corner) {
  const day = catCornerDayFields(corner).catDay;
  if (!day) return { active: false, visible: !!visibleCat(corner) };
  const cat = visibleCat(corner), bedPoint = { x: corner.bed.x + (corner.bed.pillow < 0 ? 3 : -3), y: corner.bed.y - CAT_CORNER_DAY_GEOMETRY.bedSeatRise * 1.6 };
  const floorPoint = { x: day.canopy.x, y: Math.min(84, day.canopy.y - 3) };
  const bed = { ...bedPoint, covered: covered(day, bedPoint), blocked: bedBlocked(corner) };
  const floor = { ...floorPoint, covered: covered(day, floorPoint), blocked: floorBlocked(corner, floorPoint) };
  bed.ready = bed.covered && !bed.blocked.length; floor.ready = floor.covered && !floor.blocked.length;
  const target = day.restTarget === 'floor' ? floor : day.restTarget === 'bed' ? bed : cat || bed;
  const visitor = day.visitor ? { ...day.visitor, nearby: false, screened: false } : null;
  if (visitor?.arrived && cat) {
    visitor.nearby = Math.abs(visitor.x - target.x) < 26 && Math.abs(visitor.y - target.y) / 1.6 < 18;
    visitor.screened = screenBetween(corner, visitor, target);
  }
  const playful = !!(visitor?.arrived && visitor.role === 'playing' && visitor.nearby && !visitor.screened);
  let outcome = day.episode === 'free' ? 'free' : 'ready';
  if (!cat) outcome = 'find-cat';
  else if (day.episode !== 'free') {
    if (day.outcome === 'greeting' && visitor?.arrived) outcome = 'greeting';
    else if (playful) outcome = 'playing-nearby';
    else if (day.restTarget) outcome = !target.covered ? 'needs-shade' : target.blocked.length ? 'needs-room'
      : day.episode === 'quiet-corner' ? 'quiet-rest' : visitor?.arrived && visitor.role === 'watching' ? 'watching-rest' : day.restTarget === 'bed' ? 'bed-rest' : 'floor-rest';
    else if (day.outcome === 'visitor-left') outcome = 'visitor-left';
    else if (visitor?.arrived && visitor.role === 'watching') outcome = 'watching-ready';
  }
  return { active: true, visible: !!cat, episode: day.episode, outcome, restTarget: day.restTarget, canopyOn: day.canopy.on,
    bed, floor, visitor, cat, canRest: !!cat && ['bed-rest', 'floor-rest', 'quiet-rest', 'watching-rest'].includes(outcome),
    resting: !!cat && cat.pose === 'rest',
    covered: !!cat && covered(day, cat) };
}
export function reconcileCatCornerDay(corner) {
  if (!own(corner, 'catDay')) return corner;
  const result = catCornerDayOutcome(corner), day = corner.catDay;
  if (result.visible && day.episode !== 'free') {
    if (result.outcome === 'greeting' || result.outcome === 'playing-nearby') corner.cat = approach(corner, day.visitor);
    else if (result.canRest) corner.cat = { place: day.restTarget, x: result[day.restTarget].x, y: day.restTarget === 'bed' ? corner.bed.y - 2 : result.floor.y, pose: 'rest' };
    else if (day.restTarget) {
      const point = { x: move(corner.bed.x - 24, 20, 16, 84), y: corner.bed.y };
      corner.cat = { place: 'floor', ...point, pose: 'sit' };
    }
  }
  day.outcome = result.outcome; return corner;
}
export function applyCatCornerDay(corner, action) {
  if (action.type === 'cat-day-begin') {
    if (!CAT_CORNER_DAY_EPISODES.includes(action.episode)) throw catCornerDayError();
    corner.catDay = corner.catDay ? { ...normalizeCatCornerDay(corner.catDay), episode: action.episode, outcome: 'ready' } : newCatCornerDay(corner, action.episode);
    if (action.episode === 'quiet-corner' && !corner.catDay.restTarget) corner.catDay.restTarget = 'bed';
  } else {
    if (!corner.catDay) throw catCornerDayError('cat-day-not-started');
    const day = corner.catDay;
    if (action.type === 'cat-day-canopy') { if (action.on != null && typeof action.on !== 'boolean') throw catCornerDayError(); day.canopy = { x: move(action.x, day.canopy.x, 35, 65), y: move(action.y, day.canopy.y, 65, 90), on: action.on ?? day.canopy.on }; }
    else if (action.type === 'cat-day-rest') { if (!['bed', 'floor'].includes(action.target)) throw catCornerDayError(); day.restTarget = action.target; day.outcome = 'ready'; }
    else if (action.type === 'cat-day-visitor') {
      if (!CAT_CORNER_DAY_VISITORS.includes(action.id) || action.role != null && !CAT_CORNER_DAY_ROLES.includes(action.role)) throw catCornerDayError();
      day.visitor = { id: action.id, x: move(action.x, Math.min(84, corner.bed.x + 22), 16, 84), y: move(action.y, corner.bed.y - 13, 35, 84), arrived: true, role: action.role || 'watching' }; day.outcome = 'ready';
    } else if (action.type === 'cat-day-visitor-move') { if (!day.visitor) throw catCornerDayError(); day.visitor.x = move(action.x, day.visitor.x, 16, 84); day.visitor.y = move(action.y, day.visitor.y, 35, 84); }
    else if (action.type === 'cat-day-role') { if (!day.visitor || !CAT_CORNER_DAY_ROLES.includes(action.role)) throw catCornerDayError(); day.visitor.role = action.role; day.outcome = 'ready'; }
    else if (action.type === 'cat-day-greet') { if (!day.visitor?.arrived) throw catCornerDayError(); day.restTarget = null; day.outcome = 'greeting'; }
    else if (action.type === 'cat-day-watch') {
      if (!day.visitor?.arrived) throw catCornerDayError();
      day.visitor.role = 'watching'; day.visitor.x = day.canopy.x <= 50 ? 84 : 16;
      // A new quiet-watch choice stands outside, at the open front. Placing
      // the bitmap behind the roof hid half the visitor's face on phones.
      day.visitor.y = 84;
      day.restTarget ||= 'bed'; day.outcome = 'ready';
    }
    else if (action.type === 'cat-day-leave') { if (day.visitor) day.visitor.arrived = false; day.outcome = 'visitor-left'; }
    else if (action.type === 'cat-day-come-out') { corner.cat = { place: 'floor', x: 20, y: 84, pose: 'play' }; day.outcome = 'ready'; }
    else if (action.type === 'cat-day-free') { day.episode = 'free'; day.restTarget = null; day.outcome = 'free'; }
    else throw catCornerDayError();
  }
  return reconcileCatCornerDay(corner);
}
export function catCornerDayInvitation(corner) {
  const result = catCornerDayOutcome(corner);
  if (!result.visible) return 'Open a place and look for your cat. There is no hurry.';
  const text = { free: 'Your arranged corner is here. Move things or choose a little cat story.', ready: 'Choose the bed or a floor spot under your canopy, or welcome a visitor.',
    'bed-rest': 'Your cat rests on the shaded bed. Moving the bed or canopy makes another place to try.', 'floor-rest': 'Your cat rests on the floor under your canopy. The bed stays where you put it.',
    'needs-shade': 'Your cat can sit here. Move the canopy over your chosen resting place, or choose another spot.', 'needs-room': 'Your cat can sit here. Move the bed or nearby things to make room for this resting place.',
    'playing-nearby': 'Your cat comes to play nearby. Your visitor can watch quietly, move farther away, or put the leafy screen between them.',
    'quiet-rest': 'Your cat rests in the quiet corner. Your visitor can watch from here or play farther away.', greeting: 'Your cat comes close to greet the visitor. They can watch quietly or leave the corner as you arranged it.',
    'watching-rest': 'Your visitor watches while the cat rests. They can say hello or leave your cozy corner as it is.', 'watching-ready': 'Your visitor is watching quietly. Choose a place for the cat to rest, or greet them.',
    'visitor-left': 'Your visitor has left. The bed, canopy and your own picture stay as you arranged them.' };
  return text[result.outcome] || 'Choose a little cat story or keep arranging your corner.';
}
