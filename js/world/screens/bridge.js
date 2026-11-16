// Rainbow Bridge: choose a picture, follow a broad guide, then make it your own.
import { Tracer } from "../../engine/tracer.js";
import { DRAWINGS, drawingById, drawingHasMarks, drawingSVG, glyphForStep } from "../../data/drawings.js";
import router, { homeButton, muteButton, tapify, recoveryAction } from "../router.js";
import { addScenery } from "../scene.js";
import art from "../art.js";
import bus from "../bus.js";
import settings from "../../state/settings.js";
import progress from "../../state/progress.js";
import resume from "../../state/resume.js";
import db from "../../state/db.js";
import { saveBridgePicture, loadBridgeDrafts, saveBridgeDraft, deleteBridgeDraft, flushBridgeWrites, bridgeGuideRevision } from "../../state/bridge.js";
import speech from "../../audio/speech.js";
import sfx from "../../audio/sfx.js";

const ICONS = {
  done: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 34L26 48L53 17" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 32H50M37 18L52 32L37 46" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  replay: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 25A20 20 0 1 1 16 40" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M8 13V29H24" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  choose: '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="5"><circle cx="19" cy="19" r="8"/><circle cx="45" cy="19" r="8"/><circle cx="19" cy="45" r="8"/><circle cx="45" cy="45" r="8"/></g></svg>',
  eye: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M7 32C18 15 46 15 57 32C46 49 18 49 7 32Z" fill="#fffdf8" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="32" r="9" fill="#9a7fe0"/></svg>',
  back: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M51 32H14M27 18 12 32l15 14" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  follow: '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M19 67C29 30 57 23 76 48" fill="none" stroke="#9a7fe0" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 15"/><circle cx="18" cy="68" r="10" fill="#ffe071" stroke="currentColor" stroke-width="4"/><path d="m67 38 12 10-15 6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M48 14 58 36l24 3-18 16 5 24-21-13-21 13 5-24-18-16 24-3Z" fill="#eee8ff" stroke="#9a7fe0" stroke-width="5" stroke-linejoin="round"/><path d="m60 73 8-20 17-17 9 9-17 17Z" fill="#ff9b70" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>',
  invent: '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M13 67C26 34 42 76 54 45S76 32 84 52" fill="none" stroke="#f2799b" stroke-width="9" stroke-linecap="round"/><path d="m72 13 4 10 11 1-8 7 3 11-10-6-10 6 3-11-8-7 11-1Z" fill="#ffe071" stroke="currentColor" stroke-width="3"/></svg>',
  modes: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="5" y="13" width="16" height="38" rx="7" fill="#fff1ad" stroke="currentColor" stroke-width="3"/><rect x="24" y="13" width="16" height="38" rx="7" fill="#eee8ff" stroke="currentColor" stroke-width="3"/><rect x="43" y="13" width="16" height="38" rx="7" fill="#ffe1eb" stroke="currentColor" stroke-width="3"/><circle cx="13" cy="32" r="3" fill="#9a7fe0"/><path d="m32 25 3 6 6 1-5 4 1 7-5-3-5 3 1-7-5-4 6-1Z" fill="#ffe071"/><path d="M47 38c3-11 6 7 9-5" fill="none" stroke="#f2799b" stroke-width="3" stroke-linecap="round"/></svg>',
};

export const BRIDGE_SUBJECT_PAGE_SIZE = 5;

export function fitBridgePaper(width, height) {
  return Math.max(0, Math.min(Number(width) || 0, Number(height) || 0) - 8);
}

// Readiness is a choice, not a prerequisite or a measure of ability.
export function bridgeDrawingOptions(step, mode = "") {
  const independent = step === 2 || mode === "copy";
  return { level: independent ? 3 : step === 0 ? 0 : 2, autoEvaluate: !independent, detectScribble: !independent };
}

export function bridgeSubjectPage(page, items = DRAWINGS) {
  const list = Array.isArray(items) ? items : [];
  const pages = Math.max(1, Math.ceil(list.length / BRIDGE_SUBJECT_PAGE_SIZE));
  const index = ((Number(page) | 0) % pages + pages) % pages;
  return { page: index, pages, items: list.slice(index * BRIDGE_SUBJECT_PAGE_SIZE, (index + 1) * BRIDGE_SUBJECT_PAGE_SIZE) };
}

export function nextDrawingStep(drawingState) {
  const steps = drawingState && Array.isArray(drawingState.steps) ? drawingState.steps : [];
  const open = [0, 1, 2].find((i) => !steps[i]);
  return open === undefined ? 2 : open;
}

export function bridgeTryStep(id, drawingState, drafts = new Map()) {
  const pending = [0, 1].map((step) => ({ step, draft: drafts.get(`${id}:${step}`) }))
    .filter(({ draft }) => draft && Array.isArray(draft.strokes) && draft.strokes.some((stroke) => stroke.length))
    .sort((a, b) => (Number(b.draft.at) || 0) - (Number(a.draft.at) || 0));
  if (pending.length) return pending[0].step;
  const suggested = nextDrawingStep(drawingState);
  return suggested < 2 ? suggested : 0;
}

export function bridgeCompletionPlan(step, options = {}) {
  const current = Math.max(0, Math.min(2, Number(step) | 0));
  const matched = !!options.matched && current < 2;
  const tier = matched ? Math.max(1, Math.min(3, Number(options.tier) | 0)) : 0;
  const recordsProgress = matched || current === 2;
  return {
    matched,
    tier,
    recordsProgress,
    nextStep: recordsProgress && current < 2 ? current + 1 : current,
  };
}

// Route entry may have an empty strokes array. It is a location pointer, not a
// request to erase this mode's independently owned paper.
export function bridgeEntryDraft(item, step, mode, params = {}, drafts = new Map()) {
  const key = `${item.id}:${mode === "copy" ? "copy" : step}`;
  const owned = drafts.get(key);
  if (owned) return owned;
  return { strokes: Array.isArray(params.strokes) ? params.strokes : [], attemptId: params.attemptId || null,
    coordinateSpace: params.coordinateSpace, guideRevision: params.guideRevision };
}

export function bridgeCheckpointMessage(issue, temporary = false) {
  if (issue) return /capacity|full|limit/.test(issue)
    ? "This drawing needs more saving room. Your marks are still here. Try saving again."
    : "This drawing could not save. Your marks are still here. Try saving again.";
  return temporary ? "Only here while the app is open. Device saving is unavailable." : "";
}

function newAttempt(id, step) {
  const random = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `draw:${id}:${step}:${random}`;
}

function iconButton(icon, label, className, onTap) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `bridge-action tap ${className || ""}`;
  button.setAttribute("aria-label", label);
  button.innerHTML = ICONS[icon];
  return tapify(button, onTap);
}

function appendSubjectArt(host, item, className = "") {
  const model = className === "bridge-model-art" ? art.get(`models/draw_${item.id}`) : null;
  const image = model || art.get(`stickers/draw_${item.id}`);
  if (image) {
    const copy = image.cloneNode();
    copy.className = className;
    copy.alt = item.label;
    copy.draggable = false;
    host.appendChild(copy);
  } else {
    host.innerHTML = drawingSVG(item, { className, title: item.label });
  }
}

function stagePhrase(step) {
  return ["ui_dot_to_dot", "ui_trace_the_ghost", "ui_now_you_draw"][step] || "ui_now_you_draw";
}

export const bridge = {
  id: "bridge",
  _offs: [],

  async mount(host, params = {}) {
    this._visit = (this._visit || 0) + 1;
    this._alive = true;
    this._penDown = false;
    this._finishing = false;
    this._moving = false;
    this._checkpointing = false;
    this._draftIssue = "";
    this._saveTail = Promise.resolve();
    this._savingCount = 0;
    this._pickerPage = 0;
    this._modeDrafts = new Map();
    this.host = host;
    const visit = this._visit;
    await this._openSavedDrawings(params, visit);
  },

  async _openSavedDrawings(params, visit) {
    if (!this._active(visit) || this._openingDrawings) return;
    this._openingDrawings = true;
    if (this._drawingRetry) this._drawingRetry.disabled = true;
    let drafts;
    try { drafts = await loadBridgeDrafts(); }
    catch {
      if (!this._active(visit)) return;
      if (!this._drawingRecovery) {
        const notice = document.createElement('section'); notice.className = 'bridge-load-recovery'; notice.setAttribute('role', 'status');
        const text = document.createElement('p'); text.textContent = 'Your drawings could not be opened. Try again, or go Home.';
        const retry = recoveryAction('replay', 'Try again', () => { void this._openSavedDrawings(params, visit); });
        const home = recoveryAction('home', 'Home', () => { if (this._active(visit)) void router.go('map', {}, { dir: 'right' }); });
        notice.append(text, retry, home); this.host.append(notice); this._drawingRecovery = notice; this._drawingRetry = retry;
      }
      return;
    } finally {
      if (this._visit === visit) { this._openingDrawings = false; if (this._drawingRetry) this._drawingRetry.disabled = false; }
    }
    if (!this._active(visit)) return;
    this._drawingRecovery?.remove(); this._drawingRecovery = null; this._drawingRetry = null;
    return this._finishOpeningDrawings(params, visit, drafts);
  },

  async _finishOpeningDrawings(params, visit, drafts) {
    const host = this.host;
    for (const draft of drafts.drafts) {
      const key = draft.mode === "copy" ? `${draft.id}:copy` : `${draft.id}:${draft.step}`;
      this._modeDrafts.set(key, draft);
    }

    const root = document.createElement("div");
    root.className = "bridge";
    root.innerHTML = '<main class="bridge-main"></main>';
    host.appendChild(root);
    addScenery(root, "map", { foreground: false });
    this.root = root;
    this.main = root.querySelector(".bridge-main");

    this._home = homeButton();
    this._mute = muteButton();
    this._back = iconButton("back", "back to drawing choices, keeping my marks", "bridge-back", () => this.onBack());
    root.append(this._home, this._mute, this._back);
    this.notice = document.createElement("div"); this.notice.className = "bridge-save-status"; this.notice.setAttribute("role", "status"); this.notice.setAttribute("aria-live", "polite"); this.notice.hidden = true;
    this.saveRetry = document.createElement("button"); this.saveRetry.type = "button"; this.saveRetry.className = "bridge-save-retry tap"; this.saveRetry.textContent = "Try saving again";
    tapify(this.saveRetry, () => { if (!this._blocked()) void this.beforeLeave(); }); this.saveRetry.hidden = true;
    root.append(this.notice, this.saveRetry);
    this._inputGuard = event => { if (this._moving || this._checkpointing || this._finishing) { event.preventDefault(); event.stopImmediatePropagation(); } };
    root.addEventListener("pointerdown", this._inputGuard, true);
    this._offs = [
      bus.on("stroke:start", () => { this._penDown = true; }),
      bus.on("stroke:end", () => { this._penDown = false; }),
    ];
    this._boundLayout = () => this._layoutPaper();
    window.addEventListener('resize', this._boundLayout);

    const item = drawingById(params.id);
    if (item) {
      const saved = progress.get().drawings && progress.get().drawings[item.id];
      const step = Number.isInteger(params.step) ? Math.max(0, Math.min(2, params.step)) : nextDrawingStep(saved);
      const draft = bridgeEntryDraft(item, step, params.mode, params, this._modeDrafts);
      await this._start(item, step, draft.strokes, draft.attemptId, draft.coordinateSpace, params.mode, draft.guideRevision);
    } else {
      await this._showPicker();
      if (!this._active(visit)) return;
      speech.say("ui_lets_draw");
    }
  },

  _showPicker(page = this._pickerPage || 0) { return this._transition(() => this._renderPicker(page)); },

  _renderPicker(page) {
    this._destroyTracer();
    const view = this._workView;
    this.item = null;
    this.root.classList.remove("is-drawing", "is-reward", "is-choosing-mode");
    this.root.classList.add("is-picking");
    const model = bridgeSubjectPage(page);
    this._pickerPage = model.page;
    this.main.innerHTML =
      '<div class="bridge-picker">' +
        '<div class="bridge-subjects" role="group" aria-label="Choose something to draw"></div>' +
        '<div class="bridge-picker-pages" aria-label="more drawing pictures"></div>' +
      '</div>';
    const picker = this.main.querySelector(".bridge-picker");
    const subjects = this.main.querySelector(".bridge-subjects");
    for (const item of model.items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "bridge-choice tap";
      button.setAttribute("aria-label", item.label);
      appendSubjectArt(button, item, "bridge-choice-art");
      tapify(button, () => {
        if (!this._alive || this._workView !== view) return;
        sfx.play("tap");
        speech.object(item.id);
        this._showModes(item);
      });
      subjects.appendChild(button);
    }
    const pages = this.main.querySelector(".bridge-picker-pages");
    pages.append(iconButton("back", "previous drawing pictures", "bridge-page bridge-page-back", () => {
      if (!this._alive || this._workView !== view) return;
      sfx.play("tap");
      this._showPicker(model.page - 1);
    }));
    const dots = document.createElement("div");
    dots.className = "bridge-page-dots";
    dots.setAttribute("aria-hidden", "true");
    for (let index = 0; index < model.pages; index += 1) {
      const dot = document.createElement("i");
      if (index === model.page) dot.className = "is-current";
      dots.appendChild(dot);
    }
    pages.append(dots, iconButton("next", "more drawing pictures", "bridge-page bridge-page-next", () => {
      if (!this._alive || this._workView !== view) return;
      sfx.play("tap");
      this._showPicker(model.page + 1);
    }));
    picker.dataset.page = String(model.page + 1);
  },

  _showModes(item, options = {}) { return this._transition(() => this._renderModes(item, options)); },

  _renderModes(item, options = {}) {
    if (!item) return;
    this._destroyTracer();
    const view = this._workView;
    this.item = item;
    this.root.classList.remove("is-drawing", "is-reward", "is-picking");
    this.root.classList.add("is-choosing-mode");
    this.main.innerHTML =
      '<div class="bridge-mode-picker">' +
        '<div class="bridge-mode-subject" role="img"></div>' +
        '<div class="bridge-mode-options" role="group" aria-label="Choose how to draw"></div>' +
        '<div class="bridge-mode-back-wrap"></div>' +
      '</div>';

    const subject = this.main.querySelector(".bridge-mode-subject");
    subject.setAttribute("aria-label", item.label);
    appendSubjectArt(subject, item, "bridge-mode-subject-art");
    subject.setAttribute("aria-description", item.guideDescription);
    const saved = progress.get().drawings && progress.get().drawings[item.id];
    const completed = saved && Array.isArray(saved.steps) ? saved.steps : [];
    const choices = [
      { mode: "watch", icon: "eye", title: "Watch", label: `watch how to draw ${item.label}` },
      { mode: "follow", icon: "follow", title: "Try", step: bridgeTryStep(item.id, saved, this._modeDrafts), label: `try the guide for ${item.label}` },
      { mode: "copy", icon: "copy", title: "Copy", step: 1, label: `copy ${item.label} on blank paper` },
      { mode: "invent", icon: "invent", title: "Invent", step: 2, label: `make your own ${item.label}` },
    ];
    const optionsHost = this.main.querySelector(".bridge-mode-options");
    choices.forEach(({ mode, icon, title, step, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `bridge-mode-choice bridge-mode-choice--${mode} tap`;
      button.setAttribute("aria-label", label);
      button.innerHTML = `<span class="bridge-mode-icon">${ICONS[icon]}</span><span class="bridge-mode-label">${title}</span>`;
      if (mode !== "watch" && mode !== "copy" && completed[step]) {
        button.classList.add("is-done");
        const check = document.createElement("span");
        check.className = "bridge-mode-check";
        check.setAttribute("aria-hidden", "true");
        check.innerHTML = ICONS.done;
        button.appendChild(check);
      } else if (mode === "follow") button.classList.add("is-suggested");
      tapify(button, () => {
        if (!this._alive || this._workView !== view) return;
        sfx.play("tap");
        if (mode === "watch") { this._showWatch(item); return; }
        const key = mode === "copy" ? `${item.id}:copy` : `${item.id}:${step}`;
        const draft = this._modeDrafts.get(key);
        this._start(item, step, draft && draft.strokes, draft && draft.attemptId, draft && draft.coordinateSpace, mode, draft && draft.guideRevision);
      });
      optionsHost.appendChild(button);
    });

    const back = iconButton("back", "choose a different picture", "bridge-mode-back", () => {
      if (!this._alive || this._workView !== view) return;
      sfx.play("tap");
      const index = Math.max(0, DRAWINGS.findIndex((drawing) => drawing.id === item.id));
      this._showPicker(Math.floor(index / BRIDGE_SUBJECT_PAGE_SIZE));
    });
    this.main.querySelector(".bridge-mode-back-wrap").appendChild(back);
    speech.say("bridge_choose_mode");
  },

  async _showWatch(item) {
    const visit = this._visit;
    if (!await this._start(item, 1, null, null, null, "watch") || !this._active(visit) || !this.tracer) return false;
    this._watching = true;
    this.root.classList.add("is-watching");
    const tracer = this.tracer;
    tracer.setLevel(2);
    tracer.inkCanvas.style.pointerEvents = "none";
    tracer.tools.hidden = true;
    this.doneButton.remove();
    this.doneButton = null;
    this.main.querySelector(".bridge-work-label").textContent = "Watch, then try";
    const activeWatch = () => this._alive && this.tracer === tracer && this._watching;
    const tryButton = iconButton("follow", "try drawing with the guide", "bridge-watch-try", () => {
      if (!activeWatch()) return;
      const draft = this._modeDrafts.get(`${item.id}:0`);
      this._start(item, 0, draft && draft.strokes, draft && draft.attemptId, draft && draft.coordinateSpace, "", draft && draft.guideRevision);
    });
    const replay = iconButton("replay", "watch the drawing again", "bridge-watch-replay", () => { if (activeWatch()) this._showWatch(item); });
    this.main.querySelector(".bridge-footer").append(tryButton, replay);
    speech.say("ui_show_me");
    const ticket = this._watchTicket;
    const demonstrate = async () => {
      for (let index = 0; index < item.glyph.strokes.length; index += 1) {
        if (!this._alive || this.tracer !== tracer || ticket !== this._watchTicket) return;
        tracer.strokeIndex = index;
        await tracer.showMe();
      }
    };
    void demonstrate();
  },

  _start(item, step, savedStrokes = null, attemptId = null, coordinateSpace = null, mode = "", guideRevision = null) {
    return this._transition(() => this._renderStart(item, step, savedStrokes, attemptId, coordinateSpace, mode, guideRevision), mode !== "watch");
  },

  _renderStart(item, step, savedStrokes, attemptId, coordinateSpace, mode, guideRevision) {
    this._destroyTracer();
    if (mode !== "watch" && !savedStrokes && !attemptId) {
      const key = mode === "copy" ? `${item.id}:copy` : `${item.id}:${step}`;
      const draft = this._modeDrafts.get(key);
      if (draft) ({ strokes: savedStrokes, attemptId, coordinateSpace, guideRevision } = draft);
    }
    this.item = item;
    this.step = step;
    this.mode = mode === "copy" || mode === "watch" ? "copy" : "";
    this._watching = mode === "watch";
    this.guideRevision = bridgeGuideRevision(item.id, guideRevision, savedStrokes);
    this.attemptId = attemptId || newAttempt(item.id, step);
    this._finishing = false;
    this._hinted = false;
    this.root.classList.remove("is-picking", "is-reward", "is-choosing-mode");
    this.root.classList.add("is-drawing");
    const view = this._workView = (this._workView || 0) + 1;
    this.main.innerHTML =
      '<div class="bridge-work">' +
        '<div class="bridge-work-context"><div class="bridge-work-label"></div>' +
          '<button class="bridge-model tap" type="button"></button>' +
          '<div class="bridge-steps" aria-hidden="true"></div></div>' +
        '<div class="bridge-paper-stage"><div class="bridge-paper"><div class="bridge-canvas"></div></div></div>' +
        '<div class="bridge-footer"><div class="bridge-tool-host" aria-label="Drawing tools"></div></div>' +
      '</div>';
    this.main.querySelector(".bridge-work-label").textContent = this.mode === "copy" ? "Copy" : step === 2 ? "Invent" : "Try";

    this.model = this.main.querySelector(".bridge-model");
    appendSubjectArt(this.model, item, "bridge-model-art");
    this.model.setAttribute("aria-description", item.guideDescription);
    this.model.setAttribute("aria-label", step === 2 ? "hide example" : item.label);
    if (step === 2) tapify(this.model, () => { if (this._alive && view === this._workView) this._toggleModel(); });
    else this.model.disabled = true;

    const steps = this.main.querySelector(".bridge-steps");
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement("span");
      dot.className = `bridge-step ${i < step ? "is-done" : i === step ? "is-now" : ""}`;
      dot.innerHTML = i < step ? ICONS.done : ICONS[["follow", "copy", "invent"][i]];
      steps.appendChild(dot);
    }

    this.doneButton = iconButton("done", "save my drawing", "bridge-done", () => {
      if (this._alive && view === this._workView && !this._penDown && !this.tracer?.pen?.drawing) void this._complete();
    });
    this.doneButton.disabled = true;
    this.main.querySelector(".bridge-footer").appendChild(this.doneButton);

    const box = this.main.querySelector(".bridge-canvas");
    this.paperStage = this.main.querySelector('.bridge-paper-stage');
    this.paper = this.main.querySelector('.bridge-paper');
    this._layoutPaper();
    const glyph = glyphForStep(item, step, this.guideRevision);
    this.tracer = new Tracer(box, {
      glyph,
      toolHost: this.main.querySelector('.bridge-tool-host'),
      ...bridgeDrawingOptions(step, this.mode),
      handedness: settings.get().handedness,
      allowFinger: !settings.get().penOnly,
      style: { kind: "rainbow", width: step === 2 ? 12 : 10 },
      onResult: (result) => this._handleResult(result),
      onStroke: () => {},
      onProgress: () => {},
      onStrokeEnd: () => this._strokeEnd(),
    });
    this._guardSceneTools();
    if (typeof ResizeObserver !== 'undefined') {
      this._layoutObserver = new ResizeObserver(() => this._layoutPaper());
      this._layoutObserver.observe(this.paperStage);
    }
    if (this.host) this.host._tracer = this.tracer;

    if (savedStrokes && Array.isArray(savedStrokes) && savedStrokes.length) {
      if (coordinateSpace === "glyph" && this.tracer.loadSnapshot) {
        this.tracer.loadSnapshot({ version: 1, coordinateSpace: "glyph", glyph: item.id, strokes: savedStrokes });
      } else if (this.tracer.load) {
        this.tracer.load(savedStrokes);
      }
    }
    this._updateDone();
    if (mode !== "watch") speech.say(stagePhrase(this.mode === "copy" ? 2 : step));
  },

  _layoutPaper() {
    if (!this._alive || !this.paperStage || !this.paper || this.tracer?.pen?.drawing) return;
    const size = fitBridgePaper(this.paperStage.clientWidth, this.paperStage.clientHeight);
    if (!size) return;
    this.paper.style.width = `${size}px`; this.paper.style.height = `${size}px`;
    this.tracer?.resize?.();
  },

  _guardSceneTools() {
    const tracer = this.tracer;
    this._toolGuards = [];
    for (const button of tracer?.tools?.querySelectorAll('.rv-btn') || []) {
      const guard = event => {
        if (!this._alive || this.tracer !== tracer || this._held() || this._moving || this._checkpointing || this._finishing || this._watching) {
          event.preventDefault(); event.stopImmediatePropagation();
        }
      };
      button.addEventListener('click', guard, true); this._toolGuards.push([button, guard]);
    }
  },

  _handleResult(result) {
    if (!this.tracer || this.step >= 2 || this.mode === "copy" || this._watching || this._finishing) return;
    if (result?.reason === "scribble") {
      const tracer = this.tracer;
      const visit = this._visit;
      this._finishing = true;
      this._updateDone();
      speech.say("ui_scribble_reset");
      clearTimeout(this._resetTimer);
      this._resetTimer = setTimeout(() => {
        if (!this._alive || visit !== this._visit || tracer !== this.tracer) return;
        tracer.discardLastAttempt();
        this._finishing = false;
        this._strokeEnd();
      }, 220);
    } else if (result?.tier >= 1) {
      void this._complete({ matched: true, tier: result.tier });
    } else {
      this.tracer.continueDrawing();
      if (!this._hinted) { this._hinted = true; speech.say("ui_try_the_path"); }
    }
  },

  _snapshot() {
    if (!this.tracer) return { version: 1, coordinateSpace: "glyph", glyph: this.item && this.item.id, strokes: [] };
    if (this.tracer.snapshot) return this.tracer.snapshot();
    return { version: 1, coordinateSpace: "pixel", glyph: this.item.id, strokes: this.tracer.strokes() };
  },

  _strokeEnd() {
    if (!this.tracer || !this.item) return;
    this._layoutPaper?.();
    const snapshot = this._snapshot();
    if (this._watching) return;
    void this._rememberModeDraft();
    this._updateDone(snapshot);
  },

  _updateDone(snapshot = this._snapshot()) {
    if (!this.doneButton) return;
    const meaningful = drawingHasMarks(snapshot.strokes, snapshot.coordinateSpace === "glyph" ? 5 : 12);
    this.doneButton.disabled = !meaningful || this._blocked();
    this.doneButton.classList.toggle("is-ready", meaningful && !this._blocked());
  },

  _captureDraft() {
    if (!this.tracer || !this.item || this._watching || !Number.isInteger(this.step)) return null;
    const snapshot = this._snapshot();
    return {
      id: this.item.id, step: this.step, mode: this.mode === "copy" ? "copy" : this.step === 2 ? "invent" : "try",
      strokes: snapshot.strokes,
      coordinateSpace: snapshot.coordinateSpace,
      attemptId: this.attemptId,
      guideRevision: bridgeGuideRevision(this.item.id, this.guideRevision, snapshot.strokes), at: Date.now(),
    };
  },

  _held() { return !!(this._penDown || this.tracer?.pen?.drawing || this.tracer?.pen?.activeId != null); },
  _blocked() { return !this._alive || this._held() || this._finishing || this._moving || this._checkpointing; },
  _active(visit) { return this._alive && this._visit === visit; },

  _paintSaveStatus() {
    if (!this._alive) return;
    const message = bridgeCheckpointMessage(this._draftIssue, db.isMemory());
    if (this.notice) { this.notice.textContent = this._draftIssue ? message : db.isMemory() ? "Only here while the app is open" : ""; this.notice.hidden = !!this._draftIssue || !this.notice.textContent; }
    if (this.saveRetry) { this.saveRetry.hidden = !this._draftIssue; this.saveRetry.disabled = this._blocked(); this.saveRetry.textContent = /capacity|full|limit/.test(this._draftIssue) ? "Save needs room. Retry" : "Marks are here. Retry save"; this.saveRetry.setAttribute("aria-label", message || "Try saving again"); }
    this._updateDone();
  },

  _rememberModeDraft({ pointer = true, draft = this._captureDraft(), teardown = false } = {}) {
    const visit = this._visit;
    const tail = this._saveTail || Promise.resolve();
    this._savingCount = (this._savingCount || 0) + 1;
    const task = tail.then(async () => {
      if (!teardown && !this._active(visit)) return false;
      try {
        if (draft) {
          const key = `${draft.id}:${draft.mode === "copy" ? "copy" : draft.step}`;
          if (draft.strokes.length) {
            if (draft.coordinateSpace !== "glyph") throw Object.assign(new Error("legacy pixel paper"), { code: "bridge-pixel-draft" });
            const saved = await saveBridgeDraft(draft);
            if (!saved) throw new Error("draft refused");
            if (this._active(visit)) this._modeDrafts.set(key, saved);
          } else {
            await deleteBridgeDraft(draft.id, draft.step, draft.mode);
            if (this._active(visit)) this._modeDrafts.delete(key);
          }
          if (pointer && this._active(visit)) {
            // The durable draft owns every point. The resume row only identifies
            // the last viewed mode and is serialized before route entry.
            await db.put("kv", "resume", { screen: "bridge", params: { id: draft.id, step: draft.step, mode: draft.mode === "copy" ? "copy" : "", attemptId: draft.attemptId, coordinateSpace: draft.coordinateSpace, guideRevision: draft.guideRevision }, strokes: [], at: Date.now() });
          }
        }
        if (this._active(visit)) { this._draftIssue = ""; this._paintSaveStatus(); }
        return teardown || this._active(visit);
      } catch (error) {
        if (this._active(visit)) { this._draftIssue = error.code || "bridge-write"; this._paintSaveStatus(); }
        return false;
      } finally {
        if (this._visit === visit) {
          this._savingCount = Math.max(0, this._savingCount - 1);
          if (this._alive && !this._savingCount) bus.emit("activity:idle");
        }
      }
    });
    this._saveTail = task.then(() => undefined);
    return task;
  },

  async _transition(render, rememberEntry = false) {
    if (this._blocked()) return false;
    const visit = this._visit; this._moving = true; this._paintSaveStatus();
    try {
      if (!await this._rememberModeDraft() || !this._active(visit)) return false;
      render();
      if (rememberEntry && !await this._rememberModeDraft()) return false;
      return this._active(visit);
    } catch (error) {
      if (this._active(visit)) { this._draftIssue = error.code || "bridge-write"; this._paintSaveStatus(); }
      return false;
    } finally { if (this._visit === visit) { this._moving = false; this._paintSaveStatus(); bus.emit("activity:idle"); } }
  },

  _draftKey() { return `${this.item.id}:${this.mode === "copy" ? "copy" : this.step}`; },

  _toggleModel() {
    if (!this.model || this.step !== 2 || this._blocked()) return;
    const hidden = this.model.classList.toggle("is-hidden");
    this.model.setAttribute("aria-label", hidden ? "show example" : "hide example");
    sfx.play("tap");
  },

  async _complete(options = {}) {
    if (this._blocked() || this._watching || !this.tracer || !this.item) return false;
    const snapshot = this._snapshot();
    if (!drawingHasMarks(snapshot.strokes, snapshot.coordinateSpace === "glyph" ? 5 : 12)) {
      this._updateDone(snapshot);
      return;
    }
    this._finishing = true;
    this._updateDone(snapshot);
    const visit = this._visit;
    const item = this.item;
    const step = this.step;
    const attemptId = this.attemptId;
    const mode = this.mode;
    const draftKey = this._draftKey();
    const plan = bridgeCompletionPlan(step, options);
    try {
      if (!await this._rememberModeDraft()) { if (this._active(visit)) this.tracer?.continueDrawing?.(); return false; }
      if (!this._active(visit)) return false;
      const png = this.tracer.ink?.toPNG ? this.tracer.ink.toPNG(512, 512) : null;
      const savedPicture = await saveBridgePicture({ id: item.id, step, png, strokes: snapshot.strokes, attemptId });
      if (!savedPicture) throw new Error("picture refused");
      if (!this._active(visit)) return false;
      let drawingResult = { earned: false, galleryKey: savedPicture.key };
      if (plan.recordsProgress) {
        // The Bridge owns the actual keepsake row above. Passing no PNG prevents
        // progress from writing a second gallery item for independent drawing.
        drawingResult = await progress.recordDrawing(item.id, step, { png: null, strokes: snapshot.strokes });
        drawingResult.galleryKey = savedPicture.key;
      }
      if (!this._active(visit)) return false;
      let playResult = { rewarded: false, petals: 0, flowers: 0, credited: true };
      if (typeof progress.recordPlay === "function") playResult = await progress.recordPlay("drawing", item.id, attemptId);
      if (!this._active(visit)) return false;
      await deleteBridgeDraft(item.id, step, mode, attemptId);
      if (!this._active(visit)) return false;
      if (this._modeDrafts.get(draftKey)?.attemptId === attemptId) this._modeDrafts.delete(draftKey);
      await resume.clear();
      if (!this._active(visit) || this.item !== item) return false;
      sfx.play("sparkle");
      if (plan.matched) speech.praise(plan.tier);
      else if (!db.isMemory()) speech.say("bridge_saved");
      this._showReward({ item, step, png, snapshot, drawingResult, playResult, plan });
      return true;
    } catch (error) {
      if (this._active(visit)) { this._draftIssue = error.code || "bridge-write"; this.tracer?.continueDrawing?.(); }
      return false;
    } finally {
      if (this._active(visit)) { this._finishing = false; this._paintSaveStatus(); bus.emit("activity:idle"); }
    }
  },

  _showReward({ item, step, png, snapshot, drawingResult, playResult, plan }) {
    this._destroyTracer();
    const view = this._workView;
    this._finishing = false;
    this._hinted = false;
    this.root.classList.remove("is-drawing", "is-picking");
    this.root.classList.add("is-reward");
    this.main.innerHTML =
      '<div class="bridge-reward">' +
        '<div class="bridge-reward-burst" aria-hidden="true"></div>' +
        '<div class="bridge-preview"></div>' +
        '<div class="bridge-petals" aria-label="flower petals"></div>' +
        '<div class="bridge-reward-actions"></div>' +
      '</div>';

    const preview = this.main.querySelector(".bridge-preview");
    if (png) {
      const image = document.createElement("img");
      image.src = png;
      image.alt = `your drawing inspired by ${item.label}`;
      preview.appendChild(image);
    } else {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.classList.add("bridge-preview-ink");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `your drawing inspired by ${item.label}`);
      for (const [index, stroke] of (snapshot && snapshot.strokes || []).entries()) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", stroke.map((point, pointIndex) => `${pointIndex ? "L" : "M"}${point.x} ${point.y}`).join(" "));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", ["#f2799b", "#f2b84b", "#58bfa8", "#5aa9e6", "#9a7fe0"][index % 5]);
        path.setAttribute("stroke-width", "3");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);
      }
      preview.appendChild(svg);
    }
    if (drawingResult && drawingResult.earned) preview.classList.add("earned-sticker");

    const petals = this.main.querySelector(".bridge-petals");
    const count = Math.max(0, Math.min(2, Number(playResult && playResult.petals) || 0));
    for (let i = 0; i < 3; i += 1) {
      const petal = document.createElement("span");
      petal.className = `bridge-petal ${i < count ? "is-filled" : ""}`;
      petals.appendChild(petal);
    }
    if (playResult && playResult.rewarded) petals.classList.add("just-earned", "is-flower");

    const actions = this.main.querySelector(".bridge-reward-actions");
    const nextStep = plan && Number.isInteger(plan.nextStep) ? plan.nextStep : step;
    const advances = nextStep > step;
    const primary = iconButton(advances ? "next" : "replay", advances ? "next drawing step" : "draw it again", "bridge-primary", () => {
      if (!this._alive || this._workView !== view) return;
      sfx.play("tap");
      this._start(item, nextStep, null, newAttempt(item.id, nextStep), null, this.mode);
    });
    const choose = iconButton("choose", "choose another picture", "bridge-choose", () => {
      if (!this._alive || this._workView !== view) return;
      sfx.play("tap");
      const index = Math.max(0, DRAWINGS.findIndex((drawing) => drawing.id === item.id));
      this._showPicker(Math.floor(index / BRIDGE_SUBJECT_PAGE_SIZE));
      speech.say("ui_lets_draw");
    });
    const modes = iconButton("modes", `choose how to draw ${item.label}`, "bridge-modes", () => {
      if (!this._alive || this._workView !== view) return;
      sfx.play("tap");
      this._showModes(item, { preserve: false });
    });
    actions.append(primary, modes, choose);
  },

  _destroyTracer() {
    this._workView = (this._workView || 0) + 1;
    this._layoutObserver?.disconnect(); this._layoutObserver = null;
    for (const [button, guard] of this._toolGuards || []) button.removeEventListener('click', guard, true);
    this._toolGuards = [];
    this._watchTicket = (this._watchTicket || 0) + 1;
    this._watching = false;
    this.root?.classList.remove("is-watching");
    clearTimeout(this._resetTimer);
    this._resetTimer = 0;
    if (this.tracer && this.tracer.destroy) this.tracer.destroy();
    this.tracer = null;
    this.paper = null; this.paperStage = null;
    this.doneButton = null;
    if (this.host) this.host._tracer = null;
  },

  busy() {
    return !!(this._held() || this._finishing || this._moving || this._checkpointing || this._savingCount);
  },

  breakBusy() { return this.busy(); },

  async beforeLeave() {
    if (!this._alive) return true;
    if (this._blocked()) return false;
    const visit = this._visit; this._checkpointing = true; this._paintSaveStatus();
    try { const saved = await this._rememberModeDraft(); await flushBridgeWrites(); return saved && this._active(visit); }
    finally { if (this._visit === visit) { this._checkpointing = false; this._paintSaveStatus(); bus.emit("activity:idle"); } }
  },

  beforeBreak() { return this.beforeLeave(); },

  onBack() {
    if (this._blocked()) return false;
    if (this.root && this.root.classList.contains("is-drawing") && this.item) {
      return this._showModes(this.item, { preserve: true });
    } else if (this.root && this.root.classList.contains("is-choosing-mode") && this.item) {
      const index = Math.max(0, DRAWINGS.findIndex((drawing) => drawing.id === this.item.id));
      return this._showPicker(Math.floor(index / BRIDGE_SUBJECT_PAGE_SIZE));
    } else return router.go("map", {}, { dir: "right" });
  },

  unmount() {
    // A direct teardown retains final ink but never writes a late route pointer.
    if (this._alive && this.tracer && !this._watching && !this._finishing) void this._rememberModeDraft({ pointer: false, teardown: true });
    this._alive = false;
    this._drawingRecovery?.remove(); this._drawingRecovery = null; this._drawingRetry = null; this._openingDrawings = false;
    this._visit = (this._visit || 0) + 1;
    this._destroyTracer();
    if (typeof window !== 'undefined') window.removeEventListener('resize', this._boundLayout);
    this._boundLayout = null;
    for (const off of this._offs || []) off();
    this._offs = [];
    if (this._mute && this._mute.destroy) this._mute.destroy();
    this._mute = null;
    this.root?.removeEventListener("pointerdown", this._inputGuard, true); this._inputGuard = null;
    this.notice = this.saveRetry = null;
    this._back = null;
    this.item = null;
    this._modeDrafts && this._modeDrafts.clear();
    this._penDown = false;
    this._finishing = false;
    this._moving = this._checkpointing = false;
  },
};

export default bridge;
