// stickers.js - every sticker the valley can give her, and nothing about how it looks.
//
// A sticker is earned, never bought or bundled: one butterfly per hatched letter, one gem
// per word that gives the unicorn a stripe, one per finished drawing, plus the six
// moments worth remembering. The labels are for the parent corner; she never reads them.

import { letterHue, rainbowAt } from "../world/palette.js";
import { UPPER, LOWER, DIGITS } from "./letters.js";
import { RETIRED_FAMILY_WORDS, WORDS as WORD_CATALOG } from "./words.js";

export const STICKER_PREWRITING = ["rain", "path", "hill", "rainbow", "bubble", "rocketTrail", "cross"];

export const STICKER_WORDS = WORD_CATALOG.map((entry) => entry.word);

export const STICKER_DRAWINGS = [
  "sun", "rainbow", "flower", "house", "balloon", "caterpillar", "cat", "butterfly",
  "fish", "unicorn", "star", "heart", "icecream", "tree", "veer", "pumpkin", "friendlyghost", "spider", "skeleton", "witchhat",
];

const MILESTONES = [
  ["ms_first_hatch", "First butterfly"],
  ["ms_first_word", "First word written"],
  ["ms_first_drawing", "First drawing"],
  ["ms_five_hatches", "Five butterflies"],
  ["ms_veer_high_five", "High five with Veer"],
  ["ms_grandma_hug", "A hug from Ba"],
];

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lookup metadata. Art keys may resolve to a shared original reward illustration. */
export const STICKERS = [
  ...[...UPPER, ...LOWER, ...DIGITS].map((ch) => ({
    id: "butterfly_" + ch,
    kind: "butterfly",
    key: ch,
    label: "Butterfly " + ch,
    art: "stickers/butterfly_" + ch,
    hue: letterHue(ch),
  })),
  ...STICKER_WORDS.map((w) => ({
    id: "gem_" + w,
    kind: "gem",
    key: w,
    label: w + " gem",
    art: "stickers/gem_" + w,
    hue: letterHue(w[0]),
  })),
  ...STICKER_DRAWINGS.map((d, i) => ({
    id: "draw_" + d,
    kind: "draw",
    key: d,
    label: title(d) + " drawing",
    art: "stickers/draw_" + d,
    hue: rainbowAt(i / STICKER_DRAWINGS.length),
  })),
  ...STICKER_PREWRITING.map((id, i) => ({
    id: "prewriting_" + id,
    kind: "prewriting",
    key: id,
    label: title(id.replace(/([A-Z])/g, " $1")) + " trail",
    art: "stickers/draw_rainbow",
    hue: rainbowAt(i / STICKER_PREWRITING.length),
  })),
  ...MILESTONES.map(([id, label], i) => ({
    id,
    kind: "milestone",
    key: id.replace(/^ms_/, ""),
    label,
    art: "stickers/" + id,
    hue: rainbowAt((i + 0.5) / MILESTONES.length),
  })),
];

const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

/** stickerFor('butterfly','R') / ('gem','RAYNA') / ('draw','sun') / ('milestone','first_hatch') */
export function stickerFor(kind, key) {
  if (kind === "milestone") {
    const k = String(key || "").replace(/^ms_/, "");
    return BY_ID.get("ms_" + k) || null;
  }
  if (kind === "flower") {
    const n = Math.max(1, Number.parseInt(key, 10) || 1);
    return { id: "flower_" + n, kind: "flower", key: String(n), label: "Journey flower", art: "stickers/draw_flower", hue: rainbowAt((n - 1) / 7) };
  }
  if (kind === "butterfly") {
    const raw = String(key || "");
    return BY_ID.get("butterfly_" + raw) || BY_ID.get("butterfly_" + raw.toUpperCase()) || BY_ID.get("butterfly_" + raw.toLowerCase()) || null;
  }
  const k = kind === "draw" || kind === "prewriting" ? String(key || "") : String(key || "").toUpperCase();
  return BY_ID.get(kind + "_" + k) || null;
}

export function stickerById(id) {
  const hit = BY_ID.get(id);
  if (hit) return hit;
  const oldWord = String(id || "").replace(/^gem_/, "");
  if (String(id).startsWith("gem_") && RETIRED_FAMILY_WORDS[oldWord]) {
    return { ...BY_ID.get("gem_" + RETIRED_FAMILY_WORDS[oldWord]), id };
  }
  const flower = /^flower_(\d+)$/.exec(String(id || ""));
  return flower ? stickerFor("flower", flower[1]) : null;
}

export default STICKERS;
