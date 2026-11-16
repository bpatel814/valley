import { WORDS as MEADOW_WORDS } from "../data/words.js";
// characters.js - the cast, and the four things every one of them can do:
// breathe, blink, look at her pen, and react.
//
// Published friends render their generated images in every activity. The old inline SVG
// remains only as a resilient missing-asset fallback and for procedural map props. Live
// progress sits in a separate badge/colour-reveal layer so it never replaces finished art.
//
// Transform layers, outermost first, so two animations never fight over one matrix:
//   .char          placement and size
//   .char-breathe  the 3 s idle breathe (CSS)
//   .char-lean     lookAt body lean (CSS transition)
//   .char-squash   anticipation / payoff / bounce (Web Animations)

import { P, RAINBOW, letterHue } from "./palette.js";
import bus from "./bus.js";
import art from "./art.js";
import { toViewport } from "./fx.js";
import { GLYPHS } from "../data/letters.js";

// Keep the original color reward scale when optional vocabulary grows.
export const UNICORN_COLOR_TARGET = 19;
const STATES = ["idle", "happy", "cheer", "sleepy"];
const PUBLISHED_ART = new Set(["pip", "caterpillar", "unicorn", "butterfly", "cocoon", "veer", "grandma"]);
const VB = 200; // every placeholder is drawn in a 200 x 200 box
const OUT = 5; // outline weight at 200 units (docs/STYLE_BIBLE.md)

function reduced() {
  return (
    document.documentElement.classList.contains("reduced-motion") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Deterministic manifest-key plan, exported so mappings can be pinned without a DOM. */
export function characterArtPlan(name, state = "idle") {
  const safeState = STATES.includes(state) ? state : "idle";
  if (name === "grandma") {
    return { mode: "state", primary: [`characters/family_grandma_${safeState}`, "characters/family_grandma_idle", `characters/grandma_${safeState}`, "characters/grandma_idle"], alternate: [] };
  }
  if (name === "unicorn") {
    return {
      mode: "unicorn-progress",
      primary: [`characters/unicorn_${safeState}_grey`, "characters/unicorn_idle_grey"],
      alternate: [`characters/unicorn_${safeState}`, "characters/unicorn_idle"],
    };
  }
  if (name === "butterfly") {
    const closed = safeState === "sleepy";
    return {
      mode: closed ? "butterfly-closed" : "butterfly-flap",
      primary: [closed ? "characters/butterfly_closed" : "characters/butterfly_open"],
      alternate: closed ? [] : ["characters/butterfly_closed"],
    };
  }
  return {
    mode: "state",
    primary: [`characters/${name}_${safeState}`, `characters/${name}_idle`, `characters/${name}`],
    alternate: [],
  };
}

/* ======================================================================
   SVG parts
   ====================================================================== */

function eye(cx, cy, rx, ry) {
  const range = (rx * 2 * 0.12).toFixed(2); // pupils move up to 12% of eye width
  return (
    `<g class="char-eye">` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${P.paper}" stroke="${P.ink}" stroke-width="${OUT * 0.8}"/>` +
    `<ellipse class="char-pupil" data-range="${range}" cx="${cx}" cy="${cy + ry * 0.12}" rx="${(rx * 0.5).toFixed(1)}" ry="${(ry * 0.56).toFixed(1)}" fill="${P.ink}"/>` +
    `<circle cx="${(cx + rx * 0.34).toFixed(1)}" cy="${(cy - ry * 0.34).toFixed(1)}" r="${(rx * 0.24).toFixed(1)}" fill="${P.paper}"/>` +
    `</g>`
  );
}

function mouth(cx, cy, w) {
  const h = w * 0.42;
  const s = `stroke="${P.ink}" stroke-width="${OUT}" stroke-linecap="round" fill="none"`;
  return (
    `<path class="char-mouth-idle" d="M${cx - w / 2} ${cy} Q${cx} ${cy + h} ${cx + w / 2} ${cy}" ${s}/>` +
    `<path class="char-mouth-happy" d="M${cx - w * 0.62} ${cy - 2} Q${cx} ${cy + h * 1.5} ${cx + w * 0.62} ${cy - 2}" ${s}/>` +
    `<path class="char-mouth-cheer" d="M${cx - w * 0.5} ${cy - 2} Q${cx} ${cy + h * 2} ${cx + w * 0.5} ${cy - 2} Z" fill="${P.pinkDeep}" stroke="${P.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>` +
    `<path class="char-mouth-sleepy" d="M${cx - w * 0.3} ${cy + 2} Q${cx} ${cy + h * 0.5} ${cx + w * 0.3} ${cy + 2}" ${s}/>`
  );
}

function blush(x1, x2, y, r) {
  return (
    `<circle cx="${x1}" cy="${y}" r="${r}" fill="${P.pink}" opacity=".8"/>` +
    `<circle cx="${x2}" cy="${y}" r="${r}" fill="${P.pink}" opacity=".8"/>`
  );
}

/** A glyph path from letters.js placed inside the 200-box at a given scale. */
function glyphMark(ch, x, y, scale, color) {
  const g = GLYPHS[ch] || GLYPHS[String(ch || "").toUpperCase()];
  if (!g) return "";
  return (
    `<g class="char-letter" transform="translate(${x} ${y}) scale(${scale})">` +
    g.strokes
      .map(
        (d) =>
          `<path d="${d}" fill="none" stroke="${color || P.ink}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join("") +
    `</g>`
  );
}

/* ---- caterpillar ------------------------------------------------------- */

function caterpillar(o) {
  const segs = clamp(o.segments | 0, 0, 6);
  let s = "";
  // body, back to front, so the front segments overlap the ones behind them
  for (let i = 6; i >= 1; i--) {
    const cx = 150 - 22 * i;
    const cy = 120 + (i % 2 ? -5 : 5);
    const r = 27 - 1.7 * i;
    const on = i <= segs;
    // An unfed segment is present but uncoloured: nearly paper, never a dead grey lump.
    s +=
      `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.96}" fill="${on ? P.mint : "#f1eeea"}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
      (on
        ? `<path d="M${cx - r * 0.5} ${cy + r * 0.55} Q${cx} ${cy + r * 0.95} ${cx + r * 0.5} ${cy + r * 0.55}" fill="none" stroke="${P.mintDeep}" stroke-width="3.5" stroke-linecap="round"/>`
        : "");
  }
  // antennae
  s +=
    `<path d="M144 88 C142 66 148 56 156 50" fill="none" stroke="${P.ink}" stroke-width="${OUT}" stroke-linecap="round"/>` +
    `<circle cx="157" cy="47" r="6" fill="${P.lemon}" stroke="${P.ink}" stroke-width="4"/>` +
    `<path d="M166 92 C170 74 178 66 186 62" fill="none" stroke="${P.ink}" stroke-width="${OUT}" stroke-linecap="round"/>` +
    `<circle cx="187" cy="59" r="6" fill="${P.lemon}" stroke="${P.ink}" stroke-width="4"/>`;
  // face segment
  s +=
    `<circle cx="150" cy="114" r="33" fill="${P.peach}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    blush(128, 172, 128, 8) +
    eye(140, 108, 11, 13) +
    eye(166, 108, 11, 13) +
    mouth(152, 128, 22);
  // the leaf it carries, with its letter on it
  if (o.letter) {
    s =
      `<path d="M18 80 C16 34 58 12 100 20 C102 62 62 92 18 80 Z" fill="${P.mint}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
      `<path d="M18 80 C34 70 62 54 92 30" fill="none" stroke="${P.mintDeep}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M18 80 L6 98" fill="none" stroke="${P.ink}" stroke-width="${OUT}" stroke-linecap="round"/>` +
      glyphMark(o.letter, 32, 22, 0.46, P.ink) +
      s;
  }
  return s;
}

/* ---- unicorn ----------------------------------------------------------- */

// Toddler-book proportions: a big round head on a small pony body, so the eyes (and the
// mane she is earning back) are the biggest things on screen.
function unicorn(o) {
  const n = clamp(o.stripes | 0, 0, 10);
  const leg = (x) =>
    `<rect x="${x}" y="158" width="17" height="28" rx="8.5" fill="${P.paper}" stroke="${P.ink}" stroke-width="${OUT}"/>`;
  let s = leg(124) + leg(148);

  // tail: the last strands to get their colour back, after the whole mane
  for (let i = 0; i < 3; i++) {
    const on = n > 6 + i;
    s += `<path d="M152 ${124 + i * 9} C182 ${116 + i * 9} 186 ${152 + i * 7} ${164 - i * 5} ${168 + i * 4}" fill="none" stroke="${on ? RAINBOW[i] : P.grey}" stroke-width="11" stroke-linecap="round"/>`;
  }

  s += `<ellipse cx="110" cy="140" rx="47" ry="34" fill="${P.paper}" stroke="${P.ink}" stroke-width="${OUT}"/>`;
  s += leg(78) + leg(100);

  // ears and head first; the mane is drawn ON TOP of both, because the six stripes are
  // the whole reward loop of this region and must never hide behind the body.
  s +=
    `<path d="M48 48 C38 24 46 12 68 34 C62 43 55 48 48 48 Z" fill="${P.paper}" stroke="${P.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>` +
    `<path d="M94 40 C108 16 118 20 114 50 C106 48 99 45 94 40 Z" fill="${P.paper}" stroke="${P.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>` +
    `<circle cx="72" cy="76" r="44" fill="${P.paper}" stroke="${P.ink}" stroke-width="${OUT}"/>`;

  for (let i = 0; i < 6; i++) {
    const x0 = 98 + i * 2;
    const y0 = 38 + i * 13;
    const x1 = 142 + i * 3;
    const y1 = 84 + i * 14;
    s +=
      `<path class="char-stripe" data-i="${i}" pathLength="100" d="M${x0} ${y0} C${x0 + 32} ${y0 - 6} ${x1 + 10} ${y1 - 30} ${x1} ${y1}" ` +
      `fill="none" stroke="${i < n ? RAINBOW[i] : P.grey}" stroke-width="9" stroke-linecap="round"/>`;
  }

  s +=
    `<path d="M61 34 L72 2 L83 34 Z" fill="${P.lilac}" stroke="${P.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>` +
    `<path d="M64 26 L80 26 M67 16 L77 16" fill="none" stroke="${P.lilacDeep}" stroke-width="3.5" stroke-linecap="round"/>` +
    `<ellipse cx="46" cy="100" rx="22" ry="16" fill="${P.peach}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<circle cx="38" cy="96" r="3.5" fill="${P.ink}"/>` +
    blush(30, 106, 82, 9) +
    eye(56, 66, 12, 14) +
    eye(92, 66, 12, 14) +
    mouth(48, 104, 16);
  return s;
}

/* ---- butterflies (pip and the hatched ones) ---------------------------- */

function butterflyArt(o, isPip) {
  const up = isPip ? P.lilac : o.hue || P.lilac;
  const lo = isPip ? P.lemon : o.hue || P.lemon;
  // One wing pair is drawn on the left, then mirrored by an OUTER group: the flap is a
  // CSS transform on .char-wing, and a CSS transform would replace an SVG transform
  // attribute on the same element.
  const wing = (side) =>
    (side === "l" ? "<g>" : `<g transform="translate(${VB} 0) scale(-1 1)">`) +
    `<g class="char-wing" style="transform-origin:100% 50%">` +
    `<path d="M96 98 C60 44 10 40 12 84 C14 120 60 116 96 108 Z" fill="${up}" stroke="${P.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>` +
    `<circle cx="46" cy="76" r="9" fill="${P.paper}" opacity=".75"/>` +
    `<path d="M94 114 C62 120 32 142 52 166 C70 186 92 150 96 126 Z" fill="${lo}" stroke="${P.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>` +
    `</g></g>`;
  return (
    wing("l") +
    wing("r") +
    `<path d="M94 62 C86 40 74 32 64 28" fill="none" stroke="${P.ink}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="62" cy="26" r="5.5" fill="${P.lemon}" stroke="${P.ink}" stroke-width="3.5"/>` +
    `<path d="M106 62 C114 40 126 32 136 28" fill="none" stroke="${P.ink}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="138" cy="26" r="5.5" fill="${P.lemon}" stroke="${P.ink}" stroke-width="3.5"/>` +
    `<ellipse cx="100" cy="110" rx="17" ry="40" fill="${P.peach}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    blush(88, 112, 100, 6) +
    eye(93, 88, 8, 9.5) +
    eye(107, 88, 8, 9.5) +
    mouth(100, 104, 14)
  );
}

/* ---- the rest ---------------------------------------------------------- */

function cocoon() {
  return (
    `<path d="M100 30 L100 8" fill="none" stroke="${P.ink}" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M100 26 C148 48 156 114 128 160 C114 184 86 184 72 160 C44 114 52 48 100 26 Z" fill="${P.lemon}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<path d="M58 82 C86 96 116 94 142 78 M56 112 C86 126 118 122 144 108 M64 142 C88 154 114 152 136 140" fill="none" stroke="${P.lemonDeep}" stroke-width="4" stroke-linecap="round"/>`
  );
}

function veer() {
  return (
    `<rect x="78" y="156" width="19" height="34" rx="9.5" fill="${P.peach}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<rect x="105" y="156" width="19" height="34" rx="9.5" fill="${P.peach}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<rect x="68" y="128" width="66" height="40" rx="16" fill="${P.sky}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<rect x="48" y="100" width="19" height="46" rx="9.5" fill="${P.peach}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<rect x="134" y="100" width="19" height="46" rx="9.5" fill="${P.peach}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<rect x="62" y="96" width="78" height="44" rx="20" fill="${P.mint}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<circle cx="100" cy="62" r="41" fill="${P.peach}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<path d="M61 54 C58 20 142 20 139 54 L130 42 L123 56 L113 38 L104 54 L95 36 L86 52 L76 38 L68 54 Z" fill="${P.ink}"/>` +
    blush(74, 126, 74, 9) +
    eye(86, 62, 11, 12.5) +
    eye(114, 62, 11, 12.5) +
    mouth(100, 80, 24)
  );
}

function grandma() {
  return (
    `<circle cx="100" cy="24" r="19" fill="${P.grey}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<path d="M54 112 C54 96 76 88 100 88 C124 88 146 96 146 112 L150 186 L50 186 Z" fill="${P.lilac}" stroke="${P.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>` +
    `<path d="M100 92 L100 186" fill="none" stroke="${P.lilacDeep}" stroke-width="4"/>` +
    `<circle cx="100" cy="64" r="41" fill="${P.peach}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<path d="M60 58 C62 24 138 24 140 58 C130 40 70 40 60 58 Z" fill="${P.grey}" stroke="${P.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>` +
    blush(68, 132, 80, 10) +
    eye(84, 66, 10, 11) +
    eye(116, 66, 10, 11) +
    `<circle cx="84" cy="66" r="16" fill="none" stroke="${P.ink}" stroke-width="4"/>` +
    `<circle cx="116" cy="66" r="16" fill="none" stroke="${P.ink}" stroke-width="4"/>` +
    `<path d="M100 66 L100 66 M96 62 L104 62" fill="none" stroke="${P.ink}" stroke-width="4" stroke-linecap="round"/>` +
    mouth(100, 86, 22)
  );
}

/** A locked region: a cloud having a nap. Never a padlock. */
function cloud() {
  return (
    `<path d="M44 146 C20 146 12 116 36 106 C32 74 74 58 92 82 C106 50 156 52 164 88 C192 80 204 118 180 134 C172 142 158 146 146 146 Z" fill="${P.paper}" stroke="${P.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>` +
    `<path d="M70 106 C77 116 89 116 96 106" fill="none" stroke="${P.ink}" stroke-width="${OUT}" stroke-linecap="round"/>` +
    `<path d="M110 106 C117 116 129 116 136 106" fill="none" stroke="${P.ink}" stroke-width="${OUT}" stroke-linecap="round"/>` +
    `<path d="M92 128 Q102 136 112 128" fill="none" stroke="${P.ink}" stroke-width="${OUT}" stroke-linecap="round"/>` +
    `<circle cx="168" cy="62" r="8" fill="${P.paper}" stroke="${P.ink}" stroke-width="4"/>` +
    `<circle cx="182" cy="40" r="6" fill="${P.paper}" stroke="${P.ink}" stroke-width="4"/>` +
    `<circle cx="192" cy="22" r="4.5" fill="${P.paper}" stroke="${P.ink}" stroke-width="4"/>`
  );
}

/** The rainbow bridge prop that stands in for a region on the map. */
function bridge(o) {
  const lit = clamp(o.segments === undefined ? 7 : o.segments, 0, 7);
  let s = "";
  for (let i = 0; i < 7; i++) {
    const x0 = 18 + i * 7;
    const x1 = 182 - i * 7;
    const r = (x1 - x0) / 2;
    s += `<path d="M${x0} 150 A ${r} ${r} 0 0 1 ${x1} 150" fill="none" stroke="${i < lit ? RAINBOW[i] : P.grey}" stroke-width="9" stroke-linecap="round"/>`;
  }
  s +=
    `<rect x="14" y="156" width="172" height="18" rx="9" fill="${P.peach}" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<path d="M40 174 L40 190 M80 174 L80 190 M120 174 L120 190 M160 174 L160 190" fill="none" stroke="${P.ink}" stroke-width="${OUT}" stroke-linecap="round"/>`;
  return s;
}

/** Original friendly visitor, separate from every child-authored ghost asset. */
export function friendlyGhostSVG() {
  return `<path d="M43 166V89C43 19 157 19 157 89V166L138 153L119 170L100 153L81 170L62 153Z" fill="${P.paper}" stroke="${P.ink}" stroke-width="${OUT}" stroke-linejoin="round"/>` +
    eye(78, 87, 13, 17) + eye(122, 87, 13, 17) + blush(61, 139, 112, 9) + mouth(100, 115, 25);
}

/** Original word visitor, never a replacement for a child's pumpkin drawing. */
export function friendlyPumpkinSVG() {
  return `<path d="M94 50L89 24Q104 19 112 28L106 51" fill="#a7cba4" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<ellipse cx="100" cy="113" rx="72" ry="66" fill="#f3b976" stroke="${P.ink}" stroke-width="${OUT}"/>` +
    `<path d="M79 50C50 80 50 146 79 174M121 50C150 80 150 146 121 174" fill="none" stroke="#d99659" stroke-width="4"/>` +
    eye(77, 92, 12, 15) + eye(123, 92, 12, 15) + blush(57, 143, 119, 8) + mouth(100, 123, 28);
}

const BUILDERS = {
  ghost: friendlyGhostSVG,
  pumpkin: friendlyPumpkinSVG,
  pip: (o) => butterflyArt(o, true),
  butterfly: (o) => butterflyArt(o, false),
  caterpillar,
  unicorn,
  cocoon,
  veer,
  grandma,
  cloud,
  bridge,
};

function firstArt(keys) {
  for (const key of keys || []) {
    const image = art.get(key);
    if (image && image.src) return { key, image };
  }
  return null;
}

function showImage(el, resolved) {
  if (!el || !resolved) return;
  const { image, key } = resolved;
  el.src = image.src;
  el.dataset.artKey = key;
  const w = Number(image.naturalWidth || image.width);
  const h = Number(image.naturalHeight || image.height);
  if (w > 0 && h > 0) {
    // Copy the decoded source dimensions onto the visible element. This gives the browser
    // the finished painting's native ratio before its own decode completes and prevents a
    // square placeholder flash when a character changes emotional state.
    el.width = w;
    el.height = h;
    el.style.aspectRatio = w + " / " + h;
  } else {
    el.removeAttribute("width");
    el.removeAttribute("height");
    el.style.removeProperty("aspect-ratio");
  }
  el.classList.add("is-shown");
}

function hideImage(el) {
  if (!el) return;
  el.classList.remove("is-shown");
  el.removeAttribute("src");
  el.removeAttribute("width");
  el.removeAttribute("height");
  delete el.dataset.artKey;
  el.style.removeProperty("aspect-ratio");
}

function progressBadge(kind, total, earned) {
  const badge = document.createElement("span");
  badge.className = "char-progress__badge char-progress__badge--" + kind;
  for (let i = 0; i < total; i++) {
    const pip = document.createElement("i");
    pip.className = "char-progress__pip" + (i < earned ? " is-earned" : "");
    pip.dataset.progressI = String(i);
    badge.appendChild(pip);
  }
  return badge;
}

/* ======================================================================
   Character
   ====================================================================== */

export class Character {
  constructor(host, opts = {}) {
    this.o = {
      name: "pip",
      size: null,
      state: "idle",
      letter: "",
      segments: 0,
      stripes: 0,
      hue: null,
      follow: true,
      ...opts,
    };
    this.name = this.o.name;
    this.state = STATES.includes(this.o.state) ? this.o.state : "idle";
    this._beats = [];
    this._timers = [];
    this._offs = [];
    this._lastLook = 0;
    this._dead = false;

    const el = document.createElement("div");
    el.className = "char";
    el.dataset.name = this.name;
    el.dataset.state = this.state;
    if (this.o.size) el.style.setProperty("--char-size", typeof this.o.size === "number" ? this.o.size + "px" : this.o.size);
    el.innerHTML =
      '<div class="char-breathe"><div class="char-lean"><div class="char-squash">' +
      '<svg class="char-svg" viewBox="0 0 ' + VB + " " + VB + '" aria-hidden="true"></svg>' +
      '<img class="char-img char-img--primary" alt="" draggable="false">' +
      '<img class="char-img char-img--alternate" alt="" draggable="false">' +
      '<div class="char-progress" aria-hidden="true"></div>' +
      "</div></div></div>";

    this.el = el;
    this.breatheEl = el.querySelector(".char-breathe");
    this.leanEl = el.querySelector(".char-lean");
    this.sq = el.querySelector(".char-squash");
    this.svg = el.querySelector(".char-svg");
    this.img = el.querySelector(".char-img--primary");
    this.altImg = el.querySelector(".char-img--alternate");
    this.progressEl = el.querySelector(".char-progress");
    this.svg.style.transition = "opacity " + 120 + "ms linear";

    this._draw();
    this._renderProgress();
    this._applyArt();
    if (host) host.appendChild(el);

    this._scheduleBlink();
    if (this.o.follow) {
      this._offs.push(
        bus.on("stroke:move", (d) => {
          const p = toViewport(d);
          if (p) this.lookAt(p.x, p.y);
        })
      );
    }
  }

  /* ---- rendering ---- */

  _draw() {
    const build = BUILDERS[this.name] || BUILDERS.pip;
    this.svg.innerHTML = build(this.o);
    this.eyes = [...this.svg.querySelectorAll(".char-eye")];
    this.pupils = [...this.svg.querySelectorAll(".char-pupil")];
    this.stripes = [...this.svg.querySelectorAll(".char-stripe")];
    if (this.state === "sleepy") this.eyes.forEach((e) => e.classList.add("is-blinking"));
  }

  _applyArt() {
    const published = PUBLISHED_ART.has(this.name);
    if (!published && this.o.art === false) {
      this._hideImages();
      this.svg.style.opacity = "1";
      return;
    }

    const plan = characterArtPlan(this.name, this.state, this.o);
    const primary = firstArt(plan.primary);
    const alternate = firstArt(plan.alternate);
    this.el.dataset.artMode = plan.mode;
    this.el.dataset.artKey = primary ? primary.key : "";
    this.el.classList.toggle("has-published-art", !!(published && primary));

    if (primary) {
      showImage(this.img, primary);
      if (alternate) showImage(this.altImg, alternate);
      else hideImage(this.altImg);
      this.svg.style.opacity = "0";
    } else {
      this._hideImages();
      this.svg.style.opacity = "1";
    }
  }

  _hideImages() {
    hideImage(this.img);
    hideImage(this.altImg);
    this.el.classList.remove("has-published-art");
    delete this.el.dataset.artKey;
    delete this.el.dataset.artMode;
  }

  _renderProgress() {
    const root = this.progressEl;
    if (!root) return;
    root.replaceChildren();
    root.className = "char-progress char-progress--" + this.name;

    if (this.name === "caterpillar") {
      const badge = progressBadge("segments", 6, clamp(this.o.segments | 0, 0, 6));
      root.appendChild(badge);
      if (this.o.letter) {
        const leaf = document.createElement("span");
        leaf.className = "char-progress__leaf";
        leaf.textContent = String(this.o.letter).slice(0, 1);
        root.appendChild(leaf);
      }
    } else if (this.name === "unicorn") {
      const earned = clamp(this.o.stripes | 0, 0, UNICORN_COLOR_TARGET);
      this.el.style.setProperty("--char-fill", (earned / UNICORN_COLOR_TARGET) * 100 + "%");
      root.appendChild(progressBadge("stripes", UNICORN_COLOR_TARGET, earned));
    } else if (this.name === "butterfly") {
      this.el.style.setProperty("--char-accent", this.o.hue || P.lilac);
      const glow = document.createElement("span");
      glow.className = "char-progress__glow";
      root.appendChild(glow);
    }
  }

  /* ---- state ---- */

  set(state) {
    if (!STATES.includes(state) || state === this.state || this._dead) return this;
    this.state = state;
    this.el.dataset.state = state;
    if (state === "sleepy") {
      this.eyes.forEach((e) => e.classList.add("is-blinking"));
    } else {
      this.eyes.forEach((e) => e.classList.remove("is-blinking"));
    }
    this._applyArt();
    return this;
  }

  setLetter(ch) {
    this.o.letter = ch;
    this._draw();
    this._renderProgress();
    return this;
  }

  setSegments(n) {
    this.o.segments = clamp(n | 0, 0, 6);
    this._draw();
    this._renderProgress();
    return this;
  }

  setStripes(n) {
    this.o.stripes = clamp(n | 0, 0, MEADOW_WORDS.length);
    this._draw();
    this._renderProgress();
    this._applyArt();
    return this;
  }

  setHue(h) {
    this.o.hue = h;
    this._draw();
    this._renderProgress();
    return this;
  }

  /* ---- life ---- */

  _later(fn, delay) {
    if (this._dead) return null;
    const timer = setTimeout(() => {
      const index = this._timers.indexOf(timer);
      if (index < 0) return; // A canceled callback may already be queued.
      this._timers.splice(index, 1);
      if (!this._dead) fn();
    }, delay);
    this._timers.push(timer);
    return timer;
  }

  _cancelTimer(timer) {
    clearTimeout(timer);
    const index = this._timers.indexOf(timer);
    if (index >= 0) this._timers.splice(index, 1);
  }

  _scheduleBlink() {
    if (this._dead) return;
    this._later(() => {
      if (this.state !== "sleepy") {
        this.eyes.forEach((e) => e.classList.add("is-blinking"));
        this._later(() => this.eyes.forEach((e) => e.classList.remove("is-blinking")), 120);
      }
      this._scheduleBlink();
    }, rnd(3000, 5000));
  }


  /**
   * Pupils move up to 12% of eye width toward the pen; the body leans 3 degrees.
   * x, y are viewport pixels (bus 'stroke:move' gives exactly that).
   */
  lookAt(x, y) {
    if (this._dead) return;
    const now = performance.now();
    if (now - this._lastLook < 90) return;
    this._lastLook = now;
    const r = this.el.getBoundingClientRect();
    if (!r.width) return;
    const dx = clamp((x - (r.left + r.width / 2)) / (r.width * 0.9), -1, 1);
    const dy = clamp((y - (r.top + r.height / 2)) / (r.height * 0.9), -1, 1);
    for (const p of this.pupils) {
      const range = parseFloat(p.dataset.range || "2");
      p.style.transform = `translate(${(dx * range).toFixed(2)}px, ${(dy * range * 0.7).toFixed(2)}px)`;
    }
    this.leanEl.style.transform = `rotate(${(dx * 3).toFixed(2)}deg)`;
  }

  lookForward() {
    for (const p of this.pupils) p.style.transform = "";
    this.leanEl.style.transform = "";
  }

  /* ---- beats ---- */

  _cancelBeats() {
    for (const a of this._beats) {
      try {
        a.cancel();
      } catch {
        /* already gone */
      }
    }
    this._beats.length = 0;
  }

  _beat(frames, duration, easing) {
    if (this._dead || !this.sq.animate) return Promise.resolve();
    this._cancelBeats();
    const a = this.sq.animate(frames, { duration, easing, fill: "forwards" });
    this._beats.push(a);
    return a.finished.then(() => {}).catch(() => {});
  }

  async greet() {
    if (this._dead) return;
    this.set(this.state === 'happy' ? 'cheer' : 'happy');
    // A still smile must survive a paint; reduced motion is not no feedback.
    if (reduced()) return;
    try { await this.bounce(); } finally { if (!this._dead) this.set('idle'); }
  }

  bounce() {
    if (reduced()) return Promise.resolve();
    return this._beat(
      [
        { transform: "translateY(0) scale(1,1)" },
        { transform: "translateY(-9%) scale(0.97,1.05)", offset: 0.4 },
        { transform: "translateY(0) scale(1.03,0.97)", offset: 0.72 },
        { transform: "translateY(0) scale(1,1)" },
      ],
      440,
      "cubic-bezier(.34,1.56,.64,1)"
    ).then(() => this._cancelBeats());
  }

  /** 160 ms squash to .94 y / 1.06 x. Auto-settles if no payoff follows. */
  anticipate() {
    if (reduced()) return Promise.resolve();
    const p = this._beat(
      [{ transform: "scale(1,1)" }, { transform: "scale(1.06,0.94)" }],
      160,
      "cubic-bezier(.55,.06,.68,.19)"
    );
    this._cancelTimer(this._autoSettle);
    this._autoSettle = this._later(() => this.settle(), 700);
    return p;
  }

  settle() {
    this._cancelTimer(this._autoSettle);
    if (reduced()) return Promise.resolve();
    return this._beat(
      [{ transform: "scale(1.06,0.94)" }, { transform: "scale(1,1)" }],
      300,
      "cubic-bezier(.22,.61,.36,1)"
    ).then(() => this._cancelBeats());
  }

  /** anticipation -> payoff -> settle. Totals: 900 / 1360 / 1860 ms, all under the 3 s cap. */
  async celebrate(tier = 2) {
    if (this._dead) return;
    if (reduced()) {
      this.set(tier >= 2 ? "cheer" : "happy");
      await new Promise((r) => setTimeout(r, 400));
      this.set("idle");
      return;
    }
    this._cancelTimer(this._autoSettle);
    const payoff = tier >= 3 ? 1400 : tier === 2 ? 900 : 440;
    this.set(tier >= 3 ? "cheer" : "happy");
    await this._beat([{ transform: "scale(1,1)" }, { transform: "scale(1.06,0.94)" }], 160, "cubic-bezier(.55,.06,.68,.19)");
    if (this._dead) return;
    await this._beat(
      [
        { transform: "scale(1.06,0.94)" },
        { transform: "scale(0.92,1.10) translateY(-6%)", offset: 0.35 },
        { transform: "scale(1.02,0.99) translateY(0)", offset: 0.7 },
        { transform: "scale(1,1) translateY(0)" },
      ],
      payoff,
      "cubic-bezier(.34,1.56,.64,1)"
    );
    if (this._dead) return;
    await this._beat([{ transform: "scale(1,1)" }, { transform: "scale(1,1)" }], 300, "cubic-bezier(.22,.61,.36,1)");
    this._cancelBeats();
    this.set("idle");
  }

  /** Unicorn only: fill mane stripe i left to right with a rainbow shimmer. */
  fillStripe(i, ms = 900) {
    const index = clamp(i | 0, 0, UNICORN_COLOR_TARGET - 1);
    this.o.stripes = Math.max(this.o.stripes | 0, index + 1);
    this._renderProgress();
    this._applyArt();
    const pip = this.progressEl && this.progressEl.querySelector(`[data-progress-i="${index}"]`);
    if (reduced() || !pip || !pip.animate) return Promise.resolve();
    const a = pip.animate([
      { transform: "scale(.65)", filter: "brightness(1)" },
      { transform: "scale(1.7)", filter: "brightness(1.45)", offset: 0.45 },
      { transform: "scale(1)", filter: "brightness(1)" },
    ], {
      duration: ms,
      easing: "cubic-bezier(.34,1.56,.64,1)",
      fill: "forwards",
    });
    this._beats.push(a);
    return a.finished
      .then(() => {
        try {
          a.cancel();
        } catch {
          /* fine */
        }
        this._beats = this._beats.filter((beat) => beat !== a);
      })
      .catch(() => { this._beats = this._beats.filter((beat) => beat !== a); });
  }

  destroy() {
    if (this._dead) return;
    this._dead = true;
    this._cancelBeats();
    for (const t of this._timers) clearTimeout(t);
    this._timers.length = 0;
    for (const off of this._offs) off();
    this._offs.length = 0;
    this.el.remove();
  }
}

/** Convenience for map chips and sticker faces: a character head only, no behaviour. */
export function characterSVG(name, opts = {}) {
  const build = BUILDERS[name] || BUILDERS.pip;
  return (
    '<svg viewBox="0 0 ' + VB + " " + VB + '" aria-hidden="true" style="overflow:visible">' +
    build({ segments: 0, stripes: 0, letter: "", hue: null, ...opts }) +
    "</svg>"
  );
}

/** A glyph drawn on its own, for the level-3 model letter and the word boxes. */
export function glyphSVG(ch, color) {
  const g = GLYPHS[ch] || GLYPHS[String(ch || "").toUpperCase()];
  if (!g) return '<svg viewBox="0 0 100 100" aria-hidden="true"></svg>';
  return (
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    g.strokes
      .map(
        (d) =>
          `<path d="${d}" fill="none" stroke="${color || P.ink}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join("") +
    "</svg>"
  );
}

export { letterHue };
export default Character;
