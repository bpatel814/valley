// palette.js - JS mirror of css/theme.css tokens. docs/STYLE_BIBLE.md is the source of truth.
export const P = {
  paper: "#fffdf8", ink: "#4a3b34",
  pink: "#ffb3c8", pinkDeep: "#f2799b",
  sky: "#bfe3ff", skyDeep: "#5aa9e6",
  mint: "#b8f0d2", mintDeep: "#4fc38a",
  lemon: "#fff2a8", lemonDeep: "#e8c73c",
  lilac: "#d9c7ff", lilacDeep: "#9a7fe0",
  peach: "#ffd3ab", peachDeep: "#f2a565",
  grey: "#dcd7d2",
  skyTop: "#e6f4ff", skyBottom: "#fff7fb",
};

export const RAINBOW = ["#ff9a9e", "#ffc287", "#ffe98a", "#a8e6a1", "#9fd0ff", "#b3aef0", "#dcaef0"];

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = (r) => "#" + r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** Colour at t in [0,1] along the softened rainbow, smoothly interpolated and cyclic. */
export function rainbowAt(t) {
  t = ((t % 1) + 1) % 1;
  const n = RAINBOW.length, f = t * n, i = Math.floor(f), u = f - i;
  const a = hex2rgb(RAINBOW[i % n]), b = hex2rgb(RAINBOW[(i + 1) % n]);
  return rgb2hex(a.map((v, k) => v + (b[k] - v) * u));
}

/** Stable hue per letter so the butterfly for A is always the same colour. */
export function letterHue(ch) {
  const c = String(ch).toUpperCase().charCodeAt(0);
  const idx = c >= 65 && c <= 90 ? c - 65 : c >= 48 && c <= 57 ? 26 + (c - 48) : 0;
  return rainbowAt(idx / 36);
}

export default P;
