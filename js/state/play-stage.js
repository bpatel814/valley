// Durable editable puppet-play scenes and immutable, never auto-pruned postcards.
import db from "./db.js";
import { today } from "./session.js";
import gallery from "../parent/gallery.js";
import { isLocalPNG } from "./creation-frame.js";
import { buildIsReady, discoveryMission, discoveryVariation, normalizeDiscoveryDraft } from "../data/discovery.js";
import { normalizeBuild } from "../data/build-lab.js";
import { normalizePictureShowSource, normalizePictureShowSnapshot } from "../data/picture-show.js";
import { normalizeStageStoryDay, normalizeStageFrameAnchor, applyStageStoryAction, stageStoryStillWaiting } from '../data/stage-story-day.js';
export { normalizePictureShowSnapshot } from "../data/picture-show.js";

export const PLAY_STAGE_VERSION = 1;
export const PLAY_STAGE_LAYOUT_VERSION = 1;
export const PLAY_STAGE_CURRENT_KEY = "play-stage:current:v1";
export const PLAY_STAGE_POSTCARD_KIND = "play-stage";
export const PLAY_STAGE_MAX_ACTORS = 3;
export const PLAY_STAGE_MAX_PROPS = 4;
export const PLAY_STAGE_MAX_POSTCARDS = 1000;
export const PLAY_STAGE_MAX_ROUTE_POINTS = 6;
export const PLAY_STAGE_MAX_ASSETS = 6;
export const PLAY_STAGE_MAX_BEATS = 24;

const ACTOR_ROLES = new Set(["rayna", "pip", "mama", "daddy", "grandma", "grandpa", "veer", "ishan", "veer-mom", "veer-dad"]);
const TOGETHER_PARTNERS = new Set([...ACTOR_ROLES].filter((role) => role !== "rayna" && role !== "pip"));
const PROP_KINDS = new Set(["heart", "flower", "toy", "picture", "build"]);
const PROP_PLACES = new Set(["ground", "held", "basket", "frame"]);
const EXPRESSIONS = new Set(["idle", "wave", "hop"]);
const MAX_ASSET_BYTES = 2_000_000;
const MAX_ASSET_TOTAL_BYTES = 4_000_000;
const MAX_POSTCARD_BYTES = 4_000_000;
let writeTail = Promise.resolve();
let checkpointWriteTail = writeTail;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value)));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const token = (value, fallback = "") => String(value == null ? fallback : value).replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 180);
const artKey = (value, fallback = "") => String(value == null ? fallback : value).replace(/[^a-zA-Z0-9_:/-]/g, "").slice(0, 180);
const text = (value, max = 180) => String(value == null ? "" : value).slice(0, max);
const clone = (value) => JSON.parse(JSON.stringify(value));

function id(prefix) {
  const suffix = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${suffix}`;
}

function normaliseLayout(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const profile = source.profile === "portrait" ? "portrait" : "landscape";
  return {
    v: PLAY_STAGE_LAYOUT_VERSION,
    profile,
    width: Math.round(clamp(finite(source.width, profile === "portrait" ? 396 : 723), 240, 2048)),
    height: Math.round(clamp(finite(source.height, profile === "portrait" ? 715 : 396), 220, 2048)),
  };
}

function normaliseTogether(raw) {
  const partnerRole = TOGETHER_PARTNERS.has(raw?.partnerRole) ? raw.partnerRole : "";
  return { partnerRole, turn: partnerRole && raw?.turn === "partner" ? "partner" : "rayna" };
}

export function normalisePlayStageParade(raw, actorIds) {
  if (!raw || raw.v !== 1 || !actorIds.has(token(raw.leaderActorId)) || !Array.isArray(raw.route)) return null;
  const route = raw.route.slice(0, PLAY_STAGE_MAX_ROUTE_POINTS).filter((point) => Number.isFinite(Number(point?.u)) && Number.isFinite(Number(point?.v)))
    .map((point) => ({ u: clamp(point.u), v: clamp(point.v) }));
  if (route.length < 2) return null;
  return { v: 1, leaderActorId: token(raw.leaderActorId), route, stopIndex: Math.round(clamp(finite(raw.stopIndex, 0), 0, route.length - 1)), scale: clamp(finite(raw.scale, 1), .8, 1), arranged: raw.arranged !== false,
    ...(raw.formationLayout ? { formationLayout: normaliseLayout(raw.formationLayout) } : {}) };
}

export function normalisePlayStageParadeDraft(raw, actorIds) {
  if (!raw || raw.v !== 1 || !actorIds.has(token(raw.leaderActorId)) || !Array.isArray(raw.route)) return null;
  return { v: 1, leaderActorId: token(raw.leaderActorId), route: raw.route.slice(0, PLAY_STAGE_MAX_ROUTE_POINTS)
    .filter((point) => Number.isFinite(Number(point?.u)) && Number.isFinite(Number(point?.v)))
    .map((point) => ({ u: clamp(point.u), v: clamp(point.v) })) };
}

// Trail choices are owned work, without an actor outcome or an artificial show beat.
export function setPlayStageParadeDraft(raw, draft, at = Date.now()) {
  const scene = normalisePlayStageScene(raw);
  const next = normalisePlayStageParadeDraft({ ...draft, v: 1 }, new Set(scene.actors.map((actor) => actor.id)));
  if (next) scene.paradeDraft = next;
  return normalisePlayStageScene({ ...scene, updatedAt: finite(at, Date.now()) });
}

function normaliseActor(raw, index) {
  if (!raw || !ACTOR_ROLES.has(raw.role)) return null;
  return {
    id: token(raw.id, `actor_${index}`) || `actor_${index}`,
    role: raw.role,
    art: artKey(raw.art),
    u: clamp(finite(raw.u, index ? 0.75 : 0.2)),
    v: clamp(finite(raw.v, 0.55)),
    facing: raw.facing === "left" ? "left" : "right",
    expression: EXPRESSIONS.has(raw.expression) ? raw.expression : "idle",
    hidden: !!raw.hidden,
    peekSide: raw.peekSide === "right" ? "right" : "left",
    z: Math.round(clamp(finite(raw.z, index + 1), 0, 99)),
  };
}

function safePreview(value) { return isLocalPNG(value) && value.length <= MAX_ASSET_BYTES ? value : ""; }

function normaliseSourceSnapshot(raw) {
  if (raw?.kind !== "build-lab" || raw.version !== 1 || !token(raw.id) || !raw.build || typeof raw.build !== "object") return null;
  return { kind: "build-lab", version: 1, id: token(raw.id), build: normalizeBuild(raw.build) };
}

const assetSize = (asset) => asset.png.length + (asset.source ? JSON.stringify(asset.source).length : 0);

function normaliseAsset(raw, index) {
  const png = safePreview(raw?.png || raw?.preview);
  if (!png) return null;
  const source = normaliseSourceSnapshot(raw?.source);
  return {
    id: token(raw?.id, `asset_${index}`) || `asset_${index}`,
    sourceRef: token(raw?.sourceRef),
    png,
    aspect: clamp(finite(raw?.aspect, 1), 0.2, 5),
    sourceHash: token(raw?.sourceHash),
    originalWidth: Math.round(clamp(finite(raw?.originalWidth, 0), 0, 100000)),
    originalHeight: Math.round(clamp(finite(raw?.originalHeight, 0), 0, 100000)),
    previewWidth: Math.round(clamp(finite(raw?.previewWidth, 0), 0, 1024)),
    previewHeight: Math.round(clamp(finite(raw?.previewHeight, 0), 0, 1024)),
    ...(source ? { source } : {}),
  };
}

export function normalisePlayStageBuild(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const mission = discoveryMission(raw.missionId);
  const variation = discoveryVariation(mission, raw.variationId);
  const at = Number(raw.at);
  if (mission?.kind !== "build" || !variation || !Number.isSafeInteger(at) || at <= 0) return null;
  const draft = normalizeDiscoveryDraft({ missionId: mission.id, variationId: variation.id, built: raw.built }, mission.id, variation.id);
  if (!buildIsReady(variation, draft.built)) return null;
  return { missionId: mission.id, variationId: variation.id, built: draft.built.slice(), at };
}

// Inspect every optional anchor before permissive legacy filtering or trimming.
// A future/invalid anchor in an older Undo or recorded frame must not disappear.
function preflightFrameAnchors(raw) {
  const documents=[raw,...(Array.isArray(raw?.history)?raw.history:[]),raw?.performance?.start,
    ...(Array.isArray(raw?.performance?.beats)?raw.performance.beats.map(beat=>beat?.scene):[])];
  for(const document of documents) for(const prop of Array.isArray(document?.props)?document.props:[]) {
    if(!prop || !Object.hasOwn(prop,'frameAnchor'))continue;
    if(!normalizeStageFrameAnchor(prop.frameAnchor))throw Object.assign(new Error('This saved picture display could not open.'),{code:'stage-frame-anchor'});
    if(prop.kind!=='picture' || prop.placement!=='frame' || prop.ownerActorId) {
      throw Object.assign(new Error('This saved picture display could not open. Its original was kept.'),{code:'stage-frame-placement'});
    }
  }
}

function normaliseProp(raw, index, actorIds, assetIds = new Set()) {
  if (!raw || !PROP_KINDS.has(raw.kind)) return null;
  let ownerActorId = token(raw.ownerActorId);
  if (!actorIds.has(ownerActorId)) ownerActorId = "";
  let placement = PROP_PLACES.has(raw.placement) ? raw.placement : "ground";
  if (ownerActorId) placement = "held";
  else if (placement === "held") placement = "ground";
  const assetId = assetIds.has(token(raw.assetId)) ? token(raw.assetId) : "";
  const build = raw.kind === "build" ? normalisePlayStageBuild(raw.build) : null;
  const frameAnchor=normalizeStageFrameAnchor(raw.frameAnchor);
  if ((raw.kind === "picture" && !assetId) || (raw.kind === "build" && (!assetId || !build))) return null;
  return {
    id: token(raw.id, `prop_${index}`) || `prop_${index}`,
    kind: raw.kind,
    art: artKey(raw.art),
    sourceRef: token(raw.sourceRef),
    assetId,
    aspect: clamp(finite(raw.aspect, 1), 0.2, 5),
    u: clamp(finite(raw.u, 0.5)),
    v: clamp(finite(raw.v, 0.7)),
    placement,
    ownerActorId,
    handSocket: ownerActorId && raw.handSocket === "left" ? "left" : "right",
    ...(raw.kind === "picture" && raw.wrapped ? { wrapped: true } : {}),
    ...(raw.kind === "picture" && raw.puppet === true ? { puppet: true } : {}),
    ...(frameAnchor ? { frameAnchor } : {}),
    z: Math.round(clamp(finite(raw.z, index + 20), 0, 99)),
    ...(build ? { build } : {}),
  };
}

function snapshotOf(scene) {
  return {
    actors: clone(scene.actors),
    props: clone(scene.props),
    backdrop: scene.backdrop,
    layout: clone(scene.layout),
    together: clone(scene.together),
    pictureShow: scene.pictureShow ? clone(scene.pictureShow) : null,
    storyDay: scene.storyDay ? clone(scene.storyDay) : null,
    ...(scene.parade ? { parade: clone(scene.parade) } : {}),
    ...(scene.paradeDraft ? { paradeDraft: clone(scene.paradeDraft) } : {}),
  };
}

function referencedAssetIds(document) {
  return new Set([...(document?.props || []).map((prop) => prop.assetId), document?.pictureShow?.signAssetId].filter(Boolean));
}

function performanceAssetIds(performance) {
  return new Set([performance?.start, ...(performance?.beats || []).map((beat) => beat.scene)]
    .flatMap((entry) => [...referencedAssetIds(entry)]));
}

function normalisePerformance(raw, assetIds) {
  if (!raw || raw.v !== 1 || !raw.start || !Array.isArray(raw.beats)) return null;
  const inputs = [raw.start, ...raw.beats.slice(0, PLAY_STAGE_MAX_BEATS).map((beat) => beat?.scene)];
  if (inputs.some((entry) => !Array.isArray(entry?.actors) || !entry.actors.length
    || [...referencedAssetIds(entry)].some((assetId) => !assetIds.has(assetId)))) return null;
  // normaliseHistory is bounded to Undo's 24; performance has a start plus 24 beats.
  const start = normaliseHistory([raw.start], assetIds)[0];
  const beats = raw.beats.slice(0, PLAY_STAGE_MAX_BEATS).map((beat, index) => ({
    type: token(beat?.type).slice(0, 32), actorId: token(beat?.actorId), propId: token(beat?.propId),
    scene: normaliseHistory([inputs[index + 1]], assetIds)[0],
  }));
  if (!start?.actors.length || beats.some((beat) => !beat.scene?.actors.length)) return null;
  return { v: 1, invitationId: ["gift", "parade", "free"].includes(raw.invitationId) ? raw.invitationId : "free", start, beats };
}

export function beginPlayStagePerformance(raw, invitationId = "free") {
  const scene = normalisePlayStageScene(raw);
  scene.performance = { v: 1, invitationId, start: snapshotOf(scene), beats: [] };
  return normalisePlayStageScene(scene);
}

export function recordPlayStageBeat(raw, before, action = {}) {
  const scene = normalisePlayStageScene(raw);
  if (!scene.performance || scene.performance.beats.length >= PLAY_STAGE_MAX_BEATS || action.type === "layout" || action.type==='story-pause') return scene;
  if (['story-begin','story-choice'].includes(action.type) && JSON.stringify([scene.actors,scene.props])===JSON.stringify([before.actors,before.props])) return scene;
  if (action.type !== "hop-actor" && JSON.stringify(snapshotOf(scene)) === JSON.stringify(snapshotOf(normalisePlayStageScene(before)))) return scene;
  scene.performance.beats.push({ type: action.type || "change", actorId: token(action.actorId), propId: token(action.propId), scene: snapshotOf(scene) });
  return normalisePlayStageScene(scene);
}

export function playStagePerformanceFrame(raw, index = -1) {
  const scene = normalisePlayStageScene(raw);
  if (!scene.performance) return null;
  const frame = index < 0 ? scene.performance.start : scene.performance.beats[index]?.scene;
  return frame ? normalisePlayStageScene({ ...scene, ...clone(frame), history: [], performance: null }) : null;
}

// Keep complete snapshots, newest first. An old Undo step can be retired to make
// room, but neither the current scene nor the next Undo step may lose an image.
function compactAssetHistory(scene) {
  const byId = new Map(scene.assets.map((asset) => [asset.id, asset]));
  const required = new Set([...referencedAssetIds(scene), ...performanceAssetIds(scene.performance)]);
  const fits = (ids) => ids.size <= PLAY_STAGE_MAX_ASSETS
    && [...ids].every((assetId) => byId.has(assetId))
    && [...ids].reduce((sum, assetId) => sum + assetSize(byId.get(assetId)), 0) <= MAX_ASSET_TOTAL_BYTES;
  if (!fits(required)) return false;
  const kept = [];
  for (let index = scene.history.length - 1; index >= 0; index--) {
    const candidate = new Set([...required, ...referencedAssetIds(scene.history[index])]);
    if (!fits(candidate)) {
      // Reject a change that would destroy its immediate Undo.
      if (!kept.length) return false;
      break;
    }
    required.clear(); for (const assetId of candidate) required.add(assetId);
    kept.unshift(scene.history[index]);
  }
  scene.history = kept;
  scene.assets = scene.assets.filter((asset) => required.has(asset.id));
  return true;
}

function normaliseHistory(raw, assetIds) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-24).map((entry) => {
    const actors = (Array.isArray(entry?.actors) ? entry.actors : []).slice(0, PLAY_STAGE_MAX_ACTORS)
      .map(normaliseActor).filter(Boolean);
    const ids = new Set(actors.map((actor) => actor.id));
    const props = (Array.isArray(entry?.props) ? entry.props : []).slice(0, PLAY_STAGE_MAX_PROPS)
      .map((prop, i) => normaliseProp(prop, i, ids, assetIds)).filter(Boolean);
    const parade = normalisePlayStageParade(entry?.parade, ids);
    const paradeDraft = normalisePlayStageParadeDraft(entry?.paradeDraft, ids);
    return { actors, props, backdrop: token(entry?.backdrop, "outdoor") || "outdoor", layout: normaliseLayout(entry?.layout), together: normaliseTogether(entry?.together), pictureShow: normalizePictureShowSnapshot(entry?.pictureShow, assetIds), storyDay: normalizeStageStoryDay(entry?.storyDay), parade, paradeDraft };
  });
}

export function blankPlayStageScene(options = {}) {
  return normalisePlayStageScene({
    id: options.id || id("scene"),
    backdrop: "outdoor",
    actors: [
      { id: "rayna", role: "rayna", art: "characters/family_child1_idle", u: 0.2, v: 0.55, facing: "right", z: 1 },
      { id: "pip", role: "pip", art: "characters/pip_idle", u: 0.75, v: 0.55, facing: "left", z: 2 },
    ],
    props: [
      { id: "heart", kind: "heart", art: "stickers/draw_heart", u: 0.45, v: 0.82, placement: "ground", z: 20 },
    ],
    layout: options.layout,
    updatedAt: options.updatedAt || Date.now(),
  });
}

export function normalisePlayStageScene(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  preflightFrameAnchors(source);
  const actors = [];
  const actorIds = new Set();
  for (const [index, candidate] of (Array.isArray(source.actors) ? source.actors : []).slice(0, PLAY_STAGE_MAX_ACTORS).entries()) {
    const actor = normaliseActor(candidate, index);
    if (!actor || actorIds.has(actor.id)) continue;
    actors.push(actor); actorIds.add(actor.id);
  }
  if (!actors.length) return blankPlayStageScene({ id: token(source.id) || id("scene"), layout: source.layout });
  const assets = [];
  const assetIds = new Set();
  let assetBytes = 0;
  for (const [index, candidate] of (Array.isArray(source.assets) ? source.assets : []).slice(0, PLAY_STAGE_MAX_ASSETS).entries()) {
    const asset = normaliseAsset(candidate, index);
    if (!asset || assetIds.has(asset.id) || assetBytes + assetSize(asset) > MAX_ASSET_TOTAL_BYTES) continue;
    assets.push(asset); assetIds.add(asset.id); assetBytes += assetSize(asset);
  }
  // Backward-compatible migration: older drafts placed the embedded PNG on the prop.
  const propInputs = (Array.isArray(source.props) ? source.props : []).map((candidate) => ({ ...(candidate || {}) }));
  for (const candidate of propInputs) {
    const png = safePreview(candidate?.preview);
    if (!png || assetBytes + png.length > MAX_ASSET_TOTAL_BYTES || assets.length >= PLAY_STAGE_MAX_ASSETS) continue;
    let asset = assets.find((item) => item.png === png);
    if (!asset) {
      let assetId = token(candidate.assetId, `asset_${assets.length}`) || `asset_${assets.length}`;
      while (assetIds.has(assetId)) assetId = `${assetId}_${assets.length}`;
      asset = normaliseAsset({ id: assetId, sourceRef: candidate.sourceRef, png, aspect: candidate.aspect, sourceHash: candidate.sourceHash, originalWidth: candidate.originalWidth, originalHeight: candidate.originalHeight, previewWidth: candidate.previewWidth, previewHeight: candidate.previewHeight }, assets.length);
      assets.push(asset); assetIds.add(asset.id); assetBytes += png.length;
    }
    candidate.assetId = asset.id;
  }
  const props = [];
  const propIds = new Set();
  for (const [index, candidate] of propInputs.slice(0, PLAY_STAGE_MAX_PROPS).entries()) {
    const prop = normaliseProp(candidate, index, actorIds, assetIds);
    if (!prop || propIds.has(prop.id)) continue;
    props.push(prop); propIds.add(prop.id);
  }
  const performance = normalisePerformance(source.performance, assetIds);
  const parade = normalisePlayStageParade(source.parade, actorIds);
  const paradeDraft = normalisePlayStageParadeDraft(source.paradeDraft, actorIds);
  const pictureShow = normalizePictureShowSnapshot(source.pictureShow, assetIds);
  const storyDay = normalizeStageStoryDay(source.storyDay);
  return {
    v: PLAY_STAGE_VERSION,
    id: token(source.id, id("scene")) || id("scene"),
    remixOf: token(source.remixOf),
    backdrop: token(source.backdrop, "outdoor") || "outdoor",
    actors,
    props,
    assets,
    layout: normaliseLayout(source.layout),
    together: normaliseTogether(source.together),
    history: normaliseHistory(source.history, assetIds),
    ...(performance ? { performance } : {}),
    ...(parade ? { parade } : {}),
    ...(paradeDraft ? { paradeDraft } : {}),
    ...(pictureShow ? { pictureShow } : {}),
    ...(storyDay ? { storyDay } : {}),
    updatedAt: Math.max(0, finite(source.updatedAt, Date.now())),
  };
}

export function playStageCanUndo(raw) { return normalisePlayStageScene(raw).history.length > 0; }

export function applyPlayStageAction(raw, action = {}, at = Date.now()) {
  const scene = normalisePlayStageScene(raw);
  const before = snapshotOf(scene);
  const type = text(action.type, 32);
  let changed = false;
  const actor = scene.actors.find((item) => item.id === token(action.actorId || action.id));
  const prop = scene.props.find((item) => item.id === token(action.propId || action.id));

  // Rotation changes only the view. A later deliberate edit can adopt that
  // visible arrangement as part of the same reversible child action.
  if (scene.parade && type !== "parade-stop" && type !== "layout" && Array.isArray(action.adoptPositions)
    && action.adoptPositions.length === scene.actors.length && new Set(action.adoptPositions.map((item) => token(item.actorId))).size === scene.actors.length
    && action.adoptPositions.every((item) => scene.actors.some((existing) => existing.id === token(item.actorId)) && Number.isFinite(Number(item.u)) && Number.isFinite(Number(item.v)))) {
    for (const existing of scene.actors) { const position = action.adoptPositions.find((item) => token(item.actorId) === existing.id); existing.u = clamp(position.u); existing.v = clamp(position.v); }
    scene.parade.arranged = false;
  }

  if (['story-begin','story-choice','story-pause'].includes(type)) {
    changed=applyStageStoryAction(scene,action) && JSON.stringify(snapshotOf(scene))!==JSON.stringify(before);
  } else if (type === "picture-show") {
    const incoming = normalizePictureShowSource(action.show);
    if (scene.pictureShow && !action.replaceShow) return normalisePlayStageScene(raw);
    const replacement = scene.props.find(item => item.id === token(action.replacePropId));
    if (scene.props.length >= PLAY_STAGE_MAX_PROPS && !replacement) return normalisePlayStageScene(raw);
    let asset = scene.assets.find(item => item.png === incoming.sign.png && item.sourceRef === incoming.sign.sourceRef);
    if (!asset) {
      asset = normaliseAsset({ id: id('show_asset'), sourceRef: incoming.sign.sourceRef, png: incoming.sign.png, aspect: incoming.sign.aspect }, scene.assets.length);
      if (!asset) return normalisePlayStageScene(raw);
      scene.assets.push(asset);
    }
    const next = normaliseProp({ id: token(action.propId) || id('show_picture'), kind: 'picture', assetId: asset.id, sourceRef: incoming.sign.sourceRef,
      aspect: incoming.sign.aspect, placement: 'ground', u: finite(action.u, .5), v: finite(action.v, .72), z: 40 }, scene.props.length,
      new Set(scene.actors.map(item => item.id)), new Set(scene.assets.map(item => item.id)));
    if (!next || scene.props.some(item => item.id === next.id && item !== replacement)) return normalisePlayStageScene(raw);
    if (replacement) scene.props[scene.props.indexOf(replacement)] = next; else scene.props.push(next);
    scene.pictureShow = normalizePictureShowSnapshot({ ...incoming, signAssetId: asset.id, propId: next.id }, new Set(scene.assets.map(item => item.id)));
    changed = true;
  } else if (type === "picture-show-performed" && scene.pictureShow && actor) {
    scene.pictureShow = { ...scene.pictureShow, performed: { at: Math.max(1, Math.round(finite(at, Date.now()))), performerActorId: actor.id } };
    changed = true;
  } else if (type === "move-actor" && actor && !actor.hidden) {
    const u = clamp(finite(action.u, actor.u)); const v = clamp(finite(action.v, actor.v));
    changed = actor.u !== u || actor.v !== v;
    if (changed) { actor.facing = u < actor.u ? "left" : "right"; actor.u = u; actor.v = v; actor.z = 50 + scene.actors.length; }
  } else if (type === "parade-stop") {
    const parade = normalisePlayStageParade(action.parade, new Set(scene.actors.map((item) => item.id)));
    const positions = Array.isArray(action.positions) ? action.positions : [];
    if (parade && positions.length === scene.actors.length && new Set(positions.map((item) => token(item.actorId))).size === scene.actors.length
      && positions.every((item) => scene.actors.some((existing) => existing.id === token(item.actorId)) && Number.isFinite(Number(item.u)) && Number.isFinite(Number(item.v)))) {
      for (const existing of scene.actors) {
        const position = positions.find((item) => token(item.actorId) === existing.id);
        existing.facing = position.facing === "left" ? "left" : "right"; existing.u = clamp(position.u); existing.v = clamp(position.v); existing.hidden = false;
      }
      scene.parade = parade;
      delete scene.paradeDraft;
      changed = JSON.stringify(snapshotOf(scene)) !== JSON.stringify(before);
    }
  } else if (type === "hide-actor" && actor && !actor.hidden) {
    actor.hidden = true; actor.peekSide = action.peekSide === "right" ? "right" : "left"; changed = true;
  } else if (type === "reveal-actor" && actor && actor.hidden) {
    actor.hidden = false; changed = true;
  } else if (type === "express" && actor) {
    const next = EXPRESSIONS.has(action.expression) ? action.expression : (actor.expression === "wave" ? "hop" : "wave");
    changed = next !== actor.expression; actor.expression = next;
  } else if (type === "wrap-prop" && prop?.kind === "picture" && !prop.wrapped) {
    prop.wrapped = true; changed = true;
  } else if (type === "unwrap-prop" && prop?.kind === "picture" && prop.wrapped) {
    delete prop.wrapped; changed = true;
  } else if (type === "move-prop" && prop) {
    const u = clamp(finite(action.u, prop.u)); const v = clamp(finite(action.v, prop.v));
    changed = prop.u !== u || prop.v !== v || prop.ownerActorId || prop.placement !== "ground";
    prop.u = u; prop.v = v; prop.ownerActorId = ""; prop.placement = "ground"; prop.z = 80; delete prop.frameAnchor;
  } else if (type === "give-prop" && prop && actor && (actor.role !== "ishan" || prop.kind === "toy" || prop.kind === "build")) {
    const displaced = scene.props.filter((item) => item.id !== prop.id && item.ownerActorId === actor.id);
    changed = prop.ownerActorId !== actor.id || prop.placement !== "held" || displaced.length > 0;
    for (const item of displaced) {
      item.ownerActorId = ""; item.placement = "ground"; item.u = actor.u; item.v = actor.v;
    }
    prop.ownerActorId = actor.id; prop.placement = "held"; prop.handSocket = action.handSocket === "left" ? "left" : "right"; delete prop.frameAnchor;
  } else if (type === "place-prop" && prop && ["basket", "frame", "ground"].includes(action.placement)) {
    const anchor=action.placement==='frame' && prop.kind==='picture' ? action.frameAnchor===undefined ? prop.frameAnchor : normalizeStageFrameAnchor(action.frameAnchor) : null;
    changed = prop.ownerActorId || prop.placement !== action.placement || JSON.stringify(prop.frameAnchor || null)!==JSON.stringify(anchor || null);
    prop.ownerActorId = ""; prop.placement = action.placement;
    if(anchor)prop.frameAnchor=anchor;else delete prop.frameAnchor;
    if (action.placement === "ground") { prop.u = clamp(finite(action.u, prop.u)); prop.v = clamp(finite(action.v, prop.v)); }
  } else if (type === "add-actor") {
    const next = normaliseActor(action.actor, scene.actors.length);
    if (next && scene.actors.length < PLAY_STAGE_MAX_ACTORS && !scene.actors.some((item) => item.id === next.id || item.role === next.role)) {
      scene.actors.push(next); changed = true;
    }
  } else if (type === "swap-actor") {
    const next = normaliseActor(action.actor, scene.actors.length);
    const replaceId = token(action.replaceId);
    const index = scene.actors.findIndex((item) => item.id === replaceId);
    if (next && index >= 0 && !scene.actors.some((item, i) => i !== index && (item.id === next.id || item.role === next.role))) {
      for (const item of scene.props) if (item.ownerActorId === replaceId) { item.ownerActorId = ""; item.placement = "ground"; }
      scene.actors[index] = next; changed = true;
    }
  } else if (type === "add-prop") {
    if (action.prop?.preview && !action.prop.assetId) {
      const png = safePreview(action.prop.preview);
      if (png) {
        const source = normaliseSourceSnapshot(action.prop.sourceSnapshot);
        const existing = scene.assets.find((asset) => asset.png === png && JSON.stringify(asset.source || null) === JSON.stringify(source));
        if (existing) action.prop.assetId = existing.id;
        else {
          const nextAsset = normaliseAsset({ id: id("asset"), sourceRef: action.prop.sourceRef, source: action.prop.sourceSnapshot, png, aspect: action.prop.aspect, sourceHash: action.prop.sourceHash, originalWidth: action.prop.originalWidth, originalHeight: action.prop.originalHeight, previewWidth: action.prop.previewWidth, previewHeight: action.prop.previewHeight }, scene.assets.length);
          if (nextAsset) { scene.assets.push(nextAsset); action.prop.assetId = nextAsset.id; }
        }
      }
    }
    const ids = new Set(scene.actors.map((item) => item.id));
    const next = normaliseProp(action.prop, scene.props.length, ids, new Set(scene.assets.map((asset) => asset.id)));
    if (next && scene.props.length < PLAY_STAGE_MAX_PROPS && !scene.props.some((item) => item.id === next.id)) { scene.props.push(next); changed = true; }
  } else if (type === "swap-prop") {
    if (action.prop?.preview && !action.prop.assetId) {
      const png = safePreview(action.prop.preview);
      if (png) {
        const source = normaliseSourceSnapshot(action.prop.sourceSnapshot);
        const existing = scene.assets.find((asset) => asset.png === png && JSON.stringify(asset.source || null) === JSON.stringify(source));
        if (existing) action.prop.assetId = existing.id;
        else { const nextAsset = normaliseAsset({ id: id("asset"), sourceRef: action.prop.sourceRef, source: action.prop.sourceSnapshot, png, aspect: action.prop.aspect, sourceHash: action.prop.sourceHash, originalWidth: action.prop.originalWidth, originalHeight: action.prop.originalHeight, previewWidth: action.prop.previewWidth, previewHeight: action.prop.previewHeight }, scene.assets.length); if (nextAsset) { scene.assets.push(nextAsset); action.prop.assetId = nextAsset.id; } }
      }
    }
    const ids = new Set(scene.actors.map((item) => item.id));
    const next = normaliseProp(action.prop, scene.props.length, ids, new Set(scene.assets.map((asset) => asset.id)));
    const index = scene.props.findIndex((item) => item.id === token(action.replaceId));
    if (next && index >= 0 && !scene.props.some((item, i) => i !== index && item.id === next.id)) { scene.props[index] = next; changed = true; }
  } else if (type === "remove-prop" && prop) {
    scene.props = scene.props.filter((item) => item.id !== prop.id); changed = true;
  } else if (type === "together-select" && TOGETHER_PARTNERS.has(action.partnerRole)) {
    changed = scene.together.partnerRole !== action.partnerRole || scene.together.turn !== "rayna";
    scene.together = { partnerRole: action.partnerRole, turn: "rayna" };
  } else if (type === "together-turn" && scene.together.partnerRole && ["rayna", "partner"].includes(action.turn)) {
    changed = scene.together.turn !== action.turn;
    scene.together.turn = action.turn;
  } else if (type === "together-solo" && scene.together.partnerRole) {
    changed = true;
    scene.together = { partnerRole: "", turn: "rayna" };
  } else if (type === "layout") {
    const next = normaliseLayout(action.layout);
    changed = JSON.stringify(next) !== JSON.stringify(scene.layout); scene.layout = next;
  }

  if (!changed) return normalisePlayStageScene(raw);
  // A free-play edit can settle the premise itself. Keep its story and Undo,
  // but stop offering a choice whose pictured circumstances are no longer true.
  if (!type.startsWith('story-') && scene.storyDay?.phase==='waiting' && !stageStoryStillWaiting(scene)) scene.storyDay.phase='free';
  if (scene.parade && ["move-actor", "hide-actor", "reveal-actor", "add-actor", "swap-actor"].includes(type)) scene.parade.arranged = false;
  if (scene.parade && !scene.actors.some((item) => item.id === scene.parade.leaderActorId)) scene.parade.leaderActorId = scene.actors[0].id;
  if (scene.paradeDraft && !scene.actors.some((item) => item.id === scene.paradeDraft.leaderActorId)) scene.paradeDraft.leaderActorId = scene.actors[0].id;
  if (type !== "layout") scene.history = [...scene.history, before].slice(-24);
  if (!compactAssetHistory(scene)) return normalisePlayStageScene(raw);
  scene.updatedAt = finite(at, Date.now());
  return normalisePlayStageScene(scene);
}

export function undoPlayStage(raw, at = Date.now()) {
  const scene = normalisePlayStageScene(raw);
  const previous = scene.history.pop();
  if (!previous) return scene;
  const restored = { ...scene, ...previous, history: scene.history, updatedAt: finite(at, Date.now()) };
  compactAssetHistory(restored);
  return normalisePlayStageScene(restored);
}

function enqueue(work) {
  const next = writeTail.then(work, work);
  checkpointWriteTail = next;
  writeTail = next.catch(() => undefined);
  return next;
}

export function savePlayStageCurrent(raw) {
  const scene = normalisePlayStageScene({ ...raw, updatedAt: Date.now() });
  return enqueue(() => db.put("kv", PLAY_STAGE_CURRENT_KEY, scene)).then(() => clone(scene));
}

export async function loadPlayStageCurrent() {
  await writeTail;
  const value = await db.getStrict("kv", PLAY_STAGE_CURRENT_KEY);
  return requireOwnedStageScene(value);
}

export function clearPlayStageState() {
  return enqueue(async () => {
    await db.del("kv", PLAY_STAGE_CURRENT_KEY);
    const rows = await db.entries("gallery");
    for (const [key, row] of rows) if (row?.kind === PLAY_STAGE_POSTCARD_KIND) await db.del("gallery", key);
    return true;
  });
}

function postcardKey(at) { return `${today()}_play-stage_${at}_${id("card").slice(-8)}`; }
export function availableStagePostcardKey(base, occupied) {
  const keys = new Set(occupied);
  if (!keys.has(base)) return base;
  for (let n = 1; n <= 1000; n++) {
    const candidate = `${base}_v${n}`;
    if (!keys.has(candidate)) return candidate;
  }
  throw new PlayStagePostcardFullError();
}

function postcardSignature(raw) {
  const scene = normalisePlayStageScene(raw);
  // Keep owns the complete editable room, including Undo-only originals. Two
  // identical-looking pictures cannot replace different captured child work.
  const { id: _id, remixOf: _remix, updatedAt: _at, ...content } = scene;
  return JSON.stringify(content);
}

export class PlayStagePostcardFullError extends Error {
  constructor() { super("Your story shelf is full. Your current scene is still here."); this.code = "PLAY_STAGE_POSTCARD_FULL"; }
}

export function savePlayStagePostcard(raw, png, viewport = {}) {
  const scene = normalisePlayStageScene(raw);
  if (!isLocalPNG(png) || png.length > MAX_POSTCARD_BYTES) return Promise.resolve(null);
  const at = Date.now();
  const key = postcardKey(at);
  const row = {
    id: "play-stage",
    kind: PLAY_STAGE_POSTCARD_KIND,
    day: today(),
    at,
    png,
    scene: clone(scene),
    viewport: normaliseLayout(viewport),
  };
  return enqueue(async () => {
    const allRows = await db.entriesStrict("gallery");
    const existing = allRows.filter(([, value]) => normalisePlayStagePostcard(value));
    const signature = postcardSignature(scene);
    const same = existing.find(([, value]) => value.png === png && postcardSignature(value.scene) === signature);
    if (same) return { key: same[0], row: clone(same[1]), reused: true };
    if (existing.length >= PLAY_STAGE_MAX_POSTCARDS) throw new PlayStagePostcardFullError();
    const availableKey = availableStagePostcardKey(key, allRows.map(([storedKey]) => storedKey));
    await db.put("gallery", availableKey, row);
    return { key: availableKey, row: clone(row) };
  });
}

export function normaliseStoredPlayStageScene(raw) {
  preflightFrameAnchors(raw);
  if (!raw || raw.v !== PLAY_STAGE_VERSION || !token(raw.id) || !Array.isArray(raw.actors) || !raw.actors.length) return null;
  const hasValidRawActor = raw.actors.some((actor) => actor && ACTOR_ROLES.has(actor.role) && token(actor.id));
  if (!hasValidRawActor) return null;
  const rawAssetRows = Array.isArray(raw.assets) ? raw.assets : [];
  const rawAssets = new Set(rawAssetRows.filter((asset) => asset && token(asset.id) && safePreview(asset.png || asset.preview)).map((asset) => token(asset.id)));
  const referenced = (document) => {
    try { normalizePictureShowSnapshot(document?.pictureShow, rawAssets); } catch { return true; }
    return (Array.isArray(document?.props) ? document.props : []).some((prop) => {
    if (prop?.kind !== "picture" && prop?.kind !== "build") return false;
    if (prop.kind === "build" && !normalisePlayStageBuild(prop.build)) return true;
    return !safePreview(prop.preview) && (!token(prop.assetId) || !rawAssets.has(token(prop.assetId)));
    });
  };
  if (referenced(raw) || (Array.isArray(raw.history) ? raw.history : []).some(referenced)
    || (raw.performance && [raw.performance.start, ...(Array.isArray(raw.performance.beats) ? raw.performance.beats.map((beat) => beat.scene) : [])].some(referenced))) return null;
  if (rawAssetRows.length > PLAY_STAGE_MAX_ASSETS || rawAssetRows.reduce((sum, asset) => sum + String(asset?.png || asset?.preview || "").length + (asset?.source ? JSON.stringify(asset.source).length : 0), 0) > MAX_ASSET_TOTAL_BYTES) return null;
  const scene = normalisePlayStageScene(raw);
  return scene.actors.length ? scene : null;
}

/** An owned room must never become a blank room because it could not be read.
 * The permissive normalizer remains available for filtering unowned picker rows. */
export function requireStoredPlayStageScene(raw) {
  if (raw == null) return null;
  const scene = normaliseStoredPlayStageScene(raw);
  if (scene) return scene;
  const code = raw.v !== PLAY_STAGE_VERSION ? 'play-stage-version' : 'play-stage-invalid';
  throw Object.assign(new Error('This saved Theater room could not open. The original is still stored; keep this page open and ask a grown-up to help.'), { code });
}

export function requireOwnedStageScene(raw) {
  if (raw == null) return null;
  const scene = requireStoredPlayStageScene(raw);
  if (scene.actors.length !== raw.actors.length
    || raw.props != null && (!Array.isArray(raw.props) || scene.props.length !== raw.props.length)
    || raw.assets != null && (!Array.isArray(raw.assets) || scene.assets.length < raw.assets.length)
    || raw.history != null && (!Array.isArray(raw.history) || scene.history.length !== raw.history.length)
    || (raw.history || []).some((entry, i) => !Array.isArray(entry?.actors) || !entry.actors.length
      || entry.actors.length !== scene.history[i].actors.length
      || entry.props != null && (!Array.isArray(entry.props) || entry.props.length !== scene.history[i].props.length))) {
    throw Object.assign(new Error('This saved Theater room has retained work this version cannot safely open.'), { code: 'play-stage-invalid' });
  }
  return scene;
}

export function normalisePlayStagePostcard(raw, key = "") {
  if (!raw || raw.kind !== PLAY_STAGE_POSTCARD_KIND || !isLocalPNG(raw.png) || raw.png.length > MAX_POSTCARD_BYTES) return null;
  const scene = normaliseStoredPlayStageScene(raw.scene);
  if (!scene) return null;
  return {
    key: token(key || raw.key),
    id: "play-stage",
    kind: PLAY_STAGE_POSTCARD_KIND,
    day: text(raw.day, 16),
    at: Math.max(0, finite(raw.at)),
    png: raw.png,
    scene,
    viewport: normaliseLayout(raw.viewport),
  };
}

export async function listPlayStagePostcards({ offset = 0, limit = PLAY_STAGE_MAX_POSTCARDS } = {}) {
  await writeTail;
  const start = Math.max(0, Math.floor(finite(offset)));
  const count = Math.round(clamp(finite(limit, PLAY_STAGE_MAX_POSTCARDS), 1, PLAY_STAGE_MAX_POSTCARDS));
  return (await gallery.listChecked()).map((row) => normalisePlayStagePostcard(row, row.key)).filter(Boolean).slice(start, start + count);
}

export async function loadPlayStagePostcard(key) {
  await writeTail;
  const row = await db.getStrict("gallery", token(key));
  return normalisePlayStagePostcard(row, key);
}

export async function reopenPlayStagePostcard(key, { accept = () => true } = {}) {
  const card = await loadPlayStagePostcard(key);
  // A retired route's late read must not enqueue a replacement over newer play.
  if (!card || !accept()) return null;
  const scene = normalisePlayStageScene({ ...card.scene, id: id("scene"), remixOf: card.key, history: [], updatedAt: Date.now() });
  await savePlayStageCurrent(scene);
  return scene;
}

export function normalisePlayStageSources(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row || !isLocalPNG(row.png) || !token(row.key)) return false;
    return row.kind === "studio" || row.kind === "family-mural" || row.kind === "picture-post" || row.kind === "build-lab" || (!row.kind && Array.isArray(row.strokes));
  }).slice(0, 24).map((row) => ({ key: token(row.key), png: row.png, at: finite(row.at), kind: row.kind || "drawing", label: row.kind === "build-lab" ? "my bridge" : row.kind === "picture-post" ? "picture message" : "my picture", aspect: clamp(finite(row.aspect, 1), 0.2, 5), ...(normaliseSourceSnapshot(row.source) ? { sourceSnapshot: normaliseSourceSnapshot(row.source) } : {}) }));
}

export async function listPlayStageSources() { return normalisePlayStageSources(await gallery.listChecked()); }
export function flushPlayStageWrites() { return writeTail; }
export function flushPlayStageCheckpointWrites() { return checkpointWriteTail; }

export default {
  blankPlayStageScene, normalisePlayStageScene, normalisePlayStageBuild, applyPlayStageAction, undoPlayStage,
  playStageCanUndo, savePlayStageCurrent, loadPlayStageCurrent, clearPlayStageState,
  savePlayStagePostcard, listPlayStagePostcards, loadPlayStagePostcard, reopenPlayStagePostcard,
  normalisePlayStageSources, listPlayStageSources, flushPlayStageWrites, flushPlayStageCheckpointWrites,
  normaliseStoredPlayStageScene, normalisePlayStagePostcard,
  beginPlayStagePerformance, recordPlayStageBeat, playStagePerformanceFrame,
  normalisePlayStageParade,
  normalisePlayStageParadeDraft, setPlayStageParadeDraft,
};
