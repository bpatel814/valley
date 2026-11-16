// words.js - the Unicorn Meadow word list and its layout maths.
//
// Stable saved catalogue; each Meadow visit gets a varied, family-led choice deck.

import { GLYPHS } from "./letters.js";
import settings from "../state/settings.js";

// Preserve historical ink and rewards under their original spelling. These are
// retired activity names, not aliases for writing a different set of letters.
export const RETIRED_FAMILY_WORDS = Object.freeze({ PAPA: "DADDY", GRANDMA: "BA" });

export const NAME_WORDS = [
  { word: "RAYNA", kind: "name", art: "characters/family_child1_idle" },
  { word: "ISHAN", kind: "name", art: "characters/family_ishan_idle" },
  { word: "VEER", kind: "name", art: "characters/veer_idle" },
  { word: "MAMA", kind: "name", art: "characters/family_adult1_idle" },
  { word: "DADDY", kind: "name", art: "characters/family_adult2_idle" },
  { word: "BA", kind: "name", art: "characters/family_grandma_idle" },
  { word: "DADA", kind: "name", art: "characters/family_grandpa_idle" },
  { word: "MASA", kind: "name", art: "characters/family_adult2_idle", profileOnly: "veer" },
];

export const SHORT_WORDS = [
  { word: "CAT", kind: "word", art: "stickers/draw_cat" },
  { word: "SUN", kind: "word", art: "stickers/draw_sun" },
  { word: "DOG", kind: "word", art: "stickers/meadow_dog" },
  { word: "HAT", kind: "word", art: "stories/hat" },
  { word: "BUG", kind: "word", art: "stickers/draw_caterpillar" },
  { word: "BEE", kind: "word", art: "stories/bee" },
  { word: "PIG", kind: "word", art: "stickers/meadow_pig" },
  { word: "COW", kind: "word", art: "stickers/meadow_cow" },
  { word: "BUS", kind: "word", art: "stickers/meadow_bus" },
  { word: "MOM", kind: "word", art: "characters/family_adult1_idle" },
  { word: "DAD", kind: "word", art: "characters/family_adult2_idle", archivedOnly: true },
];

/** Stable catalogue order for saved progress and the parent view. */
export const HALLOWEEN_WORDS = [
  { word: "BOO", kind: "word", art: "halloween/friendly-ghost-word" },
  { word: "GHOST", kind: "word", art: "halloween/friendly-ghost-word" },
  { word: "CANDY", kind: "word", art: "halloween/candy-v1" },
  { word: "PUMPKIN", kind: "word", art: "halloween/pumpkin-paper-v1" },
];
// Append only: old words and their save/reward identities remain unchanged.
export const WORDS = [...NAME_WORDS, ...SHORT_WORDS, ...HALLOWEEN_WORDS];

function profileWord(entry, profile) {
  if (profile === "veer" && ["DADDY", "DAD"].includes(entry.word)) {
    return { ...entry, art: "characters/family_veer_dad_idle" };
  }
  return entry;
}

export function wordsForProfile(profile = settings.get().valleyProfile) {
  return WORDS.filter((entry) => !entry.archivedOnly && (!entry.profileOnly || entry.profileOnly === profile))
    .map((entry) => profileWord(entry, profile));
}

/** A shuffled visit, with a relative among its first three pictured choices. */
export function wordsForLevel(level = "explore", random = Math.random, profile = settings.get().valleyProfile) {
  const deck = wordsForProfile(profile);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  if (profile === "veer") {
    const cousins = new Set(["VEER", "RAYNA", "ISHAN"]);
    return [...deck.filter((entry) => cousins.has(entry.word)), ...deck.filter((entry) => !cousins.has(entry.word))];
  }
  // Keep a short starting word at the more independent levels.
  if (level === "grow" || level === "challenge") {
    const i = deck.findIndex((entry) => entry.kind === "word" && entry.word.length <= 3);
    [deck[0], deck[i]] = [deck[i], deck[0]];
  }
  if (!deck.slice(0, 3).some(isRelative)) {
    const i = deck.findIndex(isRelative);
    const slot = 1 + Math.floor(random() * 2);
    [deck[slot], deck[i]] = [deck[i], deck[slot]];
  }
  return deck;
}

function isRelative(entry) {
  if (settings.get().valleyProfile === "veer") return ["VEER", "RAYNA", "ISHAN"].includes(entry.word);
  return entry.kind === "name" && entry.word !== "RAYNA";
}

/** Two fresh choices; retain a family invitation even when resuming an older word. */
export function nextWordChoices(deck, current, seen = new Set()) {
  const available = deck.filter((entry) => entry.word !== current);
  const fresh = available.filter((entry) => !seen.has(entry.word));
  const choices = [...fresh, ...available.filter((entry) => seen.has(entry.word))].slice(0, 2);
  const hasMetFamily = [...seen].some((word) => isRelative(wordInfo(word) || {}));
  if (!hasMetFamily && !isRelative(wordInfo(current) || {}) && !choices.some(isRelative)) {
    const relative = available.find(isRelative);
    if (relative) choices[1] = relative;
  }
  return choices;
}

/** Look a word up by its letters, e.g. wordInfo("CAT") -> {word, kind}. */
export function wordInfo(word) {
  const w = String(word || "").toUpperCase();
  const entry = WORDS.find((e) => e.word === w);
  return entry ? profileWord(entry, settings.get().valleyProfile) : null;
}

/** The glyph record for every letter of a word, in order. Unknown letters are skipped. */
export function wordGlyphs(word) {
  return String(word || "")
    .toUpperCase()
    .split("")
    .map((ch) => GLYPHS[ch])
    .filter(Boolean);
}

/** Gap between letter boxes, as a fraction of one box. */
export const WORD_GAP = 0.06;

/**
 * layoutWord(word, areaW, areaH) -> [{x, y, w, h}, ...]
 * One square box per letter, left to right, as big as fits with 6 percent gaps, the row
 * centred in the area both ways. Boxes are glyph boxes: the scorer maps 0..100 into them.
 */
export function layoutWord(word, areaW, areaH) {
  const n = String(word || "").length;
  if (!n || areaW <= 0 || areaH <= 0) return [];
  const span = n + WORD_GAP * (n - 1);          // total width in units of one box
  const size = Math.min(areaW / span, areaH);
  const totalW = size * span;
  const x0 = (areaW - totalW) / 2;
  const y = (areaH - size) / 2;
  const step = size * (1 + WORD_GAP);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: x0 + i * step, y, w: size, h: size });
  return out;
}

export default WORDS;
