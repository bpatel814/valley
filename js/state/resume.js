// resume.js - kill the tab mid-stroke and she comes back to the same letter.
// Written after every stroke end. No debounce: every stroke lands.

import * as db from "./db.js";

const MAX_AGE_MS = 12 * 60 * 60 * 1000; // yesterday's half-finished letter is not a welcome
const MAX_STROKES = 512;
export const RESUMABLE_SCREENS = [
  "map", "garden", "meadow", "stories", "bridge", "studio", "treehouse", "discovery", "play-stage", "picnic", "build-lab", "water-garden", "picture-post", "toy-workshop", "rolling-run", "music-band", "animal-friends", "river-run",
];

function safeParams(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) return null;
  try {
    const text = JSON.stringify(params);
    if (text.length > 65536) return null;
    return JSON.parse(text);
  } catch (_) { return null; }
}

function fresh(snap) {
  if (!snap || typeof snap !== "object" || !RESUMABLE_SCREENS.includes(snap.screen)) return null;
  const at = typeof snap.at === "number" ? snap.at : 0;
  const age = Date.now() - at;
  if (!at || age < -60000 || age > MAX_AGE_MS) return null;
  return {
    screen: snap.screen,
    params: safeParams(snap.params),
    strokes: Array.isArray(snap.strokes) ? snap.strokes.slice(-MAX_STROKES) : [],
    at,
  };
}

export async function save(snapshot) {
  if (!snapshot || !RESUMABLE_SCREENS.includes(snapshot.screen)) return null;
  const snap = {
    screen: snapshot.screen,
    params: safeParams(snapshot.params),
    strokes: Array.isArray(snapshot.strokes) ? snapshot.strokes.slice(-MAX_STROKES) : [],
    at: Date.now(),
  };
  try { await db.put("kv", "resume", snap); } catch (e) { console.info("[resume] save skipped:", e && e.name); }
  return snap;
}

/** Replace the previous route's checkpoint before mounting the next screen.
 * Screens with detailed progress save their own snapshot after they mount.
 * Parent and Mama Break leave that detailed checkpoint untouched. */
export async function enterRoute(screen, params = {}) {
  if (RESUMABLE_SCREENS.includes(screen)) return save({ screen, params });
  if (screen === "grandma") return save({ screen: "map", params: {} });
  return null;
}

/** Read and clear. Returns null when there is nothing, or it is older than 12 hours. */
export async function take({ io = db } = {}) {
  // Do not clear a checkpoint when a failed read merely looks like no record.
  const snap = await (io.getStrict || io.get)("kv", "resume");
  await clear({ io });
  return fresh(snap);
}

/** Read without clearing. */
export async function peek({ io = db } = {}) {
  const snap = await (io.getStrict || io.get)("kv", "resume");
  return fresh(snap);
}

export async function clear({ io = db } = {}) {
  try { await io.del("kv", "resume"); } catch (_) {}
}

/**
 * Pick a safe target after the app has registered its screens. The lead should call
 * this before router.go so a removed/disabled route can never leave a blank shell.
 */
export function resolve(snapshot, availableScreens, fallback = "map") {
  const snap = fresh(snapshot);
  const available = new Set(Array.isArray(availableScreens) ? availableScreens : RESUMABLE_SCREENS);
  if (!snap || !available.has(snap.screen)) return { screen: fallback, params: null, strokes: [] };
  return snap;
}

export const resume = { save, enterRoute, take, peek, clear, resolve, MAX_AGE_MS, RESUMABLE_SCREENS };
export default resume;
