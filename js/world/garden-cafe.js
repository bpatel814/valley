// The same kept Picnic meal lives in a child-arranged, illustrated café.
// Furniture, family and the actual plate move together as one useful place.
import { picnicLivePieces, picnicEnjoyedPieces, picnicCanFit, picnicCutIds } from '../data/picnic.js';
import { MUSIC_INSTRUMENTS } from '../data/music-band.js';
import { BandSound } from './screens/music-band.js';
import { pictureView } from './picture-view.js';

export const CAFE_ART = Object.freeze({
  background: 'assets/art/final/garden-cafe/background-v1.png',
  chair: 'assets/art/final/garden-cafe/chair-v1.png',
  table: 'assets/art/final/garden-cafe/table-v1.png',
  sign: 'assets/art/final/ui/sign.webp',
});
export const CAFE_PHASES = Object.freeze([
  { id: 'welcome', label: 'Make room', invitation: 'Choose who comes. Move their places, or invite one more visitor.' },
  { id: 'share', label: 'Share a meal', invitation: 'Choose some fruit, then a friend. Whole fruit, halves or a fruit bowl all work.' },
  { id: 'music', label: 'Our welcome', invitation: 'Change a sound or a quiet beat. Choose who keeps the beat and who echoes.' },
  { id: 'kept', label: 'Our café', invitation: 'Keep your café, play again, or change anything. Your places and meal are still yours.' },
]);
const instrumentArt = id => id === 'rest' ? null : `assets/art/final/music-band/${id}-v1.png`;
// Reviewed full-figure extents from Picture Show and Ishan's approved River
// greeting pose keep the foreground performers comparable in this scene.
const performerFrames = {
  rayna:[504,469,155,29,441,442], mama:[504,589,87,14,392,577], daddy:[503,624,49,14,386,612],
  ba:[480,640,116,16,363,624], dada:[356,672,16,16,340,656], veer:[385,648,8,8,377,640],
  ishan:[1086,1448,39,69,1055,1362], pip:[409,425,8,8,401,417],
};
const performerPortraits = { ishan:'assets/art/final/river-run/ishan-greeting-v1.png' };
// Reviewed native palms, in each untouched portrait frame.
// Raised palms use a hanging shaker so its head stays clear of the face and
// scene edge. Pip has no human palm; its instruments rest on the shared floor.
const performerHands = {
  rayna:{point:[.829*504,.426*469],shaker:[1,-1]}, mama:{point:[365,394]},
  daddy:{point:[.155*503,.397*624],shaker:[-1,-1]}, ba:{point:[245,401]},
  dada:{point:[306,465]}, veer:{point:[306,478]}, ishan:{point:[202,807],shaker:[-1,-1]},
};
// Grip and solid contact points measured in the approved full native PNGs.
// Faint shadows remain in the image rather than becoming a floating floor.
const performerProps = {
  bell:{size:[1312,1199],grip:[654,290],foot:[649,1056],height:.26},
  shaker:{size:[1246,1263],grip:[841,986],foot:[925.5,1201],height:.28},
  drum:{size:[1301,1209],foot:[642,1082],height:.24},
  wood:{size:[1283,1226],foot:[966,1072],height:.24},
};
let performerHandSerial = 0;

export function gardenCafeGeometry(width, height) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const unitWidth = Math.min(260, Math.max(112, w * .42), Math.max(112, h * .65));
  const unitHeight = unitWidth * 1.2;
  // Normalized placements have the same meaning across rotation. Keep the
  // complete place inside this scene rather than altering the saved layout.
  const point = (position, unitW = unitWidth, unitH = unitHeight, minimumY = .2) => ({
    x: unitW / 2 + (w - unitW) * ((position.x - .1) / .8),
    y: unitH + Math.max(0, h - unitH) * ((position.y - minimumY) / (.85 - minimumY)),
  });
  return { width: w, height: h, unitWidth, unitHeight, point, target: 44 };
}

/** Tabletop contact uses the native table's ellipse, not the hanging cloth. */
export function gardenCafePlateLayout(width, height, count) {
  const size = Math.max(50, Math.min(96, width * .38));
  const fruitSize = Math.min(30, size * .42);
  const center = { x: size / 2, y: size * .46 };
  // A small fan keeps every actual piece on the plate instead of wrapping down
  // the front of the table. Open the plate for full-sized individual pieces.
  const pieces = Array.from({ length: count }, (_, index) => {
    const angle = count === 1 ? 0 : -Math.PI / 2 + index * Math.PI * 2 / count;
    const radius = count === 1 ? 0 : size * .18;
    const x = center.x + Math.cos(angle) * radius - fruitSize / 2;
    const y = center.y + Math.sin(angle) * radius * .45 - fruitSize / 2;
    return { x, y, size: fruitSize, depth: Math.round(y * 1000) + index };
  });
  return { size, left: (width - size) / 2, top: height * .52 - size / 2, pieces };
}

/** A cancelled performance can never later write a made-up completed ending. */
export class CafePerformance {
  constructor({ sound = new BandSound(), schedule = (fn, ms) => setTimeout(fn, ms), cancel = timer => clearTimeout(timer), tick = () => {}, complete = () => {}, denied = () => {}, active = () => true } = {}) {
    Object.assign(this, { sound, schedule, cancel, tick, complete, denied, active });
    this.serial = 0; this.timer = null; this.running = false; this.nextTurn = null;
  }
  stop() { ++this.serial; this.cancel(this.timer); this.timer = null; this.nextTurn = null; this.running = false; this.sound.stop(); }
  step() { const next = this.nextTurn; this.nextTurn = null; if (!next || !this.running) return false; this.sound.stop(); next(); return this.running; }
  start(cafe, { stepped = false } = {}) {
    this.stop();
    const snapshot = JSON.parse(JSON.stringify({ rhythm: cafe.rhythm, roles: cafe.roles }));
    const token = this.serial; let beat = 0;
    const refuse = () => { this.stop(); this.denied(); };
    this.running = true;
    if (!this.active()) { this.stop(); return; }
    // Explicitly muted visual play is valid. An unmuted but unavailable audio
    // context must not turn an unheard welcome into a completed performance.
    if (this.sound.allowed() && !this.sound.prepare()) { refuse(); return; }
    const next = () => {
      if (token !== this.serial || !this.running) return;
      if (!this.active()) { this.stop(); return; }
      if (beat === 12) {
        if (this.sound.allowed() && !this.sound.prepare()) { refuse(); return; }
        this.running = false; this.timer = null; this.sound.stop();
        this.complete({ ...snapshot, completed: true, playedBeats: 12, at: Date.now() }); return;
      }
      const index = beat % 6, role = beat < 6 ? 'pulse' : 'echo', note = snapshot.rhythm[index];
      if (note !== 'rest' && this.sound.allowed()) {
        if (!this.sound.play(note, { pulse: role === 'pulse', echo: role === 'echo' })) { refuse(); return; }
      }
      else this.sound.stop();
      this.tick({ index, role, guest: snapshot.roles[role], note }); ++beat;
      // The last instrument tail is shorter than450ms. Rest is also a beat.
      if (stepped && beat < 12) this.nextTurn = next;
      else this.timer = this.schedule(next, beat === 12 ? 650 : 600);
    };
    next();
  }
}

export function renderGardenCafe(owner, state, current, ui) {
  const { img, button, portrait, fruitPicture, guests } = ui, scene = state.draft, cafe = scene.cafe;
  owner.content.replaceChildren();
  const stage = document.createElement('div'); stage.className = 'garden-cafe-stage';
  stage.setAttribute('role', 'group'); stage.setAttribute('aria-label', 'Our editable garden café'); stage.tabIndex = -1;
  stage.append(img(CAFE_ART.background, 'garden-cafe-background'));
  owner.content.append(stage); owner.cafeStage = stage;
  const g = gardenCafeGeometry(stage.clientWidth || owner.content.clientWidth,
    Math.max(168, stage.clientHeight || owner.content.clientHeight - 60));
  stage.style.setProperty('--cafe-canvas-height', `${g.height}px`);
  const position = (node, part, width, height, minimumY = .2) => {
    const point = g.point(part, width, height, minimumY);
    Object.assign(node.style, { left: `${point.x}px`, top: `${point.y}px`, width: `${width}px`, height: `${height}px` });
    return point;
  };
  const move = part => {
    owner.stopCafe?.(); owner.cafeMove = owner.cafeMove === part ? null : part; owner.paint();
    if (owner.cafeMove) { owner.cafeStage?.focus?.({ preventScroll: true }); owner.status.textContent = 'Tap a new place in the garden. Arrow keys move it too.'; }
  };
  stage.addEventListener('click', event => {
    if (!current() || !owner.cafeMove || event.target.closest('button')) return;
    const rect = stage.getBoundingClientRect(), part = owner.cafeMove;
    const w = part === 'sign' ? Math.max(70, g.unitWidth * .75) : g.unitWidth;
    const h = part === 'sign' ? w : g.unitHeight;
    const x = .1 + .8 * ((event.clientX - rect.left - w / 2) / Math.max(1, g.width - w));
    const minimumY = part === 'sign' ? .1 : .2;
    const y = minimumY + (.85 - minimumY) * ((event.clientY - rect.top + stage.scrollTop - h) / Math.max(1, g.height - h));
    owner.cafeMove = null; owner.change({ type: 'cafe-move', part, x, y });
  });
  stage.addEventListener('keydown', event => {
    if (!current() || !owner.cafeMove) return;
    const directions = { ArrowLeft: [-.035, 0], ArrowRight: [.035, 0], ArrowUp: [0, -.035], ArrowDown: [0, .035] };
    if (event.key === 'Escape') { owner.cafeMove = null; owner.paint(); return; }
    if (!directions[event.key]) return;
    event.preventDefault(); const part = owner.cafeMove, old = part === 'sign' ? cafe.sign : cafe.seats[part];
    const [dx, dy] = directions[event.key]; owner.change({ type: 'cafe-move', part, x: old.x + dx, y: old.y + dy });
    owner.cafeStage?.focus?.({ preventScroll: true });
  });

  const actualPlaces = ['left', 'right', ...(cafe.visitor ? ['visitor'] : [])];
  for (const [index, place] of actualPlaces.entries()) {
    const guest = place === 'visitor' ? cafe.visitor : scene.guests[index], name = guests[guest][0];
    const placeNode = document.createElement('section'); placeNode.className = 'garden-cafe-place';
    placeNode.dataset.cafePlace = place; placeNode.setAttribute('aria-label', `${name}'s table and chair`);
    position(placeNode, cafe.seats[place], g.unitWidth, g.unitHeight);
    placeNode.style.zIndex = String(Math.round(cafe.seats[place].y * 100));
    const chair = img(CAFE_ART.chair, 'garden-cafe-chair'); placeNode.append(chair);
    const enjoyedMeal = picnicEnjoyedPieces(scene, place, guest).length > 0;
    const person = button(owner.cafeArranging ? `Move ${name}'s place` : owner.selected ? `Give selected food to ${name} at this place` : `Choose who comes to ${name}'s place`, portrait(guest,enjoyedMeal ? 'happy' : 'idle'), () => {
      if (!current()) return;
      if (owner.cafeArranging) move(place); else if (owner.selected) owner.drop(place); else if (place === 'visitor') owner.chooseCafeVisitor(); else owner.chooseGuest(index);
    }, 'garden-cafe-person'); placeNode.dataset.cafeGuest = guest; placeNode.append(person);
    person.classList.toggle('is-share-target', !!owner.selected);
    const table = img(CAFE_ART.table, 'garden-cafe-table'); placeNode.append(table);
    const cloth = state.assets.find(asset => asset.id === scene.cloth);
    if (cloth) { const paper = img(cloth.png, 'garden-cafe-own-cloth'); paper.alt = 'Your exact whole picture is on this café table'; placeNode.append(paper); }
    const foods = picnicLivePieces(scene, place);
    const plate = button(owner.selected ? `Give selected food to ${name}` : `Open ${name}'s actual plate`, img('assets/art/final/props/picnic-round-plate-v1.png'), () => {
      if (!current()) return;
      if (owner.cafeArranging) move(place); else if (owner.selected) owner.drop(place); else owner.chooseCafePlate(place);
    }, 'garden-cafe-plate'); plate.dataset.drop = place;
    plate.classList.toggle('is-share-target', !!owner.selected);
    const layout = gardenCafePlateLayout(g.unitWidth, g.unitHeight, foods.length);
    Object.assign(plate.style, { left: layout.left + 'px', top: layout.top + 'px', width: layout.size + 'px', height: layout.size + 'px' });
    const pile = document.createElement('span'); pile.className = 'garden-cafe-plate-food';
    foods.forEach((food, index) => {
      const picture = fruitPicture(food), p = layout.pieces[index];
      Object.assign(picture.style, { left: p.x + 'px', top: p.y + 'px', width: p.size + 'px', height: p.size + 'px', zIndex: p.depth }); pile.append(picture);
    }); plate.append(pile); placeNode.append(plate);
    const label = document.createElement('span'); label.className = 'garden-cafe-name'; label.textContent = name; placeNode.append(label);
    if (enjoyedMeal) {
      const enjoyed = document.createElement('span'); enjoyed.className = 'garden-cafe-enjoyed'; enjoyed.textContent = '♡'; enjoyed.setAttribute('aria-label', `${name} enjoyed the meal`); placeNode.append(enjoyed);
    }
    if (owner.cafeMove === place) placeNode.classList.add('is-moving');
    stage.append(placeNode);
  }
  const signWidth = Math.max(70, g.unitWidth * .75);
  const sign = button(owner.cafeArranging ? 'Move our welcome sign' : 'Choose a picture for our welcome sign', img(CAFE_ART.sign), () => { if (current()) owner.cafeArranging ? move('sign') : owner.chooseCafeSign(); }, 'garden-cafe-sign');
  position(sign, cafe.sign, signWidth, signWidth, .1);
  // A distant sign belongs behind a nearer family place, rather than covering
  // a face after rotation. The pictured Move chooser reaches every overlap.
  sign.style.zIndex = owner.cafeMove === 'sign' ? '101' : String(Math.round(cafe.sign.y * 100));
  const signAsset = state.assets.find(asset => asset.id === cafe.sign.asset);
  if (signAsset) sign.append(pictureView(signAsset.png, cafe.sign.frame, 'garden-cafe-sign-paper', cafe.sign.frame ? 'Your original marks shown closer, with the whole original kept' : 'Your exact whole picture welcomes our visitors'));
  else { const flower = img('assets/art/final/stickers/draw_flower.webp', 'garden-cafe-sign-paper'); flower.alt = 'Game flower sign. Tap to choose your own picture.'; sign.append(flower); }
  sign.classList.toggle('is-moving', owner.cafeMove === 'sign'); stage.append(sign);
  if (!cafe.visitor) {
    const arrive = button('Invite one more visitor, or keep this small gathering', portrait('ba'), () => { if (current()) owner.chooseCafeVisitor(); }, 'garden-cafe-arrival');
    const plus = document.createElement('span'); plus.textContent = '+'; arrive.append(plus); stage.append(arrive);
  }
  const controls = document.createElement('div'); controls.className = 'garden-cafe-actions';
  const captioned = (node, label) => { const caption = document.createElement('span'); caption.textContent = label; node.append(caption); return node; };
  const arrange = button(owner.cafeArranging ? 'Finish moving places' : 'Move our tables, chairs and sign', img(CAFE_ART.chair), () => { if (!current()) return; owner.chooseCafeArrange(); }, 'garden-cafe-arrange');
  arrange.setAttribute('aria-pressed', String(!!owner.cafeArranging)); controls.append(captioned(arrange, owner.cafeArranging ? 'Done' : 'Move'));
  controls.append(captioned(button('Choose actual food from our basket', img('assets/art/final/stories/basket.webp'), () => { if (current()) owner.chooseCafeMeal(); }), 'Food'));
  controls.append(captioned(button('Edit or perform our welcome rhythm', img(instrumentArt('drum')), () => { if (current()) owner.chooseCafeTune(); }), 'Music'));
  controls.append(captioned(button('Our optional café Playday, with three different situations', ui.iconSVG('book'), () => { if (current()) owner.chooseCafePlayday(); }), 'Playday'));
  if (owner.selected) {
    const food = scene.pieces.find(piece => piece.id === owner.selected && !piece.eaten);
    const selection = captioned(button('Choose how to share, cut or put away this selected food', food ? fruitPicture(food) : img('assets/art/final/props/picnic-round-bowl-v1.png'), () => { if (current()) owner.chooseCafeSelected(); }, 'garden-cafe-selected-food'), 'Chosen'); controls.append(selection);
  }
  owner.content.append(controls);
  owner.root.classList.toggle('cafe-arranging', !!owner.cafeArranging);
  if (owner.cafeArranging) owner.status.textContent = owner.cafeMove ? 'Tap a new place in the garden.' : 'Tap a place or the sign, then tap where it goes.';
  else owner.status.textContent = CAFE_PHASES.find(phase => phase.id === cafe.phase)?.invitation || 'Welcome to your café. Share a meal, change things or make music.';
}

export function cafeInstrumentPicture(id, img) {
  if (id !== 'rest') return img(instrumentArt(id));
  const pause = document.createElement('span'); pause.className = 'garden-cafe-rest'; pause.textContent = '· · ·'; pause.setAttribute('aria-label', 'A quiet beat'); return pause;
}
export const cafeInstrumentLabel = id => id === 'rest' ? 'Quiet beat' : MUSIC_INSTRUMENTS.find(instrument => instrument.id === id)?.label || '';

/** Temporary, object-local help never moves food or chooses a preferred guest. */
export function showCafeObjectInvitation(owner, scene, ui, { schedule = (fn, ms) => setTimeout(fn, ms), cancel = timer => clearTimeout(timer),
  defer = fn => { fn(); return null; }, cancelDeferred = () => {} } = {}) {
  owner.stopCafeInvitation?.();
  const key = owner.selected ? `food:${owner.selected}` : scene.cafe.phase === 'welcome' && !scene.cafe.visitor ? 'visitor' : '';
  owner.cafeInviteSeen ??= new Set();
  if (!key || owner.cafeArranging || owner.cafeInviteSeen.has(key)) return;
  const food = scene.pieces.find(piece => piece.id === owner.selected && !piece.eaten);
  const bowl = owner.selected === 'bowl' && picnicLivePieces(scene, 'bowl').length;
  if (owner.selected && !food && !bowl) return;
  const incoming = bowl ? picnicLivePieces(scene,'bowl') : food ? [food] : [];
  const cues = [];
  let timer, frame, stopped = false;
  const stop = () => {
    stopped = true; cancel(timer); cancelDeferred(frame); cues.forEach(cue => cue.remove());
    owner.root.removeEventListener('pointerdown',stop,true); owner.root.removeEventListener('keydown',stop,true);
    if (owner.stopCafeInvitation === stop) owner.stopCafeInvitation = null;
  };
  owner.stopCafeInvitation = stop;
  owner.root.addEventListener('pointerdown',stop,true); owner.root.addEventListener('keydown',stop,true);
  frame = defer(() => {
    // A synchronous chooser can cover the just-rendered scene. Do not consume
    // first-touch help until the actual targets are available to the child.
    if (stopped || owner.overlay) { stop(); return; }
    const targets = owner.selected ? [...owner.cafeStage.querySelectorAll('.garden-cafe-plate')].filter(target =>
      (!food || food.place !== target.dataset.drop) && picnicCanFit(scene,target.dataset.drop,incoming)) : owner.cafeStage.querySelectorAll('.garden-cafe-arrival');
    if (!targets.length) { stop(); return; }
    owner.cafeInviteSeen.add(key);
    for (const target of targets) {
    const cue = document.createElement('span'); cue.className = 'garden-cafe-touch-invitation'; cue.setAttribute('aria-hidden','true');
    if (food) cue.append(ui.fruitPicture(food));
    else if (bowl) cue.append(ui.img('assets/art/final/props/picnic-round-bowl-v1.png'));
    const hand = document.createElement('span'); hand.className = 'garden-cafe-tap-hand';
    hand.innerHTML = '<svg viewBox="0 0 48 54" aria-hidden="true"><path d="M16 30V9c0-6 8-6 8 0v17-5c0-5 7-5 7 0v5-2c0-5 7-5 7 0v5c0-4 7-4 7 1v9c0 8-6 13-14 13h-5c-7 0-10-5-14-10l-6-8c-4-6 3-10 7-5l3 3Z" fill="#fff5dc" stroke="#624637" stroke-width="3" stroke-linejoin="round"/></svg>';
      cue.append(hand); target.append(cue); cues.push(cue);
    }
    timer = schedule(stop,2300);
  });
}

/** Chosen performers come to the front for this turn; saved seats stay exact. */
export function mountCafePerformers(stage, cafe, { portrait, guests }) {
  const svg = (tag, attributes = {}) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg',tag);
    for (const [name,value] of Object.entries(attributes)) node.setAttribute(name,value);
    return node;
  };
  const group = document.createElement('div'); group.className = 'garden-cafe-musicians';
  group.setAttribute('role','group'); group.setAttribute('aria-label','Our two family welcome performers');
  const players = new Map();
  for (const role of ['pulse','echo']) {
    const guest = cafe.roles[role], player = document.createElement('figure');
    player.className = 'garden-cafe-musician'; player.dataset.cafeRole = role; player.dataset.cafeGuest = guest;
    const original = performerPortraits[guest] ? {src:performerPortraits[guest]} : portrait(guest), bounds = performerFrames[guest];
    const [sourceWidth,sourceHeight,x,y,right,bottom] = bounds;
    const view = pictureView(original.src,{sourceWidth,sourceHeight,x,y,width:right-x,height:bottom-y},'picnic-portrait',guests[guest][0]+' joins our welcome');
    view.setAttribute('preserveAspectRatio','xMidYMax meet');
    const handId=`cafe-performer-hand-${++performerHandSerial}`,frameId=`${handId}-frame`;
    const frameDefs=svg('defs'),frameClip=svg('clipPath',{id:frameId,clipPathUnits:'userSpaceOnUse'});
    frameClip.append(svg('rect',{x,y,width:right-x,height:bottom-y}));frameDefs.append(frameClip);
    // Keep the previously reviewed portrait padding clipped, while allowing
    // an attached complete prop to extend beyond that portrait's viewBox.
    view.querySelector('image').setAttribute('clip-path',`url(#${frameId})`);view.prepend(frameDefs);
    const prop = svg('g',{class:'garden-cafe-musician-prop','aria-hidden':'true'}); view.append(prop); player.append(view);
    const label = document.createElement('figcaption'); label.textContent = guests[guest][0] + (role === 'pulse' ? ' plays first' : ' echoes'); player.append(label);
    group.append(player); players.set(role,{player,prop,original,bounds,handId});
  }
  stage.classList.add('cafe-performing'); stage.append(group);
  const hiddenPeople = [...stage.querySelectorAll('[data-cafe-place]')].filter(node => Object.values(cafe.roles).includes(node.dataset.cafeGuest));
  hiddenPeople.forEach(node => node.classList.add('cafe-at-front'));
  return {
    tick(beat) {
      for (const [role, actor] of players) {
        const {player,prop,original,bounds,handId} = actor;
        const active = role === beat.role;
        player.classList.toggle('is-playing',active); player.classList.toggle('is-rest',active && beat.note === 'rest');
        prop.replaceChildren(); delete prop.dataset.attachment;
        if (active) {
          const [sourceWidth,sourceHeight,x,y,right,bottom] = bounds, height = bottom-y;
          if (beat.note === 'rest') {
            const cx=x+(right-x)*.70,cy=bottom-height*.14;
            const dots=svg('text',{class:'garden-cafe-rest-dots',x:cx,y:cy,'text-anchor':'middle','dominant-baseline':'middle','font-size':height*.1});
            dots.textContent='· · ·';
            prop.append(svg('circle',{class:'garden-cafe-rest-disc',cx,cy,r:height*.12}),dots);
          } else {
            const meta=performerProps[beat.note],hand=performerHands[player.dataset.cafeGuest];
            const held=!!hand && !!meta.grip,signs=held && beat.note==='shaker' ? hand.shaker || [1,1] : [1,1];
            let scale=height*meta.height/meta.size[1];
            // Keep the genuine grip without letting a hanging solid body
            // cross the same floor that supports the full portrait.
            if (held && signs[1]>0) scale=Math.min(scale,(bottom-hand.point[1])/(meta.foot[1]-meta.grip[1]));
            const contact=held ? meta.grip : meta.foot,point=held ? hand.point : [x+(right-x)*.78,bottom];
            const sx=scale*signs[0],sy=scale*signs[1];
            prop.dataset.attachment=held?'hand':'floor';
            prop.append(svg('image',{href:instrumentArt(beat.note),width:meta.size[0],height:meta.size[1],
              transform:`matrix(${sx} 0 0 ${sy} ${point[0]-contact[0]*sx} ${point[1]-contact[1]*sy})`}));
            if (held) {
              // Repaint only the original palm over the grip. This preserves
              // the static approved pose, including its transparent contour.
              const radius=height*.025,defs=svg('defs'),clip=svg('clipPath',{id:handId,clipPathUnits:'userSpaceOnUse'});
              clip.append(svg('rect',{x:point[0]-radius,y:point[1]-radius*1.4,width:radius*2,height:radius*2.8}));defs.append(clip);
              prop.append(defs,svg('image',{class:'garden-cafe-musician-hand',href:original.src,width:sourceWidth,height:sourceHeight,'clip-path':`url(#${handId})`}));
            }
          }
        }
        player.setAttribute('aria-label', guests[player.dataset.cafeGuest][0] + (active ? beat.note === 'rest' ? ': a quiet beat' : ': ' + cafeInstrumentLabel(beat.note) : ': listening'));
      }
    },
    stop() { group.remove(); stage.classList.remove('cafe-performing'); hiddenPeople.forEach(node => node.classList.remove('cafe-at-front')); },
  };
}
export { picnicCutIds };
