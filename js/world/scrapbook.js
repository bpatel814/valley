// scrapbook.js - local decoration state and child-safe views of earned work.
// Decoration lives in the existing kv store, separate from learning progress.

import * as db from "../state/db.js";
import * as progress from "../state/progress.js";
import { stickerById } from "../data/stickers.js";

export const SCRAPBOOK_KEY = "scrapbook";
export const MAX_PLACEMENTS = 1000;
export const MAX_DECORATION_UNDO = 24;
let writeTail = Promise.resolve();

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));

export function normalise(raw) {
  if (raw?.v != null && ![1, 2].includes(raw.v)) throw Object.assign(new Error('This scrapbook version cannot be opened. Earlier stickers were kept.'), { code: 'scrapbook-version' });
  const rows = raw && Array.isArray(raw.placements) ? raw.placements : [];
  const cleanRows = source => source.map((row, i) => ({
      id: String(row && row.id || ""),
      x: clamp(row && row.x, 0.06, 0.94),
      y: clamp(row && row.y, 0.08, 0.92),
      at: Number(row && row.at) || i,
    })).filter((row) => !!stickerById(row.id));
  const placements = cleanRows(rows);
  if (placements.length > MAX_PLACEMENTS) throw Object.assign(new Error('This scrapbook has too many placements. Earlier stickers were kept.'), { code: 'scrapbook-full' });
  const undo = (raw && Array.isArray(raw.undo) ? raw.undo : []).slice(-MAX_DECORATION_UNDO)
    .filter(Array.isArray).map(cleanRows);
  if (undo.some(rows => rows.length > MAX_PLACEMENTS)) throw Object.assign(new Error('This scrapbook history is too large. Earlier stickers were kept.'), { code: 'scrapbook-full' });
  return { v: 2, placements, undo };
}

async function readDecorations() {
  let raw = null;
  try { raw = await db.get("kv", SCRAPBOOK_KEY); } catch (_) { raw = null; }
  return normalise(raw);
}

function enqueue(work) {
  const next = writeTail.then(work, work);
  writeTail = next.catch(() => undefined);
  return next;
}

export async function loadDecorations() { await writeTail; return readDecorations(); }
export async function flushDecorations() { await writeTail; }

export function placeSticker(id, x, y, at = Date.now()) {
  if (!stickerById(id)) return null;
  return enqueue(async () => {
  const book = await readDecorations();
  if (book.placements.length >= MAX_PLACEMENTS) throw Object.assign(new Error('Your scrapbook page is full. All earlier stickers are still here.'), { code: 'scrapbook-full' });
  const placed = { id, x: clamp(x, 0.06, 0.94), y: clamp(y, 0.08, 0.92), at };
  book.undo = [...book.undo, book.placements.slice()].slice(-MAX_DECORATION_UNDO);
  book.placements.push(placed);
  await db.put("kv", SCRAPBOOK_KEY, book);
  return placed;
  });
}

export function undoDecoration() {
  return enqueue(async () => {
    const book = await readDecorations();
    if (!book.undo.length) return false;
    book.placements = book.undo.pop();
    await db.put('kv', SCRAPBOOK_KEY, book);
    return true;
  });
}

export function clearDecorations() {
  return enqueue(() => db.put("kv", SCRAPBOOK_KEY, normalise(null)));
}

export function earnedStickers() {
  return progress.stickers().map(stickerById).filter(Boolean);
}

export function todaySummary(day) {
  const state = progress.get() || {};
  const row = state.days && state.days[day] || {};
  return {
    butterflies: Math.max(0, row.hatches | 0),
    gems: Math.max(0, row.stripes | 0),
    drawings: Math.max(0, row.drawings | 0),
  };
}

export const scrapbook = {
  loadDecorations, placeSticker, undoDecoration, flushDecorations, clearDecorations, earnedStickers, todaySummary,
  normalise, SCRAPBOOK_KEY, MAX_PLACEMENTS,
};

export default scrapbook;
