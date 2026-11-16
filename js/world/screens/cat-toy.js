// Cat friend as a toy (work order item 8, backlog V10, Nov 16 2026).
//
// Hide and seek that never ends: three big hiding places stand in the meadow and
// the cat is behind one of them. The place hiding her wiggles now and then. A
// tap pops the place at once; the cat springs out (with the found-you voice) or
// a little surprise does. Petting her makes hearts; three pets and she curls up
// for a nap. Then she hides again by herself. Nothing to read, no buttons but
// Home and Sound, no way to fail, nothing saved: the older corner (saved corners,
// pictures, garden visits) is untouched and still opens from its own routes.
import router, { homeButton, muteButton } from '../router.js';
import { addScenery, picture } from '../scene.js';
import sfx from '../../audio/sfx.js';
import speech from '../../audio/speech.js';
import settings from '../../state/settings.js';

const A = 'assets/art/final/';
export const CAT_PLACES = Object.freeze([
  Object.freeze({ id: 'leaf', art: A + 'animal-friends/leafy-screen-v1.png', voice: 'living_animal_leaves', label: 'the leafy bush' }),
  Object.freeze({ id: 'basket', art: A + 'animal-friends/hiding-basket-v1.png', voice: 'living_animal_basket', label: 'the basket' }),
  Object.freeze({ id: 'shelter', art: A + 'animal-friends/blanket-shelter-v1.png', voice: 'living_animal_blanket', label: 'the blanket den' }),
]);
export const CAT_SURPRISES = Object.freeze([
  Object.freeze({ id: 'butterfly', art: A + 'characters/butterfly_open.webp' }),
  Object.freeze({ id: 'ball', art: A + 'stories/ball.webp' }),
  Object.freeze({ id: 'bunny', art: A + 'stories/rabbit.webp' }),
]);
export const CAT_ART = Object.freeze({ cat: A + 'stories/black-cat.webp', rest: A + 'props/wg-cat-resting-v1.png' });
export const PETS_TO_NAP = 3;
const HINT_MS = 5200, STAY_MS = 6500, NAP_MS = 4200;

/** A different hiding place from the one she was just found in. */
export function nextHidingPlace(current, random = Math.random, count = CAT_PLACES.length) {
  if (count < 2) return 0;
  const pick = Math.floor(random() * (count - 1));
  return current >= 0 && pick >= current ? pick + 1 : pick;
}

/** What hops out of an empty place: they take turns, so each tap feels new. */
export function surpriseFor(turn) { return CAT_SURPRISES[((turn % CAT_SURPRISES.length) + CAT_SURPRISES.length) % CAT_SURPRISES.length]; }

function reducedMotion() {
  return !!settings.get().reducedMotion || document.documentElement.classList.contains('reduced-motion')
    || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
function say(key) { if (!settings.get().muted && speech.isUnlocked?.()) void Promise.resolve(speech.say(key)).catch(() => {}); }
function img(src, cls) { const el = document.createElement('img'); el.src = src; el.alt = ''; el.draggable = false; if (cls) el.className = cls; return el; }

export function createCatToy() {
  let host = null, alive = false, enteredFromMap = true, mute = null;
  let places = [], cat = null, catImg = null, stage = null;
  let catAt = 0, phase = 'hidden', pets = 0, turn = 0;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };
  const clearAll = () => { timers.forEach(clearTimeout); timers.clear(); };
  let hintTimer = 0, leaveTimer = 0;

  const animate = (el, frames, opts) => (reducedMotion() || !el?.animate) ? null : el.animate(frames, opts);
  const hop = el => animate(el, [
    { transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(0) scale(1.08,.9)', offset: .22 },
    { transform: 'translateY(-9%) scale(.97,1.05)', offset: .6 }, { transform: 'translateY(0) scale(1,1)' },
  ], { duration: 420, easing: 'cubic-bezier(.34,1.4,.64,1)' });

  function placeCat(index, visible) {
    catAt = index;
    cat.style.setProperty('--slot', String(index));
    cat.classList.toggle('is-out', visible);
    cat.setAttribute('aria-hidden', String(!visible));
    cat.tabIndex = visible ? 0 : -1;
  }

  function hearts(x, y, count = 3) {
    for (let i = 0; i < count; i++) {
      const heart = document.createElement('span');
      heart.className = 'cat-toy-heart'; heart.setAttribute('aria-hidden', 'true');
      heart.innerHTML = '<svg viewBox="0 0 32 30"><path d="M16 28C5 20 1 14 1 8.5A7.5 7.5 0 0 1 16 5a7.5 7.5 0 0 1 15 3.5C31 14 27 20 16 28Z" fill="#f59ab9" stroke="#a5566f" stroke-width="2"/></svg>';
      heart.style.left = `${x + (i - (count - 1) / 2) * 4}%`; heart.style.top = `${y}%`;
      stage.append(heart);
      const motion = animate(heart, [{ transform: 'translate(-50%,0) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-30px) scale(1)', opacity: 1, offset: .3 },
        { transform: `translate(calc(-50% + ${(i - 1) * 14}px),-90px) scale(.9)`, opacity: 0 }], { duration: 1100 + i * 120, easing: 'ease-out' });
      later(() => heart.remove(), motion ? 1400 : 700);
    }
  }

  function scheduleHint() {
    clearTimeout(hintTimer); timers.delete(hintTimer);
    hintTimer = later(() => {
      if (phase === 'hidden') {
        // The place hiding her rustles; a tip of a tail would be next.
        animate(places[catAt].querySelector('.cat-toy-place-art'), [
          { transform: 'rotate(0)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(2.5deg)' }, { transform: 'rotate(-1.5deg)' }, { transform: 'rotate(0)' },
        ], { duration: 900, easing: 'ease-in-out' });
      }
      scheduleHint();
    }, HINT_MS);
  }

  function hideAgain() {
    if (!alive || phase === 'moving') return;
    clearTimeout(leaveTimer); timers.delete(leaveTimer);
    phase = 'moving';
    catImg.src = CAT_ART.cat; cat.classList.remove('is-resting');
    const next = nextHidingPlace(catAt);
    cat.classList.remove('is-out');
    later(() => { placeCat(next, false); phase = 'hidden'; scheduleHint(); }, reducedMotion() ? 50 : 520);
  }

  function stayThenHide(ms = STAY_MS) { clearTimeout(leaveTimer); timers.delete(leaveTimer); leaveTimer = later(hideAgain, ms); }

  function found(index) {
    phase = 'found'; pets = 0;
    placeCat(index, true);
    sfx.play('sparkle');
    say(CAT_PLACES[index].voice);
    hearts(18 + index * 32, 30, 3);
    stayThenHide();
  }

  function surprise(index) {
    const kind = surpriseFor(turn++);
    const el = img(kind.art, `cat-toy-surprise cat-toy-surprise--${kind.id}`);
    el.style.setProperty('--slot', String(index));
    stage.append(el);
    sfx.play('pop');
    const frames = kind.id === 'butterfly'
      ? [{ transform: 'translate(-50%,10%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-60%) scale(1)', opacity: 1, offset: .35 }, { transform: 'translate(10%,-180%) scale(.8) rotate(12deg)', opacity: 0 }]
      : kind.id === 'ball'
        ? [{ transform: 'translate(-50%,20%) scale(.5)', opacity: 0 }, { transform: 'translate(-50%,-70%) scale(1)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,0) scale(1.05,.92)', offset: .55 }, { transform: 'translate(-50%,-30%) scale(1)', offset: .72 }, { transform: 'translate(-50%,10%) scale(.8)', opacity: 0 }]
        : [{ transform: 'translate(-50%,40%)', opacity: 0 }, { transform: 'translate(-50%,-25%)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,-25%)', opacity: 1, offset: .75 }, { transform: 'translate(-50%,40%)', opacity: 0 }];
    const motion = animate(el, frames, { duration: 1500, easing: 'ease-in-out' });
    later(() => el.remove(), motion ? 1550 : 600);
    // The place where she really is giggles right after, so the next tap can find her.
    later(() => { if (phase === 'hidden') animate(places[catAt].querySelector('.cat-toy-place-art'), [{ transform: 'rotate(0)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(0)' }], { duration: 700 }); }, 900);
  }

  function tapPlace(index) {
    if (!alive) return;
    hop(places[index].querySelector('.cat-toy-place-art'));
    if (phase === 'hidden') { if (index === catAt) found(index); else surprise(index); }
    else if (phase === 'found' && index !== catAt) { sfx.play('pop'); }
  }

  function pet() {
    if (!alive || phase !== 'found') return;
    pets += 1;
    sfx.play('chime');
    hop(catImg);
    hearts(18 + catAt * 32, 26, 2);
    if (pets >= PETS_TO_NAP) {
      phase = 'resting'; clearTimeout(leaveTimer); timers.delete(leaveTimer);
      cat.classList.add('is-resting'); catImg.src = CAT_ART.rest;
      say('living_animal_rest');
      later(() => { if (phase === 'resting') { phase = 'found'; hideAgain(); } }, NAP_MS);
    } else stayThenHide();
  }

  return {
    id: 'animal-friends',
    mount(el, params = {}) {
      host = el; alive = true; enteredFromMap = params.fromMap !== false;
      phase = 'hidden'; pets = 0; turn = 0;
      host.classList.add('cat-toy');
      host.setAttribute('aria-label', 'Hide and seek with the cat');
      const root = document.createElement('div'); root.className = 'cat-toy-scene';
      const scenery = addScenery(root, 'map', { foreground: false });
      const backdrop = picture('bg/stories/day', { className: 'scene-layer' });
      if (backdrop && scenery) scenery.replaceChildren(backdrop);
      stage = document.createElement('div'); stage.className = 'cat-toy-stage';
      cat = document.createElement('button'); cat.type = 'button'; cat.className = 'cat-toy-cat';
      cat.setAttribute('aria-label', 'Pet the cat');
      catImg = img(CAT_ART.cat, 'cat-toy-cat-art');
      cat.append(catImg);
      cat.addEventListener('pointerdown', event => { if (event.button === 0) { event.preventDefault(); pet(); } });
      cat.addEventListener('click', event => { if (event.detail === 0) pet(); }); // keyboard
      stage.append(cat);
      places = CAT_PLACES.map((place, index) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = `cat-toy-place cat-toy-place--${place.id}`;
        b.style.setProperty('--slot', String(index));
        b.setAttribute('aria-label', `Look in ${place.label}`);
        const art = img(place.art, 'cat-toy-place-art'); b.append(art);
        // Touch answers on finger-down; a keyboard press still works through click.
        b.addEventListener('pointerdown', event => { if (event.button === 0) { event.preventDefault(); tapPlace(index); } });
        b.addEventListener('click', event => { if (event.detail === 0) tapPlace(index); });
        stage.append(b);
        return b;
      });
      root.append(stage);
      const home = homeButton(); home.setAttribute('aria-label', 'Home: back to your valley');
      mute = muteButton();
      root.append(home, mute);
      host.append(root);
      placeCat(nextHidingPlace(-1), false);
      scheduleHint();
      // A first nudge: the place hiding her rustles soon after she arrives.
      later(() => { if (phase === 'hidden') animate(places[catAt].querySelector('.cat-toy-place-art'), [{ transform: 'rotate(0)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(0)' }], { duration: 800 }); }, 1400);
      say('living_animal_seek');
    },
    busy() { return false; },
    breakBusy() { return false; },
    onBack() { void router.go('map'); },
    beforeLeave() { return true; },
    unmount() {
      alive = false; clearAll(); mute?.destroy?.();
      host?.classList.remove('cat-toy');
      host = stage = cat = catImg = mute = null; places = [];
    },
    // For tests: the current state, read only.
    _state() { return { phase, catAt, pets }; },
  };
}

export default createCatToy();
