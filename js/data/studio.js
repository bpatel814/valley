import { halloweenActive } from './season.js';
// Open Rainbow Studio materials. Trays page at five items so every choice stays large.
export const STUDIO_PAGE_SIZE = 5;

export const STUDIO_COLORS = Object.freeze([
  { id: "berry", label: "pink", value: "#f2799b" },
  { id: "sun", label: "yellow", value: "#e8c73c" },
  { id: "leaf", label: "green", value: "#4fc38a" },
  { id: "sky", label: "blue", value: "#5aa9e6" },
  { id: "plum", label: "purple", value: "#9a7fe0" },
  { id: "cocoa", label: "brown", value: "#7b5547" },
]);

export const STUDIO_TOOLS = Object.freeze([
  { id: "brush", label: "rainbow brush" },
  { id: "stamp", label: "picture stamps" },
]);

export const STUDIO_STAMPS = Object.freeze([
  { id: "pip", label: "Pip", kind: "art", art: "characters/pip_idle" },
  { id: "unicorn", label: "unicorn", kind: "art", art: "characters/unicorn_idle" },
  { id: "butterfly", label: "butterfly", kind: "art", art: "characters/butterfly_open" },
  { id: "caterpillar", label: "caterpillar", kind: "art", art: "characters/caterpillar_idle" },
  { id: "veer", label: "Veer", kind: "art", art: "characters/veer_idle" },
  { id: "sun", label: "sun", kind: "art", art: "stickers/draw_sun", drawing: "sun" },
  { id: "rainbow", label: "rainbow", kind: "art", art: "stickers/draw_rainbow", drawing: "rainbow" },
  { id: "flower", label: "flower", kind: "art", art: "stickers/draw_flower", drawing: "flower" },
  { id: "house", label: "house", kind: "art", art: "stickers/draw_house", drawing: "house" },
  { id: "balloon", label: "balloon", kind: "art", art: "stickers/draw_balloon", drawing: "balloon" },
  { id: "heart", label: "heart", kind: "art", art: "stickers/draw_heart", drawing: "heart" },
  { id: "star", label: "star", kind: "art", art: "stickers/draw_star", drawing: "star" },
]);

// Stable costume IDs are always valid in saved documents, even off season.
export const HALLOWEEN_STUDIO_STAMPS = Object.freeze([
  { id: "halloween-pip", label: "Pip in costume", kind: "art", art: "halloween/refresh/pip" },
  { id: "halloween-unicorn", label: "wizard unicorn", kind: "art", art: "halloween/refresh/unicorn" },
  { id: "halloween-butterfly", label: "Halloween butterfly", kind: "art", art: "halloween/refresh/butterfly-open" },
  { id: "halloween-caterpillar", label: "pumpkin caterpillar", kind: "art", art: "halloween/refresh/caterpillar" },
]);
export const ALL_STUDIO_STAMPS = Object.freeze([...STUDIO_STAMPS, ...HALLOWEEN_STUDIO_STAMPS]);
export function studioStampChoices(preferences = {}, date = new Date()) {
  return halloweenActive(preferences, date) ? ALL_STUDIO_STAMPS : STUDIO_STAMPS;
}

export const STUDIO_COLOR_BY_ID = Object.freeze(Object.fromEntries(STUDIO_COLORS.map((item) => [item.id, item])));
export const STUDIO_STAMP_BY_ID = Object.freeze(Object.fromEntries(ALL_STUDIO_STAMPS.map((item) => [item.id, item])));

export function trayPage(items, page, size = STUDIO_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const n = Math.max(1, Math.ceil(list.length / size));
  const current = Math.max(0, Math.min(n - 1, Number.isFinite(page) ? Math.floor(page) : 0));
  return { items: list.slice(current * size, current * size + size), page: current, pages: n };
}

export function nextTrayPage(items, page, direction = 1, size = STUDIO_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil((Array.isArray(items) ? items.length : 0) / size));
  return ((Math.floor(page || 0) + (direction < 0 ? -1 : 1)) % pages + pages) % pages;
}

/** Uniformly contain a stable logical paper inside the live canvas. */
export function studioPaperFrame(aspect, width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const a = Math.max(0.45, Math.min(2.5, Number(aspect) || (w / h)));
  let frameWidth = w;
  let frameHeight = frameWidth / a;
  if (frameHeight > h) {
    frameHeight = h;
    frameWidth = frameHeight * a;
  }
  return {
    x: (w - frameWidth) / 2,
    y: (h - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
    aspect: a,
  };
}

export function studioPaperToCanvas(point, aspect, width, height) {
  const frame = studioPaperFrame(aspect, width, height);
  return {
    x: frame.x + Math.max(0, Math.min(1, Number(point && point.x) || 0)) * frame.width,
    y: frame.y + Math.max(0, Math.min(1, Number(point && point.y) || 0)) * frame.height,
  };
}

export function studioCanvasToPaper(point, aspect, width, height) {
  const frame = studioPaperFrame(aspect, width, height);
  const x = Number(point && point.x);
  const y = Number(point && point.y);
  const nx = (x - frame.x) / frame.width;
  const ny = (y - frame.y) / frame.height;
  return {
    x: Math.max(0, Math.min(1, Number.isFinite(nx) ? nx : 0)),
    y: Math.max(0, Math.min(1, Number.isFinite(ny) ? ny : 0)),
    inside: Number.isFinite(nx) && Number.isFinite(ny) && nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1,
  };
}

export default {
  STUDIO_COLORS, STUDIO_TOOLS, STUDIO_STAMPS,
  trayPage, nextTrayPage, studioPaperFrame, studioPaperToCanvas, studioCanvasToPaper,
};
