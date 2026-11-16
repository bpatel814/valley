import { mountWordFriend, mountFamilyWordPicture } from '../word-friend.js';
import { seasonalWordArtKey } from '../../data/season.js';
// meadow.js - short, meaningful words written one friendly letter at a time.
// Finished letters keep the child's own ink. Nothing advances after a weak trace or
// after a reward until the child chooses a large picture button.

import { Tracer } from "../../engine/tracer.js";
import { Character, glyphSVG } from "../characters.js";
import { celebrate } from "../fx.js";
import router, { homeButton, muteButton, tapify, iconSVG, recoveryAction } from "../router.js";
import bus from "../bus.js";
import { P, RAINBOW } from "../palette.js";
import { addScenery, picture } from "../scene.js";
import art from "../art.js";
import { GLYPHS } from "../../data/letters.js";
import { WORDS, RETIRED_FAMILY_WORDS, wordInfo, wordsForLevel, nextWordChoices, wordGlyphs } from "../../data/words.js";
import settings from "../../state/settings.js";
import progress from "../../state/progress.js";
import resume from "../../state/resume.js";
import { loadMeadowLabel, loadMeadowLabelsChecked, saveMeadowLabel } from "../../state/meadow-labels.js";
import { loadMeadowDraft, loadMeadowDrafts, saveMeadowDraft, flushMeadowDraftWrites } from "../../state/meadow-drafts.js";
import db from "../../state/db.js";
import speech from "../../audio/speech.js";
import sfx from "../../audio/sfx.js";
import pip from "../pip.js";
import { isPreviewRouteEnabled } from "../../data/preview-access.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function reduced() {
  return document.documentElement.classList.contains("reduced-motion") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function attemptId(prefix) {
  return prefix + ":" + Date.now().toString(36) + ":" + Math.random().toString(36).slice(2, 9);
}

function letterState(char) {
  const st = progress.get() || {};
  return (st.letters && st.letters[char]) || { fed: 0, level: 0 };
}

function knownWord(raw) {
  const id = String(raw || "").trim().toUpperCase();
  return WORDS.some((entry) => entry.word === id) || Object.hasOwn(RETIRED_FAMILY_WORDS, id) ? id : null;
}

function retainedWordInfo(word) {
  const current = wordInfo(word);
  if (current) return current;
  const family = wordInfo(RETIRED_FAMILY_WORDS[word]);
  // Reuse the family picture while preserving the original word and its ink.
  return family ? { word, kind: 'name', art: family.art } : null;
}

function validTiers(raw, length) {
  if (!Array.isArray(raw) || raw.length !== length) return null;
  const out = [];
  let gap = false;
  for (const value of raw) {
    if (value == null) {
      gap = true;
      out.push(null);
      continue;
    }
    const tier = Number(value);
    if (gap || !Number.isInteger(tier) || tier < 1 || tier > 3) return null;
    out.push(tier);
  }
  return out;
}

function validSnapshots(raw, length) {
  if (!Array.isArray(raw) || raw.length !== length) return Array(length).fill(null);
  return raw.map((snap) => {
    if (!snap || snap.version !== 1 || snap.coordinateSpace !== "glyph" || !Array.isArray(snap.strokes)) return null;
    const valid = snap.strokes.every((stroke) => Array.isArray(stroke) && stroke.every((p) =>
      p && Number.isFinite(p.x) && Number.isFinite(p.y)
    ));
    return valid ? snap : null;
  });
}

export function fitMeadowPaper(width, height) {
  return Math.max(0, Math.floor(Math.min(width || 0, height || 0) - 8));
}

export function meadowStart(store, params, mode, fallback) {
  const offered = word => !wordInfo(word)?.archivedOnly;
  const explicit = params.mode === mode && knownWord(params.word)
    && (params.viewingSaved || offered(params.word)) && knownWord(params.word);
  const last = store.drafts?.[store.last];
  const word = explicit || (last?.mode === mode && offered(last.word) && knownWord(last.word)) || fallback;
  const owned = store.drafts?.[mode + ':' + word];
  if (explicit && params.viewingSaved) return { word, viewingSaved: true };
  if (owned) return owned;
  // A detailed older resume can bootstrap an empty slot once. It never replaces
  // an existing per-word attempt or assigns someone else's work to a new word.
  return explicit ? { ...params, word } : { word };
}

function drawInk(canvas, snapshot) {
  const strokes = snapshot && snapshot.strokes;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 60;
  const h = canvas.clientHeight || 60;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!Array.isArray(strokes) || !strokes.length) return;
  const k = Math.min(w, h) / 100;
  const ox = (w - 100 * k) / 2;
  const oy = (h - 100 * k) / 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  let color = 0;
  for (const stroke of strokes) {
    if (!stroke || stroke.length < 2) continue;
    const drawPath = () => {
      ctx.beginPath();
      ctx.moveTo(ox + stroke[0].x * k, oy + stroke[0].y * k);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(ox + stroke[i].x * k, oy + stroke[i].y * k);
      ctx.stroke();
    };
    ctx.lineWidth = Math.max(3, 12 * k);
    ctx.strokeStyle = "rgba(74, 59, 52, 0.34)";
    drawPath();
    ctx.lineWidth = Math.max(2, 8 * k);
    ctx.strokeStyle = RAINBOW[color++ % RAINBOW.length];
    drawPath();
  }
}

export function meadowChoicePlan(word) {
  const entry = retainedWordInfo(word);
  return entry ? { word: entry.word, kind: entry.kind, art: entry.art || null, initial: entry.word[0] } : null;
}

function subjectPicture(word, className) {
  const plan = meadowChoicePlan(word);
  const image = plan && plan.art
    ? picture(seasonalWordArtKey(plan.art, settings.get()), { className, alt: "" }) || picture(plan.art, { className, alt: "" })
    : null;
  if (image) {
    image.setAttribute("aria-hidden", "true");
    return image;
  }
  const fallback = document.createElement("span");
  fallback.className = className + " meadow-subject-picture--fallback";
  fallback.innerHTML = glyphSVG(plan ? plan.initial : "?", P.lilacDeep);
  return fallback;
}

function inkLabel(word, snapshots, className = "") {
  const label = document.createElement("div");
  label.className = "meadow-ink-label" + (className ? " " + className : "");
  label.setAttribute("aria-label", String(word || "").toLowerCase() + " written by the child");
  for (const snapshot of snapshots || []) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    label.appendChild(canvas);
    requestAnimationFrame(() => {
      if (canvas.isConnected) drawInk(canvas, snapshot);
    });
  }
  return label;
}

export const meadow = {
  id: "meadow",
  _offs: [],
  _timers: [],

  async mount(host, params = {}) {
    this._offs = [];
    this._timers = [];
    this._alive = true;
    this._visit = {};
    this._penDown = false;
    this._celebrating = false;
    this._moving = false;
    this._checkpointing = false;
    this._savingCount = 0;
    this._saveTicket = 0;
    this._persistTail = Promise.resolve();
    this._draftIssue = '';
    this._toolGuards = [];
    this._letterResponse = null;
    this._ready = false;
    this.word = null; this.root = null; this.notice = null;
    this.host = host;
    const visit = this._visit;

    const config = settings.get() || {};
    this.mode = ["grow", "challenge"].includes(config.learningLevel) ? config.learningLevel : "explore";
    this.wordList = wordsForLevel(this.mode);
    await this._openSavedMeadow(host, params, config, visit);
  },

  async _openSavedMeadow(host, params, config, visit) {
    if (!this._alive || this._visit !== visit || this._openingMeadow) return;
    this._openingMeadow = true;
    if (this._meadowRetry) this._meadowRetry.disabled = true;
    let drafts, savedLabels;
    try {
      [, savedLabels, drafts] = await Promise.all([
        art.ensure(this.wordList.flatMap((entry) => [entry.art, seasonalWordArtKey(entry.art, config)]).filter(Boolean)),
        loadMeadowLabelsChecked(), loadMeadowDrafts(),
      ]);
    } catch {
      if (!this._alive || this._visit !== visit) return;
      if (!this._meadowRecovery) {
        const notice = document.createElement('section'); notice.className = 'meadow-load-recovery'; notice.setAttribute('role', 'status');
        const text = document.createElement('p'); text.textContent = 'Your word pictures could not be opened. Try again, or go Home.';
        const retry = recoveryAction('replay', 'Try again', () => { void this._openSavedMeadow(host, params, config, visit); });
        const home = recoveryAction('home', 'Home', () => { if (this._alive && this._visit === visit) void router.go('map', {}, { dir: 'right' }); });
        notice.append(text, retry, home); host.append(notice); this._meadowRecovery = notice; this._meadowRetry = retry;
      }
      return;
    } finally {
      if (this._visit === visit) { this._openingMeadow = false; if (this._meadowRetry) this._meadowRetry.disabled = false; }
    }
    if (!this._alive || this._visit !== visit) return;
    this._meadowRecovery?.remove(); this._meadowRecovery = null; this._meadowRetry = null;
    return this._finishOpeningMeadow(host, params, config, visit, drafts, savedLabels);
  },

  async _finishOpeningMeadow(host, params, config, visit, drafts, savedLabels) {
    let start = meadowStart(drafts, params, this.mode, this._pickWord());
    if (start.viewingSaved && !savedLabels.labels[start.word]) start = drafts.drafts[this.mode + ':' + start.word] || { word: start.word };
    const restoredMode = !!(start.mode === this.mode || start.viewingSaved);
    this._draftWords = new Set(Object.values(drafts.drafts).filter(row => row.mode === this.mode).map(row => row.word));
    this.word = start.word;
    this._seenWords = new Set([this.word]);
    this.letters = this.word.split("");
    this.tiers = (restoredMode && validTiers(start.tiers, this.letters.length)) || Array(this.letters.length).fill(null);
    this.inkSnapshots = restoredMode ? validSnapshots(start.inkSnapshots, this.letters.length) : Array(this.letters.length).fill(null);
    const firstOpen = this.tiers.findIndex((tier) => tier == null);
    const proposed = Number.isInteger(start.index) ? start.index : firstOpen;
    this.index = Math.max(0, Math.min(this.letters.length - 1, firstOpen < 0 ? this.letters.length - 1 : proposed));
    if (this.tiers[this.index] != null) this.index = firstOpen < 0 ? this.letters.length - 1 : firstOpen;
    this._wordAttemptId = (restoredMode && String(start.attemptId || "").slice(0, 160)) || attemptId("meadow:" + this.word);
    this._viewingSaved = !!start.viewingSaved;
    this._resetRecovery = restoredMode && !this._viewingSaved && start.resetRecovery ? structuredClone(start.resetRecovery) : null;
    this.savedLabels = savedLabels.labels;
    this.savedLabel = this.savedLabels[this.word] || null;

    const root = document.createElement("div");
    root.className = "meadow learning-screen";
    root.innerHTML =
      '<div class="word-row-wrap"><div class="meadow-unicorn"></div><div class="meadow-current-word"><button type="button" class="meadow-subject-cue tap"></button><div class="word-row"></div></div><div class="meadow-entry-choices" aria-label="choose what to write"></div></div>' +
      '<div class="meadow-stage"></div><div class="meadow-save-status"><span role="status" aria-live="polite"></span><button type="button" class="meadow-save-retry tap" aria-label="Try keeping this word again" hidden></button></div>';
    host.appendChild(root);
    addScenery(root, "meadow", { foreground: false });
    this.root = root;
    this.stage = root.querySelector(".meadow-stage");
    this._resetStage();
    this.row = root.querySelector(".word-row");
    this.subjectCue = root.querySelector(".meadow-subject-cue");
    this.entryChoices = root.querySelector(".meadow-entry-choices");
    this.notice = root.querySelector('.meadow-save-status>span');
    this.saveRetry = root.querySelector('.meadow-save-retry');
    this.saveRetry.innerHTML = iconSVG('save');
    tapify(this.saveRetry, () => { if (!this._blocked() && this.saveRetry.isConnected) return this._saveResume(this._completed()); });
    tapify(this.subjectCue, () => { if (this.savedLabel && !this._viewingSaved && !this._blocked()) this._openSavedLabel(this.word, { allowCurrent: true }); });
    root.addEventListener('pointerdown', event => {
      if (this._moving || this._checkpointing || this._celebrating) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    this._layout = () => this._layoutPaper();
    this._paperObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this._layout) : null;
    this._paperObserver?.observe(this.stage);
    window.addEventListener('resize', this._layout);

    const st = progress.get() || {};
    this.uni = new Character(root.querySelector(".meadow-unicorn"), {
      name: "unicorn",
      stripes: (st.unicorn && st.unicorn.stripes) || 0,
      follow: true,
    });

    this._home = homeButton();
    this._mute = muteButton();
    root.appendChild(this._home);
    root.appendChild(this._mute);
    this._home.addEventListener('click', event => { if (this._blocked() || this._visit !== visit) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    if (config.regions?.stories !== false && router.registered().includes("stories")) {
      const book = document.createElement("button");
      book.type = "button";
      book.className = "meadow-storybook tap";
      book.disabled = !isPreviewRouteEnabled('stories');
      book.classList.toggle('preview-disabled', book.disabled);
      book.setAttribute("aria-label", "make a picture story");
      book.innerHTML = iconSVG("book");
      tapify(book, () => { if (this._blocked() || this._visit !== visit) return; sfx.play("tap"); router.go("stories", {}, { dir: "left" }); });
      root.appendChild(book);
    }

    this._offs.push(bus.on("stroke:start", () => { if (this._alive) this._penDown = true; }));
    this._offs.push(bus.on("stroke:end", () => { if (this._alive) { this._penDown = false; requestAnimationFrame(this._layout); } }));

    this._renderSubjectCue();
    this._buildRow();
    this._renderEntryChoices();

    if (this._viewingSaved && this.savedLabel) {
      this.tiers = Array(this.letters.length).fill(1); this.inkSnapshots = this.savedLabel.snapshots;
    }
    if ((start.completed || this._viewingSaved) && this.tiers.every((tier) => tier >= 1)) {
      speech.word(this.word);
      this._turnDone = true;
      this.box.hidden = true;
      const restoredInk = this.inkSnapshots.every(Boolean)
        ? this.inkSnapshots
        : (this.savedLabel && this.savedLabel.snapshots) || this.inkSnapshots;
      this._showWordResult(restoredInk);
      this._offerNextWords(this._viewingSaved);
      this._ready = true;
      await this._saveResume(true);
      return;
    }
    this._loadLetter(this.index, start.traceSnapshot || null, start.strokes || null, false);
    this._ready = true;
    await this._saveResume(false);
    if (!this._alive || this._visit !== visit) return;
    this._announceWordThenLetter(this._visit, this.word, this.index);
  },

  _pickWord() {
    return (this.wordList[0] || WORDS[0]).word;
  },

  _held() {
    return !!(this._penDown || this.tracer?.pen?.drawing || this.tracer?.pen?.activeId != null);
  },

  _blocked() {
    return !this._alive || this._held() || this._celebrating || this._moving || this._checkpointing;
  },

  _completed() {
    return !!(this._turnDone && this.tiers?.every(tier => tier >= 1));
  },

  _resetStage() {
    this._wordFriend?.destroy(); this._wordFriend = null;
    this.stage.innerHTML = '<div class="meadow-paper-stage"><div class="trace-box"></div></div><div class="meadow-tool-host"></div><div class="meadow-actions"></div>';
    this.paperStage = this.stage.querySelector('.meadow-paper-stage');
    this.box = this.stage.querySelector('.trace-box');
    this.toolHost = this.stage.querySelector('.meadow-tool-host');
    this.actions = this.stage.querySelector('.meadow-actions');
  },

  _layoutPaper() {
    if (!this._alive || !this.box || !this.paperStage || this._held()) return;
    const size = fitMeadowPaper(this.paperStage.clientWidth, this.paperStage.clientHeight);
    if (!size) return;
    this.box.style.width = `${size}px`; this.box.style.height = `${size}px`;
    this.tracer?.resize?.();
  },

  _destroyTracer() {
    this._letterResponse = null;
    for (const [button, guard] of this._toolGuards || []) button.removeEventListener('click', guard, true);
    this._toolGuards = [];
    this.tracer?.destroy?.(); this.tracer = null;
    if (this.host) this.host._tracer = null;
  },

  _guardSceneTools() {
    const tracer = this.tracer;
    if (!tracer?.tools) return;
    const show = tracer.tools.querySelector('.rv-btn--show');
    if (show) { show.setAttribute('aria-label', 'Show where to begin this letter'); tracer.tools.insertBefore(show, tracer.tools.firstChild); }
    for (const button of tracer.tools.querySelectorAll('.rv-btn')) {
      const guard = event => {
        if (this._blocked() || this.tracer !== tracer || this.root?.classList.contains('is-word-result')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
        if (button.classList.contains('rv-btn--undo') && !tracer.strokes().length && this._resetRecovery?.index === this.index) {
          event.preventDefault(); event.stopImmediatePropagation(); this._restoreScribble(); return;
        }
        if (button.classList.contains('rv-btn--clear') && this._resetRecovery?.index === this.index) delete this._resetRecovery.restored;
        if (!button.classList.contains('rv-btn--show')) { this._turnDone = false; this.actions.replaceChildren(); }
      };
      button.addEventListener('click', guard, true); this._toolGuards.push([button, guard]);
    }
  },

  _paintSaveStatus() {
    if (!this._alive || !this.notice) return;
    const failed = !!this._draftIssue;
    this.notice.textContent = failed ? (String(this._draftIssue).includes('capacity')
      ? 'This word needs more room. Your paper is still here. Ask a grownup to keep a backup.'
      : 'Could not keep this word yet. Your paper is still here. Try again.')
      : this._persistent === false || !db.status().persistent
        ? 'Only here while the app is open. Ask a grownup to keep a backup.'
        : this._savingCount ? 'Keeping your word…' : 'Your word is kept.';
    // Routine saves are for screen readers only; a child cannot read them (work order item 7).
    this.notice.classList.toggle('is-routine-note', !failed && this._persistent !== false && db.status().persistent);
    this.saveRetry.hidden = !failed; this.saveRetry.disabled = !!(this._savingCount || this._held() || this._moving || this._checkpointing);
  },

  _level(char) {
    if (this.mode === "explore") return 0;
    const learned = letterState(char).level || 0;
    if (this.mode === "grow") return Math.min(1, learned);
    return Math.max(2, Math.min(3, learned));
  },

  _buildRow() {
    this.row.innerHTML = "";
    this.boxes = this.letters.map((char, i) => {
      const box = document.createElement("div");
      box.className = "wbox";
      box.dataset.letter = char;
      box.dataset.i = String(i);
      box.innerHTML = glyphSVG(char, P.lilac);
      this.row.appendChild(box);
      return box;
    });
    this._paintRow();
  },

  _renderSubjectCue() {
    if (!this.subjectCue) return;
    this.subjectCue.innerHTML = "";
    this.subjectCue.setAttribute("aria-label", this.word.toLowerCase() + " picture");
    this.subjectCue.disabled = !this.savedLabel;
    this.subjectCue.appendChild(subjectPicture(this.word, "meadow-subject-picture"));
    if (this.savedLabel) {
      this.subjectCue.appendChild(inkLabel(this.word, this.savedLabel.snapshots, "meadow-ink-label--mini"));
      this.subjectCue.classList.add("has-saved-label");
      this.subjectCue.setAttribute('aria-label', 'See your completed ' + this.word.toLowerCase() + ' label');
    } else {
      this.subjectCue.classList.remove("has-saved-label");
    }
  },

  _entryCandidates() {
    const saved = Object.values(this.savedLabels || {})
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((label) => label.word);
    const suggested = this._nextCandidates().map((entry) => entry.word);
    return [...new Set([...suggested, ...(this._draftWords || []), ...saved])]
      .filter((word) => word !== this.word)
      .map(retainedWordInfo)
      .filter((entry) => entry && entry.art && !entry.archivedOnly);
  },

  _renderEntryChoices() {
    if (!this.entryChoices) return;
    this.entryChoices.innerHTML = "";
    const visit = this._visit;
    for (const candidate of this._entryCandidates()) {
      const plan = meadowChoicePlan(candidate.word);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "meadow-entry-choice tap";
      button.dataset.entryWord = candidate.word;
      button.appendChild(subjectPicture(candidate.word, "meadow-entry-choice__art"));
      const initial = document.createElement("span");
      initial.className = "meadow-entry-choice__initial";
      initial.innerHTML = glyphSVG(plan.initial, P.lilacDeep);
      button.appendChild(initial);
      const name = document.createElement("span");
      name.className = "meadow-choice-name";
      name.textContent = candidate.word;
      button.appendChild(name);
      const saved = this.savedLabels && this.savedLabels[candidate.word];
      if (saved) {
        button.setAttribute("aria-label", "see your " + candidate.word.toLowerCase() + " " + (candidate.kind === "name" ? "name" : "word"));
        button.classList.add("has-saved-label");
        button.appendChild(inkLabel(candidate.word, saved.snapshots, "meadow-entry-choice__saved-ink"));
        tapify(button, () => { if (button.isConnected && this._visit === visit) this._advance(candidate.word, { viewSaved: true }); });
      } else {
        button.setAttribute("aria-label", "write " + candidate.word.toLowerCase());
        tapify(button, () => { if (button.isConnected && this._visit === visit) this._advance(candidate.word); });
      }
      this.entryChoices.appendChild(button);
    }
  },

  async _openSavedLabel(word, { allowCurrent = false } = {}) {
    const next = knownWord(word);
    const label = next && this.savedLabels && this.savedLabels[next];
    if (!label || next === this.word && !allowCurrent) return false;
    return this._changeWord(next, { label });
  },

  _showWordResult(snapshots) {
    if (!this.stage) return;
    this._wordFriend?.destroy(); this._wordFriend = null;
    this.stage.querySelector(".meadow-word-result")?.remove();
    const result = document.createElement("article");
    result.className = "meadow-word-result";
    result.setAttribute("aria-label", this.word.toLowerCase() + " with the child's written label");
    const visit = this._visit, word = this.word;
    const resolvedPicture = subjectPicture(word, "meadow-word-result__picture");
    const greeting = {
      active: () => this._alive && this._visit === visit && this.word === word,
      sound: () => sfx.play('chime'),
    };
    this._wordFriend = mountWordFriend(word, greeting) || (meadowChoicePlan(word)?.kind === 'name'
      ? mountFamilyWordPicture(word, resolvedPicture, greeting) : null);
    result.append(
      this._wordFriend?.element || resolvedPicture,
      inkLabel(this.word, snapshots, "meadow-ink-label--result"),
    );
    this.stage.appendChild(result);
    this.paperStage.hidden = true; this.toolHost.hidden = true;
    if (this.root) this.root.classList.add("is-word-result");
  },

  _paintRow() {
    this.boxes.forEach((box, i) => {
      const done = this.tiers[i] != null;
      box.classList.toggle("is-active", !this._turnDone && i === this.index);
      box.classList.toggle("is-done", done);
      if (done && this.inkSnapshots[i]) {
        let canvas = box.querySelector("canvas");
        if (!canvas) {
          box.innerHTML = "";
          canvas = document.createElement("canvas");
          box.appendChild(canvas);
        }
        requestAnimationFrame(() => { if (this._alive) drawInk(canvas, this.inkSnapshots[i]); });
      } else if (!done && box.querySelector('canvas')) {
        box.innerHTML = glyphSVG(this.letters[i], P.lilac);
      }
    });
  },

  async _announceWordThenLetter(visit, word, index) {
    await speech.word(word);
    if (!this._alive || this._visit !== visit || this.word !== word || this.index !== index || this._turnDone) return;
    speech.letter(this.letters[index]);
  },

  _loadLetter(i, traceSnapshot, strokes, announceLetter = true) {
    if (!this._alive) return;
    this.index = Math.max(0, Math.min(this.letters.length - 1, i));
    this._turnDone = false;
    this.actions.innerHTML = "";
    this._wordFriend?.destroy(); this._wordFriend = null;
    this.stage.querySelector(".meadow-word-result")?.remove();
    if (this.root) this.root.classList.remove("is-word-result");
    this.box.hidden = false;
    this.paperStage.hidden = false; this.toolHost.hidden = false;
    const char = this.letters[this.index];
    this._destroyTracer();
    this.box.innerHTML = "";
    const glyphs = wordGlyphs(this.word);
    const glyph = glyphs[this.index] || GLYPHS[char];
    const letterAttemptId = this._wordAttemptId + ":" + this.index;
    const visit = this._visit;
    this._layoutPaper();
    const tracer = this.tracer = new Tracer(this.box, {
      glyph,
      toolHost: this.toolHost,
      level: this._level(char),
      handedness: settings.get().handedness,
      allowFinger: !settings.get().penOnly,
      detectScribble: true,
      onResult: (result) => { if (this._visit === visit && this.tracer === tracer) this._result(result, letterAttemptId); },
      onStrokeEnd: () => { if (this._visit === visit && this.tracer === tracer) this._afterStrokeEdit(letterAttemptId); },
    });
    this._guardSceneTools();
    requestAnimationFrame(this._layout);
    if (this.host) this.host._tracer = this.tracer;
    let restored = false;
    if (traceSnapshot && this.tracer.loadSnapshot) restored = this.tracer.loadSnapshot(traceSnapshot) === true;
    if (!restored && strokes && strokes.length && this.tracer.load) this.tracer.load(strokes);
    this._paintResetUndo();
    this._paintRow();
    if (announceLetter) speech.letter(char);
  },

  _captureDraft(completed = this._completed()) {
    const draft = { mode: this.mode, word: this.word, index: this.index, tiers: this.tiers.slice(),
      inkSnapshots: this.inkSnapshots.slice(), traceSnapshot: this.tracer?.snapshot?.() || null,
      attemptId: this._wordAttemptId, completed: !!completed, viewingSaved: !!this._viewingSaved };
    if (this._resetRecovery) draft.resetRecovery = structuredClone(this._resetRecovery);
    return draft;
  },

  _afterStrokeEdit(letterAttemptId) {
    if (!this._alive || this._wordAttemptId + ':' + this.index !== letterAttemptId) return;
    if (this._turnDone) {
      // A finishing stroke or Undo retires its pending visual response. The same
      // paper keeps its attempt identity, then recognition checks the edited ink.
      this._letterResponse = null;
      this._turnDone = false;
      this._celebrating = false;
      this.tiers[this.index] = null;
      this.inkSnapshots[this.index] = null;
      this.tracer?.continueDrawing();
      this.actions.replaceChildren();
      this._paintRow();
    }
    this._paintResetUndo(); this._saveResume(false);
  },

  _saveResume(completed) {
    if (!this._alive) return Promise.resolve(false);
    const visit = this._visit, draft = this._captureDraft(completed), ticket = ++this._saveTicket;
    this._savingCount++; this._paintSaveStatus();
    const work = () => this._keepDraft(draft, visit, ticket);
    const next = (this._persistTail || Promise.resolve()).then(work, work);
    this._persistTail = next;
    return next;
  },

  async _keepDraft(draft, visit, ticket) {
    try {
      if (!this._alive || this._visit !== visit) return false;
      const kept = await saveMeadowDraft(draft);
      if (!this._alive || this._visit !== visit) return false;
      if (kept) { this._draftWords?.add(draft.word); this._persistent = kept.persistent; }
      if (ticket === this._saveTicket) this._draftIssue = '';
      // Exact originals live in the draft store; resume is only a route pointer.
      await resume.save({ screen: 'meadow', params: { mode: draft.mode, word: draft.word, index: draft.index,
        attemptId: draft.attemptId, completed: draft.completed, viewingSaved: draft.viewingSaved }, strokes: [] });
      return this._alive && this._visit === visit;
    } catch (error) {
      if (this._alive && this._visit === visit && ticket === this._saveTicket) this._draftIssue = error.code || 'write';
      return false;
    } finally {
      if (this._visit === visit) { this._savingCount--; this._paintSaveStatus(); bus.emit('activity:idle'); }
    }
  },

  async _result(result, letterAttemptId) {
    const expected = this._wordAttemptId + ":" + this.index;
    if (!this._alive || this._moving || this._checkpointing || this._turnDone || letterAttemptId !== expected) return;
    // Idle recognition can check committed ink while another contact is held.
    // Let that contact finish before accepting or retiring this paper.
    if (this._held()) { this.tracer?.continueDrawing(); return; }
    this._turnDone = true;
    const visit = this._visit;
    const word = this.word;
    const index = this.index;
    const response = this._letterResponse = { visit, word, index, tracer: this.tracer };
    const tier = Math.max(0, Math.min(3, (result && result.tier) | 0));
    this._celebrating = true;

    if (result && result.reason === "scribble") {
      // Only the scorer's explicit high-confidence refusal takes this path.
      // Preserve uncertain marks and an original deliberately restored with Undo.
      if (result.scribble === true && !(this._resetRecovery?.index === index && this._resetRecovery.restored)) {
        return this._recoverScribble(response);
      }
      await speech.retry();
      await sleep(220);
      if (!this._activeResponse(response)) return;
      this._celebrating = false;
      this._turnDone = false;
      this.actions.innerHTML = "";
      // An uncertain independent mark belongs to the child. Only the explicit
      // Undo/Fresh tools remove it; switching or guidance must not prune it.
      this.tracer?.continueDrawing();
      this._saveResume(false);
      this._offerRetry();
      return;
    }

    if (tier === 0) {
      speech.retry();
      await celebrate(0, this.uni, null);
      if (!this._activeResponse(response)) return;
      this._celebrating = false;
      this._offerRetry();
      return;
    }

    sfx.play("sparkle");
    if (this.uni) this.uni.bounce();
    const box = this.boxes[index];
    if (box && !reduced() && box.animate) box.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.14)" }, { transform: "scale(1)" }],
      { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)" }
    );
    await sleep(420);
    while (this._activeResponse(response) && this._held()) await sleep(40);
    if (!this._activeResponse(response)) return;
    // Commit the settled paper, rather than the earlier recognition snapshot.
    this.tiers[index] = tier;
    this.inkSnapshots[index] = this.tracer?.snapshot?.() || null;
    this._paintRow();
    this._saveResume(false);
    this._celebrating = false;

    if (index + 1 < this.letters.length) {
      this._loadLetter(index + 1, null, null);
      this._saveResume(false);
      return;
    }
    await this._finishWord(visit, word, response);
  },

  async _recoverScribble(response) {
    const original = response.tracer?.snapshot?.();
    if (!original?.strokes?.length) { this._celebrating = this._turnDone = false; this.tracer?.continueDrawing(); return false; }
    this._resetRecovery = { version:1, index:response.index, traceSnapshot:structuredClone(original) };
    // Checkpoint the full original before changing the visible paper.
    const kept = await this._saveResume(false);
    if (!this._activeResponse(response)) return false;
    if (this._held()) {
      this._celebrating = this._turnDone = false;
      this.tracer.continueDrawing(); return false;
    }
    this._celebrating = this._turnDone = false;
    this.actions.innerHTML = '';
    if (!kept) { this.tracer.continueDrawing(); this._offerRetry(); return false; }
    this.tracer.clear();
    this._paintResetUndo();
    void speech.say('ui_scribble_reset');
    await this._saveResume(false);
    return true;
  },

  _paintResetUndo() {
    const undo = this.tracer?.tools?.querySelector('.rv-btn--undo');
    if (!undo) return;
    const canRecover = this._resetRecovery?.index === this.index && !this.tracer.strokes().length;
    undo.setAttribute('aria-label', canRecover ? 'Undo scribble reset' : 'Undo');
    // Recovery stays available to a grown-up without inviting the child to
    // immediately bring the scribbles back over the newly visible guide.
    undo.classList.remove('glow');
  },

  _restoreScribble() {
    if (this._blocked() || !this.tracer || this.tracer.strokes().length || this._resetRecovery?.index !== this.index) return false;
    this._resetRecovery.restored = true;
    this.tracer.loadSnapshot(structuredClone(this._resetRecovery.traceSnapshot));
    this.tracer.continueDrawing();
    this._turnDone = false; this._celebrating = false;
    this._paintResetUndo(); this._saveResume(false);
    return true;
  },

  _activeResponse(response) {
    return this._letterResponse === response && this.tracer === response.tracer &&
      this._active(response.visit, response.word, response.index);
  },

  _active(visit, word, index = this.index) {
    return this._alive && this._visit === visit && this.word === word && this.index === index;
  },

  _offerRetry() {
    const clear = this.tracer?.tools?.querySelector('.rv-btn--clear');
    if (clear) {
      clear.classList.add('glow'); clear.setAttribute('aria-label', 'Try this letter again');
      if (!pip.isOnboarding()) pip.flyTo(clear, { dy: -.7 });
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "learning-choice learning-retry tap glow";
    button.setAttribute("aria-label", "try this letter again");
    button.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M19 23 C30 9 54 17 52 36 C50 53 28 57 18 43" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M8 24 L20 23 L19 11" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    tapify(button, () => {
      if (this._blocked() || !this.tracer || !button.isConnected) return;
      sfx.play("tap");
      this._turnDone = false;
      this.actions.innerHTML = "";
      this.tracer.clear();
      this._saveResume(false);
    });
    this.actions.innerHTML = "";
    this.actions.appendChild(button);
  },

  async _finishWord(visit, word, response = null) {
    const active = () => response ? this._activeResponse(response) : this._active(visit, word);
    if (!active()) return;
    this._celebrating = true;
    this._viewingSaved = false;
    const before = (progress.get().unicorn || {}).stripes || 0;
    const modern = WORDS.some(entry => entry.word === word);
    const recorded = modern ? await progress.recordWord(word, this.tiers.slice()) : { earned: false };
    if (!active()) return;
    const play = modern && this.tiers.every((tier) => tier >= 1)
      ? await progress.recordPlay("word", word, this._wordAttemptId)
      : { credited: false, rewarded: false };
    if (!active()) return;
    const after = (progress.get().unicorn || {}).stripes || 0;
    await this._saveResume(true);
    if (!active()) return;
    let savedLabel = null;
    try { savedLabel = await saveMeadowLabel({ word, snapshots: this.inkSnapshots }); }
    catch (error) { if (active()) { this._draftIssue = error.code || 'write'; this._paintSaveStatus(); } }
    if (!active()) return;
    if (savedLabel) {
      this.savedLabel = savedLabel;
      this.savedLabels[word] = savedLabel;
      this._renderSubjectCue();
      this._renderEntryChoices();
    }

    if (recorded.earned || after > before) {
      const stripe = Math.max(0, after - 1);
      await this.uni.anticipate();
      if (!active()) return;
      await this.uni.fillStripe(stripe, 900);
      if (!active()) return;
      this.uni.setStripes(after);
      speech.say("ui_stripe_back");
      await celebrate(3, this.uni, null);
    } else {
      speech.praise(2);
      await celebrate(play.rewarded ? 3 : 2, this.uni, null);
    }
    if (!active()) return;
    this._celebrating = false;
    this.box.hidden = true;
    this._showWordResult(savedLabel?.snapshots || this.inkSnapshots);
    this._offerNextWords();
  },

  _nextCandidates() {
    if (this._seenWords.size >= this.wordList.length) {
      this.wordList = wordsForLevel(this.mode);
      this._seenWords = new Set([this.word]);
    }
    return nextWordChoices(this.wordList, this.word, this._seenWords);
  },

  _offerNextWords(includeRewrite = false) {
    if (!this._alive) return;
    this.actions.innerHTML = "";
    if (includeRewrite) {
      const rewrite = document.createElement("button");
      rewrite.type = "button";
      rewrite.className = "learning-choice learning-retry meadow-word-choice meadow-rewrite-choice tap glow";
      rewrite.dataset.rewrite = this.word;
      rewrite.setAttribute("aria-label", "write " + this.word.toLowerCase() + " again");
      const picture = document.createElement("span");
      picture.className = "learning-choice__picture meadow-word-choice__picture";
      picture.appendChild(subjectPicture(this.word, "meadow-word-choice__art"));
      rewrite.append(picture);
      rewrite.insertAdjacentHTML("beforeend", '<span class="meadow-rewrite-choice__mark" aria-hidden="true">' + iconSVG("replay") + '</span>');
      const word = this.word, visit = this._visit;
      tapify(rewrite, () => { if (rewrite.isConnected && this._visit === visit && this.word === word) this._advance(word, { rewrite: true }); });
      this.actions.appendChild(rewrite);
    }
    for (const candidate of this._nextCandidates()) {
      const plan = meadowChoicePlan(candidate.word);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "learning-choice learning-next meadow-word-choice tap glow";
      button.dataset.next = candidate.word;
      button.setAttribute("aria-label", "next word " + candidate.word.toLowerCase());
      const choicePicture = document.createElement("span");
      choicePicture.className = "learning-choice__picture meadow-word-choice__picture";
      choicePicture.appendChild(subjectPicture(candidate.word, "meadow-word-choice__art"));
      const initial = document.createElement("span");
      initial.className = "meadow-word-choice__initial";
      initial.innerHTML = glyphSVG(plan.initial, P.lilacDeep);
      choicePicture.appendChild(initial);
      button.appendChild(choicePicture);
      const name = document.createElement("span");
      name.className = "meadow-choice-name";
      name.textContent = candidate.word;
      button.appendChild(name);
      button.insertAdjacentHTML("beforeend", '<svg class="learning-choice__arrow" viewBox="0 0 64 64" aria-hidden="true"><path d="M13 32 H49 M37 18 L51 32 L37 46" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>');
      const visit = this._visit;
      tapify(button, () => { if (button.isConnected && this._visit === visit) this._advance(candidate.word); });
      this.actions.appendChild(button);
    }
    const first = this.actions.querySelector("button");
    if (first && !pip.isOnboarding()) pip.flyTo(first, { dy: -0.7 });
    speech.say("ui_choose_next");
  },

  async _advance(word, { rewrite = false, viewSaved = false } = {}) {
    const next = knownWord(word);
    if (!next || (next === this.word && !rewrite)) return false;
    return this._changeWord(next, { rewrite, viewSaved });
  },

  async _changeWord(next, { rewrite = false, viewSaved = false, label = null } = {}) {
    if (this._blocked()) return false;
    this._moving = true;
    const visit = this._visit;
    this._paintSaveStatus();
    try {
      if (!await this._saveResume(this._completed())) return false;
      const draft = await loadMeadowDraft(next, this.mode);
      const saved = label || this.savedLabels[next] || await loadMeadowLabel(next);
      if (!this._alive || this._visit !== visit) return false;
      // A saved-label picture restores a pending attempt first. The current
      // subject picture explicitly opens the older completed label if desired.
      const viewing = !!(label || viewSaved && saved && (!draft || draft.completed));
      const restoring = !viewing && draft && !(rewrite && draft.completed);
      this._destroyTracer();
      this.word = next; this._seenWords.add(next); this.letters = next.split('');
      this.tiers = viewing ? Array(this.letters.length).fill(1) : restoring ? draft.tiers : Array(this.letters.length).fill(null);
      this.inkSnapshots = viewing ? saved.snapshots : restoring ? draft.inkSnapshots : Array(this.letters.length).fill(null);
      const first = this.tiers.findIndex(tier => tier == null);
      this.index = restoring ? draft.index : 0;
      if (first >= 0 && this.tiers[this.index] != null) this.index = first;
      this._wordAttemptId = restoring && draft.attemptId || attemptId('meadow:' + next + (viewing ? ':view' : ''));
      this._viewingSaved = viewing; this._turnDone = viewing || !!(restoring && draft.completed);
      this._resetRecovery = restoring && draft.resetRecovery ? structuredClone(draft.resetRecovery) : null;
      this.savedLabel = saved; if (saved) this.savedLabels[next] = saved;
      this._resetStage(); this.root.classList.remove('is-word-result');
      this._renderSubjectCue(); this._buildRow(); this._renderEntryChoices();
      if (this._turnDone) {
        this.box.hidden = true; this._showWordResult(this.inkSnapshots); this._offerNextWords(true);
      } else {
        this._loadLetter(this.index, restoring ? draft.traceSnapshot : null, null, false);
        this._announceWordThenLetter(visit, next, this.index);
      }
      await this._saveResume(this._completed()); sfx.play('tap');
      return true;
    } catch (error) {
      if (this._alive && this._visit === visit) { this._draftIssue = error.code || 'write'; this._paintSaveStatus(); }
      return false;
    } finally {
      if (this._visit === visit) { this._moving = false; this._paintSaveStatus(); bus.emit('activity:idle'); }
    }
  },

  busy() {
    return !!(this._held() || this._celebrating || this._moving || this._checkpointing || this._savingCount);
  },

  async beforeLeave() {
    if (!this._alive || !this._ready) return true;
    if (this._held() || this._moving || this._checkpointing || this._celebrating) return false;
    const visit = this._visit; this._checkpointing = true;
    try {
      const kept = await this._saveResume(this._completed());
      await flushMeadowDraftWrites();
      return kept && this._alive && this._visit === visit;
    } finally { if (this._visit === visit) { this._checkpointing = false; this._paintSaveStatus(); bus.emit('activity:idle'); } }
  },

  beforeBreak() {
    return this.beforeLeave();
  },

  onBack() {
    if (this._blocked()) return false;
    router.go("map", {}, { dir: "right" });
  },

  unmount() {
    this._wordFriend?.destroy(); this._wordFriend = null;
    // Router awaits beforeLeave. A direct teardown still queues an exact final
    // attempt synchronously before retiring its DOM; it never writes resume late.
    if (this._alive && this._ready && this.word && !this._viewingSaved) {
      saveMeadowDraft(this._captureDraft()).catch(() => {});
      void flushMeadowDraftWrites();
    }
    this._alive = false;
    this._meadowRecovery?.remove(); this._meadowRecovery = null; this._meadowRetry = null; this._openingMeadow = false;
    this._visit = null;
    for (const timer of this._timers) clearTimeout(timer);
    this._timers = [];
    for (const off of this._offs) off();
    this._offs = [];
    this._paperObserver?.disconnect(); this._paperObserver = null;
    if (this._layout) window.removeEventListener('resize', this._layout);
    this._destroyTracer();
    if (this.uni) this.uni.destroy();
    this.uni = null;
    if (this._mute && this._mute.destroy) this._mute.destroy();
    this._mute = null;
    if (this.host) this.host._tracer = null;
    this._celebrating = false;
    this._moving = false;
  },
};

export default meadow;

