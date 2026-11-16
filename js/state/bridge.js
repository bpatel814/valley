// Durable Rainbow Bridge keepsakes. Every intentional saved picture keeps the
// child's actual ink, even when a guided mark does not complete the model path.
import db from "./db.js";
import { today } from "./session.js";
import { drawingById } from "../data/drawings.js";

let writeTail = Promise.resolve();
export const BRIDGE_DRAFTS_KEY = "bridgeDraftsV1";
export const MAX_BRIDGE_STROKES = 512;
export const MAX_BRIDGE_POINTS = 8192;
export const MAX_BRIDGE_BYTES = 64 * 1024 * 1024;

function capacityError() {
  return Object.assign(new Error("This drawing is too large to save. Earlier drawings were kept."), { code: "bridge-capacity" });
}
function withinCapacity(value) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BRIDGE_BYTES) throw capacityError();
  return value;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
const token = (value, max = 120) => String(value == null ? "" : value)
  .replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, max);

function copyPoint(point) {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  return {
    x: Number(point.x),
    y: Number(point.y),
    p: clamp(Number.isFinite(Number(point.p)) ? point.p : 0.5, 0, 1),
    t: Math.max(0, Number.isFinite(Number(point.t)) ? Number(point.t) : 0),
  };
}

export function normaliseBridgeStrokes(strokes) {
  if (Array.isArray(strokes) && (strokes.length > MAX_BRIDGE_STROKES || strokes.some(stroke => Array.isArray(stroke) && stroke.length > MAX_BRIDGE_POINTS))) throw capacityError();
  return (Array.isArray(strokes) ? strokes : [])
    .map((stroke) => (Array.isArray(stroke) ? stroke : []).map(copyPoint).filter(Boolean))
    .filter((stroke) => stroke.length > 0);
}

export function bridgePictureKey(id, attemptId, day = today()) {
  const subject = token(id, 40);
  const attempt = token(attemptId, 120);
  return `${day}_${subject}_${attempt || "saved"}`;
}

function enqueue(work) {
  const next = writeTail.then(work, work);
  writeTail = next.catch(() => undefined);
  return next;
}

export function bridgeDraftKey(id, step, mode = "") {
  return `${id}:${mode === "copy" ? "copy" : Math.max(0, Math.min(2, Number(step) | 0))}`;
}

export function bridgeGuideRevision(id, revision, strokes = []) {
  const item = drawingById(id);
  if (!item) return 1;
  if (Number(revision) === 1) return 1;
  if (Number(revision) === item.guideRevision) return item.guideRevision;
  return Array.isArray(strokes) && strokes.some((stroke) => Array.isArray(stroke) && stroke.length) ? 1 : item.guideRevision;
}

export function normaliseBridgeDrafts(value) {
  if (value?.schema != null && value.schema !== 1) throw Object.assign(new Error("This drawing version cannot be opened. Earlier drawings were kept."), { code: "bridge-version" });
  const drafts = new Map();
  for (const raw of (value && Array.isArray(value.drafts) ? value.drafts : [])) {
    if (!raw || !drawingById(raw.id) || raw.coordinateSpace !== "glyph") continue;
    if (!["try", "copy", "invent"].includes(raw.mode)) continue;
    if (!Number.isInteger(raw.step) || raw.step < 0 || raw.step > 2) continue;
    if ((raw.mode === "try" && raw.step === 2) || (raw.mode === "copy" && raw.step !== 1) || (raw.mode === "invent" && raw.step !== 2)) continue;
    const attemptId = token(raw.attemptId);
    const strokes = normaliseBridgeStrokes(raw.strokes);
    if (!attemptId || !strokes.length) continue;
    const draft = { id: raw.id, mode: raw.mode, step: raw.step, attemptId,
      guideRevision: bridgeGuideRevision(raw.id, raw.guideRevision, strokes), coordinateSpace: "glyph", strokes,
      at: Number.isFinite(raw.at) && raw.at >= 0 && raw.at <= 8.64e15 ? raw.at : 0 };
    const key = bridgeDraftKey(draft.id, draft.step, draft.mode);
    if (!drafts.has(key) || draft.at >= drafts.get(key).at) drafts.set(key, draft);
  }
  return withinCapacity({ schema: 1, drafts: [...drafts.values()] });
}

export async function loadBridgeDrafts({ io = db } = {}) {
  await flushBridgeWrites();
  return normaliseBridgeDrafts(await (io.getStrict || io.get)("kv", BRIDGE_DRAFTS_KEY));
}

export function saveBridgeDraft(draft, { io = db } = {}) {
  const clean = normaliseBridgeDrafts({ drafts: [draft] }).drafts[0];
  if (!clean) return Promise.resolve(null);
  return enqueue(async () => {
    const state = normaliseBridgeDrafts(await (io.getStrict || io.get)("kv", BRIDGE_DRAFTS_KEY));
    const key = bridgeDraftKey(clean.id, clean.step, clean.mode);
    state.drafts = state.drafts.filter((row) => bridgeDraftKey(row.id, row.step, row.mode) !== key);
    state.drafts.push(clean);
    await io.put("kv", BRIDGE_DRAFTS_KEY, normaliseBridgeDrafts(state));
    return normaliseBridgeDrafts({ drafts: [clean] }).drafts[0];
  });
}

export function deleteBridgeDraft(id, step, mode = "", attemptId = null) {
  return enqueue(async () => {
    const state = normaliseBridgeDrafts(await db.getStrict("kv", BRIDGE_DRAFTS_KEY));
    const key = bridgeDraftKey(id, step, mode);
    state.drafts = state.drafts.filter((row) => bridgeDraftKey(row.id, row.step, row.mode) !== key || (attemptId && row.attemptId !== attemptId));
    await db.put("kv", BRIDGE_DRAFTS_KEY, normaliseBridgeDrafts(state));
    return normaliseBridgeDrafts(state);
  });
}

// Queued behind every prior gallery/draft write, so a reset cannot be undone by
// a write that was already waiting when the adult requested it.
export function resetBridgeDrafts() { return enqueue(() => db.del("kv", BRIDGE_DRAFTS_KEY)); }

export function saveBridgePicture({ id, step, png, strokes, attemptId, at = Date.now() } = {}, { io = db } = {}) {
  const subject = token(id, 40);
  const attempt = token(attemptId, 120);
  const ink = normaliseBridgeStrokes(strokes);
  if (!subject || !attempt || !ink.length || typeof png !== "string" || !png.startsWith("data:image/png;base64,")) {
    return Promise.resolve(null);
  }
  const day = today(at);
  const key = bridgePictureKey(subject, attempt, day);
  return enqueue(async () => {
    const level = Math.max(0, Math.min(2, Number(step) | 0));
    // A failed later checkpoint can send the child back to the same attempt.
    // Reuse an exact saved picture on retry, but never replace earlier ink if
    // the child adds to it before trying again.
    for (let revision = 0; revision < 1000; revision++) {
      const candidate = revision ? `${key}_revision_${revision}` : key;
      const previous = await (io.getStrict || io.get)("gallery", candidate);
      if (previous) {
        if (previous.id === subject && previous.attemptId === attempt && previous.step === level &&
            previous.png === png && JSON.stringify(previous.strokes) === JSON.stringify(ink)) {
          return { key: candidate, row: previous };
        }
        continue;
      }
      const row = withinCapacity({ id: subject, day, at: Number(at) || Date.now(), png, strokes: ink, step: level, attemptId: attempt });
      await io.put("gallery", candidate, row);
      return { key: candidate, row };
    }
    throw Object.assign(new Error("This drawing has too many saved versions."), { code: "bridge-capacity" });
  });
}

export function flushBridgeWrites() { return writeTail; }

export default { saveBridgePicture, flushBridgeWrites, normaliseBridgeStrokes, bridgePictureKey,
  BRIDGE_DRAFTS_KEY, bridgeDraftKey, bridgeGuideRevision, normaliseBridgeDrafts, loadBridgeDrafts, saveBridgeDraft, deleteBridgeDraft, resetBridgeDrafts };
