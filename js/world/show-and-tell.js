// Small optional overlay for saved Studio pictures, Storybook cards, and family murals.
// It owns only its own DOM listeners. Callers retain the saved preview beneath it.

import speech from "../audio/speech.js";
import {
  normaliseShowAndTellContext,
  promptsForShowAndTell,
  showAndTellPrompt,
} from "../data/show-and-tell.js";
import { SHOW_AND_TELL_INTRO_KEY } from "../data/show-and-tell-phrases.js";

const ICONS = Object.freeze({
  talk: '<path d="M12 15h40v29H29L18 53v-9h-6Z" fill="#fff7cc"/><circle cx="25" cy="30" r="3" fill="#725a4f"/><circle cx="32" cy="30" r="3" fill="#725a4f"/><circle cx="39" cy="30" r="3" fill="#725a4f"/>',
  find: '<circle cx="28" cy="28" r="15" fill="#d9f4ef"/><path d="m39 39 13 13"/><path d="M28 20v16M20 28h16"/>',
  palette: '<path d="M33 10C18 10 8 20 8 33c0 12 10 21 22 21 5 0 6-3 4-7-1-3 1-5 5-5h4c8 0 13-7 13-15C56 17 46 10 33 10Z" fill="#ffe17d"/><circle cx="20" cy="29" r="4" fill="#ef7ca0" stroke="none"/><circle cx="29" cy="19" r="4" fill="#8d7ada" stroke="none"/><circle cx="42" cy="23" r="4" fill="#64b7e4" stroke="none"/><circle cx="19" cy="42" r="4" fill="#6fc992" stroke="none"/>',
  move: '<path d="M17 17c9-8 21-8 30 0"/><path d="m42 10 7 7-8 6"/><path d="M47 47c-9 8-21 8-30 0"/><path d="m22 54-7-7 8-6"/><circle cx="32" cy="32" r="8" fill="#f5a9c1"/>',
  next: '<path d="M11 32h37"/><path d="m37 16 16 16-16 16" fill="#bdebd7"/>',
  trade: '<path d="M11 22h35l-7-8"/><path d="m53 42H18l7 8"/><path d="M46 22 39 14M18 42l7 8"/>',
  spark: '<path d="m32 8 5 17 17 5-17 5-5 17-5-17-17-5 17-5Z" fill="#ffd977"/><path d="m49 11 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" fill="#c5b1ec" stroke="none"/>',
  heart: '<path d="M32 53 11 34C-1 17 19 4 32 20 45 4 65 17 53 34Z" fill="#f596b1"/>',
  back: '<path d="M49 32H15"/><path d="m29 17-15 15 15 15" fill="#d9f4ef"/>',
  close: '<path d="m18 18 28 28M46 18 18 46"/>',
});

function icon(name) {
  const body = ICONS[name] || ICONS.talk;
  return `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function control(label, iconName, onClick, signal) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "show-and-tell__control tap";
  button.setAttribute("aria-label", label);
  button.innerHTML = icon(iconName);
  button.addEventListener("click", onClick, { signal });
  return button;
}

function copyPreview(preview) {
  if (!preview) return null;
  if (typeof preview === "string") {
    const image = document.createElement("img");
    image.src = preview;
    image.alt = "";
    return image;
  }
  return preview.nodeType ? preview.cloneNode(true) : null;
}

function resolveHost(host) {
  if (host && host.nodeType === 1) return host;
  return typeof document !== "undefined" ? document.getElementById("app") : null;
}

/**
 * Open one optional spoken/picture prompt at a time.
 * `preview` is optional. Without it, the compact card leaves the caller's existing
 * saved picture visible beneath and around the card.
 */
export function openShowAndTell({ host, context = "picture", preview = null, onClose = () => {} } = {}) {
  const target = resolveHost(host);
  if (!target || typeof document === "undefined") return { destroy() {}, busy: () => false };

  const prompts = promptsForShowAndTell(context);
  const cleanContext = normaliseShowAndTellContext(context);
  const controller = new AbortController();
  let destroyed = false;
  let index = 0;
  let transitioning = false;
  let narrationToken = 0;
  let latestNarrationKey = null;
  const restoreFocus = document.activeElement && document.activeElement.nodeType === 1
    ? document.activeElement : null;

  const root = document.createElement("aside");
  root.className = "show-and-tell";
  root.dataset.context = cleanContext;
  root.setAttribute("aria-label", "show and tell ideas");
  root.setAttribute("role", "region");

  const card = document.createElement("div");
  card.className = "show-and-tell__card";
  const suppliedPreview = copyPreview(preview);
  if (suppliedPreview) {
    const previewWrap = document.createElement("div");
    previewWrap.className = "show-and-tell__preview";
    previewWrap.setAttribute("aria-hidden", "true");
    previewWrap.appendChild(suppliedPreview);
    card.appendChild(previewWrap);
  }

  const prompt = document.createElement("div");
  prompt.className = "show-and-tell__prompt";
  prompt.setAttribute("aria-live", "polite");
  const art = document.createElement("span");
  art.className = "show-and-tell__art";
  const dots = document.createElement("span");
  dots.className = "show-and-tell__dots";
  dots.setAttribute("aria-hidden", "true");
  prompt.append(art, dots);

  const actions = document.createElement("div");
  actions.className = "show-and-tell__actions";

  function announce(key, { cancel = true } = {}) {
    if (destroyed || !key) return;
    const token = ++narrationToken;
    latestNarrationKey = key;
    if (cancel) speech.cancel();
    return Promise.resolve(speech.say(key)).then(() => {
      if (token === narrationToken) latestNarrationKey = null;
      return token === narrationToken && !destroyed;
    });
  }

  function render({ speak = true } = {}) {
    const current = showAndTellPrompt(cleanContext, index);
    if (!current) return;
    art.innerHTML = icon(current.icon);
    art.setAttribute("aria-label", current.label);
    dots.replaceChildren(...prompts.map((_, dotIndex) => {
      const dot = document.createElement("i");
      dot.className = "show-and-tell__dot" + (dotIndex === index ? " is-current" : "");
      return dot;
    }));
    back.disabled = index === 0;
    next.disabled = index >= prompts.length - 1;
    if (speak) announce(current.phraseKey);
  }

  function shift(delta) {
    if (transitioning) return;
    const nextIndex = Math.max(0, Math.min(prompts.length - 1, index + delta));
    if (nextIndex === index) return;
    transitioning = true;
    index = nextIndex;
    render();
    transitioning = false;
  }

  function destroy({ restore = true } = {}) {
    if (destroyed) return;
    // `speech` is shared by every screen. Only stop it when this card owns the
    // active line, or its newly queued line has not begun yet. A later screen's
    // narrator must remain untouched.
    const active = speech.lastResolution();
    const ownsActive = String(active.key || "").startsWith("show_and_tell_");
    const ownsPending = latestNarrationKey && (!active.key || active.key === latestNarrationKey);
    if (ownsActive || ownsPending) speech.cancel();
    destroyed = true;
    controller.abort();
    root.remove();
    if (restore && restoreFocus && restoreFocus.isConnected && typeof restoreFocus.focus === "function") {
      queueMicrotask(() => restoreFocus.focus({ preventScroll: true }));
    }
  }

  function close() {
    if (destroyed) return;
    destroy();
    onClose();
  }

  const back = control("previous show and tell idea", "back", () => shift(-1), controller.signal);
  const next = control("next show and tell idea", "next", () => shift(1), controller.signal);
  const closeButton = control("close show and tell", "close", close, controller.signal);
  actions.append(back, next, closeButton);
  card.append(prompt, actions);
  root.appendChild(card);
  target.appendChild(root);
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
  }, { signal: controller.signal });

  // A keyboard user lands on the always-available close control. This is not a
  // focus trap: the card is a non-modal region and background controls stay live.
  queueMicrotask(() => {
    if (!destroyed) closeButton.focus({ preventScroll: true });
  });

  // A short invitation establishes that this card is optional before the first idea.
  // The prompt is already visible, so close remains available while the introduction plays.
  render({ speak: false });
  void announce(SHOW_AND_TELL_INTRO_KEY).then((finished) => {
    if (!finished || destroyed) return;
    const current = showAndTellPrompt(cleanContext, index);
    if (current) announce(current.phraseKey, { cancel: false });
  });

  return { destroy, busy: () => !destroyed };
}

export default openShowAndTell;
