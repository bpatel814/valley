// Discovery Glade: twelve short, replayable, non-tracing missions.
// Every action has a tap path and a pointer-drag path. Progress is a local visit
// history only; no score, speed, or accuracy is exposed or persisted.

import router, { homeButton, muteButton, tapify, iconSVG } from "../router.js";
import { shouldAccept } from "../../engine/pen.js";
import bus from "../bus.js";
import { Character } from "../characters.js";
import { addScenery } from "../scene.js";
import art from "../art.js";
import speech from "../../audio/speech.js";
import sfx from "../../audio/sfx.js";
import settings from "../../state/settings.js";
import session from "../../state/session.js";
import { installIdleHelp } from "../idle-help.js";
import {
  DISCOVERY_CATALOG_PAGES,
  DISCOVERY_MISSIONS,
  applyDiscoveryAction,
  discoveryCanLaunch,
  discoveryCanFinish,
  discoveryMission,
  discoveryVariation,
  emptyDiscoveryDraft,
  missionOptions,
  normalizeDiscoveryDraft,
} from "../../data/discovery.js";
import discoveryState from "../../state/discovery.js";
import { discoverySizeScene, discoverySizeChoiceLabel } from "../discovery-size-scene.js";
import { quantityScene, quantityChoicePicture, quantityChoiceCount, quantityLabel } from "../discovery-quantity-scene.js";

export function discoveryEntryGroup(params = {}) {
  return ['make', 'move', 'puzzles'].includes(params.catalogGroup) ? params.catalogGroup : null;
}

export function showDiscoveryPickerCue(view) {
  const target = view.main?.querySelector('.discovery-mission-card');
  if (!target) return null;
  target.classList.add('discovery-idle-invite');
  const timer = setTimeout(() => target.classList.remove('discovery-idle-invite'), 2400);
  return () => { clearTimeout(timer); target.classList.remove('discovery-idle-invite'); };
}

// On the puzzle picker, a pause points out the next page without opening it.
export function showDiscoveryMoreCue(view) {
  const target = view.main?.querySelector('.discovery-catalog-next');
  if (!target || target.hidden || target.disabled) return showDiscoveryPickerCue(view);
  target.classList.add('discovery-more-invite');
  const timer = setTimeout(() => target.classList.remove('discovery-more-invite'), 2400);
  return () => { clearTimeout(timer); target.classList.remove('discovery-more-invite'); };
}

// Invite exploration equally: do not reveal or choose a correct answer.
export function showDiscoveryMissionCue(view) {
  const options = ['.discovery-choice', '.discovery-piece'].flatMap(selector =>
    Array.from(view.main?.querySelectorAll(selector) || []))
    .filter(button => !button.disabled && !button.hidden && button.isConnected !== false);
  if (!options.length) return null;
  options.forEach(button => button.classList.add('discovery-mission-invite'));
  const clear = () => options.forEach(button => button.classList.remove('discovery-mission-invite'));
  const timer = setTimeout(clear, 2400);
  return () => { clearTimeout(timer); clear(); };
}

// Suggest a playable picture without starting it, recording input, or requiring sound.
export function installDiscoveryPickerHelp(view, install = installIdleHelp) {
  return install(view.root, {
    active: () => view._alive && !view.busy() && !view._saveProblem &&
      !session.isBreakLocked() && !router.isMoving() && !speech.isSpeaking() && router.current() === 'discovery' &&
      (view.mission ? !view.draft?.completed && !!(view.main?.querySelector('.discovery-choice') || view.main?.querySelector('.discovery-piece'))
        : !!view.main?.querySelector('.discovery-mission-card')),
    demonstrate: () => view.mission ? showDiscoveryMissionCue(view) : showDiscoveryMoreCue(view),
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function reduced() {
  return document.documentElement.classList.contains("reduced-motion") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function colors(token) {
  if (/pink/.test(token)) return ["#ffb6cf", "#a84972"];
  if (/blue/.test(token)) return ["#a9def9", "#337a9e"];
  if (/green/.test(token)) return ["#a7dfb0", "#3c8251"];
  if (/gold|yellow|sun/.test(token)) return ["#ffe38a", "#a97822"];
  return ["#c9b5f4", "#65508e"];
}

function repeatedDots(count, fill = "#ffb6cf") {
  const points = [[30, 32], [64, 32], [22, 67], [50, 67], [78, 67]];
  return points.slice(0, count).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="${fill}" stroke="#513f37" stroke-width="5"/>`).join("");
}

/** Learning shapes stay diagram-like; illustrated props identify the picker activities. */
export function discoveryPicture(token, extra = {}) {
  token = String(token || "circle");
  if (token === "baskets") {
    return '<span class="discovery-menu-art discovery-menu-art--basket" aria-hidden="true"><img src="assets/art/final/props/sorting-basket.png" alt=""></span>';
  }
  if (token === "beds") {
    return '<span class="discovery-menu-art discovery-menu-art--bed" aria-hidden="true"><img src="assets/art/final/props/bug_bed.webp" alt=""></span>';
  }
  if (token === "patches") {
    return '<span class="discovery-menu-art discovery-menu-art--patterns" aria-hidden="true"><img src="assets/art/final/props/coat-spots.png" alt=""><img src="assets/art/final/props/scarf-stripes.png" alt=""></span>';
  }
  if (token === "flowers") {
    return '<span class="discovery-menu-art discovery-menu-art--flower" aria-hidden="true"><img src="assets/art/final/props/counting-flower.webp" alt=""><img src="assets/art/final/props/counting-pot.webp" alt=""></span>';
  }
  if (token === "more") {
    return '<span class="discovery-menu-art discovery-menu-art--more" aria-hidden="true"><img src="assets/art/final/props/counting-apple.png" alt=""><img src="assets/art/final/props/counting-apple.png" alt=""><img src="assets/art/final/props/counting-apple.png" alt=""></span>';
  }
  if (token === "activities") {
    return '<svg viewBox="0 0 100 100" aria-hidden="true" data-picture="activities"><rect x="12" y="12" width="33" height="33" rx="9" fill="#a7dfb0" stroke="#3c8251" stroke-width="5"/><rect x="55" y="12" width="33" height="33" rx="9" fill="#ffb6cf" stroke="#a84972" stroke-width="5"/><rect x="12" y="55" width="33" height="33" rx="9" fill="#ffe38a" stroke="#a97822" stroke-width="5"/><rect x="55" y="55" width="33" height="33" rx="9" fill="#a9def9" stroke="#337a9e" stroke-width="5"/></svg>';
  }
  const approvedCharacter = (name, state = "idle") =>
    `<img class="discovery-approved-character" src="${esc(art.get(`characters/${name}_${state}`)?.src || `assets/art/final/characters/${name}_${state}.webp`)}" alt="">`;
  if (/friend-/.test(token)) {
    const kind = token.replace("friend-", "");
    const asset = kind === "cat" ? "caterpillar" : kind === "uni" ? "unicorn" : kind;
    return approvedCharacter(asset);
  }
  if (/pip-(on|under|beside)/.test(token)) {
    const place = token.replace("pip-", "");
    return `<span class="discovery-position-diagram discovery-position--${esc(place)}"><span class="discovery-position-arch"></span>${approvedCharacter("pip")}</span>`;
  }
  if (token === "friends") {
    return `<span class="discovery-approved-pair">${approvedCharacter("pip")}${approvedCharacter("unicorn")}</span>`;
  }
  const [fill, stroke] = colors(token);
  let body = "";
  if (token === "boat-sail") {
    body = `<path d="M30 10v90" fill="none" stroke="#754f36" stroke-width="7" stroke-linecap="round"/><path d="M35 17 86 69H35Z" fill="#c9b5f4" stroke="#65508e" stroke-width="6" stroke-linejoin="round"/><path d="M35 72h55" stroke="#754f36" stroke-width="6" stroke-linecap="round"/>`;
  } else if (token === "boat-launch") {
    body = `<path d="M8 73h84" fill="none" stroke="#4b91b7" stroke-width="7" stroke-linecap="round"/><path d="M18 56h43c-3 14-11 21-22 21S21 70 18 56Z" fill="#c9b5f4" stroke="#65508e" stroke-width="5"/><path d="M38 20v38" fill="none" stroke="#754f36" stroke-width="5" stroke-linecap="round"/><path d="m42 24 27 26H42Z" fill="#ffb6cf" stroke="#a84972" stroke-width="4" stroke-linejoin="round"/><path d="M68 42h20m-8-9 10 9-10 9" fill="none" stroke="#3c8251" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (token === "boat-hull") {
    body = `<path d="M8 25h84c-4 36-20 57-42 57S12 61 8 25Z" fill="#c9b5f4" stroke="#65508e" stroke-width="6" stroke-linejoin="round"/><path d="M12 27h76" stroke="#fff" stroke-opacity=".55" stroke-width="5"/>`;
  } else if (token === "boat-window") {
    body = `<circle cx="50" cy="50" r="29" fill="#a9def9" stroke="#65508e" stroke-width="7"/><circle cx="42" cy="41" r="8" fill="#fff" opacity=".72"/>`;
  } else if (token === "circle" || token.startsWith("circle-") || token === "round") {
    body = `<circle cx="50" cy="50" r="31" fill="${fill}" stroke="${stroke}" stroke-width="6"/>`;
  } else if (token === "ring") {
    body = `<circle cx="50" cy="50" r="30" fill="none" stroke="${stroke}" stroke-width="15"/>`;
  } else if (token === "square") {
    body = `<rect x="20" y="20" width="60" height="60" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="6"/>`;
  } else if (token === "rectangle") {
    body = `<rect x="10" y="31" width="80" height="38" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="6"/>`;
  } else if (token === "triangle") {
    body = `<path d="M50 13 88 82H12Z" fill="${fill}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round"/>`;
  } else if (token === "semicircle") {
    body = `<path d="M14 66a36 36 0 0 1 72 0Z" fill="${fill}" stroke="${stroke}" stroke-width="6"/>`;
  } else if (token === "oval") {
    body = `<ellipse cx="50" cy="52" rx="37" ry="24" fill="${fill}" stroke="${stroke}" stroke-width="6"/>`;
  } else if (/leaf/.test(token)) {
    body = `<path d="M17 72C23 23 65 14 84 18 80 55 55 84 17 72Z" fill="${fill}" stroke="${stroke}" stroke-width="6"/><path d="M23 68 72 28" fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/>`;
  } else if (/berry/.test(token)) {
    body = `<circle cx="50" cy="56" r="28" fill="${fill}" stroke="${stroke}" stroke-width="6"/><path d="M50 28c-8-13-17-10-22-7 8 4 13 9 14 16m8-9c8-13 17-10 22-7-8 4-13 9-14 16" fill="#78bd77" stroke="#3c8251" stroke-width="4"/>`;
  } else if (/flower/.test(token)) {
    body = `<g fill="${fill}" stroke="${stroke}" stroke-width="4"><circle cx="50" cy="25" r="15"/><circle cx="75" cy="47" r="15"/><circle cx="65" cy="75" r="15"/><circle cx="35" cy="75" r="15"/><circle cx="25" cy="47" r="15"/></g><circle cx="50" cy="52" r="14" fill="#ffe38a" stroke="#a97822" stroke-width="4"/>`;
  } else if (/star/.test(token)) {
    body = `<path d="m50 10 11 25 27 3-20 18 6 27-24-14-24 14 6-27-20-18 27-3Z" fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round"/>`;
  } else if (/drop/.test(token)) {
    body = `<path d="M50 11C40 31 24 46 24 63a26 26 0 0 0 52 0C76 46 60 31 50 11Z" fill="${fill}" stroke="${stroke}" stroke-width="6"/>`;
  } else if (token === "sun") {
    body = `<g stroke="#a97822" stroke-width="6" stroke-linecap="round"><circle cx="50" cy="50" r="23" fill="#ffe38a"/><path d="M50 6v12m0 64v12M6 50h12m64 0h12M19 19l9 9m44 44 9 9m0-62-9 9M28 72l-9 9"/></g>`;
  } else if (/basket/.test(token)) {
    body = `<path d="M18 39h64l-7 43H25Z" fill="${fill}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round"/><path d="M32 42c0-31 36-31 36 0" fill="none" stroke="${stroke}" stroke-width="6"/><path d="M30 55h40M28 68h44" stroke="#fff" stroke-opacity=".65" stroke-width="4"/>`;
    if (token === "basket-round" || token === "basket-pointy") {
      // The same circle, star and triangle pictures used on the loose pieces
      // identify both live destinations and the retained collection headers.
      const mark = (shape, x, y, scale) => {
        const svg = discoveryPicture(shape);
        const content = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
        return `<g data-sort-shape="${shape}" transform="translate(${x} ${y}) scale(${scale})">${content}</g>`;
      };
      body = `<g transform="translate(0 33) scale(1 .7)">${body}</g>` +
        (token === "basket-round" ? mark("circle", 15, -2, .7) : mark("star", 0, 0, .5) + mark("triangle", 50, 0, .5));
    }
  } else if (/bed/.test(token)) {
    const scale = /small/.test(token) ? .72 : /medium/.test(token) ? .88 : 1;
    body = `<g transform="translate(${50 - 50 * scale} ${78 - 78 * scale}) scale(${scale})"><path d="M14 70h72M18 70V36h28c22 0 38 9 38 30v4" fill="${fill}" stroke="${stroke}" stroke-width="7" stroke-linecap="round"/><path d="M20 36h24v22H20Z" fill="#fff" stroke="${stroke}" stroke-width="5"/></g>`;
  } else if (/umbrella/.test(token)) {
    const scale = /small/.test(token) ? .68 : /medium/.test(token) ? .84 : 1;
    body = `<g transform="translate(${50 - 50 * scale} ${88 - 88 * scale}) scale(${scale})"><path d="M11 48a39 36 0 0 1 78 0c-9-7-17-7-26 0-9-7-17-7-26 0-9-7-17-7-26 0Z" fill="${fill}" stroke="${stroke}" stroke-width="6"/><path d="M50 47v31c0 13 18 13 18 0" fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="round"/></g>`;
  } else if (/bowl/.test(token)) {
    const scale = /small/.test(token) ? .68 : /medium/.test(token) ? .84 : 1;
    body = `<g transform="translate(${50 - 50 * scale} ${78 - 78 * scale}) scale(${scale})"><path d="M10 38h80c-3 35-19 45-40 45S13 73 10 38Z" fill="${fill}" stroke="${stroke}" stroke-width="6"/></g>`;
  } else if (/patch-spots/.test(token)) {
    body = `<rect x="13" y="16" width="74" height="68" rx="17" fill="#ffe8b0" stroke="#755d4e" stroke-width="6"/>${repeatedDots(5, "#c77ac2")}`;
  } else if (/patch-stripes/.test(token)) {
    body = `<rect x="13" y="16" width="74" height="68" rx="17" fill="#d9f4e2" stroke="#4c7f64" stroke-width="6"/><path d="M23 24v52m18-52v52m18-52v52m18-52v52" stroke="#70a4dc" stroke-width="8"/>`;
  } else if (/patch-waves/.test(token)) {
    body = `<rect x="13" y="16" width="74" height="68" rx="17" fill="#f5ddff" stroke="#76568d" stroke-width="6"/><path d="M20 31c12-12 20 12 32 0s20 12 32 0M20 52c12-12 20 12 32 0s20 12 32 0M20 73c12-12 20 12 32 0s20 12 32 0" fill="none" stroke="#c77ac2" stroke-width="6"/>`;
  } else if (/set-/.test(token)) {
    const count = Math.max(1, Math.min(5, Number(token.split("-")[1]) || 1));
    body = repeatedDots(count, fill);
  } else if (token === "boot") {
    body = `<path d="M28 13h35v49c7 0 14 3 21 10 4 5 1 13-6 13H23c-8 0-11-9-5-14l10-9Z" fill="${fill}" stroke="${stroke}" stroke-width="6" stroke-linejoin="round"/>`;
  } else if (token === "mitten") {
    body = `<path d="M39 83c-15-4-24-18-19-32l8-24c2-7 12-5 11 2l-2 12 5-27c1-7 11-5 10 2l-3 25 8-22c2-7 12-3 9 4l-7 21 10-13c5-6 13 1 9 7L67 75c-6 9-17 12-28 8Z" fill="${fill}" stroke="${stroke}" stroke-width="5"/>`;
  } else if (token === "cookie") {
    body = `<circle cx="50" cy="50" r="34" fill="#db9d62" stroke="#755034" stroke-width="6"/>${[[36,35],[62,31],[51,55],[31,65],[70,67]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="5" fill="#65412e"/>`).join("")}`;
  } else if (token === "bridge" || token === "rainbow") {
    body = `<path d="M12 77Q50 17 88 77" fill="none" stroke="#9b78c8" stroke-width="14" stroke-linecap="round"/><path d="M13 87h74" stroke="#4c7f64" stroke-width="8" stroke-linecap="round"/>`;
  } else if (token === "tower") {
    body = `<rect x="22" y="59" width="56" height="24" rx="6" fill="#a9def9" stroke="#337a9e" stroke-width="5"/><rect x="29" y="34" width="42" height="24" rx="6" fill="#ffb6cf" stroke="#a84972" stroke-width="5"/><path d="M34 34 50 13l16 21Z" fill="#ffe38a" stroke="#a97822" stroke-width="5"/>`;
  } else if (token === "slope") {
    body = `<path d="M12 72 85 34v38Z" fill="#bfe6a9" stroke="#4c7f64" stroke-width="6"/><circle cx="29" cy="28" r="14" fill="#ffb6cf" stroke="#a84972" stroke-width="5"/>`;
  } else if (token === "shadow") {
    body = `<path d="M20 76C24 24 67 13 84 20 79 61 54 88 20 76Z" fill="#6f6b74" opacity=".55"/><path d="M16 84h72" stroke="#65508e" stroke-width="6" stroke-dasharray="8 6"/>`;
  } else if (token === "pattern") {
    body = `<circle cx="22" cy="50" r="14" fill="#ffb6cf" stroke="#a84972" stroke-width="5"/><rect x="40" y="36" width="28" height="28" rx="7" fill="#a9def9" stroke="#337a9e" stroke-width="5"/><circle cx="84" cy="50" r="11" fill="#ffb6cf" stroke="#a84972" stroke-width="5"/>`;
  } else if (token === "done") {
    body = '<circle cx="50" cy="50" r="37" fill="#bfe6a9" stroke="#4c7f64" stroke-width="6"/><path d="m28 51 14 14 31-34" fill="none" stroke="#3c8251" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
  } else {
    body = `<path d="M15 67Q50 18 85 67" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round"/><circle cx="50" cy="68" r="12" fill="${fill}" stroke="${stroke}" stroke-width="5"/>`;
  }
  const preserve = token === "boat-hull" ? ' preserveAspectRatio="none"' : "";
  return `<svg${preserve} viewBox="0 0 100 100" aria-hidden="true" data-picture="${esc(token)}">${body}</svg>`;
}

export function discoveryScenePicture(scene) {
  const token = String(scene || "glade");
  if (token === "bridge") return '<div class="discovery-toy-bridge"><span class="bridge-bank bridge-bank--left"></span><span class="bridge-bank bridge-bank--right"></span><span class="bridge-tower bridge-tower--left"></span><span class="bridge-tower bridge-tower--right"></span><span class="bridge-deck bridge-deck--left"></span><span class="bridge-deck bridge-deck--right"></span><span class="bridge-open-gap"></span></div>';
  if (token === "rainbow") return '<div class="discovery-rainbow"><span></span><span></span><span></span></div>';
  if (/birdhouse/.test(token)) return `<div class="discovery-landmark discovery-landmark--house"><span class="house-roof"></span><span class="house-hole"></span></div>`;
  if (/kite/.test(token)) return '<svg class="discovery-kite" viewBox="0 0 120 140" aria-hidden="true"><path d="M60 8 108 57 60 105 12 57Z" fill="#f2a7c1" stroke="#76568d" stroke-width="7" stroke-linejoin="round"/><path d="M60 9v96M13 57h95" fill="none" stroke="#fff4f8" stroke-width="5"/><path d="M60 105c-7 10 15 14 4 24-8 7 4 10 11 5" fill="none" stroke="#76568d" stroke-width="5" stroke-linecap="round"/><path d="m57 117-10 7 11 6m11-4 10-6-1 12" fill="#ffe38a" stroke="#a97822" stroke-width="3" stroke-linejoin="round"/></svg>';
  if (token === "tower") return '<div class="discovery-build-base discovery-build-base--tower"><span></span></div>';
  if (token === "boat") return '<div class="discovery-build-base discovery-build-base--boat"><span class="water-line"></span></div>';
  if (token === "flower-bed") return '<div class="discovery-build-base discovery-build-base--garden"><span></span></div>';
  if (token === "hill") return '<div class="discovery-roll-scene discovery-roll-scene--hill"><span class="roll-ground"></span></div>';
  if (token === "ramp") return '<div class="discovery-roll-scene discovery-roll-scene--ramp"><span class="roll-board"></span><span class="roll-block"></span></div>';
  if (token === "log-hill") return '<div class="discovery-roll-scene discovery-roll-scene--log"><span class="roll-ground"></span><span class="roll-log"></span></div>';
  if (/tree/.test(token)) return `<div class="discovery-landmark discovery-landmark--tree"><span></span></div>`;
  if (token === "picnic") return '<div class="discovery-table-scene discovery-table-scene--picnic"><span></span></div>';
  if (token === "leaf-table") return `<div class="discovery-table-scene discovery-table-scene--leaf"><span></span>${discoveryPicture("leaf-gold")}${discoveryPicture("leaf-green")}</div>`;
  if (token === "sewing-table") return '<div class="discovery-table-scene discovery-table-scene--sewing"><span class="thread-spool"></span><span class="thread-line"></span></div>';
  if (/shadow/.test(token)) return `<div class="discovery-shadow">${discoveryPicture(token.replace("shadow-", ""))}</div>`;
  if (token === "coat-spots") return '<div class="discovery-illustrated-pattern pattern-object-spots"><img src="assets/art/final/props/coat-spots.png" alt="coat with purple spots"></div>';
  if (token === "scarf-stripes") return '<div class="discovery-illustrated-pattern pattern-object-stripes"><img src="assets/art/final/props/scarf-stripes.png" alt="scarf with blue stripes"></div>';
  if (token === "blanket-waves") return '<div class="discovery-illustrated-pattern pattern-object-waves"><img src="assets/art/final/props/blanket-waves.png" alt="blanket with purple waves"></div>';
  if (/two-apples/.test(token)) return discoveryPicture("set-2");
  if (/three-leaves/.test(token)) return discoveryPicture("set-3");
  if (/one-star/.test(token)) return discoveryPicture("set-1");
  if (/^pattern-/.test(token)) return '<div class="discovery-pattern-context"></div>';
  if (token === "sleepy-bug") return `<div class="discovery-scene-character discovery-scene-character--tiny"><img src="${esc(art.get("characters/caterpillar_sleepy")?.src || "assets/art/final/characters/caterpillar_sleepy.webp")}" alt=""></div>`;
  if (token === "rainy-friends") return `<div class="discovery-scene-friends">${discoveryPicture("friend-pip")}${discoveryPicture("friend-unicorn")}</div>`;
  if (token === "three-berries") return `<div class="discovery-scene-berries">${discoveryPicture("berry-pink")}${discoveryPicture("berry-blue")}${discoveryPicture("berry-pink")}</div>`;
  if (token === "flower-pots") return '<div class="discovery-count-context discovery-count-context--pots"><span></span><span></span><span></span></div>';
  if (token === "night-sky") return '<div class="discovery-count-context discovery-count-context--sky"><span class="count-moon"></span></div>';
  if (token === "rain-cloud") return '<div class="discovery-count-context discovery-count-context--cloud"><span></span></div>';
  if (token === "two-friends") return `<div class="discovery-share-scene">${discoveryPicture("friend-pip")}${discoveryPicture("friend-cat")}<span class="share-table"></span></div>`;
  if (token === "tea-party") return `<div class="discovery-share-scene">${discoveryPicture("friend-pip")}${discoveryPicture("friend-unicorn")}<span class="share-table share-table--tea"></span></div>`;
  if (token === "leaf-lunch") return `<div class="discovery-share-scene">${discoveryPicture("friend-cat")}${discoveryPicture("friend-unicorn")}<span class="share-table share-table--leaf">${discoveryPicture("leaf-green")}</span></div>`;
  return `<div class="discovery-landmark discovery-landmark--glade"><span></span><span></span><span></span></div>`;
}

function buildPartsMarkup(variation, built) {
  const priority = variation.id === "tower"
    ? { block: 0, round: 1, roof: 2 }
    : variation.id === "boat" ? { hull: 0, sail: 1, window: 2 } : {};
  const seen = {};
  return (built || []).map((id, index) => ({ id, index, occurrence: seen[id] = (seen[id] || 0) + 1 }))
    .sort((a, b) => (priority[a.id] ?? 0) - (priority[b.id] ?? 0) || a.index - b.index)
    .map((part) => {
      const option = variation.options.find((entry) => entry.id === part.id);
      return `<span data-part="${esc(part.id)}" style="--i:${part.index};--n:${part.occurrence - 1}">${discoveryPicture(option?.picture)}</span>`;
    }).join("");
}

export function discoveryBuildPreview(rawBuild) {
  const mission = discoveryMission(rawBuild?.missionId || "shape-build");
  const variation = discoveryVariation(mission, rawBuild?.variationId);
  if (!mission || mission.kind !== "build" || !variation) return "";
  const draft = normalizeDiscoveryDraft({
    missionId: mission.id,
    variationId: variation.id,
    built: rawBuild?.built,
    completed: false,
  }, mission.id, variation.id);
  if (!draft.built.length) return "";
  return `<div class="discovery-owned-build" data-mission="${esc(mission.id)}" data-variation="${esc(variation.id)}"><div class="discovery-scene">${discoveryScenePicture(variation.scene)}<div class="discovery-built">${buildPartsMarkup(variation, draft.built)}</div></div></div>`;
}
export function sortingCollectionMarkup(variation, draft) {
  return `<div class="discovery-sorted-collection" aria-label="our sorted collection">${(variation.targets || []).map(target => {
    const pieces = (variation.pieces || []).filter(piece => draft.placements?.[piece.id] === target.id);
    return `<section class="discovery-sorted-group" data-sorted-target="${esc(target.id)}" aria-label="${esc(target.id)} group: ${pieces.length} pieces"><div class="discovery-sorted-symbol" aria-hidden="true">${discoveryPicture(target.picture)}</div><div class="discovery-sorted-pieces">${pieces.map(piece => `<span data-sorted-piece="${esc(piece.id)}">${discoveryPicture(piece.picture)}</span>`).join('')}</div></section>`;
  }).join('')}</div>`;
}

function makePictureButton(cls, label, picture, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = cls;
  button.setAttribute("aria-label", label);
  button.innerHTML = discoveryPicture(picture);
  return tapify(button, action);
}

export const discovery = {
  id: "discovery",

  _canControl(button, visit) {
    return this._alive && visit === this._visit && button.isConnected !== false && !this._checkpointing && !this._acting && !this._heldPointers?.size && !this._saveProblem;
  },

  _tap(button, action, { persistent = false } = {}) {
    const visit = this._visit, mount = this._mountVisit;
    return tapify(button, event => {
      if (persistent) {
        if (!this._alive || mount !== this._mountVisit || button.isConnected === false || this._checkpointing || this._acting || this._heldPointers?.size) return;
      } else if (!this._canControl(button, visit)) return;
      return action(event);
    });
  },

  _pictureButton(cls, label, picture, action) {
    const visit = this._visit;
    let button; button = makePictureButton(cls, label, picture, event => { if (this._canControl(button, visit)) return action(event); });
    return button;
  },

  async mount(host, params = {}) {
    this._catalogGroup = discoveryEntryGroup(params);
    this._mapPuzzlePicker = params.fromMap === true && this._catalogGroup === 'puzzles';
    this._draftPickerPage = 0;
    this._alive = true;
    this._mountVisit = {};
    const mount = this._mountVisit;
    this._visit = {};
    this._drag = null;
    this._dragged = null;
    this._selectedPiece = null;
    this._demonstrating = false;
    this._completing = false;
    this._acting = false;
    this._checkpointing = false;
    this._saveProblem = null;
    this._completedSaved = false;
    this._completedApplied = false;
    this._heldPointers = new Set();
    this._rejectedPointers = new Map();
    this._legacyClickUntil = 0;
    this._recentPenAt = -Infinity;
    this._testingBuild = false;
    this._launchAnimation = null;
    this._launchToken = null;
    this._launchSplash = null;
    this._timers = [];
    this.host = host;
    this._onDragMove = (event) => this._moveDrag(event);
    this._onDragEnd = (event) => { this._releaseInput(event); this._finishDrag(event); };
    window.addEventListener("pointermove", this._onDragMove, true);
    window.addEventListener("pointerup", this._onDragEnd, true);
    window.addEventListener("pointercancel", this._onDragEnd, true);
    this._onVisibilityChange = () => {
      if (document.hidden) { this._cancelLaunch(true); this._cancelDemonstration(true); this._onBlur?.(); }
    };
    document.addEventListener("visibilitychange", this._onVisibilityChange);
    const root = document.createElement("div");
    root.className = "discovery learning-screen";
    root.innerHTML = '<div class="discovery-guide"></div><main class="discovery-main"></main>';
    host.appendChild(root);
    addScenery(root, "discovery", { foreground: false });
    this.root = root;
    this.main = root.querySelector(".discovery-main");
    this._pickerHelp?.();
    this._pickerHelp = installDiscoveryPickerHelp(this);
    this.guide = new Character(root.querySelector(".discovery-guide"), { name: "pip", state: "idle", follow: false });
    this._home = homeButton();
    this._mute = muteButton();
    this._activities = document.createElement("button");
    this._activities.type = "button";
    this._activities.className = "discovery-activities tap";
    this._activities.setAttribute("aria-label", "back to activities");
    this._activities.innerHTML = iconSVG("next") + '<span>Activities</span>';
    this._tap(this._activities, () => this._saveProblem ? this._retrySave() : this._showPicker(), { persistent: true });
    root.append(this._home, this._mute, this._activities);
    this._onInputDown = event => this._acceptInput(event);
    this._onInputClick = event => this._allowInputClick(event);
    this._onPickerKey = () => this._stopPickerCue();
    root.addEventListener('pointerdown',this._onInputDown,true); root.addEventListener('click',this._onInputClick,true);
    root.addEventListener('keydown',this._onPickerKey,true);
    this._onBlur = () => { const until=performance.now()+700; for (const id of this._heldPointers) this._rejectedPointers.set(id,until); this._legacyClickUntil=until; if (this._drag) this._finishDrag({pointerId:this._drag.pointerId,type:'pointercancel'}); this._heldPointers.clear(); };
    window.addEventListener('blur',this._onBlur);
    try {
      await discoveryState.load();
      if (!this._alive || mount !== this._mountVisit) return;
      return this._openEntry(params);
    } catch (error) {
      if (this._alive && mount === this._mountVisit) this._showSaveFailure(error, async () => { await discoveryState.load(); return this._openEntry(params); });
    }
  },

  _stopPickerCue() { this._pickerCueStop?.(); this._pickerCueStop = null; },

  _acceptInput(event) {
    this._stopPickerCue();
    const now = performance.now();
    for (const [id, until] of this._rejectedPointers) if (until < now) this._rejectedPointers.delete(id);
    if (event.pointerType === 'pen') this._recentPenAt = now;
    if (event.pointerType === 'pen' && this._heldPointers.size) {
      for (const id of this._heldPointers) this._rejectedPointers.set(id,Infinity);
      if (this._drag) this._finishDrag({pointerId:this._drag.pointerId,type:'pointercancel'});
      this._heldPointers.clear();
    }
    if (!this._alive || event.button !== 0 || !shouldAccept({pointerType:event.pointerType,lastPenAt:this._recentPenAt,now,allowFinger:!settings.get().penOnly}) || this._heldPointers.size || this._checkpointing) {
      this._rejectedPointers.set(event.pointerId,Infinity); event.preventDefault(); event.stopImmediatePropagation(); return false;
    }
    this._rejectedPointers.delete(event.pointerId); this._legacyClickUntil=0;
    this._heldPointers.add(event.pointerId);
    return true;
  },

  _allowInputClick(event) {
    const now=performance.now();
    const blocked=event.pointerId === undefined ? this._legacyClickUntil >= now && event.detail !== 0 : this._rejectedPointers.get(event.pointerId) >= now;
    if (!this._alive || this._heldPointers.size || blocked) { event.preventDefault(); event.stopImmediatePropagation(); return false; }
    return true;
  },

  _releaseInput(event) {
    if (event.type === 'pointercancel' || this._rejectedPointers?.has(event.pointerId)) {
      const until=performance.now()+700; this._rejectedPointers?.set(event.pointerId,until); this._legacyClickUntil=until;
    }
    this._heldPointers?.delete(event.pointerId);
  },

  _openEntry(params = {}) {
    const savedState = discoveryState.get();
    const requested = discoveryMission(params.missionId || params.mission);
    const saved = requested ? discoveryState.draftFor(requested.id, params.variationId || params.variation || null) : savedState.draft;
    if (params.reopenBuild && savedState.latestBuild) {
      return this._loadOwnedBuild(savedState.latestBuild);
    } else if (saved && requested?.id === saved.missionId) {
      return this._loadMission(saved.missionId, saved.variationId, saved);
    } else if (requested) {
      return this._loadMission(requested.id, params.variationId || params.variation || null, null);
    } else {
      return this._showPicker();
    }
  },

  _showPicker(speak = true) {
    if (this._heldPointers?.size || this._acting || this._checkpointing) return;
    const mount=this._mountVisit, visit=this._visit;
    if (this.mission && this.draft) return this._checkpoint().then(ok => { if (ok && mount === this._mountVisit && visit === this._visit) this._renderPicker(speak); });
    return this._renderPicker(speak);
  },

  _renderPicker(speak = true) {
    this._stopPickerCue();
    if (!this._alive) return;
    this._cancelLaunch();
    this._cancelDemonstration();
    // Browsing is not abandoning: the persisted draft remains available below.
    // Invalidate delayed completion/action callbacks before clearing scene state.
    this._visit = {};
    this._drag = null;
    this._dragged = null;
    this._acting = false;
    this._completing = false;
    this._demonstrating = false;
    document.querySelectorAll(".discovery-demo-hand").forEach((node) => node.remove());
    this._activities.hidden = true;
    this.root.classList.remove("discovery-size-mode", "discovery-result-mode");
    this.mission = null;
    this.variation = null;
    this.draft = null;
    this._selectedPiece = null;

    const shell = document.createElement("div");
    shell.className = "discovery-picker-shell";
    const panel = document.createElement("div");
    panel.className = "discovery-picker";
    const unfinished = discoveryState.get().draft?.completed === false;
    const group = this._catalogGroup || (unfinished ? 'puzzles' : 'make');
    const groups = document.createElement('nav'); groups.className = 'discovery-groups';
    groups.hidden = this._mapPuzzlePicker === true;
    shell.classList.toggle('discovery-map-puzzles', groups.hidden);
    groups.setAttribute('aria-label', 'Choose a kind of play');
    for (const [id, title, picture] of [['make', 'Make', 'tower'], ['move', 'Move', 'boat-launch'], ['puzzles', 'Puzzles', 'activities']]) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'discovery-group tap'; button.dataset.group = id;
      button.disabled = group === id; // The current category is a label, not another action.
      button.setAttribute('aria-pressed', String(group === id)); button.setAttribute('aria-label', title);
      button.innerHTML = discoveryPicture(picture);
      const caption = document.createElement('span'); caption.textContent = title; button.append(caption);
      this._tap(button, () => { this._catalogGroup = id; this._showPicker(false); });
      groups.append(button);
    }
    shell.append(groups);
    const snapshot = discoveryState.get();
    const saved = snapshot.draft?.completed === false ? snapshot.draft : Object.values(snapshot.drafts).filter(row => !row.completed).sort((a,b) => b.at-a.at)[0];
    const latestBuild = snapshot.latestBuild;
    const pendingBuild = latestBuild && discoveryState.draftFor(latestBuild.missionId, latestBuild.variationId);
    const preview = discoveryBuildPreview(pendingBuild?.completed === false ? pendingBuild : latestBuild);
    // Keep the saved activity visible on every map page without adding a sixth control.
    // Reflow the remaining missions rather than removing any of them.
    const pinned = this._mapPuzzlePicker && group === 'puzzles' && saved && discoveryMission(saved.missionId);
    const remaining = pinned ? DISCOVERY_CATALOG_PAGES.flat().filter(id => id !== saved.missionId) : [];
    const duplicateBuild = pinned && latestBuild?.missionId === saved.missionId && latestBuild?.variationId === saved.variationId;
    const pageSize = 2;
    const pageCount = pinned ? Math.max(1, Math.ceil(remaining.length / pageSize)) : DISCOVERY_CATALOG_PAGES.length;
    const page = pinned ? ((this._draftPickerPage || 0) % pageCount + pageCount) % pageCount : snapshot.catalogPage;
    const choices = group !== 'puzzles' ? [] : pinned ? [pinned, ...remaining.slice(page * pageSize, (page + 1) * pageSize).map(discoveryMission)] : discoveryState.choices();
    const savedOnPage = !!pinned;
    for (const [route, label, picture, caption] of [
      ["boo-hollow", "Boo Hollow: draw a ghost friend and visit family", "assets/art/final/halloween/boo-path-v1-runtime.webp", "Make a ghost"],
      ["build-lab", "Build Lab: construct and test a bridge", "assets/art/final/characters/discovery_idle.webp", "Build a bridge"],
      ["water-garden", "Water Garden: plant and draw water paths", "assets/art/final/props/counting-flower.webp", "Water flowers"],
      ["rolling-run", "Rolling Run: try your picture toy on a hill", "assets/art/final/rolling-run/ramp-v1.png", "Roll a toy"],
      ["river-run", "River Run: try your picture toy on the water", "assets/art/final/river-run/dock-v1.png", "Sail a toy"],
      ["animal-friends", "Animal Friends: find, arrange and visit your black cat", "assets/art/final/stories/black-cat.png", "Visit the cat"],
    ]) {
      const routeGroup = ['boo-hollow', 'build-lab', 'water-garden'].includes(route) ? 'make' : 'move';
      if (group !== routeGroup || !router.registered().includes(route)) continue;
      const card = document.createElement("button"); card.type = "button";
      card.className = "discovery-mission-card tap"; card.setAttribute("aria-label", label);
      const image = document.createElement("img"); image.src = route === "build-lab" ? (art.get("characters/discovery_idle")?.src || picture) : route === "animal-friends" ? (art.get("stories/black-cat")?.src || picture) : picture; image.alt = "";
      image.className = "discovery-card-picture"; card.append(image);
      const text = document.createElement("span"); text.className = "discovery-card-caption"; text.textContent = caption; card.append(text);
      this._tap(card, () => router.go(route)); panel.append(card);
    }
    for (const mission of choices) {
      // The dedicated Continue card must reopen the exact current draft,
      // even if another variation of the same puzzle was edited more recently.
      const missionDraft = savedOnPage && mission.id === saved.missionId ? saved : discoveryState.draftFor(mission.id);
      const card = this._pictureButton(
        "discovery-mission-card tap",
        DISCOVERY_FAMILIES_LABELS[mission.family] + ": " + mission.verb,
        mission.icon,
        () => {
          const continuing = savedOnPage && mission.id === saved.missionId;
          const current = continuing ? discoveryState.draftFor(mission.id, saved.variationId) : discoveryState.draftFor(mission.id);
          // Never recreate a stale snapshot if the saved draft changed or disappeared.
          if (continuing && (!current || current.completed)) {
            this._renderPicker(false);
            const notice = document.createElement('p');
            notice.className = 'discovery-picker-notice'; notice.setAttribute('role', 'status');
            notice.textContent = 'That saved puzzle changed or is unavailable. Choose a picture or return Home.';
            this.main.querySelector('.discovery-picker-shell')?.append(notice);
            return;
          }
          this._markEngaged("mission-picked", { missionId: mission.id });
          sfx.play("tap");
          this._loadMission(mission.id, current?.missionId === mission.id ? current.variationId : null,
            current?.missionId === mission.id ? current : null);
        }
      );
      card.dataset.mission = mission.id;
      card.dataset.family = mission.family;
      const caption = document.createElement("span"); caption.className = "discovery-card-caption";
      caption.textContent = ({ 'shape-fit': 'Fit a shape', 'shape-build': 'Build with shapes', 'shape-roll': 'Try rolling', 'shape-place': 'Find a place', 'sort-color': 'Sort colours', 'sort-shadow': 'Match shadows', 'sort-size': 'Find a fit', 'sort-pair': 'Match patterns', 'quantity-count': 'Count flowers', 'quantity-share': 'Share with friends', 'quantity-pattern': 'Finish a pattern', 'quantity-one-more': 'One more' })[mission.id] || mission.verb;
      card.append(caption);
      if (missionDraft?.completed === false) {
        card.setAttribute("aria-description", "Continue your unfinished Discovery play");
        if (savedOnPage && mission.id === saved.missionId) {
          caption.textContent = 'Continue: ' + caption.textContent;
          card.setAttribute('aria-label', 'Continue ' + DISCOVERY_FAMILIES_LABELS[mission.family] + ': ' + mission.verb);
        }
        const bookmark = document.createElement("span"); bookmark.className = "discovery-keepsake-heart"; bookmark.innerHTML = iconSVG("play"); card.append(bookmark);
      }
      panel.appendChild(card);
    }

    const footer = document.createElement("div");
    footer.className = "discovery-catalog-footer";
    const previous = document.createElement("button");
    previous.type = "button";
    previous.className = "discovery-catalog-nav-button discovery-catalog-previous tap";
    previous.setAttribute("aria-label", "previous discovery pictures");
    previous.innerHTML = iconSVG("next");
    previous.dataset.action = "catalog-previous";
    this._tap(previous, () => this._changeCatalogPage(-1));

    const dots = document.createElement("div");
    dots.className = "discovery-catalog-dots";
    for (let i = 0; i < pageCount; i++) {
      const dot = document.createElement("span");
      if (i === page) dot.className = "is-current";
      dots.appendChild(dot);
    }
    const pageHint = document.createElement("small");
    pageHint.className = "discovery-page-hint";
    pageHint.textContent = `More puzzles · ${page + 1} of ${pageCount}`;
    dots.appendChild(pageHint);

    const next = document.createElement("button");
    next.type = "button";
    next.className = "discovery-catalog-nav-button discovery-catalog-next tap";
    next.setAttribute("aria-label", "next discovery pictures");
    next.innerHTML = iconSVG("next");
    // A tiny stack of picture cards makes “more choices” visible without sound.
    // It is decorative: only the existing button changes the page.
    const morePictures = document.createElement("span");
    morePictures.className = "discovery-more-pictures";
    morePictures.setAttribute("aria-hidden", "true");
    next.appendChild(morePictures);
    next.dataset.action = "catalog-next";
    this._tap(next, () => this._changeCatalogPage(1));
    dots.hidden = next.hidden = group !== 'puzzles';
    // With a separate keepsake, one wrapping arrow leaves room for both creations.
    previous.hidden = group !== 'puzzles' || !!(pinned && preview && !duplicateBuild);
    footer.append(previous, dots, next);

    if (preview && !duplicateBuild) {
      const keepsake = document.createElement("button");
      keepsake.type = "button";
      keepsake.className = "discovery-keepsake-button tap";
      keepsake.setAttribute("aria-label", pendingBuild?.completed === false ? "continue my unfinished build" : "open my last build");
      keepsake.dataset.action = "reopen-build";
      keepsake.dataset.variation = latestBuild.variationId;
      keepsake.innerHTML = preview + `<span class="discovery-keepsake-heart">${iconSVG("heart")}</span>`;
      this._tap(keepsake, () => {
        sfx.play("tap");
        this._loadOwnedBuild(latestBuild);
      });
      footer.appendChild(keepsake);
    }

    if (saved && !saved.completed && !savedOnPage) {
      const mission = discoveryMission(saved.missionId);
      const resume = document.createElement("button");
      resume.type = "button";
      resume.className = "discovery-resume tap";
      resume.dataset.action = "resume-discovery";
      resume.setAttribute("aria-label", "continue " + mission.verb);
      resume.innerHTML = `<span class="discovery-resume-picture">${discoveryPicture(mission.icon)}</span><span>Continue playing</span>${iconSVG("play")}`;
      this._tap(resume, () => this._loadMission(saved.missionId, saved.variationId, saved));
      shell.appendChild(resume);
    }
    shell.append(panel, footer);
    this.main.replaceChildren(shell);
    if (speak && !session.isBreakLocked() && !this._saveProblem) this._pickerCueStop = showDiscoveryPickerCue(this);
    if (speak) speech.say("discovery_welcome");
  },

  async _changeCatalogPage(delta) {
    if (!this._alive || this._acting) return;
    this._acting = true;
    this._markEngaged("catalog-page", { delta });
    sfx.play("tap");
    const current = discoveryState.get().catalogPage;
    const visit = this._visit;
    const snapshot = discoveryState.get();
    const saved = snapshot.draft?.completed === false ? snapshot.draft : Object.values(snapshot.drafts).filter(row => !row.completed).sort((a,b) => b.at-a.at)[0];
    if (this._mapPuzzlePicker && saved && discoveryMission(saved.missionId)) {
      const size = 2;
      const count = Math.max(1, Math.ceil((DISCOVERY_CATALOG_PAGES.flat().length - 1) / size));
      this._draftPickerPage = ((this._draftPickerPage || 0) + delta + count) % count;
      this._acting = false; this._showPicker(false); speech.say('discovery_another'); this._markIdle('catalog-ready'); return;
    }
    try { await discoveryState.setCatalogPage(current + delta); }
    catch (error) { if (this._alive && this._visit === visit) this._showSaveFailure(error, () => this._showPicker(false)); return; }
    if (!this._alive || this._visit !== visit) return;
    this._acting = false;
    if (!this._alive) return;
    this._showPicker(false);
    speech.say("discovery_another");
    this._markIdle("catalog-ready");
  },

  _loadOwnedBuild(build = discoveryState.get().latestBuild) {
    if (!build || !this._alive) return;
    const raw = {
      missionId: build.missionId,
      variationId: build.variationId,
      built: Array.isArray(build.built) ? build.built.slice() : [],
      completed: false,
    };
    this._markEngaged("owned-build-opened", { variationId: build.variationId });
    return this._loadMission(build.missionId, build.variationId, raw);
  },
  async _loadMission(missionId, variationId, rawDraft) {
    const mission = discoveryMission(missionId);
    if (!mission || !this._alive || this._acting || this._checkpointing || this._heldPointers?.size) return;
    if (this.mission && this.draft && !await this._checkpoint()) return;
    const chosenVariation = discoveryVariation(mission, variationId) ||
      discoveryVariation(mission, discoveryState.chooseVariation(mission.id));
    if (!chosenVariation) return;
    const stored = discoveryState.draftFor(mission.id, chosenVariation.id);
    const target = stored || rawDraft || emptyDiscoveryDraft(mission.id, chosenVariation.id);
    const mount = this._mountVisit, visit = this._visit;
    this._checkpointing = true;
    let saved;
    try { saved = await discoveryState.saveDraft(mission.id, chosenVariation.id, target); }
    catch (error) { if (this._alive && mount === this._mountVisit && visit === this._visit) this._showSaveFailure(error, () => this._loadMission(mission.id, chosenVariation.id, target)); return; }
    finally { if (this._alive && mount === this._mountVisit && visit === this._visit) this._checkpointing = false; }
    if (!this._alive || mount !== this._mountVisit || visit !== this._visit) return;
    this._cancelLaunch();
    this._cancelDemonstration();
    this._visit = {};
    this.mission = mission;
    this.variation = chosenVariation;
    this.draft = saved;
    this._completedSaved = false;
    this._completedApplied = false;
    this._selectedPiece = null;
    this._renderMission();
    if (this.draft.completed) return this._complete(this._visit, true);
    speech.say(chosenVariation.promptKey, { count: chosenVariation.goal || chosenVariation.total || "" });
  },

  _renderMission() {
    if (!this._alive || !this.mission || !this.variation) return;
    this._activities.hidden = false;
    this.root.classList.remove("discovery-result-mode");
    this.root.classList.toggle("discovery-size-mode", this.mission.kind === "size");
    const shell = document.createElement("div");
    shell.className = "discovery-mission";
    shell.dataset.kind = this.mission.kind;
    shell.dataset.mission = this.mission.id;
    shell.dataset.variation = this.variation.id;

    const top = document.createElement("div");
    top.className = "discovery-topbar";
    const demo = document.createElement("button");
    demo.type = "button";
    demo.className = "discovery-round-button discovery-demo tap";
    demo.setAttribute("aria-label", "show me");
    demo.innerHTML = '<img src="assets/art/final/ui/showme.webp" alt="">';
    this._tap(demo, () => this._demonstrate());
    top.append(demo);

    const world = document.createElement("div");
    world.className = "discovery-world";
    world.setAttribute("aria-label", "discovery picture");
    world.innerHTML = this._worldMarkup();
    this.world = world;

    const activity = document.createElement("div");
    activity.className = "discovery-activity";
    this.activity = activity;
    shell.append(top, world, activity);
    this.main.replaceChildren(shell);
    this._renderActivity();
  },

  _worldMarkup() {
    const mission = this.mission;
    const variation = this.variation;
    const draft = this.draft;
    if (mission.kind === "sort") {
      return sortingCollectionMarkup(variation, draft);
    }
    if (mission.kind === "size") {
      return `<div class="discovery-scene discovery-scene--size">${discoverySizeScene(variation, draft.choice)}<div class="discovery-scene-drop" data-drop="world" aria-hidden="true"></div></div>`;
    }
    let inside = discoveryScenePicture(variation.scene);
    if (mission.kind === "build") {
      inside += `<div class="discovery-built">${buildPartsMarkup(variation, draft.built)}</div>`;
    } else if (mission.kind === "compare") {
      inside += `<div class="discovery-observations">${draft.observed.map((id, i) => {
        const option = variation.options.find((entry) => entry.id === id);
        return option ? `<span class="discovery-observation" data-motion="${esc(option.motion || "notice")}" style="--i:${i}">${discoveryPicture(option.picture)}</span>` : "";
      }).join("")}</div>`;
    } else if (mission.kind === "count" && variation.scene === "flower-pots") {
      inside = `<div class="discovery-planted-row" aria-label="${draft.made.length} ${draft.made.length === 1 ? 'flower' : 'flowers'} planted">${Array.from({ length: variation.goal }, (_, i) => `<span class="discovery-planted-pot">${i < draft.made.length ? '<img class="planted-flower" src="assets/art/final/props/counting-flower.webp" alt="flower">' : ''}<img class="planted-pot" src="assets/art/final/props/counting-pot.webp" alt="${i < draft.made.length ? 'pot' : 'empty pot'}"></span>`).join("")}</div>`;
    } else if (mission.kind === "count") {
      inside += `<div class="discovery-count-slots">${Array.from({ length: variation.goal }, (_, i) => `<span class="${i < draft.made.length ? "is-filled" : ""}">${i < draft.made.length ? discoveryPicture((variation.options.find((o) => o.id === draft.made[i]) || {}).picture) : ""}</span>`).join("")}</div>`;
    } else if (mission.id === "quantity-pattern") {
      inside = `<div class="discovery-pattern-line">${(variation.pattern || []).map(discoveryPicture).join("")}<span class="pattern-question">?</span></div>`;
    } else if (mission.id === "quantity-one-more") {
      inside = quantityScene(variation, draft.completed);
    } else if (mission.id === "shape-fit") {
      const fit = variation.options.find((entry) => entry.correct);
      inside += `<div class="discovery-fit-hole">${fit ? discoveryPicture(fit.picture) : ""}</div>`;
    }
    if (draft.choice && mission.id !== "quantity-one-more") {
      const picked = (variation.options || []).find((entry) => entry.id === draft.choice);
      if (picked && mission.id === "shape-place") {
        inside += `<div class="discovery-consequence discovery-position-result" data-position="${esc(picked.id)}" data-scene="${esc(variation.scene)}">${discoveryPicture("friend-pip")}</div>`;
      } else if (picked) {
        const fitted = mission.id === "shape-fit" && picked.correct === true;
        inside += `<div class="discovery-consequence${fitted ? " discovery-consequence--fit" : ""}" data-motion="${esc(picked.motion || "notice")}">${discoveryPicture(picked.picture)}</div>`;
      }
    }
    return `<div class="discovery-scene">${inside}<div class="discovery-scene-drop" data-drop="world" aria-hidden="true"></div></div>`;
  },

  _renderActivity() {
    const mission = this.mission;
    if (!mission) return;
    this.activity.replaceChildren();
    if (mission.kind === "sort" || mission.kind === "share") this._renderPlaceActivity();
    else this._renderChoiceActivity();
  },

  _renderChoiceActivity() {
    const tray = document.createElement("div");
    tray.className = "discovery-options";
    const atBuildCapacity = this.mission.kind === "build" &&
      this.draft.built.length >= Math.max(1, this.variation.maxParts || 9);
    // Counting offers one clear planting action; saved older color IDs remain valid.
    const planting = this.variation.scene === "flower-pots";
    const options = planting ? this.variation.options.slice(0, 1) : this.variation.options;
    for (const entry of options) {
      const sizeTrial = this.mission.kind === "size";
      const oneMore = this.mission.id === "quantity-one-more";
      const label = planting ? "plant a flower" : oneMore ? quantityLabel(this.variation, quantityChoiceCount(entry)) : sizeTrial ? discoverySizeChoiceLabel(this.variation, entry.id) : entry.id;
      const button = this._pictureButton("discovery-choice tap", label, entry.picture, () => {
        if (this._dragged === entry.id) { this._dragged = null; return; }
        this._act({ type: "choose", optionId: entry.id });
      });
      if (planting) button.innerHTML = '<img class="discovery-approved-character" src="assets/art/final/props/counting-flower.webp" alt="">';
      if (oneMore) {
        button.classList.add("discovery-concrete-choice");
        button.innerHTML = quantityChoicePicture(this.variation, quantityChoiceCount(entry));
        button.setAttribute("aria-pressed", String(this.draft.choice === entry.id));
      }
      button.dataset.option = entry.id;
      if (sizeTrial) {
        button.classList.add("discovery-size-choice");
        button.innerHTML = discoverySizeScene(this.variation, entry.id, { preview: true });
        button.setAttribute("aria-pressed", String(this.draft.choice === entry.id));
        if (this.draft.observed.includes(entry.id)) {
          button.classList.add("is-tried");
          button.insertAdjacentHTML("beforeend", '<span class="discovery-size-tried" aria-hidden="true"></span>');
        }
      }
      if (atBuildCapacity) {
        button.disabled = true;
        button.classList.add("is-full");
      } else {
        this._enableDrag(button, entry.id);
      }
      tray.appendChild(button);
    }
    this.activity.appendChild(tray);

    const controls = document.createElement("div");
    controls.className = "discovery-build-controls";
    if (this.mission.kind === "build" && this.draft.built.length) {
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "discovery-undo-button tap";
      undo.setAttribute("aria-label", "take off the last piece");
      undo.innerHTML = iconSVG("replay");
      undo.dataset.action = "undo";
      this._tap(undo, () => this._act({ type: "undo" }));
      controls.appendChild(undo);
    }
    if (discoveryCanLaunch(this.mission, this.variation, this.draft)) {
      const launch = this._pictureButton(
        "discovery-launch-button tap",
        "launch my boat",
        "boat-launch",
        () => this._launchBoat()
      );
      launch.dataset.action = "launch";
      controls.appendChild(launch);
    }
    if (discoveryCanFinish(this.mission, this.variation, this.draft)) {
      const finish = this._pictureButton(
        "discovery-finish-button tap",
        this.mission.kind === "compare" || this.mission.kind === "size" ? "finished testing" : "finished building",
        "done",
        () => this._act({ type: "finish" })
      );
      finish.dataset.action = "finish";
      controls.appendChild(finish);
    }
    if (controls.childElementCount) this.activity.appendChild(controls);
  },
  _renderPlaceActivity() {
    const tray = document.createElement("div");
    tray.className = "discovery-piece-tray";
    const targets = document.createElement("div");
    targets.className = "discovery-targets";
    const pieces = missionOptions(this.mission, this.variation);
    const placed = this.draft.placements || {};
    for (const piece of pieces) {
      if (placed[piece.id]) continue;
      tray.appendChild(this._pieceButton(piece));
    }
    for (const target of this.variation.targets || []) {
      const activate = () => {
        if (this._selectedPiece) this._act({ type: "place", pieceId: this._selectedPiece, targetId: target.id });
        else speech.say(this.mission.demoKey);
      };
      const button = document.createElement("div");
      button.className = "discovery-target tap";
      button.setAttribute("role", "button");
      button.setAttribute("tabindex", "0");
      button.setAttribute("aria-label", target.id);
      button.innerHTML = discoveryPicture(target.picture);
      this._tap(button, activate);
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
      });
      button.dataset.target = target.id;
      const held = pieces.filter((piece) => placed[piece.id] === target.id);
      const pocket = document.createElement("span");
      pocket.className = "discovery-target-pocket";
      for (const piece of held) {
        if (this.mission.kind === "share") pocket.appendChild(this._pieceButton(piece, true));
        else {
          const mini = document.createElement("span");
          mini.className = "discovery-placed-picture";
          mini.innerHTML = discoveryPicture(piece.picture);
          pocket.appendChild(mini);
        }
      }
      button.appendChild(pocket);
      targets.appendChild(button);
    }
    this.activity.append(tray, targets);
  },

  _pieceButton(piece, placed = false) {
    const button = this._pictureButton("discovery-piece tap" + (this._selectedPiece === piece.id ? " is-selected" : ""), piece.id, piece.picture, () => {
      if (this._dragged === piece.id) { this._dragged = null; return; }
      this._selectedPiece = this._selectedPiece === piece.id ? null : piece.id;
      this._renderActivity();
    });
    button.dataset.piece = piece.id;
    button.addEventListener("click", (event) => event.stopPropagation());
    if (placed) button.classList.add("is-placed");
    this._enableDrag(button, piece.id);
    return button;
  },

  _enableDrag(button, id) {
    const visit = this._visit;
    button.addEventListener("pointerdown", (event) => {
      if (!this._alive || visit !== this._visit || button.isConnected === false || event.button !== 0 || this._completing || this._checkpointing || this._acting || this._saveProblem || this._drag || !this._heldPointers?.has(event.pointerId)) return;
      const start = { x: event.clientX, y: event.clientY };
      this._drag = { id, button, pointerId: event.pointerId, start, moved: false };
      try { button.setPointerCapture(event.pointerId); } catch (_) {}
    });
  },

  _moveDrag(event) {
    const drag = this._drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.start.x;
    const dy = event.clientY - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 9) return;
    drag.moved = true;
    drag.button.classList.add("is-dragging");
    drag.button.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
  },

  _finishDrag(event) {
    const drag = this._drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this._drag = null;
    try { drag.button.releasePointerCapture(event.pointerId); } catch (_) {}
    drag.button.classList.remove("is-dragging");
    drag.button.style.transform = "";
    if (!drag.moved || event.type === "pointercancel") return;
    this._dragged = drag.id;
    const oldVisibility = drag.button.style.visibility;
    drag.button.style.visibility = "hidden";
    const under = document.elementFromPoint(event.clientX, event.clientY);
    drag.button.style.visibility = oldVisibility;
    const target = under && under.closest && under.closest("[data-target]");
    const world = under && under.closest && under.closest("[data-drop=world], .discovery-world");
    if ((this.mission.kind === "sort" || this.mission.kind === "share") && target) {
      this._act({ type: "place", pieceId: drag.id, targetId: target.dataset.target });
    } else if (world && !(this.mission.kind === "sort" || this.mission.kind === "share")) {
      this._act({ type: "choose", optionId: drag.id });
    }
    const timer = setTimeout(() => { if (this._dragged === drag.id) this._dragged = null; }, 400);
    this._timers.push(timer);
  },

  async _act(action) {
    if (!this._alive || this._acting || this._checkpointing || this._heldPointers?.size || this._saveProblem || this._testingBuild || this._completing || !this.mission || !this.variation) return;
    this._acting = true;
    const visit = this._visit;
    const outcome = applyDiscoveryAction(this.mission.id, this.variation.id, this.draft, action);
    if (!outcome.accepted || !outcome.draft) {
      this._acting = false;
      this._markIdle("action-rejected");
      return;
    }
    this._markEngaged("mission-action", { missionId: this.mission.id, action: action.type });
    this.draft = outcome.draft;
    this._selectedPiece = null;
    sfx.play(outcome.complete ? "sparkle" : "pop");
    let recorded;
    try {
      recorded = outcome.complete
        ? await discoveryState.recordVisit(this.mission.id, this.variation.id, this.draft)
        : await discoveryState.saveDraft(this.mission.id, this.variation.id, this.draft);
    } catch (error) {
      if (this._alive && this._visit === visit) {
        this._completedApplied = outcome.complete && error.discoveryVisitApplied === true;
        this._renderMission();
        this._showSaveFailure(error, () => { this._renderMission(); if (outcome.complete) return this._complete(visit, error.discoveryVisitApplied === true); });
      }
      return;
    }
    if (!this._alive || this._visit !== visit) return;
    this._renderMission();
    if (outcome.phraseKey) speech.say(outcome.phraseKey);
    if (this.guide && this.mission.kind !== "size") {
      this.guide.set(outcome.complete ? "cheer" : "happy");
      this.guide.bounce();
    }
    this._acting = false;
    this._completedSaved = !!recorded?.recorded;
    this._completedApplied = !!recorded?.recorded;
    if (outcome.complete) await this._complete(visit, !!recorded?.recorded);
    else {
      const timer = setTimeout(() => { if (this._alive && this._visit === visit && this.guide) this.guide.set("idle"); }, 700);
      this._timers.push(timer);
      this._markIdle("action-ready");
    }
  },

  async _complete(visit, alreadyRecorded = false) {
    if (!this._alive || this._visit !== visit || this._completing) return;
    this._completing = true;
    const mission = this.mission;
    const variation = this.variation;
    if (!alreadyRecorded) {
      try {
        await discoveryState.recordVisit(mission.id, variation.id, this.draft);
        if (!this._alive || this._visit !== visit) return;
        this._completedSaved = true; this._completedApplied = true;
      }
      catch (error) { if (this._alive && this._visit === visit) { this._completedApplied = error.discoveryVisitApplied === true; this._showSaveFailure(error, () => this._complete(visit, error.discoveryVisitApplied === true)); } return; }
    }
    if (!this._alive || this._visit !== visit) return;
    await sleep(reduced() ? 180 : 650);
    if (!this._alive || this._visit !== visit) return;
    const panel = document.createElement("div");
    panel.className = "discovery-result";
    const picture = document.createElement("div");
    picture.className = "discovery-result-picture";
    picture.dataset.mission = mission.id;
    picture.dataset.variation = variation.id;
    picture.innerHTML = this._worldMarkup();
    const actions = document.createElement("div");
    actions.className = "discovery-result-actions";
    const replay = document.createElement("button");
    replay.type = "button";
    replay.className = "discovery-result-button discovery-replay tap";
    replay.setAttribute("aria-label", "replay with a change");
    replay.innerHTML = iconSVG("replay");
    this._tap(replay, () => {
      this._completing = false;
      this._loadMission(mission.id, discoveryState.chooseVariation(mission.id), null);
      speech.say("discovery_replay");
    });
    const another = this._pictureButton("discovery-result-button discovery-another tap", "choose another discovery", "activities", () => {
      this._completing = false;
      this._showPicker(false);
      speech.say("discovery_another");
    });
    actions.append(replay, another);
    panel.append(picture, actions);
    this.root.classList.add("discovery-result-mode");
    this.main.replaceChildren(panel);
    this._completing = false;
    this._markIdle("completion-ready");
  },

  async _launchBoat() {
    if (!this._alive || this._testingBuild || !discoveryCanLaunch(this.mission, this.variation, this.draft)) return;
    const boat = this.world?.querySelector(".discovery-built");
    const scene = this.world?.querySelector(".discovery-scene");
    const button = this.activity?.querySelector("[data-action=launch]");
    if (!boat || !scene || !button) return;

    const visit = this._visit;
    const token = {};
    this._launchToken = token;
    this._testingBuild = true;
    button.disabled = true;
    button.setAttribute("aria-pressed", "true");
    this._markEngaged("build-test", { missionId: this.mission.id, variationId: this.variation.id });

    const splash = document.createElement("span");
    splash.className = "discovery-launch-splash";
    splash.setAttribute("aria-hidden", "true");
    scene.appendChild(splash);
    this._launchSplash = splash;
    sfx.play("whoosh");

    if (reduced() || !boat.animate) {
      this.world.classList.add("is-launch-rest");
      await sleep(560);
    } else {
      const animation = boat.animate([
        { transform: "translate(0, 0) rotate(0deg)", offset: 0 },
        { transform: "translate(5%, -3px) rotate(-1deg)", offset: .18 },
        { transform: "translate(28%, -6px) rotate(1deg)", offset: .56 },
        { transform: "translate(21%, 1px) rotate(-.5deg)", offset: .78 },
        { transform: "translate(0, 0) rotate(0deg)", offset: 1 },
      ], { duration: 1400, easing: "cubic-bezier(.22,.61,.36,1)" });
      this._launchAnimation = animation;
      await animation.finished.catch(() => {});
    }

    if (!this._alive || this._visit !== visit || this._launchToken !== token) return;
    this._finishLaunch(token);
    this._markIdle("build-test-ready");
  },

  _finishLaunch(token = this._launchToken) {
    if (token && this._launchToken !== token) return;
    this._launchAnimation = null;
    this._launchToken = null;
    this._launchSplash?.remove();
    this._launchSplash = null;
    this.world?.classList.remove("is-launch-rest");
    const button = this.activity?.querySelector("[data-action=launch]");
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-pressed");
    }
    this._testingBuild = false;
  },

  _cancelLaunch(markIdle = false) {
    const wasTesting = !!this._testingBuild;
    this._launchToken = null;
    try { this._launchAnimation?.cancel(); } catch (_) {}
    this._launchAnimation = null;
    this._launchSplash?.remove();
    this._launchSplash = null;
    this.world?.classList.remove("is-launch-rest");
    const button = this.activity?.querySelector("[data-action=launch]");
    if (button) {
      button.disabled = false;
      button.removeAttribute("aria-pressed");
    }
    this._testingBuild = false;
    if (markIdle && wasTesting) this._markIdle("build-test-cancelled");
  },

  _cancelDemonstration(markIdle = false) {
    const demo = this._demo;
    this._demo = null;
    this._demonstrating = false;
    if (!demo) return;
    clearTimeout(demo.timer);
    try { demo.animation?.cancel(); } catch (_) {}
    demo.hand.remove();
    demo.finish?.();
    if (markIdle && this._alive) this._markIdle("demo-cancelled");
  },

  async _demonstrate() {
    if (!this._alive || this._demonstrating || !this.mission) return;
    this._demonstrating = true;
    const visit = this._visit;
    this._markEngaged("show-me", { missionId: this.mission.id });
    speech.say(this.mission.demoKey);
    const modeledChoice = this.mission.kind === "choice"
      ? this.variation?.options?.find((entry) => entry.correct === true)?.id
      : null;
    const source = (modeledChoice && Array.from(this.main.querySelectorAll(".discovery-choice"))
      .find((button) => button.dataset.option === modeledChoice))
      || this.main.querySelector(".discovery-choice, .discovery-piece");
    const target = this.main.querySelector(".discovery-target, .discovery-world");
    if (!source || !target) {
      this._demonstrating = false;
      this._markIdle("demo-unavailable");
      return;
    }
    const a = source.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const hand = document.createElement("img");
    hand.className = "discovery-demo-hand";
    hand.alt = "";
    hand.src = "assets/art/final/ui/hand.webp";
    hand.style.left = a.left + a.width / 2 + "px";
    hand.style.top = a.top + a.height / 2 + "px";
    document.body.appendChild(hand);
    const demo = { hand, animation: null, timer: null, finish: null };
    this._demo = demo;
    try {
      if (!reduced() && hand.animate) {
      demo.animation = hand.animate([
        { transform: "translate(-50%,-50%) scale(.9)", opacity: 0 },
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: .18 },
        { left: b.left + b.width / 2 + "px", top: b.top + b.height / 2 + "px", transform: "translate(-50%,-50%) scale(.86)", opacity: 1, offset: .82 },
        { left: b.left + b.width / 2 + "px", top: b.top + b.height / 2 + "px", transform: "translate(-50%,-50%) scale(.86)", opacity: 0 },
      ], { duration: 1500, easing: "cubic-bezier(.22,.61,.36,1)" });
      }
      await new Promise(resolve => {
        demo.finish = resolve;
        demo.timer = setTimeout(resolve, demo.animation ? 2000 : 500);
        if (demo.animation) Promise.resolve(demo.animation.finished).then(resolve, resolve);
      });
    } finally {
      // A canceled older demo must not clear a newer visit's busy state or hand.
      if (this._demo === demo) {
        this._cancelDemonstration();
        if (this._alive && visit === this._visit) this._markIdle("demo-ready");
      }
    }
  },

  _markEngaged(reason, detail = {}) {
    bus.emit("play:engaged", { activity: "discovery", reason, ...detail });
  },

  _markIdle(reason) {
    if (!this._alive || this.busy()) return;
    bus.emit("activity:idle", {
      activity: "discovery",
      reason,
      missionId: this.mission?.id || null,
      variationId: this.variation?.id || null,
    });
  },

  busy() {
    return !!(this._heldPointers?.size || this._checkpointing || this._drag || this._acting || this._testingBuild || this._demonstrating || this._completing);
  },

  _showSaveFailure(error, retry = null) {
    this._acting = false; this._completing = false;
    this._saveProblem = { error, retry };
    if (!this._activities) return;
    this._activities.hidden = false;
    this._activities.innerHTML = iconSVG("replay") + '<span>Retry save</span>';
    this._activities.setAttribute("aria-label", "retry keeping my Discovery play");
    const text = error?.code === "discovery-version" ? "This Discovery save needs a newer version. Your earlier play was not changed." : error?.code === "discovery-capacity" ? "Discovery storage is full. Your current play is still here. Ask a grown-up to keep a backup." : "Saving could not finish. Your current play is still here. Retry saving before leaving.";
    this._activities.setAttribute("aria-description", text); this._activities.title = text;
  },

  _clearSaveFailure(persistent = true) {
    this._saveProblem = null;
    if (!this._activities) return;
    this._activities.innerHTML = iconSVG("next") + `<span>${persistent ? "Activities" : "Temporary play"}</span>`;
    this._activities.setAttribute("aria-label", "back to activities, keeping current Discovery play");
    this._activities.setAttribute("aria-description", persistent ? "" : "This Discovery play is here while the app stays open. Ask a grown-up to keep a backup.");
  },

  async _checkpoint() {
    if (!this._alive) { await discoveryState.flushDiscoveryWrites(); return true; }
    if (this._heldPointers?.size || this._drag || this._acting || this._checkpointing) return false;
    const mount = this._mountVisit, visit = this._visit, retry = this._saveProblem?.retry;
    this._checkpointing = true;
    try {
      if (this.mission && this.variation && this.draft && !this._completedSaved && !this._completedApplied) await discoveryState.saveDraft(this.mission.id,this.variation.id,this.draft);
      const result = await discoveryState.checkpointDiscovery();
      await discoveryState.flushDiscoveryWrites();
      if (!this._alive || mount !== this._mountVisit || visit !== this._visit) return false;
      if (this._completedApplied) this._completedSaved = true;
      this._clearSaveFailure(result.persistent);
      return true;
    } catch (error) {
      if (this._alive && mount === this._mountVisit && visit === this._visit) this._showSaveFailure(error,retry);
      return false;
    } finally {
      if (this._alive && mount === this._mountVisit && visit === this._visit) this._checkpointing = false;
    }
  },

  async _retrySave() {
    const retry = this._saveProblem?.retry;
    if (!await this._checkpoint()) return false;
    if (retry) await retry();
    else if (this.mission) this._renderMission();
    return !this._saveProblem;
  },

  beforeLeave() { return this._checkpoint(); },
  beforeBreak() { return this._checkpoint(); },
  breakBusy() { return !!(this._heldPointers?.size || this._drag || this._acting || this._checkpointing); },

  onBack() {
    if (this._heldPointers?.size || this._acting || this._checkpointing) return;
    if (this.mission) {
      this._showPicker();
      return;
    }
    router.go("map", {}, { dir: "right" });
  },

  unmount() {
    this._stopPickerCue();
    this._pickerHelp?.(); this._pickerHelp = null;
    this._cancelLaunch();
    this._cancelDemonstration();
    this._alive = false;
    this._mountVisit = {};
    this._visit = null;
    this._drag = null;
    this.root?.removeEventListener('pointerdown',this._onInputDown,true); this.root?.removeEventListener('click',this._onInputClick,true);
    this.root?.removeEventListener('keydown',this._onPickerKey,true);
    window.removeEventListener('blur',this._onBlur); this._heldPointers?.clear();
    window.removeEventListener("pointermove", this._onDragMove, true);
    window.removeEventListener("pointerup", this._onDragEnd, true);
    window.removeEventListener("pointercancel", this._onDragEnd, true);
    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    this._onDragMove = null;
    this._onDragEnd = null;
    this._onVisibilityChange = null;
    for (const timer of this._timers) clearTimeout(timer);
    this._timers = [];
    document.querySelectorAll(".discovery-demo-hand").forEach((node) => node.remove());
    if (this.guide) this.guide.destroy();
    this.guide = null;
    if (this._mute && this._mute.destroy) this._mute.destroy();
    this._mute = null;
  },
};

const DISCOVERY_FAMILIES_LABELS = {
  shape: "shapes and places",
  sort: "matching and comparing",
  quantity: "small sets and patterns",
};

export default discovery;
