// Rayna's Valley: a responsive, persistent puppet stage for child-led play.
import { PenInput } from "../../engine/pen.js";
import settings from "../../state/settings.js";
import db from "../../state/db.js";
import resume from "../../state/resume.js";
import {
  PLAY_STAGE_MAX_ACTORS,
  PLAY_STAGE_MAX_PROPS,
  blankPlayStageScene,
  normalisePlayStageBuild,
  applyPlayStageAction,
  undoPlayStage,
  playStageCanUndo,
  savePlayStageCurrent,
  loadPlayStageCurrent,
  savePlayStagePostcard,
  reopenPlayStagePostcard,
  loadPlayStagePostcard,
  listPlayStageSources,
  flushPlayStageCheckpointWrites,
  PLAY_STAGE_MAX_BEATS,
  beginPlayStagePerformance,
  recordPlayStageBeat,
  playStagePerformanceFrame,
  PLAY_STAGE_MAX_ROUTE_POINTS,
  setPlayStageParadeDraft,
} from "../../state/play-stage.js";
import { PLAY_STAGE_PERFORMANCES, playStagePerformanceInvitation, playStagePerformanceProgress } from "../../data/play-stage-performances.js";
import { STAGE_STORY_EPISODES, STAGE_STORY_PROMPTS, stageStoryContext, stageStoryCanHold, stageStoryResultCue } from '../../data/stage-story-day.js';
import { PLAY_STAGE_PHRASES } from '../../data/play-stage-phrases.js';
import discoveryState from "../../state/discovery.js";
import { discoveryBuildPreview } from "./discovery.js";
import router, { iconSVG, muteButton, tapify } from "../router.js";
import art from "../art.js";
import bus from "../bus.js";
import { installIdleHelp } from "../idle-help.js";
import session from "../../state/session.js";
import speech from "../../audio/speech.js";
import sfx from "../../audio/sfx.js";
import { checkpointLivingScene, BandSound, instrumentPicture } from "./music-band.js";
import { normalizePictureShowSource, pictureShowPlan, PICTURE_SHOW_MAX_PNG_CHARS } from "../../data/picture-show.js";
import { MUSIC_INSTRUMENTS } from "../../data/music-band.js";
import { isLocalPNG } from "../../state/creation-frame.js";
import { loadToyWorkshop, getToyWorkshop } from "../../state/toy-workshop.js";
import { savedWorld } from "../../state/saved-world.js";

/** Idle help must yield to every active interaction and any parent break. */
export function stageIdleEligible(controller, { route, moving, locked, speaking } = {}) {
  const c = controller;
  return !!c?.alive && route === "play-stage" && !moving && !locked && !speaking
    && !c.guide && !c.overlay && !c.gesture && !c.saving && !c.preparing && !c.checkpointing
    && !c.replay && !c.pictureShowRun && !c.paradeDraft && !c.paradeRun && !c.recording;
}

/** Brief visual invitation only: it never moves or selects the child's work. */
export function showStageIdleCue(target, { delay = setTimeout, cancel = clearTimeout, reduced = false } = {}) {
  if (!target || target.disabled) return null;
  target.classList.add("is-stage-idle-cue");
  if (reduced) target.classList.add("is-stage-idle-static");
  let cleared = false;
  const clear = () => { if (cleared) return; cleared = true; target.classList.remove("is-stage-idle-cue"); target.classList.remove("is-stage-idle-static"); };
  const timer = delay(clear, 2400);
  return () => { cancel(timer); clear(); };
}

/** Resolve only an explicitly chosen, accessible puppet in this world's store. */
export function resolvePlayStagePuppetToy(workshop, toyId, child = savedWorld.id) {
  const toy = workshop?.toys?.find(row => row.id === toyId && row.behavior === 'puppet'
    && ['rayna', 'veer', 'shared'].includes(row.owner)
    && (child === 'shared' || row.owner === child || row.owner === 'shared'));
  const asset = toy && workshop.assets.find(row => row.id === toy.asset);
  if (!asset || !isLocalPNG(asset.png)) return null;
  return { png: asset.png, sourceRef: toy.id, toyRef: toy.id, behavior: 'puppet',
    pattern: [...toy.pattern], name: toy.name };
}

const LAYERS = {
  backdrop: "play-stage/backdrop",
  rear: "play-stage/booth_rear",
  front: "play-stage/booth_front",
  left: "play-stage/curtain_left",
  right: "play-stage/curtain_right",
  foreground: "play-stage/foreground",
  pipPouchBack: "play-stage/pip_pouch_back",
  pipPouchRim: "play-stage/pip_pouch_rim",
};

const ACTORS = Object.freeze({
  rayna: { label: "Rayna", art: "characters/family_child1_idle", canvas: [504, 469], crop: [155, 29, 441, 442], feet: [.621, .945], face: [.607, .309], hand: [.829, .426], canHold: true },
  pip: { label: "Pip", art: "characters/pip_idle", canvas: [409, 425], crop: [8, 8, 401, 417], feet: [.5, .981], face: [205 / 409, 205 / 425], carry: "pouch", canHold: true },
  daddy: { label: "Daddy", art: "characters/family_adult2_idle", canvas: [503, 624], crop: [49, 14, 386, 612], feet: [.499, .955], face: [.499, .228], hand: [.155, .397], canHold: true },
  mama: { label: "Mama", art: "characters/family_adult1_idle", canvas: [504, 589], crop: [87, 14, 392, 577], feet: [.5, .97], face: [.5, .24], hand: [365 / 504, 394 / 589], canHold: true },
  grandma: { label: "Ba", art: "characters/family_grandma_idle", canvas: [480, 640], crop: [116, 16, 363, 624], feet: [.5, .975], face: [.5, .24], hand: [245 / 480, 401 / 640], canHold: true },
  grandpa: { label: "Dada", art: "characters/family_grandpa_idle", canvas: [356, 672], crop: [16, 16, 340, 656], feet: [.5, .976], face: [.5, .23], hand: [306 / 356, 465 / 672], canHold: true },
  veer: { label: "Veer", art: "characters/veer_idle", canvas: [385, 648], crop: [8, 8, 377, 640], feet: [.5, .988], face: [.5, .22], hand: [306 / 385, 478 / 648], canHold: true },
  ishan: { label: "Ishan", art: "characters/family_ishan_idle", canvas: [480, 640], crop: [16, 33, 464, 606], feet: [.5, .947], face: [.5, .25], hand: [245 / 480, 555 / 640], holdKinds: ["toy", "build"], canHold: true },
  "veer-mom": { label: "Veer's mom", art: "characters/family_veer_mom_idle", canvas: [480, 640], crop: [91, 16, 388, 624], feet: [.5, .975], face: [.5, .23], hand: [361 / 480, 435 / 640], canHold: true },
  "veer-dad": { label: "Veer's dad", art: "characters/family_veer_dad_idle", canvas: [480, 640], crop: [105, 16, 374, 624], feet: [.5, .975], face: [.5, .23], hand: [137 / 480, 455 / 640], canHold: true },
});

const ROSTER = Object.keys(ACTORS);
// Source-pixel forehead/ear/chin bounds, measured from the unchanged PNGs.
// These include the outer eyes and cheeks that a face-center check misses.
const FACE_BOUNDS = Object.freeze({
  rayna: [212, 92, 394, 218], daddy: [113, 62, 370, 278], mama: [132, 78, 354, 254],
  grandma: [142, 70, 342, 235], grandpa: [97, 44, 293, 229], veer: [38, 125, 365, 329],
  'veer-mom': [152, 75, 345, 248], 'veer-dad': [110, 76, 361, 268],
});
const TOGETHER_ROSTER = ROSTER.filter((role) => role !== "rayna" && role !== "pip");
const PROP_CHOICES = Object.freeze([
  { id: "heart", kind: "heart", label: "heart", art: "stickers/draw_heart", aspect: 1 },
  { id: "flower", kind: "flower", label: "flower", art: "stickers/draw_flower", aspect: 1 },
  { id: "toy", kind: "toy", label: "ball", art: "stories/ball", aspect: 1 },
]);

const PREVIEW_MAX_EDGE = 768;
const PREVIEW_TARGET_CHARS = 500_000;
// Alpha >64 onset, in 25px columns of the approved 1000x600 foreground PNG.
// The live image is sampled when available; this measured profile also keeps
// deterministic placement in tests and before the foreground image decodes.
const FOREGROUND_PROFILE = { width: 1000, height: 600, step: 25, tops: [
  434, 428, 432, 448, 452, 474, 482, 510, 519, 520,
  512, 512, 551, 554, 559, 554, 545, 551, 568, 569,
  570, 569, 567, 565, 556, 543, 554, 554, 537, 525,
  525, 519, 510, 485, 473, 472, 458, 434, 428, 432,
] };
let sampledForegroundImage, sampledForegroundProfile;

function foregroundProfile() {
  const image = art.get(LAYERS.foreground);
  if (!image?.naturalWidth || !image?.naturalHeight || typeof document === "undefined") return FOREGROUND_PROFILE;
  if (sampledForegroundImage === image) return sampledForegroundProfile;
  try {
    const width = image.naturalWidth, height = image.naturalHeight;
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, width, height).data;
    const step = Math.max(1, Math.ceil(width / 40));
    const tops = [];
    for (let left = 0; left < width; left += step) {
      let top = height;
      for (let y = 0; y < height && top === height; y++) {
        for (let x = left; x < Math.min(left + step, width); x++) {
          if (rgba[(y * width + x) * 4 + 3] > 64) { top = y; break; }
        }
      }
      tops.push(top);
    }
    sampledForegroundImage = image;
    sampledForegroundProfile = { width, height, step, tops };
    return sampledForegroundProfile;
  } catch { return FOREGROUND_PROFILE; }
}

export function playStageForegroundTop(layout, bounds, profile = FOREGROUND_PROFILE) {
  const scale = Math.max(layout.width / profile.width, layout.height / profile.height);
  const offsetX = (layout.width - profile.width * scale) / 2;
  const offsetY = (layout.height - profile.height * scale) / 2;
  const left = clamp(Math.floor((bounds.x - offsetX) / scale / profile.step), 0, profile.tops.length - 1);
  const right = clamp(Math.floor((bounds.x + bounds.width - offsetX) / scale / profile.step), 0, profile.tops.length - 1);
  let top = profile.height;
  for (let index = left; index <= right; index++) top = Math.min(top, profile.tops[index]);
  return offsetY + top * scale;
}
const SHA256_K = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
];

export function playStageSha256(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength); padded.set(input); padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const words = new Uint32Array(64);
  const rotate = (value, count) => (value >>> count) | (value << (32 - count));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = words[i - 15], b = words[i - 2];
      words[i] = (words[i - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) + words[i - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let [a,b,c,d,e,f,g,i] = h;
    for (let j = 0; j < 64; j++) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (i + s1 + choose + SHA256_K[j] + words[j]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      i = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    for (const [index, value] of [a,b,c,d,e,f,g,i].entries()) h[index] = (h[index] + value) >>> 0;
  }
  return h.map((word) => word.toString(16).padStart(8, "0")).join("");
}

// The gallery keeps the original PNG. The stage embeds a complete, uniformly
// reduced copy so a later gallery deletion cannot blank an editable scene.
export async function preparePlayStagePicture(source) {
  if (!source?.png?.startsWith("data:image/png;base64,")) return null;
  const image = await imageForSource(source.png);
  if (!image?.naturalWidth || !image?.naturalHeight) return null;
  const bytes = await (await fetch(source.png)).arrayBuffer();
  const sourceHash = globalThis.crypto?.subtle
    ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("")
    : playStageSha256(bytes);
  const originalWidth = image.naturalWidth, originalHeight = image.naturalHeight;
  let edge = Math.min(PREVIEW_MAX_EDGE, Math.max(originalWidth, originalHeight));
  for (let attempt = 0; attempt < 18; attempt++) {
    const scale = edge / Math.max(originalWidth, originalHeight);
    const previewWidth = Math.max(1, Math.round(originalWidth * scale));
    const previewHeight = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement("canvas"); canvas.width = previewWidth; canvas.height = previewHeight;
    canvas.getContext("2d").drawImage(image, 0, 0, previewWidth, previewHeight);
    const preview = canvas.toDataURL("image/png");
    if (preview.length <= PREVIEW_TARGET_CHARS) return { preview, sourceHash, originalWidth, originalHeight, previewWidth, previewHeight, aspect: originalWidth / originalHeight };
    edge = Math.floor(edge * .78);
    if (edge < 16) break;
  }
  return null;
}

/** Inspect dimensions only. The child's transported PNG is never redrawn. */
export async function prepareExactPlayStagePicture(source) {
  if (!isLocalPNG(source?.png) || source.png.length > PICTURE_SHOW_MAX_PNG_CHARS) return null;
  const image = await imageForSource(source.png);
  if (!image?.naturalWidth || !image?.naturalHeight || image.naturalWidth / image.naturalHeight < .2 || image.naturalWidth / image.naturalHeight > 5) return null;
  return { preview: source.png, aspect: image.naturalWidth / image.naturalHeight, originalWidth: image.naturalWidth, originalHeight: image.naturalHeight };
}

let discoveryStyles;
export async function preparePlayStageBuild(rawBuild) {
  const build = normalisePlayStageBuild(rawBuild);
  if (!build) return null;
  const markup = discoveryBuildPreview(build);
  if (!markup) return null;
  if (!discoveryStyles) {
    discoveryStyles = fetch(new URL("../../../css/discovery.css", import.meta.url))
      .then((response) => response.ok ? response.text() : "").catch(() => "");
  }
  const request = discoveryStyles;
  const styles = await request;
  if (!styles) {
    if (discoveryStyles === request) discoveryStyles = undefined;
    return null;
  }
  // Capture Discovery's own scene, piece markup and CSS once. Later edits to
  // the Discovery build cannot change the stage's embedded PNG or piece list.
  const owned = markup.replace(/<svg\b/g, '<svg xmlns="http://www.w3.org/2000/svg"');
  const captureCSS = `.stage-build-capture{position:relative;width:320px;height:320px;overflow:hidden}
    .stage-build-capture .discovery-owned-build{position:absolute;inset:0}
    .stage-build-capture .discovery-owned-build>.discovery-scene{position:relative;left:auto;top:auto;width:100%;height:100%;transform:none}
    .stage-build-capture .discovery-built span{animation:none!important}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><foreignObject width="320" height="320"><div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${styles}\n${captureCSS}]]></style><div class="stage-build-capture">${owned}</div></div></foreignObject></svg>`;
  const image = await imageForSource(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  if (!image) return null;
  try {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 320;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 320, 320).data;
    let left = 320, top = 320, right = -1, bottom = -1;
    for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
      if (pixels[(y * 320 + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    if (right < left || bottom < top) return null;
    left = Math.max(0, left - 8); top = Math.max(0, top - 8);
    right = Math.min(319, right + 8); bottom = Math.min(319, bottom + 8);
    const cropped = document.createElement("canvas"); cropped.width = right - left + 1; cropped.height = bottom - top + 1;
    cropped.getContext("2d").drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
    const prepared = await preparePlayStagePicture({ png: cropped.toDataURL("image/png") });
    return prepared ? { ...prepared, build } : null;
  } catch { return null; }
}

const ICONS = {
  record: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="7" y="9" width="50" height="46" rx="12" fill="#fff1cf" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="32" r="16" fill="#e45f78" stroke="currentColor" stroke-width="3"/></svg>',
  stop: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="10" width="44" height="44" rx="9" fill="#e45f78" stroke="currentColor" stroke-width="5"/></svg>',
  gift: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="24" width="48" height="32" rx="4" fill="#ffd6e3" stroke="currentColor" stroke-width="4"/><path d="M32 24v32M8 33h48" stroke="#aa5783" stroke-width="7"/><path d="M32 23C6 24 13 1 26 12Zm0 0C58 24 51 1 38 12Z" fill="#ffe98a" stroke="currentColor" stroke-width="3"/></svg>',
  parade: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 57V8m1 0h39L41 20l11 12H13" fill="#b8f0d2" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><path d="m26 49 9-6m6 12 9-6" stroke="#d97b94" stroke-width="8" stroke-linecap="round"/></svg>',
  trail: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M11 50c37 7 43-22 14-24C1 24 18 8 52 10" fill="none" stroke="#8c6449" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 10"/><path d="m39 4 15 6-12 11" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  undo: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M27 16 10 31l17 15V36h13c9 0 14 6 14 16" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  keep: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 16C23 9 13 11 8 14v38c8-3 16-1 24 4 8-5 16-7 24-4V14c-8-3-17-5-24 2Z" fill="#fffdf8" stroke="currentColor" stroke-width="4"/><path d="M32 16v40" stroke="currentColor" stroke-width="4"/><path d="M21 24c-7-7-14 2 0 13 14-11 7-20 0-13Z" fill="#f2799b"/></svg>',
  basket: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 28h38l-5 25H18Z" fill="#ffd3ab" stroke="currentColor" stroke-width="5"/><path d="M21 30c0-20 22-20 22 0M14 39h36M27 29v23m10-23v23" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
  people: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="23" cy="20" r="10" fill="#ffe98a" stroke="currentColor" stroke-width="4"/><circle cx="44" cy="25" r="8" fill="#bfe3ff" stroke="currentColor" stroke-width="4"/><path d="M7 55c0-17 31-17 31 0m0 0c0-13 21-13 21 0" fill="#b8f0d2" stroke="currentColor" stroke-width="4"/></svg>',
  talk: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M9 12h46v33H31L18 55V45H9Z" fill="#fff2b6" stroke="currentColor" stroke-width="5"/><circle cx="24" cy="29" r="3"/><circle cx="32" cy="29" r="3"/><circle cx="40" cy="29" r="3"/></svg>',
  back: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M51 32H13m14-15L12 32l15 15" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hop: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 47h30M24 39l8-9 8 9M32 30V12M23 20l9-9 9 9" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="32" cy="51" rx="20" ry="5" fill="#b8f0d2"/></svg>',
  peek: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 8h48v48H8z" fill="#ffdfa6" stroke="currentColor" stroke-width="4"/><path d="M9 10c20 5 17 23 16 40H9zm46 0c-20 5-17 23-16 40h16z" fill="#f2799b" stroke="currentColor" stroke-width="4"/><circle cx="27" cy="34" r="2.5"/><circle cx="38" cy="34" r="2.5"/></svg>',
  display: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="8" width="44" height="48" rx="5" fill="#ffe98a" stroke="currentColor" stroke-width="5"/><path d="m16 45 12-16 8 8 8-12 5 20z" fill="#b8f0d2" stroke="currentColor" stroke-width="3"/></svg>',
  down: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="8" width="44" height="38" rx="5" fill="#ffe98a" stroke="currentColor" stroke-width="5"/><path d="M32 45v13m-9-9 9 9 9-9" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  help: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="25" fill="#fff2b6" stroke="currentColor" stroke-width="5"/><path d="M23 24c1-13 22-13 22 0 0 10-13 10-13 19" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="51" r="3" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 32h38M38 18l14 14-14 14" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m17 17 30 30m0-30L17 47" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg>',
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n)));

// One measured composition drives the DOM and its hit-target checks. Controls
// occupy their own rails, rather than competing for the illustrated ground.
export function playStageChromeLayout(width, height) {
  const w = Math.max(320, Number(width) || 320), h = Math.max(240, Number(height) || 240);
  const portrait = w <= h;
  const controls = {}, cast = [];
  const rect = (x, y, size) => ({ x, y, width: size, height: size });
  if (portrait) {
    const names = ["back", "home", "undo", "keep", "mute", "shows"];
    const size = Math.max(44, Math.min(64, Math.floor((w - 16 - 30) / 6)));
    const start = (w - 6 * size - 30) / 2;
    names.forEach((name, i) => { controls[name] = rect(start + i * (size + 6), 8, size); });
    const top = size + 20, bottomSize = size, y = h - size - 8;
    controls.basket = rect(start, y, bottomSize); controls.people = rect(start + size + 6, y, bottomSize);
    for (let i = 0; i < 3; i++) cast.push(rect(start + (i + 2) * (size + 6), y, size));
    controls.actions = rect(start + 5 * (size + 6), y, size);
    const surface = { x: 8, y: top, width: w - 16, height: h - top - bottomSize - 20 };
    return { profile: "portrait", width: w, height: h, controls, cast, surface,
      performance: { x: cast[0].x, y, width: 3 * size + 12, height: size, buttonSize: size, rail: true } };
  }
  const compact = h < 440, size = h < 280 ? 44 : h < 480 ? 48 : 64, gap = h < 280 ? 2 : 8, side = size + 24;
  ["back", "home", "undo", "mute"].forEach((name, i) => { controls[name] = rect(8, 8 + i * (size + gap), size); });
  ["keep", "shows", "actions", ...(compact ? ["basket", "people"] : [])].forEach((name, i) => {
    controls[name] = rect(w - size - 8, compact ? Math.max(4, (h - 5 * size - 4 * gap) / 2) + i * (size + gap) : 8 + i * (size + gap), size);
  });
  const available = w - 2 * side;
  if (compact) return { profile: "landscape", compact, width: w, height: h, controls, cast,
    surface: { x: side, y: 8, width: available, height: h - 16 },
    performance: { x: controls.actions.x, y: controls.actions.y, width: size, height: 3 * size + 2 * gap, buttonSize: size, gap, vertical: true, rail: true } };
  const bottomSize = Math.max(44, Math.min(64, Math.floor((available - 24) / 5)));
  const rowWidth = 5 * bottomSize + 24;
  const start = (w - rowWidth) / 2;
  const footerHeight = bottomSize + 20;
  const slot = index => rect(start + index * (bottomSize + 6), h - footerHeight + 12, bottomSize);
  controls.basket = slot(0); controls.people = slot(1);
  for (let i = 0; i < 3; i++) cast.push(slot(i + 2));
  const first = slot(2);
  return { profile: "landscape", width: w, height: h, controls, cast,
    surface: { x: side, y: 8, width: available, height: h - footerHeight - 8 },
    performance: { x: first.x, y: first.y, width: 3 * bottomSize + 12, height: bottomSize, buttonSize: bottomSize, rail: true } };
}

export function playStageLayout(width, height, forcedProfile = "") {
  const w = Math.max(240, Number(width) || 0);
  const h = Math.max(220, Number(height) || 0);
  const profile = forcedProfile || (w > h ? "landscape" : "portrait");
  const portrait = profile === "portrait";
  const actorVisibleHeight = portrait ? clamp(h * 166 / 715, 144, 188) : clamp(h * 156 / 396, 138, 170);
  const preferredBoothWidth = clamp(Math.min(w * .65, 235), 205, 250);
  const boothWidth = portrait ? preferredBoothWidth : Math.min(preferredBoothWidth, (h - 20) * 320 / 340);
  const boothHeight = boothWidth * 340 / 320;
  const booth = {
    x: portrait ? (w - boothWidth) / 2 : w - boothWidth - w * (48 / 723),
    y: portrait ? h * (32 / 715) : h * (24 / 396),
    width: boothWidth,
    height: boothHeight,
  };
  const scale = boothWidth / 320;
  booth.opening = { x: booth.x + 54 * scale, y: booth.y + 108 * scale, width: 213 * scale, height: 147 * scale };
  const ground = portrait
    ? { x0: w * 55 / 396, x1: w * 341 / 396, y0: h * 350 / 715, y1: h * 675 / 715 }
    : { x0: w * 70 / 723, x1: w * 653 / 723, y0: h * 286 / 396, y1: h * 366 / 396 };
  return { v: 1, profile, width: w, height: h, actorVisibleHeight, booth, ground };
}

export function projectPlayStageGround(layout, u, v) {
  return { x: layout.ground.x0 + (layout.ground.x1 - layout.ground.x0) * clamp(u, 0, 1), y: layout.ground.y0 + (layout.ground.y1 - layout.ground.y0) * clamp(v, 0, 1) };
}

export function inversePlayStageGround(layout, x, y) {
  return { u: clamp((x - layout.ground.x0) / (layout.ground.x1 - layout.ground.x0), 0, 1), v: clamp((y - layout.ground.y0) / (layout.ground.y1 - layout.ground.y0), 0, 1) };
}

export function playStageActorGeometry(actor, layout, scene = null) {
  const meta = ACTORS[actor.role] || ACTORS.rayna;
  const cropH = Math.max(1, meta.crop[3] - meta.crop[1]);
  const fullHeight = layout.actorVisibleHeight * meta.canvas[1] / cropH;
  const width = fullHeight * meta.canvas[0] / meta.canvas[1];
  const foot = projectPlayStageGround(layout, actor.u, actor.v);
  const localX = (value) => actor.facing === "left" ? 1 - value : value;
  const left = foot.x - localX(meta.feet[0]) * width;
  const top = foot.y - meta.feet[1] * fullHeight;
  const cropLeft = actor.facing === "left" ? meta.canvas[0] - meta.crop[2] : meta.crop[0];
  const cropTop = meta.crop[1];
  const pxPerSource = width / meta.canvas[0];
  const faceBounds = FACE_BOUNDS[actor.role];
  const geometry = {
    left, top, width, height: fullHeight, foot, viewportHeight: layout.height,
    hit: { left: left + cropLeft * pxPerSource, top: top + cropTop * pxPerSource,
      width: (meta.crop[2] - meta.crop[0]) * pxPerSource,
      height: (meta.crop[3] - meta.crop[1]) * pxPerSource,
      imageLeft: -cropLeft * pxPerSource, imageTop: -cropTop * pxPerSource },
    face: { x: left + localX(meta.face[0]) * width, y: top + meta.face[1] * fullHeight },
    faceRegion: faceBounds ? { x: left + (actor.facing === 'left' ? meta.canvas[0] - faceBounds[2] : faceBounds[0]) * pxPerSource,
      y: top + faceBounds[1] * pxPerSource, width: (faceBounds[2] - faceBounds[0]) * pxPerSource, height: (faceBounds[3] - faceBounds[1]) * pxPerSource } : null,
    hand: meta.hand ? { x: left + localX(meta.hand[0]) * width, y: top + meta.hand[1] * fullHeight } : null,
  };
  if (!scene || actor.hidden) return geometry;
  const offset = playStageActorGroupOffset(actor, scene, layout, geometry);
  return {
    ...geometry, left: left + offset.x, top: top + offset.y,
    foot: { x: foot.x + offset.x, y: foot.y + offset.y },
    hit: { ...geometry.hit, left: geometry.hit.left + offset.x, top: geometry.hit.top + offset.y },
    face: { x: geometry.face.x + offset.x, y: geometry.face.y + offset.y },
    faceRegion: geometry.faceRegion ? { ...geometry.faceRegion, x: geometry.faceRegion.x + offset.x, y: geometry.faceRegion.y + offset.y } : null,
    hand: geometry.hand ? { x: geometry.hand.x + offset.x, y: geometry.hand.y + offset.y } : null,
  };
}

export function playStageHiddenOffset(actor, layout) {
  const geometry = playStageActorGeometry(actor, layout);
  const opening = layout.booth.opening;
  return {
    x: opening.x + (actor.peekSide === "right" ? opening.width - 38 : 38) - geometry.face.x,
    y: opening.y + Math.min(opening.height * .43, 72) - geometry.face.y,
  };
}

export function playStageCanHold(actor, prop) {
  const meta = ACTORS[actor?.role];
  return !!meta?.canHold && (!meta.holdKinds || meta.holdKinds.includes(prop?.kind));
}

function pouchFromActorGeometry(geometry, offset = { x: 0, y: 0 }) {
  const scale = Math.max(geometry.width / 409, 64 / 140);
  const width = 140 * scale, height = 165 * scale;
  const x = geometry.left + geometry.width * .5 + offset.x - width * .5;
  const y = geometry.top + geometry.height * .78 + offset.y - height * .04;
  return { x, y, width, height, scale, item: { x: x + 70 * scale, y: y + 74 * scale, maxWidth: 58 * scale, maxHeight: 30 * scale } };
}

export function playStagePouchGeometry(actor, layout, scene = null) {
  if (actor?.role !== "pip") return null;
  const geometry = playStageActorGeometry(actor, layout, scene);
  const offset = actor.hidden ? playStageHiddenOffset(actor, layout) : { x: 0, y: 0 };
  return pouchFromActorGeometry(geometry, offset);
}

export function playStagePieceOrder(scene) {
  const byDepth = (a, b) => a.z - b.z;
  const hidden = new Set(scene.actors.filter((actor) => actor.hidden).map((actor) => actor.id));
  return {
    hiddenActors: scene.actors.filter((actor) => actor.hidden).sort(byDepth),
    hiddenProps: scene.props.filter((prop) => prop.placement !== "basket" && hidden.has(prop.ownerActorId)).sort(byDepth),
    actors: scene.actors.filter((actor) => !actor.hidden).sort(byDepth),
    props: scene.props.filter((prop) => prop.placement !== "basket" && !hidden.has(prop.ownerActorId)).sort(byDepth),
  };
}

// An explicitly displayed original sits in front of decorative bushes. Keep
// its saved anchor and the ordinary loose, carried and hidden piece paths.
function isDisplayedPicture(prop) {
  return prop.kind === "picture" && prop.placement === "frame" && !prop.ownerActorId;
}

export function playStageParadeDisplayLayout(layout, scale = 1) {
  const baseHeight = layout.actorVisibleHeight / (layout.paradeScale || 1);
  return { ...layout, actorVisibleHeight: baseHeight * scale, paradeScale: scale };
}

export function playStageParadeGroupBounds(actor, scene, layout) {
  const hit = playStageActorGeometry(actor, layout, scene).hit;
  let x = hit.left, y = hit.top, right = x + hit.width, bottom = y + hit.height;
  const include = (box) => { x = Math.min(x, box.x); y = Math.min(y, box.y); right = Math.max(right, box.x + box.width); bottom = Math.max(bottom, box.y + box.height); };
  for (const prop of scene.props.filter((item) => item.ownerActorId === actor.id)) include(playStagePropGeometry(prop, scene, layout).bounds);
  if (actor.role === "pip" && scene.props.some((prop) => prop.ownerActorId === actor.id)) include(playStagePouchGeometry(actor, layout, scene));
  return { x, y, width: right - x, height: bottom - y };
}

// Pack actual sprite and gift bounds, nearest the chosen trail stop. The lead
// selects the route; a forgiving formation can bend into a second row.
export function playStageParadeFormation(scene, rawLayout, point, leaderActorId, previous = point, reserved = []) {
  const order = [...scene.actors].sort((a, b) => (a.id === leaderActorId ? -1 : b.id === leaderActorId ? 1 : 0));
  if (!order.some((actor) => actor.id === leaderActorId)) return null;
  const facing = point.u < previous.u ? "left" : "right", direction = facing === "left" ? -1 : 1;
  let best = null;
  for (const scale of [1, .9, .8]) {
    const layout = playStageParadeDisplayLayout(rawLayout, scale);
    const candidates = order.map((actor, index) => {
      const target = { u: clamp(point.u - direction * index * .25, 0, 1), v: point.v };
      const anchor = projectPlayStageGround(layout, target.u, target.v);
      const xs = [...new Set([target.u, point.u, ...Array.from({ length: 11 }, (_, i) => i / 10)])];
      const ys = [...new Set([target.v, ...Array.from({ length: 11 }, (_, i) => i / 10)])];
      return ys.flatMap((v) => xs.map((u) => {
        const candidate = { ...actor, u, v, hidden: false, facing };
        const candidateScene = { ...scene, actors: scene.actors.map((item) => item.id === actor.id ? candidate : item) };
        const bounds = playStageParadeGroupBounds(candidate, candidateScene, layout);
        const foot = playStageActorGeometry(candidate, layout, candidateScene).foot;
        return { position: { actorId: actor.id, u, v, facing }, bounds,
          score: Math.hypot(foot.x - anchor.x, foot.y - anchor.y) };
      })).filter((candidate) => candidate.bounds.x >= 3 && candidate.bounds.y >= 3
        && candidate.bounds.x + candidate.bounds.width <= layout.width - 3 && candidate.bounds.y + candidate.bounds.height <= layout.height - 3
        && !reserved.some((obstacle) => overlapArea(candidate.bounds, obstacle)))
        .sort((a, b) => a.score - b.score);
    });
    const chosen = [];
    let attempts = 0;
    const place = (index) => {
      if (index === order.length) return true;
      for (const candidate of candidates[index]) {
        if (++attempts > 40_000) return false;
        const padded = { x: candidate.bounds.x - 3, y: candidate.bounds.y - 3, width: candidate.bounds.width + 6, height: candidate.bounds.height + 6 };
        if (chosen.some((other) => overlapArea(padded, other.bounds))) continue;
        chosen.push(candidate);
        if (place(index + 1)) return true;
        chosen.pop();
      }
      return false;
    };
    if (place(0)) {
      const result = { scale, positions: chosen.map((entry) => entry.position), score: chosen[0].score + (1 - scale) * 20 };
      if (!best || result.score < best.score) best = result;
      if (chosen[0].score < 4) return { scale: best.scale, positions: best.positions };
    }
  }
  return best ? { scale: best.scale, positions: best.positions } : null;
}

export function playStageParadeViewportScene(scene, layout, reserved = []) {
  const parade = scene.parade;
  if (!parade?.arranged || !parade.formationLayout || (parade.formationLayout.width === Math.round(layout.width) && parade.formationLayout.height === Math.round(layout.height) && parade.formationLayout.profile === layout.profile)) return scene;
  const point = parade.route[parade.stopIndex];
  const formation = playStageParadeFormation(scene, layout, point, parade.leaderActorId, parade.route[Math.max(0, parade.stopIndex - 1)], reserved);
  if (!formation) return scene;
  return { ...scene, parade: { ...parade, scale: formation.scale }, actors: scene.actors.map((actor) => ({ ...actor, ...formation.positions.find((position) => position.actorId === actor.id) })) };
}

function playStagePropSize(prop, holder = null) {
  const aspect = clamp(Number(prop.aspect) || 1, .2, 5);
  if (prop.kind === "picture") {
    const width = clamp(72 * Math.sqrt(aspect), 58, 94);
    const size = { width, height: clamp(width / aspect, 54, 92) };
    if (prop.puppet && holder?.hand) {
      const face = holder.faceRegion;
      const paperClear = () => {
        if (!face) return true;
        const bottom = holder.hand.y - size.handleHeight * (.82 - 63 / 1536) + 4;
        // The selected card's outline reaches 7px beyond its paper. Keep a
        // further 3px clear space around the complete authored face region.
        return holder.hand.x + size.width / 2 + 10 <= face.x || holder.hand.x - size.width / 2 - 10 >= face.x + face.width
          || bottom + 10 <= face.y || bottom - size.height - 10 >= face.y + face.height;
      };
      size.handleHeight = Math.min(50, (size.height - 20) * .55);
      // Low palms can carry a smaller whole card below the chin. A raised palm
      // uses a longer complete native handle to lift readable paper above the
      // forehead; shrinking it to a face-center margin hid eyes and cheeks.
      for (let step = 0; step < 20; step++) {
        if (paperClear() || !face || holder.hand.y - face.y - face.height < 35 || Math.min(size.width, size.height) <= 24) break;
        const scale = Math.max(.9, 24 / Math.min(size.width, size.height)); size.width *= scale; size.height *= scale;
        size.handleHeight = Math.min(50, (size.height - 20) * .55);
      }
      if (!paperClear()) {
        size.handleHeight = Math.max(size.handleHeight, (holder.hand.y - face.y + 14) / (.82 - 63 / 1536));
        // The elevated paper and actor still fit as one group in short rooms.
        const bottom = Math.max(holder.hit.top + holder.hit.height, holder.hand.y + size.handleHeight * .18);
        const headroom = holder.viewportHeight - 30 - (bottom - face.y);
        if (headroom > 24 && size.height > headroom) { const scale = headroom / size.height; size.width *= scale; size.height *= scale; }
      }
    }
    return size;
  }
  if (prop.kind === "build") {
    const width = clamp(84 * Math.sqrt(aspect), 64, 112);
    return { width, height: clamp(width / aspect, 64, 112) };
  }
  if(holder?.hand) { const size=clamp(holder.hit.height*.22,28,48); return {width:size,height:size}; }
  return { width: 64, height: 64 };
}

function heldPictureCenter(prop, geometry, offset = { x: 0, y: 0 }) {
  const hand = { x: geometry.hand.x + offset.x, y: geometry.hand.y + offset.y };
  const size = playStagePropSize(prop, geometry);
  if (prop.puppet) {
    // The handmade puppet is carried by the native handle's pink wooden grip,
    // rather than by the edge of its paper. Use the same socket for live play,
    // mirrored/hidden actors, replay and the kept canvas.
    const handleHeight = size.handleHeight;
    return { x: hand.x, y: hand.y - size.height / 2 - handleHeight * (.82 - 63 / 1536) + 4 };
  }
  const faceDelta = hand.x - geometry.face.x - offset.x;
  const outward = Math.abs(faceDelta) > 12 ? Math.sign(faceDelta) : prop.handSocket === "left" ? -1 : 1;
  return { x: hand.x + outward * (size.width / 2 - 8), y: hand.y - size.height / 2 + 12 };
}

function heldStoryToyCenter(prop, geometry, offset = {x:0,y:0}) {
  const hand={x:geometry.hand.x+offset.x,y:geometry.hand.y+offset.y}, size=playStagePropSize(prop,geometry);
  const outward=Math.sign(geometry.hand.x-geometry.face.x) || (prop.handSocket==='left'?-1:1);
  const center={x:hand.x+outward*(size.width/2-8),y:hand.y+size.height/2-8};
  if(geometry.faceRegion) {
    const face={...geometry.faceRegion,x:geometry.faceRegion.x+offset.x,y:geometry.faceRegion.y+offset.y};
    const ring={x:center.x-size.width/2-7,y:center.y-size.height/2-7,width:size.width+14,height:size.height+14};
    if(overlapArea(ring,face)>0)center.x=outward>0?Math.max(center.x,face.x+face.width+size.width/2+10):Math.min(center.x,face.x-size.width/2-10);
  }
  return center;
}

function fitGroupAxis(min, max, extent) {
  const margin = 6;
  if (max - min > extent - 2 * margin) return (extent - min - max) / 2;
  if (min < margin) return margin - min;
  if (max > extent - margin) return extent - margin - max;
  return 0;
}

// A viewport-only transform keeps the actor and every carried surface together.
// The saved u/v remain the child's exact intent and are reprojected on rotation.
export function playStageActorGroupOffset(actor, scene, layout, rawGeometry = playStageActorGeometry(actor, layout)) {
  if (actor.hidden) return { x: 0, y: 0 };
  let minX = rawGeometry.hit.left, minY = rawGeometry.hit.top;
  let maxX = minX + rawGeometry.hit.width, maxY = minY + rawGeometry.hit.height;
  const include = (box) => {
    minX = Math.min(minX, box.x); minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width); maxY = Math.max(maxY, box.y + box.height);
  };
  const held = (scene.props || []).filter((prop) => prop.ownerActorId === actor.id && prop.placement === "held");
  if (held.length && actor.role === "pip") {
    const pouch = pouchFromActorGeometry(rawGeometry);
    include(pouch);
  } else if (rawGeometry.hand) {
    for (const prop of held) {
      const size = playStagePropSize(prop, rawGeometry);
      const center = prop.kind === "picture" ? heldPictureCenter(prop, rawGeometry) : heldStoryToyCenter(prop,rawGeometry);
      const halo = prop.kind === "picture" ? prop.puppet ? 8 : 4 : 7;
      include({ x: center.x - size.width / 2 - halo, y: center.y - size.height / 2 - halo,
        width: size.width + halo * 2, height: size.height + halo * 2 });
      if (prop.kind === 'picture' && prop.puppet) {
        include(playStagePuppetHandle({ x: center.x - size.width / 2, y: center.y - size.height / 2, ...size }, size.handleHeight));
      }
    }
  }
  return { x: fitGroupAxis(minX, maxX, layout.width), y: fitGroupAxis(minY, maxY, layout.height) };
}

function projectedActorDragTranslation(actor, scene, layout, dx, dy) {
  const rawFoot = playStageActorGeometry(actor, layout).foot;
  const next = inversePlayStageGround(layout, rawFoot.x + dx, rawFoot.y + dy);
  const nextFoot = projectPlayStageGround(layout, next.u, next.v);
  const nextActor = { ...actor, ...next };
  const nextScene = { ...scene, actors: scene.actors.map((item) => item.id === actor.id ? nextActor : item) };
  const before = playStageActorGroupOffset(actor, scene, layout);
  const after = playStageActorGroupOffset(nextActor, nextScene, layout);
  return { x: nextFoot.x - rawFoot.x + after.x - before.x, y: nextFoot.y - rawFoot.y + after.y - before.y };
}

export function playStagePropPosition(prop, scene, layout) {
  if (prop.ownerActorId) {
    const owner = scene.actors.find((actor) => actor.id === prop.ownerActorId);
    if (owner?.role === "pip") return playStagePouchGeometry(owner, layout, scene).item;
    const geometry = owner && playStageActorGeometry(owner, layout, scene);
    if (geometry?.hand) {
      const offset = owner.hidden ? playStageHiddenOffset(owner, layout) : { x: 0, y: 0 };
      const hand = { x: geometry.hand.x + offset.x, y: geometry.hand.y + offset.y };
      if (prop.kind !== "picture") return heldStoryToyCenter(prop,geometry,offset);
      // Grip the near edge at the palm and let the card extend away from the
      // owner's face. Mirroring the actor reverses the actual hand/face side.
      return heldPictureCenter(prop, geometry, offset);
    }
  }
  if (prop.placement === "frame") {
    if(prop.frameAnchor) {
      const point=projectPlayStageGround(layout,prop.frameAnchor.u,prop.frameAnchor.v),size=playStagePropSize(prop);
      const handle=prop.puppet ? playStagePuppetHandle({x:0,y:0,...size}) : null;
      const below=Math.max(7,handle ? handle.y+handle.height*1479/1536-size.height : 0);
      return {x:point.x,y:point.y-size.height/2-below};
    }
    // Absence retains the exact legacy presentation; loading never migrates it.
    return { x: 68, y: layout.profile === "portrait" ? Math.max(layout.booth.y + layout.booth.height + 60, 240) : Math.max(150, layout.height * .38) };
  }
  const position = projectPlayStageGround(layout, prop.u, prop.v);
  if (prop.placement !== "ground" || (prop.kind !== "picture" && prop.kind !== "build")) return position;
  // Loose creations paint below the foreground. Keep the whole original visible
  // in this viewport without changing the child's normalized ground position.
  const size = playStagePropSize(prop), ring = prop.kind === "picture" ? 3 : 0, margin = 6;
  const x = clamp(position.x, size.width / 2 + ring + margin, layout.width - size.width / 2 - ring - margin);
  const bounds = { x: x - size.width / 2 - ring, y: position.y - size.height / 2 - ring, width: size.width + 2 * ring, height: size.height + 2 * ring };
  const top = size.height / 2 + ring + margin;
  const handleExtra = prop.kind === 'picture' && prop.puppet ? Math.max(0, Math.min(50, (size.height - 20) * .55) * (1479 - 63) / 1536 - 4) : 0;
  const bottom = Math.max(top, Math.min(layout.height - margin, playStageForegroundTop(layout, bounds, foregroundProfile()) - 5) - size.height / 2 - ring - handleExtra);
  return { x, y: clamp(position.y, top, bottom) };
}

function playStagePuppetHandle(bounds, height = Math.min(50, (bounds.height - 20) * .55)) {
  const width = height * 2 / 3;
  return { x: bounds.x + bounds.width / 2 - width / 2, y: bounds.y + bounds.height - height * 63 / 1536 - 4, width, height };
}

export function playStagePropGeometry(prop, scene, layout) {
  const position = playStagePropPosition(prop, scene, layout);
  const owner = scene.actors.find((actor) => actor.id === prop.ownerActorId);
  if (owner?.role === "pip") {
    const pouch = playStagePouchGeometry(owner, layout, scene);
    const aspect = prop.kind === "picture" || prop.kind === "build" ? prop.aspect : 1;
    const width = Math.min(pouch.item.maxWidth, pouch.item.maxHeight * aspect);
    const height = width / aspect;
    const bounds = { x: position.x - width / 2, y: position.y - height / 2, width, height };
    return { position, bounds, content: bounds, hit: { x: position.x - 28, y: position.y - 28, width: 56, height: 56 }, border: 0, padding: 0, ring: 0, framed: false, picture: false, pouch: true };
  }
  const picture = prop.kind === "picture";
  const { width, height, handleHeight } = playStagePropSize(prop, owner && playStageActorGeometry(owner, layout, scene));
  const border = picture ? 5 : 0;
  const padding = picture ? 5 : 0;
  const ring = prop.placement === "frame" ? 7 : picture ? 3 : 0;
  const bounds = { x: position.x - width / 2, y: position.y - height / 2, width, height };
  const inset = border + padding;
  const content = { x: bounds.x + inset, y: bounds.y + inset, width: width - 2 * inset, height: height - 2 * inset };
  if (picture && prop.puppet) {
    // Complete native 1024x1536 sprite; green clip starts behind the paper's
    // bottom edge, with opaque wood/grip ending at its measured y1479 contact.
    const handle = playStagePuppetHandle(bounds, handleHeight);
    return { position, bounds, content, border, padding, ring, framed: prop.placement === 'frame', picture, handle,
      hit: { ...bounds, height: Math.max(bounds.height, handle.y + handle.height - bounds.y) } };
  }
  if(owner && !picture) {
    const hit={x:position.x-Math.max(44,width)/2,y:position.y-Math.max(44,height)/2,width:Math.max(44,width),height:Math.max(44,height)};
    return {position,bounds,content,hit,border,padding,ring,framed:false,picture:false,handheld:true};
  }
  return { position, bounds, content, border, padding, ring, framed: prop.placement === "frame", picture };
}

export function drawPlayStageProp(ctx, image, geometry) {
  const { bounds, content, picture, framed, ring } = geometry;
  if (ring) {
    ctx.fillStyle = framed ? "#a86643" : "#8c6449";
    ctx.beginPath(); ctx.roundRect(bounds.x - ring, bounds.y - ring, bounds.width + 2 * ring, bounds.height + 2 * ring, 18 + ring); ctx.fill();
  }
  if (picture) {
    ctx.fillStyle = framed ? "#ffe98a" : "#fffdf8";
    ctx.beginPath(); ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, 18); ctx.fill();
    if (framed) {
      ctx.fillStyle = "#fffdf8";
      ctx.beginPath(); ctx.roundRect(bounds.x + geometry.border, bounds.y + geometry.border, bounds.width - 2 * geometry.border, bounds.height - 2 * geometry.border, 13); ctx.fill();
    }
  }
  const scale = Math.min(content.width / image.naturalWidth, content.height / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  ctx.drawImage(image, content.x + (content.width - width) / 2, content.y + (content.height - height) / 2, width, height);
}

function overlapArea(a, b) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

/** A deliberate Display chooses one saved contact, never an automatic relocation. */
export function playStageOpenFrameAnchor(scene,layout,prop) {
  const shapes=[[320,568],[390,660],[568,320],[480,270],[768,1024],[1024,768],[1280,720]];
  const layouts=[layout,...shapes.map(([w,h])=>{const chrome=playStageChromeLayout(w,h);return playStageLayout(chrome.surface.width,chrome.surface.height,chrome.profile);})];
  const candidates=[...(prop.frameAnchor ? [prop.frameAnchor] : [])];
  for(const v of [.88,.68,.98,.48,.28,0,.12])for(const u of [.8,.2,1,0,.65,.35,.5,.9,.1])candidates.push({version:1,u,v});
  for(let row=0;row<=20;row++)for(let column=0;column<=20;column++)candidates.push({version:1,u:column/20,v:row/20});
  let best=null;
  for(const anchor of candidates) {
    const selected={...prop,ownerActorId:'',placement:'frame',frameAnchor:anchor};
    const next={...scene,props:scene.props.map(item=>item.id===prop.id ? selected : item)};
    let score=0,clear=true;
    for(const view of layouts) {
      const geometry=playStagePropGeometry(selected,next,view),bounds=geometry.hit || geometry.bounds;
      const box={x:bounds.x-10,y:bounds.y-10,width:bounds.width+20,height:bounds.height+20};
      if(box.x<0 || box.y<0 || box.x+box.width>view.width || box.y+box.height>view.height){clear=false;break;}
      for(const actor of next.actors) {
        const body=playStageActorGeometry(actor,view,next),offset=actor.hidden?playStageHiddenOffset(actor,view):{x:0,y:0};
        const face=body.faceRegion || {x:body.hit.left,y:body.hit.top,width:body.hit.width,height:body.hit.height};
        if(overlapArea(box,{...face,x:face.x+offset.x,y:face.y+offset.y})){clear=false;break;}
        if(!actor.hidden)score+=overlapArea(box,{x:body.hit.left,y:body.hit.top,width:body.hit.width,height:body.hit.height});
      }
      if(!clear)break;
      for(const other of next.props.filter(item=>item.id!==prop.id && item.placement!=='basket')) {
        const item=playStagePropGeometry(other,next,view),area=overlapArea(box,item.bounds);
        // Both originals must remain visible; a small game-toy overlap is a
        // secondary preference when the child has filled the room.
        if((other.kind==='picture' || other.kind==='build') && area){clear=false;break;}
        score+=area*20;
      }
      if(!clear)break;
      score+=overlapArea(box,view.booth)*5;
    }
    if(clear && (!best || score<best.score))best={anchor,score};
    if(clear && !score)return {...anchor};
  }
  return best ? {...best.anchor} : null;
}

export function playStageHopPosition(actor, scene, layout, reserved = []) {
  const selected = playStageActorGeometry(actor, layout, scene).hit;
  const obstacles = scene.actors.filter((item) => !item.hidden).map((item) => {
    const hit = playStageActorGeometry(item, layout, scene).hit;
    return { x: hit.left, y: hit.top, width: hit.width, height: hit.height };
  })
    .concat(scene.props.filter((item) => item.placement !== "basket").map((item) => playStagePropGeometry(item, scene, layout).bounds), reserved);
  const candidates = [
    [selected.left + selected.width + 12, selected.top + 10],
    [selected.left - 76, selected.top + 10],
    [selected.left + selected.width / 2 - 32, selected.top - 76],
    [selected.left + selected.width / 2 - 32, selected.top + selected.height + 12],
    [8, 8], [layout.width - 72, 8],
  ];
  const margin = 7;
  let best = null;
  for (const [rawX, rawY] of candidates) {
    const x = clamp(rawX, 8, layout.width - 72), y = clamp(rawY, 8, layout.height - 72);
    const rect = { x: x - margin, y: y - margin, width: 64 + 2 * margin, height: 64 + 2 * margin };
    const score = obstacles.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle), 0);
    if (!score) return { x, y };
    if (!best || score < best.score) best = { x, y, score };
  }
  return { x: best.x, y: best.y };
}

function playStageContextPosition(scene, layout, anchor, reserved = [], preferred = []) {
  const size = 76;
  const obstacles = scene.actors.filter((actor) => !actor.hidden).map((actor) => {
    const hit = playStageActorGeometry(actor, layout, scene).hit;
    return { x: hit.left, y: hit.top, width: hit.width, height: hit.height };
  }).concat(scene.props.filter((prop) => prop.placement !== "basket").map((prop) => playStagePropGeometry(prop, scene, layout).bounds), reserved, [layout.booth.opening]);
  if (scene.together?.partnerRole) {
    if (layout.profile === "portrait") obstacles.push({ x: 8, y: 88, width: 76, height: 86 }, { x: layout.width - 84, y: 88, width: 76, height: 86 });
    else obstacles.push({ x: 92, y: 8, width: 160, height: 86 });
  }
  const candidates = [...preferred,
    [anchor.x + anchor.width + 12, anchor.y], [anchor.x - size - 12, anchor.y],
    [anchor.x, anchor.y + anchor.height + 12], [anchor.x, anchor.y - size - 12],
    [8, layout.height - size - 8], [layout.width - size - 8, layout.height - size - 8],
    [8, 8], [layout.width - size - 8, 8]];
  let best = null, nearBooth = null;
  for (const [index, [rawX, rawY]] of candidates.entries()) {
    const x = clamp(rawX, 8, layout.width - size - 8), y = clamp(rawY, 8, layout.height - size - 8);
    const rect = { x: x - 5, y: y - 5, width: size + 10, height: size + 10 };
    const score = obstacles.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle), 0);
    if (index < preferred.length && (!nearBooth || score < nearBooth.score)) nearBooth = { x, y, score };
    if (!score && (!preferred.length || index < preferred.length)) return { x, y };
    if (!best || score < best.score) best = { x, y, score };
  }
  // A small edge overlap beats a free control stranded far from the booth.
  if (nearBooth && nearBooth.score <= 900) return { x: nearBooth.x, y: nearBooth.y };
  return { x: best.x, y: best.y };
}

export function playStageGuidePosition(scene, layout, reserved = [], size = {}) {
  const width = Math.min(size.width || 280, layout.width - 16), height = size.height || 68;
  const booth = layout.booth;
  const candidates = layout.profile === "portrait"
    ? [[(layout.width - width) / 2, booth.y + booth.height + 2], [8, booth.y + booth.height + 2], [layout.width - width - 8, booth.y + booth.height + 2]]
    : [[booth.x - width - 12, 8], [8, 100], [8, 8]];
  candidates.push([8, layout.height - height - 8], [layout.width - width - 8, layout.height - height - 8]);
  for (let y = 8; y <= layout.height - height - 8; y += 24) {
    for (let x = 8; x <= layout.width - width - 8; x += 24) candidates.push([x, y]);
  }
  const obstacles = scene.actors.filter((actor) => !actor.hidden).map((actor) => {
    const hit = playStageActorGeometry(actor, layout, scene).hit;
    return { x: hit.left, y: hit.top, width: hit.width, height: hit.height };
  }).concat(scene.props.filter((prop) => prop.placement !== "basket").map((prop) => playStagePropGeometry(prop, scene, layout).bounds), [booth], reserved,
    [{ x: 8, y: 8, width: 72, height: 72 }]);
  if (scene.together?.partnerRole) {
    if (layout.profile === "portrait") obstacles.push({ x: 8, y: 88, width: 76, height: 86 }, { x: layout.width - 84, y: 88, width: 76, height: 86 });
    else obstacles.push({ x: 92, y: 8, width: 160, height: 86 });
  }
  let best = null;
  for (const [rawX, rawY] of candidates) {
    const x = clamp(rawX, 8, layout.width - width - 8), y = clamp(rawY, 8, layout.height - height - 8);
    const rect = { x, y, width, height };
    const score = obstacles.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle), 0);
    if (!score) return rect;
    if (!best || score < best.score) best = { ...rect, score };
  }
  return { x: best.x, y: best.y, width, height };
}

export function playStageOpenGroundPosition(scene, layout, prop, excludeId = prop.id, reserved = [], profile = FOREGROUND_PROFILE) {
  const margin = 10;
  const actors = scene.actors.filter((actor) => !actor.hidden).map((actor) => {
    const hit = playStageActorGeometry(actor, layout, scene).hit;
    return { x: hit.left, y: hit.top, width: hit.width, height: hit.height };
  });
  const props = scene.props.filter((item) => item.id !== excludeId && item.placement !== "basket")
    .map((item) => playStagePropGeometry(item, scene, layout).bounds);
  const fixed = [layout.booth, ...reserved];
  if (scene.together?.partnerRole) {
    if (layout.profile === "portrait") fixed.push({ x: 8, y: 88, width: 76, height: 86 }, { x: layout.width - 84, y: 88, width: 76, height: 86 });
    else fixed.push({ x: 92, y: 8, width: 160, height: 86 });
  }
  const horizontal = [.5, .2, .8, 0, 1, .35, .65, .1, .9, .45, .55];
  const vertical = layout.profile === "portrait" ? [.88, .68, .6, .98, .42, .74] : [.88, .6, .98, .4, .72];
  const candidates = vertical.flatMap((v) => horizontal.map((u) => ({ u, v })));
  for (let row = 7; row <= 20; row++) for (let column = 0; column <= 20; column++) {
    candidates.push({ u: column / 20, v: row / 20 });
  }
  let best = null;
  for (const { u, v } of candidates) {
    const candidate = { ...prop, ownerActorId: "", placement: "ground", u, v };
    const bounds = playStagePropGeometry(candidate, scene, layout).bounds;
    const box = { x: bounds.x - margin, y: bounds.y - margin, width: bounds.width + 2 * margin, height: bounds.height + 2 * margin };
    const outside = Math.max(0, -box.x) + Math.max(0, -box.y)
      + Math.max(0, box.x + box.width - layout.width) + Math.max(0, box.y + box.height - layout.height);
    const area = (boxes, rect) => boxes.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle), 0);
    const foliageOverlap = Math.max(0, bounds.y + bounds.height - playStageForegroundTop(layout, bounds, profile) + 5) * bounds.width;
    // Other toys and the foreground can cover the child's creation. A puppet
    // may share ground with it, since props paint in front of visible actors.
    const score = outside * 100_000 + (foliageOverlap + area(props, bounds) + area(fixed, bounds)) * 10_000
      + area(actors, bounds) * 20 + area([...actors, ...props, ...fixed], box);
    if (!score) return { u, v };
    if (!best || score < best.score) best = { u, v, score };
  }
  return { u: best.u, v: best.v };
}

// Only an arriving puppet is placed. Existing child-arranged positions remain
// exact, including intentional overlap. A replacement can reuse its old space
// when the new silhouette fits, instead of always covering the centre puppet.
export function playStageOpenActorGroundPosition(scene, layout, actor, replaceId = "", reserved = [], profile = FOREGROUND_PROFILE) {
  const replaced = scene.actors.find((item) => item.id === replaceId);
  const remaining = { ...scene, actors: scene.actors.filter((item) => item.id !== replaceId),
    props: scene.props.map((item) => item.ownerActorId === replaceId && replaceId
      ? { ...item, ownerActorId: "", placement: "ground" } : item) };
  const actors = remaining.actors.filter((item) => !item.hidden).map((item) => {
    const hit = playStageActorGeometry(item, layout, remaining).hit;
    return { x: hit.left, y: hit.top, width: hit.width, height: hit.height };
  });
  const props = remaining.props.filter((item) => item.placement !== "basket")
    .map((item) => playStagePropGeometry(item, remaining, layout).bounds);
  const fixed = [layout.booth, ...reserved];
  const preferred = replaced ? [{ u: replaced.u, v: replaced.v }] : [{ u: .5, v: .5 }];
  const candidates = [...preferred, ...[.6, .8, .4, .95].flatMap((v) => [.5, .2, .8, 0, 1, .35, .65].map((u) => ({ u, v })))];
  for (let row = 0; row <= 20; row++) for (let column = 0; column <= 20; column++) {
    candidates.push({ u: column / 20, v: row / 20 });
  }
  const area = (boxes, rect) => boxes.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle), 0);
  let best = null;
  for (const { u, v } of candidates) {
    const next = { ...actor, u, v };
    const hit = playStageActorGeometry(next, layout, { ...remaining, actors: [...remaining.actors, next] }).hit;
    const box = { x: hit.left, y: hit.top, width: hit.width, height: hit.height };
    const padded = { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 };
    const outside = Math.max(0, -box.x) + Math.max(0, -box.y)
      + Math.max(0, box.x + box.width - layout.width) + Math.max(0, box.y + box.height - layout.height);
    const foliage = Math.max(0, box.y + box.height - playStageForegroundTop(layout, box, profile) + 3) * box.width;
    const score = outside * 100_000 + (area([...actors, ...props, ...fixed], box) + foliage) * 10_000
      + area([...actors, ...props, ...fixed], padded);
    if (!score) return { u, v };
    if (!best || score < best.score) best = { u, v, score };
  }
  return { u: best.u, v: best.v };
}

function isolateStageControlPointer(el) {
  // PenInput listens on the surface. Keep a button's pointerdown from starting
  // a ground gesture (and capturing the pointer) before its click can fire.
  el.addEventListener("pointerdown", (event) => event.stopPropagation());
  return el;
}

function button(icon, label, cls, action) {
  const el = document.createElement("button");
  el.type = "button"; el.className = `play-stage-button tap ${cls || ""}`;
  el.setAttribute("aria-label", label); el.innerHTML = ICONS[icon] || iconSVG(icon);
  return isolateStageControlPointer(tapify(el, action));
}

function sameStageRoomContent(first, second) {
  const content = scene => {
    // Continuing the same play must preserve the current identity and Undo.
    // Viewport changes are presentation; recording and original art still count.
    const { id, remixOf, updatedAt, history, layout, ...owned } = scene;
    return JSON.stringify(owned);
  };
  return !!first && !!second && content(first) === content(second);
}

function appendArt(host, key, cls, fallback = "") {
  const source = art.get(key);
  if (source) {
    const image = source.cloneNode(); image.alt = ""; image.draggable = false; image.className = cls;
    host.appendChild(image); return image;
  }
  if (fallback) {
    const node = document.createElement("div"); node.className = `${cls} is-fallback`; node.innerHTML = fallback; host.appendChild(node); return node;
  }
  return null;
}

function boothRearFallback() {
  return '<svg viewBox="0 0 320 340" aria-hidden="true"><rect x="22" y="20" width="276" height="300" rx="30" fill="#fff2b6" stroke="#6f4938" stroke-width="10"/><rect x="70" y="60" width="180" height="230" rx="18" fill="#dff4ff"/></svg>';
}

function boothFrontFallback() {
  return '<svg viewBox="0 0 320 340" aria-hidden="true"><path d="M22 20h276v300H22ZM70 60v230h180V60Z" fill="#a86643" fill-rule="evenodd" stroke="#6f4938" stroke-width="9" stroke-linejoin="round"/><path d="M54 278h212v48H54Z" fill="#d89058" stroke="#6f4938" stroke-width="10"/><path d="M70 60h180v48c-30 22-60 13-90-8-30 21-60 30-90 8Z" fill="#f2799b" stroke="#9f4967" stroke-width="7"/></svg>';
}

function imageForSource(source) {
  return new Promise((resolve) => {
    if (!source) { resolve(null); return; }
    if (source.complete && source.naturalWidth) { resolve(source); return; }
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = source.src || source;
  });
}

export class PlayStageController {
  constructor(host) {
    this.host = host;
    this.scene = null;
    this.layout = null;
    this.selectedActorId = "rayna";
    this.selectedPropId = "";
    this.gesture = null;
    this.saving = false;
    this.preparing = false;
    this.preparePicture = preparePlayStagePicture;
    this.prepareExactPicture = prepareExactPlayStagePicture;
    this.prepareBuild = preparePlayStageBuild;
    this.resizePending = false;
    this.alive = true;
    this.overlay = null;
    this.voiceFlags = new Set();
    this.guide = null;
    this.inviteTimer = null;
    this.firstInvitePending = false;
    this.childInteracted = false;
    this._resizeQueued = 0;
    this.settledTail = Promise.resolve();
    this.checkpointing = false;
    this.checkpointPromise = null;
    this.checkpointTail = null;
    this.recording = false;
    this.replay = null;
    this.replayTimer = null;
    this.replayRevision = 0;
    this.paradeDraft = null;
    this.paradeRun = null;
    this.paradeView = null;
    this.paradeTimer = null;
    this.paradeRevision = 0;
    this.paradeProjection = null;
    this.pictureShowSound = new BandSound(); this.pictureShowRun = null; this.pictureShowTimer = null; this.pictureShowRevision = 0;
    this.noticeTimer = null;
    this.postcardTask = Promise.resolve(false);
  }

  async mount(params = {}) {
    this.enteredFromMap = params.fromMap === true;
    let scene, postcard;
    try {
      scene = await loadPlayStageCurrent();
      if (!this.alive) return;
      postcard = params.postcardKey ? await loadPlayStagePostcard(params.postcardKey) : null;
    } catch (_) {
      if (this.alive) this._showLoadProblem(params);
      return;
    }
    if (!this.alive) return;
    this._loadProblem = false;
    this.scene = scene;
    const returningToStage = !!this.scene;
    const firstPlayableEntry = !params.postcardKey && !returningToStage && !settings.get().playStageInviteSeen;
    if (!this.scene) this.scene = blankPlayStageScene();

    this.root = document.createElement("div"); this.root.className = "play-stage";
    this.surface = document.createElement("div"); this.surface.className = "play-stage-surface";
    this.surface.setAttribute("aria-label", "Rayna's Valley puppet stage");
    this.controls = document.createElement("div"); this.controls.className = "play-stage-controls";
    this.castDock = document.createElement("div"); this.castDock.className = "play-stage-cast-dock";
    this.togetherDock = document.createElement("div"); this.togetherDock.className = "play-stage-together-dock";
    this.overlayHost = document.createElement("div"); this.overlayHost.className = "play-stage-overlay-host";
    this.root.append(this.surface, this.controls, this.castDock, this.overlayHost); this.host.appendChild(this.root);

    this.home = button("home", "home", "play-stage-home", () => this._goHome());
    this.back = button("back", this.enteredFromMap ? "back to the valley" : "back to the Treehouse", "play-stage-back", () => this._goBack());
    this.undo = button("undo", "undo", "play-stage-undo", () => this._undo());
    this.keep = button("keep", "keep this story", "play-stage-keep", () => this._keep());
    this.mute = muteButton(); this.mute.classList.add("play-stage-mute");
    this.basket = button("basket", "toys and my creations", "play-stage-basket", () => this._openBasket());
    this.people = button("people", "friends and taking turns", "play-stage-people", () => this._openFriends());
    this.talk = button("talk", "what happens next", "play-stage-talk", () => { if (this._canUseTools()) { this._closeOverlay(); speech.say("play_stage_caregiver_next"); } });
    this.help = button("help", "show stage help", "play-stage-help", () => { if (this._canUseTools()) { this._closeOverlay(); this._showGuide(true); } });
    this.shows = button("parade", "shows, our tune and stage help", "play-stage-shows play-stage-picture-show-action play-stage-parade-action play-stage-replay-next", () => this._openStageTools());
    this.actions = button("peek", "use the selected puppet or picture", "play-stage-actions", () => this._openSelectionTools());
    appendArt(this.shows, LAYERS.front, "play-stage-tool-picture");
    if (this.shows.querySelector('img')) this.shows.querySelector('svg')?.remove();
    const showsLabel = document.createElement('span'); showsLabel.textContent = 'Shows'; this.shows.appendChild(showsLabel);
    this.controls.append(this.back, this.home, this.undo, this.keep, this.mute, this.basket, this.people, this.shows, this.actions);
    this.checkpointStatus = document.createElement("div"); this.checkpointStatus.setAttribute("role", "status"); this.checkpointStatus.hidden = true;
    this.checkpointStatus.className = 'play-stage-checkpoint-status';
    this.root.append(this.checkpointStatus);
    this._onCheckpointInput = event => { if (this.checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); } };
    for (const type of ["pointerdown", "click", "keydown"]) this.root.addEventListener(type, this._onCheckpointInput, true);
    this.performanceDock = document.createElement("div"); this.performanceDock.className = "play-stage-performance-dock";
    this.root.appendChild(this.performanceDock);
    this._onChildPointer = (event) => {
      if (this.pictureShowRun && !event.target.closest?.('.play-stage-picture-show-action')) this._stopPictureShow();
      if (this.replay && !event.target.closest?.(".play-stage-replay-next, .play-stage-replay-stop")) this._stopPlayback();
      if (this.paradeRun && !event.target.closest?.(".play-stage-parade-action")) this._cancelParade();
      if (!event.target.closest?.(".play-stage-guide")) { this.childInteracted = true; this._interruptInvite(); }
    };
    this.root.addEventListener("pointerdown", this._onChildPointer, true);
    this._onChildKey = (event) => {
      if (this.pictureShowRun && !event.target.closest?.('.play-stage-picture-show-action')) this._stopPictureShow();
      if (this.replay && !event.target.closest?.(".play-stage-replay-next, .play-stage-replay-stop")) this._stopPlayback();
      if (this.paradeRun && !event.target.closest?.(".play-stage-parade-action")) this._cancelParade();
      if (!event.target.closest?.(".play-stage-guide")) { this.childInteracted = true; this._interruptInvite(); }
    };
    this.root.addEventListener("keydown", this._onChildKey, true);

    this.pen = new PenInput(this.surface, {
      allowFinger: !settings.get().penOnly,
      onStrokeStart: (point, event) => this._gestureStart(point, event),
      onStrokeMove: (point) => this._gestureMove(point),
      onStrokeEnd: (points, meta) => this._gestureEnd(points, meta),
    });
    this._onSettings = bus.on("settings:changed", () => { this._idleCueStop?.(); this._idleCueStop = null; this.pen?.setAllowFinger(!settings.get().penOnly); if (this.replay || this.pictureShowRun) this._stopPlayback(); this.pictureShowSound.stop(); this._cancelParade(); });
    this._onWindowBlur = () => { this._stopPlayback(); this._cancelParade(); this._cancelGesture(); }; window.addEventListener("blur", this._onWindowBlur);
    this.resizeObserver = new ResizeObserver(() => this._scheduleResize()); this.resizeObserver.observe(this.surface);
    this._resize(); this._render();
    await this._saveSettled();
    if (!this.alive) return;
    if (params.postcardKey) {
      if (postcard) await this._offerKeptStory(postcard, returningToStage);
      else this._showRetry("That kept story could not open. Your current room and original keepsakes are still here.", "back to my current room", () => {});
    } else await this._acceptRouteCreation(params);
    if (!this.alive) return;
    if (returningToStage && !settings.get().playStageInviteSeen) void settings.set({ playStageInviteSeen: true });
    if (firstPlayableEntry && !params.pictureShow && !params.toyId) this._offerFirstInvite();
    this.idleHelp?.();
    this.idleHelp = installIdleHelp(this.root, {
      active: () => stageIdleEligible(this, { route: router.current(), moving: router.isMoving(),
        locked: session.isBreakLocked(), speaking: speech.isSpeaking() }),
      demonstrate: () => {
        const id = this.selectedPropId || this.selectedActorId;
        const kind = this.selectedPropId ? "prop" : "actor";
        if (!id || kind === "actor" && this.scene.actors.find(actor => actor.id === id)?.hidden) return null;
        const target = [...this.surface.querySelectorAll(`[data-${kind}-id]`)].find(node => node.dataset[`${kind}Id`] === id);
        const stop = showStageIdleCue(target, { reduced: settings.get().reducedMotion });
        this._idleCueStop = stop;
        return () => { stop?.(); if (this._idleCueStop === stop) this._idleCueStop = null; };
      },
    });
  }

  async _offerKeptStory(card, hasCurrent = true) {
    if (!this._canUseTools()) return false;
    if (!hasCurrent) {
      this.postcardTask = this._openKeptStory(card);
      return this.postcardTask;
    }
    if (sameStageRoomContent(this.scene, card.scene)) {
      this._closeOverlay(); speech.say("play_stage_reopened"); return true;
    }
    const scene = this.scene, layout = JSON.parse(JSON.stringify(this.layout));
    let png = "";
    this._closeOverlay(); this._interruptInvite(); this.preparing = true; this._render();
    try { png = await this._capturePNG(scene, layout); } catch {}
    finally { this.preparing = false; if (this.alive) { this._render(); bus.emit("activity:idle", { id: "play-stage" }); } }
    if (!this.alive) return false;
    if (this.scene !== scene) return this._offerKeptStory(card);
    if (!png) {
      this._showRetry("Your current room is still here. Its keepsake picture could not be prepared.", "try choosing the kept story again", () => (this.postcardTask = this._offerKeptStory(card)));
      return false;
    }
    this._openPicker("Keep playing here, or keep this room and open your chosen story?", [
      { id: "current-room", label: "keep playing my current room", preview: png, caption: "Keep playing here" },
      { id: "kept-story", label: "keep my current room and open this kept story", preview: card.png, caption: "Keep and open" },
    ], "", choice => {
      if (this.scene !== scene) { this.postcardTask = this._offerKeptStory(card); return; }
      if (choice.id === "current-room") this._closeOverlay();
      else this.postcardTask = this._openKeptStory(card, { scene, layout, png });
    });
    this.overlay?.classList.add('play-stage-room-choice');
    return true;
  }

  async _openKeptStory(card, preserve = null) {
    if (!this._canUseTools()) return false;
    if (preserve && this.scene !== preserve.scene) return this._offerKeptStory(card);
    const current = this.scene;
    this._closeOverlay(); this._stopPlayback(false); this._cancelParade(false); this._interruptInvite();
    this.saving = true; this._render();
    let failed = null, opened = false;
    try {
      if (preserve) {
        await savePlayStageCurrent(preserve.scene);
        const kept = await savePlayStagePostcard(preserve.scene, preserve.png, preserve.layout);
        if (!kept) throw new Error("current-room-keep");
        if (!db.status().persistent) throw Object.assign(new Error("temporary-room-keep"), { code: "temporary-room-keep" });
      }
      if (!this.alive) return false;
      const scene = await reopenPlayStagePostcard(card.key, { accept: () => this.alive && this.scene === current });
      if (!scene) throw new Error("kept-story-unavailable");
      if (!this.alive) return false;
      this.scene = scene; this.recording = false;
      this.selectedActorId = scene.actors.some(actor => actor.id === "rayna") ? "rayna" : scene.actors[0]?.id || "";
      this.selectedPropId = ""; opened = true;
    } catch (error) { failed = error; }
    finally {
      this.saving = false;
      if (this.alive) {
        if (this.resizePending) this._resize(); else this._render();
        bus.emit("activity:idle", { id: "play-stage" });
      }
    }
    if (!this.alive) return false;
    if (failed) {
      const message = failed.code === "PLAY_STAGE_POSTCARD_FULL"
        ? "Your story shelf is full. Your current room is still here."
        : failed.code === "temporary-room-keep"
          ? "Your current room is only kept temporarily. Keep this page open and ask a grown-up to save a backup or retry storage before opening another story."
          : "Your current room could not be kept and opened safely. It is still here; your chosen keepsake is unchanged.";
      this._showRetry(message, "try opening the kept story again", () => (this.postcardTask = this._offerKeptStory(card)));
      return false;
    }
    if (opened) { sfx.play("chime"); speech.say("play_stage_reopened"); }
    return opened;
  }

  _playableForInvite() {
    return !!(this.alive && this.layout && this.root && this.surface && this.pen
      && this.scene.actors.some((actor) => actor.role === "rayna" && !actor.hidden)
      && this.scene.actors.some((actor) => actor.role === "pip" && !actor.hidden)
      && art.get(LAYERS.backdrop) && art.get(LAYERS.front)
      && art.get(ACTORS.rayna.art) && art.get(ACTORS.pip.art)
      && this.layout.booth.opening.width > 0 && this.layout.booth.opening.height > 0);
  }

  _offerFirstInvite() {
    if (!this._playableForInvite() || this.childInteracted || settings.get().playStageInviteSeen) return false;
    this.firstInvitePending = true;
    void settings.set({ playStageInviteSeen: true });
    const reduced = settings.get().reducedMotion || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (!reduced) this.root.classList.add("is-opening");
    this.inviteTimer = setTimeout(() => {
      this.inviteTimer = null;
      this.root?.classList.remove("is-opening");
      if (!this.alive || !this.firstInvitePending || this.overlay) return;
      this.firstInvitePending = false;
      this._showGuide(true);
    }, reduced ? 0 : 580);
    return true;
  }

  _interruptInvite() {
    if (this.inviteTimer !== null) clearTimeout(this.inviteTimer);
    this.inviteTimer = null;
    this.firstInvitePending = false;
    this.root?.classList.remove("is-opening");
    this._dismissGuide();
  }

  _dismissGuide() { this.guide?.remove(); this.guide = null; }

  _showGuide(speak = false) {
    if (!this.alive || !this.layout || this.saving) return;
    this._interruptInvite();
    const guide = document.createElement("div"); guide.className = "play-stage-guide";
    guide.setAttribute("role", "note"); guide.setAttribute("aria-label", "Stage help");
    const hand = document.createElement("span"); hand.className = "play-stage-guide-hand";
    hand.setAttribute("aria-hidden", "true"); hand.innerHTML = '<svg viewBox="0 0 48 48"><path d="M9 29c6-5 11-4 14 1V9a4 4 0 0 1 8 0v14a4 4 0 0 1 7 2l-1 9c-1 6-6 9-13 9H18c-6 0-9-6-9-14Z" fill="#ffe6b0" stroke="#76513d" stroke-width="3"/></svg>';
    const words = document.createElement("span"); words.className = "play-stage-guide-words";
    const selected = this.scene.actors.find((actor) => actor.id === this.selectedActorId);
    words.innerHTML = selected?.hidden ? "Open Friends.<br>Tap Come out."
      : this.selectedPropId ? "Drag your picture,<br>or tap it, then a spot." : "Drag a friend,<br>or tap then tap a spot.";
    const close = button("close", "close stage help", "play-stage-guide-close", () => this._dismissGuide());
    guide.append(hand, words, close);
    const story = stageStoryContext(this.scene);
    const cue = story?.story.phase==='waiting' && STAGE_STORY_EPISODES.find(row=>row.id===story.story.episode)?.cue;
    if (cue) { words.textContent=STAGE_STORY_PROMPTS[cue]; hand.hidden=true; guide.classList.add('is-story'); guide.setAttribute('aria-label','Our story choices'); }
    this.guide = guide;
    this.surface.appendChild(guide);
    this._positionGuide();
    if (speak) speech.say(cue || "play_stage_invite");
  }

  _showStoryGuide(cue, speak = true) {
    if (!this._canUseTools() || this.overlay || document.visibilityState==='hidden' || !PLAY_STAGE_PHRASES[cue]) return;
    this._showGuide(false);
    if (!this.guide) return;
    this.guide.querySelector('.play-stage-guide-words').textContent=STAGE_STORY_PROMPTS[cue];
    this.guide.querySelector('.play-stage-guide-hand').hidden=true;
    this.guide.classList.add('is-story'); this._positionGuide();
    this.guide.setAttribute('aria-label','Our story');
    if (speak) speech.say(cue);
  }

  _positionGuide() {
    if (!this.guide || !this.layout) return;
    const surfaceRect = this.surface.getBoundingClientRect();
    const reserved = [...this.surface.querySelectorAll(".play-stage-context .play-stage-button")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left - surfaceRect.left, y: rect.top - surfaceRect.top, width: rect.width, height: rect.height };
    });
    const story=this.guide.className.split(' ').includes('is-story');
    this.guide.style.width=`${Math.min(story?190:280,this.layout.width-16)}px`;
    this.guide.style.height='auto';
    const height=Math.max(68,this.guide.getBoundingClientRect?.().height || 0);
    const rect = playStageGuidePosition(this.scene, this.layout, reserved, {width:story?190:280,height});
    const pieces=this.scene.actors.filter(actor=>!actor.hidden).map(actor=> {
      const hit=playStageActorGeometry(actor,this.layout,this.scene).hit;
      return {x:hit.left,y:hit.top,width:hit.width,height:hit.height};
    }).concat(this.scene.props.filter(prop=>prop.placement!=='basket').map(prop=>playStagePropGeometry(prop,this.scene,this.layout).bounds),[this.layout.booth]);
    // Pictured choices and actual outcomes remain visible in a full room.
    // A supplemental note must yield when there is no clear space for it.
    this.guide.hidden=story && pieces.some(piece=>overlapArea(rect,piece)>0);
    Object.assign(this.guide.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }

  _scheduleResize() {
    cancelAnimationFrame(this._resizeQueued);
    this._resizeQueued = requestAnimationFrame(() => this._resize());
  }

  _positionChrome() {
    const bounds = this.root?.getBoundingClientRect?.();
    if (!bounds?.width || !bounds.height) return;
    const chrome = this.chrome = playStageChromeLayout(bounds.width, bounds.height);
    this.root.dataset.chromeProfile = chrome.profile;
    this.root.dataset.chromeCompact = String(!!chrome.compact);
    for (const [name, r] of Object.entries(chrome.controls)) {
      const node = this[name]; if (!node) continue;
      Object.assign(node.style, { position: "absolute", left: `${r.x}px`, top: `${r.y}px`, right: "auto", bottom: "auto", width: `${r.width}px`, height: `${r.height}px` });
    }
    const r = chrome.surface;
    Object.assign(this.surface.style, { left: `${r.x}px`, top: `${r.y}px`, right: `${chrome.width - r.x - r.width}px`, bottom: `${chrome.height - r.y - r.height}px` });
  }

  _resize() {
    if (!this.alive || !this.surface) return;
    if (this.saving) { this.resizePending = true; return; }
    this.resizePending = false;
    this._cancelParade(false);
    this._stopPlayback(false);
    this._cancelGesture();
    this._positionChrome();
    const rect = this.surface.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    this.layout = playStageLayout(rect.width, rect.height, this.chrome?.profile || "");
    this.scene = applyPlayStageAction(this.scene, { type: "layout", layout: this.layout });
    this.root.dataset.profile = this.layout.profile;
    this._render(); void this._saveSettled();
  }

  _layer(cls, z) { const el = document.createElement("div"); el.className = cls; el.style.zIndex = String(z); return el; }

  _render() {
    if (!this.alive || !this.layout) return;
    const editable = this.scene;
    const editableLayout = this.layout;
    const frame = this.replay && playStagePerformanceFrame(editable, this.replay.index);
    this._replayBeat = this.replay && editable.performance?.beats[this.replay.index];
    if (frame || this.paradeView) this.scene = frame || this.paradeView;
    const source = this.scene;
    if (!this.paradeView && !this.paradeDraft && !this.paradeRun) this.scene = playStageParadeViewportScene(source, editableLayout, this._stageControlReserves());
    if (!this.replay && source === editable) this.paradeProjection = this.scene !== source ? { source, scene: this.scene } : null;
    this.layout = playStageParadeDisplayLayout(editableLayout, this.scene.parade?.scale || 1);
    try { this._renderScene(); }
    finally { this.scene = editable; this.layout = playStageParadeDisplayLayout(editableLayout, this.paradeProjection?.source === editable ? this.paradeProjection.scene.parade.scale : editable.parade?.scale || 1); }
    this._renderPerformanceDock();
  }

  _renderScene() {
    if (!this.alive || !this.layout) return;
    const backdrop = this._layer("play-stage-backdrop", 0);
    appendArt(backdrop, LAYERS.backdrop, "play-stage-fill");
    const rear = this._layer("play-stage-booth play-stage-booth-rear", 10);
    const hidden = this._layer("play-stage-hidden", 20);
    const front = this._layer("play-stage-booth play-stage-booth-front", 30);
    const curtains = this._layer("play-stage-booth play-stage-curtains", 40);
    const pieces = this._layer("play-stage-pieces", 50);
    const foreground = this._layer("play-stage-foreground", 70);
    const displays = this._layer("play-stage-pieces play-stage-displays", 80);
    const trail = this._layer("play-stage-parade-trail", 45);
    const context = this._layer("play-stage-context", 100);
    for (const layer of [rear, front, curtains]) Object.assign(layer.style, this._boothStyle());
    const opening = this.layout.booth.opening;
    Object.assign(hidden.style, { left: `${opening.x}px`, top: `${opening.y}px`, width: `${opening.width}px`, height: `${opening.height}px` });
    appendArt(rear, LAYERS.rear, "play-stage-fill", boothRearFallback());
    appendArt(front, LAYERS.front, "play-stage-fill");
    appendArt(curtains, LAYERS.left, "play-stage-fill"); appendArt(curtains, LAYERS.right, "play-stage-fill");
    if (!front.children.length && curtains.children.length === 0) appendArt(front, "", "play-stage-fill", boothFrontFallback());
    appendArt(foreground, LAYERS.foreground, "play-stage-fill");
    this._renderParadeTrail(trail);

    const order = playStagePieceOrder(this.scene);
    for (const actor of order.hiddenActors) hidden.appendChild(this._actorNode(actor, true));
    for (const actor of order.actors) pieces.appendChild(this._actorNode(actor, false));
    for (const prop of order.hiddenProps) this._appendProp(hidden, prop, { x: opening.x, y: opening.y });
    for (const prop of order.props) this._appendProp(isDisplayedPicture(prop) ? displays : pieces, prop);
    const beat = this.replay && this._replayBeat;
    if (beat?.type === "hop-actor") {
      const actor = this.scene.actors.find((item) => item.id === beat.actorId);
      if (actor) {
        const g = playStageActorGeometry(actor, this.layout, this.scene);
        const hop = document.createElement("span"); hop.className = "play-stage-replay-hop"; hop.innerHTML = ICONS.hop;
        hop.setAttribute("aria-label", "a hop in your show");
        Object.assign(hop.style, { left: `${g.foot.x - 24}px`, top: `${g.foot.y - 56}px` }); pieces.appendChild(hop);
      }
    }
    // Working paper has no floating command panels. Pictured outside tools open
    // only the requested choices, without covering a puppet's face or legs.
    this.surface.replaceChildren(backdrop, rear, hidden, front, curtains, trail, pieces, foreground, displays, context, ...(this.guide ? [this.guide] : []));
    this._renderPictureShowCue();
    this._updateSelectionTool();
    this._positionGuide();
    this._renderDock();
    const locked = this.saving || this.preparing || this.checkpointing;
    this.undo.disabled = !playStageCanUndo(this.scene) || locked;
    this.keep.disabled = locked;
    for (const control of [this.back, this.home, this.basket, this.people, this.shows, this.actions]) if (control) control.disabled = this.saving || this.preparing || this.checkpointing;
  }

  _manualReplay() {
    const s = settings.get();
    return s.muted || s.reducedMotion || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  _openParade(reset = false) {
    if (!this.alive || this.saving || this.preparing || this.gesture) return;
    this._stopPlayback(false); this._cancelParade(false); this._closeOverlay(); this._interruptInvite();
    const owned = this.scene.paradeDraft || this.scene.parade;
    const leaderActorId = this.scene.actors.some((actor) => actor.id === owned?.leaderActorId) ? owned.leaderActorId
      : this.scene.actors.some((actor) => actor.id === this.selectedActorId) ? this.selectedActorId : this.scene.actors[0].id;
    this.paradeDraft = { leaderActorId, route: reset ? [] : structuredClone(owned?.route || []) };
    this._rememberParadeDraft();
    this.selectedActorId = leaderActorId; this.selectedPropId = "";
    this._render(); speech.say("play_stage_parade_route");
  }

  _chooseParadeLeader() {
    const owned = this.scene.paradeDraft || this.scene.parade;
    const draft = this.paradeDraft || { leaderActorId: owned?.leaderActorId || this.scene.actors[0].id, route: structuredClone(owned?.route || []) };
    this._cancelParade(false);
    this._openPicker("Who leads your parade?", this.scene.actors.map((actor) => ({ id: actor.id, art: actor.art || ACTORS[actor.role]?.art, label: ACTORS[actor.role]?.label || "friend" })), "play_stage_parade_leader", (choice) => {
      this._closeOverlay(); this.paradeDraft = { ...draft, leaderActorId: choice.id }; this._rememberParadeDraft(); this.selectedActorId = choice.id; this.selectedPropId = ""; this._render();
    });
  }

  _addParadePoint(point) {
    if (!this.paradeDraft || this.paradeDraft.route.length >= PLAY_STAGE_MAX_ROUTE_POINTS) return;
    this.paradeDraft.route.push(inversePlayStageGround(this.layout, point.x, point.y)); this._rememberParadeDraft(); this._render();
  }

  _rememberParadeDraft() {
    if (!this.paradeDraft || !this.scene) return;
    const draft = { v: 1, leaderActorId: this.paradeDraft.leaderActorId, route: this.paradeDraft.route };
    if (JSON.stringify(this.scene.paradeDraft) === JSON.stringify(draft)) return;
    this.scene = setPlayStageParadeDraft(this.scene, draft); void this._saveSettled();
  }

  _undoParade() {
    if (this.paradeDraft) { this.paradeDraft.route.pop(); this._rememberParadeDraft(); this._render(); return; }
    const route = this.paradeRun?.route || this.scene.parade?.route;
    const leaderActorId = this.paradeRun?.leaderActorId || this.scene.parade?.leaderActorId;
    this._cancelParade(false); this._undo(); this._openParade();
    if (route) { this.paradeDraft = { route: structuredClone(route), leaderActorId }; this._rememberParadeDraft(); this._render(); }
  }

  _goParade() {
    const draft = this.paradeDraft;
    if (!draft || draft.route.length < 2 || this.saving || this.preparing) return;
    const route = structuredClone(draft.route), leaderActorId = draft.leaderActorId;
    this._rememberParadeDraft();
    // Validate the whole chosen journey before moving anyone. No rejected route
    // may leave one member behind or drop a carried source picture.
    const formations = route.map((point, index) => playStageParadeFormation(this.scene, this.layout, point, leaderActorId, route[Math.max(0, index - 1)], this._stageControlReserves()));
    if (formations.some((formation) => !formation)) {
      this._showRetry("This cast needs a little more room. Your scene is still here.", "back to my trail", () => { this.paradeDraft = draft; this._render(); }); return;
    }
    this.paradeDraft = null;
    if (this.scene.performance?.invitationId === "parade" && this.scene.performance.beats.length < PLAY_STAGE_MAX_BEATS) this.recording = true;
    this.paradeRun = { route, leaderActorId, formations, index: -1, manual: this._manualReplay(), phase: "settled" };
    this._nextParadeStop();
  }

  _nextParadeStop() {
    const run = this.paradeRun;
    if (!run || !this.alive) return;
    if (this.paradeTimer !== null) clearTimeout(this.paradeTimer); this.paradeTimer = null;
    const index = run.index + 1;
    if (index >= run.route.length) { this._cancelParade(); return; }
    const formation = run.formations[index];
    const action = { type: "parade-stop", parade: { v: 1, leaderActorId: run.leaderActorId, route: run.route, stopIndex: index, scale: formation.scale, arranged: true,
      formationLayout: { width: this.layout.width, height: this.layout.height, profile: this.layout.profile } }, positions: formation.positions };
    const commit = () => {
      if (!this.alive || this.paradeRun !== run) return;
      run.phase = "settled"; run.index = index; this.paradeView = null;
      this._commit(action, false);
      if (index === run.route.length - 1) { this._cancelParade(); return; }
      if (!run.manual) this._queueParade(() => this._nextParadeStop(), 220);
    };
    if (run.manual) { commit(); return; }
    run.fromScene = structuredClone(this.scene); run.phase = "travel";
    this.paradeView = applyPlayStageAction(this.scene, action);
    this._render(); this._queueParade(commit, 800);
  }

  _queueParade(callback, delay) {
    const revision = this.paradeRevision;
    this.paradeTimer = setTimeout(() => {
      this.paradeTimer = null;
      if (this.alive && this.paradeRun && revision === this.paradeRevision) callback();
    }, delay);
  }

  _cancelParade(render = true) {
    this._rememberParadeDraft();
    if (this.paradeTimer !== null) clearTimeout(this.paradeTimer);
    this.paradeTimer = null; this.paradeRevision++;
    const active = !!(this.paradeRun || this.paradeDraft || this.paradeView);
    this.paradeRun = null; this.paradeDraft = null; this.paradeView = null;
    if (active) { speech.cancel?.(); if (render && this.alive) this._render(); }
    return active;
  }

  _stopParade() {
    this._cancelParade(false); this.recording = false; this._render(); void this._saveSettled(); speech.say("play_stage_parade_stopped");
  }

  _renderParadeTrail(host) {
    const pending = this.paradeDraft || this.scene.paradeDraft;
    const route = pending?.route || this.scene.parade?.route || [];
    const points = route.map((point) => projectPlayStageGround(this.layout, point.u, point.v));
    const trail = document.createElement("div"); trail.className = "play-stage-trail-picture";
    trail.innerHTML = `<svg viewBox="0 0 ${this.layout.width} ${this.layout.height}" aria-hidden="true"><polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="#fff9dc" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" fill="none" stroke="#a87459" stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round"/>${points.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="14" fill="${!pending && index <= (this.scene.parade?.stopIndex ?? -1) ? "#b8f0d2" : "#ffe98a"}" stroke="#76513d" stroke-width="3"/><path d="m${point.x - 5} ${point.y + 3} 5-6 5 6" fill="none" stroke="#76513d" stroke-width="3" stroke-linecap="round"/>`).join("")}</svg>`;
    host.appendChild(trail);
    if (this.paradeDraft && !points.length) {
      const hint = document.createElement("span"); hint.className = "play-stage-trail-hint"; hint.innerHTML = ICONS.trail;
      Object.assign(hint.style, { left: `${this.layout.ground.x0}px`, top: `${this.layout.ground.y0}px` }); host.appendChild(hint);
    }
    const leaderId = pending?.leaderActorId || this.scene.parade?.leaderActorId;
    const leader = this.scene.actors.find((actor) => actor.id === leaderId);
    if (leader && !leader.hidden) {
      const hit = playStageActorGeometry(leader, this.layout, this.scene).hit;
      const flag = document.createElement("span"); flag.className = "play-stage-parade-leader"; flag.innerHTML = ICONS.parade;
      Object.assign(flag.style, { left: `${hit.left + hit.width / 2 - 16}px`, top: `${Math.max(4, hit.top - 30)}px` }); host.appendChild(flag);
    }
  }

  _paradeMotion(node, before, after) {
    if (this.paradeRun?.phase !== "travel" || !before || !after) return;
    node.classList.add("is-parade-moving");
    node.style.setProperty("--parade-from-x", `${before.x - after.x}px`); node.style.setProperty("--parade-from-y", `${before.y - after.y}px`);
  }

  _startRecording(invitationId = "free") {
    if (!this.alive || this.saving || this.preparing || this.gesture) return;
    this._stopPlayback(false); this._cancelParade(false); this._closeOverlay(); this._interruptInvite();
    this.scene = beginPlayStagePerformance(this.scene, invitationId);
    this.recording = true;
    if (invitationId === "parade") { const owned = this.scene.paradeDraft || this.scene.parade; this.paradeDraft = { leaderActorId: owned?.leaderActorId || this.scene.actors[0].id, route: structuredClone(owned?.route || []) }; this._rememberParadeDraft(); }
    if (this.paradeDraft) { this.selectedActorId = this.paradeDraft.leaderActorId; this.selectedPropId = ""; }
    this._render(); void this._saveSettled();
    speech.say(playStagePerformanceInvitation(invitationId).cue);
  }

  _stopRecording() {
    this.recording = false; this._render(); void this._saveSettled();
    speech.say("play_stage_performance_stopped");
  }

  _requestRecording(invitationId = "free") {
    if (!this.scene.performance?.beats.length) { this._startRecording(invitationId); return; }
    this._openPicker("Keep playing your saved show, or record a new one", [
      { id: "keep-show", label: "keep this show", icon: "play" },
      { id: "new-show", label: "record a new show", icon: "record" },
    ], "", (choice) => { this._closeOverlay(); if (choice.id === "new-show") this._startRecording(invitationId); else this._playPerformance(); });
  }

  _openPerformances() {
    if (this.saving || this.preparing) return;
    this._stopPlayback(); this._cancelParade();
    if (this.recording) this._stopRecording();
    this._openPicker("Choose a show", PLAY_STAGE_PERFORMANCES, "play_stage_performance_choose", (choice) => this._requestRecording(choice.id));
  }

  _playPerformance() {
    if (!this.alive || this.saving || this.preparing || this.gesture || !this.scene.performance?.beats.length) return;
    this._stopPlayback(false); this._cancelParade(false); this.recording = false; this._closeOverlay(); this._interruptInvite(); speech.cancel?.();
    this.replay = { index: -1, manual: this._manualReplay() };
    this._render(); this._scheduleReplay();
  }

  _scheduleReplay() {
    if (!this.replay || this.replay.manual) return;
    const revision = this.replayRevision;
    this.replayTimer = setTimeout(() => {
      this.replayTimer = null;
      if (!this.alive || !this.replay || revision !== this.replayRevision) return;
      this._advancePlayback();
    }, 1000);
  }

  _advancePlayback() {
    if (!this.replay) return;
    if (this.replayTimer !== null) clearTimeout(this.replayTimer);
    this.replayTimer = null;
    if (this.replay.index + 1 >= this.scene.performance.beats.length) { this._stopPlayback(); return; }
    this.replay.index++;
    this._render();
    const beat = this.scene.performance.beats[this.replay.index];
    if (!this.replay.manual && beat.type === "hop-actor") {
      this.surface?.querySelector(`[data-actor-id="${beat.actorId}"]`)?.classList.add("is-hopping");
    }
    this._scheduleReplay();
  }

  _stopPlayback(render = true) {
    const tuneWasPlaying = this._stopPictureShow(false);
    if (this.replayTimer !== null) clearTimeout(this.replayTimer);
    this.replayTimer = null; this.replayRevision++;
    const wasPlaying = !!this.replay; this.replay = null;
    if ((wasPlaying || tuneWasPlaying) && render && this.alive) this._render();
    return wasPlaying;
  }

  _renderPerformanceDock() {
    if (!this.performanceDock) return;
    this.performanceDock.replaceChildren();
    const chrome = this.chrome?.performance;
    const expanded = this.overlay?.dataset?.stagePanel === 'shows';
    const story = stageStoryContext(this.scene);
    const storyWaiting = story?.story.phase==='waiting' && !this.paradeDraft && !this.paradeRun && !this.replay && !this.pictureShowRun;
    const active = !!(this.recording || this.paradeDraft || this.paradeRun || this.replay || this.pictureShowRun || storyWaiting);
    this.root?.classList.toggle("is-replaying", !!this.replay);
    this.root?.classList.toggle("is-recording", this.recording);
    this.performanceDock.hidden = !expanded && !active;
    if (this.castDock) this.castDock.hidden = active;
    for (const name of ['actions', 'basket', 'people']) if (this[name]) this[name].hidden = !!(active && this.chrome?.compact);
    this.root?.classList.toggle('has-active-show', active);
    if (this.root) this.root.dataset.stageTogether = this.scene.together.partnerRole ? "yes" : "no";
    if (!expanded && !active) return;
    if (chrome) {
      Object.assign(this.performanceDock.style, { position: expanded ? 'static' : 'absolute', left: `${chrome.x}px`, top: `${chrome.y}px`, right: "auto", bottom: "auto", width: expanded ? '100%' : `${chrome.width}px` });
      this.performanceDock.classList.toggle("is-on-rail", !expanded);
      this.performanceDock.classList.toggle('is-vertical', !expanded && !!chrome.vertical);
      this.performanceDock.style.setProperty('--stage-show-gap', `${chrome.gap ?? 6}px`);
    }
    this.root?.classList.toggle("is-replaying", !!this.replay);
    this.root?.classList.toggle("is-recording", this.recording);
    if (this.root) this.root.dataset.stageTogether = this.scene.together.partnerRole ? "yes" : "no";
    const buttons = document.createElement("div"); buttons.className = "play-stage-performance-buttons";
    const labelled = (icon, label, caption, cls, action) => {
      const pane = expanded ? this.overlay : null;
      const el = button(icon, label, `play-stage-performance-button ${cls}`, () => {
        if (!this._canUseTools() || el.isConnected === false || pane && this.overlay !== pane) return;
        if (pane) this._closeOverlay(); action();
      });
      if (chrome?.rail && !expanded) Object.assign(el.style, { width: `${chrome.buttonSize}px`, height: `${chrome.buttonSize}px` });
      const words = document.createElement("span"); words.textContent = caption; el.appendChild(words);
      el.disabled = this.saving || this.preparing; return el;
    };
    if (storyWaiting) {
      for (const choice of this._storyChoices(story).slice(0,2)) {
        const el=labelled('people',choice.label,choice.caption,'play-stage-story-action',()=>this._chooseStoryOutcome(choice.id));
        el.querySelector('svg')?.replaceWith(this._storyPicture(choice.id,story)); buttons.appendChild(el);
      }
      buttons.append(this.recording ? labelled('stop','stop recording my show','Stop','',()=>this._stopRecording())
        : labelled('play','leave these story choices and keep playing','Free play','',()=>this._pauseStory()));
    } else if (this.paradeDraft || this.paradeRun) {
      buttons.classList.add("play-stage-parade-button-rows");
      const editing = !!this.paradeDraft;
      buttons.append(labelled(editing ? "play" : "stop", editing ? "go along my parade trail" : "stop the family parade", editing ? "Go" : "Stop", "play-stage-parade-action", () => editing ? this._goParade() : this._stopParade()),
        labelled(editing ? "undo" : "next", editing ? "undo the last trail point" : "next parade stop", editing ? "Undo" : "Next", "play-stage-parade-action", () => editing ? this._undoParade() : this._nextParadeStop()),
        labelled(editing ? "close" : "undo", editing ? "close the trail tool and keep playing" : "undo the last settled parade stop", editing ? "Done" : "Undo", "play-stage-parade-action", () => editing ? this._cancelParade() : this._undoParade()),
        labelled("people", "choose my parade leader", "Leader", "play-stage-parade-action", () => this._chooseParadeLeader()),
        labelled("trail", "change my parade trail", "Trail", "play-stage-parade-action", () => this._openParade(true)),
        labelled("parade", "choose another show invitation", "Shows", "play-stage-parade-action", () => this._openPerformances()));
      buttons.children[0].disabled ||= editing && this.paradeDraft.route.length < 2;
      buttons.children[1].disabled ||= editing ? !this.paradeDraft.route.length : !this.paradeRun.manual;
      const leaderId = this.paradeDraft?.leaderActorId || this.paradeRun?.leaderActorId;
      const leader = this.scene.actors.find((actor) => actor.id === leaderId);
      const source = leader && art.get(leader.art || ACTORS[leader.role]?.art);
      if (source) { const image = source.cloneNode(); image.alt = ""; image.className = "play-stage-parade-leader-thumb"; buttons.children[3].querySelector("svg")?.replaceWith(image); }
    } else if (this.pictureShowRun) {
      const finalStep = this.pictureShowRun.next >= this.pictureShowRun.beats.length;
      buttons.append(labelled('stop', 'Stop our tune; keep this exact show', 'Stop', 'play-stage-picture-show-action', () => this._stopPictureShow()),
        labelled('next', finalStep ? 'Finish this tune; the exact show stays here' : 'Show and hear our next chosen note', finalStep ? 'Finish' : 'Next', 'play-stage-picture-show-action', () => this._advancePictureShow()),
        labelled('people', 'Choose tune or another Theater show', 'Shows', 'play-stage-picture-show-action', () => { this._stopPictureShow(); this._openPictureShowChoices(); }));
      const beat = this.pictureShowRun.beat;
      if (beat) { const image = this._pictureInstrument(beat.instrument); buttons.children[1].querySelector('svg')?.replaceWith(image); }
    } else if (this.replay) {
      buttons.append(labelled("stop", "stop replay and return to my scene", "Stop", "play-stage-replay-stop", () => this._stopPlayback()),
        labelled("next", "show the next part of my performance", "Next", "play-stage-replay-next", () => this._advancePlayback()));
    } else {
      buttons.append(labelled(this.recording ? "stop" : "record", this.recording ? "stop recording my show" : "record my show", this.recording ? "Stop" : "Record", "", () => this.recording ? this._stopRecording() : this._requestRecording()),
        labelled("play", "play my recorded show", "Play", "", () => this._playPerformance()),
        labelled(this.scene.pictureShow ? 'play' : this.scene.parade || this.scene.paradeDraft ? "trail" : "parade", this.scene.pictureShow ? 'Play our exact tune or choose another Theater show' : this.scene.parade || this.scene.paradeDraft ? "change my family parade trail" : "choose a show invitation", this.scene.pictureShow ? 'Our tune' : this.scene.parade || this.scene.paradeDraft ? "Trail" : "Shows", "", () => this.scene.pictureShow ? this._openPictureShowChoices() : this.scene.parade || this.scene.paradeDraft ? this._openParade() : this._openPerformances()));
      buttons.children[1].disabled ||= this.recording || !this.scene.performance?.beats.length;
    }
    const status = document.createElement("div"); status.className = "play-stage-performance-status"; status.setAttribute("role", "status");
    status.hidden = !expanded;
    const beats = this.scene.performance?.beats.length || 0;
    status.textContent = storyWaiting ? (this.recording ? 'Choose your story; these moves are recording' : 'Two ways our story can go')
      : this.paradeDraft ? (this.paradeDraft.route.length < 2 ? "Tap a trail, then Go" : "Your trail is ready")
      : this.pictureShowRun ? (this.pictureShowRun.beat?.role === 'veer' ? 'Veer echoes your tune' : this.pictureShowRun.beat?.pulse ? 'Your tune; Mama keeps pulse' : 'Your picture show')
      : this.paradeRun ? (this.paradeRun.manual ? "Tap Next to parade" : "Following your trail") : this.replay ? (this.replay.manual ? "Tap Next to retell" : "Your show")
      : this.recording ? "Recording your moves" : beats ? "Show stays with scene" : "Make a show";
    if (!expanded) {
      if (this.recording && !storyWaiting && !this.replay && !this.paradeDraft && !this.paradeRun && !this.pictureShowRun) {
        while (buttons.children.length > 1) buttons.lastElementChild.remove();
      } else if (this.paradeDraft || this.paradeRun) {
        while (buttons.children.length > 3) buttons.lastElementChild.remove();
      }
    }
    this.performanceDock.append(buttons, status);
    if (expanded && this.scene.performance?.invitationId && this.scene.performance.invitationId !== "free" && !this.replay && !this.paradeDraft && !this.paradeRun) {
      const invitation = playStagePerformanceInvitation(this.scene.performance.invitationId);
      const card = document.createElement("div"); card.className = "play-stage-performance-invitation";
      card.setAttribute("aria-label", invitation.invitation);
      const icons = document.createElement("div"); icons.className = "play-stage-performance-steps";
      const symbols = { "wrap-prop": "gift", "unwrap-prop": "display", "give-prop": "people", "move-actor": "parade", "hop-actor": "hop", "parade-stop": "trail" };
      for (const step of playStagePerformanceProgress(this.scene.performance)) {
        const image = document.createElement("span"); image.className = step.happened ? "has-happened" : "";
        image.innerHTML = ICONS[symbols[step.verb]]; image.setAttribute("aria-hidden", "true"); icons.appendChild(image);
      }
      const words = document.createElement("span"); words.textContent = invitation.label;
      card.append(icons, words); this.performanceDock.appendChild(card);
      if (invitation.id === "parade") card.appendChild(labelled("trail", "change or replay my family parade route", "Trail", "play-stage-parade-action", () => this._openParade()));
    }
  }

  _boothStyle() {
    const box = this.layout.booth;
    return { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` };
  }

  _actorNode(actor, hidden) {
    const meta = ACTORS[actor.role] || ACTORS.rayna;
    const node = document.createElement("button"); node.type = "button";
    node.className = `play-stage-actor${!this.selectedPropId && this.selectedActorId === actor.id ? " is-selected" : ""}${hidden ? " is-hidden" : ""}`;
    node.dataset.actorId = actor.id; node.setAttribute("aria-label", hidden ? `bring back ${meta.label}` : `move ${meta.label}`);
    const source = art.get(actor.art || meta.art);
    if (source) { const image = source.cloneNode(); image.alt = ""; image.draggable = false; node.appendChild(image); }
    const geometry = playStageActorGeometry(actor, this.layout, this.scene);
    if (hidden) {
      const open = this.layout.booth.opening;
      const offset = playStageHiddenOffset(actor, this.layout);
      node.style.left = `${geometry.hit.left + offset.x - open.x}px`;
      node.style.top = `${geometry.hit.top + offset.y - open.y}px`;
    } else {
      node.style.left = `${geometry.hit.left}px`; node.style.top = `${geometry.hit.top}px`;
    }
    node.style.width = `${geometry.hit.width}px`; node.style.height = `${geometry.hit.height}px`;
    const image = node.querySelector("img");
    if (image) Object.assign(image.style, { left: `${geometry.hit.imageLeft}px`, top: `${geometry.hit.imageTop}px`, width: `${geometry.width}px`, height: `${geometry.height}px` });
    node.style.setProperty("--face", actor.facing === "left" ? "-1" : "1");
    if (actor.expression !== "idle") node.dataset.expression = actor.expression;
    const beforeActor = this.paradeRun?.fromScene?.actors.find((item) => item.id === actor.id);
    if (beforeActor) {
      const before = playStageActorGeometry(beforeActor, playStageParadeDisplayLayout(this.layout, this.paradeRun.fromScene.parade?.scale || 1), this.paradeRun.fromScene).hit;
      this._paradeMotion(node, { x: before.left, y: before.top }, { x: geometry.hit.left, y: geometry.hit.top });
    }
    return node;
  }

  _interactionScene() { return this.paradeProjection?.source === this.scene ? this.paradeProjection.scene : this.scene; }

  _propPosition(prop, scene = this._interactionScene(), layout = this.layout) {
    return playStagePropPosition(prop, scene, layout);
  }

  _openGround(prop, excludeId = prop.id) {
    const saved = this.scene.layout;
    const layout = this.layout || playStageLayout(saved.width, saved.height, saved.profile);
    const surfaceRect = this.surface?.getBoundingClientRect?.();
    const controls = surfaceRect ? [...(this.surface.querySelectorAll?.(".play-stage-context .play-stage-button") || [])].map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left - surfaceRect.left, y: rect.top - surfaceRect.top, width: rect.width, height: rect.height };
    }) : [];
    return playStageOpenGroundPosition(this.scene, layout, prop, excludeId, [...controls, ...this._stageControlReserves()], foregroundProfile());
  }

  _openFrame(prop) {
    const anchor=playStageOpenFrameAnchor(this.scene,this.layout,prop);
    if(!anchor) {
      const message='Move a friend or picture to make room, then tap Display.';
      if(this.overlay) {
        let note=this.overlay.querySelector('.play-stage-frame-refusal');
        if(!note) {
          note=document.createElement('div');note.className='play-stage-performance-invitation play-stage-frame-refusal';
          note.setAttribute('role','status');this.overlay.prepend(note);
        }
        note.textContent=message;this.overlay.scrollTop=0;
      } else {
        this._showGuide(false);
        const words=this.guide?.querySelector('.play-stage-guide-words');
        if(words)words.textContent=message;
      }
    }
    return anchor;
  }

  _stageControlReserves() {
    // Idle tools, Together and prop commands are outside the working scene.
    // Active Stop/Next reuse external rail slots instead of shrinking the cast.
    return [];
  }

  _propOwnerHidden(prop, scene = this.scene) { return !!scene.actors.find((actor) => actor.id === prop.ownerActorId)?.hidden; }

  _pouchLayer(actor, key, offset) {
    const geometry = playStagePouchGeometry(actor, this.layout, this.scene);
    const node = document.createElement("div"); node.className = "play-stage-pouch-layer";
    node.dataset.pouchActorId = actor.id;
    Object.assign(node.style, { left: `${geometry.x - offset.x}px`, top: `${geometry.y - offset.y}px`, width: `${geometry.width}px`, height: `${geometry.height}px` });
    appendArt(node, key, "play-stage-fill");
    const beforeActor = this.paradeRun?.fromScene?.actors.find((item) => item.id === actor.id);
    if (beforeActor) this._paradeMotion(node, playStagePouchGeometry(beforeActor, playStageParadeDisplayLayout(this.layout, this.paradeRun.fromScene.parade?.scale || 1), this.paradeRun.fromScene), geometry);
    return node;
  }

  _appendProp(host, prop, offset = { x: 0, y: 0 }) {
    const owner = this.scene.actors.find((actor) => actor.id === prop.ownerActorId);
    if (owner?.role === "pip") host.appendChild(this._pouchLayer(owner, LAYERS.pipPouchBack, offset));
    host.appendChild(this._propNode(prop, offset));
    if (owner?.role === "pip") host.appendChild(this._pouchLayer(owner, LAYERS.pipPouchRim, offset));
  }

  _propNode(prop, offset = { x: 0, y: 0 }) {
    const node = document.createElement("button"); node.type = "button";
    const geometry = playStagePropGeometry(prop, this.scene, this.layout);
    node.className = `play-stage-prop play-stage-prop-${prop.kind}${prop.ownerActorId ? " is-held" : ""}${prop.placement === "frame" ? " is-framed" : ""}${geometry.pouch ? " is-pouch-item" : ""}${this.selectedPropId === prop.id ? " is-selected" : ""}`;
    const asset = this.scene.assets.find((item) => item.id === prop.assetId);
    const pictureLabel = asset?.source?.kind === "build-lab" ? "bridge" : "picture";
    node.dataset.propId = prop.id; node.setAttribute("aria-label", prop.kind === "picture" ? `move your ${pictureLabel}` : prop.kind === "build" ? "move your build" : `move ${prop.kind}`);
    if (asset?.png) { const image = new Image(); image.alt = ""; image.draggable = false; image.src = asset.png; node.appendChild(image); }
    else { const source = art.get(prop.art); if (source) { const image = source.cloneNode(); image.alt = ""; image.draggable = false; node.appendChild(image); } }
    const box = geometry.hit || geometry.bounds;
    node.style.left = `${box.x - offset.x}px`; node.style.top = `${box.y - offset.y}px`;
    node.style.width = `${box.width}px`; node.style.height = `${box.height}px`;
    node.style.minWidth = "0"; node.style.minHeight = "0";
    node.style.setProperty("--prop-padding", `${geometry.padding}px`);
    node.style.setProperty("--prop-border", `${geometry.border}px`);
    node.style.setProperty("--prop-ring", `${geometry.ring}px`);
    if(geometry.handheld) {
      node.classList.add('is-handheld-toy');
      const image=node.querySelector('img');
      if(image)Object.assign(image.style,{position:'absolute',left:`${geometry.content.x-box.x}px`,top:`${geometry.content.y-box.y}px`,width:`${geometry.content.width}px`,height:`${geometry.content.height}px`});
      if(this.selectedPropId===prop.id) {
        node.style.outline='none'; const outline=document.createElement('span'); outline.className='play-stage-toy-outline';
        Object.assign(outline.style,{position:'absolute',left:`${geometry.bounds.x-box.x}px`,top:`${geometry.bounds.y-box.y}px`,width:`${geometry.bounds.width}px`,height:`${geometry.bounds.height}px`,outline:'4px solid #ffe98a',outlineOffset:'3px',borderRadius:'10px',pointerEvents:'none'}); node.appendChild(outline);
      }
    }
    if (geometry.handle) {
      node.classList.add('is-picture-puppet'); node.setAttribute('aria-label', 'Move your exact picture puppet; give it to a family member');
      const paper = node.querySelector('img'); if (paper) { paper.classList.add('play-stage-puppet-paper'); Object.assign(paper.style, { left: `${geometry.content.x - box.x}px`, top: `${geometry.content.y - box.y}px`, width: `${geometry.content.width}px`, height: `${geometry.content.height}px` }); }
      const handle = new Image(); handle.src = art.get('toy-workshop/puppet-handle-v1')?.src || 'assets/art/final/toy-workshop/puppet-handle-v1.png'; handle.alt = ''; handle.draggable = false; handle.className = 'play-stage-puppet-handle';
      Object.assign(handle.style, { left: `${geometry.handle.x - box.x}px`, top: `${geometry.handle.y - box.y}px`, width: `${geometry.handle.width}px`, height: `${geometry.handle.height}px` });
      const card = document.createElement('span'); card.className = 'play-stage-puppet-card'; Object.assign(card.style, { left: `${geometry.bounds.x - box.x}px`, top: `${geometry.bounds.y - box.y}px`, width: `${geometry.bounds.width}px`, height: `${geometry.bounds.height}px` });
      if (this.selectedPropId === prop.id) {
        // Outline the actual paper, not the tall combined paper/handle hitbox,
        // whose empty sides can otherwise cross the holder's face.
        node.style.outline = 'none'; card.style.outline = '4px solid #ffe98a'; card.style.outlineOffset = '3px';
      }
      node.prepend(card); node.prepend(handle);
    }
    if (geometry.pouch) {
      node.style.setProperty("--pouch-item-width", `${geometry.content.width}px`);
      node.style.setProperty("--pouch-item-height", `${geometry.content.height}px`);
    }
    if (prop.wrapped) {
      node.classList.add("is-wrapped"); node.setAttribute("aria-label", `move your wrapped ${pictureLabel} surprise`);
      const cover = document.createElement("span"); cover.className = "play-stage-gift-cover"; cover.innerHTML = ICONS.gift; cover.setAttribute("aria-hidden", "true"); node.appendChild(cover);
      if(geometry.handheld)Object.assign(cover.style,{left:`${geometry.bounds.x-box.x}px`,top:`${geometry.bounds.y-box.y}px`,width:`${geometry.bounds.width}px`,height:`${geometry.bounds.height}px`});
    }
    const beforeProp = this.paradeRun?.fromScene?.props.find((item) => item.id === prop.id);
    if (prop.ownerActorId && beforeProp) this._paradeMotion(node, playStagePropGeometry(beforeProp, this.paradeRun.fromScene, playStageParadeDisplayLayout(this.layout, this.paradeRun.fromScene.parade?.scale || 1)).hit || playStagePropGeometry(beforeProp, this.paradeRun.fromScene, playStageParadeDisplayLayout(this.layout, this.paradeRun.fromScene.parade?.scale || 1)).bounds, box);
    return node;
  }

  _canUseTools() {
    return !!(this.alive && this.scene && !this.gesture && !this.pen?.drawing && !this.saving && !this.preparing && !this.checkpointing);
  }

  _openToolPane(label, kind) {
    if (!this._canUseTools() || !this.overlayHost) return null;
    this._closeOverlay(); this._interruptInvite(); this.surface.inert = true;
    const pane = document.createElement('div'); pane.className = 'play-stage-overlay play-stage-tools';
    pane.dataset.stagePanel = kind; pane.setAttribute('role', 'dialog'); pane.setAttribute('aria-label', label);
    const heading = document.createElement('div'); heading.className = 'play-stage-tools-heading';
    const words = document.createElement('span'); words.textContent = label;
    heading.append(button('back', 'back to my stage', '', () => { if (this.overlay === pane && this._canUseTools()) this._closeOverlay(); }), words);
    pane.appendChild(heading); this.overlayHost.appendChild(pane); this.overlay = pane;
    return pane;
  }

  _openStageTools() {
    const pane = this._openToolPane('My shows and stage tools', 'shows'); if (!pane) return false;
    pane.appendChild(this.performanceDock);
    const story = this._storyCard('Our little story Playday', 'Three beginnings to choose or change', 'curtain', () => this._openStoryDay(), pane);
    pane.appendChild(story);
    const context=stageStoryContext(this.scene);
    if (context?.story.phase==='waiting' && context.prop?.kind==='picture' && context.story.episode==='ending') {
      pane.appendChild(this._storyCard('Display my exact picture', 'Another ending for our story', 'display',()=>this._chooseStoryOutcome('display'),pane,context));
    }
    const extra = document.createElement('div'); extra.className = 'play-stage-tool-extras';
    extra.append(this.help, this.talk); pane.appendChild(extra);
    this._renderPerformanceDock(); return true;
  }

  _storyPicture(mode, context = null) {
    const first=context?.actor || this.scene.actors[0], second=context?.partner || this.scene.actors.find(row=>row.id!==first?.id);
    const prop=context?.prop || this.scene.props.find(row=>row.placement!=='basket');
    const picture=document.createElement('span'); picture.className=`play-stage-story-picture is-${mode}`; picture.setAttribute('aria-hidden','true');
    const addActor=(actor,cls)=> { if(actor) appendArt(picture,actor.art || ACTORS[actor.role]?.art,cls); };
    const addProp=()=> {
      const png=prop && this.scene.assets.find(row=>row.id===prop.assetId)?.png;
      if(png) { const image=document.createElement('img'); image.src=png; image.alt=''; image.className='story-prop'; picture.appendChild(image); }
      else if(prop) appendArt(picture,prop.art,'story-prop');
    };
    if(['curtain','peek','leave','display','ending'].includes(mode)) appendArt(picture,LAYERS.front,'story-booth');
    if(['sharing','together','pass'].includes(mode)) { addActor(first,'story-first'); addActor(second,'story-second'); addProp(); }
    else if(['keep','come-out'].includes(mode)) { addActor(first,'story-first'); if(mode==='keep')addProp(); }
    else if(mode==='peek' || mode==='curtain') addActor(first,'story-first');
    else addProp();
    return picture;
  }

  _storyCard(label, caption, pictureMode, action, pane, context = null) {
    const card=button('play',label,'play-stage-story-card',()=> {
      if(this.overlay!==pane || card.isConnected===false || !this._canUseTools())return;
      action();
    });
    card.replaceChildren(this._storyPicture(pictureMode,context));
    const words=document.createElement('span'); words.className='play-stage-story-card-label'; words.textContent=label;
    const detail=document.createElement('span'); detail.className='play-stage-story-card-caption'; detail.textContent=caption;
    card.append(words,detail); return card;
  }

  _openStoryDay() {
    const pane=this._openToolPane('Our little story Playday','story'); if(!pane)return false;
    const choices=document.createElement('div'); choices.className='play-stage-story-cards';
    const context=stageStoryContext(this.scene);
    for(const episode of STAGE_STORY_EPISODES) {
      const same=context?.story.episode===episode.id;
      const caption=same && context.story.phase==='waiting' ? 'Continue my choices' : same && context.story.phase==='chosen' ? 'Try another way' : 'Choose our friends and story';
      choices.appendChild(this._storyCard(episode.label,caption,episode.id,()=> {
        const current=stageStoryContext(this.scene);
        if(current?.story.episode===episode.id && current.story.phase==='waiting') { this._closeOverlay(); this._showGuide(true); }
        else this._chooseStoryBeginning(episode.id);
      },pane));
    }
    pane.appendChild(choices);
    if(context) { const change=this._storyCard('Change our story friends or toy','Choose different pictured participants',context.story.episode,()=> {
      const current=stageStoryContext(this.scene); if(current)this._chooseStoryBeginning(current.story.episode,true);
    },pane,context); change.classList.add('is-change'); pane.appendChild(change); }
    if(context?.story.phase==='waiting' && context.story.episode==='ending' && context.prop.kind==='picture') {
      pane.appendChild(this._storyCard('Display my exact picture','An ending on our picture stand','display',()=>this._chooseStoryOutcome('display'),pane,context));
    }
    const actions=document.createElement('div'); actions.className='play-stage-story-cards';
    const record=button(this.recording?'stop':'record',this.recording?'stop recording my show':'record our story choices','play-stage-story-small',()=> {
      if(this.overlay!==pane || record.isConnected===false || !this._canUseTools())return;
      this._closeOverlay(); this.recording ? this._stopRecording() : this._requestRecording();
    });
    const words=document.createElement('span'); words.textContent=this.recording?'Stop recording':'Record our story'; record.appendChild(words); actions.appendChild(record);
    const free=button('play','leave these story choices and keep playing','play-stage-story-small',()=> {
      if(this.overlay!==pane || free.isConnected===false || !this._canUseTools())return;
      this._pauseStory();
    });
    const freeWords=document.createElement('span'); freeWords.textContent='Free play'; free.appendChild(freeWords); actions.appendChild(free);
    pane.appendChild(actions); return true;
  }

  _chooseStoryBeginning(episode, change = false) {
    if(!this._canUseTools() || !STAGE_STORY_EPISODES.some(row=>row.id===episode))return false;
    const actorChoice=(actor)=>({id:actor.id,label:ACTORS[actor.role]?.label || actor.role,art:actor.art || ACTORS[actor.role]?.art,caption:ACTORS[actor.role]?.label || actor.role});
    if(!change) {
      const first=this.scene.actors.find(row=>row.id===this.selectedActorId) || this.scene.actors[0];
      if(episode==='curtain')return this._beginStory(episode,first.id);
      const props=this.scene.props.filter(prop=>this.scene.actors.filter(actor=>stageStoryCanHold(actor,prop)).length >= (episode==='sharing'?2:1));
      const prop=props.find(row=>row.id===this.selectedPropId) || props.find(row=>row.placement!=='basket') || props[0];
      if(!prop) { this._openStoryToyPicker(episode); return false; }
      const actors=this.scene.actors.filter(actor=>stageStoryCanHold(actor,prop));
      const actor=actors.find(row=>row.id===first.id) || actors[0], partner=actors.find(row=>row.id!==actor.id);
      return this._beginStory(episode,actor.id,prop.id,partner?.id || '');
    }
    if(episode==='curtain') {
      this._openPicker('Who is waiting at our curtain?',this.scene.actors.map(actorChoice),'',choice=>this._beginStory(episode,choice.id)); return true;
    }
    const props=this.scene.props.filter(prop=>this.scene.actors.filter(actor=>stageStoryCanHold(actor,prop)).length >= (episode==='sharing'?2:1));
    if(!props.length) { this._openStoryToyPicker(episode); return false; }
    this._openPicker(episode==='sharing'?'One toy for our two friends':'What will our ending use?',props.map(prop=>({
      id:prop.id,label:prop.kind==='picture'?'my exact picture':prop.kind==='build'?'my build':`game ${prop.kind==='toy'?'ball':prop.kind}`,
      art:prop.art,preview:this.scene.assets.find(row=>row.id===prop.assetId)?.png || '',caption:prop.kind==='picture'?'My picture':prop.kind==='build'?'My build':`Game ${prop.kind==='toy'?'ball':prop.kind}`,
    })),'',choice=> {
      const prop=this.scene.props.find(row=>row.id===choice.id); if(!prop)return;
      this._openPicker(episode==='sharing'?'Who has the first turn?':'Which friend is in our ending?',this.scene.actors.filter(actor=>stageStoryCanHold(actor,prop)).map(actorChoice),'',first=> {
        if(episode==='ending') { this._beginStory(episode,first.id,prop.id); return; }
        this._openPicker('Who will join our story?',this.scene.actors.filter(actor=>actor.id!==first.id && stageStoryCanHold(actor,prop)).map(actorChoice),'',second=>this._beginStory(episode,first.id,prop.id,second.id));
      });
    }); return true;
  }

  _openStoryToyPicker(episode) {
    const choices=PROP_CHOICES.filter(prop=>this.scene.actors.filter(actor=>stageStoryCanHold(actor,prop)).length >= (episode==='sharing'?2:1));
    this._openPicker('Choose a game toy for our story',choices.map(row=>({...row,caption:`Game ${row.label}`})),'play_stage_choose_stage_item',choice=>void this._chooseProp({...choice,storyEpisode:episode}));
  }

  _beginStory(episode,actorId,propId='',partnerId='') {
    if(!this._canUseTools())return false;
    const before=this.scene;
    this._closeOverlay(); this._commit({type:'story-begin',episode,actorId,propId,partnerId},false);
    const context=stageStoryContext(this.scene);
    if(!context || context.story.episode!==episode || context.story.actorId!==actorId || context.story.phase!=='waiting'
      || JSON.stringify(before.storyDay)===JSON.stringify(this.scene.storyDay) && JSON.stringify([before.actors,before.props])===JSON.stringify([this.scene.actors,this.scene.props]))return false;
    this.selectedActorId=actorId; this.selectedPropId=propId; this._render();
    this._showStoryGuide(STAGE_STORY_EPISODES.find(row=>row.id===episode).cue); return true;
  }

  _storyChoices(context) {
    const {story,actor,partner}=context, first=ACTORS[actor.role]?.label || actor.role, second=ACTORS[partner?.role]?.label || partner?.role;
    if(story.episode==='curtain')return [{id:'come-out',label:`let ${first} come out`,caption:'Come out'},{id:'peek',label:`let ${first} peek from the other side`,caption:'Peek'}];
    if(story.episode==='sharing')return [{id:'pass',label:`pass our story toy to ${second}`,caption:'Your turn'},{id:'together',label:'put our story toy between the two friends',caption:'Together'}];
    return [{id:'keep',label:`let ${first} keep our story toy`,caption:'Keep toy'},{id:'leave',label:'leave our story toy for another story',caption:'Leave here'},...(context.prop.kind==='picture'?[{id:'display',label:'Display my exact picture',caption:'Display'}]:[])];
  }

  _chooseStoryOutcome(choice) {
    if(!this._canUseTools())return false;
    const context=stageStoryContext(this.scene); if(context?.story.phase!=='waiting' || !this._storyChoices(context).some(row=>row.id===choice))return false;
    const before=this.scene, {story,actor,partner,prop}=context;
    const frameAnchor=choice==='display' ? this._openFrame(prop) : null;
    if(choice==='display' && !frameAnchor)return false;
    const position=choice==='together' ? {u:(actor.u+partner.u)/2,v:(actor.v+partner.v)/2}
      : choice==='leave' ? this._openGround({...prop,placement:'ground',ownerActorId:''},prop.id) : {};
    this._closeOverlay(); this._commit({type:'story-choice',choice,actorId:actor.id,propId:prop?.id || '',...position,...(frameAnchor?{frameAnchor}:{})},false);
    if(JSON.stringify(before.storyDay)===JSON.stringify(this.scene.storyDay))return false;
    sfx.play(choice==='pass'?'chime':choice==='peek'?'whoosh':'tap');
    this._showStoryGuide(stageStoryResultCue(story.episode,choice)); return true;
  }

  _pauseStory() {
    if(!this._canUseTools())return false;
    this._closeOverlay(); if(this.scene.storyDay?.phase==='waiting')this._commit({type:'story-pause'},false);
    this._dismissGuide(); return true;
  }

  _openFriends() {
    const pane = this._openToolPane('Friends and taking turns', 'friends'); if (!pane) return false;
    const cast = document.createElement('div'); cast.className = 'play-stage-tool-cast';
    this._renderDock(cast, true); pane.append(cast, this.togetherDock); this._renderTogetherDock();
    const invite = button('people', 'invite another family member', 'play-stage-tool-invite', () => {
      if (this.overlay === pane && this._canUseTools()) this._openPeople();
    });
    const caption = document.createElement('span'); caption.textContent = 'Invite'; invite.appendChild(caption); pane.appendChild(invite);
    return true;
  }

  _updateSelectionTool() {
    if (!this.actions) return;
    const prop = this.scene.props.find(item => item.id === this.selectedPropId && item.placement !== 'basket');
    const actor = this.scene.actors.find(item => item.id === this.selectedActorId);
    const png = prop && this.scene.assets.find(asset => asset.id === prop.assetId)?.png;
    const source = art.get(prop?.art || (actor && (actor.art || ACTORS[actor.role]?.art)));
    this.actions.replaceChildren();
    if (png) { const image = document.createElement('img'); image.src = png; image.alt = ''; image.className = 'play-stage-tool-picture'; this.actions.appendChild(image); }
    else if (source) { const image = source.cloneNode(); image.alt = ''; image.className = 'play-stage-tool-picture'; this.actions.appendChild(image); }
    else this.actions.innerHTML = ICONS[prop ? 'display' : 'peek'];
    const caption = document.createElement('span'); caption.textContent = prop ? 'Use' : 'Play'; this.actions.appendChild(caption);
    this.actions.setAttribute('aria-label', prop ? prop.kind === 'picture' ? 'Use my picture: give, put down, display, wrap or put away' : `Use my ${prop.kind}: give, put down or put away` : `Use ${ACTORS[actor?.role]?.label || 'my puppet'}: Peek or hop`);
    this.actions.disabled = !prop && (!actor || actor.hidden) || this.saving || this.preparing || this.checkpointing;
  }

  _openSelectionTools() {
    if (this.replay || this.paradeRun || this.paradeDraft) return false;
    const prop = this.scene.props.find(item => item.id === this.selectedPropId && item.placement !== 'basket');
    const actor = this.scene.actors.find(item => item.id === this.selectedActorId);
    if (!prop && (!actor || actor.hidden)) return false;
    const pane = this._openToolPane(prop ? `Use my ${prop.kind}` : `Play with ${ACTORS[actor.role]?.label || 'my puppet'}`, 'selection'); if (!pane) return false;
    const commands = document.createElement('div'); commands.className = 'play-stage-tool-actions'; commands.dataset.stageTools = 'yes';
    this._renderContext(commands); pane.appendChild(commands); return true;
  }

  _renderContext(host) {
    const pane = host.dataset?.stageTools ? this.overlay : null;
    const execute = action => () => {
      if (!this._canUseTools() || pane && this.overlay !== pane) return;
      if (pane) this._closeOverlay(); action();
    };
    const selected = this.scene.props.find((item) => item.id === this.selectedPropId && item.placement !== "basket");
    if (selected) {
      const geometry = playStagePropGeometry(selected, this.scene, this.layout);
      const positions = this._stageControlReserves();
      const add = (icon, label, caption, action) => {
        const control = button(icon, label, "play-stage-context-action", execute(action));
        control.disabled = this.saving || this.preparing;
        const text = document.createElement("span"); text.textContent = caption; control.appendChild(text);
        const position = playStageContextPosition(this.scene, this.layout, geometry.bounds, positions);
        control.style.left = `${position.x}px`; control.style.top = `${position.y}px`;
        positions.push({ ...position, width: 76, height: 76 }); host.appendChild(control);
      };
      if (this.scene.actors.some(actor => !actor.hidden && actor.id !== selected.ownerActorId && playStageCanHold(actor, selected))) {
        add('people', `give my ${selected.kind} to a friend`, 'Give', () => this._choosePropHolder(selected.id));
      }
      if (selected.ownerActorId) {
        add('down', `put my ${selected.kind} down on the stage`, 'Put down', () => {
          const owner = this.scene.actors.find(actor => actor.id === selected.ownerActorId);
          const position = this._openGround({ ...selected, ownerActorId: '', placement: 'ground', u: owner?.u ?? selected.u, v: owner?.v ?? selected.v });
          this._commit({ type: 'place-prop', propId: selected.id, placement: 'ground', ...position });
        });
      }
      add("basket", `put away ${selected.kind}`, "Put away", () => {
        this.selectedPropId = "";
        this._commit({ type: "place-prop", propId: selected.id, placement: "basket" });
      });
      if (selected.kind === "picture") {
        const framed = selected.placement === "frame";
        add(framed ? "down" : "display", framed ? "take picture off display" : "display your picture", framed ? "Take down" : "Display", () => {
          const frameAnchor=framed ? null : this._openFrame(selected);
          if(!framed && !frameAnchor)return;
          this._commit({ type: "place-prop", propId: selected.id, placement: framed ? "ground" : "frame", u: selected.u, v: selected.v,...(frameAnchor?{frameAnchor}:{}) });
        });
        add("gift", selected.wrapped ? "open picture surprise" : "wrap your picture as a surprise", selected.wrapped ? "Open" : "Wrap", () =>
          this._commit({ type: selected.wrapped ? "unwrap-prop" : "wrap-prop", propId: selected.id }));
      }
      return;
    }
    const actor = this.scene.actors.find((item) => item.id === this.selectedActorId);
    if (!actor || actor.hidden || this.selectedPropId) return;
    const booth = this.layout.booth;
    const hit = playStageActorGeometry(actor, this.layout, this.scene).hit;
    const hide = button("peek", `hide ${ACTORS[actor.role]?.label || "puppet"} in the booth`, "play-stage-context-action play-stage-hide", execute(() => {
      const middle = booth.opening.x + booth.opening.width / 2;
      const foot = playStageActorGeometry(actor, this.layout, this.scene).foot;
      this._commit({ type: "hide-actor", actorId: actor.id, peekSide: foot.x > middle ? "right" : "left" });
    }));
    hide.disabled = this.saving || this.preparing;
    const caption = document.createElement("span"); caption.textContent = "Peek"; hide.appendChild(caption);
    const hideAt = playStageContextPosition(this.scene, this.layout,
      { x: hit.left, y: hit.top, width: hit.width, height: hit.height }, this._stageControlReserves(),
      [[booth.x + booth.width / 2 - 38, booth.y + booth.height - 8],
        [booth.x + booth.width - 76, booth.y + booth.height - 8],
        [booth.x, booth.y + booth.height - 8],
        [booth.x - 84, booth.y + booth.height / 2 - 38], [booth.x + booth.width + 8, booth.y + booth.height / 2 - 38]]);
    hide.style.left = `${hideAt.x}px`; hide.style.top = `${hideAt.y}px`; host.appendChild(hide);
    const action = button("hop", `hop with ${ACTORS[actor.role]?.label || "puppet"}`, "play-stage-expression", execute(() => {
      if (this.saving || this.preparing) return;
      this._commit({ type: "hop-actor", actorId: actor.id }, false);
      const node = this.surface.querySelector(`[data-actor-id="${actor.id}"]`);
      if (node) { node.classList.remove("is-hopping"); void node.offsetWidth; node.classList.add("is-hopping"); }
      sfx.play("pop");
    }));
    action.disabled = this.saving;
    const position = playStageHopPosition(actor, this.scene, this.layout, [...this._stageControlReserves(), { ...hideAt, width: 76, height: 76 }]);
    action.style.left = `${position.x}px`;
    action.style.top = `${position.y}px`;
    host.appendChild(action);
  }

  _choosePropHolder(propId) {
    if (!this._canUseTools()) return false;
    const prop = this.scene.props.find(item => item.id === propId && item.placement !== 'basket');
    if (!prop) return false;
    const choices = this.scene.actors.filter(actor => !actor.hidden && actor.id !== prop.ownerActorId && playStageCanHold(actor, prop)).map(actor => ({
      id: actor.id, art: actor.art || ACTORS[actor.role]?.art,
      label: `give my ${prop.kind} to ${ACTORS[actor.role]?.label || 'my friend'}`, caption: ACTORS[actor.role]?.label || 'Friend',
    }));
    if (!choices.length) return false;
    this._openPicker('Choose who holds it', choices, '', choice => {
      if (!this._canUseTools()) return;
      const current = this.scene.props.find(item => item.id === propId && item.placement !== 'basket');
      const actor = this.scene.actors.find(item => item.id === choice.id && !item.hidden);
      if (!current || !actor || !playStageCanHold(actor, current)) return;
      this._closeOverlay(); this.selectedPropId = current.id;
      this._commit({ type: 'give-prop', propId: current.id, actorId: actor.id, handSocket: 'right' });
    });
    return true;
  }

  _renderDock(host = this.castDock, expanded = false) {
    host.replaceChildren();
    if (!expanded && this.chrome?.compact) return;
    const pane = expanded ? this.overlay : null;
    for (const actor of this.scene.actors) {
      const meta = ACTORS[actor.role] || ACTORS.rayna;
      const chip = document.createElement("button"); chip.type = "button"; chip.className = `play-stage-cast-chip${!this.selectedPropId && actor.id === this.selectedActorId ? " is-selected" : ""}${actor.hidden ? " is-peeking" : ""}`;
      chip.disabled = this.saving || this.preparing;
      const slot = !expanded && this.chrome?.cast[host.children.length];
      if (slot) Object.assign(chip.style, { left: `${slot.x}px`, top: `${slot.y}px`, right: "auto", bottom: "auto", width: `${slot.width}px`, height: `${slot.height}px` });
      chip.setAttribute("aria-label", this.paradeDraft ? `choose ${meta.label} as parade leader` : actor.hidden ? `bring back ${meta.label} from the booth` : `choose ${meta.label}`);
      const source = art.get(actor.art || meta.art); if (source) { const img = source.cloneNode(); img.alt = ""; img.draggable = false; chip.appendChild(img); }
      if (actor.hidden) { const caption = document.createElement("span"); caption.textContent = "Come out"; chip.appendChild(caption); }
      tapify(chip, () => { if (!this._canUseTools() || chip.isConnected === false || pane && this.overlay !== pane) return; if (pane) this._closeOverlay(); this.selectedPropId = ""; this.selectedActorId = actor.id; if (this.paradeDraft) { this.paradeDraft.leaderActorId = actor.id; this._rememberParadeDraft(); this._render(); } else if (actor.hidden) this._commit({ type: "reveal-actor", actorId: actor.id }); else this._render(); });
      host.appendChild(chip);
    }
  }

  _renderTogetherDock() {
    const dock = this.togetherDock;
    dock.replaceChildren();
    if (this.paradeDraft || this.paradeRun) return;
    const together = this.scene.together;
    const active = !!together.partnerRole;
    const pane = this.overlay?.dataset?.stagePanel === 'friends' ? this.overlay : null;
    const use = action => () => { if (!this._canUseTools() || pane && this.overlay !== pane) return; if (pane) this._closeOverlay(); action(); };
    const mode = button("people", active ? "play alone" : "play together", "play-stage-together-mode", use(() => {
      if (active) this._commit({ type: "together-solo" });
      else this._openTogether();
    }));
    mode.disabled = this.saving || this.preparing;
    const modeLabel = document.createElement("span"); modeLabel.textContent = active ? "Solo" : "Together";
    mode.appendChild(modeLabel); dock.appendChild(mode);
    if (!active) return;
    for (const [turn, role, label] of [["rayna", "rayna", "My turn"], ["partner", together.partnerRole, "Your turn"]]) {
      const meta = ACTORS[role];
      const token = document.createElement("button"); token.type = "button";
      token.className = `play-stage-turn-token play-stage-turn-${turn}${together.turn === turn ? " is-active" : ""}`;
      token.setAttribute("aria-label", `${label}, ${meta.label}${together.turn === turn ? ", playing" : ""}`);
      token.setAttribute("aria-pressed", String(together.turn === turn));
      token.disabled = this.saving || this.preparing;
      const source = art.get(meta.art);
      if (source) { const image = source.cloneNode(); image.alt = ""; image.draggable = false; token.appendChild(image); }
      const caption = document.createElement("span"); caption.textContent = label; token.appendChild(caption);
      isolateStageControlPointer(tapify(token, use(() => this._commit({ type: "together-turn", turn }, false))));
      dock.appendChild(token);
    }
  }

  _local(point) { return { x: point.x, y: point.y }; }

  _gestureStart(point, event) {
    if (this.paradeRun) this._cancelParade();
    this._stopPlayback();
    this.childInteracted = true;
    this._interruptInvite();
    if (this.overlay || this.saving || this.preparing || this.checkpointing) return;
    if (this.paradeDraft) { this.gesture = { kind: "parade", start: point, point, moved: false }; this._setBusy(true); return; }
    const actorNode = event.target.closest?.("[data-actor-id]");
    const propNode = event.target.closest?.("[data-prop-id]");
    if (actorNode) {
      const actor = this._interactionScene().actors.find((item) => item.id === actorNode.dataset.actorId);
      if (!actor) return;
      if (actor.hidden) { this._commit({ type: "reveal-actor", actorId: actor.id }); return; }
      const geometry = playStageActorGeometry(actor, this.layout);
      this.gesture = { kind: "actor", id: actor.id, start: point, point, moved: false, grab: { x: point.x - geometry.foot.x, y: point.y - geometry.foot.y }, settled: { u: actor.u, v: actor.v } };
    } else if (propNode) {
      const prop = this.scene.props.find((item) => item.id === propNode.dataset.propId);
      if (!prop) return;
      const anchor = this._propPosition(prop);
      this.gesture = { kind: "prop", id: prop.id, start: point, point, moved: false, grab: { x: point.x - anchor.x, y: point.y - anchor.y }, settled: { u: prop.u, v: prop.v, ownerActorId: prop.ownerActorId, placement: prop.placement } };
    } else {
      this.gesture = { kind: "stage", start: point, point, moved: false };
    }
    this._setBusy(true);
  }

  _gestureMove(point) {
    if (!this.gesture) return;
    this.gesture.point = point;
    this.gesture.moved ||= Math.hypot(point.x - this.gesture.start.x, point.y - this.gesture.start.y) > 7;
    if (!this.gesture.moved || this.gesture.kind === "stage" || this.gesture.kind === "parade") return;
    const node = this.surface.querySelector(`[data-${this.gesture.kind}-id="${this.gesture.id}"]`);
    if (!node) return;
    const dx = point.x - this.gesture.start.x; const dy = point.y - this.gesture.start.y;
    const actor = this.gesture.kind === "actor" ? this._interactionScene().actors.find((item) => item.id === this.gesture.id) : null;
    const visual = actor ? projectedActorDragTranslation(actor, this._interactionScene(), this.layout, dx, dy) : { x: dx, y: dy };
    const transform = `translate(${visual.x}px,${visual.y}px)`;
    node.style.transform = transform;
    if (this.gesture.kind === "actor") {
      for (const prop of this.scene.props.filter((item) => item.ownerActorId === this.gesture.id)) {
        const held = this.surface.querySelector(`[data-prop-id="${prop.id}"]`); if (held) held.style.transform = transform;
      }
      for (const layer of this.surface.querySelectorAll(`[data-pouch-actor-id="${this.gesture.id}"]`)) layer.style.transform = transform;
    }
  }

  _inside(rect, point, padding = 0) { return point.x >= rect.x - padding && point.x <= rect.x + rect.width + padding && point.y >= rect.y - padding && point.y <= rect.y + rect.height + padding; }

  _gestureEnd(points, meta) {
    const gesture = this.gesture; this.gesture = null;
    if (!gesture) { this._setBusy(false); return; }
    if (meta.cancelled || meta.discarded) { this._render(); this._setBusy(false); return; }
    const point = gesture.point || gesture.start;
    if (gesture.kind === "parade") { this._addParadePoint(point); this._setBusy(false); return; }
    if (gesture.kind === "actor") {
      if (!gesture.moved && this.selectedPropId) {
        const actor = this.scene.actors.find((item) => item.id === gesture.id);
        const selected = this.scene.props.find((item) => item.id === this.selectedPropId);
        if (actor && playStageCanHold(actor, selected)) { const propId = this.selectedPropId; this.selectedPropId = ""; this._commit({ type: "give-prop", propId, actorId: actor.id }); }
        else { this.selectedActorId = gesture.id; this.selectedPropId = ""; this._render(); }
      }
      else if (!gesture.moved) { this.selectedActorId = gesture.id; this.selectedPropId = ""; this._render(); }
      else if (this._inside(this.layout.booth.opening, point, 16)) this._commit({ type: "hide-actor", actorId: gesture.id, peekSide: point.x > this.layout.booth.opening.x + this.layout.booth.opening.width / 2 ? "right" : "left" });
      else { const normal = inversePlayStageGround(this.layout, point.x - gesture.grab.x, point.y - gesture.grab.y); this._commit({ type: "move-actor", actorId: gesture.id, ...normal }); }
    } else if (gesture.kind === "prop") {
      if (!gesture.moved) { this.selectedPropId = gesture.id; this._render(); }
      else {
        const prop = this.scene.props.find((item) => item.id === gesture.id);
        const recipient = this._nearestHolder(point, 78, prop);
        if (recipient) this._commit({ type: "give-prop", propId: gesture.id, actorId: recipient.id, handSocket: "right" });
        else { const normal = inversePlayStageGround(this.layout, point.x - gesture.grab.x, point.y - gesture.grab.y); this._commit({ type: "move-prop", propId: gesture.id, ...normal }); }
      }
    } else if (!gesture.moved && this.selectedPropId) {
      const prop = this.scene.props.find((item) => item.id === this.selectedPropId);
      this.selectedPropId = "";
      if (prop) { const normal = inversePlayStageGround(this.layout, point.x, point.y); this._commit({ type: "move-prop", propId: prop.id, ...normal }); }
    } else if (!gesture.moved && this.selectedActorId) {
      const actor = this.scene.actors.find((item) => item.id === this.selectedActorId);
      if (actor && !actor.hidden && this._inside(this.layout.booth.opening, point, 12)) this._commit({ type: "hide-actor", actorId: actor.id, peekSide: point.x > this.layout.booth.opening.x + this.layout.booth.opening.width / 2 ? "right" : "left" });
      else if (actor && !actor.hidden && !this._inside(this.layout.booth, point, 0)) { const normal = inversePlayStageGround(this.layout, point.x, point.y); this._commit({ type: "move-actor", actorId: actor.id, ...normal }); }
    }
    this._setBusy(false);
  }

  _nearestHolder(point, radius, prop) {
    let best = null; let distance = radius;
    const visible = this._interactionScene();
    for (const actor of visible.actors) {
      const meta = ACTORS[actor.role];
      if (!playStageCanHold(actor, prop) || actor.hidden) continue;
      const hand = meta.carry === "pouch" ? playStagePouchGeometry(actor, this.layout, visible).item : playStageActorGeometry(actor, this.layout, visible).hand;
      const d = hand ? Math.hypot(point.x - hand.x, point.y - hand.y) : Infinity;
      if (d < distance) { distance = d; best = actor; }
    }
    return best;
  }

  _cancelGesture() { if (!this.gesture) return; this.gesture = null; this._render(); this._setBusy(false); }

  _setBusy(value) { this.root?.classList.toggle("is-acting", !!value); if (!value) bus.emit("activity:idle", { id: "play-stage" }); }

  _saveSettled() {
    const snapshot = this.scene;
    // Enter the shared state queue now. Parent backup/reset flushes that queue;
    // deferring this call behind controller bookkeeping could write after a clear.
    const write = savePlayStageCurrent(snapshot);
    this.settledTail = this.settledTail.catch(() => undefined).then(async () => {
      await write;
      if (this.alive && this.scene === snapshot) await resume.save({ screen: "play-stage", params: {}, strokes: [] });
    });
    // Observe rejection without replacing the rejecting tail used by exits.
    void this.settledTail.catch(() => {});
    return this.settledTail;
  }

  _commit(action, sound = true) {
    if (!this.alive || this.saving || this.preparing || this.checkpointing) return;
    this.childInteracted = true;
    if (action.type !== "parade-stop") this._cancelParade(false);
    this._stopPlayback(false);
    this._interruptInvite();
    const hiddenBefore = action.type === "reveal-actor" && this.scene.actors.some((actor) => actor.id === action.actorId && actor.hidden);
    const before = this.scene;
    if (action.type !== "parade-stop" && action.type !== "layout" && this.paradeProjection?.source === before) action = { ...action, adoptPositions: this.paradeProjection.scene.actors.map((actor) => ({ actorId: actor.id, u: actor.u, v: actor.v })) };
    this.scene = applyPlayStageAction(this.scene, action);
    if (this.recording && (action.type !== "hop-actor" || this.scene.actors.some((actor) => actor.id === action.actorId && !actor.hidden))) {
      this.scene = recordPlayStageBeat(this.scene, before, action);
      if (this.scene.performance.beats.length >= PLAY_STAGE_MAX_BEATS) this.recording = false;
    }
    this._render(); void this._saveSettled();
    if (hiddenBefore && this.scene.actors.some((actor) => actor.id === action.actorId && !actor.hidden) && !this.voiceFlags.has("play_stage_actor_revealed")) {
      this.voiceFlags.add("play_stage_actor_revealed"); speech.say("play_stage_actor_revealed");
    }
    if (sound) sfx.play(action.type?.includes("hide") ? "whoosh" : action.type === "give-prop" ? "chime" : "tap");
    bus.emit("activity:idle", { id: "play-stage" });
  }

  _undo() {
    if (this.saving || this.preparing || this.checkpointing) return;
    if (this.paradeDraft) { this._undoParade(); return; }
    this._cancelParade(false);
    this._stopPlayback(false);
    const before = this.scene; this.scene = undoPlayStage(this.scene);
    if (this.recording) this.scene = recordPlayStageBeat(this.scene, before, { type: "undo" });
    if (this.scene.performance?.beats.length >= PLAY_STAGE_MAX_BEATS) this.recording = false;
    this._render(); void this._saveSettled(); sfx.play("tap");
  }

  async _openBasket() {
    if (this.saving || this.preparing) return;
    this.preparing = true; this._render();
    let sources = [], build = null, preparedBuild = null, loadFailed = false;
    try {
      sources = await listPlayStageSources();
      if (!discoveryState.isLoaded()) await discoveryState.load();
      build = normalisePlayStageBuild(discoveryState.get().latestBuild);
      if (build) preparedBuild = await this.prepareBuild(build);
    } catch { loadFailed = true; }
    finally { this.preparing = false; if (this.alive) { this._render(); bus.emit("activity:idle", { id: "play-stage" }); } }
    if (!this.alive || this.saving) return;
    if (loadFailed) {
      this._showRetry("Your pictures or build could not open. They have not been changed.", "try toys and pictures again", () => this._openBasket());
      return;
    }
    const stored = this.scene.props.filter((prop) => prop.placement === "basket").map((prop) => ({
      id: prop.id, kind: prop.kind, storedPropId: prop.id, label: `bring back ${prop.kind === "picture" || prop.kind === "build" ? "my" : "the"} ${prop.kind === "toy" ? "ball" : prop.kind} from basket`,
      preview: this.scene.assets.find((asset) => asset.id === prop.assetId)?.png || "", art: prop.art,
    }));
    const onStage = this.scene.props.filter((prop) => prop.placement !== "basket").map((prop) => ({
      id: prop.id, kind: prop.kind, stagePropId: prop.id, label: `choose ${prop.kind === "picture" || prop.kind === "build" ? "my" : "the"} ${prop.kind === "toy" ? "ball" : prop.kind} on stage`,
      preview: this.scene.assets.find((asset) => asset.id === prop.assetId)?.png || "", art: prop.art,
    }));
    const choices = [...stored, ...onStage, ...PROP_CHOICES, ...sources.map((row) => ({ id: `picture_${row.key}`, kind: "picture", label: row.label || "my picture", preview: row.png, sourceRef: row.key, sourceSnapshot: row.sourceSnapshot, aspect: row.aspect }))];
    if (preparedBuild) choices.push({ id: `build_${build.at}`, kind: "build", label: "my build", preview: preparedBuild.preview, sourceRef: `discovery:${build.variationId}:${build.at}`, aspect: preparedBuild.aspect, build, prepared: preparedBuild });
    else if (build) choices.push({ id: `build_${build.at}`, kind: "build", label: "try my build again", unavailable: true });
    this._openPicker("What should we play with?", choices, "play_stage_choose_stage_item", (choice) => {
      if (choice.unavailable) this._showRetry("Your build needs another try.", "try build again", () => this._openBasket());
      else if (choice.storedPropId) {
        const prop = this.scene.props.find((item) => item.id === choice.storedPropId);
        if (!prop || prop.placement !== "basket") return;
        const place = this._openGround(prop);
        this._closeOverlay(); this.selectedPropId = choice.storedPropId;
        this._commit({ type: "place-prop", propId: choice.storedPropId, placement: "ground", ...place });
      } else if (choice.stagePropId) {
        this._closeOverlay(); this.selectedPropId = choice.stagePropId; this._render();
      } else this._chooseProp(choice);
    });
  }

  _openPeople() {
    if (this.saving || this.preparing) return;
    const choices = ROSTER.filter((role) => !this.scene.actors.some((actor) => actor.role === role)).map((role) => ({ ...ACTORS[role], id: role, role }));
    this._openPicker("Who is coming to play?", choices, "play_stage_choose_person", (choice) => this._chooseActor(choice));
  }

  _openTogether() {
    if (this.saving || this.preparing) return;
    const choices = TOGETHER_ROSTER.map((role) => ({ ...ACTORS[role], id: role, role }));
    this._openPicker("Who will play with Rayna?", choices, "", (choice) => {
      this._closeOverlay();
      this._commit({ type: "together-select", partnerRole: choice.role });
    });
  }

  /** Root can call this with an already detached Workshop PNG. Arrival only
   * offers a pictured choice; the child's current scene is not rewritten. */
  async _acceptRouteCreation(params, { load = loadToyWorkshop, get = getToyWorkshop } = {}) {
    if (params.pictureShow && params.toyId) {
      this._showRetry('Choose one creation to bring at a time. Your room is still here.', 'back to my scene', () => {}); return false;
    }
    if (params.pictureShow) return this.acceptPictureShow(params.pictureShow);
    if (!params.toyId) return false;
    const room = this.scene, picker = this.overlay, interacted = this.childInteracted;
    try {
      await load(); if (!this.alive) return false;
      if (this.scene !== room || this.overlay !== picker || this.childInteracted !== interacted) return false;
      const incoming = resolvePlayStagePuppetToy(get(), params.toyId);
      if (incoming) return this.acceptExactPicture(incoming);
    } catch { if (!this.alive) return false; }
    this._showRetry('That puppet could not open. Your room and originals are still here.', 'back to my scene', () => {}); return false;
  }
  acceptExactPicture({ png, sourceRef = '', toyRef = '', behavior = 'puppet', name = '' } = {}) {
    if (!this.alive || this.saving || this.preparing || this.checkpointing || this.gesture) return false;
    if (!isLocalPNG(png) || png.length > PICTURE_SHOW_MAX_PNG_CHARS) {
      this._showRetry('This whole picture needs more room. Your original and current scene are safe.', 'back to my scene', () => {}); return false;
    }
    const choice = { id: 'incoming-exact-picture', kind: 'picture', exact: true, puppet: behavior === 'puppet', sourceRef: String(toyRef || sourceRef).slice(0, 180),
      preview: png, invitation: true, label: behavior === 'puppet' ? `Add ${String(name || 'my exact picture').slice(0, 80)} as a puppet` : 'Add my exact picture to this scene' };
    this._openPicker('Your own creation can join the Theater', [choice], '', selected => { void this._chooseProp(selected); }); return true;
  }

  acceptPictureShow(raw) {
    if (!this.alive || this.saving || this.preparing || this.checkpointing || this.gesture) return false;
    let source; try { source = normalizePictureShowSource(raw); } catch {
      this._showRetry('This show could not open. Your current scene and Music tune are safe.', 'back to my scene', () => {}); return false;
    }
    const replaceShow = !!this.scene.pictureShow;
    this._openPicker(replaceShow ? 'Keep this room or choose the incoming tune' : 'Our Picture Show can join this room', [
      { id: 'incoming-show', preview: source.sign.png, invitation: true, label: replaceShow ? 'Add this picture and replace this room’s tune; Undo brings the old show back' : 'Add our exact picture and kept tune to this room' },
      { id: 'keep-room', icon: 'back', invitation: true, label: 'Keep playing in my current room' },
    ], '', choice => { if (choice.id === 'keep-room') this._closeOverlay(); else void this._installPictureShow(source, replaceShow); }); return true;
  }

  async _installPictureShow(source, replaceShow) {
    if (!this.alive || this.saving || this.preparing || this.checkpointing || this.gesture) return false;
    const picker = this.overlay; this.preparing = true; let prepared;
    try { prepared = await this.prepareExactPicture({ png: source.sign.png }); }
    catch { prepared = null; }
    finally { if (this.alive) { this.preparing = false; bus.emit('activity:idle', { id: 'play-stage' }); } }
    if (!this.alive || this.overlay !== picker) return false;
    if (!prepared) { this._showRetry('This whole picture could not open. Your scene is still here.', 'try this show again', () => this.acceptPictureShow(source)); return false; }
    const show = normalizePictureShowSource({ ...source, sign: { ...source.sign, aspect: prepared.aspect } });
    const add = (replacePropId = '') => {
      if (!this.alive || this.saving || this.preparing || this.checkpointing || this.gesture) return false;
      const propId = `show_picture_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const position = this._openGround({ id: propId, kind: 'picture', aspect: show.sign.aspect, placement: 'ground' }, replacePropId || propId);
      this._closeOverlay(); this._commit({ type: 'picture-show', show, propId, replaceShow, replacePropId, ...position }, false);
      if (this.scene.pictureShow?.propId !== propId) {
        this._showRetry('This show needs more picture storage. Your current scene and older shows are safe.', 'back to my scene', () => {}); return false;
      }
      this.selectedPropId = propId; this._render();
      this._checkpointReport('Your picture and tune are here. Choose Shows to play.', { temporary: true }); return true;
    };
    if (this.scene.props.length < PLAY_STAGE_MAX_PROPS) return add();
    this._openPicker('Which prop should this exact picture replace? Undo keeps the old one.', this.scene.props.map(prop => ({ id: prop.id, art: prop.art,
      preview: this.scene.assets.find(asset => asset.id === prop.assetId)?.png || '', invitation: true, label: `Replace ${prop.kind} ${prop.placement === 'basket' ? 'in the basket' : 'on stage'}` })), '', choice => add(choice.id));
    return false;
  }

  _pictureInstrument(instrument) {
    if (instrument === 'rest') { const picture = instrumentPicture(instrument); picture.className = 'play-stage-tune-instrument'; picture.setAttribute('role', 'img'); picture.setAttribute('aria-label', 'Quiet beat'); return picture; }
    const row = MUSIC_INSTRUMENTS.find(item => item.id === instrument), image = document.createElement('img');
    image.src = art.get(row.art)?.src || `assets/art/final/music-band/${instrument}-v1.png`; image.alt = row.label; image.draggable = false; image.className = 'play-stage-tune-instrument'; return image;
  }
  _openPictureShowChoices() {
    const show = this.scene.pictureShow; if (!show || this.gesture || this.saving || this.preparing || this.checkpointing) return;
    this._openPicker('Our Picture Show, or any Theater play', [
      { id: 'tune', preview: this.scene.assets.find(asset => asset.id === show.signAssetId)?.png, invitation: true, label: 'Play our exact tune with this cast' },
      { id: 'other', icon: 'parade', invitation: true, label: 'Choose another show or parade' },
      { id: 'music', icon: 'play', invitation: true, label: 'Return to Music to make or change a tune' },
    ], '', choice => { this._closeOverlay(); if (choice.id === 'tune') this._startPictureShow(); else if (choice.id === 'other') this._openPerformances(); else void router.go('music-band', { savedId: show.tuneId }); });
  }
  _startPictureShow() {
    if (!this.alive || !this.scene.pictureShow || this.gesture || this.saving || this.preparing || this.checkpointing) return false;
    this._stopPlayback(false); this._cancelParade(false); this._interruptInvite();
    const show = JSON.parse(JSON.stringify(this.scene.pictureShow)), plan = pictureShowPlan(show);
    const actor = this.scene.actors.find(item => item.id === this.selectedActorId && !item.hidden) || this.scene.actors.find(item => !item.hidden);
    if (!actor) { this._checkpointReport('Bring a puppet out from behind the curtain to play this tune.'); return false; }
    this.pictureShowRun = { show, beats: plan.beats, interval: plan.interval, actorId: actor.id, next: 0, manual: this._manualReplay(), revision: ++this.pictureShowRevision, beat: null };
    this.pictureShowSound.prepare(); this._advancePictureShow(); return true;
  }
  _advancePictureShow() {
    const run = this.pictureShowRun; if (!this.alive || !run || this.checkpointing || this.gesture) return false;
    if (this.pictureShowTimer !== null) clearTimeout(this.pictureShowTimer); this.pictureShowTimer = null;
    if (JSON.stringify(this.scene.pictureShow) !== JSON.stringify(run.show)) { this._stopPictureShow(); return false; }
    if (run.next >= run.beats.length) { this._completePictureShow(); return true; }
    run.beat = run.beats[run.next++]; this.pictureShowSound.play(run.beat.instrument, { pulse: run.beat.pulse, echo: run.beat.role === 'veer' });
    this._renderPictureShowCue(); this._renderPerformanceDock();
    // Manual stepping keeps the final echo visible until the child advances.
    if (!run.manual) {
      const revision = run.revision;
      this.pictureShowTimer = setTimeout(() => { if (this.alive && this.pictureShowRun === run && this.pictureShowRevision === revision) this._advancePictureShow(); }, run.interval);
    }
    return true;
  }
  _completePictureShow() {
    const run = this.pictureShowRun; if (!run || !this.alive) return;
    const unchanged = JSON.stringify(this.scene.pictureShow) === JSON.stringify(run.show);
    this._stopPictureShow(false);
    if (unchanged) this._commit({ type: 'picture-show-performed', actorId: run.actorId }, false);
    this._checkpointReport('Your tune is played. Play again or keep your show.', { temporary: true });
  }
  _stopPictureShow(render = true) {
    if (this.pictureShowTimer != null) clearTimeout(this.pictureShowTimer); this.pictureShowTimer = null; this.pictureShowRevision = (this.pictureShowRevision || 0) + 1;
    const active = !!this.pictureShowRun; this.pictureShowRun = null; this.pictureShowSound?.stop();
    if (active) {
      this.surface?.querySelectorAll?.('.is-picture-show-sounding').forEach(node => node.classList.remove('is-picture-show-sounding'));
      this.surface?.querySelector?.('.play-stage-picture-show-cue')?.remove();
    }
    if (active && render && this.alive) this._render(); return active;
  }
  _renderPictureShowCue() {
    if (!this.pictureShowRun) return;
    this.surface?.querySelector('.play-stage-picture-show-cue')?.remove();
    this.surface?.querySelectorAll('.is-picture-show-sounding').forEach(node => node.classList.remove('is-picture-show-sounding'));
    const run = this.pictureShowRun; if (!run?.beat || !this.surface) return;
    const beat = run.beat, cue = document.createElement('div'); cue.className = 'play-stage-picture-show-cue'; cue.setAttribute('role', 'status');
    cue.setAttribute('aria-label', `${beat.role === 'veer' ? 'Veer echoes' : 'Your tune'}: ${beat.instrument}${beat.pulse ? '; Mama keeps the pulse' : ''}`);
    const family = document.createElement('span'); family.className = 'play-stage-tune-family';
    for (const role of ['mama', 'veer']) if (run.show[role]) {
      const image = new Image(); image.src = art.get(ACTORS[role].art)?.src || `assets/art/final/${ACTORS[role].art}.webp`; image.alt = role === 'mama' ? 'Mama pulse' : 'Veer echo';
      image.className = (role === 'mama' && beat.pulse) || (role === 'veer' && beat.role === 'veer') ? 'is-picture-show-sounding' : ''; family.append(image);
    }
    cue.append(family, this._pictureInstrument(beat.instrument)); this.surface.append(cue);
    const actorId = beat.role === 'veer' ? this.scene.actors.find(actor => actor.role === 'veer')?.id : run.actorId;
    if (actorId) this.surface.querySelector(`[data-actor-id="${actorId}"]`)?.classList.add('is-picture-show-sounding');
    if (beat.pulse) { const mama = this.scene.actors.find(actor => actor.role === 'mama'); if (mama) this.surface.querySelector(`[data-actor-id="${mama.id}"]`)?.classList.add('is-picture-show-sounding'); }
    this.surface.querySelector(`[data-prop-id="${run.show.propId}"]`)?.classList.add('is-picture-show-sounding');
  }

  _openPicker(label, choices, phrase, onChoose, page = 0) {
    if (!this.alive || this.saving || this.preparing || this.checkpointing || this.gesture) return;
    this._closeOverlay(); this.surface.inert = true;
    const overlay = document.createElement("div"); overlay.className = "play-stage-overlay"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-label", label);
    const close = button("back", "back to the stage", "play-stage-overlay-back", () => { if(this.overlay===overlay && close.isConnected!==false && this._canUseTools())this._closeOverlay(); });
    const grid = document.createElement("div"); grid.className = "play-stage-picker-grid";
    const question=document.createElement('div'); question.className='play-stage-picker-question'; question.textContent=label; grid.appendChild(question);
    const pages = Math.max(1, Math.ceil(choices.length / 4)); const index = ((page % pages) + pages) % pages;
    for (const choice of choices.slice(index * 4, index * 4 + 4)) {
      const item = document.createElement("button"); item.type = "button"; item.className = "play-stage-picker-choice"; item.setAttribute("aria-label", choice.label || choice.id);
      if (choice.preview) { const img = new Image(); img.src = choice.preview; img.alt = ""; item.appendChild(img); }
      else if (choice.icon) { const image = document.createElement("span"); image.className = "play-stage-picker-symbol"; image.innerHTML = ICONS[choice.icon] || iconSVG(choice.icon); item.appendChild(image); }
      else { const source = art.get(choice.art); if (source) { const img = source.cloneNode(); img.alt = ""; item.appendChild(img); } }
      if (choice.invitation) { const caption = document.createElement("span"); caption.className = "play-stage-picker-stored"; caption.textContent = choice.label; item.appendChild(caption); }
      if (choice.caption) { const caption = document.createElement('span'); caption.className = 'play-stage-picker-stored'; caption.textContent = choice.caption; item.appendChild(caption); }
      if (choice.storedPropId) { const caption = document.createElement("span"); caption.className = "play-stage-picker-stored"; caption.textContent = "In basket"; item.appendChild(caption); }
      else if (choice.stagePropId) { const caption = document.createElement("span"); caption.className = "play-stage-picker-stored is-on-stage"; caption.textContent = "On stage"; item.appendChild(caption); }
      if (choice.unavailable) { const caption = document.createElement("span"); caption.className = "play-stage-picker-retry"; caption.textContent = "Try build again"; item.appendChild(caption); }
      tapify(item, () => { if (this.alive && this.overlay === overlay && !this.saving && !this.preparing && !this.checkpointing && !this.gesture) onChoose(choice); }); grid.appendChild(item);
    }
    const nav = document.createElement("div"); nav.className = "play-stage-picker-nav";
    if (pages > 1) {
      const previous=button('back','previous choices','',()=> { if(this.overlay===overlay && previous.isConnected!==false && this._canUseTools())this._openPicker(label,choices,'',onChoose,index-1); });
      const next=button('next','more choices','',()=> { if(this.overlay===overlay && next.isConnected!==false && this._canUseTools())this._openPicker(label,choices,'',onChoose,index+1); });
      nav.append(previous,next);
    }
    overlay.append(close, grid, nav); this.overlayHost.appendChild(overlay); this.overlay = overlay;
    if (phrase && !this.voiceFlags.has(phrase)) { this.voiceFlags.add(phrase); speech.say(phrase); }
  }

  async _chooseProp(choice) {
    if (!this.alive || this.saving || this.preparing || this.checkpointing || this.gesture) return;
    this.preparing = true;
    const picker = this.overlay;
    let prepared = null;
    try { if (choice.kind === "picture") prepared = choice.exact ? await this.prepareExactPicture({ png: choice.preview }) : await this.preparePicture({ png: choice.preview }); else if (choice.kind === "build") prepared = choice.prepared || null; }
    catch { prepared = null; }
    finally { this.preparing = false; if (this.alive) bus.emit("activity:idle", { id: "play-stage" }); }
    if (!this.alive || picker !== this.overlay) return;
    if ((choice.kind === "picture" || choice.kind === "build") && !prepared) {
      this._showRetry("That creation needs another try.", "try again", () => this._chooseProp(choice));
      return;
    }
    const make = (replaceId = "") => {
      const prop = { id: `${choice.kind}_${Date.now().toString(36)}`, kind: choice.kind, puppet: choice.puppet === true, art: choice.art || "", sourceRef: choice.sourceRef || "", sourceSnapshot: choice.sourceSnapshot, ...prepared, aspect: prepared?.aspect || choice.aspect || 1, placement: "ground", z: 40 + this.scene.props.length };
      return { ...prop, ...this._openGround(prop, replaceId || prop.id) };
    };
    const install = (replaceId = '') => {
      if (!this.alive || this.gesture || this.saving || this.preparing || this.checkpointing) return false;
      const prop = make(replaceId); this._closeOverlay();
      this._commit(replaceId ? { type: 'swap-prop', replaceId, prop } : { type: 'add-prop', prop });
      if (choice.exact && !this.scene.props.some(row => row.id === prop.id)) {
        this._showRetry('This whole picture needs more storage. Your room and originals are safe.', 'back to my scene', () => {}); return false;
      }
      if(choice.storyEpisode) { this.selectedPropId=prop.id; this._chooseStoryBeginning(choice.storyEpisode); }
      return true;
    };
    if (this.scene.props.length < PLAY_STAGE_MAX_PROPS) { const installed = install(); if (installed && choice.kind === "picture" && !this.voiceFlags.has("play_stage_picture_selected")) { this.voiceFlags.add("play_stage_picture_selected"); speech.say("play_stage_picture_selected"); } return; }
    const active = this.scene.props.filter((prop) => prop.placement !== "basket");
    const current = (active.length ? active : this.scene.props).map((prop) => ({
      id: prop.id, label: prop.placement === "basket" ? `replace ${prop.kind} from basket` : `replace ${prop.kind} on stage`,
      prop, art: prop.art, preview: this.scene.assets.find((asset) => asset.id === prop.assetId)?.png || "",
    }));
    this._openPicker("Choose one to replace", current, active.length ? "play_stage_capacity_swap" : "", (old) => install(old.id));
  }

  _chooseActor(choice) {
    if (this.saving || this.preparing) return;
    const make = (replaceId = "") => {
      const actor = { id: choice.role, role: choice.role, art: choice.art, facing: "left", z: 10 + this.scene.actors.length };
      const saved = this.scene.layout;
      const layout = this.layout || playStageLayout(saved.width, saved.height, saved.profile);
      return { ...actor, ...playStageOpenActorGroundPosition(this.scene, layout, actor, replaceId, this._stageControlReserves(), foregroundProfile()) };
    };
    if (this.scene.actors.length < PLAY_STAGE_MAX_ACTORS) { this._closeOverlay(); this._commit({ type: "add-actor", actor: make() }); return; }
    const current = this.scene.actors.map((actor) => ({ id: actor.id, label: `send ${ACTORS[actor.role]?.label || actor.role} back`, art: actor.art, actor }));
    this._openPicker("Choose who goes back", current, "play_stage_capacity_swap", (old) => { this._closeOverlay(); this._commit({ type: "swap-actor", replaceId: old.id, actor: make(old.id) }); });
  }

  _closeOverlay() {
    if (this.performanceDock?.parentNode === this.overlay && this.root) this.root.appendChild(this.performanceDock);
    if (this.togetherDock?.parentNode === this.overlay) this.togetherDock.remove();
    this.overlay?.remove(); this.overlay = null; if (this.surface) this.surface.inert = false; speech.cancel?.();
    this._renderPerformanceDock();
  }

  _showRetry(message, retryLabel, retry) {
    if (!this.alive || !this.overlayHost) return;
    this._closeOverlay(); this.surface.inert = true;
    const overlay = document.createElement("div"); overlay.className = "play-stage-overlay play-stage-error";
    overlay.setAttribute("role", "alertdialog"); overlay.setAttribute("aria-label", message);
    const explanation = document.createElement("p"); explanation.textContent = message;
    const back = button("back", "back to the stage", "", () => {
      if (this.overlay === overlay && back.isConnected !== false && this._canUseTools()) this._closeOverlay();
    });
    // A circular arrow means retry; a back arrow means return to the scene.
    const retryIcon = /^(try|retry)\b/i.test(retryLabel) ? "replay" : "back";
    const again = button(retryIcon, retryLabel, "", () => {
      if (this.overlay !== overlay || again.isConnected === false || !this._canUseTools()) return;
      this._closeOverlay(); void retry();
    });
    overlay.append(explanation, back, again);
    this.overlayHost.appendChild(overlay); this.overlay = overlay;
  }

  async _keep() {
    if (!this.alive || !this.scene || !this.layout || this.saving || this.preparing || this.gesture || this.overlay) return;
    this._stopPlayback(false); this._cancelParade(false); this.recording = false;
    const scene = JSON.parse(JSON.stringify(this.scene));
    const layout = JSON.parse(JSON.stringify(this.layout));
    let kept = null, png = "", failed = false, full = false;
    this.saving = true; this._render();
    try {
      png = await this._capturePNG(scene, layout);
      if (!this.alive) return;
      if (!png) throw new Error("stage capture failed");
      await savePlayStageCurrent(scene);
      if (!this.alive) return;
      kept = await savePlayStagePostcard(scene, png, layout);
      if (!kept) throw new Error("stage postcard save failed");
    } catch (error) {
      failed = true; full = error?.code === "PLAY_STAGE_POSTCARD_FULL";
    } finally {
      this.saving = false;
      if (this.alive) {
        if (this.resizePending) this._resize();
        else this._render();
        bus.emit("activity:idle", { id: "play-stage" });
      }
    }
    if (!this.alive) return;
    if (full) { this._showRetry("Your story shelf is full. Your current scene is still here.", "back to my scene", () => {}); return; }
    if (failed) { this._showRetry("That story didn't save. Try again.", "try keeping again", () => this._keep()); return; }
    const persistent = db.status().persistent;
    sfx.play("chime"); this._showKept(png, { persistent });
    if (persistent && !this.voiceFlags.has("play_stage_kept")) { this.voiceFlags.add("play_stage_kept"); speech.say("play_stage_kept"); }
  }

  _showKept(png, { persistent = db.status().persistent } = {}) {
    this._closeOverlay(); this.surface.inert = true;
    const overlay = document.createElement("div"); overlay.className = "play-stage-overlay play-stage-kept"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-label", persistent ? this.scene.performance?.beats.length ? "kept scene and recorded show" : "kept story" : "scene kept temporarily");
    const caption = document.createElement("span"); caption.className = "play-stage-kept-caption";
    caption.textContent = !persistent ? "Your scene is here for now. Ask a grown-up to export a backup before closing." : this.scene.performance?.beats.length ? "Your scene and show are kept together." : "Your scene is kept.";
    const img = new Image(); img.src = png; img.alt = persistent ? "your kept stage" : "your stage, kept for now";
    overlay.append(img, caption, button("play", "keep playing", "play-stage-keep-playing", () => this._closeOverlay()), button("home", "home", "", () => this._goHome()));
    this.overlayHost.appendChild(overlay); this.overlay = overlay;
  }

  async _capturePNG(scene = this.scene, layout = this.layout) {
    const scale = Math.min(2, 1400 / Math.max(layout.width, layout.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(layout.width * scale); canvas.height = Math.round(layout.height * scale);
    const ctx = canvas.getContext("2d"); ctx.scale(scale, scale);
    const visible = playStageParadeViewportScene(scene, layout, this._stageControlReserves());
    await this._drawScene(ctx, playStageParadeDisplayLayout(layout, visible.parade?.scale || 1), visible);
    try { return canvas.toDataURL("image/png"); } catch { return ""; }
  }

  async _drawScene(ctx, layout, scene = this.scene) {
    const draw = async (key, rect, fit = "contain") => {
      const image = await imageForSource(art.get(key)); if (!image) return false;
      if (fit === "contain") {
        const s = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
        const w = image.naturalWidth * s; const h = image.naturalHeight * s;
        ctx.drawImage(image, rect.x + (rect.width - w) / 2, rect.y + (rect.height - h) / 2, w, h);
      } else if (fit === "cover") {
        const s = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
        const sw = rect.width / s; const sh = rect.height / s;
        ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, rect.x, rect.y, rect.width, rect.height);
      } else ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      return true;
    };
    const full = { x: 0, y: 0, width: layout.width, height: layout.height };
    ctx.fillStyle = "#dff4ff"; ctx.fillRect(0, 0, layout.width, layout.height); await draw(LAYERS.backdrop, full, "cover");
    const booth = layout.booth; await draw(LAYERS.rear, booth, "contain");
    ctx.save(); const o = booth.opening; ctx.beginPath(); ctx.roundRect(o.x, o.y, o.width, o.height, 12); ctx.clip();
    const order = playStagePieceOrder(scene);
    for (const actor of order.hiddenActors) await this._drawActor(ctx, actor, layout, true, scene);
    for (const prop of order.hiddenProps) await this._drawProp(ctx, prop, layout, scene);
    ctx.restore(); await draw(LAYERS.front, booth, "contain"); await draw(LAYERS.left, booth, "contain"); await draw(LAYERS.right, booth, "contain");
    const trail = scene.paradeDraft || scene.parade;
    if (trail?.route.length) {
      const points = trail.route.map((point) => projectPlayStageGround(layout, point.u, point.v));
      ctx.save(); ctx.strokeStyle = "#a87459"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.setLineDash([2, 12]); ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.stroke(); ctx.setLineDash([]);
      points.forEach((point, index) => { ctx.fillStyle = !scene.paradeDraft && index <= scene.parade.stopIndex ? "#b8f0d2" : "#ffe98a"; ctx.beginPath(); ctx.arc(point.x, point.y, 14, 0, Math.PI * 2); ctx.fill(); }); ctx.restore();
    }
    for (const actor of order.actors) await this._drawActor(ctx, actor, layout, false, scene);
    for (const prop of order.props) if (!isDisplayedPicture(prop)) await this._drawProp(ctx, prop, layout, scene);
    await draw(LAYERS.foreground, full, "cover");
    for (const prop of order.props) if (isDisplayedPicture(prop)) await this._drawProp(ctx, prop, layout, scene);
  }

  async _drawActor(ctx, actor, layout, hidden, scene = this.scene) {
    const meta = ACTORS[actor.role] || ACTORS.rayna; const image = await imageForSource(art.get(actor.art || meta.art)); if (!image) return;
    const g = playStageActorGeometry(actor, layout, scene);
    const offset = hidden ? playStageHiddenOffset(actor, layout) : { x: 0, y: 0 };
    const x = g.hit.left + offset.x, y = g.hit.top + offset.y;
    const [sourceX, sourceY, sourceRight, sourceBottom] = meta.crop;
    ctx.save();
    ctx.filter = "drop-shadow(0px 4px 3px rgba(78,54,40,.18))";
    if (actor.facing === "left") { ctx.translate(x + g.hit.width, y); ctx.scale(-1, 1); ctx.drawImage(image, sourceX, sourceY, sourceRight - sourceX, sourceBottom - sourceY, 0, 0, g.hit.width, g.hit.height); }
    else ctx.drawImage(image, sourceX, sourceY, sourceRight - sourceX, sourceBottom - sourceY, x, y, g.hit.width, g.hit.height);
    ctx.restore();
  }

  async _drawProp(ctx, prop, layout, scene = this.scene) {
    const owner = scene.actors.find((actor) => actor.id === prop.ownerActorId);
    const pouch = owner?.role === "pip" ? playStagePouchGeometry(owner, layout, scene) : null;
    if (pouch) await this._drawPouchLayer(ctx, LAYERS.pipPouchBack, pouch);
    await this._drawPropItem(ctx, prop, layout, scene);
    if (pouch) await this._drawPouchLayer(ctx, LAYERS.pipPouchRim, pouch);
  }

  async _drawPouchLayer(ctx, key, pouch) {
    const image = await imageForSource(art.get(key));
    if (image) ctx.drawImage(image, pouch.x, pouch.y, pouch.width, pouch.height);
  }

  async _drawPropItem(ctx, prop, layout, scene) {
    const asset = scene.assets.find((item) => item.id === prop.assetId);
    const image = await imageForSource(asset?.png || art.get(prop.art));
    const geometry = playStagePropGeometry(prop, scene, layout);
    if (geometry.handle) {
      const handle = await imageForSource(art.get('toy-workshop/puppet-handle-v1') || 'assets/art/final/toy-workshop/puppet-handle-v1.png');
      if (handle) ctx.drawImage(handle, geometry.handle.x, geometry.handle.y, geometry.handle.width, geometry.handle.height);
    }
    if (image) drawPlayStageProp(ctx, image, geometry);
    if (prop.wrapped) {
      const b = geometry.bounds;
      ctx.fillStyle = "#ffd6e3"; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.width, b.height, 12); ctx.fill();
      ctx.fillStyle = "#aa5783"; ctx.fillRect(b.x + b.width * .43, b.y, b.width * .14, b.height); ctx.fillRect(b.x, b.y + b.height * .4, b.width, b.height * .14);
      ctx.fillStyle = "#ffe98a"; ctx.beginPath(); ctx.ellipse(b.x + b.width * .4, b.y + b.height * .35, b.width * .16, b.height * .12, -.5, 0, Math.PI * 2); ctx.ellipse(b.x + b.width * .6, b.y + b.height * .35, b.width * .16, b.height * .12, .5, 0, Math.PI * 2); ctx.fill();
    }
  }

  _goHome() { return this._leave("map"); }

  _goBack() { return this._leave(!this.enteredFromMap && settings.isRegionEnabled("treehouse") ? "treehouse" : "map"); }

  _leave(destination) {
    if (!this.alive || this.checkpointing) return false;
    return router.go(destination, {}, { dir: "right" });
  }

  busy() { return !!this.gesture || !!this.paradeRun || this.saving || this.preparing || this.checkpointing; }
  _checkpointReport(message, { temporary = false } = {}) {
    if (!this.alive || !this.checkpointStatus) return;
    if (this.noticeTimer != null) clearTimeout(this.noticeTimer); this.noticeTimer = null;
    this.checkpointStatus.textContent = message; this.checkpointStatus.hidden = !message;
    this.checkpointStatus.classList?.toggle('is-quiet', temporary);
    if (message && temporary) this.noticeTimer = setTimeout(() => {
      this.noticeTimer = null;
      if (this.alive && this.checkpointStatus?.textContent === message) this.checkpointStatus.hidden = true;
    }, 3500);
  }
  _checkpointWrites() {
    const shared = flushPlayStageCheckpointWrites(), local = this.settledTail;
    if (this.checkpointTail?.shared === shared && this.checkpointTail.local === local) return this.checkpointTail.promise;
    // Wait for both queues even if one fails early. A corrective write must
    // finish before deciding whether the latest current scene needs a retry.
    const promise = Promise.allSettled([shared, local]).then(results => {
      // Older controller bookkeeping can retain a rejected write that a newer
      // shared correction has already replaced. The real latest state tail is
      // authoritative; resume bookkeeping is drained without claiming it saved.
      if (results[0].status === "rejected") throw results[0].reason;
    });
    void promise.catch(() => {});
    this.checkpointTail = { shared, local, promise }; return promise;
  }
  _showLoadProblem(params) {
    this._loadProblem = true;
    this.scene = null;
    const panel = document.createElement("div"); panel.className = "game-recovery play-stage-load-recovery";
    const message = document.createElement("p");
    message.textContent = "Your stage could not open. Your saved scene has not been changed.";
    const retry = button("replay", "try opening the stage again", "play-stage-retry", async () => {
      if (!this.alive || retry.disabled) return;
      retry.disabled = true;
      panel.remove();
      await this.mount(params);
    });
    const retryText = document.createElement("span"); retryText.textContent = "Try again"; retry.appendChild(retryText);
    const home = button("home", "back to the valley", "play-stage-recovery-home", () => this._goHome());
    const homeText = document.createElement("span"); homeText.textContent = "Home"; home.appendChild(homeText);
    const actions = document.createElement("div"); actions.className = "play-stage-recovery-actions";
    actions.append(retry, home); panel.append(message, actions); this.host.replaceChildren(panel);
  }

  _checkpoint() {
    this._idleCueStop?.(); this._idleCueStop = null;
    if (this.alive && this._loadProblem) return Promise.resolve(true);
    if (!this.alive || !this.scene) return Promise.resolve(false);
    if (this.checkpointPromise) return this.checkpointPromise;
    if (this.gesture || this.saving || this.preparing) {
      this._checkpointReport(this.gesture ? "Finish placing this, then try again. Your move is still here." : "Your scene is still being prepared. Try again when it is ready.");
      return Promise.resolve(false);
    }
    this._stopPlayback(false); this._cancelParade(false); this.recording = false;
    this._checkpointReport(""); this.checkpointing = true; this._render();
    const pending = checkpointLivingScene({ flush: () => this._checkpointWrites(), retry: () => this._saveSettled(), storage: () => db.status(),
      alive: () => this.alive, held: () => !!this.gesture || this.saving || this.preparing,
      report: message => this._checkpointReport(message), subject: "Your current scene" });
    this.checkpointPromise = pending.finally(() => {
      if (this.alive) { this.checkpointing = false; this.checkpointPromise = null; this._render(); }
    });
    return this.checkpointPromise;
  }
  _beforeBreak() { return this._checkpoint(); }
  destroy() {
    this.idleHelp?.(); this.idleHelp = null;
    if (this.noticeTimer != null) clearTimeout(this.noticeTimer); this.noticeTimer = null;
    this._stopPlayback(false); this._cancelParade(false); this.recording = false;
    this._interruptInvite(); this.alive = false; cancelAnimationFrame(this._resizeQueued); this._cancelGesture(); this._closeOverlay();
    this.root?.removeEventListener("pointerdown", this._onChildPointer, true);
    this.root?.removeEventListener("keydown", this._onChildKey, true);
    for (const type of ["pointerdown", "click", "keydown"]) this.root?.removeEventListener(type, this._onCheckpointInput, true);
    this.pen?.destroy(); this.resizeObserver?.disconnect(); this._onSettings?.(); this.mute?.destroy?.(); window.removeEventListener("blur", this._onWindowBlur); speech.cancel?.();
    this.host?.replaceChildren();
  }
}

let controller = null;

export const playStage = {
  id: "play-stage",
  async mount(host, params = {}) { controller = new PlayStageController(host); await controller.mount(params); },
  unmount() { controller?.destroy(); controller = null; },
  onBack() { controller?._goBack(); },
  busy() { return controller?.busy() || false; },
  beforeLeave() { return controller?._checkpoint() ?? Promise.resolve(false); },
  beforeBreak() { return controller?._beforeBreak() ?? Promise.resolve(false); },
  acceptExactPicture(source) { return controller?.acceptExactPicture(source) ?? false; },
  acceptPictureShow(source) { return controller?.acceptPictureShow(source) ?? false; },
};

export default playStage;
