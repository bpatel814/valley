// ink.js - the ink layer. This is the thing Rayna actually touches, so the two rules that
// matter are: it must answer on the same frame, and it must be beautiful.
//
// How it is put together (the "why", because the shape is not obvious):
//
//  * There are two surfaces. `committed` is an offscreen canvas that holds every stroke
//    that has settled. The visible canvas is cleared each frame, the committed surface is
//    blitted onto it (one drawImage), and only the un-settled tail of the live stroke is
//    painted fresh. So the per-frame cost is one blit plus about three short line
//    segments, no matter how much ink is already on the page.
//  * A stroke settles progressively. Catmull-Rom smoothing of the span between points
//    i and i+1 needs points i-1 and i+2, so span i is final the moment point i+2 arrives.
//    Final spans go straight into `committed`; only the last span is redrawn per frame.
//  * `prev` is a snapshot of `committed` taken at the START of each stroke, so undoing the
//    stroke she just drew is a single blit - instant and guilt-free (pillar 1). Undoing
//    further back rebuilds from the stroke list, which is cheap at letter sizes.
//  * Nothing is allocated inside the render loop: cumulative lengths live in a parallel
//    array that grows with the stroke, and rainbow colours come from a small quantised
//    cache instead of re-formatting a hex string per segment.
//
// The layer is headless-safe: with no 2D context (node tests) every draw call is a no-op
// while strokes(), load(), undo() and clear() keep working.

import { rainbowAt } from "../world/palette.js";
import { P } from "../world/palette.js";
import { emit } from "../world/bus.js";

/** Pressure -> width multiplier. Style bible: 0.6x to 1.4x of the base width. */
export function pressureWidth(p) {
  const n = Number(p);
  const c = !Number.isFinite(n) ? 0.5 : n < 0 ? 0 : n > 1 ? 1 : n;
  return 0.6 + 0.8 * c;
}

/** Per-style width multipliers. Marker is wider and deliberately flat. */
export const STYLE_SCALE = { rainbow: 1, solid: 1, crayon: 1.05, marker: 1.6 };

/** Final stroke width in CSS px for a point. Pure, so the tests can pin the maths. */
export function strokeWidthAt(base = 10, p = 0.5, kind = "rainbow") {
  const scale = STYLE_SCALE[kind] || 1;
  // A marker does not thin out under a light hand; compress pressure toward the middle.
  const pp = kind === "marker" ? 0.5 + (p - 0.5) * 0.3 : p;
  return base * scale * pressureWidth(pp);
}

const MIN_DIST = 1.25;   // CSS px between stored points; below this is digitiser tremor
const HUE_CYCLE = 1600;  // px of ink for one full trip round the rainbow: a slow drift
const HUE_JOIN = 24;     // px at the head of a stroke that hold the previous end hue
const DEFAULT_WIDTH = 10;

// Quantised rainbow cache: rainbowAt parses and formats hex, which we do not want per
// segment. 256 buckets is far finer than the eye can see across one letter.
const HUE_STEPS = 256;
const hueCache = new Array(HUE_STEPS);
function rainbowQ(t) {
  let u = t % 1;
  if (u < 0) u += 1;
  const i = (u * HUE_STEPS) | 0;
  let c = hueCache[i];
  if (!c) { c = rainbowAt(i / HUE_STEPS); hueCache[i] = c; }
  return c;
}

/** Deterministic hash -> [-1, 1]. Crayon grain must look identical after a rebuild. */
function grain(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h >>> 8) / 0x7fffff) - 1;
}

function makeSurface(w, h) {
  try {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    if (typeof document !== "undefined") {
      const c = document.createElement("canvas");
      c.width = Math.max(1, w); c.height = Math.max(1, h);
      return c;
    }
  } catch { /* headless */ }
  return null;
}

export class InkLayer {
  constructor(canvas, { style = {}, emitMove = true } = {}) {
    this.canvas = canvas;
    this.emitMove = emitMove;
    this.style = {
      kind: style.kind || "rainbow",
      width: style.width || DEFAULT_WIDTH,
      color: style.color || P.ink,
      hueOffset: style.hueOffset || 0,
    };

    this.dpr = 1;
    this.w = 0;   // CSS px
    this.h = 0;
    this.ctx = null;
    this.committed = null;
    this.cctx = null;
    this.prev = null;
    this.pctx = null;
    this.prevValid = false;   // does `prev` hold the state before the newest stroke?

    this._strokes = [];       // committed strokes: Array<Array<{x,y,p,t}>>
    this._phases = [];        // hue phase (cumulative ink length) at each stroke's start
    this._totalPhase = 0;

    this._live = null;        // points of the stroke in progress
    this._lens = null;        // cumulative length per live point (parallel, reused)
    this._livePhase = 0;
    this._liveSeed = 0;
    this._settled = 0;        // spans of the live stroke already painted into `committed`
    this._lastMove = null;    // newest live point, for the throttled bus emit

    this._raf = 0;
    this._dirty = true;
    this._tick = this._render.bind(this);

    this.resize();
  }

  // ---------------------------------------------------------------- surfaces

  resize() {
    const c = this.canvas;
    if (!c) return;
    const dpr = (typeof devicePixelRatio === "number" && devicePixelRatio) || 1;
    const w = c.clientWidth || c.width || 0;
    const h = c.clientHeight || c.height || 0;
    if (!w || !h) return;
    if (this.w === w && this.h === h && this.dpr === dpr && this.ctx) return;

    this.dpr = dpr;
    this.w = w;
    this.h = h;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    c.width = bw;
    c.height = bh;

    this.ctx = typeof c.getContext === "function" ? c.getContext("2d") : null;
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.committed = makeSurface(bw, bh);
    this.prev = makeSurface(bw, bh);
    this.cctx = this.committed && this.committed.getContext ? this.committed.getContext("2d") : null;
    this.pctx = this.prev && this.prev.getContext ? this.prev.getContext("2d") : null;
    if (this.cctx) this.cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.pctx) this.pctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.prevValid = false;
    this._rebuild();
  }

  setStyle(style = {}) {
    this.style = { ...this.style, ...style };
    this.prevValid = false;
    this._rebuild();
  }

  // ---------------------------------------------------------------- stroking

  begin(pt) {
    const clean = trim(pt);
    if (!clean) return false;
    // Snapshot first: this is what undo blits back.
    this._snapshot();
    this._live = [clean];
    if (!this._lens || this._lens.length < 64) this._lens = new Float64Array(1024);
    this._lens[0] = 0;
    this._livePhase = this._totalPhase;
    this._liveSeed = this._strokes.length + 1;
    this._settled = 0;
    this._lastMove = pt;
    this._dirty = true;
    this._schedule();
    return true;
  }

  add(pt) {
    const live = this._live;
    const clean = trim(pt);
    if (!live || !clean) return false;
    const last = live[live.length - 1];
    const d = Math.hypot(clean.x - last.x, clean.y - last.y);
    if (d < MIN_DIST) return false;        // tremor, not motion
    if (live.length >= this._lens.length) this._growLens();
    this._lens[live.length] = this._lens[live.length - 1] + d;
    live.push(clean);
    this._lastMove = clean;
    this._dirty = true;
    this._schedule();
    return true;
  }

  end() {
    const live = this._live;
    this._live = null;
    this._lastMove = null;
    if (!live) return null;
    if (live.length < 2) {
      // A tap: one dot of ink is still ink, so keep it and paint it.
      this._paintSpans(this.cctx, live, this._lens, 0, 0, this._livePhase, this._liveSeed);
    } else {
      this._paintSpans(this.cctx, live, this._lens, this._settled, live.length - 1, this._livePhase, this._liveSeed);
    }
    this._phases.push(this._livePhase);
    this._totalPhase = this._livePhase + (live.length > 1 ? this._lens[live.length - 1] : 0);
    this._strokes.push(live);
    this._settled = 0;
    this._dirty = true;
    this._schedule();
    return live;
  }

  // ------------------------------------------------------------------ edits

  /** Remove the newest stroke. The common case (undo what you just drew) is one blit. */
  undo() {
    if (this._live) {              // undo mid-stroke = abandon the stroke in progress
      this._live = null;
      this._settled = 0;
      this._restore();
      this._dirty = true;
      this._schedule();
      return true;
    }
    if (!this._strokes.length) return false;
    this._strokes.pop();
    this._phases.pop();
    this._totalPhase = this._phases.length ? this._phaseEnd(this._strokes.length - 1) : 0;
    if (this.prevValid) this._restore();
    else this._rebuild();
    this._dirty = true;
    this._schedule();
    return true;
  }

  clear() {
    this._strokes.length = 0;
    this._phases.length = 0;
    this._totalPhase = 0;
    this._live = null;
    this._settled = 0;
    this.prevValid = false;
    if (this.cctx) this.cctx.clearRect(0, 0, this.w, this.h);
    this._dirty = true;
    this._schedule();
  }

  /** A plain, JSON-safe copy: this is what the state lane saves for resume. */
  strokes() {
    return this._strokes.map((s) => s.map((p) => ({ x: p.x, y: p.y, p: p.p, t: p.t })));
  }

  load(strokes) {
    this._strokes = (Array.isArray(strokes) ? strokes : [])
      .map((s) => (Array.isArray(s) ? s : []).map(trim).filter(Boolean))
      .filter((s) => s.length > 0);
    this._live = null;
    this._settled = 0;
    this.prevValid = false;
    this._rebuild();
    this._dirty = true;
    this._schedule();
  }

  /** Data URL of the ink alone (transparent ground), for the gallery. */
  toPNG(w = this.w, h = this.h) {
    if (typeof document === "undefined" || !this.committed) return null;
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w));
    out.height = Math.max(1, Math.round(h));
    const g = out.getContext("2d");
    if (!g) return null;
    g.drawImage(this.committed, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  destroy() {
    if (this._raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._live = null;
    this._strokes.length = 0;
    this.committed = this.prev = this.cctx = this.pctx = null;
  }

  // --------------------------------------------------------------- internals

  _growLens() {
    const next = new Float64Array(this._lens.length * 2);
    next.set(this._lens);
    this._lens = next;
  }

  _phaseEnd(i) {
    const s = this._strokes[i];
    if (!s || s.length < 2) return this._phases[i] || 0;
    let L = 0;
    for (let k = 1; k < s.length; k++) L += Math.hypot(s[k].x - s[k - 1].x, s[k].y - s[k - 1].y);
    return (this._phases[i] || 0) + L;
  }

  _snapshot() {
    if (!this.pctx || !this.committed) { this.prevValid = false; return; }
    this.pctx.clearRect(0, 0, this.w, this.h);
    this.pctx.drawImage(this.committed, 0, 0, this.w, this.h);
    this.prevValid = true;
  }

  _restore() {
    if (!this.cctx || !this.prev) return;
    this.cctx.clearRect(0, 0, this.w, this.h);
    this.cctx.drawImage(this.prev, 0, 0, this.w, this.h);
    this.prevValid = false;   // the snapshot has been spent
  }

  /** Repaint `committed` from the stroke list. Used by load, resize and a deep undo. */
  _rebuild() {
    if (!this.cctx) {
      // Headless: still keep the hue phases honest so strokes() / load() round-trip.
      this._phases = [];
      let phase = 0;
      for (const s of this._strokes) {
        this._phases.push(phase);
        for (let k = 1; k < s.length; k++) phase += Math.hypot(s[k].x - s[k - 1].x, s[k].y - s[k - 1].y);
      }
      this._totalPhase = phase;
      return;
    }
    this.cctx.clearRect(0, 0, this.w, this.h);
    this._phases = [];
    let phase = 0;
    const lens = new Float64Array(Math.max(2, longest(this._strokes) + 1));
    for (let i = 0; i < this._strokes.length; i++) {
      const s = this._strokes[i];
      lens[0] = 0;
      for (let k = 1; k < s.length; k++) lens[k] = lens[k - 1] + Math.hypot(s[k].x - s[k - 1].x, s[k].y - s[k - 1].y);
      this._phases.push(phase);
      this._paintSpans(this.cctx, s, lens, 0, Math.max(0, s.length - 1), phase, i + 1);
      phase += s.length > 1 ? lens[s.length - 1] : 0;
    }
    this._totalPhase = phase;
  }

  _schedule() {
    if (this._raf || typeof requestAnimationFrame !== "function") return;
    this._raf = requestAnimationFrame(this._tick);
  }

  _render() {
    this._raf = 0;
    const ctx = this.ctx;
    const live = this._live;

    if (ctx && (this._dirty || live)) {
      // Settle everything the smoothing no longer needs, then blit and draw the tail.
      if (live && live.length > 2) {
        const settleTo = live.length - 3;   // span i is final once point i+2 exists
        if (settleTo >= this._settled) {
          this._paintSpans(this.cctx, live, this._lens, this._settled, settleTo + 1, this._livePhase, this._liveSeed);
          this._settled = settleTo + 1;
        }
      }
      ctx.clearRect(0, 0, this.w, this.h);
      if (this.committed) ctx.drawImage(this.committed, 0, 0, this.w, this.h);
      if (live && live.length > 1) {
        this._paintSpans(ctx, live, this._lens, this._settled, live.length - 1, this._livePhase, this._liveSeed);
      } else if (live && live.length === 1) {
        this._paintSpans(ctx, live, this._lens, 0, 0, this._livePhase, this._liveSeed);
      }
      this._dirty = false;
    }

    // One sparkle-trail event per frame, not one per digitiser sample: fx.js listens.
    if (this.emitMove && live && this._lastMove) {
      const m = this._lastMove;
      emit("stroke:move", { x: m.x, y: m.y, v: m.v || 0 });
      this._lastMove = null;
    }

    if (live) this._schedule();
  }

  /**
   * Paint spans [from, to) of `pts` onto ctx. A "span" is the curve between pts[i] and
   * pts[i+1], sub-sampled along a centripetal-ish Catmull-Rom through its neighbours.
   * One stroke() per span keeps the joins clean (no double-darkened overlaps) and the
   * call count low. `from === to === 0` with a single point draws the dot of a tap.
   */
  _paintSpans(ctx, pts, lens, from, to, phase0, seed) {
    if (!ctx || !pts || !pts.length) return;
    const st = this.style;
    const base = st.width || DEFAULT_WIDTH;
    const kind = st.kind;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (pts.length === 1) {
      const p = pts[0];
      ctx.fillStyle = kind === "rainbow" ? rainbowQ(st.hueOffset + phase0 / HUE_CYCLE) : st.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, strokeWidthAt(base, p.p, kind) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const n = pts.length;
    for (let i = from; i < to && i < n - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p0 = pts[i - 1] || p1;
      const p3 = pts[i + 2] || p2;

      const segLen = lens[i + 1] - lens[i];
      const steps = segLen > 9 ? 4 : segLen > 4 ? 3 : 2;

      // colour and width are evaluated once per span: inside one span (a couple of px)
      // neither changes enough to see, and this keeps the per-frame work tiny.
      const midP = (p1.p + p2.p) * 0.5;
      ctx.lineWidth = strokeWidthAt(base, midP, kind);
      if (kind === "rainbow") {
        ctx.strokeStyle = rainbowQ(st.hueOffset + this._hueT(phase0, (lens[i] + lens[i + 1]) * 0.5));
      } else {
        ctx.strokeStyle = st.color;
      }

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (kind === "crayon") {
        // Grain: two short off-axis dabs per span at low alpha. Seeded, so a rebuild
        // (undo, resize, resume) reproduces exactly the same texture.
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        const half = ctx.lineWidth * 0.42;
        ctx.globalAlpha = 0.22;
        for (let g = 0; g < 2; g++) {
          const off = grain(seed * 31 + i, g) * half;
          ctx.lineWidth = Math.max(1, half * (0.5 + 0.4 * Math.abs(grain(i, g + 7))));
          ctx.beginPath();
          ctx.moveTo(p1.x + nx * off, p1.y + ny * off);
          ctx.lineTo(p2.x + nx * off, p2.y + ny * off);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  /**
   * Hue position along the rainbow. The phase is cumulative across every stroke in the
   * layer, so a letter reads as one continuous rainbow rather than restarting per stroke.
   * Over the first HUE_JOIN px of a stroke the drift is eased in from the previous
   * stroke's final hue, which makes the pen-lift invisible in the colour.
   */
  _hueT(phase0, lenInStroke) {
    const end = (phase0 + lenInStroke) / HUE_CYCLE;
    if (lenInStroke >= HUE_JOIN) return end;
    const start = phase0 / HUE_CYCLE;
    const u = lenInStroke / HUE_JOIN;
    const ease = u * u * (3 - 2 * u);
    return start + (end - start) * ease;
  }
}

function trim(p) {
  if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) return null;
  const pressure = Number(p.p);
  const time = Number(p.t);
  return {
    x: Number(p.x),
    y: Number(p.y),
    p: Number.isFinite(pressure) ? Math.max(0, Math.min(1, pressure)) : 0.5,
    t: Number.isFinite(time) ? time : 0,
  };
}

function longest(strokes) {
  let m = 0;
  for (const s of strokes) if (s.length > m) m = s.length;
  return m;
}

export default InkLayer;
