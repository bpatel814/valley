import { isLocalPNG } from '../state/creation-frame.js';
import { normalizePictureView, picturePNGSize } from './picture-view.js';
import { TOY_PATTERN_COLORS } from './toy-workshop.js';
import { RIVER_DAY_VERSION, RIVER_DAY_EPISODES, RIVER_DAY_GUESTS, RIVER_DAY_CHOICE_LABELS } from './river-day.js';

export const RIVER_RUN_VERSION = 1;
export const RIVER_MAX_KEPT = 1000;
export const RIVER_MAX_UNDO = 24;
export const RIVER_MAX_BYTES = 64 * 1024 * 1024;
export const RIVER_PAGE_SIZE = 6;
export const RIVER_DIRECTIONS = Object.freeze({ east: [1, 0], south: [0, 1], west: [-1, 0], north: [0, -1] });
export const RIVER_WATER = Object.freeze({ left: 12, right: 88, top: 30, bottom: 78 });
export const riverClone = value => JSON.parse(JSON.stringify(value));
export const riverError = code => Object.assign(new Error(code), { code });
export const riverId = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(value) ? value : '';
const owner = value => ['rayna', 'veer', 'shared'].includes(value) ? value : 'shared';
const coordinate = (value, fallback, min, max) => Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value)) * 10) / 10 : fallback;
const level = value => [0, 1, 2].includes(value) ? value : 1;
const time = value => Number.isFinite(value) && value >= 0 && value <= 8640000000000000 ? Math.round(value) : 0;
const has = (value, key) => !!value && Object.prototype.hasOwnProperty.call(value, key);
const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => has(value, key));
const equal = (a, b) => a === b || !!a && !!b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)
  && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => has(b, key) && equal(a[key], b[key]));
export function normalizeRiverDockContact(raw) {
  if (!closed(raw, ['v', 'left', 'right', 'top', 'bottom']) || raw.v !== 1
    || !['left', 'right', 'top', 'bottom'].every(key => Number.isFinite(raw[key]) && raw[key] >= (key === 'top' ? 0 : .001) && raw[key] <= 128)) throw riverError('river-contact-invalid');
  return { v: 1, left: raw.left, right: raw.right, top: raw.top, bottom: raw.bottom };
}
// Offsets are the measured landing deck expanded by the visible float hull.
// Enter the box along the actual current segment, without moving sideways or
// jumping to the dock center. Absence retains the earlier eight-unit catch.
function dockEntry(from, to, dock, profile) {
  let enter = 0, leave = 1;
  for (const [axis, lo, hi] of [['x', dock.x - profile.left, dock.x + profile.right], ['y', dock.y - profile.top, dock.y + profile.bottom]]) {
    const delta = to[axis] - from[axis];
    if (!delta) { if (from[axis] < lo || from[axis] > hi) return null; continue; }
    const a = (lo - from[axis]) / delta, b = (hi - from[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return null;
  }
  return { x: Math.round((from.x + (to.x - from.x) * enter) * 1e6) / 1e6, y: Math.round((from.y + (to.y - from.y) * enter) * 1e6) / 1e6 };
}
function point(raw, fallback) { return { x: coordinate(raw?.x, fallback.x, RIVER_WATER.left, RIVER_WATER.right), y: coordinate(raw?.y, fallback.y, RIVER_WATER.top, RIVER_WATER.bottom) }; }
function instance(raw) {
  if (!riverId(raw?.id) || !riverId(raw.asset)) return null;
  return { id: raw.id, asset: raw.asset, toyRef: riverId(raw.toyRef), owner: owner(raw.owner),
    pattern: (Array.isArray(raw.pattern) ? raw.pattern : []).filter(color => TOY_PATTERN_COLORS.includes(color)).slice(0, 8) };
}
export function newRiverScene() {
  return { instance: null, attached: false, origin: { x: 23, y: 54 }, direction: 'east', strength: 1,
    stone: { on: false, x: 56, y: 54 }, dock: { x: 79, y: 64 }, mama: false, contactX: 17.5, outcome: null };
}
export function normalizeRiverPictureView(raw, png) {
  if (has(raw, 'v') && raw.v !== 1) throw riverError('river-picture-view-version');
  if (!closed(raw, ['v','x','y','width','height','sourceWidth','sourceHeight']) || raw.v !== 1) throw riverError('river-picture-view-invalid');
  let frame; try { frame = normalizePictureView(raw); } catch { throw riverError('river-picture-view-invalid'); }
  if (png !== undefined) {
    const size = picturePNGSize(png);
    if (!size || size.width !== frame.sourceWidth || size.height !== frame.sourceHeight) throw riverError('river-picture-view-source');
  }
  return { v:1, ...frame };
}
export function normalizeRiverScene(raw = {}, png) {
  const source = raw && typeof raw === 'object' ? raw : {}, next = newRiverScene();
  next.instance = instance(source.instance); next.attached = !!next.instance && !!source.attached;
  next.origin = point(source.origin, next.origin); next.direction = Object.hasOwn(RIVER_DIRECTIONS, source.direction) ? source.direction : 'east'; next.strength = level(source.strength);
  next.stone = { ...point(source.stone, next.stone), on: !!source.stone?.on }; next.dock = point(source.dock, next.dock); next.mama = !!source.mama;
  next.contactX = coordinate(source.contactX, 17.5, 3, 24);
  // Earlier saved trips deliberately retain their original eight-unit profile.
  // Only launches with measured sprite geometry add this optional dimension.
  if (has(source, 'contactY')) {
    if (!Number.isFinite(source.contactY) || source.contactY < .1 || source.contactY > 64) throw riverError('river-contact-invalid');
    next.contactY = coordinate(source.contactY, 8, .1, 64);
  }
  if (has(source, 'dockContact')) next.dockContact = normalizeRiverDockContact(source.dockContact);
  if (has(source, 'pictureView')) {
    next.pictureView = normalizeRiverPictureView(source.pictureView, png);
    if (!next.instance) throw riverError('river-picture-view-source');
  }
  if (source.outcome && next.attached) next.outcome = riverOutcome(next);
  if (has(source, 'riverDay')) {
    next.riverDay = normalizeRiverDay(source.riverDay);
    if (!next.instance) throw riverError('river-day-picture-needed');
    if (next.riverDay.episode === 'meeting-place' && !next.riverDay.guest && next.outcome) throw riverError('river-day-guest-needed');
  }
  return next;
}
/** Bounded pretend current. The first contacted stone/dock/bank ends the trip.
 * Float centers stay inside the river; this is not a fluid simulation claim. */
export function riverOutcome(scene) {
  if (!scene.instance || !scene.attached) return null;
  const vector = RIVER_DIRECTIONS[scene.direction] || RIVER_DIRECTIONS.east;
  const path = [{ ...scene.origin }], distance = [0, 31, 62][level(scene.strength)];
  if (!distance) return { kind: 'still', end: { ...scene.origin }, path, distance: 0 };
  let kind = 'drifting';
  for (let step = 1; step <= distance; step++) {
    const raw = { x: scene.origin.x + vector[0] * step, y: scene.origin.y + vector[1] * step };
    const end = point(raw, scene.origin), previous = path.at(-1);
    // Horizontal contact uses the measured visible float/stone span at launch;
    // preserve that trial profile when reopening, rather than padded canvases.
    if (scene.stone.on && ((raw.x - scene.stone.x) / (scene.contactX || 17.5)) ** 2 + ((raw.y - scene.stone.y) / (scene.contactY || 8)) ** 2 <= 1) { kind = 'stone'; break; }
    const landing = scene.dockContact ? dockEntry(previous, end, scene.dock, scene.dockContact) : null;
    if (landing) { if (!equal(landing, previous)) path.push(landing); kind = scene.mama ? 'mama' : 'dock'; break; }
    path.push(end);
    if (!scene.dockContact && Math.hypot(raw.x - scene.dock.x, raw.y - scene.dock.y) <= 8) { kind = scene.mama ? 'mama' : 'dock'; break; }
    if (end.x !== raw.x || end.y !== raw.y) { kind = 'bank'; break; }
    if (end.x === previous.x && end.y === previous.y) break;
  }
  const end = path.at(-1); return { kind, end: { ...end }, path, distance: Math.round(Math.hypot(end.x - scene.origin.x, end.y - scene.origin.y) * 10) / 10 };
}
const TRIAL_KEYS = ['instance', 'attached', 'origin', 'direction', 'strength', 'stone', 'dock', 'mama', 'contactX', 'outcome'];
const SETUP_KEYS = TRIAL_KEYS.filter(key => key !== 'outcome');
const trialKeys = (scene, keys = TRIAL_KEYS) => [...keys, ...['contactY', 'dockContact', 'pictureView'].filter(key => has(scene, key))];
const setup = scene => Object.fromEntries(trialKeys(scene, SETUP_KEYS).map(key => [key, riverClone(scene[key])]));
const sameRoute = (a, b) => ['origin', 'direction', 'strength', 'stone', 'dock'].every(key => equal(a[key], b[key]));
const samePath = (a, b) => equal(a.path, b.path) && equal(a.end, b.end) && a.kind.replace('mama', 'dock') === b.kind.replace('mama', 'dock');
export function normalizeRiverTrial(raw) {
  const keys = trialKeys(raw);
  if (!closed(raw, keys) || raw.attached !== true) throw riverError('river-day-trial-invalid');
  const normalized = normalizeRiverScene(raw);
  if (!normalized.instance || !equal(raw, normalized) || !equal(raw.outcome, riverOutcome(normalized))) throw riverError('river-day-trial-invalid');
  return normalized;
}
const capture = scene => normalizeRiverTrial(Object.fromEntries(trialKeys(scene).map(key => [key, scene[key]])));
const choiceKeys = { current: ['id', 'direction', 'strength'], stone: ['id', 'x', 'y'], 'clear-stone': ['id'], 'move-stone': ['id', 'x', 'y'],
  reroute: ['id', 'direction', 'strength', 'origin'], 'dock-here': ['id', 'x', 'y'], 'route-to-dock': ['id', 'direction', 'strength', 'origin'] };
function normalizeDayChoice(raw) {
  if (!raw || !has(choiceKeys, raw.id) || !closed(raw, choiceKeys[raw.id])) throw riverError('river-day-invalid');
  if (has(raw, 'direction') && (!has(RIVER_DIRECTIONS, raw.direction) || ![0, 1, 2].includes(raw.strength))) throw riverError('river-day-invalid');
  if (has(raw, 'x') && (!equal(point(raw, { x: 0, y: 0 }), { x: raw.x, y: raw.y }) || typeof raw.x !== 'number' || typeof raw.y !== 'number')) throw riverError('river-day-invalid');
  if (has(raw, 'origin') && (!closed(raw.origin, ['x', 'y']) || !equal(point(raw.origin, { x: 0, y: 0 }), raw.origin))) throw riverError('river-day-invalid');
  return riverClone(raw);
}
export function normalizeRiverDay(raw) {
  if (raw && raw.v !== RIVER_DAY_VERSION) throw riverError('river-day-version');
  if (!closed(raw, ['v', 'episode', 'guest', 'condition', 'resolution', 'journeys']) || !RIVER_DAY_EPISODES.includes(raw.episode)
    || !['', ...RIVER_DAY_GUESTS].includes(raw.guest)) throw riverError('river-day-invalid');
  const condition = raw.condition === null ? null : normalizeDayChoice(raw.condition);
  const resolution = raw.resolution === null ? null : normalizeDayChoice(raw.resolution);
  if (raw.episode !== 'meeting-place' && raw.guest || condition && (raw.episode !== 'changed-current' || !['current', 'stone'].includes(condition.id))
    || resolution && (raw.episode === 'meeting-place' || raw.episode === 'changed-current' && (!condition || !['clear-stone', 'move-stone', 'reroute'].includes(resolution.id))
      || raw.episode === 'stopping-place' && !['dock-here', 'route-to-dock'].includes(resolution.id))) throw riverError('river-day-invalid');
  let journeys = null;
  if (raw.episode === 'meeting-place') { if (raw.journeys !== null) throw riverError('river-day-invalid'); }
  else {
    if (!closed(raw.journeys, ['first', 'second'])) throw riverError('river-day-invalid');
    journeys = { first: normalizeRiverTrial(raw.journeys.first), second: raw.journeys.second === null ? null : normalizeRiverTrial(raw.journeys.second) };
    if (journeys.second && (sameRoute(journeys.first, journeys.second) || samePath(journeys.first.outcome, journeys.second.outcome))) throw riverError('river-day-route-unchanged');
  }
  return { v: RIVER_DAY_VERSION, episode: raw.episode, guest: raw.guest, condition, resolution, journeys };
}
export function riverDayReadiness(raw, episode) {
  if (!RIVER_DAY_EPISODES.includes(episode)) throw riverError('river-day-invalid');
  const scene = normalizeRiverScene(raw);
  if (!scene.instance) return { ready: false, reason: 'river-picture-needed', actions: ['choose-picture'] };
  if (!scene.attached) return { ready: false, reason: 'river-float-needed', actions: ['attach'] };
  if (episode !== 'meeting-place' && !scene.outcome) return { ready: false, reason: 'river-day-trip-needed', actions: ['launch'] };
  return { ready: true, reason: null, actions: [] };
}
export function beginRiverDay(raw, episode) {
  const scene = normalizeRiverScene(raw), ready = riverDayReadiness(scene, episode);
  if (!ready.ready) throw riverError(ready.reason);
  const first = episode === 'meeting-place' ? null : capture(scene);
  scene.riverDay = { v: RIVER_DAY_VERSION, episode, guest: '', condition: null, resolution: null, journeys: first ? { first, second: null } : null };
  // An optional authored meeting is separate from the ordinary Mama visit.
  if (episode === 'meeting-place' || scene.mama) scene.outcome = null;
  scene.mama = false; return scene;
}
function applyChoice(scene, choice) {
  const next = riverClone(scene);
  if (['current', 'reroute', 'route-to-dock'].includes(choice.id)) { next.direction = choice.direction; next.strength = choice.strength; if (choice.origin) next.origin = riverClone(choice.origin); }
  else if (['stone', 'move-stone'].includes(choice.id)) next.stone = { on: true, x: choice.x, y: choice.y };
  else if (choice.id === 'clear-stone') next.stone.on = false;
  else next.dock = { x: choice.x, y: choice.y };
  next.outcome = null; return next;
}
/** Exact proposed scene and explicit action share one resolved choice. Never pad
 * a choice with an unchanged route, or silently select/attach a child picture. */
export function proposeRiverDayEdit(raw, requested = {}) {
  if (!requested || typeof requested !== 'object' || Array.isArray(requested) || !has(requested, 'id')) throw riverError('river-day-invalid');
  const scene = normalizeRiverScene(raw), day = scene.riverDay;
  if (!day || !scene.attached) throw riverError(!day ? 'river-day-needed' : 'river-float-needed');
  const allowed = day.episode === 'changed-current' ? day.condition ? ['clear-stone', 'move-stone', 'reroute'] : ['current', 'stone'] : day.episode === 'stopping-place' ? ['dock-here', 'route-to-dock'] : [];
  if (!allowed.includes(requested.id)) throw riverError('river-day-choice-unavailable');
  const before = riverOutcome(scene), candidates = [];
  if (requested.id === 'current' || requested.id === 'reroute') {
    for (const direction of Object.keys(RIVER_DIRECTIONS)) for (const strength of requested.id === 'reroute' ? [2, 1] : [2, 1, 0]) candidates.push({ id: requested.id, direction, strength, ...(requested.id === 'reroute' ? { origin: scene.origin } : {}) });
  } else if (requested.id === 'stone') {
    for (const p of before.path.slice(1).reverse()) candidates.push({ id: 'stone', x: p.x, y: p.y });
  } else if (requested.id === 'move-stone') {
    for (const p of [{ x: scene.stone.x, y: 78 }, { x: scene.stone.x, y: 30 }, { x: 88, y: scene.stone.y }, { x: 12, y: scene.stone.y }]) candidates.push({ id: 'move-stone', ...p });
  } else if (requested.id === 'clear-stone') candidates.push({ id: 'clear-stone' });
  else if (requested.id === 'dock-here') candidates.push({ id: 'dock-here', ...day.journeys.first.outcome.end });
  else {
    for (const [direction, vector] of Object.entries(RIVER_DIRECTIONS)) for (const distance of scene.dockContact
      ? [Math.max(20, scene.dockContact[({ east: 'left', west: 'right', south: 'top', north: 'bottom' })[direction]] + 4), 20, 12, 8] : [20, 12, 8]) {
      const origin = point({ x: scene.dock.x - vector[0] * distance, y: scene.dock.y - vector[1] * distance }, scene.origin);
      candidates.push({ id: 'route-to-dock', direction, strength: 1, origin });
    }
  }
  let choices;
  if (Object.keys(requested).length > 1) choices = [normalizeDayChoice(requested)];
  else choices = candidates;
  const chosen = choices.find(choice => {
    const next = applyChoice(scene, choice), after = riverOutcome(next);
    return !sameRoute(scene, next) && !samePath(before, after)
      && (!['current', 'stone'].includes(choice.id) || !samePath(day.journeys.first.outcome, after))
      && (!['dock-here', 'route-to-dock'].includes(choice.id) || ['dock', 'mama'].includes(after.kind) && (!next.dockContact || after.distance > 0));
  });
  if (!chosen) throw riverError('river-day-route-unchanged');
  const next = applyChoice(scene, chosen);
  if (['current', 'stone'].includes(chosen.id)) { next.riverDay.condition = chosen; next.riverDay.resolution = null; }
  else next.riverDay.resolution = chosen;
  return { action: { type: 'river-day-accept', before: setup(scene), choice: riverClone(chosen) }, scene: next };
}
export function riverDayChoices(raw) {
  const scene = normalizeRiverScene(raw), day = scene.riverDay;
  if (!day || day.episode === 'meeting-place' || !scene.attached) return [];
  const ids = day.episode === 'stopping-place' ? ['dock-here', 'route-to-dock'] : day.condition ? ['clear-stone', 'move-stone', 'reroute'] : ['current', 'stone'];
  return ids.flatMap(id => { try { return [{ id, label: RIVER_DAY_CHOICE_LABELS[id], ...proposeRiverDayEdit(scene, { id }) }]; } catch (error) { if (error.code === 'river-day-route-unchanged') return []; throw error; } });
}
export function riverDayOutcome(raw) {
  const scene = normalizeRiverScene(raw), day = scene.riverDay;
  if (!day) return null;
  return { episode: day.episode, actual: scene.outcome && riverClone(scene.outcome), guest: day.guest,
    arrived: day.episode === 'meeting-place' && !!day.guest && scene.outcome?.kind === 'dock',
    journeys: day.journeys && riverClone(day.journeys) };
}
export function editRiverScene(raw, action = {}) {
  const next = normalizeRiverScene(raw), before = JSON.stringify(next);
  if (action.type === 'picture-view') {
    if (!next.instance || next.instance.id !== action.instanceId || next.instance.asset !== action.assetId) throw riverError('river-picture-view-stale');
    if (!has(action, 'frame')) throw riverError('river-picture-view-invalid');
    if (action.frame === null) delete next.pictureView;
    else next.pictureView = normalizeRiverPictureView(action.frame, action.png);
    return next; // A presentation choice never replaces an observed physical trip.
  }
  if (action.type === 'river-day-start') return beginRiverDay(next, action.episode);
  if (action.type === 'river-day-leave') { delete next.riverDay; return next; }
  if (action.type === 'river-day-guest') {
    if (next.riverDay?.episode !== 'meeting-place' || !RIVER_DAY_GUESTS.includes(action.guest)) throw riverError('river-day-invalid');
    if (next.riverDay.guest !== action.guest) { next.riverDay.guest = action.guest; next.outcome = null; } return next;
  }
  if (action.type === 'river-day-accept') {
    if (!equal(action.before, setup(next))) throw riverError('river-day-proposal-stale');
    return proposeRiverDayEdit(next, action.choice).scene;
  }
  if (action.type === 'river-day-choose') {
    if (!next.riverDay?.journeys || !['first', 'second'].includes(action.which)) throw riverError('river-day-invalid');
    const trial = next.riverDay.journeys[action.which]; if (!trial) throw riverError('river-day-trip-needed');
    return { ...riverClone(trial), riverDay: next.riverDay };
  }
  if (action.type?.startsWith('river-day-')) throw riverError('river-day-invalid');
  if (action.type === 'instance') { const chosen = instance(action.instance); if (chosen) { if (!equal(next.instance, chosen)) delete next.pictureView; next.instance = chosen; next.attached = false; } }
  else if (action.type === 'attach' && next.instance) next.attached = true;
  else if (action.type === 'direction' && Object.hasOwn(RIVER_DIRECTIONS, action.direction)) next.direction = action.direction;
  else if (action.type === 'strength' && [0, 1, 2].includes(action.strength)) next.strength = action.strength;
  else if (action.type === 'stone-toggle') next.stone.on = !next.stone.on;
  else if (action.type === 'stone' || action.type === 'dock' || action.type === 'origin') next[action.type] = { ...next[action.type], ...point(action, next[action.type]) };
  else if (action.type === 'mama') next.mama = !!action.join;
  else if (action.type === 'launch') {
    if (next.riverDay && !next.attached) throw riverError('river-float-needed');
    if (next.riverDay?.episode === 'meeting-place' && !next.riverDay.guest) throw riverError('river-day-guest-needed');
    next.contactX = coordinate(action.contactX, next.contactX, 3, 24);
    if (has(action, 'contactY')) {
      if (!Number.isFinite(action.contactY) || action.contactY < .1 || action.contactY > 64) throw riverError('river-contact-invalid');
      next.contactY = coordinate(action.contactY, 8, .1, 64);
    }
    if (has(action, 'dockContact')) next.dockContact = normalizeRiverDockContact(action.dockContact);
    next.outcome = riverOutcome(next);
    const pair = next.riverDay?.journeys;
    const authored = next.riverDay?.episode === 'changed-current' ? !!next.riverDay.condition : ['dock', 'mama'].includes(next.outcome?.kind);
    if (pair && !pair.second && authored && !sameRoute(pair.first, next) && !samePath(pair.first.outcome, next.outcome)) pair.second = capture(next);
    return next;
  }
  else if (action.type === 'reset') return { ...newRiverScene(), instance: next.instance, attached: next.attached, ...(has(next,'pictureView') ? {pictureView:next.pictureView} : {}) };
  if (JSON.stringify(next) !== before) next.outcome = null;
  return next;
}
export function riverOutcomeText(scene) {
  if (!scene.instance) return 'Choose your picture. It can ride the river.';
  if (!scene.attached) return 'Tap the float to put it under your picture.';
  if (!scene.outcome) return 'Launch your picture. Change the water or move a landing place and try again.';
  return { still: 'Still water holds your picture here. Move it anywhere, or turn on the current.', stone: 'The stone stopped your float. Move the stone or change the current and try again.',
    dock: 'Your picture reached the landing place. Move the dock and try a different journey.', mama: 'Mama caught your float at your landing place. You chose the journey!',
    bank: 'Your picture drifted to this river bank. Change the direction or move its start.', drifting: 'Your picture floated this far. Try stronger water, another direction, or a new start.' }[scene.outcome.kind];
}
export function normalizeRiverRun(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  if (source.v != null && source.v !== RIVER_RUN_VERSION) throw riverError('river-version');
  const assets = [], ids = new Set();
  for (const row of Array.isArray(source.assets) ? source.assets : []) {
    if (!riverId(row?.id) || ids.has(row.id) || !isLocalPNG(row.png)) continue;
    ids.add(row.id); assets.push({ id: row.id, sourceRef: riverId(row.sourceRef), png: row.png });
  }
  const clean = value => {
    const scene = normalizeRiverScene(value);
    for (const row of [scene, scene.riverDay?.journeys?.first, scene.riverDay?.journeys?.second].filter(Boolean)) if (has(row, 'pictureView')) {
      normalizeRiverPictureView(row.pictureView, assets.find(asset => asset.id === row.instance?.asset)?.png || '');
    }
    if (scene.riverDay && [scene, scene.riverDay.journeys?.first, scene.riverDay.journeys?.second].filter(Boolean).some(row => !ids.has(row.instance.asset))) throw riverError('river-day-asset-needed');
    if (scene.instance && !ids.has(scene.instance.asset)) { scene.instance = null; scene.attached = false; scene.outcome = null; } return scene;
  };
  for (const scene of [source.current, ...(Array.isArray(source.undo) ? source.undo : []), ...(Array.isArray(source.kept) ? source.kept.map(row => row?.scene) : [])]) if (has(scene, 'riverDay') || has(scene, 'contactY') || has(scene, 'dockContact') || has(scene,'pictureView')) clean(scene);
  const kept = [], keptIds = new Set();
  for (const row of Array.isArray(source.kept) ? source.kept : []) {
    if (!riverId(row?.id) || keptIds.has(row.id)) continue;
    const scene = clean(row.scene); if (!scene.instance) continue;
    keptIds.add(row.id); kept.push({ id: row.id, owner: owner(row.owner), at: time(row.at), scene });
  }
  if (kept.length > RIVER_MAX_KEPT) throw riverError('river-full');
  const result = { v: RIVER_RUN_VERSION, current: clean(source.current), undo: (Array.isArray(source.undo) ? source.undo : []).slice(-RIVER_MAX_UNDO).map(clean), kept, assets };
  const used = new Set([result.current, ...result.undo, ...kept.map(row => row.scene)].flatMap(row => [row.instance?.asset, row.riverDay?.journeys?.first.instance.asset, row.riverDay?.journeys?.second?.instance.asset]).filter(Boolean)); result.assets = assets.filter(row => used.has(row.id));
  if (riverRunBytes(result) > RIVER_MAX_BYTES) throw riverError('river-capacity');
  return result;
}
export function riverRunBytes(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
export function riverSavedPage(kept, page = 0, child = 'shared') {
  const rows = kept.filter(row => row.owner === child || row.owner === 'shared'), pages = Math.max(1, Math.ceil(rows.length / RIVER_PAGE_SIZE));
  const index = Math.max(0, Math.min(pages - 1, Math.floor(Number(page) || 0)));
  return { page: index, pages, items: riverClone(rows.slice(index * RIVER_PAGE_SIZE, (index + 1) * RIVER_PAGE_SIZE)) };
}
