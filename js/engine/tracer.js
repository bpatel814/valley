// tracer.js - the tracing activity: guide under, ink over, three big buttons, and the
// per-stroke matcher that decides when she has finished a letter.
//
// Progress follows the parts actually drawn, independently of stroke order, direction,
// or pen lifts. The start cue recommends a path but never requires that starting point.
// Each part needs generous coverage plus evidence distinguishing it from nearby parts:
// two verticals must not finish an N just because they are near its missing diagonal.
// Ink stays intact. Undo and saved return derive progress from those same actual marks.

import { GLYPHS } from "../data/letters.js";
import { PenInput } from "./pen.js";
import { InkLayer } from "./ink.js";
import { drawGuide, animateHand, glyphBox } from "./guide.js";
import { scoreTrace, targetStrokes, toGlyphSpace, fromGlyphSpace, THRESHOLDS, recognitionGlyphs, recognitionPlacements } from "./scorer.js";
import { resample, pointToPolylineDistance, pointToPolylineDirectionDistance } from "./geom.js";
import { P } from "../world/palette.js";
import { emit, on } from "../world/bus.js";
import session from "../state/session.js";

export const MATCH = { coverage: 0.5, precision: 0.4 };
const IDLE_MS = 8000;        // quiet this long and the start dot waves at her
const SAFETY_MS = 12000;     // recheck paused ink without ending an unfinished letter
const NUDGE_MS = 1500;
const NUDGE_REPEAT_MS = 20000;
const BUTTON_MIN = 56;
const BUTTON_MAX = 64;
const TOOLS_PAD = 10;

/**
 * matchStroke(userStroke, targetStroke) -> {match, coverage, precision}
 * Both in glyph space (0..100). Pure, so tests can pin the behaviour.
 */
export function matchStroke(userStroke, targetStroke, opts = {}) {
  const tol = opts.tolerance ?? THRESHOLDS.tolerance;
  const ptol = opts.precisionTolerance ?? THRESHOLDS.precisionTolerance;
  const minCov = opts.coverage ?? MATCH.coverage;
  const minPrec = opts.precision ?? MATCH.precision;
  const step = opts.sampleStep ?? THRESHOLDS.sampleStep;

  const clean = (points) => Array.isArray(points)
    ? points.filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
      .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
    : [];
  const rawU = clean(userStroke), rawT = clean(targetStroke);
  const u = rawU.length > 1 ? resample(rawU, step) : rawU;
  const t = rawT.length > 1 ? resample(rawT, step) : rawT;
  if (!u.length || !t.length) return { match: false, coverage: 0, precision: 0 };

  let cov = 0;
  for (const tp of t) if (pointToPolylineDistance(tp, u) <= tol) cov++;
  let near = 0;
  for (const up of u) if (pointToPolylineDistance(up, t) <= ptol) near++;

  const coverage = cov / t.length;
  const precision = near / u.length;
  return { match: coverage >= minCov && precision >= minPrec, coverage, precision };
}

const partEvidenceCache = new WeakMap();
const letterGlyphs = new Set(Object.values(GLYPHS));
const nearestPath = (point, paths) => paths.reduce((best, path) =>
  Math.min(best, pointToPolylineDistance(point, path)), Infinity);
const isDotMark = (ink, target) => target.length > 0 && ink.length > 0 &&
  pathLen(target) <= 8 && pathLen(ink) <= 8 &&
  pointToPolylineDistance(target[Math.floor(target.length / 2)], ink) <= 6;

/** Actual drawn parts in glyph space. No order, direction or pen-lift requirement. */
export function traceParts(strokes, glyph) {
  const clean = toGlyphSpace(strokes, { x: 0, y: 0, w: 100, h: 100 });
  let best = tracePlacement(clean, glyph);
  if (best.count === glyph?.strokes?.length && (!letterGlyphs.has(glyph) || hasOnlyLetterInk(clean, glyph))) return best;
  if (best.count === glyph?.strokes?.length) best = { matched: new Set(), count: 0, next: 0 };
  for (const form of recognitionGlyphs(glyph)) {
    for (const placement of recognitionPlacements(clean, form)) {
      if (form === glyph && placement === clean) continue;
      const result = tracePlacement(placement, form);
      // Whole-shape fitting has no authority to move an unfinished part cue.
      // Otherwise a missing outer feature could stretch its neighbor into that
      // feature while losing a different part. All parts must pass together.
      if (result.count !== form.strokes.length) continue;
      if (letterGlyphs.has(glyph) && !hasOnlyLetterInk(placement, form)) continue;
      const mapped = form === glyph ? result.matched : new Set([...result.matched].flatMap(index => form.parts?.[index] || []));
      if (mapped.size > best.count) {
        const next = glyph.strokes.findIndex((_path, index) => !mapped.has(index));
        best = { matched: mapped, count: mapped.size, next: next < 0 ? glyph.strokes.length : next };
      }
    }
  }
  return best;
}

function hasOnlyLetterInk(strokes, glyph) {
  const targets = targetStrokes(glyph);
  for (const path of strokes) {
    const samples = path.length > 1 ? resample(path, THRESHOLDS.sampleStep) : path;
    let outside = 0, outsideTotal = 0;
    for (const point of samples) {
      outside = nearestPath(point, targets) > 7 ? outside + 1 : 0;
      if (outside) outsideTotal++;
      // A whole extra leg/bar/closure is another letter, even if it also contains
      // the requested letter. Short bounces and ordinary pen wobble remain safe.
      if (outside * THRESHOLDS.sampleStep > 12) return false;
    }
    if (outsideTotal * THRESHOLDS.sampleStep > 18 && outsideTotal / samples.length > .3) return false;
  }
  return true;
}

function tracePlacement(strokes, glyph) {
  const targets = targetStrokes(glyph);
  const matched = new Set();
  if (!targets.length) return { matched, next: 0, count: 0 };
  let evidence = partEvidenceCache.get(glyph);
  if (!evidence) {
    evidence = targets.map((path, index) => {
      const others = targets.filter((_path, i) => i !== index);
      const closed = path.length > 2 && Math.hypot(path[0].x - path.at(-1).x, path[0].y - path.at(-1).y) < 1e-6;
      return path.map((point, at) => {
        const before = path[closed ? (at - 4 + path.length - 1) % (path.length - 1) : Math.max(0, at - 4)];
        const after = path[closed ? (at + 4) % (path.length - 1) : Math.min(path.length - 1, at + 4)];
        return { point, tangent: { x: after.x - before.x, y: after.y - before.y },
          tolerance: Math.min(closed ? 7 : THRESHOLDS.tolerance, Math.max(3, nearestPath(point, others) * 0.7)) };
      });
    });
    partEvidenceCache.set(glyph, evidence);
  }
  // Precision uses the whole shape, so one joined N remains valid. An unrelated
  // stroke merely crossing the letter is not evidence of a drawn part.
  const eligible = toGlyphSpace(strokes, { x: 0, y: 0, w: 100, h: 100 })
    .map(path => path.length > 1 ? resample(path, THRESHOLDS.sampleStep) : path)
    .filter(path => path.length > 0 && path.filter(point =>
      nearestPath(point, targets) <= THRESHOLDS.precisionTolerance).length / path.length >= MATCH.precision);
  const matchParts = (ink) => {
    const matches = new Set();
    // Ink close to two neighboring parts cannot be counted twice for both entire
    // parts. Split a recognition copy at those ownership boundaries so filtering
    // never invents a connecting line across a gap in the child's real stroke.
    const owned = targets.map(() => []);
    for (const path of ink) {
      const distances = path.map(point => targets.map(target => pointToPolylineDistance(point, target)));
      for (let index = 0; index < targets.length; index++) {
        let run = [];
        for (let at = 0; at < path.length; at++) {
          if (distances[at][index] <= Math.min(...distances[at]) + .5) run.push(path[at]);
          else if (run.length) { owned[index].push(run); run = []; }
        }
        if (run.length) owned[index].push(run);
      }
    }
    if (ink.length) for (let index = 0; index < targets.length; index++) {
      // i and j have a six-unit dot guide. A small intentional tap near that
      // dot is handwriting too; it does not have to be a miniature line.
      if (ink.some(path => isDotMark(path, targets[index]))) {
        const dot = ink.find(path => isDotMark(path, targets[index]));
        if (!ink.some(path => pathLen(path) > 8 && nearestPath(dot[0], [path]) < 3)) matches.add(index);
        continue;
      }
      // Only a real short dot/dash supplies a dotted glyph's mark. Stretching an
      // undotted stem across the guide must not create its missing dot.
      if (pathLen(targets[index]) <= 8) continue;
      let covered = 0, distinct = 0, missingRun = 0, longestMissing = 0, leadingMissing = 0;
      for (const sample of evidence[index]) {
        const distance = nearestPath(sample.point, ink);
        if (distance <= THRESHOLDS.tolerance) covered++;
        const following = distance <= sample.tolerance && owned[index].some(path =>
          pointToPolylineDirectionDistance(sample.point, sample.tangent, path) <= sample.tolerance);
        if (following) { distinct++; missingRun = 0; }
        else {
          missingRun++;
          longestMissing = Math.max(longestMissing, missingRun);
          if (!distinct) leadingMissing++;
        }
      }
      // A whole missing side must remain open even when the other sides supply
      // enough total coverage. Closed paths join the first/last uncovered run;
      // this checks the actual shape, never a required drawing start or order.
      const path = targets[index];
      if (path.length > 1 && Math.hypot(path[0].x - path.at(-1).x, path[0].y - path.at(-1).y) < 1e-6) {
        longestMissing = Math.max(longestMissing, Math.min(evidence[index].length, leadingMissing + missingRun));
      }
      if (covered / evidence[index].length >= THRESHOLDS.coverageTier2 &&
          distinct / evidence[index].length >= .74 &&
          longestMissing / evidence[index].length <= 0.2 &&
          longestMissing * THRESHOLDS.sampleStep <= THRESHOLDS.tolerance) matches.add(index);
    }
    return matches;
  };
  const found = matchParts(eligible);
  for (const index of found) matched.add(index);
  const next = targets.findIndex((_path, index) => !matched.has(index));
  return { matched, next: next < 0 ? targets.length : next, count: matched.size };
}

export class Tracer {
  constructor(hostEl, opts = {}) {
    const {
      glyph, level = 0, handedness = "right", allowFinger = true, style, toolHost = null,
      onResult, onStroke, onProgress, onStrokeEnd, detectScribble = level < 3, autoEvaluate = true,
    } = opts;

    this.host = hostEl;
    // Optional caller-owned toolbar host. Only our wrapper is mounted/removed there;
    // the drawing surface then needs no space reserved for tools.
    this.toolHost = toolHost;
    const selected = resolveGlyph(glyph) || GLYPHS.A;
    this.char = typeof glyph === "string" && GLYPHS[glyph] ? glyph : (selected.id || selected.name || "A");
    this.glyph = selected;
    this.level = level;
    this.handedness = handedness;
    this.onResult = onResult || (() => {});
    this.onStroke = onStroke || (() => {});
    this.onProgress = onProgress || (() => {});
    this.onStrokeEnd = onStrokeEnd || (() => {});
    this.detectScribble = !!detectScribble;
    this.autoEvaluate = !!autoEvaluate;

    this.strokeIndex = 0;
    this.done = false;
    this._matchedStrokes = new Set();
    this._traceRevision = 0;
    this._resultSent = false;
    this._lastInputAt = 0;
    this._nudgeFrom = 0;
    this._nextNudgeAt = 0;
    this._idleChecked = false;
    this._hand = null;
    this._raf = 0;
    this._bufDirty = true;
    this._resizePending = false;

    injectStyle();
    this._build();
    this.ink = new InkLayer(this.inkCanvas, { style: { kind: "rainbow", width: 10, ...(style || {}) } });
    this.pen = new PenInput(this.inkCanvas, {
      allowFinger,
      onStrokeStart: (pt) => this._onStart(pt),
      onStrokeMove: (pt) => this._onMove(pt),
      onStrokeEnd: (pts, info) => this._onEnd(pts, info),
      onHover: (pt) => this.onStroke(pt, "hover"),
    });

    this._ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.resize()) : null;
    if (this._ro) this._ro.observe(this.el);
    this._onWinResize = () => this.resize();
    if (typeof addEventListener === "function") addEventListener("resize", this._onWinResize);
    this._onVisibility = () => this._touched();
    document.addEventListener?.("visibilitychange", this._onVisibility);
    this._idleOffs = [on("session:end", this._onVisibility), on("session:reset", this._onVisibility)];

    this.resize();
    this._loopBound = (now) => this._loop(now);
    this._raf = requestAnimationFrame(this._loopBound);
  }

  // ------------------------------------------------------------------- DOM

  _build() {
    const el = document.createElement("div");
    el.className = "rv-tracer";
    el.innerHTML =
      '<canvas class="rv-tracer__guide"></canvas>' +
      '<canvas class="rv-tracer__ink"></canvas>' +
      '<div class="rv-tracer__tools"></div>';
    this.host.appendChild(el);
    this.el = el;
    this.guideCanvas = el.querySelector(".rv-tracer__guide");
    this.inkCanvas = el.querySelector(".rv-tracer__ink");
    this.tools = el.querySelector(".rv-tracer__tools");
    this._buttonCleanups = [];
    if (this.toolHost) {
      this.tools.classList.add("rv-tracer__tools--external");
      this.toolHost.appendChild(this.tools);
    }

    this._buttons = [
      this._button("undo", "Undo", P.sky, ICONS.undo, () => this.undo()),
      this._button("clear", "Clear", P.peach, ICONS.clear, () => this.clear()),
      this._button("show", "Show me", P.lemon, ICONS.show, () => this.showMe()),
    ];
    for (const b of this._buttons) this.tools.appendChild(b);
  }

  _button(kind, label, color, svg, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rv-btn rv-btn--" + kind;
    b.style.background = color;
    b.setAttribute("aria-label", label);   // never rendered: she cannot read
    b.innerHTML = svg;
    // Same-frame press, soft overshoot on release (style bible motion table).
    const press = () => b.classList.add("is-press");
    const release = () => b.classList.remove("is-press");
    const click = (e) => { e.preventDefault(); release(); fn(); };
    const listeners = { pointerdown: press, pointerup: release, pointercancel: release, pointerleave: release, click };
    for (const [type, handler] of Object.entries(listeners)) b.addEventListener(type, handler);
    this._buttonCleanups.push(() => {
      for (const [type, handler] of Object.entries(listeners)) b.removeEventListener(type, handler);
    });
    return b;
  }

  // ---------------------------------------------------------------- layout

  resize() {
    if (!this.el) return;
    if (this.pen && this.pen.drawing) {
      this._resizePending = true;
      return;
    }
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (!w || !h) return;

    // Integrated phone tracing cards are square, so their own aspect ratio cannot tell us
    // where the child's wrist and the rest of the screen are. Follow the viewport when it
    // is available; the h>w fallback keeps isolated hosts and tests deterministic.
    const viewportPortrait = typeof window !== "undefined" && window.innerHeight > window.innerWidth;
    const portrait = viewportPortrait || h > w;
    this.tools.classList.toggle("rv-tracer__tools--row", portrait);
    this.tools.classList.toggle("rv-tracer__tools--left", this.handedness !== "left");
    this.tools.classList.toggle("rv-tracer__tools--right", this.handedness === "left");

    const button = Math.max(BUTTON_MIN, Math.min(BUTTON_MAX, Math.floor(Math.min(w, h) * 0.16)));
    this.el.style.setProperty("--rv-tool-size", button + "px");
    this.el.style.setProperty("--rv-tool-gap", TOOLS_PAD + "px");
    if (this.toolHost) {
      this.tools.style.setProperty("--rv-tool-size", button + "px");
      this.tools.style.setProperty("--rv-tool-gap", TOOLS_PAD + "px");
    }
    const gutter = button + TOOLS_PAD * 2;
    // Keep the guide generous on small phones. The edge gutter still protects every tool,
    // while the slightly tighter guide padding gives the child's mark a little more room.
    const g = {
      gutterLeft: 0,
      gutterRight: 0,
      gutterBottom: 0,
      pad: portrait ? 0.035 : 0.045,
    };
    if (!this.toolHost && portrait) {
      g.gutterBottom = gutter;
      g.alignY = 0.46;    // a letter sits better a little above centre, out of her wrist's way
    } else if (!this.toolHost && this.handedness === "left") g.gutterRight = gutter;
    else if (!this.toolHost) g.gutterLeft = gutter;

    const oldBox = this.box;
    this.box = glyphBox(w, h, this.glyph, g);

    // The guide canvas is ours; the ink canvas belongs to InkLayer, which knows how to
    // resize without throwing her ink away.
    const dpr = (typeof devicePixelRatio === "number" && devicePixelRatio) || 1;
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (this.guideCanvas.width !== bw || this.guideCanvas.height !== bh) {
      this.guideCanvas.width = bw;
      this.guideCanvas.height = bh;
    }
    this.gctx = this.guideCanvas.getContext("2d");
    if (this.gctx) this.gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._buf = null;
    this._bufDirty = true;

    if (this.ink) {
      // Keep her ink locked to the letter when the tablet turns over.
      const strokes = this.ink.strokes();
      this.ink.resize();
      if (oldBox && strokes.length && (oldBox.w !== this.box.w || oldBox.x !== this.box.x || oldBox.y !== this.box.y)) {
        this.ink.load(rescale(strokes, oldBox, this.box));
      }
    }
  }

  // ----------------------------------------------------------------- input

  /** Any real contact resets the idle clock, the nudge and the safety net. */
  _touched() {
    this._lastInputAt = now();
    this._nudgeFrom = 0;
    // A touch cancels the visual immediately, but does not reset the minimum
    // spacing between demonstrations.
    this._idleChecked = false;
  }

  _onStart(pt) {
    this._traceRevision++;
    this._touched();
    this.ink.begin(pt);
    emit("stroke:start", { x: pt.x, y: pt.y, v: pt.v || 0 });
    this.onStroke(pt, "start");
  }

  _onMove(pt) {
    this._touched();
    this.ink.add(pt);
    this.onStroke(pt, "move");
    // 'stroke:move' is emitted once per frame by the ink layer, which is where the
    // sparkle trail wants it: one event per painted frame, not one per digitiser sample.
  }

  _onEnd(_pts, info = {}) {
    this._touched();
    if (info.discarded) {
      this.ink.undo();
      emit("stroke:end", { cancelled: true, discarded: true });
      this.onStrokeEnd(this.ink.strokes());
      this._flushResize();
      return;
    }
    const stroke = this.ink.end();
    emit("stroke:end", {});
    if (!stroke) { this._flushResize(); return; }

    const targets = targetStrokes(this.glyph);
    // Keep intentional dots on i/j. Elsewhere, a resting tip is not an attempt.
    const glyphStroke = toGlyphSpace([stroke], this.box)[0] || [];
    const dot = stroke.length < 3 && pathLen(stroke) < 8 && targets.some(target =>
      pathLen(target) <= 8 && glyphStroke.length &&
      pointToPolylineDistance(target[Math.floor(target.length / 2)], glyphStroke) <= 25 &&
      !targets.some(other => pathLen(other) > 8 && pointToPolylineDistance(glyphStroke[0], other) < 3));
    if (stroke.length < 3 && pathLen(stroke) < 8 && !dot) {
      this.ink.undo();
      this._flushResize();
      return;
    }

    const strokes = this.ink.strokes();
    if (this.autoEvaluate !== false && this.detectScribble) {
      const scored = scoreTrace(toGlyphSpace(strokes, this.box), this.glyph);
      if (scored.scribble) {
        this.onStrokeEnd(strokes);
        this._sendResult({ ...scored, tier: 0, reason: "scribble" });
        this._flushResize();
        return;
      }
    }
    this._syncProgress(strokes, true);
    this.onStrokeEnd(strokes);
    this._maybeFinish(strokes, targets);
    this._flushResize();
  }

  _flushResize() {
    if (!this._resizePending) return;
    this._resizePending = false;
    this.resize();
  }

  _maybeFinish(strokes, targets, force = false) {
    if (this.autoEvaluate === false || this._resultSent) return;
    const enough = this.strokeIndex >= targets.length;
    if (!enough && !force) return;

    const r = scoreTrace(toGlyphSpace(strokes, this.box), this.glyph);
    if (force && !strokes.length) return;
    // Loading saved ink and the idle safety net use this path too. They must
    // retain the same explicit refusal as lifting the pen, without changing ink.
    if (this.detectScribble && r.scribble) {
      this._sendResult({ ...r, tier: 0, reason: 'scribble' });
      return;
    }
    // Several pen lifts or a pause do not make an unfinished shape complete.
    // Keep both the screen and tracer open for the remaining parts.
    if (!enough) return;
    this._sendResult(r);
  }

  _syncProgress(strokes, announce = false, notify = false) {
    const previous = this._matchedStrokes || new Set();
    const marks = toGlyphSpace(strokes, this.box);
    // A dense refused scribble can cross every part. Saved return and Undo must
    // preserve that ink without presenting it as a green, completed letter.
    const refused = this.detectScribble && scoreTrace(marks, this.glyph).scribble;
    const progress = refused ? { matched: new Set(), next: 0, count: 0 } : traceParts(marks, this.glyph);
    this._matchedStrokes = progress.matched;
    this.strokeIndex = progress.next;
    this._traceRevision = (this._traceRevision || 0) + 1;
    this._bufDirty = true;
    if (announce) for (const index of progress.matched) if (!previous.has(index)) {
      emit('trace:strokeOK', { idx: index, char: this.char });
    }
    if (notify || previous.size !== progress.count) this.onProgress(progress.count, targetStrokes(this.glyph).length);
  }

  _sendResult(result) {
    if (this._resultSent) return false;
    this._resultSent = true;
    this.done = true;
    this._bufDirty = true;
    emit("trace:result", { char: this.char, tier: result.tier, reason: result.reason || null, result });
    this.onResult(result);
    return true;
  }

  /** Keep an unfinished drawing editable after a gentle low-confidence result. */
  continueDrawing() {
    this.done = false;
    this._resultSent = false;
    this._bufDirty = true;
    this._touched();
  }

  // --------------------------------------------------------------- buttons

  undo() {
    if (!this.ink.undo()) return;
    this._syncProgress(this.ink.strokes(), false, true);
    this.done = false;
    this._resultSent = false;
    this._bufDirty = true;
    this._touched();
    this.onStrokeEnd(this.ink.strokes());
  }

  /** Remove only the last interrupted tracing attempt, retaining earlier ink
   * and the corresponding guide position. Never used by free drawing. */
  discardLastAttempt() {
    this.undo();
    this.continueDrawing();
  }

  clear() {
    this.ink.clear();
    this._matchedStrokes = new Set();
    this._traceRevision = (this._traceRevision || 0) + 1;
    this.strokeIndex = 0;
    this.done = false;
    this._resultSent = false;
    this._bufDirty = true;
    this._touched();
    this.onProgress(0, targetStrokes(this.glyph).length);
    this.onStrokeEnd(this.ink.strokes());
  }

  /** "Show me": the soft hand walks the stroke she is on. Her pen still draws meanwhile. */
  showMe() {
    if (this._hand) this._hand.cancel();
    this._touched();
    const level = Math.min(this.level, 2);   // at 3 and 4 the box is empty, so show the path anyway
    const count = targetStrokes(this.glyph).length;
    const index = Math.max(0, Math.min(this.strokeIndex, count - 1));
    this._hand = animateHand(this.gctx, this.glyph, this.box, index, {
      level,
      redraw: (t) => this._paintGuide(t, level),
    });
    const h = this._hand;
    h.then(() => { if (this._hand === h) this._hand = null; });
    return h;
  }

  // ------------------------------------------------------------------ loop

  _loop(t) {
    this._raf = requestAnimationFrame(this._loopBound);
    if (!this.gctx || !this.box) return;

    if (!this._lastInputAt) this._lastInputAt = t;
    // Do not demonstrate or evaluate while a break or hidden page owns attention.
    // Start a fresh quiet period after returning instead of interrupting at once.
    const suspended = session.isBreakLocked() || !!globalThis.document?.hidden;
    if (suspended) { this._lastInputAt = t; this._nudgeFrom = 0; }
    const idle = t - this._lastInputAt;

    // Idle nudge: the start dot swells for a moment and Pip (world lane) taps it.
    if (!suspended && !this.done && !this.pen?.drawing && this.level <= 1 && !this._nudgeFrom && idle > IDLE_MS && t >= this._nextNudgeAt) {
      this._nudgeFrom = t;
      this._nextNudgeAt = t + NUDGE_REPEAT_MS;   // never demonstrate more often than every 20 seconds
      emit("trace:idle", { char: this.char, strokeIndex: this.strokeIndex });
    }
    if (this._nudgeFrom && t - this._nudgeFrom > NUDGE_MS) this._nudgeFrom = 0;

    // A paused trace gets the same shape check as a pen lift. Missing parts remain
    // editable; an obvious scribble gets the same gentle recovery in either path.
    if (!suspended && !this.done && !this.pen?.drawing && !this._idleChecked && idle > SAFETY_MS) {
      this._idleChecked = true;
      const strokes = this.ink.strokes();
      if (strokes.length) this._maybeFinish(strokes, targetStrokes(this.glyph), true);
    }

    if (this._hand) return;                 // the hand animation owns the canvas while it runs
    this._paintGuide(t, this.level);
  }

  _paintGuide(t, level = this.level) {
    const ctx = this.gctx;
    if (!ctx) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (level >= 3) return;

    if (this._bufDirty || !this._buf || this._bufStrokeIndex !== this.strokeIndex) this._makeBuf(level, w, h);
    if (this._buf) ctx.drawImage(this._buf, 0, 0, w, h);

    if (this.done) return;
    const reduce = motionReduced();
    const nudge = !reduce && this._nudgeFrom ? Math.sin(Math.min(1, (t - this._nudgeFrom) / NUDGE_MS) * Math.PI) : 0;
    drawGuide(ctx, this.glyph, this.box, {
      level, strokeIndex: this.strokeIndex, t: reduce ? 0 : t, done: this.done, nudge,
      matchedStrokes: this._matchedStrokes,
      drawStrokes: false, drawDot: true,
    });
  }

  /** The static half of the guide, painted once per change and blitted after that. */
  _makeBuf(level, w, h) {
    const dpr = (typeof devicePixelRatio === "number" && devicePixelRatio) || 1;
    if (!this._buf) {
      this._buf = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(Math.round(w * dpr), Math.round(h * dpr))
        : document.createElement("canvas");
    }
    this._buf.width = Math.round(w * dpr);
    this._buf.height = Math.round(h * dpr);
    const bctx = this._buf.getContext("2d");
    if (!bctx) { this._buf = null; return; }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, w, h);
    drawGuide(bctx, this.glyph, this.box, {
      level, strokeIndex: this.strokeIndex, done: this.done, drawStrokes: true, drawDot: false,
      matchedStrokes: this._matchedStrokes,
    });
    this._bufDirty = false;
    this._bufStrokeIndex = this.strokeIndex;
  }

  // ------------------------------------------------------------------- API

  setLevel(n) {
    const v = Math.max(0, Math.min(4, n | 0));
    if (v === this.level) return;
    this.level = v;
    this._bufDirty = true;
  }

  setGlyph(glyph) {
    const selected = resolveGlyph(glyph);
    if (!selected) return false;
    this.char = typeof glyph === "string" ? glyph : (selected.id || selected.name || this.char);
    this.glyph = selected;
    this.clear();
    this.resize();
    return true;
  }

  strokes() { return this.ink.strokes(); }

  /** Orientation-independent, JSON-safe resume data in the glyph's 0..100 space. */
  snapshot() {
    return {
      version: 1,
      coordinateSpace: "glyph",
      glyph: this.char,
      // Six decimals is far below one device pixel and prevents harmless binary float
      // drift from changing persisted JSON after repeated orientation round-trips.
      strokes: toGlyphSpace(this.ink.strokes(), this.box).map((stroke) => stroke.map((p) => ({
        ...p,
        x: Math.round(p.x * 1e6) / 1e6,
        y: Math.round(p.y * 1e6) / 1e6,
      }))),
    };
  }

  /** Restore snapshot() output. Invalid or wrong-glyph data leaves current ink untouched. */
  loadSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1 || snapshot.coordinateSpace !== "glyph") return false;
    if (snapshot.glyph !== this.char || !validSnapshotStrokes(snapshot.strokes)) return false;
    this.load(fromGlyphSpace(snapshot.strokes, this.box));
    return true;
  }

  /** Restore saved ink and recognize its actual parts again. */
  load(strokes) {
    this.ink.load(strokes);
    const targets = targetStrokes(this.glyph);
    const all = this.ink.strokes();
    this._resultSent = false;
    this.done = false;
    this._syncProgress(all, false, true);
    const revision = this._traceRevision, glyph = this.glyph;
    // A trace that was already finished when the tab died still owes her the payoff.
    if (all.length) Promise.resolve().then(() => {
      if (revision === this._traceRevision && glyph === this.glyph && !this.pen?.drawing) this._maybeFinish(all, targets, true);
    });
  }

  setAllowFinger(on) { this.pen.setAllowFinger(on); }

  destroy() {
    this._traceRevision++;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._hand) this._hand.cancel();
    this._hand = null;
    if (this._ro) this._ro.disconnect();
    if (typeof removeEventListener === "function") removeEventListener("resize", this._onWinResize);
    document.removeEventListener?.("visibilitychange", this._onVisibility);
    this._idleOffs?.forEach(off => off()); this._idleOffs = [];
    this.pen.destroy();
    this.ink.destroy();
    for (const cleanup of this._buttonCleanups) cleanup();
    this._buttonCleanups.length = 0;
    for (const button of this._buttons) {
      if (button.parentNode) button.parentNode.removeChild(button);
    }
    if (this.tools && this.tools.parentNode) this.tools.parentNode.removeChild(this.tools);
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = this.gctx = this._buf = null;
  }
}

// ---------------------------------------------------------------- helpers

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

function pathLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/** Move pixel strokes from one glyph box to another (orientation change). */
function rescale(strokes, from, to) {
  const sx = to.w / (from.w || 1);
  const sy = to.h / (from.h || 1);
  return strokes.map((s) => s.map((p) => ({
    x: to.x + (p.x - from.x) * sx,
    y: to.y + (p.y - from.y) * sy,
    p: p.p, t: p.t,
  })));
}

const ICONS = {
  undo:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="#4a3b34" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M14 27 C14 15 34 11 38 23 C41 33 33 40 24 38"/><path d="M7 20 L14 27 L21 20"/></g></svg>',
  clear:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#4a3b34" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M24 6 L24 25" fill="none"/><path d="M15 25 L33 25 L38 39 C30 43 18 43 10 39 Z" fill="#4a3b34"/>' +
    '<path d="M18 30 L16 40 M24 30 L24 42 M30 30 L32 40" stroke="#fffdf8" stroke-width="2.6" fill="none"/></g></svg>',
  show:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke="#4a3b34" stroke-linecap="round">' +
    '<path d="M8 36 C12 16 26 9 38 14" stroke-width="4" stroke-dasharray="0.5 7"/>' +
    '<circle cx="31" cy="31" r="9" fill="#ffd3ab" stroke-width="4"/></g></svg>',
};

const CSS = `
.rv-tracer { position:absolute; inset:0; touch-action:none; -webkit-user-select:none; user-select:none; }
.rv-tracer__guide, .rv-tracer__ink { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }
.rv-tracer__ink { z-index:2; }
.rv-tracer__tools { position:absolute; z-index:3; display:flex; flex-direction:column; gap:${TOOLS_PAD}px; padding:${TOOLS_PAD}px; pointer-events:none; }
.rv-tracer__tools--left { left:0; bottom:0; }
.rv-tracer__tools--right { right:0; bottom:0; }
.rv-tracer__tools--row { flex-direction:row; bottom:0; }
.rv-tracer__tools--row.rv-tracer__tools--left { left:0; right:auto; }
.rv-tracer__tools--row.rv-tracer__tools--right { right:0; left:auto; }
.rv-tracer__tools.rv-tracer__tools--external { position:relative; inset:auto; flex-direction:row; padding:0; }
.rv-btn {
  width:var(--rv-tool-size, ${BUTTON_MAX}px); height:var(--rv-tool-size, ${BUTTON_MAX}px); border-radius:50%; border:4px solid #4a3b34;
  padding:0; display:grid; place-items:center; cursor:pointer; touch-action:manipulation;
  pointer-events:auto;
  box-shadow:0 4px 0 rgba(74,59,52,.18), 0 8px 18px rgba(74,59,52,.14);
  transition: transform 180ms cubic-bezier(.34,1.56,.64,1), box-shadow 180ms ease-out;
  -webkit-tap-highlight-color:transparent;
}
.rv-btn svg { width:60%; height:60%; pointer-events:none; }
.rv-btn.is-press, .rv-btn:active {
  transform:scale(.96); transition:none;
  box-shadow:0 1px 0 rgba(74,59,52,.18), 0 2px 6px rgba(74,59,52,.12);
}
.rv-btn:focus { outline:none; }
.rv-btn:focus-visible { outline:3px solid ${P.lilacDeep}; outline-offset:3px; }
@media (prefers-reduced-motion: reduce) { .rv-btn { transition:none; } }
`;

function injectStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById("rv-tracer-style")) return;
  const s = document.createElement("style");
  s.id = "rv-tracer-style";
  s.textContent = CSS;
  document.head.appendChild(s);
}

function validSnapshotStrokes(strokes) {
  return Array.isArray(strokes) && strokes.every((stroke) =>
    Array.isArray(stroke) && stroke.length > 0 && stroke.every((p) =>
      p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) &&
      (p.p === undefined || Number.isFinite(Number(p.p))) &&
      (p.t === undefined || Number.isFinite(Number(p.t)))
    )
  );
}

function resolveGlyph(glyph) {
  const selected = typeof glyph === "string" ? GLYPHS[glyph] : glyph;
  return selected && Array.isArray(selected.strokes) && selected.strokes.length ? selected : null;
}

function motionReduced() {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("reduced-motion")) return true;
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default Tracer;
