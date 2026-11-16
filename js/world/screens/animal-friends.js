import { installIdleHelp } from '../idle-help.js';
import speech from '../../audio/speech.js';
import router, { homeButton, muteButton, iconSVG, tapify } from '../router.js';
import art from '../art.js';
import bus from '../bus.js';
import LivingGuidance from '../living-guidance.js';
import { livingPlayGuideKey, LIVING_PLAY_PHRASES, LIVING_PLAY_OUTCOME_KEYS } from '../../data/living-play-phrases.js';
import settings from '../../state/settings.js';
import session from '../../state/session.js';
import { savedWorld } from '../../state/saved-world.js';
import gallery from '../../parent/gallery.js';
import * as db from '../../state/db.js';
import { isCreationRow } from '../../state/creation-frame.js';
import { WorkshopVisit, WorkshopPointers } from './toy-workshop.js';
import { ANIMAL_PLACES, ANIMAL_RELATIONS, animalCatPosition, animalInvitationText, cozyCornerOutcome, editAnimalCorner } from '../../data/animal-friends.js';
import { catCornerDayOutcome, catCornerDayInvitation } from '../../data/cat-corner-day.js';
import { checkpointLivingScene, commitLivingPlacement } from './music-band.js';
import * as animalStore from '../../state/animal-friends.js';
import { loadAnimalFriends, animalFriendsView, changeAnimalFriends, undoAnimalFriends, animalFriendsPage,
  keepAnimalFriends, reopenAnimalFriends, flushAnimalFriends, animalFriendsStatus } from '../../state/animal-friends.js';

export const ANIMAL_ART = Object.freeze({
  cat: ['stories/black-cat', 'assets/art/final/stories/black-cat.png'], rest: ['props/wg-cat-resting-v1', 'assets/art/final/props/wg-cat-resting-v1.png'],
  bed: ['animal-friends/cozy-bed-v1', 'assets/art/final/animal-friends/cozy-bed-v1.png'], leaf: ['animal-friends/leafy-screen-v1', 'assets/art/final/animal-friends/leafy-screen-v1.png'],
  basket: ['animal-friends/hiding-basket-v1', 'assets/art/final/animal-friends/hiding-basket-v1.png'], shelter: ['animal-friends/blanket-shelter-v1', 'assets/art/final/animal-friends/blanket-shelter-v1.png'],
  curtain: ['animal-friends/blanket-cover-v1', 'assets/art/final/animal-friends/blanket-cover-v1.png'],
  canopy: ['animal-friends/shade-canopy-v1', 'assets/art/final/animal-friends/shade-canopy-v1.png'],
  ishan: ['characters/family_ishan_idle', 'assets/art/final/characters/family_ishan_idle.png'],
  ba: ['characters/family_grandma_idle', 'assets/art/final/characters/family_grandma_idle.png'],
  dada: ['characters/family_grandpa_idle', 'assets/art/final/characters/family_grandpa_idle.png'],
});
// Contact points are authored visible ground/surface lines, not alpha bounds.
export const ANIMAL_CONTACT = Object.freeze({
  bed: { w: 1536, h: 1024, span: 1070, units: 28, center: 765, ground: 900, seat: 610, pillow: 600, cushion: [230, 330, 1300, 670] },
  leaf: { w: 1536, h: 1024, span: 1485, units: 26, center: 768, ground: 846 },
  basket: { w: 1536, h: 1024, span: 1509, units: 26, center: 768, ground: 954, seat: 900, front: 650 },
  shelter: { w: 1536, h: 1024, span: 1489, units: 30, center: 768, ground: 725, seat: 715, opening: [440, 390, 1090, 725] },
  curtain: { w: 1374, h: 1145, span: 1330, center: 687, ground: 1104, left: 22 },
  cat: { w: 1145, h: 1374, span: 1145, units: 17, center: 572.5, ground: 1307 },
  rest: { w: 1536, h: 1024, span: 1536, units: 22, center: 768, ground: 956 },
  canopy: { w: 1536, h: 1024, span: 1280, units: 57, center: 768, ground: 840 },
});
export function animalSpriteGeometry(kind, unit, units = ANIMAL_CONTACT[kind].units) {
  const m = ANIMAL_CONTACT[kind], scale = units * unit / m.span;
  return { width: m.w * scale, height: m.h * scale, anchorX: m.center * scale, anchorY: m.ground * scale, scale };
}
export function animalVisibleCatGeometry(corner, layout) {
  const position = animalCatPosition(corner), pose = position.pose, kind = pose === 'rest' ? 'rest' : 'cat';
  const size = corner.cat.place === 'shelter' ? 11.3 : ANIMAL_CONTACT[kind].units;
  const sprite = animalSpriteGeometry(kind, layout.unit, size), foot = { x: position.x / 100 * layout.width, y: position.y / 100 * layout.height };
  if (corner.cat.place === 'bed') { const bed = animalSpriteGeometry('bed', layout.unit); foot.y = corner.bed.y / 100 * layout.height + (ANIMAL_CONTACT.bed.seat - ANIMAL_CONTACT.bed.ground) * bed.scale; }
  else if (['basket', 'shelter'].includes(corner.cat.place)) { const place = corner.places.find(row => row.id === corner.cat.place), object = animalSpriteGeometry(place.id, layout.unit), metric = ANIMAL_CONTACT[place.id]; foot.y = place.y / 100 * layout.height + (metric.seat - metric.ground) * object.scale; }
  return { ...sprite, ...foot, kind, hidden: position.hidden, size };
}
const hand = '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="15" r="12" fill="#ffe9ad"/><path d="M24 40V15a6 6 0 0 1 12 0v16l8-3q7 0 5 9l-5 16H27L14 40q-4-8 3-10l7 10" fill="#ffe1b8" stroke="#79563c" stroke-width="3"/></svg>';
const pictureIcon = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="8" width="48" height="45" rx="4" fill="#fffdf5" stroke="#98724e" stroke-width="3"/><circle cx="23" cy="23" r="6" fill="#edce75"/><path d="m12 47 14-17 12 10 8-8 7 15" fill="#9fc795"/></svg>';
const ownerFilter = savedWorld.id === 'shared' ? null : savedWorld.id;
export function animalSceneGeometry(width, height, authoredCorner = false) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1), ratio = !authoredCorner && h < 210 && w > h ? 2.2 : 1.6;
  const sceneWidth = Math.min(w, h * ratio), sceneHeight = sceneWidth / ratio;
  return { width: sceneWidth, height: sceneHeight, left: (w - sceneWidth) / 2, top: (h - sceneHeight) / 2, unit: sceneWidth / 100 };
}
export function animalSaveMessage(result, issue) {
  if (issue === 'animal-full' || issue === 'animal-capacity') return 'The corner shelf is full. Your cat, arrangement and picture are still here.';
  if (issue) return 'This corner could not be kept. Your arrangement and picture are still here. Try Keep again.';
  return result?.persistent ? 'Your animal corner is kept, saved on this device.' : 'Your corner is kept for now. Device saving is unavailable; it may disappear when this page closes.';
}
export function animalBedAction(corner, arranging) { return (corner.catDay?.episode !== 'free' && corner.catDay || corner.invitation === 'visit') && !arranging ? 'rest' : 'move'; }
export function animalBedLabel(corner, arranging) { return animalBedAction(corner, arranging) === 'rest' ? 'Your cozy padded bed. Tap to invite the cat to rest. Drag to move it, or choose Move things.' : 'Your cozy padded bed. Tap to move it, then tap a new place, or drag.'; }
const activeCatStory = corner => !!corner?.catDay && corner.catDay.episode !== 'free';
function ordinaryAnimalGuideKey(corner, options = {}) {
  if (!options.arranging && animalCatPosition(corner).hidden) return corner.phase === 'partner-search' ? 'living_animal_partner' : 'living_animal_seek';
  return livingPlayGuideKey('animal-friends', corner, options);
}
/** Hidden places never leak through status, Help, Undo, or a saved return. */
export function animalPlayInvitation(corner) {
  if (activeCatStory(corner)) return catCornerDayInvitation(corner);
  if (corner.invitation !== 'seek' && !animalCatPosition(corner).hidden) {
    const { catDay, ...ordinary } = corner; return animalInvitationText(ordinary);
  }
  return LIVING_PLAY_PHRASES[ordinaryAnimalGuideKey(corner)]?.text || LIVING_PLAY_PHRASES.living_animal_seek.text;
}
/** Only new actions with an actual pictured consequence receive commentary. */
export function animalConsequenceKey(before, after, action) {
  const cat = animalCatPosition(after);
  if (activeCatStory(after) && action.type !== 'cat-day-begin') {
    const result = catCornerDayOutcome(after);
    if (action.type === 'cat-day-leave' && !result.visitor?.arrived && result.visible) return 'living_cat_day_leave';
    if (result.visible && result.outcome === 'greeting' && action.type === 'cat-day-greet') return 'living_cat_day_greet';
    if (result.visible && result.visitor?.arrived && result.outcome === 'playing-nearby') return 'living_cat_day_play';
    if (result.resting && result.visitor?.arrived && result.visitor.role === 'watching') return 'living_cat_day_quiet';
    if (result.resting && result.covered) return after.catDay.restTarget === 'bed' ? 'living_cat_day_bed' : 'living_cat_day_shade';
  }
  if (action.type === 'open' && animalCatPosition(before).hidden && !cat.hidden && after.phase === 'revealed') return LIVING_PLAY_OUTCOME_KEYS['animal-friends'][after.cat.place] || null;
  if (action.type === 'ready' && before.phase === 'choose-hide' && after.phase === 'partner-search' && cat.hidden) return 'living_animal_partner';
  if (action.type === 'rest') return after.reaction === 'space' ? 'living_animal_space' : after.reaction === 'rest' && !cat.hidden ? 'living_animal_rest' : null;
  if (action.type === 'follow-picture' && after.picture && after.cat.place === 'picture' && !cat.hidden) return 'living_animal_picture';
  return null;
}
const visit = new WorkshopVisit();
let enteredFromMap = false;
let host, board, scene, status, controls, sheet, sheetKind, view, mute, offSettings, observer, guidance, saving = false, pointers, selected, drag, arranging = false, animation, hint = true, hintTimer, sheetSerial = 0, pictureRows = [], picturePage = 0, savedPage = 0, listeners = [], checkpointing = false, openingNotice = '', idleHelp = null, idleMotions = [], openingAnimal = false, animalLoadRetry = null; 
const reduced = () => settings.get().reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function button(label, text, action, icon = '') {
  const b = document.createElement('button'), born = sheetSerial; b.type = 'button'; b.className = 'animal-button'; b.setAttribute('aria-label', label); b.innerHTML = `${icon}<span></span>`; b.querySelector('span').textContent = text;
  tapify(b, event => {
    if (checkpointing || saving || !visit.active || !b.isConnected || router.isMoving()) return;
    const inSheet = b.closest('.animal-sheet'); if (inSheet && (sheet?.hidden || !sheetKind || born !== sheetSerial)) return;
    for (let ancestor = b; ancestor && ancestor !== host; ancestor = ancestor.parentNode) if (ancestor.inert) return;
    openingNotice='';if (!('help' in b.dataset)) guidance?.interrupt(); action(event);
  }); return b;
}
function image(kind, alt = '') { const [key, path] = ANIMAL_ART[kind], img = document.createElement('img'); img.src = art.get(key)?.src || path; img.alt = alt; img.draggable = false; img.addEventListener('error', () => { img.classList.add('animal-art-unavailable'); img.alt = `${alt || kind} picture is unavailable`; }, { once: true }); return img; }
function listen(target, type, action, options) { target.addEventListener(type, action, options); listeners.push(() => target.removeEventListener(type, action, options)); }
function current() { return view.current; }
function message(text) { if (status) status.textContent = text; }
function stopHint() { hint = false; clearTimeout(hintTimer); scene?.querySelector('.animal-demo')?.remove(); scene?.classList.remove('is-guided'); }
function cancelTransient() { guidance?.interrupt(); animation?.cancel(); animation = null; selected = null; drag = null; pointers?.cancel(performance.now()); scene?.classList.remove('is-dragging', 'is-guided'); }
function help() {
  if (!view || saving || checkpointing || sheetKind || drag || pointers?.active != null || document.hidden || session.isBreakLocked()) return;
  if (!arranging && current().invitation === 'seek' && current().phase === 'choose-hide' && !ANIMAL_PLACES.includes(current().cat.place)) { void openSheet('hiding'); return; }
  if (activeCatStory(current()) && !arranging && !animalCatPosition(current()).hidden) { void openSheet('day-options'); return; }
  cancelTransient(); hint = current().invitation !== 'seek'; paint(); scene.classList.add('is-guided'); guidance?.guide(true);
}
function geometry() {
  if (!board || !scene) return;
  const g = animalSceneGeometry(board.clientWidth, board.clientHeight, !!current().catDay); scene.style.width = `${g.width}px`; scene.style.height = `${g.height}px`; scene.style.left = `${g.left}px`; scene.style.top = `${g.top}px`; scene.style.setProperty('--unit', `${g.unit}px`);
}
function position(el, x, y, depth = 1) { el.style.left = `${x}%`; el.style.top = `${y}%`; el.style.zIndex = String(Math.round(y * 10) + depth); }
function sprite(el, img, kind, unit, units) {
  const g = animalSpriteGeometry(kind, unit, units); el.style.width = `${g.width}px`; el.style.height = `${g.height}px`; el.style.transform = `translate(${-g.anchorX}px, ${-g.anchorY}px)`;
  img.style.position = 'absolute'; img.style.left = '0'; img.style.top = '0'; img.style.width = `${g.width}px`; img.style.height = `${g.height}px`; img.style.transformOrigin = `${g.anchorX}px ${g.anchorY}px`; el.append(img); return g;
}
function partButton(label, part, x, y, callback) { const b = button(label, '', callback); b.classList.add('animal-object'); b.dataset.part = part; position(b, x, y); b.setAttribute('aria-pressed', String(selected === part)); b.addEventListener('pointerdown', event => startDrag(event, part)); return b; }
function positionCanopyHandle(handle, canopy, layout) {
  if (!handle) return; const metric = animalSpriteGeometry('canopy', layout.unit), roofY = canopy.y / 100 * layout.height - (840 - 240) * metric.scale;
  handle.style.left = `${canopy.x}%`; handle.style.top = `${roofY}px`; handle.style.zIndex = '1500';
}
function paintCanopy(canopy, layout) {
  const artwork = document.createElement('div'); artwork.className = 'animal-canopy-art'; artwork.dataset.canopyArt = ''; position(artwork, canopy.x, canopy.y, -3); sprite(artwork, image('canopy', 'An open pink shade canopy'), 'canopy', layout.unit); scene.append(artwork);
  // Only the roof is interactive. The transparent opening must let the child
  // reach the cat, bed and other objects underneath it.
  const handle = button(arranging ? 'Move the shade canopy. Tap and tap a new place, or drag its roof.' : 'Shade canopy. Tap for resting choices, or drag its roof to move it.', 'Shade', () => arranging ? select('canopy') : openSheet('day-options'));
  handle.classList.add('animal-canopy-handle'); handle.dataset.part = 'canopy'; handle.setAttribute('aria-pressed', String(selected === 'canopy')); handle.addEventListener('pointerdown', event => startDrag(event, 'canopy')); positionCanopyHandle(handle, canopy, layout); scene.append(handle);
}
const FAMILY_VISITOR = Object.freeze({
  ishan: { name: 'Ishan', canvas: [480,640], crop: [16,33,464,606], height: 27 },
  ba: { name: 'Ba', canvas: [480,640], crop: [116,16,363,624], height: 34 },
  dada: { name: 'Dada', canvas: [356,672], crop: [16,16,340,656], height: 35 },
});
function paintVisitor(visitor, layout, foreground = null) {
  const metric = FAMILY_VISITOR[visitor.id], height = metric.height * layout.unit, scale = height / (metric.crop[3] - metric.crop[1]), width = (metric.crop[2] - metric.crop[0]) * scale;
  const person = partButton(`${metric.name} is ${visitor.role === 'playing' ? 'playing' : 'watching quietly'}. Tap for choices, or drag to move.`, 'visitor', visitor.x, visitor.y, () => arranging ? select('visitor') : openSheet('day-options'));
  person.classList.add('animal-visitor'); person.dataset.visitor = visitor.id; person.dataset.role = visitor.role; person.style.width = `${width}px`; person.style.height = `${height}px`; person.style.transform = `translate(${-width / 2}px, ${-height}px)`;
  if (foreground !== null) person.style.zIndex = String(Math.max(Number(person.style.zIndex), foreground));
  const crop = document.createElement('div'); crop.className = 'animal-visitor-crop'; crop.style.width = `${width}px`; crop.style.height = `${height}px`;
  const portrait = image(visitor.id, metric.name); portrait.style.width = `${metric.canvas[0] * scale}px`; portrait.style.height = `${metric.canvas[1] * scale}px`; portrait.style.left = `${-metric.crop[0] * scale}px`; portrait.style.top = `${-metric.crop[1] * scale}px`; crop.append(portrait); person.append(crop);
  const name = document.createElement('b'); name.className = 'animal-visitor-name'; name.textContent = metric.name; person.append(name);
  if (visitor.role === 'playing') { const heart = document.createElement('i'); heart.className = 'animal-visitor-playing'; heart.textContent = '♪'; heart.setAttribute('aria-hidden', 'true'); person.append(heart); }
  scene.append(person);
}
function catDayGuideKey(corner) {
  if (!corner?.catDay || animalCatPosition(corner).hidden || corner.catDay.episode === 'free') return null;
  if (corner.catDay.episode === 'quiet-corner') return corner.catDay.visitor?.id === 'ishan' && corner.catDay.visitor.arrived ? 'living_cat_day_quiet_corner' : 'living_cat_day_resting_place';
  if (corner.catDay.episode === 'little-welcome') {
    if (!corner.catDay.visitor?.arrived) return 'living_cat_day_little_welcome';
    const result = catCornerDayOutcome(corner);
    return result.resting && result.visitor.role === 'watching' ? 'living_cat_day_quiet' : result.outcome === 'greeting' ? 'living_cat_day_greet' : 'living_animal_visit';
  }
  return 'living_cat_day_resting_place';
}
function catChoice(label, text, kind, callback) { const choice = button(label, text, callback); choice.classList.add('animal-day-choice'); choice.prepend(image(kind, '')); return choice; }
function beginCatDay(episode) { if (change({ type: 'cat-day-begin', episode })) void openSheet('day-options'); }
function doCatDay(action) {
  if (change(action)) { closeSheet({ preserveGuidance: true }); return true; }
  const note = sheet?.querySelector('.animal-day-note'), issue = animalFriendsStatus().issue;
  if (note) note.textContent = issue && issue !== 'animal-temporary'
    ? `${animalSaveMessage(null, issue)} Try this choice again, or go Back.` : animalPlayInvitation(current());
  return false;
}
function moveCatDay(part) { arranging = true; closeSheet(); cancelTransient(); selected = part; paint(); scene.focus({ preventScroll: true }); message(`Tap a new place for ${part === 'visitor' ? 'your visitor' : part === 'canopy' ? 'the shade' : part === 'leaf' ? 'the leafy screen' : 'the bed'}. You can drag it too.`); }
function paintCatDay() {
  sheetHeader('A place for our cat'); const description = document.createElement('p'); description.textContent = 'Choose a little story. Your picture, bed and hiding places stay yours.'; sheet.append(description);
  const choices = document.createElement('div'); choices.className = 'animal-day-grid';
  choices.append(catChoice('Choose a shaded resting place in the bed or under the canopy', 'A resting place', 'canopy', () => beginCatDay('resting-place')),
    catChoice('Invite Ishan to play or make a quiet corner for the cat', 'A quiet corner', 'ishan', () => beginCatDay('quiet-corner')),
    catChoice('Choose Ishan, Ba or Dada to greet the cat or watch it rest', 'A little welcome', 'ba', () => beginCatDay('little-welcome'))); sheet.append(choices);
}
function paintCatDayOptions() {
  const corner = current(), day = corner.catDay; if (!day) { paintCatDay(); return; }
  if (day.episode === 'free') {
    paintCatDay(); const moving = document.createElement('div'); moving.className = 'animal-day-footer';
    moving.append(button('Keep this arranged corner and move its bed or other objects', 'Move things', () => { closeSheet(); arranging = true; paint(); message('Tap an object, then tap its new place. You can drag it too.'); }, iconSVG('art'))); sheet.append(moving); return;
  }
  const titles = { 'resting-place': 'A resting place', 'quiet-corner': 'A quiet corner', 'little-welcome': 'A little welcome', free: 'Your arranged corner' };
  sheetHeader(titles[day.episode]); const note = document.createElement('p'); note.className = 'animal-day-note'; note.textContent = catCornerDayInvitation(corner); sheet.append(note);
  const choices = document.createElement('div'); choices.className = 'animal-day-grid';
  if (animalCatPosition(corner).hidden) {
    choices.append(button('Return to look for the cat without giving away its hiding place', 'Look for our cat', closeSheet, iconSVG('back')));
    choices.append(catChoice('Call our cat out to play here. Undo can return to the hiding game.', 'Come play', 'cat', () => doCatDay({ type: 'cat-day-come-out' })));
  } else {
    if (day.episode === 'quiet-corner' && !day.visitor?.arrived) {
      choices.append(catChoice('Invite Ishan to play here with the cat', 'Invite Ishan', 'ishan', () => doCatDay({ type: 'cat-day-visitor', id: 'ishan', role: 'playing', x: Math.min(84, current().bed.x + 22), y: 84 })));
    } else if (day.episode === 'little-welcome' && !day.visitor?.arrived) {
      for (const id of ['ishan','ba','dada']) choices.append(catChoice(`Invite ${FAMILY_VISITOR[id].name} to this corner`, FAMILY_VISITOR[id].name, id, () => doCatDay({ type: 'cat-day-visitor', id, role: 'watching', x: 84, y: 84 })));
    }
    choices.append(catChoice('Let the cat try the bed under the shade', 'In the bed', 'bed', () => doCatDay({ type: 'cat-day-rest', target: 'bed' })),
      catChoice('Let the cat try the floor under the shade. Move nearby things if it needs room.', 'Under the shade', 'canopy', () => doCatDay({ type: 'cat-day-rest', target: 'floor' })));
    if (day.visitor?.arrived) {
      choices.append(catChoice(`Let ${FAMILY_VISITOR[day.visitor.id].name} watch quietly from outside the shade`, 'Watch quietly', day.visitor.id, () => doCatDay({ type: 'cat-day-watch' })),
        catChoice(`Let ${FAMILY_VISITOR[day.visitor.id].name} play nearby`, 'Play here', 'cat', () => doCatDay({ type: 'cat-day-role', role: 'playing' })),
        catChoice(`Let the cat come over to greet ${FAMILY_VISITOR[day.visitor.id].name}`, 'Say hello', 'cat', () => doCatDay({ type: 'cat-day-greet' })),
        catChoice(`Move ${FAMILY_VISITOR[day.visitor.id].name} to another place`, 'Move our friend', day.visitor.id, () => moveCatDay('visitor')),
        button('Let the visitor leave. Keep the cat and all your arranged things.', 'Bye for now', () => doCatDay({ type: 'cat-day-leave' }), iconSVG('back')));
    }
  }
  choices.append(catChoice('Move the shade canopy by tapping a new place or dragging its roof', 'Move the shade', 'canopy', () => moveCatDay('canopy')),
    catChoice('Move the bed to make room for a different resting place', 'Move the bed', 'bed', () => moveCatDay('bed')),
    catChoice('Move the leafy screen between the visitor and the cat', 'Move the leaves', 'leaf', () => moveCatDay('leaf'))); sheet.append(choices);
  const footer = document.createElement('div'); footer.className = 'animal-day-footer'; footer.append(button('Choose another optional cat story', 'Another beginning', () => openSheet('day'), iconSVG('book')),
    button('Keep your arranged canopy and visitor, and play your own way', 'Play my way', () => doCatDay({ type: 'cat-day-free' }), iconSVG('back'))); sheet.append(footer);
}
function paint() {
  if (!view || !visit.active) return;
  geometry(); scene.replaceChildren(); host.dataset.motion = reduced() ? 'quiet' : 'gentle'; scene.classList.toggle('is-arranging', arranging);
  const corner = current(), cat = animalCatPosition(corner), layout = animalSceneGeometry(board.clientWidth, board.clientHeight, !!corner.catDay);
  // Found is a local reveal, not a furniture move. Bring the chosen hiding
  // place and its cat above the overlapping canopy as one contact-preserving
  // group; basket back < cat < basket rim. Search keeps its ordinary layering.
  const foundPlace = !cat.hidden && corner.phase === 'revealed' && ANIMAL_PLACES.includes(corner.cat.place) && corner.catDay?.canopy.on ? corner.cat.place : null;
  const foundDepth = foundPlace ? Math.max(Math.round(cat.y * 10), Math.round(corner.catDay.canopy.y * 10) - 3) + 1 : null;
  if (corner.catDay?.canopy.on) paintCanopy(corner.catDay.canopy, layout);
  for (const place of corner.places) {
    const b = partButton(`${place.open ? 'Cover' : 'Open'} the ${place.id === 'leaf' ? 'leaves' : place.id === 'basket' ? 'basket' : 'blanket shelter'}. ${arranging ? 'Tap and tap a new place to move it, or drag.' : 'You can drag this place to move it.'}`, place.id, place.x, place.y,
      () => arranging ? select(place.id) : change({ type: 'open', place: place.id }));
    b.classList.add('animal-place', `animal-place-${place.id}`); b.classList.toggle('is-open', place.open);
    if (place.id === foundPlace) b.style.zIndex = String(foundDepth + 2);
    const cover = image(place.id, place.id === 'leaf' ? 'Leaves to look behind' : place.id === 'basket' ? 'A basket to look inside' : 'A blanket shelter to look under'); cover.className = 'animal-place-cover'; const object = sprite(b, cover, place.id, layout.unit);
    if (place.id === 'basket' && place.open) {
      const back = document.createElement('div'); back.className = 'animal-basket-back'; position(back, place.x, place.y, -1); sprite(back, image('basket', ''), 'basket', layout.unit); scene.append(back);
      if (place.id === foundPlace) back.style.zIndex = String(foundDepth);
      cover.style.clipPath = `inset(${ANIMAL_CONTACT.basket.front / ANIMAL_CONTACT.basket.h * 100}% 0 0 0)`;
    }
    if (place.id === 'shelter' && !place.open) {
      const opening = ANIMAL_CONTACT.shelter.opening, window = document.createElement('div'); window.className = 'animal-curtain-window'; window.style.left = `${opening[0] * object.scale}px`; window.style.top = `${opening[1] * object.scale}px`; window.style.width = `${(opening[2] - opening[0]) * object.scale}px`; window.style.height = `${(opening[3] - opening[1]) * object.scale}px`;
      const curtain = image('curtain', 'Blanket lowered over the opening'), c = ANIMAL_CONTACT.curtain, scale = (opening[2] - opening[0]) * object.scale * 1.15 / c.span;
      curtain.style.width = `${c.w * scale}px`; curtain.style.height = `${c.h * scale}px`; curtain.style.left = `${((opening[2] - opening[0]) * object.scale - c.w * scale) / 2}px`; curtain.style.top = `${(opening[3] - opening[1]) * object.scale - c.ground * scale}px`; window.append(curtain); b.append(window);
    }
    scene.append(b);
  }
  const bed = partButton(animalBedLabel(corner, arranging), 'bed', corner.bed.x, corner.bed.y, () => animalBedAction(corner, arranging) === 'rest' ? change({ type: corner.catDay?.episode !== 'free' && corner.catDay ? 'cat-day-rest' : 'rest', target: 'bed' }) : select('bed'));
  bed.classList.add('animal-bed'); const bedSprite = sprite(bed, image('bed', 'A roomy padded bed for your cat'), 'bed', layout.unit); bed.classList.toggle('needs-room', corner.reaction === 'space'); scene.append(bed);
  const pillow = button('Move the little pillow to the other side of the cushion', '', () => change({ type: 'pillow', x: current().bed.pillow < 0 ? 5 : -5 })); pillow.classList.add('animal-pillow'); position(pillow, corner.bed.x + (corner.bed.pillow < 0 ? -11 : 11), corner.bed.y, 3); pillow.style.top = `${corner.bed.y / 100 * layout.height + (ANIMAL_CONTACT.bed.pillow - ANIMAL_CONTACT.bed.ground) * bedSprite.scale}px`; pillow.style.zIndex = String(Math.round(corner.bed.y * 10) + 3); pillow.innerHTML = '<span aria-hidden="true"></span>'; scene.append(pillow);
  if (corner.picture) {
    const card = partButton('Your own picture sign. Tap to move it, or invite the cat to it in Visit.', 'picture', corner.picture.x, corner.picture.y, () => corner.invitation === 'visit' && !arranging ? change({ type: 'follow-picture' }) : select('picture'));
    card.classList.add('animal-picture'); const png = document.createElement('img'); png.src = corner.picture.png; png.alt = 'Your exact saved picture'; png.draggable = false; card.append(png); scene.append(card);
  }
  if (corner.catDay?.visitor?.arrived) paintVisitor(corner.catDay.visitor, layout, foundDepth === null ? null : foundDepth + 3);
  if (!cat.hidden) {
    const kitty = button('Give the cat a gentle hello', '', () => change({ type: 'pet' })); kitty.classList.add('animal-cat', cat.pose === 'rest' ? 'is-resting' : 'is-sitting'); kitty.dataset.cat = '';
    const visible = animalVisibleCatGeometry(corner, layout); position(kitty, cat.x, cat.y, ANIMAL_PLACES.includes(corner.cat.place) ? 0 : 2);
    if (foundDepth !== null) kitty.style.zIndex = String(foundDepth + 1);
    kitty.style.left = `${visible.x}px`; kitty.style.top = `${visible.y}px`; kitty.dataset.anchorX = String(visible.anchorX); kitty.dataset.anchorY = String(visible.anchorY);
    sprite(kitty, image(visible.kind, cat.pose === 'rest' ? 'Your cat curled up comfortably' : 'Your friendly black cat'), visible.kind, layout.unit, visible.size);
    if (corner.cat.place === 'bed') kitty.style.zIndex = String(Math.round(corner.bed.y * 10) + 2);
    if (corner.cat.place === 'bed') { kitty.classList.add('animal-cat-on-bed'); kitty.tabIndex = -1; kitty.setAttribute('aria-hidden', 'true'); }
    if (['hello', 'rest', 'picture', 'found'].includes(corner.reaction)) { const reaction = document.createElement('i'); reaction.className = 'animal-reaction'; reaction.textContent = corner.reaction === 'hello' ? '♥' : corner.reaction === 'picture' ? '♪' : corner.reaction === 'found' ? '☀' : '♡'; reaction.setAttribute('aria-hidden', 'true'); kitty.append(reaction); }
    scene.append(kitty);
  }
  if (hint && corner.invitation !== 'seek' && !cat.hidden) {
    const demo = document.createElement('div'); demo.className = 'animal-demo'; demo.innerHTML = hand;
    const target = corner.invitation === 'corner' ? corner.bed : cat;
    position(demo, target.x + 7, target.y - 5, 20); scene.append(demo);
  }
  scene.querySelectorAll('button').forEach(b => { b.disabled = saving; });
  const action = controls.querySelector('[data-action]'); action.replaceChildren();
  let actionText, actionLabel, kind;
  if (activeCatStory(corner) && !cat.hidden) { actionText = 'Choices'; actionLabel = 'Continue your cat story: choose a resting place or visitor'; kind = 'canopy'; }
  else if (corner.invitation === 'seek') { const ready = corner.phase === 'choose-hide', found = corner.phase === 'revealed'; actionText = ready ? 'Ready' : found ? 'Hide' : 'Again'; actionLabel = ready ? 'Close the places so a friend can search' : found ? 'Hide the cat for a friend' : 'Try another authored hiding place'; kind = ready ? 'leaf' : 'cat'; }
  else { const play = corner.invitation === 'visit' && ['bed', 'picture'].includes(corner.cat.place); actionText = play ? 'Come play' : 'Rest'; actionLabel = play ? 'Bring the cat back to play' : 'Let the cat try the cozy cushion'; kind = play ? 'cat' : 'bed'; }
  action.append(image(kind, '')); const text = document.createElement('span'); text.textContent = actionText; action.append(text); action.setAttribute('aria-label', actionLabel);
  controls.querySelector('[data-undo]').disabled = !view.undoCount || saving; controls.querySelectorAll('button:not([data-undo])').forEach(b => { b.disabled = saving; }); host.querySelector('[data-saved]').disabled = saving;
  controls.querySelector('[data-hello]').disabled = saving || cat.hidden;
  host.querySelector('[data-help]').disabled = saving || checkpointing;
  const garden = host.querySelector('[data-garden]'); garden.hidden = cat.hidden && !view.outingId; garden.disabled = saving;
  garden.setAttribute('aria-label', view.outingId ? 'Continue your cat’s garden visit' : corner.gardenVisit ? 'Revisit your cat’s garden, or grow a new one' : 'Invite the found cat to grow a shady garden');
}
function change(action) {
  if (saving) return false; stopHint(); const prior = current(), layout = animalSceneGeometry(board.clientWidth, board.clientHeight, !!prior.catDay), before = animalVisibleCatGeometry(prior, layout); cancelTransient(); let changed;
  try { changed = changeAnimalFriends(action); }
  catch (error) { view = animalFriendsView(); paint(); message(error.code?.startsWith('cat-day-') ? 'That choice could not open. Your cat, picture and corner are still here.' : animalSaveMessage(null, error.code || 'animal-write')); return false; }
  view = animalFriendsView(); paint();
  const issue = animalFriendsStatus().issue; message(issue && issue !== 'animal-temporary' ? animalSaveMessage(null, issue) : animalPlayInvitation(current()));
  const after = animalVisibleCatGeometry(current(), layout);
  if (changed && (['rest', 'follow-picture', 'return'].includes(action.type) || current().catDay && (before.x !== after.x || before.y !== after.y)) && !before.hidden && !after.hidden && !reduced()) {
    const kitty = scene.querySelector('[data-cat]'); if (kitty?.animate) { const final = kitty.style.transform; animation = kitty.animate([{ transform: `translate(${-(Number(kitty.dataset.anchorX)) + before.x - after.x}px, ${-(Number(kitty.dataset.anchorY)) + before.y - after.y}px)` }, { transform: final }], { duration: 650, easing: 'ease-out' }); }
  }
  if (changed) {
    const committed = current(), key = animalConsequenceKey(prior, committed, action);
    if (key && animation) message('Look where the cat goes.');
    if (key) guidance?.after(key, { settled: animation?.finished,
      delay: animation?.finished ? 0 : animation ? 650 : !reduced() && ['open', 'ready'].includes(action.type) ? 220 : 0,
      guard: () => current() === committed && (key === 'living_animal_partner' ? animalCatPosition(current()).hidden : key === 'living_animal_space' || !!scene.querySelector('[data-cat]')) });
  }
  return changed;
}
function primary() {
  const c = current();
  if (activeCatStory(c) && !animalCatPosition(c).hidden) { void openSheet('day-options'); return; }
  if (c.invitation === 'seek') {
    if (c.phase === 'revealed') { startOwnHiding(); return; }
    // A kept unfinished turn may still have the cat on its bed. Ready must
    // offer a real place, rather than silently refusing or choosing for it.
    if (c.phase === 'choose-hide' && !ANIMAL_PLACES.includes(c.cat.place)) { void openSheet('hiding'); return; }
    change({ type: c.phase === 'choose-hide' ? 'ready' : 'new-search' });
  } else change({ type: c.invitation === 'visit' && ['bed', 'picture'].includes(c.cat.place) ? 'return' : 'rest' });
}
function select(part) { if (saving) return; guidance?.interrupt(); stopHint(); animation?.cancel(); selected = selected === part ? null : part; paint(); if (selected) { scene.focus({ preventScroll: true }); message('Tap a new place to move this, or drag it.'); } else message(animalPlayInvitation(current())); }
function locationAt(event) { const rect = scene.getBoundingClientRect(); return { x: (event.clientX - rect.left) / scene.clientWidth * 100, y: (event.clientY - rect.top) / scene.clientHeight * 100 }; }
function moveAction(part, point) { return { type: part === 'canopy' ? 'cat-day-canopy' : part === 'visitor' ? 'cat-day-visitor-move' : part === 'bed' ? 'bed-move' : part === 'picture' ? 'picture-move' : 'place-move', place: part, ...point }; }
function partPosition(part) { const corner = current(); return part === 'canopy' ? corner.catDay?.canopy : part === 'visitor' ? corner.catDay?.visitor : part === 'bed' ? corner.bed : part === 'picture' ? corner.picture : corner.places.find(row => row.id === part); }
function startDrag(event, part) { if (!pointers.owns(event) || saving) return; stopHint(); animation?.cancel(); drag = { id: event.pointerId, part, x: event.clientX, y: event.clientY, origin: partPosition(part), start: locationAt(event), moved: false, point: null }; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* OS cancellation is harmless. */ } }
function moveDrag(event) {
  if (!drag || event.pointerId !== drag.id) return; drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8;
  if (!drag.moved || !drag.origin) return; const at = locationAt(event), limits = drag.part === 'canopy' ? [35,65,65,90] : drag.part === 'visitor' ? [16,84,35,84] : drag.part === 'bed' ? [22,78,60,84] : drag.part === 'picture' ? [16,84,35,78] : [18,82,drag.part === 'shelter' ? 38 : 45,66];
  const point = { x: Math.max(limits[0], Math.min(limits[1], drag.origin.x + at.x - drag.start.x)), y: Math.max(limits[2], Math.min(limits[3], drag.origin.y + at.y - drag.start.y)) }; drag.point = point;
  const element = scene.querySelector(`[data-part="${drag.part}"]`); if (element) { element.style.left = `${point.x}%`; element.style.top = `${point.y}%`; }
  if (drag.part === 'canopy') { const art = scene.querySelector('[data-canopy-art]'); if (art) position(art, point.x, point.y, -3); positionCanopyHandle(element, point, animalSceneGeometry(board.clientWidth, board.clientHeight, true)); }
  scene.classList.add('is-dragging');
}
function endDrag(event) { if (!drag || event.pointerId !== drag.id) { pointers.finish(event, performance.now()); return; } const completed = drag; drag = null; pointers.finish(event, performance.now(), completed.moved); if (completed.moved) change(moveAction(completed.part, completed.point)); }
async function keep() { if (saving) return; cancelTransient(); saving = true; paint(); message('Keeping your animal corner…'); const token = visit.serial;
  try { const result = await keepAnimalFriends(savedWorld.id); if (visit.valid(token)) message(animalSaveMessage(result)); }
  catch (error) { if (visit.valid(token)) message(animalSaveMessage(null, error.code || 'animal-write')); }
  finally { if (visit.valid(token)) { saving = false; view = animalFriendsView(); paint(); } }
}
async function goGarden(revisit = false, adoptCurrent = false) {
  if (saving || checkpointing || drag || pointers?.active !== null) { message('Finish placing this, then invite the cat.'); return; }
  const token = visit.serial;
  if (!await checkpointAnimals() || !visit.valid(token)) return;
  saving = true; paint();
  try {
    const id = await animalStore.beginCatOuting({ revisit, adoptCurrent, valid: () => visit.valid(token) });
    if (!id || !visit.valid(token)) return;
    saving = false; view = animalFriendsView(); paint();
    await router.go('water-garden', { outingId: id });
  } catch (error) { if (visit.valid(token)) message(error.code === 'animal-cat-hidden' ? 'Open a hiding place to invite the cat.' : 'The visit could not open. Your corner and garden are still here. Try again.'); }
  finally { if (visit.valid(token)) { saving = false; view = animalFriendsView(); paint(); } }
}
function chooseGardenVisit() {
  if (view.outingCornerChanged) { openSheet('retarget-garden'); return; }
  if (view.outingId || !current().gardenVisit) { void goGarden(false); return; }
  openSheet('garden');
}
function closeSheet(options = {}) { if (!sheet) return; if (!options.preserveGuidance) guidance?.interrupt(); ++sheetSerial; sheet.hidden = true; sheetKind = null; for (const child of host.children) if (child !== sheet) child.inert = false; controls.querySelector('[data-ways]')?.focus({ preventScroll: true }); }
function sheetHeader(title) { sheet.replaceChildren(); const row = document.createElement('div'); row.className = 'animal-sheet-header'; const h = document.createElement('h2'); h.textContent = title; row.append(button('Return to your cat', 'Back', closeSheet, iconSVG('back')), h); sheet.append(row); }
function pager(page, pages, go) { if (pages <= 1) return; const row = document.createElement('div'); row.className = 'animal-pages'; const back = button('Previous page', 'Back', () => go(page - 1), iconSVG('back')), next = button('Next page', 'More', () => go(page + 1), iconSVG('next')), count = document.createElement('span'); back.disabled = !page; next.disabled = page === pages - 1; count.textContent = `${page + 1} / ${pages}`; row.append(back, count, next); sheet.append(row); }
function hidingRefusal() {
  let note = sheet.querySelector('.animal-hiding-note');
  if (!note) { note = document.createElement('p'); note.className = 'animal-hiding-note'; sheet.append(note); }
  const issue = animalFriendsStatus().issue;
  note.textContent = issue && issue !== 'animal-temporary'
    ? `${animalSaveMessage(null, issue)} Try again, or go Back.`
    : 'That choice could not open. Your corner and whole picture are still here. Try again, or go Back.';
}
function startOwnHiding() {
  arranging = false;
  if (change({ type: 'hide-turn' }) || current().phase === 'choose-hide') void openSheet('hiding');
  else hidingRefusal();
}
function paintHidingPlaces() {
  const choosing = current().phase === 'choose-hide';
  sheetHeader(choosing ? 'Where will the cat hide?' : 'Where shall we look?');
  const note = document.createElement('p');
  note.textContent = choosing ? 'Pick a place. Then tap Ready for your friend to look.' : 'Choose a place to look. The cat could be anywhere.';
  const grid = document.createElement('div'); grid.className = 'animal-day-grid animal-hiding-grid';
  // The pictured alternatives stay reachable even in a crowded child-owned
  // corner. No objects move, and no card identifies the correct search spot.
  for (const [place, text] of [['leaf', 'Behind the leaves'], ['basket', 'Inside the basket'], ['shelter', 'Under the shelter']]) {
    grid.append(catChoice(`${choosing ? 'Hide the cat' : 'Look'} ${ANIMAL_RELATIONS[place]}`, text, place, () => {
      const samePlace = choosing && current().cat.place === place && current().places.find(row => row.id === place)?.open;
      if (change({ type: 'open', place }) || samePlace && !animalFriendsStatus().issue) closeSheet({ preserveGuidance: true });
      else hidingRefusal();
    }));
  }
  sheet.append(note, grid);
}
function paintWays() {
  sheetHeader('Play with your animal friend'); const ways = document.createElement('div'); ways.className = 'animal-ways';
  for (const [invitation, label, kind] of [['seek', 'Look and hide', 'leaf'], ['corner', 'A cozy corner', 'bed'], ['visit', 'A little visit', 'cat']]) { const choice = button(label, label, () => { arranging = false; change({ type: 'invitation', invitation }); closeSheet(); }); choice.prepend(image(kind, '')); choice.setAttribute('aria-pressed', String(current().invitation === invitation)); ways.append(choice); } sheet.append(ways);
  const hide = button('Choose a hiding place for someone else to find the cat', 'My hiding turn', startOwnHiding, hand); sheet.append(hide);
  if (current().invitation === 'seek') sheet.append(button(current().phase === 'choose-hide' ? 'Choose where to hide the cat without moving your corner' : 'Look in a hiding place without moving your corner', current().phase === 'choose-hide' ? 'Choose a place' : 'Look in a place', () => openSheet('hiding'), iconSVG('help')));
  const day = button(current().catDay && current().catDay.episode !== 'free' ? 'Continue your optional cat corner story' : 'Choose a new optional cat story with shade and visitors', current().catDay && current().catDay.episode !== 'free' ? 'Continue cat story' : 'A place for our cat', () => openSheet(current().catDay && current().catDay.episode !== 'free' ? 'day-options' : 'day'));
  day.dataset.catPlayday = ''; day.prepend(image('canopy', '')); sheet.append(day);
  sheet.append(button('Tap objects, then tap their new place. Dragging works too.', arranging ? 'Finish moving' : 'Move things', () => { arranging = !arranging; cancelTransient(); paint(); closeSheet(); message(arranging ? 'Tap an object, then tap its new place. You can drag too.' : animalPlayInvitation(current())); }, iconSVG('art')));
}
function paintPictures() {
  sheetHeader('Your picture for the cat'); const pages = Math.max(1, Math.ceil(pictureRows.length / 8)); picturePage = Math.max(0, Math.min(pages - 1, picturePage)); const grid = document.createElement('div'); grid.className = 'animal-picture-grid';
  pictureRows.slice(picturePage * 8, (picturePage + 1) * 8).forEach((row, i) => { const choose = button(`Use your own saved picture ${picturePage * 8 + i + 1} as a sign or play prop`, '', () => { change({ type: 'picture', picture: { sourceRef: row.key, png: row.png, x: 72, y: 72 } }); closeSheet(); }); const png = document.createElement('img'); png.src = row.png; png.alt = 'Your exact saved picture'; png.draggable = false; choose.prepend(png); grid.append(choose); }); sheet.append(grid);
  if (!db.status().persistent) { const warning=document.createElement('p');warning.textContent='Pictures saved on this device may be unavailable right now. Ask a grown-up to check storage before closing.';sheet.append(warning); }
  if (!pictureRows.length) { if(db.status().persistent) { const p=document.createElement('p');p.textContent='A picture you keep in the Art Room can join this corner. You can play with the cat now too.';sheet.append(p); } sheet.append(button('Go to the Art Room to make a picture', 'Art Room', () => { void router.go('studio'); }, iconSVG('art'))); }
  pager(picturePage, pages, index => { picturePage = index; paintPictures(); });
}
function paintSaved() {
  sheetHeader('Your kept corners'); const page = animalFriendsPage(savedPage, ownerFilter); savedPage = page.page; const grid = document.createElement('div'); grid.className = 'animal-picture-grid';
  page.items.forEach((item, i) => { const open = button(`Reopen kept animal corner ${page.page * 8 + i + 1}`, '', () => {
    cancelTransient(); const accepted = reopenAnimalFriends(item.id); view = animalFriendsView(); paint();
    if (!accepted && JSON.stringify(current()) !== JSON.stringify(item.corner)) {
      let note = sheet.querySelector('.animal-saved-note'); if (!note) { note = document.createElement('p'); note.className = 'animal-saved-note'; sheet.append(note); }
      note.textContent = 'This kept corner could not open. Your current corner and whole picture are still here. Try this card again, or go Back.'; return;
    }
    closeSheet(); message(animalPlayInvitation(current()));
  }); open.prepend(image(item.corner.cat.place === 'bed' ? 'rest' : 'cat', 'Your cat in a kept corner')); if (item.corner.picture) { const png = document.createElement('img'); png.className = 'animal-saved-picture'; png.src = item.corner.picture.png; png.alt = 'Your own picture in this corner'; open.append(png); } grid.append(open); }); sheet.append(grid);
  if (!page.items.length) { const p = document.createElement('p'); p.textContent = 'Keep a corner to return to its hiding places, bed, cat and own picture.'; sheet.append(p); }
  pager(page.page, page.pages, index => { savedPage = index; paintSaved(); });
}
async function openSheet(kind) {
  if (!view || saving || checkpointing || drag || pointers?.active != null || document.hidden || session.isBreakLocked()) return;
  cancelTransient(); paint(); sheetKind = kind; sheet.hidden = false; const request = ++sheetSerial, token = visit.serial; for (const child of host.children) if (child !== sheet) child.inert = true;
  if (kind === 'pictures') {
    sheetHeader('Your pictures');let rows;
    try { rows=(await gallery.listChecked()).filter(isCreationRow); }
    catch { if(visit.valid(token) && request===sheetSerial && sheetKind===kind) { sheetHeader('Your pictures could not open');const note=document.createElement('p');note.textContent='Your cat corner is still here. Try again, or ask a grown-up for help.';sheet.append(note);const retry=button('Try opening your pictures again','Try again',()=>openSheet('pictures'));retry.dataset.pictureRetry='';sheet.append(retry);retry.focus({preventScroll:true}); } return; }
    if (!visit.valid(token) || request !== sheetSerial || sheetKind !== kind) return; pictureRows = rows; paintPictures();
  }
  else if (kind === 'saved') paintSaved();
  else if (kind === 'day') paintCatDay();
  else if (kind === 'day-options') paintCatDayOptions();
  else if (kind === 'hiding') paintHidingPlaces();
  else if (kind === 'garden') { sheetHeader('Your cat’s garden'); const choices = document.createElement('div'); choices.className = 'animal-ways'; for (const [revisit, text, kind] of [[true, 'Return to your garden', 'leaf'], [false, 'Grow a new garden', 'cat']]) { const b = button(text, text, () => { closeSheet(); void goGarden(revisit); }); b.prepend(image(kind, '')); choices.append(b); } sheet.append(choices); }
  else if (kind === 'retarget-garden') { sheetHeader('Your corner has changed'); const p = document.createElement('p'); p.textContent = 'Continue the open garden visit and bring the cat back to this corner? Your garden stays as you made it.'; const b = button('Continue the garden visit, returning to this current corner', 'Visit from this corner', () => { closeSheet(); void goGarden(false, true); }); b.prepend(image('bed', '')); sheet.append(p, b); }
  else paintWays(); sheet.querySelector('button')?.focus({ preventScroll: true });
  if (kind === 'day-options') { const corner = current(), key = catDayGuideKey(corner); if (key) guidance?.after(key, { guard: () => current() === corner && sheetKind === kind && sheetSerial === request }); }
  if (kind === 'hiding') guidance?.guide(true);
}
async function checkpointAnimals() {
  guidance?.interrupt();
  if (!visit.active || checkpointing) return false; if (!view) { const token=visit.serial; try { await flushAnimalFriends(); return visit.valid(token); } catch { if (visit.valid(token)) message('Your corner could not finish saving. Try again before leaving.'); return false; } } const token = visit.serial; checkpointing = true; animation?.cancel(); animation = null;
  try {
    const placed = commitLivingPlacement({ drag, action: drag?.point ? moveAction(drag.part, drag.point) : null,
      readCurrent: () => animalFriendsView().current, edit: editAnimalCorner, commit: changeAnimalFriends,
      release: () => { drag = null; selected = null; pointers?.cancel(performance.now()); view = animalFriendsView(); paint(); } });
    if (!placed) { message('Finish placing this, then try again. Your move is still here.'); return false; }
    const accepted = await checkpointLivingScene({ flush: flushAnimalFriends, retry: () => animalStore.retryAnimalFriendsWrites(), storage: animalFriendsStatus,
      alive: () => visit.valid(token), report: message, subject: 'Your animal corner' });
    if (accepted && visit.valid(token)) { cancelTransient(); if (sheetKind) closeSheet(); }
    return accepted;
  } finally { if (visit.valid(token)) { checkpointing = false; bus.emit('activity:idle'); } }
}
async function openSavedAnimal(params, token, retryWrites = false) {
  if (!visit.valid(token) || openingAnimal) return;
  openingAnimal=true; if (animalLoadRetry) animalLoadRetry.disabled=true;
  try { if (retryWrites && animalFriendsStatus().issue === 'animal-write') await animalStore.retryAnimalFriendsWrites(); if (!visit.valid(token)) return; const loaded = await loadAnimalFriends(); if (!visit.valid(token)) return; view = loaded; let sourceIssue='';
      if (params.sourceKey) {
        try { const rows=(await gallery.listChecked()).filter(isCreationRow);if(!visit.valid(token))return;const row=rows.find(item=>item.key===params.sourceKey);
          if(row && (current().picture?.sourceRef!==row.key || current().picture?.png!==row.png)) { changeAnimalFriends({type:'picture',picture:{sourceRef:row.key,png:row.png,x:72,y:72}});view=animalFriendsView(); }
          if(!row || current().picture?.sourceRef!==row.key || current().picture?.png!==row.png) sourceIssue='That picture could not be opened. Your cat corner is still here. Try Picture, or ask a grown-up for help.';
        } catch { if(!visit.valid(token))return;sourceIssue='That picture could not be opened. Your cat corner is still here. Try Picture, or ask a grown-up for help.'; }
      }
      animalLoadRetry?.remove(); animalLoadRetry=null; paint();let notice=sourceIssue || (current().gardenVisit ? (current().gardenVisit.rested ? 'Your cat rested in the shade you grew, and came back to your own corner. Keep it or visit your garden again.' : 'Your cat came back to your own corner. Keep this visit or return to your garden whenever you like.') : animalPlayInvitation(current()));
      if(sourceIssue)openingNotice=sourceIssue;if(!animalFriendsStatus().persistent)notice+=' Device saving is unavailable. You can play, but corners kept now may disappear when this page closes.';message(notice);
      hintTimer = setTimeout(() => { if (visit.valid(token)) stopHint(); }, 4500);
  } catch { if (visit.valid(token)) { message('Your corner could not open. Try again or return Home.'); if (!view && !animalLoadRetry) { const retry=button('Try opening your cat corner again', 'Try again', () => { void openSavedAnimal(params,token,true); }, iconSVG('replay')); retry.classList.add('animal-load-retry'); board.append(retry); animalLoadRetry=retry; } } }
  finally { if (visit.valid(token)) { openingAnimal=false; if (animalLoadRetry) animalLoadRetry.disabled=false; } }
}
export default {
  id: 'animal-friends',
  async mount(el, params = {}) {
    enteredFromMap = params.fromMap === true;
    const token = visit.begin(); openingAnimal=false; animalLoadRetry=null; openingNotice='';host = el; view = null; saving = false; checkpointing = false; sheetKind = null; selected = drag = null; arranging = false; hint = true; pointers = new WorkshopPointers();
    host.classList.add('animal-friends'); host.innerHTML = '<header class="animal-header"><h1>Animal Friends</h1><nav class="animal-navigation" aria-label="Go to another place"></nav></header><main class="animal-board"><div class="animal-scene" tabindex="0" role="group" aria-label="Your cat, hiding places and cozy corner"></div></main><p class="animal-status" role="status" aria-live="polite">Opening your animal corner…</p><div class="animal-controls"></div><section class="animal-sheet" hidden role="dialog" aria-modal="true" aria-label="Ways to play, pictures and kept corners"></section>';
    board = host.querySelector('.animal-board'); scene = host.querySelector('.animal-scene'); status = host.querySelector('.animal-status'); controls = host.querySelector('.animal-controls'); sheet = host.querySelector('.animal-sheet');
    guidance?.dispose(); guidance = new LivingGuidance({ route: 'animal-friends', active: () => visit.valid(token),
      ready: () => !!view && !saving && !checkpointing && (!sheetKind || sheetKind === 'day-options' || sheetKind === 'hiding') && !drag && !openingNotice,
      guideKey: help => !arranging && activeCatStory(view.current) && !animalCatPosition(view.current).hidden ? catDayGuideKey(view.current) : ordinaryAnimalGuideKey(view.current, { help, arranging }),
      caption: (text, key) => { host.dataset.guidance = key; message(text); } });
    idleHelp?.();idleHelp=installIdleHelp(host,{
      active:()=>visit.valid(token) && !!view && current().invitation==='seek' && ['search','partner-search'].includes(current().phase) && animalCatPosition(current()).hidden && !activeCatStory(current()) && !arranging && !saving && !checkpointing && !sheetKind && !drag && !selected && !animation && pointers?.active==null && !openingNotice && !session.isBreakLocked() && !router.isMoving() && router.current()==='animal-friends' && !speech.isSpeaking(),
      demonstrate:()=>{
        const ownScene=scene,targets=current().places.filter(place=>!place.open).map(place=>ownScene.querySelector(`[data-part="${place.id}"]`)).filter(Boolean);
        if(!targets.length)return null;targets.forEach(target=>target.classList.add('animal-idle-target'));guidance.guide(false);const serial=guidance.serial;
        const motions=reduced()?[]:targets.map(target=>target.animate?.([{translate:'0 0'},{translate:'0 -4px'},{translate:'0 0'}],{duration:900,iterations:1,easing:'ease-in-out'})).filter(Boolean);
        idleMotions=motions;motions.forEach(motion=>motion.finished?.catch?.(()=>{}));let visualDone=false;
        const clearVisual=()=>{if(visualDone)return;visualDone=true;motions.forEach(motion=>motion.cancel?.());if(idleMotions===motions)idleMotions=[];targets.forEach(target=>target.classList.remove('animal-idle-target'));};
        const visualTimer=setTimeout(clearVisual,2400);let voiceOwned=true;const voiceTimer=setTimeout(()=>{voiceOwned=false;},4000);
        return ()=>{clearTimeout(visualTimer);clearTimeout(voiceTimer);clearVisual();if(voiceOwned && guidance && guidance.serial===serial)guidance.interrupt();};
      },
    });
    mute = muteButton(); const home = homeButton(); home.setAttribute('aria-label', 'Home: back to your valley'); const saved = button('Open your kept animal corners', 'Corners', () => openSheet('saved'), iconSVG('book')); saved.dataset.saved = '';
    const garden = button('Invite the found cat to a garden', 'Garden', chooseGardenVisit); garden.dataset.garden = ''; garden.prepend(image('leaf', '')); garden.hidden = true;
    // Home keeps the top-left corner and Sound the far right, as on other screens. The
    // Garden button that appears after finding the cat has a slot reserved from the
    // start (hidden but laid out), so nothing slides under a finger when it shows.
    host.querySelector('.animal-header').prepend(home);
    host.querySelector('nav').append(button(enteredFromMap ? 'Back to the valley' : 'Back to Explore', 'Back', () => { void router.go(enteredFromMap ? 'map' : 'discovery'); }, iconSVG('back')), saved, garden);
    const guide = button('Help: show and hear what to do with your animal friend', 'Help', help, iconSVG('help')); guide.dataset.help = ''; guide.disabled = true; host.querySelector('nav').append(guide, mute);
    for (const [key, label, text, action, icon] of [ ['ways', 'Choose hiding, a cozy corner, or a little visit', 'Play', () => openSheet('ways'), iconSVG('heart')], ['pictures', 'Choose your own saved picture as a sign or play prop', 'Picture', () => openSheet('pictures'), pictureIcon],
      ['undo', 'Undo the last scene change', 'Undo', () => { cancelTransient(); undoAnimalFriends(); view = animalFriendsView(); paint(); message(animalPlayInvitation(current())); }, iconSVG('undo')], ['hello', 'Give the cat a gentle hello', 'Hello', () => change({ type: 'pet' }), ''], ['action', 'Play with your cat', 'Try', primary, hand], ['keep', 'Keep this editable animal corner', 'Keep', keep, iconSVG('save')] ]) { const b = button(label, text, action, icon); b.dataset[key] = ''; if (key === 'hello') b.prepend(image('cat', '')); b.disabled = true; controls.append(b); }
    listen(host, 'pointerdown', event => { if (checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); return; } if (event.target.closest('.animal-navigation')) return; const decision = pointers.down(event, performance.now(), !settings.get().penOnly); if (decision.cancel) { cancelTransient(); if (view) paint(); } if (!decision.accepted) { event.preventDefault(); event.stopImmediatePropagation(); } else { openingNotice='';guidance?.interrupt(); stopHint(); } }, true);
    listen(host, 'click', event => { if (checkpointing || (!event.target.closest('.animal-navigation') && !pointers.allowClick(event, performance.now()))) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(host, 'keydown', event => { if (checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(host, 'pointermove', event => { if (checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(host, 'pointermove', moveDrag); listen(window, 'pointerup', endDrag);
    const cancel = event => { if (pointers.finish(event, performance.now(), true)) { cancelTransient(); if (view) paint(); } }; listen(window, 'pointercancel', cancel); listen(host, 'lostpointercapture', event => { if (pointers.owns(event)) cancel(event); });
    listen(scene, 'click', event => { if (selected && !event.target.closest('button')) change(moveAction(selected, locationAt(event))); });
    listen(scene, 'keydown', event => { if (event.target !== scene || !selected || !view) return; if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { openingNotice='';event.preventDefault(); const object = partPosition(selected), part = selected; if (!object) return; change(moveAction(part, { x: object.x + (event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0), y: object.y + (event.key === 'ArrowUp' ? -5 : event.key === 'ArrowDown' ? 5 : 0) })); selected = part; paint(); scene.focus({ preventScroll: true }); } });
    listen(sheet, 'keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeSheet(); } if (event.key === 'Tab') { const all = [...sheet.querySelectorAll('button:not(:disabled)')], first = all[0], last = all.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } });
    const disruption = () => { cancelTransient(); if (view) paint(); void flushAnimalFriends().catch(() => {}); }; listen(window, 'blur', disruption); listen(window, 'resize', disruption); listen(document, 'visibilitychange', () => { if (document.hidden) disruption(); });
    if (typeof ResizeObserver !== 'undefined') {
      const observedBoard = board; let width = board.clientWidth, height = board.clientHeight;
      observer = new ResizeObserver(() => {
        if (!visit.valid(token) || board !== observedBoard) return;
        const changed = width !== board.clientWidth || height !== board.clientHeight;
        width = board.clientWidth; height = board.clientHeight;
        if (view && changed) disruption();
      }); observer.observe(board);
    } offSettings = bus.on('settings:changed', () => { if (view && reduced()) { disruption();idleMotions.forEach(motion=>motion.cancel?.());idleMotions=[]; } });
    await openSavedAnimal(params, token);
  },
  busy() { return saving || checkpointing || !!drag; }, breakBusy() { return saving || checkpointing || !!drag; },
  onBack() { if (sheetKind) closeSheet(); else void router.go(enteredFromMap ? 'map' : 'discovery'); },
  beforeLeave: checkpointAnimals,
  beforeBreak: checkpointAnimals,
  unmount() { animalLoadRetry?.remove(); animalLoadRetry=null; openingAnimal=false; idleHelp?.();idleHelp=null;guidance?.dispose(); guidance = null; visit.end(); checkpointing = false; stopHint(); cancelTransient(); listeners.forEach(off => off()); listeners = []; observer?.disconnect(); observer = null; offSettings?.(); mute?.destroy?.(); void flushAnimalFriends().catch(() => {}); host = board = scene = status = controls = sheet = view = null; sheetKind = null; saving = false; },
};
