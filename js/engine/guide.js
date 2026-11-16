// guide.js - the ghost letter under the ink, and the "show me" hand.
//
// The guide is the whole teaching mechanism: at level 0 it is a thick pastel road she
// drives along, and it thins, dots, and finally disappears as she gets it. Nothing here
// judges or corrects; the only moving parts are an invitation (the pulsing lemon start
// dot) and a clear arrow that shows which way to go.
//
// Everything is drawn in CSS pixels into a box `{x,y,w,h}`; the glyph itself lives in a
// 100 x 100 space and is mapped through that box.

import { targetStrokes } from "./scorer.js";
import { P } from "../world/palette.js";
import { art } from "../world/art.js";

export const GUIDE_COLORS = {
  base: "#dacfe8",     // pastel lilac-grey: the road
  current: P.lilac,    // the stroke she is on now, brighter
  done: P.mint,        // strokes already matched, faint
  dot: P.lemon,        // the start dot
  dotRing: P.lemonDeep,
  arrow: P.lilacDeep,
};

const LEVEL_WIDTH = { 0: 0.07, 1: 0.025, 2: 0.03 };
const DOT_R = 0.075;         // large enough to find before a preschool hand covers it
const DOT_PERIOD = 900;      // ms, 1.0 -> 1.18 -> 1.0
const ARROW_AT = 1 / 3;      // how far along the current stroke the direction arrow sits

// Pixel-space polylines per (glyph, box). Rebuilt only when the letter or the box changes,
// so the per-frame cost of the guide is a blit plus the dot.
const pxCache = new Map();
const PX_CACHE_MAX = 8;

/** The glyph's strokes as pixel polylines inside `box`. */
export function pixelStrokes(glyph, box) {
  const key = glyph.strokes.join("|") + "@" + box.x + "," + box.y + "," + box.w + "," + box.h;
  let hit = pxCache.get(key);
  if (!hit) {
    const sx = box.w / 100, sy = box.h / 100;
    hit = targetStrokes(glyph).map((s) => s.map((p) => ({ x: box.x + p.x * sx, y: box.y + p.y * sy })));
    if (pxCache.size >= PX_CACHE_MAX) pxCache.delete(pxCache.keys().next().value);
    pxCache.set(key, hit);
  }
  return hit;
}

/**
 * drawGuide(ctx, glyph, box, opts)
 *   level       0 thick, 1 thin, 2 dotted, 3 and 4 draw nothing inside the box
 *   strokeIndex the suggested next part; matchedStrokes explicitly tracks any drawn parts
 *   t           a timestamp in ms, for the start-dot pulse
 *   done        the whole letter is finished: everything reads as done, no dot, no arrow
 *   nudge       0..1 extra swell on the start dot (the idle nudge)
 *
 * `drawStrokes` and `drawDot` split the static half (guide strokes plus the direction
 * arrow) from the animated half (the breathing start dot). The tracer paints the static
 * half into a buffer once and blits it, so a frame costs a blit plus one circle.
 */
export function drawGuide(ctx, glyph, box, { level = 0, strokeIndex = 0, matchedStrokes = null, t = 0, done = false, nudge = 0, drawStrokes = true, drawDot = true } = {}) {
  if (!ctx || !glyph || !box || !box.w) return;
  if (level >= 3) return;                 // level 3 shows the model beside the box; 4 is memory

  const strokes = pixelStrokes(glyph, box);
  const w = (LEVEL_WIDTH[level] || 0.03) * box.w;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (drawStrokes) {
    for (let i = 0; i < strokes.length; i++) {
      const isDone = done || (matchedStrokes ? matchedStrokes.has(i) : i < strokeIndex);
      const isCurrent = !done && i === strokeIndex;
      ctx.strokeStyle = isDone ? GUIDE_COLORS.done : isCurrent ? GUIDE_COLORS.current : GUIDE_COLORS.base;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = isDone ? 0.5 : isCurrent ? 1 : 0.75;
      ctx.lineWidth = w;
      if (level === 2) drawDotted(ctx, strokes[i], w * 0.6, w * 1.9);
      else drawPolyline(ctx, strokes[i]);
    }
  }

  ctx.globalAlpha = 1;
  if (!done && strokes[strokeIndex] && strokes[strokeIndex].length > 1) {
    const cue = strokeCue(strokes[strokeIndex], box);
    if (drawStrokes) drawArrow(ctx, strokes[strokeIndex], box, cue);
    if (drawDot) drawStartDot(ctx, strokes[strokeIndex][0], box, t, nudge, cue);
  }
  ctx.restore();
}

function drawPolyline(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function drawDotted(ctx, pts, r, gap) {
  let acc = gap;   // start with a dot on the first point
  let prev = pts[0];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    acc += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
    if (acc < gap && i !== pts.length - 1) continue;
    acc = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A lemon dot on the first point that breathes, so the eye knows where to land. */
function drawStartDot(ctx, p, box, t, nudge = 0, cue) {
  const phase = (t % DOT_PERIOD) / DOT_PERIOD;
  const pulse = 1 + 0.14 * (1 - Math.cos(phase * Math.PI * 2));  // 1.00 .. 1.28
  const r = DOT_R * box.w * pulse * (1 + 0.35 * nudge);
  ctx.save();
  ctx.globalAlpha = cue.compact ? 0.18 : 0.34;
  ctx.fillStyle = GUIDE_COLORS.dot;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  // Keep the invitation large, but let a knot, eye or short ray remain visible
  // through its halo. An opaque letter-sized disc could hide that whole stroke.
  const core = cue.compact ? cue.core : r;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, core, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = cue.compact ? 2 : Math.max(3, box.w * 0.014);
  ctx.strokeStyle = P.ink;
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,253,248,.9)";
  ctx.beginPath();
  ctx.arc(p.x - core * 0.27, p.y - core * 0.3, core * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A high-contrast arrow a third of the way along, pointing the way the stroke travels. */
function drawArrow(ctx, pts, box, cue) {
  const at = arcPoint(pts, cue.compact ? 0.68 : ARROW_AT);
  if (!at) return;
  const s = cue.compact ? cue.arrow : box.w * 0.078;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(Math.atan2(at.dy, at.dx));
  ctx.globalAlpha = 1;
  ctx.fillStyle = GUIDE_COLORS.arrow;
  ctx.strokeStyle = P.paper;
  ctx.lineWidth = cue.compact ? 1.5 : Math.max(2.5, box.w * 0.012);
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.9, 0);
  ctx.lineTo(-s * 0.55, s * 0.62);
  ctx.quadraticCurveTo(-s * 0.2, 0, -s * 0.55, -s * 0.62);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

function strokeCue(pts, box) {
  let length = 0, left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    left = Math.min(left, p.x); right = Math.max(right, p.x);
    top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
    if (i) length += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
  }
  const span = Math.max(right - left, bottom - top);
  const compact = span < DOT_R * box.w * 2.3 || length < DOT_R * box.w * 3;
  return {
    compact,
    core: Math.max(3, Math.min(7, span * 0.16)),
    arrow: Math.max(3, Math.min(box.w * 0.078, length * 0.18, span * 0.24)),
  };
}

/** Point (and tangent) at fraction `u` of a polyline's arc length. */
export function arcPoint(pts, u) {
  if (!pts || pts.length < 2) return null;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (total === 0) return { x: pts[0].x, y: pts[0].y, dx: 1, dy: 0 };
  let want = total * Math.max(0, Math.min(1, u));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (want <= d || i === pts.length - 1) {
      const k = d ? want / d : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: b.x - a.x, dy: b.y - a.y };
    }
    want -= d;
  }
  return null;
}

/**
 * animateHand(ctx, glyph, box, strokeIndex, opts) - "show me".
 * A soft round pointer travels the current stroke over ~900 ms with an ease-in-out and
 * leaves a lilac trail that lingers 600 ms. Pass `redraw(now)` to repaint whatever lives
 * under the hand each frame (the tracer passes its guide redraw); without it the guide is
 * drawn from `level` / `strokeIndex`.
 *
 * Returns a Promise that also carries `.cancel()`, so `await animateHand(...)` works and
 * a screen teardown can stop it mid-flight.
 */
export function animateHand(ctx, glyph, box, strokeIndex = 0, opts = {}) {
  const { onDone, redraw, level = 0, duration = 900, trailMs = 600 } = opts;
  const path = pixelStrokes(glyph, box)[strokeIndex] || [];
  const r = Math.max(14, box.w * 0.075);

  let cancelled = false;
  let raf = 0;
  let settle;
  const trail = [];     // {x, y, born}

  const promise = new Promise((resolve) => {
    settle = resolve;
    if (!ctx || path.length < 2) { resolve(false); return; }
    let start = 0;

    const frame = (now) => {
      raf = 0;
      if (cancelled) { resolve(false); return; }
      if (!start) start = now;
      const u = Math.min(1, (now - start) / duration);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;   // ease-in-out
      const at = arcPoint(path, e);

      if (u < 1) trail.push({ x: at.x, y: at.y, born: now });
      while (trail.length && now - trail[0].born > trailMs) trail.shift();

      if (redraw) redraw(now);
      else {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        drawGuide(ctx, glyph, box, { level, strokeIndex, t: now });
      }

      // trail first, so the hand always sits on top of its own wake. It is the deeper
      // lilac, because the pale one is exactly the colour of the guide it runs along.
      ctx.save();
      ctx.fillStyle = P.lilacDeep;
      for (const q of trail) {
        const age = (now - q.born) / trailMs;
        ctx.globalAlpha = Math.max(0, 0.45 * (1 - age));
        ctx.beginPath();
        ctx.arc(q.x, q.y, r * 0.42 * (1 - 0.45 * age), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (u < 1) drawHand(ctx, at.x, at.y, r);

      if (u >= 1 && !trail.length) {
        if (onDone) onDone();
        resolve(true);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });

  promise.cancel = () => {
    cancelled = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    // A cancelled RAF will never enter frame() again. Release callers awaiting
    // the demonstration so they can leave/replay without an orphaned promise.
    settle(false);
  };
  return promise;
}

/** The pointer itself: the painted hand if the asset lane has shipped one, else a warm disc. */
function drawHand(ctx, x, y, r) {
  const img = art.get ? art.get("ui/hand") : null;
  if (img) {
    ctx.drawImage(img, x - r, y - r * 1.1, r * 2, r * 2.2);
    return;
  }
  ctx.save();
  ctx.fillStyle = "rgba(74,59,52,.18)";
  ctx.beginPath();
  ctx.arc(x, y + r * 0.22, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.peach;
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,253,248,.55)";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.34, r * 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * A centred square box for one glyph. The glyph space already reaches y=100 for
 * descenders, so the whole square must sit inside the canvas; `gutter*` reserve the strip
 * the button column lives in so the letter never hides behind her own hand.
 */
export function glyphBox(canvasW, canvasH, glyph, { pad = 0.06, gutterLeft = 0, gutterRight = 0, gutterTop = 0, gutterBottom = 0, alignX = 0.5, alignY = 0.5 } = {}) {
  const padPx = Math.min(canvasW, canvasH) * pad;
  const left = padPx + gutterLeft;
  const right = padPx + gutterRight;
  const top = padPx + gutterTop;
  const bottom = padPx + gutterBottom;
  const availW = Math.max(40, canvasW - left - right);
  const availH = Math.max(40, canvasH - top - bottom);
  const size = Math.min(availW, availH);
  return {
    x: left + (availW - size) * alignX,
    y: top + (availH - size) * alignY,
    w: size,
    h: size,
  };
}

export default { drawGuide, animateHand, glyphBox, pixelStrokes, arcPoint, GUIDE_COLORS };
