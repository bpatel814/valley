// treehouse.js - Rayna's picture scrapbook and local sticker-decorating table.

import { installIdleHelp } from '../idle-help.js';
import session from '../../state/session.js';
import router, { homeButton, muteButton, tapify, iconSVG } from "../router.js";

// Destinations available on the map remain intact; only duplicate tabs are hidden.
export function treehouseTabVisible(kind) { return ['decorate','drawings','mural','family'].includes(kind); }
import { addScenery } from "../scene.js";
import bus from "../bus.js";
import art from "../art.js";
import progress from "../../state/progress.js";
import settings from "../../state/settings.js";
import { drawingSVG } from "../../data/drawings.js";
import * as gallery from "../../parent/gallery.js";
import scrapbook from "../scrapbook.js";
import db from "../../state/db.js";
import { shouldAccept } from "../../engine/pen.js";
import { stickerById } from "../../data/stickers.js";
import FamilyMural from "../family-mural.js";
import speech from "../../audio/speech.js";
import sfx from "../../audio/sfx.js";

const PAGE_SIZE = 2;
const DRAWING_SIZE = 4;

let visit = 0;
let host = null;
let mute = null;
let mural = null;
let pageMenu = null;
let timers = [];

function button(cls, label, picture, action) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = cls;
  el.setAttribute("aria-label", label);
  el.innerHTML = picture;
  return tapify(el, action);
}

export function createTreehousePageMenu(tabs, canChange = () => true) {
  let current = '', expanded = false;
  const toggle=button('family-tab family-tab--pages tap','show scrapbook pages',iconSVG('book'),()=>{
    if (toggle.hidden || !canChange()) return;expanded=!expanded;sync();
  });
  toggle.dataset.pagesToggle='';const caption=document.createElement('span');caption.textContent='Pages';toggle.appendChild(caption);tabs.appendChild(toggle);
  tabs.addEventListener('keydown',event=>{if(event.key==='Escape' && current==='decorate' && expanded && canChange()){event.preventDefault();expanded=false;sync();toggle.focus?.({preventScroll:true});}});
  const sync=()=>{
    const decorating=current==='decorate';toggle.hidden=!decorating;toggle.setAttribute('aria-expanded',String(decorating && expanded));
    toggle.setAttribute('aria-label',expanded?'close scrapbook pages':'show scrapbook pages');
    tabs.querySelectorAll('.family-tab').forEach(tab=>{
      if(tab===toggle)return;const kind=tab.dataset.page;
      tab.hidden=!treehouseTabVisible(kind) || (decorating && (!expanded || kind==='decorate'));
      tab.classList.toggle('is-current',kind===current);tab.setAttribute('aria-current',kind===current?'page':'false');
    });
  };
  return { toggle, isOpen() { return current==='decorate' && expanded; }, show(kind) { current=kind;expanded=false;sync(); }, collapse() { if(current!=='decorate' || !expanded)return false;if(canChange()){expanded=false;sync();toggle.focus?.({preventScroll:true});}return true; } };
}

function familyTabIcon(kind) {
  if (kind === "family") return iconSVG("heart");
  if (kind === "drawings") return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 49 18 34 43 9l12 12-25 25Z" fill="#ff9b70" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="m18 34 12 12-18 3Z" fill="#ffe082" stroke="currentColor" stroke-width="4"/></svg>';
  if (kind === "mural") return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 50 13 36 38 11l11 11-25 25Z" fill="#ff9b70" stroke="currentColor" stroke-width="4"/><path d="M43 43c-8-10-23 2 0 14 23-12 8-24 0-14Z" fill="#ef76a3" stroke="currentColor" stroke-width="3"/></svg>';
  return '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 7 7 16 18 2-14 12 4 18-15-9-15 9 4-18L7 25l18-2Z" fill="#ffe071" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>';
}

function playStageTabPicture() {
  const picture = document.createElement("span");
  picture.className = "family-stage-entry-picture";
  for (const [key, layer] of [
    ["play-stage/backdrop", "backdrop"],
    ["play-stage/booth_front", "booth"],
  ]) {
    const source = art.get(key);
    if (!source) continue;
    const img = source.cloneNode();
    img.alt = "";
    img.draggable = false;
    img.className = "family-stage-entry-" + layer;
    picture.appendChild(img);
  }
  return picture;
}

function playStageAvailable() {
  return settings.isActivityEnabled("play-stage") && router.registered().includes("play-stage") &&
    art.has("play-stage/backdrop") && art.has("play-stage/booth_front");
}

function stickerFace(sticker, cls = "") {
  const wrap = document.createElement("span");
  wrap.className = "family-sticker " + cls;
  const source = sticker && art.get(sticker.art);
  if (source) {
    const img = source.cloneNode();
    img.alt = "";
    img.draggable = false;
    wrap.appendChild(img);
    return wrap;
  }
  if (sticker && sticker.kind === "draw") {
    wrap.innerHTML = drawingSVG(sticker.key, { className: "family-sticker-svg", title: sticker.label });
    return wrap;
  }
  const hue = sticker && sticker.hue || "#ff9eb5";
  if (sticker && sticker.kind === "butterfly") {
    wrap.innerHTML = '<svg class="family-sticker-svg" viewBox="0 0 100 100" aria-hidden="true"><path d="M48 48C35 47 15 38 18 20C21 5 43 17 50 36C57 17 79 5 82 20C85 38 65 47 52 48C67 52 77 70 66 82C57 91 51 69 50 58C49 69 43 91 34 82C23 70 33 52 48 48Z" fill="' + hue + '" stroke="#684b45" stroke-width="5"/><path d="M50 35V73" stroke="#684b45" stroke-width="7" stroke-linecap="round"/></svg>';
  } else if (sticker && sticker.kind === "gem") {
    wrap.innerHTML = '<svg class="family-sticker-svg" viewBox="0 0 100 100" aria-hidden="true"><path d="M18 35L34 17H66L82 35L50 84Z" fill="' + hue + '" stroke="#684b45" stroke-width="5" stroke-linejoin="round"/><path d="M18 35H82M34 17L42 35L50 84L58 35L66 17" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="4"/></svg>';
  } else {
    const shape = sticker && sticker.key === "grandma_hug"
      ? '<path d="M50 84C38 72 17 59 17 38C17 20 39 15 50 31C61 15 83 20 83 38C83 59 62 72 50 84Z" fill="#ff9eb5" stroke="#684b45" stroke-width="5"/>'
      : sticker && sticker.key === "veer_high_five"
        ? '<path d="M31 79C19 63 22 45 32 43L28 24C27 16 39 14 42 22L45 12C47 5 58 7 58 15V28L63 16C66 9 76 14 73 22L68 37L75 29C80 24 89 32 84 39L69 62C61 80 44 88 31 79Z" fill="#ffd7b5" stroke="#684b45" stroke-width="5"/>'
        : '<path d="M50 8L62 37L93 39L69 59L76 90L50 73L24 90L31 59L7 39L38 37Z" fill="#ffe083" stroke="#684b45" stroke-width="5" stroke-linejoin="round"/>';
    wrap.innerHTML = '<svg class="family-sticker-svg" viewBox="0 0 100 100" aria-hidden="true">' + shape + '</svg>';
  }
  if (sticker && (sticker.kind === "butterfly" || sticker.kind === "gem")) {
    const mark = document.createElement("b");
    mark.textContent = String(sticker.key || "").slice(0, 1);
    wrap.appendChild(mark);
  }
  return wrap;
}

function pager(row, page, total, repaint) {
  if (total <= 1) return;
  const controls = document.createElement("div");
  controls.className = "family-pager";
  controls.append(
    button("family-round tap", "previous page", "‹", () => { sfx.play("tap"); repaint((page - 1 + total) % total); }),
    button("family-round tap", "next page", "›", () => { sfx.play("tap"); repaint((page + 1) % total); }),
  );
  row.appendChild(controls);
}

const EMPTY_ALBUM_ART = '<svg viewBox="0 0 620 350" aria-hidden="true"><path d="M28 66c90-30 184-18 282 35 98-53 192-65 282-35v241c-91-27-185-16-282 34-97-50-191-61-282-34Z" fill="#fff9df" stroke="#6d5149" stroke-width="12" stroke-linejoin="round"/><path d="M310 101v240" stroke="#ce987a" stroke-width="8"/><path d="M75 116h182v132H75Zm288 0h182v132H363Z" fill="#fff" stroke="#dfc8a8" stroke-width="5"/><path d="M75 146v-30h30m122 0h30v30M75 218v30h30m122 0h30v-30m106-72v-30h30m122 0h30v30m-182 72v30h30m122 0h30v-30" fill="none" stroke="#ef9eb9" stroke-width="10" stroke-linecap="round"/><path d="M83 274h150m154 0h150" stroke="#e7d1b2" stroke-width="11" stroke-linecap="round"/><path d="m310 42 22 34-22 31-22-31Z" fill="#f4cd6e" stroke="#6d5149" stroke-width="6"/></svg>';
const MAKE_PICTURE_ART = '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M50 9C27 8 10 25 10 46c0 23 22 38 40 34 12-3-3-15 8-20h14C94 55 87 12 50 9Z" fill="#ffe4a1" stroke="#634c45" stroke-width="5"/><circle cx="31" cy="31" r="7" fill="#ef9ab6"/><circle cx="50" cy="23" r="7" fill="#83bfd8"/><circle cx="70" cy="33" r="7" fill="#a88ed8"/><circle cx="28" cy="55" r="7" fill="#7ac89f"/><path d="m67 67 15 15" stroke="#634c45" stroke-width="7" stroke-linecap="round"/></svg>';
const VIEW_BACK_ART = '<svg viewBox="0 0 72 72" aria-hidden="true"><path d="M31 15 10 36l21 21M12 36h48" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M51 18v36" stroke="#ef9ab6" stroke-width="5" stroke-linecap="round"/></svg>';

function firstCreationDestination() {
  return ["studio", "bridge", "garden"].find((id) => settings.isRegionEnabled(id)) || null;
}

function emptyAlbumInvite() {
  const box = document.createElement("div");
  box.className = "family-empty family-empty--album";
  box.setAttribute("aria-label", "my empty scrapbook is ready for a picture");
  const album = document.createElement("div");
  album.className = "family-empty-album-art";
  album.innerHTML = EMPTY_ALBUM_ART;
  box.appendChild(album);
  const destination = firstCreationDestination();
  if (destination) box.appendChild(button("family-empty-primary tap", "make my first picture", MAKE_PICTURE_ART, () => {
    sfx.play("chime");
    router.go(destination, {}, { dir: "right" });
  }));
  return box;
}

export function makeDecoratePage(myVisit, isCurrent = () => myVisit === visit) {
  const page = document.createElement("div");
  page.className = "family-page family-decorate";
  const paper = document.createElement("div"); paper.className = "scrapbook-paper";
  paper.setAttribute("aria-label", "Choose a sticker, then place it on your scrapbook paper");
  const marks = document.createElement('div'); marks.className = 'scrapbook-marks';
  const guide = document.createElement('div'); guide.className = 'scrapbook-placement-guide';
  const tray = document.createElement("div"); tray.className = "sticker-tray";
  const actions = document.createElement('div'); actions.className = 'scrapbook-actions';
  const notice = document.createElement('div'); notice.className = 'scrapbook-notice';
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  paper.append(marks, guide); page.append(paper, tray, actions, notice);

  let selected = null, stickerPage = 0, pointer = null, saving = false, loaded = false;
  let book = { placements: [], undo: [] }, pending = null, issue = '', paintTicket = 0;
  let lastPenAt = -Infinity, controlsBlockedUntil = 0;
  const current = () => isCurrent() && page.isConnected;
  const idle = () => current() && !saving && !pointer && performance.now() >= controlsBlockedUntil;
  const palm = event => event.pointerType === 'touch' && (event.isPrimary === false || event.width >= 40 || event.height >= 40);
  page._decorateBusy = () => !!(saving || pointer);
  page._startIdle = (root, clock = {}) => {
    page._disposeIdle?.();const schedule=clock.delay || setTimeout,unschedule=clock.cancel || clearTimeout;let idleMotion=null;
    const dispose=installIdleHelp(root,{
      active:()=>current() && loaded && !saving && !pointer && !issue && !pageMenu?.isOpen?.() && !session.isBreakLocked() && !router.isMoving() && router.current()==='treehouse' && !speech.isSpeaking(),
      demonstrate:()=>{
        const target=selected ? paper : [...tray.querySelectorAll('.sticker-choice')].find(choice=>!choice.hidden && !choice.disabled);
        if(!target)return null;target.classList.add('scrapbook-idle-target');let hand=null;
        if(selected){hand=document.createElement('span');hand.className='scrapbook-idle-hand';hand.setAttribute('aria-hidden','true');hand.innerHTML='<svg viewBox="0 0 48 48"><path d="M17 25V8q0-5 5-5t5 5v13q5-4 9 0 6-1 6 6l-4 14H21L9 29q-4-6 2-7l6 3Z" fill="#ffe1bd" stroke="#79563c" stroke-width="3" stroke-linejoin="round"/></svg>';paper.appendChild(hand);}
        const subject=hand || target,reduced=settings.get().reducedMotion || (typeof window.matchMedia==='function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const motion=!reduced && subject.animate?.([{translate:'0 0'},{translate:'6px -5px'},{translate:'0 0'}],{duration:900,iterations:1,easing:'ease-in-out'});idleMotion=motion || null;motion?.finished?.catch?.(()=>{});
        let voiceOwned=false;if(selected && !settings.get().muted && speech.isUnlocked()){voiceOwned=true;void speech.say('studio_stamp').then(()=>{voiceOwned=false;},()=>{voiceOwned=false;});}
        let visualDone=false;const clearVisual=()=>{if(visualDone)return;visualDone=true;motion?.cancel?.();if(idleMotion===motion)idleMotion=null;hand?.remove();target.classList.remove('scrapbook-idle-target');};const visualTimer=schedule(clearVisual,2400);
        return ()=>{unschedule(visualTimer);clearVisual();if(voiceOwned && speech.isSpeaking())speech.cancel();voiceOwned=false;};
      },...clock
    });
    const off=bus.on('settings:changed',()=>{if(settings.get().reducedMotion){idleMotion?.cancel?.();idleMotion=null;}});
    page._disposeIdle=()=>{dispose();off();page._disposeIdle=null;};
  };
  const control = (cls, label, picture, callback) => {
    const target = button(cls + ' tap', label, picture, () => {
      if (!idle() || !target.isConnected) return;
      const task = callback(); if (task?.then) page._decorationTask = task; return task;
    });
    return target;
  };
  const place = control('scrapbook-place', 'Place the selected sticker in the middle of the paper', '', () => addAt(selected, .5, .5));
  const undo = control('scrapbook-undo', 'Undo my last sticker placement', iconSVG('undo'), () => perform(() => scrapbook.undoDecoration(), null));
  const retry = control('scrapbook-retry', 'Try keeping that sticker again', iconSVG('save'), () => pending ? addAt(pending.sticker, pending.x, pending.y) : reload());
  actions.append(place, undo, retry);
  const update = () => {
    const disabled = !loaded || saving || !!pointer;
    place.disabled = disabled || !selected || book.placements.length >= scrapbook.MAX_PLACEMENTS;
    undo.disabled = disabled || !book.undo.length;
    retry.hidden = !pending && issue !== 'write'; retry.disabled = saving || !!pointer;
    const more=tray.querySelector('.scrapbook-sticker-next');
    if (more) more.hidden = !retry.hidden || !tray.classList.contains('has-pages');
    paper.dataset.ready = String(!!selected && !disabled);
    paper.setAttribute('aria-busy', String(saving || !loaded));
    place.replaceChildren();
    if (selected) place.append(stickerFace(selected)); else place.innerHTML = iconSVG('art');
    place.insertAdjacentHTML('beforeend', '<span class="scrapbook-place-arrow" aria-hidden="true">' + iconSVG('next') + '</span>');
    guide.replaceChildren(); guide.hidden = book.placements.length > 0;
    if (!guide.hidden) {
      const first = selected || scrapbook.earnedStickers()[0];
      if (first) {
        guide.append(stickerFace(first));
        const caption = document.createElement('span'); caption.textContent = selected ? 'Place it on the paper' : 'Choose a sticker'; guide.append(caption);
      } else guide.append(emptyAlbumInvite());
    }
    if (issue === 'full') notice.textContent = 'All 1,000 stickers are kept. Undo can make room. Nothing was removed.';
    else if (issue === 'write') notice.textContent = 'Could not finish this change. Earlier work is still here. Try again.';
    else if (!loaded) notice.textContent = 'Opening your stickers…';
    else if (!db.status().persistent) notice.textContent = 'Only here while the app is open. Ask a grownup to keep a backup.';
    else notice.textContent = saving ? 'Keeping your sticker…' : selected ? 'Tap the paper, or the pictured place button.' : 'Choose a sticker.';
    // Routine prompts are for screen readers only; warnings stay visible for a grown-up (work order item 7).
    notice.classList.toggle('is-routine-note', !issue && loaded && db.status().persistent);
  };
  const paint = () => {
    marks.replaceChildren();
    for (const placed of book.placements) {
      const data = stickerById(placed.id); if (!data) continue;
      const face = stickerFace(data, "family-sticker--placed");
      face.style.left = placed.x * 100 + "%"; face.style.top = placed.y * 100 + "%";
      face.style.setProperty("--turn", (((placed.at || 0) % 9) - 4) * 2 + "deg"); marks.append(face);
    }
    update();
  };
  const reload = async () => {
    const ticket = ++paintTicket;
    try {
      const saved = await scrapbook.loadDecorations();
      if (!current() || ticket !== paintTicket) return;
      book = saved; loaded = true; issue = book.placements.length >= scrapbook.MAX_PLACEMENTS ? 'full' : ''; paint();
    } catch (error) { if (current() && ticket === paintTicket) { issue = error.code === 'scrapbook-full' ? 'full' : 'write'; update(); } }
  };
  const perform = async (work, attempted) => {
    if (!current() || saving || pointer || !loaded) return;
    saving = true; issue = ''; if (attempted) pending = null; update();
    try {
      await work(); if (!current()) return;
      await reload(); if (current()) sfx.play('pop');
    } catch (error) {
      if (!current()) return;
      if (attempted) pending = attempted; issue = error.code === 'scrapbook-full' ? 'full' : 'write';
    } finally { saving = false; if (current()) { update(); bus.emit('activity:idle'); } }
  };
  const addAt = (sticker, x, y) => {
    if (!sticker || !Number.isFinite(x) || !Number.isFinite(y)) return;
    return perform(() => scrapbook.placeSticker(sticker.id, x, y), { sticker, x, y });
  };
  const releasePointer = () => {
    const old = pointer; pointer = null;
    try { if (old) paper.releasePointerCapture?.(old.id); } catch (_) { /* capture already ended */ }
    update(); bus.emit('activity:idle');
  };
  // Pen Only governs the paper. Explicit buttons remain a tap alternative.
  page.addEventListener('pointerdown', event => {
    if (event.pointerType === 'pen') lastPenAt = performance.now();
    const onPaper = event.target === paper || paper.contains(event.target);
    if (palm(event) || pointer && !onPaper) {
      controlsBlockedUntil = performance.now() + 500;
      if (pointer?.type === 'touch' && event.pointerType === 'touch') releasePointer();
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  paper.addEventListener('pointerdown', event => {
    if (event.pointerType === 'pen') { lastPenAt = performance.now(); if (pointer?.type === 'touch') releasePointer(); }
    if (!current() || saving || pointer || !loaded || !selected || event.button !== 0 || palm(event)) return;
    if (event.pointerType !== 'pen' && performance.now() < controlsBlockedUntil) return;
    if (!shouldAccept({ pointerType: event.pointerType, lastPenAt, now: performance.now(), allowFinger: !settings.get().penOnly })) return;
    const rect = paper.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    pointer = { id: event.pointerId, type: event.pointerType, sticker: selected };
    paper.setPointerCapture?.(event.pointerId); event.preventDefault(); update();
  });
  paper.addEventListener("pointerup", (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const old = pointer, rect = paper.getBoundingClientRect(); releasePointer();
    if (!current() || palm(event) || !rect.width || !rect.height) return;
    const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    event.preventDefault(); page._decorationTask = addAt(old.sticker, x, y);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) paper.addEventListener(type, event => { if (pointer?.id === event.pointerId) releasePointer(); });
  const paintTray = (nextPage = 0) => {
    const earned = scrapbook.earnedStickers(); tray.replaceChildren(); if (!earned.length) return;
    const total = Math.max(1, Math.ceil(earned.length / PAGE_SIZE));
    stickerPage = Math.max(0, Math.min(total - 1, nextPage));
    tray.classList.toggle('has-pages', total > 1);
    const next = control('scrapbook-sticker-next', 'More sticker choices', iconSVG('next'), () => paintTray((stickerPage + 1) % total)); next.hidden = total <= 1;
    const choices = document.createElement('div'); choices.className = 'sticker-choices';
    for (const sticker of earned.slice(stickerPage * PAGE_SIZE, stickerPage * PAGE_SIZE + PAGE_SIZE)) {
      const choice = control('sticker-choice', 'Choose ' + sticker.label, '', () => {
        if (!choice.isConnected) return;
        selected = sticker; pending = null; issue = book.placements.length >= scrapbook.MAX_PLACEMENTS ? 'full' : '';
        choices.querySelectorAll('.is-picked').forEach(node => node.classList.remove('is-picked'));
        choice.classList.add('is-picked'); update();
      });
      choice.classList.toggle('is-picked', selected?.id === sticker.id); choice.append(stickerFace(sticker)); choices.append(choice);
    }
    tray.append(choices, next);
  };
  paintTray(); update(); page._decorationTask = reload();
  return page;
}

export async function readDrawingRows(read, isCurrent) {
  try { const rows=await read();return isCurrent()?{rows,failed:false}:null; }
  catch { return isCurrent()?{failed:true}:null; }
}

export function makeDrawingPage(rows, initialPage = 0, { unavailable = false, temporary = false, retry = () => {} } = {}) {
  const page = document.createElement("div");
  page.className = "family-page family-drawings";
  const showNotice = () => {
    if (!unavailable && !temporary) return;
    const note=document.createElement("p");note.className="family-gallery-warning";
    note.textContent=unavailable ? "Pictures could not be opened. Your scrapbook is still here. Try again, or ask a grown-up for help." : "Pictures saved on this device may be unavailable right now. Ask a grown-up to check storage before closing.";
    page.appendChild(note);
    if (unavailable || temporary) { const again=button("family-gallery-retry tap", "try opening pictures again", iconSVG("next"), retry);again.dataset.galleryRetry="";const caption=document.createElement("span");caption.textContent="Try again";again.appendChild(caption);page.appendChild(again); }
  };
  if (!rows.length) {
    page.classList.add("family-empty-page");showNotice();
    if (!unavailable && !temporary) page.appendChild(emptyAlbumInvite());
    return page;
  }
  const openPicture = (row, returnPage) => {
    page.replaceChildren();
    const viewer = document.createElement("section");
    viewer.className = "family-picture-view";
    viewer.setAttribute("aria-label", "full saved picture");
    const image = document.createElement("img");
    image.src = row.png;
    image.alt = "full saved " + String(row.id || "picture") + " picture";
    image.draggable = false;
    const close = button("family-picture-back tap", "back to my drawings", VIEW_BACK_ART, () => {
      sfx.play("tap");
      paint(returnPage);
    });
    viewer.append(image, close);
    page.appendChild(viewer);
  };
  const paint = (n) => {
    page.replaceChildren();
    const total = Math.max(1, Math.ceil(rows.length / DRAWING_SIZE));
    const current = Math.max(0, Math.min(total - 1, n));
    const grid = document.createElement("div");
    grid.className = "drawing-pages";
    const visible = rows.slice(current * DRAWING_SIZE, current * DRAWING_SIZE + DRAWING_SIZE);
    grid.dataset.count = String(visible.length);
    for (const row of visible) {
      const isPlayStage = row.kind === "play-stage" && row.key;
      const canReopenPost = row.kind === "picture-post" && row.key && router.registered().includes("picture-post") && settings.isActivityEnabled("picture-post");
      const canReopenBuild = row.kind === "build-lab" && row.key && router.registered().includes("build-lab") && settings.isActivityEnabled("build-lab");
      const canReopenStage = isPlayStage && playStageAvailable();
      const label = isPlayStage
        ? (canReopenStage ? "open this kept story" : "view full kept story")
        : canReopenPost ? "open this saved picture message" : canReopenBuild ? "continue this saved bridge" : "view full saved " + String(row.id || "picture") + " picture";
      const frame = button("drawing-frame tap" + (isPlayStage ? " drawing-frame--play-stage" : ""), label, "", () => {
        sfx.play("tap");
        if (canReopenStage) router.go("play-stage", { postcardKey: String(row.key) }, { dir: "left" });
        else if (canReopenPost) router.go("picture-post", { galleryKey: String(row.key) }, { dir: "left" });
        else if (canReopenBuild) router.go("build-lab", { galleryKey: String(row.key) }, { dir: "left" });
        else openPicture(row, current);
      });
      const img = document.createElement("img");
      img.src = row.png;
      img.alt = isPlayStage ? "kept story keepsake" : "saved " + String(row.id || "picture") + " drawing";
      img.draggable = false;
      frame.appendChild(img);
      if (canReopenStage) {
        const play = document.createElement("span");
        play.className = "drawing-frame-play";
        play.setAttribute("aria-hidden", "true");
        play.innerHTML = iconSVG("play");
        frame.appendChild(play);
      }
      grid.appendChild(frame);
    }
    page.appendChild(grid);
    showNotice();
    pager(page, current, total, paint);
  };
  paint(initialPage);
  return page;
}

function familyPortrait(key) {
  const img = art.get(key);
  if (img) {
    const clone = img.cloneNode();
    clone.alt = "";
    clone.draggable = false;
    return clone;
  }
  const fallback = document.createElement("span");
  fallback.className = "family-friend-fallback";
  fallback.innerHTML = iconSVG("heart");
  return fallback;
}

function makeFamilyPage(myVisit) {
  const page = document.createElement("div");
  page.className = "family-page family-showcase";
  const reaction = document.createElement("div");
  reaction.className = "family-reaction";
  reaction.setAttribute("aria-live", "polite");
  const react = (kind) => {
    reaction.innerHTML = kind === "high-five"
      ? '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M31 79C19 63 22 45 32 43L28 24C27 16 39 14 42 22L45 12C47 5 58 7 58 15V28L63 16C66 9 76 14 73 22L68 37L75 29C80 24 89 32 84 39L69 62C61 80 44 88 31 79Z" fill="#ffd7b5" stroke="#684b45" stroke-width="5"/></svg>'
      : iconSVG("heart");
    reaction.classList.remove("is-showing");
    void reaction.offsetWidth;
    reaction.classList.add("is-showing");
    sfx.play("chime");
    const t = setTimeout(() => {
      if (myVisit === visit) reaction.classList.remove("is-showing");
    }, 900);
    timers.push(t);
  };

  const family = [
    { label: "show my scrapbook to Mama", art: "characters/family_adult1_idle", phrase: "family_hello_mama" },
    { label: "show my scrapbook to Daddy", art: "characters/family_adult2_idle", phrase: "family_hello_papa" },
    { label: "Rayna's portrait", art: "characters/family_child1_idle" },
    { label: "show my scrapbook to a family friend", art: "characters/family_child2_idle" },
    { label: "show my scrapbook to Ba", art: "characters/family_grandma_idle", phrase: "family_hello_grandma" },
    { label: "show my scrapbook to Dada", art: "characters/family_grandpa_idle", phrase: "family_hello_grandpa" },
    { label: "high five Veer", art: "characters/veer_idle", phrase: "family_hello_veer", highFive: true },
    { label: "show my scrapbook to Ishan", art: "characters/family_ishan_idle", optional: true },
    { label: "show my scrapbook to Veer's mom", art: "characters/family_veer_mom_idle", optional: true },
    { label: "show my scrapbook to Veer's dad", art: "characters/family_veer_dad_idle", optional: true },
  ].filter((person) => !person.optional || art.has(person.art));

  const paintPeople = (nextPage = 0) => {
    page.replaceChildren();
    const total = Math.max(1, Math.ceil(family.length / 5));
    const current = Math.max(0, Math.min(total - 1, nextPage));
    const people = document.createElement("div");
    people.className = "family-people";
    for (const person of family.slice(current * 5, current * 5 + 5)) {
      const friend = button("family-person tap", person.label, "", async () => {
        react(person.highFive ? "high-five" : "hug");
        if (person.phrase) speech.say(person.phrase);
        if (person.highFive) await progress.awardSticker(progress.MILESTONES.veerHighFive);
      });
      friend.appendChild(familyPortrait(person.art));
      people.appendChild(friend);
    }
    page.append(people, reaction);
    pager(page, current, total, paintPeople);
  };
  paintPeople();
  return page;
}

export async function checkpointMuralPage(current, isCurrent = () => true) {
  if (current && !await current.beforeLeave()) return false;
  return isCurrent();
}

export async function mount(el, params = {}) {
  const myVisit = ++visit;
  host = el;
  host.classList.add("family-screen", "treehouse");
  addScenery(host, "treehouse", { foreground: false });
  host.appendChild(homeButton());
  mute = muteButton();
  host.appendChild(mute);

  const book = document.createElement("main");
  book.className = "family-book";
  const stage = document.createElement("div");
  stage.className = "family-book-stage";
  const tabs = document.createElement("nav");
  tabs.className = "family-tabs";
  tabs.setAttribute("aria-label", "scrapbook pages");
  if (playStageAvailable()) tabs.classList.add("has-play-stage");
  book.append(stage, tabs);
  host.appendChild(book);
  pageMenu=createTreehousePageMenu(tabs,()=>myVisit===visit && !stage.querySelector('.family-decorate')?._decorateBusy?.());

  let rows = [], galleryFailed = false, galleryRetrying = false;
  const initial=await readDrawingRows(()=>gallery.listChecked(),()=>myVisit===visit);
  if(!initial)return;if(initial.failed)galleryFailed=true;else rows=initial.rows;

  const retryGallery = async () => {
    const page=stage.querySelector('.family-drawings');
    if (myVisit!==visit || !page || galleryRetrying) return;
    galleryRetrying=true;const control=page.querySelector('[data-gallery-retry]');if(control)control.disabled=true;
    const result=await readDrawingRows(()=>gallery.listChecked(),()=>myVisit===visit && stage.querySelector('.family-drawings')===page);
    galleryRetrying=false;if(!result)return;galleryFailed=result.failed;if(!result.failed)rows=result.rows;show('drawings');
  };
  const show = (kind) => {
    if (myVisit !== visit) return;
    if (stage.querySelector('.family-decorate')?._decorateBusy?.()) return;
    stage.querySelector('.family-decorate')?._disposeIdle?.();
    host.classList.toggle('is-decorating', kind === 'decorate');
    book.classList.toggle('is-decorating', kind === 'decorate');
    mural && mural.destroy();
    mural = null;
    pageMenu.show(kind);
    if (kind === "mural") {
      const page = document.createElement("div");
      stage.replaceChildren(page);
      mural = new FamilyMural(page, {
        onSaved: (row) => { if (myVisit === visit) rows = [row, ...rows.filter((old) => old.key !== row.key)]; },
        onBusy: () => bus.emit("activity:idle"),
      });
      mural.mount();
    } else {
      stage.replaceChildren(
        kind === "drawings" ? makeDrawingPage(rows, 0, { unavailable:galleryFailed, temporary:!db.status().persistent, retry:retryGallery })
          : kind === "family" ? makeFamilyPage(myVisit)
            : makeDecoratePage(myVisit),
      );
      stage.querySelector('.family-decorate')?._startIdle?.(host);
    }
    sfx.play("tap");
  };

  const requestPage = async (kind) => {
    const current = mural;
    if (!await checkpointMuralPage(current, () => myVisit === visit && mural === current)) return false;
    show(kind);
    if(kind==='decorate' && !pageMenu.toggle.hidden)pageMenu.toggle.focus?.({preventScroll:true});
    return true;
  };

  const tabData = [
    ["decorate", "decorate my scrapbook"],
    ["drawings", "look at my drawings"],
    ["mural", "make a family mural together"],
    ["family", "show my scrapbook"],
  ];
  if (playStageAvailable()) tabData.splice(3, 0, ["play-stage", "continue my current story room"]);
  if (router.registered().includes("picnic") && settings.isActivityEnabled("picnic")) tabData.splice(3, 0, ["picnic", "prepare and share our family picnic"], ["garden-cafe", "arrange and play in Our Garden Café"]);
  if (router.registered().includes("picture-post") && settings.isActivityEnabled("picture-post")) tabData.splice(3, 0, ["picture-post", "make and deliver a picture message"]);
  if (router.registered().includes("music-band") && settings.isActivityEnabled("music-band")) tabData.splice(3, 0, ["music-band", "make a music pattern with Mama and Veer"]);
  const regions = (settings.get() && settings.get().regions) || {};
  if (regions.grandma !== false) tabData.push(["grandma", "visit Ba for storytime", ""]);
  for (const [kind, label] of tabData) {
    const isRoute = kind === "grandma" || kind === "play-stage";
    const classes = "family-tab tap" + (kind === "grandma" ? " family-tab--grandma" : kind === "play-stage" ? " family-tab--play-stage" : "");
    const tab = button(classes, label, isRoute ? "" : familyTabIcon(kind), () => {
      if (kind === "grandma") {
        sfx.play("chime");
        router.go("grandma", {}, { dir: "left" });
      } else if (kind === "play-stage") {
        sfx.play("chime");
        router.go("play-stage", {}, { dir: "left" });
      } else if (kind === "picnic") {
        router.go("picnic", {}, { dir: "left" });
      } else if (kind === "garden-cafe") {
        router.go("picnic", { cafe: true }, { dir: "left" });
      } else if (kind === "picture-post") {
        router.go("picture-post", {}, { dir: "left" });
      } else if (kind === "music-band") {
        router.go("music-band", {}, { dir: "left" });
      } else { void requestPage(kind); }
    });
    if (kind === "grandma") tab.appendChild(familyPortrait("characters/family_grandma_idle"));
    if (kind === "play-stage") tab.appendChild(playStageTabPicture());
    if (kind === "picnic") {
      tab.replaceChildren();
      const picture = document.createElement("img"); picture.src = "assets/art/final/props/fruit_bowl.webp";
      picture.alt = ""; picture.style.cssText = "width:100%;height:100%;object-fit:contain"; tab.append(picture);
    }
    if (kind === "garden-cafe") {
      tab.replaceChildren();
      const picture = document.createElement("img"); picture.src = "assets/art/final/garden-cafe/table-v1.png";
      picture.alt = ""; picture.style.cssText = "width:100%;height:100%;object-fit:contain"; tab.append(picture);
    }
    if (kind === "picture-post") {
      tab.replaceChildren();
      const picture = document.createElement("img"); picture.src = "assets/art/final/picture-post/envelope.png";
      picture.alt = ""; picture.style.cssText = "width:100%;height:100%;object-fit:contain"; tab.append(picture);
    }
    if (kind === "music-band") {
      tab.replaceChildren();
      const picture = document.createElement("img"); picture.src = "assets/art/final/music-band/drum-v1.png";
      picture.alt = ""; picture.style.cssText = "width:100%;height:100%;object-fit:contain"; tab.append(picture);
    }
    tab.dataset.page = kind;
    tab.hidden = !treehouseTabVisible(kind);
    if(treehouseTabVisible(kind)) { tab.classList.add('family-tab--local');const caption=document.createElement('span');caption.className='family-tab-caption';caption.textContent=({decorate:'Decorate',drawings:'Pictures',mural:'Draw together',family:'Family'})[kind];tab.appendChild(caption); }
    tabs.appendChild(tab);
  }
  show(params.page === "drawings" || rows.length || galleryFailed || !db.status().persistent ? "drawings" : "decorate");
}

export function unmount() {
  visit += 1;
  for (const timer of timers) clearTimeout(timer);
  timers = [];
  host?.querySelector('.family-decorate')?._disposeIdle?.();
  mural && mural.destroy();
  mural = null;
  pageMenu = null;
  mute && mute.destroy && mute.destroy();
  mute = null;
  speech.cancel();
  host = null;
}

export function onBack() {
  if(pageMenu?.collapse())return;
  router.go("map", {}, { dir: "right" });
}

export function busy() {
  return !!(mural && mural.busy() || host?.querySelector('.family-decorate')?._decorateBusy?.());
}
export async function beforeLeave() {
  if (host?.querySelector('.family-decorate')?._decorateBusy?.()) return false;
  return !mural || await mural.beforeLeave();
}
export const beforeBreak = beforeLeave;

export const screen = { id: "treehouse", mount, unmount, onBack, busy, beforeLeave, beforeBreak };
export default screen;
