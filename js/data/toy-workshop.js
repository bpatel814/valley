// Exact child-made pictures become chosen toys, without drawing recognition.
import { isLocalPNG } from '../state/creation-frame.js';

export const TOY_WORKSHOP_VERSION = 1;
export const TOY_BEHAVIORS = Object.freeze(['rolling', 'floating', 'puppet']);
export const TOY_PATTERN_COLORS = Object.freeze(['coral', 'mint', 'lilac', 'sunshine']);
export const TOY_MAX_PATTERN = 8;
export const TOY_MAX_ITEMS = 1000;
export const TOY_MAX_ASSETS = 1000;
export const TOY_MAX_BYTES = 64 * 1024 * 1024;
export const TOY_MAX_UNDO = 24;
export const TOY_GALLERY_PAGE_SIZE = 8;

const clone = value => JSON.parse(JSON.stringify(value));
const id = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(value) ? value : '';
const owner = value => value === 'veer' ? 'veer' : value === 'rayna' ? 'rayna' : 'shared';
const time = value => Number.isFinite(value) && value >= 0 && value <= 8640000000000000 ? Math.round(value) : 0;
const behavior = value => TOY_BEHAVIORS.includes(value) ? value : 'rolling';
const failure = code => Object.assign(new Error(code), { code });

export function newToyDraft() {
  return { asset: '', behavior: 'rolling', assembled: false, pattern: [], name: '', invitation: 'make', toyId: '' };
}

export function normalizeToyDraft(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return { asset: id(source.asset), behavior: behavior(source.behavior), assembled: !!source.assembled && !!id(source.asset),
    pattern: (Array.isArray(source.pattern) ? source.pattern : []).filter(c => TOY_PATTERN_COLORS.includes(c)).slice(0, TOY_MAX_PATTERN),
    name: typeof source.name === 'string' ? source.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60) : '',
    invitation: ['make', 'pattern', 'family-show'].includes(source.invitation) ? source.invitation : 'make',
    toyId: id(source.toyId) };
}

/** Finite capacity refuses extra keeps; it never evicts earlier owned work. */
export function normalizeToyWorkshop(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  if (source.v != null && source.v !== TOY_WORKSHOP_VERSION) throw failure('toy-version');
  const assets = [], assetIds = new Set();
  for (const row of Array.isArray(source.assets) ? source.assets : []) {
    if (!id(row?.id) || assetIds.has(row.id) || !isLocalPNG(row.png)) continue;
    assetIds.add(row.id);
    assets.push({ id: row.id, sourceRef: id(row.sourceRef), png: row.png, at: time(row.at) });
  }
  if (assets.length > TOY_MAX_ASSETS) throw failure('toy-assets-full');
  const cleanDraft = value => {
    const draft = normalizeToyDraft(value);
    if (!assetIds.has(draft.asset)) { draft.asset = ''; draft.assembled = false; }
    return draft;
  };
  const toys = [], toyIds = new Set();
  for (const row of Array.isArray(source.toys) ? source.toys : []) {
    if (!id(row?.id) || toyIds.has(row.id) || !assetIds.has(row.asset)) continue;
    toyIds.add(row.id);
    const draft = normalizeToyDraft(row);
    toys.push({ id: row.id, asset: row.asset, behavior: draft.behavior,
      pattern: draft.pattern, name: draft.name, owner: owner(row.owner), at: time(row.at) });
  }
  if (toys.length > TOY_MAX_ITEMS) throw failure('toy-basket-full');
  const result = { v: TOY_WORKSHOP_VERSION, draft: cleanDraft(source.draft),
    undo: (Array.isArray(source.undo) ? source.undo : []).slice(-TOY_MAX_UNDO).map(cleanDraft), toys, assets };
  // Snapshots, including undo, keep their own art even after gallery source deletion.
  const used = new Set([result.draft, ...result.undo, ...result.toys].map(x => x.asset).filter(Boolean));
  result.assets = result.assets.filter(x => used.has(x.id));
  if (toyWorkshopBytes(result) > TOY_MAX_BYTES) throw failure('toy-capacity');
  return result;
}

export function toyWorkshopBytes(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }

export function editToyDraft(draft, action = {}) {
  const next = normalizeToyDraft(draft);
  if (action.type === 'behavior' && TOY_BEHAVIORS.includes(action.behavior)) {
    if (next.behavior !== action.behavior) next.assembled = false;
    next.behavior = action.behavior;
  }
  else if (action.type === 'assemble' && next.asset) next.assembled = true;
  else if (action.type === 'pattern-add' && TOY_PATTERN_COLORS.includes(action.color) && next.pattern.length < TOY_MAX_PATTERN) next.pattern.push(action.color);
  else if (action.type === 'pattern-pop') next.pattern.pop();
  else if (action.type === 'name' && typeof action.name === 'string') next.name = normalizeToyDraft({ name: action.name }).name;
  else if (action.type === 'invitation' && ['make', 'pattern', 'family-show'].includes(action.invitation)) next.invitation = action.invitation;
  else if (action.type === 'fresh') return newToyDraft();
  return next;
}

/** Detached instance art remains stable when a source or basket toy later changes. */
export function toyInstance(workshop, toyId, instanceId, place, x = 50, y = 50) {
  if (!id(instanceId) || !['rolling-run', 'river-run', 'play-stage', 'family-place', 'animal-friends'].includes(place)) return null;
  const toy = workshop.toys.find(item => item.id === toyId);
  const asset = toy && workshop.assets.find(item => item.id === toy.asset);
  if (!toy || !asset) return null;
  const coordinate = value => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
  return { v: 1, id: instanceId, toyRef: toy.id, owner: toy.owner, png: asset.png,
    behavior: toy.behavior, pattern: [...toy.pattern], name: toy.name, place,
    x: coordinate(x), y: coordinate(y) };
}

export function toyBasketPage(toys, page = 0, child = null) {
  const rows = child ? toys.filter(toy => toy.owner === child || toy.owner === 'shared') : toys;
  const pages = Math.max(1, Math.ceil(rows.length / TOY_GALLERY_PAGE_SIZE));
  const index = Math.max(0, Math.min(pages - 1, Math.floor(Number(page) || 0)));
  return { page: index, pages, items: rows.slice(index * TOY_GALLERY_PAGE_SIZE, (index + 1) * TOY_GALLERY_PAGE_SIZE) };
}

export { clone as cloneToyWorkshop, failure as toyWorkshopError };
