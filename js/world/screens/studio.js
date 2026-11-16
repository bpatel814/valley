import { installIdleHelp } from '../idle-help.js';
import session from '../../state/session.js';
import { installControlCue } from '../control-cue.js';
// Open Rainbow Studio: blank paper, child-led marks, stamps, undo, save, and remix.
import { PenInput } from "../../engine/pen.js";
import { drawingSVG } from "../../data/drawings.js";
import {
  STUDIO_COLORS,
  STUDIO_STAMPS,
  ALL_STUDIO_STAMPS,
  studioStampChoices,
  STUDIO_COLOR_BY_ID,
  STUDIO_STAMP_BY_ID,
  trayPage,
  nextTrayPage,
  studioPaperFrame,
  studioPaperToCanvas,
  studioCanvasToPaper,
} from "../../data/studio.js";
import {
  blankStudioDocument,
  normaliseStudioDocument,
  studioHasContent,
  undoStudioDocument,
  saveStudioDraft,
  loadStudioDraft,
  saveStudioPicture,
  listStudioPictures,
  flushStudioWrites,
} from "../../state/studio.js";
import settings from "../../state/settings.js";
import db from "../../state/db.js";
import router, { homeButton, muteButton, tapify, recoveryAction } from "../router.js";
import { addScenery } from "../scene.js";
import art from "../art.js";
import bus from "../bus.js";
import speech from "../../audio/speech.js";
import sfx from "../../audio/sfx.js";
import { openShowAndTell } from "../show-and-tell.js";
import { selectCreationPicture } from "../../state/creation-frame.js";

// Match the retained v1 document bounds before any new mark is accepted.
// The live document is normalized on load; idle guidance only needs an empty-paper check.
export function studioIdlePaperEmpty(document) { return Array.isArray(document?.strokes) && Array.isArray(document?.stamps) && !document.strokes.length && !document.stamps.length; }

export const STUDIO_INPUT_CAPACITY = Object.freeze({ strokes: 512, stamps: 200, points: 8192 });

const ICONS = {
  brush: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M42 9 55 22 28 49 15 50 16 37Z" fill="#f2799b" stroke="currentColor" stroke-width="4"/><path d="M15 49c-7 1-9 5-9 9 8 1 14-1 17-8" fill="#5aa9e6" stroke="currentColor" stroke-width="4"/></svg>',
  stamp: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M21 31c1-8 5-13 11-13s10 5 11 13l3 9H18Z" fill="#ffe98a" stroke="currentColor" stroke-width="4"/><rect x="11" y="39" width="42" height="13" rx="5" fill="#9a7fe0" stroke="currentColor" stroke-width="4"/><path d="M15 57h34" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
  undo: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M26 18 10 32l16 14V36h13c10 0 14 7 14 16" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clear: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M43 8 27 37" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M17 34 31 42 24 57C13 55 7 50 7 43Z" fill="#ffd3ab" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M13 43c5 4 10 6 15 6" fill="none" stroke="#f2a565" stroke-width="3"/></svg>',
  pictures: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="14" width="43" height="36" rx="5" fill="#fffdf8" stroke="currentColor" stroke-width="5"/><path d="m14 43 11-12 8 8 7-7 12 12" fill="#b8f0d2" stroke="currentColor" stroke-width="4"/><circle cx="40" cy="25" r="5" fill="#ffe98a"/><path d="M18 56h37V23" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
  save: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 17C23 10 13 12 8 15v37c8-3 16-1 24 4 8-5 16-7 24-4V15c-8-3-17-5-24 2Z" fill="#fffdf8" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M32 17v39" stroke="currentColor" stroke-width="4"/><path d="M21 25c-6-8-14 1 0 12 14-11 6-20 0-12Z" fill="#f2799b" stroke="none"/></svg>',
  guide: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 50c11-25 18-34 26-27 7 6-2 20 6 22 7 2 8-12 16-25" fill="none" stroke="#9a7fe0" stroke-width="5" stroke-linecap="round" stroke-dasharray="4 7"/><circle cx="8" cy="50" r="5" fill="#f2799b"/><path d="m48 9 7 7-9 9-9-9Z" fill="#ffe98a" stroke="currentColor" stroke-width="3"/></svg>',
  next: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 32h38M38 18l14 14-14 14" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M51 32H13M26 18 12 32l14 14" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  keep: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 32c8-13 20-18 34-10l6-8v23l-23 1 9-8c-8-3-15 0-21 8" fill="#b8f0d2" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/></svg>',
  new: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="10" width="44" height="44" rx="7" fill="#fffdf8" stroke="currentColor" stroke-width="5"/><path d="M32 21v22M21 32h22" stroke="#4fc38a" stroke-width="6" stroke-linecap="round"/></svg>',
  talk: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 13h44v31H30L18 54V44h-8Z" fill="#fff2b6" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><circle cx="24" cy="29" r="3"/><circle cx="32" cy="29" r="3"/><circle cx="40" cy="29" r="3"/></svg>',
  map: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="11" width="46" height="39" rx="6" fill="#fffdf8" stroke="currentColor" stroke-width="5"/><path d="M15 43 27 30l9 8 7-7 12 12" fill="#b8f0d2" stroke="currentColor" stroke-width="4"/><path d="M32 55v-8" stroke="currentColor" stroke-width="5"/><path d="M22 57h20" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
  lift: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m10 47 5-14 20-20 12 12-20 20Z" fill="#ffd3ab" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M50 35V8m-9 9 9-9 9 9" fill="none" stroke="#397fc2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 57h30" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
};

function actionButton(icon, label, className, onTap, isActive) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `studio-button tap ${className || ""}`;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon === 'more' ? '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="12" cy="32" r="5" fill="currentColor"/><circle cx="32" cy="32" r="5" fill="currentColor"/><circle cx="52" cy="32" r="5" fill="currentColor"/></svg>' : ICONS[icon];
  const captions = { more: 'More', brush: 'Draw', stamp: 'Stamps', undo: 'Undo', clear: 'Clear', pictures: 'Pictures', save: 'Keep', guide: 'Draw along', next: 'More', back: 'Back', keep: 'Keep drawing', new: 'New picture', talk: 'Tell a story', map: 'On the map' };
  if (captions[icon]) {
    const caption = document.createElement('span');
    caption.className = 'studio-button-caption'; caption.textContent = captions[icon];
    button.append(caption);
  }
  const phraseKey = className?.split(/\s+/).includes('studio-tool') ? ({brush:'studio_brush',stamp:'studio_stamp'})[icon] || ''
    : ['studio-pictures','studio-dialog-pictures'].some(cls => className?.split(/\s+/).includes(cls)) ? 'studio_pictures' : '';
  installControlCue(button, { phraseKey, isActive });
  return tapify(button, onTap);
}

function makeId(prefix) {
  const suffix = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return `${prefix}_${suffix}`;
}

function svgImage(markup) {
  return new Promise((resolve) => {
    if (!markup) { resolve(null); return; }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

function drawStroke(ctx, stroke, frame) {
  const points = stroke.points || [];
  if (!points.length) return;
  const scale = Math.min(frame.width, frame.height);
  const canvasPoint = (point) => studioPaperToCanvas(point, frame.aspect, frame.width, frame.height);
  // studioPaperToCanvas returns coordinates inside a zero-origin frame; add the frame inset.
  const at = (point) => {
    const mapped = canvasPoint(point);
    return { x: frame.x + mapped.x, y: frame.y + mapped.y };
  };
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, stroke.width * scale);
  if (points.length === 1) {
    const point = at(points[0]);
    ctx.beginPath();
    ctx.arc(point.x, point.y, ctx.lineWidth * 0.52, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const first = at(points[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < points.length - 1; i += 1) {
      const point = at(points[i]);
      const next = at(points[i + 1]);
      ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    const last = at(points[points.length - 1]);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
  ctx.restore();
}

export const studio = {
  id: "studio",

  _button(icon, label, className, onTap) {
    const visit = this._visit;
    let button;
    button = actionButton(icon, label, className, event => {
      if (!this._alive || visit !== this._visit || !button.isConnected || this._loading || this._saving || this.pen?.drawing) return;
      return onTap(event);
    }, () => this._alive && visit === this._visit && !this._loading && !this._saving && !this.pen?.drawing);
    return button;
  },

  async mount(host, params = {}) {
    this._visit = (this._visit || 0) + 1;
    this._workshopOrigin = ['rolling-run', 'river-run', 'music-band', 'map'].includes(params.workshopReturnTo) ? params.workshopReturnTo : null;
    this._workshopReturnTo = this._workshopOrigin === 'rolling-run' ? 'rolling-run' : null;
    const visit = this._visit;
    this._alive = true;
    this.host = host;
    this._mode = "brush";
    this._color = STUDIO_COLORS[0].id;
    this._stamp = STUDIO_STAMPS[0].id;
    this._colorPage = 0;
    this._stampPage = 0;
    this._picturePage = 0;
    this._assetPromises = new Map();
    this._liveStroke = null;
    this._liveStamp = null;
    this._loading = true;
    this._initialLoadFailed = false;
    this._initialLoadInFlight = false;
    this._saving = false;
    this._capacityKind = "";
    this._saveProblem = false;
    this._keptContent = "";
    this._renderFrame = 0;
    this._resizePending = false;
    this._remixOf = "";
    this._document = blankStudioDocument();

    const root = document.createElement("div");
    root.className = "studio is-brush";
    root.innerHTML =
      '<main class="studio-main">' +
        '<section class="studio-materials" aria-label="art materials">' +
          '<div class="studio-tools" role="group" aria-label="choose brush or stamps"></div>' +
          '<div class="studio-tray" role="group"></div>' +
        '</section>' +
        '<section class="studio-paper" aria-label="drawing paper"><canvas class="studio-canvas"></canvas></section>' +
        '<nav class="studio-actions" aria-label="picture actions"></nav>' +
      '</main>' +
      '<div class="studio-overlay-host"></div>';
    host.appendChild(root);
    addScenery(root, "map", { foreground: false });
    this.root = root;
    this.canvas = root.querySelector(".studio-canvas");
    this.paper = root.querySelector(".studio-paper");
    this.startCue = document.createElement('div');
    this.startCue.className = 'studio-start-cue';
    this.startCue.setAttribute('aria-hidden', 'true');
    this.startCue.innerHTML = '<span class="studio-start-picture"></span><span class="studio-start-caption"></span>';
    this.paper.append(this.startCue);
    this.tray = root.querySelector(".studio-tray");
    this.overlayHost = root.querySelector(".studio-overlay-host");

    this._home = homeButton();
    this._mute = muteButton();
    root.append(this._home, this._mute);
    this._buildTools();
    this._buildActions();
    this._renderTray();
    this._buildCapacityCue();

    this._connectPen();
    this.resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => this._requestResize())
      : null;
    this.resizeObserver?.observe(this.paper);
    this._viewportResize = () => this._requestResize();
    window.addEventListener("resize", this._viewportResize);
    window.visualViewport?.addEventListener("resize", this._viewportResize);
    this._resizeNow();
    this._preloadStamps();
    this._installIdleHelp(root);

    await this._openInitialDocument(params, visit);
  },

  async _openInitialDocument(params, visit) {
    if (this._initialLoadInFlight || !this._alive || visit !== this._visit) return;
    this._initialLoadInFlight = true;
    this._initialLoadFailed = false;
    this._closeOverlay();
    try {
      const initial = await this._loadInitialDocument(params);
      if (!this._alive || visit !== this._visit) return;
      if (initial && studioHasContent(initial)) {
        this._document = initial;
        this._remixOf = initial.remixOf || "";
        this._scheduleRender();
      }
      this._loading = false;
      this._updateActions();
      if (!this._capacityKind) speech.say("studio_intro");
    } catch {
      if (!this._alive || visit !== this._visit) return;
      this._initialLoadFailed = true;
      this._showInitialReadError(params, visit);
    } finally {
      if (this._alive && visit === this._visit) this._initialLoadInFlight = false;
    }
  },

  _showInitialReadError(params, visit) {
    const dialog = this._makeOverlay("paper could not open");
    dialog.classList.add("studio-initial-recovery");
    const message = document.createElement("p");
    message.textContent = "Your saved paper could not open. Try again, or go home and ask a grown-up for help.";
    const actions = dialog.querySelector(".studio-dialog-actions");
    dialog.insertBefore(message, actions);
    const home = recoveryAction("home", "Home", () => {
      if (this._alive && visit === this._visit) void router.go(this._workshopReturnTo || "map", {}, { dir: "right" });
    });
    home.classList.add("studio-dialog-home");
    const retry = recoveryAction("replay", "Try again", () => {
      void this._openInitialDocument(params, visit);
    });
    retry.classList.add("studio-dialog-retry");
    actions.append(home, retry);
  },

  _installIdleHelp(root, clock = {}) {
    this._idleHelp?.(); this._offIdleSettings?.();
    const visit = this._visit, schedule = clock.delay || setTimeout, unschedule = clock.cancel || clearTimeout;
    this._offIdleSettings = bus.on('settings:changed', () => { if (settings.get().reducedMotion) { this._idleMotion?.cancel?.(); this._idleMotion = null; } });
    this._idleHelp = installIdleHelp(root, {
      active: () => this._alive && this._visit === visit && router.current() === 'studio' && !router.isMoving() && !session.isBreakLocked() && !this._inputBlocked() && !this._capacityKind && !this._saveProblem && !this.pen?.drawing && !speech.isSpeaking() && studioIdlePaperEmpty(this._document),
      demonstrate: () => {
        this._updateStartCue(); const cue = this.startCue, picture = cue?.querySelector('.studio-start-picture'); if (!cue || !picture) return null;
        cue.classList.add('is-guided');
        const reduced = settings.get().reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const motion = !reduced && picture.animate?.([{translate:'-8px 0'},{translate:'8px 0'},{translate:'0 0'}], {duration:1200,iterations:1,easing:'ease-in-out'});
        this._idleMotion = motion || null; motion?.finished?.catch?.(() => {});
        let voiceOwned = !settings.get().muted && speech.isUnlocked();
        if (voiceOwned) Promise.resolve(speech.say(this._mode === 'stamp' ? 'studio_stamp' : 'studio_brush')).then(() => { voiceOwned = false; }, () => { voiceOwned = false; });
        let visualDone = false;
        const clearVisual = () => { if (visualDone) return; visualDone = true; motion?.cancel?.(); if (this._idleMotion === motion) this._idleMotion = null; cue.classList.remove('is-guided'); };
        const visualTimer = schedule(clearVisual, 2400);
        return () => { unschedule(visualTimer); clearVisual(); if (voiceOwned && speech.isSpeaking()) speech.cancel(); voiceOwned = false; };
      }, ...clock,
    });
  },

  async _loadInitialDocument(params = {}) {
    // An earlier visit may still be exporting its immutable picture. Wait for
    // its draft-clearing commit before this visit accepts any new ink.
    await this._pendingSave;
    await this._pendingDraft;
    if (params.document) return normaliseStudioDocument(params.document);
    if (params.picture?.document) return normaliseStudioDocument(params.picture.document);
    return loadStudioDraft();
  },

  _inputBlocked() {
    return !this._alive || this._loading || this._saving || !!this._overlay || !!this._showAndTell;
  },

  _editingBlocked() {
    return this._inputBlocked() || !!this.pen?.drawing;
  },

  _connectPen() {
    if (!this.canvas || this.pen) return;
    this.pen = new PenInput(this.canvas, {
      allowFinger: !settings.get().penOnly,
      onStrokeStart: (point) => this._strokeStart(point),
      onStrokeMove: (point) => this._strokeMove(point),
      onStrokeEnd: (points, detail) => this._strokeEnd(points, detail),
    });
    // Local fallback for interrupted capture and older browsers that cannot capture
    // an outside release. Keep accepted ink, then start with a fresh pointer owner.
    this._captureLost = (event) => {
      if (this.pen?.drawing && this.pen.activeId === event.pointerId) this._settleInput();
    };
    this._outsideRelease = this._captureLost;
    this._interruptInput = () => this._settleInput();
    this._visibilityInput = () => { if (document.hidden) this._settleInput(); };
    this.canvas.addEventListener("lostpointercapture", this._captureLost);
    window.addEventListener("pointerup", this._outsideRelease);
    window.addEventListener("pointercancel", this._outsideRelease);
    window.addEventListener("blur", this._interruptInput);
    window.addEventListener("pagehide", this._interruptInput);
    document.addEventListener("visibilitychange", this._visibilityInput);
  },

  _disconnectPen() {
    this.canvas?.removeEventListener("lostpointercapture", this._captureLost);
    window.removeEventListener("pointerup", this._outsideRelease);
    window.removeEventListener("pointercancel", this._outsideRelease);
    window.removeEventListener("blur", this._interruptInput);
    window.removeEventListener("pagehide", this._interruptInput);
    document.removeEventListener("visibilitychange", this._visibilityInput);
    const pointerId = this.pen?.activeId;
    this.pen?.destroy();
    this.pen = null;
    if (pointerId != null) {
      try { this.canvas?.releasePointerCapture(pointerId); } catch { /* capture already ended */ }
    }
  },

  _settleInput(reconnect = true) {
    if (!this.pen?.drawing && !this._liveStroke && !this._liveStamp) return;
    const lastPenAt = this.pen?.lastPenAt;
    this._disconnectPen();
    this._strokeEnd([], { cancelled: true });
    if (reconnect && this._alive) {
      this._connectPen();
      if (Number.isFinite(lastPenAt)) this.pen.lastPenAt = lastPenAt;
    }
  },

  _buildTools() {
    const host = this.root.querySelector(".studio-tools");
    const brush = this._button("brush", "paint brush", "studio-tool is-selected", () => this._setMode("brush"));
    brush.dataset.tool = "brush";
    brush.setAttribute("aria-pressed", "true");
    const stamp = this._button("stamp", "picture stamps", "studio-tool", () => this._setMode("stamp"));
    stamp.dataset.tool = "stamp";
    stamp.setAttribute("aria-pressed", "false");
    host.append(brush, stamp);
  },

  _buildCapacityCue() {
    const cue = document.createElement("div");
    cue.className = "studio-capacity-cue";
    cue.hidden = true;
    cue.setAttribute("role", "status");
    cue.setAttribute("aria-live", "polite");
    this._capacityIcon = document.createElement("span");
    this._capacityIcon.className = "studio-capacity-picture";
    this._capacityLabel = document.createElement("span");
    this._capacityLabel.className = "studio-capacity-label";
    this._capacityKeep = this._button("save", "keep this picture before fresh paper", "studio-capacity-keep", () => this._save());
    cue.append(this._capacityIcon, this._capacityLabel, this._capacityKeep);
    this.root.querySelector(".studio-main").appendChild(cue);
    this._capacityCue = cue;
    this._updateCapacityCue();
  },

  _updateCapacityCue() {
    const full = this._mode === "stamp"
      ? this._document.stamps.length >= STUDIO_INPUT_CAPACITY.stamps
      : this._document.strokes.length >= STUDIO_INPUT_CAPACITY.strokes;
    const kind = this._liveStroke?.points.length >= STUDIO_INPUT_CAPACITY.points ? "lift" : full ? "paper" : "";
    const changed = this._capacityKind !== kind;
    this._capacityKind = kind;
    if (changed && kind) speech.say(kind === "lift" ? "art_lift_to_continue" : "studio_paper_full");
    if (!this._capacityCue) return;
    this._capacityCue.hidden = !kind;
    this._capacityCue.dataset.kind = kind;
    this.root.querySelector(".studio-main").classList.toggle("has-capacity-cue", !!kind);
    this._capacityIcon.innerHTML = ICONS[kind === "lift" ? "lift" : "save"];
    this._capacityLabel.textContent = kind === "lift" ? "Lift up, then draw another line." : "Keep your picture, then try a fresh page.";
    this._capacityKeep.hidden = kind === "lift";
    this._capacityKeep.disabled = this._editingBlocked();
  },

  _buildActions() {
    const host = this.root.querySelector(".studio-actions");
    this.undoButton = this._button("undo", "undo last thing", "studio-undo", () => this._undo());
    this.clearButton = this._button("clear", "clear the paper", "studio-clear", () => this._askClear());
    this.picturesButton = this._button("pictures", "my pictures", "studio-pictures", () => this._showPictures());
    this.saveButton = this._button("save", "keep my picture", "studio-save", () => this._save());
    this.guideButton = this._button("guide", "draw with a guide", "studio-guide", () => {
      if (this._editingBlocked()) return;
      sfx.play("tap");
      void router.go("bridge");
    });
    host.append(this.undoButton, this.clearButton, this.picturesButton, this.saveButton);
    if (settings.isRegionEnabled("bridge")) host.appendChild(this.guideButton);
    if (this._workshopReturnTo) {
      this._returnToHill = this._button("back", "back to the hill with my current run", "studio-return", () => {
        if (this._editingBlocked()) return;
        void router.go(this._workshopReturnTo);
      });
      const hill = document.createElement("img");
      hill.src = "assets/art/final/rolling-run/ramp-v1.png"; hill.alt = "";
      hill.style.cssText = "width:100%;height:100%;object-fit:contain";
      this._returnToHill.replaceChildren(hill);
      host.appendChild(this._returnToHill);
    }
    this._updateActions();
  },

  _setMode(mode) {
    if (this._editingBlocked()) return;
    if (mode !== "brush" && mode !== "stamp") return;
    this._mode = mode;
    this.root.classList.toggle("is-brush", mode === "brush");
    this.root.classList.toggle("is-stamp", mode === "stamp");
    for (const button of this.root.querySelectorAll("[data-tool]")) {
      const selected = button.dataset.tool === mode;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    this._renderTray();
    this._updateStartCue();
    this._updateCapacityCue();
    sfx.play("tap");
    speech.say(mode === "brush" ? "studio_brush" : "studio_stamp");
  },

  _renderTray() {
    if (!this.tray) return;
    this.tray.replaceChildren();
    const isBrush = this._mode === "brush";
    const list = isBrush ? STUDIO_COLORS : studioStampChoices(settings.get());
    const pageNumber = isBrush ? this._colorPage : this._stampPage;
    const page = trayPage(list, pageNumber);
    this.tray.setAttribute("aria-label", isBrush ? "choose a color" : "choose a picture stamp");
    for (const item of page.items) {
      const selected = isBrush ? item.id === this._color : item.id === this._stamp;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `studio-choice tap ${selected ? "is-selected" : ""}`;
      button.setAttribute("aria-label", item.label);
      button.setAttribute("aria-pressed", String(selected));
      if (isBrush) {
        const swatch = document.createElement("span");
        swatch.className = "studio-swatch";
        swatch.style.backgroundColor = item.value;
        button.appendChild(swatch);
      } else {
        this._appendStampPreview(button, item);
      }
      tapify(button, () => {
        if (this._editingBlocked()) return;
        if (isBrush) this._color = item.id;
        else this._stamp = item.id;
        sfx.play("tap");
        this._renderTray();
        this._updateStartCue();
      });
      this.tray.appendChild(button);
    }
    if (page.pages > 1) {
      const pager = this._button("next", isBrush ? "more colors" : "more stamps", "studio-page", () => {
        if (this._editingBlocked()) return;
        if (isBrush) this._colorPage = nextTrayPage(list, this._colorPage);
        else this._stampPage = nextTrayPage(list, this._stampPage);
        sfx.play("tap");
        this._renderTray();
        this._updateStartCue();
      });
      pager.dataset.page = `${page.page + 1} of ${page.pages}`;
      this.tray.appendChild(pager);
    }
  },

  _appendStampPreview(host, definition) {
    const source = definition.kind === "art" && art.getOriginal(definition.art);
    if (source) {
      const image = source.cloneNode();
      image.alt = "";
      image.draggable = false;
      host.appendChild(image);
      return;
    }
    const drawing = definition.drawing || definition.id;
    host.innerHTML = drawingSVG(drawing, { title: "", className: "studio-stamp-svg" });
  },

  _normalPoint(point) {
    const rect = this.canvas.getBoundingClientRect();
    const mapped = studioCanvasToPaper(point, this._document.aspect, rect.width, rect.height);
    return {
      x: mapped.x,
      y: mapped.y,
      p: Math.max(0, Math.min(1, Number(point.p) || 0.5)),
      t: Math.max(0, Number(point.t) || 0),
      inside: mapped.inside,
    };
  },

  _strokeStart(point) {
    if (this._inputBlocked()) return;
    bus.emit("stroke:start", { screen: this.id });
    const mapped = this._normalPoint(point);
    if (!mapped.inside) return;
    delete mapped.inside;
    if (this._mode === "stamp") {
      this._placeStamp(mapped, true);
      return;
    }
    if (this._document.strokes.length >= STUDIO_INPUT_CAPACITY.strokes) {
      this._updateActions();
      return;
    }
    const color = STUDIO_COLOR_BY_ID[this._color] || STUDIO_COLORS[0];
    this._liveStroke = {
      id: makeId("stroke"),
      color: color.value,
      brush: "marker",
      width: 0.022,
      points: [mapped],
    };
    this._scheduleRender();
    this._updateActions();
  },

  _strokeMove(point) {
    if (!this._liveStroke) {
      if (this.pen?.points.length > 1) this.pen.points.length = 1;
      return;
    }
    if (this._liveStroke.points.length >= STUDIO_INPUT_CAPACITY.points) {
      if (this.pen?.points.length > STUDIO_INPUT_CAPACITY.points) this.pen.points.length = STUDIO_INPUT_CAPACITY.points;
      return;
    }
    const mapped = this._normalPoint(point);
    delete mapped.inside;
    this._liveStroke.points.push(mapped);
    if (this._liveStroke.points.length === STUDIO_INPUT_CAPACITY.points) this._updateCapacityCue();
    this._scheduleRender();
  },

  _strokeEnd(_points, detail = {}) {
    if (this._liveStroke) {
      if (!detail.discarded) {
        this._document.strokes.push(this._liveStroke);
        this._document.actions.push({ kind: "stroke", id: this._liveStroke.id });
        this._document.updatedAt = Date.now();
        this._autosave();
      }
      this._liveStroke = null;
    }
    if (this._liveStamp) {
      if (!detail.discarded) this._commitStamp(this._liveStamp);
      this._liveStamp = null;
    }
    bus.emit("stroke:end", { screen: this.id, cancelled: !!detail.cancelled });
    if (this._resizePending) this._resizeNow();
    this._scheduleRender();
    this._updateActions();
  },

  _placeStamp(point, provisional = false) {
    if (this._document.stamps.length >= STUDIO_INPUT_CAPACITY.stamps) {
      this._updateActions();
      return;
    }
    const definition = STUDIO_STAMP_BY_ID[this._stamp] || STUDIO_STAMPS[0];
    const stamp = {
      id: makeId("stamp"),
      stamp: definition.id,
      x: point.x,
      y: point.y,
      size: 0.2,
      rotation: ((this._document.stamps.length % 3) - 1) * 4,
    };
    if (provisional) this._liveStamp = stamp;
    else this._commitStamp(stamp);
    this._scheduleRender();
    this._updateActions();
  },

  _commitStamp(stamp) {
    if (this._document.stamps.length >= STUDIO_INPUT_CAPACITY.stamps) return;
    this._document.stamps.push(stamp);
    this._document.actions.push({ kind: "stamp", id: stamp.id });
    this._document.updatedAt = Date.now();
    this._autosave();
    this._scheduleRender();
    this._updateActions();
    sfx.play("place");
  },

  _autosave() {
    const visit = this._visit;
    const operation = saveStudioDraft(this._document);
    this._pendingDraft = operation;
    void operation.catch(() => {
      if (this._alive && visit === this._visit && this._pendingDraft === operation) this._saveProblem = true;
    });
  },

  _resetPaper() {
    this._document = blankStudioDocument();
    this._remixOf = "";
    this._liveStroke = null;
    // Persist an empty draft through the same ordered, failure-tracked path as
    // drawing. A failed reset must not become an unhandled rejected deletion.
    this._autosave();
  },

  _undo() {
    if (this._editingBlocked()) return;
    if (!this._document.actions.length) return;
    this._document = undoStudioDocument(this._document);
    this._autosave();
    this._scheduleRender();
    this._updateActions();
    sfx.play("tap");
  },

  _askClear() {
    if (this._editingBlocked()) return;
    if (!studioHasContent(this._document)) return;
    speech.say("studio_clear_ask");
    const overlay = this._makeOverlay("clear the picture?");
    const keep = this._button("keep", "keep my picture", "studio-dialog-keep", () => this._closeOverlay());
    const clear = this._button("clear", "yes, clear the paper", "studio-dialog-clear", () => {
      this._resetPaper();
      this._closeOverlay();
      this._scheduleRender();
      this._updateActions();
      sfx.play("tap");
      speech.say("studio_clear_done");
    });
    overlay.querySelector(".studio-dialog-actions").append(keep, clear);
  },

  async _save() {
    if (this._editingBlocked()) return;
    this._saving = true;
    this._updateActions();
    const visit = this._visit;
    let operation;
    try {
      if (!studioHasContent(this._document)) { speech.say("studio_empty"); return; }
      const document = normaliseStudioDocument(this._document);
      const remixOf = this._remixOf;
      operation = (async () => {
        const png = await this._makePNG(document);
        const saved = await saveStudioPicture(document, png, { remixOf });
        return { saved, png };
      })();
      this._pendingSave = operation;
      const { saved, png } = await operation;
      if (!this._alive || visit !== this._visit || !saved) return;
      this._keptContent = this._contentSignature();
      this._saveProblem = false;
      this._showSaved(saved, png);
      sfx.play("success");
      speech.say("studio_saved");
      return saved;
    } catch (error) {
      if (this._alive && visit === this._visit) this._showSaveProblem(error);
    } finally {
      if (this._pendingSave === operation) this._pendingSave = null;
      if (this._alive && visit === this._visit) {
        this._saving = false;
        this._updateActions();
      }
    }
  },

  _showSaved(saved, png) {
    const overlay = this._makeOverlay("saved picture");
    overlay.classList.add("studio-saved-dialog");
    const preview = new Image();
    preview.className = "studio-saved-preview";
    preview.src = png;
    preview.alt = "your saved picture";
    const actions = overlay.querySelector(".studio-dialog-actions");
    const keep = this._button("brush", "keep drawing", "studio-dialog-keep", () => {
      this._remixOf = saved.key;
      this._document.remixOf = saved.key;
      this._autosave();
      this._closeOverlay();
    });
    const fresh = this._button("new", "new picture", "studio-dialog-new", () => {
      this._resetPaper();
      this._closeOverlay();
      this._scheduleRender();
      this._updateActions();
    });
    const pictures = this._button("pictures", "my pictures", "studio-dialog-pictures", () => {
      this._closeOverlay();
      void this._showPictures();
    });
    const talk = this._button("talk", "show and tell about my picture", "studio-dialog-talk", () => {
      this._openShowAndTell(png);
    });
    const map = this._button("map", "show this picture on the valley map", "studio-dialog-map", () => {
      void this._pinCreation(saved.key, map);
    });
    map.setAttribute("aria-pressed", "false");
    overlay.insertBefore(preview, actions);
    if (!db.status().persistent) {
      overlay.classList.add("has-temporary-note");
      const notice = document.createElement("p"); notice.className = "studio-temporary-notice";
      notice.textContent = "This picture is here while the app stays open. Ask a grown-up to keep a backup.";
      overlay.insertBefore(notice, actions);
    }
    const extras = document.createElement('div'); extras.className = 'studio-extra-actions';
    extras.hidden = true; extras.setAttribute('role', 'group'); extras.setAttribute('aria-label', 'More ways to use this picture');
    extras.append(pictures, talk, map);
    const more = this._button('more', 'more picture choices', 'studio-dialog-more', () => {
      extras.hidden = !extras.hidden;
      more.setAttribute('aria-expanded', String(!extras.hidden));
      more.querySelector('.studio-button-caption').textContent = extras.hidden ? 'More' : 'Less';
    });
    more.setAttribute('aria-expanded', 'false');
    actions.append(keep, this._workshopButton(png, saved.key), fresh, more);
    overlay.append(extras);
  },

  _workshopButton(png = "", sourceKey = "") {
    const button = this._button("pictures", "make a picture toy in the Toy Workshop", "studio-dialog-toy", () => {
      if (!this._alive || this._loading || this._saving || this.pen?.drawing) return;
      this._closeOverlay();
      void router.go("toy-workshop", { ...(sourceKey ? { sourceKey } : {}), ...(this._workshopOrigin ? { returnTo: this._workshopOrigin } : {}) });
    });
    button.replaceChildren();
    button.classList.toggle("has-picture", !!png);
    if (png) {
      const picture = new Image(); picture.src = png; picture.alt = "";
      picture.className = "studio-toy-picture"; button.append(picture);
    }
    const wheels = new Image();
    wheels.src = art.get("toy-workshop/wheels-v1")?.src || "assets/art/final/toy-workshop/wheels-v1.png";
    wheels.alt = ""; wheels.className = "studio-toy-wheels"; button.append(wheels);
    const caption = document.createElement('span'); caption.className = 'studio-button-caption studio-toy-caption';
    caption.textContent = 'Make a toy'; button.append(caption);
    return button;
  },

  async _pinCreation(key, button) {
    if (!key || !button || button.disabled) return;
    button.disabled = true;
    const visit = this._visit;
    try {
      await selectCreationPicture(key);
      if (!this._alive || visit !== this._visit || !button.isConnected) return;
      button.classList.add("is-pinned");
      button.setAttribute("aria-pressed", "true");
      sfx.play("success");
    } catch (error) {
      if (this._alive && visit === this._visit) this._showSaveProblem(error);
    } finally {
      if (this._alive && visit === this._visit && button.isConnected) button.disabled = false;
    }
  },

  _openShowAndTell(png) {
    this._showAndTell?.destroy?.();
    const visit = this._visit;
    const panel = openShowAndTell({
      host: this.root,
      context: "picture",
      preview: png,
      onClose: () => { if (this._visit === visit && this._showAndTell === panel) this._showAndTell = null; },
    });
    this._showAndTell = panel;
  },

  async _showPictures() {
    if (this._editingBlocked()) return;
    const visit = this._visit, request = this._pictureRequest = (this._pictureRequest || 0) + 1;
    const signature = this._contentSignature();
    const stillCurrent = () => this._alive && visit === this._visit && request === this._pictureRequest && !this._editingBlocked() && signature === this._contentSignature();
    let pictures;
    try { pictures = await listStudioPictures(); }
    catch { if (stillCurrent()) this._showPictureReadError(); return; }
    if (!stillCurrent()) return;
    speech.say("studio_pictures");
    this._pictureRows = pictures;
    this._picturePage = Math.min(this._picturePage, Math.max(0, Math.ceil(pictures.length / 4) - 1));
    this._renderPicturesOverlay();
  },

  _showPictureReadError() {
    const dialog = this._makeOverlay("pictures could not open");
    const message = document.createElement("p");
    message.textContent = "Pictures could not be opened. Your current paper is still here. Try again, or ask a grown-up for help.";
    const actions = dialog.querySelector(".studio-dialog-actions"); dialog.insertBefore(message, actions);
    const retry=this._button("next", "try opening my pictures again", "studio-dialog-retry", () => { this._closeOverlay(); void this._showPictures(); });
    retry.querySelector(".studio-button-caption").textContent="Try again";
    actions.append(this._button("back", "back to my paper", "studio-dialog-keep", () => this._closeOverlay()), retry);
  },

  _renderPicturesOverlay() {
    const visit = this._visit;
    const rows = this._pictureRows || [];
    const overlay = this._makeOverlay("my pictures");
    overlay.classList.add("studio-pictures-dialog");
    const gallery = document.createElement("div");
    gallery.className = "studio-picture-grid";
    const pageRows = rows.slice(this._picturePage * 4, this._picturePage * 4 + 4);
    for (const row of pageRows) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "studio-picture tap";
      button.setAttribute("aria-label", "open this picture again");
      if (row.png) {
        const image = new Image();
        image.src = row.png;
        image.alt = "";
        button.appendChild(image);
      } else {
        button.innerHTML = ICONS.pictures;
      }
      tapify(button, () => { if (this._alive && visit === this._visit && button.isConnected && !this._saving && !this.pen?.drawing) this._openPicture(row); });
      gallery.appendChild(button);
    }
    if (!pageRows.length) {
      const empty = document.createElement("div");
      empty.className = "studio-picture-empty";
      empty.innerHTML = ICONS.new;
      empty.setAttribute("aria-label", db.status().persistent ? "no saved pictures yet" : "saved pictures may be unavailable");
      gallery.appendChild(empty);
    }
    const actions = overlay.querySelector(".studio-dialog-actions");
    const close = this._button("back", "back to my paper", "studio-dialog-keep", () => this._closeOverlay());
    actions.append(close, this._workshopButton());
    if (rows.length > 4) {
      const next = this._button("next", "more pictures", "studio-dialog-next", () => {
        const pages = Math.ceil(rows.length / 4);
        this._picturePage = (this._picturePage + 1) % pages;
        this._renderPicturesOverlay();
      });
      actions.appendChild(next);
    }
    overlay.insertBefore(gallery, actions);
    if (!db.status().persistent) {
      const warning=document.createElement("p");warning.className="studio-temporary-notice";
      warning.textContent="Pictures saved on this device may be unavailable right now. Ask a grown-up to check storage before closing.";
      overlay.insertBefore(warning, actions);
    }
  },

  _openPicture(row) {
    if (!this._alive || this._saving || this.pen?.drawing) return;
    if (studioHasContent(this._document) && this._contentSignature() !== this._keptContent) return this._askKeepBeforePicture(row);
    this._document = normaliseStudioDocument({ ...row.document, remixOf: row.key });
    this._keptContent = this._contentSignature();
    this._remixOf = row.key;
    this._autosave();
    this._closeOverlay();
    this._scheduleRender();
    this._updateActions();
    sfx.play("tap");
    speech.say("studio_remix");
  },

  _contentSignature() {
    return JSON.stringify({ strokes: this._document.strokes, stamps: this._document.stamps, actions: this._document.actions });
  },

  _askKeepBeforePicture(row) {
    const visit = this._visit;
    const overlay = this._makeOverlay("Keep this picture before opening another");
    overlay.classList.add("studio-switch-dialog");
    const previews = document.createElement("div"); previews.className = "studio-switch-previews";
    const current = new Image(); current.alt = "your unfinished picture";
    const next = new Image(); next.src = row.png; next.alt = "the kept picture you chose";
    previews.append(current, next); overlay.insertBefore(previews, overlay.querySelector(".studio-dialog-actions"));
    void this._makePNG(this._document).then(png => { if (this._alive && visit === this._visit && overlay.isConnected) current.src = png; }).catch(() => {});
    const stay = this._button("brush", "keep drawing this picture", "studio-dialog-keep", () => this._closeOverlay());
    const keep = this._button("save", "keep this picture, then open the chosen picture", "studio-dialog-save", async () => {
      this._closeOverlay();
      const saved = await this._save();
      if (saved && this._alive && visit === this._visit) this._openPicture(row);
    });
    overlay.querySelector(".studio-dialog-actions").append(stay, keep);
  },

  _showSaveProblem(error) {
    this._saveProblem = true;
    const overlay = this._makeOverlay("Your picture is still here");
    overlay.classList.add("studio-save-problem");
    const message = document.createElement("p");
    message.textContent = error?.code === "studio-capacity" ? "This picture is larger than can be kept here. Your marks are still on the paper." : "Saving could not finish. Your marks are still on the paper. Try again.";
    overlay.insertBefore(message, overlay.querySelector(".studio-dialog-actions"));
    overlay.querySelector(".studio-dialog-actions").append(
      this._button("brush", "return to my picture", "studio-dialog-keep", () => this._closeOverlay()),
      this._button("save", "try keeping my picture again", "studio-dialog-save", () => { this._closeOverlay(); void this._save(); }),
    );
  },

  _makeOverlay(label) {
    this._closeOverlay();
    const shade = document.createElement("div");
    shade.className = "studio-overlay";
    shade.innerHTML = `<section class="studio-dialog" role="dialog" aria-modal="true" aria-label="${label}"><div class="studio-dialog-actions"></div></section>`;
    this.overlayHost.appendChild(shade);
    this._overlay = shade;
    this._updateStartCue();
    return shade.querySelector(".studio-dialog");
  },

  _closeOverlay() {
    this._showAndTell?.destroy?.();
    this._showAndTell = null;
    this._overlay?.remove();
    this._overlay = null;
    if (this._document) this._updateActions();
  },

  _updateStartCue() {
    if (!this.startCue) return;
    const show = !this._loading && !this._saving && !this._overlay && !this._showAndTell &&
      !this.pen?.drawing && !this._liveStroke && !this._liveStamp && !studioHasContent(this._document);
    this.startCue.hidden = !show;
    if (!show) return;
    const stamp = this._mode === 'stamp';
    const image = this.startCue.querySelector('.studio-start-picture');
    image.replaceChildren();
    if (stamp) this._appendStampPreview(image, STUDIO_STAMP_BY_ID[this._stamp] || STUDIO_STAMPS[0]);
    else image.innerHTML = '<svg viewBox="0 0 160 90" aria-hidden="true"><path d="M15 70Q40 15 65 50T135 25" fill="none" stroke="#9f78cc" stroke-width="9" stroke-linecap="round"/><path d="m123 17 14 7-9 13" fill="none" stroke="#79549d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.startCue.querySelector('.studio-start-caption').textContent = stamp ? 'Tap the paper' : 'Draw on the paper';
  },

  _updateActions() {
    this._updateStartCue();
    const blocked = !!(this._loading || this._saving || this.pen?.drawing);
    const hasActions = !!this._document.actions.length;
    const hasContent = !!(this._document.strokes.length || this._document.stamps.length);
    if (this.undoButton) { this.undoButton.hidden = !hasActions; this.undoButton.disabled = blocked || !hasActions; }
    if (this.clearButton) { this.clearButton.hidden = !hasContent; this.clearButton.disabled = blocked || !hasContent; }
    if (this.picturesButton) this.picturesButton.disabled = blocked;
    if (this.guideButton) this.guideButton.disabled = blocked;
    for (const button of this.root?.querySelectorAll(".studio-tool, .studio-choice, .studio-page") || []) button.disabled = blocked;
    if (this.saveButton) {
      this.saveButton.hidden = !hasContent;
      this.saveButton.classList.toggle("is-ready", hasContent);
      this.saveButton.disabled = blocked || !hasContent;
    }
    this._updateCapacityCue();
  },

  _preloadStamps() {
    for (const definition of ALL_STUDIO_STAMPS) {
      void this._stampAsset(definition).then(() => {
        if (this._alive) this._scheduleRender();
      });
    }
  },

  _stampAsset(definition) {
    if (this._assetPromises.has(definition.id)) return this._assetPromises.get(definition.id);
    const promise = (() => {
      if (definition.kind === "art") {
        const image = art.getOriginal(definition.art);
        if (image) return Promise.resolve(image);
      }
      const drawing = definition.drawing || definition.id;
      return svgImage(drawingSVG(drawing, { title: "" }));
    })();
    this._assetPromises.set(definition.id, promise);
    return promise;
  },

  _requestResize() {
    this._resizeNow();
  },

  _resizeNow() {
    if (!this.canvas || !this.paper) return;
    this._resizePending = false;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this._scheduleRender();
  },

  _scheduleRender() {
    if (!this._alive || this._renderFrame) return;
    this._renderFrame = requestAnimationFrame(() => {
      this._renderFrame = 0;
      this._paintCanvas();
    });
  },

  _paintCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ctx = this.canvas.getContext("2d");
    const dpr = this.canvas.width / rect.width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._drawDocument(ctx, rect.width, rect.height, this._document, this._liveStroke, this._liveStamp);
  },

  _drawDocument(ctx, width, height, document, liveStroke = null, liveStamp = null) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#f7efe7";
    ctx.fillRect(0, 0, width, height);
    const frame = studioPaperFrame(document.aspect, width, height);
    ctx.save();
    ctx.shadowColor = "rgba(74, 59, 52, .14)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(frame.x, frame.y, frame.width, frame.height);
    ctx.clip();
    const strokes = new Map(document.strokes.map((item) => [item.id, item]));
    const stamps = new Map(document.stamps.map((item) => [item.id, item]));
    for (const action of document.actions) {
      if (action.kind === "stroke") {
        const stroke = strokes.get(action.id);
        if (stroke) drawStroke(ctx, stroke, frame);
      } else if (action.kind === "stamp") {
        const stamp = stamps.get(action.id);
        const asset = stamp && this._resolvedAsset(stamp.stamp);
        if (stamp && asset) this._drawStamp(ctx, stamp, asset, frame);
      }
    }
    if (liveStroke) drawStroke(ctx, liveStroke, frame);
    if (liveStamp) {
      const asset = this._resolvedAsset(liveStamp.stamp);
      if (asset) this._drawStamp(ctx, liveStamp, asset, frame);
    }
    ctx.restore();
  },

  _resolvedAsset(id) {
    const promise = this._assetPromises.get(id);
    return promise && promise._resolved || null;
  },

  _drawStamp(ctx, stamp, image, frame) {
    const base = Math.min(frame.width, frame.height) * stamp.size;
    const naturalWidth = image.naturalWidth || image.width || 1;
    const naturalHeight = image.naturalHeight || image.height || 1;
    const ratio = Math.max(0.55, Math.min(1.8, naturalWidth / naturalHeight));
    const drawWidth = ratio >= 1 ? base : base * ratio;
    const drawHeight = ratio >= 1 ? base / ratio : base;
    ctx.save();
    const point = studioPaperToCanvas(stamp, frame.aspect, frame.width, frame.height);
    ctx.translate(frame.x + point.x, frame.y + point.y);
    ctx.rotate(stamp.rotation * Math.PI / 180);
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  },

  async _makePNG(studioDocument) {
    for (const stamp of studioDocument.stamps) {
      const definition = STUDIO_STAMP_BY_ID[stamp.stamp];
      if (definition) await this._stampAsset(definition);
    }
    const aspect = studioDocument.aspect;
    const width = aspect >= 1 ? 1200 : Math.round(1200 * aspect);
    const height = aspect >= 1 ? Math.round(1200 / aspect) : 1200;
    const canvas = window.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    this._drawDocument(canvas.getContext("2d"), width, height, studioDocument);
    return canvas.toDataURL("image/png");
  },

  onBack() {
    if (!this._alive || this._loading || this._saving || this.pen?.drawing) return;
    if (this._showAndTell) {
      this._showAndTell.destroy();
      this._showAndTell = null;
      return;
    }
    if (this._overlay) { this._closeOverlay(); return; }
    void router.go(this._workshopReturnTo || "map", {}, { dir: "right" });
  },

  busy() {
    return !!(this._saving || this.pen?.drawing || this._overlay || this._showAndTell);
  },

  breakBusy() { return !!(this._saving || this.pen?.drawing); },
  async beforeLeave() {
    if (!this._alive) { await flushStudioWrites(); return true; }
    if (this._loading) {
      if (!this._initialLoadFailed || this._initialLoadInFlight) return false;
      // Never save the blank placeholder over the paper we could not read.
      // A prior failed write also prevents leaving until its outcome is resolved.
      try { await this._pendingSave; await this._pendingDraft; await flushStudioWrites(); return true; }
      catch { return false; }
    }
    if (this._saving || this.pen?.drawing) return false;
    const visit = this._visit;
    this._saving = true; this._updateActions();
    try {
      await saveStudioDraft(this._document);
      await flushStudioWrites();
      if (!this._alive || visit !== this._visit) return false;
      this._saveProblem = false;
      this._pendingDraft = null;
      return true;
    } catch (error) {
      if (this._alive && visit === this._visit) this._showSaveProblem(error);
      return false;
    } finally {
      if (this._alive && visit === this._visit) { this._saving = false; this._updateActions(); }
    }
  },

  async beforeBreak() { await this._pendingSave?.catch(() => undefined); return this.beforeLeave(); },

  unmount() {
    this._idleHelp?.(); this._idleHelp = null; this._offIdleSettings?.(); this._offIdleSettings = null; this._idleMotion?.cancel?.(); this._idleMotion = null;
    this._settleInput(false);
    this._alive = false;
    this._visit = (this._visit || 0) + 1;
    this._disconnectPen();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener("resize", this._viewportResize);
    window.visualViewport?.removeEventListener("resize", this._viewportResize);
    if (this._renderFrame) cancelAnimationFrame(this._renderFrame);
    this._renderFrame = 0;
    this._home?.destroy?.();
    this._mute?.destroy?.();
    this._closeOverlay();
    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.paper = null;
    this.host = null;
  },
};

// Attach resolved values to their promise without an additional mutable cache.
const originalStampAsset = studio._stampAsset;
studio._stampAsset = function stampAssetWithValue(definition) {
  const promise = originalStampAsset.call(this, definition);
  if (!promise._studioTracked) {
    promise._studioTracked = true;
    promise.then((value) => { promise._resolved = value; });
  }
  return promise;
};

export default studio;
