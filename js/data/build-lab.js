// Physical diagram units are shared by the rules and the view: 0..100 across the table.
import { isLocalPNG } from '../state/creation-frame.js';
export const BUILD_GAPS = Object.freeze([{ id: 'narrow', width: 24, label: 'Little stream' }, { id: 'middle', width: 40, label: 'Medium stream' }, { id: 'wide', width: 56, label: 'Wide stream' }]);
export const BUILD_PLANKS = Object.freeze([{ id: 'short', length: 20, label: 'Short plank' }, { id: 'medium', length: 36, label: 'Medium plank' }, { id: 'long', length: 60, label: 'Long plank' }]);
export const MAX_PLANKS = 6;
export const MAX_SUPPORTS = 3;
export const MAX_UNSUPPORTED_SPAN = 30;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const position = (n) => Number.isFinite(Number(n)) ? Math.round(clamp(Number(n), 2, 98) * 10) / 10 : 50;
export const BUILD_PARCEL_MAX_BYTES = 2_000_000;
const PARCEL_KINDS = new Set(['drawing', 'studio', 'family-mural', 'picture-post']);
export function normalizeBuildParcel(raw) {
  if (!raw || !PARCEL_KINDS.has(raw.kind) || !isLocalPNG(raw.png) || raw.png.length > BUILD_PARCEL_MAX_BYTES) return null;
  return { sourceRef: String(raw.sourceRef || '').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 180),
    kind: raw.kind, label: String(raw.label || 'your picture').slice(0, 80), png: raw.png,
    at: Number.isFinite(raw.at) && raw.at > 0 ? Math.round(raw.at) : 0 };
}
export function emptyBuild() { return { gap: 'narrow', planks: [], supports: [], invitation: 'crossing', parcel: null, delivered: false }; }
export function normalizeBuild(raw) {
  const build = emptyBuild();
  if (!raw || typeof raw !== 'object') return build;
  if (BUILD_GAPS.some(g => g.id === raw.gap)) build.gap = raw.gap;
  build.invitation = raw.invitation === 'delivery' ? 'delivery' : 'crossing';
  build.parcel = normalizeBuildParcel(raw.parcel);
  build.delivered = build.invitation === 'delivery' && !!build.parcel && raw.delivered === true;
  const ids = new Set();
  const parts = (items, max, kind) => (Array.isArray(items) ? items : []).slice(0, max).flatMap((p, i) => {
    if (!p || typeof p !== 'object' || (kind === 'plank' && !BUILD_PLANKS.some(v => v.id === p.size))) return [];
    let id = typeof p.id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(p.id) ? p.id : `${kind}-${i}`;
    if (ids.has(id)) id = `${kind}-${i}`;
    while (ids.has(id)) id += '_';
    ids.add(id);
    return [{ id, x: position(p.x), ...(kind === 'plank' ? { size: p.size } : {}) }];
  });
  build.planks = parts(raw.planks, MAX_PLANKS, 'plank');
  build.supports = parts(raw.supports, MAX_SUPPORTS, 'support');
  if (build.delivered && testBuild({ ...build, delivered: false }).outcome !== 'cross') build.delivered = false;
  return build;
}
export function buildBanks(build) {
  const width = BUILD_GAPS.find(g => g.id === build.gap)?.width || 24;
  return { left: 50 - width / 2, right: 50 + width / 2, width };
}
export function plankBounds(plank) {
  const half = (BUILD_PLANKS.find(p => p.id === plank.size)?.length || 20) / 2;
  return { left: plank.x - half, right: plank.x + half };
}
export function applyBuildAction(raw, action = {}) {
  const build = normalizeBuild(raw);
  if (action.type === 'invitation') {
    build.invitation = action.invitation === 'delivery' ? 'delivery' : 'crossing';
    build.delivered = false;
  }
  if (action.type === 'parcel') {
    const parcel = normalizeBuildParcel(action.parcel);
    if (parcel) { build.parcel = parcel; build.invitation = 'delivery'; build.delivered = false; }
  }
  if (action.type === 'remove-parcel') { build.parcel = null; build.delivered = false; }
  if (action.type === 'retry-delivery') build.delivered = false;
  if (action.type === 'delivered' && build.invitation === 'delivery' && build.parcel && testBuild(build).outcome === 'cross') build.delivered = true;
  if (action.type === 'gap' && BUILD_GAPS.some(g => g.id === action.gap)) build.gap = action.gap;
  if (action.type === 'reset') return { ...build, planks: [], supports: [], delivered: false };
  if (action.type === 'add') {
    const isPlank = BUILD_PLANKS.some(p => p.id === action.size);
    const list = isPlank ? build.planks : action.size === 'support' ? build.supports : null;
    if (list && list.length < (isPlank ? MAX_PLANKS : MAX_SUPPORTS)) {
      const all = [...build.planks, ...build.supports];
      let n = 1; while (all.some(p => p.id === `part-${n}`)) n++;
      list.push({ id: `part-${n}`, x: position(action.x), ...(isPlank ? { size: action.size } : {}) });
    }
  }
  if (action.type === 'move') for (const part of [...build.planks, ...build.supports]) if (part.id === action.id) part.x = position(action.x);
  if (action.type === 'remove') { build.planks = build.planks.filter(p => p.id !== action.id); build.supports = build.supports.filter(p => p.id !== action.id); }
  if (['gap', 'add', 'move', 'remove'].includes(action.type) && JSON.stringify(build) !== JSON.stringify(normalizeBuild(raw))) build.delivered = false;
  return build;
}
function reaches(intervals, left, right) {
  let edge = left;
  for (const span of intervals.sort((a, b) => a.left - b.left)) {
    if (span.right < edge) continue;
    if (span.left > edge + .1) return false;
    edge = Math.max(edge, span.right);
    if (edge >= right) return true;
  }
  return false;
}
export function testBuild(raw) {
  const build = normalizeBuild(raw), banks = buildBanks(build);
  const beams = build.planks.map(p => {
    const bounds = plankBounds(p);
    const bearings = build.supports.filter(s => s.x >= bounds.left && s.x <= bounds.right).map(s => s.x);
    if (bounds.left <= banks.left) bearings.push(bounds.left, Math.min(bounds.right, banks.left));
    if (bounds.right >= banks.right) bearings.push(Math.max(bounds.left, banks.right), bounds.right);
    bearings.sort((a, b) => a - b);
    const stable = bearings.length > 0 && bearings[0] - bounds.left <= 8 && bounds.right - bearings.at(-1) <= 8 && bearings.every((x, i) => !i || x - bearings[i - 1] <= MAX_UNSUPPORTED_SPAN);
    return { id: p.id, ...bounds, stable };
  });
  const covered = reaches(beams.map(b => ({ ...b })), banks.left, banks.right);
  const safe = reaches(beams.filter(b => b.stable).map(b => ({ ...b })), banks.left, banks.right);
  return { outcome: safe ? 'cross' : covered ? 'settle' : 'short', beams, banks,
    message: safe ? 'The caterpillar can cross your bridge!' : covered ? 'The planks settle down. Try a support underneath.' : 'There is still a gap. Try moving or adding a plank.' };
}
