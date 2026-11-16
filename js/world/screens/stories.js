// Storybook: three child-authored picture choices, spoken reactions, and a local card.

import router, { homeButton, muteButton, tapify, iconSVG } from "../router.js";
import { addScenery } from "../scene.js";
import bus from "../bus.js";
import { installIdleHelp } from "../idle-help.js";
import session from "../../state/session.js";
import Character from "../characters.js";
import art from "../art.js";
import speech from "../../audio/speech.js";
import sfx from "../../audio/sfx.js";
import resume from "../../state/resume.js";
import settings from "../../state/settings.js";
import { openShowAndTell } from "../show-and-tell.js";
import storyState from "../../state/stories.js";
import { STORIES, getStory, choiceAt, choiceReaction, encounterPrompt, endingPhrase, drawingFallbackForStoryPicture, causalSceneState, CAUSAL_SCENE_ACTORS } from "../../data/stories.js";
import { drawingById, drawingSVG } from "../../data/drawings.js";

/** Quiet, equal invitation: a hint never chooses a story or answer for the child. */
export function showStoryIdleCue(targets, { delay = setTimeout, cancel = clearTimeout } = {}) {
  const shown = targets.filter(target => target && !target.disabled);
  if (!shown.length) return null;
  shown.forEach(target => target.classList.add("is-story-idle-cue"));
  let cleared = false;
  const clear = () => { if (cleared) return; cleared = true; shown.forEach(target => target.classList.remove("is-story-idle-cue")); };
  const timer = delay(clear, 2400);
  return () => { cancel(timer); clear(); };
}
export function startStoryIdleVoice(key, { voice = speech, muted = false } = {}) {
  if (!key || muted || !voice.isUnlocked()) return null;
  let owned = true;
  try { Promise.resolve(voice.say(key)).then(() => { owned = false; }, () => { owned = false; }); }
  catch { return null; }
  return () => { if (owned && voice.isSpeaking()) voice.cancel(); owned = false; };
}
export function storyIdleEligible(screen, { route, moving, locked, speaking } = {}) {
  return !!screen?._alive && route === "stories" && !moving && !locked && !speaking
    && !screen._busy && !screen._heldPointers?.size && !screen._saveProblem && !screen.showAndTell
    && (screen.mode === "library" || screen.mode === "story");
}

const PAGE_SIZE = 4;
const BOOK_PAGE_SIZE = 6;
const SHOW_AND_TELL_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 11h48v34H31L18 55V45H8Z" fill="#fff7cc" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M32 39 20 28c-7-9 6-17 12-8 6-9 19-1 12 8Z" fill="#f596b1" stroke="currentColor" stroke-width="3"/></svg>';

function reduced() {
  return document.documentElement.classList.contains("reduced-motion") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function imageFor(key, className) {
  const source = art.get(key);
  if (!source || !source.src) return null;
  const image = source.cloneNode();
  image.className = className;
  image.alt = "";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");
  return image;
}

function storySymbolSVG(id) {
  if (id === "name-card") return '<svg class="story-picture__svg" viewBox="0 0 120 100" aria-hidden="true"><rect x="9" y="16" width="102" height="70" rx="12" fill="#fff8d8" stroke="#4a3b34" stroke-width="5"/><path d="M18 25l42 32 42-32" fill="none" stroke="#e99ab7" stroke-width="5"/><text x="60" y="77" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="800" fill="#4a3b34">RAYNA</text></svg>';
  if (id === "stop-sign") return '<svg class="story-picture__svg" viewBox="0 0 120 120" aria-hidden="true"><path d="M42 8h36l26 26v36L78 96H42L16 70V34z" fill="#e85f67" stroke="#4a3b34" stroke-width="6"/><text x="60" y="61" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="900" fill="#fff">STOP</text><path d="M60 96v18" stroke="#4a3b34" stroke-width="7"/></svg>';
  if (id === "arrow-sign") return '<svg class="story-picture__svg" viewBox="0 0 120 120" aria-hidden="true"><path d="M18 25h55V12l32 27-32 27V53H18z" fill="#f6c56e" stroke="#4a3b34" stroke-width="6" stroke-linejoin="round"/><path d="M60 62v48" stroke="#4a3b34" stroke-width="8" stroke-linecap="round"/></svg>';
  return "";
}

function unavailablePictureSVG() {
  return '<svg class="story-picture__svg story-picture__unavailable" viewBox="0 0 120 100" aria-hidden="true"><rect x="10" y="10" width="100" height="80" rx="18" fill="#fffdf8" stroke="#8f817b" stroke-width="5" stroke-dasharray="7 7"/><path d="M38 55c0-15 9-25 23-25 12 0 21 7 21 18 0 8-5 13-12 17" fill="none" stroke="#8f817b" stroke-width="7" stroke-linecap="round"/><circle cx="65" cy="77" r="4" fill="#8f817b"/></svg>';
}

function pictureNode(spec, label = "picture", className = "story-picture") {
  const frame = document.createElement("span");
  frame.className = className;
  frame.dataset.pictureKind = spec && spec.kind || "unknown";
  frame.dataset.pictureId = spec && spec.id || "";
  frame.setAttribute("aria-hidden", "true");
  if (!spec) return frame;

  let image = null;
  if (spec.kind === "story") image = imageFor(`stories/${spec.id}`, "story-picture__image");
  else if (spec.kind === "character") image = imageFor(`characters/${spec.id}_idle`, "story-picture__image") || imageFor(`characters/${spec.id}`, "story-picture__image");
  else if (spec.kind === "drawing") image = imageFor(`stickers/draw_${spec.id}`, "story-picture__image");
  if (image) {
    frame.appendChild(image);
    frame.classList.add("has-image");
    return frame;
  }

  const storySymbol = spec.kind === "story" ? storySymbolSVG(spec.id) : "";
  if (storySymbol) {
    frame.innerHTML = storySymbol;
    frame.classList.add("has-svg");
    return frame;
  }

  // A generated Rabbit, Ribbon, Spoon, or other authored object may not turn
  // into an unrelated drawing. Only drawing specs may render drawing geometry.
  const fallbackId = drawingFallbackForStoryPicture(spec);
  const drawing = drawingById(fallbackId);
  if (drawing) {
    frame.innerHTML = drawingSVG(drawing, { className: "story-picture__svg", title: label });
    frame.classList.add("has-svg");
  } else {
    frame.innerHTML = unavailablePictureSVG();
    frame.classList.add("has-svg", "is-unavailable");
  }
  return frame;
}

function roundButton(label, icon, className, onTap) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `story-round tap ${className || ""}`;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon;
  return tapify(button, onTap);
}

function dots(index, total = 3) {
  const row = document.createElement("div");
  row.className = "story-dots";
  row.setAttribute("aria-hidden", "true");
  for (let i = 0; i < total; i++) {
    const dot = document.createElement("i");
    dot.className = i < index ? "is-done" : i === index ? "is-now" : "";
    row.appendChild(dot);
  }
  return row;
}

export const stories = {
  id: "stories",

  _tap(button, onTap, { page = true, recovery = false } = {}) {
    const mount = this._mountVisit, visit = this._visit;
    return tapify(button, event => {
      if (!this._alive || mount !== this._mountVisit || (page && visit !== this._visit) || !button.isConnected || this._busy || this._heldPointers?.size || (this._saveProblem && !recovery)) return;
      return onTap(event);
    });
  },

  _button(label, icon, className, onTap, options) {
    const button = roundButton(label, icon, className);
    return this._tap(button, onTap, options);
  },

  async mount(host, params = {}) {
    this._alive = true;
    this._mountVisit = {};
    this._visit = {};
    this._timers = [];
    this._busy = false;
    this._saveProblem = null;
    this._heldPointers = new Set();
    this._narrationToken = 0;
    this._idleVoiceUsed = false;
    this._libraryPage = Math.max(0, Math.min(1, Number(params.page) | 0));
    this._bookPage = Math.max(0, Number(params.bookPage) | 0);
    this.host = host;

    const root = document.createElement("div");
    root.className = "stories world-scene";
    root.innerHTML = '<main class="stories-main"></main>';
    host.appendChild(root);
    addScenery(root, "meadow", { foreground: false });
    root.appendChild(homeButton());
    this.mute = muteButton();
    root.appendChild(this.mute);
    const browse = this._button("choose a story", iconSVG("next"), "story-browse", () => {
      sfx.play("tap");
      this._showLibrary();
    }, { page: false });
    const browseLabel = document.createElement("span");
    browseLabel.textContent = "Stories";
    browseLabel.setAttribute("aria-hidden", "true");
    browse.appendChild(browseLabel);
    root.appendChild(browse);
    this.root = root;
    this.main = root.querySelector(".stories-main");

    this._pointerDown = event => this._heldPointers.add(event.pointerId);
    this._pointerUp = event => this._heldPointers.delete(event.pointerId);
    this._pointerReset = () => this._heldPointers.clear();
    root.addEventListener("pointerdown", this._pointerDown, true);
    window.addEventListener("pointerup", this._pointerUp);
    window.addEventListener("pointercancel", this._pointerUp);
    window.addEventListener("blur", this._pointerReset);
    this._idleHelp?.();
    this._idleHelp = installIdleHelp(root, {
      active: () => storyIdleEligible(this, { route: router.current(), moving: router.isMoving(),
        locked: session.isBreakLocked(), speaking: speech.isSpeaking() }),
      demonstrate: () => {
        const next = this.main.querySelector(".story-next");
        const targets = this.mode === "library" ? [...this.main.querySelectorAll(".story-cover")]
          : next ? [next] : [...this.main.querySelectorAll(".story-choice")];
        const visualStop = showStoryIdleCue(targets);
        const key = this.mode === "library" ? "story_ui_choose"
          : next?.getAttribute("aria-label") === "turn the page" ? "story_ui_next" : null;
        const voiceStop = visualStop && !this._idleVoiceUsed ? startStoryIdleVoice(key, { muted: settings.get().muted }) : null;
        if (voiceStop) this._idleVoiceUsed = true;
        const stop = () => { visualStop?.(); voiceStop?.(); };
        this._idleCueStop = stop;
        return () => { stop(); if (this._idleCueStop === stop) this._idleCueStop = null; };
      },
    });
    const mount = this._mountVisit;
    try {
      await storyState.load();
      if (!this._alive || mount !== this._mountVisit) return;
      return this._openEntry(params);
    } catch (error) {
      if (this._alive && mount === this._mountVisit) this._showProblem(error, () => this._openEntry(params), { reading: true });
    }
  },

  _openEntry(params = {}) {
    const saved = storyState.get();
    if (params.view === "book") this._showBook();
    else if (getStory(params.storyId)) return this._start(params.storyId, !!params.fresh);
    else {
      // Browsing and reloading the shelf never force an unfinished story open.
      // Explicit saved storyId links still resume the exact in-progress beat.
      if (params.page == null && saved.draft) {
        this._libraryPage = Math.max(0, Math.floor(STORIES.findIndex(item => item.id === saved.draft.storyId) / PAGE_SIZE));
      }
      this._showLibrary();
    }
  },

  _say(key) {
    if (!key || !this._alive) return Promise.resolve();
    this._lastPhrase = key;
    return speech.say(key);
  },

  _stopNarration() {
    this._idleCueStop?.(); this._idleCueStop = null;
    this._narrationToken++;
    // A new page also retires pending saves/reactions from the previous page.
    this._visit = {};
    speech.cancel();
    this._restoreRetellScene();
  },

  _restoreRetellScene() {
    const active = this._retellScene;
    this._retellScene = null;
    if (!active?.scene?.isConnected) return;
    active.props.forEach((prop) => prop?.classList.remove("is-retell-hidden"));
    active.scene.classList.remove("is-retelling", "is-scene-acting");
    this._applySceneState(active.scene, active.item, active.card.choices);
  },

  _destroyShowAndTell() {
    if (this.showAndTell) this.showAndTell.destroy();
    this.showAndTell = null;
    this.root?.classList.remove("has-show-and-tell");
  },

  _openShowAndTell(card) {
    if (this._busy || this.showAndTell || this.mode !== "complete") return;
    this._busy = true;
    this.root.classList.add("has-show-and-tell");
    const controls = [...this.main.querySelectorAll(".story-complete__controls button")];
    const disabledBefore = new Map(controls.map((button) => [button, button.disabled]));
    controls.forEach((button) => { button.disabled = true; });
    this.showAndTell = openShowAndTell({
      host: this.root,
      context: "story",
      preview: this._cardNode(card, true),
      onClose: () => {
        this.showAndTell = null;
        this.root?.classList.remove("has-show-and-tell");
        disabledBefore.forEach((disabled, button) => {
          if (button.isConnected) button.disabled = disabled;
        });
        if (this._alive && this.mode === "complete") this._markIdle("show-and-tell-close");
      },
    });
  },

  _markIdle(reason) {
    this._busy = false;
    bus.emit("activity:idle", { activity: "stories", reason, storyId: this.story?.id || null });
  },

  _repeatButton(onRepeat = null) {
    return this._button("hear that again", iconSVG("play"), "story-repeat", () => {
      if (this._busy) return;
      sfx.play("tap");
      if (onRepeat) onRepeat();
      else if (this._lastPhrase) this._say(this._lastPhrase);
    });
  },

  async _waitForMotion(nodes) {
    if (reduced()) return;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const animations = nodes.flatMap((node) => node && typeof node.getAnimations === "function" ? node.getAnimations() : []);
    await Promise.allSettled(animations.map((animation) => animation.finished));
  },

  _replayMotion(node) {
    if (!node) return;
    node.classList.remove("is-replaying");
    void node.offsetWidth;
    node.classList.add("is-replaying");
  },

  _replayCausalBeat(node, index) {
    const scene = node?.closest?.(".story-world");
    const draft = storyState.get().draft;
    if (!scene || !this.story || !CAUSAL_SCENE_ACTORS[this.story.id] || draft?.storyId !== this.story.id) return [];
    if (this.story.id === "moon-tune" && index === 2) sfx.play("chime");
    return this._applySceneState(scene, this.story, draft.choices, { animateBeat: index });
  },

  _appendCausalActors(container, item) {
    const actors = CAUSAL_SCENE_ACTORS[item?.id];
    if (!container || !actors) return false;
    container.classList.add("has-causal-scene");
    for (const actor of actors) {
      const node = document.createElement("span");
      node.className = "story-actor";
      node.dataset.actorId = actor.id;
      node.setAttribute("aria-hidden", "true");
      node.appendChild(pictureNode(actor.picture, actor.label));
      container.appendChild(node);
    }
    return true;
  },

  _applySceneState(container, item, choices, { animateStar = false, animateBeat = -1 } = {}) {
    if (!container || !item) return [];
    container.dataset.storyPlace = choices[1] || "";
    container.dataset.storyEnding = choices[2] || "";
    const causal = causalSceneState(item, choices);
    if (causal) {
      container.dataset.storyBeat = String(causal.beat);
      container.dataset.storyPhase = causal.phase;
      if (item.id === "name-mail") {
        container.dataset.storyMarker = causal.marker;
        container.dataset.storyRoute = causal.route;
        container.dataset.storyDelivery = causal.delivery;
        container.dataset.mailboxTransfer = causal.mailboxTransfer ? "true" : "false";
      } else if (item.id === "valley-signs") {
        container.dataset.storySign = causal.sign;
        container.dataset.storyDestination = causal.destination;
        container.dataset.storyFriend = causal.friend;
      } else if (item.id === "rayna-rainy-r") {
        container.dataset.storyCompanion = causal.companion;
        container.dataset.storyFound = causal.found;
        container.dataset.storyPlace = causal.place;
      } else if (item.id === "pip-bouncy-b") {
        container.dataset.storyPassenger = causal.passenger;
        container.dataset.storyRide = causal.ride;
        container.dataset.storyFinish = causal.finish;
        container.dataset.passengerLoaded = causal.passengerLoaded ? "true" : "false";
        if (causal.ride !== "boat") container.querySelector(".story-boat-hull")?.remove();
        // Keep the passenger in front of the sail but behind the hull. Reuse
        // the original illustration; the clipped foreground is not a new toy.
        if (causal.ride === "boat" && !container.querySelector(".story-boat-hull")) {
          const ride = container.querySelector('.story-prop[data-choice-id="boat"]');
          if (ride) {
            const hull = document.createElement("span");
            hull.className = "story-prop story-boat-hull";
            hull.dataset.slot = "1";
            hull.setAttribute("aria-hidden", "true");
            hull.appendChild(ride.firstElementChild.cloneNode(true));
            ride.parentNode.appendChild(hull);
          }
        }
      } else if (item.id === "cat-hat-picnic") {
        container.dataset.storyPicnicStart = causal.picnicStart;
        container.dataset.storySound = causal.sound;
        container.dataset.storyFinish = causal.finish;
      } else if (item.id === "moon-tune") {
        container.dataset.storyFriend = causal.friend;
        container.dataset.storyPlace = causal.place;
        container.dataset.storyFinale = causal.finale;
      } else {
        container.dataset.storyLeadChoice = causal.lead;
        container.dataset.storyNearby = causal.nearby;
        container.dataset.storyPlace = causal.place;
      }
      if (animateBeat >= 0 && !reduced()) {
        container.classList.remove("is-scene-acting");
        container.dataset.actingBeat = String(animateBeat + 1);
        void container.offsetWidth;
        container.classList.add("is-scene-acting");
      } else {
        container.classList.remove("is-scene-acting");
        delete container.dataset.actingBeat;
      }
      return animateBeat >= 0 ? [...container.querySelectorAll(".story-actor, .story-prop")] : [];
    }
    if (item.id !== "lost-star") return [];
    const star = container.querySelector('.story-lead[data-lead-id="star"]');
    const home = choices.length >= 3;
    star?.classList.toggle("is-home", home);
    if (star && home && animateStar && !reduced()) {
      star.classList.remove("is-lifting");
      void star.offsetWidth;
      star.classList.add("is-lifting");
    }
    return star ? [star] : [];
  },

  async _retell(card) {
    const item = card && getStory(card.storyId);
    if (!item || !this._alive || this._busy) return;
    this._stopNarration();
    const token = this._narrationToken;
    this._busy = true;
    const scene = this.main.querySelector(".story-keepsake--large .story-keepsake__scene");
    const props = card.choices.map((id) => scene?.querySelector(`.story-prop[data-choice-id="${id}"]`));
    const star = scene?.querySelector('.story-lead[data-lead-id="star"]');
    if (item.id === "lost-star" && scene) {
      scene.classList.add("is-retelling");
      scene.dataset.storyPlace = "";
      scene.dataset.storyEnding = "";
      star?.classList.remove("is-home", "is-lifting");
      props.forEach((prop) => prop?.classList.add("is-retell-hidden"));
      this._retellScene = { scene, props, item, card };
    }
    const causal = causalSceneState(item, card.choices);
    if (causal && scene) {
      scene.classList.add("is-retelling");
      const cozyLead = item.id === "cozy-c-sounds";
      props.forEach((prop, index) => prop?.classList.toggle("is-retell-hidden", !(cozyLead && index === 0)));
      this._applySceneState(scene, item, cozyLead ? card.choices.slice(0, 1) : []);
      this._retellScene = { scene, props, item, card };
    }
    const keys = card.choices.map((id, index) => choiceReaction(item, index, id, card.choices)).filter(Boolean);
    for (let index = 0; index < keys.length; index++) {
      if (!this._alive || token !== this._narrationToken || this.mode !== "complete") return;
      const prop = props[index];
      prop?.classList.remove("is-retell-hidden");
      this._replayMotion(prop);
      if (item.id === "lost-star" && scene && index === 1) scene.dataset.storyPlace = card.choices[1];
      const moving = [prop];
      if (causal && scene) moving.push(...this._applySceneState(scene, item, card.choices.slice(0, index + 1), { animateBeat: index }));
      if (item.id === "moon-tune" && index === 2) sfx.play("chime");
      if (item.id === "lost-star" && scene && index === 2) {
        scene.dataset.storyEnding = card.choices[2];
        moving.push(...this._applySceneState(scene, item, card.choices, { animateStar: true }));
      }
      await Promise.all([this._say(keys[index]), this._waitForMotion(moving)]);
    }
    if (this._alive && token === this._narrationToken && this.mode === "complete") {
      await this._say(card.endingKey || endingPhrase(item, card.choices));
      scene?.classList.remove("is-retelling");
      if (this._retellScene?.scene === scene) this._retellScene = null;
    }
    if (this._alive && token === this._narrationToken && this.mode === "complete") this._markIdle("retell");
  },

  _bookButton() {
    return this._button("open my storybook", iconSVG("book"), "story-book-button", () => {
      sfx.play("chime");
      this._bookPage = 0;
      this._showBook();
    });
  },

  _showLibrary() {
    if (this.story) this._libraryPage = Math.max(0, Math.floor(STORIES.indexOf(this.story) / PAGE_SIZE));
    this._destroyShowAndTell();
    this._stopNarration();
    this._destroyCharacter();
    this._busy = true;
    this.mode = "library";
    this.story = null;
    this.root.dataset.storyMode = "library";
    this.main.replaceChildren();
    const shell = document.createElement("section");
    shell.className = "story-library card";
    shell.appendChild(dots(this._libraryPage, 2));

    const grid = document.createElement("div");
    grid.className = "story-library__grid";
    const start = this._libraryPage * PAGE_SIZE;
    const saved = storyState.get();
    for (const item of STORIES.slice(start, start + PAGE_SIZE)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "story-cover tap";
      button.setAttribute("aria-label", item.label);
      const pictures = document.createElement("span");
      pictures.className = "story-cover__scene story-cover__pictures";
      pictures.dataset.storyId = item.id;
      for (const spec of item.cover.slice(0, 3)) pictures.appendChild(pictureNode(spec, item.label, "story-cover__picture"));
      button.appendChild(pictures);
      const draft = saved.drafts?.[item.id] || (saved.draft?.storyId === item.id ? saved.draft : null);
      if (draft?.choices.length) {
        button.classList.add("has-draft");
        button.setAttribute("aria-description", `Continue from picture ${Math.min(draft.choices.length + 1, item.encounters.length)} of ${item.encounters.length}`);
        const bookmark = document.createElement("span");
        bookmark.className = "story-cover__continue";
        bookmark.innerHTML = iconSVG("play");
        const label = document.createElement("span");
        label.textContent = "Continue";
        bookmark.appendChild(label);
        bookmark.setAttribute("aria-hidden", "true");
        button.appendChild(bookmark);
      }
      this._tap(button, () => this._start(item.id, false));
      grid.appendChild(button);
    }
    shell.appendChild(grid);

    const tools = document.createElement("div");
    tools.className = "story-library__tools";
    tools.append(
      this._button(this._libraryPage ? "previous story pictures" : "more story pictures", iconSVG(this._libraryPage ? "replay" : "next"), "story-page", () => {
        sfx.play("tap");
        this._libraryPage = this._libraryPage ? 0 : 1;
        this._showLibrary();
      }),
      this._bookButton(),
      this._repeatButton(),
    );
    shell.appendChild(tools);
    this.main.appendChild(shell);
    resume.save({ screen: "stories", params: { view: "library", page: this._libraryPage } });
    this._say("story_ui_choose");
    this._markIdle("library");
  },

  async _start(storyId, fresh) {
    const item = getStory(storyId);
    if (!item || !this._alive || this._busy || this._heldPointers?.size) return;
    this._destroyShowAndTell();
    this._stopNarration();
    this._destroyCharacter();
    this._busy = true;
    this.mode = "story";
    this.story = item;
    this.root.dataset.storyMode = "story";
    const visit = this._visit;
    try {
      await storyState.beginStory(item.id, { fresh });
    } catch (error) {
      if (this._alive && this._visit === visit) this._showProblem(error, () => this._renderBeat(true));
      return;
    }
    if (!this._alive || this._visit !== visit || this.story !== item) return;
    const draft = storyState.get().draft;
    if (draft && draft.choices.length >= item.encounters.length) {
      let card;
      try { card = await storyState.finishStory(item.id); }
      catch (error) { if (this._alive && this._visit === visit) this._showProblem(error, () => this._next()); return; }
      if (card && this._alive && this._visit === visit) return this._showComplete(card);
      return;
    }
    this._renderBeat(true);
  },

  _propNode(option, index, interactive = true, reactionKey = option.reactionKey) {
    const node = document.createElement(interactive ? "button" : "span");
    if (interactive) node.type = "button";
    node.className = `story-prop motion-${option.motion || "pop"} zone-${option.zone || "ground"}`;
    node.dataset.slot = String(index);
    node.dataset.choiceId = option.id;
    if (interactive) {
      node.setAttribute("aria-label", `play with ${option.label}`);
      this._tap(node, () => {
        if (!this._alive || this._busy) return;
        this._replayMotion(node);
        this._replayCausalBeat(node, index);
        this._say(reactionKey);
      });
    } else node.setAttribute("aria-hidden", "true");
    node.appendChild(pictureNode(option.picture, option.label));
    return node;
  },

  _addProp(option, index, animate = true, reactionKey = option.reactionKey) {
    const layer = this.main.querySelector(".story-props");
    if (!layer) return null;
    const prop = this._propNode(option, index, true, reactionKey);
    if (animate) prop.classList.add("is-arriving", "is-replaying");
    layer.appendChild(prop);
    return prop;
  },

  _buildStoryShell(index, choices) {
    this.main.replaceChildren();
    const shell = document.createElement("section");
    shell.className = "story-stage card";
    shell.dataset.storyId = this.story.id;
    shell.dataset.storyPath = choices.length ? (choiceAt(this.story, 0, choices[0])?.path || "") : "";

    const world = document.createElement("div");
    world.className = "story-world";
    world.dataset.storyId = this.story.id;
    const causal = !!CAUSAL_SCENE_ACTORS[this.story.id];
    let sceneLayer = world;
    if (causal) {
      sceneLayer = document.createElement("div");
      sceneLayer.className = "story-causal-plane";
      world.appendChild(sceneLayer);
      this._appendCausalActors(sceneLayer, this.story);
      world.classList.add("has-causal-scene");
    } else {
      const host = document.createElement("div");
      host.className = "story-host";
      world.appendChild(host);
      this.character = new Character(host, { name: this.story.host, state: "idle", follow: false, art: true });
    }

    const props = document.createElement("div");
    props.className = "story-props";
    sceneLayer.appendChild(props);
    if (this.story.lead && !causal) {
      world.classList.add("has-lead");
      const lead = document.createElement("span");
      lead.className = "story-lead";
      lead.dataset.leadId = this.story.lead.id;
      lead.setAttribute("aria-hidden", "true");
      lead.appendChild(pictureNode(this.story.lead, this.story.label));
      world.appendChild(lead);
    }
    for (let i = 0; i < choices.length; i++) {
      const selected = choiceAt(this.story, i, choices[i]);
      if (selected) props.appendChild(this._propNode(selected, i, true, choiceReaction(this.story, i, choices[i], choices)));
    }
    this._applySceneState(world, this.story, choices);
    shell.append(world, dots(index, this.story.encounters.length));

    const repeat = this._repeatButton();
    shell.appendChild(repeat);
    this.main.appendChild(shell);
    return { shell, world };
  },

  _renderBeat(firstRender = false) {
    this._destroyShowAndTell();
    const draft = storyState.get().draft;
    if (!this._alive || !draft || !this.story || draft.storyId !== this.story.id) return;
    const index = draft.choices.length;
    const beat = this.story.encounters[index];
    if (!beat) return;
    this._stopNarration();
    this._destroyCharacter();
    this.mode = "story";
    const { shell } = this._buildStoryShell(index, draft.choices);
    shell.dataset.encounterId = beat.id;
    const choices = document.createElement("div");
    choices.className = "story-choices";
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", `picture choice ${index + 1} of ${this.story.encounters.length}`);
    for (const option of beat.choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "story-choice tap";
      button.dataset.choiceId = option.id;
      button.setAttribute("aria-label", option.label);
      button.appendChild(pictureNode(option.picture, option.label));
      this._tap(button, () => this._choose(option, button, choices));
      choices.appendChild(button);
    }
    shell.appendChild(choices);
    const key = encounterPrompt(this.story, index, draft.choices);
    resume.save({ screen: "stories", params: { storyId: this.story.id, resume: true } });
    if (firstRender && index === 0) {
      const token = this._narrationToken;
      this._say(this.story.introKey).then(() => {
        if (this._alive && token === this._narrationToken && this.story && this.mode === "story" && storyState.get().draft?.choices.length === 0) this._say(key);
      });
    } else this._say(key);
    this._markIdle("beat-ready");
  },

  async _choose(option, button, group) {
    if (!this._alive || this._busy || this._heldPointers?.size || !button.isConnected || !group.isConnected || !this.story || this.mode !== "story") return;
    this._busy = true;
    bus.emit("play:engaged", { activity: "stories", storyId: this.story.id, choiceId: option.id });
    const visit = this._visit;
    const index = storyState.get().draft?.choices.length || 0;
    [...group.children].forEach((entry) => { entry.disabled = true; });
    button.classList.add("is-chosen");
    sfx.play("chime");
    let draft;
    try { draft = await storyState.recordStoryChoice(this.story.id, option.id); }
    catch (error) { if (this._alive && this._visit === visit) this._showProblem(error, () => this._renderRecoveredChoice()); return; }
    if (!this._alive || this._visit !== visit) return;
    if (!draft) {
      [...group.children].forEach((entry) => { entry.disabled = false; });
      button.classList.remove("is-chosen");
      this._markIdle("choice-not-saved");
      return;
    }
    this.character?.set("happy");
    this.character?.bounce();
    const reactionKey = choiceReaction(this.story, index, option.id, draft.choices);
    const spoken = this._say(reactionKey);
    const prop = this._addProp(option, index, true, reactionKey);
    const moving = [prop, ...this._applySceneState(this.main.querySelector(".story-world"), this.story, draft.choices, { animateStar: index === 2, animateBeat: index })];
    await Promise.all([spoken, this._waitForMotion(moving)]);
    if (!this._alive || this._visit !== visit) return;
    const next = this._button(index + 1 >= this.story.encounters.length ? "save my story" : "turn the page", iconSVG(index + 1 >= this.story.encounters.length ? "heart" : "next"), "story-next glow", () => this._next());
    this.main.querySelector(".story-stage")?.appendChild(next);
    this._markIdle("choice-settled");
  },

  async _next() {
    if (!this._alive || this._busy || this._heldPointers?.size || !this.story) return;
    this._busy = true;
    sfx.play("tap");
    const draft = storyState.get().draft;
    if (!draft || draft.storyId !== this.story.id) {
      this._markIdle("missing-draft");
      return;
    }
    if (draft.choices.length < this.story.encounters.length) {
      this._renderBeat(false);
      return;
    }
    const visit = this._visit;
    let card;
    try { card = await storyState.finishStory(this.story.id); }
    catch (error) { if (this._alive && this._visit === visit) this._showProblem(error, () => this._next()); return; }
    if (!card || !this._alive || this._visit !== visit) {
      if (this._alive && this._visit === visit) this._markIdle("finish-failed");
      return;
    }
    this._showComplete(card, true);
  },

  _cardNode(card, large = false) {
    const item = getStory(card.storyId);
    const node = document.createElement("article");
    node.className = "story-keepsake" + (large ? " story-keepsake--large" : "");
    node.dataset.storyId = item?.id || "";
    const pictures = document.createElement("div");
    pictures.className = "story-keepsake__scene";
    pictures.dataset.storyId = item?.id || "";
    const causal = item && CAUSAL_SCENE_ACTORS[item.id];
    let sceneLayer = pictures;
    if (causal) {
      sceneLayer = document.createElement("div");
      sceneLayer.className = "story-causal-plane";
      pictures.appendChild(sceneLayer);
      this._appendCausalActors(sceneLayer, item);
      pictures.classList.add("has-causal-scene");
    }
    if (item?.lead && !causal) {
      pictures.classList.add("has-lead");
      const lead = document.createElement("span");
      lead.className = "story-lead";
      lead.dataset.leadId = item.lead.id;
      lead.setAttribute("aria-hidden", "true");
      lead.appendChild(pictureNode(item.lead, item.label));
      pictures.appendChild(lead);
    }
    if (item) card.choices.forEach((id, index) => {
      const selected = choiceAt(item, index, id);
      if (selected) sceneLayer.appendChild(this._propNode(selected, index, false, choiceReaction(item, index, id, card.choices)));
    });
    if (item) this._applySceneState(pictures, item, card.choices);
    node.append(pictures, dots(3, 3));
    return node;
  },

  _showComplete(card, newlySaved = false) {
    this._destroyShowAndTell();
    this._stopNarration();
    this._destroyCharacter();
    const item = getStory(card && card.storyId);
    if (!item) return this._showLibrary();
    this.story = item;
    this.mode = "complete";
    this.root.dataset.storyMode = "complete";
    this.main.replaceChildren();
    const shell = document.createElement("section");
    shell.className = "story-complete card";
    shell.appendChild(this._cardNode(card, true));
    const controls = document.createElement("div");
    controls.className = "story-complete__controls";
    const done = this._button("back to the valley", iconSVG("home"), "story-done", () => router.go("map", {}, { dir: "right" }));
    const actions = document.createElement("div");
    actions.className = "story-complete__actions";
    actions.append(
      this._button("tell this story a new way", iconSVG("replay"), "story-replay", () => this._start(item.id, true)),
      this._bookButton(),
      this._repeatButton(() => this._retell(card)),
      this._button("show and tell this story", SHOW_AND_TELL_ICON, "story-show-and-tell", () => this._openShowAndTell(card)),
    );
    actions.appendChild(this._button("change the ending", iconSVG("next"), "story-change-ending", () => this._changeEnding(card)));
    if (item.extension && settings.isActivityEnabled(item.extension.route)) {
      const extension = document.createElement("button");
      extension.type = "button";
      extension.className = "story-extension tap";
      extension.setAttribute("aria-label", item.extension.label);
      extension.appendChild(pictureNode(item.extension.picture, item.extension.label));
      this._tap(extension, () => router.go(item.extension.route, item.extension.params, { dir: "left" }));
      actions.appendChild(extension);
    }
    controls.append(done, actions);
    shell.appendChild(controls);
    this.main.appendChild(shell);
    resume.save({ screen: "stories", params: { view: "book" } });
    const token = this._narrationToken;
    if (newlySaved) this._say("story_ui_saved").then(() => {
      if (this._alive && token === this._narrationToken && this.mode === "complete") this._say(card.endingKey);
    });
    else this._say(card.endingKey || endingPhrase(item, card.choices));
    this._markIdle("complete");
  },

  async _changeEnding(card) {
    if (this._busy || !card || !getStory(card.storyId)) return;
    this._stopNarration();
    this._busy = true;
    const visit = this._visit;
    let draft;
    try { draft = await storyState.reviseStoryCard(card.id, 2); }
    catch (error) { if (this._alive && this._visit === visit) this._showProblem(error, () => { this.story = getStory(card.storyId); this.mode = "story"; this.root.dataset.storyMode = "story"; this._renderBeat(false); }); return; }
    if (!draft || !this._alive || this._visit !== visit) {
      if (this._alive && this._visit === visit) this._markIdle("revise-failed");
      return;
    }
    this.story = getStory(card.storyId);
    this.mode = "story";
    this.root.dataset.storyMode = "story";
    this._renderBeat(false);
  },

  _showBook() {
    this._destroyShowAndTell();
    this._stopNarration();
    this._busy = true;
    this._destroyCharacter();
    this.mode = "book";
    this.story = null;
    this.root.dataset.storyMode = "book";
    this.main.replaceChildren();
    const shell = document.createElement("section");
    shell.className = "story-book card";
    const rows = storyState.get().book;
    const totalPages = Math.max(1, Math.ceil(rows.length / BOOK_PAGE_SIZE));
    this._bookPage = Math.max(0, Math.min(totalPages - 1, this._bookPage | 0));
    if (rows.length) {
      const grid = document.createElement("div");
      grid.className = "story-book__grid";
      const start = this._bookPage * BOOK_PAGE_SIZE;
      for (const card of rows.slice(start, start + BOOK_PAGE_SIZE)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "story-book__card tap";
        button.setAttribute("aria-label", `open ${getStory(card.storyId)?.label || "saved story"}`);
        button.appendChild(this._cardNode(card));
        this._tap(button, () => this._showComplete(card, false));
        grid.appendChild(button);
      }
      shell.appendChild(grid);
    } else {
      const empty = document.createElement("div");
      empty.className = "story-book__empty";
      empty.append(pictureNode({ kind: "drawing", id: "star" }), pictureNode({ kind: "drawing", id: "heart" }));
      shell.appendChild(empty);
    }
    const actions = document.createElement("div");
    actions.className = "story-book__actions";
    if (totalPages > 1) {
      const previous = this._button("previous saved stories", iconSVG("replay"), "story-book-previous", () => {
        if (this._bookPage <= 0) return;
        this._bookPage--;
        this._showBook();
      });
      previous.disabled = this._bookPage === 0;
      const next = this._button("next saved stories", iconSVG("next"), "story-book-next", () => {
        if (this._bookPage >= totalPages - 1) return;
        this._bookPage++;
        this._showBook();
      });
      next.disabled = this._bookPage >= totalPages - 1;
      actions.append(previous, dots(this._bookPage, totalPages), next);
    }
    actions.append(
      this._button("choose a story", iconSVG("book"), "story-library-button", () => this._showLibrary()),
      this._repeatButton(),
    );
    shell.appendChild(actions);
    this.main.appendChild(shell);
    resume.save({ screen: "stories", params: { view: "book", bookPage: this._bookPage } });
    this._say(rows.length ? "story_ui_book" : "story_ui_empty_book");
    this._markIdle("book");
  },

  _destroyCharacter() {
    if (this.character) this.character.destroy();
    this.character = null;
  },

  _renderRecoveredChoice() {
    const draft = storyState.get().draft;
    if (!draft || draft.storyId !== this.story?.id || !draft.choices.length) return this._renderBeat(false);
    this._stopNarration();
    this._destroyCharacter();
    const index = draft.choices.length - 1;
    const { shell } = this._buildStoryShell(index, draft.choices);
    shell.appendChild(this._button(draft.choices.length >= this.story.encounters.length ? "save my story" : "turn the page", iconSVG(draft.choices.length >= this.story.encounters.length ? "heart" : "next"), "story-next glow", () => this._next()));
    this._markIdle("choice-recovered");
  },

  _showProblem(error, continueAfterRetry = null, { reading = false } = {}) {
    this._problemPanel?.remove();
    this._busy = false;
    const problem = { error, continueAfterRetry, reading };
    this._saveProblem = problem;
    const panel = document.createElement("section"); panel.className = "story-save-problem";
    panel.setAttribute("role", "status"); panel.setAttribute("aria-live", "polite");
    const message = document.createElement("p");
    message.textContent = reading ? "Your storybook could not be opened. Your saved stories have not been changed. Try again." : error?.code === "story-version" ? "This storybook needs a newer version. Your kept storybook has not been changed." : error?.code === "story-capacity" ? "Your story choices are still here. The storybook is full. Ask a grown-up to keep a backup." : "Your story choices are still here. Saving could not finish. Try again.";
    panel.append(message, this._button(reading ? "try opening my storybook again" : "retry saving my story choices", iconSVG("replay"), "story-retry", () => this._retryCheckpoint(problem), { recovery: true }));
    this._problemPanel = panel; this.root.classList.add("has-save-problem"); this.root.append(panel);
  },

  async _retryCheckpoint(problem = this._saveProblem, { resume = true } = {}) {
    if (!this._alive || this._busy || this._heldPointers?.size || this._saveProblem !== problem) return false;
    const mount = this._mountVisit;
    this._busy = true;
    try {
      if (problem?.reading) await storyState.load();
      else { await storyState.checkpointStories(); await storyState.flushStoryWrites(); }
      if (!this._alive || mount !== this._mountVisit) return false;
      this._saveProblem = null; this._problemPanel?.remove(); this._problemPanel = null; this.root.classList.remove("has-save-problem");
      this._busy = false;
      if (resume) await problem?.continueAfterRetry?.();
      return !this._saveProblem;
    } catch (error) {
      if (this._alive && mount === this._mountVisit) this._showProblem(error, problem?.continueAfterRetry, { reading: !!problem?.reading });
      return false;
    } finally {
      if (this._alive && mount === this._mountVisit) this._busy = false;
    }
  },

  async beforeLeave() {
    this._idleCueStop?.(); this._idleCueStop = null;
    if (!this._alive) { await storyState.flushStoryWrites(); return true; }
    if (this._busy || this._heldPointers?.size) return false;
    // Nothing has been loaded or edited when opening the shelf failed. Leaving
    // must not force a save or trap the family on this recovery screen.
    if (this._saveProblem?.reading) return true;
    if (this._saveProblem) return this._retryCheckpoint(this._saveProblem, { resume: false });
    const mount = this._mountVisit;
    this._busy = true;
    try {
      await storyState.checkpointStories();
      await storyState.flushStoryWrites();
      return this._alive && mount === this._mountVisit;
    } catch (error) {
      if (this._alive && mount === this._mountVisit) this._showProblem(error);
      return false;
    } finally {
      if (this._alive && mount === this._mountVisit) this._busy = false;
    }
  },

  beforeBreak() { return this.beforeLeave(); },

  unmount() {
    this._idleHelp?.(); this._idleHelp = null;
    this._alive = false;
    this._narrationToken++;
    this._visit = {};
    this._mountVisit = {};
    this.root?.removeEventListener("pointerdown", this._pointerDown, true);
    window.removeEventListener("pointerup", this._pointerUp);
    window.removeEventListener("pointercancel", this._pointerUp);
    window.removeEventListener("blur", this._pointerReset);
    this._heldPointers?.clear();
    this._timers.forEach(clearTimeout);
    this._timers = [];
    this._destroyCharacter();
    this._destroyShowAndTell();
    this.mute?.destroy?.();
    this.mute = null;
    speech.cancel();
    this.host = null;
  },

  async onBack() {
    if (!this._alive || this._busy || this._heldPointers?.size) return;
    if (this._saveProblem && !await this.beforeLeave()) return;
    if (this.mode === "story" || this.mode === "complete" || this.mode === "book") this._showLibrary();
    else router.go("map", {}, { dir: "right" });
  },
  breakBusy() { return !!(this._busy || this._heldPointers?.size); },
};

export default stories;
