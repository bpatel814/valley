// geom.js - pure geometry for glyph paths. No DOM, so it runs identically in node tests
// and in the browser. Everything works in "glyph space": a 100 x 100 box.
//
// The one idea that matters: an SVG path `d` string is flattened into a dense polyline
// once, then every other operation (length, resampling, distance) is plain polyline math.
// Flattening with a fixed subdivision count is plenty here because glyph curves are short
// and smooth; we oversample and then resample to exactly the count the caller asked for.

const CURVE_STEPS = 24; // subdivisions per curve segment before resampling

// ---------------------------------------------------------------------------
// path parsing
// ---------------------------------------------------------------------------

// Split a `d` string into [{ cmd: "M", args: [..] }, ...]. Handles the compact forms
// SVG allows: "M10,10L20 20", "-3.5.5" (implicit separator), exponents, repeated args
// after a single command letter (e.g. "L 1 2 3 4" = two linetos).
export function parsePath(d) {
  const out = [];
  const tokens = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return out;

  const ARGC = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  let i = 0;
  let prevCmd = null;
  while (i < tokens.length) {
    let cmd;
    if (/[A-Za-z]/.test(tokens[i])) {
      cmd = tokens[i];
      i++;
    } else if (prevCmd) {
      // repeated arguments: an implicit repeat of the previous command
      // (a repeated M becomes an L, per the SVG spec)
      cmd = prevCmd === "M" ? "L" : prevCmd === "m" ? "l" : prevCmd;
    } else {
      break; // numbers before any command: malformed, bail out
    }

    const n = ARGC[cmd.toUpperCase()];
    if (n === undefined) break;
    const args = [];
    for (let k = 0; k < n; k++) args.push(parseFloat(tokens[i + k]));
    i += n;
    if (args.some(Number.isNaN)) break; // ran off the end of a malformed path
    out.push({ cmd, args });
    prevCmd = cmd;
  }
  return out;
}

// Flatten a path into a polyline of {x,y} points. Dense but not resampled.
export function flattenPath(d) {
  const cmds = parsePath(d);
  const pts = [];
  let cur = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let lastCtrl = null;     // last cubic control point, for S
  let lastQCtrl = null;    // last quadratic control point, for T

  const push = (x, y) => {
    const last = pts[pts.length - 1];
    // skip exact duplicates so zero-length segments never poison the length math
    if (!last || last.x !== x || last.y !== y) pts.push({ x, y });
  };

  for (const { cmd, args } of cmds) {
    const rel = cmd === cmd.toLowerCase() && cmd !== "Z" && cmd !== "z";
    const C = cmd.toUpperCase();
    const ax = (v) => (rel ? cur.x + v : v);
    const ay = (v) => (rel ? cur.y + v : v);

    if (C === "M") {
      cur = { x: ax(args[0]), y: ay(args[1]) };
      start = { ...cur };
      push(cur.x, cur.y);
      lastCtrl = lastQCtrl = null;
    } else if (C === "L") {
      cur = { x: ax(args[0]), y: ay(args[1]) };
      push(cur.x, cur.y);
      lastCtrl = lastQCtrl = null;
    } else if (C === "H") {
      cur = { x: ax(args[0]), y: cur.y };
      push(cur.x, cur.y);
      lastCtrl = lastQCtrl = null;
    } else if (C === "V") {
      cur = { x: cur.x, y: ay(args[0]) };
      push(cur.x, cur.y);
      lastCtrl = lastQCtrl = null;
    } else if (C === "C" || C === "S") {
      let c1, c2, end;
      if (C === "C") {
        c1 = { x: ax(args[0]), y: ay(args[1]) };
        c2 = { x: ax(args[2]), y: ay(args[3]) };
        end = { x: ax(args[4]), y: ay(args[5]) };
      } else {
        // S reflects the previous cubic's second control point through the current point
        c1 = lastCtrl ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : { ...cur };
        c2 = { x: ax(args[0]), y: ay(args[1]) };
        end = { x: ax(args[2]), y: ay(args[3]) };
      }
      for (let s = 1; s <= CURVE_STEPS; s++) {
        const p = cubicAt(cur, c1, c2, end, s / CURVE_STEPS);
        push(p.x, p.y);
      }
      lastCtrl = c2;
      lastQCtrl = null;
      cur = end;
    } else if (C === "Q" || C === "T") {
      let q, end;
      if (C === "Q") {
        q = { x: ax(args[0]), y: ay(args[1]) };
        end = { x: ax(args[2]), y: ay(args[3]) };
      } else {
        q = lastQCtrl ? { x: 2 * cur.x - lastQCtrl.x, y: 2 * cur.y - lastQCtrl.y } : { ...cur };
        end = { x: ax(args[0]), y: ay(args[1]) };
      }
      for (let s = 1; s <= CURVE_STEPS; s++) {
        const p = quadAt(cur, q, end, s / CURVE_STEPS);
        push(p.x, p.y);
      }
      lastQCtrl = q;
      lastCtrl = null;
      cur = end;
    } else if (C === "A") {
      const end = { x: ax(args[5]), y: ay(args[6]) };
      const arcPts = arcToPoints(cur, args[0], args[1], args[2], !!args[3], !!args[4], end);
      for (const p of arcPts) push(p.x, p.y);
      cur = end;
      lastCtrl = lastQCtrl = null;
    } else if (C === "Z") {
      push(start.x, start.y);
      cur = { ...start };
      lastCtrl = lastQCtrl = null;
    }
  }
  return pts;
}

function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function quadAt(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

// Endpoint -> center parameterisation of an SVG elliptical arc (spec appendix F.6.5),
// then sampled at a fixed angular step.
function arcToPoints(p0, rx, ry, xRotDeg, largeArc, sweep, p1) {
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [p1]; // degenerate arc is a straight line

  const phi = (xRotDeg * Math.PI) / 180;
  const cosP = Math.cos(phi), sinP = Math.sin(phi);
  const dx2 = (p0.x - p1.x) / 2, dy2 = (p0.y - p1.y) / 2;
  const x1p = cosP * dx2 + sinP * dy2;
  const y1p = -sinP * dx2 + cosP * dy2;

  // scale the radii up if they are too small to span the endpoints
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }

  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosP * cxp - sinP * cyp + (p0.x + p1.x) / 2;
  const cy = sinP * cxp + cosP * cyp + (p0.y + p1.y) / 2;

  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta0 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const steps = Math.max(6, Math.ceil((Math.abs(dTheta) / (Math.PI / 2)) * CURVE_STEPS));
  const out = [];
  for (let s = 1; s <= steps; s++) {
    const th = theta0 + (dTheta * s) / steps;
    const x = cosP * rx * Math.cos(th) - sinP * ry * Math.sin(th) + cx;
    const y = sinP * rx * Math.cos(th) + cosP * ry * Math.sin(th) + cy;
    out.push({ x, y });
  }
  return out;
}

// ---------------------------------------------------------------------------
// polyline maths
// ---------------------------------------------------------------------------

/** Total arc length of a polyline. */
export function pathLength(points) {
  let L = 0;
  for (let i = 1; i < points.length; i++) L += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return L;
}

/**
 * n points spread evenly along a polyline by arc length (first and last included).
 * This is the workhorse: the scorer compares evenly-spaced samples, so a long stroke
 * and a short one contribute samples at the same spatial density.
 */
export function resampleCount(points, n) {
  if (!points.length) return [];
  if (n <= 1 || points.length === 1) return [{ ...points[0] }];
  const total = pathLength(points);
  if (total === 0) return Array.from({ length: n }, () => ({ ...points[0] }));

  const out = [{ ...points[0] }];
  const step = total / (n - 1);
  let segIdx = 1;
  let segStart = points[0];
  let segLeft = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  let walked = 0; // distance consumed inside the current segment

  for (let k = 1; k < n - 1; k++) {
    let need = step;
    while (need > segLeft - walked && segIdx < points.length - 1) {
      need -= segLeft - walked;
      segIdx++;
      segStart = points[segIdx - 1];
      segLeft = Math.hypot(points[segIdx].x - segStart.x, points[segIdx].y - segStart.y);
      walked = 0;
    }
    walked += need;
    const t = segLeft === 0 ? 0 : walked / segLeft;
    const a = points[segIdx - 1], b = points[segIdx];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

/** Points every `step` units along a polyline (contract signature). */
export function resample(points, step = 2) {
  const total = pathLength(points);
  if (!points.length) return [];
  if (total === 0 || step <= 0) return [{ ...points[0] }];
  return resampleCount(points, Math.max(2, Math.round(total / step) + 1));
}

/**
 * samplePath(d, n) -> n evenly spaced points along an SVG path, in glyph space.
 * This is the contract entry point; everything else in the app goes through it.
 */
export function samplePath(d, n = 64) {
  return resampleCount(flattenPath(d), n);
}

/** Centripetal Catmull-Rom through the given points; `segments` new points per span. */
export function catmullRom(points, segments = 8) {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  const out = [{ ...points[0] }];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || points[i + 1];
    for (let s = 1; s <= segments; s++) {
      const t = s / segments, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

/** Shortest distance from a point to a polyline (segment-aware, not just to vertices). */
export function pointToPolylineDistance(p, poly) {
  if (!poly || poly.length === 0) return Infinity;
  if (poly.length === 1) return Math.hypot(p.x - poly[0].x, p.y - poly[0].y);
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const d = pointToSegmentDistance(p, poly[i - 1], poly[i]);
    if (d < best) best = d;
  }
  return best;
}

/** Distance to ink travelling along this part, in either drawing direction.
 * A short spatial window ignores pen tremor. A crossing or nearby petal is not
 * evidence for a missing stem or loop simply because it passes close to it.
 */
export function pointToPolylineDirectionDistance(p, tangent, poly) {
  if (!poly || poly.length < 2) return Infinity;
  const targetLength = Math.hypot(tangent.x, tangent.y);
  if (!targetLength) return pointToPolylineDistance(p, poly);
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[Math.max(0, i - 4)], b = poly[Math.min(poly.length - 1, i + 3)];
    const vx = b.x - a.x, vy = b.y - a.y;
    const length = Math.hypot(vx, vy);
    if (!length || Math.abs(vx * tangent.x + vy * tangent.y) / (length * targetLength) < .55) continue;
    const distance = pointToSegmentDistance(p, poly[i - 1], poly[i]);
    if (distance < best) best = distance;
  }
  return best;
}

export function pointToSegmentDistance(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/**
 * Moving-average smoothing. Used to measure how much ink a child really laid down:
 * raw pen input wobbles at high frequency, and that wobble inflates raw path length
 * enough to look like scribbling. Averaging over a short window removes the tremor
 * while leaving genuine large sweeps (a real scribble) intact.
 */
export function smoothPolyline(points, radius = 3) {
  if (points.length < 3 || radius < 1) return points.map((p) => ({ ...p }));
  const out = [];
  for (let i = 0; i < points.length; i++) {
    let sx = 0, sy = 0, n = 0;
    for (let k = i - radius; k <= i + radius; k++) {
      if (k < 0 || k >= points.length) continue;
      sx += points[k].x; sy += points[k].y; n++;
    }
    out.push({ x: sx / n, y: sy / n });
  }
  return out;
}

/** Axis-aligned bounding box of a point list. */
export function bounds(points) {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
