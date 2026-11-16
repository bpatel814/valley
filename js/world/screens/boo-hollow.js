// A child's exact drawing wakes up in the same Character life layers used by
// the valley cast. Originals belong to the shared gallery, never this screen.
import { installIdleHelp } from '../idle-help.js';
import { installControlCue } from '../control-cue.js';
import session from '../../state/session.js';
import router, { homeButton, muteButton, iconSVG, tapify } from '../router.js';
import { addScenery } from '../scene.js';
import art from '../art.js';
import bus from '../bus.js';
import { Character } from '../characters.js';
import { mountCreationFrame } from '../creation-frame.js';
import { WorkshopVisit, workshopGeometry } from './toy-workshop.js';
import { Tracer } from '../../engine/tracer.js';
import { glyphBox } from '../../engine/guide.js';
import settings from '../../state/settings.js';
import { temporaryDemo } from '../../state/saved-world.js';
import { valleyProfile } from '../../data/valley-profiles.js';
import { halloweenActive, seasonHero } from '../../data/season.js';
import { loadBooHollow, saveBooDraft, clearBooDraft, createBooGhost, saveBooDoor,
  saveBooDoorDraft, clearBooDoorDraft, createBooDoorPicture, flushBooHollowWrites, booHollowStatus } from '../../state/boo-hollow.js';
import { BOO_GLYPH, BOO_MODES, BOO_BA_DOOR, booMode, booHasAttempt,
  booDrawingOptions, booDoorProgress, booNextTreat, booPaperSize, booFace,
  BOO_FAMILY_DOORS, BOO_PUMPKIN_GLYPH, BOO_PUMPKIN_ART, booFamilyDoor, booHasDoorInk, booSharingProgress } from '../../data/boo-hollow.js';
import speech from '../../audio/speech.js';
import sfx from '../../audio/sfx.js';

const NS = 'http://www.w3.org/2000/svg';
let actorFilterSerial = 0;
const GHOST_ICON = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M22 82V45C22 6 78 6 78 45V82Q68 70 59 81Q50 70 40 81Q30 70 22 82Z" fill="#fffdf7" stroke="#b49dc8" stroke-width="4" stroke-linejoin="round"/><ellipse cx="39" cy="45" rx="3.4" ry="4.3" fill="#6b596c"/><ellipse cx="61" cy="45" rx="3.4" ry="4.3" fill="#6b596c"/><ellipse cx="31" cy="55" rx="6" ry="3.5" fill="#f2bfd0"/><ellipse cx="69" cy="55" rx="6" ry="3.5" fill="#f2bfd0"/><path d="M45 59Q50 65 55 59" fill="none" stroke="#9f7e9e" stroke-width="3" stroke-linecap="round"/></svg>';
const CANDY_ICON = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M28 36L9 28L14 50L9 72L29 64M72 36L91 28L86 50L91 72L71 64" fill="#e9d8f2" stroke="#a98cad" stroke-width="3" stroke-linejoin="round"/><rect x="25" y="28" width="50" height="44" rx="17" fill="#f4b8c8" stroke="#a47891" stroke-width="3"/><path d="M42 30L35 69M62 30L55 70" stroke="#fff0d5" stroke-width="9"/><path d="M35 36Q40 32 48 34" fill="none" stroke="#fffaf1" stroke-width="4" stroke-linecap="round"/></svg>';
const BUCKET_ICON = '<svg viewBox="0 0 150 150" aria-hidden="true"><path d="M41 57C37 4 113 4 109 57" fill="none" stroke="#b88a70" stroke-width="10"/><path d="M19 53H131L120 133Q75 151 30 133Z" fill="#f3c990" stroke="#ac826b" stroke-width="5" stroke-linejoin="round"/><path d="M33 68Q75 78 118 68" fill="none" stroke="#ffe9be" stroke-width="6"/></svg>';
const HAND_ICON = '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M27 43V20Q27 10 35 13Q39 14 39 21V32Q43 25 49 30Q57 27 60 35Q69 34 69 43L62 65Q45 77 29 65L15 49Q11 43 16 39Q20 37 27 43Z" fill="#ffe1bd" stroke="#a17f6b" stroke-width="4" stroke-linejoin="round"/><path d="M10 20L17 25M48 8L46 17M65 18L59 24" fill="none" stroke="#dab773" stroke-width="4" stroke-linecap="round"/></svg>';
const HEART_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 55L9 32C-2 17 19 4 32 18C45 4 66 17 55 32Z" fill="currentColor"/></svg>';

function makeAttempt() { return `boo:${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`; }
function svgNode(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}
function image(key, className = '', alt = '') {
  const source = art.get(key);
  const node = source?.cloneNode() || document.createElement('img');
  if (!source) node.src = `assets/art/final/${key}.png`;
  node.className = className; node.alt = alt; node.draggable = false;
  return node;
}

// A nonverbal invitation is decoration inside the existing safe action target.
export function addGhostStartCue(button) {
  const hand=document.createElement('span'); hand.className='boo-start-hand';
  hand.setAttribute('aria-hidden','true'); hand.innerHTML=HAND_ICON; button.append(hand);
}

// Dada asks for a face, so a stationary eye-dot is real ink. Keep the native
// InkLayer, input, snapshot, edits and resize; skip the letter-specific tap test.
export function finishBooFaceStroke(tracer, info = {}) {
  tracer._touched?.();
  if (info.discarded) tracer.ink.undo(); else tracer.ink.end();
  bus.emit('stroke:end', info.discarded ? { cancelled: true, discarded: true } : {});
  tracer.onStrokeEnd(tracer.ink.strokes()); tracer._flushResize?.();
}

export class BooHollowScreen {
  constructor() { this.id = 'boo-hollow'; this.visit = new WorkshopVisit(); this._view = 0; }

  async mount(host) {
    const token = this.visit.begin();
    this._companionId = null; this._companionReturn = null;
    this.host = host; this._busy = false; this._issue = ''; this._view = 0; this._actors = []; this._motions = [];
    this._timers = []; this._offs = []; this._draftPending = Promise.resolve(true); this._doorPending = null;
    this._checkpointing = false;
    this._pendingFinish = null; this._recent = null; this._page = 0; this._lastBoo = -Infinity;
    const root = this.root = document.createElement('div'); root.className = 'boo-hollow';
    const header = document.createElement('header'); header.className = 'boo-header';
    this.back = this._button('back to Boo Hollow', iconSVG('back'), () => this.onBack());
    this.back.className = 'btn btn--peach boo-back';
    this.home = homeButton(); this.mute = muteButton();
    const title = document.createElement('h1'); title.textContent = 'Boo Hollow';
    header.append(this.home, this.back, title, this.mute);
    this.main = document.createElement('main'); this.main.className = 'boo-main';
    this.notice = document.createElement('div'); this.notice.className = 'boo-notice'; this.notice.hidden = true;
    this.notice.setAttribute('role', 'status'); this.notice.setAttribute('aria-live', 'polite');
    root.append(header, this.main, this.notice); host.append(root); addScenery(root, 'map', { foreground: false });
    this._offSettings = bus.on('settings:changed', () => { this._applySettings(); });
    this._resize = () => { this._layoutPaper(); this._layoutActors(); };
    window.addEventListener('resize', this._resize);
    this._applySettings();
    try { this.model = await loadBooHollow(); }
    catch (error) {
      if (!this.visit.valid(token)) return;
      this._report(error, () => this._reload(), 'try opening Boo Hollow again'); return;
    }
    if (!this.visit.valid(token)) return;
    this._renderHollow(); this._say(this.model.ghosts.some(ghost => ghost.png) ? 'halloween_boo_return' : 'halloween_boo_welcome');
  }

  async _reload() {
    if (this._busy) return;
    this._busy = true; const token = this.visit.serial;
    try {
      const model = await loadBooHollow();
      if (!this.visit.valid(token)) return false;
      this.model = model; this._clearIssue(); this._renderHollow(); return true;
    } catch (error) { if (this.visit.valid(token)) this._report(error, () => this._reload(), 'try opening Boo Hollow again'); return false; }
    finally { if (this.visit.valid(token)) this._busy = false; }
  }

  _button(label, icon, action, text = '') {
    const node = document.createElement('button'); node.type = 'button'; node.className = 'boo-button tap';
    node.setAttribute('aria-label', label); node.innerHTML = icon;
    if (text) { const span = document.createElement('span'); span.textContent = text; node.append(span); }
    const view = this._view, token = this.visit.serial;
    tapify(node, event => {
      if (!this.visit.valid(token) || !node.isConnected || this._busy || this._checkpointing || router.isMoving() || view !== this._view && !node.closest('.boo-header')) return;
      if (this._liftSettling && !node.classList.contains('boo-lift-undo') && !node.closest('.boo-header')) return;
      action(event);
    });
    return node;
  }

  _say(key) { speech.cancel(); void speech.say(key); }
  _reduced() { return !!settings.get().reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  _applySettings() {
    if (!this.root) return;
    this.root.dataset.reduced = String(this._reduced());
    this.tracer?.setAllowFinger?.(!settings.get().penOnly);
    if (this._reduced()) for (const motion of this._motions || []) motion.cancel();
  }
  _later(action, ms) {
    const token = this.visit.serial, view = this._view;
    const timer = setTimeout(() => { if (this.visit.valid(token) && view === this._view) action(); }, ms);
    this._timers.push(timer); return timer;
  }
  _report(error, retryAction = () => this.beforeLeave(), label = 'try saving my marks again') {
    if (!this.visit.active) return;
    this._issue = error?.message || booHollowStatus().issue || 'Your marks are still here. Try saving again.';
    this.notice.replaceChildren();
    const text = document.createElement('span'); text.textContent = this._issue; this.notice.append(text);
    const retry = this._button(label, iconSVG('replay'), () => { void retryAction(); }, 'Try again');
    retry.classList.add('boo-retry'); this.notice.append(retry); this.notice.hidden = false;
  }
  _clearIssue() { this._issue = ''; if (this.notice) { this.notice.hidden = true; this.notice.replaceChildren(); } }

  _clearView() {
    this._trailIdleHelp?.(); this._trailIdleHelp = null;
    this._peekIdleHelp?.(); this._peekIdleHelp = null;
    this._stopTrailDance(); this._trailPattern = [];
    ++this._view;
    this._liftSettling = false;
    this._clearIssue();
    this._boardObserver?.disconnect(); this._boardObserver = null; this._boardSize = null;
    this._destroyTracer();
    for (const off of this._offs || []) off(); this._offs = [];
    for (const timer of this._timers || []) clearTimeout(timer); this._timers = [];
    for (const motion of this._motions || []) { try { motion.cancel(); } catch {} } this._motions = [];
    for (const actor of this._actors || []) actor.character.destroy(); this._actors = [];
    this.frame?.destroy(); this.frame = null;
    this._trailLights = []; this._trailButtons = [];
    this._peekButtons = []; this._peekGhost = null;
    this.main?.replaceChildren(); this.board = null; this.paper = null; this.paperStage = null; this._finishButton = null;
  }

  _renderHollow(lift = null) {
    this._clearView(); this.view = 'hollow'; this.back.setAttribute('aria-label', 'back to the valley');
    this._liftSettling = !!lift;
    const place = document.createElement('div'); place.className = 'boo-place';
    const board = this.board = document.createElement('div'); board.className = 'boo-board';
    board.setAttribute('role', 'group'); board.setAttribute('aria-label', 'Your ghost friends live here. Tap a place and they float with you.');
    if (halloweenActive(settings.get()) && art.has('halloween/boo-hollow-background-v1')) board.append(image('halloween/boo-hollow-background-v1', 'boo-backdrop'));
    const profile = valleyProfile(settings.get().valleyProfile), hero = seasonHero(profile, settings.get());
    board.append(image(art.has(hero.art) ? hero.art : profile.heroArt, 'boo-child', art.has(hero.art) ? hero.alt : profile.heroAlt));
    const footprints = document.createElement('div'); footprints.className = 'boo-footprints'; footprints.setAttribute('aria-hidden', 'true'); footprints.textContent = '●  ●  ●'; board.append(footprints);
    const house = this._button('visit our family doors', '', () => this._showLane()); house.classList.add('boo-path-house');
    const badge = document.createElement('span'); badge.className = 'boo-ba-badge';
    badge.append(image(BOO_BA_DOOR.art, 'boo-ba-portrait', 'Ba'));
    house.append(image(art.has(BOO_BA_DOOR.doorArt) ? BOO_BA_DOOR.doorArt : 'stickers/draw_house'), badge);
    const sign = document.createElement('span'); sign.textContent = 'Family'; house.append(sign); board.append(house);
    const friends = this.model.ghosts.filter(ghost => ghost.png && !ghost.missingOriginal);
    const perPage = 3, pages = Math.max(1, Math.ceil(friends.length / perPage));
    this._page = Math.min(this._page || 0, pages - 1);
    const shown = friends.slice().reverse().slice(this._page * perPage, (this._page + 1) * perPage);
    shown.forEach((ghost, index) => this._makeGhost(ghost, { x: shown.length === 1 ? .48 : .30 + index * .19, y: index % 2 ? .30 : .48 }));
    if (!friends.length) {
      const create = this._button('make a ghost friend', GHOST_ICON, () => this._showModes()); create.classList.add('boo-empty-create'); addGhostStartCue(create); board.append(create);
    }
    const actions = document.createElement('footer'); actions.className = 'boo-place-actions';
    actions.append(this._button('draw a ghost friend', GHOST_ICON, () => this._showModes(), 'Make a friend'));
    if (this._recent) {
      const undo = this._button('undo the lift and keep drawing a new version; my saved ghost stays', iconSVG('undo'), () => { void this._editRecent(); });
      undo.classList.add('boo-lift-undo'); board.append(undo);
    }
    actions.append(this._button('visit Ba, Dada, Veer and Ishan', HAND_ICON, () => this._showLane(), 'Family doors'));
    if (friends.length) actions.append(this._button('play a lantern walk with my ghost friends', iconSVG('star'), () => this._renderTrail(), 'Play together'));
    actions.append(this._button('go to Explore and the Discovery Glade', iconSVG('next'), () => { void router.go('discovery'); }, 'Explore'));
    if (pages > 1) actions.append(this._button('more ghost friends', iconSVG('next'), () => { this._page = (this._page + 1) % pages; this._renderHollow(); }));
    place.append(board, actions); this.main.append(place);
    this.frame = mountCreationFrame(board);
    const follow = event => {
      if (event.target.closest('button') || this.frame?.busy() || this._busy || this._checkpointing || this._liftSettling || this.view !== 'hollow') return;
      this._follow(event.clientX, event.clientY);
    };
    board.addEventListener('click', follow); this._offs.push(() => board.removeEventListener('click', follow));
    this._layoutActors();
    if (typeof ResizeObserver !== 'undefined') {
      this._boardObserver = new ResizeObserver(() => this._layoutActors()); this._boardObserver.observe(board);
    }
    if (lift) {
      // Finish and a newly placed destination can occupy the same touch point.
      // Let the lift finish before a second release can enter that destination;
      // Undo and the permanent header exits remain usable during the lift.
      const nextActions = [house, ...actions.querySelectorAll('button')];
      nextActions.forEach(button => { button.disabled = true; });
      this._later(() => { this._liftSettling = false; nextActions.forEach(button => { button.disabled = false; }); }, 900);
      this._liftFromPaper(lift);
    }
  }

  // A small child-led play space: each lantern is a destination, never a test.
  // Only actor positions change; original pictures and saved progress are untouched.
  _renderTrail() {
    const friends = this.model.ghosts.filter(ghost => ghost.png && !ghost.missingOriginal)
      .slice().reverse().slice((this._page || 0) * 3, ((this._page || 0) + 1) * 3);
    if (!friends.length) { this._renderHollow(); return; }
    this._clearView(); this.view = 'trail';
    this.back.setAttribute('aria-label', 'back to my ghost friends');
    const place = document.createElement('div'); place.className = 'boo-place boo-trail';
    const board = this.board = document.createElement('div'); board.className = 'boo-board boo-trail-board';
    board.setAttribute('role', 'group'); board.setAttribute('aria-label', 'Lead your own ghost friends to a lantern');
    const stops = [
      { label: 'float to the leaf lantern', symbol: 'leaf', x: .22, y: .56 },
      { label: 'float to the star lantern', symbol: 'star', x: .50, y: .30 },
      { label: 'float to the heart lantern', symbol: 'heart', x: .78, y: .56 },
    ];
    this._trailStops = stops;
    this._trailLights = stops.map((stop, index) => {
      const light = this._button(stop.label, iconSVG(stop.symbol), () => this._visitLantern(index, stop));
      light.className = 'boo-trail-light tap'; light.setAttribute('aria-pressed', 'false');
      light.style.left = `${stop.x * 100}%`; light.style.top = `clamp(34px, ${stop.y * 100}%, calc(100% - 34px))`;
      board.append(light); return light;
    });
    friends.forEach((ghost, index) => this._makeGhost(ghost, { x: .35 + index * .15, y: .70 }));
    const actions = document.createElement('footer'); actions.className = 'boo-place-actions boo-trail-actions';
    this._trailButtons = this._trailLights;
    this._danceButton = this._button('play my lantern dance once', iconSVG('replay'), () => this._trailPlaying ? this._stopTrailDance() : this._playTrailDance(), 'Our dance');
    this._danceButton.disabled = true;
    actions.append(this._danceButton, this._button('clear my lantern dance', iconSVG('clear'), () => { this._stopTrailDance(); this._trailPattern = []; this._danceButton.disabled = true; }, 'New dance'));
    actions.append(this._button('play peekaboo with my own ghost drawing', GHOST_ICON, () => this._renderPeek(), 'Peekaboo'));
    actions.append(this._button('back to my ghost friends', iconSVG('home'), () => this._renderHollow(), 'Home together'));
    place.append(board, actions); this.main.append(place); this._layoutActors();
    this._installTrailIdleHelp();
    if (typeof ResizeObserver !== 'undefined') {
      this._boardObserver = new ResizeObserver(() => this._layoutActors()); this._boardObserver.observe(board);
    }
  }

  _trailHelpActive(token, view) {
    return this.visit.valid(token) && view === this._view && this.view === 'trail' &&
      router.current() === 'boo-hollow' && !router.isMoving() && !session.isBreakLocked() &&
      !this._busy && !this._checkpointing && !this._issue && !this._trailPlaying &&
      !this.frame?.busy() && !speech.isSpeaking();
  }

  _installTrailIdleHelp(clock = {}) {
    this._trailIdleHelp?.();
    const token = this.visit.serial, view = this._view;
    const schedule = clock.delay || setTimeout, cancel = clock.cancel || clearTimeout;
    this._trailIdleHelp = installIdleHelp(this.root || this.main, {
      active: () => this._trailHelpActive(token, view),
      demonstrate: () => {
        // All lanterns are equally valid. After a lantern is chosen, point to
        // the existing replay control without triggering the child's dance.
        const targets = this._trailPattern?.length ? [this._danceButton] : this._trailButtons;
        const visible = targets.filter(node => node && !node.disabled && node.isConnected);
        visible.forEach(node => node.classList.add('boo-idle-target'));
        let done = false;
        const clear = () => { if (done) return; done = true; visible.forEach(node => node.classList.remove('boo-idle-target')); };
        const timer = schedule(clear, 2400);
        return () => { cancel(timer); clear(); };
      }, ...clock,
    });
  }

  _visitLantern(index, stop, replay = false) {
    if (this.view !== 'trail' || this._busy || this._checkpointing) return;
    if (!replay) {
      this._stopTrailDance();
      this._trailPattern = [...(this._trailPattern || []), index].slice(-6);
      if (this._danceButton) this._danceButton.disabled = false;
    }
    const rect = this.board.getBoundingClientRect();
    this._trailLights.forEach((light, i) => light.classList.toggle('is-lit', i === index));
    this._trailButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    this._follow(rect.left + rect.width * stop.x, rect.top + rect.height * stop.y);
  }

  _setTrailPlaying(playing) {
    this._trailPlaying = playing;
    if (!this._danceButton) return;
    this._danceButton.setAttribute('aria-label', playing ? 'stop my lantern dance' : 'play my lantern dance once');
    this._danceButton.innerHTML = iconSVG(playing ? 'stop' : 'replay') + `<span>${playing ? 'Stop dance' : 'Our dance'}</span>`;
  }

  _stopTrailDance() {
    this._trailDanceEpoch = (this._trailDanceEpoch || 0) + 1;
    if (this._trailDanceTimer != null) clearTimeout(this._trailDanceTimer);
    this._trailDanceTimer = null;
    if (this._trailPlaying) {
      for (const actor of this._actors || []) {
        actor.motion?.cancel();
        this._motions = (this._motions || []).filter(motion => motion !== actor.motion);
        actor.motion = null;
      }
    }
    this._setTrailPlaying(false);
  }

  _playTrailDance() {
    this._stopTrailDance();
    if (this.view !== 'trail' || this._busy || this._checkpointing) return;
    const pattern = [...(this._trailPattern || [])];
    if (!pattern.length) return;
    this._setTrailPlaying(true);
    const epoch = this._trailDanceEpoch;
    let step = 0;
    const next = () => {
      if (epoch !== this._trailDanceEpoch) return;
      if (this.view !== 'trail' || !this.visit.active ||
          document.visibilityState === 'hidden' || this._busy || this._checkpointing) { this._stopTrailDance(); return; }
      if (step >= pattern.length) { this._stopTrailDance(); return; }
      const index = pattern[step++];
      this._visitLantern(index, this._trailStops[index], true);
      this._trailDanceTimer = setTimeout(next, 900);
    };
    next();
  }

  _renderPeek() {
    if (this._busy || this._checkpointing) return;
    const ghost = this._companionGhost();
    if (!ghost) { this._renderHollow(); return; }
    this._peekReturnPattern = [...(this._trailPattern || [])];
    this._clearView(); this.view = 'peek'; this._peekGhost = ghost;
    this._peekIndex = -1; this._peekHidden = true;
    this.back.setAttribute('aria-label', 'back to our lantern walk');
    const place = document.createElement('section'); place.className = 'boo-peek';
    const title = document.createElement('h2'); title.textContent = 'Peekaboo together';
    const doors = document.createElement('div'); doors.className = 'boo-peek-doors';
    doors.setAttribute('role', 'group'); doors.setAttribute('aria-label', 'Choose a door to find your ghost');
    this._peekButtons = ['leaf', 'star', 'heart'].map((symbol, index) => {
      const choice = this._button(`peek at my ghost behind the ${symbol} door`, '', () => this._peekAt(index));
      choice.classList.add('boo-peek-choice'); choice.dataset.symbol = symbol;
      const drawing = document.createElement('img'); drawing.src = ghost.actorPng || ghost.png; drawing.alt = ''; drawing.draggable = false; drawing.className = 'boo-peek-drawing';
      choice.append(drawing, image(BOO_BA_DOOR.doorArt, 'boo-peek-door'));
      const hand = document.createElement('span'); hand.className = 'boo-peek-hand'; hand.setAttribute('aria-hidden', 'true'); hand.innerHTML = HAND_ICON; choice.append(hand);
      const sign = document.createElement('span'); sign.className = 'boo-peek-sign'; sign.innerHTML = iconSVG(symbol); choice.append(sign);
      doors.append(choice); return choice;
    });
    const footer = document.createElement('footer'); footer.className = 'boo-peek-footer';
    const companion = this._companionPicture();
    if (companion) {
      const choose = this._button('choose another ghost for peekaboo', '', () => this._showCompanions(0, 'peek'));
      choose.classList.add('boo-peek-friend'); choose.append(companion); footer.append(choose);
    }
    this._peekHint = document.createElement('p'); this._peekHint.textContent = 'Tap a door to find your ghost.'; this._peekHint.setAttribute('role', 'status'); this._peekHint.setAttribute('aria-live', 'polite');
    footer.append(this._peekHint, this._button('back to our lantern walk', iconSVG('back'), () => this._returnFromPeek(), 'Lanterns'));
    place.append(title, doors, footer); this.main.append(place);
    this._installPeekIdleHelp();
  }
  _peekHelpActive(token, view) {
    return this.visit.valid(token) && view === this._view && this.view === 'peek' &&
      router.current() === 'boo-hollow' && !router.isMoving() && !session.isBreakLocked() &&
      !this._busy && !this._checkpointing && !this._issue && !speech.isSpeaking();
  }
  _installPeekIdleHelp(clock = {}) {
    this._peekIdleHelp?.();
    const token = this.visit.serial, view = this._view;
    const schedule = clock.delay || setTimeout, cancel = clock.cancel || clearTimeout;
    this._peekIdleHelp = installIdleHelp(this.root || this.main, {
      active: () => this._peekHelpActive(token, view),
      demonstrate: () => {
        const candidates = this._peekIndex < 0 ? this._peekButtons : [this._peekButtons[this._peekIndex]];
        const visible = candidates.filter(node => node && !node.disabled && node.isConnected);
        visible.forEach(node => node.classList.add('boo-idle-target'));
        let done = false;
        const clear = () => { if (done) return; done = true; visible.forEach(node => node.classList.remove('boo-idle-target')); };
        const timer = schedule(clear, 2400);
        return () => { cancel(timer); clear(); };
      }, ...clock,
    });
  }
  _returnFromPeek() {
    if (this.view !== 'peek' || this._busy || this._checkpointing) return false;
    const pattern = [...(this._peekReturnPattern || [])];
    this._renderTrail(); this._peekReturnPattern = null;
    if (this.view === 'trail') {
      this._trailPattern = pattern;
      this._danceButton.disabled = !pattern.length;
    }
    return true;
  }
  _peekAt(index, quiet = false) {
    if (this.view !== 'peek' || this._busy || this._checkpointing || !this.visit.active || !Number.isInteger(index) || index < 0 || index >= this._peekButtons.length) return false;
    const same = this._peekIndex === index;
    this._peekHidden = same ? !this._peekHidden : false; this._peekIndex = index;
    this._peekButtons.forEach((choice, i) => {
      const chosen = i === index;
      choice.classList.toggle('is-chosen', chosen); choice.classList.toggle('is-peeking', chosen && !this._peekHidden);
      choice.setAttribute('aria-pressed', String(chosen));
      choice.setAttribute('aria-label', chosen && !this._peekHidden ? `hide my ghost at the ${choice.dataset.symbol} door` : `peek at my ghost behind the ${choice.dataset.symbol} door`);
    });
    if (!quiet && !this._peekHidden && performance.now() - (this._lastBoo ?? -Infinity) >= 900) {
      this._lastBoo = performance.now(); sfx.play('halloween_boo'); this._say('halloween_boo_hello');
    }
    this._peekHint.textContent = this._peekHidden ? 'Tap that door to peek, or choose another hiding place.' : 'There is your ghost! Tap to hide again, or choose another door.';
    return true;
  }

  _makeGhost(ghost, position) {
    const wrap = document.createElement('div'); wrap.className = 'boo-ghost-wrap'; wrap.dataset.ghost = ghost.id;
    const character = new Character(wrap, { name: 'handmade-ghost', art: false, follow: true });
    character.el.dataset.name = 'handmade-ghost';
    character.svg.replaceChildren();
    // The white edge and soft outline follow only the exact bitmap alpha. The
    // original pixels, colors, snapshot and gallery PNG remain untouched.
    const filterId = `boo-ink-edge-${++actorFilterSerial}`, defs = svgNode('defs');
    const filter = svgNode('filter', { id: filterId, x: '-10%', y: '-10%', width: '120%', height: '120%', 'color-interpolation-filters': 'sRGB' });
    filter.append(svgNode('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: 3.4, result: 'outer' }),
      svgNode('feGaussianBlur', { in: 'outer', stdDeviation: .45, result: 'softOuter' }),
      svgNode('feFlood', { 'flood-color': '#735a80', 'flood-opacity': .7, result: 'edgeColor' }),
      svgNode('feComposite', { in: 'edgeColor', in2: 'softOuter', operator: 'in', result: 'edge' }),
      svgNode('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: 2.3, result: 'haloAlpha' }),
      svgNode('feFlood', { 'flood-color': '#fffdfa', result: 'haloColor' }),
      svgNode('feComposite', { in: 'haloColor', in2: 'haloAlpha', operator: 'in', result: 'halo' }));
    const merge = svgNode('feMerge');
    for (const name of ['edge', 'halo', 'SourceGraphic']) merge.append(svgNode('feMergeNode', { in: name }));
    filter.append(merge); defs.append(filter); character.svg.append(defs);
    const ink = svgNode('image', { href: ghost.actorPng || ghost.png, x: 0, y: 0, width: 200, height: 200, preserveAspectRatio: 'xMidYMid meet', class: 'boo-exact-ink', filter: `url(#${filterId})` });
    character.svg.append(ink);
    const face = booFace(ghost.snapshot), box = glyphBox(200, 200, BOO_GLYPH, { pad: .04 });
    const x = Math.max(28, Math.min(172, box.x + face.x / 100 * box.w));
    const y = Math.max(28, Math.min(160, box.y + face.y / 100 * box.h));
    const spread = Math.max(10, Math.min(24, face.spread / 100 * box.w));
    const eyes = [];
    for (const direction of [-1, 1]) {
      character.svg.append(svgNode('ellipse', { cx: x + direction * (spread + 9), cy: y + 15, rx: 9, ry: 5, fill: '#edbfd0', opacity: .8 }));
      const eye = svgNode('g', { class: 'char-eye' });
      eye.append(svgNode('ellipse', { cx: x + direction * spread, cy: y, rx: 4, ry: 5, fill: '#69546c', stroke: '#fffaf1', 'stroke-width': 1 }));
      character.svg.append(eye); eyes.push(eye);
    }
    character.eyes = eyes; character.pupils = [];
    const tap = this._button('say a quiet boo with my own ghost', '', () => this._greetGhost(wrap, character)); tap.className = 'boo-actor-tap';
    if (this.view !== 'trail') wrap.append(tap);
    this.board.append(wrap);
    this._actors.push({ ghost, wrap, character, x: position.x, y: position.y, motion: null });
    return this._actors.at(-1);
  }

  _layoutActors() {
    if (!this.board || !this._actors?.length) return;
    const width = this.board.clientWidth, height = this.board.clientHeight;
    if (!width || !height) return;
    const resized = this._boardSize && (width !== this._boardSize.width || height !== this._boardSize.height);
    this._boardSize = { width, height };
    // Reuse the workshop's whole-picture fitting, including short landscapes.
    const geometry = workshopGeometry(width, height, true);
    const size = Math.max(64, Math.min(190, geometry.width, height * .8));
    for (const actor of this._actors) {
      if (resized) { actor.motion?.cancel(); this._motions = this._motions.filter(motion => motion !== actor.motion); actor.motion = null; }
      actor.size = size; actor.wrap.style.setProperty('--boo-size', `${size}px`);
      actor.px = Math.max(size / 2, Math.min(width - size / 2, width * actor.x));
      actor.py = Math.max(size / 2, Math.min(height - size / 2, height * actor.y));
      actor.wrap.style.left = `${actor.px}px`; actor.wrap.style.top = `${actor.py}px`;
    }
  }

  _follow(clientX, clientY) {
    const rect = this.board.getBoundingClientRect();
    this._actors.forEach((actor, index) => {
      const oldX = actor.px, oldY = actor.py;
      actor.motion?.cancel();
      this._motions = this._motions.filter(motion => motion !== actor.motion);
      actor.motion = null;
      actor.x = (clientX - rect.left + (index - (this._actors.length - 1) / 2) * actor.size * .55) / Math.max(1, rect.width);
      actor.y = (clientY - rect.top - 15 - index * 6) / Math.max(1, rect.height);
      this._layoutActors(); actor.character.lookAt(clientX, clientY);
      // The same bounded tap-to-float transition as the picture Toy Workshop.
      if (!this._reduced() && actor.wrap.animate) {
        actor.motion = actor.wrap.animate([
          { transform: `translate(calc(-50% + ${oldX - actor.px}px), calc(-50% + ${oldY - actor.py}px))` },
          { transform: 'translate(-50%,-50%)' },
        ], { duration: Math.max(220, Math.min(850, Math.hypot(oldX - actor.px, oldY - actor.py) * 2.8)), easing: 'cubic-bezier(.2,.7,.3,1)' });
        this._motions.push(actor.motion);
      }
    });
  }

  _greetGhost(wrap, character) {
    const now = performance.now(); if (now - this._lastBoo < 900) return;
    this._lastBoo = now; wrap.classList.add('is-giggling');
    sfx.play('halloween_boo'); void character.bounce(); this._say('halloween_boo_hello');
    this._later(() => wrap.classList.remove('is-giggling'), 1400);
  }

  _showModes() {
    if (this._busy || this._checkpointing) return;
    this._clearView(); this.view = 'modes'; this.back.setAttribute('aria-label', 'back to my ghost friends');
    const choices = document.createElement('div'); choices.className = 'boo-choices'; choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', 'Choose dots, a soft guide, or draw your own ghost');
    for (const mode of BOO_MODES) {
      const choice = this._button(mode.label, GHOST_ICON, () => this._startDrawing(mode.id), mode.label); choice.classList.add('boo-mode'); choice.dataset.mode = mode.id;
      const path = choice.querySelector('path');
      if (mode.id === 'dots') { path?.setAttribute('stroke-dasharray', '1 8'); path?.setAttribute('stroke-linecap', 'round'); }
      if (mode.id === 'guide') { path?.setAttribute('stroke', '#ccbada'); path?.setAttribute('stroke-width', '8'); }
      if (mode.id === 'free') {
        path?.setAttribute('stroke', '#dc9db5');
        const pencil = document.createElement('span'); pencil.className = 'boo-mode-pencil'; pencil.setAttribute('aria-hidden', 'true');
        pencil.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 49 40 12l11 9-28 37-14 2Z" fill="#f4b3c7" stroke="#73566e" stroke-width="4" stroke-linejoin="round"/><path d="m35 18 11 9M11 51l12 7" stroke="#73566e" stroke-width="4"/></svg>';
        choice.append(pencil);
      }
      const token = this.visit.serial, view = this._view;
      this._offs.push(installControlCue(choice, { phraseKey: mode.phrase,
        isActive: () => this.visit.valid(token) && view === this._view && this.view === 'modes' &&
          !this._busy && !this._checkpointing && !this._issue && !router.isMoving() && !session.isBreakLocked() }));
      choices.append(choice);
    }
    this.main.append(choices); this._say('ui_choose_next');
  }

  _startDrawing(mode, draft = null, pumpkin = false) {
    if (this._busy || this._checkpointing) return;
    this._clearView(); this.view = pumpkin ? 'door-drawing' : 'drawing'; this.mode = booMode(mode).id;
    const previous = draft || (pumpkin ? this.model.doorDrafts?.dada : this.model.drafts[this.mode]);
    this.attemptId = previous?.attemptId || makeAttempt(); this.back.setAttribute('aria-label', 'keep my marks and return to drawing choices');
    const work = document.createElement('div'); work.className = 'boo-drawing';
    const model = document.createElement('div'); model.className = 'boo-model'; model.innerHTML = pumpkin ? '' : GHOST_ICON;
    if (pumpkin) model.append(image(booFamilyDoor('dada').people[0].art, '', 'Dada'));
    const label = document.createElement('span'); label.textContent = pumpkin ? 'A face for Dada' : booMode(this.mode).label; model.append(label);
    const stage = this.paperStage = document.createElement('div'); stage.className = 'boo-paper-stage';
    const paper = this.paper = document.createElement('div'); paper.className = 'boo-paper';
    if (pumpkin) { paper.classList.add('boo-pumpkin-paper'); paper.append(image(BOO_PUMPKIN_ART, 'boo-pumpkin-base', 'Blank pumpkin for your own face')); }
    const guardPaper = event => {
      if (this._busy || this._checkpointing || router.isMoving()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    paper.addEventListener('pointerdown', guardPaper, true); this._offs.push(() => paper.removeEventListener('pointerdown', guardPaper, true));
    const canvas = document.createElement('div'); canvas.className = 'boo-canvas'; paper.append(canvas); stage.append(paper);
    const tools = document.createElement('footer'); tools.className = 'boo-tools';
    const nativeTools = document.createElement('div'); nativeTools.className = 'boo-native-tools'; tools.append(nativeTools);
    const done = this._finishButton = this._button(pumpkin ? 'give my pumpkin picture to Dada' : 'wake up my own ghost drawing', iconSVG('next'), () => { void (pumpkin ? this._finishDada() : this._finish()); });
    done.classList.add('boo-done'); done.disabled = true; tools.append(done);
    work.append(model, stage, tools); this.main.append(work); this._layoutPaper();
    this.tracer = new Tracer(canvas, {
      ...(pumpkin ? { glyph: BOO_PUMPKIN_GLYPH, level: 3, autoEvaluate: false, detectScribble: false } : booDrawingOptions(this.mode)), toolHost: nativeTools,
      handedness: settings.get().handedness, allowFinger: !settings.get().penOnly,
      style: { kind: 'rainbow', width: 10 },
      onStrokeEnd: () => this._strokeEnd(),
    });
    if (pumpkin) this.tracer._onEnd = (_points, info) => finishBooFaceStroke(this.tracer, info);
    this.host._tracer = this.tracer;
    if (previous?.snapshot) this.tracer.loadSnapshot(previous.snapshot);
    for (const control of this.tracer.tools.querySelectorAll('button')) {
      const guard = event => { if (this._busy || this._checkpointing || router.isMoving() || this.tracer?.pen?.drawing || this.tracer?.pen?.activeId != null) { event.preventDefault(); event.stopImmediatePropagation(); } };
      control.addEventListener('click', guard, true); this._offs.push(() => control.removeEventListener('click', guard, true));
    }
    if (typeof ResizeObserver !== 'undefined') { this._paperObserver = new ResizeObserver(() => this._layoutPaper()); this._paperObserver.observe(stage); }
    this._updateDone(); this._say(pumpkin ? 'halloween_dada_draw' : booMode(this.mode).phrase);
  }

  _layoutPaper() {
    if (!this.paper || !this.paperStage || this.tracer?.pen?.drawing) return;
    const size = booPaperSize(this.paperStage.clientWidth, this.paperStage.clientHeight); if (!size) return;
    this.paper.style.width = `${size}px`; this.paper.style.height = `${size}px`; this.tracer?.resize();
  }
  _updateDone() { if (this._finishButton) this._finishButton.disabled = this._busy || this._checkpointing || !(this.view === 'door-drawing' ? booHasDoorInk(this.tracer?.snapshot()) : booHasAttempt(this.tracer?.snapshot())); }
  _strokeEnd() {
    if (!this.tracer || !['drawing', 'door-drawing'].includes(this.view) || this._busy) return;
    this._layoutPaper(); this._updateDone();
    const token = this.visit.serial, view = this._view;
    this._draftPending = this._checkpointDraft().catch(error => {
      if (this.visit.valid(token) && view === this._view) this._report(error);
      return false;
    });
  }
  async _checkpointDraft() {
    if (!this.tracer || !['drawing', 'door-drawing'].includes(this.view)) return true;
    const mode = this.mode, attemptId = this.attemptId, snapshot = this.tracer.snapshot(), token = this.visit.serial;
    if (this.view === 'door-drawing') {
      if (booHasDoorInk(snapshot)) {
        const draft = await saveBooDoorDraft('dada', {snapshot, attemptId});
        if (!this.visit.valid(token)) return false;
        this.model.doorDrafts = {...this.model.doorDrafts, dada: draft};
      } else {
        await clearBooDoorDraft('dada', attemptId);
        if (!this.visit.valid(token)) return false;
        if (this.model.doorDrafts?.dada?.attemptId === attemptId) delete this.model.doorDrafts.dada;
      }
      return true;
    }
    if (snapshot.strokes.length) {
      const draft = await saveBooDraft({ mode, attemptId, snapshot });
      if (!this.visit.valid(token)) return false;
      this.model.drafts[mode] = draft;
    } else {
      await clearBooDraft(mode, attemptId);
      if (!this.visit.valid(token)) return false;
      if (this.model.drafts[mode]?.attemptId === attemptId) delete this.model.drafts[mode];
    }
    return true;
  }
  _destroyTracer() {
    this._paperObserver?.disconnect(); this._paperObserver = null;
    if (this.host?._tracer === this.tracer) delete this.host._tracer;
    this.tracer?.destroy(); this.tracer = null;
  }

  async _finish() {
    if (this._busy || this._checkpointing || !this.tracer || this.tracer.pen?.drawing || this.tracer.pen?.activeId != null || !booHasAttempt(this.tracer.snapshot())) return false;
    this._busy = true; this._updateDone(); const token = this.visit.serial, view = this._view;
    const tracer = this.tracer, snapshot = tracer.snapshot(), rect = this.paper.getBoundingClientRect(), mode = this.mode, attemptId = this.attemptId;
    let pending;
    pending = this._pendingFinish = (async () => {
      try {
        await Promise.resolve();
        const png = tracer.ink.toPNG();
        await this._draftPending;
        const ghost = await createBooGhost({ mode, snapshot, attemptId, png, actorPng: png });
        if (!this.visit.valid(token) || view !== this._view) return false;
        if (!this.model.ghosts.some(row => row.id === ghost.id)) this.model.ghosts.push(ghost);
        if (this.model.drafts[mode]?.attemptId === attemptId) delete this.model.drafts[mode];
        this._recent = { ghost, snapshot, mode }; this._page = 0;
        this._clearIssue(); this._busy = false; this._renderHollow({ ghost, rect }); this._say('halloween_boo_lift');
        return true;
      } catch (error) {
        if (this.visit.valid(token) && view === this._view) this._report(error, () => this._finish(), 'try waking up my ghost again');
        return false;
      } finally {
        if (this.visit.valid(token)) { this._busy = false; this._updateDone(); }
        if (this._pendingFinish === pending) this._pendingFinish = null;
      }
    })();
    return this._pendingFinish;
  }

  _liftFromPaper({ ghost, rect }) {
    const actor = this._actors.find(row => row.ghost.id === ghost.id); if (!actor) return;
    const rootRect = this.main.getBoundingClientRect(), to = actor.wrap.getBoundingClientRect();
    const paper = document.createElement('div'); paper.className = 'boo-lift-paper';
    Object.assign(paper.style, { left: `${rect.left - rootRect.left}px`, top: `${rect.top - rootRect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const original = document.createElement('img'); original.src = ghost.png; original.alt = 'Your original drawing stays saved'; paper.append(original); this.main.append(paper);
    const dx = rect.left + rect.width / 2 - (to.left + to.width / 2), dy = rect.top + rect.height / 2 - (to.top + to.height / 2);
    if (!this._reduced() && actor.wrap.animate) {
      const motion = actor.wrap.animate([
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${rect.width / Math.max(1, to.width)})` },
        { transform: 'translate(-50%,-50%) scale(1)' },
      ], { duration: 850, easing: 'cubic-bezier(.2,.7,.3,1)' }); actor.motion = motion; this._motions.push(motion);
      const token = this.visit.serial, view = this._view;
      motion.finished.then(() => { if (this.visit.valid(token) && view === this._view && actor.wrap.isConnected) void actor.character.bounce(); }).catch(() => {});
    } else { actor.wrap.classList.add('is-giggling'); }
    this._later(() => { paper.remove(); actor.wrap.classList.remove('is-giggling'); }, this._reduced() ? 1200 : 1800);
  }

  async _editRecent() {
    if (!this._recent || this._busy) return;
    const { mode, snapshot } = this._recent;
    // Undo ends the lift, then gives her editable paper. The first ghost's
    // immutable original and its identity remain safely in the Hollow.
    this._startDrawing(mode, { snapshot, attemptId: makeAttempt() });
    const token = this.visit.serial, view = this._view;
    this._draftPending = this._checkpointDraft().catch(error => {
      if (this.visit.valid(token) && view === this._view) this._report(error);
      return false;
    });
  }

  _startDadaDrawing(draft = null) {
    this.door = 'dada'; this._startDrawing('free', draft, true);
    this.back.setAttribute('aria-label', 'keep my pumpkin marks and return to our family doors');
  }

  async _composePumpkin(tracer) {
    const base = art.get(BOO_PUMPKIN_ART);
    if (!base || !base.naturalWidth) throw new Error('The pumpkin paper is still arriving. Your marks are kept. Try again.');
    const inkPng = tracer.ink.toPNG(), ink = new Image(); ink.src = inkPng;
    await ink.decode();
    const canvas = document.createElement('canvas'); canvas.width = ink.naturalWidth; canvas.height = ink.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fffdfa'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Same contain fit as the visible paper. Never fit or change the child's ink.
    const scale = Math.min(canvas.width / base.naturalWidth, canvas.height / base.naturalHeight);
    const w = base.naturalWidth * scale, h = base.naturalHeight * scale;
    ctx.drawImage(base, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    ctx.drawImage(ink, 0, 0);
    return { png: canvas.toDataURL('image/png'), inkPng };
  }

  async _finishDada() {
    if (this._busy || this._checkpointing || this.view !== 'door-drawing' || !this.tracer || this.tracer.pen?.drawing || this.tracer.pen?.activeId != null || !booHasDoorInk(this.tracer.snapshot())) return false;
    this._busy = true; this._updateDone();
    const token = this.visit.serial, view = this._view, tracer = this.tracer, snapshot = tracer.snapshot(), attemptId = this.attemptId;
    let pending;
    pending = this._pendingFinish = (async () => {
      try {
        await Promise.resolve();
        const images = await this._composePumpkin(tracer);
        await this._draftPending;
        const picture = await createBooDoorPicture({door: 'dada', attemptId, snapshot, ...images});
        if (!this.visit.valid(token) || view !== this._view) return false;
        this.model.lane.dada = {treats: 0, complete: true, sourceKey: picture.sourceKey, attemptId, picture};
        if (this.model.doorDrafts?.dada?.attemptId === attemptId) delete this.model.doorDrafts.dada;
        this._busy = false; this._clearView(); this.view = 'door'; this.door = 'dada'; this._renderAnswer(true);
        return true;
      } catch (error) {
        if (this.visit.valid(token) && view === this._view) this._report(error, () => this._finishDada(), 'try giving my pumpkin to Dada again');
        return false;
      } finally {
        if (this.visit.valid(token)) { this._busy = false; this._updateDone(); }
        if (this._pendingFinish === pending) this._pendingFinish = null;
      }
    })();
    return pending;
  }

  _renderSharing(prompt = true) {
    this.doorPhase = 'sharing';
    const {stage, caption} = this._doorFrame(), progress = booSharingProgress(this.model.lane.cousins);
    const group = document.createElement('div'); group.className = 'boo-sharing';
    for (const [index, person] of booFamilyDoor('cousins').people.entries()) {
      const given = progress.gifts[index];
      const gift = this._button(given ? `${person.name} has a treat. Say thank you again` : `give one treat to ${person.name}`, '', () => { void this._shareTreat(index, gift); });
      gift.classList.add('boo-recipient'); gift.classList.toggle('is-filled', given); gift.dataset.person = person.id;
      gift.append(image(this._personArt(person), 'boo-recipient-person', person.name));
      const hand = document.createElement('span'); hand.className = 'boo-sharing-hand'; hand.innerHTML = HAND_ICON;
      if (given) hand.append(this._candyPicture());
      const name = document.createElement('span'); name.className = 'boo-recipient-name'; name.textContent = person.name;
      gift.append(hand, name); group.append(gift);
    }
    stage.append(group); const hint = document.createElement('span'); hint.textContent = 'One for Veer. One for Ishan.'; caption.append(hint);
    if (prompt) this._say('halloween_cousins_share');
  }

  async _shareTreat(index, button) {
    if (this._busy || this._checkpointing || this.doorPhase !== 'sharing') return false;
    const current = booSharingProgress(this.model.lane.cousins);
    if (current.gifts[index]) { this._say('halloween_cousins_greeting'); return true; }
    if (index !== current.treats) { this._say('halloween_cousins_share'); return false; }
    // One committed gift per persisted recipient.
    const next = {treats: Math.min(2, current.treats + 1)};
    next.complete = next.treats === 2;
    const token = this.visit.serial, view = this._view;
    this._busy = true; button.disabled = true; this._clearIssue();
    let pending;
    pending = this._doorPending = (async () => {
      try {
        const result = await saveBooDoor('cousins', next);
        if (!this.visit.valid(token) || view !== this._view) return false;
        this.model.lane.cousins = result.cousins; sfx.play('halloween_candy'); this._busy = false;
        if (next.complete) this._renderAnswer(true); else this._renderSharing(false);
        return true;
      } catch (error) {
        if (this.visit.valid(token) && view === this._view) { this._report(error, () => this._shareTreat(index, button), 'try sharing this treat again'); button.disabled = false; }
        return false;
      } finally {
        if (this.visit.valid(token)) this._busy = false;
        if (this._doorPending === pending) this._doorPending = null;
      }
    })();
    return pending;
  }

  _personArt(person) {
    const costume = person.id === 'veer' ? 'halloween/veer-iron-man-v1' : person.id === 'ishan' ? 'halloween/ishan-lion-v1' : null;
    return costume && halloweenActive(settings.get()) && art.has(costume) ? costume : person.art;
  }

  _renderFamilyAnswer(id) {
    this.back.setAttribute('aria-label', 'back to our family doors');
    this.doorPhase = 'answer'; const family = booFamilyDoor(id), {stage, caption} = this._doorFrame();
    const answer = document.createElement('div'); answer.className = `boo-answer boo-answer-${id}`;
    for (const person of family.people) answer.append(image(this._personArt(person), 'boo-family-answer', `${person.name} smiles at you`));
    const picture = this.model.lane.dada?.picture;
    if (id === 'dada' && picture?.png) { const original = document.createElement('img'); original.src = picture.png; original.className = 'boo-pumpkin-gift'; original.alt = 'Your own pumpkin picture for Dada'; answer.append(original); }
    const heart = document.createElement('span'); heart.className = 'boo-answer-heart'; heart.innerHTML = HEART_ICON; answer.append(heart); stage.append(answer);
    caption.append(this._button(`hear ${family.label}'s Halloween hello again`, iconSVG('sound'), () => this._say(family.greeting)),
      this._button('visit our other family doors', HAND_ICON, () => this._showLane(), 'More family'));
    if (id === 'dada') caption.append(this._button(temporaryDemo ? 'draw another pumpkin for Dada; my first picture stays until reload' : 'draw another pumpkin for Dada; my first picture stays saved', iconSVG('replay'), () => this._startDadaDrawing({attemptId: makeAttempt()})));
    this._say(family.greeting);
  }

  _familyBadges(door) {
    const group = document.createElement('div'); group.className = 'boo-family-badges';
    for (const person of door.people) {
      const badge = document.createElement('span'); badge.className = `boo-family-badge boo-badge-${person.id}`;
      badge.append(image(this._personArt(person), '', person.name)); group.append(badge);
    }
    return group;
  }
  _companionGhost() {
    const friends = this.model.ghosts.filter(row => row.png && !row.missingOriginal);
    return friends.find(row => row.id === this._companionId) || friends.at(-1) || null;
  }
  _chooseCompanion(id) {
    if (this._busy || this._checkpointing || !this.visit.active || !this.model.ghosts.some(row => row.id === id && row.png && !row.missingOriginal)) return false;
    this._companionId = id; this._closeCompanions(true); return true;
  }
  _closeCompanions(changed = false) {
    const context = this._companionReturn; this._companionReturn = null;
    if (context?.view === 'peek') {
      this._renderPeek(); this._peekReturnPattern = context.pattern;
      if (!changed && context.index >= 0 && this.view === 'peek') {
        this._peekAt(context.index, true);
        if (context.hidden) this._peekAt(context.index, true);
      }
    } else this._showLane();
  }
  _showCompanions(page = 0, returnView = null) {
    if (this._busy || this._checkpointing) return;
    if (returnView === 'peek') this._companionReturn = { view: 'peek', pattern: [...(this._peekReturnPattern || [])], index: this._peekIndex, hidden: this._peekHidden };
    else if (this.view !== 'companions') this._companionReturn = null;
    const friends = this.model.ghosts.filter(row => row.png && !row.missingOriginal).slice().reverse();
    if (!friends.length) { this._showLane(); return; }
    const pages = Math.ceil(friends.length / 6), current = Math.max(0, Math.min(pages - 1, Math.floor(page) || 0));
    this._clearView(); this.view = 'companions'; this.back.setAttribute('aria-label', this._companionReturn ? 'back to peekaboo without changing my friend' : 'back to our family doors without changing my friend');
    const picker = document.createElement('section'); picker.className = 'boo-companion-picker';
    const title = document.createElement('h2'); title.textContent = 'Who comes along?';
    const grid = document.createElement('div'); grid.className = 'boo-companion-grid';
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Choose one of your own ghost drawings');
    const selected = this._companionGhost()?.id;
    friends.slice(current * 6, current * 6 + 6).forEach((ghost, index) => {
      const choice = this._button(`bring ghost drawing ${friends.length - current * 6 - index} ${this._companionReturn ? 'to peekaboo' : 'to our family doors'}`, '', () => this._chooseCompanion(ghost.id));
      choice.classList.add('boo-companion-choice'); choice.setAttribute('aria-pressed', String(ghost.id === selected));
      const picture = document.createElement('img'); picture.src = ghost.actorPng || ghost.png; picture.alt = ''; picture.draggable = false;
      choice.append(picture); grid.append(choice);
    });
    const nav = document.createElement('footer'); nav.className = 'boo-door-caption';
    if (pages > 1) {
      const previous = this._button('previous ghost drawings', iconSVG('back'), () => this._showCompanions(current - 1)); previous.disabled = current === 0;
      const next = this._button('more ghost drawings', iconSVG('next'), () => this._showCompanions(current + 1)); next.disabled = current === pages - 1;
      const count = document.createElement('span'); count.textContent = `${current + 1} / ${pages}`;
      nav.append(previous, count, next);
    }
    nav.append(this._button(this._companionReturn ? 'keep my current friend and return to peekaboo' : 'keep my current friend and return to family doors', iconSVG('heart'), () => this._closeCompanions(), 'Keep friend'));
    picker.append(title, grid, nav); this.main.append(picker);
  }
  _companionPicture() {
    const ghost = this._companionGhost();
    if (!ghost) return null;
    const picture = document.createElement('img');
    picture.className = 'boo-family-companion'; picture.src = ghost.actorPng || ghost.png;
    picture.alt = 'Your own ghost drawing comes along'; picture.draggable = false;
    return picture;
  }
  _showLane() {
    if (this._busy || this._checkpointing) return;
    this._clearView(); this.view = 'lane'; this.back.setAttribute('aria-label', 'back to my ghost friends');
    const lane = document.createElement('div'); lane.className = 'boo-lane';
    const choices = document.createElement('div'); choices.className = 'boo-lane-choices'; choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', 'Visit Ba, Dada, or Veer and Ishan');
    for (const door of BOO_FAMILY_DOORS) {
      const choice = this._button(`visit ${door.label}`, '', () => this._openDoor(door.id)); choice.classList.add('boo-door-choice'); choice.dataset.door = door.id;
      choice.append(image(art.has(door.doorArt) ? door.doorArt : 'stickers/draw_house', 'boo-choice-door'), this._familyBadges(door));
      const label = document.createElement('span'); label.className = 'boo-choice-name'; label.textContent = door.name; choice.append(label);
      if (this.model.lane[door.id]?.complete) { const heart = document.createElement('span'); heart.className = 'boo-door-loved'; heart.innerHTML = HEART_ICON; choice.append(heart); }
      choices.append(choice);
    }
    const footer = document.createElement('footer'); footer.className = 'boo-door-caption';
    const companion = this._companionPicture();
    if (companion) {
      const choose = this._button('choose which ghost drawing comes to our family doors', '', () => this._showCompanions(), 'Choose friend');
      choose.classList.add('boo-companion-launcher'); choose.prepend ? choose.prepend(companion) : choose.append(companion);
      footer.append(choose);
    }
    footer.append(this._button('walk home with my ghost friends', iconSVG('home'), () => { this._renderHollow(); this._say('halloween_lane_home'); }, 'Home together'));
    lane.append(choices, footer); this.main.append(lane);
    this._say(BOO_FAMILY_DOORS.every(door => this.model.lane[door.id]?.complete) ? 'halloween_lane_finished' : 'halloween_lane_invite');
  }
  _openDoor(id = 'ba') {
    if (this._busy || this._checkpointing) return;
    this._clearView(); this.view = 'door'; this.door = booFamilyDoor(id).id; this.back.setAttribute('aria-label', 'back to our family doors');
    if (this.door === 'dada') {
      if (this.model.doorDrafts?.dada) this._startDadaDrawing(this.model.doorDrafts.dada);
      else if (this.model.lane.dada?.complete) this._renderAnswer(); else this._renderKnock();
    } else if (this.door === 'cousins') {
      const progress = booSharingProgress(this.model.lane.cousins);
      if (progress.complete) this._renderAnswer(); else if (progress.treats > 0) this._renderSharing(); else this._renderKnock();
    } else {
      const progress = booDoorProgress(this.model.lane.ba);
      if (progress.complete) this._renderAnswer(); else if (progress.treats > 0) this._renderTreats(); else this._renderKnock();
    }
  }
  _doorFrame() {
    ++this._view; this._clearIssue(); this.main.replaceChildren(); const door = document.createElement('div'); door.className = 'boo-door';
    const stage = document.createElement('div'); stage.className = 'boo-door-stage';
    const caption = document.createElement('footer'); caption.className = 'boo-door-caption';
    door.append(stage, caption); this.main.append(door); return { stage, caption };
  }
  _renderKnock() {
    const family = booFamilyDoor(this.door);
    this.doorPhase = 'knock'; const { stage, caption } = this._doorFrame();
    const knock = this._button(`knock on ${family.label}’s door`, '', () => {
      sfx.play('halloween_knock');
      if (family.id === 'dada') this._startDadaDrawing(); else if (family.id === 'cousins') this._renderSharing(); else this._renderTreats();
    }); knock.classList.add('boo-knock');
    knock.append(image(art.has(BOO_BA_DOOR.doorArt) ? BOO_BA_DOOR.doorArt : 'stickers/draw_house'));
    const hand = document.createElement('span'); hand.className = 'boo-knock-hand'; hand.innerHTML = HAND_ICON; knock.append(hand); stage.append(knock);
    caption.classList.add('boo-family-caption');
    const companion = this._companionPicture(); if (companion) caption.append(companion);
    const label = document.createElement('span'); label.textContent = family.name; caption.append(this._familyBadges(family), label);
    this._say(family.knock);
  }
  _bucket(count) {
    const bucket = document.createElement('div'); bucket.className = 'boo-bucket'; bucket.setAttribute('role', 'img'); bucket.setAttribute('aria-label', `${count} of 3 treats in your bucket`);
    const outline = document.createElement('span'); outline.className = 'boo-bucket-outline';
    if (art.has('halloween/treat-bucket-v1')) outline.append(image('halloween/treat-bucket-v1')); else outline.innerHTML = BUCKET_ICON;
    bucket.append(outline);
    for (let i = 0; i < BOO_BA_DOOR.treats; i++) {
      const slot = document.createElement('span'); slot.className = `boo-bucket-slot${i < count ? ' is-filled' : ''}`;
      slot.style.left = `${[30.475, 50.103, 69.731][i]}%`;
      if (i < count) slot.append(this._candyPicture()); bucket.append(slot);
    }
    return bucket;
  }
  _candyPicture() {
    if (art.has('halloween/candy-v1')) return image('halloween/candy-v1', 'boo-candy-picture');
    const fallback = document.createElement('span'); fallback.className = 'boo-candy-picture'; fallback.innerHTML = CANDY_ICON; return fallback;
  }
  _renderTreats(prompt = true) {
    this.doorPhase = 'treats'; const count = booDoorProgress(this.model.lane.ba).treats;
    const { stage, caption } = this._doorFrame();
    const counting = document.createElement('div'); counting.className = 'boo-counting';
    const source = document.createElement('div'); source.className = 'boo-candy-source';
    const candy = this._candyButton = this._button(`put treat ${count + 1} of 3 in your bucket`, '', () => { void this._takeTreat(candy); }); candy.classList.add('boo-candy'); candy.append(this._candyPicture());
    const tally = document.createElement('div'); tally.className = 'boo-treat-tally'; tally.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) { const dot = document.createElement('i'); dot.className = i < count ? 'is-filled' : ''; tally.append(dot); }
    source.append(candy, tally); counting.append(source, this._bucket(count)); stage.append(counting);
    const hint = document.createElement('span'); hint.innerHTML = HAND_ICON; hint.style.width = '50px'; hint.style.height = '50px';
    const bucket = document.createElement('span'); bucket.className = 'boo-bucket-hint';
    if (art.has('halloween/treat-bucket-v1')) bucket.append(image('halloween/treat-bucket-v1')); else bucket.innerHTML = BUCKET_ICON;
    caption.append(hint); const arrow = document.createElement('span'); arrow.textContent = '→'; caption.append(arrow, bucket);
    if (prompt) this._say('halloween_ba_count');
  }
  async _takeTreat(candy) {
    if (this._busy || this._checkpointing || this.doorPhase !== 'treats') return false;
    const next = booNextTreat(this.model.lane.ba), token = this.visit.serial, view = this._view;
    this._busy = true; candy.disabled = true; this._clearIssue();
    let pending;
    pending = this._doorPending = (async () => {
      try {
        const result = await saveBooDoor('ba', next);
        if (!this.visit.valid(token) || view !== this._view) return false;
        this.model.lane.ba = result.ba;
        sfx.play('halloween_candy'); this._busy = false;
        if (next.complete) this._renderAnswer(true); else this._renderTreats(false);
        return true;
      } catch (error) {
        if (this.visit.valid(token) && view === this._view) {
          this._report(error, () => this._takeTreat(candy), 'try putting this treat in my bucket again'); candy.disabled = false;
        }
        return false;
      } finally {
        if (this.visit.valid(token)) this._busy = false;
        if (this._doorPending === pending) this._doorPending = null;
      }
    })();
    return this._doorPending;
  }
  _renderAnswer(opening = false) {
    if (this.door && this.door !== 'ba') return this._renderFamilyAnswer(this.door, opening);
    this.doorPhase = 'answer'; const { stage, caption } = this._doorFrame();
    const answer = document.createElement('div'); answer.className = 'boo-answer';
    const ba = image(BOO_BA_DOOR.art, 'boo-family-answer', 'Ba smiles at you');
    const heart = document.createElement('span'); heart.className = 'boo-answer-heart'; heart.innerHTML = HEART_ICON;
    answer.append(ba, this._bucket(3), heart); stage.append(answer);
    if (opening && !this._reduced() && art.has(BOO_BA_DOOR.doorArt)) {
      const door = image(BOO_BA_DOOR.doorArt, 'boo-opening-door'); stage.append(door);
      if (door.animate) {
        this._motions.push(door.animate([
          { transform: 'translate(-50%,-50%) perspective(700px) rotateY(0deg)', opacity: 1 },
          { transform: 'translate(-50%,-50%) perspective(700px) rotateY(-82deg)', opacity: 0 },
        ], { duration: 650, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }));
        this._later(() => door.remove(), 700);
      } else door.remove();
    }
    caption.append(this._button('hear Ba’s warm Halloween hello again', iconSVG('sound'), () => this._say('halloween_ba_greeting')),
      this._button('visit our other family doors', HAND_ICON, () => this._showLane(), 'More family'));
    this._say('halloween_ba_greeting');
  }

  async _localBack() {
    if (this._checkpointing) return false;
    const token = this.visit.serial;
    if (this.tracer?.pen?.drawing || this.tracer?.pen?.activeId != null) return false;
    if (this._pendingFinish) await this._pendingFinish;
    if (this._doorPending) await this._doorPending;
    if (!this.visit.valid(token)) return false;
    if (this._busy) return false;
    this._checkpointing = true;
    try {
      if (['drawing', 'door-drawing'].includes(this.view)) {
        const pumpkin = this.view === 'door-drawing';
        await this._draftPending;
        if (!await this._checkpointDraft() || !this.visit.valid(token)) return false;
        this._checkpointing = false; if (pumpkin) this._showLane(); else this._showModes();
      } else if (this.view === 'peek') { this._checkpointing = false; this._returnFromPeek(); }
      else if (this.view === 'companions') { this._checkpointing = false; this._closeCompanions(); }
      else if (this.view === 'door') { this._checkpointing = false; this._showLane(); }
      else if (this.view === 'modes' || this.view === 'lane' || this.view === 'trail') this._renderHollow();
      else { this._checkpointing = false; return router.go('map', {}, { dir: 'right' }); }
      return true;
    } catch (error) { if (this.visit.valid(token)) this._report(error, () => this._localBack()); return false; }
    finally { if (this.visit.valid(token)) this._checkpointing = false; }
  }
  onBack() { void this._localBack(); }
  async beforeLeave() {
    if (this._checkpointing) return false;
    const token = this.visit.serial;
    if (this.tracer?.pen?.drawing || this.tracer?.pen?.activeId != null) return false;
    this._checkpointing = true;
    try {
      if (this._pendingFinish) await this._pendingFinish;
      if (this._doorPending) await this._doorPending;
      if (!this.visit.valid(token) || this._busy) return false;
      await this._draftPending;
      if (!await this._checkpointDraft()) return false;
      await flushBooHollowWrites();
      if (!this.visit.valid(token)) return false;
      this._clearIssue(); return true;
    } catch (error) { if (this.visit.valid(token)) this._report(error); return false; }
    finally { if (this.visit.valid(token)) this._checkpointing = false; }
  }
  beforeBreak() { return this.beforeLeave(); }
  unmount() {
    this.visit.end(); this._clearView(); this._offSettings?.(); this._offSettings = null;
    window.removeEventListener('resize', this._resize); this.mute?.destroy?.();
    speech.cancel(); this.root?.remove(); this.root = null; this.host = null;
  }
}

export const booHollow = new BooHollowScreen();
export default booHollow;
