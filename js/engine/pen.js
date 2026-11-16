// pen.js - Pointer Events wrapper for the S Pen, a finger, or a mouse.
//
// The hard part on a Galaxy Note is the palm: resting a hand on the screen fires `touch`
// pointers that would otherwise draw. Touch is suppressed briefly after real pen contact,
// and a pen contact pre-empts a touch that is already down. Hover still drives character
// reactions, but it never locks a finger user out of drawing.
//
// Every point carries a smoothed speed `v` (px/ms) and a smoothed pressure `p`. Raw
// digitiser pressure is noisy enough that feeding it straight into stroke width makes the
// ink look like a caterpillar; a 4-sample exponential moving average is cheap and enough.

export const PEN_MEMORY_MS = 1500;

// Exponential moving average over roughly the last 4 samples: alpha = 2 / (N + 1).
const EMA_ALPHA = 0.4;

/**
 * The accept decision, pulled out as a pure function so it can be unit tested without a
 * DOM. `now` and `lastPenAt` are both performance.now() style milliseconds.
 *   pen   -> always draws
 *   touch -> only when finger drawing is on AND no pen has been seen for PEN_MEMORY_MS
 *   mouse and anything exotic -> always draws (desktop testing)
 */
export function shouldAccept({ pointerType, lastPenAt = -Infinity, now = 0, allowFinger = true } = {}) {
  if (pointerType === "pen") return true;
  if (pointerType === "touch") {
    if (!allowFinger) return false;
    if (!Number.isFinite(lastPenAt)) return true;
    return now - lastPenAt >= PEN_MEMORY_MS;
  }
  return true;
}

/** A running EMA of position-derived speed and pressure for one pointer. */
function newTrack() {
  return { has: false, x: 0, y: 0, t: 0, v: 0, p: 0.5 };
}

export class PenInput {
  constructor(canvasEl, { onStrokeStart, onStrokeMove, onStrokeEnd, onHover, allowFinger = true } = {}) {
    this.el = canvasEl;
    this.onStrokeStart = onStrokeStart || (() => {});
    this.onStrokeMove = onStrokeMove || (() => {});
    this.onStrokeEnd = onStrokeEnd || (() => {});
    this.onHover = onHover || (() => {});
    this.allowFinger = allowFinger;

    this.activeId = null;      // only one pointer draws at a time
    this.activeType = null;
    this.lastPenAt = -Infinity;
    this.points = [];
    this._draw = newTrack();   // smoothing state for the stroke in progress
    this._hover = newTrack();  // ...and for the hovering pen, kept apart so a hover never
                               //    bleeds a stale velocity into the first drawn point

    // A canvas that scrolls the page while you draw on it is useless.
    this.el.style.touchAction = "none";
    this.el.style.msTouchAction = "none";

    this._down = this._onDown.bind(this);
    this._move = this._onMove.bind(this);
    this._up = this._onUp.bind(this);
    this._cancel = this._onCancel.bind(this);

    this.el.addEventListener("pointerdown", this._down);
    this.el.addEventListener("pointermove", this._move);
    this.el.addEventListener("pointerup", this._up);
    this.el.addEventListener("pointercancel", this._cancel);
    this.el.addEventListener("lostpointercapture", this._cancel);
    this.el.addEventListener("pointerleave", this._up);
    // Stop the browser turning a long press into a text selection / context menu.
    this._ctx = (e) => e.preventDefault();
    this.el.addEventListener("contextmenu", this._ctx);
    // A page can lose visibility/focus without a reliable pointercancel. End
    // ownership through the normal cancellation path: callers keep ink but may
    // discard transient stamp previews. Never synthesize a final input point.
    this._document = this.el.ownerDocument || (typeof document !== "undefined" ? document : null);
    this._window = this._document?.defaultView || (typeof window !== "undefined" ? window : null);
    this._interrupt = event => {
      if (this.activeId !== null) this._finish({ pointerId: this.activeId, type: event?.type || "interruption" }, true);
    };
    this._visibility = event => { if (this._document?.hidden) this._interrupt(event); };
    this._document?.addEventListener?.("visibilitychange", this._visibility);
    this._window?.addEventListener?.("blur", this._interrupt);
  }

  /** Parent setting: pen only, or let a finger draw too. */
  setAllowFinger(on) {
    this.allowFinger = !!on;
  }

  _now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  /** Should this pointer be allowed to draw right now? */
  _accepts(e) {
    return shouldAccept({
      pointerType: e.pointerType,
      lastPenAt: this.lastPenAt,
      now: this._now(),
      allowFinger: this.allowFinger,
    });
  }

  _point(e, track) {
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const t = typeof e.timeStamp === "number" && e.timeStamp > 0 ? e.timeStamp : this._now();

    // Pen pressure is 0..1; mice report 0.5 when down and 0 otherwise. Normalise so the
    // width multiplier lands in the same range for everything.
    let raw = Number(e.pressure);
    if (!Number.isFinite(raw) || raw <= 0) raw = 0.5;
    raw = Math.max(0, Math.min(1, raw));

    let v = 0;
    let p = raw;
    if (track.has) {
      const dt = t - track.t;
      const inst = dt > 0 ? Math.hypot(x - track.x, y - track.y) / dt : track.v;
      v = track.v + (inst - track.v) * EMA_ALPHA;
      p = track.p + (raw - track.p) * EMA_ALPHA;
    }
    track.has = true;
    track.x = x; track.y = y; track.t = t; track.v = v; track.p = p;

    // width is the pressure multiplier the ink layer applies to its base width; the same
    // 0.6..1.4 curve lives in ink.js `pressureWidth` (style bible, Ink section).
    return { x, y, p, pRaw: raw, t, v, width: 0.6 + 0.8 * p };
  }

  _onDown(e) {
    if (e.pointerType === "pen") {
      this.lastPenAt = this._now();
      // A palm can land a fraction before the pen. Let the intentional pen own the
      // surface and tell the consumer to discard the partial touch stroke.
      if (this.activeId !== null && this.activeType === "touch") {
        this._finish(e, true, true, this.activeId);
      }
    }
    if (this.activeId !== null) return;      // ignore every other secondary pointer
    if (!this._accepts(e)) return;
    if (e.button !== undefined && e.button > 0) return; // right/middle mouse does not draw

    this.activeId = e.pointerId;
    this.activeType = e.pointerType || "mouse";
    // Capture keeps the stroke alive when the pen slides outside the canvas.
    try { this.el.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
    e.preventDefault();

    this._draw = newTrack();
    const pt = this._point(e, this._draw);
    if (!pt) {
      this.activeId = null;
      this.activeType = null;
      try { this.el.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      return;
    }
    this.points = [pt];
    this.onStrokeStart(pt, e);
  }

  _onMove(e) {
    if (e.pointerId !== this.activeId) {
      // S Pen hover: the tip is above the glass, no button down. Friends look toward it.
      if (e.pointerType === "pen" && this.activeId === null && (e.buttons === 0 || e.buttons === undefined)) {
        const pt = this._point(e, this._hover);
        if (pt) this.onHover(pt, e);
      }
      return;
    }
    if (e.pointerType === "pen") this.lastPenAt = this._now();
    e.preventDefault();

    // Coalesced events give every sample the digitiser captured between frames, which is
    // the difference between a smooth curve and a polygon on a fast flick.
    const raw = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : null;
    const events = raw && raw.length ? raw : [e];
    for (const ev of events) {
      const pt = this._point(ev, this._draw);
      if (!pt) continue;
      this.points.push(pt);
      this.onStrokeMove(pt, ev);
    }
  }

  _onUp(e) {
    if (e.pointerId !== this.activeId) return;
    this._finish(e, false);
  }

  _onCancel(e) {
    if (e.pointerId !== this.activeId) return;
    // The OS took the pointer away (palm gesture, system edge swipe). Keep the ink that
    // exists rather than losing the child's work; just end the stroke.
    this._finish(e, true);
  }

  _finish(e, cancelled, discarded = false, pointerId = e.pointerId) {
    // A quick line may have only down/up events. The lift position is still
    // real ink, and can be the last section missing from a completed letter.
    // Cancellation and pen pre-emption have no reliable final touch position.
    if (!cancelled && !discarded) {
      const pt = this._point(e, this._draw);
      const last = this.points[this.points.length - 1];
      if (pt && (!last || pt.x !== last.x || pt.y !== last.y)) {
        this.points.push(pt);
        this.onStrokeMove(pt, e);
      }
      if (this.activeType === "pen") this.lastPenAt = this._now();
    }
    // Retire ownership before release, which may synchronously dispatch loss.
    this.activeId = null;
    this.activeType = null;
    const pts = this.points;
    this.points = [];
    this._hover = newTrack();
    try { this.el.releasePointerCapture(pointerId); } catch { /* already released */ }
    this.onStrokeEnd(pts, { cancelled, discarded, event: e });
  }

  /** True while a stroke is in progress (used by the exit guard). */
  get drawing() { return this.activeId !== null; }

  destroy() {
    this.el.removeEventListener("pointerdown", this._down);
    this.el.removeEventListener("pointermove", this._move);
    this.el.removeEventListener("pointerup", this._up);
    this.el.removeEventListener("pointercancel", this._cancel);
    this.el.removeEventListener("lostpointercapture", this._cancel);
    this.el.removeEventListener("pointerleave", this._up);
    this.el.removeEventListener("contextmenu", this._ctx);
    this._document?.removeEventListener?.("visibilitychange", this._visibility);
    this._window?.removeEventListener?.("blur", this._interrupt);
    this.activeId = null;
    this.activeType = null;
    this.points = [];
  }
}

export default PenInput;
