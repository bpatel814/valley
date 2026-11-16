// One child-chosen creation displayed on the shared valley map.
import db from "./db.js";
import gallery from "../parent/gallery.js";

export const CREATION_DISPLAY_KEY = "valley:display:v1";
export const CREATION_DISPLAY_VERSION = 1;

let writeTail = Promise.resolve();

function enqueue(work) {
  const next = writeTail.then(work, work);
  writeTail = next.catch(() => undefined);
  return next;
}

function safeKey(value) {
  return String(value == null ? "" : value).replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 180);
}

export function isLocalPNG(value) {
  if (typeof value !== "string" || value.length < 30 || value.length > 20_000_000) return false;
  const prefix = "data:image/png;base64,";
  if (!value.startsWith(prefix)) return false;
  const body = value.slice(prefix.length);
  return body.length >= 8 && body.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(body);
}

export function isCreationRow(row) {
  if (!row || !safeKey(row.key) || !isLocalPNG(row.png)) return false;
  if (["studio", "family-mural", "picture-post", "build-lab", "toy-photo"].includes(row.kind)) return true;
  // Rainbow Bridge predates gallery `kind`; its free-draw rows have an object id,
  // a strokes array, and no unrelated activity kind.
  return !row.kind && typeof row.id === "string" && row.id !== "" && Array.isArray(row.strokes);
}

export function normaliseCreationPictures(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(isCreationRow)
    .map((row) => ({ key: safeKey(row.key), png: row.png, at: Number(row.at) || 0, id: String(row.id || "picture"), kind: row.kind || "drawing" }))
    .sort((a, b) => b.at - a.at || b.key.localeCompare(a.key));
}

export function normaliseCreationDisplay(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    v: CREATION_DISPLAY_VERSION,
    key: safeKey(source.key),
    hidden: !!source.hidden,
  };
}

function checkedCreationDisplay(value) {
  if (value != null && (typeof value !== 'object' || Array.isArray(value) ||
      (value.v != null && value.v !== CREATION_DISPLAY_VERSION) ||
      (value.key != null && (typeof value.key !== 'string' || safeKey(value.key) !== value.key)) ||
      (value.hidden != null && typeof value.hidden !== 'boolean'))) {
    throw Object.assign(new Error('The saved picture choice could not be opened safely.'), {code:'creation-display-invalid'});
  }
  return normaliseCreationDisplay(value);
}

export function resolveCreationDisplay(pictures, value) {
  const list = normaliseCreationPictures(pictures);
  const state = normaliseCreationDisplay(value);
  if (state.hidden || !list.length) return { pictures: list, display: null, state };
  const selected = list.find((row) => row.key === state.key) || list[0];
  return { pictures: list, display: selected, state: { ...state, key: selected.key, hidden: false } };
}

export async function loadCreationFrameModel({ io = db } = {}) {
  await writeTail;
  const [rows, stored] = await Promise.all([gallery.listChecked(undefined, {io}), (io.getStrict || io.get)("kv", CREATION_DISPLAY_KEY)]);
  const raw = checkedCreationDisplay(stored);
  const model = resolveCreationDisplay(rows, raw);
  if (model.state.key !== raw.key) await enqueue(() => io.put("kv", CREATION_DISPLAY_KEY, model.state));
  return model;
}

export function selectCreationPicture(key) {
  const state = { v: CREATION_DISPLAY_VERSION, key: safeKey(key), hidden: false };
  return enqueue(() => db.put("kv", CREATION_DISPLAY_KEY, state)).then(() => state);
}

export function hideCreationPicture({ io = db } = {}) {
  return enqueue(async () => {
    const current = checkedCreationDisplay(await (io.getStrict || io.get)("kv", CREATION_DISPLAY_KEY));
    const state = { ...current, hidden: true };
    await io.put("kv", CREATION_DISPLAY_KEY, state);
    return state;
  });
}

export function flushCreationDisplayWrites() { return writeTail; }

export default {
  loadCreationFrameModel,
  selectCreationPicture,
  hideCreationPicture,
  normaliseCreationPictures,
  normaliseCreationDisplay,
  resolveCreationDisplay,
  isLocalPNG,
  isCreationRow,
  flushCreationDisplayWrites,
};
