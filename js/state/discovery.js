// Local Discovery Glade history, stable catalog page, owned construction, and draft recovery.
//
// This is visit history, not an assessment. It stores no accuracy, speed, score,
// rank, or mastery field. Unfinished work has independent durable slots.

import db from "./db.js";
import {
  DISCOVERY_CATALOG_PAGES,
  DISCOVERY_MISSIONS,
  buildIsReady,
  discoveryMission,
  discoveryVariation,
  missionSet,
  normalizeDiscoveryDraft,
} from "../data/discovery.js";

const KEY = "discovery";
const SCHEMA = 3;
export const MAX_DISCOVERY_VISITS = 10000;
export const MAX_DISCOVERY_BUILDS = 1000;
export const MAX_DISCOVERY_BYTES = 64 * 1024 * 1024;
const MAX_RECENT = 12;
export const OWNED_BUILD_VARIATIONS = Object.freeze(["tower", "boat", "garden"]);
export const DISCOVERY_DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const defaults = () => ({
  schema: SCHEMA,
  visits: [],
  recent: [],
  lastMission: null,
  lastVariations: {},
  catalogPage: 0,
  latestBuild: null,
  ownedBuilds: {},
  draft: null,
  drafts: {},
  currentDraftKey: null,
  builds: [],
});

let state = defaults();
let loaded = false;
let loading = null;
let writes = Promise.resolve();
const copy = value => JSON.parse(JSON.stringify(value));
const failure = code => Object.assign(new Error(code === "discovery-version" ? "This Discovery version cannot be opened. Existing play was kept." : "Discovery storage is full or cannot be read. Existing play was kept."), { code });
export const discoveryDraftKey = (missionId, variationId) => `${missionId}:${variationId}`;

function safeTime(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 8_640_000_000_000_000 ? n : 0;
}

function catalogPage(value) {
  const count = DISCOVERY_CATALOG_PAGES.length;
  const page = Math.trunc(Number(value));
  return Number.isFinite(page) ? ((page % count) + count) % count : 0;
}

function validDraft(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return null;
  const at = safeTime(raw.at);
  if (!at) return null;
  const mission = discoveryMission(raw.missionId);
  const variation = discoveryVariation(mission, raw.variationId);
  if (!mission || !variation) return null;
  if ((Array.isArray(raw.built) && raw.built.length > (variation.maxParts || 9)) ||
      (Array.isArray(raw.made) && raw.made.length > (variation.goal || 5))) throw failure("discovery-capacity");
  return { ...normalizeDiscoveryDraft(raw, mission.id, variation.id), at };
}

function validLatestBuild(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.completed != null && raw.completed !== true) return null;
  const mission = discoveryMission(raw.missionId);
  const variation = discoveryVariation(mission, raw.variationId);
  const at = safeTime(raw.at);
  if (!mission || mission.id !== "shape-build" || !variation || !OWNED_BUILD_VARIATIONS.includes(variation.id) || !at) return null;
  if (Array.isArray(raw.built) && raw.built.length > variation.maxParts) throw failure("discovery-capacity");
  if (!Array.isArray(raw.built) || raw.built.length > variation.maxParts ||
      raw.built.some((part) => !variation.options.some((option) => option.id === part))) return null;
  const draft = normalizeDiscoveryDraft({
    missionId: mission.id,
    variationId: variation.id,
    built: raw.built,
    completed: false,
  }, mission.id, variation.id);
  if (!buildIsReady(variation, draft.built)) return null;
  return {
    missionId: mission.id,
    variationId: variation.id,
    built: draft.built.slice(),
    at,
  };
}

function cloneBuild(build) {
  return build ? { ...build, built: build.built.slice() } : null;
}

function latestOwnedBuild(ownedBuilds, preferred = null) {
  let latest = null;
  for (const variationId of OWNED_BUILD_VARIATIONS) {
    const build = ownedBuilds[variationId];
    if (build && (!latest || build.at > latest.at)) latest = build;
  }
  if (preferred && ownedBuilds[preferred.variationId]?.at === latest?.at) {
    return ownedBuilds[preferred.variationId];
  }
  return latest;
}

export function normalizeDiscoveryState(raw, now = Date.now()) {
  const out = defaults();
  if (raw == null) return out;
  if (typeof raw !== "object" || Array.isArray(raw)) throw failure("discovery-schema");
  if (raw.schema != null && ![1, 2, SCHEMA].includes(raw.schema)) throw failure("discovery-version");
  if (raw.version != null && raw.version !== 1) throw failure("discovery-version");
  if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > MAX_DISCOVERY_BYTES) throw failure("discovery-capacity");
  const visits = Array.isArray(raw.visits) ? raw.visits : [];
  out.visits = visits.filter((visit) => {
    return visit && discoveryVariation(visit.missionId, visit.variationId) && safeTime(visit.at);
  }).map((visit) => ({
    missionId: visit.missionId,
    variationId: visit.variationId,
    at: safeTime(visit.at),
  }));
  if (out.visits.length > MAX_DISCOVERY_VISITS) throw failure("discovery-capacity");
  const recent = Array.isArray(raw.recent) ? raw.recent : [];
  for (const id of recent) {
    if (!discoveryMission(id)) continue;
    const previous = out.recent.indexOf(id);
    if (previous >= 0) out.recent.splice(previous, 1);
    out.recent.push(id);
  }
  out.recent = out.recent.slice(-MAX_RECENT);
  out.lastMission = discoveryMission(raw.lastMission) ? raw.lastMission : null;
  if (raw.lastVariations && typeof raw.lastVariations === "object" && !Array.isArray(raw.lastVariations)) {
    for (const mission of DISCOVERY_MISSIONS) {
      if (discoveryVariation(mission, raw.lastVariations[mission.id])) {
        out.lastVariations[mission.id] = raw.lastVariations[mission.id];
      }
    }
  }
  out.catalogPage = catalogPage(raw.catalogPage);
  const oldLatest = validLatestBuild(raw.latestBuild);
  if (raw.ownedBuilds && typeof raw.ownedBuilds === "object" && !Array.isArray(raw.ownedBuilds)) {
    for (const variationId of OWNED_BUILD_VARIATIONS) {
      const build = validLatestBuild(raw.ownedBuilds[variationId]);
      if (build?.variationId === variationId) out.ownedBuilds[variationId] = build;
    }
  }
  // Schema 2 held only one creation. Retain it when a newer slot is absent.
  if (oldLatest && (!out.ownedBuilds[oldLatest.variationId] ||
      oldLatest.at > out.ownedBuilds[oldLatest.variationId].at)) {
    out.ownedBuilds[oldLatest.variationId] = oldLatest;
  }
  out.latestBuild = cloneBuild(latestOwnedBuild(out.ownedBuilds, oldLatest));
  const rows = [...(Array.isArray(raw.builds) ? raw.builds : []), ...Object.values(out.ownedBuilds), ...(oldLatest ? [oldLatest] : [])];
  const seenBuilds = new Set();
  for (const row of rows) {
    const build = validLatestBuild(row); if (!build) continue;
    const key = JSON.stringify(build); if (seenBuilds.has(key)) continue;
    seenBuilds.add(key); out.builds.push(build);
  }
  if (out.builds.length > MAX_DISCOVERY_BUILDS) throw failure("discovery-capacity");
  if (raw.drafts != null && (typeof raw.drafts !== "object" || Array.isArray(raw.drafts))) throw failure("discovery-schema");
  for (const row of Object.values(raw.drafts || {})) {
    const draft = validDraft(row, now); if (!draft) continue;
    const key = discoveryDraftKey(draft.missionId, draft.variationId);
    if (out.drafts[key] && JSON.stringify(out.drafts[key]) !== JSON.stringify(draft)) throw failure("discovery-conflict");
    out.drafts[key] = draft;
  }
  const legacy = validDraft(raw.draft, now);
  if (legacy) {
    const key = discoveryDraftKey(legacy.missionId, legacy.variationId);
    if (out.drafts[key] && JSON.stringify(out.drafts[key]) !== JSON.stringify(legacy)) throw failure("discovery-conflict");
    out.drafts[key] = legacy;
    out.currentDraftKey = key;
  }
  if (typeof raw.currentDraftKey === "string" && out.drafts[raw.currentDraftKey]) out.currentDraftKey = raw.currentDraftKey;
  out.draft = out.currentDraftKey ? copy(out.drafts[out.currentDraftKey]) : null;
  return out;
}

function persist() {
  const snapshot = get();
  const queued = writes.then(() => db.put("kv", KEY, snapshot), () => db.put("kv", KEY, snapshot));
  writes = queued;
  void queued.catch(() => {});
  return queued.then(() => copy(snapshot));
}

export async function load({ force = false } = {}) {
  if (loaded && !force) return get();
  if (!loading) loading = (async () => {
    await writes;
    let next;
    try { next = normalizeDiscoveryState(await db.get("kv", KEY)); }
    catch (error) { loaded = false; throw error; }
    state = next; loaded = true; return get();
  })().finally(() => { loading = null; });
  return loading;
}

export function get() {
  return {
    ...state,
    visits: state.visits.map((visit) => ({ ...visit })),
    recent: state.recent.slice(),
    lastVariations: { ...state.lastVariations },
    latestBuild: cloneBuild(state.latestBuild),
    ownedBuilds: Object.fromEntries(OWNED_BUILD_VARIATIONS
      .filter((variationId) => state.ownedBuilds[variationId])
      .map((variationId) => [variationId, cloneBuild(state.ownedBuilds[variationId])])),
    draft: state.draft ? JSON.parse(JSON.stringify(state.draft)) : null,
    drafts: copy(state.drafts),
    builds: state.builds.map(cloneBuild),
  };
}

export function getOwnedBuilds() {
  return OWNED_BUILD_VARIATIONS
    .filter((variationId) => state.ownedBuilds[variationId])
    .map((variationId) => cloneBuild(state.ownedBuilds[variationId]));
}

export function isLoaded() {
  return loaded;
}

export function chooseVariation(missionId, requestedId = null) {
  const mission = discoveryMission(missionId) || DISCOVERY_MISSIONS[0];
  const last = state.lastVariations[mission.id] || null;
  if (requestedId && discoveryVariation(mission, requestedId) && requestedId !== last) return requestedId;
  const current = Math.max(-1, mission.variations.findIndex((entry) => entry.id === last));
  return mission.variations[(current + 1) % mission.variations.length].id;
}

export function choices(page = state.catalogPage) {
  return missionSet(catalogPage(page));
}

export async function setCatalogPage(page) {
  await load();
  state.catalogPage = catalogPage(page);
  await persist();
  return state.catalogPage;
}

export async function saveDraft(missionId, variationId, draft) {
  await load();
  const mission = discoveryMission(missionId);
  const variation = discoveryVariation(mission, variationId);
  if (!mission || !variation) return null;
  const row = validDraft({ ...draft, missionId: mission.id, variationId: variation.id, at: Date.now() });
  const key = discoveryDraftKey(mission.id, variation.id);
  state = normalizeDiscoveryState({ ...state, drafts: { ...state.drafts, [key]: row }, draft: row, currentDraftKey: key });
  await persist();
  return copy(row);
}

export async function clearDraft(missionId = null, variationId = null) {
  await load();
  missionId ??= state.draft?.missionId; variationId ??= state.draft?.variationId;
  const key = discoveryDraftKey(missionId, variationId), drafts = { ...state.drafts }; delete drafts[key];
  state = { ...state, drafts, draft: state.currentDraftKey === key ? null : state.draft, currentDraftKey: state.currentDraftKey === key ? null : state.currentDraftKey };
  await persist();
  return null;
}

export async function recordVisit(missionId, variationId, completedDraft = null) {
  await load();
  const mission = discoveryMission(missionId);
  const variation = discoveryVariation(mission, variationId);
  if (!mission || !variation) return { recorded: false, visits: state.visits.length };
  const at = Date.now();
  const visit = { missionId: mission.id, variationId: variation.id, at };
  const next = get();
  if (mission.kind === "build" && completedDraft && typeof completedDraft === "object" &&
      (completedDraft.completed == null || completedDraft.completed === true) &&
      (!completedDraft.missionId || completedDraft.missionId === mission.id) &&
      (!completedDraft.variationId || completedDraft.variationId === variation.id)) {
    const completedBuild = validLatestBuild({
      missionId: mission.id,
      variationId: variation.id,
      built: completedDraft.built,
      at,
    });
    if (completedBuild) {
      next.latestBuild = completedBuild;
      next.ownedBuilds[variation.id] = cloneBuild(completedBuild);
      next.builds.push(cloneBuild(completedBuild));
    }
  }
  next.visits.push(visit);
  next.recent = next.recent.filter((id) => id !== mission.id);
  next.recent.push(mission.id);
  next.lastMission = mission.id;
  next.lastVariations[mission.id] = variation.id;
  const key = discoveryDraftKey(mission.id, variation.id); delete next.drafts[key];
  if (next.currentDraftKey === key) { next.draft = null; next.currentDraftKey = null; }
  state = normalizeDiscoveryState(next);
  let saved;
  try { saved = await persist(); }
  catch (error) {
    // The captured completed visit is still in local state. Retry its checkpoint
    // instead of replaying completion and adding a second visit.
    throw Object.assign(new Error(error?.message || "Discovery saving failed", { cause: error }), {
      code: error?.code, discoveryVisitApplied: true,
    });
  }
  return {
    recorded: true,
    visits: saved.visits.length,
    visit: { ...visit },
    latestBuild: cloneBuild(saved.latestBuild),
    ownedBuilds: OWNED_BUILD_VARIATIONS.filter(id => saved.ownedBuilds[id]).map(id => cloneBuild(saved.ownedBuilds[id])),
  };
}

export async function reset() {
  await writes.catch(() => {});
  state = defaults();
  loaded = true;
  await db.del("kv", KEY);
  writes = Promise.resolve();
  return get();
}

export function draftFor(missionId, variationId = null) {
  const rows = Object.values(state.drafts).filter(row => row.missionId === missionId && (!variationId || row.variationId === variationId));
  const found = rows.sort((a,b) => b.at - a.at)[0]; return found ? copy(found) : null;
}
export function flushDiscoveryWrites() { return writes; }
export async function checkpointDiscovery() { await load(); await persist(); return { persistent: db.status().persistent }; }

export const discoveryState = {
  load,
  get,
  getOwnedBuilds,
  isLoaded,
  choices,
  chooseVariation,
  setCatalogPage,
  saveDraft,
  clearDraft,
  recordVisit,
  reset,
  draftFor,
  checkpointDiscovery,
  flushDiscoveryWrites,
};

export default discoveryState;
