import { installIdleHelp } from '../idle-help.js';
import speech from '../../audio/speech.js';
import router, { homeButton, muteButton, iconSVG, tapify } from '../router.js';
import art from '../art.js';
import bus from '../bus.js';
import LivingGuidance from '../living-guidance.js';
import { livingPlayGuideKey, LIVING_PLAY_OUTCOME_KEYS } from '../../data/living-play-phrases.js';
import settings from '../../state/settings.js';
import session from '../../state/session.js';
import { pictureView, inspectPictureView } from '../picture-view.js';
import { picturePNGSize, PICTURE_VIEW_MAX_PIXELS } from '../../data/picture-view.js';
import gallery from '../../parent/gallery.js';
import * as db from '../../state/db.js';
import { savedWorld } from '../../state/saved-world.js';
import { isCreationRow } from '../../state/creation-frame.js';
import { loadToyWorkshop, getToyWorkshop } from '../../state/toy-workshop.js';
import { toyBasketPage } from '../../data/toy-workshop.js';
import { WorkshopVisit, WorkshopPointers } from './toy-workshop.js';
import { RIVER_DIRECTIONS, RIVER_PAGE_SIZE, RIVER_WATER, normalizeRiverScene, riverOutcomeText, editRiverScene, riverDayReadiness, riverDayChoices, riverDayOutcome } from '../../data/river-run.js';
import { RIVER_DAY_LABELS, RIVER_DAY_EPISODES } from '../../data/river-day.js';
import { checkpointLivingScene, commitLivingPlacement } from './music-band.js';
import { makeToyOuting } from '../../data/toy-outing.js';
import * as riverStore from '../../state/river-run.js';
import { loadRiverRun, riverRunView, changeRiverRun, undoRiverRun, useRiverPicture, useRiverToy, riverPicture,
  keepRiverRun, reopenRiverRun, riverRunPage, flushRiverRun, riverRunStatus, startRiverDay } from '../../state/river-run.js';

export const RIVER_ART = Object.freeze({ float: 'river-run/float-v1', dock: 'river-run/dock-v1', stone: 'river-run/stone-v1' });
export const RIVER_FLOAT_CONTACT = Object.freeze({ width: 2172, height: 724, support: 233, foot: 607 });
export const RIVER_DOCK_CONTACT = Object.freeze({ width: 2172, height: 724, left: 30, right: 2143, back: 111, anchor: 112, surface: 344, front: 506, foot: 652 });
const arrows = { east: '→', south: '↓', west: '←', north: '↑' };
const names = { east: 'right', south: 'down', west: 'left', north: 'up' };
const guests = Object.freeze({
  ba: { name: 'Ba', art: 'characters/family_grandma_idle', canvas: [480,640], crop: [116,16,363,624] },
  ishan: { name: 'Ishan', art: 'characters/family_ishan_idle', canvas: [480,640], crop: [16,33,464,606] },
  mama: { name: 'Mama', art: 'characters/family_adult1_idle', canvas: [504,589], crop: [87,14,391,577] },
});
// Additive generated poses. The existing visitor position, feet and native deck
// remain the same; only a completed meeting changes the visible expression.
const greetingGuests = Object.freeze({
  ba: { art: 'river-run/ba-greeting-v1', canvas: [1086,1448], crop: [220,33,823,1414] },
  ishan: { art: 'river-run/ishan-greeting-v1', canvas: [1086,1448], crop: [39,69,1055,1362] },
});
const pictureIcon = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="8" width="48" height="43" rx="6" fill="#fff9e5" stroke="currentColor" stroke-width="3"/><path d="m12 43 14-18 12 10 8-8 7 16" fill="#abcbaa"/><circle cx="23" cy="19" r="5" fill="#f0ce7e"/></svg>';
const waterIcon = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 21q12-12 24 0t24 0M8 34q12-12 24 0t24 0M8 47q12-12 24 0t24 0" fill="none" stroke="#5b9daa" stroke-width="5" stroke-linecap="round"/></svg>';

/** Full paper plus support fit inside the board at every selectable river point.
 * Geometry concerns the whole PNG canvas, never a crop of the child's marks. */
export function riverGeometry(width, height) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const size = Math.max(1, Math.min(300, w * .22, h * .70)), paperRatio = h < 180 && w > h ? .65 : .90;
  const totalHeight = size * (paperRatio + (RIVER_FLOAT_CONTACT.height - RIVER_FLOAT_CONTACT.support) / RIVER_FLOAT_CONTACT.width);
  const anchor = size * (paperRatio + (RIVER_FLOAT_CONTACT.foot - RIVER_FLOAT_CONTACT.support) / RIVER_FLOAT_CONTACT.width);
  const top = Math.max(h * .30, anchor + Math.min(4, h * .02)), bottom = Math.max(top, h * .82 - Math.max(0, totalHeight - anchor));
  const toPixel = point => ({ x: w * point.x / 100, y: top + (point.y - RIVER_WATER.top) / (RIVER_WATER.bottom - RIVER_WATER.top) * (bottom - top) });
  const stoneWidth = Math.min(115, Math.max(44, w * .12));
  return { width: w, height: h, size, totalHeight, anchor, paperRatio, paperSize: size * paperRatio, floatTop: size * (paperRatio - RIVER_FLOAT_CONTACT.support / RIVER_FLOAT_CONTACT.width),
    contactX: (size * (1067 / 2172) + stoneWidth * (828 / 1774)) / w * 100,
    contactY: Math.min(64, Math.max(.1,
      (size * (607 - 233) / 2172 + stoneWidth * (725 - 179) / 1774) / 2
      / Math.max(.1, (bottom - top) / (RIVER_WATER.bottom - RIVER_WATER.top)))),
    point: toPixel,
    fromPixel: point => ({ x: point.x / w * 100, y: RIVER_WATER.top + (point.y - top) / Math.max(1, bottom - top) * (RIVER_WATER.bottom - RIVER_WATER.top) }),
    bounds: point => { const p = toPixel(point); return { left: p.x - size / 2, top: p.y - anchor, right: p.x + size / 2, bottom: p.y - anchor + totalHeight }; } };
}
export function riverSaveMessage(result, issue) {
  if (issue === 'river-full' || issue === 'river-capacity') return 'The trip shelf is full. This picture, arrangement and earlier trips are still here.';
  if (issue === 'river-picture-needed') return 'Choose your own picture first.';
  if (issue === 'river-float-needed') return 'Tap the float to put it under your picture.';
  if (issue) return 'This trip could not be kept. Your picture and arrangement are still here. Try Keep again.';
  return result?.persistent ? 'Your trip is kept, saved on this device.' : 'Your trip is kept for now. Device saving is unavailable; it may disappear when this page closes.';
}
const visit = new WorkshopVisit();
let enteredFromMap = false;
let host, board, controls, status, sheet, mute, pointers, offSettings, observer, view, guidance, ready = false, saving = false, openingRiver = false, riverLoadRetry = null;
let selected = null, drag = null, motion = null, motionTimer = 0, sheetKind = '', pageIndex = 0, pickerSerial = 0, rows = [], listeners = [], checkpointing = false;
let transferring = false, openingNotice = '', idleHelp = null, idleMotion = null;
let pictureInspection = null;
function abortPictureInspection() { pictureInspection?.abort(); pictureInspection = null; }
export async function transferRiverPicnic({ held, alive, checkpoint, readScene, readPNG, keep, go, report = () => {} }) {
  if (held() || !alive()) return false;
  if (!await checkpoint() || !alive() || held()) return false;
  const scene = JSON.parse(JSON.stringify(readScene())), png = readPNG();
  try {
    // Validate before Keep so a malformed proposal cannot reward a different trip.
    normalizeRiverScene(scene, png);
    makeToyOuting({ scene, png, id: 'river-picnic-proposal' });
    const saved = await keep();
    if (!alive() || held()) return false;
    const outing = makeToyOuting({ scene, png, id: saved.id });
    return (await go('picnic', { outing })) !== false;
  } catch (error) { if (alive()) report(error); return false; }
}
const current = () => view.current;
function listen(target, type, fn, options) { target.addEventListener(type, fn, options); listeners.push(() => target.removeEventListener(type, fn, options)); }
function button(label, text, action, icon = '') {
  const el = document.createElement('button'), born = pickerSerial; el.type = 'button'; el.className = 'river-button'; el.setAttribute('aria-label', label); el.innerHTML = icon;
  if (text) { const span = document.createElement('span'); span.textContent = text; el.append(span); }
  tapify(el, event => {
    if (checkpointing || saving || transferring || !visit.active || !el.isConnected || router.isMoving() || !(ready || el.closest('.river-navigation') || 'loadRetry' in el.dataset)) return;
    if (el.closest('.river-sheet') && (sheet?.hidden || !sheetKind || born !== pickerSerial)) return;
    for (let ancestor = el; ancestor && ancestor !== host; ancestor = ancestor.parentNode) if (ancestor.inert) return;
    openingNotice='';if (!('help' in el.dataset)) guidance?.interrupt(); action(event);
  }); return el;
}
function image(key, className = '') {
  const img = document.createElement('img'); img.src = art.get(key)?.src || `assets/art/final/${key}.png`; img.alt = ''; img.draggable = false; img.className = className; return img;
}
function message(text) { if (status) status.textContent = text; }
function reduced() { return settings.get().reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function stopMotion() { motion?.cancel(); motion = null; clearTimeout(motionTimer); motionTimer = 0; board?.classList.remove('river-is-floating'); }
function cancelTransient() { abortPictureInspection(); guidance?.interrupt(); stopMotion(); drag = null; selected = null; pointers?.cancel(performance.now()); board?.classList.remove('river-is-dragging', 'is-guided'); }
function refresh() { view = riverRunView(); }
export function riverDayCaption(scene) {
  const day = scene.riverDay;
  if (!day || !scene.instance || !scene.attached) return riverOutcomeText(scene);
  if (day.episode === 'meeting-place') {
    if (!day.guest) return 'Choose Ba or Ishan in Choices. Then launch your picture to see where it goes.';
    if (riverDayOutcome(scene).arrived) return `${guests[day.guest].name} meets your picture at the dock. Move the start, water or dock to try another visit.`;
    return `${guests[day.guest].name} is waiting at your dock. ${riverOutcomeText(scene)}`;
  }
  if (day.journeys.second) return 'Both real journeys are kept. Open Choices to return to either one, or keep changing this trip.';
  if (day.episode === 'changed-current' && !day.condition) return 'The first real trip is kept. Open Choices for different water or a stone, then Launch.';
  if (day.episode === 'stopping-place' && !day.resolution) return 'The first real trip is kept. Open Choices for a dock at that stop or another route to your dock.';
  return riverOutcomeText(scene) + ' Your first real trip is still kept in Choices.';
}
function dayGuideKey(scene) {
  const day = scene?.riverDay; if (!day || !scene.instance || !scene.attached) return null;
  if (day.episode === 'meeting-place') return !day.guest ? 'living_river_day_meeting' : riverDayOutcome(scene).arrived ? `living_river_day_${day.guest}_arrived` : `living_river_day_${day.guest}`;
  if (day.journeys.second) return 'living_river_day_compared';
  const choices = riverDayChoices(scene);
  if (day.episode === 'changed-current' && !day.condition && choices.some(choice => choice.id === 'current') && choices.some(choice => choice.id === 'stone')) return 'living_river_day_changed';
  if (day.episode === 'stopping-place' && !day.resolution && choices.length === 2) return 'living_river_day_stop';
  return 'living_river_launch';
}
function guestPortrait(id, height, greeting = false) {
  const metric = greeting ? greetingGuests[id] : guests[id], scale = height / (metric.crop[3] - metric.crop[1]);
  const crop = document.createElement('div'); crop.className = 'river-guest-crop'; crop.style.width = `${(metric.crop[2] - metric.crop[0]) * scale}px`; crop.style.height = `${height}px`;
  const portrait = image(metric.art); portrait.style.width = `${metric.canvas[0] * scale}px`; portrait.style.height = `${metric.canvas[1] * scale}px`; portrait.style.left = `${-metric.crop[0] * scale}px`; portrait.style.top = `${-metric.crop[1] * scale}px`; crop.append(portrait); return crop;
}
export function riverGuestX(geometry, dock, portraitWidth, avoidX = null) {
  // Leave room for the whole arriving float and the guest's face. Put the
  // guest toward the open side so edge docks cannot clip the portrait.
  // A real dock catch can stop up to eight river units from its center.
  const separation = geometry.size / 2 + portraitWidth / 2 + geometry.width * .08 + 10;
  const clamp = x => Math.max(portraitWidth / 2 + 3, Math.min(geometry.width - portraitWidth / 2 - 3, x));
  const sign = dock.x > geometry.width / 2 ? -1 : 1, candidates = [clamp(dock.x + sign * separation), clamp(dock.x - sign * separation)];
  if (Number.isFinite(avoidX)) {
    const clearance = geometry.size / 2 + portraitWidth / 2 + 8;
    return candidates.find(x => Math.abs(x - avoidX) >= clearance) ?? candidates.sort((a, b) => Math.abs(b - avoidX) - Math.abs(a - avoidX))[0];
  }
  return candidates[0];
}
/** The selected landing and cropped visitor feet share one native deck plane.
 * Modules keep the dock's natural aspect instead of stretching it vertically
 * when a wide support must fit a short landscape board. These are toy contacts. */
export function riverLandingGeometry(geometry, scene, { guestHeight = null } = {}) {
  const dock = geometry.point(scene.dock), metric = RIVER_DOCK_CONTACT;
  const id = scene.riverDay?.episode === 'meeting-place' ? scene.riverDay.guest : scene.mama ? 'mama' : '';
  const margin = Math.min(3, geometry.width * .02);
  const nominal = Math.min(170, Math.max(52, geometry.width * .16), geometry.width - margin * 2);
  const tileWidth = Math.max(1, Math.min(nominal, (geometry.height - margin - dock.y) * metric.width / (metric.foot - metric.anchor)));
  let left = Math.max(margin, dock.x - nominal / 2), right = Math.min(geometry.width - margin, dock.x + nominal / 2), guest = null;
  if (id) {
    const person = guests[id], ratio = id === 'ba' ? .28 : id === 'mama' ? .25 : .23;
    const height = Math.max(1, Math.min(guestHeight ?? Math.min(140, Math.max(40, geometry.height * ratio)), dock.y - margin));
    const width = height * (person.crop[2] - person.crop[0]) / (person.crop[3] - person.crop[1]);
    // Choose the open side from the already chosen vertical lane, before its
    // launch. An arriving picture never makes the visitor teleport elsewhere.
    const avoidX = ['north', 'south'].includes(scene.direction) ? geometry.point(scene.origin).x : null;
    const x = riverGuestX(geometry, dock, width, avoidX);
    left = Math.max(margin, Math.min(left, x - width / 2 - 8)); right = Math.min(geometry.width - margin, Math.max(right, x + width / 2 + 8));
    guest = { id, x, width, height, footY: dock.y + tileWidth * (metric.surface - metric.anchor) / metric.width };
  }
  const width = right - left, count = Math.max(1, Math.ceil(Math.max(0, width - tileWidth) / (tileWidth * .8)) + 1);
  const tiles = Array.from({ length: count }, (_, i) => ({ x: left + tileWidth / 2 + (count === 1 ? 0 : i * (width - tileWidth) / (count - 1)), width: tileWidth }));
  const yUnit = Math.max(.001, (geometry.point({ x: 50, y: 78 }).y - geometry.point({ x: 50, y: 30 }).y) / 48);
  const hullHalf = geometry.size * 1068 / RIVER_FLOAT_CONTACT.width, hullHeight = geometry.size * (RIVER_FLOAT_CONTACT.foot - 232) / RIVER_FLOAT_CONTACT.width;
  const rounded = value => Math.round(value * 1e6) / 1e6;
  const dockContact = { v: 1,
    left: rounded((dock.x - left - tileWidth * metric.left / metric.width + hullHalf) / geometry.width * 100),
    right: rounded((right - dock.x - tileWidth * (metric.width - metric.right) / metric.width + hullHalf) / geometry.width * 100),
    top: rounded(tileWidth * (metric.anchor - metric.back) / metric.width / yUnit),
    bottom: rounded((tileWidth * (metric.front - metric.anchor) / metric.width + hullHeight) / yUnit) };
  return { left, right, width, center: (left + right) / 2, y: dock.y, tileWidth, tiles, guest, dockContact,
    body: { left: left + tileWidth * metric.left / metric.width, right: right - tileWidth * (metric.width - metric.right) / metric.width,
      top: dock.y + tileWidth * (metric.back - metric.anchor) / metric.width, bottom: dock.y + tileWidth * (metric.front - metric.anchor) / metric.width } };
}
function paintGuest(scene, geometry, landing) {
  const guest = landing.guest; if (!guest) return; const { id, x, width, height, footY } = guest;
  const portrait = guestPortrait(id, height), mama = id === 'mama';
  const visitor = button(mama ? 'Mama is at your landing place. Tap to let her rest.' : `${guests[id].name} is at your dock. Tap for meeting choices.`, guests[id].name,
    () => mama ? change({ type: 'mama', join: false }) : openSheet('day-options'));
  visitor.classList.add('river-guest'); if (mama) visitor.classList.add('river-mama'); else visitor.dataset.guest = id;
  visitor.style.left = `${x}px`; visitor.style.top = `${footY - height}px`; visitor.style.width = `${Math.max(44, width)}px`; visitor.style.height = `${height + 18}px`;
  visitor.prepend(portrait);
  const arrived = mama ? scene.outcome?.kind === 'mama' : riverDayOutcome(scene).arrived;
  visitor.classList.toggle('river-caught', arrived);
  if (arrived && greetingGuests[id]) {
    const greeting = guestPortrait(id, height, true);
    portrait.classList.add('river-guest-waiting'); greeting.classList.add('river-guest-greeting');
    visitor.classList.add('river-has-greeting'); visitor.append(greeting);
  }
  board.append(visitor);
}
function figure(png, attached, frame = null) {
  const el = document.createElement('div'); el.className = 'river-picture-toy'; el.classList.toggle('river-attached', attached);
  if (attached) el.append(image(RIVER_ART.float, 'river-float-art'));
  const paper = document.createElement('div'); paper.className = 'river-paper'; paper.append(pictureView(png,frame,'',frame ? 'Your chosen picture view; the whole original stays unchanged and available' : 'Your exact whole picture')); el.append(paper); return el;
}
function placeFigure(el, point, geometry) {
  el.style.setProperty('--river-paper-width', `${geometry.paperRatio * 100}%`); el.style.setProperty('--river-paper-left', `${(1 - geometry.paperRatio) * 50}%`); el.style.setProperty('--river-paper-height', `${geometry.paperSize / geometry.totalHeight * 100}%`); el.style.setProperty('--river-float-top', `${geometry.floatTop / geometry.totalHeight * 100}%`);
  const pixel = geometry.point(point); el.style.width = `${geometry.size}px`; el.style.height = `${geometry.totalHeight}px`; el.style.left = `${pixel.x}px`; el.style.top = `${pixel.y - geometry.anchor}px`;
}
function partButton(kind, point, key, caption, landing = null) {
  const el = button(`Move the ${caption}. Tap it then the water, or drag it.`, '', () => pick(kind)); el.classList.add(`river-${kind}`); el.dataset.part = kind;
  const position = riverGeometry(board.clientWidth, board.clientHeight).point(point);
  if (kind === 'dock' && landing) {
    el.style.left = `${landing.center}px`; el.style.top = `${landing.y - 11}px`; el.style.width = `${landing.width}px`; el.style.height = '44px';
    for (const tile of landing.tiles) { const sprite = image(key); sprite.style.position = 'absolute'; sprite.style.left = `${tile.x - tile.width / 2 - landing.left}px`; sprite.style.width = `${tile.width}px`; sprite.style.height = 'auto'; sprite.style.top = `${11 - tile.width * RIVER_DOCK_CONTACT.anchor / RIVER_DOCK_CONTACT.width}px`; el.append(sprite); }
    el.setAttribute('aria-pressed', String(selected === kind)); el.addEventListener('pointerdown', event => startDrag(event, kind)); return el;
  }
  const sprite = image(key); el.append(sprite); el.style.left = `${position.x}px`;
  const spriteWidth = kind === 'dock' ? Math.min(170, Math.max(52, board.clientWidth * .16)) : Math.min(115, Math.max(44, board.clientWidth * .12));
  el.style.width = `${spriteWidth}px`; el.style.height = '44px';
  const inset = kind === 'dock' ? 11 : 44;
  el.style.top = `${position.y - inset}px`; sprite.style.position = 'absolute'; sprite.style.left = '0'; sprite.style.width = '100%'; sprite.style.height = 'auto';
  sprite.style.top = `${inset - spriteWidth * (kind === 'dock' ? 112 / 2172 : 725 / 1774)}px`;
  el.setAttribute('aria-pressed', String(selected === kind)); el.addEventListener('pointerdown', event => startDrag(event, kind)); return el;
}
function paint() {
  if (!visit.active || !view) return; const scene = current(), geometry = riverGeometry(board.clientWidth, board.clientHeight); board.replaceChildren();
  const water = document.createElement('div'); water.className = 'river-water'; water.setAttribute('aria-hidden', 'true');
  const marks = document.createElement('div'); marks.className = 'river-current-marks'; marks.textContent = scene.strength ? Array.from({ length: scene.strength === 2 ? 12 : 6 }, () => arrows[scene.direction]).join('　') : '﹏　﹏　﹏'; water.append(marks); board.append(water);
  const landing = riverLandingGeometry(geometry, scene), dock = partButton('dock', scene.dock, RIVER_ART.dock, 'landing dock', landing); board.append(dock);
  paintGuest(scene, geometry, landing);
  if (scene.stone.on) board.append(partButton('stone', scene.stone, RIVER_ART.stone, 'stone'));
  if (!scene.instance) {
    const choose = button('Choose your own exact picture to float', 'Your picture', () => openSheet('choose'), pictureIcon); choose.classList.add('river-first-action'); board.append(choose);
  } else {
    const toy = figure(riverPicture(), scene.attached, scene.pictureView); toy.dataset.part = 'origin'; const point = scene.outcome?.end || scene.origin; placeFigure(toy, point, geometry); board.append(toy);
    if (!scene.attached) {
      const float = button('Put this float under your picture. Tap, or drag it to the picture.', 'Float', () => change({ type: 'attach' })); float.classList.add('river-attach', 'river-touch-invitation'); float.dataset.part = 'attach'; float.append(image(RIVER_ART.float));
      float.addEventListener('pointerdown', event => startDrag(event, 'attach')); board.append(float);
    } else {
      const move = button('Move your picture’s start. Tap it then the water, or drag it.', '', () => pick('origin')); move.classList.add('river-origin-touch'); move.dataset.part = 'origin';
      move.style.width = `${Math.max(44, geometry.size)}px`; move.style.height = `${Math.max(44, geometry.totalHeight)}px`; move.style.left = `${geometry.point(point).x}px`; move.style.top = `${geometry.point(point).y - geometry.anchor}px`;
      move.setAttribute('aria-pressed', String(selected === 'origin')); move.addEventListener('pointerdown', event => startDrag(event, 'origin')); board.append(move);
    }
    if (scene.outcome) {
      const trail = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); trail.classList.add('river-trail'); trail.setAttribute('viewBox', '0 0 100 100'); trail.setAttribute('preserveAspectRatio', 'none'); trail.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(trail.namespaceURI, 'path'); path.setAttribute('d', scene.outcome.path.map((point, i) => { const pixel = geometry.point(point); return `${i ? 'L' : 'M'}${pixel.x / geometry.width * 100} ${pixel.y / geometry.height * 100}`; }).join(' ')); trail.append(path); board.insertBefore(trail, dock);
      const marker = document.createElement('span'); marker.className = 'river-result'; marker.style.left = `${geometry.point(scene.outcome.end).x}px`; marker.style.top = `${geometry.point(scene.outcome.end).y}px`; marker.textContent = ['dock', 'mama'].includes(scene.outcome.kind) ? '♡' : '●'; marker.setAttribute('aria-hidden', 'true'); board.append(marker);
    }
  }
  const wind = button(`Current goes ${names[scene.direction]}. Tap to change its direction.`, '', () => { const choices = Object.keys(RIVER_DIRECTIONS); change({ type: 'direction', direction: choices[(choices.indexOf(scene.direction) + 1) % choices.length] }); }, `<span class="river-arrow" aria-hidden="true">${arrows[scene.direction]}</span>`); wind.classList.add('river-direction'); board.append(wind);
  const flow = button(`Water is ${['still', 'gentle', 'strong'][scene.strength]}. Tap to change.`, '', () => change({ type: 'strength', strength: (scene.strength + 1) % 3 }), waterIcon); flow.classList.add('river-strength'); flow.dataset.strength = scene.strength;
  const marksLabel = document.createElement('span'); marksLabel.textContent = ['Still', 'Gentle', 'Strong'][scene.strength]; flow.append(marksLabel); board.append(flow);
  controls.querySelector('[data-launch]').disabled = !scene.instance || !scene.attached || saving;
  controls.querySelector('[data-keep]').disabled = !scene.instance || !scene.attached || saving;
  controls.querySelector('[data-undo]').disabled = !view.undoCount;
  const waterChoice = controls.querySelector('[data-water]'); waterChoice.querySelector('span').textContent = scene.riverDay ? 'Choices' : 'Water';
  host.querySelector('[data-help]').disabled = !ready || saving || checkpointing || transferring;
  const pictureControl = host.querySelector('[data-picture-view]'); pictureControl.hidden = !scene.instance; pictureControl.disabled = !ready || saving || checkpointing || transferring;
  const picnic = controls.querySelector('[data-picnic]'); picnic.hidden = !scene.attached; picnic.disabled = saving;
  picnic.setAttribute('aria-label', scene.outcome?.kind === 'mama' ? 'Mama caught your toy. Keep this trip and bring it to our river picnic.' : 'Keep this river trial and bring your own toy to our river picnic. Every journey can join.');
}
function change(action) {
  abortPictureInspection(); guidance?.interrupt(); board.classList.remove('is-guided'); stopMotion();
  try {
    if (!changeRiverRun(action)) { refresh(); paint(); const issue = riverRunStatus().issue; message(issue && issue !== 'river-temporary' ? riverSaveMessage(null, issue) : riverDayCaption(current())); return false; }
    refresh(); paint(); message(riverDayCaption(current()));
    if (action.type === 'attach' || action.type === 'river-day-guest') guidance?.guide(false);
    return true;
  } catch (error) {
    message(error.code === 'river-day-proposal-stale' ? 'Your river changed. Open Choices to see its new possibilities. Your earlier trip is still here.' : 'That choice could not be applied. Your picture, river and earlier trips are still here.'); return false;
  }
}
function pick(part) { guidance?.interrupt(); board.classList.remove('is-guided'); stopMotion(); selected = selected === part ? null : part; paint(); if (selected) { board.focus({ preventScroll: true }); message(`Tap the water to move ${part === 'origin' ? 'your picture’s start' : `the ${part === 'dock' ? 'landing dock' : 'stone'}`}.`); } else message(riverDayCaption(current())); }
function help() {
  if (!ready || saving || checkpointing || transferring || sheetKind || drag || pointers?.active != null) return;
  if (current().riverDay) { void openSheet('day-options'); return; }
  const choice = selected;
  cancelTransient(); selected = choice; paint(); board.classList.add('is-guided'); guidance?.guide(true);
}
function coordinate(clientX, clientY) { const rect = board.getBoundingClientRect(), point = riverGeometry(board.clientWidth, board.clientHeight).fromPixel({ x: clientX - rect.left - board.clientLeft, y: clientY - rect.top - board.clientTop }); return { x: Math.max(RIVER_WATER.left, Math.min(RIVER_WATER.right, point.x)), y: Math.max(RIVER_WATER.top, Math.min(RIVER_WATER.bottom, point.y)) }; }
function startDrag(event, part) {
  if (!ready || !pointers.owns(event) || saving) return; stopMotion();
  drag = { id: event.pointerId, part, x: event.clientX, y: event.clientY, moved: false, position: null };
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* OS interruption */ }
}
function moveDrag(event) {
  if (!drag || drag.id !== event.pointerId) return; drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8;
  if (!drag.moved) return; drag.lastClient = { x: event.clientX, y: event.clientY }; drag.position = coordinate(event.clientX, event.clientY); board.classList.add('river-is-dragging');
  if (drag.part === 'attach') return;
  const part = board.querySelector(drag.part === 'origin' ? '.river-picture-toy' : `[data-part="${drag.part}"]`);
  if (part && drag.part === 'origin') placeFigure(part, drag.position, riverGeometry(board.clientWidth, board.clientHeight));
  else if (part) { const point = riverGeometry(board.clientWidth, board.clientHeight).point(drag.position); part.style.left = `${point.x}px`; part.style.top = `${point.y - (drag.part === 'dock' ? 11 : 44)}px`; }
}
function endDrag(event) {
  if (!drag || drag.id !== event.pointerId) { pointers.finish(event, performance.now()); return; }
  const completed = drag; drag = null; pointers.finish(event, performance.now(), completed.moved); board.classList.remove('river-is-dragging');
  if (!completed.moved) return; selected = null;
  if (completed.part === 'attach') {
    const rect = board.querySelector('.river-picture-toy')?.getBoundingClientRect();
    if (rect && event.clientX >= rect.left - 55 && event.clientX <= rect.right + 55 && event.clientY >= rect.top - 55 && event.clientY <= rect.bottom + 70) change({ type: 'attach' });
    else { paint(); message('Tap the float to put it under your picture.'); }
  } else if (completed.position) change({ type: completed.part, ...completed.position });
}
function launch() {
  if (saving || !current().attached) return;
  if (current().riverDay?.episode === 'meeting-place' && !current().riverDay.guest) { void openSheet('day-options'); return; }
  cancelTransient();
  const contact = riverGeometry(board.clientWidth, board.clientHeight);
  try { if (!changeRiverRun({ type: 'launch', contactX: contact.contactX, contactY: contact.contactY, dockContact: riverLandingGeometry(contact, current()).dockContact }) && riverRunStatus().issue && riverRunStatus().issue !== 'river-temporary') { message(riverSaveMessage(null, riverRunStatus().issue)); return; } }
  catch { message('This trip could not launch. Your picture and river are still here. Open Choices and try again.'); return; }
  refresh(); paint(); message(riverDayCaption(current()));
  const trial = current().outcome;
  if (!trial) { message(riverSaveMessage(null, riverRunStatus().issue)); return; }
  const meeting = riverDayOutcome(current()), dayKey = meeting?.arrived ? `living_river_day_${meeting.guest}_arrived` : meeting?.journeys?.second ? 'living_river_day_compared' : null;
  const speak = (settled = null, delay = 0) => guidance?.after(dayKey || LIVING_PLAY_OUTCOME_KEYS['river-run'][trial.kind], { settled, delay,
    guard: () => current().outcome === trial && !!board.querySelector('.river-picture-toy') &&
      (trial.kind !== 'mama' || (current().mama && !!board.querySelector('.river-mama'))) &&
      (!meeting?.arrived || (riverDayOutcome(current())?.guest === meeting.guest && !!board.querySelector(`[data-guest="${meeting.guest}"]`))) });
  if (reduced() || trial.path.length < 2) { speak(); return; }
  const toy = board.querySelector('.river-picture-toy'), geometry = riverGeometry(board.clientWidth, board.clientHeight), token = visit.serial;
  if (!toy?.animate) { speak(); return; }
  motion = toy.animate(current().outcome.path.map(point => { const pixel = geometry.point(point); return { left: `${pixel.x}px`, top: `${pixel.y - geometry.anchor}px` }; }), { duration: 1300, easing: 'linear' }); board.classList.add('river-is-floating');
  message('Watch your float travel.');
  motionTimer = setTimeout(() => { if (visit.valid(token)) { motion = null; board.classList.remove('river-is-floating'); } }, 1400);
  speak(motion.finished, motion.finished ? 0 : 1400);
}
async function keep() {
  if (saving) return; cancelTransient(); saving = true; paint(); const token = visit.serial; message('Keeping your trip…');
  try { const result = await keepRiverRun(); if (visit.valid(token)) message(riverSaveMessage(result)); }
  catch (error) { if (visit.valid(token)) message(riverSaveMessage(null, error.code || 'river-write')); }
  finally { if (visit.valid(token)) { saving = false; refresh(); paint(); } }
}
async function goPicnic() {
  if (saving || transferring || checkpointing || drag || pointers?.active !== null) { message('Finish this move, then bring your toy to the picnic.'); return false; }
  const token = visit.serial; transferring = true;
  try {
    return await transferRiverPicnic({ held: () => !!drag, alive: () => visit.valid(token), checkpoint: checkpointRiver,
      readScene: current, readPNG: riverPicture,
      keep: () => { saving = true; paint(); message('Keeping this trip for our picnic…'); return keepRiverRun(); },
      go: (id, params) => { saving = transferring = false; refresh(); paint(); return router.go(id, params); },
      report: error => message(riverSaveMessage(null, error.code || 'river-write')) });
  } finally { if (visit.valid(token)) { saving = transferring = false; refresh(); paint(); } }
}
function closeSheet() { abortPictureInspection(); guidance?.interrupt(); ++pickerSerial; sheetKind = ''; sheet.hidden = true; for (const child of host.children) child.inert = false; controls.querySelector('[data-water]')?.focus({ preventScroll: true }); }
function sheetHeader(label) { abortPictureInspection(); sheet.replaceChildren(); const header = document.createElement('header'), h = document.createElement('h2'); h.textContent = label; header.append(h, button('Close choices and return to your river', 'Done', closeSheet, iconSVG('back'))); sheet.append(header); }
function paintPicture() {
  const scene = current(), instance = scene.instance;
  if (!instance) { closeSheet(); return; }
  sheetHeader('Your picture on this float');
  const token = visit.serial, request = pickerSerial, snapshot = JSON.stringify(scene), png = riverPicture(instance.asset);
  let lifetime = new AbortController(); pictureInspection = lifetime; const inspection = lifetime;
  const active = () => !lifetime.signal.aborted && visit.valid(token) && sheetKind === 'picture-view' && !sheet.hidden && request === pickerSerial
    && !saving && !checkpointing && !document.hidden && !session.isBreakLocked() && !router.isMoving() && router.current() === 'river-run'
    && JSON.stringify(riverRunView().current) === snapshot;
  const choices = document.createElement('div'); choices.className = 'river-picture-views'; sheet.append(choices);
  const note = document.createElement('p'); note.className = 'river-picture-note'; note.textContent = 'Your original stays unchanged. This changes only how the picture looks.'; sheet.append(note);
  const choose = (label, caption, frame) => {
    const choice = button(label, caption, () => {
      if (!active()) return;
      const already = JSON.stringify(scene.pictureView || null) === JSON.stringify(frame);
      if (!already && !change({ type: 'picture-view', instanceId: instance.id, assetId: instance.asset, png, frame })) {
        lifetime = new AbortController(); pictureInspection = lifetime;
        note.textContent = 'This view could not be saved. Your picture and river are still here. Use Back, or try again.'; return;
      }
      closeSheet(); message(frame ? 'All your original marks are shown closer. Your whole original is unchanged.' : 'Your whole original picture is on this float.');
    });
    choice.classList.add('river-picture-choice'); choice.prepend(pictureView(png, frame));
    choice.setAttribute('aria-pressed', String(JSON.stringify(scene.pictureView || null) === JSON.stringify(frame))); choices.append(choice); return choice;
  };
  choose('Show my whole picture on this float', 'Whole picture', null);
  const adjust = button('Move and zoom my picture view without changing the original', 'Adjust view', () => { if (active()) void openSheet('picture-adjust'); });
  adjust.classList.add('river-picture-choice'); adjust.prepend(pictureView(png, scene.pictureView, '', 'Preview of your current picture view')); choices.append(adjust);
  const original = button('See my whole original picture unchanged', 'See original', () => { if (active()) void openSheet('original'); });
  original.classList.add('river-picture-choice'); original.prepend(pictureView(png, null)); choices.append(original);
  void inspectPictureView(png, { signal: inspection.signal }).then(frame => {
    if (!active() || inspection.signal.aborted) return;
    if (frame) choices.insertBefore(choose('Show every original mark closer on this float', 'Closer marks', { v: 1, ...frame }), original);
    else note.textContent = 'Use Adjust view to move and zoom. Your whole original stays unchanged and available.';
  });
}
function paintPictureAdjust() {
  const scene = current(), instance = scene.instance, png = riverPicture(instance?.asset), size = picturePNGSize(png);
  if (!instance) { closeSheet(); return; }
  sheetHeader('Choose a closer view');
  const token = visit.serial, request = pickerSerial, snapshot = JSON.stringify(scene);
  let lifetime = new AbortController(); pictureInspection = lifetime;
  const active = () => !lifetime.signal.aborted && visit.valid(token) && sheetKind === 'picture-adjust' && !sheet.hidden && request === pickerSerial
    && !saving && !checkpointing && !document.hidden && !session.isBreakLocked() && !router.isMoving() && router.current() === 'river-run'
    && JSON.stringify(riverRunView().current) === snapshot;
  const note = document.createElement('p'); note.className = 'river-picture-note';
  note.textContent = 'Move and zoom to choose the part on your float. Some of your picture may be outside this view. The whole original stays unchanged.';
  if (!size || size.width > 4096 || size.height > 4096 || size.width * size.height > PICTURE_VIEW_MAX_PIXELS) {
    note.textContent = 'This picture cannot use an adjusted view. Whole picture and See original are still available.';
    sheet.append(note, button('Return to Whole picture and Closer marks choices', 'Picture choices', () => openSheet('picture-view'), iconSVG('back'))); return;
  }
  // Explicit temporary window over the original. No pixel inspection or export.
  let frame = scene.pictureView ? { ...scene.pictureView } : { v:1, x:Math.round(size.width / 6), y:Math.round(size.height / 6),
    width:Math.max(1,Math.round(size.width * 2 / 3)), height:Math.max(1,Math.round(size.height * 2 / 3)), sourceWidth:size.width, sourceHeight:size.height };
  frame.x = Math.min(frame.x,size.width-frame.width); frame.y = Math.min(frame.y,size.height-frame.height);
  const views = document.createElement('div'); views.className = 'river-picture-editor-views';
  const preview = document.createElement('div'); preview.className = 'river-picture-window';
  const previewLabel = document.createElement('b'); previewLabel.textContent = 'On your float';
  const previewArt = document.createElement('div'); previewArt.className = 'river-picture-window-art'; preview.append(previewLabel,previewArt);
  const whole = document.createElement('div'); whole.className = 'river-picture-navigator';
  const wholeLabel = document.createElement('b'); wholeLabel.textContent = 'Whole original';
  const navigator = pictureView(png, {x:0,y:0,width:size.width,height:size.height,sourceWidth:size.width,sourceHeight:size.height}, '', 'Whole original with the chosen view outlined');
  const viewport = document.createElementNS('http://www.w3.org/2000/svg','rect'); viewport.setAttribute('class','river-picture-viewport'); viewport.setAttribute('vector-effect','non-scaling-stroke'); navigator.append(viewport); whole.append(wholeLabel,navigator);
  views.append(preview,whole); sheet.append(views,note);
  const adjustments = document.createElement('div'); adjustments.className = 'river-picture-adjustments'; sheet.append(adjustments);
  const controls = {};
  const move = (dx,dy) => { if (!active()) return; frame.x = Math.max(0,Math.min(size.width-frame.width,frame.x+Math.max(1,Math.round(frame.width / 4))*dx));
    frame.y = Math.max(0,Math.min(size.height-frame.height,frame.y+Math.max(1,Math.round(frame.height / 4))*dy)); render(); };
  const zoom = factor => { if (!active()) return;
    const resize = (current,source) => Math.max(factor<1 ? Math.min(current,Math.ceil(source/4)) : 1,Math.min(source,
      factor>1 ? Math.max(current+1,Math.round(current*factor)) : Math.min(current-1,Math.round(current*factor))));
    const width=resize(frame.width,size.width), height=resize(frame.height,size.height);
    frame.x = Math.max(0,Math.min(size.width-width,Math.round(frame.x+(frame.width-width)/2)));
    frame.y = Math.max(0,Math.min(size.height-height,Math.round(frame.y+(frame.height-height)/2)));
    frame.width=width; frame.height=height; render(); };
  for (const [id,label,text,action] of [
    ['in','Zoom in on my picture view','＋ Zoom in',()=>zoom(2/3)], ['out','Zoom out on my picture view','− Zoom out',()=>zoom(1.5)],
    ['up','Move the viewed area up','↑ Up',()=>move(0,-1)], ['left','Move the viewed area left','← Left',()=>move(-1,0)],
    ['down','Move the viewed area down','↓ Down',()=>move(0,1)], ['right','Move the viewed area right','→ Right',()=>move(1,0)]
  ]) { controls[id]=button(label,text,action); adjustments.append(controls[id]); }
  const footer = document.createElement('div'); footer.className='river-picture-editor-actions';
  const use = button('Use this chosen picture view on my float','Use this view',()=>{
    if (!active() || !ready) return;
    const chosen = frame.width===size.width && frame.height===size.height ? null : {...frame};
    if (JSON.stringify(scene.pictureView || null)!==JSON.stringify(chosen) && !change({type:'picture-view',instanceId:instance.id,assetId:instance.asset,png,frame:chosen})) {
      // A refused save leaves this original and draft available for an explicit retry.
      lifetime=new AbortController(); pictureInspection=lifetime;
      lifetime.signal.addEventListener('abort',cancelPreview,{once:true}); use.disabled=!ready;
      note.textContent='This view could not be saved. Your picture and river are still here. Try Use this view again, or go Back.'; return;
    }
    closeSheet(); message(chosen ? 'Your chosen part of the picture is on this float. The whole original stays unchanged and available.' : 'Your whole original picture is on this float.');
  }); use.disabled=true;
  footer.append(use,button('Show the whole original in this preview','Whole picture',()=>{if(!active())return;frame={v:1,x:0,y:0,width:size.width,height:size.height,sourceWidth:size.width,sourceHeight:size.height};render();}),
    button('See my whole original picture unchanged','See original',()=>{if(active())void openSheet('original');}),
    button('Return to Whole picture and Closer marks choices','Picture choices',()=>openSheet('picture-view'),iconSVG('back'))); sheet.append(footer);
  function render() {
    previewArt.replaceChildren(pictureView(png,frame,'','Preview of the chosen part of your original picture'));
    for(const key of ['x','y','width','height']) viewport.setAttribute(key,frame[key]);
    controls.in.disabled=frame.width<=Math.ceil(size.width/4)&&frame.height<=Math.ceil(size.height/4);
    controls.out.disabled=frame.width===size.width&&frame.height===size.height;
    controls.left.disabled=frame.x===0; controls.up.disabled=frame.y===0;
    controls.right.disabled=frame.x+frame.width===size.width; controls.down.disabled=frame.y+frame.height===size.height;
  }
  render(); let ready=false; const image=new Image();
  const clear = () => { image.onload=image.onerror=null; image.removeAttribute('src'); };
  function cancelPreview() { clear(); use.disabled=true;
    if(sheetKind==='picture-adjust' && request===pickerSerial && note.isConnected) note.textContent='This preview is paused. Use Picture choices to open it again.';
  }
  lifetime.signal.addEventListener('abort',cancelPreview,{once:true});
  image.onload=()=>{if(!active()){clear();return;}ready=image.naturalWidth===size.width&&image.naturalHeight===size.height;use.disabled=!ready;
    if(!ready)note.textContent='This original could not open at its saved size. Whole picture and See original are still available.';clear();};
  image.onerror=()=>{if(active())note.textContent='This original could not open. Your picture and river are still here. Use Picture choices to try again.';clear();};
  image.src=png;
}
function paintOriginal() {
  const instance = current().instance; if (!instance) { closeSheet(); return; }
  sheetHeader('Your whole original, unchanged');
  sheet.append(pictureView(riverPicture(instance.asset), null, 'river-original-picture'));
  const note = document.createElement('p'); note.textContent = 'This is your exact original picture. Your float, view and journey stay the same.'; sheet.append(note);
  sheet.append(button('Return to Whole picture and Closer marks choices', 'Picture choices', () => openSheet('picture-view'), iconSVG('back')));
}
function pager(page, pages, paintPage) { if (pages <= 1) return; const nav = document.createElement('nav'); nav.className = 'river-pages';
  const previous = button('Earlier choices', 'Back', () => { pageIndex = page - 1; paintPage(); }, iconSVG('back')), next = button('More choices', 'More', () => { pageIndex = page + 1; paintPage(); }, iconSVG('next'));
  previous.disabled = !page; next.disabled = page >= pages - 1; const count = document.createElement('span'); count.textContent = `${page + 1} / ${pages}`; nav.append(previous, count, next); sheet.append(nav); }
function paintChoose() {
  sheetHeader('Choose a picture to float'); const options = document.createElement('div'); options.className = 'river-sheet-options';
  const pictures=button('Choose your exact drawing', 'Your pictures', () => openSheet('pictures'), pictureIcon);pictures.dataset.pictureList='';
  options.append(pictures, button('Choose a kept picture toy from the Workshop', 'Your toys', () => openSheet('toys'), iconSVG('book'))); sheet.append(options);
  if (current().instance) sheet.append(button('Choose Whole picture, Adjust view or See original for your river picture','Picture view',()=>openSheet('picture-view'),pictureIcon));
}
function paintPictures() {
  sheetHeader('Your exact pictures'); const pages = Math.max(1, Math.ceil(rows.length / RIVER_PAGE_SIZE)); pageIndex = Math.max(0, Math.min(pages - 1, pageIndex)); const grid = document.createElement('div'); grid.className = 'river-picture-grid';
  rows.slice(pageIndex * RIVER_PAGE_SIZE, (pageIndex + 1) * RIVER_PAGE_SIZE).forEach((row, index) => { const choice = button(`Choose your picture ${pageIndex * RIVER_PAGE_SIZE + index + 1}. Its whole drawing stays unchanged.`, '', () => { if (useRiverPicture(row)) { refresh(); closeSheet(); paint(); message(riverDayCaption(current())); } else message(riverSaveMessage(null, riverRunStatus().issue)); }); choice.append(figure(row.png, false)); grid.append(choice); }); sheet.append(grid);
  if (!db.status().persistent) { const warning=document.createElement('p');warning.textContent='Pictures saved on this device may be unavailable right now. Ask a grown-up to check storage before closing.';sheet.append(warning); }
  if (!rows.length) { if (db.status().persistent) { const p=document.createElement('p');p.textContent='Make a picture in the Art Room. You can bring it back to float.';sheet.append(p); } sheet.append(button('Go to the Art Room', 'Art Room', () => { void router.go('studio'); }, iconSVG('art'))); } pager(pageIndex, pages, paintPictures);
}
function paintToys() {
  sheetHeader('Your picture toys can float'); const page = toyBasketPage(rows, pageIndex, savedWorld.id === 'shared' ? null : savedWorld.id); pageIndex = page.page; const grid = document.createElement('div'); grid.className = 'river-picture-grid';
  page.items.forEach((row, index) => { const choice = button(`Choose kept toy ${page.page * 8 + index + 1} for a float. Its original Workshop behavior stays intact.`, '', () => { if (useRiverToy(row)) { refresh(); closeSheet(); paint(); message(riverDayCaption(current())); } else message(riverSaveMessage(null, riverRunStatus().issue)); }); choice.append(figure(row.png, false)); grid.append(choice); }); sheet.append(grid);
  if (!page.items.length) { const p = document.createElement('p'); p.textContent = 'Keep a picture toy in the Toy Workshop, then bring it here.'; sheet.append(p, button('Go to the Toy Workshop', 'Workshop', () => { void router.go('toy-workshop', { returnTo: 'river-run' }); }, pictureIcon)); } pager(page.page, page.pages, paintToys);
}
function paintKept() {
  sheetHeader('Your river trips'); const page = riverRunPage(pageIndex); pageIndex = page.page; const grid = document.createElement('div'); grid.className = 'river-picture-grid';
  page.items.forEach((row, index) => { const choice = button(`Open kept river trip ${page.page * RIVER_PAGE_SIZE + index + 1}.`, '', () => { cancelTransient(); const accepted=reopenRiverRun(row.id); refresh(); paint();
    if (!accepted && JSON.stringify(current())!==JSON.stringify(row.scene)) { let note=sheet.querySelector('.river-picture-note');if(!note){note=document.createElement('p');note.className='river-picture-note';sheet.append(note);}note.textContent='This kept trip could not open. Your current river and original picture are still here. Try this card again, or choose Done.';return; }
    closeSheet(); message(riverDayCaption(current())); }); choice.append(figure(riverPicture(row.scene.instance.asset), true, row.scene.pictureView)); const arrow = document.createElement('span'); arrow.className = 'river-kept-arrow'; arrow.textContent = arrows[row.scene.direction]; choice.append(arrow); grid.append(choice); }); sheet.append(grid);
  if (!page.items.length) { const p = document.createElement('p'); p.textContent = 'Keep a river trip to return to its picture, water and landing place.'; sheet.append(p); } pager(page.page, page.pages, paintKept);
}
// Previews picture the exact setup supplied by the data proposal. A proposed
// future route has no observed trail; only retained actual journeys get one.
function riverPreview(scene) {
  const preview = document.createElement('div'); preview.className = 'river-day-preview'; preview.setAttribute('aria-hidden', 'true');
  const geometry = riverGeometry(240, 145);
  const flow = document.createElement('b'); flow.className = 'river-day-flow'; flow.textContent = `${scene.strength ? arrows[scene.direction].repeat(scene.strength) : '﹏'} ${['Still','Gentle','Strong'][scene.strength]}`; preview.append(flow);
  const prop = (key, point, width, foot) => {
    const sprite = image(key, 'river-day-prop'), p = geometry.point(point); sprite.style.width = `${width / geometry.width * 100}%`; sprite.style.left = `${p.x / geometry.width * 100}%`; sprite.style.top = `${(p.y - width * foot) / geometry.height * 100}%`; preview.append(sprite);
  };
  const landing = riverLandingGeometry(geometry, scene, { guestHeight: 42 });
  for (const tile of landing.tiles) {
    const sprite = image(RIVER_ART.dock, 'river-day-prop'); sprite.style.width = `${tile.width / geometry.width * 100}%`; sprite.style.left = `${tile.x / geometry.width * 100}%`; sprite.style.top = `${(landing.y - tile.width * RIVER_DOCK_CONTACT.anchor / RIVER_DOCK_CONTACT.width) / geometry.height * 100}%`; preview.append(sprite);
  }
  if (scene.stone.on) prop(RIVER_ART.stone, scene.stone, 44, 725 / 1774);
  if (scene.instance) {
    const toy = figure(riverPicture(scene.instance.asset), scene.attached, scene.pictureView), point = geometry.point(scene.outcome?.end || scene.origin);
    toy.style.width = `${geometry.size / geometry.width * 100}%`; toy.style.height = `${geometry.totalHeight / geometry.height * 100}%`; toy.style.left = `${point.x / geometry.width * 100}%`; toy.style.top = `${(point.y - geometry.anchor) / geometry.height * 100}%`;
    toy.style.setProperty('--river-paper-width', `${geometry.paperRatio * 100}%`); toy.style.setProperty('--river-paper-left', `${(1 - geometry.paperRatio) * 50}%`); toy.style.setProperty('--river-paper-height', `${geometry.paperSize / geometry.totalHeight * 100}%`); toy.style.setProperty('--river-float-top', `${geometry.floatTop / geometry.totalHeight * 100}%`); preview.append(toy);
  }
  if (scene.outcome) {
    const trail = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); trail.classList.add('river-trail'); trail.setAttribute('viewBox', '0 0 240 145'); trail.setAttribute('preserveAspectRatio', 'none');
    const path = document.createElementNS(trail.namespaceURI, 'path'); path.setAttribute('d', scene.outcome.path.map((point, i) => { const p = geometry.point(point); return `${i ? 'L' : 'M'}${p.x} ${p.y}`; }).join(' ')); trail.append(path); preview.prepend(trail);
  }
  const guest = landing.guest;
  if (guest) {
    const portrait = guestPortrait(guest.id, guest.height), metric = guests[guest.id], cropWidth = metric.crop[2] - metric.crop[0], cropHeight = metric.crop[3] - metric.crop[1]; portrait.classList.add('river-day-visitor');
    portrait.style.width = `${guest.width / geometry.width * 100}%`; portrait.style.height = `${guest.height / geometry.height * 100}%`; portrait.style.left = `${guest.x / geometry.width * 100}%`; portrait.style.top = `${(guest.footY - guest.height) / geometry.height * 100}%`;
    const bitmap = portrait.querySelector('img'); bitmap.style.width = `${metric.canvas[0] / cropWidth * 100}%`; bitmap.style.height = `${metric.canvas[1] / cropHeight * 100}%`; bitmap.style.left = `${-metric.crop[0] / cropWidth * 100}%`; bitmap.style.top = `${-metric.crop[1] / cropHeight * 100}%`; preview.append(portrait);
  }
  return preview;
}
function dayChoice(label, text, action, scene = current()) {
  const choice = button(label, text, action); choice.classList.add('river-day-choice'); choice.prepend(riverPreview(scene)); return choice;
}
function beginDay(episode) {
  const needs = riverDayReadiness(current(), episode);
  if (!needs.ready) {
    sheetHeader(RIVER_DAY_LABELS[episode]); const note = document.createElement('p');
    note.textContent = needs.actions.includes('choose-picture') ? 'Choose one of your pictures first. Then come back to choose this beginning.' : needs.actions.includes('attach') ? 'Put the float under your picture first. Then choose this beginning.' : 'Launch your picture first so we have a real journey to keep. Then choose this beginning.'; sheet.append(note);
    const actions = document.createElement('div'); actions.className = 'river-day-footer';
    if (needs.actions.includes('choose-picture')) actions.append(button('Choose your own exact picture before starting this Playday', 'Your picture', () => openSheet('choose'), pictureIcon));
    else if (needs.actions.includes('attach')) actions.append(button('Put the float under your existing picture', 'Add float', () => { closeSheet(); change({ type: 'attach' }); }));
    else actions.append(button('Launch this actual trip first, keeping your chosen picture and water', 'Launch first', () => { closeSheet(); launch(); }, iconSVG('play')));
    actions.append(button('Return to the pictured river beginnings', 'Back to beginnings', () => openSheet('day'), iconSVG('back'))); sheet.append(actions); return;
  }
  try {
    if (!startRiverDay(episode)) { message(riverSaveMessage(null, riverRunStatus().issue)); return; }
    refresh(); paint(); void openSheet('day-options');
  } catch { message('This beginning could not open. Your river and earlier trips are still here.'); }
}
function paintDay() {
  sheetHeader('A different river day'); const note = document.createElement('p'); note.textContent = 'Choose a beginning. Your whole picture and earlier trips stay yours.'; sheet.append(note);
  const options = document.createElement('div'); options.className = 'river-day-grid';
  for (const episode of RIVER_DAY_EPISODES) {
    const scene = current(); let preview = episode === 'meeting-place' ? { ...scene, mama: false, riverDay: { episode: 'meeting-place', guest: 'ba' } } : scene;
    if (episode !== 'meeting-place' && riverDayReadiness(scene, episode).ready) {
      const beginning = editRiverScene(scene, { type: 'river-day-start', episode }); preview = riverDayChoices(beginning)[0]?.scene || beginning;
    }
    options.append(dayChoice(`Choose ${RIVER_DAY_LABELS[episode]}. Keep your picture and earlier real trips.`, RIVER_DAY_LABELS[episode], () => beginDay(episode), preview));
  }
  sheet.append(options);
}
function applyDay(action) { closeSheet(); return change(action); }
function paintDayOptions() {
  const scene = current(), day = scene.riverDay; if (!day) { paintDay(); return; }
  sheetHeader(RIVER_DAY_LABELS[day.episode]); const note = document.createElement('p'); note.textContent = riverDayCaption(scene); sheet.append(note);
  const options = document.createElement('div'); options.className = 'river-day-grid';
  if (day.episode === 'meeting-place') {
    for (const id of ['ba','ishan']) {
      const proposed = editRiverScene(scene, { type: 'river-day-guest', guest: id });
      const choice = dayChoice(`Choose ${guests[id].name} to meet your picture at this dock`, guests[id].name, () => applyDay({ type: 'river-day-guest', guest: id }), proposed); choice.setAttribute('aria-pressed', String(day.guest === id)); options.append(choice);
    }
    options.append(dayChoice('Move the dock. Your chosen guest moves with this real landing place.', 'Move our dock', () => { closeSheet(); pick('dock'); }, scene));
  } else {
    for (const proposal of riverDayChoices(scene)) options.append(dayChoice(`Apply this pictured setup: ${proposal.label}. Launch to observe its real journey.`, proposal.label, () => applyDay(proposal.action), proposal.scene));
    if (day.journeys.second) {
      options.append(dayChoice('Return to your exact first observed journey and picture', 'First journey', () => applyDay({ type: 'river-day-choose', which: 'first' }), day.journeys.first),
        dayChoice('Return to your exact second observed journey and picture', 'Second journey', () => applyDay({ type: 'river-day-choose', which: 'second' }), day.journeys.second));
    } else {
      const first = document.createElement('div'); first.className = 'river-day-retained'; first.append(riverPreview(day.journeys.first)); const label = document.createElement('b'); label.textContent = 'Your real first journey'; first.append(label); options.append(first);
    }
  }
  sheet.append(options);
  const footer = document.createElement('div'); footer.className = 'river-day-footer';
  footer.append(button('Return to this setup and launch your actual picture float', 'Try this river', () => { closeSheet(); launch(); }, iconSVG('play')),
    button('Change the current, stone or dock yourself', 'Change water', () => openSheet('water'), waterIcon),
    button('Choose another optional river beginning', 'Another beginning', () => openSheet('day'), iconSVG('book')),
    button('Keep this picture, water and observed trip, and leave the optional Playday', 'Play my way', () => applyDay({ type: 'river-day-leave' }), iconSVG('back'))); sheet.append(footer);
}
function paintWater() {
  sheetHeader('Change the journey'); const scene = current(), choices = document.createElement('div'); choices.className = 'river-sheet-options';
  Object.keys(RIVER_DIRECTIONS).forEach(direction => { const choice = button(`Water moves ${names[direction]}`, names[direction], () => { change({ type: 'direction', direction }); paintWater(); }, `<span class="river-arrow" aria-hidden="true">${arrows[direction]}</span>`); choice.setAttribute('aria-pressed', String(scene.direction === direction)); choices.append(choice); }); sheet.append(choices);
  const strengths = document.createElement('div'); strengths.className = 'river-sheet-options'; [0, 1, 2].forEach(strength => { const choice = button(`${['Still', 'Gentle', 'Strong'][strength]} water`, ['Still', 'Gentle', 'Strong'][strength], () => { change({ type: 'strength', strength }); paintWater(); }, waterIcon); choice.setAttribute('aria-pressed', String(scene.strength === strength)); strengths.append(choice); }); sheet.append(strengths);
  const extras = document.createElement('div'); extras.className = 'river-sheet-options';
  const stone = button(scene.stone.on ? 'Take the stone away' : 'Put a stone in the river', scene.stone.on ? 'Stone away' : 'Add stone', () => { change({ type: 'stone-toggle' }); paintWater(); }); stone.append(image(RIVER_ART.stone));
  const mama = button(scene.mama ? 'Mama can rest' : 'Invite Mama to catch at your landing dock', scene.mama ? 'Mama rests' : 'Mama catches', () => { change({ type: 'mama', join: !current().mama }); closeSheet(); paint(); message('Move the landing dock. Mama comes with it. Then launch your picture.'); }); mama.append(image('characters/family_adult1_idle'));
  extras.append(stone); if (!scene.riverDay) extras.append(mama);
  extras.append(button('Start a fresh arrangement. Undo brings this arrangement back.', 'New water', () => { change({ type: 'reset' }); closeSheet(); }, iconSVG('replay'))); sheet.append(extras);
  const playday = button(current().riverDay ? 'Continue this optional river Playday' : 'Choose an optional river Playday with family meetings, changed water or another stopping place', current().riverDay ? 'Continue Playday' : 'A different river day', () => openSheet(current().riverDay ? 'day-options' : 'day'), iconSVG('book')); playday.dataset.playday = ''; sheet.append(playday);
}
async function openSheet(kind) {
  if (saving || transferring || checkpointing || !ready || !view) return;
  if (['picture-view','picture-adjust','original'].includes(kind) && (drag || pointers?.active != null || document.hidden || session.isBreakLocked())) return;
  cancelTransient(); paint(); sheetKind = kind; pageIndex = 0; sheet.hidden = false; const request = ++pickerSerial, token = visit.serial;
  for (const child of host.children) if (child !== sheet) child.inert = true;
  if (kind === 'choose') paintChoose(); else if (kind === 'picture-view') paintPicture(); else if (kind === 'picture-adjust') paintPictureAdjust(); else if (kind === 'original') paintOriginal(); else if (kind === 'water') paintWater(); else if (kind === 'kept') paintKept(); else if (kind === 'day') paintDay(); else if (kind === 'day-options') { paintDayOptions(); guidance?.guide(true); }
  else {
    sheetHeader('Opening your work…');
    try {
      if (kind === 'pictures') { const fetched = (await gallery.listChecked()).filter(isCreationRow); if (!visit.valid(token) || request !== pickerSerial) return; rows = fetched; paintPictures(); }
      else { await loadToyWorkshop(); if (!visit.valid(token) || request !== pickerSerial) return; const workshop = getToyWorkshop(), assets = new Map(workshop.assets.map(row => [row.id, row.png])); rows = workshop.toys.map(row => ({ ...row, toyRef: row.id, png: assets.get(row.asset) })).filter(row => row.png); paintToys(); }
    } catch { if (visit.valid(token) && request === pickerSerial) { sheetHeader('Your work could not open'); const p = document.createElement('p'); p.textContent = 'Your river is still here. Try again, or ask a grown-up for help.'; sheet.append(p); const retry=button('Try opening your work again','Try again',()=>openSheet(kind));retry.dataset.shelfRetry='';sheet.append(retry); } }
  }
  if (visit.valid(token) && request === pickerSerial) sheet.querySelector('button')?.focus({ preventScroll: true });
}
async function checkpointRiver() {
  guidance?.interrupt();
  if (!visit.active || checkpointing) return false;
  if (!ready && !view) { const token=visit.serial; try { await flushRiverRun(); return visit.valid(token); } catch { if (visit.valid(token)) message('Your river could not finish saving. Try again before leaving.'); return false; } }
  const token = visit.serial; checkpointing = true; stopMotion();
  try {
    let action = drag?.position && drag.part !== 'attach' ? { type: drag.part, ...drag.position } : null;
    if (drag?.part === 'attach' && drag.moved && drag.lastClient) {
      const rect = board.querySelector('.river-picture-toy')?.getBoundingClientRect(), p = drag.lastClient;
      if (rect && p.x >= rect.left - 55 && p.x <= rect.right + 55 && p.y >= rect.top - 55 && p.y <= rect.bottom + 70) action = { type: 'attach' };
    }
    const placed = commitLivingPlacement({ drag, action, readCurrent: () => riverRunView().current, edit: editRiverScene, commit: changeRiverRun,
      release: () => { drag = null; selected = null; pointers?.cancel(performance.now()); refresh(); paint(); } });
    if (!placed) { message('Finish placing this, then try again. Your move is still here.'); return false; }
    const accepted = await checkpointLivingScene({ flush: flushRiverRun, retry: () => riverStore.retryRiverRunWrites(), storage: riverRunStatus,
      alive: () => visit.valid(token), report: message, subject: 'Your river trip' });
    if (accepted && visit.valid(token)) { cancelTransient(); if (sheetKind) closeSheet(); }
    return accepted;
  } finally { if (visit.valid(token)) { checkpointing = false; bus.emit('activity:idle'); } }
}
async function openSavedRiver(params, token, retryWrites = false) {
  if (!visit.valid(token) || openingRiver) return;
  openingRiver=true; if (riverLoadRetry) riverLoadRetry.disabled=true;
  try {
      if (retryWrites && riverRunStatus().issue === 'river-write') await riverStore.retryRiverRunWrites();
      if (!visit.valid(token)) return;
      await loadRiverRun(); if (!visit.valid(token)) return;
      if (params.savedId) reopenRiverRun(params.savedId);
      if (params.toyId) { await loadToyWorkshop(); if (!visit.valid(token)) return; const workshop = getToyWorkshop(), toy = workshop.toys.find(row => row.id === params.toyId), asset = toy && workshop.assets.find(row => row.id === toy.asset); if (asset) useRiverToy({ ...toy, toyRef: toy.id, png: asset.png }); }
      let sourceIssue='';
      if (params.sourceKey) {
        try {
          const fetched=(await gallery.listChecked()).filter(isCreationRow);if(!visit.valid(token))return;
          const row=fetched.find(item=>item.key===params.sourceKey);
          if(!row || !useRiverPicture(row))sourceIssue='That picture could not be opened. Your current river is still here. Try Picture, or ask a grown-up for help.';
        } catch { if(!visit.valid(token))return;sourceIssue='That picture could not be opened. Your current river is still here. Try Picture, or ask a grown-up for help.'; }
      }
      if (!visit.valid(token)) return; riverLoadRetry?.remove(); riverLoadRetry=null; refresh(); ready = true; controls.querySelectorAll('button').forEach(el => { el.disabled = false; }); paint();
      if(sourceIssue)openingNotice=sourceIssue;
      let notice=sourceIssue || riverDayCaption(current());
      if (!riverRunStatus().persistent) notice += ' Your river is here for now. Device saving is unavailable; ask a grown-up to keep a backup before closing.';
      message(notice);
  } catch { if (visit.valid(token)) { message('Your river could not open. Try again or return Home.'); if (!ready && !riverLoadRetry) { const retry=button('Try opening your river again','Try again',()=>{ void openSavedRiver(params,token,true); },iconSVG('replay')); retry.classList.add('river-load-retry'); retry.dataset.loadRetry=''; board.append(retry); riverLoadRetry=retry; } } }
  finally { if (visit.valid(token)) { openingRiver=false; if (riverLoadRetry) riverLoadRetry.disabled=false; } }
}
export default {
  id: 'river-run',
  async mount(el, params = {}) {
    enteredFromMap = params.fromMap === true;
    const token = visit.begin(); openingRiver=false; riverLoadRetry=null; openingNotice='';host = el; ready = false; saving = false; transferring = false; checkpointing = false; view = null; selected = drag = null; sheetKind = ''; pointers = new WorkshopPointers(); host.classList.add('river-run');
    host.innerHTML = '<header class="river-header"><h1>River Run</h1><nav class="river-navigation" aria-label="Go to another place"></nav></header><main class="river-board" tabindex="0" role="group" aria-label="Picture float river. Tap or drag to move a selected float, stone or landing dock."></main><p class="river-status" role="status" aria-live="polite">Opening your river…</p><footer class="river-controls"></footer><section class="river-sheet" hidden role="dialog" aria-modal="true" aria-label="Choose river pictures, water or kept trips"></section>';
    board = host.querySelector('.river-board'); status = host.querySelector('.river-status'); controls = host.querySelector('.river-controls'); sheet = host.querySelector('.river-sheet');
    guidance?.dispose(); guidance = new LivingGuidance({ route: 'river-run', active: () => visit.valid(token),
      ready: () => ready && !!view && !saving && !checkpointing && !transferring && (!sheetKind || sheetKind === 'day-options') && !drag && !openingNotice,
      guideKey: help => dayGuideKey(view?.current) || livingPlayGuideKey('river-run', view?.current, { help }),
      caption: (text, key) => { host.dataset.guidance = key; message(text); } });
    idleHelp?.();idleHelp=installIdleHelp(host,{
      active:()=>visit.valid(token) && ready && !!view && !current().riverDay && !saving && !checkpointing && !transferring && !sheetKind && !drag && !motion && pointers?.active==null && !openingNotice && !session.isBreakLocked() && !router.isMoving() && router.current()==='river-run' && !speech.isSpeaking(),
      demonstrate:()=>{
        const ownBoard=board,scene=current(),placing=!!selected;const target=placing ? ownBoard : !scene.instance ? ownBoard.querySelector('.river-first-action') : !scene.attached ? ownBoard.querySelector('.river-attach') : controls.querySelector('[data-launch]');
        if(!target || target.disabled)return null;const cueClass=placing?'river-idle-placement':'is-guided';ownBoard.classList.add(cueClass);if(!placing)guidance.guide(false);const serial=guidance.serial;
        const motionCue=!placing && !reduced() && target.animate?.([{translate:'0 0'},{translate:'6px 0'},{translate:'0 0'}],{duration:900,iterations:1,easing:'ease-in-out'});
        idleMotion=motionCue || null;motionCue?.finished?.catch?.(()=>{});let visualDone=false;
        const clearVisual=()=>{if(visualDone)return;visualDone=true;motionCue?.cancel?.();if(idleMotion===motionCue)idleMotion=null;ownBoard.classList.remove(cueClass);};
        const visualTimer=setTimeout(clearVisual,2400);let voiceOwned=!placing;const voiceTimer=setTimeout(()=>{voiceOwned=false;},4000);
        return ()=>{clearTimeout(visualTimer);clearTimeout(voiceTimer);clearVisual();if(voiceOwned && guidance && guidance.serial===serial)guidance.interrupt();};
      },
    });
    mute = muteButton(); const home = homeButton(); home.setAttribute('aria-label', 'Home: back to your valley'); host.querySelector('nav').append(home, mute, button(enteredFromMap ? 'Back to the valley' : 'Back to the Rolling Run', '', () => { void router.go(enteredFromMap ? 'map' : 'rolling-run'); }, iconSVG('back')), button('Open your kept river trips', '', () => openSheet('kept'), iconSVG('book')));
    const pictureControl = button('Choose Whole picture, Adjust view or See original for your river picture','View',()=>{if(visit.valid(token))void openSheet('picture-view');},pictureIcon); pictureControl.dataset.pictureView='';pictureControl.classList.add('river-picture-control');pictureControl.hidden=true;host.querySelector('nav').append(pictureControl);
    const guide = button('Help: show and hear what to do on the river', 'Help', help, iconSVG('help')); guide.dataset.help = ''; guide.disabled = true; host.querySelector('nav').append(guide);
    [['picture', 'Choose your own picture or toy', 'Picture', () => openSheet('choose'), pictureIcon], ['water', 'Change the water, stone, or family outing', 'Water', () => openSheet(current().riverDay ? 'day-options' : 'water'), waterIcon],
      ['undo', 'Undo the last river change or launch', 'Undo', () => { cancelTransient(); undoRiverRun(); refresh(); paint(); message(riverDayCaption(current())); }, iconSVG('undo')],
      ['launch', 'Launch your picture float on the chosen current', 'Launch', launch, iconSVG('play')], ['keep', 'Keep this editable trip and exact picture', 'Keep', keep, iconSVG('heart')], ['picnic', 'Our river picnic: keep this trip and bring your own toy', 'Picnic', goPicnic, '']].forEach(([key, label, text, action, icon]) => { const el = button(label, text, action, icon); el.dataset[key] = ''; if (key === 'picnic') el.prepend(image('props/picnic-empty-table-v1')); el.disabled = true; controls.append(el); });
    listen(host, 'pointerdown', event => { if (checkpointing || transferring) { event.preventDefault(); event.stopImmediatePropagation(); return; } if (event.target.closest('.river-navigation')) return; const verdict = pointers.down(event, performance.now(), !settings.get().penOnly); if (verdict.cancel) { cancelTransient(); paint(); } if (!verdict.accepted) { event.preventDefault(); event.stopImmediatePropagation(); } else { openingNotice='';guidance?.interrupt(); board.classList.remove('is-guided'); } }, true);
    listen(host, 'click', event => { if (checkpointing || transferring || (!event.target.closest('.river-navigation') && !pointers.allowClick(event, performance.now()))) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(host, 'keydown', event => { if (checkpointing || transferring) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(host, 'pointermove', event => { if (checkpointing || transferring) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(host, 'pointermove', moveDrag); listen(window, 'pointerup', endDrag);
    const cancel = event => { if (pointers.finish(event, performance.now(), true)) { cancelTransient(); paint(); } };
    listen(window, 'pointercancel', cancel); listen(host, 'lostpointercapture', event => { if (pointers.owns(event)) cancel(event); });
    listen(board, 'click', event => { if (ready && selected && !event.target.closest('button')) { const part = selected; selected = null; change({ type: part, ...coordinate(event.clientX, event.clientY) }); } });
    listen(board, 'keydown', event => { if (event.target !== board || !ready) return; if (selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { openingNotice='';event.preventDefault(); const origin = current()[selected]; change({ type: selected, x: origin.x + (event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0), y: origin.y + (event.key === 'ArrowUp' ? -5 : event.key === 'ArrowDown' ? 5 : 0) }); } else if (['Enter', ' '].includes(event.key)) { openingNotice='';event.preventDefault(); launch(); } });
    listen(sheet, 'keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeSheet(); } if (event.key === 'Tab') { const buttons = [...sheet.querySelectorAll('button:not(:disabled)')], first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } });
    const disrupt = () => {
      const interruptedMove = selected !== null || !!drag;
      cancelTransient(); paint();
      if (interruptedMove && ready && view) message(riverDayCaption(current()));
      void flushRiverRun().catch(() => {});
    };
    listen(window, 'resize', disrupt); listen(window, 'blur', disrupt); listen(document, 'visibilitychange', () => { if (document.hidden) disrupt(); });
    offSettings = bus.on('settings:changed', () => { disrupt();if(reduced()){idleMotion?.cancel?.();idleMotion=null;} });
    listeners.push(bus.on('session:end', () => { if (visit.valid(token)) abortPictureInspection(); }),
      bus.on('screen:leave', event => { if (visit.valid(token) && event?.id === 'river-run') abortPictureInspection(); }));
    if (typeof ResizeObserver !== 'undefined') {
      const observedBoard = board;
      let width = observedBoard.clientWidth, height = observedBoard.clientHeight;
      observer = new ResizeObserver(() => {
        if (!visit.valid(token) || board !== observedBoard) return;
        const nextWidth = observedBoard.clientWidth, nextHeight = observedBoard.clientHeight;
        const changed = nextWidth !== width || nextHeight !== height;
        width = nextWidth; height = nextHeight;
        // Initial and unchanged deliveries must not consume a selected move.
        if (ready && changed) disrupt();
      });
      observer.observe(observedBoard);
    }
    await openSavedRiver(params, token);
  },
  busy() { return saving || transferring || checkpointing || !!drag; }, breakBusy() { return saving || transferring || checkpointing || !!drag; },
  onBack() { if (sheetKind) closeSheet(); else void router.go(enteredFromMap ? 'map' : 'rolling-run'); },
  beforeLeave: checkpointRiver,
  beforeBreak: checkpointRiver,
  unmount() { riverLoadRetry?.remove(); riverLoadRetry=null; openingRiver=false; idleHelp?.();idleHelp=null;guidance?.dispose(); guidance = null; visit.end(); ready = false; checkpointing = false; cancelTransient(); listeners.forEach(off => off()); listeners = []; offSettings?.(); observer?.disconnect(); observer = null; mute?.destroy?.(); void flushRiverRun().catch(() => {}); host = board = controls = status = sheet = view = null; sheetKind = ''; ++pickerSerial; }
};
