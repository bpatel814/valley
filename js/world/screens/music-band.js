import { installIdleHelp } from '../idle-help.js';
import speech from '../../audio/speech.js';
import router, { homeButton, muteButton, iconSVG, tapify } from '../router.js';
import art from '../art.js';
import bus from '../bus.js';
import LivingGuidance from '../living-guidance.js';
import { livingPlayGuideKey } from '../../data/living-play-phrases.js';
import settings from '../../state/settings.js';
import session from '../../state/session.js';
import gallery from '../../parent/gallery.js';
import * as db from '../../state/db.js';
import sfx, { effectsGain } from '../../audio/sfx.js';
import music from '../../audio/music.js';
import { savedWorld } from '../../state/saved-world.js';
import { isCreationRow } from '../../state/creation-frame.js';
import { WorkshopVisit, WorkshopPointers } from './toy-workshop.js';
import { loadToyWorkshop, getToyWorkshop } from '../../state/toy-workshop.js';
import { toyBasketPage } from '../../data/toy-workshop.js';
import { detachKeptMusicShow } from '../../data/picture-show.js';
import { MUSIC_INSTRUMENTS, MUSIC_INVITATIONS, MUSIC_MAX_NOTES, MUSIC_PAGE_SIZE, musicPerformance, musicShelfPage } from '../../data/music-band.js';
import { loadMusicBand, getMusicBand, getMusicDraft, changeMusicDraft, undoMusicBand, useMusicPicture, useMusicToy,
  finishMusicPerformance, keepMusicBand, reopenMusicBand, musicSign, flushMusicBand, musicBandStatus } from '../../state/music-band.js';

import * as musicStore from '../../state/music-band.js';

/** Only a stable latest typed write decides the checkpoint. Correction writes
 * queued by rejected Keeps supersede older tails; stale status issues do not.
 * Retry writes the existing document, without making a new kept creation. */
export async function checkpointLivingScene({ flush, retry, storage, alive, held = () => false, report = () => {}, subject = 'Your play' }) {
  if (!alive()) return false;
  if (held()) { report('Finish placing this, then try again. Your move is still here.'); return false; }
  let retried = false;
  for (;;) {
    const pending = flush(); let failure;
    try { await pending; } catch (error) { failure = error; }
    if (!alive()) return false;
    if (held()) { report('Finish placing this, then try again. Your move is still here.'); return false; }
    if (pending !== flush()) continue;
    if (failure) {
      if (!retried && retry) {
        retried = true;
        try { await retry(); } catch { /* Re-read the real tail after the retry. */ }
        if (!alive()) return false;
        if (pending !== flush()) continue;
      }
      report(`${subject} could not save. It is still open here. Try leaving again, or ask a grown-up for help.`); return false;
    }
    if (storage().persistent === false) report(`${subject} is here for now. Device saving is unavailable; it may disappear when this page closes.`);
    return true;
  }
}
/** Preserve the last intentional held placement before navigation. A rejected
 * edit keeps the gesture live; an already identical typed scene needs no lock. */
export function commitLivingPlacement({ drag, action, readCurrent, edit, commit, release }) {
  if (!drag?.moved) return true;
  if (!action) return false;
  const before = readCurrent(), expected = edit(before, action);
  if (JSON.stringify(before) !== JSON.stringify(expected) && commit(action) === false) return false;
  release(); return true;
}
const instruments = new Map(MUSIC_INSTRUMENTS.map(row => [row.id, row]));
const fallback = {
  rest: '<circle cx="32" cy="32" r="25" fill="#ecf6fa" stroke="#678391" stroke-width="3"/><path d="M23 21v22M41 21v22" stroke="#678391" stroke-width="7" stroke-linecap="round"/>',
  drum: '<ellipse cx="32" cy="16" rx="22" ry="10" fill="#fff2cd"/><path d="M10 16v30q22 17 44 0V16" fill="#eaa485" stroke="#8e5a42" stroke-width="3"/><ellipse cx="32" cy="16" rx="22" ry="10" fill="#fff1c7" stroke="#8e5a42" stroke-width="3"/><path d="m11 22 10 24 10-20 12 24 10-28" fill="none" stroke="#f8e1b9" stroke-width="3"/>',
  shaker: '<path d="m26 32-9 22q-3 8 5 7l15-24" fill="#bd9264" stroke="#826547" stroke-width="3"/><ellipse cx="36" cy="22" rx="18" ry="22" transform="rotate(25 36 22)" fill="#a8cfa4" stroke="#658765" stroke-width="3"/><path d="m21 16 30 14m-32-4 29 14" stroke="#fff2c8" stroke-width="5"/>',
  bell: '<path d="M31 8q-16 0-17 26L7 44q25 14 50 0l-7-10Q48 8 31 8" fill="#eed184" stroke="#96733c" stroke-width="3"/><ellipse cx="32" cy="44" rx="25" ry="7" fill="#b99b5b"/><circle cx="32" cy="46" r="5" fill="#ffeac4"/><path d="M27 9V4h10v5" fill="none" stroke="#96733c" stroke-width="4"/>',
  wood: '<path d="m6 23 35-9 8 24-35 9Z" fill="#bc9ad4" stroke="#79618b" stroke-width="3"/><path d="m21 43 35-9 6 17-35 9Z" fill="#d4bce6" stroke="#79618b" stroke-width="3"/><path d="m14 33 30-7m-15 25 27-7" stroke="#f3e6d4" stroke-width="4"/>',
};
export function instrumentPicture(id) {
  const row = instruments.get(id), frame = document.createElement('span'); frame.className = `band-instrument-picture band-${id}`;
  frame.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true">${fallback[id]}</svg>`;
  if (id === 'rest') return frame;
  const image = document.createElement('img'); image.src = art.get(row.art)?.src || `assets/art/final/music-band/${id}-v1.png`;
  image.alt = ''; image.draggable = false; image.hidden = true;
  const show = () => { frame.querySelector('svg')?.remove(); image.hidden = false; };
  image.addEventListener('load', show, { once: true }); if (image.complete && image.naturalWidth) show(); frame.append(image); return frame;
}

/** Short original timbres. Uses the game's shared context; mute checks precede
 * context creation and every node allocation. Never schedules future notes. */
export class BandSound {
  constructor({ getSettings = () => settings.get(), unlock = () => sfx.ensure(), context = () => sfx.context(), hidden = () => typeof document !== 'undefined' && document.hidden } = {}) {
    this.getSettings = getSettings; this.unlock = unlock; this.context = context; this.hidden = hidden; this.voices = new Set(); this.quietWaiters = new Set();
  }
  allowed() { const s = this.getSettings(); return !s.muted && !this.hidden() && effectsGain(s) > 0; }
  prepare() { if (!this.allowed()) return false; try { return this.unlock()?.state === 'running'; } catch { return false; } }
  play(id, { pulse = false, echo = false } = {}) {
    // An authored silence is successful without an audio device, even with
    // accompaniment. Stop an earlier ringing voice; never open a context.
    if (id === 'rest') { this.stop(); return true; }
    if (!this.allowed() || !instruments.has(id)) return false;
    let ctx; try { ctx = this.context(); } catch { return false; }
    if (!ctx || ctx.state !== 'running') return false;
    this.stop();
    const definition = instruments.get(id), t = ctx.currentTime, gain = effectsGain(this.getSettings()) * 0.25;
    const tone = (frequency, duration, peak, type = 'sine', down = false) => {
      if (!this.allowed()) return;
      const oscillator = ctx.createOscillator(), voice = { oscillator, envelope: null, context: ctx }; this.voices.add(voice);
      const envelope = ctx.createGain(); voice.envelope = envelope;
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, t);
      if (down) oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * .46), t + duration);
      envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(peak * gain, t + .012);
      envelope.gain.exponentialRampToValueAtTime(.00001, t + duration);
      oscillator.connect(envelope); envelope.connect(ctx.destination);
      oscillator.onended = () => { this.voices.delete(voice); oscillator.disconnect(); envelope.disconnect(); this.resolveQuiet(); };
      oscillator.start(t); oscillator.stop(t + duration + .025);
    };
    // At most three oscillators; peak sum <= .01625 at full settings after
    // conservative attenuation. This is not measured physical device loudness.
    const f = definition.frequency * (echo ? 1.5 : 1);
    try {
      tone(f, id === 'bell' ? .38 : id === 'drum' ? .18 : .11, .035, id === 'wood' ? 'triangle' : 'sine', id === 'drum');
      if (id === 'shaker') tone(f * 1.63, .07, .015, 'triangle');
      if (pulse) tone(100, .15, .015, 'sine', true);
    } catch { this.stop(); return false; }
    return true;
  }
  stop() {
    for (const voice of this.voices) {
      try { voice.envelope?.gain.cancelScheduledValues(voice.context.currentTime); } catch { /* closed context */ }
      try { if (voice.envelope) voice.envelope.gain.value = 0; } catch { /* unavailable gain */ }
      try { voice.oscillator.stop(); } catch { /* never started or already ended */ }
      try { voice.oscillator.disconnect(); } catch { /* disconnected */ }
      try { voice.envelope?.disconnect(); } catch { /* disconnected */ }
      voice.oscillator.onended = null;
    }
    this.voices.clear();
    this.resolveQuiet();
  }
  resolveQuiet() { if (!this.voices.size) { for (const resolve of this.quietWaiters) resolve(); this.quietWaiters.clear(); } }
  whenQuiet() { return this.voices.size ? new Promise(resolve => this.quietWaiters.add(resolve)) : Promise.resolve(); }
}

const visit = new WorkshopVisit();
let enteredFromMap = false;
let host, stage, status, score, shelf, controls, muted, pointers, sound, offSettings, offMute, selected = null, playing = false, playTimer = 0, previewTimer = 0;
let performanceScore, beats = [], nextBeat = 0, sheetKind = '', sheetPage = 0, sheetRows = [], pickerRequest = 0, saving = false, bedWasPlaying = false;
let listeners = [], ready = false, checkpointing = false, guidance, offEnd, offLeave, performanceSerial = 0, openingNotice = '', idleHelp = null, idleMotion = null, openingMusic = false, musicLoadRetry = null;
function listen(target, event, callback, options) { target.addEventListener(event, callback, options); listeners.push(() => target.removeEventListener(event, callback, options)); }
function button(label, text, action, icon = '') {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'band-button'; el.setAttribute('aria-label', label);
  el.innerHTML = icon; if (text) { const caption = document.createElement('span'); caption.textContent = text; el.append(caption); }
  tapify(el, event => { if (!checkpointing && !saving && visit.active && el.isConnected && !router.isMoving() && (ready || el.closest('.band-header nav') || 'loadRetry' in el.dataset)) { openingNotice=''; if (!('help' in el.dataset)) guidance?.interrupt(); action(event); } }); return el;
}
function reduced() { return settings.get().reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function message(text) { if (status) status.textContent = text; }
function stop() {
  guidance?.interrupt();
  ++performanceSerial;
  host?.classList.remove('is-guided'); clearTimeout(previewTimer); previewTimer = 0;
  clearTimeout(playTimer); playTimer = 0; playing = false; sound?.stop();
  performanceScore = null; beats = []; nextBeat = 0;
  stage?.classList.remove('is-playing'); stage?.querySelectorAll('.is-sounding').forEach(el => el.classList.remove('is-sounding'));
  if (controls) { const play = controls.querySelector('[data-play]'); if (play) { play.setAttribute('aria-label', 'Play your tune from the beginning'); play.querySelector('span').textContent = 'Play'; } }
}
function help() {
  if (!ready || saving || checkpointing || sheetKind) return;
  stop(); paint(); host.classList.add('is-guided'); guidance?.guide(true);
}
function invitation() {
  const draft = getMusicDraft(); message(selected ? 'Tap an instrument to change this note, or Try to move, repeat or take it out.' : MUSIC_INVITATIONS.find(row => row.id === draft.invitation).hint);
}
function paint() {
  if (!visit.active) return;
  const draft = getMusicDraft(); if (!draft.notes.some(row => row.id === selected)) selected = null;
  score.replaceChildren(); score.setAttribute('aria-label', `Your tune: ${draft.notes.map(row => instruments.get(row.instrument).label).join(', ') || 'empty'}`);
  draft.notes.forEach((note, index) => {
    const tile = button(`Note ${index + 1}: ${instruments.get(note.instrument).label}. Tap to hear it and select it. Change its sound with an instrument, or move it using Try.`, '', () => {
      stop(); selected = selected === note.id ? null : note.id; paint(); invitation();
      previewSound(note.instrument, score.querySelector(`[data-note-id="${note.id}"]`));
    });
    tile.classList.add('band-note'); tile.dataset.noteId = note.id; tile.setAttribute('aria-pressed', String(selected === note.id)); tile.append(instrumentPicture(note.instrument)); score.append(tile);
  });
  if (!draft.notes.length) {
    const empty = document.createElement('div'); empty.className = 'band-empty-score'; empty.innerHTML = '<span aria-hidden="true">＋</span><span>Your tune</span>'; score.append(empty);
  }
  const sign = stage.querySelector('.band-sign'), png = musicSign(); sign.replaceChildren();
  if (png) { const image = document.createElement('img'); image.src = png; image.alt = 'Your exact picture, chosen as the band sign'; image.draggable = false; sign.append(image); }
  else sign.innerHTML = '<span aria-hidden="true">♫</span>';
  const result = stage.querySelector('.band-result'); result.hidden = !draft.performed;
  if (draft.performed) result.textContent = `Your band played ${draft.performed.notes.length} notes${draft.performed.mama ? ' with Mama’s pulse' : ''}${draft.performed.veer ? ' and Veer’s echo' : ''}.`;
  ['mama', 'veer'].forEach(role => { const el = stage.querySelector(`[data-role="${role}"]`); el.classList.toggle('has-joined', draft[role]); el.setAttribute('aria-pressed', String(draft[role])); });
  stage.querySelectorAll('[data-instrument]').forEach(el => { el.disabled = !selected && draft.notes.length >= MUSIC_MAX_NOTES; el.classList.toggle('band-invitation', !draft.notes.length); });
  controls.querySelector('[data-play]').disabled = !draft.notes.length;
  controls.querySelector('[data-keep]').disabled = !draft.notes.length || saving;
  controls.querySelector('[data-undo]').disabled = !getMusicBandUndoAvailable();
  controls.querySelector('[data-step]').hidden = !reduced(); controls.querySelector('[data-step]').disabled = !draft.notes.length;
  host.querySelector('[data-help]').disabled = saving || checkpointing || !ready;
  host.classList.toggle('band-reduced', reduced());
}
// State exposes status cheaply; this bounded undo read does not clone the library.
function getMusicBandUndoAvailable() { return musicBandStatus().canUndo; }
function change(action) { stop(); if (changeMusicDraft(action)) { paint(); invitation(); } }
// A direct tap auditions one sound without authoring a note or a performance.
// Reuse the existing sound policy and visit/run guards; never queue late audio.
function previewSound(id, tile) {
  if (id !== 'rest') sound.prepare(); const sounded = sound.play(id);
  tile?.classList.add('is-sounding');
  const token = visit.serial, preview = performanceSerial;
  const quiet = () => { if (visit.valid(token) && preview === performanceSerial) tile?.classList.remove('is-sounding'); };
  if (sounded && id !== 'rest') void sound.whenQuiet().then(quiet);
  else { const timer=setTimeout(() => { if (previewTimer===timer) previewTimer=0; quiet(); }, 250); previewTimer=timer; }
}
function addInstrument(id) {
  const replacing = selected; stop();
  const changed = changeMusicDraft(replacing ? { type: 'replace', id: replacing, instrument: id } : { type: 'add', instrument: id });
  if (!changed) return;
  selected = null; paint();
  previewSound(id, stage.querySelector(`[data-instrument="${id}"]`));
  message(id === 'rest' ? 'A quiet beat leaves room between sounds. Everyone waits for this beat.' : `Your ${instruments.get(id).label.toLowerCase()} ${replacing ? 'changed that note' : 'joined the tune'}. Play it, or add another sound.`);
  score.lastElementChild?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
}
function showBeat(beat) {
  const sounded = sound.play(beat.instrument, { pulse: beat.pulse, echo: beat.role === 'veer' });
  if (!sounded && sound.allowed()) { stop(); message('Sound could not start. Your tune and picture are still here. Try Play again.'); return false; }
  stage.querySelectorAll('.is-sounding').forEach(el => el.classList.remove('is-sounding'));
  const currentNote = stage.querySelector(`[data-note-id="${beat.noteId}"]`);
  currentNote?.classList.add('is-sounding');
  currentNote?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  stage.querySelector(`[data-instrument="${beat.instrument}"]`)?.classList.add('is-sounding');
  if (beat.pulse) stage.querySelector('[data-role="mama"]')?.classList.add('is-sounding');
  if (beat.role === 'veer') stage.querySelector('[data-role="veer"]')?.classList.add('is-sounding');
  message(`${beat.role === 'veer' ? 'Veer echoes' : 'Your tune'}: ${instruments.get(beat.instrument).label}${beat.pulse ? '. Mama keeps the pulse.' : '.'}`);
  return true;
}
function complete() {
  playing = false; clearTimeout(playTimer); playTimer = 0; stage.classList.remove('is-playing');
  const finished = finishMusicPerformance(performanceScore); paint();
  message('Your tune is here. Play again, change a sound, or keep it on your shelf.');
  controls.querySelector('[data-play]').querySelector('span').textContent = 'Play';
  controls.querySelector('[data-play]').setAttribute('aria-label', 'Play your tune from the beginning');
  const completed = JSON.stringify(getMusicDraft());
  const token = visit.serial, run = performanceSerial;
  const settled = sound.whenQuiet().then(() => {
    if (visit.valid(token) && run === performanceSerial && !playing && JSON.stringify(getMusicDraft()) === completed)
      stage.querySelectorAll('.is-sounding').forEach(el => el.classList.remove('is-sounding'));
  });
  if (finished) guidance?.after('living_music_done', { settled,
    guard: () => !playing && !!getMusicDraft().performed && JSON.stringify(getMusicDraft()) === completed });
}
function performanceAvailable() { return ready && !saving && !checkpointing && !sheetKind && !document.hidden && !session.isBreakLocked() && !router.isMoving() && router.current() === 'music-band'; }
function preparePerformance() {
  if (getMusicDraft().notes.every(note => note.instrument === 'rest') || !sound.allowed() || sound.prepare()) return true;
  stop(); message('Sound could not start. Your tune and picture are still here. Try Play again.'); return false;
}
function startPerformance(stepOnly = false) {
  if (!performanceAvailable()) return;
  stop(); performanceScore = getMusicDraft(); selected = null;
    const performance = musicPerformance(performanceScore); beats = performance.beats; nextBeat = 0; paint();
  if (!beats.length) return;
  if (!preparePerformance()) return;
  // Reduced motion has the same ordered consequence on explicit taps, without
  // animated marching or a clock that the child needs to follow.
  if (reduced() || stepOnly) { if (showBeat(beats[nextBeat++]) && nextBeat === beats.length) complete(); return; }
  playing = true; stage.classList.add('is-playing'); controls.querySelector('[data-play]').querySelector('span').textContent = 'Stop';
  controls.querySelector('[data-play]').setAttribute('aria-label', 'Stop the tune. Your notes stay here.');
  const token = visit.serial, run = performanceSerial;
  const advance = () => {
    if (!visit.valid(token) || run !== performanceSerial || !playing) return;
    if (!performanceAvailable()) { stop(); return; }
    if (nextBeat >= beats.length) { if (preparePerformance()) complete(); return; }
    if (showBeat(beats[nextBeat++])) playTimer = setTimeout(advance, performance.interval);
  }; advance();
}
function stepPerformance() {
  if (!performanceAvailable()) return;
  if (!performanceScore || nextBeat >= beats.length || JSON.stringify(performanceScore) !== JSON.stringify(getMusicDraft())) { startPerformance(true); return; }
  if (!preparePerformance()) return;
  if (showBeat(beats[nextBeat++]) && nextBeat === beats.length) complete();
}
async function keep() {
  if (saving) return; stop(); saving = true; paint(); const token = visit.serial;
  try { const result = await keepMusicBand(); if (visit.valid(token)) message(result.persistent ? 'Your tune is on your shelf. Open Shelf to take your exact tune and picture to Theater.' : 'Your tune is on the shelf for now. Device saving is unavailable; keep a Parent backup before closing.'); }
  catch (error) { if (visit.valid(token)) message(['music-shelf-full', 'music-capacity'].includes(error.code) ? 'The shelf is full. Your tune and earlier tunes are still here.' : 'Your tune could not be kept. Its notes are still here. Try Keep again.'); }
  finally { if (visit.valid(token)) { saving = false; paint(); } }
}
function closeSheet() {
  sheetKind = ''; ++pickerRequest; shelf.hidden = true; shelf.replaceChildren();
  for (const child of host.children) child.inert = false; controls.querySelector('[data-tools]')?.focus({ preventScroll: true });
}
function sheetHeader(label) {
  shelf.replaceChildren(); const row = document.createElement('header'), title = document.createElement('h2'); title.textContent = label;
  row.append(title, button('Close choices and return to your band', 'Done', closeSheet, iconSVG('back'))); shelf.append(row);
}
function pager(page, pages, paintPage) {
  if (pages <= 1) return;
  const row = document.createElement('nav'); row.className = 'band-pages'; const previous = button('Earlier choices', 'Back', () => { sheetPage = page - 1; paintPage(); }, iconSVG('back'));
  const next = button('More choices', 'More', () => { sheetPage = page + 1; paintPage(); }, iconSVG('next'));
  previous.disabled = page === 0; next.disabled = page >= pages - 1; const count = document.createElement('span'); count.textContent = `${page + 1} / ${pages}`; row.append(previous, count, next); shelf.append(row);
}
function pacePicture(tempo) {
  const shapes = {
    slow: '<ellipse cx="28" cy="34" rx="19" ry="14" fill="#aed1a5"/><path d="M10 35h36M28 20v28M15 25l26 18M41 25L15 43" fill="none"/><circle cx="51" cy="32" r="7" fill="#d2e4b7"/><path d="M16 46v7m21-7v7M8 34l-4 4"/>',
    walking: '<path d="M19 11c-9 0-12 17-6 26l11-3c4-11 3-23-5-23Z" fill="#c3b5df"/><path d="m14 43 11-3 2 11-11 3Z" fill="#c3b5df"/><path d="M43 5c-8 0-11 16-5 24l10-3c4-10 3-21-5-21Z" fill="#efc993"/><path d="m39 35 10-3 3 10-11 3Z" fill="#efc993"/>',
    quick: '<ellipse cx="30" cy="40" rx="19" ry="12" fill="#e4c9df"/><path d="M40 28c-8-20-4-28 0-23l7 22m-2 2c1-21 7-24 9-17l-3 20" fill="#e4c9df"/><circle cx="47" cy="34" r="10" fill="#efd9e7"/><circle cx="11" cy="37" r="6" fill="#fff6dc"/><path d="m22 49-9 7m24-7 11 5"/>',
  };
  return `<svg class="band-pace-picture" viewBox="0 0 64 64" aria-hidden="true" focusable="false" stroke="#765947" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${shapes[tempo] || shapes.walking}</svg>`;
}
function paintTools() {
  sheetHeader('Try another way'); const draft = getMusicDraft(), choices = document.createElement('div'); choices.className = 'band-tool-options';
  // Keep recovery beside the experiment, even after the last note is removed.
  const undo = button('Undo the last tune change and keep choices open', 'Undo', () => {
    stop();
    if (!undoMusicBand()) return;
    selected = null; paint(); paintTools(); invitation();
    const nextUndo = shelf.querySelector('[data-editor-undo]');
    (nextUndo.disabled ? shelf.querySelector('header').lastElementChild : nextUndo).focus({ preventScroll: true });
  }, iconSVG('undo'));
  undo.dataset.editorUndo = ''; undo.disabled = !getMusicBandUndoAvailable();
  const header = shelf.querySelector('header'); header.insertBefore(undo, header.lastElementChild);
  if (draft.notes.length) {
    const arranger = document.createElement('section'); arranger.className = 'band-arranger';
    const label = document.createElement('h3'); label.textContent = 'Choose a note'; arranger.append(label);
    const strip = document.createElement('div'); strip.className = 'band-arrange-strip'; strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', 'Your tune order');
    draft.notes.forEach((note, index) => {
      const tile = button(`Choose note ${index + 1}: ${instruments.get(note.instrument).label} to move`, '', () => { selected = note.id; paint(); paintTools(); });
      tile.classList.add('band-note'); tile.setAttribute('aria-pressed', String(selected === note.id)); tile.append(instrumentPicture(note.instrument)); strip.append(tile);
    });
    const actions = document.createElement('div'); actions.className = 'band-tool-options';
    const index = draft.notes.findIndex(note => note.id === selected);
    for (const [direction, text, icon] of [[-1, 'Earlier', 'back'], [1, 'Later', 'next']]) {
      const move = button(`Move selected note one place ${text.toLowerCase()}`, text, () => { change({ type: 'move', id: selected, direction }); paintTools(); }, iconSVG(icon));
      move.disabled = index < 0 || index + direction < 0 || index + direction >= draft.notes.length; actions.append(move);
    }
    const again = button('Repeat selected sound beside itself', 'Again', () => { change({ type: 'duplicate', id: selected }); paintTools(); }, '<span aria-hidden="true">♫ ♫</span>');
    again.disabled = index < 0 || draft.notes.length >= MUSIC_MAX_NOTES; actions.append(again);
    const remove = button('Take out selected sound. Undo brings it back.', 'Take out', () => { change({ type: 'remove', id: selected }); paintTools(); }, '<span aria-hidden="true">−♫</span>');
    remove.disabled = index < 0; actions.append(remove);
    const reverse = button('Reverse the tune order. Undo restores the original order.', 'Backwards', () => {
      change({ type: 'reverse' }); paintTools();
      shelf.querySelector('[data-reverse-tune]')?.focus({ preventScroll: true });
    }, '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="12" cy="40" r="7" fill="#efd489"/><circle cx="32" cy="40" r="7" fill="#a7cba4"/><circle cx="52" cy="40" r="7" fill="#bca6d7"/><path d="M53 18H11m10-9L10 18l11 9" fill="none" stroke="#765947" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    reverse.dataset.reverseTune = ''; reverse.disabled = draft.notes.length < 2; actions.append(reverse);
    arranger.append(strip, actions); shelf.append(arranger);
  }
  MUSIC_INVITATIONS.forEach((row, index) => { const choice = button(row.hint, row.label, () => { change({ type: 'invitation', invitation: row.id }); closeSheet(); invitation(); }, iconSVG(['art', 'replay', 'parent'][index])); choice.setAttribute('aria-pressed', String(draft.invitation === row.id)); choices.append(choice); }); shelf.append(choices);
  const pace = document.createElement('div'); pace.className = 'band-tool-options'; pace.setAttribute('role', 'group'); pace.setAttribute('aria-label', 'Choose the pace of your tune');
  [['slow', 'Slow', '●　　●'], ['walking', 'Walking', '●　●'], ['quick', 'Quick', '●●']].forEach(([tempo, label, marks]) => { const choice = button(`${label} pace`, label, () => { change({ type: 'tempo', tempo }); paintTools(); }, pacePicture(tempo)); choice.setAttribute('aria-pressed', String(draft.tempo === tempo)); pace.append(choice); }); shelf.append(pace);
  const repeats = document.createElement('div'); repeats.className = 'band-tool-options'; repeats.setAttribute('role', 'group'); repeats.setAttribute('aria-label', 'How many times to repeat your tune');
  [1, 2, 3].forEach(repeat => { const choice = button(`Play the tune ${repeat} ${repeat === 1 ? 'time' : 'times'}`, '♫'.repeat(repeat), () => { change({ type: 'repeat', repeat }); paintTools(); }); choice.setAttribute('aria-pressed', String(draft.repeat === repeat)); repeats.append(choice); }); shelf.append(repeats);
  const extras = document.createElement('div'); extras.className = 'band-tool-options';
  extras.append(button('Choose your exact picture as the band sign', 'Your sign', () => openSheet('pictures'), iconSVG('art')), button('Choose a toy pattern to play as instruments', 'Toy pattern', () => openSheet('toys'), iconSVG('book')),
    button('Choose a kept tune and your exact picture for Our Picture Show in Theater', 'Our Picture Show', () => openSheet('show'), iconSVG('play')),
    button('Start a fresh tune. Undo brings this tune back.', 'New tune', () => { change({ type: 'fresh' }); closeSheet(); }, '<span aria-hidden="true">＋</span>'));
  shelf.append(extras);
}
function paintSaved() {
  sheetHeader(sheetKind === 'show' ? 'Our Picture Show: choose your kept tune' : 'Your tune shelf'); const band = getMusicBand(), page = musicShelfPage(band.kept, sheetPage, savedWorld.id); sheetPage = page.page;
  const grid = document.createElement('div'); grid.className = 'band-choice-grid';
  page.items.forEach((row, index) => { const choice = button(`Open kept tune ${page.page * MUSIC_PAGE_SIZE + index + 1}: ${row.notes.map(note => instruments.get(note.instrument).label).join(', ')}`, '', () => { stop(); reopenMusicBand(row.id); selected = null; closeSheet(); paint(); invitation(); });
    const strip = document.createElement('span'); strip.className = 'band-kept-preview'; row.notes.slice(0, 4).forEach(note => strip.append(instrumentPicture(note.instrument))); choice.append(strip);
    const asset = band.assets.find(item => item.id === row.sign), png = asset?.png;
    if (png) { const img = document.createElement('img'); img.src = png; img.alt = 'Your exact band sign'; img.className = 'band-choice-picture'; choice.append(img); }
    const card = document.createElement('div'); card.className = 'band-show-choice'; card.append(choice);
    const take = button(png ? 'Take this kept exact tune and your whole picture to Theater' : 'Choose your picture for this tune, then keep your show', png ? 'Take to Theater' : 'Choose your picture', () => {
      if (!png) { stop(); reopenMusicBand(row.id); selected = null; closeSheet(); paint(); void openSheet('pictures'); return; }
      try { const pictureShow = detachKeptMusicShow(row, asset); void router.go('play-stage', { pictureShow }); }
      catch { message('This show needs a smaller whole picture. Your tune and original picture stay here. Choose another sign and keep it.'); }
    }, iconSVG(png ? 'play' : 'art'));
    card.append(take); grid.append(card); });
  shelf.append(grid); if (!page.items.length) { const p = document.createElement('p'); p.textContent = 'Keep a tune here. You can open it and change it later.'; shelf.append(p); } pager(page.page, page.pages, paintSaved);
}
function paintPictures() {
  sheetHeader('Your picture can be the band sign'); const pages = Math.max(1, Math.ceil(sheetRows.length / MUSIC_PAGE_SIZE)); sheetPage = Math.max(0, Math.min(pages - 1, sheetPage));
  const grid = document.createElement('div'); grid.className = 'band-choice-grid';
  sheetRows.slice(sheetPage * MUSIC_PAGE_SIZE, (sheetPage + 1) * MUSIC_PAGE_SIZE).forEach((row, index) => { const choice = button(`Use your exact picture ${sheetPage * MUSIC_PAGE_SIZE + index + 1} as the band sign`, '', () => { stop(); if (useMusicPicture(row)) { closeSheet(); paint(); message('Your exact picture is the band sign. Tap an instrument to make its tune.'); } else message('That sign could not be added. Your picture is safe.'); });
    const image = document.createElement('img'); image.src = row.png; image.alt = 'Your picture'; image.className = 'band-choice-picture'; choice.append(image); grid.append(choice); }); shelf.append(grid);
  if (!db.status().persistent) { const warning=document.createElement('p');warning.textContent='Pictures saved on this device may be unavailable right now. Ask a grown-up to check storage before closing.';shelf.append(warning); }
  if (!sheetRows.length) { if (db.status().persistent) { const p=document.createElement('p');p.textContent='Make a picture in the Art Room, then choose it here.';shelf.append(p); } shelf.append(button('Go to the Art Room to make a picture', 'Art Room', () => { void router.go('studio'); }, iconSVG('art'))); }
  pager(sheetPage, pages, paintPictures);
}
function paintToys() {
  sheetHeader('Your toy pattern becomes a tune');
  const mapping = document.createElement('div'); mapping.className = 'band-pattern-key'; mapping.setAttribute('aria-label', 'Coral circle is drum. Mint triangle is shaker. Lilac diamond is wood blocks. Sunshine star is bell.');
  [['coral', '●', 'drum'], ['mint', '▲', 'shaker'], ['lilac', '◆', 'wood'], ['sunshine', '★', 'bell']].forEach(([color, shape, id]) => { const pair = document.createElement('span'); pair.className = `band-map-${color}`; pair.append(shape, instrumentPicture(id)); mapping.append(pair); }); shelf.append(mapping);
  const page = toyBasketPage(sheetRows, sheetPage, savedWorld.id === 'shared' ? null : savedWorld.id); sheetPage = page.page; const grid = document.createElement('div'); grid.className = 'band-choice-grid';
  page.items.forEach((row, index) => { const choice = button(`Choose your toy ${page.page * 8 + index + 1}. Its pictured colors become instruments; its exact picture becomes the sign.`, '', () => { stop(); if (useMusicToy(row)) { closeSheet(); selected = null; paint(); message(row.pattern.length ? 'Your toy’s color order is now your tune. Change any note, or play it.' : 'Your exact toy picture is the sign. Tap instruments to choose its tune.'); } });
    const img = document.createElement('img'); img.src = row.png; img.alt = 'Your exact toy picture'; img.className = 'band-choice-picture'; choice.append(img); const pattern = document.createElement('span'); pattern.className = 'band-toy-pattern'; pattern.textContent = row.pattern.map(color => ({ coral: '●', mint: '▲', lilac: '◆', sunshine: '★' }[color])).join(' '); choice.append(pattern); grid.append(choice); }); shelf.append(grid);
  if (!page.items.length) { const p = document.createElement('p'); p.textContent = 'Keep a toy with a pattern in the Toy Workshop, then bring it here.'; shelf.append(p, button('Go to the Toy Workshop', 'Workshop', () => { void router.go('toy-workshop', { returnTo: 'music-band' }); }, iconSVG('art'))); }
  pager(page.page, page.pages, paintToys);
}
async function openSheet(kind) {
  stop(); sheetKind = kind; sheetPage = 0; shelf.hidden = false;
  for (const child of host.children) if (child !== shelf) child.inert = true;
  const request = ++pickerRequest, token = visit.serial;
  if (kind === 'tools') paintTools(); else if (kind === 'saved' || kind === 'show') paintSaved();
  else {
    sheetHeader(kind === 'pictures' ? 'Opening your pictures…' : 'Opening your toys…');
    try {
      if (kind === 'pictures') { const rows = (await gallery.listChecked()).filter(isCreationRow); if (!visit.valid(token) || request !== pickerRequest) return; sheetRows = rows; paintPictures(); }
      else { await loadToyWorkshop(); if (!visit.valid(token) || request !== pickerRequest) return; const workshop = getToyWorkshop(), assets = new Map(workshop.assets.map(row => [row.id, row.png])); sheetRows = workshop.toys.map(row => ({ ...row, toyRef: row.id, png: assets.get(row.asset) })).filter(row => row.png); paintToys(); }
    } catch { if (visit.valid(token) && request === pickerRequest) { sheetHeader('Your work could not open'); const p = document.createElement('p'); p.textContent = 'Your tune is still here. Try again, or ask a grown-up for help.'; shelf.append(p); const retry=button('Try opening your work again','Try again',()=>openSheet(kind));retry.dataset.shelfRetry='';shelf.append(retry); } }
  }
  if (visit.valid(token) && request === pickerRequest) shelf.querySelector('button')?.focus({ preventScroll: true });
}

async function checkpointMusic() {
  guidance?.interrupt();
  if (!visit.active || checkpointing) return false;
  if (!ready) { const token=visit.serial; try { await flushMusicBand(); return visit.valid(token); } catch { if (visit.valid(token)) message('Your tune could not finish saving. Try again before leaving.'); return false; } }
  const token = visit.serial; checkpointing = true; stop();
  try {
    const accepted = await checkpointLivingScene({ flush: flushMusicBand, retry: () => musicStore.retryMusicBandWrites(), storage: musicBandStatus,
      alive: () => visit.valid(token), report: message, subject: 'Your tune' });
    if (accepted && visit.valid(token)) { pointers?.cancel(performance.now()); if (sheetKind) closeSheet(); }
    return accepted;
  } finally { if (visit.valid(token)) { checkpointing = false; bus.emit('activity:idle'); } }
}
async function openSavedMusic(params, token, retryWrites = false) {
  if (!visit.valid(token) || openingMusic) return;
  openingMusic=true; if (musicLoadRetry) musicLoadRetry.disabled=true;
  try {
      if (retryWrites && musicBandStatus().issue === 'music-write') await musicStore.retryMusicBandWrites();
      if (!visit.valid(token)) return;
      await loadMusicBand(); if (!visit.valid(token)) return;
      if (params.savedId) reopenMusicBand(params.savedId);
      if (params.toyId) {
        await loadToyWorkshop(); if (!visit.valid(token)) return;
        const workshop = getToyWorkshop(), toy = workshop.toys.find(row => row.id === params.toyId), asset = toy && workshop.assets.find(row => row.id === toy.asset);
        if (asset) useMusicToy({ ...toy, toyRef: toy.id, png: asset.png });
      }
      let sourceIssue='';
      if (params.sourceKey) {
        try {
          const rows=(await gallery.listChecked()).filter(isCreationRow);if(!visit.valid(token))return;
          const row=rows.find(item=>item.key===params.sourceKey);if(row)useMusicPicture(row);
          const current=getMusicBand(),selected=current.assets.find(asset=>asset.id===current.draft.sign);
          if(!row || selected?.sourceRef!==row.key || selected?.png!==row.png)sourceIssue='That picture could not be opened. Your tune is still here. Tap the sign to try again, or ask a grown-up for help.';
        } catch { if(!visit.valid(token))return;sourceIssue='That picture could not be opened. Your tune is still here. Tap the sign to try again, or ask a grown-up for help.'; }
      }
      if (!visit.valid(token)) return;
      musicLoadRetry?.remove(); musicLoadRetry=null; ready = true; stage.querySelector('.band-sign').disabled = false;
      controls.querySelectorAll('button').forEach(el => { el.disabled = false; }); paint(); invitation();
      if(sourceIssue)openingNotice=sourceIssue;
      if (!musicBandStatus().persistent) sourceIssue+=(sourceIssue ? ' ' : '')+'Your tune is here for now. Device saving is unavailable; ask a grown-up to keep a backup before closing.';
      if(sourceIssue)message(sourceIssue);
  } catch { if (visit.valid(token)) { message('Your tune could not open. Try again or return Home.'); if (!ready && !musicLoadRetry) { const retry=button('Try opening your tune again','Try again',()=>{ void openSavedMusic(params,token,true); },iconSVG('replay')); retry.classList.add('band-load-retry'); retry.dataset.loadRetry=''; stage.append(retry); musicLoadRetry=retry; } } }
  finally { if (visit.valid(token)) { openingMusic=false; if (musicLoadRetry) musicLoadRetry.disabled=false; } }
}
export default {
  id: 'music-band',
  async mount(el, params = {}) {
    enteredFromMap = params.fromMap === true;
    const token = visit.begin(); openingMusic=false; musicLoadRetry=null; openingNotice=''; host = el; pointers = new WorkshopPointers(); sound = new BandSound(); selected = null; sheetKind = ''; saving = false; ready = false; checkpointing = false; performanceScore = null;
    host.classList.add('music-band');
    host.innerHTML = '<header class="band-header"><h1>Music Band</h1><nav aria-label="Go to another place"></nav></header><main class="band-stage" aria-label="Your band room"><div class="band-canopy" aria-hidden="true"></div><button class="band-sign" type="button" aria-label="Choose your own exact picture as the band sign"></button><div class="band-family"></div><p class="band-result" hidden></p><div class="band-score" role="group" aria-label="Your tune"></div><div class="band-instruments" role="group" aria-label="Tap an instrument to add its sound to your tune"></div></main><p class="band-status" role="status" aria-live="polite">Opening your tune…</p><footer class="band-controls"></footer><section class="band-sheet" role="dialog" aria-modal="true" aria-label="Band choices" hidden></section>';
    stage = host.querySelector('.band-stage'); score = host.querySelector('.band-score'); status = host.querySelector('.band-status'); controls = host.querySelector('.band-controls'); shelf = host.querySelector('.band-sheet');
    guidance?.dispose(); guidance = new LivingGuidance({ route: 'music-band', active: () => visit.valid(token),
      ready: () => ready && !saving && !checkpointing && !sheetKind && !playing && !openingNotice,
      guideKey: help => livingPlayGuideKey('music-band', getMusicDraft(), { help }),
      caption: (text, key) => { host.dataset.guidance = key; message(text); } });
    idleHelp?.();idleHelp=installIdleHelp(host,{
      active:()=>visit.valid(token) && ready && !saving && !checkpointing && !sheetKind && !playing && !previewTimer && pointers?.active==null && !openingNotice && !session.isBreakLocked() && !router.isMoving() && router.current()==='music-band' && !speech.isSpeaking(),
      demonstrate:()=>{
        const draft=getMusicDraft(), choosing=!!selected, note=choosing ? draft.notes.find(row=>row.id===selected) : null;
        const target=choosing ? (note && [...stage.querySelectorAll('[data-instrument]')].find(el=>!el.disabled && el.dataset.instrument!=='rest' && el.dataset.instrument!==note.instrument)) : draft.notes.length ? score.querySelector('[data-note-id]') : stage.querySelector('.band-instruments').querySelector('[data-instrument]');
        if(!target || target.disabled)return null;target.classList.add('band-idle-target');if(!choosing)guidance.guide(false);const serial=guidance.serial;
        const motionCue=!reduced() && target.animate?.([{translate:'0 0'},{translate:'0 -6px'},{translate:'0 0'}],{duration:900,iterations:1,easing:'ease-in-out'});
        idleMotion=motionCue || null;motionCue?.finished?.catch?.(()=>{});let visualDone=false;
        const clearVisual=()=>{if(visualDone)return;visualDone=true;motionCue?.cancel?.();if(idleMotion===motionCue)idleMotion=null;target.classList.remove('band-idle-target');};
        const visualTimer=setTimeout(clearVisual,2400);let voiceOwned=!choosing;const voiceTimer=setTimeout(()=>{voiceOwned=false;},4000);
        return ()=>{clearTimeout(visualTimer);clearTimeout(voiceTimer);clearVisual();if(voiceOwned && guidance && guidance.serial===serial)guidance.interrupt();};
      },
    });
    muted = muteButton(); const home = homeButton(); home.setAttribute('aria-label', 'Home: back to your valley');
    const back = button(enteredFromMap ? 'Back to the valley' : 'Back to Together', 'Back', () => { void router.go(enteredFromMap ? 'map' : 'treehouse'); }, iconSVG('back')); back.dataset.back = '';
    host.querySelector('.band-header nav').append(home, back, muted);
    const guide = button('Help: hear what to do with your tune', 'Help', help, iconSVG('help')); guide.dataset.help = ''; guide.disabled = true; host.querySelector('.band-header nav').append(guide);
    stage.querySelector('.band-sign').disabled = true;
    stage.querySelector('.band-sign').addEventListener('click', () => { if (visit.active && ready && !router.isMoving()) { openingNotice='';void openSheet('pictures'); } });
    MUSIC_INSTRUMENTS.forEach(row => { const el = button(`Add ${row.label.toLowerCase()} to your tune, or change a selected note to it`, row.label, () => addInstrument(row.id)); el.dataset.instrument = row.id; el.append(instrumentPicture(row.id)); el.style.setProperty('--band-color', row.color); el.disabled = true; stage.querySelector('.band-instruments').append(el); });
    [['mama', 'Mama', 'family_adult1_idle', 'Mama adds a steady pulse under your tune'], ['veer', 'Veer', 'veer_idle', 'Veer echoes your exact tune in his own turn']].forEach(([role, name, key, label]) => {
      const el = button(`${label}. Tap to invite or rest.`, name, () => { change({ type: role, join: !getMusicDraft()[role] }); message(getMusicDraft()[role] ? `${name} joins: ${role === 'mama' ? 'a steady pulse under your notes' : 'an echo after your notes'}. Your tune stays yours.` : `${name} rests. Your tune stays yours.`); });
      el.classList.add('band-family-member'); el.dataset.role = role; const img = document.createElement('img'); img.src = art.get(`characters/${key}`)?.src || `assets/art/final/characters/${key}.webp`; img.alt = ''; img.draggable = false; el.prepend(img); stage.querySelector('.band-family').append(el);
    });
    const parts = [
      ['play', 'Play your tune from the beginning', 'Play', () => { if (playing) { stop(); invitation(); } else startPerformance(); }, iconSVG('play')],
      ['step', 'Show and hear the next note at your own pace', 'Next note', stepPerformance, iconSVG('next')],
      ['undo', 'Undo the last tune change', 'Undo', () => { stop(); undoMusicBand(); selected = null; paint(); invitation(); }, iconSVG('undo')],
      ['tools', 'Move notes, change pace, repeats, picture sign, or toy pattern', 'Try', () => openSheet('tools'), iconSVG('replay')],
      ['keep', 'Keep this exact tune on your shelf', 'Keep', keep, iconSVG('heart')],
      ['shelf', 'Open your kept tunes', 'Shelf', () => openSheet('saved'), iconSVG('book')],
    ];
    parts.forEach(([key, label, text, action, icon]) => { const el = button(label, text, action, icon); el.dataset[key] = ''; el.disabled = true; controls.append(el); });
    const pointerDown = event => {
      if (checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (event.target.closest('.band-header nav')) return;
      const verdict = pointers.down(event, performance.now(), !settings.get().penOnly);
      if (verdict.accepted) { openingNotice='';guidance?.interrupt(); host.classList.remove('is-guided'); }
      if (verdict.cancel) stop(); if (!verdict.accepted) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    listen(host, 'pointerdown', pointerDown, true);
    listen(host, 'click', event => { if (checkpointing || (!event.target.closest('.band-header nav') && !pointers.allowClick(event, performance.now()))) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(host, 'keydown', event => { if (checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    listen(window, 'pointerup', event => pointers.finish(event, performance.now()));
    listen(window, 'pointercancel', event => { pointers.finish(event, performance.now(), true); stop(); });
    listen(host, 'lostpointercapture', event => { if (pointers.owns(event)) { pointers.finish(event, performance.now(), true); stop(); } });
    const disrupt = () => { stop(); pointers.cancel(performance.now()); void flushMusicBand().catch(() => {}); };
    listen(window, 'resize', disrupt); listen(window, 'blur', disrupt); listen(document, 'visibilitychange', () => { if (document.hidden) disrupt(); });
    listen(shelf, 'keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeSheet(); }
      if (event.key === 'Tab') { const focusable = [...shelf.querySelectorAll('button:not(:disabled)')], first = focusable[0], last = focusable.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    });
    offSettings = bus.on('settings:changed', () => { if (!visit.active) return; stop();if(reduced()){idleMotion?.cancel?.();idleMotion=null;}paint(); }); offMute = bus.on('mute:changed', () => stop());
    offEnd = bus.on('session:end', () => stop());
    offLeave = bus.on('screen:leave', event => { if (event?.id === 'music-band' && visit.valid(token)) stop(); });
    bedWasPlaying = music.isPlaying(); music.stop();
    await openSavedMusic(params, token);
  },
  busy() { return saving || checkpointing; },
  breakBusy() { return saving || checkpointing; },
  onBack() { if (sheetKind) closeSheet(); else void router.go(enteredFromMap ? 'map' : 'treehouse'); },
  beforeLeave: checkpointMusic,
  beforeBreak: checkpointMusic,
  unmount() {
    musicLoadRetry?.remove(); musicLoadRetry=null; openingMusic=false;
    idleHelp?.();idleHelp=null;
    guidance?.dispose(); guidance = null;
    visit.end(); ready = false; checkpointing = false; stop(); listeners.forEach(off => off()); listeners = []; offSettings?.(); offMute?.(); offEnd?.(); offLeave?.(); muted?.destroy?.();
    void flushMusicBand().catch(() => {}); if (bedWasPlaying && !settings.get().muted) music.start();
    host = stage = status = score = shelf = controls = null; sound = null; pointers = null; performanceScore = null; sheetKind = ''; ++pickerRequest;
  },
};
