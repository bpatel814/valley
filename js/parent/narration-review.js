import bus from '../world/bus.js';
import * as settings from '../state/settings.js';
import { textFor } from '../data/phrases.js';
import { volumeGain, cancel as cancelNarration } from '../audio/speech.js';
import { duck } from '../audio/music.js';

export const NARRATION_REVIEW_SAMPLES = Object.freeze([
  ['word_RAYNA', 'Rayna'], ['word_VEER', 'Veer'], ['word_ISHAN', 'Ishan'],
  ['word_MAMA', 'Mama'], ['word_DADDY', 'Daddy'], ['word_BA', 'Ba'], ['word_DADA', 'Dada'],
  ['play_stage_parade_route', 'Stage trail'], ['picnic_help', 'Picnic help'],
  ['build_lab_settle', 'Bridge retry'], ['wg_help', 'Water Garden'],
  ['picture_post_help_make', 'Picture Post'], ['show_and_tell_describe', 'Co-play'],
  ['grandma_time_for_break', 'Break with Ba'],
].map(([key, label]) => Object.freeze({ key, label })));

const voiceRoot = new URL('../../assets/voices/neural/', import.meta.url);

/** Only the selected Heart entries whose text still matches this build may play. */
export function narrationReviewEntries(manifest) {
  if (manifest?.voice !== 'af_heart') return [];
  const keys = new Set(Array.isArray(manifest.keys) ? manifest.keys : []);
  return NARRATION_REVIEW_SAMPLES.flatMap(sample => {
    const entry = manifest.entries?.[sample.key];
    if (!keys.has(sample.key) || entry?.text !== textFor(sample.key)
      || !/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mp3$/.test(entry?.file || '')
      || !/^[a-f0-9]{64}$/i.test(entry?.audioHash || '')) return [];
    const url = new URL(entry.file, voiceRoot);
    url.searchParams.set('v', entry.audioHash);
    return [{ ...sample, text: entry.text, url: url.href }];
  });
}

export async function loadNarrationReview() {
  const response = await fetch(new URL('manifest.json', voiceRoot), { cache: 'no-cache' });
  if (!response.ok) throw new Error('The Heart samples could not be checked on this address.');
  return narrationReviewEntries(await response.json());
}

/** One lazy element for explicit Parent previews; never changes saved settings. */
export function createParentListeningPlayer({
  getSettings = settings.get, createAudio = () => new Audio(), onState = () => {},
  cancelSpeech = cancelNarration, duckMusic = duck, objectURLs = URL,
  documentTarget = typeof document !== 'undefined' ? document : null,
  windowTarget = typeof window !== 'undefined' ? window : null,
} = {}) {
  let audio = null, generation = 0, activeKey = null, ownedURL = null, detachAudio = null;
  let phase = 'idle', reason = 'ready', disposed = false;
  const entries = new Map(), removals = [];
  const gain = () => { const current = getSettings(); return current.muted ? 0 : volumeGain(current); };
  const snapshot = () => ({ activeKey, phase, reason, muted: !!getSettings().muted, gain: gain() });
  const publish = () => onState(snapshot());

  function stop(nextReason = 'stopped', restoreMusic = true) {
    generation++;
    activeKey = null; phase = 'idle'; reason = nextReason;
    detachAudio?.(); detachAudio = null;
    if (audio) {
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (_) {}
    }
    if (ownedURL) { try { objectURLs.revokeObjectURL(ownedURL); } catch (_) {} ownedURL = null; }
    if (restoreMusic) duckMusic(false);
    publish();
  }

  function permitted() {
    if (disposed) return false;
    if (documentTarget?.hidden) { stop('interrupted'); return false; }
    if (gain() === 0) { stop(getSettings().muted ? 'muted' : 'volume-zero'); return false; }
    return true;
  }

  function playURL(url, key, my) {
    if (my !== generation || !permitted()) return;
    try {
      if (!audio) { audio = createAudio(); audio.preload = 'none'; }
      cancelSpeech();
      activeKey = key; phase = 'loading'; reason = 'playing';
      audio.volume = gain(); audio.src = url;
      const handlers = {
        ended: () => { if (my === generation && audio.ended) stop('finished'); },
        error: () => { if (my === generation) stop('unavailable'); },
        // pause() queues an event; a replaced clip may already be playing when it arrives.
        pause: () => { if (my === generation && activeKey && audio.paused) stop('interrupted'); },
      };
      for (const [type, fn] of Object.entries(handlers)) audio.addEventListener(type, fn);
      detachAudio = () => { for (const [type, fn] of Object.entries(handlers)) audio.removeEventListener(type, fn); };
      duckMusic(true); publish();
      Promise.resolve(audio.play()).then(() => {
        if (my !== generation || disposed) return;
        phase = 'playing'; publish();
      }).catch(() => { if (my === generation) stop('unavailable'); });
    } catch (_) { if (my === generation) stop('unavailable'); }
  }

  function play(key) {
    stop('replaced');
    if (!permitted()) return;
    const entry = entries.get(key);
    if (!entry) { stop('unavailable'); return; }
    playURL(entry.url, key, generation);
  }

  async function playRecording(loadRecord, key) {
    stop('replaced');
    if (!permitted()) return;
    const my = generation;
    activeKey = `recording:${key}`; phase = 'loading'; reason = 'playing'; publish();
    try {
      const record = await loadRecord();
      if (my !== generation || !permitted()) return;
      const blob = record instanceof Blob ? record : record?.blob;
      if (!(blob instanceof Blob) || !blob.size) { stop('recording-missing'); return; }
      ownedURL = objectURLs.createObjectURL(blob);
      playURL(ownedURL, activeKey, my);
    } catch (_) { if (my === generation) stop('recording-missing'); }
  }

  function refresh() {
    if (gain() === 0) stop(getSettings().muted ? 'muted' : 'volume-zero');
    else { if (audio && activeKey) audio.volume = gain(); publish(); }
  }
  removals.push(bus.on('settings:changed', refresh), bus.on('mute:changed', refresh));
  removals.push(bus.on('screen:leave', () => stop('left')));
  removals.push(bus.on('say:start', () => stop('interrupted', false)));
  removals.push(bus.on('say:end', () => { if (activeKey) duckMusic(true); }));
  for (const [target, type, fn] of [
    [documentTarget, 'visibilitychange', () => { if (documentTarget.hidden) stop('interrupted'); }],
    [windowTarget, 'pagehide', () => stop('interrupted')],
  ]) {
    if (!target) continue;
    target.addEventListener(type, fn);
    removals.push(() => target.removeEventListener(type, fn));
  }
  return {
    play, playRecording, stop, refresh, snapshot,
    setEntries(rows) { entries.clear(); for (const row of rows) entries.set(row.key, row); },
    dispose() { disposed = true; for (const remove of removals) remove(); stop('left'); },
  };
}
