// progress.js - the single owner of what Rayna has learned.
//
// Schema v2 (docs/ARCHITECTURE.md):
// { v:2, firstRunDone:false,
//   letters:{ A:{fed,level,streak,misses,attempts,hatched,lastSeen} },   // all 62 glyphs
//   words:{ RAYNA:{stripe,best,plays} },                                 // catalogue words
//   drawings:{ sun:{steps:[false,false,false], sticker:false} },         // 15 objects
//   unicorn:{stripes:0}, stickers:[], days:{ '2026-09-12':{traces,hatches,stripes,drawings} },
//   journey:{petals:0,flowers:0,plays:0,recent:[],attempts:[]} }
//
// Every mutation saves immediately and emits `progress:changed` plus its specific event.
// Adaptive fade / spaced repetition live in js/engine/adaptive.js; feeding and hatching
// live here, because the caterpillar is progress, not scoring.

import * as db from "./db.js";
import { emit } from "../world/bus.js";
import { applyResult } from "../engine/adaptive.js";
import { UPPER, LOWER, DIGITS } from "../data/letters.js";
import { today } from "./session.js";
import { RETIRED_FAMILY_WORDS, WORDS as WORD_CATALOG } from "../data/words.js";

export const SCHEMA_VERSION = 2;

/** Stable catalogue keys; child-facing choices are shuffled separately. */
export const WORDS = WORD_CATALOG.map((entry) => entry.word);

/** The guided-drawing objects, in bridge order. */
export const DRAWINGS = [
  "sun", "rainbow", "flower", "house", "balloon", "caterpillar", "cat", "butterfly",
  "fish", "unicorn", "star", "heart", "icecream", "tree", "veer", "pumpkin", "friendlyghost", "spider", "skeleton", "witchhat",
];

export const MILESTONES = {
  firstHatch: "ms_first_hatch",
  firstWord: "ms_first_word",
  firstDrawing: "ms_first_drawing",
  fiveHatches: "ms_five_hatches",
  veerHighFive: "ms_veer_high_five",
  grandmaHug: "ms_grandma_hug",
};

const MAX_STRIPES = WORDS.length;
const MAX_RECENT = 12;
const MAX_ATTEMPTS = 72;
const MAX_COUNT = 1000000;
// fed gained per tier: three great traces (0.34 x 3) hatch a butterfly.
const FED_BY_TIER = [0, 0.12, 0.25, 0.34];

export const ALL_GLYPHS = [...UPPER, ...LOWER, ...DIGITS];

const newLetter = () => ({ fed: 0, level: 0, streak: 0, misses: 0, attempts: 0, hatched: false, lastSeen: 0 });
const newWord = () => ({ stripe: 0, best: 0, plays: 0 });
const newDrawing = () => ({ steps: [false, false, false], sticker: false });
const newDay = () => ({ traces: 0, hatches: 0, stripes: 0, drawings: 0 });
const newJourney = () => ({ petals: 0, flowers: 0, plays: 0, recent: [], attempts: [] });

const count = (value, max = MAX_COUNT) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
};

const bounded = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
};

function cleanToken(value, max = 80) {
  const s = String(value == null ? "" : value).trim();
  return s && s.length <= max ? s : "";
}

function normaliseRecent(value) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const kind = cleanToken(raw && typeof raw === "object" ? raw.kind : String(raw || "").split(":")[0], 24);
    const key = cleanToken(raw && typeof raw === "object" ? raw.key : String(raw || "").split(":").slice(1).join(":"), 80);
    const id = kind + ":" + key;
    if (!kind || !key || seen.has(id)) continue;
    seen.add(id);
    out.push({ kind, key });
  }
  return out.slice(-MAX_RECENT);
}

function normaliseAttempts(value) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const id = cleanToken(raw, 160);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(-MAX_ATTEMPTS);
}

function blank() {
  return {
    v: SCHEMA_VERSION,
    firstRunDone: false,
    letters: {},
    words: {},
    drawings: {},
    unicorn: { stripes: 0 },
    journey: newJourney(),
    stickers: [],
    days: {},
  };
}

/** Fill in every glyph, word and drawing that a build may have added since last time. */
function normalise(raw) {
  const s = Object.assign(blank(), raw && typeof raw === "object" ? raw : {});
  s.v = SCHEMA_VERSION;
  s.firstRunDone = !!s.firstRunDone;
  s.letters = Object.assign({}, s.letters);
  s.words = Object.assign({}, s.words);
  s.drawings = Object.assign({}, s.drawings);
  s.unicorn = Object.assign({ stripes: 0 }, s.unicorn);
  s.journey = Object.assign(newJourney(), s.journey && typeof s.journey === "object" ? s.journey : {});
  s.stickers = Array.isArray(s.stickers) ? [...new Set(s.stickers)] : [];
  s.days = Object.assign({}, s.days);

  // Carry the earned family reward forward without claiming the child has
  // practised the new spelling. Keep the old record intact for backup/history.
  for (const [oldName, newName] of Object.entries(RETIRED_FAMILY_WORDS)) {
    if (s.words[oldName]?.stripe) {
      s.words[newName] = { ...newWord(), ...s.words[newName], stripe: 1 };
    }
  }

  for (const ch of ALL_GLYPHS) {
    const letter = Object.assign(newLetter(), s.letters[ch]);
    letter.fed = bounded(letter.fed, 0, 1);
    letter.level = count(letter.level, 4);
    letter.streak = count(letter.streak);
    letter.misses = count(letter.misses);
    letter.attempts = count(letter.attempts);
    letter.hatched = !!letter.hatched;
    letter.lastSeen = count(letter.lastSeen, Number.MAX_SAFE_INTEGER);
    s.letters[ch] = letter;
  }
  for (const w of WORDS) {
    const word = Object.assign(newWord(), s.words[w]);
    word.stripe = word.stripe ? 1 : 0;
    word.best = Math.round(bounded(word.best, 0, 3) * 100) / 100;
    word.plays = count(word.plays);
    s.words[w] = word;
  }
  for (const d of DRAWINGS) {
    const cur = Object.assign(newDrawing(), s.drawings[d]);
    cur.steps = [0, 1, 2].map((i) => !!(cur.steps && cur.steps[i]));
    s.drawings[d] = cur;
  }
  for (const key of Object.keys(s.days)) {
    const day = Object.assign(newDay(), s.days[key]);
    for (const field of Object.keys(newDay())) day[field] = count(day[field]);
    s.days[key] = day;
  }
  s.unicorn.stripes = Math.min(MAX_STRIPES, Math.max(0, s.unicorn.stripes | 0));
  s.journey.petals = count(s.journey.petals, 2);
  s.journey.flowers = count(s.journey.flowers);
  s.journey.plays = count(s.journey.plays);
  s.journey.recent = normaliseRecent(s.journey.recent);
  s.journey.attempts = normaliseAttempts(s.journey.attempts);
  return s;
}

/** Older saves are migrated forward here. Every old mastery field is retained. */
function migrate(raw) {
  if (!raw || typeof raw !== "object") return blank();
  let s = raw;
  if (!s.v || s.v < 1) s = Object.assign(blank(), s, { v: 1 });
  if (s.v < 2) s = Object.assign({}, s, { v: 2, journey: newJourney() });
  return s;
}

let state = blank();
let loaded = false;
let writeTail = Promise.resolve();

function enqueueWrite(work) {
  const pending = writeTail.then(work, work);
  writeTail = pending.catch(() => undefined);
  return pending;
}

async function save() {
  // Called only inside a serialized mutation, so never enqueue recursively.
  try { await db.put("kv", "progress", state); } catch (e) { console.info("[progress] save skipped:", e && e.name); }
}

// Halloween is an optional field of the existing v2 progress document. Keep a
// ghost's original and its roster entry atomic, without changing the v8 envelope.
export function commitBooHollow(update) {
  return enqueueWrite(async () => {
    const change = await update(state.booHollow);
    const next = { ...state, booHollow: change.value };
    await db.atomicWrite({ put: [['kv', 'progress', next], ...(change.put || [])] });
    state.booHollow = change.value;
    emit('progress:changed', { kind: 'boo-hollow' });
    return change.result;
  });
}

export function flushProgressWrites() { return writeTail; }

function dayRow(key) {
  const k = key || today();
  if (!state.days[k]) state.days[k] = newDay();
  return state.days[k];
}

function addSticker(id) {
  if (!id || state.stickers.includes(id)) return false;
  state.stickers.push(id);
  emit("progress:sticker", { id });
  return true;
}

function hatchedCount() {
  let n = 0;
  for (const ch of Object.keys(state.letters)) if (state.letters[ch].hatched) n++;
  return n;
}

async function changed(kind, extra) {
  await save();
  emit("progress:changed", Object.assign({ kind }, extra || {}));
}

/** Read the saved progress, migrate it, fill defaults. Call once at boot. */
export async function load({ io = db } = {}) {
  return enqueueWrite(async () => {
    // A failed read is not an empty world. Propagate it to the boot recovery
    // screen without writing a blank replacement over family progress.
    const raw = await (io.getStrict || io.get)("kv", "progress");
    if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw))) {
      throw Object.assign(new Error('Saved progress could not be read safely.'), { code: 'saved-progress-invalid' });
    }
    if (raw && Object.hasOwn(raw, 'v') && (!Number.isSafeInteger(raw.v) || raw.v < 0)) {
      throw Object.assign(new Error('Saved progress version could not be read safely.'), { code: 'saved-progress-invalid' });
    }
    if (raw && Number.isSafeInteger(raw.v) && raw.v > SCHEMA_VERSION) {
      throw Object.assign(new Error('Saved progress was made by a newer version.'), { code: 'saved-progress-newer' });
    }
    const fresh = raw === undefined;
    const next = normalise(migrate(raw));
    if (fresh || !raw.v || raw.v !== SCHEMA_VERSION) await io.put('kv', 'progress', next);
    state = next;
    loaded = true;
    return state;
  });
}

/** The live object. Treat it as read-only outside this module. */
export function get() { return state; }

export function isLoaded() { return loaded; }

/**
 * Credit one genuinely completed play to the shared three-petal journey.
 * A stable attemptId makes replaying a saved completed trace harmless.
 */
export function recordPlay(...args) { return enqueueWrite(() => recordPlayNow(...args)); }
async function recordPlayNow(kind, key, attemptId) {
  const knd = cleanToken(kind, 24);
  const item = cleanToken(key, 80);
  const attempt = attemptId == null || attemptId === "" ? "" : cleanToken(attemptId, 160);
  const current = () => ({
    rewarded: false,
    petals: state.journey.petals,
    flowers: state.journey.flowers,
    credited: false,
  });
  if (!knd || !item || (attemptId != null && attemptId !== "" && !attempt)) return current();
  if (attempt && state.journey.attempts.includes(attempt)) return current();

  if (attempt) {
    state.journey.attempts.push(attempt);
    state.journey.attempts = state.journey.attempts.slice(-MAX_ATTEMPTS);
  }
  const recentId = knd + ":" + item;
  state.journey.recent = state.journey.recent.filter((r) => r.kind + ":" + r.key !== recentId);
  state.journey.recent.push({ kind: knd, key: item });
  state.journey.recent = state.journey.recent.slice(-MAX_RECENT);
  state.journey.plays = count(state.journey.plays + 1);
  state.journey.petals += 1;

  let rewarded = false;
  if (state.journey.petals >= 3) {
    state.journey.petals = 0;
    state.journey.flowers = count(state.journey.flowers + 1);
    rewarded = true;
  }

  const result = {
    rewarded,
    petals: state.journey.petals,
    flowers: state.journey.flowers,
    credited: true,
  };
  await changed("play", { playKind: knd, key: item, ...result });
  emit("journey:play", { kind: knd, key: item, ...result });
  if (rewarded) emit("journey:reward", { kind: knd, key: item, ...result });
  return result;
}

/**
 * One traced glyph. `tier` is the scorer band 0..3.
 * Adaptive owns level/streak/misses; we own fed, hatching, stickers and the day tally.
 */
export function recordTrace(...args) { return enqueueWrite(() => recordTraceNow(...args)); }
async function recordTraceNow(char, tier, nowMs) {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const t = Math.max(0, Math.min(3, tier | 0));
  const before = state.letters[char] || newLetter();
  if (!state.letters[char]) state.letters[char] = before;

  let next;
  try {
    next = applyResult(Object.assign({}, before), t, now) || {};
  } catch (e) {
    console.info("[progress] adaptive.applyResult failed:", e && e.name);
    next = {};
  }
  next = Object.assign({}, before, next);

  // If adaptive did not move `fed`, feed the caterpillar ourselves.
  const fedBefore = before.fed || 0;
  if (!(next.fed > fedBefore)) next.fed = fedBefore + FED_BY_TIER[t];
  next.fed = Math.min(1, Math.max(0, next.fed));
  if (!(next.attempts > (before.attempts || 0))) next.attempts = (before.attempts || 0) + 1;
  next.level = Math.max(0, Math.min(4, next.level | 0));
  next.lastSeen = now;
  next.hatched = !!before.hatched;

  const hatching = !before.hatched && (next.fed >= 1 || next.hatched === true);
  if (hatching) next.hatched = true;
  state.letters[char] = next;

  const day = dayRow();
  day.traces += 1;

  if (hatching) {
    day.hatches += 1;
    addSticker("butterfly_" + char);
    if (hatchedCount() === 1) addSticker(MILESTONES.firstHatch);
    if (hatchedCount() >= 5) addSticker(MILESTONES.fiveHatches);
    emit("progress:hatch", { char });
  }

  await changed("trace", { char, tier: t, hatched: hatching, fed: next.fed, level: next.level });
  return state.letters[char];
}

/**
 * One written word. `tiers` is one scorer band per letter.
 * Done = every letter tier >= 1 and the mean tier >= 1.5. The first completion
 * restores one unicorn stripe; repeats only polish it.
 */
export function recordWord(...args) { return enqueueWrite(() => recordWordNow(...args)); }
async function recordWordNow(word, tiers) {
  const id = String(word || "").trim().toUpperCase();
  const validTiers = Array.isArray(tiers) && tiers.length === id.length && tiers.every((t) => typeof t === "number" && Number.isInteger(t) && t >= 0 && t <= 3);
  const list = validTiers ? tiers.map((t) => Math.max(0, Math.min(3, Math.round(Number(t))))) : [];
  if (!id || !state.words[id] || !validTiers) {
    return { done: false, earned: false, mean: 0, stripes: state.unicorn.stripes, invalid: true };
  }
  const w = state.words[id];
  const mean = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
  const done = list.length > 0 && list.every((t) => t >= 1) && mean >= 1.5;

  w.plays += 1;
  if (mean > w.best) w.best = Math.round(mean * 100) / 100;

  let earned = false;
  if (done && !w.stripe) {
    earned = true;
    w.stripe = 1;
    state.unicorn.stripes = Math.min(MAX_STRIPES, state.unicorn.stripes + 1);
    dayRow().stripes += 1;
    addSticker("gem_" + id);
    if (state.unicorn.stripes === 1) addSticker(MILESTONES.firstWord);
    emit("progress:stripe", { word: id, n: state.unicorn.stripes });
  }

  await changed("word", { word: id, tiers: list, mean, done, earned, stripes: state.unicorn.stripes });
  return { done, earned, mean, stripes: state.unicorn.stripes };
}

/**
 * One finished drawing step (0 dot-to-dot, 1 ghost trace, 2 free draw).
 * Step 2 is saved to the gallery; all three steps earn the object's sticker.
 */
export function recordDrawing(...args) { return enqueueWrite(() => recordDrawingNow(...args)); }
async function recordDrawingNow(id, step, data) {
  const i = Math.max(0, Math.min(2, step | 0));
  if (!state.drawings[id]) state.drawings[id] = newDrawing();
  const d = state.drawings[id];
  d.steps[i] = true;

  const day = today();
  let galleryKey = null;
  if (i === 2) {
    dayRow(day).drawings += 1;
    const png = data && data.png;
    if (png) {
      galleryKey = day + "_" + id + "_" + Date.now();
      const at = Date.now();
      try {
        await db.put("gallery", galleryKey, {
          id, day, png, strokes: (data && data.strokes) || [], at,
        });
      } catch (e) {
        galleryKey = null;
        console.info("[progress] gallery save skipped:", e && e.name);
      }
    }
  }

  let earned = false;
  if (d.steps.every(Boolean) && !d.sticker) {
    earned = true;
    d.sticker = true;
    addSticker("draw_" + id);
    if (!state.stickers.includes(MILESTONES.firstDrawing)) addSticker(MILESTONES.firstDrawing);
  }

  await changed("drawing", { id, step: i, earned, galleryKey });
  return { earned, galleryKey };
}

/** Award a milestone sticker by id (Veer's high five, Ba's hug). */
export function awardSticker(...args) { return enqueueWrite(() => awardStickerNow(...args)); }
async function awardStickerNow(id) {
  const added = addSticker(id);
  if (added) await changed("sticker", { id });
  return added;
}

export function stickers() { return state.stickers.slice(); }

export function markFirstRun() { return enqueueWrite(markFirstRunNow); }
async function markFirstRunNow() {
  if (state.firstRunDone) return state;
  state.firstRunDone = true;
  await changed("firstRun");
  return state;
}

/** Parent: clear today's tally and today's gallery entries. Mastery is untouched. */
export async function resetToday() {
  return enqueueWrite(async () => {
    const day = today();
    const next = { ...state, days: { ...state.days } };
    delete next.days[day];
    const keys = await db.keys('gallery');
    await db.atomicWrite({ put: [['kv', 'progress', next]],
      del: (keys || []).filter(key => String(key).startsWith(day + '_')).map(key => ['gallery', key]) });
    state = next;
    emit('progress:changed', { kind: 'resetToday', day });
    return state;
  });
}

/** Parent only, behind a double confirm: forget everything except the family voices. */
export async function resetAll() {
  return enqueueWrite(async () => {
    const next = normalise(blank());
    await db.atomicWrite({ put: [['kv', 'progress', next]], clear: ['gallery'] });
    state = next;
    emit('progress:changed', { kind: 'resetAll' });
    return state;
  });
}

export function exportJSON() {
  return {
    app: "rainbow-valley",
    kind: "progress",
    v: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    progress: JSON.parse(JSON.stringify(state)),
  };
}

export async function importJSON(obj) {
  const raw = obj && obj.progress ? obj.progress : obj;
  const next = normaliseImportedProgress(raw);
  return enqueueWrite(async () => {
    await db.atomicWrite({ put: [['kv', 'progress', next]] });
    state = next;
    emit('progress:changed', { kind: 'import' });
    return state;
  });
}

/** Validate/default a restore before its atomic commit touches live progress. */
export function normaliseImportedProgress(raw) { return normalise(migrate(raw)); }

export const progress = {
  load, get, isLoaded, recordPlay, recordTrace, recordWord, recordDrawing, awardSticker, stickers,
  markFirstRun, resetToday, resetAll, exportJSON, importJSON,
  normaliseImportedProgress, WORDS, DRAWINGS, ALL_GLYPHS, MILESTONES, SCHEMA_VERSION,
};
export default progress;
