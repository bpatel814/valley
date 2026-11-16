import { PenInput } from '../../engine/pen.js';
import { WATER_BEDS, WATER_SOURCE, WATER_SITUATIONS, WATER_GARDEN_MODES, normalizeWaterGarden,
  editWaterGarden, commitGardenEdit, undoGardenEdit, pourWater, waterShadeAreas, waterFriendOutcome, waterPathAt, waterDecorationAt, WATER_CANOPY_WIDTH } from '../../data/water-garden.js';
import { loadWaterGarden, saveWaterGarden, flushWaterGarden, keepWaterGarden, reopenWaterGarden, waterGardenStorageStatus, waterGardenKeepPlan, waterGardenGalleryPage } from '../../state/water-garden.js';
import router, { muteButton, recoveryAction } from '../router.js';
import art from '../art.js';
import speech from '../../audio/speech.js';
import settings from '../../state/settings.js';
import { checkpointLivingScene } from './music-band.js';
import { loadAnimalFriends, catOutingView, saveCatOutingGarden, returnCatOuting, flushAnimalFriends, animalFriendsStatus, retryAnimalFriendsWrites } from '../../state/animal-friends.js';

const clone = value => JSON.parse(JSON.stringify(value));
const quietMotion = () => settings.get().reducedMotion || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
export const WATER_CANOPY_ART = 'assets/art/final/props/wg-leafy-canopy.png';
export const WATER_SPROUT_ART = 'assets/art/final/props/wg-sprout.png';
export const WATER_RESTING_CAT_ART = 'assets/art/final/props/wg-cat-resting-v1.png';
export const WATER_DECORATION_ART = 'assets/art/final/props/counting-flower.webp';
const standingCatArt = 'assets/art/final/stories/black-cat.webp';
export function waterFriendArt(garden) {
  return garden.mode === 'pip' ? (art.get('characters/pip_idle')?.src || 'assets/art/final/characters/pip_idle.webp') : waterFriendOutcome(garden).resting ? WATER_RESTING_CAT_ART : (art.get('stories/black-cat')?.src || standingCatArt);
}
const canopySVG = '<svg viewBox="0 0 160 110" preserveAspectRatio="xMidYMax" aria-hidden="true"><path d="M80 104V45" stroke="#718845" stroke-width="9"/><path d="M81 66C5 73 0 7 24 8c47-11 62 29 57 58Z" fill="#9bc879" stroke="#65894d" stroke-width="4"/><path d="M81 66c-5-66 51-69 65-55 31 42-13 64-65 55Z" fill="#b2d68c" stroke="#65894d" stroke-width="4"/><path d="m28 24 54 43 44-40" stroke="#6e9755" stroke-width="4" fill="none"/></svg>';
function growthPicture(key, path, className, fallback) {
  const frame = document.createElement('span'); frame.className = className;
  frame.innerHTML = fallback;
  const image = picture(key, path); image.hidden = true; image.style.display = 'none';
  const show = () => { frame.querySelector('svg')?.remove(); image.hidden = false; image.style.display = ''; };
  image.addEventListener('load', show, { once: true });
  if (image.complete && image.naturalWidth) show();
  frame.append(image); return frame;
}
const icons = {
  draw: '<path d="M8 37Q19 9 29 28T49 13" fill="none" stroke="#4498bc" stroke-width="7" stroke-linecap="round"/>',
  lift: '<path d="M10 36L30 10Q33 7 36 10L48 21Q51 24 48 27L30 47H20Z" fill="#f1b9c5" stroke="#816747" stroke-width="3"/><path d="M17 28L36 43M10 49H48" stroke="#816747" stroke-width="3"/>',
  plant: '<path d="M28 46V24M28 33Q5 29 14 13Q30 13 28 33M28 24Q49 23 45 9Q29 9 28 24" fill="#86be77" stroke="#486b49" stroke-width="3"/>',
  route: '<path d="M27 8V25L10 45M27 25L47 45" stroke="#4498bc" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="27" cy="8" r="5" fill="#ffe29a"/>',
  stone: '<ellipse cx="28" cy="30" rx="21" ry="14" fill="#a6a89c" stroke="#6b7065" stroke-width="3"/><path d="M15 25q10-8 22-1" fill="none" stroke="#dfe0d7" stroke-width="4"/>',
  arrange: '<path d="M28 7v42M7 28h42m-29-13 8-8 8 8m-16 26 8 8 8-8M15 20l-8 8 8 8m26-16 8 8-8 8" fill="none" stroke="#678391" stroke-width="4" stroke-linecap="round"/>',
  decorate: '<path d="m28 7 6 14 15 2-11 10 3 15-13-8-13 8 3-15L7 23l15-2Z" fill="#e7b874" stroke="#816747" stroke-width="3"/>',
  pour: '<path d="M28 7C20 20 10 29 12 39a16 16 0 0 0 32 0C46 29 36 20 28 7Z" fill="#72cce8" stroke="#397ba7" stroke-width="3"/>',
  undo: '<path d="M23 11 9 25l14 12M10 25h21q16 0 16 20" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
  save: '<path d="M28 17C12 3 0 21 28 46C56 21 44 3 28 17Z" fill="#ef9aae" stroke="currentColor" stroke-width="3"/>',
  gallery: '<rect x="7" y="9" width="42" height="38" rx="6" fill="#fffaf0" stroke="currentColor" stroke-width="3"/><path d="m10 40 12-14 9 8 9-13 9 19" fill="#a0c78c"/>',
  help: '<path d="M18 17C18 3 43 3 40 20c-1 7-12 7-12 15" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="28" cy="45" r="4"/>',
  back: '<path d="M45 28H10m14-14L10 28l14 14" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
  home: '<path d="m7 27 21-20 21 20M15 22v27h26V22M24 49V34h8v15" fill="#fff3d1" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  clear: '<path d="M18 16h20v31H18ZM13 16h30M23 9h10" fill="#f2d0a3" stroke="currentColor" stroke-width="4"/>',
};
const icon = name => `<svg viewBox="0 0 56 56" aria-hidden="true">${icons[name] || icons.plant}</svg>`;
export function waterRoutePicture(id) {
  const bed = WATER_BEDS.find(row => row.id === id);
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${bed ? `M50 18L${bed.x} 72` : 'M50 12V76'}" fill="none" stroke="#4498bc" stroke-width="9" stroke-linecap="round"/><circle cx="50" cy="${bed ? 18 : 12}" r="9" fill="${bed ? '#f6d88b' : '#7ccfe8'}" stroke="#6995a4" stroke-width="3"/>${bed ? `<image href="assets/art/final/props/counting-pot.webp" x="${bed.x - 14}" y="61" width="28" height="32"/>` : '<circle cx="50" cy="76" r="9" fill="#f6d88b" stroke="#6995a4" stroke-width="3"/>'}</svg>`;
}
function button(name, label, fn) {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'wg-button';
  el.setAttribute('aria-label', label); el.innerHTML = icon(name); el.addEventListener('click', fn); return el;
}
function picture(key, fallback, className = '') {
  const img = art.get(key)?.cloneNode() || document.createElement('img');
  if (!img.src) img.src = fallback;
  img.className = className; img.alt = ''; img.draggable = false; return img;
}
export function waterGardenPreview(garden) {
  const g = normalizeWaterGarden(garden, garden.mode);
  const paths = g.paths.map(path => `<path d="${path.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')}"/>`).join('');
  const shades = waterShadeAreas(g).map(a => {
    const bed = WATER_BEDS.find(row => row.id === a.id);
    return `<ellipse cx="${a.x}" cy="${a.y}" rx="${a.rx}" ry="${a.ry}" fill="#709658" opacity=".28"/><image href="${WATER_CANOPY_ART}" x="${bed.x - WATER_CANOPY_WIDTH / 2}" y="52" width="${WATER_CANOPY_WIDTH}" height="24" preserveAspectRatio="xMidYMax"/>`;
  }).join('');
  const plants = g.plants.map((p, i) => `<g transform="translate(${WATER_BEDS[i].x},76)"><image href="assets/art/final/props/counting-pot.webp" x="-9" y="-5" width="18" height="14"/>${p.stage === 1 ? '<ellipse cy="-2" rx="1.7" ry="1.2" fill="#875d37"/>' : p.stage === 2 ? `<image href="${WATER_SPROUT_ART}" x="-5" y="-14" width="10" height="14"/>` : p.stage === 3 && p.kind === 'flower' ? `<image href="${WATER_DECORATION_ART}" x="-7" y="-21" width="14" height="22"/>` : ''}</g>`).join('');
  const resting = waterFriendOutcome(g).resting;
  const friend = `<image href="${waterFriendArt(g)}" ${resting ? `data-fallback="${standingCatArt}"` : ''} x="${g.friend.x - (resting ? 8 : 6)}" y="${g.friend.y - (resting ? 9 : 14)}" width="${resting ? 16 : 12}" height="${resting ? 9 : 14}" preserveAspectRatio="xMidYMax"/>`;
  const decorations = g.decorations.map(p => p.kind === 'stone' ? `<ellipse cx="${p.x}" cy="${p.y}" rx="2" ry="1.3" fill="#a9aba3"/>` : `<image href="${WATER_DECORATION_ART}" x="${p.x - 3}" y="${p.y - 5}" width="6" height="10"/>`).join('');
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="8" fill="#eaf0d9"/>${shades}<g fill="none" stroke="#479ab7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g>${plants}${decorations}${friend}<circle cx="50" cy="12" r="4" fill="#7dcde7"/></svg>`;
}

export const waterGarden = {
  id: 'water-garden',
  async mount(host, params = {}) {
    this.enteredFromMap = params.fromMap === true;
    const visit = this.visit = (this.visit || 0) + 1;
    this.alive = true; this.store = null; this.tool = 'plant'; this.pending = null; this.flow = null; this.saving = false; this.seedKind = 'flower'; this.decorationKind = 'flower';
    this.checkpointing = false; this.checkpointPromise = null; this.needsCurrentWrite = false;
    this.host = host;
    this.root = document.createElement('section'); this.root.className = 'water-garden';
    this.root.setAttribute('aria-label', 'Water Garden');
    this.root.innerHTML = '<header class="wg-header"><div class="wg-nav"></div><h1>Water Garden</h1><div class="wg-sound"></div></header><div class="wg-stage"><canvas class="wg-canvas" aria-label="Draw water paths from the blue spring to the plant beds"></canvas><div class="wg-objects"></div><div class="wg-guide" hidden></div></div><div class="wg-options"><div class="wg-segments" hidden></div></div><p class="wg-status" role="status" aria-live="polite"></p><footer class="wg-footer"><div class="wg-keepsakes"></div></footer><section class="wg-drawer wg-mode-drawer" role="dialog" aria-modal="true" aria-label="Choose a garden" hidden><div class="wg-drawer-sheet"><nav class="wg-situations" aria-label="Choose a garden"></nav></div></section><section class="wg-drawer wg-tool-drawer" role="dialog" aria-modal="true" aria-label="Garden tools" hidden><div class="wg-drawer-sheet"><div class="wg-tools" role="group" aria-label="Garden tools"></div></div></section>';
    host.append(this.root);
    this.checkpointInput = event => { if (!this.alive || this.visit !== visit || this.checkpointing || this.returning) { event.preventDefault(); event.stopImmediatePropagation(); } };
    for (const type of ['pointerdown', 'click', 'keydown']) this.root.addEventListener(type, this.checkpointInput, true);
    this.root.querySelector('.wg-nav').append(button('back', this.enteredFromMap ? 'Back to the valley' : 'Back to Explore activities', () => this.onBack()), button('home', 'Home: return to the valley', () => this.leave('map')), button('help', 'Show how to plant and connect water', () => this.help()));
    this.mute = muteButton(); this.root.querySelector('.wg-sound').append(this.mute);
    this.canvas = this.root.querySelector('canvas'); this.stage = this.root.querySelector('.wg-stage');
    this.canopies = document.createElement('div'); this.canopies.className = 'wg-canopies'; this.stage.insertBefore(this.canopies, this.canvas);
    this.status = this.root.querySelector('.wg-status');
    this.outingId = typeof params.outingId === 'string' ? params.outingId : null; this.returning = false;
    this.outingPicture = null;
    await this._openSavedWaterGarden(params, visit);
  },
  async _openSavedWaterGarden(params, visit, retryWrites = false) {
    if (!this.alive || this.visit !== visit || this.openingGarden) return;
    this.openingGarden = true;
    if (this.loadRetry) this.loadRetry.disabled = true;
    let loaded, outing = null;
    try {
      loaded = await loadWaterGarden();
      if (this.outingId) { if (retryWrites && animalFriendsStatus().issue === 'animal-write') await retryAnimalFriendsWrites(); if (!this.alive || this.visit !== visit) return; await loadAnimalFriends(); outing = catOutingView(this.outingId); }
    } catch {
      if (!this.alive || this.visit !== visit) return;
      this.status.textContent = 'Your garden could not be opened. Try again, or go Home.';
      if (!this.loadRetry) {
        const retry = recoveryAction('replay', 'Try again', () => { void this._openSavedWaterGarden(params, visit, true); }); retry.className = 'wg-load-retry';
        this.stage.append(retry); this.loadRetry = retry;
      }
      return;
    } finally {
      if (this.visit === visit) { this.openingGarden = false; if (this.loadRetry) this.loadRetry.disabled = false; }
    }
    if (!this.alive || this.visit !== visit) return;
    this.loadRetry?.remove(); this.loadRetry = null; this.store = loaded;
    if (this.outingId) {
      if (!outing) { this.outingId = null; this.status.textContent = 'That cat visit is no longer open. Your ordinary gardens are still here.'; }
      else {
        // This controller branch never writes the ordinary Water record.
        this.store = { active: 'shade', drafts: { shade: outing.draft }, gallery: [] };
        this.outingPicture = outing.origin.picture;
        this.root.classList.add('wg-cat-visit'); this.root.querySelector('h1').textContent = 'Cat’s garden visit';
      }
    }
    return this._finishOpeningWaterGarden(params, visit);
  },
  async _finishOpeningWaterGarden(params, visit) {
    this.decorationImage = art.get('props/counting-flower') || new Image();
    if (!this.decorationImage.complete || !this.decorationImage.naturalWidth) this.decorationImage.addEventListener('load', () => { if (this.alive && this.visit === visit) this.paint(); }, { once: true });
    if (!this.decorationImage.src) this.decorationImage.src = WATER_DECORATION_ART;
    if (!this.outingId && WATER_GARDEN_MODES.includes(params.mode)) this.store.active = params.mode;
    if (!this.outingId && params.savedId) this.store = reopenWaterGarden(this.store, params.savedId);
    this.needsCurrentWrite = WATER_GARDEN_MODES.includes(params.mode) || !!params.savedId;
    this.seedKind = WATER_SITUATIONS[this.store.active].plant;
    const chooseGarden = button('plant', this.outingId ? 'Return the cat to your own cozy corner' : 'Choose a garden to play in', () => this.outingId ? this.returnToCorner() : this.toggleDrawer('mode'));
    chooseGarden.classList.add('wg-mode-launcher'); chooseGarden.setAttribute('aria-expanded', 'false');
    this.root.querySelector('.wg-nav').append(chooseGarden);
    this.root.querySelectorAll('.wg-drawer').forEach(drawer => {
      const close = button('back', 'Close choices and return to the garden', () => this.closeDrawer()); close.classList.add('wg-drawer-close');
      drawer.querySelector('.wg-drawer-sheet').prepend(close);
      drawer.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); this.closeDrawer(); }
        if (event.key === 'Tab') {
          const choices = [...drawer.querySelectorAll('button:not(:disabled)')], first = choices[0], last = choices.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      });
    });
    const modes = this.root.querySelector('.wg-situations');
    WATER_GARDEN_MODES.forEach(mode => {
      const el = document.createElement('button'); el.type = 'button'; el.dataset.mode = mode;
      el.setAttribute('aria-label', WATER_SITUATIONS[mode].title);
      const cue = document.createElement('span'); cue.setAttribute('aria-hidden', 'true');
      cue.append(mode === 'shade'
        ? picture('props/wg-leafy-canopy', WATER_CANOPY_ART, 'wg-mode-picture')
        : mode === 'pip'
          ? picture('props/counting-flower', WATER_DECORATION_ART, 'wg-mode-picture')
          : picture('stickers/draw_rainbow', 'assets/art/final/stickers/draw_rainbow.webp', 'wg-mode-picture'));
      const title = document.createElement('span');
      title.textContent = mode === 'pip' ? "Pip's flowers" : mode === 'shade' ? 'Quiet shade' : 'My garden';
      el.append(cue, title);
      el.addEventListener('click', () => this.select(mode)); modes.append(el);
    });
    const tools = this.root.querySelector('.wg-tools');
    const toolCaption = (el, text) => {
      const caption = document.createElement('span'); caption.className = 'wg-tool-caption';
      caption.textContent = text; caption.setAttribute('aria-hidden', 'true'); el.append(caption); return el;
    };
    ['plant', 'draw', 'route', 'decorate', 'lift'].forEach(name => {
      const el = button(name, { plant: 'Plant a seed: tap a bed', draw: 'Draw a water channel', route: 'Tap to add connecting path pieces', decorate: 'Decorate the garden: tap the ground', lift: 'Lift one water path: tap a channel, with undo' }[name], () => this.setTool(name));
      if (name === 'decorate') el.replaceChildren(picture('props/counting-flower', WATER_DECORATION_ART, 'wg-tool-picture'));
      el.dataset.tool = name; tools.append(toolCaption(el, { plant: 'Seed', draw: 'Draw', route: 'Paths', decorate: 'Decorate', lift: 'Lift path' }[name]));
    });
    tools.append(toolCaption(button('clear', 'Start a fresh garden, with undo', () => { this.closeDrawer(); this.edit({ type: 'clear' }); }), 'Fresh'));
    const seeds = document.createElement('div'); seeds.className = 'wg-seedchoices';
    ['flower', 'leaf'].forEach(kind => {
      const el = button('plant', kind === 'leaf' ? 'Choose a leafy canopy seed' : 'Choose a flower seed', () => { this.seedKind = kind; this.setTool('plant'); });
      el.dataset.seed = kind;
      if (kind === 'flower') el.replaceChildren(picture('props/counting-flower', 'assets/art/final/props/counting-flower.webp'));
      else el.replaceChildren(growthPicture('props/wg-leafy-canopy', WATER_CANOPY_ART, 'wg-seed-picture', canopySVG));
      seeds.append(el);
    }); this.root.querySelector('.wg-options').append(seeds);
    const ornaments = document.createElement('div'); ornaments.className = 'wg-decorchoices wg-seedchoices';
    [['flower','Flower','decorate'],['stone','Pebble','stone'],['move','Move','arrange']].forEach(([kind,label,pictureName]) => {
      const el = button(pictureName, kind === 'move' ? 'Move a flower or pebble: drag it to a new place' : 'Place a little ' + label.toLowerCase(), () => {
        if (this.pen?.drawing || this.pending || this.checkpointing || this.saving) return;
        this.decorationKind = kind; this.setTool('decorate');
      });
      el.dataset.decoration = kind;
      if (kind === 'flower') el.replaceChildren(picture('props/counting-flower', WATER_DECORATION_ART));
      ornaments.append(toolCaption(el,label));
    }); this.root.querySelector('.wg-options').append(ornaments);
    const extras = this.root.querySelector('.wg-keepsakes');
    const toolbox = button('plant', 'Open the garden tools: seeds, drawing, tap paths and flowers', () => this.toggleDrawer('tool'));
    toolbox.classList.add('wg-toolbox'); toolbox.setAttribute('aria-expanded', 'false');
    const basket = document.createElement('span'); basket.className = 'wg-toolbasket';
    basket.append(picture('stories/basket', 'assets/art/final/stories/basket.webp'), picture('props/counting-flower', WATER_DECORATION_ART));
    toolbox.replaceChildren(basket); toolCaption(toolbox, 'Tools');
    extras.append(toolbox, button('undo', 'Undo the last change', () => this.undo()));
    if (this.outingId) {
      const back = button('back', 'Bring the cat back to your own corner. You can keep the visit there.', () => this.returnToCorner()); back.classList.add('wg-corner-return');
      back.replaceChildren(picture('animal-friends/cozy-bed-v1', 'assets/art/final/animal-friends/cozy-bed-v1.png')); toolCaption(back, 'Corner'); extras.append(back);
    } else extras.append(button('save', 'Keep this editable garden', () => this.keep()), button('gallery', 'Open your saved gardens', () => this.gallery()));
    const segmentHost = this.root.querySelector('.wg-segments');
    ['trunk', 'left', 'middle', 'right'].forEach((id, i) => {
      const el = document.createElement('button'); el.type = 'button'; el.innerHTML = waterRoutePicture(id) + `<span>${i ? ['Left', 'Middle', 'Right'][i - 1] : 'Spring path'}</span>`;
      el.setAttribute('aria-label', i ? `Add path from junction to ${id} bed` : 'Connect the spring to the junction');
      el.addEventListener('click', () => this.edit({ type: 'segment', id })); segmentHost.append(el);
    });
    this.pen = new PenInput(this.canvas, {
      allowFinger: !settings.get().penOnly,
      onStrokeStart: point => this.startMark(point),
      onStrokeMove: point => this.moveMark(point),
      onStrokeEnd: (points, meta) => this.endMark(points, meta),
    });
    this.resize = () => { if (!this.pen?.drawing) this.paint(); };
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.resize) : null;
    this.ro?.observe(this.stage); window.addEventListener('resize', this.resize);
    this.visibility = () => { if (document.hidden) void this.beforeBreak(); };
    this.pagehide = () => { if (this.alive && this.visit === visit) { this.persistPartial(); void this.persist().catch(() => {}); } };
    document.addEventListener('visibilitychange', this.visibility); window.addEventListener('pagehide', this.pagehide);
    this.render(); this.setTool('plant'); this.status.textContent = this.outingId ? 'Your cat came with you. Choose a leafy seed and a bed, then connect water to grow shade.' : WATER_SITUATIONS[this.store.active].request;
    if (!this.outingId) void speech.say(WATER_SITUATIONS[this.store.active].phrase);
  },
  get draft() { return this.store.drafts[this.store.active]; },
  get garden() { return this.draft.garden; },
  persist() {
    if (!this.store) return Promise.resolve();
    this.needsCurrentWrite = !!this.outingId;
    const visit = this.visit, draft = this.draft, pending = this.outingId ? saveCatOutingGarden(this.outingId, draft) : saveWaterGarden(this.store);
    void pending.then(() => { if (this.alive && this.visit === visit && this.draft === draft) this.needsCurrentWrite = false; }, () => {});
    // Retain the rejecting serial tail, while observing background autosaves.
    void pending.catch(error => { if (this.alive && this.visit === visit && this.status) this.status.textContent = error.code === 'animal-capacity' ? 'This visit is full. Your open garden is still here. Undo or return after making room.' : 'This garden could not be saved. Your paths and cat are still here. Try leaving again to retry.'; }); return pending;
  },
  flush() { return this.outingId ? flushAnimalFriends() : flushWaterGarden(); },
  storage() { return this.outingId ? animalFriendsStatus() : waterGardenStorageStatus(); },
  select(mode) {
    if (this.outingId || !this.alive || this.pen?.drawing || this.saving || this.checkpointing) return;
    this.closeDrawer();
    this.store.active = mode; this.seedKind = WATER_SITUATIONS[mode].plant; this.flow = null; this.render(); this.setTool('plant');
    this.status.textContent = WATER_SITUATIONS[mode].request; void speech.say(WATER_SITUATIONS[mode].phrase); void this.persist();
  },
  setTool(tool) {
    if (this.pen?.drawing || this.checkpointing) return;
    this.closeDrawer();
    delete this.root.dataset.keepFeedback;
    this.tool = tool;
    this.canvas.style.pointerEvents = ['draw', 'decorate', 'friend', 'lift'].includes(tool) ? 'auto' : 'none';
    this.root.querySelectorAll('[data-tool]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.tool === tool)));
    this.root.querySelector('.wg-segments').hidden = tool !== 'route';
    this.root.querySelector('.wg-seedchoices').hidden = tool !== 'plant';
    this.root.querySelector('.wg-options').hidden = !['plant', 'route', 'decorate'].includes(tool);
    this.root.querySelector('.wg-decorchoices').hidden = tool !== 'decorate';
    this.root.querySelectorAll('[data-decoration]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.decoration === this.decorationKind)));
    this.root.dataset.decoration = this.decorationKind;
    this.root.querySelectorAll('[data-seed]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.seed === this.seedKind)));
    this.root.dataset.tool = tool;
    this.canvas.setAttribute('aria-label', tool === 'lift' ? 'Tap a water channel to lift it; Undo restores it' : tool === 'decorate' ? this.decorationKind === 'move' ? 'Drag one flower or pebble to rearrange the garden; Undo restores it' : 'Tap the garden ground to place a flower or pebble' : 'Draw water paths from the blue spring to the plant beds');
    this.render();
    this.root.querySelector('.wg-spring')?.setAttribute('aria-label', tool === 'route' ? 'Connect the spring to the junction' : 'Blue spring: pour water');
    this.status.textContent = { plant: 'Choose a flower or leafy seed, then tap a bed.', draw: 'Draw from the blue spring to a planted bed.', route: 'Tap Spring path, then a bed path. The pieces join.', decorate: this.decorationKind === 'move' ? 'Drag a flower or pebble to a new place. Undo brings it back.' : 'Tap the ground to add a little ' + (this.decorationKind === 'stone' ? 'pebble.' : 'flower.'), lift: 'Tap one channel to lift it. Undo brings it back.', friend: this.store.active === 'pip' ? 'Tap a grown flower for Pip to visit, or choose a place on the ground.' : 'Tap the shady ground under a canopy, or choose any safe place for the cat.' }[tool];
    this.root.querySelector('.wg-friend')?.setAttribute('aria-pressed', String(tool === 'friend'));
  },
  toggleDrawer(kind) {
    if (!this.alive || this.pen?.drawing || this.pending || this.saving || this.checkpointing) return false;
    const drawer = this.root.querySelector(kind === 'mode' ? '.wg-mode-drawer' : '.wg-tool-drawer');
    const opening = drawer.hidden;
    this.closeDrawer();
    if (!opening) return false;
    this.drawerReturn = document.activeElement;
    this.root.querySelector('.wg-guide').hidden = true;
    drawer.hidden = false;
    this.root.querySelector(kind === 'mode' ? '.wg-mode-launcher' : '.wg-toolbox').setAttribute('aria-expanded', 'true');
    drawer.querySelector('.wg-drawer-close')?.focus();
    return true;
  },
  closeDrawer() {
    this.root?.querySelectorAll('.wg-drawer').forEach(drawer => { drawer.hidden = true; });
    this.root?.querySelectorAll('.wg-mode-launcher,.wg-toolbox').forEach(el => el.setAttribute('aria-expanded', 'false'));
    this.drawerReturn?.focus?.(); this.drawerReturn = null;
  },
  placeFriend(action) {
    this.edit({ ...action, type: 'place-friend' });
    const outcome = waterFriendOutcome(this.garden);
    this.status.textContent = outcome.resting ? 'The cat rests in the cool shade you grew.' : outcome.visitingFlower ? 'Pip is visiting your flower.' : this.store.active === 'pip' ? 'Pip is happy here. Grow a flower nearby to invite a visit.' : 'The cat is comfortable here. You can choose a shady spot too.';
    void speech.say(outcome.resting ? 'wg_cat_rest' : outcome.visitingFlower ? 'wg_flower_visit' : 'wg_friend_place');
    this.setTool(this.tool === 'friend' ? 'friend' : this.tool);
    // Keep the result visible and narrated after the placement hint.
    this.status.textContent = outcome.resting ? 'The cat rests in the cool shade you grew.' : outcome.visitingFlower ? 'Pip is visiting your flower.' : this.store.active === 'pip' ? 'Pip is happy here.' : 'The cat is comfortable here.';
  },
  edit(action) {
    if (!this.alive || this.pen?.drawing || this.saving || this.checkpointing) return;
    if (this.root) delete this.root.dataset.keepFeedback;
    const next = editWaterGarden(this.garden, action);
    if (JSON.stringify(next) === JSON.stringify(this.garden)) {
      if (action.type === 'plant') this.status.textContent = next.plants.find(plant => plant.id === action.id)?.stage === 3
        ? 'This plant is already grown. Choose another seed to plant something different.'
        : 'Your seed is here. Connect a path and pour to help it grow.';
      return false;
    }
    this.store.drafts[this.store.active] = commitGardenEdit(this.draft, next);
    this.flow = null; this.render(); void this.persist();
  },
  point(point) { return { x: Math.max(0, Math.min(100, point.x / this.stage.clientWidth * 100)), y: Math.max(0, Math.min(100, point.y / this.stage.clientHeight * 100)) }; },
  startMark(point) {
    if (!this.alive || this.saving || this.checkpointing) return;
    if (this.root) delete this.root.dataset.keepFeedback;
    if (this.tool === 'draw' && this.garden.paths.length >= 60) { this.status.textContent = 'This garden is full of paths. Keep it, undo a path, or start a fresh garden.'; return; }
    this.pending = { before: clone(this.draft), points: [this.point(point)], tool: this.tool, startPixel: { x: point.x, y: point.y }, dragged: false };
    if (this.tool === 'decorate') {
      this.pending.decorationKind = this.decorationKind || 'flower';
      this.pending.surfaceSize = { width:this.stage.clientWidth, height:this.stage.clientHeight };
      this.pending.decorationIndex = waterDecorationAt(this.garden.decorations, { ...this.pending.points[0], width: this.stage.clientWidth, height: this.stage.clientHeight });
      const original = this.garden.decorations[this.pending.decorationIndex];
      if (original) this.pending.offset = { x: original.x - this.pending.points[0].x, y: original.y - this.pending.points[0].y };
    }
    if (this.tool === 'draw') this.persistPartial();
    this.paint();
  },
  moveMark(point) {
    if (!this.pending) return;
    if (this.pending.tool === 'lift') {
      if (Math.hypot(point.x - this.pending.startPixel.x, point.y - this.pending.startPixel.y) > 12) this.pending.dragged = true;
      this.paint();
      return;
    }
    if (this.pending.tool === 'decorate') {
      if (this.pending.decorationKind === 'move') { const p=this.point(point), offset=this.pending.offset || {x:0,y:0}; this.pending.destination = {x:Math.max(0,Math.min(100,p.x+offset.x)),y:Math.max(0,Math.min(100,p.y+offset.y))}; }
      this.paint(); return;
    }
    if (this.pending.tool === 'friend') { this.pending.points = [this.point(point)]; return; }
    const capacity = (60 - this.pending.before.garden.paths.length) * 799;
    if (this.pending.points.length < capacity) this.pending.points.push(this.point(point));
    else this.status.textContent = 'This garden is full of paths. Lift your pen, then keep it or undo a path.';
    this.paint();
    // Save unfinished intentional ink periodically and synchronously snapshot on exit.
    if (!this.partialTimer && this.pending.tool === 'draw') {
      const visit = this.visit, pending = this.pending;
      this.partialTimer = setTimeout(() => { if (!this.alive || this.visit !== visit || this.pending !== pending) return; this.partialTimer = null; this.persistPartial(); }, 80);
    }
  },
  persistPartial() {
    if (!this.pending || this.pending.tool !== 'draw') return;
    const draft = this.pending.before;
    this.store.drafts[this.store.active] = commitGardenEdit(draft, editWaterGarden(draft.garden, { type: 'path', points: this.pending.points }));
    void this.persist();
  },
  endMark(points, meta = {}) {
    if (!this.pending) return;
    clearTimeout(this.partialTimer); this.partialTimer = null;
    const pending = this.pending; this.pending = null;
    this.store.drafts[this.store.active] = pending.before;
    if (pending.tool === 'decorate') {
      let changed = false;
      if (!meta.cancelled && !meta.discarded && pending.surfaceSize.width === this.stage.clientWidth && pending.surfaceSize.height === this.stage.clientHeight) {
        const action = pending.decorationKind === 'move'
          ? { type:'move-decoration', index:pending.decorationIndex, ...(pending.destination || {}) }
          : { type:'decorate', ...pending.points[0], kind:pending.decorationKind };
        const next = editWaterGarden(pending.before.garden, action);
        changed = JSON.stringify(next) !== JSON.stringify(pending.before.garden);
        if (changed) this.store.drafts[this.store.active] = commitGardenEdit(pending.before,next);
      }
      this.flow=null; this.render(); if (changed) void this.persist();
      this.status.textContent = changed ? 'Your arrangement is here. Undo brings the earlier garden back.' : pending.before.garden.decorations.length >= 24 && pending.decorationKind !== 'move' ? 'There is room to move these decorations. Choose Move, or Undo one.' : 'Your garden is unchanged. Choose a flower or pebble to move.';
      return;
    }
    if (pending.tool === 'lift') {
      let changed = false;
      if (!meta.cancelled && !meta.discarded && !pending.dragged) {
        const next = editWaterGarden(pending.before.garden, { type: 'lift-path', ...pending.points[0], width: this.stage.clientWidth, height: this.stage.clientHeight });
        changed = next.paths.length < pending.before.garden.paths.length;
        if (changed) this.store.drafts[this.store.active] = commitGardenEdit(pending.before, next);
      }
      this.flow = null; this.render();
      if (changed) void this.persist();
      this.status.textContent = changed ? 'That path is lifted. Try a new route, or Undo to bring it back.' : 'Your paths are still here. Tap a channel to lift just that path.';
      return;
    }
    const canceledPlacement = pending.tool === 'friend' && meta.cancelled;
    if (!meta.discarded && !canceledPlacement) {
      const action = pending.tool === 'friend' ? { type: 'place-friend', ...pending.points[0] } : pending.tool === 'decorate' ? { type: 'decorate', ...pending.points[0], kind: 'flower' } : { type: 'path', points: pending.points };
      // OS cancellation retains intentional ink; a palm discarded by PenInput does not.
      if (['draw', 'decorate', 'friend'].includes(pending.tool)) this.store.drafts[this.store.active] = commitGardenEdit(pending.before, editWaterGarden(pending.before.garden, action));
    }
    this.flow = null; this.render(); void this.persist();
    if (pending.tool === 'friend' && !meta.discarded && !canceledPlacement) {
      const outcome = waterFriendOutcome(this.garden);
      this.status.textContent = outcome.resting ? 'The cat rests in the cool shade you grew.' : outcome.visitingFlower ? 'Pip is visiting your flower.' : 'Your friend is comfortable here.';
      void speech.say(outcome.resting ? 'wg_cat_rest' : outcome.visitingFlower ? 'wg_flower_visit' : 'wg_friend_place');
    }
  },
  undo() {
    if (!this.alive || this.pen?.drawing || this.saving || this.checkpointing) return;
    const hadChange = this.draft.history.length > 0;
    speech.cancel();
    this.store.drafts[this.store.active] = undoGardenEdit(this.draft); this.flow = null; this.render(); void this.persist();
    this.status.textContent = hadChange ? 'Your last change is undone. You can keep playing in this garden.' : 'Your garden is here. Choose something to try.';
  },
  pour() {
    if (!this.alive || this.pen?.drawing || this.saving || this.checkpointing || this.flow?.running) return;
    const result = pourWater(this.garden);
    this.store.drafts[this.store.active] = commitGardenEdit(this.draft, result.garden);
    this.flow = { ...result.connected, running: true, started: performance.now() };
    this.render(); void this.persist();
    const canopyGrew = result.grown.some(id => result.garden.plants.some(p => p.id === id && p.kind === 'leaf' && p.stage === 3));
    const flowerGrew = result.grown.some(id => result.garden.plants.some(p => p.id === id && p.kind === 'flower' && p.stage === 3));
    const friendInvitation = this.store.active === 'pip'
      ? result.garden.plants.some(plant => plant.kind === 'flower' && plant.stage === 3)
        ? 'Tap Pip, then a grown flower, to invite a visit.' : 'Tap Pip to choose a place in your garden.'
      : 'Tap the cat to choose a resting place.';
    const grownPlantsReached = result.garden.plants.filter(plant => plant.stage === 3 && result.connected.beds.includes(plant.id));
    let phrase;
    if (canopyGrew) {
      this.status.textContent = `Your leaves grew a canopy and cool shade. ${friendInvitation}`;
      phrase = this.store.active === 'pip' ? 'wg_bloom' : 'wg_canopy';
    } else if (result.grown.length) {
      this.status.textContent = 'Water reached the planted beds. Watch them grow!';
      phrase = flowerGrew ? 'wg_bloom' : 'wg_flow';
    } else if (grownPlantsReached.length) {
      this.status.textContent = `Water reached your grown plants. ${friendInvitation}`;
      phrase = this.store.active !== 'pip' && grownPlantsReached.some(plant => plant.kind === 'leaf') ? 'wg_canopy' : 'wg_bloom';
    } else if (result.connected.beds.length) {
      this.status.textContent = 'Water reached these beds. Plant a seed here.';
      phrase = 'wg_help';
    } else {
      this.status.textContent = 'The water stays near the spring. Connect a path to a bed.';
      phrase = 'wg_dry';
    }
    void speech.say(phrase);
    const visit = this.visit, flow = this.flow;
    const tick = () => {
      if (!this.alive || this.visit !== visit || this.flow !== flow || !flow.running) return;
      this.paint();
      if (performance.now() - this.flow.started < 1100 && !quietMotion()) this.animation = requestAnimationFrame(tick);
      else { this.flow.running = false; this.paint(); }
    };
    cancelAnimationFrame(this.animation); this.animation = requestAnimationFrame(tick);
  },
  render() {
    if (!this.alive || !this.store) return;
    const objectView = this.objectView = (this.objectView || 0) + 1;
    const current = () => this.alive && this.objectView === objectView && !this.saving && !this.checkpointing && !this.pen?.drawing;
    this.root.querySelectorAll('[data-mode]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.mode === this.store.active)));
    const mode = this.root.querySelector('.wg-mode-launcher');
    if (mode) {
      mode.replaceChildren(this.outingId ? picture('animal-friends/cozy-bed-v1', 'assets/art/final/animal-friends/cozy-bed-v1.png', 'wg-mode-picture') : this.store.active === 'shade' ? picture('props/wg-leafy-canopy', WATER_CANOPY_ART, 'wg-mode-picture')
        : this.store.active === 'pip' ? picture('props/counting-flower', WATER_DECORATION_ART, 'wg-mode-picture')
          : picture('stickers/draw_rainbow', 'assets/art/final/stickers/draw_rainbow.webp', 'wg-mode-picture'));
      mode.setAttribute('aria-label', this.outingId ? 'Return the cat to your own cozy corner' : `${WATER_SITUATIONS[this.store.active].title}. Choose a different garden`);
    }
    const isPip = this.store.active === 'pip';
    const objects = this.root.querySelector('.wg-objects'); objects.replaceChildren();
    this.canopies.replaceChildren();
    waterShadeAreas(this.garden).forEach(area => {
      const shade = document.createElement('span'); shade.className = 'wg-shade'; shade.style.left = `${area.x}%`; shade.style.top = `${area.y}%`; shade.style.width = `${area.rx * 2}%`; shade.style.height = `${area.ry * 2}%`; this.canopies.append(shade);
      const canopy = growthPicture('props/wg-leafy-canopy', WATER_CANOPY_ART, 'wg-canopy', canopySVG);
      canopy.style.left = `${WATER_BEDS.find(row => row.id === area.id).x}%`; canopy.style.width = `${WATER_CANOPY_WIDTH}%`; this.canopies.append(canopy);
      const target = document.createElement('button'); target.type = 'button'; target.className = 'wg-shade-target';
      target.style.left = `${area.x}%`; target.style.top = `${area.y}%`; target.style.width = `${area.rx * 2}%`; target.style.height = `${area.ry * 2}%`;
      target.setAttribute('aria-label', `Choose the shade under the ${area.id} leafy canopy for ${isPip ? 'Pip' : 'the cat'}`);
      target.onclick = () => { if (current() && this.tool === 'friend') this.placeFriend({ bed: area.id }); }; objects.append(target);
    });
    const spring = this.tool === 'draw' ? document.createElement('span') : button('pour', this.tool === 'route' ? 'Connect the spring to the junction' : 'Blue spring: pour water', () => {
      if (!current()) return;
      if (this.tool === 'route') this.edit({ type: 'segment', id: 'trunk' }); else this.pour();
    });
    if (this.tool === 'draw') { spring.className = 'wg-spring-marker'; spring.innerHTML = icon('pour'); spring.setAttribute('role', 'img'); spring.setAttribute('aria-label', 'Blue spring: draw a water path from here'); }
    spring.classList.add('wg-spring'); spring.style.left = `${WATER_SOURCE.x}%`; spring.style.top = `${WATER_SOURCE.y}%`; objects.append(spring);
    const pour = button('pour', 'Pour water along your channels', () => { if (current()) this.pour(); }); pour.classList.add('wg-pour');
    pour.hidden = !['draw', 'route', 'lift'].includes(this.tool);
    const pourCaption = document.createElement('span'); pourCaption.textContent = 'Pour'; pourCaption.setAttribute('aria-hidden', 'true'); pour.append(pourCaption); objects.append(pour);
    WATER_BEDS.forEach((bed, i) => {
      const plant = this.garden.plants[i];
      const el = document.createElement('button'); el.type = 'button'; el.className = `wg-bed wg-bed--${plant.stage} wg-bed--${plant.kind}`;
      el.dataset.invite = String(this.tool === 'plant' && plant.stage === 0);
      el.style.left = `${bed.x}%`; el.style.top = `${bed.y}%`;
      el.setAttribute('aria-label', `${bed.id} bed: ${['empty', 'seed', 'sprout', 'grown plant'][plant.stage]}. Tap to plant or change a seed.`);
      el.append(picture('props/counting-pot', 'assets/art/final/props/counting-pot.webp', 'wg-pot'));
      if (plant.stage === 3 && plant.kind === 'flower') el.append(picture('props/counting-flower', 'assets/art/final/props/counting-flower.webp', 'wg-flower'));
      if (plant.stage === 1) { const mark = document.createElement('span'); mark.className = 'wg-growth'; mark.innerHTML = '<i></i>'; el.append(mark); }
      if (plant.stage === 2) el.append(growthPicture('props/wg-sprout', WATER_SPROUT_ART, 'wg-growth wg-growth--sprout', icon('plant')));
      el.addEventListener('click', () => {
        if (!current()) return;
        if (this.tool === 'friend') this.placeFriend({ bed: bed.id });
        else if (this.tool === 'route') this.edit({ type: 'segment', id: bed.id });
        else if (this.tool === 'plant') this.edit({ type: 'plant', id: bed.id, kind: this.seedKind });
        else this.status.textContent = 'Choose the seed tool to plant here.';
      }); objects.append(el);
    });
    const outcome = waterFriendOutcome(this.garden);
    const friend = document.createElement('button'); friend.type = 'button'; friend.className = 'wg-friend';
    friend.style.left = `${this.garden.friend.x}%`; friend.style.top = `${this.garden.friend.y}%`;
    friend.setAttribute('aria-label', isPip ? 'Select Pip, then tap a flower or a place on the ground' : outcome.resting ? 'The cat is resting in your shade. Select to choose another place' : 'Select the cat, then tap a shady bed or a place on the ground');
    friend.setAttribute('aria-pressed', String(this.tool === 'friend'));
    const friendImage = picture(isPip ? 'characters/pip_idle' : outcome.resting ? 'props/wg-cat-resting-v1' : 'stories/black-cat', waterFriendArt(this.garden));
    if (outcome.resting) friendImage.addEventListener('error', () => { friendImage.src = standingCatArt; friend.classList.add('is-rest-fallback'); }, { once: true });
    friend.append(friendImage);
    friend.classList.toggle('is-resting', outcome.resting); friend.classList.toggle('is-visiting', outcome.visitingFlower);
    friend.onclick = () => { if (!current()) return; this.setTool('friend'); void speech.say(isPip ? 'wg_choose_flower' : 'wg_choose_shade'); }; objects.append(friend);
    if (this.outingPicture) {
      const sign = document.createElement('img'); sign.className = 'wg-visit-picture'; sign.src = this.outingPicture.png; sign.alt = 'Your exact picture came with the cat from your cozy corner'; sign.draggable = false; objects.append(sign);
    }
    this.paint();
  },
  paint() {
    if (!this.canvas || !this.store) return;
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) { this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); }
    const ctx = this.canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const draw = (path, color, width, dashed = false) => {
      ctx.beginPath(); path.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x / 100 * w, p.y / 100 * h));
      if (path.length === 1) { ctx.lineTo(path[0].x / 100 * w + .1, path[0].y / 100 * h); }
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(dashed ? [8, 9] : []); ctx.stroke(); ctx.setLineDash([]);
    };
    const paths = this.pending?.tool === 'draw' ? [...this.pending.before.garden.paths, this.pending.points] : this.garden.paths;
    paths.forEach(path => draw(path, '#b3a083', 15));
    if (this.flow) {
      const elapsed = this.flow.running ? (performance.now() - this.flow.started) / 1100 : 1;
      this.flow.paths.forEach(i => { if (elapsed >= (this.flow.depth[i] || 0) * .12) { draw(paths[i], '#6fcbe5', 10); if (this.flow.running) { ctx.lineDashOffset = -elapsed * 100; draw(paths[i], '#d1f6ff', 3, true); } } });
    }
    if (this.pending?.tool === 'lift' && !this.pending.dragged) {
      const selected = waterPathAt(paths, { ...this.pending.points[0], width: w, height: h });
      if (selected >= 0) { draw(paths[selected], '#fff7dd', 23); draw(paths[selected], '#b4748f', 13); }
    }
    const ornaments = this.garden.decorations.map(p => ({...p}));
    const placement = this.pending;
    if (placement?.tool === 'decorate' && placement.decorationKind === 'move' && ornaments[placement.decorationIndex]) {
      if (placement.destination) Object.assign(ornaments[placement.decorationIndex],placement.destination);
      const p=ornaments[placement.decorationIndex]; ctx.beginPath(); ctx.arc(p.x/100*w,p.y/100*h,25,0,Math.PI*2); ctx.strokeStyle='#678391'; ctx.lineWidth=3; ctx.stroke();
    }
    ornaments.forEach(p => {
      const x = p.x / 100 * w, y = p.y / 100 * h;
      if (p.kind === 'stone') { ctx.fillStyle = '#a6a89c'; ctx.beginPath(); ctx.ellipse(x, y, w * .02, h * .013, .3, 0, Math.PI * 2); ctx.fill(); }
      else if (this.decorationImage?.complete && this.decorationImage.naturalWidth) {
        const image = this.decorationImage, scale = Math.min(w * .06 / image.naturalWidth, h * .1 / image.naturalHeight);
        const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
        ctx.drawImage(image, x - iw / 2, y - ih / 2, iw, ih);
      } else {
        // Recognizable flower fallback; never relabel a stone as a flower.
        ctx.strokeStyle = '#658b52'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 9); ctx.stroke();
        ctx.fillStyle = '#eda7bc';
        for (let petal = 0; petal < 5; petal++) { const angle = petal / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4 - 3, 3, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#f8d875'; ctx.beginPath(); ctx.arc(x, y - 3, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    });
  },
  help() {
    if (!this.alive || !this.store || this.pen?.drawing || this.pending || this.saving || this.checkpointing) return;
    this.closeDrawer();
    const guide = this.root.querySelector('.wg-guide'); guide.hidden = !guide.hidden;
    guide.innerHTML = `<div>${icon('plant')}<span>Plant a seed</span></div><div>${icon('draw')}<span>Connect spring to bed</span></div><div>${icon('pour')}<span>Pour twice to grow</span></div><button type="button">Try tap paths</button><button type="button" class="wg-help-friend">Choose a place for ${this.store.active === 'pip' ? 'Pip' : 'the cat'}</button>`;
    guide.querySelector('button').onclick = () => { guide.hidden = true; this.setTool('route'); };
    guide.querySelector('.wg-help-friend').onclick = () => { guide.hidden = true; this.setTool('friend'); };
    guide.querySelector('.wg-help-friend').prepend(picture(this.store.active === 'pip' ? 'characters/pip_idle' : 'stories/black-cat', this.store.active === 'pip' ? 'assets/art/final/characters/pip_idle.webp' : 'assets/art/final/stories/black-cat.webp', 'wg-help-friend-art'));
    if (!guide.hidden) void speech.say('wg_help');
  },
  keepStatus(message) {
    this.status.textContent = message;
    if (this.root) this.root.dataset.keepFeedback = 'true';
  },
  async keep() {
    if (this.outingId) return this.returnToCorner();
    if (!this.alive || this.pen?.drawing || this.pending || this.saving || this.checkpointing) return;
    const plan = waterGardenKeepPlan(this.store);
    if (plan.duplicate) {
      this.keepStatus(waterGardenStorageStatus().persistent
        ? 'This exact garden is already in your picture book.'
        : 'Storage is unavailable. This garden is only available in the open session; it is not saved for reload.');
      return;
    }
    if (plan.full) {
      this.keepStatus('Your garden book is full. Older gardens are safe. Keep this garden open and ask a grown-up to back it up.');
      return;
    }
    const visit = this.visit; this.saving = true;
    this.store = keepWaterGarden(this.store);
    const keptId = this.store.gallery.at(-1).id;
    try {
      await this.persist();
      if (this.alive && this.visit === visit) this.keepStatus(waterGardenStorageStatus().persistent
        ? 'Your paths, plants and chosen friend place are kept. Open the picture book to play with them again.'
        : 'Storage is unavailable. Your open garden is safe for this session, but it was not saved for reload.');
    } catch {
      if (this.alive && this.visit === visit) {
        this.store.gallery = this.store.gallery.filter(row => row.id !== keptId);
        this.keepStatus('The garden could not be kept. Your open garden is still here.');
      }
    } finally { if (this.visit === visit) this.saving = false; }
  },
  gallery() {
    if (this.outingId) return;
    if (!this.alive || this.pen?.drawing || this.pending || this.saving || this.checkpointing) return;
    this.closeDrawer();
    let panel = this.root.querySelector('.wg-gallery');
    if (panel) { panel.remove(); return; }
    panel = document.createElement('section'); panel.className = 'wg-gallery'; panel.setAttribute('aria-label', 'Your editable saved gardens');
    this.showGalleryPage(panel, 0); this.root.append(panel);
  },
  showGalleryPage(panel, page) {
    const visit = this.visit, store = this.store;
    panel.replaceChildren();
    const close = button('back', 'Close saved gardens', () => panel.remove()); panel.append(close);
    if (!this.store.gallery.length) { const p = document.createElement('p'); p.textContent = 'Tap the heart to keep your garden here.'; panel.append(p); }
    const model = waterGardenGalleryPage(this.store.gallery, page);
    model.items.forEach((row, i) => {
      const el = document.createElement('button'); el.type = 'button'; el.setAttribute('aria-label', `Reopen saved garden ${model.start + i + 1}`); el.innerHTML = waterGardenPreview(row.garden);
      el.querySelectorAll('image[data-fallback]').forEach(image => image.addEventListener('error', () => { image.setAttribute('href', image.dataset.fallback); }, { once: true }));
      el.onclick = () => { if (!this.alive || this.visit !== visit || this.store !== store || this.saving || this.checkpointing || this.pen?.drawing) return; this.store = reopenWaterGarden(this.store, row.id); this.flow = null; panel.remove(); this.render(); void this.persist(); }; panel.append(el);
    });
    if (model.pages > 1) {
      const pager = document.createElement('div'); pager.className = 'wg-gallery-pages';
      const previous = button('back', 'Previous saved gardens', () => this.showGalleryPage(panel, model.page - 1)); previous.disabled = model.page === 0;
      const next = button('back', 'Next saved gardens', () => this.showGalleryPage(panel, model.page + 1)); next.classList.add('wg-page-next'); next.disabled = model.page === model.pages - 1;
      const count = document.createElement('span'); count.textContent = `${model.page + 1} / ${model.pages}`;
      pager.append(previous, count, next); panel.append(pager);
    }
  },
  breakBusy() { return !!this.pen?.drawing || !!this.pending || !!this.saving || this.checkpointing; },
  busy() { return this.breakBusy(); },
  beforeLeave() { return this.checkpoint(); },
  beforeBreak() { return this.checkpoint(); },
  checkpoint() {
    if (!this.alive) return Promise.resolve(false);
    if (!this.store) return Promise.resolve(true);
    if (this.checkpointPromise) return this.checkpointPromise;
    if (this.pen?.drawing || this.pending || this.saving) {
      if (this.status) this.status.textContent = this.saving ? 'Your garden is still being kept. Try again when it is ready.' : 'Finish this garden move, then try again. Your move is still here.';
      if (this.pending?.tool === 'draw') {
        // Retain interrupted intentional ink without ending the owning stroke.
        // Even a successful ink checkpoint refuses this requested exit; the
        // child can finish the move and ask to leave again.
        const visit = this.visit;
        this.persistPartial();
        const writing = checkpointLivingScene({ flush: () => this.flush(), retry: () => this.persist(), storage: () => this.storage(),
          alive: () => this.alive && this.visit === visit,
          report: message => { if (this.alive && this.visit === visit && this.status) this.status.textContent = message; }, subject: 'Your current garden ink' });
        this.checkpointPromise = writing.then(() => false).finally(() => { if (this.alive && this.visit === visit) this.checkpointPromise = null; });
        return this.checkpointPromise;
      }
      return Promise.resolve(false);
    }
    const visit = this.visit;
    this.checkpointing = true; if (this.status) this.status.textContent = '';
    const pending = (async () => {
      if (this.needsCurrentWrite || this.outingId) {
        try { await this.persist(); } catch { if (this.alive && this.visit === visit) this.status.textContent = 'Your garden could not save. It is still open here. Try again or ask a grown-up for help.'; return false; }
      }
      return checkpointLivingScene({ flush: () => this.flush(), retry: () => this.persist(), storage: () => this.storage(),
      alive: () => this.alive && this.visit === visit, held: () => !!this.pen?.drawing || !!this.pending || this.saving,
      report: message => { if (this.alive && this.visit === visit && this.status) this.status.textContent = message; }, subject: 'Your current garden' });
    })();
    this.checkpointPromise = pending.finally(() => { if (this.alive && this.visit === visit) { this.checkpointing = false; this.checkpointPromise = null; } });
    return this.checkpointPromise;
  },
  leave(destination) { if (!this.alive || this.checkpointing) return false; return router.go(destination, {}, { dir: 'right' }); },
  async returnToCorner() {
    if (!this.outingId || !this.alive || this.returning || this.pen?.drawing || this.pending || this.saving || this.checkpointing) return false;
    const visit = this.visit, id = this.outingId; this.returning = true;
    try {
      // Save the actual live branch before accepting its ending. Capacity
      // failures do not let an older successful tail shadow rejected ink.
      await this.persist();
      if (!this.alive || this.visit !== visit || !await this.checkpoint()) return false;
      this.saving = true;
      const accepted = await returnCatOuting(id, () => this.alive && this.visit === visit && !this.pen?.drawing && !this.pending);
      if (!accepted || !this.alive || this.visit !== visit) return false;
      this.saving = false; this.returning = false;
      // The live garden and accepted ending have already been durably written.
      // Repeating beforeLeave would try to save the now-consumed outing ID.
      // Router still enforces session locks and activity permissions.
      return await router.go('animal-friends', { returnedOutingId: id }, { dir: 'right', checkpointDone: this });
    } catch (error) {
      if (this.alive && this.visit === visit) this.status.textContent = error.code === 'animal-corner-changed' ? 'Your corner changed while this visit was open. Both are still here. Return Home and open your corner to continue.' : 'The cat could not return yet. Your open garden and corner are still here. Try again.';
      return false;
    } finally { if (this.alive && this.visit === visit) { this.returning = false; this.saving = false; } }
  },
  onBack() { return this.store && this.outingId ? this.returnToCorner() : this.leave(this.enteredFromMap ? 'map' : 'discovery'); },
  unmount() {
    this.closeDrawer();
    this.persistPartial(); this.alive = false; this.loadRetry?.remove(); this.loadRetry = null; this.openingGarden = false; this.visit = (this.visit || 0) + 1;
    // Keep the visit guard on this detached root: a delayed click belonging to
    // its old buttons must not act on a subsequently mounted singleton visit.
    clearTimeout(this.partialTimer); cancelAnimationFrame(this.animation); this.ro?.disconnect(); this.pen?.destroy(); this.mute?.destroy?.();
    window.removeEventListener('resize', this.resize); window.removeEventListener('pagehide', this.pagehide); document.removeEventListener('visibilitychange', this.visibility);
    this.pending = null; this.flow = null;
  },
};
export default waterGarden;
