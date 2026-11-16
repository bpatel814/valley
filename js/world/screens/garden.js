// garden.js - one friendly mark at a time. Explore begins with pre-writing paths;
// Grow and Challenge bring in letters after the child already knows the loop.

import { Tracer } from "../../engine/tracer.js";
import { shouldAccept } from "../../engine/pen.js";
import { Character, characterSVG, glyphSVG } from "../characters.js";
import { celebrate } from "../fx.js";
import router, { homeButton, muteButton, tapify, recoveryAction } from "../router.js";
import bus from "../bus.js";
import { letterHue, P } from "../palette.js";
import { addScenery, picture } from "../scene.js";
import { GLYPHS } from "../../data/letters.js";
import { PREWRITING_SEQUENCE, getPrewritingGlyph } from "../../data/prewriting.js";
import { pickNext } from "../../engine/adaptive.js";
import settings from "../../state/settings.js";
import progress from "../../state/progress.js";
import resume from "../../state/resume.js";
import { gardenDraftKey, loadGardenDrafts, saveGardenDraft, flushGardenDraftWrites } from "../../state/garden-drafts.js";
import speech from "../../audio/speech.js";
import sfx from "../../audio/sfx.js";
import pip from "../pip.js";
import { poolFor } from "./map.js";

const NAME_LETTERS = ["R", "A", "Y", "N"];
// After a finished mark has been celebrated, the bloom stays this long before the
// next mark slides in by itself. A tap anywhere (except the tools) skips ahead.
export const FLOW_HOLD_MS = 1500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const copy = value => JSON.parse(JSON.stringify(value));

// Saved completion cannot depend indefinitely on a throttled animation clock.
async function waitForVisual(pending, milliseconds) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve(pending).catch(() => {}),
      new Promise(resolve => { timer = setTimeout(resolve, milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}

// The endpoints sit just beyond the 14..86 glyph bounds. They explain the mark without
// putting scenery beneath the child's pen. Rain carries a drop; the other garden paths
// carry a leaf-seed. The flower opens in the same place when the mark is complete.
const GARDEN_ACTIONS = Object.freeze({
  rain: Object.freeze({ start: [30, 7], goals: [[50, 93]], startArt: "stories/raindrop" }),
  path: Object.freeze({ start: [7, 15], goals: [[93, 52]], startArt: "ui/leaf_badge" }),
  hill: Object.freeze({ start: [7, 15], goals: [[93, 78]], startArt: "ui/leaf_badge" }),
  rainbow: Object.freeze({ start: [7, 15], goals: [[93, 80]], startArt: "ui/leaf_badge" }),
  bubble: Object.freeze({ start: [40, 7], goals: [[94.5, 22]], startArt: "ui/leaf_badge" }),
  rocketTrail: Object.freeze({ start: [7, 15], goals: [[93, 80]], startArt: "ui/leaf_badge" }),
  cross: Object.freeze({ start: [30, 7], goals: [[50, 93], [93, 50]], startArt: "ui/leaf_badge" }),
});

export function gardenActionPlan(item) {
  return GARDEN_ACTIONS[item] || null;
}

export function fitGardenPaper(width, height) {
  return Math.max(0, Math.min(Number(width) || 0, Number(height) || 0) - 8);
}

function actionArt(key, className) {
  const image = picture(key, { className });
  if (image) return image;
  const fallback = document.createElement("span");
  fallback.className = className + " garden-action__art-fallback";
  return fallback;
}

function gardenAction(item) {
  const plan = gardenActionPlan(item);
  if (!plan) return null;
  const context = document.createElement("div");
  context.className = "garden-action garden-action--" + item;
  context.dataset.action = item;
  context.setAttribute("aria-label", "Your little garden path");

  if (item === "rain") {
    const link = document.createElement("span");
    link.className = "garden-action__rain-link";
    context.appendChild(link);
    const traveler = document.createElement("span");
    traveler.className = "garden-action__traveler";
    traveler.appendChild(actionArt(plan.startArt, "garden-action__traveler-art"));
    context.appendChild(traveler);
  }

  const start = document.createElement("span");
  start.className = "garden-action__endpoint garden-action__start";
  start.style.setProperty("--action-x", plan.start[0] + "%");
  start.style.setProperty("--action-y", plan.start[1] + "%");
  start.appendChild(actionArt(plan.startArt, "garden-action__start-art"));
  context.appendChild(start);

  for (const [x, y] of plan.goals) {
    const goal = document.createElement("span");
    goal.className = "garden-action__endpoint garden-action__goal";
    if (y >= 90 && x >= 35 && x <= 65) goal.classList.add("garden-action__endpoint--bottom-center");
    goal.style.setProperty("--action-x", x + "%");
    goal.style.setProperty("--action-y", y + "%");
    goal.innerHTML = '<span class="garden-action__bud"><i></i><i></i></span>';
    goal.appendChild(actionArt("stickers/draw_flower", "garden-action__flower"));
    context.appendChild(goal);
  }
  return context;
}

function reduced() {
  return document.documentElement.classList.contains("reduced-motion") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function attemptId(prefix) {
  const rand = Math.random().toString(36).slice(2, 9);
  return prefix + ":" + Date.now().toString(36) + ":" + rand;
}

function letterState(char) {
  const st = progress.get() || {};
  return (st.letters && st.letters[char]) || { fed: 0, level: 0, hatched: false };
}

function preview(glyph, color = P.lilacDeep) {
  if (!glyph || !Array.isArray(glyph.strokes)) return "";
  return '<svg viewBox="0 0 100 100" aria-hidden="true">' + glyph.strokes.map((d) =>
    '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'
  ).join("") + "</svg>";
}

export const garden = {
  id: "garden",
  _offs: [],
  _timers: [],

  async mount(host, params = {}) {
    this._offs = [];
    this._timers = [];
    this._alive = true;
    this._visit = {};
    this._penDown = false;
    this._celebrating = false;
    this._hatching = false;
    this._moving = false;
    this._checkpointing = false;
    this._completed = false;
    this._draftWrite = null;
    this._resetRecovery = null;
    this._independent = false;
    this._restoring = false;
    this._editSerial = 0;
    this.host = host;

    const s = settings.get() || {};
    this.mode = ["grow", "challenge"].includes(s.learningLevel) ? s.learningLevel : "explore";
    this.pool = poolFor(s.pool);

    const root = document.createElement("div");
    root.className = "garden learning-screen";
    root.innerHTML =
      '<header class="garden-header"><div class="garden-nav"></div><div class="garden-current"></div><div class="garden-sound"></div></header>' +
      '<main class="garden-play"><div class="garden-friend"></div><div class="garden-stage"></div></main>' +
      '<footer class="garden-dock"><div class="garden-tool-host"></div><div class="garden-next"></div></footer>' +
      '<div class="sticker-corner"></div>';
    host.appendChild(root);
    addScenery(root, "garden", { foreground: false });
    this.root = root;
    root.addEventListener('pointerdown', event => {
      if (this._checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    this.friendHost = root.querySelector(".garden-friend");
    this.stage = root.querySelector(".garden-stage");
    this.nextHost = root.querySelector(".garden-next");
    this.toolHost = root.querySelector(".garden-tool-host");
    this.currentHost = root.querySelector(".garden-current");
    this.corner = root.querySelector(".sticker-corner");
    this.corner.innerHTML = characterSVG("butterfly", { hue: P.lilac });

    this._home = homeButton();
    this._mute = muteButton();
    root.querySelector(".garden-nav").appendChild(this._home);
    root.querySelector(".garden-sound").appendChild(this._mute);

    this._offs.push(bus.on("stroke:start", () => { if (this._alive) this._penDown = true; }));
    this._offs.push(bus.on("stroke:end", () => { if (this._alive) this._penDown = false; }));

    const visit = this._visit;
    await this._openSavedGarden(params, visit);
  },

  async _openSavedGarden(params, visit) {
    if (!this._alive || this._visit !== visit || this._openingGarden) return;
    this._openingGarden = true;
    if (this._gardenRetry) this._gardenRetry.disabled = true;
    let saved;
    try { saved = await loadGardenDrafts(); }
    catch {
      if (!this._alive || this._visit !== visit) return;
      if (!this._gardenRecovery) {
        const notice = document.createElement('section'); notice.className = 'garden-load-recovery'; notice.setAttribute('role', 'status');
        const text = document.createElement('p'); text.textContent = 'Your garden marks could not be opened. Try again, or go Home.';
        const retry = recoveryAction('replay', 'Try again', () => { void this._openSavedGarden(params, visit); });
        notice.append(text, retry); this.stage.append(notice); this._gardenRecovery = notice; this._gardenRetry = retry;
      }
      return;
    } finally {
      if (this._visit === visit) { this._openingGarden = false; if (this._gardenRetry) this._gardenRetry.disabled = false; }
    }
    if (!this._alive || this._visit !== visit) return;
    this._gardenRecovery?.remove(); this._gardenRecovery = null; this._gardenRetry = null;
    const restoredMode = params.mode === this.mode ? params.mode : null;
    const requested = restoredMode ? (params.item || params.char) : null;
    const last = saved.drafts[saved.lastByMode[this.mode]];
    const first = requested || last?.item || this._pick(null);
    const stored = saved.drafts[gardenDraftKey(first, this.mode)];
    const legacy = restoredMode && params.traceSnapshot;
    this._load(first, stored?.traceSnapshot || legacy || null, stored ? null : params.strokes || null, stored?.attemptId || params.attemptId || null, stored);
    const completed = stored ? stored.completed : !!(restoredMode && params.completed);
    this._paperResize = () => this._layoutPaper();
    this._paperObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this._paperResize) : null;
    this._paperObserver?.observe(this.stage);
    window.addEventListener('resize', this._paperResize);
    if (completed) {
      this._turnDone = true;
      this._completed = true;
      if (this.actionContext) this.actionContext.classList.add("is-arrived", "is-complete");
      this._bloom(2, { still: true });
      this._offerNext(true);
    }
    await this._saveResume(completed);
  },

  _pick(last) {
    if (this.mode === "explore") {
      const plays = ((progress.get().journey || {}).plays || 0);
      const at = Math.max(0, PREWRITING_SEQUENCE.indexOf(last));
      return PREWRITING_SEQUENCE[last ? (at + 1) % PREWRITING_SEQUENCE.length : plays % PREWRITING_SEQUENCE.length];
    }
    const st = progress.get() || {};
    const ordered = [...new Set([...NAME_LETTERS, ...this.pool])];
    const newName = NAME_LETTERS.find((char) => char !== last && !(st.letters[char] && st.letters[char].hatched));
    if (newName) return newName;
    try {
      const char = pickNext(ordered, st.letters || {}, last, Date.now());
      if (char) return char;
    } catch (_) {
      // The simple order below is a safe fallback if adaptive state is incomplete.
    }
    return ordered.find((char) => char !== last) || ordered[0] || "R";
  },

  _resolve(item) {
    if (this.mode === "explore") {
      const id = PREWRITING_SEQUENCE.includes(item) ? item : PREWRITING_SEQUENCE[0];
      return { id, kind: "prewriting", glyph: getPrewritingGlyph(id), char: null };
    }
    const char = GLYPHS[item] ? item : "R";
    return { id: char, kind: "trace", glyph: GLYPHS[char], char };
  },

  _level(char) {
    if (this.mode === "explore") return 0;
    const learned = letterState(char).level || 0;
    if (this.mode === "grow") return Math.min(1, learned);
    return Math.max(2, Math.min(3, learned));
  },

  _load(item, traceSnapshot, strokes, savedAttemptId, stored = null) {
    const turn = this._resolve(item);
    if (!turn.glyph) return;
    this._disarmFlow();
    this._cheer(false);
    this._bloomEl = null;
    this.item = turn.id;
    this.kind = turn.kind;
    this.char = turn.char;
    this.glyph = turn.glyph;
    this._attemptId = savedAttemptId || attemptId("garden:" + this.mode + ":" + this.item);
    this._turnDone = false;
    this._completed = false;
    this._okIdx = -1;
    this._resetRecovery = stored?.resetRecovery ? copy(stored.resetRecovery) : null;
    this._independent = stored?.independent === true;
    this._restoring = false;
    this._editSerial = 0;
    this._clearToolGuards();

    if (this.cat) this.cat.destroy();
    const journey = progress.get().journey || {};
    const segments = this.mode === "explore"
      ? Math.min(6, (journey.petals || 0) * 2)
      : Math.round((letterState(this.char).fed || 0) * 6);
    this.cat = new Character(this.friendHost, {
      name: "caterpillar",
      letter: this.char || "",
      segments,
      follow: true,
    });

    if (this._actionResizeObserver) this._actionResizeObserver.disconnect();
    this._actionResizeObserver = null;
    this.stage.innerHTML = "";
    const cue = document.createElement("div");
    cue.className = "learning-picture-cue";
    cue.innerHTML = this.kind === "trace" ? glyphSVG(this.char, P.lilacDeep) : preview(this.glyph);
    cue.setAttribute("aria-hidden", "true");
    const box = document.createElement("div");
    box.className = "trace-box";
    this.currentHost.replaceChildren(cue);
    this.stage.append(box);
    this.box = box;
    this._layoutPaper();
    this.actionContext = this.kind === "prewriting" ? gardenAction(this.item) : null;
    if (this.actionContext) box.appendChild(this.actionContext);

    const level = this._level(this.char);
    if (level === 3 && this.char) {
      const model = document.createElement("div");
      model.className = "model-letter";
      model.innerHTML = glyphSVG(this.char, P.lilacDeep);
      this.stage.appendChild(model);
    }

    let tracer;
    this.tracer = tracer = new Tracer(box, {
      glyph: this.glyph,
      toolHost: this.toolHost,
      level,
      handedness: settings.get().handedness,
      allowFinger: !settings.get().penOnly,
      detectScribble: true,
      autoEvaluate: !this._independent,
      onResult: (result) => { if (this.tracer === tracer) return this._result(result, this._attemptId); },
      onProgress: (i) => this._progress(i),
      onStrokeEnd: () => this._afterStrokeEdit(),
    });
    this._placeSceneTools();
    if (this.host) this.host._tracer = this.tracer;
    if (this.actionContext && this.item === "rain") {
      this._layoutRainAction();
      if (typeof ResizeObserver === "function") {
        this._actionResizeObserver = new ResizeObserver(() => this._layoutRainAction());
        this._actionResizeObserver.observe(this.box);
      }
      requestAnimationFrame(() => this._layoutRainAction());
    }
    let restored = false;
    this._restoring = this._independent;
    try {
      if (traceSnapshot && this.tracer.loadSnapshot) restored = this.tracer.loadSnapshot(traceSnapshot) === true;
      if (!restored && strokes && strokes.length && this.tracer.load) this.tracer.load(strokes);
    } finally { this._restoring = false; }

    this.nextHost.innerHTML = "";
    this._nextItem = null;
    this._refreshRecovery();
    if (this.kind === "trace") speech.letter(this.char);
    else speech.say(this.glyph.phraseKey);
  },

  _clearToolGuards() {
    for (const [button, guard] of this._toolGuards || []) button.removeEventListener('click', guard, true);
    this._toolGuards = [];
  },

  _layoutPaper() {
    if (!this._alive || !this.box || !this.stage || this.tracer?.pen?.drawing) return;
    const size = fitGardenPaper(this.stage.clientWidth, this.stage.clientHeight);
    if (!size) return;
    this.box.style.width = `${size}px`; this.box.style.height = `${size}px`;
    this.tracer?.resize?.();
  },

  _placeSceneTools() {
    const tracer = this.tracer;
    if (!tracer?.tools) return;
    const show = tracer.tools.querySelector('.rv-btn--show');
    if (show) {
      // Show-direction lives in the dock, first in the row before Undo and Start
      // again, never on the paper beside the start dot or under her finger.
      show.classList.add('garden-show-me');
      show.setAttribute('aria-label', this.kind === 'prewriting' ? 'Show the direction of this garden path' : 'Show this letter stroke');
      if (tracer.tools.firstElementChild !== show) tracer.tools.prepend?.(show);
    }
    for (const button of [show, ...tracer.tools.querySelectorAll('.rv-btn')].filter(Boolean)) {
      const guard = event => {
        if (!this._alive || this.tracer !== tracer || tracer.pen?.drawing || this._checkpointing || this._moving || this._hatching) {
          event.preventDefault(); event.stopImmediatePropagation();
        }
      };
      button.addEventListener('click', guard, true); this._toolGuards.push([button, guard]);
    }
    tracer.tools.querySelector('.rv-btn--clear')?.setAttribute('aria-label', 'Start this mark again');
  },

  _captureDraft(completed = this._completed) {
    if (!this.tracer?.snapshot) return null;
    const draft = { mode: this.mode, item: this.item, attemptId: this._attemptId,
      completed: !!completed, traceSnapshot: this.tracer.snapshot() };
    if (this._resetRecovery) draft.resetRecovery = copy(this._resetRecovery);
    if (this._independent) draft.independent = true;
    return draft;
  },

  _saveNotice(message) {
    if (!this._alive || !this.nextHost) return;
    let note = this.nextHost.querySelector?.('.garden-save-notice');
    if (!message) { note?.remove(); return; }
    if (!note) { note = document.createElement('p'); note.className = 'garden-save-notice'; note.setAttribute('role', 'status'); this.nextHost.append(note); }
    note.textContent = message;
  },

  _saveResume(completed) {
    if (!this._alive || !this.tracer) return Promise.resolve(null);
    const draft = this._captureDraft(completed);
    if (!draft) return Promise.resolve(null);
    return this._writeDraft(draft);
  },

  _writeDraft(draft) {
    const tracer=this.tracer, visit=this._visit;
    // Heavy, exact ink has its own durable per-subject store. Route resume is light.
    const pending = saveGardenDraft(draft).then(async result => {
      await resume.save({ screen: 'garden', params: { mode: draft.mode, item: draft.item,
        char: draft.mode === "explore" ? null : draft.item, attemptId: draft.attemptId, completed: draft.completed }, strokes: [] });
      if (this._alive && this._visit === visit && this.tracer === tracer && this._draftWrite === pending) {
        this._saveNotice(result?.persistent ? '' : 'Your mark is here for now. Device saving is unavailable; keep this page open.');
      }
      return result;
    });
    this._draftWrite = pending;
    void pending.catch(() => {
      if (this._alive && this._visit === visit && this.tracer === tracer && this._draftWrite === pending) this._saveNotice('Saving did not finish. Your mark is still open. Try Home again to retry.');
    });
    return pending;
  },

  async _checkpoint() {
    if (!this._alive || !this.tracer) { await flushGardenDraftWrites(); return true; }
    if (this._checkpointing || this._penDown || this.tracer.pen?.drawing || this._moving) return false;
    const visit = this._visit, tracer = this.tracer;
    this._checkpointing = true;
    try {
      await this._draftWrite?.catch(() => {});
      if (!this._alive || this._visit !== visit || this.tracer !== tracer) return false;
      await this._saveResume(this._completed);
      return this._alive && this._visit === visit && this.tracer === tracer;
    } catch { return false; }
    finally { if (this._alive && this._visit === visit && this.tracer === tracer) this._checkpointing = false; }
  },

  beforeLeave() { return this._checkpoint(); },
  beforeBreak() { return this._checkpoint(); },

  _afterStrokeEdit() {
    if (this._restoring) return;
    this._editSerial=(this._editSerial || 0)+1;
    this._layoutPaper();
    if (this._turnDone) {
      this._visit = {};
      this._turnDone = false;
      this._completed = false;
      this._celebrating = false;
      this._hatching = false;
      this._okIdx = -1;
      // Recognition can happen before the child's final finishing stroke. Retire
      // that visual response, then recognize the edited paper again on this lift.
      // Keep its attempt identity so polishing one letter cannot credit it twice.
      this.tracer?.continueDrawing?.();
      this._disarmFlow();
      this._unbloom();
      this._cheer(false);
      this.nextHost.innerHTML = "";
      if (this.actionContext) this.actionContext.classList.remove("is-complete", "is-arrived", "is-carrying", "is-bloom-focus");
    }
    if (!this.tracer?.snapshot().strokes.length) this._attemptId = attemptId("garden:" + this.mode + ":" + this.item);
    if (this._independent && !this.tracer?.snapshot().strokes.length) {
      this._independent=false; this.tracer.autoEvaluate=true;
    }
    this._refreshRecovery();
    this._saveResume(false);
  },

  _progress(i) {
    if (this._restoring) return;
    if (typeof i === "number" && i > this._okIdx) {
      this._okIdx = i;
      this._nibble();
    }
  },

  _nibble() {
    if (!this.cat || this._turnDone) return;
    sfx.play("pop");
    this.cat.set("happy");
    this.cat.bounce();
    const cat = this.cat;
    const timer = setTimeout(() => { if (this._alive && this.cat === cat) cat.set("idle"); }, 500);
    this._timers.push(timer);
  },

  _layoutRainAction() {
    if (!this._alive || this.item !== "rain" || !this.actionContext || !this.tracer?.box || !this.box) return;
    const layout = this.tracer.box;
    const width = this.box.clientWidth;
    const height = this.box.clientHeight;
    if (!width || !height) return;
    const pathX = layout.x + layout.w * 0.5;
    const startY = layout.y + layout.h * 0.14;
    const endY = layout.y + layout.h * 0.86;
    const radius = window.matchMedia('(max-height:440px) and (orientation:landscape)').matches ? 22 : 25;
    const short = endY + radius * 2 + 10 > height;
    const goalX = short ? Math.min(width - radius - 6, pathX + radius + 12) : pathX;
    let goalY = Math.min(height - radius - 6, endY + radius + 4);
    for (const tool of this.box.querySelectorAll(".rv-btn:not(.garden-show-me)")) {
      const boxRect = this.box.getBoundingClientRect();
      const rect = tool.getBoundingClientRect();
      const left = rect.left - boxRect.left;
      const right = rect.right - boxRect.left;
      if (pathX + radius > left && pathX - radius < right) {
        goalY = Math.min(goalY, rect.top - boxRect.top - radius - 2);
      }
    }
    if (!short) goalY = Math.max(endY + radius, goalY);
    const context = this.actionContext;
    context.style.setProperty("--rain-path-x", pathX + "px");
    context.style.setProperty("--rain-start-y", startY + "px");
    context.style.setProperty("--rain-end-y", endY + "px");
    context.style.setProperty("--rain-goal-y", goalY + "px");
    const arrivalY = goalY - radius + 6;
    context.style.setProperty("--rain-arrival-y", arrivalY + "px");
    context.style.setProperty("--rain-arrival-x", goalX + "px");
    const goal = context.querySelector(".garden-action__goal");
    if (goal) {
      goal.style.left = goalX + "px";
      goal.style.top = goalY + "px";
    }
    const sourceX = width * 0.3;
    const sourceY = height * 0.07;
    const dx = pathX - sourceX;
    const dy = startY - sourceY;
    const link = context.querySelector(".garden-action__rain-link");
    if (link) {
      link.style.left = sourceX + "px";
      link.style.top = sourceY + "px";
      link.style.width = Math.max(0, Math.hypot(dx, dy) - 26) + "px";
      link.style.transform = "rotate(" + Math.atan2(dy, dx) + "rad)";
    }
    this._rainGeometry = { pathX, startY, endY, goalX, goalY, arrivalY };
  },

  async _revealActionConsequence(visit, item) {
    const context = this.actionContext;
    if (!context) return this._active(visit, item);
    if (item !== "rain") {
      context.classList.add("is-complete");
      return this._active(visit, item);
    }
    this._layoutRainAction();
    const traveler = context.querySelector(".garden-action__traveler");
    context.classList.add("is-carrying");
    if (!reduced() && traveler && this._rainGeometry && traveler.animate) {
      const { pathX, startY, endY, goalX, arrivalY } = this._rainGeometry;
      const motion = traveler.animate([
        { left: pathX + "px", top: startY + "px", opacity: 0.2, offset: 0 },
        { left: pathX + "px", top: startY + "px", opacity: 1, offset: 0.08 },
        { left: pathX + "px", top: endY + "px", opacity: 1, offset: 0.84 },
        { left: goalX + "px", top: arrivalY + "px", opacity: 0.9, offset: 1 },
      ], { duration: 820, easing: "cubic-bezier(.3,.05,.2,1)", fill: "forwards" });
      await waitForVisual(motion.finished, 1100);
      if (!this._active(visit, item)) { motion.cancel(); return false; }
      context.classList.add("is-arrived");
      motion.cancel();
    } else {
      context.classList.add("is-arrived");
      await sleep(180);
      if (!this._active(visit, item)) return false;
    }
    context.classList.add("is-complete", "is-bloom-focus");
    await sleep(reduced() ? 520 : 900);
    if (!this._active(visit, item)) return false;
    context.classList.remove("is-bloom-focus", "is-carrying");
    return true;
  },

  async _result(result, resultAttemptId) {
    if (!this._alive || this._turnDone || this._restoring || this._checkpointing || this._penDown || this.tracer?.pen?.drawing || resultAttemptId !== this._attemptId) return;
    if (this._independent) { this.tracer?.continueDrawing?.(); return; }
    // A terminal retry guards duplicate responses but is still unfinished ink.
    this._turnDone = true;
    this._completed = false;
    const visit = this._visit;
    const item = this.item;
    const char = this.char;
    const kind = this.kind;
    const tier = Math.max(0, Math.min(3, (result && result.tier) | 0));
    this._celebrating = true;

    if (result && result.reason === "scribble") {
      return this._guidedReset(visit,item);
    }

    if (tier === 0) {
      speech.retry();
      await celebrate(0, this.cat, null);
      if (!this._active(visit, item)) return;
      this._celebrating = false;
      this._offerRetry();
      return;
    }

    this._completed = true;
    const play = await progress.recordPlay(kind, item, resultAttemptId);
    // A finishing edit retires the visual visit, but this same accepted paper
    // still owns its one letter credit. A different paper or retired screen does not.
    if (kind === "trace" && play.credited && this._alive && this.item === item && this._attemptId === resultAttemptId) await progress.recordTrace(char, tier);
    if (!this._active(visit, item)) return;
    this._saveResume(true);

    if (!(await this._revealActionConsequence(visit, item))) return;
    this._bloom(tier);
    this._cheer(true);

    if (this.cat) {
      await waitForVisual(this.cat.anticipate(), 900);
      if (!this._active(visit, item)) return;
      const petals = (progress.get().journey || {}).petals || 0;
      const before = (this.cat.o && this.cat.o.segments) | 0;
      this.cat.setSegments(this.mode === "explore" ? petals * 2 : Math.round((letterState(char).fed || 0) * 6));
      this._popSegments(before, (this.cat.o && this.cat.o.segments) | 0);
    }
    speech.praise(tier);
    await celebrate(tier, this.cat, null);
    if (!this._active(visit, item)) return;

    if (play.rewarded && play.credited) {
      this._celebrating = false;
      await this._hatch(item, visit);
      return;
    }
    this._celebrating = false;
    this._offerNext(true, { flow: true });
  },

  // The finished mark becomes a big flower behind her own line: the reward fills
  // the paper instead of a 30 px bud at the edge. Removed on any edit or new mark.
  _bloom(tier, { still = false } = {}) {
    if (!this._alive || !this.box?.appendChild) return;
    this._unbloom();
    const bloom = document.createElement("div");
    bloom.className = "garden-bloom garden-bloom--tier" + Math.max(1, Math.min(3, tier | 0)) + (still || reduced() ? " is-still" : "");
    bloom.setAttribute("aria-hidden", "true");
    bloom.appendChild(actionArt("stickers/draw_flower", "garden-bloom__flower"));
    this.box.appendChild(bloom);
    this._bloomEl = bloom;
  },

  _unbloom() {
    this._bloomEl?.remove?.();
    this._bloomEl = null;
  },

  // The caterpillar steps forward and grows while it celebrates with her.
  _cheer(on) {
    this.friendHost?.classList?.toggle?.("garden-friend--cheer", !!on);
  },

  // Each newly earned stripe pops so she can see the caterpillar grow.
  _popSegments(before, after) {
    if (reduced() || !this.cat?.progressEl?.querySelector || after <= before) return;
    for (let i = before; i < after; i++) {
      const dot = this.cat.progressEl.querySelector(`[data-progress-i="${i}"]`);
      dot?.animate?.([
        { transform: "scale(.4)" },
        { transform: "scale(1.9)", offset: 0.5 },
        { transform: "scale(1)" },
      ], { duration: 900, delay: (i - before) * 180, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "backwards" });
    }
  },

  // Keep the flow going: after the celebration the next mark arrives by itself,
  // and a tap anywhere outside the tools skips straight to it. Undo, Start again
  // and Show stay usable (any edit cancels the move), so she can repeat a mark.
  _armFlow(next) {
    this._disarmFlow();
    if (!this._alive || !this.root?.addEventListener) return;
    const visit = this._visit, item = this.item;
    const ready = () => this._active(visit, item) && this._turnDone && this._completed && !this._moving &&
      !this._hatching && !this._checkpointing && !this._penDown && !this.tracer?.pen?.drawing;
    const go = () => {
      this._disarmFlow();
      if (!ready()) return;
      try { Promise.resolve(this._advance(next)).catch(() => {}); } catch (_) {}
    };
    const skip = (event) => {
      if (!ready() || (event.button !== undefined && event.button !== 0)) return;
      if (event.target?.closest?.(".garden-header, .garden-tool-host, .garden-next")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      go();
    };
    this.root.addEventListener("pointerdown", skip, true);
    const timer = setTimeout(go, FLOW_HOLD_MS);
    this._timers.push(timer);
    this._flow = { skip, timer, root: this.root };
  },

  _disarmFlow() {
    const flow = this._flow;
    this._flow = null;
    if (!flow) return;
    clearTimeout(flow.timer);
    flow.root?.removeEventListener?.("pointerdown", flow.skip, true);
  },

  _active(visit, item) {
    return this._alive && this._visit === visit && this.item === item;
  },

  _recoveryEntry(draft) {
    const entry={version:1,attemptId:draft.attemptId,completed:draft.completed,traceSnapshot:copy(draft.traceSnapshot)};
    if (draft.independent) entry.independent=true;
    return entry;
  },

  _keepResetMarks(message) {
    this._turnDone=false; this._completed=false; this._celebrating=false; this._independent=true;
    this.tracer.autoEvaluate=false; this.tracer.continueDrawing();
    this._refreshRecovery(); this._saveNotice(message);
  },

  async _guidedReset(visit,item) {
    const tracer=this.tracer, before=this._captureDraft(false), edit=this._editSerial;
    if (!before || !before.traceSnapshot.strokes.length) { this._turnDone=false; this._completed=false; this._celebrating=false; return false; }
    if (this._resetRecovery) {
      this._keepResetMarks('Your new marks are still here. Your earlier marks can also be brought back.');
      await this._saveResume(false).catch(()=>{}); return false;
    }
    const recovery=this._recoveryEntry(before), after=copy(before.traceSnapshot); after.strokes.pop();
    this._checkpointing=true;
    try {
      // Both papers land together before an automatic reset changes live ink.
      const result=await this._writeDraft({...before,traceSnapshot:after,resetRecovery:recovery});
      if (!result) throw new Error('garden-draft-invalid');
      if (!this._active(visit,item) || this.tracer !== tracer) return false;
      this._resetRecovery=recovery;
      if (!result.persistent) {
        this._keepResetMarks('Your marks are still here. Device saving is unavailable; keep this page open.');
        await this._saveResume(false).catch(()=>{}); return false;
      }
      if (this._penDown || tracer.pen?.drawing || edit !== this._editSerial || JSON.stringify(tracer.snapshot()) !== JSON.stringify(before.traceSnapshot)) {
        this._keepResetMarks('Your current marks are still here. Your earlier marks can also be brought back.'); await this._saveResume(false).catch(()=>{}); return false;
      }
      await speech.say('ui_scribble_reset'); await sleep(220);
      if (!this._active(visit,item) || this.tracer !== tracer) return false;
      if (this._penDown || tracer.pen?.drawing || edit !== this._editSerial || JSON.stringify(tracer.snapshot()) !== JSON.stringify(before.traceSnapshot)) {
        this._keepResetMarks('Your current marks are still here. Your earlier marks can also be brought back.'); await this._saveResume(false).catch(()=>{}); return false;
      }
      this._restoring=true;
      try { tracer.discardLastAttempt(); } finally { this._restoring=false; }
      this._turnDone=false; this._completed=false; this._celebrating=false; this.nextHost.innerHTML='';
      this._refreshRecovery();
      this._saveNotice(result.persistent ? '' : 'Your earlier marks can be brought back here for now. Device saving is unavailable; keep this page open.');
      return true;
    } catch {
      if (this._active(visit,item) && this.tracer === tracer) this._keepResetMarks('Saving did not finish. Your marks were not removed. Try Home again to retry keeping them.');
      return false;
    } finally { if (this._active(visit,item) && this.tracer === tracer) this._checkpointing=false; }
  },

  _refreshRecovery() {
    this._recoveryButton?.remove(); this._recoveryButton=null;
    if (!this._alive || !this._resetRecovery || !this.toolHost || !this.tracer) return;
    const tracer=this.tracer,visit=this._visit,item=this.item,button=document.createElement('button');
    button.type='button';button.className='rv-btn garden-recovery tap';button.style.marginInlineStart='12px';
    button.setAttribute('aria-label','Bring back my last marks');button.setAttribute('aria-description','Your current paper stays available when you bring back the earlier marks.');
    const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;canvas.style.cssText='width:100%;height:100%';canvas.setAttribute('aria-hidden','true');
    const context=canvas.getContext?.('2d'),strokes=this._resetRecovery.traceSnapshot.strokes;
    if (context) {
      let minX=0,minY=0,maxX=100,maxY=100;
      for(const stroke of strokes)for(const p of stroke){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
      const scale=40/Math.max(maxX-minX,maxY-minY,1);context.strokeStyle=P.lilacDeep;context.lineWidth=2;context.lineCap='round';
      for(const stroke of strokes){context.beginPath();stroke.forEach((p,i)=>{const x=4+(p.x-minX)*scale,y=4+(p.y-minY)*scale;if(i)context.lineTo(x,y);else context.moveTo(x,y);});context.stroke();}
    }
    const arrow=document.createElement('img');arrow.src='assets/art/final/ui/undo.webp';arrow.alt='';arrow.style.cssText='position:absolute;width:22px;height:22px;right:0;bottom:0;object-fit:contain';button.style.position='relative';button.append(canvas,arrow);
    const rejected=new Map();let legacyUntil=0;
    button.addEventListener('pointerdown',event=>{
      if (!this._active(visit,item) || this.tracer !== tracer || button.isConnected === false) { event.preventDefault();event.stopImmediatePropagation();return; }
      const now=performance.now();
      const lastPenAt=Math.max(tracer.pen?.lastPenAt ?? -Infinity,this._recoveryPenAt ?? -Infinity);
      if(event.pointerType==='pen')this._recoveryPenAt=now;
      if(event.button !== 0 || !shouldAccept({pointerType:event.pointerType,lastPenAt,now,allowFinger:!settings.get().penOnly}) || this._penDown || tracer.pen?.drawing || this._checkpointing || this._moving || this._celebrating){rejected.set(event.pointerId,Infinity);event.preventDefault();event.stopImmediatePropagation();}
      else {rejected.delete(event.pointerId);legacyUntil=0;}
    });
    for(const type of ['pointerup','pointercancel'])button.addEventListener(type,event=>{if(type==='pointercancel'||rejected.has(event.pointerId)){const until=performance.now()+700;rejected.set(event.pointerId,until);legacyUntil=until;}});
    tapify(button,event=>{
      const now=performance.now(),blocked=event.pointerId === undefined ? legacyUntil>=now && event.detail !== 0 : rejected.get(event.pointerId)>=now;
      if(blocked || !this._active(visit,item) || this.tracer !== tracer || button.isConnected === false || this._penDown || tracer.pen?.drawing || this._checkpointing || this._moving || this._celebrating || this._hatching)return;
      void this._recoverLastMarks();
    });
    this.toolHost.append(button);this._recoveryButton=button;
  },

  async _recoverLastMarks() {
    if (!this._alive || !this.tracer || !this._resetRecovery || this._penDown || this.tracer.pen?.drawing || this._checkpointing || this._moving || this._celebrating || this._hatching) return false;
    const tracer=this.tracer,visit=this._visit,item=this.item,before=this._captureDraft(),recovery=copy(this._resetRecovery),edit=this._editSerial;
    const next={...before,attemptId:recovery.attemptId,completed:recovery.completed,traceSnapshot:copy(recovery.traceSnapshot),independent:true,resetRecovery:this._recoveryEntry(before)};
    this._checkpointing=true;
    try {
      const result=await this._writeDraft(next);
      if (!this._active(visit,item) || this.tracer !== tracer || this._penDown || tracer.pen?.drawing || edit !== this._editSerial || JSON.stringify(tracer.snapshot()) !== JSON.stringify(before.traceSnapshot)) return false;
      const evaluation=tracer.autoEvaluate;tracer.autoEvaluate=false;this._restoring=true;
      let loaded;
      try { loaded=tracer.loadSnapshot(next.traceSnapshot); } finally { this._restoring=false; }
      if(!loaded){tracer.autoEvaluate=evaluation;await this._writeDraft(before);this._saveNotice('Those marks could not be opened. Your current paper is still here.');return false;}
      this._visit={};this._attemptId=next.attemptId;this._turnDone=next.completed;this._completed=next.completed;this._celebrating=false;this._okIdx=-1;this._independent=true;this._resetRecovery=next.resetRecovery;
      this.nextHost.innerHTML='';this.actionContext?.classList.remove('is-complete','is-arrived','is-carrying','is-bloom-focus');
      if(next.completed){this.actionContext?.classList.add('is-arrived','is-complete');this._offerNext(false);}
      this._refreshRecovery();this._saveNotice('Your earlier marks are back. Your other paper can also be brought back.'+(result?.persistent ? '' : ' Device saving is unavailable; keep this page open.'));
      this._checkpointing=false;return true;
    } catch {
      if(this._active(visit,item) && this.tracer === tracer)this._saveNotice('Saving did not finish. Your current paper and earlier marks are still here. Try bringing them back again.');
      return false;
    } finally { if(this._active(visit,item) && this.tracer === tracer)this._checkpointing=false; }
  },

  _offerRetry() {
    if (!this._alive) return;
    this._disarmFlow();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "learning-choice learning-retry tap glow";
    button.setAttribute("aria-label", "try again");
    button.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M19 23 C30 9 54 17 52 36 C50 53 28 57 18 43" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M8 24 L20 23 L19 11" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    tapify(button, () => {
      if (!this._alive || !this.tracer || this._checkpointing || this._moving || this._penDown || this.tracer.pen?.drawing) return;
      sfx.play("tap");
      this._turnDone = false;
      this._completed = false;
      this._attemptId = attemptId("garden:" + this.mode + ":" + this.item);
      this.nextHost.innerHTML = "";
      if (this.actionContext) this.actionContext.classList.remove("is-complete", "is-arrived", "is-carrying", "is-bloom-focus");
      this.tracer.clear();
      this._saveResume(false);
    });
    this.nextHost.innerHTML = "";
    this.nextHost.appendChild(button);
  },

  _offerNext(glow, { flow = false } = {}) {
    if (!this._alive) return;
    const next = this._pick(this.item);
    const nextTurn = this._resolve(next);
    this._nextItem = next;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "learning-choice learning-next tap" + (glow ? " glow" : "");
    button.dataset.next = next;
    button.setAttribute("aria-label", "next picture");
    button.innerHTML =
      '<span class="learning-choice__picture">' +
      (nextTurn.kind === "trace" ? glyphSVG(nextTurn.char, P.lilacDeep) : preview(nextTurn.glyph)) +
      '</span><svg class="learning-choice__arrow" viewBox="0 0 64 64" aria-hidden="true"><path d="M13 32 H49 M37 18 L51 32 L37 46" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    tapify(button, () => { this._disarmFlow(); return this._advance(next); });
    this.nextHost.innerHTML = "";
    this.nextHost.appendChild(button);
    // In the flow the next mark comes by itself, so no "choose the next one" prompt.
    if (flow) { this._armFlow(next); return; }
    if (!pip.isOnboarding()) pip.flyTo(button, { dy: -0.7 });
    speech.say("ui_choose_next");
  },

  async _advance(next) {
    if (!this._alive || !next || this._moving || next === this.item) return;
    if (this._penDown || this.tracer?.pen?.drawing || !await this._checkpoint()) return;
    const visit = this._visit;
    this._moving = true;
    let saved;
    try { saved = await loadGardenDrafts(); }
    catch { if (this._alive && this._visit === visit) { this._moving = false; this._saveNotice('This mark could not be opened. Your current mark is still here.'); } return; }
    if (!this._alive || this._visit !== visit) return;
    const stored = saved.drafts[gardenDraftKey(next, this.mode)];
    sfx.play("tap");
    const panes = [this.friendHost, this.stage, this.nextHost];
    if (!reduced()) {
      await Promise.all(panes.map((pane) => pane.animate(
        [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-24px)" }],
        { duration: 210, easing: "cubic-bezier(.22,.61,.36,1)" }
      ).finished.catch(() => {})));
    }
    if (!this._alive || this._visit !== visit) return;
    if (this.tracer && this.tracer.destroy) this.tracer.destroy();
    this._load(next, stored?.traceSnapshot || null, null, stored?.attemptId || null,stored);
    if (stored?.completed) {
      this._turnDone = true;
      this._completed = true;
      this.actionContext?.classList.add('is-arrived', 'is-complete');
      this._bloom(2, { still: true });
      this._offerNext(true);
    }
    await this._saveResume(!!stored?.completed).catch(() => {});
    if (!reduced()) panes.forEach((pane) => pane.animate(
      [{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "none" }],
      { duration: 210, easing: "cubic-bezier(.22,.61,.36,1)" }
    ));
    this._moving = false;
  },

  async _hatch(item, visit) {
    if (!this._active(visit, item) || this._hatching) return;
    this._hatching = true;
    const overlay = document.createElement("div");
    overlay.className = "garden-hatch";
    this.friendHost.appendChild(overlay);

    const cocoon = new Character(overlay, { name: "cocoon", size: "100%", follow: false });
    cocoon.el.style.opacity = "0";
    if (!reduced() && cocoon.el.animate) {
      const motion = cocoon.el.animate(
        [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }],
        { duration: 600, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }
      );
      await waitForVisual(motion.finished, 900);
      motion.cancel();
    }
    if (!this._active(visit, item)) { cocoon.destroy(); overlay.remove(); return; }
    cocoon.el.style.opacity = "1";
    sfx.play("crack");
    if (!reduced() && cocoon.el.animate) cocoon.el.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(-3deg)" }, { transform: "rotate(3deg)" }, { transform: "rotate(0deg)" }],
      { duration: 900, easing: "ease-in-out" }
    );
    await sleep(900);
    if (!this._active(visit, item)) { cocoon.destroy(); overlay.remove(); return; }

    cocoon.destroy();
    const fly = new Character(overlay, { name: "butterfly", size: "100%", hue: letterHue(this.char || "R"), follow: false });
    speech.say("ui_butterfly_hatched");
    sfx.play("hatch");
    await celebrate(3, fly, null);
    if (this._active(visit, item)) await sleep(reduced() ? 250 : 650);
    fly.destroy();
    overlay.remove();
    if (!this._active(visit, item)) return;
    if (this.cat) this.cat.setSegments(0);
    this._hatching = false;
    this._offerNext(true, { flow: true });
  },

  busy() {
    return !!(this._penDown || this._celebrating || this._hatching || this._moving || this._checkpointing);
  },

  onBack() {
    router.go("map", {}, { dir: "right" });
  },

  unmount() {
    this._disarmFlow();
    this._unbloom();
    this._alive = false;
    this._visit = null;
    for (const timer of this._timers) clearTimeout(timer);
    this._timers = [];
    for (const off of this._offs) off();
    this._offs = [];
    this._clearToolGuards();
    this._recoveryButton?.remove();this._recoveryButton=null;
    this._gardenRecovery?.remove(); this._gardenRecovery=null; this._gardenRetry=null; this._openingGarden=false;
    if (this._actionResizeObserver) this._actionResizeObserver.disconnect();
    this._actionResizeObserver = null;
    this._paperObserver?.disconnect(); this._paperObserver = null;
    window.removeEventListener('resize', this._paperResize);
    if (this.tracer && this.tracer.destroy) this.tracer.destroy();
    this.tracer = null;
    if (this.cat) this.cat.destroy();
    this.cat = null;
    if (this._mute && this._mute.destroy) this._mute.destroy();
    this._mute = null;
    if (this.host) this.host._tracer = null;
    this._celebrating = false;
    this._hatching = false;
    this._moving = false;
  },
};

export default garden;


