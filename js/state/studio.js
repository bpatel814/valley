// Durable, editable documents for Open Rainbow Studio.
// Writes share one queue so an older autosave can never revive a cleared draft.
import db from "./db.js";
import { today } from "./session.js";
import { STUDIO_COLOR_BY_ID, STUDIO_STAMP_BY_ID } from "../data/studio.js";

export const STUDIO_DOCUMENT_VERSION = 1;
export const STUDIO_DRAFT_KEY = "studio:draft:v1";

export const MAX_STROKES = 512;
export const MAX_STUDIO_BYTES = 64 * 1024 * 1024;
const capacityError = () => Object.assign(new Error("This picture is too large to save. Earlier pictures were kept."), { code: "studio-capacity" });
const MAX_STAMPS = 200;
export const MAX_POINTS = 8192;
const MAX_ACTIONS = MAX_STROKES + MAX_STAMPS;
let writeTail = Promise.resolve();

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const token = (value, fallback = "") => String(value == null ? fallback : value).replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 96);

function copyPoint(point) {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  return {
    x: Number(point.x),
    y: Number(point.y),
    p: clamp(finite(point.p, 0.5), 0, 1),
    t: Math.max(0, finite(point.t, 0)),
  };
}

function copyStroke(stroke, index) {
  if (!stroke || !Array.isArray(stroke.points)) return null;
  const points = stroke.points.map(copyPoint).filter(Boolean);
  if (!points.length) return null;
  const color = /^#[0-9a-f]{6}$/i.test(String(stroke.color || ""))
    ? String(stroke.color).toLowerCase()
    : (STUDIO_COLOR_BY_ID.berry && STUDIO_COLOR_BY_ID.berry.value) || "#f2799b";
  return {
    id: token(stroke.id, `stroke_${index}`) || `stroke_${index}`,
    color,
    brush: ["marker", "crayon", "solid"].includes(stroke.brush) ? stroke.brush : "marker",
    width: clamp(finite(stroke.width, 0.022), 0.005, 0.09),
    points,
  };
}

function copyStamp(stamp, index) {
  if (!stamp || !STUDIO_STAMP_BY_ID[stamp.stamp]) return null;
  return {
    id: token(stamp.id, `stamp_${index}`) || `stamp_${index}`,
    stamp: stamp.stamp,
    x: clamp(stamp.x, 0, 1),
    y: clamp(stamp.y, 0, 1),
    size: clamp(finite(stamp.size, 0.2), 0.06, 0.5),
    rotation: clamp(finite(stamp.rotation, 0), -180, 180),
  };
}

export function blankStudioDocument(options = {}) {
  return {
    v: STUDIO_DOCUMENT_VERSION,
    strokes: [],
    stamps: [],
    actions: [],
    remixOf: token(options.remixOf),
    aspect: clamp(finite(options.aspect, 1), 0.45, 2.5),
    updatedAt: finite(options.updatedAt, Date.now()),
  };
}

export function normaliseStudioDocument(input) {
  const source = input && typeof input === "object" ? input : {};
  if (source.v != null && source.v !== STUDIO_DOCUMENT_VERSION) throw Object.assign(new Error("This picture version cannot be opened. Earlier pictures were kept."), { code: "studio-version" });
  if ((source.strokes?.length || 0) > MAX_STROKES || (source.stamps?.length || 0) > MAX_STAMPS || (source.actions?.length || 0) > MAX_ACTIONS || (Array.isArray(source.strokes) && source.strokes.some(stroke => Array.isArray(stroke?.points) && stroke.points.length > MAX_POINTS))) throw capacityError();
  const document = blankStudioDocument(source);
  const used = new Set();
  const unique = (item) => {
    if (!item || used.has(item.id)) return false;
    used.add(item.id);
    return true;
  };
  document.strokes = (Array.isArray(source.strokes) ? source.strokes : [])
    .map(copyStroke).filter(unique);
  document.stamps = (Array.isArray(source.stamps) ? source.stamps : [])
    .map(copyStamp).filter(unique);

  const entities = new Map([
    ...document.strokes.map((item) => [item.id, "stroke"]),
    ...document.stamps.map((item) => [item.id, "stamp"]),
  ]);
  const ordered = [];
  const actionIds = new Set();
  for (const action of (Array.isArray(source.actions) ? source.actions : [])) {
    const id = token(action && action.id);
    const kind = action && action.kind;
    if (!id || actionIds.has(id) || entities.get(id) !== kind) continue;
    actionIds.add(id);
    ordered.push({ kind, id });
  }
  for (const stroke of document.strokes) if (!actionIds.has(stroke.id)) ordered.push({ kind: "stroke", id: stroke.id });
  for (const stamp of document.stamps) if (!actionIds.has(stamp.id)) ordered.push({ kind: "stamp", id: stamp.id });
  document.actions = ordered;
  document.updatedAt = finite(source.updatedAt, Date.now());
  if (new TextEncoder().encode(JSON.stringify(document)).byteLength > MAX_STUDIO_BYTES) throw capacityError();
  return document;
}

export function studioHasContent(document) {
  const clean = normaliseStudioDocument(document);
  return clean.strokes.length > 0 || clean.stamps.length > 0;
}

export function undoStudioDocument(input) {
  const document = normaliseStudioDocument(input);
  const action = document.actions.pop();
  if (!action) return document;
  if (action.kind === "stroke") document.strokes = document.strokes.filter((item) => item.id !== action.id);
  if (action.kind === "stamp") document.stamps = document.stamps.filter((item) => item.id !== action.id);
  document.updatedAt = Date.now();
  return document;
}

function enqueue(work) {
  const next = writeTail.then(work, work);
  writeTail = next.catch(() => undefined);
  return next;
}

export function saveStudioDraft(input) {
  const document = normaliseStudioDocument({ ...input, updatedAt: Date.now() });
  return enqueue(() => db.put("kv", STUDIO_DRAFT_KEY, document)).then(() => document);
}

export function clearStudioDraft() {
  return enqueue(() => db.del("kv", STUDIO_DRAFT_KEY));
}

export async function loadStudioDraft({ io = db } = {}) {
  await writeTail;
  const saved = await (io.getStrict || io.get)("kv", STUDIO_DRAFT_KEY);
  return saved ? normaliseStudioDocument(saved) : null;
}

function pictureKey(at) {
  const random = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${today()}_studio_${at}_${random}`;
}

export function saveStudioPicture(input, png, metadata = {}) {
  const document = normaliseStudioDocument({ ...input, updatedAt: Date.now() });
  if (!studioHasContent(document)) return Promise.resolve(null);
  const at = Date.now();
  const key = pictureKey(at);
  const row = {
    id: "studio",
    kind: "studio",
    day: today(),
    at,
    png: typeof png === "string" ? png : "",
    strokes: document.strokes,
    stamps: document.stamps,
    document,
    remixOf: token(metadata.remixOf || document.remixOf),
  };
  return enqueue(async () => {
    await db.put("gallery", key, row);
    await db.del("kv", STUDIO_DRAFT_KEY);
    return { key, row };
  });
}

export async function listStudioPictures({ io = db } = {}) {
  await writeTail;
  const rows = await (io.entriesStrict || io.entries)("gallery");
  return rows
    .filter(([, row]) => row && (row.kind === "studio" || (row.id === "studio" && row.document)))
    .map(([key, row]) => ({ key: String(key), ...row, document: normaliseStudioDocument(row.document || row) }))
    .sort((a, b) => finite(b.at) - finite(a.at));
}

export async function loadStudioPicture(key, { io = db } = {}) {
  await writeTail;
  const row = await (io.getStrict || io.get)("gallery", String(key || ""));
  if (!row || !(row.kind === "studio" || row.id === "studio")) return null;
  return { key: String(key), ...row, document: normaliseStudioDocument(row.document || row) };
}

export function flushStudioWrites() { return writeTail; }

export default {
  blankStudioDocument,
  normaliseStudioDocument,
  studioHasContent,
  undoStudioDocument,
  saveStudioDraft,
  loadStudioDraft,
  clearStudioDraft,
  saveStudioPicture,
  listStudioPictures,
  loadStudioPicture,
  flushStudioWrites,
};
