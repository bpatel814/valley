// speech.js - the voice of Rainbow Valley. Voice comes first: everything else ducks for it.
//
// Every line resolves in this order, per key:
//   (a) a recording in IndexedDB  (`voices` store, key `${speaker}/${key}`)  - the in-app
//       recorder writes these, so a family voice always wins
//   (b) the narrator pack          file named by assets/voices/neural/manifest.json
//       (see tools/build_kokoro_voices.py)
//
// Speakers are tried in order: the phrase's own speaker first, then whatever
// settings.voices asks for. If no verified authored recording can play, the line is
// silent and the screen's existing visual guidance remains. Authored text and child
// names are never sent to a device speech service.
// The narrator pack is synthetic and generic; it never clones a relative.
//
// Volume: settings.muted silences everything immediately, including whatever is already
// playing. Otherwise voiceGain() = settings.volume * settings.voiceVolume (defaults 0.8
// and 1), applied live to a playing clip.
//
// Nothing here ever throws: a device with no IndexedDB or usable clips still plays the
// whole game, silently.

import bus from "../world/bus.js";
import * as dbMod from "../state/db.js";
import * as settingsMod from "../state/settings.js";
import * as sfx from "./sfx.js";
import { PHRASES, fill, pickPraise, pickRetry } from "../data/phrases.js";

// ------------------------------------------------------------------ module plumbing

const DB = () => dbMod.default || dbMod;
async function dbGet(store, key) {
  try {
    const d = DB();
    const fn = dbMod.get || (d && d.get);
    if (!fn) return null;
    return await fn(store, key);
  } catch { return null; }
}

const S = () => settingsMod.settings || settingsMod.default || settingsMod;
function currentSettings() {
  try { const g = S().get; return (g && g()) || {}; } catch { return {}; }
}

function clamp01(n, dflt) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : dflt;
}

// Volume contract (shared with sfx.js and music.js): settings.volume is the master
// slider (default 0.8), settings.voiceVolume is this category's slider (default 1).
/** The voice category multiplier right now, 0..1, ignoring mute. Exported for tests. */
export function volumeGain(s) {
  s = s || currentSettings();
  return clamp01(s.volume, 0.8) * clamp01(s.voiceVolume, 1);
}

/** The voice gain to actually apply: 0 while muted. */
function voiceGain() {
  const s = currentSettings();
  if (s && s.muted) return 0;
  return volumeGain(s);
}

const VOICES_ROOT = (() => {
  try { return new URL("../../assets/voices/", import.meta.url).href; }
  catch { return "assets/voices/"; }
})();

// ------------------------------------------------------------------ state

let unlocked = false;
let audioEl = null;            // one reusable element for clips and recordings
let token = 0;                 // bumped by cancel(); every await checks it
let queue = [];
let pumping = false;
let active = null;             // { key, stop() }
let lastPraiseKey = null;
let lastRetryKey = null;
let lastResolutionInfo = { key: null, path: null, speaker: null, voice: null };
let sayingDepth = 0;

// ------------------------------------------------------------------ unlock

/** Call from the first pointerdown. Primes WebAudio and the reusable audio element. */
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  try { sfx.unlock(); } catch { /* no WebAudio on this device */ }
  try {
    el();
    // A tiny silent wav, so the element counts as "played by a gesture" on Android.
    audioEl.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    const p = audioEl.play();
    if (p && p.catch) p.catch(() => {});
  } catch { /* fine */ }
  narratorIndexOnce();
}

export function isUnlocked() { return unlocked; }

function el() {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.preload = "none";
  audioEl.crossOrigin = "anonymous";
  return audioEl;
}

let narratorIndex = null;       // Map of keys to { text, file } verified by the manifest
let narratorIndexPending = null;

/** The narrator pack's manifest (assets/voices/neural/manifest.json), fetched once. A
 *  missing manifest (the optional pack was never built) is tolerated as an empty map. */
function narratorIndexOnce() {
  if (narratorIndex) return Promise.resolve(narratorIndex);
  if (narratorIndexPending) return narratorIndexPending;
  if (typeof fetch !== "function") { narratorIndex = new Map(); return Promise.resolve(narratorIndex); }
  narratorIndexPending = fetch(VOICES_ROOT + "neural/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((j) => {
      const keys = j && Array.isArray(j.keys) ? j.keys : [];
      narratorIndex = new Map(keys.flatMap((key) => {
        const entry = j?.entries?.[key];
        if (typeof entry?.text !== "string" || typeof entry?.file !== "string") return [];
        const parts = entry.file.replace(/\\/g, "/").split("/");
        if (!entry.file || parts.includes("..") || !/\.(mp3|wav|webm|ogg)$/i.test(entry.file)) return [];
        const version = /^[a-f0-9]{64}$/i.test(entry.audioHash || "") ? "?v=" + entry.audioHash : "";
        return [[key, { text: entry.text, file: parts.map(encodeURIComponent).join("/") + version }]];
      }));
      return narratorIndex;
    });
  return narratorIndexPending;
}

/** Device voices are intentionally unused for authored narration. */
export function voiceName() { return null; }

// ------------------------------------------------------------------ clip playback

function playSrc(src, revoke) {
  return new Promise((resolve) => {
    const a = el();
    a.volume = voiceGain();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      a.removeEventListener("ended", ended);
      a.removeEventListener("error", failed);
      if (revoke) { try { URL.revokeObjectURL(src); } catch { /* fine */ } }
      resolve(result);
    };
    const ended = () => finish("ended");
    const failed = () => finish("error");
    a.addEventListener("ended", ended);
    a.addEventListener("error", failed);
    active = {
      key: "clip",
      stop: () => { try { a.pause(); } catch { /* fine */ } finish("cancelled"); },
    };
    try {
      a.src = src;
      const p = a.play();
      if (p && p.catch) p.catch(failed);
    } catch { failed(); }
  });
}

function blobOf(rec) {
  if (!rec) return null;
  if (typeof Blob !== "undefined" && rec instanceof Blob) return rec;
  if (rec.blob && typeof Blob !== "undefined" && rec.blob instanceof Blob) return rec.blob;
  return null;
}

// ------------------------------------------------------------------ resolution

/** The speaker fallback order for a phrase: its own speaker, then settings.voices, then 'guide'. Exported for tests. */
export function speakerOrder(primary) {
  const out = [];
  const push = (s) => { if (s && typeof s === "string" && !out.includes(s)) out.push(s); };
  push(primary || "guide");
  const v = currentSettings().voices;
  if (Array.isArray(v)) v.forEach(push);
  else if (v && Array.isArray(v.order)) v.order.forEach(push);
  else if (v && typeof v.preferred === "string" && v.preferred !== "auto") push(v.preferred);
  push("guide");
  return out;
}

async function resolveAndPlay(key, vars, my) {
  const phrase = PHRASES[key];
  if (!phrase) return;
  const text = fill(phrase.text, vars);
  const speakers = speakerOrder(phrase.speaker);

  // (a) a recording made in the app
  for (const sp of speakers) {
    const rec = await dbGet("voices", sp + "/" + key);
    if (my !== token) return;
    const b = blobOf(rec);
    if (b) {
      const url = URL.createObjectURL(b);
      startedSaying(key, sp, "idb", null, text);
      const result = await playSrc(url, true);
      if (my !== token || result !== "error") return;
    }
  }

  // (b) A bundled natural narrator. Actual family recordings above always win.
  // One disclosed synthetic narrator reads authored lines; it never clones a relative.
  const narrated = await narratorIndexOnce();
  if (my !== token) return;
  const narrator = narrated.get(key);
  if (narrator?.text === text) {
    startedSaying(key, "guide", "neural", null, text);
    const result = await playSrc(VOICES_ROOT + "neural/" + narrator.file, false);
    if (my !== token || result !== "error") return;
  }

  startedSaying(key, phrase.speaker, "silent", null, text);
}

function startedSaying(key, speaker, path, voice, text) {
  lastResolutionInfo = { key, path, speaker: speaker || "guide", voice: voice || null, text };
  bus.emit("say:start", { ...lastResolutionInfo });
}

/** How the last line was resolved: { key, path:'idb'|'neural'|'silent', speaker, voice }. */
export function lastResolution() { return { ...lastResolutionInfo }; }

// ------------------------------------------------------------------ the queue

function pump() {
  if (pumping) return;
  pumping = true;
  (async () => {
    while (queue.length) {
      const item = queue.shift();
      const my = item.token;
      if (my !== token) { item.resolve(); continue; }
      sayingDepth++;
      try { await resolveAndPlay(item.key, item.vars, my); }
      catch (e) { /* a broken clip must never break the game */ }
      active = null;
      sayingDepth--;
      bus.emit("say:end", { key: item.key });
      item.resolve();
    }
    pumping = false;
  })();
}

/**
 * Speak a phrase key. Resolves when the audio ends (or immediately if it is cancelled).
 * vars interpolate {name} and friends: say('ui_hi_rayna', {name:'Rayna'}).
 */
export function say(key, vars) {
  if (!PHRASES[key] || voiceGain() === 0) return Promise.resolve();
  // New guidance replaces stale speech instead of building a queue of old prompts.
  cancel();
  return new Promise((resolve) => {
    queue.push({ key, vars, token, resolve });
    pump();
  });
}

/** Stop everything and empty the queue. */
export function cancel() {
  token++;
  const pending = queue;
  queue = [];
  const a = active;
  active = null;
  if (a) { try { a.stop(); } catch { /* fine */ } }
  if (audioEl) { try { audioEl.pause(); } catch { /* fine */ } }
  for (const p of pending) p.resolve();
}

// A new screen never talks over the old one.
bus.on("screen:leave", () => cancel());

// A hidden tab (or the parent stepping away) must never leave a line playing where
// no one can hear it end: stop outright, same as leaving a screen.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancel();
  });
}

// ------------------------------------------------------------------ live volume/mute
//
// A slider move or a mute tap must be heard immediately, even mid-line. A clip's
// volume is a live HTMLMediaElement property, so it can just be reset.

function refreshVoiceVolume() {
  const g = voiceGain();
  if (audioEl && active && active.key === "clip") audioEl.volume = g;
  if (g === 0) cancel();
}

bus.on("mute:changed", refreshVoiceVolume);
bus.on("settings:changed", refreshVoiceVolume);

// ------------------------------------------------------------------ sugar

/** A praise line from the tier band, never the same one twice in a row. */
export function praise(tier) {
  const key = pickPraise(tier, lastPraiseKey);
  lastPraiseKey = key;
  return say(key);
}

/** A warm retry line, never the same one twice in a row, never negative. */
export function retry() {
  const key = pickRetry(lastRetryKey);
  lastRetryKey = key;
  return say(key);
}

/** Name the current glyph briefly. Long phonics chains do not talk over drawing. */
export async function letter(char) {
  const ch = String(char || "").charAt(0);
  if (!ch) return;
  if (/[0-9]/.test(ch)) { await say("digit_" + ch); return; }
  await say(ch >= "a" && ch <= "z" ? "lower_" + ch : "letter_" + ch.toUpperCase());
}

/** Name a word: word('RAYNA'). */
export function word(w) {
  return say("word_" + String(w || "").toUpperCase());
}

/** Name a drawing object: object('sun'). */
export function object(id) {
  return say("object_" + String(id || "").toLowerCase());
}

/** True while a line is playing. */
export function isSpeaking() { return sayingDepth > 0 || queue.length > 0; }

export const speech = {
  say, praise, retry, letter, word, object, cancel,
  unlock, isUnlocked, isSpeaking, lastResolution, voiceName,
};
export default speech;
