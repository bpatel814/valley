import router, { iconSVG, muteButton, tapify, recoveryAction } from '../router.js';
import settings from '../../state/settings.js';
import resume from '../../state/resume.js';
import { savedWorld } from '../../state/saved-world.js';
import picnicState, { picnicSavedPage } from '../../state/picnic.js';
import { PICNIC_GUESTS, normalizeCafeMessage, picnicOutcome, picnicLivePieces, picnicEnjoyedPieces, picnicActionNotice, picnicCutIds } from '../../data/picnic.js';
import { isCreationRow } from '../../state/creation-frame.js';
import gallery from '../../parent/gallery.js';
import { shouldAccept } from '../../engine/pen.js';
import speech from '../../audio/speech.js';
import sfx from '../../audio/sfx.js';
import bus from '../bus.js';
import db from '../../state/db.js';
import LivingGuidance from '../living-guidance.js';
import { GARDEN_CAFE_PHRASES } from '../../data/garden-cafe-phrases.js';
import session from '../../state/session.js';
import { checkpointLivingScene } from './music-band.js';
import { normalizeToyOuting } from '../../data/toy-outing.js';
import { renderGardenCafe, CAFE_ART, CAFE_PHASES, CafePerformance, cafeInstrumentPicture, cafeInstrumentLabel, showCafeObjectInvitation, mountCafePerformers } from '../garden-cafe.js';
import { pictureView, inspectPictureView } from '../picture-view.js';

export const PICNIC_OUTING_TABLE = Object.freeze({ width: 1527, height: 1030, foot: 870, top: 192 });
export function picnicOutingGeometry(width, height, placement = 'table') {
  const w = Math.max(1, width || 1), h = Math.max(1, height || 1), tableWidth = Math.min(w * .96, h * 1.3), scale = tableWidth / 1527;
  const left = (w - tableWidth) / 2;
  const portraitHeight = Math.min(180, h * .37);
  const familyTop = 274 * scale - portraitHeight * .66 - 8;
  const toyWidth = placement === 'table' ? Math.max(64, Math.min(165, tableWidth * .32)) : Math.max(48, Math.min(104, tableWidth * .25));
  const toyAnchor = toyWidth * (.8 + (607 - 233) / 2172);
  const toyHeight = toyWidth * (.8 + (724 - 233) / 2172);
  const toyTop = (placement === 'table' ? 445 : 635) * scale - toyAnchor;
  // Center the complete family/table/paper group, including native transparent
  // padding. Grounding only the opaque table feet left a large empty sky and
  // clipped the table's lower source canvas in a short landscape scene.
  const groupTop = Math.min(0, familyTop, toyTop);
  const groupBottom = Math.max(1030 * scale, familyTop + portraitHeight, toyTop + toyHeight);
  const top = (h - (groupBottom - groupTop)) / 2 - groupTop;
  const point = (x, y) => ({ x: left + x * scale, y: top + y * scale });
  const portraitTop = top + familyTop;
  const toyFoot = point(placement === 'left' ? 320 : placement === 'right' ? 1207 : 763, placement === 'table' ? 445 : 635);
  return { width: w, height: h, table: { left, top, width: tableWidth, height: 1030 * scale }, point, portraitHeight, portraitTop,
    portraitWidth: Math.max(44, portraitHeight * .7), plateSize: Math.max(44, Math.min(96, tableWidth * .19)),
    toy: { left: toyFoot.x - toyWidth / 2, top: toyFoot.y - toyAnchor, width: toyWidth, height: toyHeight }, target: 44 };
}
export function picnicSharingAction(scene, selected, place) {
  if (selected === 'outing' && scene.outing && ['table', 'left', 'right'].includes(place)) return { type: 'outing-place', placement: place };
  const foodPlaces = ['left', 'right', ...(scene.cafe?.visitor ? ['visitor'] : [])];
  if (selected === 'bowl' && foodPlaces.includes(place)) return { type: 'serve-bowl', place };
  const piece = scene.pieces.find(piece => piece.id === selected && !piece.eaten);
  return piece && ['board', 'bowl', ...foodPlaces].includes(place) ? { type: 'move', id: piece.id, place } : null;
}
export function picnicOutingPlateLayout(geometry, point, count) {
  // A real pile can overlap; shrinking every ingredient into a fixed cell
  // makes it disappear. Keep the reviewed plate and tabletop contact exact.
  const size = geometry.plateSize, inset = size * .07, inner = size - inset * 2;
  const fruitSize = inner * (count === 1 ? 1 : .76), radius = (inner - fruitSize) / 2;
  const portions = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
    const x = radius + Math.cos(angle) * radius, y = radius + Math.sin(angle) * radius;
    return { left: x, top: y, depth: Math.round(y * 1000) + index };
  });
  return { left: point.x - size / 2, top: point.y - size / 2, size, inset, fruitSize, portions };
}
function outingFigure(outing) {
  const figure = document.createElement('span'); figure.className = 'picnic-outing-toy';
  figure.append(img('assets/art/final/river-run/float-v1.png', 'picnic-outing-float'));
  const paper = document.createElement('span'); paper.className = 'picnic-outing-paper';
  paper.append(pictureView(outing.png, outing.river.pictureView, '', outing.river.pictureView
    ? 'Your chosen view of your exact picture on its own river float' : 'Your exact whole picture on its own river float'));
  figure.append(paper); return figure;
}

const GUESTS = {
  rayna: ['Rayna', 'family_child1_idle'], veer: ['Veer', 'veer_idle'], ishan: ['Ishan', 'family_ishan_idle'],
  mama: ['Mama', 'family_adult1_idle'], daddy: ['Daddy', 'family_adult2_idle'], ba: ['Ba', 'family_grandma_idle'],
  dada: ['Dada', 'family_grandpa_idle'], pip: ['Pip', 'pip_idle'],
};
export function picnicPlayPrompt(scene, selected = '', feedback = '', outing = false) {
  const names = scene.guests.map(guest => GUESTS[guest][0]);
  if (outing && selected === 'outing' && scene.outing) return `Tap ${names.join(' or ')}, or the table, for your toy.`;
  if (selected === 'bowl' || scene.pieces.some(piece => piece.id === selected && !piece.eaten)) return `Tap ${names.join(' or ')} to share.`;
  if (feedback) return feedback;
  const ready = ['left', 'right'].filter(place => picnicLivePieces(scene, place).length);
  if (ready.length) return `Tap ${ready.map(place => names[place === 'left' ? 0 : 1]).join(' or ')} to enjoy the fruit.`;
  if (outing) return 'Choose fruit from the basket, then tap a friend to share. Or share your toy.';
  return 'Pick a fruit, then tap a friend to share.';
}
export function picnicPlayResult(scene, action, outing = false) {
  const name = place => GUESTS[scene.guests[place === 'left' ? 0 : 1]]?.[0];
  if (outing && action.type === 'enjoy') return `${name(action.place)} enjoyed the fruit! ${picnicPlayPrompt(scene, '', '', true)}`;
  if (outing && action.type === 'outing-place') return `${action.placement === 'table' ? 'Your toy is on the table.' : `Your toy is with ${name(action.placement)}.`} ${picnicPlayPrompt(scene, '', '', true)}`;
  if (action.type === 'enjoy') return `${name(action.place)} enjoyed the fruit! Pick more to share.`;
  if (['move', 'serve-bowl'].includes(action.type) && ['left', 'right'].includes(action.place)) return `${name(action.place)} has fruit! Tap ${name(action.place)} to enjoy it.`;
  if (action.type === 'cut') return 'Two halves! Choose a friend to share with.';
  if (action.type === 'mix') return 'Fruit salad! Tap the bowl, then a friend to serve.';
  if (action.type === 'move' && action.place === 'bowl') return 'Fruit in the bowl! Add more, or tap the bowl to share.';
  return '';
}
const fruitPath = kind => kind === 'strawberry' ? 'assets/art/final/props/strawberry.webp' : 'assets/art/final/props/picnic-apple-v1.png';
export function picnicViewportLayout(width, height) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const landscape = w > h && h < 620, padding = h < 600 ? 6 : 8, gap = h < 600 ? 4 : 6;
  const playHeight = h - padding * 2 - 44 - 44 - 24 - gap * 3;
  const familyHeight = landscape ? playHeight : Math.min(310, Math.max(210, playHeight * .57));
  const tableHeight = landscape ? playHeight : playHeight - familyHeight - gap;
  const compactFriends = landscape && familyHeight < 174;
  const friendWidth = landscape ? w < 700 ? compactFriends ? 140 : 136 : Math.max(136, Math.min(190, (w - padding * 2) * .25)) : (w - padding * 2 - gap) / 2;
  const friendHeader = 24;
  const desiredPortrait = Math.max(56, Math.min(170, familyHeight * .64));
  // Existing family art keeps its face in the upper two thirds. Reserve that
  // actual portrait region above the plate, including a small visible gap.
  const plateSize = compactFriends ? 90 : Math.max(90, Math.min(172, friendWidth - 4, familyHeight - 46 - desiredPortrait * .66));
  const bowlSize = Math.min(178, Math.max(72, tableHeight - 62));
  const portraitHeight = compactFriends ? desiredPortrait : Math.min(desiredPortrait, Math.max(56, (familyHeight - plateSize - 46) / .66));
  return { landscape, compactFriends, padding, gap, playHeight, familyHeight, tableHeight, friendWidth, friendHeader,
    plateSize, bowlSize, bowlFruitSize: Math.max(16, Math.min(40, Math.floor(bowlSize * .225))),
    plateFruitSize: Math.max(26, Math.min(38, Math.floor(plateSize * .24))),
    portraitWidth: compactFriends ? friendWidth - plateSize - 2 : Math.max(44, Math.min(friendWidth - 36, portraitHeight * .8)), portraitHeight,
    plateColumns: plateSize >= 136 ? 3 : 2, target: 44 };
}
function img(src, cls = '') { const i = document.createElement('img'); i.src = src; i.alt = ''; i.draggable = false; i.className = cls; return i; }
function button(label, content, action, cls = '') {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'picnic-button tap ' + cls;
  b.setAttribute('aria-label', label);
  if (typeof content === 'string') b.innerHTML = content; else if (content) b.append(content);
  if (action) tapify(b, action); return b;
}
function portrait(guest, pose = 'idle') { return img('assets/art/final/characters/' + (guest === 'veer' && pose === 'happy' ? 'veer_happy' : GUESTS[guest][1]) + '.webp', 'picnic-portrait'); }
function cafeTool(label, art, caption, action) {
  const choice = button(label,art,action,'picnic-tool-choice');
  const text = document.createElement('span'); text.textContent = caption; choice.append(text); return choice;
}
function fruitPicture(piece) {
  const wrap = document.createElement('span'); wrap.className = 'picnic-fruit-picture' + (piece.units === 1 ? ' is-half' : '') + (piece.salad ? ' is-salad' : '');
  if (piece.salad) {
    // Each original half-unit is still represented after preparation, including on a plate.
    for (let unit = 0; unit < piece.units; unit++) { const bite = fruitPicture({ ...piece, units: 1, salad: false }); bite.classList.add('picnic-salad-bite'); wrap.append(bite); }
    return wrap;
  }
  if (piece.units === 1) {
    // An honest cross-section stays understandable if optional finished half art is absent.
    const fallback = document.createElement('span'); fallback.className = 'picnic-half-fallback'; fallback.innerHTML = piece.kind === 'apple'
      ? '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 14C5 12 7 91 50 89Z" fill="#c55b53" stroke="#7f493b" stroke-width="5"/><path d="M50 20C17 18 18 83 50 83Z" fill="#fff0c6"/><path d="M50 13v77" stroke="#996445" stroke-width="4"/><ellipse cx="41" cy="48" rx="4" ry="7" fill="#775337"/><path d="m49 14 4-9" stroke="#5c7443" stroke-width="5"/></svg>'
      : '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M52 17C5 8 9 49 52 89Z" fill="#cf5964" stroke="#934149" stroke-width="5"/><path d="M52 24C20 15 20 49 52 80Z" fill="#ffe3cb"/><path d="M52 18v70" stroke="#ad4a53" stroke-width="4"/><path d="m24 16 8-10 10 9 12-9-2 18" fill="#79a05a" stroke="#527445" stroke-width="4"/></svg>';
    const half = img(`assets/art/final/props/picnic-${piece.kind}-half-v1.png`);
    half.addEventListener('error', () => { half.hidden = true; fallback.hidden = false; }); half.addEventListener('load', () => { fallback.hidden = true; }); wrap.append(half, fallback);
  } else wrap.append(img(fruitPath(piece.kind)));
  return wrap;
}
function portionStrip(pieces) {
  const strip = document.createElement('span'); strip.className = 'picnic-portions'; strip.setAttribute('aria-label', `${pieces.filter(p => p.units === 2).length} whole fruit and ${pieces.filter(p => p.units === 1).length} half fruit`);
  for (const piece of pieces) { const dot = document.createElement('i'); dot.className = piece.units === 1 ? 'is-half' : ''; strip.append(dot); } return strip;
}
function emptyPlaces(container, count) { for (let i = 0; i < count; i++) { const slot = document.createElement('span'); slot.className = 'picnic-empty-place'; slot.setAttribute('aria-hidden', 'true'); container.append(slot); } }

export default {
  id: 'picnic',
  async mount(host, params = {}) {
    this.enteredFromMap = params.fromMap === true;
    this.host = host; this.alive = true; this.visit = {}; this.selected = ''; this.drag = null; this.lastPenAt = -Infinity;
    this.content = this.status = this.overlay = null; this.lastViewport = null; this.cafeGuidance = null;
    this.playCue = ''; this.playFeedback = '';
    this.suppressClickUntil = 0; this.saving = false; this.clothBusy = false; this.checkpointing = false; this.checkpointPromise = null; this.rejected = new Map(); this.rejectedClicks = new Map();
    this.initialOpenPending = true; this.openingPicnic = false; this.root = null; this.cafePerformance = null;
    const visit = this.visit; await this._openSavedPicnic(host, params, visit);
  },
  async _openSavedPicnic(host, params, visit, retryWrites = false) {
    if (!this.alive || visit !== this.visit || this.openingPicnic) return;
    this.openingPicnic = true; const oldRetry = host.querySelector('.picnic-load-retry'); if (oldRetry) oldRetry.disabled = true;
    try {
      if (retryWrites && picnicState.lastIssue() === 'write') await picnicState.retry();
      if (!this.alive || visit !== this.visit) return;
      await picnicState.load();
    } catch {
      if (!this.alive || visit !== this.visit) return;
      host.replaceChildren(); const recovery = document.createElement('section'); recovery.className = 'picnic-load-recovery'; recovery.setAttribute('role','status');
      const text = document.createElement('p'); text.textContent = 'Your picnic could not be opened. Try again, or go Home.';
      const retry = recoveryAction('replay','Try again',()=>{ void this._openSavedPicnic(host,params,visit,true); }); retry.classList.add('picnic-load-retry');
      const home = recoveryAction('home','Home',()=>{ if (this.alive && this.visit===visit) void router.go('map'); });
      recovery.append(text,retry,home); host.append(recovery); return;
    } finally { if (this.visit === visit) { this.openingPicnic = false; const retry=host.querySelector('.picnic-load-retry'); if (retry) retry.disabled=false; } }
    if (!this.alive || visit !== this.visit) return;
    return this._finishOpeningPicnic(host,params,visit);
  },
  async _finishOpeningPicnic(host, params, visit) {
    this.initialOpenPending = false; host.replaceChildren();
    if (params.cafe === true) picnicState.change({ type: 'cafe-open' });
    this.playCafe = params.cafe === true || (!!picnicState.get().draft.cafe && !picnicState.get().draft.outing);
    this.cafeArranging = false; this.cafeMove = null; this.cafePerformance = null; this.cafeInviteSeen = new Set();
    this.playOuting = !!picnicState.get().draft.outing; this.pendingOuting = null; this.pendingAccepted = false; this.arrivalSaving = false; this.arrivalIssue = null;
    if (params.outing) { try { this.pendingOuting = normalizeToyOuting(params.outing); } catch (error) { this.arrivalIssue = error.code || 'outing-invalid'; } }
    this.pendingCafeMessage = null; this.messageArrivalIssue = null;
    if (params.messageForCafe) { try { this.pendingCafeMessage = normalizeCafeMessage(params.messageForCafe); } catch (error) { this.messageArrivalIssue = error.code || 'message-day-invalid'; } }
    if (params.invitation) picnicState.change({ type: 'invitation', invitation: params.invitation });
    const root = document.createElement('section'); root.className = 'picnic-screen'; root.setAttribute('aria-label', 'Our family picnic');
    this.root = root; host.append(root);
    this.updateViewport = () => {
      if (!this.alive || !this.root) return;
      const width = host.clientWidth, height = host.clientHeight;
      if (this.lastViewport?.width === width && this.lastViewport?.height === height) return;
      this.lastViewport = { width, height };
      const layout = picnicViewportLayout(width, height);
      root.dataset.layout = layout.landscape ? 'landscape' : 'portrait';
      root.dataset.compactFriends = String(layout.compactFriends);
      for (const [name, value] of Object.entries(layout)) if (typeof value === 'number') root.style.setProperty('--picnic-' + name.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), name === 'plateColumns' ? String(value) : value + 'px');
      if ((this.playOuting || this.playCafe) && this.content?.parentElement === root) { this.stopCafe(); this.cafeGuidance?.interrupt(); this.finishPointer(); this.paint(); }
    };
    this.updateViewport(); this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.updateViewport); this.resizeObserver?.observe(host);
    window.addEventListener('resize', this.updateViewport);
    const nav = document.createElement('header'); nav.className = 'picnic-nav';
    nav.append(button(this.enteredFromMap ? 'Back to the valley' : 'Back to Together', iconSVG('back'), () => this.leave()));
    nav.append(button('Return Home with our current picnic', iconSVG('home'), () => this.leave('map')));
    nav.append(button('Show me how to prepare and share', iconSVG('help'), () => this.help()));
    this.mute = muteButton(); nav.append(this.mute); root.append(nav);
    this.content = document.createElement('main'); this.content.className = 'picnic-play'; root.append(this.content);
    this.status = document.createElement('div'); this.status.className = 'picnic-status'; this.status.setAttribute('role', 'status'); root.append(this.status);
    root.addEventListener('pointerdown', event => { this.clearFruitHint(); this.pointerDown(event); });
    root.addEventListener('pointermove', event => this.pointerMove(event));
    root.addEventListener('pointerup', event => this.pointerUp(event));
    const cancelled = event => { this.rejected.delete(event.pointerId); if (this.drag?.pointer === event.pointerId) this.cancelDrag(); };
    root.addEventListener('pointercancel', cancelled);
    root.addEventListener('lostpointercapture', cancelled);
    root.addEventListener('click', event => {
      if (this.checkpointing || this.arrivalSaving) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      const now = performance.now();
      for (const [id, blocked] of this.rejectedClicks) if (blocked.until < now) this.rejectedClicks.delete(id);
      const rejected = this.rejectedClicks.has(event.pointerId) ||
        (event.detail > 0 && [...this.rejectedClicks.values()].some(b => b.target === event.target?.closest('button')));
      if (rejected || now < this.suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    root.addEventListener('keydown', event => {
      this.clearFruitHint();
      if (this.checkpointing || this.arrivalSaving) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    this.onHide = () => { this.clearFruitHint(); this.cafePictureAbort?.abort(); this.cafePictureAbort = null; this.stopCafe(); this.cafeGuidance?.interrupt(); speech.cancel(); this.cancelDrag(); void picnicState.flush().catch(() => {}); };
    this.offCafeMute = bus.on('mute:changed', () => this.stopCafe());
    this.offCafeBreak = bus.on('session:end', () => this.onHide());
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('blur', this.onHide);
    this.paint();
    if (this.pendingCafeMessage) this.chooseCafeMessageArrival();
    else if (this.messageArrivalIssue) this.status.textContent = 'This message could not join. Your current gathering and earlier papers are still here.';
    else if (this.pendingOuting) this.chooseOutingArrival();
    else if (this.arrivalIssue) this.status.textContent = 'This river toy could not join. Your current meal and earlier picnics are still here.';
    else if (!this.playOuting && !this.playCafe) speech.say(picnicState.get().draft.guests.join(',') === 'veer,ishan' ? 'picnic_invite' : 'picnic_help');
  },
  paint() {
    if (!this.alive) return;
    this.clearFruitHint();
    const actionView = this.actionView = (this.actionView || 0) + 1;
    const current = () => this.alive && this.actionView === actionView && !this.saving && !this.checkpointing && !this.drag;
    const state = picnicState.get(), scene = state.draft;
    this.root.classList.toggle('picnic-cafe-play', !!scene.cafe && this.playCafe);
    this.root.classList.toggle('picnic-outing-play', !this.playCafe && !!scene.outing && this.playOuting);
    if (scene.cafe && this.playCafe) { this.paintCafe(state, current); return; }
    if (scene.outing && this.playOuting) { this.paintOuting(state, current); return; }
    const selectedPiece = scene.pieces.find(p => p.id === this.selected && !p.eaten), bowlPieces = picnicLivePieces(scene, 'bowl');
    if (!selectedPiece && (this.selected !== 'bowl' || !bowlPieces.length)) this.selected = '';
    this.content.replaceChildren();
    const cloth = state.assets.find(a => a.id === scene.cloth);
    if (cloth) this.content.append(img(cloth.png, 'picnic-own-cloth'));
    const family = document.createElement('div'); family.className = 'picnic-family';
    for (const [index, place] of ['left', 'right'].entries()) {
      const guest = scene.guests[index], panel = document.createElement('section'); panel.className = 'picnic-person';
      const foodsHere = picnicLivePieces(scene, place), eatenHere = picnicEnjoyedPieces(scene, place, guest);
      panel.classList.toggle('is-sharing-target', !!this.selected);
      panel.classList.toggle('is-ready-to-enjoy', !this.selected && foodsHere.length > 0);
      const recipient = button(this.selected ? 'Give selected food to ' + GUESTS[guest][0] : foodsHere.length ? GUESTS[guest][0] + ' enjoys one piece of food' : 'Invite someone instead of ' + GUESTS[guest][0], portrait(guest), () => {
        if (!current()) return;
        if (this.selected) this.drop(place); else if (foodsHere.length) this.change({ type: 'enjoy', place }, 'picnic_enjoy'); else this.chooseGuest(index);
      }, 'picnic-recipient'); recipient.dataset.drop = place; panel.append(recipient);
      if (eatenHere.length) {
        panel.classList.add('has-enjoyed');
        recipient.classList.add('is-enjoying');
        const held = fruitPicture(eatenHere.at(-1)); held.classList.add('picnic-held-fruit'); recipient.append(held);
        const heart = document.createElement('span'); heart.className = 'picnic-enjoy-heart'; heart.innerHTML = iconSVG('heart'); recipient.append(heart);
      }
      const nameRow = document.createElement('div'); nameRow.className = 'picnic-name-row';
      const label = document.createElement('span'); label.className = 'picnic-name'; label.textContent = GUESTS[guest][0]; nameRow.append(label, button('Invite someone instead of ' + GUESTS[guest][0], iconSVG('art'), () => { if (current()) this.chooseGuest(index); }, 'picnic-change-guest')); panel.append(nameRow);
      const plate = document.createElement('div'); plate.className = 'picnic-plate'; plate.dataset.drop = place;
      plate.append(img('assets/art/final/props/picnic-round-plate-v1.png', 'picnic-plate-art'));
      const target = button(this.selected ? 'Give food to ' + GUESTS[guest][0] : foodsHere.length ? 'Let ' + GUESTS[guest][0] + ' enjoy one piece' : 'Find food to share with ' + GUESTS[guest][0], '', () => {
        if (!current()) return;
        if (this.selected) this.drop(place); else if (foodsHere.length) this.change({ type: 'enjoy', place }, 'picnic_enjoy'); else this.hintFruit();
      }, 'picnic-plate-target');
      target.dataset.drop = place; plate.append(target);
      const foods = document.createElement('div'); foods.className = 'picnic-plate-food';
      for (const piece of foodsHere) foods.append(this.pieceButton(piece));
      emptyPlaces(foods, Math.max(0, 6 - foodsHere.length));
      plate.append(foods); panel.append(plate, portionStrip(foodsHere));
      if (eatenHere.length) {
        const eaten = document.createElement('div'); eaten.className = 'picnic-enjoyed-food'; eaten.setAttribute('aria-label', 'Food ' + GUESTS[guest][0] + ' has enjoyed');
        for (const piece of eatenHere) { const portion = fruitPicture(piece); portion.classList.add('picnic-enjoyed-piece'); eaten.append(portion); } panel.append(eaten);
      }
      family.append(panel);
    }
    this.content.append(family);
    const table = document.createElement('section'); table.className = 'picnic-table'; table.setAttribute('aria-label', 'Prepare food on our picnic cloth');
    if (scene.invitation) {
      const source = scene.invitation;
      const invitation = button('Open our picnic invitation', img(source.png), () => { if (current()) void router.go('picture-post', { source: { ...source, kind: 'picture-post' } }); }, 'picnic-invitation');
      this.invitationButton = invitation;
    } else this.invitationButton = null;
    const board = document.createElement('div'); board.className = 'picnic-board'; board.dataset.drop = 'board';
    const foodTray = document.createElement('div'); foodTray.className = 'picnic-food-tray';
    for (const piece of scene.pieces.filter(p => p.place === 'board' && !p.eaten)) foodTray.append(this.pieceButton(piece));
    board.append(foodTray); table.append(board);
    const preparing = document.createElement('div'); preparing.className = 'picnic-preparing';
    const cut = button('Cut selected whole fruit into two pieces', '<span class="picnic-cut-icon" aria-hidden="true">✂</span>', () => {
      if (!current()) return;
      if (!selectedPiece || selectedPiece.units !== 2) return;
      const id = selectedPiece.id, halves = picnicCutIds(scene, id); if (this.change({ type: 'cut', id }, 'picnic_cut')) { this.selected = halves[0]; this.paint(); }
    }, 'picnic-cut'); cut.hidden = !selectedPiece || selectedPiece.units !== 2; preparing.append(cut);
    const bowl = document.createElement('div'); bowl.className = 'picnic-bowl'; bowl.dataset.drop = 'bowl';
    bowl.append(img('assets/art/final/props/picnic-round-bowl-v1.png', 'picnic-bowl-art'));
    const bowlTarget = button(this.selected && this.selected !== 'bowl' ? 'Put selected fruit in the bowl' : bowlPieces.length ? 'Select this bowl to serve it to a friend' : 'Find fruit for the bowl', '', () => {
      if (!current()) return;
      if (this.selected && this.selected !== 'bowl') this.drop('bowl'); else if (bowlPieces.length) { this.selected = this.selected === 'bowl' ? '' : 'bowl'; this.playFeedback = ''; this.paint(); } else this.hintFruit();
    }, 'picnic-bowl-target'); bowlTarget.dataset.drop = 'bowl'; bowl.append(bowlTarget);
    const ingredients = document.createElement('div'); ingredients.className = 'picnic-bowl-food';
    // The generous whole-bowl target serves the mixture. Individual ingredients
    // have full-size targets in its deliberate contents chooser, not tiny taps.
    for (const piece of bowlPieces) ingredients.append(fruitPicture(piece));
    for (let i = bowlPieces.length; i < 8; i++) { const slot = document.createElement('span'); slot.className = 'picnic-bowl-slot'; ingredients.append(slot); }
    bowl.append(ingredients); preparing.append(bowl);
    bowl.classList.toggle('is-selected', this.selected === 'bowl'); bowl.classList.toggle('is-mixed', bowlPieces.length > 0 && bowlPieces.every(p => p.salad));
    const mix = button('Stir these ingredients into fruit salad', '<span class="picnic-spoon-icon" aria-hidden="true">↻</span>', () => { if (current()) this.change({ type: 'mix' }, 'picnic_mix'); }, 'picnic-mix'); mix.hidden = bowlPieces.length < 2; preparing.append(mix);
    const bowlInfo = document.createElement('div'); bowlInfo.className = 'picnic-bowl-info'; bowlInfo.append(portionStrip(bowlPieces));
    const bowlLabel = document.createElement('span'); bowlLabel.textContent = bowlPieces.length && bowlPieces.every(p => p.salad) ? 'Your fruit salad' : this.selected === 'bowl' ? 'Tap a friend to serve' : 'Mix, then tap the bowl to serve'; bowlInfo.append(bowlLabel);
    table.append(bowlInfo);
    table.append(preparing); this.content.append(table);
    const returnFood = button('Put selected food back on the cloth', iconSVG('back'), () => { if (current()) this.drop('board'); }, 'picnic-return-food');
    returnFood.hidden = !selectedPiece || selectedPiece.place === 'board'; board.append(returnFood);
    const footer = document.createElement('footer'); footer.className = 'picnic-footer';
    const tools = button('Open our picnic basket: cloth, bowl fruit and more food', img('assets/art/final/stories/basket.webp'), () => { if (current()) this.chooseTools(); }, 'picnic-tools'); footer.append(tools);
    footer.append(button('Undo the last picnic change', iconSVG('undo'), () => { if (current() && picnicState.undo()) { this.selected = ''; this.playFeedback = ''; this.paint(); } }));
    footer.append(button('Save this picnic to play again', iconSVG('save'), () => { if (current()) this.save(); }));
    footer.append(button('Open one of our saved picnics', iconSVG('book'), () => this.chooseSaved()));
    const moreOnCloth = button('See the next fruit on our cloth', iconSVG('back'), () => {
      const end = foodTray.scrollWidth - foodTray.clientWidth;
      foodTray.scrollTo({ left: foodTray.scrollLeft >= end - 2 ? 0 : Math.min(end, foodTray.scrollLeft + 220), behavior: settings.get().reducedMotion ? 'auto' : 'smooth' });
    }, 'picnic-next-fruit');
    board.append(moreOnCloth);
    if (this.invitationButton) footer.append(this.invitationButton);
    if (scene.outing) footer.append(button('Join our river picnic with this meal and toy', outingFigure(scene.outing), () => { if (current()) { this.playOuting = true; this.selected = ''; this.paint(); } }, 'picnic-play-launcher'));
    this.root.querySelector('.picnic-footer')?.remove(); this.root.insertBefore(footer, this.status);
    const updateFruitPaging = () => {
      const end = Math.max(0, foodTray.scrollWidth - foodTray.clientWidth);
      const wraps = end > 1 && foodTray.scrollLeft >= end - 2;
      moreOnCloth.disabled = end <= 1;
      moreOnCloth.classList.toggle('is-wrap', wraps);
      moreOnCloth.setAttribute('aria-label', wraps ? 'Return to the first fruit on our cloth' : 'See the next fruit on our cloth');
    };
    foodTray.addEventListener('scroll', updateFruitPaging, { passive: true });
    updateFruitPaging();
    const selectedOnCloth = foodTray.querySelector('.is-selected');
    if (selectedOnCloth && selectedOnCloth.offsetLeft + 44 > foodTray.scrollLeft + foodTray.clientWidth) foodTray.scrollLeft = selectedOnCloth.offsetLeft + 44 - foodTray.clientWidth;
    this.root.classList.toggle('picnic-has-selection', !!this.selected);
    this.root.classList.toggle('picnic-has-invitation', !!scene.invitation);
    const outcome = picnicOutcome(scene); this.root.classList.toggle('picnic-both-served', outcome.bothServed);
    this.showPlayCue(picnicPlayPrompt(scene, this.selected, this.playFeedback));
    void resume.save({ screen: 'picnic', params: {} }); bus.emit('activity:idle');
  },
  clearFruitHint() {
    if (this.fruitHintTimer != null) clearTimeout(this.fruitHintTimer);
    this.fruitHintTimer = null; this.fruitHintTarget?.classList.remove('picnic-fruit-hint'); this.fruitHintTarget = null;
  },
  hintFruit() {
    this.clearFruitHint();
    const tray = this.root?.querySelector('.picnic-food-tray');
    const trayFruit = tray?.querySelector('.picnic-piece');
    const plateFruit = [...(this.root?.querySelectorAll('.picnic-plate-food') || [])].map(plate => plate.querySelector('.picnic-piece')).find(Boolean);
    const fruit = trayFruit || plateFruit;
    if (trayFruit) tray.scrollLeft = 0;
    const bowlHasFood = !!picnicLivePieces(picnicState.get().draft, 'bowl').length;
    const target = fruit || (bowlHasFood ? this.root?.querySelector('.picnic-bowl-target') : null) || this.root?.querySelector('.picnic-tools');
    this.showPlayCue(fruit ? 'Tap a fruit, then tap a plate or bowl.' : bowlHasFood ? 'Tap the bowl, then a friend.' : 'Open the basket to find more fruit.');
    if (!target) return;
    target.classList.add('picnic-fruit-hint'); this.fruitHintTarget = target;
    this.fruitHintTimer = setTimeout(() => this.clearFruitHint(), 2400);
  },
  showPlayCue(text) {
    // Keep storage/capacity notices until their own recovery action clears them.
    if (!this.status || (this.status.textContent && this.status.textContent !== this.playCue)) return;
    this.playCue = text; this.status.textContent = text;
  },
  ensureCafeGuidance() {
    if (this.cafeGuidance) return;
    const visit = this.visit;
    this.cafeGuidance = new LivingGuidance({ route: 'picnic', active: () => this.alive && this.visit === visit && this.playCafe,
      ready: () => !this.saving && !this.checkpointing && !this.overlay && !this.clothBusy && !this.cafePerformance?.running,
      guideKey: () => this.cafeArranging ? 'living_cafe_move' : this.selected ? 'living_cafe_share' :
        picnicState.get().draft.cafe?.phase === 'welcome' ? 'living_cafe_welcome' : picnicState.get().draft.cafe?.phase === 'share' ? 'living_cafe_meal' : picnicState.get().draft.cafe?.phase === 'music' ? 'living_cafe_music' : 'living_cafe_intro',
      caption: text => { if (this.status) this.status.textContent = text; } });
  },
  cafeDialogGuide(key, overlay) {
    if (!this.alive || !this.playCafe || this.overlay !== overlay || this.saving || this.checkpointing ||
        document.hidden || session.isBreakLocked() || !GARDEN_CAFE_PHRASES[key]) return;
    const caption = document.createElement('p'); caption.className = 'garden-cafe-dialog-caption';
    caption.textContent = GARDEN_CAFE_PHRASES[key].text;
    overlay.insertBefore(caption, overlay.children[1] || null);
    // This direct help belongs to the just-opened chooser. Opening another
    // chooser, leaving, muting or a parent break cancels it through shared speech.
    void speech.say(key);
  },
  paintCafe(state, current) {
    this.ensureCafeGuidance();
    this.root.classList.toggle('cafe-reduced-motion', settings.get().reducedMotion);
    renderGardenCafe(this, state, current, { img, button, portrait, fruitPicture, guests: GUESTS, iconSVG });
    this.inviteCafe();
    const footer = document.createElement('footer'); footer.className = 'picnic-footer';
    const pictured = (label, art, caption, action) => { const choice = button(label,art,action,'garden-cafe-footer-choice'); const text = document.createElement('span'); text.textContent = caption; choice.append(text); return choice; };
    footer.append(pictured('More café tools and other ways to play', iconSVG('art'), 'More', () => { if (current()) this.chooseTools(); }));
    footer.append(button('Undo our last meal or café change', iconSVG('undo'), () => { if (current()) { this.stopCafe(); if (picnicState.undo()) { this.selected = ''; this.cafeMove = null; this.paint(); } } }));
    footer.append(button('Keep our editable café, sign, actual meal and welcome rhythm', iconSVG('save'), () => { if (current()) this.save(); }));
    const lastCafe = state.saves.find(saved => saved.scene.cafe);
    footer.append(pictured('Open a kept picnic or café', lastCafe ? this.tablePreview(lastCafe.scene,state.assets) : img(CAFE_ART.sign), 'Saved', () => { if (current()) this.chooseSaved(); }));
    if (state.draft.invitation?.messageDay) footer.append(pictured('Open the original message for our café', img(state.draft.invitation.png), 'Message', () => { if (current()) void router.go('picture-post', { source: state.draft.invitation }); }));
    this.root.querySelector('.picnic-footer')?.remove(); this.root.insertBefore(footer, this.status);
    void resume.save({ screen: 'picnic', params: { cafe: true } }); bus.emit('activity:idle');
  },
  inviteCafe() {
    if (!this.alive || !this.playCafe || !this.cafeStage || this.checkpointing || document.hidden || session.isBreakLocked()) return;
    showCafeObjectInvitation(this, picnicState.get().draft, { img, fruitPicture }, {
      defer: fn => requestAnimationFrame(fn), cancelDeferred: frame => cancelAnimationFrame(frame),
    });
  },
  stopCafe() {
    const interrupted = this.cafePerformance?.running;
    const beatCaption = this.cafeBeatCaption;
    this.stopCafeTurnGuide?.();
    this.stopCafeInvitation?.();
    this.cafePerformance?.stop();
    this.cafeMusicians?.stop(); this.cafeMusicians = null;
    this.root?.querySelector('.garden-cafe-performance')?.remove();
    if (this.cafeActionSnapshot) {
      const { node,children } = this.cafeActionSnapshot;
      if (node.isConnected) node.replaceChildren(...children);
      this.cafeActionSnapshot = null;
    }
    this.cafeStage?.querySelectorAll('.is-performing').forEach(node => node.classList.remove('is-performing'));
    this.root?.querySelectorAll('.garden-cafe-beat.is-playing').forEach(node => node.classList.remove('is-playing'));
    this.cafeBeatCaption = null;
    // Only retire feedback still owned by this interrupted turn. Save, denial
    // and completed-performance messages belong to their own consequences.
    if (interrupted && beatCaption && this.status?.textContent === beatCaption) {
      this.status.textContent = 'Our welcome has stopped. Tap Music to play or change our rhythm.';
    }
  },
  stopCafeTurnGuide() {
    if (!this.cafeTurnGuideOwner) return;
    this.cafeTurnGuideOwner = null; speech.cancel();
  },
  cafeTurnGuide(performance) {
    this.stopCafeTurnGuide();
    const guide = { visit:this.visit,performance };
    this.cafeTurnGuideOwner = guide;
    void performance.sound.whenQuiet().then(() => {
      if (this.cafeTurnGuideOwner !== guide || !this.alive || this.visit !== guide.visit ||
        this.cafePerformance !== performance || !performance.running || !performance.nextTurn ||
        this.overlay || document.hidden || this.checkpointing || session.isBreakLocked()) return;
      this.status.textContent += ' ' + GARDEN_CAFE_PHRASES.living_cafe_next_beat.text;
      this.cafeBeatCaption = this.status.textContent;
      if (!settings.get().muted) void speech.say('living_cafe_next_beat');
    });
  },
  chooseCafeArrange() {
    this.stopCafe();
    if (this.cafeArranging) { this.cafeArranging = false; this.cafeMove = null; this.paint(); return; }
    this.cafeArranging = true; this.paint();
    const scene = picnicState.get().draft, overlay = this.dialog('Choose a place to move. Every place is reachable here, even when they overlap.');
    const choices = [['left', scene.guests[0]], ['right', scene.guests[1]], ...(scene.cafe.visitor ? [['visitor', scene.cafe.visitor]] : [])];
    for (const [part, guest] of choices) overlay.append(button('Move ' + GUESTS[guest][0] + "'s table and chair", portrait(guest), () => {
      if (this.overlay !== overlay) return;
      this.cafeMove = part; this.closeDialog(); this.paint(); this.cafeGuidance?.guide(true); this.cafeStage?.focus?.({ preventScroll: true });
    }, 'picnic-guest-choice'));
    overlay.append(button('Move our whole welcome sign', img(CAFE_ART.sign), () => { if (this.overlay === overlay) { this.cafeMove = 'sign'; this.closeDialog(); this.paint(); this.cafeStage?.focus?.({ preventScroll: true }); } }, 'picnic-guest-choice'));
  },
  chooseCafeVisitor() {
    const overlay = this.dialog('Who is coming to our café?');
    for (const guest of PICNIC_GUESTS) {
      const option = button('Make room for ' + GUESTS[guest][0], portrait(guest), () => {
        if (this.overlay !== overlay) return;
        this.change({ type: 'cafe-visitor', guest }); this.closeDialog();
      }, 'picnic-guest-choice'); overlay.append(option);
    }
    overlay.append(button('Keep a small gathering. Bring the extra plate food back to the basket.', iconSVG('back'), () => { if (this.overlay === overlay) { this.change({ type: 'cafe-visitor', guest: null }); this.closeDialog(); } }));
    this.cafeDialogGuide('living_cafe_welcome', overlay);
  },
  chooseCafeMessageArrival() {
    const message = this.pendingCafeMessage; if (!message || !this.alive || this.arrivalSaving) return;
    // The paper came to the café. An earlier river outing is still retained,
    // but must not replace this existing place when the new paper is declined.
    if (!this.playCafe && picnicState.get().draft.cafe) {
      this.playCafe = true; this.playOuting = false; this.paint();
    }
    const sign = message.messageDay.use === 'cafe-sign', name = GUESTS[message.recipient][0];
    const overlay = this.dialog(sign ? 'Your message can be our café sign' : name + ' has a café invitation');
    const heading = document.createElement('p'); heading.className = 'garden-cafe-dialog-caption';
    heading.textContent = sign ? 'Use your whole picture here, or keep our sign as it is.' : 'Welcome ' + name + ', or keep our gathering as it is.'; overlay.append(heading);
    const current = () => this.alive && this.overlay === overlay && overlay.isConnected && this.pendingCafeMessage === message && !this.arrivalSaving && !this.checkpointing;
    const accept = button(sign ? 'Use my whole message as our café sign, keeping our meal and friends' : 'Welcome ' + name + ' with this invitation, keeping our meal and earlier messages', img(message.png), async () => {
      if (!current()) return;
      const visit = this.visit; this.arrivalSaving = true;
      let used = false;
      try { used = await picnicState.useCafeMessage(message, { accept: () => this.alive && this.visit === visit && this.overlay === overlay && this.pendingCafeMessage === message }); }
      catch { used = false; }
      if (!this.alive || this.visit !== visit) return;
      this.arrivalSaving = false;
      if (!used) { this.status.textContent = 'Your gathering and paper are still here. Try the message again, or keep playing here.'; return; }
      this.pendingCafeMessage = null; this.playCafe = true; this.playOuting = false; this.selected = ''; this.closeDialog(); this.paint();
      this.status.textContent = picnicState.lastIssue() === 'temporary' ? 'Your message is here for now. Ask a grown-up to save a backup before closing.' : sign ? 'Your whole message is our sign. Undo brings back our earlier café.' : name + ' can join our café. The earlier messages and meal are kept. Undo brings back our earlier gathering.';
      if (!settings.get().muted) void speech.say(sign ? 'living_message_sign_used' : 'living_message_invite_used');
    }, 'picnic-cloth-choice');
    const caption = document.createElement('span'); caption.textContent = sign ? 'Our new sign' : 'Welcome ' + name; accept.append(caption); overlay.append(accept);
    const keep = button('Keep our gathering as it is. My message stays on its own paper.', sign ? img(CAFE_ART.sign) : portrait(message.recipient), () => {
      if (!current()) return; this.pendingCafeMessage = null; this.closeDialog(); this.status.textContent = 'Our gathering stays as it is. Your message is still in Picture Post.';
    }, 'picnic-cloth-choice'); const label = document.createElement('span'); label.textContent = 'Keep our gathering'; keep.append(label); overlay.append(keep);
    if (!settings.get().muted) void speech.say(sign ? 'living_message_sign_arrival' : 'living_message_invite_arrival');
  },
  chooseCafePlate(place) {
    const scene = picnicState.get().draft, guest = place === 'visitor' ? scene.cafe.visitor : scene.guests[place === 'right' ? 1 : 0];
    const overlay = this.dialog(GUESTS[guest][0] + "'s actual plate");
    const heading = document.createElement('div'); heading.className = 'garden-cafe-food-heading'; heading.append(portrait(guest));
    const title = document.createElement('span'); title.textContent = GUESTS[guest][0] + "'s plate. Choose a fruit."; heading.append(title); overlay.append(heading);
    for (const piece of picnicLivePieces(scene, place)) {
      overlay.append(button('Choose this ' + (piece.units === 1 ? 'half ' : '') + piece.kind + ' from ' + GUESTS[guest][0] + "'s plate", fruitPicture(piece), () => {
        if (this.overlay !== overlay) return; this.selected = piece.id; this.closeDialog(); this.paint(); this.chooseCafeSelected();
      },'picnic-ingredient-choice'));
    }
    overlay.append(cafeTool('Choose more food for this plate', img('assets/art/final/stories/basket.webp'), 'Our basket', () => { if (this.overlay === overlay) { this.closeDialog(); this.chooseCafeMeal(); } }));
  },
  chooseCafeMeal() {
    const scene = picnicState.get().draft, overlay = this.dialog('Our café meal: choose actual fruit, a bowl or more food');
    const section = (label, art) => { const title = document.createElement('div'); title.className = 'garden-cafe-food-heading'; title.append(art); const text = document.createElement('span'); text.textContent = label; title.append(text); overlay.append(title); };
    section('From our basket',img('assets/art/final/stories/basket.webp'));
    const basket = picnicLivePieces(scene,'board');
    if (!basket.length) { const empty = document.createElement('p'); empty.className = 'garden-cafe-dialog-caption'; empty.textContent = 'Our fruit has been served. Fetch more, or choose a plate below.'; overlay.append(empty); }
    for (const piece of basket) overlay.append(button('Choose ' + (piece.units === 1 ? 'half ' : '') + piece.kind + ' from our basket', fruitPicture(piece), () => {
      if (this.overlay !== overlay) return; this.selected = piece.id; this.closeDialog(); this.paint(); this.cafeGuidance?.guide(true);
    }, 'picnic-ingredient-choice'));
    const piece = scene.pieces.find(food => food.id === this.selected && !food.eaten);
    if (piece?.units === 2) overlay.append(cafeTool('Cut this whole fruit into two real halves', '<span aria-hidden="true">✂</span>', 'Two halves', () => {
      if (this.overlay !== overlay) return; const halves = picnicCutIds(scene, piece.id);
      if (this.change({ type: 'cut', id: piece.id }, 'picnic_cut')) this.selected = halves[0];
      this.closeDialog(); this.paint();
    }));
    if (piece) overlay.append(cafeTool('Put this selected fruit in our bowl', img('assets/art/final/props/picnic-round-bowl-v1.png'), 'Into our bowl', () => { if (this.overlay === overlay) { this.drop('bowl'); this.closeDialog(); this.paint(); } }));
    const bowl = picnicLivePieces(scene, 'bowl');
    if (bowl.length) {
      section('In our bowl',img('assets/art/final/props/picnic-round-bowl-v1.png'));
      for (const piece of bowl) overlay.append(button('Choose ' + (piece.units === 1 ? 'half ' : '') + piece.kind + ' from our bowl',fruitPicture(piece),() => {
        if (this.overlay !== overlay) return; this.selected = piece.id; this.closeDialog(); this.paint(); this.cafeGuidance?.guide(true);
      },'picnic-ingredient-choice'));
    }
    if (bowl.length >= 2) overlay.append(cafeTool('Stir the actual bowl ingredients into fruit salad', '<span aria-hidden="true">↻</span>', 'Mix fruit salad', () => { if (this.overlay === overlay) { this.change({ type: 'mix' }, 'picnic_mix'); this.closeDialog(); this.paint(); } }));
    if (bowl.length) overlay.append(cafeTool('Share our whole fruit bowl with a friend', img('assets/art/final/props/picnic-round-bowl-v1.png'), 'Share our bowl', () => { if (this.overlay === overlay) { this.selected = 'bowl'; this.closeDialog(); this.paint(); this.status.textContent = 'Tap a friend to share the fruit bowl.'; } }));
    overlay.append(cafeTool('Fetch more fruit, keeping our meal', img(fruitPath('apple')), 'Fetch fruit', () => { if (this.overlay === overlay) { this.change({ type: 'more' }); this.closeDialog(); this.paint(); } }));
    for (const [index,place] of ['left','right',...(scene.cafe.visitor ? ['visitor'] : [])].entries()) {
      const pieces = picnicLivePieces(scene,place); if (!pieces.length) continue;
      const guest = place === 'visitor' ? scene.cafe.visitor : scene.guests[index];
      section('Already on ' + GUESTS[guest][0] + "'s plate",portrait(guest));
      const plate = document.createElement('span'); plate.className = 'garden-cafe-food-plate'; plate.append(img('assets/art/final/props/picnic-round-plate-v1.png'));
      for (const food of pieces) plate.append(fruitPicture(food));
      const choice = button('Open ' + GUESTS[guest][0] + "'s served fruit",plate,() => { if (this.overlay === overlay) this.chooseCafePlate(place); },'picnic-tool-choice');
      const label = document.createElement('span'); label.textContent = GUESTS[guest][0] + "'s plate"; choice.append(label); overlay.append(choice);
    }
    this.cafeDialogGuide('living_cafe_meal', overlay);
  },
  chooseCafeSelected() {
    const scene = picnicState.get().draft;
    const piece = scene.pieces.find(food => food.id === this.selected && !food.eaten);
    if (!piece && this.selected !== 'bowl') { this.selected = ''; this.paint(); return; }
    const overlay = this.dialog('What shall we do with this ' + (piece?.kind || 'fruit bowl') + '?');
    const choice = (label, art, action, caption = label) => {
      const node = button(label, art, () => { if (this.overlay !== overlay) return; action(); this.closeDialog(); this.paint(); }, 'picnic-tool-choice');
      const text = document.createElement('span'); text.textContent = caption; node.append(text); overlay.append(node);
    };
    if (piece && ['left','right','visitor'].includes(piece.place)) {
      const guest = piece.place === 'visitor' ? scene.cafe.visitor : scene.guests[piece.place === 'right' ? 1 : 0];
      const taste = document.createElement('span'); taste.className = 'garden-cafe-taste-choice'; taste.append(portrait(guest),fruitPicture(piece));
      choice('Let ' + GUESTS[guest][0] + ' enjoy this ' + (piece.units === 1 ? 'half ' : '') + piece.kind,taste,() => {
        if (this.change({type:'enjoy',place:piece.place,id:piece.id},'picnic_enjoy')) this.selected='';
      },'Taste');
      choice('Put this exact fruit piece back in our basket',img('assets/art/final/stories/basket.webp'),() => this.drop('board'),'Back to basket');
    }
    for (const [index, place] of ['left', 'right', ...(scene.cafe.visitor ? ['visitor'] : [])].entries()) {
      if (piece?.place === place) continue;
      const guest = place === 'visitor' ? scene.cafe.visitor : scene.guests[index];
      choice('Give to ' + GUESTS[guest][0], portrait(guest), () => this.drop(place));
    }
    if (piece?.units === 2) choice('Make two halves', '<span aria-hidden="true">✂</span>', () => {
      const halves = picnicCutIds(scene, piece.id);
      if (this.change({ type: 'cut', id: piece.id }, 'picnic_cut')) this.selected = halves[0];
    });
    if (piece) choice('Put in our bowl', img('assets/art/final/props/picnic-round-bowl-v1.png'), () => this.drop('bowl'));
    choice('Put away this choice', iconSVG('back'), () => { this.selected = ''; });
  },
  async chooseCafeSign() {
    if (!this.alive || this.checkpointing) return;
    const visit = this.visit;
    const overlay = this.dialog('Your whole picture can welcome our visitors');
    const scene = picnicState.get(), sign = scene.draft.cafe?.sign, asset = scene.assets.find(row => row.id === sign?.asset);
    if (asset) {
      const views = document.createElement('div'); views.className = 'garden-cafe-picture-views'; overlay.append(views);
      const choice = (label,frame,caption) => {
        const node = button(label,pictureView(asset.png,frame),() => {
          if (this.overlay !== overlay || this.visit !== visit || this.clothBusy || session.isBreakLocked()) return;
          this.change({ type:'cafe-sign-view',asset:asset.id,frame }); this.closeDialog(); this.paint();
        },'garden-cafe-picture-choice');
        node.setAttribute('aria-pressed',String(frame ? !!sign.frame : !sign.frame));
        const text = document.createElement('span'); text.textContent = caption; node.append(text); views.append(node); return node;
      };
      choice('Show my whole picture on our sign',null,'Whole picture');
      const pending = document.createElement('p'); pending.className = 'garden-cafe-picture-note'; pending.textContent = 'Your original stays unchanged.'; views.append(pending);
      this.cafePictureAbort = new AbortController(); const controller = this.cafePictureAbort;
      const checked = sign.frame ? Promise.resolve(sign.frame) : inspectPictureView(asset.png,{signal:controller.signal});
      void checked.then(frame => {
        if (!this.alive || this.visit !== visit || this.overlay !== overlay || controller.signal.aborted || document.hidden || session.isBreakLocked()) return;
        pending.remove();
        if (frame) views.insertBefore(choice('Show all my original marks closer on our sign',frame,'Closer marks'),original);
        else { pending.textContent = 'Your whole picture stays visible here.'; views.append(pending); }
      });
      const original = button('See my whole original picture',pictureView(asset.png,null),() => {
        if (this.overlay !== overlay) return;
        const viewer = this.dialog('Your whole original picture, unchanged'); viewer.append(pictureView(asset.png,null,'garden-cafe-original'));
      },'garden-cafe-picture-choice'); const caption = document.createElement('span'); caption.textContent = 'See original'; original.append(caption); views.append(original);
    }
    let rows;
    try { rows = (await gallery.listChecked()).filter(isCreationRow); }
    catch { if (this.alive && this.visit===visit && this.overlay===overlay && !this.checkpointing && !document.hidden && !session.isBreakLocked()) { const message=document.createElement('p');message.textContent='Your sign is still here. Pictures could not be opened.';overlay.append(message);const retry=button('Try opening your pictures again',iconSVG('next'),()=>{if(this.overlay===overlay)void this.chooseCafeSign();});retry.dataset.pictureRetry='';const caption=document.createElement('span');caption.textContent='Try again';retry.append(caption);overlay.append(retry); } return; }
    if (!this.alive || this.visit !== visit || this.overlay !== overlay || this.checkpointing || document.hidden || session.isBreakLocked()) return;
    if (!db.status().persistent) { const warning=document.createElement('p');warning.textContent='Pictures saved on this device may be unavailable right now. Ask a grown-up to check storage before closing.';overlay.append(warning); }
    for (const row of rows) overlay.append(button('Use my ' + (row.id || 'picture') + ' for our welcome sign', img(row.png), async () => {
      if (this.overlay !== overlay || this.clothBusy) return; this.clothBusy = true;
      try {
        const used = await picnicState.usePicture(row, 'cafe-sign');
        if (!this.alive || this.visit !== visit) return;
        if (used) { this.closeDialog(); this.paint(); this.cafeGuidance?.after('living_cafe_sign'); if (picnicState.lastIssue() === 'temporary') this.storageRecovery('temporary'); }
        else this.storageRecovery(picnicState.lastIssue(), () => this.chooseCafeSign());
      } finally { if (this.visit === visit) this.clothBusy = false; }
    }, 'picnic-cloth-choice'));
    overlay.append(button('Use the game flower sign', img('assets/art/final/stickers/draw_flower.webp'), () => { if (this.overlay === overlay) { this.change({ type: 'cafe-sign', asset: '' }); this.closeDialog(); } },'picnic-cloth-choice'));
  },
  chooseCafeTune() {
    const overlay = this.dialog('Our welcome rhythm');
    const cafe = picnicState.get().draft.cafe;
    const notes = document.createElement('div'); notes.className = 'garden-cafe-score';
    cafe.rhythm.forEach((note, index) => {
      const choice = button('Beat ' + (index + 1) + ': ' + cafeInstrumentLabel(note) + '. Choose another sound or quiet beat.', cafeInstrumentPicture(note, img), () => { if (this.overlay === overlay) this.chooseCafeNote(index); }, 'garden-cafe-beat'); choice.dataset.cafeBeat = index; notes.append(choice);
    }); overlay.append(notes);
    for (const role of ['pulse', 'echo']) {
      const person = button('Choose who ' + (role === 'pulse' ? 'keeps a steady beat' : 'echoes our welcome'), portrait(cafe.roles[role]), () => { if (this.overlay === overlay) this.chooseCafeRole(role); }, 'garden-cafe-role');
      const label = document.createElement('span'); label.textContent = GUESTS[cafe.roles[role]][0] + (role === 'pulse' ? ': steady beat' : ': echo'); person.append(label); overlay.append(person);
    }
    const begin = stepped => {
      if (this.overlay !== overlay) return;
      this.closeDialog(); speech.cancel(); const visit = this.visit;
      const performance = document.createElement('aside'); performance.className = 'garden-cafe-performance'; performance.setAttribute('aria-label', 'Our family welcome is playing in this café');
      const people = document.createElement('span'); people.className = 'garden-cafe-players';
      for (const role of ['pulse', 'echo']) {
        const person = document.createElement('span'); person.dataset.cafeRole = role;
        const instrument = cafeInstrumentPicture(role === 'pulse' ? 'drum' : 'bell', img); instrument.classList.add('garden-cafe-player-instrument');
        const label = document.createElement('span'); label.className = 'garden-cafe-player-label'; label.textContent = GUESTS[cafe.roles[role]][0] + (role === 'pulse' ? ': beat' : ': echo');
        person.append(portrait(cafe.roles[role]), instrument, label); people.append(person);
      }
      const beatRow = document.createElement('span'); beatRow.className = 'garden-cafe-live-score';
      for (const note of cafe.rhythm) { const beat = document.createElement('span'); beat.className = 'garden-cafe-live-beat'; beat.append(cafeInstrumentPicture(note, img)); beatRow.append(beat); }
      const stop = button('Stop our welcome. Our rhythm and café remain editable.', '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="18" y="18" width="28" height="28" rx="5" fill="currentColor"/></svg>', () => { this.stopCafe(); this.paint(); });
      performance.append(people, beatRow, stop);
      let nextBeat = null;
      if (stepped) {
        nextBeat = button('Play the next family beat',iconSVG('play'),() => { if (this.alive && this.visit === visit && !this.overlay) { this.stopCafeTurnGuide(); this.cafePerformance?.step(); } },'garden-cafe-next-beat');
        const label = document.createElement('span'); label.textContent = 'Next'; nextBeat.append(label); performance.append(nextBeat);
      }
      const actions = this.content.querySelector('.garden-cafe-actions');
      this.cafeActionSnapshot = { node:actions,children:[...actions.children] }; actions.replaceChildren(performance);
      this.cafeMusicians = mountCafePerformers(this.cafeStage,cafe,{portrait,img,guests:GUESTS});
      this.cafePerformance = new CafePerformance({ active: () => this.alive && this.visit === visit && !this.overlay && !document.hidden && !this.checkpointing,
        tick: beat => {
          this.cafeMusicians?.tick(beat);
          if (nextBeat) { nextBeat.disabled = beat.role === 'echo' && beat.index === 5; nextBeat.setAttribute('aria-label',nextBeat.disabled ? 'Our last beat is finishing' : 'Play the next family beat'); }
          beatRow.querySelectorAll('.garden-cafe-live-beat').forEach((node, index) => node.classList.toggle('is-playing', index === beat.index));
          people.querySelectorAll('[data-cafe-role]').forEach(node => {
            const active = node.dataset.cafeRole === beat.role;
            node.classList.toggle('is-playing', active); node.classList.toggle('is-rest', active && beat.note === 'rest');
            if (active) {
              node.querySelector('.garden-cafe-player-instrument')?.remove();
              const actual = cafeInstrumentPicture(beat.note, img); actual.classList.add('garden-cafe-player-instrument'); node.append(actual);
            }
          });
          this.cafeStage?.querySelectorAll('[data-cafe-place]').forEach(node => {
            const scene = picnicState.get().draft, guest = node.dataset.cafePlace === 'visitor' ? scene.cafe.visitor : scene.guests[node.dataset.cafePlace === 'right' ? 1 : 0];
            node.classList.toggle('is-performing', guest === beat.guest && beat.note !== 'rest');
          });
          this.status.textContent = GUESTS[beat.guest][0] + (beat.note === 'rest' ? ' takes a quiet beat.' : beat.role === 'pulse' ? ' keeps our steady beat.' : ' echoes our welcome.');
          this.cafeBeatCaption = this.status.textContent;
        }, denied: () => {
          if (!this.alive || this.visit !== visit) return;
          this.stopCafe(); this.paint();
          this.status.textContent = 'Sound could not start. Tap Music, then Play to try again. Your rhythm is still here.';
        }, complete: snapshot => {
          if (!this.alive || this.visit !== visit || this.overlay) return;
          if (this.change({ type: 'cafe-performed', ...snapshot })) {
            this.status.textContent = 'Our welcome is played. Change a beat, play again, or Keep our café.';
          }
        } });
      this.cafePerformance.start(cafe,{stepped});
      if (stepped && this.cafePerformance.running) this.cafeTurnGuide(this.cafePerformance);
    };
    const play = button('Perform our six beats, then the family echo.',iconSVG('play'),() => begin(!!settings.get().reducedMotion));
    const turns = cafeTool('Play our welcome one beat at a time. You choose when to continue.',iconSVG('play'),'One beat at a time',() => begin(true));
    overlay.append(play,turns);
    this.cafeDialogGuide(cafe.phase === 'music' ? 'living_cafe_music' : 'living_cafe_rhythm', overlay);
  },
  chooseCafeNote(index) {
    const overlay = this.dialog('Choose the sound for beat ' + (index + 1));
    for (const note of ['drum', 'shaker', 'bell', 'wood', 'rest']) overlay.append(button(cafeInstrumentLabel(note), cafeInstrumentPicture(note, img), () => {
      if (this.overlay !== overlay) return; this.change({ type: 'cafe-note', index, note }); this.closeDialog(); this.chooseCafeTune();
    }, 'picnic-ingredient-choice'));
  },
  chooseCafeRole(role) {
    const overlay = this.dialog(role === 'pulse' ? 'Who keeps a steady beat?' : 'Who echoes our welcome?');
    for (const guest of PICNIC_GUESTS) overlay.append(button(GUESTS[guest][0], portrait(guest), () => { if (this.overlay === overlay) { this.change({ type: 'cafe-role', role, guest }); this.closeDialog(); this.chooseCafeTune(); } }, 'picnic-guest-choice'));
  },
  chooseCafePlayday() {
    const overlay = this.dialog('Welcome to My Café: choose a situation or just play');
    for (const phase of CAFE_PHASES) {
      const picture = phase.id === 'welcome' ? img(CAFE_ART.chair) : phase.id === 'share' ? img('assets/art/final/stories/basket.webp') : phase.id === 'music' ? img('assets/art/final/music-band/drum-v1.png') : iconSVG('save');
      const choice = button(phase.label + '. ' + phase.invitation, picture, () => {
        if (this.overlay !== overlay) return;
        this.change({ type: 'cafe-phase', phase: phase.id }); this.closeDialog();
        if (phase.id === 'welcome') this.chooseCafeVisitor();
        else if (phase.id === 'share') this.chooseCafeMeal();
        else if (phase.id === 'music') this.chooseCafeTune();
        else void this.save();
      }, 'picnic-tool-choice');
      const caption = document.createElement('span'); caption.textContent = phase.label; choice.append(caption); overlay.append(choice);
    }
    overlay.append(button('Free play in our café', iconSVG('heart'), () => { if (this.overlay === overlay) { this.change({ type: 'cafe-phase', phase: null }); this.closeDialog(); } }));
  },
  pieceButton(piece) {
    const actionView = this.actionView;
    const b = button((piece.units === 1 ? 'Half ' : '') + piece.kind + ', ' + piece.place + ', select to move', fruitPicture(piece), () => {
      if (!this.alive || this.actionView !== actionView || this.saving || this.checkpointing || this.drag) return;
      this.selected = this.selected === piece.id ? '' : piece.id; this.playFeedback = ''; this.paint();
    }, 'picnic-piece' + (piece.id === this.selected ? ' is-selected' : ''));
    b.dataset.piece = piece.id; b.dataset.place = piece.place; return b;
  },
  paintOuting(state, current) {
    const scene = state.draft;
    if (this.selected !== 'outing' && !(this.selected === 'bowl' && picnicLivePieces(scene, 'bowl').length) && !scene.pieces.some(p => p.id === this.selected && !p.eaten)) this.selected = '';
    this.content.replaceChildren();
    const stage = document.createElement('div'); stage.className = 'picnic-outing-stage'; stage.setAttribute('role', 'group'); stage.setAttribute('aria-label', 'Our river picnic: your toy, chosen family and actual food'); this.content.append(stage);
    const g = picnicOutingGeometry(this.content.clientWidth, this.content.clientHeight, scene.outing.placement);
    const position = (element, point, width, height) => { element.style.left = `${point.x}px`; element.style.top = `${point.y}px`; if (width) element.style.width = `${width}px`; if (height) element.style.height = `${height}px`; };
    const table = document.createElement('div'); table.className = 'picnic-outing-table'; const tableArt = img('assets/art/final/props/picnic-empty-table-v1.png'); tableArt.alt = 'Our empty picnic table and benches'; table.append(tableArt);
    position(table, { x: g.table.left, y: g.table.top }, g.table.width, g.table.height); stage.append(table);
    stage.addEventListener('click', event => { if (current() && this.selected && !event.target.closest('button')) this.drop(this.selected === 'outing' ? 'table' : 'board'); });
    if (this.selected) { const returnTarget = button(this.selected === 'outing' ? 'Put your toy back on our table' : 'Put selected fruit back on our table', iconSVG('back'), () => { if (current()) this.drop(this.selected === 'outing' ? 'table' : 'board'); }, 'picnic-outing-table-return'); const point = g.point(763, 650); position(returnTarget, { x: point.x - 22, y: point.y - 22 }, 44, 44); stage.append(returnTarget); }
    for (const [index, place] of ['left', 'right'].entries()) {
      const guest = scene.guests[index], foods = picnicLivePieces(scene, place), enjoyed = picnicEnjoyedPieces(scene, place, guest);
      const person = button(this.selected ? `Give the selected ${this.selected === 'outing' ? 'toy' : 'food'} to ${GUESTS[guest][0]}` : foods.length ? `Let ${GUESTS[guest][0]} enjoy one actual fruit piece` : `Invite someone instead of ${GUESTS[guest][0]}`, portrait(guest), () => { if (!current()) return; if (this.selected) this.drop(place); else if (foods.length) this.change({ type: 'enjoy', place }, 'picnic_enjoy'); else this.chooseGuest(index); }, 'picnic-outing-person');
      position(person, { x: g.point(index ? 1177 : 350, 0).x - g.portraitWidth / 2, y: g.portraitTop }, g.portraitWidth, g.portraitHeight); stage.append(person);
      const plate = button(this.selected ? `Give selected ${this.selected === 'outing' ? 'toy' : 'food'} to ${GUESTS[guest][0]}` : foods.length ? `${GUESTS[guest][0]} can enjoy one piece from this plate` : `Choose food for ${GUESTS[guest][0]}'s plate`, img('assets/art/final/props/picnic-round-plate-v1.png'), () => { if (!current()) return; if (this.selected) this.drop(place); else if (foods.length) this.change({ type: 'enjoy', place }, 'picnic_enjoy'); else this.chooseOutingFood(place); }, 'picnic-outing-plate');
      const plateX = index ? scene.outing.placement === 'right' ? 987 : 1147 : scene.outing.placement === 'left' ? 540 : 380;
      const layout = picnicOutingPlateLayout(g, g.point(plateX, 386), foods.length);
      position(plate, { x: layout.left, y: layout.top }, layout.size, layout.size);
      const food = document.createElement('span'); food.className = 'picnic-outing-portions';
      food.style.inset = `${layout.inset}px`;
      for (const [index, piece] of foods.entries()) {
        const fruit = fruitPicture(piece), spot = layout.portions[index]; fruit.dataset.portion = piece.id;
        fruit.style.left = `${spot.left}px`; fruit.style.top = `${spot.top}px`; fruit.style.zIndex = spot.depth;
        fruit.style.width = `${layout.fruitSize}px`; fruit.style.height = `${layout.fruitSize}px`; food.append(fruit);
      }
      plate.append(food); stage.append(plate);
      if (enjoyed.length || scene.outing.placement === place) { const hello = document.createElement('span'); hello.className = 'picnic-outing-response'; hello.textContent = '♡'; hello.setAttribute('aria-hidden', 'true'); position(hello, { x: g.point(index ? 1177 : 350, 0).x + g.portraitWidth / 2, y: g.portraitTop + 4 }); stage.append(hello); }
    }
    // The whole canvas remains contained. Its float support and foot use the
    // same authored contact points as the River scene, without trimming paper.
    const toy = button('Choose your own picture toy, then tap a family member or the table to share it', outingFigure(scene.outing), () => { if (!current()) return; this.selected = this.selected === 'outing' ? '' : 'outing'; this.playFeedback = ''; this.paint(); }, 'picnic-outing-toy-target');
    position(toy, { x: g.toy.left, y: g.toy.top }, g.toy.width, Math.max(44, g.toy.height)); toy.setAttribute('aria-pressed', String(this.selected === 'outing')); stage.append(toy);
    const cloth = state.assets.find(asset => asset.id === scene.cloth);
    if (cloth) { const own = img(cloth.png, 'picnic-outing-own-cloth'); own.alt = 'Your exact picnic cloth is part of this meal'; position(own, g.point(680, 515), Math.max(30, g.table.width * .11), Math.max(22, g.table.width * .08)); stage.append(own); }
    if (scene.invitation) { const letter = button('Open our original picnic invitation', img(scene.invitation.png), () => { if (current()) void router.go('picture-post', { source: { ...scene.invitation, kind: 'picture-post' } }); }, 'picnic-outing-letter'); position(letter, g.point(1100, 650), 44, 44); stage.append(letter); }
    const footer = document.createElement('footer'); footer.className = 'picnic-footer';
    footer.append(button('Prepare, cut and mix our food on the original picnic cloth', img('assets/art/final/props/picnic-round-bowl-v1.png'), () => { if (current()) { this.playOuting = false; this.selected = ''; this.playFeedback = ''; this.paint(); } }, 'picnic-prepare-launcher'),
      button('Choose an actual whole fruit, half or salad portion to share', img('assets/art/final/stories/basket.webp'), () => { if (current()) this.chooseOutingFood(); }),
      button('Undo the last toy placement or food change', iconSVG('undo'), () => { if (current() && picnicState.undo()) { this.selected = ''; this.playFeedback = ''; this.paint(); } }),
      button('Keep this editable family outing and exact toy picture', iconSVG('save'), () => { if (current()) this.save(); }),
      button('Open our kept picnic endings', iconSVG('book'), () => { if (current()) this.chooseSaved(); }));
    this.root.querySelector('.picnic-footer')?.remove(); this.root.insertBefore(footer, this.status); this.root.classList.toggle('picnic-has-selection', !!this.selected);
    this.showPlayCue(picnicPlayPrompt(scene, this.selected, this.playFeedback, true));
    void resume.save({ screen: 'picnic', params: {} }); bus.emit('activity:idle');
  },
  chooseOutingFood(forPlace = null, page = 0) {
    const overlay = this.dialog('Choose one of our actual fruit portions');
    const scene = picnicState.get().draft, pieces = picnicLivePieces(scene);
    const caption = document.createElement('p'); caption.className = 'picnic-storage-notice'; caption.textContent = 'Choose a piece, then tap a family member or plate. Preparing food stays available.'; overlay.append(caption);
    const pages = Math.max(1, Math.ceil(pieces.length / 8)), index = Math.max(0, Math.min(pages - 1, page));
    for (const piece of pieces.slice(index * 8, (index + 1) * 8)) overlay.append(button(`${piece.units === 1 ? 'Half ' : 'Whole '}${piece.kind}${piece.salad ? ' salad portion' : ''}, currently ${piece.place}`, fruitPicture(piece), () => { if (this.overlay !== overlay || this.saving || this.checkpointing) return; this.selected = piece.id; this.playFeedback = ''; this.closeDialog(); if (forPlace) this.drop(forPlace); else this.paint(); }, 'picnic-ingredient-choice'));
    if (scene.outing) {
      const original = button('See whole toy picture', pictureView(scene.outing.png, null), () => {
        if (this.overlay !== overlay) return;
        this.closeDialog(); this.showOutingOriginal(scene.outing);
      }, 'picnic-tool-choice');
      const label = document.createElement('span'); label.textContent = 'See whole toy picture'; original.append(label); overlay.append(original);
    }
    if (pages > 1) { const nav = document.createElement('nav'); nav.className = 'picnic-saved-pages'; const back = button('Previous fruit portions', iconSVG('back'), () => this.chooseOutingFood(forPlace, index - 1)), next = button('More actual fruit portions', iconSVG('back'), () => this.chooseOutingFood(forPlace, index + 1), 'picnic-next-page'); back.disabled = index === 0; next.disabled = index === pages - 1; nav.append(back, next); overlay.append(nav); }
    if (!pieces.length) overlay.append(button('Prepare more food from our basket', img('assets/art/final/stories/basket.webp'), () => { if (this.overlay !== overlay) return; this.closeDialog(); this.playOuting = false; this.paint(); this.chooseTools(); }));
  },
  chooseOutingArrival() {
    if (!this.pendingOuting || !this.alive) return;
    const overlay = this.dialog('Your river toy can join this picnic'), notice = document.createElement('p'); notice.className = 'picnic-storage-notice';
    notice.textContent = this.pendingOuting.river.outcome?.kind === 'mama' ? 'Mama caught your float. Choose how it joins this meal.' : 'Your river trial can join this meal. Its exact picture and journey stay yours.'; overlay.append(notice);
    const preview = outingFigure(this.pendingOuting); preview.classList.add('picnic-arrival-preview'); overlay.append(preview);
    const add = button('Add only my toy, keeping this cloth, food, invitation and family', outingFigure(this.pendingOuting), () => { if (this.overlay === overlay) void this.acceptOuting(false); }, 'picnic-outing-arrival-choice'); const label = document.createElement('span'); label.textContent = 'Add my toy'; add.append(label); overlay.append(add);
    if (this.pendingOuting.river.mama) { const mama = button('Mama and my toy join: replace only the left guest with Mama', portrait('mama'), () => { if (this.overlay === overlay) void this.acceptOuting(true); }, 'picnic-outing-arrival-choice'); const text = document.createElement('span'); text.textContent = 'Mama + toy'; mama.append(text); overlay.append(mama); }
  },
  async acceptOuting(withMama) {
    if (!this.alive || this.saving || this.checkpointing || this.drag || !this.pendingOuting) return false;
    const visit = this.visit; this.saving = this.arrivalSaving = true;
    try {
      if (!this.pendingAccepted) {
        picnicState.change({ type: 'outing', outing: this.pendingOuting, withMama });
        if (picnicState.lastIssue() === 'capacity') { this.storageRecovery('capacity'); return false; }
        this.pendingAccepted = true; this.playOuting = true;
      } else await picnicState.retry();
      const accepted = await checkpointLivingScene({ flush: () => picnicState.flush(), retry: () => picnicState.retry(), storage: () => db.status(), alive: () => this.alive && this.visit === visit,
        report: text => { if (this.alive && this.visit === visit) this.status.textContent = text; }, subject: 'Your accepted river picnic' });
      if (!this.alive || this.visit !== visit) return false;
      this.closeDialog(); this.paint();
      if (!accepted) { this.storageRecovery('write', () => this.acceptOuting(withMama)); return false; }
      this.pendingOuting = null;
      if (db.status().persistent) this.showPlayCue('Your own toy joined this meal. Share the toy or choose fruit from the basket.');
      else this.status.textContent = 'Your toy joined for now. Device saving is unavailable; keep a Parent copy before closing.';
      return true;
    } catch { if (this.alive && this.visit === visit) this.storageRecovery('write', () => this.acceptOuting(withMama)); return false; }
    finally { if (this.visit === visit) this.saving = this.arrivalSaving = false; }
  },
  async returnToRiver() {
    if (!this.alive || this.saving || this.drag || this.checkpointing) return false;
    const visit = this.visit, outing = picnicState.get().draft.outing;
    if (!outing || !await this.checkpoint() || !this.alive || this.visit !== visit) return false;
    return router.go('river-run', { savedId: outing.id }, { dir: 'right' });
  },
  change(action, phrase) {
    this.stopCafe(); this.cafeGuidance?.interrupt();
    if (!this.alive || this.saving || this.checkpointing) return false;
    const notice = picnicActionNotice(picnicState.get().draft, action);
    if (notice) { this.status.textContent = notice; return false; }
    if (picnicState.change(action)) {
      this.playFeedback = picnicPlayResult(picnicState.get().draft, action, this.playOuting && !this.playCafe);
      this.paint(); sfx.play('pop');
      const cafeCue = this.playCafe ? action.type === 'cut' ? 'living_cafe_halves' : action.type === 'cafe-visitor' ? action.guest ? 'living_cafe_visitor' : 'living_cafe_small' : action.type === 'cafe-performed' ? 'living_cafe_finished' : null : null;
      if (cafeCue) this.cafeGuidance?.after(cafeCue);
      else if (phrase) void speech.say(phrase);
      return true;
    }
    if (picnicState.lastIssue() === 'capacity') this.storageRecovery('capacity');
    return false;
  },
  drop(place) {
    if (!this.selected) return;
    const action = picnicSharingAction(picnicState.get().draft, this.selected, place); if (!action) return;
    if (this.change(action)) { this.selected = ''; this.paint(); }
  },
  pointerDown(event) {
    if (!this.alive || this.checkpointing || this.saving || this.clothBusy) { event.preventDefault(); return; }
    if (event.pointerType === 'pen') {
      this.lastPenAt = performance.now();
      this.suppressClickUntil = 0;
      if (this.drag && this.drag.pointer !== event.pointerId) { const prior = this.drag; this.cancelDrag(); this.rejectedClicks.set(prior.pointer, { target: prior.capture, until: performance.now() + 700 }); }
    }
    const accept = shouldAccept({ pointerType: event.pointerType, lastPenAt: this.lastPenAt, now: performance.now(), allowFinger: !settings.get().penOnly });
    if (!accept || this.drag) {
      this.rejected.set(event.pointerId, event.target.closest('button'));
      event.preventDefault(); return;
    }
    const source = event.target.closest('[data-piece]'); if (!source || event.button !== 0) return;
    this.drag = { id: source.dataset.piece, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false, capture: source };
    // Capture on the original button so a non-drag still clicks that fruit.
    source.setPointerCapture?.(event.pointerId);
  },
  pointerMove(event) {
    const drag = this.drag; if (!drag || drag.pointer !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 12) return;
    drag.moved = true;
    if (!this.ghost) { const p = picnicState.get().draft.pieces.find(p => p.id === drag.id); if (!p) return; this.ghost = fruitPicture(p); this.ghost.classList.add('picnic-drag-ghost'); this.root.append(this.ghost); }
    this.ghost.style.left = event.clientX + 'px'; this.ghost.style.top = (event.clientY - 40) + 'px';
  },
  pointerUp(event) {
    if (this.rejected.has(event.pointerId)) {
      this.rejectedClicks.set(event.pointerId, { target: this.rejected.get(event.pointerId), until: performance.now() + 700 });
      this.rejected.delete(event.pointerId); event.preventDefault(); return;
    }
    const drag = this.drag; if (!drag || drag.pointer !== event.pointerId) return;
    const moved = drag.moved, id = drag.id;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop]');
    this.cancelDrag();
    if (moved) { this.suppressClickUntil = performance.now() + 450; if (target) { if (this.change({ type: 'move', id, place: target.dataset.drop })) { this.selected = ''; this.paint(); } else { this.selected = id; this.paint(); } } }
  },
  cancelDrag() {
    const drag = this.drag; this.drag = null;
    try { if (drag?.capture?.hasPointerCapture?.(drag.pointer)) drag.capture.releasePointerCapture(drag.pointer); } catch (_) {}
    this.ghost?.remove(); this.ghost = null; bus.emit('activity:idle');
  },
  finishPointer() {
    if (this.drag) this.rejectedClicks.set(this.drag.pointer, { target: this.drag.capture, until: performance.now() + 700 });
    this.cancelDrag();
  },
  dialog(label) {
    this.cafePictureAbort?.abort(); this.cafePictureAbort = null;
    this.stopCafe(); this.cafeGuidance?.interrupt(); speech.cancel();
    this.finishPointer();
    this.overlay?.remove(); this.dialogReturn = document.activeElement;
    const overlay = document.createElement('section'); overlay.className = 'picnic-picker'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', label);
    const close = button(this.playCafe ? 'Return to our café' : 'Return to our picnic', iconSVG('back'), () => { if (this.overlay === overlay) this.closeDialog(); }); overlay.append(close);
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.closeDialog(); }
      if (event.key === 'Tab') {
        const buttons = [...overlay.querySelectorAll('button:not(:disabled)')], first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus?.(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus?.(); }
      }
    });
    this.root.append(overlay); this.overlay = overlay; close.focus?.(); return overlay;
  },
  closeDialog() {
    this.cafePictureAbort?.abort(); this.cafePictureAbort = null;
    this.stopCafe();
    this.overlay?.remove(); this.overlay = null; this.dialogReturn?.focus?.(); this.dialogReturn = null;
    this.inviteCafe?.();
  },
  chooseTools() {
    const overlay = this.dialog('Our picnic basket');
    const option = (label, art, action) => {
      const choice = button(label, art, () => { if (this.overlay !== overlay) return; this.closeDialog(); action(); }, 'picnic-tool-choice');
      const caption = document.createElement('span'); caption.textContent = label; choice.append(caption); overlay.append(choice);
    };
    option('Our cloth', iconSVG('art'), () => this.chooseCloth());
    option('Bowl fruit', img('assets/art/final/props/picnic-round-bowl-v1.png'), () => this.chooseIngredients());
    option('More fruit', img(fruitPath('apple')), () => { this.selected = ''; this.change({ type: 'more' }); });
    option(this.playCafe ? 'Prepare on our picnic cloth' : 'Our Garden Café', img(CAFE_ART.table), () => {
      if (!this.playCafe) picnicState.change({ type: 'cafe-open' });
      this.playCafe = !this.playCafe; this.playOuting = false; this.selected = '';
      if (!this.playCafe) { this.cafeGuidance?.dispose(); this.cafeGuidance = null; }
      this.paint(); if (this.playCafe) this.cafeGuidance?.guide(false);
    });
    if (picnicState.get().draft.outing) {
      option('Our river trip', outingFigure(picnicState.get().draft.outing), () => { void this.returnToRiver(); });
      const outing = picnicState.get().draft.outing;
      option('See whole toy picture', pictureView(outing.png, null), () => this.showOutingOriginal(outing));
      option('Put toy away', iconSVG('back'), () => { this.change({ type: 'outing-remove' }); this.playOuting = false; this.paint(); });
    }
  },
  showOutingOriginal(outing) {
    const viewer = this.dialog('Your whole toy picture, unchanged');
    viewer.append(pictureView(outing.png, null, 'garden-cafe-original', 'Your whole original toy picture, unchanged'));
  },
  help() {
    if (this.playCafe) {
      const scene = picnicState.get().draft;
      const overlay = this.dialog('Show me how to play in our café');
      const instructions = this.cafeArranging
        ? [[img(CAFE_ART.chair), 'Choose a pictured place'], [img(CAFE_ART.background), 'Tap a new spot in the garden']]
        : this.selected
          ? [[portrait(scene.guests[0]), 'Tap a plate to share'], [img(fruitPath('apple')), 'Or tap Chosen to cut or use the bowl']]
          : [[portrait(scene.guests[0]), 'Tap a person to invite family'], [img('assets/art/final/stories/basket.webp'), 'Tap Food, then choose fruit'], [img(CAFE_ART.table), 'Tap a plate to share it']];
      const steps = document.createElement('div'); steps.className = 'picnic-help-steps';
      for (const [picture, label] of instructions) { const step = document.createElement('div'); step.append(picture); const caption = document.createElement('span'); caption.textContent = label; step.append(caption); steps.append(step); }
      overlay.append(steps); void speech.say(this.cafeGuidance?.guideKey(true) || 'living_cafe_intro'); return;
    }
    const overlay = this.dialog('Show me how to prepare and share');
    const steps = document.createElement('div'); steps.className = 'picnic-help-steps';
    const scene = picnicState.get().draft;
    for (const [art, label] of [[img(fruitPath('apple')), 'Choose fruit'], [portrait(scene.guests[0]), 'Tap a friend or plate'], [img('assets/art/final/props/picnic-round-bowl-v1.png'), 'Or make a fruit bowl']]) {
      const step = document.createElement('div'); step.append(art); const caption = document.createElement('span'); caption.textContent = label; step.append(caption); steps.append(step);
    }
    overlay.append(steps); speech.say('picnic_help');
  },
  chooseIngredients() {
    const overlay = this.dialog('Choose a fruit from our bowl');
    for (const piece of picnicLivePieces(picnicState.get().draft, 'bowl')) overlay.append(button('Choose ' + (piece.units === 1 ? 'half ' : '') + piece.kind, fruitPicture(piece), () => {
      if (this.overlay !== overlay) return;
      this.selected = piece.id; this.closeDialog(); this.paint();
    }, 'picnic-ingredient-choice'));
  },
  chooseGuest(slot) {
    const overlay = this.dialog('Invite a family member');
    for (const guest of PICNIC_GUESTS) overlay.append(button('Invite ' + GUESTS[guest][0], portrait(guest), () => {
      if (this.overlay !== overlay) return;
      this.change({ type: 'guest', slot, guest }); this.closeDialog();
    }, 'picnic-guest-choice'));
  },
  async chooseCloth() {
    if (!this.alive || this.checkpointing) return;
    this.finishPointer();
    const visit = this.visit, overlay = this.dialog('Choose your own drawing for our picnic cloth');
    const loading=document.createElement('p');loading.textContent='Opening your pictures…';overlay.append(loading);
    let rows;
    try { rows=(await gallery.listChecked()).filter(isCreationRow).slice(0,12); }
    catch { if (this.alive && visit===this.visit && this.overlay===overlay && !this.checkpointing) { loading.textContent='Your cloth is still here. Pictures could not be opened.';const retry=button('Try opening your pictures again',iconSVG('next'),()=>{if(this.overlay===overlay)void this.chooseCloth();});retry.dataset.pictureRetry='';const caption=document.createElement('span');caption.textContent='Try again';retry.append(caption);overlay.append(retry); } return; }
    if (!this.alive || visit !== this.visit || this.overlay!==overlay || this.checkpointing) return;
    loading.remove();
    if (!db.status().persistent) { const warning=document.createElement('p');warning.textContent='Pictures saved on this device may be unavailable right now. Ask a grown-up to check storage before closing.';overlay.append(warning); }
    for (const row of rows) overlay.append(button('Use my ' + (row.id || 'picture') + ' as the picnic cloth', img(row.png), async () => {
      if (this.clothBusy) return; this.clothBusy = true;
      try {
        const used = await picnicState.useCloth(row);
        if (!this.alive || visit !== this.visit) return;
        if (used) { this.paint(); overlay.remove(); this.overlay = null; if (picnicState.lastIssue() === 'temporary') this.storageRecovery('temporary'); }
        else this.storageRecovery(picnicState.lastIssue(), () => this.chooseCloth());
      } finally { if (visit === this.visit) this.clothBusy = false; }
    }, 'picnic-cloth-choice'));
    overlay.append(button('Make a picture in Rainbow Studio', iconSVG('art'), () => { if (this.alive && visit === this.visit && !this.checkpointing) void router.go('studio'); }));
    overlay.append(button('Use our original picnic cloth', iconSVG('undo'), () => { if(this.overlay!==overlay)return;this.change({ type: 'cloth', asset: '' }); this.closeDialog(); }));
  },
  chooseSaved(page = 0) {
    const overlay = this.dialog('Our kept picnics and cafés');
    const state = picnicState.get(), slice = picnicSavedPage(state.saves, page);
    const pages = document.createElement('div'); pages.className = 'picnic-saved-pages';
    const previous = button('Previous saved picnics', iconSVG('back'), () => this.chooseSaved(slice.page - 1)); previous.disabled = slice.page === 0;
    const position = document.createElement('span'); position.textContent = `${slice.page + 1} / ${slice.count}`; position.setAttribute('aria-label', `Page ${slice.page + 1} of ${slice.count}`);
    const next = button('Next saved picnics', iconSVG('back'), () => this.chooseSaved(slice.page + 1), 'picnic-next-page'); next.disabled = slice.page + 1 === slice.count;
    pages.append(previous, position, next); overlay.append(pages);
    for (const saved of slice.rows) {
      const picture = this.tablePreview(saved.scene, state.assets);
      overlay.append(button('Reopen ' + (saved.scene.cafe ? 'café' : 'picnic') + ' from ' + new Date(saved.at).toLocaleDateString(), picture, () => {
        if (picnicState.reopen(saved.id)) { this.selected = ''; this.playFeedback = ''; this.playCafe = !!picnicState.get().draft.cafe; this.playOuting = !this.playCafe && !!picnicState.get().draft.outing; this.paint(); overlay.remove(); this.overlay = null; }
        else if (picnicState.lastIssue() === 'capacity') this.storageRecovery('capacity');
      }, 'picnic-saved-choice'));
    }
  },
  tablePreview(scene, assets) {
    if (scene.cafe) {
      const preview = document.createElement('span'); preview.className = 'garden-cafe-preview'; preview.setAttribute('aria-hidden', 'true'); preview.append(img(CAFE_ART.background));
      for (const [index, place] of ['left', 'right', ...(scene.cafe.visitor ? ['visitor'] : [])].entries()) {
        const guest = place === 'visitor' ? scene.cafe.visitor : scene.guests[index], seat = scene.cafe.seats[place];
        const unit = document.createElement('span'); unit.className = 'garden-cafe-preview-place'; unit.style.left = seat.x * 100 + '%'; unit.style.top = seat.y * 100 + '%'; unit.style.zIndex = String(Math.round(seat.y * 100));
        unit.append(portrait(guest), img(CAFE_ART.table, 'garden-cafe-preview-table'));
        const food = document.createElement('span'); food.className = 'garden-cafe-preview-food'; for (const piece of picnicLivePieces(scene, place)) food.append(fruitPicture(piece)); unit.append(food); preview.append(unit);
      }
      const sign = assets.find(asset => asset.id === scene.cafe.sign.asset);
      const picture = pictureView(sign?.png || 'assets/art/final/stickers/draw_flower.webp',scene.cafe.sign.frame,'garden-cafe-preview-sign'); picture.style.left = scene.cafe.sign.x * 100 + '%'; picture.style.top = Math.max(.26, scene.cafe.sign.y) * 100 + '%'; preview.append(picture); return preview;
    }
    const picture = document.createElement('span'); picture.className = 'picnic-saved-preview'; picture.setAttribute('aria-hidden', 'true');
    const cloth = assets.find(a => a.id === scene.cloth); if (cloth) picture.append(img(cloth.png, 'picnic-preview-cloth'));
    if (scene.invitation) picture.append(img(scene.invitation.png, 'picnic-preview-invitation'));
    if (scene.outing) { const toy = outingFigure(scene.outing); toy.classList.add('picnic-preview-outing'); picture.append(toy); }
    const people = document.createElement('span'); people.className = 'picnic-preview-people';
    for (const [index, place] of ['left', 'right'].entries()) {
      const person = document.createElement('span'); person.append(portrait(scene.guests[index]));
      const plate = document.createElement('span'); plate.className = 'picnic-preview-plate'; plate.append(img('assets/art/final/props/picnic-round-plate-v1.png'));
      const food = document.createElement('span'); food.className = 'picnic-preview-food';
      for (const piece of scene.pieces.filter(p => p.place === place)) { const fruit = fruitPicture(piece); if (piece.eaten) fruit.classList.add('was-enjoyed'); food.append(fruit); }
      plate.append(food); person.append(plate); people.append(person);
    }
    const table = document.createElement('span'); table.className = 'picnic-preview-table';
    const board = document.createElement('span'); board.className = 'picnic-preview-board';
    for (const piece of picnicLivePieces(scene, 'board')) board.append(fruitPicture(piece));
    const bowl = document.createElement('span'); bowl.className = 'picnic-preview-bowl'; bowl.append(img('assets/art/final/props/picnic-round-bowl-v1.png'));
    const ingredients = document.createElement('span'); ingredients.className = 'picnic-preview-food';
    for (const piece of picnicLivePieces(scene, 'bowl')) ingredients.append(fruitPicture(piece));
    bowl.append(ingredients); table.append(board, bowl); picture.append(people, table); return picture;
  },
  async save() {
    this.stopCafe();
    this.finishPointer();
    if (this.saving || this.checkpointing || !this.alive) return; this.saving = true;
    const visit = this.visit;
    try { const saved = await picnicState.saveTable(); if (this.alive && visit === this.visit) {
      if (saved.persistent) {
        const message = this.playCafe ? 'Your café, picture, places, meal and rhythm are kept. You can change them again.' : 'Your picnic is saved. You can change it again.';
        if (this.playOuting && !this.playCafe) this.showPlayCue(message); else this.status.textContent = message;
        if (this.playCafe) this.cafeGuidance?.after('living_cafe_saved'); else void speech.say('picnic_saved');
      }
      else this.storageRecovery('temporary', () => this.save());
    } }
    catch (error) { if (this.alive && visit === this.visit) this.storageRecovery(error.code || 'write', () => this.save()); }
    finally { if (visit === this.visit) { this.saving = false; bus.emit('activity:idle'); } }
  },
  storageRecovery(code, retry) {
    const messages = {
      'picture-size': 'That picture is too large for a cloth. Choose a smaller picture. Your original is safe.',
      'invalid-picture': 'This picture cannot be used as a cloth. Choose another picture. Your original is safe.',
      'tables-full': 'All 1,000 picnic places are kept. You can reopen one, or download your picnic copy. Nothing was removed.',
      capacity: 'These picnic pictures need more storage room. Download your picnic copy, or choose a smaller cloth. Your kept tables are safe.',
      temporary: 'This picnic is only here while the app stays open. Download your picnic copy before leaving.',
      write: 'The picnic could not be saved. Keep it open, download your picnic copy, or try again.',
    };
    const message = messages[code] || messages.write; this.status.textContent = message;
    const overlay = this.dialog('Keep our picnic safe');
    const notice = document.createElement('p'); notice.className = 'picnic-storage-notice'; notice.textContent = message; overlay.append(notice);
    overlay.append(button('Download a local copy of all our picnic tables and pictures', iconSVG('save'), () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: 'rayna-valley-picnic-copy', version: 1, savedWorld: { v: 1, id: savedWorld.id }, picnic: picnicState.get() })], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'our-picnic-copy.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    if (retry) overlay.append(button('Try again', iconSVG('undo'), () => { overlay.remove(); this.overlay = null; retry(); }));
    overlay.append(button('Open our kept picnic tables', iconSVG('book'), () => this.chooseSaved()));
  },
  leave(destination = this.enteredFromMap ? 'map' : 'treehouse') { if (!this.alive || this.checkpointing) return false; return router.go(destination, {}, { dir: 'right' }); },
  onBack() { void this.leave(); },
  breakBusy() { return !!this.drag || this.saving || this.clothBusy || this.checkpointing; },
  beforeLeave() { return this.checkpoint(); },
  beforeBreak() { return this.checkpoint(); },
  checkpoint() {
    this.cafePictureAbort?.abort(); this.cafePictureAbort = null;
    this.stopCafe();
    if (!this.alive) return Promise.resolve(false);
    if (this.initialOpenPending) { const visit=this.visit; return picnicState.flush().then(() => this.alive && this.visit===visit, () => { if (this.alive && this.visit===visit) { const text=this.host?.querySelector('.picnic-load-recovery')?.querySelector('p'); if (text) text.textContent='Your picnic could not finish saving. Try again before leaving.'; } return false; }); }
    if (this.checkpointPromise) return this.checkpointPromise;
    // A held fruit has not entered typed state yet. Leave its owning pointer
    // and ghost intact, so releasing it still commits the child's placement.
    if (this.drag || this.saving || this.clothBusy) {
      if (this.status) this.status.textContent = this.drag ? 'Finish placing the fruit, then try again. Your move is still here.' : 'Your picnic is still being prepared. Try again when it is ready.';
      return Promise.resolve(false);
    }
    const visit = this.visit;
    if (this.status) this.status.textContent = '';
    this.checkpointing = true;
    const pending = checkpointLivingScene({ flush: () => picnicState.flush(), retry: () => picnicState.retry(), storage: () => db.status(),
      alive: () => this.alive && visit === this.visit, held: () => !!this.drag || this.saving || this.clothBusy,
      report: message => { if (this.alive && visit === this.visit && this.status) this.status.textContent = message; }, subject: 'Your current picnic' });
    this.checkpointPromise = pending.finally(() => {
      if (this.alive && visit === this.visit) { this.checkpointing = false; this.checkpointPromise = null; }
    });
    return this.checkpointPromise;
  },
  unmount() {
    this.clearFruitHint();
    this.cafePictureAbort?.abort(); this.cafePictureAbort = null;
    this.stopCafe(); this.cafeGuidance?.dispose(); this.cafeGuidance = null; this.offCafeMute?.(); this.offCafeBreak?.();
    this.alive = false; this.initialOpenPending = false; this.openingPicnic = false; this.visit = {}; this.cancelDrag(); speech.cancel(); this.mute?.destroy?.();
    document.removeEventListener('visibilitychange', this.onHide); window.removeEventListener('blur', this.onHide);
    this.resizeObserver?.disconnect(); window.removeEventListener('resize', this.updateViewport);
    void picnicState.flush().catch(() => {}); this.root = null;
  },
};
