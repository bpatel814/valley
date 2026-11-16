// music.js - the procedural bed. Gentle pentatonic D major (D E F# A B), 72 bpm,
// a 16-bar loop, two layers: 'play' (pads + plucked arpeggio + soft bass) and
// 'calm' (pads only, arpeggio every other beat), cross-fading over 3 s.
//
// It is a background bed with conservative software attenuation. Device loudness
// is not established by the gain values below. It ducks 60 percent within
// 120 ms whenever a line is spoken (bus 'say:start'), restoring over 600 ms on 'say:end'.
//
// Scheduled with a lookahead scheduler (25 ms tick, 100 ms lookahead) so the loop is
// seamless and a throttled tab cannot tear it. Pauses on document.hidden, resumes on
// visible without a click.

import bus from "../world/bus.js";
import * as sfx from "./sfx.js";
import * as settingsMod from "../state/settings.js";
import { halloweenActive } from "../data/season.js";

const S = () => settingsMod.settings || settingsMod.default || settingsMod;
const currentSettings = () => {
  try { const g = S().get; return (g && g()) || {}; } catch { return {}; }
};

function clamp01(n, dflt) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : dflt;
}

// Volume contract (shared with sfx.js and speech.js): settings.volume is the master
// slider (default 0.8), settings.musicVolume is this category's slider (default 0.45).
/** The music category multiplier right now, 0..1. Exported for tests. */
export function musicGain(s) {
  s = s || currentSettings();
  return clamp01(s.volume, 0.8) * clamp01(s.musicVolume, 0.45);
}

// ------------------------------------------------------------------ musical material

const BPM = 72;
const BEAT = 60 / BPM;            // 0.8333 s
const STEP = BEAT / 2;            // eighth note
const STEPS_PER_BAR = 8;
const BARS = 16;
const LOOP_STEPS = BARS * STEPS_PER_BAR;   // 128 steps, 53.3 s

const N = {
  D2: 73.42, A2: 110.0, B2: 123.47,
  A3: 220.0, B3: 246.94,
  D4: 293.66, E4: 329.63, FS4: 369.99, A4: 440.0, B4: 493.88,
  D5: 587.33, E5: 659.25, FS5: 739.99, A5: 880.0, B5: 987.77,
};

// One chord per four bars. Every tone is in the D major pentatonic.
const SECTIONS = [
  { pad: [N.D4, N.FS4, N.A4], bass: N.D2, arp: [N.D5, N.FS5, N.A5, N.FS5] },
  { pad: [N.B3, N.D4, N.FS4], bass: N.B2, arp: [N.B4, N.D5, N.FS5, N.D5] },
  { pad: [N.A3, N.D4, N.E4], bass: N.A2, arp: [N.A4, N.D5, N.E5, N.A5] },
  { pad: [N.D4, N.E4, N.A4], bass: N.D2, arp: [N.D5, N.E5, N.A5, N.E5] },
];

// A two-bar plucked figure. null is a rest; numbers index the section's arp notes.
const ARP = [
  0, null, 1, null, 2, null, 1, null,
  3, null, 2, null, 0, null, null, null,
];

// Conservative software attenuation following a reported excessive-volume issue.
// This is 1/4 of the former mix gain (about -12.04 dB), including existing saves.
// It is NOT a measured device loudness or a hearing-safety guarantee.
const MUSIC_PEAK = 0.0825;
const PAD_PEAK = 0.10;
const PLUCK_PEAK = 0.18;
const BASS_PEAK = 0.16;
const FADE = 3.0;          // layer cross-fade, seconds

// ------------------------------------------------------------------ state

let ctx = null;
let mix = null;      // overall bed level
let duckG = null;    // voice ducking
let muteG = null;    // mute
let padG = null, pluckG = null, bassG = null;

let started = false;
let running = false;
let timer = 0;
let step = 0;            // position in the 128-step loop
let nextTime = 0;        // ctx time of the next step
let current = "play";
let muted = false;

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;   // 100 ms

// ------------------------------------------------------------------ graph

function build() {
  ctx = sfx.unlock();
  if (!ctx) return false;
  if (mix) return true;

  muteG = ctx.createGain();
  muteG.gain.value = muted ? 0 : 1;
  muteG.connect(ctx.destination);

  duckG = ctx.createGain();
  duckG.gain.value = 1;
  duckG.connect(muteG);

  mix = ctx.createGain();
  mix.connect(duckG);
  applyVolume(0);

  padG = ctx.createGain(); padG.gain.value = 1; padG.connect(mix);
  pluckG = ctx.createGain(); pluckG.gain.value = 1; pluckG.connect(mix);
  bassG = ctx.createGain(); bassG.gain.value = 1; bassG.connect(mix);
  return true;
}

// ------------------------------------------------------------------ voices

// Stop owns already-scheduled notes as well as the lookahead timer. Without
// this registry a long pad can ring beneath Music Band after the bed is stopped.
const activeVoices = new Set();
function trackVoice(oscillator, envelope) {
  const voice = { oscillator, envelope };
  activeVoices.add(voice);
  oscillator.onended = () => {
    activeVoices.delete(voice);
    try { oscillator.disconnect(); } catch { /* already released */ }
    try { envelope.disconnect(); } catch { /* already released */ }
    oscillator.onended = null;
  };
}

function stopVoices() {
  if (!ctx) return;
  const t = ctx.currentTime, end = t + 0.02;
  for (const voice of activeVoices) {
    const { oscillator, envelope } = voice;
    try {
      const gain = envelope.gain;
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(t);
      else { const value = gain.value; gain.cancelScheduledValues(t); gain.setValueAtTime(value, t); }
      gain.linearRampToValueAtTime(0, end);
      oscillator.stop(end);
    } catch {
      // A closed context or already-ended voice must not retain a connection.
      try { oscillator.stop(); } catch { /* already stopped */ }
      oscillator.onended?.();
    }
  }
  activeVoices.clear();
}


function pad(freq, t, dur) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  // Slow swell in, slow fall out: nothing in a pad should ever have an edge.
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(PAD_PEAK, t + 1.2);
  g.gain.setValueAtTime(PAD_PEAK, t + dur - 1.6);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(padG);
  trackVoice(o, g);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function pluck(freq, t, peak) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(g).connect(pluckG);
  trackVoice(o, g);
  o.start(t);
  o.stop(t + 1.0);
}

function bass(freq, t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(BASS_PEAK, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  o.connect(g).connect(bassG);
  trackVoice(o, g);
  o.start(t);
  o.stop(t + 2.3);
}

// Seasonal colour shares the pluck bus, so calm mode, voice ducking, category
// volume and mute all apply to it exactly as they do to the original arpeggio.
function seasonalNote(freq, t, { type = "sine", peak, attack, decay }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g).connect(pluckG);
  trackVoice(o, g);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

function seasonalPluck(freq, t, onBeat, i) {
  if (i % 4 === 0) {
    // Rounded celesta: a sine bell with a much quieter octave, no metallic edge.
    seasonalNote(freq, t, { peak: 0.105, attack: 0.025, decay: 0.95 });
    seasonalNote(freq * 2, t, { peak: 0.015, attack: 0.035, decay: 0.5 });
  } else {
    // The short triangle is the soft pizzicato answer between the celesta notes.
    seasonalNote(freq, t, { type: "triangle", peak: 0.07 * (onBeat ? 1 : 0.75), attack: 0.018, decay: 0.35 });
  }
}

// ------------------------------------------------------------------ scheduler

function scheduleStep(i, t) {
  const bar = Math.floor(i / STEPS_PER_BAR);
  const section = SECTIONS[Math.floor(bar / 4) % SECTIONS.length];
  const seasonal = halloweenActive(currentSettings());

  // Pads: one chord every four bars, held for the whole section.
  if (i % (STEPS_PER_BAR * 4) === 0) {
    const dur = STEP * STEPS_PER_BAR * 4;
    for (const f of section.pad) pad(f, t, dur);
  }

  // Bass root on the downbeat of each bar (play layer only; calm fades it out).
  if (i % STEPS_PER_BAR === 0) bass(section.bass, t);

  // Plucked arpeggio.
  const slot = ARP[i % ARP.length];
  if (slot != null) {
    const onBeat = i % 4 === 0;   // every other beat, for the calm layer
    if (current === "play" || onBeat) {
      const freq = section.arp[slot % section.arp.length];
      if (seasonal) seasonalPluck(freq, t, onBeat, i);
      else pluck(freq, t, PLUCK_PEAK * (onBeat ? 1 : 0.75));
    }
  }

  // One light chime per four bars. Calm keeps only its sparse, lower celesta.
  if (seasonal && current === "play" && i % (STEPS_PER_BAR * 4) === 24) {
    seasonalNote(section.arp[0] * 2, t, { peak: 0.025, attack: 0.05, decay: 1.4 });
  }
}

function tick() {
  // A denied/pending resume has a frozen audio clock. Do not accumulate notes
  // there; a later running clock schedules only the current musical position.
  if (!ctx || !running || ctx.state !== "running" || hidden()) return;
  while (nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.02;  // woken from a throttle
    scheduleStep(step, nextTime);
    nextTime += STEP;
    step = (step + 1) % LOOP_STEPS;
  }
}

function runLoop() {
  if (running || !ctx || hidden()) return;
  running = true;
  nextTime = ctx.currentTime + 0.06;
  timer = setInterval(tick, LOOKAHEAD_MS);
  tick();
}

function haltLoop() {
  running = false;
  if (timer) { clearInterval(timer); timer = 0; }
}

// ------------------------------------------------------------------ api

/** Start the bed. Idempotent, and only ever after a user gesture (sfx.unlock()). */
export function start() {
  if (started) { if (!running && !hidden()) runLoop(); return; }
  // The first graph must start at zero for a persisted mute. Applying a fade
  // after building it lets the first scheduled notes escape during that fade.
  const s = currentSettings();
  if (typeof s.muted === "boolean") mute(s.muted);
  if (!build()) return;                       // no WebAudio or no gesture yet
  applyLayer(0);        // a layer() call made before start() still counts
  started = true;
  step = 0;
  runLoop();
}

function applyLayer(seconds) {
  if (!ctx || !padG) return;
  const t = ctx.currentTime;
  const ramp = (node, to) => {
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(node.gain.value, t);
    if (seconds > 0) node.gain.linearRampToValueAtTime(to, t + seconds);
    else node.gain.setValueAtTime(to, t);
  };
  if (current === "calm") { ramp(padG, 1.15); ramp(pluckG, 0.45); ramp(bassG, 0.0); }
  else { ramp(padG, 1.0); ramp(pluckG, 1.0); ramp(bassG, 1.0); }
}

/** Cross-fade between the full 'play' bed and the 'calm' pads-only bed over 3 s. */
export function layer(name) {
  current = name === "calm" ? "calm" : "play";
  applyLayer(FADE);
}

/** Which layer is playing. */
export function currentLayer() { return current; }

/** Voice ducking: down 60 percent within 120 ms, back up over 600 ms. */
export function duck(on) {
  if (!ctx || !duckG) return;
  const t = ctx.currentTime;
  duckG.gain.cancelScheduledValues(t);
  duckG.gain.setValueAtTime(duckG.gain.value, t);
  if (on) duckG.gain.linearRampToValueAtTime(0.4, t + 0.12);
  else duckG.gain.linearRampToValueAtTime(1.0, t + 0.6);
}

/** Ramp the bed's overall level to MUSIC_PEAK * musicGain(). seconds=0 jumps immediately. */
function applyVolume(seconds) {
  if (!ctx || !mix) return;
  const target = MUSIC_PEAK * musicGain();
  const t = ctx.currentTime;
  mix.gain.cancelScheduledValues(t);
  mix.gain.setValueAtTime(mix.gain.value, t);
  if (seconds > 0) mix.gain.linearRampToValueAtTime(target, t + seconds);
  else mix.gain.setValueAtTime(target, t);
}

/** Mute just the music (the sfx master has its own mute). */
export function mute(on) {
  muted = !!on;
  if (!ctx || !muteG) return;
  const t = ctx.currentTime;
  muteG.gain.cancelScheduledValues(t);
  muteG.gain.setValueAtTime(muteG.gain.value, t);
  muteG.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.15);
}

export function isMuted() { return muted; }
export function isPlaying() { return running; }

/** Stop the bed and fade any active/future voices within 20 ms. */
export function stop() {
  haltLoop();
  stopVoices();
  started = false;
}

// ------------------------------------------------------------------ wiring

function hidden() {
  return typeof document !== "undefined" && document.hidden;
}

bus.on("say:start", () => duck(true));
bus.on("say:end", () => duck(false));
bus.on("mute:changed", (d) => {
  const v = typeof d === "boolean" ? d : d && (d.muted ?? d.value);
  mute(!!v);
});

// A volume slider move (settings.volume / settings.musicVolume) must be heard right
// away, mid-bar: ramp the bed's overall gain, same as a layer cross-fade.
bus.on("settings:changed", () => applyVolume(0.3));

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!started) return;
    if (document.hidden) {
      haltLoop();
    } else if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      runLoop();
    }
  });
}

export const music = {
  start, layer, currentLayer, duck, mute, isMuted, isPlaying, stop,
  BPM, BARS,
};
export default music;
