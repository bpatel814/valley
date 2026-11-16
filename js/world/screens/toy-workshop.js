import { installIdleHelp } from '../idle-help.js';
import session from '../../state/session.js';
import speech from '../../audio/speech.js';
import router, { homeButton, muteButton, iconSVG, tapify } from '../router.js';
import art from '../art.js';
import bus from '../bus.js';
import LivingGuidance from '../living-guidance.js';
import { livingPlayGuideKey } from '../../data/living-play-phrases.js';
import settings from '../../state/settings.js';
import { savedWorld } from '../../state/saved-world.js';
import gallery from '../../parent/gallery.js';
import * as db from '../../state/db.js';
import { isCreationRow } from '../../state/creation-frame.js';
import { shouldAccept } from '../../engine/pen.js';
import { toyBasketPage, TOY_GALLERY_PAGE_SIZE, TOY_PATTERN_COLORS, TOY_MAX_PATTERN } from '../../data/toy-workshop.js';
import { loadToyWorkshop, getToyWorkshop, useToyPicture, changeToyDraft, undoToyWorkshop,
  keepToy, reopenToy, flushToyWorkshop, retryToyWorkshopWrites, toyWorkshopStatus } from '../../state/toy-workshop.js';

export const WORKSHOP_WHEELS = 'toy-workshop/wheels-v1';
export const WORKSHOP_PARTS = Object.freeze({
  rolling: Object.freeze({ key: WORKSHOP_WHEELS, name: 'Wheels', label: 'Put wheels under your picture', invitation: 'Your picture can roll! Tap a place on the tabletop.', route: 'rolling-run', region: 'discovery', place: 'the hill' }),
  floating: Object.freeze({ key: 'river-run/float-v1', name: 'Float', label: 'Put a float under your picture', invitation: 'Your picture can float! Tap a place in the water.', route: 'river-run', region: 'discovery', place: 'the river' }),
  puppet: Object.freeze({ key: 'toy-workshop/puppet-handle-v1', name: 'Puppet', label: 'Put a puppet handle under your picture', invitation: 'Your picture is a puppet! Tap a place to move it, then bring it to your family show.', route: 'play-stage', region: 'treehouse', place: 'the family stage' }),
});
const shapes = { coral: '●', mint: '▲', lilac: '◆', sunshine: '★' };
const basketSVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 25C18 4 46 4 46 25" fill="none" stroke="currentColor" stroke-width="5"/><path d="M7 25h50l-7 31H14Z" fill="#e5ba79" stroke="currentColor" stroke-width="3"/><path d="M10 35h44M12 44h40M22 26l2 28m8-28v28m10-28-2 28" fill="none" stroke="#98683f" stroke-width="2"/></svg>';
const handSVG = '<svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="15" r="12" fill="#fff1aa"/><path d="M24 40V15a6 6 0 0 1 12 0v16l8-3q7 0 5 9l-5 16H27L14 40q-4-8 3-10l7 10" fill="#ffe1b8" stroke="#79563c" stroke-width="3"/></svg>';
const pictureSVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="9" width="48" height="45" rx="4" fill="#fffdf8" stroke="currentColor" stroke-width="3"/><circle cx="23" cy="23" r="6" fill="#efd07b"/><path d="m12 47 14-17 12 10 8-8 7 15" fill="#a3c89e"/></svg>';

/** A late load/save from an earlier visit must never repaint the next visit. */
export class WorkshopVisit {
  constructor() { this.serial = 0; this.active = false; }
  begin() { this.active = true; return ++this.serial; }
  valid(token) { return this.active && token === this.serial; }
  end() { this.active = false; ++this.serial; }
}

/** Single-pointer assembly and play; palm rejection includes the later click. */
export class WorkshopPointers {
  constructor() { this.active = null; this.blocked = new Map(); this.lastPenAt = -Infinity; this.legacyUntil = 0; }
  down(event, now, allowFinger = true) {
    if (event.pointerType === 'pen') this.lastPenAt = now;
    for (const [id, until] of this.blocked) if (until < now) this.blocked.delete(id);
    if (this.active !== null && this.active !== event.pointerId) {
      this.blocked.set(this.active, Infinity); this.blocked.set(event.pointerId, Infinity);
      this.active = null; this.legacyUntil = now + 800;
      return { accepted: false, cancel: true };
    }
    if (event.button !== 0 || !shouldAccept({ pointerType: event.pointerType, lastPenAt: this.lastPenAt, now, allowFinger })) {
      this.blocked.set(event.pointerId, Infinity); return { accepted: false, cancel: false };
    }
    this.active = event.pointerId; this.blocked.delete(event.pointerId); this.legacyUntil = 0;
    return { accepted: true, cancel: false };
  }
  owns(event) { return this.active === event.pointerId; }
  finish(event, now, suppress = false) {
    const owned = this.owns(event);
    if (this.blocked.has(event.pointerId) || suppress) { this.blocked.set(event.pointerId, now + 800); this.legacyUntil = now + 800; }
    if (owned) this.active = null;
    return owned;
  }
  allowClick(event, now) {
    if (event.detail === 0 && !event.pointerType) return true;
    return event.pointerId !== undefined ? !(this.blocked.get(event.pointerId) >= now) : now >= this.legacyUntil;
  }
  cancel(now) {
    if (this.active !== null) this.blocked.set(this.active, Infinity);
    this.active = null; this.legacyUntil = now + 800;
  }
}

/** Keep the full paper and wheel PNG inside even a short landscape tabletop. */
export function workshopGeometry(width, height, playing = false, position = .5) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const size = Math.max(1, Math.min(playing ? 320 : 460, w * (playing ? .46 : .78), (h - Math.min(24, h * .12)) / .924));
  const margin = Math.min(12, w * .03), minimum = size / 2 + margin, maximum = w - size / 2 - margin;
  const x = minimum + Math.max(0, Math.min(1, Number(position) || 0)) * Math.max(0, maximum - minimum);
  return { width: size, height: size * .924, x, minimum, maximum };
}

export function workshopSaveMessage(result, issue) {
  if (issue === 'toy-basket-full' || issue === 'toy-assets-full' || issue === 'toy-capacity') return 'The basket is full. Your picture and this toy are still here.';
  if (issue === 'toy-parts-needed') return 'Choose a part, then put it under your picture.';
  if (issue === 'toy-picture-needed') return 'Choose your own picture first.';
  if (issue) return 'This toy could not be kept. Your picture is still here. Try Keep again.';
  return result?.persistent ? 'Your toy is in the basket, saved on this device.' : 'Your toy is in the basket for now. Device saving is unavailable; it may disappear when this page closes.';
}

const visit = new WorkshopVisit();
let host, stage, toy, status, controls, sheet, sheetKind, muted, offSettings, observer, view, guidance, saving = false, checkpointing = false;
let playing = false, position = .5, animation, rollTimer, drag, pointers, listeners = [], galleryRows = [], galleryPage = 0, basketPage = 0, pickerSerial = 0, returnTo = null, openingNotice = '', idleHelp = null, idleMotion = null, openingWorkshop = false, workshopLoadRetry = null; 
function button(label, text, action, icon = '') {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'workshop-button'; el.setAttribute('aria-label', label);
  el.innerHTML = `${icon}<span></span>`; el.querySelector('span').textContent = text;
  tapify(el, event => { if (visit.active && !checkpointing && !saving && el.isConnected !== false && !router.isMoving()) { openingNotice='';if (!('help' in el.dataset)) guidance?.interrupt(); action(event); } }); return el;
}
function listen(target, event, action, options) { target.addEventListener(event, action, options); listeners.push(() => target.removeEventListener(event, action, options)); }
function message(text) { if (status) status.textContent = text; }
function reduced() { return settings.get().reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function stopMotion() { animation?.cancel(); animation = null; clearTimeout(rollTimer); stage?.classList.remove('is-rolling'); }
function cancelTransient() {
  guidance?.interrupt(); stage?.classList.remove('is-guided');
  stopMotion(); drag = null; host?.classList.remove('is-dragging'); pointers?.cancel(performance.now());
  stage?.classList.remove('has-rolled');
}
function partImage(behavior = 'rolling', alt = '') {
  const key = WORKSHOP_PARTS[behavior]?.key || WORKSHOP_WHEELS;
  const image = document.createElement('img'); image.src = art.get(key)?.src || `assets/art/final/${key}.png`; image.alt = alt; image.draggable = false; return image;
}
function toyPicture(png, pattern = [], assembled = true, behavior = 'rolling') {
  const figure = document.createElement('div'); figure.className = `workshop-toy workshop-toy-${behavior}`; figure.classList.toggle('is-assembled', assembled);
  const part = partImage(behavior); part.className = `workshop-part workshop-part-${behavior}`; figure.append(part);
  const card = document.createElement('div'); card.className = 'workshop-paper';
  const picture = document.createElement('img'); picture.src = png; picture.alt = 'Your exact picture'; picture.draggable = false; card.append(picture); figure.append(card);
  const band = document.createElement('div'); band.className = 'workshop-pattern'; band.setAttribute('aria-label', pattern.length ? `Your pattern: ${pattern.join(', ')}` : '');
  pattern.forEach(color => { const shape = document.createElement('i'); shape.className = `workshop-shape color-${color}`; shape.textContent = shapes[color]; shape.setAttribute('aria-hidden', 'true'); band.append(shape); }); figure.append(band); return figure;
}
function geometry() {
  if (!stage || !toy) return;
  const g = workshopGeometry(stage.clientWidth, stage.clientHeight, playing, position);
  toy.style.width = `${g.width}px`; toy.style.height = `${g.height}px`; toy.style.left = `${g.x}px`;
}
function restoreInvitation() {
  const draft = view?.draft || getToyWorkshop().draft;
  const part = WORKSHOP_PARTS[draft.behavior];
  message(!draft.asset ? 'Choose your picture.' : !draft.assembled ? `${part.label}. Tap the part, or drag it to your picture.` : playing ? part.invitation : `Your ${part.name.toLowerCase()} toy is ready. Try it, or Keep it in your basket.`);
}
function paint() {
  if (!visit.active || !stage) return;
  const snapshot = getToyWorkshop(), draft = snapshot.draft, asset = snapshot.assets.find(item => item.id === draft.asset);
  view = snapshot;
  stage.replaceChildren(); stage.classList.toggle('is-playing', playing); stage.classList.toggle('needs-wheels', !!asset && !draft.assembled);
  stage.dataset.behavior = draft.behavior;
  stage.setAttribute('aria-label', `${draft.behavior === 'floating' ? 'Picture toy water tray' : draft.behavior === 'puppet' ? 'Picture puppet play space' : 'Picture toy tabletop'}. Tap to move your toy in Try mode.`);
  toy = null;
  if (asset) {
    toy = toyPicture(asset.png, draft.pattern, draft.assembled, draft.behavior); stage.append(toy);
    if (!draft.assembled) {
      const part = WORKSHOP_PARTS[draft.behavior];
      const attach = button(`${part.label}. Tap, or drag to the picture.`, part.name, assemble);
      attach.classList.add('workshop-attach', 'workshop-invitation'); attach.dataset.part = draft.behavior; attach.prepend(partImage(draft.behavior));
      attach.addEventListener('pointerdown', startDrag); stage.append(attach);
      const hint = document.createElement('div'); hint.className = 'workshop-attach-hand'; hint.innerHTML = handSVG; stage.append(hint);
    } else if (playing) {
      const hand = document.createElement('div'); hand.className = 'workshop-roll-target workshop-invitation'; hand.innerHTML = `${handSVG}<span aria-hidden="true">↔</span>`; stage.append(hand);
    }
  } else {
    const choose = button('Choose one of your saved pictures', 'Your picture', () => openSheet('pictures'), pictureSVG + handSVG);
    choose.classList.add('workshop-empty-picture', 'workshop-invitation'); stage.append(choose);
  }
  // Only show actions relevant to the current step. Existing choices return as
  // soon as their prerequisites are met; no toy or undo history is removed.
  controls.querySelector('[data-try]').hidden = !draft.assembled;
  controls.querySelector('[data-keep]').hidden = !draft.assembled;
  controls.querySelector('[data-parts]').hidden = !asset;
  controls.querySelector('[data-undo]').hidden = !snapshot.undo.length;
  controls.querySelector('[data-picture]').hidden = false;
  controls.querySelector('[data-try]').disabled = !draft.assembled || saving;
  controls.querySelector('[data-keep]').disabled = !draft.assembled || saving;
  controls.querySelector('[data-parts]').disabled = !asset || saving;
  controls.querySelector('[data-parts]').querySelector('img').src = partImage(draft.behavior).src;
  controls.querySelector('[data-try]').setAttribute('aria-label', draft.behavior === 'floating' ? 'Try your floating picture. Tap the water to move.' : draft.behavior === 'puppet' ? 'Try your picture puppet. Tap a place to move it.' : 'Try your picture toy. Tap the tabletop to roll.');
  controls.querySelector('[data-undo]').disabled = !snapshot.undo.length || saving;
  controls.querySelector('[data-picture]').disabled = saving;
  host.querySelector('[data-basket]').disabled = saving;
  host.querySelector('[data-help]').disabled = saving || checkpointing;
  geometry();
}
function apply(action) {
  cancelTransient();
  const changed = changeToyDraft(action); paint();
  const issue = toyWorkshopStatus().issue;
  if (issue && issue !== 'toy-temporary') message(workshopSaveMessage(null, issue)); else restoreInvitation();
  return changed;
}
function assemble() {
  if (saving || checkpointing) return;
  if (apply({ type: 'assemble' }) && view.draft.assembled) guidance?.after('living_workshop_ready', { guard: () => !!toy && view?.draft.assembled });
}
function help() {
  if (!view || saving || checkpointing || sheetKind) return;
  cancelTransient(); paint(); stage.classList.add('is-guided'); guidance?.guide(true);
}
function tryToy() {
  if (saving || !view?.draft.assembled) return;
  cancelTransient(); playing = true; position = .18; paint(); restoreInvitation(); guidance?.guide(false);
}
function rollTo(clientX) {
  if (!playing || !toy || !view?.draft.assembled || saving || sheetKind) return;
  guidance?.interrupt(); stage.classList.remove('is-guided'); stopMotion(); stage.querySelector('.workshop-roll-target')?.remove();
  const rect = stage.getBoundingClientRect(), old = workshopGeometry(stage.clientWidth, stage.clientHeight, true, position);
  const wanted = Math.max(old.minimum, Math.min(old.maximum, clientX - rect.left - stage.clientLeft));
  position = old.maximum === old.minimum ? .5 : (wanted - old.minimum) / (old.maximum - old.minimum);
  const token = visit.serial; geometry();
  stage.style.setProperty('--landing-x', `${wanted}px`); stage.classList.add('is-rolling', 'has-rolled');
  if (!reduced() && toy.animate) animation = toy.animate([{ transform: `translate(calc(-50% + ${old.x - wanted}px), -50%)` }, { transform: 'translate(-50%, -50%)' }], { duration: Math.max(220, Math.min(850, Math.abs(old.x - wanted) * 2.8)), easing: 'cubic-bezier(.2,.7,.3,1)' });
  message(view.draft.behavior === 'floating' ? 'Your picture floated here. Tap another place!' : view.draft.behavior === 'puppet' ? 'Your puppet moved here. What happens next?' : 'Your picture toy rolled here. Tap another place!');
  rollTimer = setTimeout(() => { if (visit.valid(token)) { stage.classList.remove('is-rolling'); animation = null; } }, reduced() ? 120 : 900);
}
function startDrag(event) {
  if (!pointers.owns(event) || saving) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* OS cancellation is harmless. */ }
}
function moveDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8;
  if (drag.moved) { host.classList.add('is-dragging'); stage.style.setProperty('--drag-x', `${event.clientX - stage.getBoundingClientRect().left}px`); stage.style.setProperty('--drag-y', `${event.clientY - stage.getBoundingClientRect().top}px`); }
}
function endDrag(event) {
  if (!drag || event.pointerId !== drag.id) { pointers.finish(event, performance.now()); return; }
  const completed = drag; drag = null; host.classList.remove('is-dragging'); pointers.finish(event, performance.now(), completed.moved);
  if (!completed.moved) return;
  const r = stage.getBoundingClientRect();
  if (event.clientX >= r.left - 16 && event.clientX <= r.right + 16 && event.clientY >= r.top - 16 && event.clientY <= r.bottom + 16) assemble();
}
async function keep() {
  if (saving) return; cancelTransient(); saving = true; paint(); message('Putting your toy in the basket…');
  const token = visit.serial;
  // New keeps are owned only by the explicitly selected current child.
  const child = savedWorld.id;
  try {
    const result = await keepToy(child);
    if (!visit.valid(token)) return;
    message(workshopSaveMessage(result)); host.querySelector('[data-basket]').classList.add('has-kept');
  } catch (error) { if (visit.valid(token)) message(workshopSaveMessage(null, error.code || 'toy-write')); }
  finally { if (visit.valid(token)) { saving = false; paint(); } }
}
async function takeToyToPlace(route, region, place) {
  if (saving || !view?.draft.assembled || !router.registered().includes(route) || !settings.isActivityEnabled(route)) return;
  const token = visit.serial;
  cancelTransient(); saving = true; paint(); message(`Keeping this picture toy for ${place}…`);
  try {
    const kept = await keepToy(savedWorld.id);
    if (!visit.valid(token)) return;
    closeSheet();
    saving = false;
    await router.go(route, { toyId: kept.id });
  } catch (error) { if (visit.valid(token)) message(workshopSaveMessage(null, error.code || 'toy-write')); }
  finally { if (visit.valid(token)) { saving = false; paint(); } }
}
function closeSheet() {
  if (!sheet) return;
  ++pickerSerial;
  sheet.hidden = true; sheetKind = null;
  for (const child of host.children) if (child !== sheet) child.inert = false;
  host.querySelector('[data-picture]')?.focus({ preventScroll: true });
}
function sheetHeader(title) {
  sheet.replaceChildren(); const header = document.createElement('div'); header.className = 'workshop-sheet-header';
  header.append(button('Return to your toy', 'Back', closeSheet, iconSVG('back')));
  const heading = document.createElement('h2'); heading.textContent = title; header.append(heading); sheet.append(header);
}
function pager(page, pages, go) {
  if (pages <= 1) return;
  const row = document.createElement('div'); row.className = 'workshop-pages';
  const back = button('Previous pictures', 'Back', () => go(page - 1), iconSVG('back')); back.disabled = page === 0;
  const next = button('More pictures', 'More', () => go(page + 1), iconSVG('next')); next.disabled = page >= pages - 1;
  const count = document.createElement('span'); count.textContent = `${page + 1} / ${pages}`; row.append(back, count, next); sheet.append(row);
}
function paintPictures() {
  sheetHeader('Your pictures');
  const pages = Math.max(1, Math.ceil(galleryRows.length / TOY_GALLERY_PAGE_SIZE)); galleryPage = Math.max(0, Math.min(pages - 1, galleryPage));
  const grid = document.createElement('div'); grid.className = 'workshop-picture-grid';
  galleryRows.slice(galleryPage * TOY_GALLERY_PAGE_SIZE, (galleryPage + 1) * TOY_GALLERY_PAGE_SIZE).forEach((row, i) => {
    const choose = button(`Make a toy from your picture ${galleryPage * TOY_GALLERY_PAGE_SIZE + i + 1}`, '', () => {
      useToyPicture(row); playing = false; position = .5; closeSheet(); paint();
      const issue = toyWorkshopStatus().issue; if (issue && issue !== 'toy-temporary') message(workshopSaveMessage(null, issue)); else restoreInvitation();
    });
    const image = document.createElement('img'); image.src = row.png; image.alt = 'Your saved picture'; image.draggable = false; choose.prepend(image); grid.append(choose);
  }); sheet.append(grid);
  if (!db.status().persistent) {
    const warning=document.createElement('p');warning.textContent='Pictures saved on this device may be unavailable right now. Ask a grown-up to check storage before closing.';sheet.append(warning);
  }
  if (!galleryRows.length) {
    if (db.status().persistent) { const empty=document.createElement('p');empty.textContent='A picture you keep in the Art Room can become a toy here.';sheet.append(empty); }
    sheet.append(button('Go to the Art Room to make and keep a picture', 'Make a picture', () => { void router.go('studio', returnTo ? { workshopReturnTo: returnTo } : {}); }, iconSVG('art')));
  }
  pager(galleryPage, pages, page => { galleryPage = page; paintPictures(); });
}
function paintBasket() {
  sheetHeader('Your toy basket');
  const snapshot = getToyWorkshop(), page = toyBasketPage(snapshot.toys, basketPage, savedWorld.id === 'shared' ? null : savedWorld.id); basketPage = page.page;
  const grid = document.createElement('div'); grid.className = 'workshop-picture-grid workshop-basket-grid';
  page.items.forEach((item, i) => {
    const asset = snapshot.assets.find(row => row.id === item.asset); if (!asset) return;
    const open = button(`Open and change kept picture toy ${page.page * TOY_GALLERY_PAGE_SIZE + i + 1}`, '', () => {
      reopenToy(item.id); playing = false; position = .5; closeSheet(); paint(); restoreInvitation();
    }); open.setAttribute('aria-description', WORKSHOP_PARTS[item.behavior].name); open.append(toyPicture(asset.png, item.pattern, true, item.behavior)); grid.append(open);
  }); sheet.append(grid);
  const part = WORKSHOP_PARTS[snapshot.draft.behavior];
  if (snapshot.draft.assembled && router.registered().includes(part.route) && settings.isActivityEnabled(part.route)) {
    const take = button(`Keep this exact picture toy and take it to ${part.place}`, `Take this toy to ${part.place}`, () => takeToyToPlace(part.route, part.region, part.place));
    take.classList.add('workshop-take-to-hill');
    const destination = partImage(snapshot.draft.behavior);
    if (snapshot.draft.behavior === 'rolling') destination.src = 'assets/art/final/rolling-run/ramp-v1.png';
    take.prepend(destination); sheet.append(take);
  }
  if (snapshot.draft.assembled && router.registered().includes('music-band') && settings.isActivityEnabled('music-band')) {
    const take = button('Keep this exact picture toy and play its pattern with the Music Band', 'Play this toy’s pattern', () => takeToyToPlace('music-band', 'treehouse', 'the band'));
    take.classList.add('workshop-take-to-hill');
    const drum = document.createElement('img'); drum.src = 'assets/art/final/music-band/drum-v1.png'; drum.alt = ''; drum.draggable = false;
    take.prepend(drum); sheet.append(take);
  }
  if (!page.items.length) { const empty = document.createElement('p'); empty.textContent = 'Keep your picture toy here when it is ready.'; sheet.append(empty); }
  pager(page.page, page.pages, index => { basketPage = index; paintBasket(); });
}
function paintParts() {
  sheetHeader('What can your picture do?');
  const grid = document.createElement('div'); grid.className = 'workshop-parts-grid';
  for (const [behavior, part] of Object.entries(WORKSHOP_PARTS)) {
    const choice = button(`${part.name}: ${part.label}. Your original picture stays the same.`, part.name, () => {
      apply({ type: 'behavior', behavior }); playing = false; position = .5; closeSheet(); paint(); restoreInvitation();
    });
    choice.setAttribute('aria-pressed', String(getToyWorkshop().draft.behavior === behavior));
    choice.classList.add('workshop-part-choice'); choice.dataset.behavior = behavior;
    choice.prepend(partImage(behavior)); grid.append(choice);
  }
  const pattern=button('Choose an optional pattern of colored shapes', 'Pattern', () => openSheet('pattern'), '<div class="workshop-pattern-icon" aria-hidden="true"><i>●</i><i>▲</i><i>●</i></div>');
  pattern.classList.add('workshop-part-choice');pattern.dataset.patternChoice='';grid.append(pattern);
  sheet.append(grid);
}
function paintPattern() {
  sheetHeader('A pattern for your toy');
  const draft = getToyWorkshop().draft, preview = document.createElement('div'); preview.className = 'workshop-pattern-preview'; preview.setAttribute('aria-label', `Pattern has ${draft.pattern.length} of ${TOY_MAX_PATTERN} shapes`);
  for (let i = 0; i < TOY_MAX_PATTERN; i++) { const color = draft.pattern[i], slot = document.createElement('span'); slot.className = color ? `workshop-shape color-${color}` : 'workshop-pattern-slot'; slot.textContent = color ? shapes[color] : ''; preview.append(slot); } sheet.append(preview);
  const choices = document.createElement('div'); choices.className = 'workshop-colors';
  TOY_PATTERN_COLORS.forEach(color => {
    const choice = button(`Add a ${color} ${color === 'coral' ? 'circle' : color === 'mint' ? 'triangle' : color === 'lilac' ? 'diamond' : 'star'}`, '', () => { apply({ type: 'pattern-add', color }); paintPattern(); });
    choice.innerHTML = `<span class="workshop-shape color-${color}" aria-hidden="true">${shapes[color]}</span>`; choice.disabled = draft.pattern.length >= TOY_MAX_PATTERN; choices.append(choice);
  }); sheet.append(choices);
  const row = document.createElement('div'); row.className = 'workshop-pages';
  const undo = button('Take away the last pattern shape', 'Undo shape', () => { apply({ type: 'pattern-pop' }); paintPattern(); }, iconSVG('undo')); undo.dataset.patternUndo=''; undo.disabled = !draft.pattern.length; undo.hidden = !draft.pattern.length;
  row.append(undo); sheet.append(row);
}
async function openSheet(kind) {
  if (saving) return; cancelTransient(); sheetKind = kind; sheet.hidden = false;
  const request = ++pickerSerial;
  for (const child of host.children) if (child !== sheet) child.inert = true;
  if (kind === 'pictures') {
    sheetHeader('Your pictures'); const wait = document.createElement('p'); wait.textContent = 'Opening your pictures…'; sheet.append(wait);
    const token = visit.serial;
    let rows;
    try { rows = (await gallery.listChecked()).filter(isCreationRow); }
    catch {
      if (!visit.valid(token) || sheetKind !== kind || request !== pickerSerial) return;
      sheetHeader('Your pictures');
      const warning=document.createElement('p');warning.textContent='Pictures could not be opened. Your current toy is still here. Try again, or ask a grown-up for help.';sheet.append(warning);
      const retry=button('Try opening your pictures again', 'Try again', () => openSheet('pictures'));retry.dataset.pictureRetry='';sheet.append(retry);
      sheet.querySelector('button')?.focus({ preventScroll: true });return;
    }
    if (!visit.valid(token) || sheetKind !== kind || request !== pickerSerial) return;
    galleryRows = rows;
    paintPictures();
  } else if (kind === 'basket') paintBasket(); else if (kind === 'parts') paintParts(); else paintPattern();
  sheet.querySelector('button')?.focus({ preventScroll: true });
}

/** Real rejecting writes determine whether the live toy may be left. */
export async function checkpointWorkshopScene({ alive, held, report = () => {} }) {
  if (!alive()) return false;
  if (held()) return false;
  let retried = false;
  for (;;) {
    const pending = flushToyWorkshop(); let failure;
    try { await pending; } catch (error) { failure = error; }
    if (!alive() || held()) return false;
    if (pending !== flushToyWorkshop()) continue;
    if (failure) {
      if (!retried) { retried = true; try { await retryToyWorkshopWrites(); } catch {} if (pending !== flushToyWorkshop()) continue; }
      report('Your toy could not save. It is still open here. Try leaving again, or ask a grown-up to help.');
      return false;
    }
    if (!toyWorkshopStatus().persistent) report('Your toy is here for now. Ask a grown-up to keep a backup before closing.');
    return true;
  }
}
async function checkpoint() {
  guidance?.interrupt();
  if (!visit.active) { await flushToyWorkshop(); return true; }
  if (!view) { const token=visit.serial; try { await flushToyWorkshop(); return visit.valid(token); } catch { if (visit.valid(token)) message('Your toy could not finish saving. Try again before leaving.'); return false; } }
  if (checkpointing || saving || drag || pointers?.active != null) return false;
  const token = visit.serial; checkpointing = true;
  try {
    return await checkpointWorkshopScene({ alive: () => visit.valid(token), held: () => saving || !!drag || pointers?.active != null, report: message });
  } finally { if (visit.valid(token)) checkpointing = false; }
}

async function openSavedWorkshop(params, token, retryWrites = false) {
  if (!visit.valid(token) || openingWorkshop) return;
  openingWorkshop=true; if (workshopLoadRetry) workshopLoadRetry.disabled=true;
  try {
      if (retryWrites && toyWorkshopStatus().issue === 'toy-write') await retryToyWorkshopWrites();
      if (!visit.valid(token)) return;
      await loadToyWorkshop();
      if (!visit.valid(token)) return;
      let sourceIssue = '';
      if (params.sourceKey) {
        try {
          const rows = (await gallery.listChecked()).filter(isCreationRow);
          if (!visit.valid(token)) return;
          const row = rows.find(item => item.key === params.sourceKey);
          if (row) useToyPicture(row);
          const current=getToyWorkshop(), selected=current.assets.find(asset=>asset.id===current.draft.asset);
          if (!row || selected?.sourceRef !== row.key || selected?.png !== row.png) sourceIssue = 'That picture could not be opened. Your current toy is still here. Try Picture, or ask a grown-up for help.';
        } catch {
          if (!visit.valid(token)) return;
          sourceIssue = 'That picture could not be opened. Your current toy is still here. Try Picture, or ask a grown-up for help.';
        }
      }
      if (!visit.valid(token)) return;
      workshopLoadRetry?.remove(); workshopLoadRetry=null; paint(); restoreInvitation();
      if(sourceIssue)openingNotice=sourceIssue;
      if (!toyWorkshopStatus().persistent) sourceIssue += (sourceIssue ? ' ' : '') + 'Device saving is unavailable. You can play, but toys kept now may disappear when this page closes.';
      if (sourceIssue) message(sourceIssue);
  } catch { if (visit.valid(token)) { message('Your toy could not open. Try again or return Home.'); if (!view && !workshopLoadRetry) { const retry=button('Try opening your toy again', 'Try again', () => { void openSavedWorkshop(params,token,true); }, iconSVG('replay')); retry.classList.add('workshop-load-retry'); stage.append(retry); workshopLoadRetry=retry; } } }
  finally { if (visit.valid(token)) { openingWorkshop=false; if (workshopLoadRetry) workshopLoadRetry.disabled=false; } }
}
export default {
  id: 'toy-workshop',
  async mount(el, params = {}) {
    const token = visit.begin(); openingWorkshop=false; workshopLoadRetry=null; openingNotice='';host = el; saving = false; checkpointing = false; playing = false; position = .5; sheetKind = null; view = null; pointers = new WorkshopPointers();
    returnTo = ['rolling-run', 'river-run', 'music-band', 'map'].includes(params.returnTo) ? params.returnTo : null;
    host.classList.add('toy-workshop');
    host.innerHTML = '<header class="workshop-header"><h1>Toy Workshop</h1><nav class="workshop-navigation" aria-label="Go to another place"></nav></header><main class="workshop-stage" tabindex="0" role="group" aria-label="Picture toy tabletop. Tap to roll in Try mode."></main><p class="workshop-status" role="status" aria-live="polite">Opening your toy…</p><div class="workshop-controls"></div><section class="workshop-sheet" hidden role="dialog" aria-modal="true" aria-label="Choose pictures, toys or a pattern"></section>';
    stage = host.querySelector('.workshop-stage'); status = host.querySelector('.workshop-status'); controls = host.querySelector('.workshop-controls'); sheet = host.querySelector('.workshop-sheet');
    guidance?.dispose(); guidance = new LivingGuidance({ route: 'toy-workshop', active: () => visit.valid(token),
      ready: () => !!view && !saving && !checkpointing && !sheetKind && !drag && !openingNotice,
      guideKey: help => livingPlayGuideKey('toy-workshop', view?.draft, { help, playing }),
      caption: (text, key) => { host.dataset.guidance = key; message(text); } });
    idleHelp?.();idleHelp=installIdleHelp(host,{
      active:()=>visit.valid(token) && !!view && !saving && !checkpointing && !sheetKind && !drag && pointers?.active==null && !openingNotice && !session.isBreakLocked() && !router.isMoving() && router.current()==='toy-workshop' && !speech.isSpeaking(),
      demonstrate:()=>{
        const ownStage=stage,draft=view.draft;let transient=null;
        let target=!draft.asset ? ownStage.querySelector('.workshop-empty-picture') : !draft.assembled ? ownStage.querySelector('.workshop-attach') : !playing ? controls.querySelector('[data-try]') : ownStage.querySelector('.workshop-roll-target');
        if(playing && !target){transient=document.createElement('div');transient.className='workshop-roll-target workshop-idle-target';transient.setAttribute('aria-hidden','true');transient.innerHTML=`${handSVG}<span aria-hidden="true">↔</span>`;ownStage.append(transient);target=transient;}
        if(!target)return null;ownStage.classList.add('is-guided');guidance.guide(false);const serial=guidance.serial;
        const motion=!reduced() && target.animate?.([{translate:'0 0'},{translate:'6px 0'},{translate:'0 0'}],{duration:900,iterations:1,easing:'ease-in-out'});
        idleMotion=motion || null;motion?.finished?.catch?.(()=>{});let visualDone=false;
        const clearVisual=()=>{if(visualDone)return;visualDone=true;motion?.cancel?.();if(idleMotion===motion)idleMotion=null;transient?.remove();ownStage.classList.remove('is-guided');};
        const visualTimer=setTimeout(clearVisual,2400);let voiceOwned=true;
        const voiceTimer=setTimeout(()=>{voiceOwned=false;},4000);
        return ()=>{clearTimeout(visualTimer);clearTimeout(voiceTimer);clearVisual();if(voiceOwned && guidance && guidance.serial===serial)guidance.interrupt();};
      },
    });
    muted = muteButton(); const home = homeButton(); home.setAttribute('aria-label', 'Home: back to your valley');
    const basket = button('Open your kept toy basket', 'Basket', () => openSheet('basket'), basketSVG); basket.dataset.basket = '';
    const back=button(returnTo === 'rolling-run' ? 'Back to the hill' : returnTo === 'map' ? 'Back to the valley' : returnTo === 'river-run' ? 'Back to the river' : returnTo === 'music-band' ? 'Back to music' : 'Back to the Art Room', 'Back', () => { void router.go(returnTo || 'studio'); }, iconSVG('back')); back.dataset.back='';
    host.querySelector('nav').append(home, muted, back, basket);
    const guide = button('Help: show and hear what to do with your toy', 'Help', help, iconSVG('help')); guide.dataset.help = ''; guide.disabled = true; host.querySelector('nav').append(guide);
    const parts = [
      ['picture', 'Choose or change your own picture', 'Picture', () => openSheet('pictures'), pictureSVG],
      ['parts', 'Choose toy parts or an optional pattern', 'Parts & pattern', () => openSheet('parts'), '<img class="workshop-control-part" src="assets/art/final/toy-workshop/wheels-v1.png" alt="">'],
      ['undo', 'Undo the last toy change', 'Undo', () => { cancelTransient(); undoToyWorkshop(); playing = false; paint(); restoreInvitation(); }, iconSVG('undo')],
      ['try', 'Try your picture toy. Tap the tabletop to roll.', 'Try', tryToy, iconSVG('play')],
      ['keep', 'Keep your picture toy in the basket', 'Keep', keep, basketSVG],
    ];
    parts.forEach(([key, label, text, action, icon]) => { const control = button(label, text, action, icon); control.dataset[key] = ''; control.disabled = true; control.hidden = true; controls.append(control); });
    const pointerDown = event => {
      if (checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (event.target.closest('.workshop-navigation')) return;
      const verdict = pointers.down(event, performance.now(), !settings.get().penOnly);
      if (verdict.cancel) cancelTransient();
      if (verdict.accepted && !event.target.closest('[data-help]')) { openingNotice='';guidance?.interrupt(); stage.classList.remove('is-guided'); }
      if (!verdict.accepted) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    listen(host, 'pointerdown', pointerDown, true);
    listen(host, 'click', event => {
      if (!event.target.closest('.workshop-navigation') && !pointers.allowClick(event, performance.now())) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    listen(host, 'pointermove', moveDrag); listen(window, 'pointerup', endDrag);
    listen(window, 'pointercancel', event => { if (pointers.finish(event, performance.now(), true)) cancelTransient(); });
    listen(host, 'lostpointercapture', event => { if (pointers.owns(event)) { pointers.finish(event, performance.now(), true); cancelTransient(); } });
    listen(stage, 'click', event => { if (!event.target.closest('button')) rollTo(event.clientX); });
    listen(stage, 'keydown', event => {
      if (event.target !== stage || !playing) return;
      if (['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) {
        openingNotice='';event.preventDefault(); const next = event.key === 'ArrowLeft' ? .1 : event.key === 'ArrowRight' ? .9 : position > .5 ? .1 : .9;
        const g = workshopGeometry(stage.clientWidth, stage.clientHeight, true, next); rollTo(stage.getBoundingClientRect().left + stage.clientLeft + g.x);
      }
    });
    listen(sheet, 'keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeSheet(); }
      if (event.key === 'Tab') {
        const focusable = [...sheet.querySelectorAll('button:not(:disabled)')], first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    const disruption = () => { cancelTransient(); geometry(); void flushToyWorkshop().catch(() => {}); };
    listen(window, 'blur', disruption); listen(document, 'visibilitychange', () => { if (document.hidden) disruption(); }); listen(window, 'resize', disruption);
    if (typeof ResizeObserver !== 'undefined') {
      const observedStage = stage;
      let width = observedStage.clientWidth, height = observedStage.clientHeight;
      observer = new ResizeObserver(() => {
        if (!visit.valid(token) || stage !== observedStage) return;
        const nextWidth = observedStage.clientWidth, nextHeight = observedStage.clientHeight;
        const changed = nextWidth !== width || nextHeight !== height;
        width = nextWidth; height = nextHeight;
        // Guidance and the first observer delivery must not stop live play.
        if (changed) { cancelTransient(); geometry(); }
      });
      observer.observe(observedStage);
    }
    offSettings = bus.on('settings:changed', () => { if (reduced()) { stopMotion();idleMotion?.cancel?.();idleMotion=null; } });
    await openSavedWorkshop(params, token);
  },
  busy() { return saving || checkpointing || !!drag; },
  breakBusy() { return saving || checkpointing || !!drag || pointers?.active != null; },
  onBack() { if (sheetKind) closeSheet(); else void router.go(returnTo || 'studio'); },
  beforeLeave() { return checkpoint(); },
  beforeBreak() { return checkpoint(); },
  unmount() {
    workshopLoadRetry?.remove(); workshopLoadRetry=null; openingWorkshop=false;
    idleHelp?.();idleHelp=null;guidance?.dispose(); guidance = null;
    visit.end(); cancelTransient(); listeners.forEach(off => off()); listeners = []; observer?.disconnect(); observer = null; offSettings?.(); muted?.destroy?.();
    void flushToyWorkshop().catch(() => {}); host = stage = toy = status = controls = sheet = view = null; sheetKind = null; saving = false;
  },
};
