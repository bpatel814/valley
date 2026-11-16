// Per-word attempts survive pictured word switches, route changes and reload.
// Complete labels remain in meadow-labels; this store keeps independent attempts.
import db from './db.js';
import { WORDS, RETIRED_FAMILY_WORDS } from '../data/words.js';

export const MEADOW_DRAFTS_KEY = 'meadow_word_drafts:v1';
export const MEADOW_DRAFTS_MAX_BYTES = 64 * 1024 * 1024;
const CATALOG = new Set([...WORDS.map(row => row.word), ...Object.keys(RETIRED_FAMILY_WORDS)]);
const MODES = ['explore', 'grow', 'challenge'];
let tail = Promise.resolve();
const error = code => Object.assign(new Error(code), { code });
const clone = value => JSON.parse(JSON.stringify(value));
export const meadowDraftKey = (word, mode) => `${mode}:${String(word || '').toUpperCase()}`;

function snapshot(raw, glyph) {
  if (raw == null) return null;
  if (raw.version !== 1 || raw.coordinateSpace !== 'glyph' || raw.glyph !== glyph || !Array.isArray(raw.strokes)) throw error('meadow-draft-invalid');
  if (raw.strokes.length > 512) throw error('meadow-draft-capacity');
  const strokes = raw.strokes.map(stroke => {
    if (!Array.isArray(stroke) || !stroke.length) throw error('meadow-draft-invalid');
    if (stroke.length > 8192) throw error('meadow-draft-capacity');
    return stroke.map(point => {
      // Independent marks can lie outside the fitted glyph box. Tracer uses
      // that box as a coordinate transform, not a clipping boundary.
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw error('meadow-draft-invalid');
      const p = { x: point.x, y: point.y };
      if (point.p != null) { if (!Number.isFinite(point.p) || point.p < 0 || point.p > 1) throw error('meadow-draft-invalid'); p.p = point.p; }
      if (point.t != null) { if (!Number.isFinite(point.t) || point.t < 0) throw error('meadow-draft-invalid'); p.t = point.t; }
      return p;
    });
  });
  return { version: 1, coordinateSpace: 'glyph', glyph, strokes };
}

export function normaliseMeadowDraft(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const word = String(raw.word || '').toUpperCase(), mode = raw.mode;
  if (!CATALOG.has(word) || !MODES.includes(mode)) return null;
  if (raw.viewingSaved) return null; // Viewing a completed label never replaces an unfinished attempt.
  const length = word.length, index = Math.max(0, Math.min(length - 1, Math.floor(Number(raw.index) || 0)));
  const tiers = Array.from({ length }, (_, i) => raw.tiers?.[i] == null ? null : Number(raw.tiers[i]));
  let gap = false;
  for (const tier of tiers) { if (tier == null) gap = true; else if (gap || ![1, 2, 3].includes(tier)) throw error('meadow-draft-invalid'); }
  const inkSnapshots = Array.from({ length }, (_, i) => snapshot(raw.inkSnapshots?.[i], word[i]));
  const clean = { mode, word, index, tiers, inkSnapshots, traceSnapshot: snapshot(raw.traceSnapshot, word[index]),
    attemptId: typeof raw.attemptId === 'string' ? raw.attemptId.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) : '',
    completed: !!raw.completed, viewingSaved: false };
  if (raw.resetRecovery != null) {
    const recovery = raw.resetRecovery;
    if (!recovery || recovery.version !== 1 || !Number.isInteger(recovery.index) || recovery.index < 0 || recovery.index >= length ||
      (recovery.restored != null && typeof recovery.restored !== 'boolean')) throw error('meadow-draft-invalid');
    const original = snapshot(recovery.traceSnapshot, word[recovery.index]);
    if (!original) throw error('meadow-draft-invalid');
    clean.resetRecovery = { version:1, index:recovery.index, traceSnapshot:original };
    if (recovery.restored === true) clean.resetRecovery.restored = true;
  }
  return clean;
}

export function normaliseMeadowDrafts(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw error('meadow-draft-invalid');
  if (raw.v != null && raw.v !== 1) throw error('meadow-draft-version');
  const drafts = {};
  for (const row of Object.values(raw.drafts || {})) {
    const clean = normaliseMeadowDraft(row);
    if (clean) drafts[meadowDraftKey(clean.word, clean.mode)] = clean;
  }
  const last = typeof raw.last === 'string' && drafts[raw.last] ? raw.last : null;
  const clean = { v: 1, drafts, last };
  if (new TextEncoder().encode(JSON.stringify(clean)).byteLength > MEADOW_DRAFTS_MAX_BYTES) throw error('meadow-draft-capacity');
  return clean;
}

async function read(io = db) {
  const raw = await (io.getStrict || io.get)('kv', MEADOW_DRAFTS_KEY);
  const incoming = normaliseMeadowDrafts(raw === undefined ? {} : raw);
  if (raw?.drafts != null && (typeof raw.drafts !== 'object' || Array.isArray(raw.drafts) || Object.values(raw.drafts).length !== Object.keys(incoming.drafts).length)) throw error('meadow-draft-invalid');
  return incoming;
}
function enqueue(work) { const next = tail.then(work, work); tail = next.catch(() => {}); return next; }
export async function loadMeadowDrafts({ io = db } = {}) { await tail; return read(io); }
export async function loadMeadowDraft(word, mode) { const store = await loadMeadowDrafts(); return store.drafts[meadowDraftKey(word, mode)] || null; }
export function saveMeadowDraft(raw, { io = db } = {}) {
  let draft;
  try { draft = normaliseMeadowDraft(raw); } catch (cause) { return Promise.reject(cause); }
  if (!draft) return Promise.resolve(null);
  return enqueue(async () => {
    const store = await read(io), key = meadowDraftKey(draft.word, draft.mode);
    store.drafts[key] = draft; store.last = key;
    const clean = normaliseMeadowDrafts(store);
    await io.put('kv', MEADOW_DRAFTS_KEY, clean);
    return { draft: clone(draft), persistent: io.status().persistent };
  });
}
export function clearMeadowDrafts() { return enqueue(() => db.del('kv', MEADOW_DRAFTS_KEY)); }
export async function flushMeadowDraftWrites() { await tail; }
