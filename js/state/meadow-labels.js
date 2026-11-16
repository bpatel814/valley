// Durable Meadow labels keep the child's actual completed glyph-space ink attached to
// the matching existing word. This is local child work, not a mastery or progress field.

import db from "./db.js";
import { WORDS, RETIRED_FAMILY_WORDS } from "../data/words.js";

export const MEADOW_LABELS_KEY = "meadow_word_labels:v1";
export const MEADOW_LABELS_VERSION = 1;
export const MAX_LABEL_STROKES = 512;
export const MAX_LABEL_POINTS = 8192;
export const MAX_LABEL_BYTES = 64 * 1024 * 1024;

const CATALOG = new Set([...WORDS.map((entry) => entry.word), ...Object.keys(RETIRED_FAMILY_WORDS)]);
let writeTail = Promise.resolve();

const finite = (value) => Number.isFinite(Number(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

function cleanPoint(point) {
  if (!point || !finite(point.x) || !finite(point.y)) return null;
  const x = Number(point.x), y = Number(point.y);
  const out = { x, y };
  if (finite(point.p)) out.p = clamp(point.p, 0, 1);
  if (finite(point.t)) out.t = Math.max(0, Number(point.t));
  return out;
}

export function normaliseMeadowSnapshot(raw, glyph) {
  if (!raw || raw.version !== 1 || raw.coordinateSpace !== "glyph" || raw.glyph !== glyph || !Array.isArray(raw.strokes)) return null;
  if (raw.strokes.length > MAX_LABEL_STROKES || raw.strokes.some(stroke => Array.isArray(stroke) && stroke.length > MAX_LABEL_POINTS)) {
    throw Object.assign(new Error('This label is too large. Earlier writing was kept.'), { code: 'meadow-label-capacity' });
  }
  const strokes = raw.strokes.map((stroke) =>
    (Array.isArray(stroke) ? stroke : []).map(cleanPoint).filter(Boolean)
  ).filter((stroke) => stroke.length > 0);
  if (!strokes.length) return null;
  return { version: 1, coordinateSpace: "glyph", glyph, strokes };
}

export function normaliseMeadowLabel(raw) {
  const word = String(raw && raw.word || "").trim().toUpperCase();
  if (!CATALOG.has(word) || !Array.isArray(raw.snapshots) || raw.snapshots.length !== word.length) return null;
  const snapshots = raw.snapshots.map((snapshot, index) => normaliseMeadowSnapshot(snapshot, word[index]));
  if (snapshots.some((snapshot) => !snapshot)) return null;
  return {
    v: MEADOW_LABELS_VERSION,
    word,
    snapshots,
    updatedAt: Math.max(0, Math.round(Number(raw.updatedAt) || Date.now())),
  };
}

export function normaliseMeadowLabels(raw) {
  if (raw?.v != null && raw.v !== MEADOW_LABELS_VERSION) throw Object.assign(new Error('This label version cannot be opened. Earlier writing was kept.'), { code: 'meadow-label-version' });
  const labels = {};
  const source = raw && raw.v === MEADOW_LABELS_VERSION && raw.labels && typeof raw.labels === "object" ? raw.labels : {};
  for (const word of CATALOG) {
    const label = normaliseMeadowLabel(source[word]);
    if (label) labels[word] = label;
  }
  const clean = { v: MEADOW_LABELS_VERSION, labels };
  if (new TextEncoder().encode(JSON.stringify(clean)).byteLength > MAX_LABEL_BYTES) throw Object.assign(new Error('The writing shelf is full. Earlier writing was kept.'), { code: 'meadow-label-capacity' });
  return clean;
}

function enqueue(work) {
  const next = writeTail.then(work, work);
  writeTail = next.catch(() => undefined);
  return next;
}

async function readLabels(io = db) {
  const raw = await (io.getStrict || io.get)("kv", MEADOW_LABELS_KEY);
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw Object.assign(new Error('Saved writing could not be opened safely.'), {code:'meadow-label-invalid'});
  const incoming = normaliseMeadowLabels(raw);
  if (raw?.labels != null && (typeof raw.labels !== 'object' || Array.isArray(raw.labels) || Object.keys(raw.labels).length !== Object.keys(incoming.labels).length)) throw Object.assign(new Error('Some saved writing needs a newer or repaired shelf. It was kept.'), {code:'meadow-label-invalid'});
  return incoming;
}
export async function loadMeadowLabelsChecked({ io = db } = {}) {
  await writeTail;
  return readLabels(io);
}

export async function loadMeadowLabels(options = {}) {
  return loadMeadowLabelsChecked(options);
}

export async function loadMeadowLabel(word) {
  const id = String(word || "").trim().toUpperCase();
  const stored = await loadMeadowLabelsChecked();
  return stored.labels[id] || null;
}

export function saveMeadowLabel(value, { io = db } = {}) {
  const label = normaliseMeadowLabel({ ...value, updatedAt: value && value.updatedAt || Date.now() });
  if (!label) return Promise.resolve(null);
  return enqueue(async () => {
    const stored = await readLabels(io);
    stored.labels[label.word] = label;
    await io.put("kv", MEADOW_LABELS_KEY, normaliseMeadowLabels(stored));
    return label;
  });
}

export function clearMeadowLabels() {
  return enqueue(() => db.del("kv", MEADOW_LABELS_KEY));
}

export async function flushMeadowLabelWrites() { await writeTail; }

export default {
  MEADOW_LABELS_KEY,
  loadMeadowLabels,
  loadMeadowLabelsChecked,
  loadMeadowLabel,
  saveMeadowLabel,
  clearMeadowLabels,
  normaliseMeadowLabel,
  normaliseMeadowLabels,
  flushMeadowLabelWrites,
};
