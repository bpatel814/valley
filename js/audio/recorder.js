// recorder.js - record family voices in the parent corner and keep them on the tablet.
//
// Nothing leaves the device: clips go straight into the IndexedDB `voices` store under
// `${speaker}/${key}`, which is the first place speech.js looks. Grandma reads twenty
// lines once and Grandma is in the game forever.

import * as dbMod from "../state/db.js";
import { PHRASES, SPEAKERS } from "../data/phrases.js";

const DB = () => dbMod.default || dbMod;
const call = (name, ...args) => {
  const fn = dbMod[name] || (DB() && DB()[name]);
  if (!fn) return Promise.reject(new Error("db." + name + " is not available"));
  return Promise.resolve(fn(...args));
};

const STORE = "voices";
const idOf = (speaker, key) => String(speaker) + "/" + String(key);

const MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",                 // iOS Safari
  "audio/mp4;codecs=mp4a.40.2",
  "",
];

function pickMime() {
  const MR = typeof window !== "undefined" ? window.MediaRecorder : null;
  if (!MR) return null;
  for (const m of MIMES) {
    if (!m) return "";
    try { if (MR.isTypeSupported(m)) return m; } catch { /* try the next one */ }
  }
  return "";
}

function friendlyMicError(err) {
  const name = (err && err.name) || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new Error("The microphone is blocked. Allow microphone access for this page and try again.");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new Error("No microphone was found on this device.");
  }
  if (name === "NotReadableError") {
    return new Error("Another app is using the microphone. Close it and try again.");
  }
  return new Error("Recording is not available on this device.");
}

/**
 * Start recording one phrase.
 * @returns {Promise<{stop:()=>Promise<Blob>, cancel:()=>void, mime:string}>}
 * Rejects with a friendly Error if the mic is denied or missing.
 */
export async function startRecording(speaker, key) {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (!nav || !nav.mediaDevices || !nav.mediaDevices.getUserMedia) {
    throw new Error("This browser cannot record audio.");
  }
  const mime = pickMime();
  if (mime === null) throw new Error("This browser cannot record audio.");

  let stream;
  try {
    stream = await nav.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    throw friendlyMicError(err);
  }

  const chunks = [];
  let rec, released = false;
  const release = () => {
    if (released) return;
    released = true;
    let tracks = [];
    try { tracks = stream.getTracks(); } catch { /* unavailable stream */ }
    for (const track of tracks) { try { track.stop(); } catch { /* release others too */ } }
  };
  try {
    rec = new window.MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start();
  } catch {
    if (rec) {
      rec.ondataavailable = null;
      try { if (rec.state !== 'inactive') rec.stop(); } catch { /* failed startup */ }
    }
    release();
    throw new Error("This browser cannot record audio.");
  }

  return {
    mime: mime || "audio/webm",
    cancel() {
      try { if (rec.state !== "inactive") rec.stop(); } catch { /* fine */ }
      release();
    },
    stop() {
      return new Promise((resolve, reject) => {
        rec.onstop = async () => {
          release();
          const type = rec.mimeType || mime || "audio/webm";
          const blob = new Blob(chunks, { type });
          if (!blob.size) { reject(new Error("Nothing was recorded. Try holding the button a little longer.")); return; }
          try {
            // speaker and key ride along inside the record so listRecordings() can use
            // db.all(), which hands back values without their keys.
            await call("put", STORE, idOf(speaker, key), {
              blob, mime: type, at: Date.now(), speaker, key,
            });
            resolve(blob);
          } catch (e) { reject(e); }
        };
        try { rec.stop(); } catch (e) { release(); reject(e); }
      });
    },
  };
}

function unwrap(rec) {
  if (!rec) return null;
  if (typeof Blob !== "undefined" && rec instanceof Blob) return { blob: rec, mime: rec.type, at: 0 };
  if (rec.blob) return rec;
  return null;
}

/** Is there a recording for this speaker and key? */
export async function hasRecording(speaker, key) {
  try { return !!unwrap(await call("get", STORE, idOf(speaker, key))); }
  catch { return false; }
}

/** Every stored recording: [{ speaker, key, mime, at, bytes }], newest first. */
export async function listRecordings() {
  const out = [];
  // db.keys() is the honest source: it also finds a bare Blob written by anything else.
  let ids = null;
  try { ids = await call("keys", STORE); } catch { ids = null; }
  if (Array.isArray(ids)) {
    for (const id of ids) {
      const cut = String(id).indexOf("/");
      if (cut < 0) continue;
      /* eslint-disable no-await-in-loop */
      const rec = unwrap(await call("get", STORE, id).catch(() => null));
      out.push({
        speaker: String(id).slice(0, cut),
        key: String(id).slice(cut + 1),
        mime: (rec && rec.mime) || "",
        at: (rec && rec.at) || 0,
        bytes: (rec && rec.blob && rec.blob.size) || 0,
      });
    }
  } else {
    let rows = [];
    try { rows = (await call("all", STORE)) || []; } catch { rows = []; }
    for (const raw of rows) {
      const rec = unwrap(raw);
      if (!rec || !rec.key) continue;
      out.push({
        speaker: rec.speaker || "guide",
        key: rec.key,
        mime: rec.mime || "",
        at: rec.at || 0,
        bytes: (rec.blob && rec.blob.size) || 0,
      });
    }
  }
  out.sort((a, b) => b.at - a.at);
  return out;
}

/** Which phrase keys are recordable, for the parent corner's list. */
export function recordableKeys(speaker) {
  const keys = Object.keys(PHRASES);
  if (!speaker || speaker === "guide") return keys;
  return keys.filter((k) => PHRASES[k].speaker === speaker);
}

/** Delete one recording. The phrase falls back to a clip file or TTS again. */
export async function deleteRecording(speaker, key) {
  await call("del", STORE, idOf(speaker, key));
  return true;
}

/** Play a stored recording straight back. Resolves when it ends. */
export async function playRecording(speaker, key) {
  const rec = unwrap(await call("get", STORE, idOf(speaker, key)));
  if (!rec || !rec.blob) throw new Error("There is no recording for that line yet.");
  const url = URL.createObjectURL(rec.blob);
  const a = new Audio();
  a.preload = "auto";
  a.src = url;
  await new Promise((resolve) => {
    const done = () => { try { URL.revokeObjectURL(url); } catch { /* fine */ } resolve(); };
    a.addEventListener("ended", done, { once: true });
    a.addEventListener("error", done, { once: true });
    const p = a.play();
    if (p && p.catch) p.catch(done);
  });
  return true;
}

export const recorder = {
  startRecording, hasRecording, listRecordings, deleteRecording, playRecording,
  recordableKeys, SPEAKERS,
};
export default recorder;
