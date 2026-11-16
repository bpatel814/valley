// The valley is a place to choose a friend, see what grew, and return to a creation.
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
import { installControlCue } from '../control-cue.js';
import speech from '../../audio/speech.js';
import { valleyProfile } from '../../data/valley-profiles.js';
import { halloweenActive, seasonHero, seasonLogo, seasonLogoFallback } from '../../data/season.js';

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
  return screen._groupPanel?.querySelector('.map-group-choice') || screen._due || null;
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

export const map = {
  id: 'map',
  async mount(host) {
    this._alive = true;
    const profile = valleyProfile(settings.get().valleyProfile);
    document.title = profile.title;
    host.setAttribute('aria-label', profile.title);
    this._chars = [];
    this._offs = [];
    this._timers = [];
    const root = document.createElement('div');
    root.className = 'map valley-map valley-map--places valley-map--clear';
    const scenery = addScenery(root, 'map');
    const meadow = (halloweenActive(settings.get()) && picture('halloween/boo-hollow-background-v1', { className: 'scene-layer' })) || picture('bg/stories/day', { className: 'scene-layer' });
    if (meadow) scenery.replaceChildren(meadow);
    root.insertAdjacentHTML('beforeend', '<div class="map-trails" aria-hidden="true"><svg class="map-trail map-trail--wide" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M17 43C28 28 40 55 50 43S75 31 83 43S80 74 67 91S42 77 33 91"/></svg><svg class="map-trail map-trail--tall" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M24 27C38 20 65 22 76 27S70 46 76 59S34 49 24 59S28 89 50 94"/></svg><svg class="map-trail map-trail--short" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M10 83Q20 68 30 83T50 83T70 83T90 83"/></svg></div>');
    root.insertAdjacentHTML('beforeend', `<div class="valley-title" aria-label="${profile.title}"><img src="${seasonLogo(profile, settings.get())}" data-fallback="${seasonLogoFallback(profile, settings.get())}" alt="${profile.title}" draggable="false"/><span class="title-fallback" aria-hidden="true">${profile.possessive}<span>Valley</span></span></div><div class="map-regions"></div><div class="valley-grown" aria-hidden="true"></div>`);
    const logo = root.querySelector('.valley-title img');
    logo.addEventListener('load', () => logo.parentElement.classList.add('has-logo'));
    logo.addEventListener('error', () => {
      const fallback = logo.dataset.fallback;
      if (fallback) { delete logo.dataset.fallback; logo.src = fallback; }
      else logo.remove();
    });
    if (logo.complete && logo.naturalWidth) logo.parentElement.classList.add('has-logo');
    const heroLook = seasonHero(profile, settings.get());
    const child = picture(heroLook.art, { alt: heroLook.alt }) || picture(profile.heroArt, { alt: profile.heroAlt });
    if (child) {
      const hero = document.createElement('div');
      hero.className = `title-${profile.id} valley-${profile.id}`;
      hero.classList.toggle('title-costume', heroLook.costume && child.alt === heroLook.alt);
      hero.append(child); root.append(hero);
    }
    host.append(root);
    this.root = root;
    // Saved creations remain in Our pictures; the start screen has one target per destination.
    const state = progress.get();
    const regions = settings.get().regions || {};
    const registered = new Set(router.registered());
    const choices = mapChoices(regions, registered, halloweenActive(settings.get()));
    const playable = choices.filter(region => isPreviewRouteEnabled(region.route));
    const suggested = playable[(state.journey?.plays || 0) % Math.max(1, playable.length)];
    const row = root.querySelector('.map-regions');
    row.dataset.count = String(choices.length);
    root.querySelector('.map-trails').hidden = choices.length !== 5;
    row.style.setProperty('--region-count', choices.length);
    for (const region of choices) {
      const paused = !isPreviewRouteEnabled(region.route);
      const tile = document.createElement('button');
      tile.className = `region region--${region.id} tap`;
      tile.classList.toggle('preview-disabled', paused);
      tile.dataset.region = region.route;
      tile.dataset.place = region.id;
      tile.dataset.group = region.id;
      const button = tile;
      button.type = 'button';
      button.disabled = paused;
      button.setAttribute('aria-label', region.label);
      button.innerHTML = '<span class="region-plinth"></span><span class="region-friend"></span><span class="region-caption" aria-hidden="true"><span class="activity-symbol"></span><span class="region-words"><span class="region-name"></span><span class="region-action"></span></span></span>';
      const place = region.place && picture(region.place, { className: 'region-place' });
      if (place) button.querySelector('.region-friend').append(place);
      else {
        const character = new Character(button.querySelector('.region-friend'), {
          name: region.art, art: true, follow: true,
          letter: region.id === 'garden' && settings.get().learningLevel !== 'explore' ? 'R' : '',
          stripes: state.unicorn?.stripes || 0,
        });
        this._chars.push(character);
      }
      button.querySelector('.activity-symbol').innerHTML = cue(region.cue);
      button.querySelector('.region-name').textContent = region.title;
      button.querySelector('.region-action').textContent = region.action;
      installControlCue(button, {phraseKey:MAP_GROUP_VOICES[region.id] || '', isActive: () => this._alive && !this._groupPanel && !router.isMoving()});
      tapify(button, () => {
        if (!this._alive || router.isMoving()) return;
        sfx.play('tap');
        this.openGroup(region, button);
      });
      row.append(tile);
      if (region === suggested) { tile.classList.add('is-suggested'); this._due = tile; }
    }
    this._mute = muteButton();
    root.append(this._mute);
    const paintJourney = () => {
      const journey = progress.get().journey || {};
      root.querySelector('.valley-grown').innerHTML = Array.from({ length: Math.min(10, journey.flowers || 0) }, (_, i) => `<span class="grown-flower" style="--flower-i:${i};--flower-tilt:${(i % 3 - 1) * 7}deg">${flowerSVG(3, i)}</span>`).join('');
    };
    paintJourney();
    this._offs.push(bus.on('progress:changed', paintJourney));
    this._offs.push(bus.on('journey:play', paintJourney));
    this._timers.push(setTimeout(() => {
      const target = mapIdleTarget(this);
      if (this._alive && target && !pip.isOnboarding()) pip.rest(target, { dx: .32, dy: -.4 });
    }, 350));
    this._offs.push(bus.on('settings:changed', () => { if (settings.get().reducedMotion) { this._idleMotion?.cancel?.(); this._idleMotion = null; } }));
    this._idleHelp = installIdleHelp(root, {
      active: () => this._alive && router.current() === 'map' && !router.isMoving() && !session.isBreakLocked() && !pip.isOnboarding() && !speech.isSpeaking() && !!mapIdleTarget(this),
      demonstrate: () => {
        const target = mapIdleTarget(this); if (!target) return null; target.classList.add('is-control-cued');
        const reduced = settings.get().reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const motion = !reduced && target.animate?.([{translate:'0 0'},{translate:'0 -3px'},{translate:'0 0'}],{duration:1200,iterations:1,easing:'ease-in-out'});
        this._idleMotion = motion || null; motion?.finished?.catch?.(()=>{});
        let voiceOwned = !settings.get().muted && speech.isUnlocked();
        if (voiceOwned) Promise.resolve(speech.say(this._groupPanel ? 'discovery_welcome' : 'ui_map_invite')).then(() => { voiceOwned = false; }, () => { voiceOwned = false; });
        let visualDone = false;
        const clearVisual = () => { if (visualDone) return; visualDone = true; motion?.cancel?.(); if (this._idleMotion === motion) this._idleMotion = null; target.classList.remove('is-control-cued'); };
        const visualTimer = setTimeout(clearVisual, 2400);
        return () => { clearTimeout(visualTimer); clearVisual(); if (voiceOwned && speech.isSpeaking()) speech.cancel(); voiceOwned = false; };
      },
    });
  },
  openGroup(group, returnFocus) {
    if (!this._alive || this._groupPanel) return;
    const row = this.root.querySelector('.map-regions'); row.inert = true;
    const panel = document.createElement('section'); panel.className = 'map-group-panel';
    panel.setAttribute('role','region'); panel.setAttribute('aria-label',group.label);
    const title=document.createElement('h1'); title.className='map-group-title'; title.textContent=group.title;
    const back=document.createElement('button'); back.type='button'; back.className='map-group-back tap';
    back.dataset.control='home'; back.setAttribute('aria-label','Back to the valley choices'); back.innerHTML=iconSVG('home')+'<span>Home</span>';
    const options=document.createElement('div'); options.className='map-group-options';
    options.dataset.count=String(group.routes.length);
    const close=()=>{
      if (this._groupPanel!==panel) return;
      panel.remove(); row.inert=false; this._groupPanel=null; document.documentElement.classList.remove('map-chooser-open'); returnFocus?.focus();
    };
    tapify(back,close);
    for (const route of group.routes) {
      const [name, action, symbol] = ROUTE_LABELS[route];
      const button=document.createElement('button'); button.type='button'; button.className='map-group-choice tap';
      button.dataset.destination=route; button.setAttribute('aria-label',name+': '+action);
      const picture=document.createElement('span'); picture.className='map-group-picture';
      const fallback=document.createElement('span'); fallback.className='map-group-fallback'; fallback.innerHTML=cue(symbol); fallback.hidden=true;
      const image=document.createElement('img'); image.src=MAP_ROUTE_PICTURES[route]; image.alt=''; image.draggable=false;
      image.addEventListener('error',()=>{ image.hidden=true; fallback.hidden=false; });
      picture.append(image,fallback);
      const words=document.createElement('span'); words.className='map-group-words';
      const nameEl=document.createElement('strong'); nameEl.textContent=name;
      const actionEl=document.createElement('span'); actionEl.textContent=action; words.append(nameEl,actionEl);
      button.append(picture,words);
      const phraseKey = MAP_ROUTE_VOICES[route] || '';
      installControlCue(button,{phraseKey,isActive:()=>this._alive && this._groupPanel===panel && !router.isMoving()});
      tapify(button,()=>{
        if (!this._alive || this._groupPanel!==panel || router.isMoving()) return;
        const destination=resolvePlayDestination(route);
        const params={...mapEntryParams(destination.route),...destination.params};
        sfx.play('tap'); void router.go(destination.route,params,{dir:'left'});
      });
      options.append(button);
    }
    const first=options.children[0];
    if (first) {
      first.classList.add('is-suggested');
      const hand=document.createElement('span'); hand.className='map-group-invite'; hand.setAttribute('aria-hidden','true');
      hand.innerHTML='<svg viewBox="0 0 80 80"><path d="M27 43V20Q27 10 35 13Q39 14 39 21V32Q43 25 49 30Q57 27 60 35Q69 34 69 43L62 65Q45 77 29 65L15 49Q11 43 16 39Q20 37 27 43Z" fill="#ffe1bd" stroke="#805f52" stroke-width="4" stroke-linejoin="round"/></svg>';
      first.append(hand);
    }
    panel.append(back,title,options); this.root.append(panel); this._groupPanel=panel; this._groupClose=close;
    // Home owns the top-left corner of a chooser; the grown-up gear steps aside until
    // the chooser closes (it stays on the home screen and the title screen).
    document.documentElement.classList.add('map-chooser-open');
    back.focus();
  },
  busy() { return false; },
  onBack() { this._groupClose?.(); },
  unmount() {
    this._alive = false;
    this._idleHelp?.(); this._idleHelp=null; this._idleMotion?.cancel?.(); this._idleMotion=null;
    this._groupPanel?.remove(); this._groupPanel=null; this._groupClose=null;
    document.documentElement.classList.remove('map-chooser-open');
    this._timers?.forEach(clearTimeout);
    this._offs?.forEach(off => off());
    this._chars?.forEach(character => character.destroy());
    this._mute?.destroy?.();
    this._chars = []; this._offs = []; this._timers = [];
    this._due = null; this.root = null;
  },
};
export default map;
