// gallery.js - the drawings Rayna finished, newest first, and how a parent saves one.
// Entries live in the `gallery` store: key `${day}_${id}_${ts}` -> {id, day, png, strokes, at}.

import * as db from "./../state/db.js";

/** Every saved drawing, newest first. Pass a day (YYYY-MM-DD) to filter. */
export async function listChecked(day, { io = db } = {}) {
  // A checked gallery read must not turn a failed persistent transaction into
  // an apparently empty album. The ordinary list wrapper can still choose fallback.
  const pairs = (await (io.entriesStrict || io.entries)("gallery")) || [];
  const rows = pairs.map(([key, value]) => Object.assign({ key }, value || {}));
  const filtered = day ? rows.filter((r) => r.day === day) : rows;
  return filtered.sort((a, b) => (b.at || 0) - (a.at || 0));
}

export async function list(day) {
  try { return await listChecked(day); } catch (_) { return []; }
}

export async function get(key) {
  try { return (await db.get("gallery", key)) || null; } catch (_) { return null; }
}

export async function remove(key) {
  try { await db.del("gallery", key); return true; } catch (_) { return false; }
}

function dataUrlToBlob(dataUrl) {
  const comma = String(dataUrl).indexOf(",");
  if (comma < 0) return null;
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const type = (head.match(/data:([^;,]+)/) || [])[1] || "image/png";
  if (head.indexOf("base64") < 0) return new Blob([decodeURIComponent(body)], { type });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Save one drawing to the tablet as rayna-<day>-<id>.png. */
export async function exportPNG(key) {
  const row = await get(key);
  if (!row || !row.png) return false;
  const blob = dataUrlToBlob(row.png);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rayna-" + (row.day || "drawing") + "-" + (row.id || "picture") + ".png";
  a.style.position = "fixed";
  a.style.left = "-9999px";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 4000);
  return true;
}

/** Days that have at least one drawing, newest first. */
export async function days() {
  const rows = await list();
  return [...new Set(rows.map((r) => r.day))].sort().reverse();
}

export const gallery = { list, listChecked, get, remove, exportPNG, days };
export default gallery;
