// Home: the valley itself. Five places, one tap to play, no words (see valley-places.js).
import { Character, glyphSVG } from '../characters.js';
import router, { tapify, muteButton, iconSVG } from '../router.js';
import { addScenery, picture } from '../scene.js';
import bus from '../bus.js';
import settings from '../../state/settings.js';
import session from '../../state/session.js';
import progress from '../../state/progress.js';
import sfx from '../../audio/sfx.js';
import { UPPER, LOWER, DIGITS } from '../../data/letters.js';
import pip from '../pip.js';
import { isPreviewRouteEnabled } from '../../data/preview-access.js';
import { availablePlayGroups, resolvePlayDestination } from '../../data/play-catalog.js';
import { installIdleHelp } from '../idle-help.js';
import speech from '../../audio/speech.js';
import { valleyProfile } from '../../data/valley-profiles.js';
import { halloweenActive, seasonHero } from '../../data/season.js';
import db from '../../state/db.js';
import { VALLEY_THINGS, valleyLayout } from '../valley-places.js';

export function poolFor(kind) {
  if (kind === 'all') return [...UPPER, ...LOWER, ...DIGITS];
  if (kind === 'upper+lower') return [...UPPER, ...LOWER];
  return [...UPPER];
}

const REGIONS = [
  { id:'words', title:'Words', action:'Letters and stories', art:'caterpillar', label:'Words: choose letters or stories', cue:'letter' },
  { id:'draw', title:'Draw', action:'Pictures and stamps', art:'bridge', place:'places/art', label:'Draw: choose a way to make pictures', cue:'brush' },
  { id:'play', title:'Play', action:'Friends and toys', art:'discovery', label:'Play: choose friends or toys', cue:'shapes' },
  { id:'make', title:'Make', action:'Build and explore', art:'unicorn', label:'Make: choose what to build or explore', cue:'mark' },
  { id:'together', title:'Together', action:'Family and stories', art:'family_child1', place:'places/together', label:'Together: choose family play', cue:'book' },
];
const ROUTE_LABELS = {
  'town-tracks':['Town','Build roads and a station','shapes'],
  garden:['Garden','Make marks','mark'], meadow:['Words','Make a name','letter'], stories:['Stories','Make a story','book'],
  studio:['Draw','Paint and stamp','brush'], bridge:['Draw along','Make a picture','brush'], 'picture-post':['Picture mail','Send a picture','book'],
  'rolling-run':['Rolling hill','Roll a toy','shapes'], 'river-run':['River','Float a toy','shapes'], 'toy-workshop':['Toy workshop','Make a toy','shapes'],
  'animal-friends':['Cat friend','Play with cat','book'], 'boo-hollow':['Ghost friends','Draw and play','mark'],
  'build-lab':['Build','Make a bridge','shapes'], 'water-garden':['Water garden','Grow flowers','mark'], discovery:['Puzzles','Find and match','shapes'], 'garden-cafe':['Café','Welcome friends','book'],
  treehouse:['Scrapbook','See our pictures','book'], grandma:['Ba','Visit Ba','book'], picnic:['Picnic','Share food','shapes'],
  'music-band':['Music','Make a tune','mark'], 'play-stage':['Play stage','Make a show','book'],
};
// Existing clips describe the destination without asking for controls not yet visible.
export const MAP_GROUP_VOICES = Object.freeze({ together:'halloween_lane_invite' });
export const MAP_ROUTE_VOICES = Object.freeze({
  garden:'ui_lets_feed', meadow:'ui_unicorn_lost_colors', stories:'play_stage_invite', studio:'family_mural_intro', bridge:'ui_lets_draw',
  'picture-post':'picture_post_intro', 'animal-friends':'object_cat',
  'boo-hollow':'halloween_boo_welcome', 'water-garden':'wg_free',
  discovery:'discovery_welcome', 'play-stage':'play_stage_invite',
});
export const MAP_ROUTE_PICTURES = Object.freeze({
  "town-tracks": "assets/art/final/town-map.svg",
  "garden": "assets/art/final/characters/caterpillar_idle.webp",
  "meadow": "assets/art/final/characters/unicorn_idle.webp",
  "stories": "assets/art/final/stories/basket.webp",
  "studio": "assets/art/final/places/art.webp",
  "bridge": "assets/art/final/characters/bridge_idle.webp",
  "picture-post": "assets/art/final/picture-post/envelope.png",
  "rolling-run": "assets/art/final/rolling-run/ramp-v1.png",
  "river-run": "assets/art/final/river-run/dock-v1.png",
  "toy-workshop": "assets/art/final/toy-workshop/wheels-v1.png",
  "animal-friends": "assets/art/final/stories/black-cat.webp",
  "boo-hollow": "assets/art/final/halloween/boo-path-v1-runtime.webp",
  "build-lab": "assets/art/final/characters/discovery_idle.webp",
  "garden-cafe": "assets/art/final/garden-cafe/table-v1.png",
  "water-garden": "assets/art/final/props/counting-flower.webp",
  "discovery": "assets/art/final/characters/pip_idle.webp",
  "treehouse": "assets/art/final/places/together.webp",
  "grandma": "assets/art/final/characters/family_grandma_idle.webp",
  "picnic": "assets/art/final/props/fruit_bowl.webp",
  "music-band": "assets/art/final/music-band/drum-v1.png",
  "play-stage": "assets/art/final/play-stage/play_stage_backdrop.webp"
});
export function mapChoices(regions, registered) {
  const groups = availablePlayGroups(registered, regions, settings.activityRegion,
    route => isPreviewRouteEnabled(route) && settings.isActivityEnabled(route));
  return REGIONS.flatMap(region => {
    const group = groups.find(item => item.id === region.id);
    return group ? [{...region, routes:group.routes, route:group.routes[0]}] : [];
  });
}

export function mapEntryParams(route) {
  if (route === 'discovery') return { catalogGroup: 'puzzles', fromMap: true };
  if (route === 'toy-workshop') return { returnTo: 'map' };
  if (['town-tracks', 'rolling-run', 'river-run', 'animal-friends', 'music-band', 'build-lab', 'picnic', 'play-stage', 'water-garden', 'picture-post'].includes(route)) return { fromMap: true };
  return {};
}

export function mapIdleTarget(screen) {
  return screen._due || null;
}

function cue(kind) {
  if (kind === 'book') return iconSVG('book');
  if (kind === 'shapes') return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 31L26 8L40 31Z" fill="#efafc3" stroke="#6e5746" stroke-width="3" stroke-linejoin="round"/><rect x="10" y="37" width="23" height="20" rx="3" fill="#a7d8be" stroke="#6e5746" stroke-width="3"/><circle cx="46" cy="45" r="12" fill="#ffe19d" stroke="#6e5746" stroke-width="3"/></svg>';
  if (kind === 'letter') return glyphSVG('A', '#775cb4');
  if (kind === 'mark') return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 48Q32 0 54 48" fill="none" stroke="#8f6bc3" stroke-width="8" stroke-linecap="round"/><circle cx="10" cy="48" r="7" fill="#f7cf50" stroke="#685047" stroke-width="3"/></svg>';
  return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m21 43 24-30q6-7 10-1 2 3-1 7L29 48Z" fill="#c1adeb" stroke="#604b43" stroke-width="4" stroke-linejoin="round"/><path d="M27 43C11 34 15 54 7 54c13 9 25-1 20-11Z" fill="#ed9cbb" stroke="#604b43" stroke-width="4"/></svg>';
}

function flowerSVG(lit = 3, variant = 0) {
  const colors = ['#f49abb', '#c3a3ed', '#ffd681', '#9fd8c0'];
  const color = colors[variant % colors.length];
  return `<svg viewBox="0 0 100 118" aria-hidden="true"><path d="M50 61v50M50 99q-24 2-27-18 25-4 27 18m0-3q23-1 26-21-24 0-26 21" fill="#9ad7ad" stroke="#627754" stroke-width="4" stroke-linejoin="round"/>${[0, 120, 240].map((angle, i) => `<ellipse cx="50" cy="30" rx="19" ry="26" transform="rotate(${angle} 50 48)" fill="${i < lit ? color : '#f6edea'}" stroke="${i < lit ? '#86645e' : '#c5b7bd'}" stroke-width="3"/>`).join('')}<circle cx="50" cy="49" r="16" fill="#ffe29a" stroke="#86645e" stroke-width="3"/><circle cx="45" cy="47" r="2" fill="#5c4941"/><circle cx="56" cy="47" r="2" fill="#5c4941"/><path d="M45 54q5 5 10 0" fill="none" stroke="#5c4941" stroke-width="2.5" stroke-linecap="round"/></svg>`;
}

// The valley itself is home (work order item 6, Nov 16 2026): five places stand
// in the meadow; one tap on anything there goes straight into play. The old
// two-level word menus are gone. Places and things come from valley-places.js.
const WIGGLE_MS = 4200;

function reducedMotion() {
  return settings.get().reducedMotion || document.documentElement.classList.contains('reduced-motion')
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

async function latestCreation() {
  // Something she made last time hangs on the easel. Reads only; never writes.
  try {
    const rows = await db.entries('gallery');
    let best = null;
    for (const [, row] of rows || []) {
      const png = row?.png;
      const usable = (typeof png === 'string' && png.startsWith('data:image/')) || (typeof Blob !== 'undefined' && png instanceof Blob);
      if (usable && Number.isFinite(row.at) && (!best || row.at > best.at)) best = row;
    }
    return best;
  } catch (_) { return null; }
}

export const map = {
  id: 'map',
  async mount(host) {
    this._alive = true;
    this._leaving = false;
    const profile = valleyProfile(settings.get().valleyProfile);
    document.title = profile.title;
    host.setAttribute('aria-label', profile.title);
    this._chars = [];
    this._offs = [];
    this._timers = [];
    this._urls = [];
    const root = document.createElement('div');
    root.className = 'map valley-map valley-home';
    // Plain hills behind the places: the places are the scene, the backdrop stays quiet.
    const scenery = addScenery(root, 'map', { foreground: false });
    const backdrop = (halloweenActive(settings.get()) && picture('halloween/boo-hollow-background-v1', { className: 'scene-layer' }))
      || picture('bg/stories/day', { className: 'scene-layer' });
    if (backdrop && scenery) scenery.replaceChildren(backdrop);
    const heroLook = seasonHero(profile, settings.get());
    const child = picture(heroLook.art, { alt: heroLook.alt }) || picture(profile.heroArt, { alt: profile.heroAlt });
    if (child) {
      const hero = document.createElement('div');
      hero.className = `title-${profile.id} valley-${profile.id} valley-home-hero`;
      hero.classList.toggle('title-costume', heroLook.costume && child.alt === heroLook.alt);
      hero.append(child); root.append(hero);
      this._hero = hero;
    }
    root.insertAdjacentHTML('beforeend', '<div class="valley-grown" aria-hidden="true"></div><div class="valley-places"></div>');
    host.append(root);
    this.root = root;

    const registered = new Set(router.registered());
    const isOpen = route => registered.has(route) && isPreviewRouteEnabled(route) && settings.isActivityEnabled(route);
    const places = valleyLayout(isOpen);
    const meadow = root.querySelector('.valley-places');
    meadow.dataset.count = String(places.length);
    meadow.dataset.extras = String(Math.max(0, ...places.map(place => place.extras.length)));
    this._bigs = [];
    places.forEach((place, index) => {
      const spot = document.createElement('div');
      spot.className = `valley-place valley-place--${place.id}`;
      spot.style.setProperty('--i', index);
      spot.dataset.place = place.id;
      const extras = document.createElement('div');
      extras.className = 'valley-extras';
      for (const route of place.extras) extras.append(this.thing(route, place, false));
      const big = this.thing(place.main, place, true);
      spot.append(extras, big);
      meadow.append(spot);
      this._bigs.push(big);
    });
    const journey = progress.get().journey || {};
    const suggested = this._bigs[(journey.plays || 0) % Math.max(1, this._bigs.length)] || null;
    if (suggested) { suggested.classList.add('is-suggested'); this._due = suggested; }

    this._mute = muteButton();
    root.append(this._mute);
    const paintJourney = () => {
      const grown = progress.get().journey || {};
      root.querySelector('.valley-grown').innerHTML = Array.from({ length: Math.min(10, grown.flowers || 0) }, (_, i) => `<span class="grown-flower" style="--flower-i:${i};--flower-tilt:${(i % 3 - 1) * 7}deg">${flowerSVG(3, i)}</span>`).join('');
    };
    paintJourney();
    this._offs.push(bus.on('progress:changed', paintJourney));
    this._offs.push(bus.on('journey:play', paintJourney));
    this._timers.push(setTimeout(() => {
      const target = mapIdleTarget(this);
      if (this._alive && target && !pip.isOnboarding()) pip.rest(target, { dx: .32, dy: -.4 });
    }, 350));
    // The places breathe: one gentle sway at a time, never all at once.
    let last = -1;
    this._wiggle = setInterval(() => {
      if (!this._alive || this._leaving || router.isMoving() || document.hidden || reducedMotion() || !this._bigs.length) return;
      let pick = Math.floor(Math.random() * this._bigs.length);
      if (pick === last && this._bigs.length > 1) pick = (pick + 1) % this._bigs.length;
      last = pick;
      this._bigs[pick].querySelector('.valley-thing-body')?.animate?.([
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-2.5deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0deg)' },
      ], { duration: 1100, easing: 'ease-in-out' });
    }, WIGGLE_MS);
    // Her latest creation on the easel, after the scene is already up.
    latestCreation().then(row => {
      const canvas = this.root?.querySelector('.valley-easel-canvas');
      if (!row || !canvas || !this._alive) return;
      const img = document.createElement('img');
      img.alt = ''; img.draggable = false;
      if (typeof row.png === 'string') img.src = row.png;
      else { const url = URL.createObjectURL(row.png); this._urls.push(url); img.src = url; }
      img.addEventListener('error', () => img.remove());
      canvas.append(img); canvas.classList.add('has-picture');
    });
    this._offs.push(bus.on('settings:changed', () => { if (settings.get().reducedMotion) { this._idleMotion?.cancel?.(); this._idleMotion = null; } }));
    this._idleHelp = installIdleHelp(root, {
      active: () => this._alive && router.current() === 'map' && !router.isMoving() && !session.isBreakLocked() && !pip.isOnboarding() && !speech.isSpeaking() && !!mapIdleTarget(this),
      demonstrate: () => {
        const target = mapIdleTarget(this); if (!target) return null; target.classList.add('is-control-cued');
        const motion = !reducedMotion() && target.querySelector('.valley-thing-body')?.animate?.([{ translate: '0 0' }, { translate: '0 -6%' }, { translate: '0 0' }], { duration: 1200, iterations: 1, easing: 'ease-in-out' });
        this._idleMotion = motion || null; motion?.finished?.catch?.(() => {});
        let voiceOwned = !settings.get().muted && speech.isUnlocked();
        if (voiceOwned) Promise.resolve(speech.say('ui_map_invite')).then(() => { voiceOwned = false; }, () => { voiceOwned = false; });
        let visualDone = false;
        const clearVisual = () => { if (visualDone) return; visualDone = true; motion?.cancel?.(); if (this._idleMotion === motion) this._idleMotion = null; target.classList.remove('is-control-cued'); };
        const visualTimer = setTimeout(clearVisual, 2400);
        return () => { clearTimeout(visualTimer); clearVisual(); if (voiceOwned && speech.isSpeaking()) speech.cancel(); voiceOwned = false; };
      },
    });
  },
  /** One thing standing in the valley: a friend or a picture she can touch. */
  thing(route, place, big) {
    const spec = VALLEY_THINGS[route] || { art: MAP_ROUTE_PICTURES[route] || '', label: ROUTE_LABELS[route]?.[0] || route };
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `valley-thing valley-thing--${big ? 'big' : 'small'} tap`;
    button.dataset.destination = route;
    button.dataset.region = route;
    button.setAttribute('aria-label', spec.label);
    const body = document.createElement('span');
    body.className = 'valley-thing-body';
    let character = null;
    if (spec.friend) {
      const state = progress.get();
      character = new Character(body, {
        name: spec.friend, art: true, follow: true,
        letter: spec.friend === 'caterpillar' && settings.get().learningLevel !== 'explore' ? 'R' : '',
        stripes: state.unicorn?.stripes || 0,
      });
      this._chars.push(character);
    } else {
      const img = document.createElement('img');
      img.src = spec.art; img.alt = ''; img.draggable = false;
      img.addEventListener('error', () => { img.hidden = true; body.insertAdjacentHTML('beforeend', `<span class="valley-thing-fallback">${cue(ROUTE_LABELS[route]?.[2] || 'shapes')}</span>`); });
      body.append(img);
      for (const layer of spec.layers || []) { const extra = document.createElement('img'); extra.src = layer; extra.alt = ''; extra.draggable = false; body.append(extra); }
      if (spec.easel && big) { const canvas = document.createElement('span'); canvas.className = 'valley-easel-canvas'; body.append(canvas); }
    }
    button.append(body);
    let answered = false;
    // Touch answers at once: sound and a squash on the finger going down.
    const answer = () => {
      if (answered || !this._alive || this._leaving) return;
      answered = true;
      sfx.play(place.sound || 'tap');
      character?.set('cheer');
      if (!reducedMotion()) {
        body.animate?.([
          { transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(0) scale(1.07,.9)', offset: .25 },
          { transform: 'translateY(-10%) scale(.96,1.06)', offset: .62 }, { transform: 'translateY(0) scale(1,1)' },
        ], { duration: 420, easing: 'cubic-bezier(.34,1.4,.64,1)' });
      }
    };
    button.addEventListener('pointerdown', event => { if (event.button === 0) answer(); });
    tapify(button, () => {
      if (!this._alive || this._leaving || router.isMoving()) return;
      answer();
      this._leaving = true;
      this._hero?.animate?.([{ translate: '0 0' }, { translate: '0 -6%' }, { translate: '0 0' }], { duration: 380 });
      const destination = resolvePlayDestination(route);
      const params = { ...mapEntryParams(destination.route), ...destination.params };
      this._timers.push(setTimeout(async () => {
        const moved = await router.go(destination.route, params, { dir: 'left' });
        if (!moved && this._alive) { this._leaving = false; answered = false; character?.set('idle'); }
      }, reducedMotion() ? 60 : 300));
    });
    button.addEventListener('pointercancel', () => { if (!this._leaving) { answered = false; character?.set('idle'); } });
    return button;
  },
  busy() { return false; },
  onBack() {},
  unmount() {
    this._alive = false;
    clearInterval(this._wiggle); this._wiggle = null;
    this._idleHelp?.(); this._idleHelp = null; this._idleMotion?.cancel?.(); this._idleMotion = null;
    this._timers?.forEach(clearTimeout);
    this._offs?.forEach(off => off());
    this._chars?.forEach(character => character.destroy());
    this._urls?.forEach(url => URL.revokeObjectURL(url));
    this._mute?.destroy?.();
    this._chars = []; this._offs = []; this._timers = []; this._urls = []; this._bigs = [];
    this._due = null; this.root = null; this._hero = null;
  },
};
export default map;
