// sfx.js - every sound effect, synthesized in WebAudio. No files, no samples.
//
// Bible rules: soft and short, peak -12 dBFS, never above voice, nothing that startles,
// no "wrong" sound anywhere. One shared AudioContext (created lazily on the first user
// gesture via unlock(); music.js borrows it), everything summed through a soft clipper
// so the output is mathematically incapable of passing -12 dBFS, however many sounds
// land in the same millisecond.
//
// Measured (OfflineAudioContext render, see the lane report): one sound -14.3 to -17.1
// dBFS, pen scratch at full speed -21.0, a three-sound celebration -12.6, all eight at
// once -12.4. Music sits at -20 and voice above both.

import bus from "../world/bus.js";
import * as settingsMod from "../state/settings.js";

const S = () => settingsMod.settings || settingsMod.default || settingsMod;
const currentSettings = () => {
  try { const g = S().get; return (g && g()) || {}; } catch { return {}; }
};

function clamp01(n, dflt) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : dflt;
}

// Volume contract (shared with music.js and speech.js): settings.volume is the master
// slider (default 0.8), settings.effectsVolume is this category's slider (default 0.7).
// Effective gain is always master * category, clamped, with a safe default when the
// settings module (owned elsewhere) has not populated these keys yet.
/** The effects category multiplier right now, 0..1. Exported for tests. */
export function effectsGain(s) {
  s = s || currentSettings();
  return clamp01(s.volume, 0.8) * clamp01(s.effectsVolume, 0.7);
}

const MASTER_GAIN = 0.25; // -12 dBFS peak at full (1.0) effects gain
const AC = typeof window !== "undefined"
  ? (window.AudioContext || window.webkitAudioContext)
  : null;

// out(u) = tanh(2u) for u in [-1, 1]: the WaveShaper's input range maps to +/- 2 of
// signal, and |out| < 1 always.
function tanhCurve(n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(2 * u);
  }
  return c;
}

let ctx = null;
let master = null;   // sum -> soft clip -> ceiling -> destination
let limiter = null;
let ceiling = null;
let muted = false;
let noiseBuf = null;
let pinkBuf = null;

// ------------------------------------------------------------------ context

/** Create (or resume) the shared AudioContext. Safe to call many times. */
export function unlock() {
  if (!AC) return null;
  if (!ctx) {
    try { ctx = new AC({ latencyHint: "interactive" }); } catch { return null; }
    // Master chain: sum -> soft clip -> ceiling.
    // Not a DynamicsCompressorNode: Chrome's adds its own makeup gain, so cascading one
    // actually raises the peak (measured). A tanh shaper is arithmetic, not a guess:
    // out = MASTER_GAIN * tanh(sum), so the output can never exceed -12 dBFS, a single
    // sound sits near -15, and three at once land just under the ceiling instead of
    // stacking to -7. Below about half scale tanh is linear, so nothing is coloured.
    ceiling = ctx.createGain();
    ceiling.connect(ctx.destination);
    applyCeiling(0);

    limiter = ctx.createWaveShaper();
    limiter.curve = tanhCurve();
    limiter.oversample = "2x";
    limiter.connect(ceiling);

    master = ctx.createGain();
    master.gain.value = 0.5;   // the shaper's input range is [-1, 1] = [-2, 2] of signal
    master.connect(limiter);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  syncMuteFromSettings();
  return ctx;
}

/** The shared AudioContext, or null before unlock(). music.js uses this. */
export function context() {
  return ctx;
}

/** Ensure the context exists and is running; returns it or null. */
export function ensure() {
  return unlock();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) {
      // A hidden tab (or the parent stepping away) must never leave a sound playing
      // silently in the background: cut the loop and suspend the context outright.
      stopScratch();
      try { ctx.suspend(); } catch { /* fine */ }
    } else if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  });
}

// ------------------------------------------------------------------ mute and volume

/** Ramp the ceiling to the current mute/volume state. seconds=0 jumps immediately. */
function applyCeiling(seconds) {
  if (!ceiling || !ctx) return;
  const target = muted ? 0 : MASTER_GAIN * effectsGain();
  const t = ctx.currentTime;
  ceiling.gain.cancelScheduledValues(t);
  ceiling.gain.setValueAtTime(ceiling.gain.value, t);
  if (seconds > 0) ceiling.gain.linearRampToValueAtTime(target, t + seconds);
  else ceiling.gain.setValueAtTime(target, t);
}

export function setMuted(v) {
  explicitMute = true;
  muted = !!v;
  applyCeiling(0.08);
  if (muted) stopScratch();
}

export function isMuted() { return muted; }

bus.on("mute:changed", (d) => {
  const v = typeof d === "boolean" ? d : d && (d.muted ?? d.value);
  setMuted(!!v);
});

// A volume slider move (settings.volume / settings.effectsVolume) must be heard right
// away, including mid-sound: ramp the shared ceiling, which every sound already runs
// through, so nothing needs to touch each voice individually.
bus.on("settings:changed", () => applyCeiling(0.08));

// Pick up a persisted mute once, at unlock. A later settings read must never undo a
// mute the child just tapped, so an explicit setMuted() or a bus event wins forever.
let explicitMute = false;
function syncMuteFromSettings() {
  if (explicitMute) {
    applyCeiling(0);
    return;
  }
  const s = currentSettings();
  if (s && typeof s.muted === "boolean") muted = !!s.muted;
  applyCeiling(0);
}

// ------------------------------------------------------------------ buffers

function noise() {
  if (noiseBuf) return noiseBuf;
  const n = Math.floor(ctx.sampleRate * 1.0);
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// Paul Kellet's pink-noise filter: warmer than white, closer to paper fibre.
function pink() {
  if (pinkBuf) return pinkBuf;
  const n = Math.floor(ctx.sampleRate * 2.0);
  pinkBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = pinkBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return pinkBuf;
}

// ------------------------------------------------------------------ voice helpers

function env(gain, t0, peak, attack, decay) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone({ type = "sine", f0, f1, t0, dur, peak = 0.2, attack = 0.008, out }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  env(g, t0, peak, attack, Math.max(0.02, dur - attack));
  o.connect(g).connect(out || master);
  o.start(t0);
  o.stop(t0 + dur + 0.06);
  return o;
}

function noiseBurst({ t0, dur, center, q = 1, peak = 0.15, type = "bandpass", sweepTo = null, buffer = null, out }) {
  const src = ctx.createBufferSource();
  src.buffer = buffer || noise();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(center, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, peak, Math.min(0.012, dur * 0.25), Math.max(0.02, dur));
  src.connect(f).connect(g).connect(out || master);
  src.start(t0);
  src.stop(t0 + dur + 0.08);
  return src;
}

// ------------------------------------------------------------------ the sounds

const NOTES = { C6: 1046.5, E6: 1318.51, G6: 1567.98, D5: 587.33, FS5: 739.99 };

const SOUNDS = {
  // soft click: 8 ms noise burst through a bandpass at 1.8 kHz
  tap(t, out) { noiseBurst({ t0: t, dur: 0.008, center: 1800, q: 1.1, peak: 0.15, out }); },

  // three-note high sine arpeggio, 60 ms each, gentle decay
  sparkle(t, out) {
    [NOTES.C6, NOTES.E6, NOTES.G6].forEach((f, i) => {
      tone({ f0: f, t0: t + i * 0.06, dur: 0.16, peak: 0.11 - i * 0.015, attack: 0.006, out });
    });
  },

  // short sine, 520 down to 260 Hz over 90 ms
  pop(t, out) { tone({ f0: 520, f1: 260, t0: t, dur: 0.09, peak: 0.18, attack: 0.005, out }); },

  // two notes a major third apart, triangle, 400 ms decay
  chime(t, out) {
    tone({ type: "triangle", f0: NOTES.D5, t0: t, dur: 0.4, peak: 0.13, attack: 0.01, out });
    tone({ type: "triangle", f0: NOTES.FS5, t0: t + 0.06, dur: 0.4, peak: 0.11, attack: 0.01, out });
  },

  // cocoon crack: filtered noise burst plus a low wood knock
  crack(t, out) {
    noiseBurst({ t0: t, dur: 0.12, center: 1400, q: 0.9, peak: 0.13, sweepTo: 700, out });
    tone({ f0: 180, f1: 120, t0: t + 0.01, dur: 0.09, peak: 0.16, attack: 0.003, out });
  },

  // rising sine glissando 400 to 1200 Hz over 500 ms, with a shimmer on top
  hatch(t, out) {
    tone({ f0: 400, f1: 1200, t0: t, dur: 0.5, peak: 0.14, attack: 0.03, out });
    [0.18, 0.3, 0.42].forEach((d, i) => {
      tone({ f0: [NOTES.C6, NOTES.E6, NOTES.G6][i], t0: t + d, dur: 0.22, peak: 0.07, attack: 0.01, out });
    });
  },

  // two tiny pops: the caterpillar taking a bite
  nibble(t, out) {
    tone({ f0: 430, f1: 240, t0: t, dur: 0.05, peak: 0.1, attack: 0.003, out });
    tone({ f0: 470, f1: 250, t0: t + 0.09, dur: 0.05, peak: 0.09, attack: 0.003, out });
  },

  // bandpass noise sweep, 300 ms
  whoosh(t, out) { noiseBurst({ t0: t, dur: 0.3, center: 300, sweepTo: 2600, q: 1.4, peak: 0.09, out }); },

  // Two rounded wooden taps. Slow attacks and low tones keep the door friendly.
  halloween_knock(t, out) {
    [0, 0.24].forEach((delay, i) => {
      tone({ f0: 190, f1: 155, t0: t + delay, dur: 0.16, peak: 0.09 - i * 0.01, attack: 0.018, out });
      tone({ f0: 310, t0: t + delay, dur: 0.10, peak: 0.025, attack: 0.016, out });
    });
  },

  // Warm paper rustles, without the bright wrapper crackle of white noise.
  halloween_candy(t, out) {
    [0, 0.15, 0.32].forEach((delay, i) => {
      noiseBurst({ t0: t + delay, dur: 0.19, center: 1100 - i * 130,
        q: 0.55, peak: 0.10 - i * 0.015, buffer: pink(), out });
    });
  },

  // A little breath and two warm motes support the authored spoken Boo line.
  // This is a nonvocal reaction, never a synthesized laugh or a startling stinger.
  halloween_boo(t, out) {
    noiseBurst({ t0: t, dur: 0.42, center: 650, q: 0.5, peak: 0.035, buffer: pink(), out });
    tone({ f0: 587.33, t0: t + 0.04, dur: 0.38, peak: 0.055, attack: 0.045, out });
    tone({ f0: 440, t0: t + 0.24, dur: 0.40, peak: 0.035, attack: 0.045, out });
  },
};

// Per-sound trim, measured by rendering each sound through an OfflineAudioContext.
// A narrow bandpass on noise, or a 50 ms envelope, throws away 15 to 30 dB, so the
// nominal envelope peaks above would arrive at -28 to -48 dBFS: inaudible next to a
// voice on a tablet speaker. These land every sound between -14 and -17 dBFS, with the
// click, the nibble and the whoosh at the quiet end. The soft clipper holds the ceiling.
const TRIM = {
  tap: 11, sparkle: 8, pop: 6, chime: 6, crack: 5, hatch: 6.5, nibble: 6.5, whoosh: 32,
  halloween_knock: 2, halloween_candy: 4, halloween_boo: 2,
};

/** Names play() accepts. */
export const NAMES = Object.keys(SOUNDS);

function readyForEffect() {
  if (muted || effectsGain() === 0 || (typeof document !== "undefined" && document.hidden)) return false;
  if (!ctx && !unlock()) return false;
  // unlock() can discover a persisted mute. resume() is asynchronous and may
  // remain blocked by the browser: do not queue sources whose scheduled stops
  // cannot advance on a suspended audio clock, or replay old taps upon resume.
  if (muted) return false;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx.state === "running";
}

/** Play a one-shot sound effect by name. Never throws, never blocks. */
export function play(name) {
  if (!readyForEffect()) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  const trim = ctx.createGain();
  trim.gain.value = TRIM[name] || 1;
  trim.connect(master);
  try { fn(ctx.currentTime + 0.001, trim); } catch { /* never let a sound break a frame */ }
  setTimeout(() => { try { trim.disconnect(); } catch { /* already gone */ } }, 4000);
}

// ------------------------------------------------------------------ pen scratch

const SCRATCH_PEAK = 0.08;
const SCRATCH_TRIM = 20;       // measured, like TRIM above: pink noise through a narrow
                               // bandpass loses about 26 dB; full speed lands at -21 dBFS
const SCRATCH_ATTACK = 0.04;   // 40 ms
const SCRATCH_RELEASE = 0.12;  // 120 ms
const V_FULL = 1.5;            // px/ms that counts as a full-gain scribble

let scr = null;      // { src, filter, gain, trim }
let scrStopTimer = 0;

function scratchNodes() {
  if (scr) return scr;
  const src = ctx.createBufferSource();
  src.buffer = pink();
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2500;
  filter.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  const trim = ctx.createGain();
  trim.gain.value = SCRATCH_TRIM;
  src.connect(filter).connect(gain).connect(trim).connect(master);
  src.start();
  scr = { src, filter, gain, trim };
  return scr;
}

/**
 * Pen on paper. Call on every stroke:move with pt.v (px/ms).
 * scratch(0) or stopScratch() fades it out.
 */
export function scratch(v) {
  const speed = Math.max(0, Math.min(1, (Number(v) || 0) / V_FULL));
  if (speed <= 0.001) { stopScratch(); return; }
  if (!readyForEffect()) return;
  const n = scratchNodes();
  const t = ctx.currentTime;
  const target = SCRATCH_PEAK * (0.25 + 0.75 * speed);
  // A little brighter when she moves fast, the way paper really sounds.
  n.filter.frequency.setTargetAtTime(2200 + speed * 1200, t, 0.05);
  n.gain.gain.cancelScheduledValues(t);
  n.gain.gain.setTargetAtTime(target, t, SCRATCH_ATTACK / 3);
  if (scrStopTimer) { clearTimeout(scrStopTimer); scrStopTimer = 0; }
}

/** Fade the scratch out over 120 ms and free the source shortly after. */
export function stopScratch() {
  if (!scr || !ctx) return;
  const t = ctx.currentTime;
  scr.gain.gain.cancelScheduledValues(t);
  scr.gain.gain.setTargetAtTime(0.0001, t, SCRATCH_RELEASE / 3);
  if (scrStopTimer) clearTimeout(scrStopTimer);
  scrStopTimer = setTimeout(() => {
    scrStopTimer = 0;
    if (!scr) return;
    try { scr.src.stop(); } catch { /* already stopped */ }
    try {
      scr.src.disconnect(); scr.filter.disconnect(); scr.gain.disconnect(); scr.trim.disconnect();
    } catch { /* gone */ }
    scr = null;
  }, 700);
}

export const sfx = {
  unlock, context, ensure, play, scratch, stopScratch,
  setMuted, isMuted, NAMES, MASTER_GAIN,
};
export default sfx;
