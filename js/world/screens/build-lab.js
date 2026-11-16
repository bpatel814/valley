import art from '../art.js';
import router, { homeButton, muteButton, tapify, recoveryAction } from '../router.js';
import bus from '../bus.js';
import { installIdleHelp } from '../idle-help.js';
import session from '../../state/session.js';
import settings from '../../state/settings.js';
import speech from '../../audio/speech.js';
import { shouldAccept } from '../../engine/pen.js';
import state from '../../state/build-lab.js';
import { loadBuildParcelPictures } from '../../state/build-lab-source.js';
import { BUILD_GAPS, BUILD_PLANKS, buildBanks, plankBounds, testBuild } from '../../data/build-lab.js';

// The stream is a scale drawing. Its plank lengths and bearing points match the rules.
export const buildBackDestination = fromMap => fromMap ? 'map' : 'discovery';
let enteredFromMap = false;
let host, board, tray, status, controls, saved, mute, help, offSettings, drag, selected, selectedPart, result, testTimer, deliveryTimer, helpTimer, sourcePicker, pickerSerial = 0, saving = false, alive = false;
let pointerGate, pointerDownListener, pointerEndListener, pointerCancelListener, lostCaptureListener, visibilityListener, clickListener, mountSerial = 0;
let configSheet, resizeObserver, viewportObserver, resizeListener, lastTryStatus = null, idleHelp = null, idleMotion = null, loadFailed = false, openingBuild = false;
export function buildLabStatus(build, tryStatus = null) {
  if (tryStatus) return tryStatus;
  if (build.invitation === 'delivery' && build.parcel) return build.delivered
    ? 'Your own picture arrived! It is in the frame. Keep this bridge, or change it and try again.'
    : 'Your picture is ready. Build a bridge to the frame, then try the caterpillar.';
  if (build.invitation === 'delivery') return 'Choose your picture, then build a bridge to the frame.';
  return 'Make a bridge for the caterpillar.';
}
function restoreStatus() { lastTryStatus = null; status.textContent = buildLabStatus(state.get().current); }
function showTryStatus(text) { lastTryStatus = text; status.textContent = buildLabStatus(state.get().current, lastTryStatus); }
export const BUILD_CROSSER_ART = 'assets/art/final/characters/caterpillar_idle.webp';
export function buildCrosserArt() { return art.get('characters/caterpillar_idle')?.src || BUILD_CROSSER_ART; }
// Measured opaque foot edge in the approved 367x515 sprite. The natural image
// ratio is preserved; this anchor, rather than its transparent box, meets the deck.
export const BUILD_ACTOR_METRICS = Object.freeze({ width: 367, height: 515, footY: 506, deck: .56 });
export function buildLabViewportLayout(width, height) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const landscape = w > h && w >= 400, compact = landscape ? h < 360 : h < 560, dense = landscape ? h < 320 : h < 460;
  const padding = landscape || dense ? 8 : 12, gap = 6, header = 44, choices = 44;
  const tray = dense ? 44 : landscape ? 100 : 64, controls = compact ? 48 : 96, status = 28;
  const panelHeight = h - padding * 2 - header - gap;
  return { landscape, compact, dense, padding, gap, header, choices, tray, controls, status,
    boardHeight: landscape ? panelHeight : h - padding * 2 - header - choices - tray - controls - status - gap * 5,
    railWidth: landscape ? dense ? 190 : Math.min(190, Math.max(174, w * .3)) : 0,
    targetSize: 44 };
}
export function buildCarrierGeometry(width, height, banks) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const actorWidth = Math.min(96, Math.max(64, w * .13), Math.max(32, w * .22 - 16));
  const actorHeight = actorWidth * BUILD_ACTOR_METRICS.height / BUILD_ACTOR_METRICS.width;
  const deckY = h * BUILD_ACTOR_METRICS.deck;
  const footOffset = actorHeight * BUILD_ACTOR_METRICS.footY / BUILD_ACTOR_METRICS.height;
  const frameWidth = Math.min(96, Math.max(56, w * .16)), frameHeight = h * .22;
  return { actorWidth, actorHeight, top: deckY - footOffset, footOffset, deckY,
    start: Math.max(8, w * banks.left / 100 - actorWidth - 8),
    end: Math.min(w - actorWidth - 4, w * banks.right / 100 + 8),
    frame: { left: w - frameWidth - 4, top: h * .76, width: frameWidth, height: frameHeight } };
}
function updateGeometry() {
  if (!alive || !board) return;
  const geometry = buildCarrierGeometry(board.clientWidth, board.clientHeight, buildBanks(state.get().current));
  for (const [name, value] of Object.entries({ 'actor-width': geometry.actorWidth, 'actor-height': geometry.actorHeight, 'actor-top': geometry.top, 'actor-start': geometry.start, 'actor-end': geometry.end,
    'frame-left': geometry.frame.left, 'frame-top': geometry.frame.top, 'frame-width': geometry.frame.width, 'frame-height': geometry.frame.height })) board.style.setProperty(`--${name}`, `${value}px`);
}
function updateViewport() {
  if (!alive || !host) return;
  const layout = buildLabViewportLayout(host.clientWidth, host.clientHeight);
  host.dataset.layout = layout.landscape ? 'landscape' : 'portrait'; host.dataset.compact = String(layout.compact); host.dataset.dense = String(layout.dense);
  host.style.setProperty('--rail-width', `${layout.railWidth}px`); updateGeometry();
}
function closeOptions() {
  if (!configSheet) return; const wasOpen = !configSheet.hidden; configSheet.hidden = true;
  for (const child of host?.children || []) if (child !== configSheet) child.inert = false;
  if (wasOpen) host?.querySelector('[data-mission-summary]')?.focus({ preventScroll: true });
}
function openOptions(section = 'invitation') {
  if (!configSheet || saving || pointerGate?.active != null) return;
  configSheet.hidden = false;
  stopTest(); cancelDrag();
  for (const child of host?.children || []) if (child !== configSheet) child.inert = true;
  configSheet.querySelectorAll('[data-extra-control]').forEach(b => { b.disabled = controls.querySelector(`[data-control="${b.dataset.extraControl}"]`)?.disabled || false; });
  const heading = configSheet.querySelector(`[data-config-section="${section}"]`);
  heading?.scrollIntoView?.({ block: 'nearest' });
  configSheet.querySelector('[data-options-back]')?.focus({ preventScroll: true });
}
// Keep rejection attached to pointer identity, including long palms and delayed clicks.
export class BuildPointerGate {
  constructor() { this.active = null; this.lastPenAt = -Infinity; this.rejected = new Map(); this.legacyUntil = 0; }
  down(event, now, allowFinger = true) {
    for (const [id, expiry] of this.rejected) if (expiry < now) this.rejected.delete(id);
    if (event.pointerType === 'pen') this.lastPenAt = now;
    const takeover = event.pointerType === 'pen' && this.active !== null && this.active !== event.pointerId;
    if (event.button !== 0 || !shouldAccept({ pointerType: event.pointerType, lastPenAt: this.lastPenAt, now, allowFinger }) ||
        (this.active !== null && this.active !== event.pointerId && !takeover)) {
      this.rejected.set(event.pointerId, Infinity); return { accepted: false, takeover: false };
    }
    if (takeover) this.rejected.set(this.active, Infinity);
    this.active = event.pointerId; this.rejected.delete(event.pointerId); this.legacyUntil = 0;
    return { accepted: true, takeover };
  }
  owns(event) { return this.active === event.pointerId; }
  finish(event, now, suppress = false) {
    if (this.rejected.has(event.pointerId)) { this.rejected.set(event.pointerId, now + 700); this.legacyUntil = now + 700; }
    if (!this.owns(event)) return false;
    this.active = null;
    if (suppress) { this.rejected.set(event.pointerId, now + 700); this.legacyUntil = now + 700; }
    return true;
  }
  lostCapture(event, now) { return this.owns(event) ? this.finish(event, now, true) : false; }
  allowClick(event, now) {
    if (this.active !== null) return false;
    if (event.detail === 0 && !event.pointerType) return true; // keyboard activation
    if (event.pointerId !== undefined) return !(this.rejected.get(event.pointerId) >= now);
    return now >= this.legacyUntil; // old WebKit's synthetic MouseEvent
  }
  reset() { this.active = null; this.rejected.clear(); this.legacyUntil = 0; }
}
const controlIcons = {
  undo: '<path d="m21 9-12 13 12 12M10 22h20q15 0 15 19"/>',
  remove: '<path d="M13 16h28M18 16v28h18V16M23 9h8"/>',
  clear: '<path d="M38 14A18 18 0 1 0 43 35M38 5v13H25"/>',
  save: '<path d="M27 14C13 2 2 18 27 43C52 18 41 2 27 14Z"/>',
  help: '<path d="M18 14c0-12 24-12 21 3-1 7-12 7-12 15M27 42v1"/>',
  back: '<path d="M44 26H10m13-13L10 26l13 13"/>',
};
function pictureButton(b, name, text) {
  b.innerHTML = `<svg class="build-control-icon" viewBox="0 0 54 54" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${controlIcons[name]}</svg><span>${text}</span>`;
  return b;
}
const reduced = () => settings.get().reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function button(label, text, fn) {
  const visit = mountSerial;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'build-button'; b.setAttribute('aria-label', label); b.textContent = text;
  tapify(b, event => {
    if (!alive || visit !== mountSerial || !b.isConnected || saving || pointerGate?.active != null) return;
    fn(event);
  });
  return b;
}
function say(key) { if (!settings.get().muted) speech.say?.(key); }
function stopTest() { clearTimeout(testTimer); clearTimeout(deliveryTimer); result = null; board?.classList.remove('build-crossing', 'build-settling', 'build-reduced', 'build-short'); }
function change(action) {
  const before = state.get().current, after = state.apply(action).current;
  if (JSON.stringify(before) !== JSON.stringify(after)) { stopTest(); restoreStatus(); }
  paint();
}
function xAt(clientX) { const r = board.getBoundingClientRect(); return Math.max(2, Math.min(98, (clientX - r.left - board.clientLeft) / board.clientWidth * 100)); }
function preview() {
  board.querySelector('.build-placement')?.remove();
  if (!selected) return;
  const ghost = document.createElement('div'); ghost.className = `build-placement ${selected === 'support' ? 'build-support' : 'build-plank'}`;
  ghost.style.left = '50%'; ghost.style.width = selected === 'support' ? '5%' : `${BUILD_PLANKS.find(p => p.id === selected).length}%`; board.append(ghost);
}
function startDrag(event, source, part = null) {
  if (!pointerGate.owns(event)) return;
  drag = { pointer: event.pointerId, source, part, startX: event.clientX, startY: event.clientY, moved: false, x: null };
  try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* pointer already canceled by the OS */ }
}
function cancelDrag() {
  if (!drag) return;
  if (drag.part) {
    const original = [...state.get().current.planks, ...state.get().current.supports].find(p => p.id === drag.part);
    const piece = board?.querySelector(`[data-part="${drag.part}"]`);
    if (piece && original) piece.style.left = `${original.x}%`;
  } else { selected = null; board?.querySelector('.build-placement')?.remove(); }
  drag = null;
}
function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8 && !drag.moved) return;
  drag.moved = true; drag.x = xAt(event.clientX);
  const piece = drag.part && board.querySelector(`[data-part="${drag.part}"]`);
  if (piece) piece.style.left = `${drag.x}%`;
  else { selected = drag.source; preview(); const ghost = board.querySelector('.build-placement'); if (ghost) ghost.style.left = `${drag.x}%`; }
}
function endDrag(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const current = drag; drag = null;
  pointerGate.finish(event, performance.now(), current.moved);
  if (!current.moved) return;
  event.preventDefault();
  const rect = board.getBoundingClientRect();
  if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
    selected = null; selectedPart = current.part;
    change(current.part ? { type: 'move', id: current.part, x: current.x } : { type: 'add', size: current.source, x: current.x });
  } else paint();
}
function paint() {
  if (!alive) return;
  const snapshot = state.get(), build = snapshot.current, banks = buildBanks(build);
  board.innerHTML = `<div class="build-water" style="left:${banks.left}%;width:${banks.width}%" aria-hidden="true"></div><div class="build-bank build-bank-left" style="width:${banks.left}%" aria-hidden="true"></div><div class="build-bank build-bank-right" style="width:${100 - banks.right}%" aria-hidden="true"></div><div class="build-carrier${build.delivered ? ' has-arrived' : ''}"><img class="build-caterpillar" src="${buildCrosserArt()}" alt="${build.delivered ? 'The caterpillar delivered your picture' : 'The caterpillar waits safely on the bank'}"></div><span class="build-destination" aria-hidden="true">☀</span><div class="build-help-sequence" role="img" aria-label="Choose a plank, tap the stream to place it, then let the caterpillar try it"><span class="build-help-plank"></span><svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="16" r="12" fill="#b6e2ed"/><path d="M24 39V17a6 6 0 0 1 12 0v12l8-2q6 1 5 8l-5 16H27L14 38q-4-7 3-9l7 10" fill="#ffe6bb" stroke="#88684c" stroke-width="3"/></svg><img src="${buildCrosserArt()}" alt=""></div>`;
  if (build.invitation === 'delivery' && build.parcel) {
    board.querySelector('.build-destination').remove();
    const frame = document.createElement('div'); frame.className = `build-picture-display${build.delivered ? ' is-delivered' : ''}`;
    frame.setAttribute('aria-label', build.delivered ? 'Your delivered picture on the far bank' : 'A frame waiting for your picture');
    if (build.delivered) { const image = document.createElement('img'); image.src = build.parcel.png; image.alt = 'Your own delivered picture'; frame.append(image); }
    else { const shape = document.createElement('span'); shape.textContent = '▧'; shape.setAttribute('aria-hidden', 'true'); frame.append(shape); }
    board.append(frame);
    if (!build.delivered) {
      const parcel = document.createElement('div'); parcel.className = 'build-carried-picture';
      const image = document.createElement('img'); image.src = build.parcel.png; image.alt = 'Your picture carried by the caterpillar'; parcel.append(image); board.querySelector('.build-carrier').append(parcel);
    }
  }
  for (const [kind, parts] of [['support', build.supports], ['plank', build.planks]]) for (const p of parts) {
    const part = button(`${kind === 'plank' ? BUILD_PLANKS.find(b => b.id === p.size).label : 'Support'}. Select to move or remove.`, '', () => {
      selectedPart = p.id; selected = null; paint(); if (!lastTryStatus) status.textContent = 'Tap a new place to move this piece, or use Remove.';
    });
    part.className = `build-piece build-${kind}${selectedPart === p.id ? ' is-selected' : ''}`;
    part.dataset.part = p.id; part.style.left = `${p.x}%`;
    if (kind === 'plank') { const span = plankBounds(p); part.style.width = `${span.right - span.left}%`; part.innerHTML = '<span aria-hidden="true"></span>'; }
    else part.innerHTML = '<span aria-hidden="true">▥</span>';
    part.addEventListener('pointerdown', e => startDrag(e, p.size || 'support', p.id)); board.append(part);
  }
  preview();
  tray.querySelectorAll('[data-size]').forEach(b => { const on = b.dataset.size === selected; b.classList.toggle('is-selected', on); b.setAttribute('aria-pressed', String(on)); const count = b.dataset.size === 'support' ? build.supports.length : build.planks.length; b.disabled = count >= (b.dataset.size === 'support' ? 3 : 6); });
  controls.querySelector('[data-undo]').disabled = !snapshot.undo.length;
  controls.querySelector('[data-remove]').disabled = !selectedPart;
  controls.querySelector('[data-test]').disabled = !build.planks.length;
  controls.querySelector('[data-save]').disabled = saving || !build.planks.length;
  host.querySelectorAll('[data-invitation]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.invitation === build.invitation)));
  host.querySelector('[data-parcel-clear]').hidden = !build.parcel;
  const source = host.querySelector('[data-parcel-choice]'); source.replaceChildren();
  if (build.parcel) { const image = document.createElement('img'); image.src = build.parcel.png; image.alt = ''; source.append(image); }
  const sourceLabel = document.createElement('span'); sourceLabel.textContent = build.parcel ? 'Change picture' : 'Choose picture'; source.append(sourceLabel);
  host.querySelectorAll('[data-gap]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gap === build.gap)));
  const streamSummary = host.querySelector('[data-stream-summary]'); streamSummary.replaceChildren();
  const gapPicture = document.createElement('span'); gapPicture.className = 'build-gap-picture'; gapPicture.style.setProperty('--width', `${banks.width}%`); streamSummary.append(gapPicture);
  const missionSummary = host.querySelector('[data-mission-summary]'); missionSummary.replaceChildren();
  const summaryArt = document.createElement('img'); summaryArt.src = build.parcel?.png || buildCrosserArt(); summaryArt.alt = ''; missionSummary.append(summaryArt);
  const marker = document.createElement('span'); marker.className = 'build-summary-more'; marker.textContent = '⌄'; missionSummary.append(marker);
  saved.replaceChildren();
  snapshot.saved.forEach((entry, i) => {
    const b = button(`Open saved bridge ${i + 1}`, '', () => { stopTest(); selectedPart = null; state.reopen(i); closeOptions(); paint(); restoreStatus(); });
    b.classList.add('build-saved');
    const mini = document.createElement('span'); mini.className = 'build-mini'; const bounds = buildBanks(entry.build);
    mini.style.setProperty('--gap-left', `${bounds.left}%`); mini.style.setProperty('--gap-width', `${bounds.width}%`);
    entry.build.supports.forEach(p => { const s = document.createElement('i'); s.className = 'mini-support'; s.style.left = `${p.x}%`; mini.append(s); });
    entry.build.planks.forEach(p => { const s = document.createElement('i'); s.style.left = `${p.x}%`; s.style.width = `${BUILD_PLANKS.find(b => b.id === p.size).length}%`; mini.append(s); });
    if (entry.png) { const image = document.createElement('img'); image.src = entry.png; image.alt = ''; b.append(image); }
    else b.append(mini);
    saved.append(b);
  });
  updateGeometry();
}
function test() {
  if (state.get().current.delivered) state.apply({ type: 'retry-delivery' });
  stopTest(); selected = null; selectedPart = null; paint(); result = testBuild(state.get().current);
  showTryStatus(result.message); say(`build_lab_${result.outcome}`);
  board.classList.toggle('build-reduced', reduced());
  if (result.outcome === 'cross') board.classList.add('build-crossing');
  else if (result.outcome === 'settle') {
    board.classList.add('build-settling');
    result.beams.filter(b => !b.stable).forEach(b => board.querySelector(`[data-part="${b.id}"]`)?.classList.add('is-unsteady'));
  } else board.classList.add('build-short');
  const build = state.get().current;
  if (result.outcome === 'cross' && build.invitation === 'delivery' && build.parcel) {
    showTryStatus('Your bridge holds. The caterpillar is carrying your picture to the frame.');
    const visit = mountSerial;
    deliveryTimer = setTimeout(() => {
      if (!alive || visit !== mountSerial || result?.outcome !== 'cross') return;
      state.apply({ type: 'delivered' }); board.classList.remove('build-crossing'); paint();
      showTryStatus(buildLabStatus(state.get().current));
    }, reduced() ? 0 : 3100);
  }
  testTimer = setTimeout(() => { if (alive) { stopTest(); paint(); } }, reduced() ? 6000 : 4500);
}

function closePicturePicker() { pickerSerial++; sourcePicker?.remove(); sourcePicker = null; if (alive) host?.querySelector('[data-parcel-choice]')?.focus({ preventScroll: true }); }
async function choosePicture() {
  closeOptions();
  closePicturePicker(); const ticket = pickerSerial, visit = mountSerial;
  const panel = document.createElement('section'); panel.className = 'build-source-picker'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Choose your picture to deliver');
  const title = document.createElement('h2'); title.textContent = 'Our picture delivery'; panel.append(title);
  const explanation = document.createElement('p'); explanation.textContent = 'Choose one of your own pictures. The caterpillar will carry a copy.'; panel.append(explanation);
  const grid = document.createElement('div'); grid.className = 'build-source-grid'; panel.append(grid);
  const cancel = pictureButton(button('Cancel picture choice and keep your bridge', '', closePicturePicker), 'back', 'Back'); panel.append(cancel);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closePicturePicker(); } });
  host.append(panel); sourcePicker = panel;
  cancel.focus({ preventScroll: true });
  const pictures = await loadBuildParcelPictures();
  if (!alive || visit !== mountSerial || ticket !== pickerSerial || sourcePicker !== panel) return;
  if (!pictures.length) {
    explanation.textContent = 'Make a picture in the Studio, then bring it here. Your bridge will stay safe.';
    grid.append(button('Make a picture in Rainbow Studio', 'Draw a picture', () => { closePicturePicker(); void state.flush().then(() => { if (alive && visit === mountSerial) void router.go('studio'); }); }));
    return;
  }
  pictures.forEach(parcel => {
    const choice = button(`Deliver ${parcel.label}`, '', () => { closePicturePicker(); change({ type: 'parcel', parcel }); });
    const image = document.createElement('img'); image.src = parcel.png; image.alt = parcel.label; choice.append(image); grid.append(choice);
  });
}

function loadImage(src) {
  return new Promise(resolve => {
    if (!src) { resolve(null); return; }
    const image = new Image(); const timeout = setTimeout(() => finish(null), 6000);
    const finish = value => { clearTimeout(timeout); image.onload = image.onerror = null; resolve(value); };
    image.onload = () => finish(image); image.onerror = () => finish(null); image.src = src;
  });
}
// This is the child's actual scale construction, not a substitute bridge illustration.
export function paintBuildThumbnail(ctx, build, parcelImage = null, actorImage = null, width = 720, height = 360) {
  const banks = buildBanks(build), x = n => n / 100 * width, y = n => n / 100 * height;
  ctx.fillStyle = '#a7dce9'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#d1e5b5'; ctx.fillRect(0, 0, x(banks.left), height); ctx.fillRect(x(banks.right), 0, width - x(banks.right), height);
  for (const support of build.supports) { ctx.fillStyle = '#8e8174'; ctx.fillRect(x(support.x - 3), y(61), x(6), y(30)); ctx.strokeStyle = '#655b4e'; ctx.strokeRect(x(support.x - 3), y(61), x(6), y(30)); }
  for (const plank of build.planks) { const bounds = plankBounds(plank); ctx.fillStyle = '#dba66a'; ctx.fillRect(x(bounds.left), y(56), x(bounds.right - bounds.left), y(12)); ctx.strokeStyle = '#846043'; ctx.strokeRect(x(bounds.left), y(56), x(bounds.right - bounds.left), y(12)); }
  const geometry = buildCarrierGeometry(width, height, banks), actorX = build.delivered ? geometry.end : geometry.start;
  if (actorImage) ctx.drawImage(actorImage, actorX, geometry.top, geometry.actorWidth, geometry.actorHeight);
  if (build.invitation === 'delivery') {
    const frame = geometry.frame;
    ctx.fillStyle = '#fffdf5'; ctx.fillRect(frame.left, frame.top, frame.width, frame.height); ctx.strokeStyle = '#956b44'; ctx.strokeRect(frame.left, frame.top, frame.width, frame.height);
    if (parcelImage) {
      const target = build.delivered ? { left: frame.left + 4, top: frame.top + 4, width: frame.width - 8, height: frame.height - 8 }
        : { left: actorX - geometry.actorWidth * .08, top: geometry.top + geometry.actorHeight * .55, width: geometry.actorWidth * .78, height: geometry.actorWidth * .52 };
      const { left, top, width: boxWidth, height: boxHeight } = target;
      const scale = Math.min(boxWidth / parcelImage.width, boxHeight / parcelImage.height);
      const w = parcelImage.width * scale, h = parcelImage.height * scale;
      ctx.fillStyle = '#fffdf5'; ctx.fillRect(left, top, boxWidth, boxHeight);
      ctx.drawImage(parcelImage, left + (boxWidth - w) / 2, top + (boxHeight - h) / 2, w, h);
    }
  }
}
async function keepBuild() {
  if (saving || !state.get().current.planks.length) return;
  const visit = mountSerial, build = state.get().current; saving = true; paint();
  try {
    const [parcelImage, actorImage] = await Promise.all([loadImage(build.parcel?.png), loadImage(buildCrosserArt())]);
    if (!alive || visit !== mountSerial || JSON.stringify(build) !== JSON.stringify(state.get().current)) return;
    if (build.parcel && !parcelImage) { status.textContent = 'Your picture is still safe. Try Keep again when its preview is ready.'; return; }
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 360;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    paintBuildThumbnail(ctx, build, parcelImage, actorImage);
    state.saveBuild(Date.now(), canvas.toDataURL('image/png')); const kept = await state.checkpointBuildLab();
    if (alive && visit === mountSerial) { paint(); status.textContent = kept.persistent ? 'Your bridge and picture are kept in your album. You can build with them again.' : 'Your bridge and picture are here while the app stays open. Ask a grown-up to keep a backup.'; }
  } catch (error) {
    if (alive && visit === mountSerial) status.textContent = 'Your bridge is still here. Keep could not finish. Try Keep again.';
  } finally { if (alive && visit === mountSerial) { saving = false; paint(); } }
}
async function checkpointBuild() {
  if (!alive) { await state.flush(); return true; }
  if (loadFailed || openingBuild) { const token=mountSerial; try { await state.flush(); return alive && token===mountSerial; } catch { if (alive && token===mountSerial) { const text=host?.querySelector('.build-load-recovery')?.querySelector('p'); if (text) text.textContent='Your bridge could not finish saving. Try again before leaving.'; } return false; } }
  if (saving || drag || pointerGate?.active != null) return false;
  const visit = mountSerial;
  saving = true; paint();
  try {
    const result = await state.checkpointBuildLab();
    if (!alive || visit !== mountSerial) return false;
    if (!result.persistent) status.textContent = 'Your bridge is here while the app stays open. Ask a grown-up to keep a backup.';
    return true;
  } catch (error) {
    if (alive && visit === mountSerial) status.textContent = 'Your bridge is still here. Saving could not finish. Try leaving again to retry.';
    return false;
  } finally {
    if (alive && visit === mountSerial) { saving = false; paint(); }
  }
}
export default {
  id: 'build-lab',
  async mount(el, params = {}) {
    enteredFromMap = params.fromMap === true;
    const visit = ++mountSerial;
    host = el; alive = true; loadFailed = false; openingBuild = false; board = null; drag = null; pointerGate = null;
    await this._openSavedBuild(el, params, visit);
  },
  async _openSavedBuild(el, params, visit, retryWrites = false) {
    if (!alive || visit !== mountSerial || openingBuild) return;
    openingBuild = true;
    const retry = el.querySelector('.build-load-retry'); if (retry) retry.disabled = true;
    try {
      if (retryWrites && state.hasBuildWriteFailure()) await state.checkpointBuildLab();
      if (!alive || visit !== mountSerial) return;
      await state.load(); if (!alive || visit !== mountSerial) return;
      if (params.galleryKey) await state.reopenGallery(params.galleryKey, { isCurrent: () => alive && visit === mountSerial });
      else if (params.source) state.reopenSource(params.source);
    } catch {
      if (!alive || visit !== mountSerial) return;
      loadFailed = true; el.replaceChildren();
      const recovery = document.createElement('section'); recovery.className = 'build-load-recovery'; recovery.setAttribute('role', 'status');
      const text = document.createElement('p'); text.textContent = 'Your bridge could not be opened. Try again, or go Home.';
      const retryAction = recoveryAction('replay', 'Try again', () => { void this._openSavedBuild(el, params, visit, true); }); retryAction.classList.add('build-load-retry');
      const home = recoveryAction('home', 'Home', () => { if (alive && visit === mountSerial) void router.go('map'); });
      recovery.append(text, retryAction, home); el.append(recovery); return;
    } finally { if (alive && visit === mountSerial) { openingBuild = false; const button = el.querySelector('.build-load-retry'); if (button) button.disabled = false; } }
    if (!alive || visit !== mountSerial) return;
    loadFailed = false; return this._finishOpeningBuild(el, params, visit);
  },
  async _finishOpeningBuild(el, params, visit) {
    saving = false;
    selected = null; selectedPart = null; drag = null; result = null;
    pointerGate = new BuildPointerGate();
    host.classList.add('build-lab');
    host.innerHTML = '<header class="build-header"><h1>Build Lab</h1><div class="build-navigation"></div></header><div class="build-config-launchers" aria-label="Bridge choices"></div><div class="build-board" aria-label="Bridge building table. Choose a piece, then tap where it goes."></div><p class="build-status" role="status" aria-live="polite">Make a bridge for the caterpillar.</p><div class="build-tray" aria-label="Building pieces"></div><div class="build-controls"></div><section class="build-config-sheet" role="dialog" aria-modal="true" aria-label="Choose your bridge play" hidden><div class="build-options-nav"></div><h2 data-config-section="invitation">Our bridge play</h2><div class="build-invitation-slot"></div><h2 data-config-section="stream">Choose a stream</h2><div class="build-gaps" aria-label="Choose a stream"></div><div class="build-options-extras"></div><h2 data-config-section="saved">Your bridges</h2><div class="build-saves"></div></section>';
    board = host.querySelector('.build-board'); tray = host.querySelector('.build-tray'); status = host.querySelector('.build-status'); controls = host.querySelector('.build-controls'); saved = host.querySelector('.build-saves');
    configSheet = host.querySelector('.build-config-sheet');
    const optionsBack = pictureButton(button('Return to your bridge', '', closeOptions), 'back', 'Back'); optionsBack.dataset.optionsBack = ''; configSheet.querySelector('.build-options-nav').append(optionsBack);
    configSheet.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeOptions(); } });
    const mission = button('Choose a caterpillar crossing or your picture delivery', '', () => openOptions('invitation')); mission.dataset.missionSummary = '';
    const stream = button('Choose the width of the stream', '', () => openOptions('stream')); stream.dataset.streamSummary = '';
    const bridges = pictureButton(button('Open your kept bridges and all building options', '', () => openOptions('saved')), 'save', 'Bridges');
    host.querySelector('.build-config-launchers').append(mission, stream, bridges);
    const album = pictureButton(button('Open all your kept bridges and pictures in the family album', '', () => { void router.go('treehouse', { page: 'drawings' }); }), 'save', 'Album');
    configSheet.querySelector('.build-options-extras').append(album);
    const invitations = document.createElement('div'); invitations.className = 'build-invitations'; invitations.setAttribute('aria-label', 'Choose a bridge invitation');
    const crossing = button('A bridge for the caterpillar. Free building.', '', () => { change({ type: 'invitation', invitation: 'crossing' }); closeOptions(); }); crossing.dataset.invitation = 'crossing'; crossing.innerHTML = `<img src="${buildCrosserArt()}" alt=""><span>A bridge to cross</span>`;
    const delivery = button('Our picture delivery', '', () => { if (state.get().current.parcel) { change({ type: 'invitation', invitation: 'delivery' }); closeOptions(); } else void choosePicture(); }); delivery.dataset.invitation = 'delivery'; delivery.innerHTML = `<img src="${buildCrosserArt()}" alt=""><span class="build-invitation-parcel" aria-hidden="true">▧</span><span>Our picture delivery</span>`;
    const parcel = button('Choose or change your picture parcel', '', () => { void choosePicture(); }); parcel.dataset.parcelChoice = '';
    const clearParcel = pictureButton(button('Remove the picture parcel. Your original picture stays safe.', '', () => change({ type: 'remove-parcel' })), 'remove', 'Picture'); clearParcel.dataset.parcelClear = '';
    invitations.append(crossing, delivery, parcel, clearParcel); host.querySelector('.build-invitation-slot').append(invitations);
    mute = muteButton(); host.querySelector('.build-navigation').append(homeButton(), mute, pictureButton(button(enteredFromMap ? 'Back to the valley' : 'Return to Explore', '', () => { void router.go(buildBackDestination(enteredFromMap)); }), 'back', enteredFromMap ? 'Back' : 'Explore'));
    BUILD_GAPS.forEach(g => { const b = button(g.label, '', () => { selectedPart = null; change({ type: 'gap', gap: g.id }); closeOptions(); }); b.dataset.gap = g.id; b.innerHTML = `<span class="build-gap-picture" style="--width:${g.width}%" aria-hidden="true"></span><span>${g.label}</span>`; host.querySelector('.build-gaps').append(b); });
    [...BUILD_PLANKS, { id: 'support', label: 'Support' }].forEach(p => {
      const b = button(p.label, '', () => { selectedPart = null; selected = p.id; paint(); if (!lastTryStatus) status.textContent = `Tap the stream to place a ${p.label.toLowerCase()}.`; });
      b.dataset.size = p.id; b.classList.add('build-choice'); b.innerHTML = `<span class="build-choice-picture ${p.id === 'support' ? 'support-choice' : ''}" style="width:${p.length ? p.length / 60 * 100 : 30}%" aria-hidden="true"></span><span>${p.label}</span>`;
      b.addEventListener('pointerdown', e => startDrag(e, p.id)); tray.append(b);
    });
    const testButton = button('Let the caterpillar test your bridge', '', test); testButton.dataset.test = '';
    testButton.innerHTML = `<img class="build-test-caterpillar" src="${buildCrosserArt()}" alt=""><svg class="build-control-icon" viewBox="0 0 54 54" aria-hidden="true"><path d="m16 10 28 17-28 17Z" fill="currentColor"/></svg><span>Try</span>`;
    const undo = pictureButton(button('Undo last change', '', () => { stopTest(); selectedPart = null; state.undo(); paint(); restoreStatus(); }), 'undo', 'Undo'); undo.dataset.undo = '';
    const remove = pictureButton(button('Remove selected piece', '', () => { change({ type: 'remove', id: selectedPart }); selectedPart = null; paint(); }), 'remove', 'Remove'); remove.dataset.remove = '';
    help = pictureButton(button('Show and hear help', '', () => { status.textContent = 'Choose a plank, then tap the stream. Add supports underneath long spans. Move a piece by tapping it, then its new place. Try the caterpillar when you are ready.'; say('build_lab_help'); if (!selected && !selectedPart) selected = 'long'; paint(); board.classList.add('build-show-help'); clearTimeout(helpTimer); helpTimer = setTimeout(() => { if (alive && visit === mountSerial) board?.classList.remove('build-show-help'); }, 5000); }), 'help', 'Help');
    const keep = pictureButton(button('Keep an editable bridge and its actual picture in your album', '', () => { void keepBuild(); }), 'save', 'Keep'); keep.dataset.save = '';
    const clear = pictureButton(button('Clear this bridge. Undo can bring it back.', '', () => { selectedPart = null; change({ type: 'reset' }); }), 'clear', 'Clear');
    for (const [name, control] of [['try', testButton], ['undo', undo], ['keep', keep], ['remove', remove], ['clear', clear], ['help', help]]) {
      control.dataset.control = name; controls.append(control);
      if (['remove', 'clear', 'help'].includes(name)) {
        control.dataset.controlExtra = '';
        const extra = pictureButton(button(control.getAttribute('aria-label'), '', () => { closeOptions(); control.click(); }), name, name[0].toUpperCase() + name.slice(1)); extra.dataset.extraControl = name; configSheet.querySelector('.build-options-extras').append(extra);
      }
    }
    board.addEventListener('click', event => {
      if (!alive || visit !== mountSerial || saving || pointerGate.active !== null) return;
      if (event.target.closest('.build-piece')) return;
      if (selectedPart) { change({ type: 'move', id: selectedPart, x: xAt(event.clientX) }); selectedPart = null; paint(); }
      else if (selected) { const size = selected; selected = null; change({ type: 'add', size, x: xAt(event.clientX) }); }
    });
    board.tabIndex = 0;
    board.addEventListener('keydown', event => {
      if (!alive || visit !== mountSerial || saving || pointerGate.active !== null) return;
      if (event.target !== board) return;
      if (selectedPart && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault(); const part = [...state.get().current.planks, ...state.get().current.supports].find(p => p.id === selectedPart);
        if (part) change({ type: 'move', id: part.id, x: part.x + (event.key === 'ArrowLeft' ? -3 : 3) });
      } else if (selected && ['Enter', ' '].includes(event.key)) { event.preventDefault(); const size = selected; selected = null; change({ type: 'add', size, x: 50 }); }
    });
    const interactive = event => event.target?.closest?.('.build-board,.build-tray,.build-controls,.build-config-launchers,.build-config-sheet,.build-source-picker,.build-navigation');
    pointerDownListener = event => {
      if (!interactive(event)) return;
      if (saving && !event.target?.closest?.('.mute')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      const decision = pointerGate.down(event, performance.now(), !settings.get().penOnly);
      if (decision.takeover) cancelDrag();
      if (!decision.accepted) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    pointerEndListener = event => { endDrag(event); pointerGate.finish(event, performance.now()); };
    pointerCancelListener = event => { if (pointerGate.finish(event, performance.now(), true)) { cancelDrag(); paint(); } };
    lostCaptureListener = event => { if (pointerGate.lostCapture(event, performance.now())) { cancelDrag(); paint(); } };
    visibilityListener = () => { if (document.hidden || !document.hasFocus()) { cancelDrag(); pointerGate.reset(); paint(); void state.flush().catch(() => {}); } };
    clickListener = event => {
      if (interactive(event) && !pointerGate.allowClick(event, performance.now())) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    host.addEventListener('pointerdown', pointerDownListener, true); host.addEventListener('pointermove', moveDrag);
    host.addEventListener('lostpointercapture', lostCaptureListener);
    host.addEventListener('click', clickListener, true);
    window.addEventListener('pointerup', pointerEndListener); window.addEventListener('pointercancel', pointerCancelListener);
    window.addEventListener('blur', visibilityListener); document.addEventListener('visibilitychange', visibilityListener);
    offSettings = bus.on('settings:changed', () => { if (reduced()) { idleMotion?.cancel?.(); idleMotion = null; if (result) board.classList.add('build-reduced'); } });
    resizeListener = updateViewport; window.addEventListener('resize', resizeListener);
    if (typeof ResizeObserver !== 'undefined') { viewportObserver = new ResizeObserver(updateViewport); viewportObserver.observe(host); resizeObserver = new ResizeObserver(updateGeometry); resizeObserver.observe(board); }
    updateViewport();
    paint();
    restoreStatus();
    let idleVoiceSpoken = false;
    idleHelp?.(); idleHelp = installIdleHelp(host, {
      active: () => alive && visit === mountSerial && router.current() === 'build-lab' && !router.isMoving() && !session.isBreakLocked() && !saving && !drag && pointerGate?.active == null && !sourcePicker && configSheet.hidden && !selectedPart && !result && !lastTryStatus && !speech.isSpeaking() && !state.isBuildDelivered(),
      demonstrate: () => {
        const placing = !!selected, hasParts = state.hasBuildParts();
        const target = placing ? board : hasParts ? controls.querySelector('[data-test]') : tray.querySelector('[data-size="long"]'); if (!target || target.disabled) return null;
        const cueClass = placing ? 'build-idle-board' : 'build-idle-target'; target.classList.add(cueClass);
        const motion = !placing && !reduced() && target.animate?.([{translate:'0 0'},{translate:'0 -6px'},{translate:'0 0'}], {duration:900,iterations:1,easing:'ease-in-out'});
        idleMotion = motion || null; motion?.finished?.catch?.(() => {});
        // The existing full help begins with choosing a plank; do not say that after one is already selected.
        let voiceOwned = !placing && !hasParts && !idleVoiceSpoken && !settings.get().muted && speech.isUnlocked();
        if (voiceOwned) idleVoiceSpoken = true;
        if (voiceOwned) Promise.resolve(speech.say('build_lab_help')).then(() => { voiceOwned = false; }, () => { voiceOwned = false; });
        let visualDone = false;
        const clearVisual = () => { if (visualDone) return; visualDone = true; motion?.cancel?.(); if (idleMotion === motion) idleMotion = null; target.classList.remove(cueClass); };
        const visualTimer = setTimeout(clearVisual, 2400);
        return () => { clearTimeout(visualTimer); clearVisual(); if (voiceOwned && speech.isSpeaking()) speech.cancel(); voiceOwned = false; };
      },
    });
  },
  breakBusy() { return saving || !!drag || pointerGate?.active != null; },
  onBack() { if (saving || pointerGate?.active != null) return; if (sourcePicker) closePicturePicker(); else if (configSheet && !configSheet.hidden) closeOptions(); else void router.go(buildBackDestination(enteredFromMap)); },
  beforeLeave: checkpointBuild,
  beforeBreak: checkpointBuild,
  unmount() {
    idleHelp?.(); idleHelp = null; idleMotion?.cancel?.(); idleMotion = null;
    alive = false; loadFailed = false; openingBuild = false; mountSerial++; closePicturePicker(); stopTest(); clearTimeout(helpTimer); cancelDrag(); pointerGate?.reset();
    host?.removeEventListener('pointerdown', pointerDownListener, true); host?.removeEventListener('pointermove', moveDrag);
    host?.removeEventListener('lostpointercapture', lostCaptureListener); host?.removeEventListener('click', clickListener, true);
    window.removeEventListener('pointerup', pointerEndListener); window.removeEventListener('pointercancel', pointerCancelListener);
    window.removeEventListener('blur', visibilityListener); document.removeEventListener('visibilitychange', visibilityListener);
    resizeObserver?.disconnect(); viewportObserver?.disconnect(); window.removeEventListener('resize', resizeListener); configSheet = null;
    mute?.destroy?.(); offSettings?.(); speech.cancel?.(); void state.flush().catch(() => {}); host = null; board = null;
  },
};
