// A detached river journey becomes part of a child's own family picnic.
// The source float, original picture, and earlier picnic stay independently owned.
import { isLocalPNG } from '../state/creation-frame.js';
import { normalizeRiverScene, RIVER_DIRECTIONS } from './river-run.js';

export const TOY_OUTING_VERSION = 1;
export const TOY_OUTING_MAX_PNG_CHARS = 2_000_000;
export const TOY_OUTING_PLACES = Object.freeze(['table', 'left', 'right']);
const id = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(value) ? value : '';
const failure = code => Object.assign(new Error(code), { code });
const copy = value => JSON.parse(JSON.stringify(value));

export function normalizeToyOuting(raw) {
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw failure('outing-invalid');
  if (raw.v !== TOY_OUTING_VERSION) throw failure('outing-version');
  if (typeof raw.png === 'string' && raw.png.length > TOY_OUTING_MAX_PNG_CHARS) throw failure('outing-capacity');
  if (!id(raw.id) || !isLocalPNG(raw.png) || !raw.river || typeof raw.river !== 'object'
      || !id(raw.river.instance?.id) || !id(raw.river.instance?.asset) || raw.river.attached !== true
      || !Object.hasOwn(RIVER_DIRECTIONS, raw.river.direction) || ![0, 1, 2].includes(raw.river.strength)
      || !Number.isFinite(raw.river.origin?.x) || !Number.isFinite(raw.river.origin?.y)) throw failure('outing-invalid');
  if (raw.river.v != null && raw.river.v !== 1) throw failure('outing-version');
  const river = normalizeRiverScene(raw.river, raw.png);
  const owner = ['rayna', 'veer', 'shared'].includes(raw.owner) ? raw.owner : river.instance.owner;
  return { v: TOY_OUTING_VERSION, id: raw.id, png: raw.png, river,
    toyRef: id(raw.toyRef) || river.instance.toyRef, owner,
    placement: TOY_OUTING_PLACES.includes(raw.placement) ? raw.placement : 'table' };
}

export function makeToyOuting({ scene, png, id: outingId }) {
  return normalizeToyOuting({ v: 1, id: outingId, png, river: copy(scene),
    toyRef: scene?.instance?.toyRef || '', owner: scene?.instance?.owner || 'shared', placement: 'table' });
}

export function toyOutingEnding(picnic) {
  if (!picnic?.outing) return { sharedToy: false, bothServed: false, enjoyed: false, complete: false };
  const sharedToy = ['left', 'right'].includes(picnic.outing.placement);
  const served = place => picnic.pieces?.some(piece => piece.place === place && piece.units > 0);
  const bothServed = served('left') && served('right');
  const enjoyed = picnic.pieces?.some(piece => piece.eaten === true) || false;
  return { sharedToy, bothServed, enjoyed, complete: sharedToy && bothServed && enjoyed };
}
