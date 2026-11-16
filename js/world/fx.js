// fx.js - particles and the celebration beat.
//
// The pool is allocated once (400 particles) and never grows: a 30-minute session on a
// mid-range Android must not add a byte of garbage per frame. The rAF loop cancels
// itself the moment nothing is alive, so an idle screen costs nothing.

import { RAINBOW, P } from "./palette.js";
import bus from "./bus.js";
import sfx from "../audio/sfx.js";

const POOL = 400;
const GRAVITY = 900; // px/s^2
const DRAG = 0.98; // per 1/60 s

function reduced() {
  return (
    document.documentElement.classList.contains("reduced-motion") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const rnd = (a, b) => a + Math.random() * (b - a);

/* ----------------------------------------------------------------------
   Pen coordinates. The ink layer emits 'stroke:move' in ITS canvas's CSS
   pixels, but the fx canvas and the friends live in the viewport. The
   canvas rect is read once per stroke, not once per point.
   ---------------------------------------------------------------------- */

let inkRect = null;
function refreshInkRect() {
  const c = document.querySelector(".rv-tracer__ink, .rv-tracer canvas");
  inkRect = c ? c.getBoundingClientRect() : null;
}
bus.on("stroke:start", refreshInkRect);
bus.on("stroke:end", () => {
  inkRect = null;
});

/** Pen point from a 'stroke:move' / 'stroke:start' payload, in viewport pixels. */
export function toViewport(d) {
  if (!d || typeof d.x !== "number") return null;
  if (!inkRect) return { x: d.x, y: d.y, v: d.v || 0 };
  return { x: d.x + inkRect.left, y: d.y + inkRect.top, v: d.v || 0 };
}

let defaultParticles = null;

export class Particles {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.raf = 0;
    this.last = 0;
    this.alive = 0;
    this.sweep = null;
    this.pen = { x: 0, y: 0, has: false };
    this._trailAcc = 0;
    this._trailLast = null;
    this._dead = false;

    this.pool = new Array(POOL);
    for (let i = 0; i < POOL; i++) {
      this.pool[i] = {
        on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: DRAG,
        life: 0, max: 1, size: 6, rot: 0, vrot: 0, col: "#fff", a: 1,
      };
    }
    this.next = 0;

    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    window.addEventListener("orientationchange", this._onResize);
    this._offMove = bus.on("stroke:move", (d) => {
      const p = toViewport(d);
      if (!p) return;
      this.pen.x = p.x;
      this.pen.y = p.y;
      this.pen.has = true;
      this.trail(p.x, p.y, p.v);
    });
    this._offEnd = bus.on("stroke:end", () => {
      this._trailLast = null;
      this._trailAcc = 0;
    });

    this.resize();
    if (!defaultParticles) defaultParticles = this;
  }

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth);
    const h = Math.round(window.innerHeight);
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _take() {
    for (let i = 0; i < POOL; i++) {
      const p = this.pool[(this.next + i) % POOL];
      if (!p.on) {
        this.next = (this.next + i + 1) % POOL;
        p.on = true;
        this.alive++;
        return p;
      }
    }
    return null; // pool full: the oldest confetti simply keeps its slot
  }

  /** kind: 'confetti' | 'sparkle' | 'trail' | 'star' */
  burst(x, y, opts = {}) {
    const kind = opts.kind || "confetti";
    const n = Math.max(1, Math.min(opts.n || 24, POOL));
    if (reduced()) return this._fadeSparkle(x, y);
    for (let i = 0; i < n; i++) {
      const p = this._take();
      if (!p) break;
      p.x = x + rnd(-6, 6);
      p.y = y + rnd(-6, 6);
      p.a = 1;
      p.life = 0;
      if (kind === "confetti") {
        const ang = rnd(-Math.PI * 0.92, -Math.PI * 0.08);
        const sp = rnd(280, 700);
        p.kind = 0;
        p.vx = Math.cos(ang) * sp;
        p.vy = Math.sin(ang) * sp;
        p.g = GRAVITY;
        p.drag = DRAG;
        p.size = rnd(7, 14);
        p.rot = rnd(0, Math.PI * 2);
        p.vrot = rnd(-9, 9);
        p.max = rnd(1200, 2000);
        p.col = RAINBOW[(Math.random() * RAINBOW.length) | 0];
      } else if (kind === "star") {
        const ang = rnd(0, Math.PI * 2);
        const sp = rnd(60, 220);
        p.kind = 3;
        p.vx = Math.cos(ang) * sp;
        p.vy = Math.sin(ang) * sp - 60;
        p.g = 180;
        p.drag = 0.965;
        p.size = rnd(12, 22);
        p.rot = rnd(0, Math.PI);
        p.vrot = rnd(-2, 2);
        p.max = rnd(900, 1400);
        p.col = opts.color || RAINBOW[(Math.random() * RAINBOW.length) | 0];
      } else {
        const ang = rnd(0, Math.PI * 2);
        const sp = rnd(30, 150);
        p.kind = 1;
        p.vx = Math.cos(ang) * sp;
        p.vy = Math.sin(ang) * sp - 40;
        p.g = 40;
        p.drag = 0.95;
        p.size = rnd(8, 16);
        p.rot = rnd(0, Math.PI);
        p.vrot = rnd(-1.5, 1.5);
        p.max = rnd(600, 1000);
        p.col = opts.color || (Math.random() < 0.5 ? P.lemon : P.lemonDeep);
      }
    }
    this._start();
    return this;
  }

  _fadeSparkle(x, y) {
    const p = this._take();
    if (!p) return this;
    p.kind = 1;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.g = 0;
    p.drag = 1;
    p.size = 22;
    p.rot = 0;
    p.vrot = 0;
    p.life = 0;
    p.max = 700;
    p.a = 1;
    p.col = P.lemonDeep;
    this._start();
    return this;
  }

  /** One rainbow dot per ~14 px of fast pen travel. Slow, careful strokes stay clean. */
  trail(x, y, v) {
    if (reduced()) return this;
    const last = this._trailLast;
    this._trailLast = { x, y };
    if (!last) return this;
    const d = Math.hypot(x - last.x, y - last.y);
    if (v < 0.25) {
      this._trailAcc = 0;
      return this;
    }
    this._trailAcc += d;
    while (this._trailAcc >= 14) {
      this._trailAcc -= 14;
      const p = this._take();
      if (!p) break;
      p.kind = 2;
      p.x = x + rnd(-3, 3);
      p.y = y + rnd(-3, 3);
      p.vx = rnd(-18, 18);
      p.vy = rnd(-40, -8);
      p.g = 0;
      p.drag = 0.94;
      p.size = rnd(3, 6);
      p.rot = 0;
      p.vrot = 0;
      p.life = 0;
      p.max = rnd(320, 520);
      p.a = 1;
      p.col = RAINBOW[(Math.random() * RAINBOW.length) | 0];
    }
    this._start();
    return this;
  }

  /** A soft rainbow arc that wipes across the top of the screen, then fades. */
  rainbowSweep(ms = 900) {
    if (reduced()) return Promise.resolve();
    this.sweep = { t: 0, dur: ms };
    this._start();
    return new Promise((r) => setTimeout(r, ms));
  }

  _start() {
    if (this.raf || this._dead) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this._frame(t));
  }

  _frame(now) {
    this.raf = 0;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);

    const dragPow = dt * 60; // drag is per 1/60 s, so it stays frame-rate independent

    for (let i = 0; i < POOL; i++) {
      const p = this.pool[i];
      if (!p.on) continue;
      p.life += dt * 1000;
      if (p.life >= p.max) {
        p.on = false;
        this.alive--;
        continue;
      }
      const f = Math.pow(p.drag, dragPow);
      p.vy += p.g * dt;
      p.vx *= f;
      p.vy *= f;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      const u = p.life / p.max;
      p.a = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
      this._draw(ctx, p, u);
    }

    if (this.sweep) {
      this.sweep.t += dt * 1000;
      const s = this.sweep.t / this.sweep.dur;
      if (s >= 1) this.sweep = null;
      else this._drawSweep(ctx, s);
    }

    if (this.alive > 0 || this.sweep) this._start();
    else ctx.clearRect(0, 0, this.w, this.h);
  }

  _draw(ctx, p, u) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.a));
    ctx.fillStyle = p.col;
    if (p.kind === 0) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.62);
      ctx.restore();
    } else if (p.kind === 2) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grow = p.kind === 1 ? 0.5 + Math.min(1, u * 3.2) * 0.8 : 1;
      this._star(ctx, p.x, p.y, p.size * grow, p.rot);
    }
    ctx.globalAlpha = 1;
  }

  /** A four-point sparkle: two crossed lens shapes, not a spiky asterisk. */
  _star(ctx, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    const w = r * 0.26;
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(w, -w, r, 0);
    ctx.quadraticCurveTo(w, w, 0, r);
    ctx.quadraticCurveTo(-w, w, -r, 0);
    ctx.quadraticCurveTo(-w, -w, 0, -r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawSweep(ctx, s) {
    const W = this.w;
    const H = this.h;
    // A shallow arc that spans the whole width near the top: the circle's centre sits
    // well below the screen, so only its crown is visible.
    const cx = W / 2;
    const cy = H * 2.2;
    const R = cy - H * 0.1;
    const half = Math.asin(Math.min(0.99, (W / 2 + 60) / R));
    const a0 = Math.PI * 1.5 - half;
    const a1 = Math.PI * 1.5 + half;
    const wipe = Math.min(1, s / 0.66);
    const fade = s < 0.66 ? 1 : 1 - (s - 0.66) / 0.34;
    ctx.save();
    ctx.globalAlpha = 0.55 * fade;
    ctx.lineCap = "round";
    for (let i = 0; i < RAINBOW.length; i++) {
      ctx.beginPath();
      ctx.strokeStyle = RAINBOW[i];
      ctx.lineWidth = 13;
      ctx.arc(cx, cy, R - i * 13, a0, a0 + (a1 - a0) * wipe);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  clear() {
    for (const p of this.pool) p.on = false;
    this.alive = 0;
    this.sweep = null;
    if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
  }

  destroy() {
    this._dead = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clear();
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("orientationchange", this._onResize);
    this._offMove();
    this._offEnd();
    if (defaultParticles === this) defaultParticles = null;
  }
}

/* ======================================================================
   The celebration beat
   ====================================================================== */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function anchorChar(a) {
  return a && typeof a.celebrate === "function" ? a : null;
}

function anchorEl(a) {
  if (a instanceof Element) return a;
  if (a && a.el instanceof Element) return a.el;
  return null;
}

function centreOf(el, fallback) {
  if (!el) return fallback;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return fallback;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function elBounce(el) {
  if (!el || !el.animate || reduced()) return Promise.resolve();
  return el
    .animate(
      [
        { transform: "translateY(0) scale(1,1)" },
        { transform: "translateY(-8%) scale(0.97,1.05)", offset: 0.4 },
        { transform: "translateY(0) scale(1,1)" },
      ],
      { duration: 440, easing: "cubic-bezier(.34,1.56,.64,1)" }
    )
    .finished.then(() => {})
    .catch(() => {});
}

/**
 * celebrate(tier, anchor, particles) -> Promise
 * tier 0  gentle nudge (nothing punishing ever)
 * tier 1  900 ms  sparkles at the pen
 * tier 2 1800 ms  sparkles plus the friend bouncing
 * tier 3 2800 ms  anticipation, confetti, rainbow sweep, chime, settle
 * Hard cap 3 s. Reduced motion: one fade-in sparkle.
 */
export function celebrate(tier = 1, anchor = null, particles = null) {
  const fx = particles || defaultParticles;
  const el = anchorEl(anchor);
  const ch = anchorChar(anchor);
  const pen = fx && fx.pen.has ? { x: fx.pen.x, y: fx.pen.y } : null;
  const at = centreOf(el, pen || { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const penAt = pen || at;

  const run = async () => {
    if (reduced()) {
      if (fx) fx.burst(penAt.x, penAt.y, { kind: "sparkle", n: 1 });
      if (ch) await ch.celebrate(tier);
      await sleep(380);
      return;
    }
    if (tier <= 0) {
      if (fx) fx.burst(penAt.x, penAt.y, { kind: "sparkle", n: 6 });
      sfx.play("chime");
      if (ch) ch.bounce();
      await sleep(700);
      return;
    }
    if (tier === 1) {
      if (fx) fx.burst(penAt.x, penAt.y, { kind: "sparkle", n: 14 });
      sfx.play("sparkle");
      if (ch) ch.celebrate(1);
      else elBounce(el);
      await sleep(900);
      return;
    }
    if (tier === 2) {
      if (fx) fx.burst(penAt.x, penAt.y, { kind: "sparkle", n: 22 });
      sfx.play("sparkle");
      const beat = ch ? ch.celebrate(2) : elBounce(el);
      await sleep(420);
      if (fx) fx.burst(at.x, at.y, { kind: "star", n: 10 });
      await beat;
      await sleep(Math.max(0, 1800 - 1360));
      return;
    }
    // tier 3
    const beat = ch ? ch.celebrate(3) : elBounce(el);
    await sleep(160); // anticipation reads before anything fires
    sfx.play("chime");
    if (fx) {
      fx.burst(at.x, at.y, { kind: "confetti", n: 160 });
      fx.rainbowSweep(900);
      fx.burst(penAt.x, penAt.y, { kind: "sparkle", n: 18 });
    }
    await beat;
    await sleep(Math.max(0, 2800 - 1860));
  };

  return Promise.race([run(), sleep(3000)]);
}

export function particlesFor(canvas) {
  return new Particles(canvas);
}

export function defaults() {
  return defaultParticles;
}

export default { Particles, celebrate, particlesFor, defaults };
