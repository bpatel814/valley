import { isLocalPNG } from '../state/creation-frame.js';
import { TOY_PATTERN_COLORS } from './toy-workshop.js';
import { ROLLING_DAY_VERSION, ROLLING_DAY_EPISODES, ROLLING_DAY_PREDICTIONS, ROLLING_DAY_RESOLUTIONS } from './rolling-day.js';
import { normalizePictureView, picturePNGSize } from './picture-view.js';

export const ROLLING_RUN_VERSION = 1;
export const ROLLING_MAX_SAVES = 1000;
export const ROLLING_MAX_UNDO = 24;
export const ROLLING_MAX_BYTES = 64 * 1024 * 1024;
export const ROLLING_PAGE_SIZE = 8;
export const ROLL_START = 18;
export const ROLL_RAMP_FOOT = 40;
export const ROLL_TOY_WIDTH = 18;
export const ROLL_TOY_FRONT = ROLL_TOY_WIDTH * (2027 / 2079 - .5);
export const ROLL_BLOCK_WIDTH = 8;
export const ROLL_TARGET_RADIUS = 8;
export const ROLLING_SITUATIONS = Object.freeze(['lab', 'landing']);
// Authored play material, never an entry in the child's picture/toy libraries.
export const ROLLING_STARTER = Object.freeze({ id: 'flower-wagon', instanceId: 'rolling-starter:flower-wagon',
  art: 'stickers/draw_flower', path: 'assets/art/final/stickers/draw_flower.png', name: 'Starter flower wagon' });
const clone = value => JSON.parse(JSON.stringify(value));
const id = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(value) ? value : '';
const owner = value => ['rayna', 'veer'].includes(value) ? value : 'shared';
const coordinate = (value, fallback, minimum, maximum) => Number.isFinite(Number(value)) ? Math.round(Math.max(minimum, Math.min(maximum, Number(value))) * 10) / 10 : fallback;
const level = value => Math.max(0, Math.min(2, Math.round(Number(value) || 0)));
const has = (value, key) => !!value && Object.prototype.hasOwnProperty.call(value, key);
const equal = (a, b) => a === b || !!a && !!b && typeof a === 'object' && typeof b === 'object'
  && Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length
  && Object.keys(a).every(key => has(b, key) && equal(a[key], b[key]));
const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => has(value, key));
const exactCoordinate = (value, minimum, maximum) => typeof value === 'number' && Number.isFinite(value)
  && value >= minimum && value <= maximum && coordinate(value, 0, minimum, maximum) === value;
export const rollingError = code => Object.assign(new Error(code), { code });
export const isRollingStarter = instance => instance?.source === 'starter' && instance.starterId === ROLLING_STARTER.id;
/** Optional presentation of the original PNG. Absence continues to mean Whole. */
export function normalizeRollingPictureView(raw, png) {
  if (has(raw, 'v') && raw.v !== 1) throw rollingError('rolling-picture-view-version');
  if (!closed(raw, ['v', 'x', 'y', 'width', 'height', 'sourceWidth', 'sourceHeight'])) throw rollingError('rolling-picture-view-invalid');
  let frame;
  try { frame = normalizePictureView(raw); } catch { throw rollingError('rolling-picture-view-invalid'); }
  const size = picturePNGSize(png);
  if (!size || size.width !== frame.sourceWidth || size.height !== frame.sourceHeight) throw rollingError('rolling-picture-view-source');
  return { v: 1, ...frame };
}
export function starterRollingInstance(child = 'shared') {
  return { v: 1, id: ROLLING_STARTER.instanceId, source: 'starter', starterId: ROLLING_STARTER.id, owner: owner(child),
    behavior: 'rolling', pattern: [], name: ROLLING_STARTER.name, place: 'rolling-run', x: ROLL_START, y: 50 };
}

/** The scene owns this exact instance, even after its Workshop source disappears. */
export function normalizeRollingInstance(raw) {
  if (raw?.source === 'starter') {
    if (raw.starterId !== ROLLING_STARTER.id || raw.id !== ROLLING_STARTER.instanceId || raw.behavior !== 'rolling' || 'png' in raw || 'toyRef' in raw) return null;
    return starterRollingInstance(raw.owner);
  }
  if (raw?.starterId != null) return null;
  if (!raw || raw.behavior !== 'rolling' || !isLocalPNG(raw.png) || !id(raw.id)) return null;
  return { v: 1, id: id(raw.id), toyRef: id(raw.toyRef), owner: owner(raw.owner), png: raw.png,
    behavior: 'rolling', pattern: (Array.isArray(raw.pattern) ? raw.pattern : []).filter(color => TOY_PATTERN_COLORS.includes(color)).slice(0, 8),
    name: typeof raw.name === 'string' ? raw.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60) : '', place: 'rolling-run', x: ROLL_START, y: 50 };
}
export function newRollingScene() {
  return { instance: null, situation: 'lab', ramp: 0, push: 0, obstacle: { on: false, x: 70 }, target: 74, outcome: null };
}
export function normalizeRollingScene(raw = {}) {
  const value = raw && typeof raw === 'object' ? raw : {}, result = newRollingScene();
  result.instance = normalizeRollingInstance(value.instance);
  result.situation = value.situation === 'landing' ? 'landing' : 'lab'; result.ramp = level(value.ramp); result.push = level(value.push);
  result.obstacle = { on: !!value.obstacle?.on, x: coordinate(value.obstacle?.x, 70, 54, 87) };
  result.target = coordinate(value.target, 74, 54, 90);
  if (has(value, 'pictureView')) {
    result.pictureView = normalizeRollingPictureView(value.pictureView, result.instance?.png);
  }
  if (value.outcome && result.instance) result.outcome = rollOutcome(result);
  if (has(value, 'rollingDay')) {
    result.rollingDay = normalizeRollingDay(value.rollingDay);
    if (!result.instance) throw rollingError('rolling-day-toy-needed');
    if (result.rollingDay.episode === 'prediction' && !result.rollingDay.prediction && result.outcome) throw rollingError('rolling-day-prediction-needed');
  }
  return result;
}

/** A predictable play model: height and push add travel; the first block stops it.
 * These are authored toy-table units, not a claim of real-world physics accuracy. */
export function rollOutcome(scene) {
  if (!scene.instance) return null;
  const freeEnd = Math.min(91, ROLL_RAMP_FOOT + 12 + level(scene.ramp) * 14 + level(scene.push) * 13);
  const blockContact = scene.obstacle.x - ROLL_TOY_FRONT - ROLL_BLOCK_WIDTH / 2;
  const blocked = scene.obstacle.on && blockContact <= freeEnd;
  const end = Math.round((blocked ? Math.max(ROLL_RAMP_FOOT, blockContact) : freeEnd) * 10) / 10;
  const target = coordinate(scene.target, 74, 54, 90);
  const kind = blocked ? 'blocked' : scene.situation !== 'landing' ? 'stop' : Math.abs(end - target) <= ROLL_TARGET_RADIUS ? 'landed' : end < target ? 'short' : 'past';
  return { kind, end, freeEnd, distance: Math.round((end - ROLL_START) * 10) / 10, target, blockedAt: blocked ? scene.obstacle.x : null };
}
const TRIAL_KEYS = ['instance', 'situation', 'ramp', 'push', 'obstacle', 'target', 'outcome'];
const trialKeys = scene => [...TRIAL_KEYS, ...(has(scene, 'pictureView') ? ['pictureView'] : [])];
/** A closed, complete trial, never a recursive scene or a proposed future result. */
export function normalizeRollingTrial(raw) {
  if (!closed(raw, trialKeys(raw)) || !ROLLING_SITUATIONS.includes(raw.situation)
    || ![0, 1, 2].includes(raw.ramp) || ![0, 1, 2].includes(raw.push)
    || !closed(raw.obstacle, ['on', 'x']) || typeof raw.obstacle.on !== 'boolean'
    || !exactCoordinate(raw.obstacle.x, 54, 87) || !exactCoordinate(raw.target, 54, 90)) throw rollingError('rolling-day-trial-invalid');
  const instance = normalizeRollingInstance(raw.instance);
  if (!instance || !equal(raw.instance, instance)) throw rollingError('rolling-day-trial-invalid');
  const trial = { instance, situation: raw.situation, ramp: raw.ramp, push: raw.push,
    obstacle: clone(raw.obstacle), target: raw.target, outcome: null };
  if (has(raw, 'pictureView')) trial.pictureView = normalizeRollingPictureView(raw.pictureView, instance.png);
  const outcome = rollOutcome(trial);
  if (!equal(raw.outcome, outcome)) throw rollingError('rolling-day-trial-invalid');
  trial.outcome = outcome; return trial;
}
export function normalizeRollingDay(raw) {
  if (raw && raw.v !== ROLLING_DAY_VERSION) throw rollingError('rolling-day-version');
  if (!closed(raw, ['v', 'episode', 'prediction', 'change', 'resolution', 'comparison'])
    || !ROLLING_DAY_EPISODES.includes(raw.episode)) throw rollingError('rolling-day-invalid');
  const prediction = raw.prediction;
  if (prediction !== null && !ROLLING_DAY_PREDICTIONS.some(place => place.id === prediction)) throw rollingError('rolling-day-invalid');
  if (raw.change !== null && (!closed(raw.change, ['kind', 'x']) || !['block', 'landing'].includes(raw.change.kind)
    || !exactCoordinate(raw.change.x, 54, raw.change.kind === 'block' ? 87 : 90))) throw rollingError('rolling-day-invalid');
  if (raw.resolution !== null && (!ROLLING_DAY_RESOLUTIONS.includes(raw.resolution) || !raw.change)) throw rollingError('rolling-day-invalid');
  if (raw.episode !== 'prediction' && prediction !== null || raw.episode !== 'changed-route' && (raw.change !== null || raw.resolution !== null)) throw rollingError('rolling-day-invalid');
  let comparison = null;
  if (raw.episode === 'comparison') {
    if (!closed(raw.comparison, ['first', 'second'])) throw rollingError('rolling-day-invalid');
    comparison = { first: normalizeRollingTrial(raw.comparison.first), second: raw.comparison.second === null ? null : normalizeRollingTrial(raw.comparison.second) };
    if (comparison.second && sameRollingSetup(comparison.first, comparison.second)) throw rollingError('rolling-day-comparison-unchanged');
  } else if (raw.comparison !== null) throw rollingError('rolling-day-invalid');
  return { v: ROLLING_DAY_VERSION, episode: raw.episode, prediction, change: raw.change && clone(raw.change), resolution: raw.resolution, comparison };
}
const trialFrom = scene => normalizeRollingTrial(Object.fromEntries(trialKeys(scene).map(key => [key, scene[key]])));
/** Identity alone cannot stand in for changing how the toy travels. */
export function sameRollingSetup(a, b) {
  return ['situation', 'ramp', 'push', 'obstacle', 'target'].every(key => equal(a[key], b[key]));
}
export function rollingDayReadiness(raw, episode) {
  if (!ROLLING_DAY_EPISODES.includes(episode)) throw rollingError('rolling-day-invalid');
  const scene = normalizeRollingScene(raw);
  if (!scene.instance) return { ready: false, reason: 'rolling-toy-needed', actions: ['choose-starter', 'choose-picture'] };
  if (episode === 'comparison' && !scene.outcome) return { ready: false, reason: 'rolling-day-trial-needed', actions: ['try'] };
  return { ready: true, reason: null, actions: [] };
}
export function beginRollingDay(raw, episode) {
  const scene = normalizeRollingScene(raw), readiness = rollingDayReadiness(scene, episode);
  if (!readiness.ready) throw rollingError(readiness.reason);
  scene.rollingDay = { v: ROLLING_DAY_VERSION, episode, prediction: null, change: null, resolution: null,
    comparison: episode === 'comparison' ? { first: trialFrom(scene), second: null } : null };
  if (episode === 'prediction') scene.outcome = null;
  return scene;
}
export function rollingDayChoices(raw) {
  const scene = normalizeRollingScene(raw), day = scene.rollingDay;
  if (day?.episode !== 'changed-route' || !day.change) return [];
  const choices = scene.obstacle.on ? ['clear-block', 'move-block'] : [];
  const end = rollOutcome(scene).end;
  if (end >= 54 && (scene.situation !== 'landing' || scene.target !== Math.min(90, end))) choices.push('landing-nearby');
  return choices;
}
function dayEdit(scene, action) {
  const day = scene.rollingDay;
  if (action.type === 'rolling-day-leave') { delete scene.rollingDay; return scene; }
  if (!day) throw rollingError('rolling-day-needed');
  if (action.type === 'rolling-day-predict') {
    if (day.episode !== 'prediction' || !ROLLING_DAY_PREDICTIONS.some(place => place.id === action.place)) throw rollingError('rolling-day-invalid');
    if (day.prediction !== action.place) { day.prediction = action.place; scene.outcome = null; }
    return scene;
  }
  if (action.type === 'rolling-day-choose') {
    if (day.episode !== 'comparison' || !['first', 'second'].includes(action.which)) throw rollingError('rolling-day-invalid');
    const trial = day.comparison[action.which]; if (!trial) throw rollingError('rolling-day-trial-needed');
    return { ...clone(trial), rollingDay: day };
  }
  if (day.episode !== 'changed-route') throw rollingError('rolling-day-invalid');
  const before = rollOutcome(scene);
  if (action.type === 'rolling-day-change') {
    if (!['block', 'landing'].includes(action.kind)) throw rollingError('rolling-day-invalid');
    if (has(action, 'x') && !exactCoordinate(action.x, 54, action.kind === 'block' ? 87 : 90)) throw rollingError('rolling-day-invalid');
    if (action.kind === 'block') {
      const positions = has(action, 'x') ? [action.x] : [70, 54, 64, 84, 87];
      const x = positions.find(x => {
        const after = rollOutcome({ ...scene, obstacle: { on: true, x } });
        return after.end !== before.end || after.kind !== before.kind;
      });
      if (x === undefined) throw rollingError('rolling-day-change-needed');
      scene.obstacle = { on: true, x }; day.change = { kind: 'block', x };
    } else {
      const x = has(action, 'x') ? action.x : before.end + 20 <= 90 ? Math.max(54, before.end + 20) : Math.max(54, before.end - 20);
      if (scene.situation === 'landing' && x === scene.target) throw rollingError('rolling-day-change-needed');
      scene.situation = 'landing'; scene.target = x; day.change = { kind: 'landing', x };
    }
    day.resolution = null; scene.outcome = null; return scene;
  }
  if (action.type === 'rolling-day-resolve') {
    if (!rollingDayChoices(scene).includes(action.choice)) throw rollingError('rolling-day-choice-unavailable');
    const setup = clone(scene);
    if (action.choice === 'clear-block') scene.obstacle.on = false;
    else if (action.choice === 'move-block') {
      if (has(action, 'x') && !exactCoordinate(action.x, 54, 87)) throw rollingError('rolling-day-invalid');
      const positions = has(action, 'x') ? [action.x] : [87, 54, 70];
      const x = positions.find(x => {
        const after = rollOutcome({ ...scene, obstacle: { on: true, x } });
        return x !== scene.obstacle.x && (after.end !== before.end || after.kind !== before.kind);
      });
      if (x === undefined) throw rollingError('rolling-day-change-needed');
      scene.obstacle.x = x;
    } else { scene.situation = 'landing'; scene.target = Math.min(90, before.end); }
    if (sameRollingSetup(setup, scene)) throw rollingError('rolling-day-change-needed');
    day.resolution = action.choice; scene.outcome = null; return scene;
  }
  throw rollingError('rolling-day-invalid');
}
export function editRollingScene(raw, action = {}) {
  const scene = normalizeRollingScene(raw), before = JSON.stringify(scene);
  if (action.type === 'rolling-day-start') return beginRollingDay(scene, action.episode);
  if (action.type?.startsWith('rolling-day-')) return dayEdit(scene, action);
  if (action.type === 'picture-view') {
    if (!scene.instance || isRollingStarter(scene.instance) || scene.instance.id !== action.instanceId || scene.instance.png !== action.png) throw rollingError('rolling-picture-view-stale');
    if (!has(action, 'frame')) throw rollingError('rolling-picture-view-invalid');
    if (action.frame === null) delete scene.pictureView;
    else scene.pictureView = normalizeRollingPictureView(action.frame, scene.instance.png);
    // Presentation never changes an observed roll or a retained comparison.
    return scene;
  }
  if (action.type === 'toy') {
    const instance = normalizeRollingInstance(action.instance);
    if (instance && !equal(instance, scene.instance)) { scene.instance = instance; delete scene.pictureView; }
  } else if (action.type === 'ramp') scene.ramp = level(action.level);
  else if (action.type === 'push') scene.push = level(action.level);
  else if (action.type === 'obstacle-toggle') scene.obstacle.on = !scene.obstacle.on;
  else if (action.type === 'obstacle-move') scene.obstacle.x = coordinate(action.x, scene.obstacle.x, 54, 87);
  else if (action.type === 'target') scene.target = coordinate(action.x, scene.target, 54, 90);
  else if (action.type === 'situation' && ROLLING_SITUATIONS.includes(action.situation)) {
    scene.situation = action.situation;
    if (action.situation === 'landing') { scene.obstacle.on = true; scene.obstacle.x = 70; scene.target = 84; }
    else scene.obstacle.on = false;
  } else if (action.type === 'try') {
    if (scene.rollingDay?.episode === 'prediction' && !scene.rollingDay.prediction) throw rollingError('rolling-day-prediction-needed');
    scene.outcome = rollOutcome(scene);
    const pair = scene.rollingDay?.comparison;
    if (pair && !pair.second && !sameRollingSetup(pair.first, scene)) pair.second = trialFrom(scene);
    return scene;
  }
  else if (action.type === 'reset') return { ...newRollingScene(), instance: scene.instance, ...(has(scene, 'pictureView') ? { pictureView: scene.pictureView } : {}) };
  if (JSON.stringify(scene) !== before) scene.outcome = null;
  return scene;
}
export function rollingOutcomeText(scene) {
  const result = scene.outcome;
  if (!scene.instance) return 'Choose a picture toy from your basket.';
  if (!result) return scene.situation === 'landing' ? 'Move the block or landing mat. Change the hill and push, then Try.' : isRollingStarter(scene.instance) ? 'Tap Try to roll the starter flower. Change the hill or push and try again.' : 'Change the hill or push, then Try your picture toy.';
  return { blocked: 'The block stopped your toy. Move it, or take it away and try again.', landed: 'Your toy stopped on the landing mat!',
    short: 'Your toy stopped before the mat. Try a higher hill, a bigger push, or move the mat.', past: 'Your toy rolled beyond the mat. Try a gentler push, a lower hill, or move the mat.',
    stop: 'Your toy stopped here. Change the hill or push and try again.' }[result.kind];
}
export function normalizeRollingRun(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  if (source.v != null && source.v !== ROLLING_RUN_VERSION) throw rollingError('rolling-version');
  // Reject unsupported authored work even in legacy rows that would be skipped,
  // or Undo entries beyond the retained window. Never silently discard it.
  for (const scene of [source.current, source.parked, ...(Array.isArray(source.undo) ? source.undo : []),
    ...(Array.isArray(source.saved) ? source.saved.map(row => row?.scene) : [])]) {
    if (has(scene, 'rollingDay') || has(scene, 'pictureView')) normalizeRollingScene(scene);
  }
  const ids = new Set(), saved = [];
  for (const row of Array.isArray(source.saved) ? source.saved : []) {
    if (!id(row?.id) || ids.has(row.id) || !row.scene || !Number.isFinite(row.at) || row.at < 0 || row.at > 8640000000000000) continue;
    const scene = normalizeRollingScene(row.scene); if (!scene.instance) continue;
    ids.add(row.id); saved.push({ id: row.id, at: Math.round(row.at), owner: owner(row.owner), scene });
  }
  if (saved.length > ROLLING_MAX_SAVES) throw rollingError('rolling-full');
  const parked = normalizeRollingScene(source.parked);
  const result = { v: ROLLING_RUN_VERSION, current: normalizeRollingScene(source.current), parked: parked.instance ? parked : null,
    undo: (Array.isArray(source.undo) ? source.undo : []).slice(-ROLLING_MAX_UNDO).map(normalizeRollingScene), saved };
  if (rollingRunBytes(result) > ROLLING_MAX_BYTES) throw rollingError('rolling-capacity');
  return result;
}
export function rollingRunBytes(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
export function rollingSavedPage(saved, page = 0, child = null) {
  const rows = child ? saved.filter(row => row.owner === child || row.owner === 'shared') : saved;
  const pages = Math.max(1, Math.ceil(rows.length / ROLLING_PAGE_SIZE)), index = Math.max(0, Math.min(pages - 1, Math.floor(Number(page) || 0)));
  return { page: index, pages, items: clone(rows.slice(index * ROLLING_PAGE_SIZE, (index + 1) * ROLLING_PAGE_SIZE)) };
}
export { clone as cloneRollingRun };
