// Boo Hollow is a place, not a dated reward. All teaching paths use Tracer's
// existing coordinate space; the child's source is never fitted to the model.
import { drawingHasMarks } from './drawings.js';
import { NAME_WORDS } from './words.js';

export const BOO_GLYPH = Object.freeze({
  id: 'ghost', name: 'ghost',
  strokes: Object.freeze([
    'M23 79 L23 46 C23 7 77 7 77 46 L77 79 Q69 69 61 80 Q50 68 39 80 Q31 69 23 79 Z',
    'M40 43 L40 46', 'M60 43 L60 46',
    'M44 58 Q50 64 56 58',
  ]),
});

export const BOO_MODES = Object.freeze([
  Object.freeze({ id: 'dots', level: 2, label: 'Follow the dots', phrase: 'ui_dot_to_dot' }),
  Object.freeze({ id: 'guide', level: 0, label: 'Follow the soft ghost', phrase: 'ui_trace_the_ghost' }),
  Object.freeze({ id: 'free', level: 3, label: 'Draw your own ghost', phrase: 'ui_now_you_draw' }),
]);

export const BOO_BA_DOOR = Object.freeze({
  id: 'ba', name: 'BA', treats: 3,
  art: NAME_WORDS.find(row => row.word === 'BA').art,
  doorArt: 'halloween/door-ba-v1',
});
const family = word => NAME_WORDS.find(row => row.word === word).art;
export const BOO_FAMILY_DOORS = Object.freeze([
  Object.freeze({ ...BOO_BA_DOOR, label: 'Ba', people: Object.freeze([{ id: 'ba', name: 'Ba', art: BOO_BA_DOOR.art }]), knock: 'halloween_ba_knock', greeting: 'halloween_ba_greeting' }),
  Object.freeze({ id: 'dada', name: 'DADA', label: 'Dada', doorArt: BOO_BA_DOOR.doorArt, people: Object.freeze([{ id: 'dada', name: 'Dada', art: family('DADA') }]), knock: 'halloween_dada_knock', greeting: 'halloween_dada_greeting' }),
  Object.freeze({ id: 'cousins', name: 'VEER + ISHAN', label: 'Veer and Ishan', doorArt: BOO_BA_DOOR.doorArt, people: Object.freeze([{ id: 'veer', name: 'Veer', art: family('VEER') }, { id: 'ishan', name: 'Ishan', art: family('ISHAN') }]), knock: 'halloween_cousins_knock', greeting: 'halloween_cousins_greeting' }),
]);
export const BOO_PUMPKIN_GLYPH = Object.freeze({ id: 'pumpkin-face', name: 'pumpkin face', strokes: Object.freeze(['M35 42L35 43', 'M65 42L65 43', 'M35 59Q50 75 65 59']) });
export const BOO_PUMPKIN_ART = 'halloween/pumpkin-paper-v1';
export function booFamilyDoor(id) { return BOO_FAMILY_DOORS.find(row => row.id === id) || BOO_FAMILY_DOORS[0]; }
export function booHasDoorInk(snapshot) {
  return (snapshot?.strokes || []).some(stroke => Array.isArray(stroke) && stroke.some(point => Number.isFinite(point?.x) && Number.isFinite(point?.y)));
}
export function booSharingProgress(value) {
  const treats = Math.max(0, Math.min(2, Math.trunc(Number(value?.treats) || 0)));
  return { treats, complete: treats === 2 && value?.complete === true, gifts: [treats >= 1, treats >= 2] };
}

export function booMode(id) { return BOO_MODES.find(mode => mode.id === id) || BOO_MODES[0]; }

// Exactly Bridge's definition of an honest sweeping mark. No score, shape,
// closure, direction or handwriting-recognition result can hold this door shut.
export function booHasAttempt(snapshot) { return drawingHasMarks(snapshot?.strokes); }

export function booDrawingOptions(mode) {
  return { glyph: BOO_GLYPH, level: booMode(mode).level, autoEvaluate: false, detectScribble: false };
}

export function booDoorProgress(value) {
  const treats = Math.max(0, Math.min(BOO_BA_DOOR.treats, Math.trunc(Number(value?.treats) || 0)));
  return { treats, complete: value?.complete === true && treats === BOO_BA_DOOR.treats };
}

export function booNextTreat(value) {
  const current = booDoorProgress(value);
  const treats = Math.min(BOO_BA_DOOR.treats, current.treats + 1);
  return { treats, complete: treats === BOO_BA_DOOR.treats };
}

export function booPaperSize(width, height) {
  return Math.max(0, Math.min(Number(width) || 0, Number(height) || 0) - 2);
}

// Only used to locate the added eyes. The source PNG and saved paths are not
// cropped, normalised or rewritten when a ghost wakes up.
export function booFace(snapshot) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, found = false;
  for (const stroke of snapshot?.strokes || []) for (const point of stroke) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) continue;
    found = true; left = Math.min(left, point.x); right = Math.max(right, point.x);
    top = Math.min(top, point.y); bottom = Math.max(bottom, point.y);
  }
  if (!found) return { x: 50, y: 45, spread: 12 };
  return { x: (left + right) / 2, y: top + (bottom - top) * .42, spread: Math.max(5, Math.min(14, (right - left) * .18)) };
}
