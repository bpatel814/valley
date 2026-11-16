// settings.js - the parent's choices. Persisted in kv 'settings', saved on every change.

import * as db from "./db.js";
import { emit } from "../world/bus.js";
import { savedWorld } from './saved-world.js';

export const DEFAULTS = {
  valleyProfile: savedWorld.profile || "rayna",
  sessionMinutes: 0,
  handedness: "right",
  penOnly: false,
  muted: false,
  volume: 0.8,
  musicVolume: 0.45,
  effectsVolume: 0.7,
  voiceVolume: 1,
  learningLevel: "explore",
  pool: "upper",
  regions: {
    garden: true,
    meadow: true,
    stories: true,
    bridge: true,
    studio: true,
    treehouse: true,
    grandma: true,
    discovery: true,
  },
  reducedMotion: false,
  darkPaper: false,
  playStageInviteSeen: false,
  voices: { preferred: "auto" },
};

export const REGIONS = [
  "garden", "meadow", "stories", "bridge", "studio", "treehouse", "grandma", "discovery",
];
// Activities inside a place that a parent can switch on or off one by one.
// Until a parent touches one of these switches nothing is stored and the curated
// default below applies, so existing saves stay byte-equivalent (work order item 5,
// Nov 16 2026). The ones off by default are being rebuilt as toys; each returns to
// the default set when it passes.
export const ACTIVITY_SWITCHES = [
  "town-tracks", "water-garden", "play-stage",
  "animal-friends", "rolling-run", "river-run", "toy-workshop", "build-lab",
  "picnic", "music-band", "picture-post", "boo-hollow",
];
export const ACTIVITIES_OFF_BY_DEFAULT = [
  "rolling-run", "river-run", "toy-workshop", "build-lab",
  "picnic", "music-band", "picture-post", "boo-hollow",
];
export function defaultActivities() {
  return Object.fromEntries(ACTIVITY_SWITCHES.map((id) => [id, !ACTIVITIES_OFF_BY_DEFAULT.includes(id)]));
}
export const POOLS = ["upper", "upper+lower", "all"];
export const LEARNING_LEVELS = ["explore", "grow", "challenge"];

const clone = (o) => JSON.parse(JSON.stringify(o));

function merge(base, patch) {
  const out = Object.assign({}, base);
  for (const key of Object.keys(patch || {})) {
    const v = patch[key];
    if (v && typeof v === "object" && !Array.isArray(v) && base[key] && typeof base[key] === "object") {
      out[key] = Object.assign({}, base[key], v);
    } else if (v !== undefined) {
      out[key] = v;
    }
  }
  return out;
}

function sanitise(s) {
  const out = merge(clone(DEFAULTS), s || {});
  out.valleyProfile = savedWorld.profile || (out.valleyProfile === "veer" ? "veer" : "rayna");
  out.sessionMinutes = Math.max(0, Math.min(60, Math.round(Number(out.sessionMinutes) || 0)));
  // Legacy backups keep their original shape; only an explicit new choice adds opt-in.
  if (Object.hasOwn(out, "timerEnabled")) out.timerEnabled = out.timerEnabled === true && out.sessionMinutes > 0;
  out.handedness = out.handedness === "left" ? "left" : "right";
  out.penOnly = !!out.penOnly;
  out.muted = !!out.muted;
  out.reducedMotion = !!out.reducedMotion;
  out.darkPaper = !!out.darkPaper;
  // Do not add a field to untouched v8 settings; old backups stay byte-equivalent.
  if (Object.hasOwn(out, 'halloweenOff')) out.halloweenOff = out.halloweenOff === true;
  out.playStageInviteSeen = !!out.playStageInviteSeen;
  // Grown-up choice: Cat friend opens the older full corner instead of the toy.
  if (Object.hasOwn(out, "catCornerFull")) out.catCornerFull = out.catCornerFull === true;
  // Only an explicit parent choice adds this field (see ACTIVITY_SWITCHES).
  if (Object.hasOwn(out, "activities")) {
    const chosen = out.activities && typeof out.activities === "object" && !Array.isArray(out.activities) ? out.activities : {};
    out.activities = Object.fromEntries(Object.entries(defaultActivities())
      .map(([id, on]) => [id, typeof chosen[id] === "boolean" ? chosen[id] : on]));
  }
  const volume = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  };
  out.volume = volume(out.volume, DEFAULTS.volume);
  out.musicVolume = volume(out.musicVolume, DEFAULTS.musicVolume);
  out.effectsVolume = volume(out.effectsVolume, DEFAULTS.effectsVolume);
  out.voiceVolume = volume(out.voiceVolume, DEFAULTS.voiceVolume);
  if (!LEARNING_LEVELS.includes(out.learningLevel)) out.learningLevel = DEFAULTS.learningLevel;
  if (!POOLS.includes(out.pool)) out.pool = "upper";
  out.regions = Object.assign(clone(DEFAULTS.regions), out.regions);
  for (const r of REGIONS) out.regions[r] = out.regions[r] !== false;
  // The map must always have somewhere useful to go. Re-enable the gentlest
  // starting place when an old/corrupt save or a run of toggles disables all places.
  if (!REGIONS.some((r) => out.regions[r])) out.regions.garden = true;
  out.voices = Object.assign(clone(DEFAULTS.voices), out.voices);
  const preferred = String(out.voices.preferred || "auto");
  out.voices.preferred = ["auto", "grandma", "mama", "papa", "veer"].includes(preferred)
    ? preferred : "auto";
  return out;
}

/** Prepare a restore without changing live settings or writing any data. */
export function normaliseSettings(value, base = DEFAULTS) { return sanitise(merge(base, value || {})); }

let state = sanitise(null);
let loaded = false;

export async function load({ io = db } = {}) {
  // An unavailable saved setting is not permission to replace it with defaults.
  const raw = await (io.getStrict || io.get)("kv", "settings");
  if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw))) {
    throw Object.assign(new Error('Saved settings could not be read safely.'), { code: 'saved-settings-invalid' });
  }
  const next = sanitise(raw);
  if (raw === undefined) await io.put("kv", "settings", next);
  state = next;
  loaded = true;
  return state;
}

export function get() { return state; }

export function isLoaded() { return loaded; }

/** Deep merges `regions`, `voices` and `activities`; everything else is replaced. Saves immediately. */
export async function set(patch) {
  const wasMuted = state.muted;
  const chosen = { ...(patch || {}) };
  // The first switch a parent touches fixes the whole current set, so later
  // changes to the curated default never flip their other choices.
  if (chosen.activities && !state.activities) chosen.activities = { ...defaultActivities(), ...chosen.activities };
  // Choosing a duration is explicit parent opt-in; unrelated settings never enable it.
  if (Object.hasOwn(chosen, "sessionMinutes") && !Object.hasOwn(chosen, "timerEnabled")) chosen.timerEnabled = Number(chosen.sessionMinutes) > 0;
  state = sanitise(merge(state, chosen));
  try { await db.put("kv", "settings", state); } catch (e) { console.info("[settings] save skipped:", e && e.name); }
  emit("settings:changed", { patch: patch || {}, settings: state });
  if (state.muted !== wasMuted) emit("mute:changed", { muted: state.muted });
  return state;
}

export async function reset() { return set(clone(DEFAULTS)); }

/** Enabled destinations in map order. Always contains at least one region. */
export function enabledRegions() {
  return REGIONS.filter((r) => state.regions[r] !== false);
}

export function isRegionEnabled(region) {
  return REGIONS.includes(region) && state.regions[region] !== false;
}

// The puppet stage belongs to Together and follows that parent's place switch.
export function activityRegion(route) {
  if (route === "boo-hollow") return "discovery";
  if (route === "toy-workshop") return "studio";
  if (["play-stage", "picnic", "picture-post", "music-band"].includes(route)) return "treehouse";
  if (["build-lab", "water-garden", "rolling-run", "town-tracks", "animal-friends", "river-run"].includes(route)) return "discovery";
  return route;
}

/** The parent's per-activity choices, or the curated default if never changed. */
export function activityChoices() {
  return state.activities ? { ...state.activities } : defaultActivities();
}

/** A route is open when its place is on and, for switchable activities, its own switch is on. */
export function isActivityEnabled(route) {
  const region = activityRegion(route);
  if (REGIONS.includes(region) && !isRegionEnabled(region)) return false;
  return !ACTIVITY_SWITCHES.includes(route) || activityChoices()[route] !== false;
}

export function enabledActivities() {
  const routes = enabledRegions();
  if (isRegionEnabled("treehouse")) routes.push("play-stage");
  if (isRegionEnabled("treehouse")) routes.push("picnic", "picture-post", "music-band");
  if (isRegionEnabled("discovery")) routes.push("town-tracks", "build-lab", "water-garden", "rolling-run", "animal-friends", "river-run", "boo-hollow");
  if (isRegionEnabled("studio")) routes.push("toy-workshop");
  return routes.filter(isActivityEnabled);
}

export const settings = {
  load, get, set, reset, isLoaded, enabledRegions, isRegionEnabled, activityRegion, enabledActivities,
  isActivityEnabled, activityChoices, defaultActivities, ACTIVITY_SWITCHES, ACTIVITIES_OFF_BY_DEFAULT,
  normaliseSettings, DEFAULTS, REGIONS, POOLS, LEARNING_LEVELS,
};
export default settings;
