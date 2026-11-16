// scorer.js - how well did a 3-year-old trace this letter?
//
// Design notes (the "why", because the numbers below look arbitrary otherwise):
//  * Two symmetric measurements, because either one alone is gameable.
//      coverage  = fraction of the TARGET that the child's ink got near  -> did you draw the letter?
//      precision = fraction of the CHILD's ink that landed near the target -> did you ONLY draw the letter?
//    Coverage alone rewards scribbling over the whole box; precision alone rewards one
//    perfect dot on the line. You need both.
//  * An extra ink-length guard catches the scribble case even when tolerance is generous:
//    a child who covers the box draws far more ink than the letter contains.
//  * Order and direction are measured but weighted lightly. A three-year-old who draws a
//    beautiful A bottom-up has still drawn an A; direction only costs the top tier.
//  * Tier 0 means "not enough ink to judge", never "bad". Nothing here punishes.

import { samplePath, resample, resampleCount, pathLength, pointToPolylineDistance, smoothPolyline, bounds } from "./geom.js";

export const THRESHOLDS = {
  tolerance: 15,          // glyph units: a preschool hand may wander well off the road
  precisionTolerance: 13, // slightly tighter for the child's own ink, to catch wandering
  coverageTier1: 0.45,    // "recognizable as an attempt at this letter"
  coverageTier2: 0.74,
  coverageTier3: 0.84,
  precisionTier2: 0.40,
  precisionTier3: 0.65,
  orderDirTier3: 0.6,     // combined order+direction score needed for full celebration
  minInk: 30,             // total ink shorter than this (glyph units) = tier 0, try again
  maxInkRatio: 2.8,       // ink longer than this multiple of the letter = scribbling
  clearScribbleInkRatio: 5.0, // deliberately high: only unmistakable excess ink auto-resets
  clearScribbleMeanDist: 8.0,
  clearScribblePrecision: 0.80,
  sampleStep: 1.5,        // glyph units between samples on both target and user strokes
  coverageWeight: 0.5,    // score blend
  precisionWeight: 0.3,
  orderWeight: 0.08,
  directionWeight: 0.12,
};

/** Convert strokes of CSS-pixel points into glyph space (0..100) given the glyph box. */
export function toGlyphSpace(strokesPx, box) {
  const b = safeBox(box);
  const sx = 100 / b.w;
  const sy = 100 / b.h;
  return cleanStrokes(strokesPx).map((s) => s.map((p) => ({
    x: (p.x - b.x) * sx, y: (p.y - b.y) * sy,
    ...(Number.isFinite(p.p) ? { p: p.p } : {}),
    ...(Number.isFinite(p.t) ? { t: p.t } : {}),
  })));
}

/** The reverse map, for drawing glyph-space paths onto a pixel canvas. */
export function fromGlyphSpace(strokes, box) {
  const b = safeBox(box);
  return cleanStrokes(strokes).map((s) => s.map((p) => ({
    x: b.x + (p.x / 100) * b.w, y: b.y + (p.y / 100) * b.h,
    ...(Number.isFinite(p.p) ? { p: p.p } : {}),
    ...(Number.isFinite(p.t) ? { t: p.t } : {}),
  })));
}

/** Dense point lists for each of a glyph's strokes. Cached: glyphs are drawn every frame. */
const targetCache = new Map();
export function targetStrokes(glyph, step = THRESHOLDS.sampleStep) {
  if (!glyph || !Array.isArray(glyph.strokes) || !glyph.strokes.length) return [];
  step = Number.isFinite(step) && step > 0 ? step : THRESHOLDS.sampleStep;
  const key = glyph.strokes.join("|") + "@" + step;
  let hit = targetCache.get(key);
  if (!hit) {
    hit = glyph.strokes.map((d) => {
      const pts = samplePath(d, 256);
      const n = Math.max(8, Math.round(pathLength(pts) / step) + 1);
      return resampleCount(pts, n);
    });
    targetCache.set(key, hit);
  }
  return hit;
}

/** Teaching paths stay fixed. Standard handwriting forms may have different parts. */
export function recognitionGlyphs(glyph) {
  return [glyph, ...(Array.isArray(glyph?.recognitionVariants) ? glyph.recognitionVariants : [])]
    .filter(item => item && Array.isArray(item.strokes) && item.strokes.length);
}

/** Read one shared placement of the whole shape, without changing stored ink.
 * A child may write smaller, wider or beside the guide. The bounds are deliberately
 * limited: a tiny mark, a far-away crossing or a missing half cannot become a letter.
 * Every part is subsequently checked in this SAME placement. No rotation or mirror.
 */
export function recognitionPlacements(strokes, glyph) {
  const placements = [strokes];
  const target = targetStrokes(glyph);
  if (!strokes.length || !target.length) return placements;
  const drawn = bounds(strokes.flat()), guide = bounds(target.flat());
  const dx = guide.x + guide.w / 2 - drawn.x - drawn.w / 2;
  const dy = guide.y + guide.h / 2 - drawn.y - drawn.h / 2;
  if (Math.hypot(dx, dy) > 25) return placements;
  const widthRatio = guide.w > 1 ? drawn.w / guide.w : null;
  const heightRatio = guide.h > 1 ? drawn.h / guide.h : null;
  const ratios = [widthRatio, heightRatio].filter(value => value !== null);
  if (!ratios.length || ratios.some(value => value < .6 || value > 1.45)) return placements;
  if (widthRatio !== null && heightRatio !== null &&
      (widthRatio / heightRatio < .7 || widthRatio / heightRatio > 1.4)) return placements;
  const sx = widthRatio === null ? 1 : 1 / widthRatio;
  const sy = heightRatio === null ? 1 : 1 / heightRatio;
  const cx = drawn.x + drawn.w / 2, cy = drawn.y + drawn.h / 2;
  placements.push(strokes.map(path => path.map(point => ({
    ...point, x: guide.x + guide.w / 2 + (point.x - cx) * sx,
    y: guide.y + guide.h / 2 + (point.y - cy) * sy,
  }))));
  return placements;
}

/**
 * scoreTrace(userStrokes, glyph, opts) -> { score, tier, coverage, precision, meanDist,
 *   orderScore, directionScore, strokeCountDelta, inkRatio, recognizable }
 * userStrokes are in GLYPH space (0..100).
 */
export function scoreTrace(userStrokes, glyph, opts = {}) {
  const strokes = cleanStrokes(userStrokes);
  const original = scoreTracePlacement(strokes, glyph, opts);
  // Preserve v7's unmistakable heavy-scribble signal from the original slate.
  // Alignment never turns refused ink into a successful trace or erases a retrace.
  if (original.scribble || !strokes.length) return original;
  let best = original;
  for (const form of recognitionGlyphs(glyph)) {
    for (const placement of recognitionPlacements(strokes, form)) {
      if (form === glyph && placement === strokes) continue;
      const result = scoreTracePlacement(placement, form, opts);
      if (result.tier > best.tier || (result.tier === best.tier && result.score > best.score)) best = result;
    }
  }
  return { ...best, strokeCountDelta: original.strokeCountDelta, scribble: original.scribble };
}

function scoreTracePlacement(userStrokes, glyph, opts = {}) {
  const T = { ...THRESHOLDS, ...opts };
  const glyphStrokeCount = Array.isArray(glyph && glyph.strokes) ? glyph.strokes.length : 0;
  const strokes = cleanStrokes(userStrokes);
  const target = targetStrokes(glyph, T.sampleStep);
  const targetLen = target.reduce((a, s) => a + pathLength(s), 0);

  // Resample the child's strokes to the same spatial density as the target, so that a
  // slowly-drawn stroke (hundreds of raw points) does not outvote a quick one.
  const user = strokes.map((s) => (s.length === 1 ? [{ ...s[0] }] : resample(s, T.sampleStep)));
  // Ink length is measured on a smoothed copy: pen tremor inflates raw length and would
  // otherwise make a careful, shaky trace look like scribbling.
  const smoothRadius = Math.max(1, Math.round(12 / T.sampleStep));
  const userLen = user.reduce((a, s) => {
    const smoothed = smoothPolyline(s, smoothRadius);
    // Averaging near a pen lift must not shorten a real stroke's endpoints.
    // Otherwise several short sections of a small letter can look like less
    // ink than the same shape drawn in one lift. Only this measurement changes.
    if (smoothed.length > 1) {
      smoothed[0] = s[0];
      smoothed[smoothed.length - 1] = s[s.length - 1];
    }
    return a + pathLength(smoothed);
  }, 0);
  const userPoints = user.flat();

  const empty = {
    score: 0, tier: 0, coverage: 0, precision: 0, meanDist: Infinity,
    orderScore: 0, directionScore: 0, strokeCountDelta: strokes.length - glyphStrokeCount,
    inkRatio: 0, recognizable: false, scribble: false,
  };
  if (!target.length || !userPoints.length || userLen < T.minInk) {
    return { ...empty, inkRatio: targetLen ? userLen / targetLen : 0 };
  }

  // --- coverage: is each target sample near any user stroke? -----------------------
  let covered = 0, targetTotal = 0;
  for (const ts of target) {
    for (const tp of ts) {
      targetTotal++;
      let best = Infinity;
      for (const us of user) {
        const d = pointToPolylineDistance(tp, us);
        if (d < best) best = d;
        if (best <= T.tolerance) break;
      }
      if (best <= T.tolerance) covered++;
    }
  }
  const coverage = targetTotal ? covered / targetTotal : 0;

  // --- precision + mean distance: every user sample vs the whole target -------------
  let near = 0, distSum = 0;
  for (const up of userPoints) {
    let best = Infinity;
    for (const ts of target) {
      const d = pointToPolylineDistance(up, ts);
      if (d < best) best = d;
    }
    distSum += best;
    if (best <= T.precisionTolerance) near++;
  }
  const precision = near / userPoints.length;
  const meanDist = distSum / userPoints.length;

  // --- order and direction ---------------------------------------------------------
  // Match each user stroke to the target stroke it sits closest to, then ask two things:
  // were the matches made in roughly the taught sequence, and did each run start-to-end
  // the way the teacher draws it?
  const matches = user.map((us) => nearestTargetStroke(us, target));
  let directionOK = 0, directionCount = 0;
  for (let i = 0; i < user.length; i++) {
    const t = target[matches[i]];
    const us = user[i];
    if (!t || us.length < 2) continue;
    directionCount++;
    const a = us[0], b = us[us.length - 1];
    const ta = t[0], tb = t[t.length - 1];
    const forward = dist(a, ta) + dist(b, tb);
    const backward = dist(a, tb) + dist(b, ta);
    if (forward <= backward) directionOK++;
  }
  const directionScore = directionCount ? directionOK / directionCount : 0;

  let orderOK = 0, orderCount = 0;
  for (let i = 1; i < matches.length; i++) {
    orderCount++;
    if (matches[i] >= matches[i - 1]) orderOK++;
  }
  // A single stroke can't be out of order; treat it as correct rather than as zero.
  const orderScore = orderCount ? orderOK / orderCount : 1;

  const inkRatio = targetLen ? userLen / targetLen : 0;
  const scribbling = inkRatio > T.maxInkRatio;
  // Auto-reset is intentionally much stricter than the ordinary no-pass ink guard.
  // A long, careful retrace stays safe because it remains close to the target. A broad
  // preschool attempt stays safe because its total ink is nowhere near five letters long.
  const clearScribble = inkRatio >= T.clearScribbleInkRatio &&
    meanDist >= T.clearScribbleMeanDist && precision < T.clearScribblePrecision;

  const score = clamp01(
    T.coverageWeight * coverage +
    T.precisionWeight * precision +
    T.orderWeight * orderScore +
    T.directionWeight * directionScore
  );

  const orderDir = 0.4 * orderScore + 0.6 * directionScore;
  let tier = 1; // there is real ink on the page: always at least a sparkle
  if (!scribbling && coverage >= T.coverageTier2 && precision >= T.precisionTier2) tier = 2;
  if (tier === 2 && coverage >= T.coverageTier3 && precision >= T.precisionTier3 && orderDir >= T.orderDirTier3) tier = 3;

  return {
    score,
    tier,
    coverage,
    precision,
    meanDist,
    orderScore,
    directionScore,
    strokeCountDelta: strokes.length - glyphStrokeCount,
    inkRatio,
    recognizable: coverage >= T.coverageTier1,
    scribble: clearScribble,
  };
}

function nearestTargetStroke(userStroke, target) {
  let bestIdx = 0, bestAvg = Infinity;
  // sample a handful of points; full comparison is wasted work for a match decision
  const probe = userStroke.length > 12 ? resampleCount(userStroke, 12) : userStroke;
  for (let i = 0; i < target.length; i++) {
    let sum = 0;
    for (const p of probe) sum += pointToPolylineDistance(p, target[i]);
    const avg = sum / probe.length;
    if (avg < bestAvg) { bestAvg = avg; bestIdx = i; }
  }
  return bestIdx;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function cleanStrokes(strokes) {
  if (!Array.isArray(strokes)) return [];
  return strokes
    .filter(Array.isArray)
    .map((s) => s.filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))).map((p) => ({
      ...p, x: Number(p.x), y: Number(p.y),
    })))
    .filter((s) => s.length > 0);
}

function safeBox(box) {
  const x = Number(box && box.x), y = Number(box && box.y);
  const w = Number(box && box.w), h = Number(box && box.h);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    w: Number.isFinite(w) && w > 0 ? w : 100,
    h: Number.isFinite(h) && h > 0 ? h : 100,
  };
}
