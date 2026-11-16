// gate.js - the way into the parent corner: hold both bottom corners for three seconds.
//
// Two invisible 96 px zones sit in the very bottom corners, above everything. One corner
// alone does nothing (a resting palm is safe). With both held, a lilac ring appears at each
// corner and fills over 3 s; letting go of either fades it away. No sound, ever: a toddler
// should never learn that this corner makes a noise.

const HOLD_MS = 3000;
const ZONE_PX = 96;
const RADIUS = 34;
const CIRC = 2 * Math.PI * RADIUS;

let rootEl = null;
let host = null;
let zones = [];
let rafId = 0;
let holdStart = 0;
let opened = false;
let onOpenFn = null;
const cleanups = [];
let entryEl = null;
let entryOwnsElement = false;
let challengeEl = null;
let entryChallenge = null;
const entryCleanups = [];

function ensureGateStyles() {
  if (typeof document === "undefined") return;
  const href = new URL("../../css/parent.css", import.meta.url).href;
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (link.href === href || /parent\.css(\?|$)/.test(link.getAttribute("href") || "")) return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

const CHALLENGES = [
  { question: "What is two plus three?", answer: "5", choices: ["4", "5", "6"] },
  { question: "What is one plus three?", answer: "4", choices: ["3", "4", "5"] },
  { question: "What is six minus two?", answer: "4", choices: ["3", "4", "5"] },
  { question: "What is three plus three?", answer: "6", choices: ["5", "6", "7"] },
];

/** Pure helper, exported so the adult check can be verified without a browser. */
export function createChallenge(random = Math.random) {
  const n = Number(random());
  const i = Number.isFinite(n) ? Math.max(0, Math.min(CHALLENGES.length - 1, Math.floor(n * CHALLENGES.length))) : 0;
  const c = CHALLENGES[i];
  return { question: c.question, answer: c.answer, choices: [...c.choices] };
}

export function checkAnswer(challenge, answer) {
  return !!challenge && String(answer) === String(challenge.answer);
}

function closeChallenge() {
  if (challengeEl && challengeEl.parentNode) challengeEl.parentNode.removeChild(challengeEl);
  challengeEl = null;
}

/** Dispose only the dialog owned by the leaving screen. */
export function dismissAdultChallenge(overlay) {
  if (overlay === challengeEl) closeChallenge();
  else overlay?.remove();
}

/** Show the short read-and-answer adult check. It never navigates on a wrong answer. */
export function showAdultChallenge(onPass) {
  ensureGateStyles();
  if (challengeEl?.isConnected) return challengeEl;
  closeChallenge();
  const challenge = createChallenge();
  const overlay = document.createElement("div");
  overlay.className = "rv-adult-gate";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "rv-adult-question");
  const panel = document.createElement("div");
  panel.className = "rv-adult-gate-card";
  const title = document.createElement("h2");
  title.textContent = "Grown-ups";
  const question = document.createElement("p");
  question.id = "rv-adult-question";
  question.textContent = challenge.question;
  const choices = document.createElement("div");
  choices.className = "rv-adult-choices";
  for (const choice of challenge.choices) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = choice;
    b.addEventListener("click", () => {
      if (!checkAnswer(challenge, choice)) {
        question.textContent = "Please try again. " + challenge.question;
        return;
      }
      closeChallenge();
      if (typeof onPass === "function") onPass();
    });
    choices.appendChild(b);
  }
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "rv-adult-cancel";
  cancel.textContent = "Back to the game";
  cancel.addEventListener("click", closeChallenge);
  panel.append(title, question, choices, cancel);
  overlay.appendChild(panel);
  // Repeated taps on the gear must not dismiss the freshly opened dialog.
  // Use the explicit Back button (or Escape) to cancel.
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeChallenge(); }
  });
  document.body.appendChild(overlay);
  challengeEl = overlay;
  const first = choices.querySelector("button");
  if (first) first.focus();
  return overlay;
}

function svgRing() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 80 80");
  svg.setAttribute("class", "rv-gate-ring");
  const track = document.createElementNS(NS, "circle");
  track.setAttribute("cx", "40"); track.setAttribute("cy", "40"); track.setAttribute("r", String(RADIUS));
  track.setAttribute("class", "rv-gate-track");
  const arc = document.createElementNS(NS, "circle");
  arc.setAttribute("cx", "40"); arc.setAttribute("cy", "40"); arc.setAttribute("r", String(RADIUS));
  arc.setAttribute("class", "rv-gate-arc");
  arc.setAttribute("transform", "rotate(-90 40 40)");
  arc.style.strokeDasharray = String(CIRC);
  arc.style.strokeDashoffset = String(CIRC);
  svg.appendChild(track);
  svg.appendChild(arc);
  return { svg, arc };
}

function makeZone(side) {
  const el = document.createElement("div");
  el.className = "rv-gate-zone rv-gate-" + side;
  el.setAttribute("aria-hidden", "true");
  el.style.width = ZONE_PX + "px";
  el.style.height = ZONE_PX + "px";
  const ring = svgRing();
  el.appendChild(ring.svg);
  return { el, arc: ring.arc, pointers: new Set(), side };
}

function bothHeld() { return zones.length === 2 && zones.every((z) => z.pointers.size > 0); }

function paint(p) {
  const clamped = Math.max(0, Math.min(1, p));
  for (const z of zones) {
    z.arc.style.strokeDashoffset = String(CIRC * (1 - clamped));
    z.el.classList.toggle("is-holding", clamped > 0);
  }
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function loop(t) {
  if (!bothHeld()) { reset(); return; }
  if (!holdStart) holdStart = t;
  const p = (t - holdStart) / HOLD_MS;
  paint(p);
  if (p >= 1) {
    stopLoop();
    reset();
    if (!opened && typeof onOpenFn === "function") {
      opened = true;
      try { showAdultChallenge(onOpenFn); } finally { setTimeout(() => { opened = false; }, 600); }
    }
    return;
  }
  rafId = requestAnimationFrame(loop);
}

function reset() {
  stopLoop();
  holdStart = 0;
  paint(0);
}

function onDown(z, e) {
  z.pointers.add(e.pointerId);
  try { z.el.setPointerCapture(e.pointerId); } catch (_) {}
  if (bothHeld() && !rafId) {
    holdStart = 0;
    rafId = requestAnimationFrame(loop);
  }
}

function onUp(z, e) {
  z.pointers.delete(e.pointerId);
  try { z.el.releasePointerCapture(e.pointerId); } catch (_) {}
  if (!bothHeld()) reset();
}

function clearAll() {
  for (const z of zones) z.pointers.clear();
  reset();
}

/** Mount the gate inside `rootEl`; `onOpen` runs when both corners have been held 3 s. */
export function installGate(el, onOpen) {
  uninstallGate();
  ensureGateStyles();
  rootEl = el || document.body;
  onOpenFn = onOpen;
  host = document.createElement("div");
  host.className = "rv-gate";
  zones = [makeZone("left"), makeZone("right")];
  for (const z of zones) {
    host.appendChild(z.el);
    const down = (e) => onDown(z, e);
    const up = (e) => onUp(z, e);
    z.el.addEventListener("pointerdown", down);
    z.el.addEventListener("pointerup", up);
    z.el.addEventListener("pointercancel", up);
    cleanups.push(() => {
      z.el.removeEventListener("pointerdown", down);
      z.el.removeEventListener("pointerup", up);
      z.el.removeEventListener("pointercancel", up);
    });
  }
  rootEl.appendChild(host);

  const winUp = (e) => { for (const z of zones) if (z.pointers.has(e.pointerId)) onUp(z, e); };
  const blur = () => clearAll();
  window.addEventListener("pointerup", winUp, true);
  window.addEventListener("pointercancel", winUp, true);
  window.addEventListener("blur", blur);
  cleanups.push(() => {
    window.removeEventListener("pointerup", winUp, true);
    window.removeEventListener("pointercancel", winUp, true);
    window.removeEventListener("blur", blur);
  });
  return host;
}

export function uninstallGate() {
  stopLoop();
  while (cleanups.length) { try { cleanups.pop()(); } catch (_) {} }
  if (host && host.parentNode) host.parentNode.removeChild(host);
  host = null;
  rootEl = null;
  zones = [];
  holdStart = 0;
  opened = false;
  onOpenFn = null;
}

/**
 * Install the discoverable one-pointer adult entry. `target` may be an existing
 * button placed by the shell, or a container that should receive the provided button.
 * A native click handles touch, mouse, pen and keyboard without hold timers.
 */
export function installParentEntry(target, onOpen, opts = {}) {
  uninstallParentEntry();
  ensureGateStyles();
  const suppliedButton = target && String(target.tagName || "").toLowerCase() === "button";
  entryEl = suppliedButton ? target : document.createElement("button");
  entryOwnsElement = !suppliedButton;
  entryEl.type = "button";
  entryEl.classList.add("rv-parent-entry");
  entryEl.classList.toggle("is-compact", opts.compact !== false);
  entryEl.setAttribute("aria-label", opts.label || "Grown-up settings");
  entryEl.setAttribute("aria-haspopup", "dialog");
  entryEl.title = "Open grown-up settings";
  entryEl.innerHTML = '<span aria-hidden="true">⚙</span><span class="rv-parent-entry-text">Grown-ups</span>';
  if (!suppliedButton) (target || document.body).appendChild(entryEl);

  const button = entryEl;
  const activate = () => { entryChallenge = showAdultChallenge(onOpen); };
  button.addEventListener("click", activate);
  entryCleanups.push(() => button.removeEventListener("click", activate));
  return entryEl;
}

export function uninstallParentEntry() {
  while (entryCleanups.length) { try { entryCleanups.pop()(); } catch (_) {} }
  if (entryOwnsElement && entryEl && entryEl.parentNode) entryEl.parentNode.removeChild(entryEl);
  if (entryEl) entryEl.classList.remove("is-compact");
  entryEl = null;
  entryOwnsElement = false;
  dismissAdultChallenge(entryChallenge);
  entryChallenge = null;
}

export const gate = {
  installGate, uninstallGate, installParentEntry, uninstallParentEntry,
  showAdultChallenge, createChallenge, checkAnswer, HOLD_MS, ZONE_PX,
};
export default gate;
