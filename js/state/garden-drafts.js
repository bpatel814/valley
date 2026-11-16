// Garden marks belong to their own subject and support mode, beyond route resume.
import db from './db.js';
import { GLYPHS } from '../data/letters.js';
import { PREWRITING_GLYPHS } from '../data/prewriting.js';

export const GARDEN_DRAFTS_KEY = 'garden_subject_drafts:v1';
export const GARDEN_DRAFTS_MAX_BYTES = 64 * 1024 * 1024;
const MODES = ['explore', 'grow', 'challenge'];
const error = code => Object.assign(new Error(code), { code });
const clone = value => JSON.parse(JSON.stringify(value));
let tail = Promise.resolve();
export const gardenDraftKey = (item, mode) => `${mode}:${item}`;

function normaliseSnapshot(source, glyph) {
  if (!source || source.version !== 1 || source.coordinateSpace !== 'glyph' || source.glyph !== (glyph.id || glyph.name) || !Array.isArray(source.strokes)) throw error('garden-draft-invalid');
  if (source.strokes.length > 512) throw error('garden-draft-capacity');
  const strokes = source.strokes.map(stroke => {
    if (!Array.isArray(stroke) || !stroke.length) throw error('garden-draft-invalid');
    if (stroke.length > 8192) throw error('garden-draft-capacity');
    return stroke.map(point => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw error('garden-draft-invalid');
      const out = { x: point.x, y: point.y };
      if (point.p != null) { if (!Number.isFinite(point.p) || point.p < 0 || point.p > 1) throw error('garden-draft-invalid'); out.p = point.p; }
      if (point.t != null) { if (!Number.isFinite(point.t) || point.t < 0) throw error('garden-draft-invalid'); out.t = point.t; }
      return out;
    });
  });
  return { version: 1, coordinateSpace: 'glyph', glyph: source.glyph, strokes };
}
const attempt = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) : '';
export function normaliseGardenDraft(raw) {
  if (!raw || typeof raw !== 'object' || !MODES.includes(raw.mode)) return null;
  const catalog = raw.mode === 'explore' ? PREWRITING_GLYPHS : GLYPHS;
  const glyph = Object.hasOwn(catalog, raw.item) ? catalog[raw.item] : null;
  if (!glyph) return null;
  const draft = { mode: raw.mode, item: raw.item, completed: !!raw.completed,
    attemptId: attempt(raw.attemptId), traceSnapshot: normaliseSnapshot(raw.traceSnapshot, glyph) };
  if (raw.independent === true) draft.independent = true;
  if (raw.resetRecovery != null) {
    const recovery = raw.resetRecovery;
    if (!recovery || typeof recovery !== 'object' || Array.isArray(recovery) || recovery.version !== 1) throw error('garden-draft-invalid');
    draft.resetRecovery = { version: 1, attemptId: attempt(recovery.attemptId), completed: !!recovery.completed,
      traceSnapshot: normaliseSnapshot(recovery.traceSnapshot,glyph) };
    if (recovery.independent === true) draft.resetRecovery.independent = true;
  }
  return draft;
}

export function normaliseGardenDrafts(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw error('garden-draft-invalid');
  if (raw.v != null && raw.v !== 1) throw error('garden-draft-version');
  const drafts = {};
  if (raw.drafts != null && (typeof raw.drafts !== 'object' || Array.isArray(raw.drafts))) throw error('garden-draft-invalid');
  for (const value of Object.values(raw.drafts || {})) {
    const draft = normaliseGardenDraft(value);
    // Unknown subjects may belong to a newer build. Do not discard them when
    // this build next saves an unrelated paper.
    if (!draft) throw error('garden-draft-invalid');
    const key=gardenDraftKey(draft.item,draft.mode);
    if (drafts[key] && JSON.stringify(drafts[key]) !== JSON.stringify(draft)) throw error('garden-draft-conflict');
    drafts[key] = draft;
  }
  const lastByMode = {};
  for (const mode of MODES) {
    const key = raw.lastByMode?.[mode];
    if (drafts[key]?.mode === mode) lastByMode[mode] = key;
  }
  const result = { v: 1, drafts, lastByMode };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > GARDEN_DRAFTS_MAX_BYTES) throw error('garden-draft-capacity');
  return result;
}

async function read(io = db) {
  const raw = await (io.getStrict || io.get)('kv', GARDEN_DRAFTS_KEY);
  return normaliseGardenDrafts(raw === undefined ? {} : raw);
}
function enqueue(work) { tail = tail.then(work, work); void tail.catch(() => {}); return tail; }
export async function loadGardenDrafts({ io = db } = {}) { await tail.catch(() => {}); return read(io); }
export function saveGardenDraft(raw, { io = db } = {}) {
  let draft;
  try { draft = normaliseGardenDraft(raw); } catch (cause) { return Promise.reject(cause); }
  if (!draft) return Promise.resolve(null);
  return enqueue(async () => {
    const store = await read(io), key = gardenDraftKey(draft.item, draft.mode);
    const clean = normaliseGardenDrafts({ ...store, drafts: { ...store.drafts, [key]: draft }, lastByMode: { ...store.lastByMode, [draft.mode]: key } });
    await io.put('kv', GARDEN_DRAFTS_KEY, clean);
    return { draft: clone(draft), persistent: io.status().persistent };
  });
}
export function flushGardenDraftWrites() { return tail; }
