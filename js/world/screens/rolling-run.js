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
import { savedWorld } from '../../state/saved-world.js';
import { loadToyWorkshop, getToyWorkshop } from '../../state/toy-workshop.js';
import { toyBasketPage, toyInstance } from '../../data/toy-workshop.js';
import { WorkshopPointers, WorkshopVisit } from './toy-workshop.js';
import { rollingOutcomeText, editRollingScene, isRollingStarter, starterRollingInstance, rollingDayReadiness, rollingDayChoices, ROLLING_STARTER, ROLL_START, ROLL_RAMP_FOOT, ROLL_TOY_WIDTH, ROLL_BLOCK_WIDTH } from '../../data/rolling-run.js';
import { ROLLING_DAY_LABELS, ROLLING_DAY_PREDICTIONS } from '../../data/rolling-day.js';
import { checkpointLivingScene, commitLivingPlacement } from './music-band.js';
import * as rollingStore from '../../state/rolling-run.js';
import { loadRollingRun, rollingRunView, changeRollingRun, undoRollingRun, rollingRunPage,
  reopenRollingRun, keepRollingRun, flushRollingRun, rollingRunStatus, chooseRollingStarter, returnToRollingPicture } from '../../state/rolling-run.js';

export const ROLL_RAMP_ART = 'rolling-run/ramp-v1';
export const ROLL_WHEELS_ART = 'toy-workshop/wheels-v1';
export const ROLL_RAMP_PATH = 'assets/art/final/rolling-run/ramp-v1.png';
// Measured opaque top surface, independent of padding and faint stray pixels.
export const ROLL_RAMP_CONTACT = Object.freeze({ width: 2172, height: 724, left: 100, right: 2050, surface: 312 });
export const ROLL_WHEEL_CONTACT = Object.freeze({ width: 2079, height: 756, left: 99, right: 1979, foot: 664 });
// The original transparent sprites stay intact. These measured solid footprints
// fit their actual contact surfaces independently of the larger touch targets.
export const ROLL_PROP_CONTACT = Object.freeze({
  block: Object.freeze({ art: 'rolling-run/block-v1', width: 1254, height: 1254, left: 111, right: 1157, surface: 1141 }),
  mat: Object.freeze({ art: 'rolling-run/landing-mat-v1', width: 1536, height: 1024, left: 47, right: 1496, surface: 650 }),
});
const previewScenes = new WeakMap();
const hand = '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="15" r="12" fill="#ffe7a7"/><path d="M24 40V15a6 6 0 0 1 12 0v16l8-3q7 0 5 9l-5 16H27L14 40q-4-8 3-10l7 10" fill="#ffe1b8" stroke="#79563c" stroke-width="3"/></svg>';
const hillIcon = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m5 43 17-22 37 22v8H5Z" fill="#d6b07b" stroke="#805c3d" stroke-width="3"/><path d="M18 9v22m-8-14 8-8 8 8" fill="none" stroke="#56866c" stroke-width="4"/></svg>';
const blockIcon = '<svg viewBox="0 0 64 64" preserveAspectRatio="none" aria-hidden="true"><rect x="1" y="8" width="62" height="55" rx="5" fill="#d9ad6d" stroke="#80603d" stroke-width="3"/><path d="m12 20 40 34m0-34L12 54" stroke="#bc884a" stroke-width="4"/></svg>';
const matIcon = '<svg viewBox="0 0 64 64" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="32" cy="44" rx="31" ry="12" fill="#aed3ba" stroke="#4c8b72" stroke-width="3"/><path d="M35 43V9l18 9-18 9" fill="#f0c96f" stroke="#986f34" stroke-width="3"/></svg>';
const pictureIcon = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="7" width="46" height="39" rx="4" fill="#fffdf6" stroke="#987553" stroke-width="3"/><circle cx="20" cy="49" r="8" fill="#9dccae" stroke="#6d7860" stroke-width="3"/><circle cx="45" cy="49" r="8" fill="#9dccae" stroke="#6d7860" stroke-width="3"/></svg>';
const shapes = { coral: '●', mint: '▲', lilac: '◆', sunshine: '★' };
const ownerFilter = savedWorld.id === 'shared' ? null : savedWorld.id;

export function rollingGeometry(width, height, scene) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  // Keep every old logical stop exact. Uniform presentation fits the solid
  // tyre front to that boundary, excluding the sprite's faint outer shadow.
  const visualScale = (2027 / ROLL_WHEEL_CONTACT.width - .5) / (ROLL_WHEEL_CONTACT.right / ROLL_WHEEL_CONTACT.width - .5);
  const size = w * ROLL_TOY_WIDTH / 100 * visualScale;
  const foot = size * (.56 + ROLL_WHEEL_CONTACT.foot / ROLL_WHEEL_CONTACT.width), ground = h * .69;
  // Use the paper's vertical space for the actual hill, with room for the
  // complete wheeled picture above it even in short landscape.
  const maximumRise = Math.max(0, Math.min(h * .43, ground - foot - 6));
  const rise = maximumRise * [.35, .66, 1][scene.ramp || 0], left = w * .08, right = w * ROLL_RAMP_FOOT / 100;
  const angle = Math.atan2(rise, right - left) * 180 / Math.PI;
  const launch = { x: w * ROLL_START / 100, y: ground - rise * (ROLL_RAMP_FOOT - ROLL_START) / (ROLL_RAMP_FOOT - 8), angle };
  const end = { x: w * (scene.outcome?.end ?? ROLL_START) / 100, y: scene.outcome ? ground : launch.y, angle: scene.outcome ? 0 : angle };
  return { width: w, height: h, size, foot, ground, rise, left, right, angle, launch, end };
}
export function rollingSaveMessage(result, issue) {
  if (issue === 'rolling-full' || issue === 'rolling-capacity') return 'The run shelf is full. This run and your picture toy are still here.';
  if (issue === 'rolling-toy-needed') return 'Choose a picture toy first.';
  if (issue) return 'This run could not be kept. Your toy and arrangement are still here. Try Keep again.';
  return result?.persistent ? 'Your run is kept, saved on this device.' : 'Your run is kept for now. Device saving is unavailable; it may disappear when this page closes.';
}

export function rollingPropGeometry(width, ground, kind) {
  const contact = ROLL_PROP_CONTACT[kind];
  const visibleWidth = kind === 'block' ? width * ROLL_BLOCK_WIDTH / 100 : Math.max(44, width * .16);
  const scale = visibleWidth / (contact.right - contact.left);
  const imageWidth = contact.width * scale, imageHeight = contact.height * scale;
  const touchWidth = Math.max(44, visibleWidth), touchHeight = Math.max(44, imageHeight);
  const surface = contact.surface * scale;
  return { width: touchWidth, height: touchHeight, top: ground - surface,
    imageWidth, imageHeight, imageLeft: touchWidth / 2 - (contact.left + contact.right) / 2 * scale, imageTop: 0 };
}
function propImage(kind) {
  const contact = ROLL_PROP_CONTACT[kind], image = document.createElement('img');
  image.className = 'rolling-prop-art'; image.src = art.get(contact.art)?.src || `assets/art/final/${contact.art}.png`;
  image.alt = ''; image.draggable = false; return image;
}
function placeProp(element, kind, width, ground) {
  const g = rollingPropGeometry(width, ground, kind), image = element.querySelector('img');
  element.style.width = `${g.width}px`; element.style.height = `${g.height}px`; element.style.top = `${g.top}px`;
  image.style.width = `${g.imageWidth}px`; image.style.height = `${g.imageHeight}px`;
  image.style.left = `${g.imageLeft}px`; image.style.top = `${g.imageTop}px`;
}
function rampFigure(g, className = 'rolling-ramp-art') {
  const ramp = document.createElement('img'); ramp.className = className; ramp.src = art.get(ROLL_RAMP_ART)?.src || ROLL_RAMP_PATH; ramp.alt = '';
  const length = Math.hypot(g.right - g.left, g.rise), scale = length / (ROLL_RAMP_CONTACT.right - ROLL_RAMP_CONTACT.left);
  ramp.style.width = `${ROLL_RAMP_CONTACT.width * scale}px`; ramp.style.height = `${ROLL_RAMP_CONTACT.height * scale}px`; ramp.style.left = `${g.left - ROLL_RAMP_CONTACT.left * scale}px`; ramp.style.top = `${g.ground - g.rise - ROLL_RAMP_CONTACT.surface * scale}px`;
  ramp.style.transformOrigin = `${ROLL_RAMP_CONTACT.left / ROLL_RAMP_CONTACT.width * 100}% ${ROLL_RAMP_CONTACT.surface / ROLL_RAMP_CONTACT.height * 100}%`; ramp.style.transform = `rotate(${g.angle}deg)`; return ramp;
}

const visit = new WorkshopVisit();
let host, board, status, tools, controls, sheet, sheetKind, view, library, mute, offSettings, observer, saving = false, pointers, drag, picked, moving, motionTimer, hintTimer, hint = true, sheetSerial = 0;
let toyPage = 0, savedPage = 0, listeners = [], checkpointing = false, libraryIssue = false, guidance;
let enteredFromMap = false;
let pictureInspection = null, openingNotice = '', idleHelp = null, idleMotion = null;
function abortPictureInspection() { pictureInspection?.abort(); pictureInspection = null; }
function button(label, text, action, icon = '') {
  const b = document.createElement('button'), born = sheetSerial; b.type = 'button'; b.className = 'rolling-button'; b.setAttribute('aria-label', label);
  b.innerHTML = `${icon}<span></span>`; b.querySelector('span').textContent = text;
  tapify(b, event => {
    if (checkpointing || saving || !visit.active || !b.isConnected || router.isMoving()) return;
    const inSheet = b.closest('.rolling-sheet'); if (inSheet && (sheet?.hidden || !sheetKind || born !== sheetSerial)) return;
    for (let ancestor = b; ancestor && ancestor !== host; ancestor = ancestor.parentNode) if (ancestor.inert) return;
    openingNotice='';if (!('help' in b.dataset)) guidance?.interrupt(); action(event);
  }); return b;
}
function listen(target, type, callback, options) { target.addEventListener(type, callback, options); listeners.push(() => target.removeEventListener(type, callback, options)); }
function reduced() { return settings.get().reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function message(text) { if (status) status.textContent = text; }
function stopMotion() { moving?.cancel(); moving = null; clearTimeout(motionTimer); board?.classList.remove('is-trying'); }
function stopHint() { hint = false; clearTimeout(hintTimer); board?.querySelector('.rolling-demo')?.remove(); }
function cancelTransient() { abortPictureInspection(); guidance?.interrupt(); host?.classList.remove('is-guided'); stopMotion(); drag = null; picked = null; pointers?.cancel(performance.now()); board?.classList.remove('is-moving'); }
function help() {
  if (!view || saving || checkpointing || sheetKind) return;
  if (current().rollingDay) { void openSheet('day-options'); return; }
  cancelTransient(); stopHint(); hint = true; paint();
  const token = visit.serial;
  hintTimer = setTimeout(() => { if (visit.valid(token)) stopHint(); }, 4500);
  host.classList.add('is-guided'); guidance?.guide(true);
}
function getView() { view = rollingRunView(); return view.current; }
function current() { return view.current; }
export function rollingDayCaption(scene) {
  const day = scene.rollingDay;
  if (!day) return rollingOutcomeText(scene);
  if (day.episode === 'prediction') {
    const choice = ROLLING_DAY_PREDICTIONS.find(place => place.id === day.prediction);
    if (!choice) return 'Where do you think it will stop? Tap Try to choose a place.';
    return scene.outcome ? `Your guess: ${choice.label.toLowerCase()}. ${rollingOutcomeText(scene)}` : `Your guess: ${choice.label.toLowerCase()}. Tap Try to see what happens.`;
  }
  if (day.episode === 'comparison') return day.comparison.second ? 'Both real rolls are kept. Open Ideas to choose either one, or keep changing this run.' : 'The first real roll is kept. Change the hill, push, block or mat, then Try another way.';
  return day.change ? rollingOutcomeText(scene) + ' Open Ideas for different ways to continue.' : 'Open Ideas to choose a new block or a different landing place.';
}
function dayGuideKey(scene) {
  const day = scene?.rollingDay;
  if (!day) return null;
  if (day.episode === 'prediction') return day.prediction ? 'living_roll_day_predicted' : 'living_roll_day_prediction';
  if (day.episode === 'comparison') return day.comparison.second ? 'living_roll_day_compared' : 'living_roll_day_comparison';
  return day.change && rollingDayChoices(scene).length ? 'living_roll_day_changed' : 'living_roll_day_changed_route';
}
function toyFigure(instance, frame = null) {
  const starter = isRollingStarter(instance), figure = document.createElement('div'); figure.className = `rolling-toy${starter ? ' rolling-starter-toy' : ''}`;
  const wheels = document.createElement('img'); wheels.className = 'rolling-wheels'; wheels.src = art.get(ROLL_WHEELS_ART)?.src || 'assets/art/final/toy-workshop/wheels-v1.png'; wheels.alt = ''; wheels.draggable = false; figure.append(wheels);
  const paper = document.createElement('div'); paper.className = 'rolling-paper';
  const picture = pictureView(starter ? art.get(ROLLING_STARTER.art)?.src || ROLLING_STARTER.path : instance.png, starter ? null : frame, '',
    starter ? 'Starter flower wagon: an illustrated toy ready to play' : frame ? 'Your chosen picture view; the whole original stays unchanged and available' : 'Your exact whole picture toy');
  if (starter) picture.className = 'rolling-starter-picture'; paper.append(picture); figure.append(paper);
  const pattern = document.createElement('div'); pattern.className = 'rolling-pattern';
  for (const color of instance.pattern) { const shape = document.createElement('i'); shape.className = `rolling-shape rolling-${color}`; shape.textContent = shapes[color]; pattern.append(shape); }
  pattern.setAttribute('aria-label', instance.pattern.length ? `Toy pattern: ${instance.pattern.join(', ')}` : ''); figure.append(pattern); return figure;
}
function makeYourOwn() { void router.go('toy-workshop', { returnTo: 'rolling-run' }); }
function placeToy(figure, point, g) {
  figure.style.width = `${g.size}px`; figure.style.height = `${g.size * .924}px`;
  figure.style.left = `${point.x}px`; figure.style.top = `${point.y - g.foot}px`;
  figure.style.transform = `translateX(-50%) rotate(${point.angle}deg)`;
}
function paint() {
  if (!visit.active || !view) return;
  stopMotion(); board.replaceChildren(); const scene = current(), g = rollingGeometry(board.clientWidth, board.clientHeight, scene);
  board.style.setProperty('--ground', `${g.ground}px`); board.style.setProperty('--block-width', `${g.width * ROLL_BLOCK_WIDTH / 100}px`);
  board.dataset.situation = scene.situation;
  board.dataset.toySource = isRollingStarter(scene.instance) ? 'starter' : scene.instance ? 'picture' : 'empty';
  if (isRollingStarter(scene.instance)) { const label = document.createElement('span'); label.className = 'rolling-starter-label'; label.textContent = 'Starter'; board.append(label); }
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); track.classList.add('rolling-track'); track.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`); track.setAttribute('aria-hidden', 'true');
  const illustratedRamp = !!art.get(ROLL_RAMP_ART);
  track.innerHTML = `<path d="M0 ${g.ground + 7}H${g.width}" stroke="#b99366" stroke-width="9"/><path d="M${g.left} ${g.ground}V${g.ground - g.rise + 8}L${g.right} ${g.ground}Z" fill="#e9c994" stroke="#b48a59" stroke-width="2"/>${illustratedRamp ? '' : `<path d="M${g.left} ${g.ground - g.rise}L${g.right} ${g.ground}" stroke="#8d6844" stroke-width="12" stroke-linecap="round"/><path d="M${g.left} ${g.ground - g.rise - 2}L${g.right} ${g.ground - 2}" stroke="#e0b979" stroke-width="7" stroke-linecap="round"/>`}`;
  board.append(track); board.dataset.rampArt = illustratedRamp ? 'illustrated' : 'parametric';
  if (illustratedRamp) {
    board.append(rampFigure(g));
  }
  if (!scene.instance) {
    const choose = button('Play with the illustrated starter flower wagon', 'Starter', chooseStarter, pictureIcon + hand); choose.classList.add('rolling-empty'); board.append(choose);
  } else {
    const mat = button('Move the landing mat. Tap it, then tap a new place, or drag it.', '', () => select('target')); mat.classList.add('rolling-mat'); mat.append(propImage('mat')); mat.dataset.part = 'target'; mat.style.left = `${scene.target}%`; placeProp(mat, 'mat', g.width, g.ground); mat.setAttribute('aria-pressed', String(picked === 'target')); mat.addEventListener('pointerdown', e => startDrag(e, 'target')); board.append(mat);
    if (scene.obstacle.on) {
      const block = button('Move the block. Tap it, then tap a new place, or drag it.', '', () => select('obstacle')); block.classList.add('rolling-block'); block.append(propImage('block')); block.dataset.part = 'obstacle'; block.style.left = `${scene.obstacle.x}%`; placeProp(block, 'block', g.width, g.ground); block.setAttribute('aria-pressed', String(picked === 'obstacle')); block.addEventListener('pointerdown', e => startDrag(e, 'obstacle')); board.append(block);
    }
    const figure = toyFigure(scene.instance, scene.pictureView); placeToy(figure, g.end, g); board.append(figure);
    const rampTap = button('Change the hill height. Tap to switch between low, middle and high.', '', () => change({ type: 'ramp', level: (current().ramp + 1) % 3 })); rampTap.classList.add('rolling-ramp-touch'); rampTap.style.left = `${g.left}px`; rampTap.style.top = `${g.ground - g.rise - 14}px`; rampTap.style.width = `${g.right - g.left}px`; rampTap.style.height = `${Math.max(44, g.rise + 24)}px`; board.append(rampTap);
    if (scene.outcome) {
      const marker = document.createElement('div'); marker.className = `rolling-result rolling-result-${scene.outcome.kind}`; marker.style.left = `${scene.outcome.end}%`; marker.style.top = `${g.ground + 10}px`; marker.setAttribute('aria-hidden', 'true'); marker.textContent = scene.outcome.kind === 'blocked' ? '↔' : scene.outcome.kind === 'landed' ? '★' : '●'; board.append(marker);
    }
    if (hint) {
      const demo = document.createElement('div'); demo.className = 'rolling-demo'; demo.innerHTML = hand; demo.style.left = `${g.left + (g.right - g.left) * .5}px`; demo.style.top = `${Math.max(8, g.ground - g.rise * .5 - 38)}px`; board.append(demo);
    }
    const prediction = ROLLING_DAY_PREDICTIONS.find(place => place.id === scene.rollingDay?.prediction);
    if (prediction) {
      const marker = document.createElement('div'); marker.className = 'rolling-guess'; marker.style.left = `${prediction.x}%`; marker.style.top = `${g.ground + 5}px`;
      marker.setAttribute('aria-label', `My guess: ${prediction.label.toLowerCase()}`); marker.innerHTML = '<i aria-hidden="true"></i><span>My guess</span>'; board.append(marker);
    }
  }
  tools.querySelector('[data-ramp]').innerHTML = `${hillIcon}<span>Hill</span><b aria-hidden="true">${['▁', '▃', '▆'][scene.ramp]}</b>`;
  tools.querySelector('[data-ramp]').setAttribute('aria-label', `Hill is ${['low', 'middle', 'high'][scene.ramp]}. Tap to change.`);
  tools.querySelector('[data-push]').innerHTML = `<span class="rolling-push-arrows" aria-hidden="true">${'➜'.repeat(scene.push + 1)}</span><span>Push</span>`;
  tools.querySelector('[data-push]').setAttribute('aria-label', `Push is ${['gentle', 'middle', 'big'][scene.push]}. Tap to change.`);
  tools.querySelectorAll('button').forEach(b => { b.disabled = !scene.instance || saving; });
  controls.querySelector('[data-try]').disabled = !scene.instance || saving; controls.querySelector('[data-keep]').disabled = !scene.instance || saving;
  controls.querySelector('[data-undo]').disabled = !view.undoCount || saving; controls.querySelector('[data-toys]').disabled = saving; controls.querySelector('[data-ideas]').disabled = saving;
  host.querySelector('[data-saved]').disabled = saving;
  host.querySelector('[data-help]').disabled = saving || checkpointing;
  const pictureControl = host.querySelector('nav').querySelector('[data-picture-view]');
  pictureControl.hidden = !scene.instance || isRollingStarter(scene.instance); pictureControl.disabled = saving || checkpointing;
}
function change(action) {
  if (saving) return false; stopHint(); cancelTransient(); let changed;
  try { changed = changeRollingRun(action); }
  catch (error) { getView(); paint(); message(dayRefusal(error.code)); return false; }
  getView(); paint();
  const issue = rollingRunStatus().issue;
  message(issue && issue !== 'rolling-temporary' ? rollingSaveMessage(null, issue) : rollingDayCaption(current())); return changed;
}
function dayRefusal(code) {
  if (code === 'rolling-day-prediction-needed') return 'Choose a place for your guess, then let the toy roll.';
  if (code === 'rolling-day-trial-needed') return 'Try this run first. Then we can keep it and compare another way.';
  if (code === 'rolling-day-change-needed' || code === 'rolling-day-choice-unavailable') return 'That would leave this roll the same. Try another place, change the hill or push, or keep playing your way.';
  return rollingSaveMessage(null, code);
}
function select(part) {
  if (saving) return; guidance?.interrupt(); host.classList.remove('is-guided'); stopHint(); stopMotion(); picked = picked === part ? null : part;
  paint(); if (picked) board.focus({ preventScroll: true }); message(picked ? `Tap a new place for the ${part === 'target' ? 'landing mat' : 'block'}.` : rollingOutcomeText(current()));
}
function coordinate(clientX) { const rect = board.getBoundingClientRect(); return (clientX - rect.left - board.clientLeft) / board.clientWidth * 100; }
function startDrag(event, part) {
  if (!pointers.owns(event) || saving) return; stopHint(); stopMotion();
  drag = { id: event.pointerId, part, x: event.clientX, y: event.clientY, moved: false, position: null };
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* The OS may already have canceled this touch. */ }
}
function moveDrag(event) {
  if (!drag || drag.id !== event.pointerId) return;
  drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8;
  if (!drag.moved) return;
  drag.position = Math.max(54, Math.min(drag.part === 'target' ? 90 : 87, coordinate(event.clientX)));
  const part = board.querySelector(`[data-part="${drag.part}"]`); if (part) part.style.left = `${drag.position}%`;
  board.classList.add('is-moving');
}
function endDrag(event) {
  if (!drag || drag.id !== event.pointerId) { pointers.finish(event, performance.now()); return; }
  const completed = drag; drag = null; pointers.finish(event, performance.now(), completed.moved); board.classList.remove('is-moving');
  if (completed.moved) change({ type: completed.part === 'target' ? 'target' : 'obstacle-move', x: completed.position });
}
function tryRun() {
  if (!visit.active || !view || saving || checkpointing || sheetKind || router.isMoving() || !current().instance) return;
  if (current().rollingDay?.episode === 'prediction' && !current().rollingDay.prediction) { void openSheet('day-options'); return; }
  stopHint(); cancelTransient(); const previousPair = current().rollingDay?.comparison?.second;
  try { const changed = changeRollingRun({ type: 'try' }); const issue = rollingRunStatus().issue;
    if (!changed && issue && issue !== 'rolling-temporary' && issue !== 'rolling-write') { getView(); paint(); reportCurrent(); return; } }
  catch (error) { message(dayRefusal(error.code)); return; }
  getView(); paint(); message(rollingDayCaption(current()));
  const trial = current().outcome;
  const compared = !previousPair && !!current().rollingDay?.comparison?.second;
  const speak = (settled = null, delay = 0) => guidance?.after(compared ? 'living_roll_day_compared' : LIVING_PLAY_OUTCOME_KEYS['rolling-run'][trial?.kind], { settled, delay,
    guard: () => current().outcome === trial && !!board.querySelector('.rolling-toy') &&
      (trial.kind !== 'blocked' || !!board.querySelector('.rolling-block')) && (!compared || !!current().rollingDay?.comparison?.second) });
  if (reduced()) { speak(); return; }
  const token = visit.serial, scene = current(), g = rollingGeometry(board.clientWidth, board.clientHeight, scene), figure = board.querySelector('.rolling-toy');
  if (!figure?.animate) { speak(); return; }
  const point = (x, y, angle, offset) => ({ left: `${x}px`, top: `${y - g.foot}px`, transform: `translateX(-50%) rotate(${angle}deg)`, offset });
  const frames = [point(g.launch.x, g.launch.y, g.angle, 0), point(g.right, g.ground, 0, .35), point(g.end.x, g.end.y, 0, 1)];
  moving = figure.animate(frames, { duration: 950 + scene.ramp * 110 + scene.push * 90, easing: 'ease-out' }); board.classList.add('is-trying');
  message('Watch the toy roll.');
  const motion = moving;
  const settle = () => {
    if (visit.valid(token) && moving === motion && current().outcome === trial) { moving = null; board.classList.remove('is-trying'); }
  };
  if (motion.finished?.then) speak(motion.finished.then(() => settle()));
  else { motionTimer = setTimeout(settle, 1500); speak(null, 1500); }
}
async function keep() {
  if (saving) return; cancelTransient(); saving = true; paint(); message('Keeping your run…'); const token = visit.serial;
  try { const result = await keepRollingRun(savedWorld.id); if (visit.valid(token)) message(rollingSaveMessage(result)); }
  catch (error) { if (visit.valid(token)) message(rollingSaveMessage(null, error.code || 'rolling-write')); }
  finally { if (visit.valid(token)) { saving = false; getView(); paint(); } }
}
function closeSheet() {
  if (!sheet) return; abortPictureInspection(); guidance?.interrupt(); ++sheetSerial; sheet.hidden = true; sheetKind = null;
  for (const child of host.children) if (child !== sheet) child.inert = false;
  host.querySelector('[data-ideas]')?.focus({ preventScroll: true });
}
function sheetHeader(title) {
  abortPictureInspection();
  sheet.replaceChildren(); const header = document.createElement('div'); header.className = 'rolling-sheet-header'; const heading = document.createElement('h2'); heading.textContent = title;
  header.append(button('Return to your run', 'Back', closeSheet, iconSVG('back')), heading); sheet.append(header);
}
function pager(page, pages, go) {
  if (pages <= 1) return; const row = document.createElement('div'); row.className = 'rolling-pages';
  const back = button('Previous page', 'Back', () => go(page - 1), iconSVG('back')); back.disabled = !page;
  const next = button('Next page', 'More', () => go(page + 1), iconSVG('next')); next.disabled = page === pages - 1;
  const count = document.createElement('span'); count.textContent = `${page + 1} / ${pages}`; row.append(back, count, next); sheet.append(row);
}
function chooseToy(id) {
  const instance = toyInstance(library, id, `runToy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`, 'rolling-run');
  if (!instance || instance.behavior !== 'rolling') return false;
  change({ type: 'toy', instance }); closeSheet(); return true;
}
function chooseStarter() { if (saving) return; stopHint(); cancelTransient(); chooseRollingStarter(savedWorld.id); getView(); paint(); closeSheet(); reportCurrent(); }
function returnPicture() { if (saving) return; cancelTransient(); returnToRollingPicture(); getView(); paint(); closeSheet(); reportCurrent(); }
function reportCurrent() { const issue = rollingRunStatus().issue; message(issue && issue !== 'rolling-temporary' ? rollingSaveMessage(null, issue) : rollingDayCaption(current())); }
function paintToys() {
  sheetHeader('Choose a rolling toy');
  const choices = document.createElement('div'); choices.className = 'rolling-toy-choices';
  const starter = button('Play with the illustrated starter flower wagon. Your personal run stays available.', 'Starter', chooseStarter); starter.dataset.starter = ''; starter.append(toyFigure(starterRollingInstance())); choices.append(starter);
  if (!isRollingStarter(current().instance) && current().instance) {
    const viewChoice = button('Choose Whole picture, Adjust view or See original for this picture toy', 'Picture view', () => openSheet('picture'));
    viewChoice.append(toyFigure(current().instance, current().pictureView)); choices.append(viewChoice);
  }
  if (isRollingStarter(current().instance) && view.parkedInstance && !isRollingStarter(view.parkedInstance)) {
    const back = button('Return to my unfinished picture run', 'My run', returnPicture); back.dataset.returnPicture = ''; back.append(toyFigure(view.parkedInstance, rollingStore.getRollingRun().parked?.pictureView)); choices.append(back);
  }
  const make = button('Make your own picture toy in the Toy Workshop, then bring it back to this hill', 'Make my own', makeYourOwn, iconSVG('art') + pictureIcon); make.dataset.make = ''; choices.append(make); sheet.append(choices);
  const page = toyBasketPage(library.toys.filter(item => item.behavior === 'rolling'), toyPage, ownerFilter); toyPage = page.page;
  const grid = document.createElement('div'); grid.className = 'rolling-picture-grid';
  page.items.forEach((item, i) => { const asset = library.assets.find(row => row.id === item.asset); if (!asset) return;
    const open = button(`Play with your rolling picture toy ${page.page * 8 + i + 1}`, '', () => chooseToy(item.id)); open.append(toyFigure({ png: asset.png, pattern: item.pattern })); grid.append(open);
  }); sheet.append(grid);
  if (!page.items.length) { const empty = document.createElement('p'); empty.textContent = 'The starter is ready to roll. Make your own picture toy whenever you like.'; sheet.append(empty); }
  if (libraryIssue) {
    const notice = document.createElement('p'); notice.textContent = 'Your picture basket could not open. Your pictures are still kept; the starter is ready.';
    const retry = button('Try opening my picture toy basket again', 'Try my toys again', () => openSheet('toys'), iconSVG('replay')); retry.dataset.retryToys = ''; sheet.append(notice, retry);
  }
  pager(page.page, page.pages, index => { toyPage = index; paintToys(); });
}
function paintSaved() {
  sheetHeader('Your kept runs'); const page = rollingRunPage(savedPage, ownerFilter); savedPage = page.page;
  const grid = document.createElement('div'); grid.className = 'rolling-picture-grid';
  page.items.forEach((item, i) => { const starter = isRollingStarter(item.scene.instance), open = button(`Reopen your kept ${starter ? 'starter ' : ''}run ${page.page * 8 + i + 1}`, '', () => { cancelTransient(); reopenRollingRun(item.id); getView(); paint(); closeSheet(); message(rollingOutcomeText(current())); });
    open.append(toyFigure(item.scene.instance, item.scene.pictureView)); if (starter) { const label = document.createElement('span'); label.className = 'rolling-starter-caption'; label.textContent = 'Starter'; open.append(label); }
    const marker = document.createElement('b'); marker.className = 'rolling-save-symbol'; marker.innerHTML = item.scene.situation === 'landing' ? matIcon : hillIcon; open.append(marker); grid.append(open);
  }); sheet.append(grid);
  if (!page.items.length) { const empty = document.createElement('p'); empty.textContent = 'Keep a run to come back to its hill, push, block, mat and picture toy.'; sheet.append(empty); }
  pager(page.page, page.pages, index => { savedPage = index; paintSaved(); });
}
function paintIdeas() {
  sheetHeader('Ways to roll'); const row = document.createElement('div'); row.className = 'rolling-ideas';
  row.append(button('Explore how the hill and push change your toy travel', 'Hill and push', () => { change({ type: 'situation', situation: 'lab' }); closeSheet(); }, hillIcon),
    button('Move a block and landing mat to change where your toy stops', 'Where will it stop?', () => { change({ type: 'situation', situation: 'landing' }); closeSheet(); }, blockIcon + matIcon)); sheet.append(row);
  sheet.append(button('Build a connected town road for a car and train', 'Track town', () => { void router.go('town-tracks'); }, hillIcon));
  const block = button(current().obstacle.on ? 'Take the block away. Undo can bring it back.' : 'Put a block on the track', current().obstacle.on ? 'Block away' : 'Add a block', () => { change({ type: 'obstacle-toggle' }); paintIdeas(); }, blockIcon); block.setAttribute('aria-pressed', String(current().obstacle.on)); sheet.append(block);
  const day = button(current().rollingDay ? 'Continue this optional rolling Playday' : 'Choose an optional rolling Playday: prediction, changed route or two real rolls', current().rollingDay ? 'Continue Playday' : 'A different way down', () => openSheet(current().rollingDay ? 'day-options' : 'day'), iconSVG('book'));
  day.dataset.playday = ''; sheet.append(day);
  sheet.append(button('Reset this arrangement. Your picture toy and earlier kept runs stay safe, and Undo can bring this arrangement back.', 'New experiment', () => { change({ type: 'reset' }); closeSheet(); }, iconSVG('replay')));
}
function paintPicture() {
  const scene = current(), instance = scene.instance;
  if (!instance || isRollingStarter(instance)) { closeSheet(); return; }
  sheetHeader('Your picture on this toy');
  const token = visit.serial, request = sheetSerial, snapshot = JSON.stringify(scene), png = instance.png;
  const active = () => visit.valid(token) && sheetKind === 'picture' && !sheet.hidden && request === sheetSerial
    && !saving && !checkpointing && !document.hidden && !session.isBreakLocked() && !router.isMoving() && router.current() === 'rolling-run'
    && JSON.stringify(rollingRunView().current) === snapshot;
  const choices = document.createElement('div'); choices.className = 'rolling-picture-views'; sheet.append(choices);
  const note = document.createElement('p'); note.className = 'rolling-picture-note'; note.textContent = 'Your original stays unchanged. This changes only how the picture looks.'; sheet.append(note);
  const choose = (label, caption, frame) => {
    const choice = button(label, caption, () => {
      if (!active()) return;
      const already = JSON.stringify(scene.pictureView || null) === JSON.stringify(frame);
      if (!already && !change({ type: 'picture-view', instanceId: instance.id, png, frame })) {
        note.textContent = 'This view could not be saved. Your picture and run are still here. Use Back, or try again.'; return;
      }
      closeSheet(); message(frame ? 'All your original marks are shown closer. Your whole original is unchanged.' : 'Your whole original picture is on this toy.');
    });
    choice.classList.add('rolling-picture-choice'); choice.prepend(pictureView(png, frame));
    choice.setAttribute('aria-pressed', String(JSON.stringify(scene.pictureView || null) === JSON.stringify(frame))); choices.append(choice); return choice;
  };
  choose('Show my whole picture on this toy', 'Whole picture', null);
  const adjust = button('Move and zoom my picture view without changing the original', 'Adjust view', () => { if (active()) void openSheet('picture-adjust'); });
  adjust.classList.add('rolling-picture-choice'); adjust.prepend(pictureView(png, scene.pictureView, '', 'Preview of your current picture view')); choices.append(adjust);
  const original = button('See my whole original picture unchanged', 'See original', () => { if (active()) void openSheet('original'); });
  original.classList.add('rolling-picture-choice'); original.prepend(pictureView(png, null)); choices.append(original);
  pictureInspection = new AbortController(); const inspection = pictureInspection;
  void inspectPictureView(png, { signal: inspection.signal }).then(frame => {
    if (!active() || inspection.signal.aborted) return;
    pictureInspection = null;
    if (frame) choices.insertBefore(choose('Show every original mark closer on this toy', 'Closer marks', { v: 1, ...frame }), original);
    else note.textContent = 'Use Adjust view to move and zoom. Your whole original stays unchanged and available.';
  });
}
function paintPictureAdjust() {
  const scene = current(), instance = scene.instance, png = instance?.png, size = picturePNGSize(png);
  if (!instance || isRollingStarter(instance)) { closeSheet(); return; }
  sheetHeader('Choose a closer view');
  const token = visit.serial, request = sheetSerial, snapshot = JSON.stringify(scene);
  let lifetime = new AbortController(); pictureInspection = lifetime;
  const active = () => !lifetime.signal.aborted && visit.valid(token) && sheetKind === 'picture-adjust' && !sheet.hidden && request === sheetSerial
    && !saving && !checkpointing && !document.hidden && !session.isBreakLocked() && !router.isMoving() && router.current() === 'rolling-run'
    && JSON.stringify(rollingRunView().current) === snapshot;
  const note = document.createElement('p'); note.className = 'rolling-picture-note';
  note.textContent = 'Move and zoom to choose the part on your toy. Some of your picture may be outside this view. The whole original stays unchanged.';
  if (!size || size.width > 4096 || size.height > 4096 || size.width * size.height > PICTURE_VIEW_MAX_PIXELS) {
    note.textContent = 'This picture cannot use an adjusted view. Whole picture and See original are still available.';
    sheet.append(note, button('Return to Whole picture and Closer marks choices', 'Picture choices', () => openSheet('picture'), iconSVG('back'))); return;
  }
  // Explicit temporary window over the original. No pixel inspection or export.
  let frame = scene.pictureView ? { ...scene.pictureView } : { v:1, x:Math.round(size.width / 6), y:Math.round(size.height / 6),
    width:Math.max(1,Math.round(size.width * 2 / 3)), height:Math.max(1,Math.round(size.height * 2 / 3)), sourceWidth:size.width, sourceHeight:size.height };
  frame.x = Math.min(frame.x,size.width-frame.width); frame.y = Math.min(frame.y,size.height-frame.height);
  const views = document.createElement('div'); views.className = 'rolling-picture-editor-views';
  const preview = document.createElement('div'); preview.className = 'rolling-picture-window';
  const previewLabel = document.createElement('b'); previewLabel.textContent = 'On your toy';
  const previewArt = document.createElement('div'); previewArt.className = 'rolling-picture-window-art'; preview.append(previewLabel,previewArt);
  const whole = document.createElement('div'); whole.className = 'rolling-picture-navigator';
  const wholeLabel = document.createElement('b'); wholeLabel.textContent = 'Whole original';
  const navigator = pictureView(png, {x:0,y:0,width:size.width,height:size.height,sourceWidth:size.width,sourceHeight:size.height}, '', 'Whole original with the chosen view outlined');
  const viewport = document.createElementNS('http://www.w3.org/2000/svg','rect'); viewport.setAttribute('class','rolling-picture-viewport'); viewport.setAttribute('vector-effect','non-scaling-stroke'); navigator.append(viewport); whole.append(wholeLabel,navigator);
  views.append(preview,whole); sheet.append(views,note);
  const adjustments = document.createElement('div'); adjustments.className = 'rolling-picture-adjustments'; sheet.append(adjustments);
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
  const footer = document.createElement('div'); footer.className='rolling-picture-editor-actions';
  const use = button('Use this chosen picture view on my toy','Use this view',()=>{
    if (!active() || !ready) return;
    const chosen = frame.width===size.width && frame.height===size.height ? null : {...frame};
    if (JSON.stringify(scene.pictureView || null)!==JSON.stringify(chosen) && !change({type:'picture-view',instanceId:instance.id,png,frame:chosen})) {
      // A refused save leaves this original and draft available for an explicit retry.
      lifetime=new AbortController(); pictureInspection=lifetime;
      lifetime.signal.addEventListener('abort',cancelPreview,{once:true}); use.disabled=!ready;
      note.textContent='This view could not be saved. Your picture and run are still here. Try Use this view again, or go Back.'; return;
    }
    closeSheet(); message(chosen ? 'Your chosen part of the picture is on this toy. The whole original stays unchanged and available.' : 'Your whole original picture is on this toy.');
  }); use.disabled=true;
  footer.append(use,button('Show the whole original in this preview','Whole picture',()=>{if(!active())return;frame={v:1,x:0,y:0,width:size.width,height:size.height,sourceWidth:size.width,sourceHeight:size.height};render();}),
    button('See my whole original picture unchanged','See original',()=>{if(active())void openSheet('original');}),
    button('Return to Whole picture and Closer marks choices','Picture choices',()=>openSheet('picture'),iconSVG('back'))); sheet.append(footer);
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
    if(sheetKind==='picture-adjust' && request===sheetSerial && note.isConnected) note.textContent='This preview is paused. Use Picture choices to open it again.';
  }
  lifetime.signal.addEventListener('abort',cancelPreview,{once:true});
  image.onload=()=>{if(!active()){clear();return;}ready=image.naturalWidth===size.width&&image.naturalHeight===size.height;use.disabled=!ready;
    if(!ready)note.textContent='This original could not open at its saved size. Whole picture and See original are still available.';clear();};
  image.onerror=()=>{if(active())note.textContent='This original could not open. Your picture and run are still here. Use Picture choices to try again.';clear();};
  image.src=png;
}
function paintOriginal() {
  const instance = current().instance; if (!instance || isRollingStarter(instance)) { closeSheet(); return; }
  sheetHeader('Your whole original, unchanged');
  sheet.append(pictureView(instance.png, null, 'rolling-original-picture'));
  const note = document.createElement('p'); note.textContent = 'This is your exact original picture. Your toy, view and run stay the same.'; sheet.append(note);
  sheet.append(button('Return to Whole picture and Closer marks choices', 'Picture choices', () => openSheet('picture'), iconSVG('back')));
}
// Pictured previews use the actual toy, hill, block, mat and retained result.
function runPreview(scene, { guess = null } = {}) {
  const preview = document.createElement('div'); preview.className = 'rolling-day-preview'; preview.setAttribute('aria-hidden', 'true');
  const toy = toyFigure(scene.instance || starterRollingInstance(), scene.pictureView); toy.style.left = `${scene.outcome?.end ?? ROLL_START}%`; preview.append(toy);
  if (scene.obstacle.on) { const block = document.createElement('span'); block.className = 'rolling-day-block'; block.style.left = `${scene.obstacle.x}%`; block.append(propImage('block')); preview.append(block); }
  const mat = document.createElement('span'); mat.className = 'rolling-day-mat'; mat.style.left = `${scene.target}%`; mat.append(propImage('mat')); preview.append(mat);
  if (guess != null) { const mark = document.createElement('b'); mark.className = 'rolling-day-guess'; mark.style.left = `${guess}%`; mark.textContent = '?'; preview.append(mark); }
  const levels = document.createElement('span'); levels.className = 'rolling-day-levels'; levels.textContent = `Hill ${['low', 'middle', 'high'][scene.ramp]} · Push ${['gentle', 'middle', 'big'][scene.push]}`; preview.append(levels); previewScenes.set(preview, scene); return preview;
}
function repaintRunPreviews() {
  if (!sheet || sheet.hidden) return;
  for (const preview of sheet.querySelectorAll('.rolling-day-preview')) {
    const scene = previewScenes.get(preview); if (!scene || !preview.clientWidth || !preview.clientHeight) continue;
    const g = rollingGeometry(preview.clientWidth, preview.clientHeight, scene); preview.style.setProperty('--ground', `${g.ground}px`);
    preview.querySelector('.rolling-day-ramp')?.remove(); preview.prepend(rampFigure(g, 'rolling-day-ramp'));
    placeToy(preview.querySelector('.rolling-toy'), g.end, g);
    const block = preview.querySelector('.rolling-day-block'); if (block) placeProp(block, 'block', g.width, g.ground);
    placeProp(preview.querySelector('.rolling-day-mat'), 'mat', g.width, g.ground);
    const guess = preview.querySelector('.rolling-day-guess'); if (guess) guess.style.top = `${g.ground - 25}px`;
  }
}
function dayChoice(label, text, action, scene = current(), options) {
  const choice = button(label, text, action); choice.classList.add('rolling-day-choice'); choice.prepend(runPreview(scene, options)); return choice;
}
function proposedRun(action) { try { return editRollingScene(current(), action); } catch { return null; } }
function beginDay(episode) {
  const ready = rollingDayReadiness(current(), episode);
  if (!ready.ready) { closeSheet(); message(dayRefusal(ready.reason)); return; }
  if (!change({ type: 'rolling-day-start', episode })) return;
  void openSheet('day-options');
}
function finishDayAction(action, key = null) {
  if (!change(action)) return;
  closeSheet(); if (key) guidance?.present(key);
}
function paintDay() {
  sheetHeader('A different way down');
  const description = document.createElement('p'); description.textContent = 'Choose a beginning. You can change your mind and keep playing your way.'; sheet.append(description);
  const grid = document.createElement('div'); grid.className = 'rolling-day-grid';
  grid.append(dayChoice('Guess where this toy will stop, then try the real roll', 'Where will it stop?', () => beginDay('prediction'), current(), { guess: 72 }),
    dayChoice('Choose a real new block or landing place, then try different ways', 'A changed route', () => beginDay('changed-route'), { ...current(), obstacle: { on: true, x: 70 } }),
    dayChoice('Keep a real roll and compare another setup', 'Two ways down', () => beginDay('comparison')));
  sheet.append(grid);
  if (!current().outcome) { const note = document.createElement('p'); note.textContent = 'For Two ways down, try a roll first.'; sheet.append(note); }
}
function paintDayOptions() {
  const day = current().rollingDay;
  if (!day) { paintDay(); return; }
  sheetHeader(ROLLING_DAY_LABELS[day.episode]);
  const note = document.createElement('p'); note.textContent = rollingDayCaption(current()); sheet.append(note);
  const grid = document.createElement('div'); grid.className = 'rolling-day-grid';
  if (day.episode === 'prediction') {
    for (const place of ROLLING_DAY_PREDICTIONS) {
      const choice = dayChoice(`My guess: ${place.label.toLowerCase()}`, place.label, () => finishDayAction({ type: 'rolling-day-predict', place: place.id }, 'living_roll_day_predicted'), current(), { guess: place.x });
      choice.dataset.prediction = place.id; choice.setAttribute('aria-pressed', String(day.prediction === place.id)); grid.append(choice);
    }
  } else if (day.episode === 'changed-route') {
    if (!day.change) {
      for (const kind of ['block', 'landing']) {
        const action = { type: 'rolling-day-change', kind }, proposal = proposedRun(action);
        const choice = dayChoice(kind === 'block' ? 'Choose a new block on the route. Undo can restore this route.' : 'Choose a different landing place. Undo can restore this route.', kind === 'block' ? 'A new block' : 'A different landing', () => finishDayAction(action, rollingDayChoices(proposedRun(action) || current()).length ? 'living_roll_day_changed' : null), proposal || current());
        choice.disabled = !proposal; grid.append(choice);
      }
    } else {
      const names = { 'clear-block': 'Clear the way', 'move-block': 'Move the block', 'landing-nearby': 'A nearby landing' };
      for (const choice of rollingDayChoices(current())) { const action = { type: 'rolling-day-resolve', choice }, preview = proposedRun(action); if (!preview) continue; const text = names[choice]; grid.append(dayChoice(`${text}, then try the real roll`, text, () => finishDayAction(action), preview)); }
      grid.append(button('Keep this changed route and try it as it is', 'Try it as it is', () => { closeSheet(); tryRun(); }, iconSVG('play')));
    }
  } else {
    for (const which of ['first', 'second']) {
      const trial = day.comparison[which]; if (!trial) continue;
      const choice = dayChoice(`Keep playing with the ${which} real roll: ${rollingOutcomeText(trial)}`, which === 'first' ? 'First roll' : 'Second roll', () => finishDayAction({ type: 'rolling-day-choose', which }), trial); choice.dataset.trial = which; grid.append(choice);
    }
    if (!day.comparison.second) grid.append(button('Return to change the hill, push, block or mat and try a second setup', 'Try another way', closeSheet, iconSVG('back')));
  }
  sheet.append(grid);
  const footer = document.createElement('div'); footer.className = 'rolling-day-footer';
  footer.append(button('Choose another optional rolling beginning. Undo can return to this one.', 'Another beginning', () => openSheet('day'), iconSVG('book')),
    button('Keep this toy and arrangement and leave the optional Playday', 'Play my way', () => finishDayAction({ type: 'rolling-day-leave' }), iconSVG('back'))); sheet.append(footer);
}
async function openSheet(kind) {
  if (saving || !view) return;
  if (['picture', 'picture-adjust', 'original'].includes(kind) && (checkpointing || drag || pointers?.active != null || document.hidden || session.isBreakLocked())) return;
  cancelTransient(); paint(); sheetKind = kind; sheet.hidden = false; const request = ++sheetSerial, token = visit.serial;
  for (const child of host.children) if (child !== sheet) child.inert = true;
  if (kind === 'toys') {
    if (libraryIssue) {
      sheetHeader('Opening your toys…');
      try { const loaded = await loadToyWorkshop({ force: true }); if (!visit.valid(token) || request !== sheetSerial) return; library = loaded; libraryIssue = false; }
      catch { if (!visit.valid(token) || request !== sheetSerial) return; library = { assets: [], toys: [] }; libraryIssue = true; }
    } else library = getToyWorkshop();
    if (!visit.valid(token) || request !== sheetSerial) return; paintToys();
  }
  else if (kind === 'saved') paintSaved(); else if (kind === 'day') paintDay(); else if (kind === 'day-options') paintDayOptions();
  else if (kind === 'picture') paintPicture(); else if (kind === 'picture-adjust') paintPictureAdjust(); else if (kind === 'original') paintOriginal(); else paintIdeas();
  repaintRunPreviews(); sheet.querySelector('button')?.focus({ preventScroll: true });
  if (kind === 'day-options') { const scene = current(), key = dayGuideKey(scene); if (key) guidance?.after(key, { guard: () => current() === scene && sheetKind === kind && sheetSerial === request }); }
}

async function openCurrentRun(params, token, force = false) {
  try {
    if (force && rollingRunStatus().issue === 'rolling-write') await rollingStore.retryRollingRunWrites();
    if (!visit.valid(token)) return;
    const [run, toys] = await Promise.allSettled([loadRollingRun({ force }), loadToyWorkshop()]);
    if (!visit.valid(token)) return;
    if (run.status !== 'fulfilled') throw run.reason;
    view = run.value; libraryIssue = toys.status !== 'fulfilled'; library = libraryIssue ? { assets: [], toys: [] } : toys.value;
    let missing = false;
    if (params.toyId) { const row = library.toys.find(item => item.id === params.toyId && item.behavior === 'rolling' && (!ownerFilter || item.owner === ownerFilter || item.owner === 'shared')); if (row) chooseToy(row.id); else missing = true; }
    if (!visit.valid(token)) return; if (!rollingRunView().current.instance) chooseRollingStarter(savedWorld.id); getView(); paint();
    const issue = rollingRunStatus().issue, invitation = issue && issue !== 'rolling-temporary' ? rollingSaveMessage(null, issue) : missing ? 'That toy is unavailable. This run is still here; choose Starter or another picture toy.' : rollingOutcomeText(current());
    if(missing || libraryIssue || (issue && issue!=='rolling-temporary'))openingNotice=invitation;
    message(invitation + (libraryIssue ? ' Your picture basket could not open; try Toys again.' : '') + (!rollingRunStatus().persistent ? ' Device saving is unavailable; kept runs may disappear when this page closes.' : ''));
    if (force) guidance?.guide(false);
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { if (visit.valid(token)) stopHint(); }, 4500);
  } catch {
    if (!visit.valid(token)) return;
    message('Your run could not open. Your kept work is unchanged. Try opening it again.');
    const retry = button('Try opening your run again. Your kept work is unchanged.', 'Try again', () => { retry.disabled = true; message('Opening your run…'); void openCurrentRun(params, token, true); }, iconSVG('replay'));
    retry.dataset.retryRun = ''; retry.classList.add('rolling-empty'); board.replaceChildren(retry);
  }
}

async function checkpointRolling() {
  abortPictureInspection(); guidance?.interrupt();
  if (!visit.active || checkpointing) return false;
  if (!view) { const token=visit.serial; try { await flushRollingRun(); return visit.valid(token); } catch { if (visit.valid(token)) message('Your run could not finish saving. Try again before leaving.'); return false; } }
  const token = visit.serial; checkpointing = true; stopMotion();
  try {
    const placed = commitLivingPlacement({ drag, action: drag?.position != null ? { type: drag.part === 'target' ? 'target' : 'obstacle-move', x: drag.position } : null,
      readCurrent: () => rollingRunView().current, edit: editRollingScene, commit: changeRollingRun,
      release: () => { drag = null; picked = null; pointers?.cancel(performance.now()); getView(); paint(); } });
    if (!placed) { message('Finish placing this, then try again. Your move is still here.'); return false; }
    const accepted = await checkpointLivingScene({ flush: flushRollingRun, retry: () => rollingStore.retryRollingRunWrites(), storage: rollingRunStatus,
      alive: () => visit.valid(token), report: message, subject: 'Your run' });
    if (accepted && visit.valid(token)) { cancelTransient(); if (sheetKind) closeSheet(); }
    return accepted;
  } finally { if (visit.valid(token)) { checkpointing = false; bus.emit('activity:idle'); } }
}
export default {
  id: 'rolling-run',
  async mount(el, params = {}) {
    enteredFromMap = params.fromMap === true;
    const token = visit.begin(); openingNotice='';host = el; view = null; library = null; libraryIssue = false; saving = false; checkpointing = false; sheetKind = null; drag = picked = null; hint = true; pointers = new WorkshopPointers();
    host.classList.add('rolling-run'); host.innerHTML = '<header class="rolling-header"><h1>Rolling Run</h1><nav class="rolling-navigation" aria-label="Go to another place"></nav></header><div class="rolling-body"><main class="rolling-board" tabindex="0" role="group" aria-label="Toy ramp and landing track"></main><div class="rolling-tools" aria-label="Change your experiment"></div></div><p class="rolling-status" role="status" aria-live="polite">Opening your run…</p><div class="rolling-controls"></div><section class="rolling-sheet" hidden role="dialog" aria-modal="true" aria-label="Choose toys, experiments or saved runs"></section>';
    board = host.querySelector('.rolling-board'); tools = host.querySelector('.rolling-tools'); controls = host.querySelector('.rolling-controls'); status = host.querySelector('.rolling-status'); sheet = host.querySelector('.rolling-sheet');
    guidance?.dispose(); guidance = new LivingGuidance({ route: 'rolling-run', active: () => visit.valid(token),
      ready: () => !!view && !saving && !checkpointing && (!sheetKind || sheetKind === 'day-options') && !drag && !openingNotice,
      guideKey: help => dayGuideKey(view?.current) || livingPlayGuideKey('rolling-run', view?.current, { help }),
      caption: (text, key) => { host.dataset.guidance = key; message(text); } });
    idleHelp?.();idleHelp=installIdleHelp(host,{
      active:()=>visit.valid(token) && !!view && !current().rollingDay && !saving && !checkpointing && !sheetKind && !drag && !moving && pointers?.active==null && !openingNotice && !session.isBreakLocked() && !router.isMoving() && router.current()==='rolling-run' && !speech.isSpeaking(),
      demonstrate:()=>{
        const placing=!!picked, trial=placing ? null : current().outcome, kind=trial?.kind;
        const outcomeKey=['blocked','landed','short','past','stop'].includes(kind) ? LIVING_PLAY_OUTCOME_KEYS['rolling-run'][kind] : null;
        if(trial && (!outcomeKey || !board.querySelector('.rolling-toy')))return null;
        const target=placing ? board : trial ? kind==='stop' ? tools.querySelector('[data-ramp]') : board.querySelector(kind==='blocked' ? '[data-part="obstacle"]' : '[data-part="target"]') : controls.querySelector(current().instance?'[data-try]':'[data-toys]');
        if(!target || target.disabled)return null;
        const cueClass=placing?'rolling-idle-board':'rolling-idle-target'; target.classList.add(cueClass);
        if(trial)guidance.after(outcomeKey,{guard:()=>current().outcome===trial && target.isConnected && !!board.querySelector('.rolling-toy')});
        else if(!placing)guidance.guide(false);
        const serial=guidance.serial;
        const motionCue=!placing && !reduced() && target.animate?.([{translate:'0 0'},{translate:'0 -6px'},{translate:'0 0'}],{duration:900,iterations:1,easing:'ease-in-out'});
        idleMotion=motionCue || null;motionCue?.finished?.catch?.(()=>{});let visualDone=false;
        const clearVisual=()=>{if(visualDone)return;visualDone=true;motionCue?.cancel?.();if(idleMotion===motionCue)idleMotion=null;target.classList.remove(cueClass);};
        const visualTimer=setTimeout(clearVisual,2400);let voiceOwned=!placing;const voiceTimer=setTimeout(()=>{voiceOwned=false;},4000);
        return ()=>{clearTimeout(visualTimer);clearTimeout(voiceTimer);clearVisual();if(voiceOwned && guidance && guidance.serial===serial)guidance.interrupt();};
      },
    });
    mute = muteButton(); const home = homeButton(); home.setAttribute('aria-label', 'Home: back to your valley'); const saves = button('Open your kept runs', 'Runs', () => openSheet('saved'), iconSVG('book')); saves.dataset.saved = ''; saves.disabled = true;
    const make = button('Make your own picture toy in the Toy Workshop, then bring it back to this hill', 'Make my own', makeYourOwn, iconSVG('art')); make.dataset.make = '';
    const pictureControl = button('Choose Whole picture, Adjust view or See original for this picture toy', 'View', () => { if (visit.valid(token)) void openSheet('picture'); }, pictureIcon);
    pictureControl.dataset.pictureView = ''; pictureControl.classList.add('rolling-picture-control'); pictureControl.hidden = true;
    host.querySelector('nav').append(home, mute, make, pictureControl, saves);
    const guide = button('Help: hear what to do with your rolling toy', 'Help', help, iconSVG('help')); guide.dataset.help = ''; guide.disabled = true; host.querySelector('nav').append(guide);
    const hill = button('Change the hill height', 'Hill', () => change({ type: 'ramp', level: (current().ramp + 1) % 3 }), hillIcon); hill.dataset.ramp = ''; hill.disabled = true;
    const push = button('Change the push strength', 'Push', () => change({ type: 'push', level: (current().push + 1) % 3 }), iconSVG('next')); push.dataset.push = ''; push.disabled = true; tools.append(hill, push);
    const actions = [ ['toys', 'Choose the starter or your own rolling picture toy', 'Toys', () => openSheet('toys'), pictureIcon], ['ideas', 'Choose an experiment or add/remove a block', 'Ideas', () => openSheet('ideas'), hillIcon],
      ['undo', 'Undo the last arrangement or trial', 'Undo', () => { cancelTransient(); undoRollingRun(); getView(); paint(); message(rollingOutcomeText(current())); }, iconSVG('undo')],
      ['try', 'Let your toy roll down the hill', 'Try', tryRun, iconSVG('play')], ['keep', 'Keep this editable run and its toy', 'Keep', keep, iconSVG('heart')] ];
    actions.forEach(([key, label, text, action, icon]) => { const b = button(label, text, action, icon); b.dataset[key] = ''; b.disabled = true; controls.append(b); });
    listen(host, 'pointerdown', event => {
      if (checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (event.target.closest('.rolling-navigation')) return;
      const decision = pointers.down(event, performance.now(), !settings.get().penOnly);
      if (decision.cancel) { cancelTransient(); if (view) paint(); }
      if (!decision.accepted) { event.preventDefault(); event.stopImmediatePropagation(); } else { openingNotice='';guidance?.interrupt(); host.classList.remove('is-guided'); stopHint(); }
    }, true);
    listen(host, 'click', event => { if (checkpointing || (!event.target.closest('.rolling-navigation') && !pointers.allowClick(event, performance.now()))) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(host, 'keydown', event => { if (checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(host, 'pointermove', event => { if (checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(host, 'pointermove', moveDrag); listen(window, 'pointerup', endDrag);
    const cancel = event => { if (pointers.finish(event, performance.now(), true)) { cancelTransient(); if (view) paint(); } };
    listen(window, 'pointercancel', cancel); listen(host, 'lostpointercapture', event => { if (pointers.owns(event)) cancel(event); });
    listen(board, 'click', event => { if (picked && !event.target.closest('button')) change({ type: picked === 'target' ? 'target' : 'obstacle-move', x: coordinate(event.clientX) }); });
    listen(board, 'keydown', event => {
      if (event.target !== board || !view) return;
      if (picked && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const x = picked === 'target' ? current().target : current().obstacle.x; change({ type: picked === 'target' ? 'target' : 'obstacle-move', x: x + (event.key === 'ArrowLeft' ? -5 : 5) }); }
      else if (['Enter', ' '].includes(event.key)) { event.preventDefault(); tryRun(); }
    });
    listen(sheet, 'keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeSheet(); }
      if (event.key === 'Tab') { const buttons = [...sheet.querySelectorAll('button:not(:disabled)')], first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    });
    const disruption = () => { cancelTransient(); if (view) paint(); repaintRunPreviews(); void flushRollingRun().catch(() => {}); };
    listen(window, 'blur', disruption); listen(window, 'resize', disruption); listen(document, 'visibilitychange', () => { if (document.hidden) disruption(); });
    if (typeof ResizeObserver !== 'undefined') {
      const observedBoard = board; let width = board.clientWidth, height = board.clientHeight;
      observer = new ResizeObserver(() => {
        if (!visit.valid(token) || board !== observedBoard) return;
        const changed = width !== board.clientWidth || height !== board.clientHeight;
        width = board.clientWidth; height = board.clientHeight;
        if (view && changed) disruption();
      }); observer.observe(board);
    }
    offSettings = bus.on('settings:changed', () => { if (reduced() && view) { disruption();idleMotion?.cancel?.();idleMotion=null; } });
    await openCurrentRun(params, token);
  },
  busy() { return saving || checkpointing || !!drag; }, breakBusy() { return saving || checkpointing || !!drag; },
  onBack() { if (sheetKind) closeSheet(); else void router.go(enteredFromMap ? 'map' : 'toy-workshop'); },
  beforeLeave: checkpointRolling,
  beforeBreak: checkpointRolling,
  unmount() { idleHelp?.();idleHelp=null;guidance?.dispose(); guidance = null; visit.end(); checkpointing = false; stopHint(); cancelTransient(); listeners.forEach(off => off()); listeners = []; observer?.disconnect(); observer = null; offSettings?.(); mute?.destroy?.(); void flushRollingRun().catch(() => {}); host = board = status = tools = controls = sheet = view = library = null; sheetKind = null; saving = false; },
};
