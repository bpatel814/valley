import { playStart } from './play-start.js';
import { recordingHold } from './recording-hold.js';
import { prepareToyPhoto, addToyPhoto, flushToyPhotos, withPhotoImportsPaused, photoImportTicket } from '../state/toy-photos.js';
// corner.js - the parent corner, screen id 'parent'.
//
// The one place in Rayna’s Valley where words are allowed, because an adult reads them.
// Paper cards on the sky gradient, big targets, sentence case, no clutter, no links out.
// Everything here is local: nothing is ever sent anywhere.

import { parentShareLinks } from "./share-links.js";
import * as progress from "../state/progress.js";
import * as settings from "../state/settings.js";
import * as session from "../state/session.js";
import * as resume from "../state/resume.js";
import * as perf from "../state/perf.js";
import * as gallery from "./gallery.js";
import * as db from "../state/db.js";
import { rainbowAt, letterHue, P } from "../world/palette.js";
import { UPPER, LOWER, DIGITS } from "../data/letters.js";
import { speakerFor } from "../data/phrases.js";
import { createParentListeningPlayer, loadNarrationReview } from "./narration-review.js";
import { valleyProfile } from "../data/valley-profiles.js";
import { on as busOn, emit as busEmit } from "../world/bus.js";
import {
  MEADOW_LABELS_KEY,
  clearMeadowLabels,
  flushMeadowLabelWrites,
  normaliseMeadowLabels,
} from "../state/meadow-labels.js";
import { normalizeDiscoveryState, flushDiscoveryWrites, load as loadDiscovery } from "../state/discovery.js";
import { enterFullscreen, exitFullscreen, fullscreenElement, isStandalone } from "../engine/immersive.js";
import picnicState, { PICNIC_KEY, normalizePicnicStore } from "../state/picnic.js";
import buildLabState, { BUILD_LAB_KEY, normalizeBuildLabState, buildLabGalleryKey, buildLabGalleryRow } from "../state/build-lab.js";
import { WATER_GARDEN_KEY, normalizeWaterGardenStore, flushWaterGarden } from "../state/water-garden.js";
import picturePostState, { PICTURE_POST_KEY, normalizePicturePostState, postGalleryKey, postGalleryRow } from "../state/picture-post.js";
import { messageDayFields, messageDayError } from "../data/message-day.js";
import { BRIDGE_DRAFTS_KEY, normaliseBridgeDrafts, flushBridgeWrites, resetBridgeDrafts } from "../state/bridge.js";
import { TOY_WORKSHOP_KEY, flushToyWorkshop, loadToyWorkshop } from "../state/toy-workshop.js";
import { normalizeToyWorkshop } from "../data/toy-workshop.js";
import { SAVED_WORLDS, savedWorld, savedWorldLink, checkBackupWorld } from "../state/saved-world.js";
import { normalizeRollingRun } from "../data/rolling-run.js";
import { ROLLING_RUN_KEY, flushRollingRun, loadRollingRun } from "../state/rolling-run.js";
import { SCRAPBOOK_KEY, normalise as normaliseScrapbook, flushDecorations } from "../world/scrapbook.js";
import { normalizeMusicBand } from "../data/music-band.js";
import { MUSIC_BAND_KEY, flushMusicBand, loadMusicBand } from "../state/music-band.js";
import { ANIMAL_FRIENDS_KEY, flushAnimalFriends, loadAnimalFriends } from "../state/animal-friends.js";
import { normalizeAnimalFriends } from "../data/animal-friends.js";
import { MEADOW_DRAFTS_KEY, normaliseMeadowDrafts, flushMeadowDraftWrites } from "../state/meadow-drafts.js";
import { RIVER_RUN_KEY, flushRiverRun, loadRiverRun } from "../state/river-run.js";
import { normalizeRiverRun } from "../data/river-run.js";
import storiesState, { STORIES_KEY, normaliseStoryState, flushStoryWrites } from "../state/stories.js";
import { STUDIO_DRAFT_KEY, normaliseStudioDocument } from "../state/studio.js";
import { GARDEN_DRAFTS_KEY, normaliseGardenDrafts, flushGardenDraftWrites } from "../state/garden-drafts.js";
import { isLocalPNG } from "../state/creation-frame.js";
import { flushBooHollowWrites, normaliseBooHollow } from '../state/boo-hollow.js';
import { HALLOWEEN_PHRASES } from '../data/halloween-phrases.js';
import {
  PLAY_STAGE_CURRENT_KEY,
  PLAY_STAGE_MAX_POSTCARDS,
  PLAY_STAGE_POSTCARD_KIND,
  clearPlayStageState,
  flushPlayStageCheckpointWrites,
  normalisePlayStagePostcard,
  requireStoredPlayStageScene,
} from "../state/play-stage.js";

export const SPEAKERS = ["grandma", "mama", "papa", "veer"];
// Storage IDs stay stable so existing family recordings still work.
const SPEAKER_LABELS = { grandma: "Ba", mama: "Mama", papa: "Daddy", veer: "Veer" };

const LAST_ROW = {
  grandma: { key: "grandma_hug", label: "A big hug" },
  mama: { key: "mama_love", label: "I love you" },
  papa: { key: "papa_love", label: "I love you" },
  veer: { key: "veer_cheer_2", label: "One more cheer" },
};

/** The twelve recordings that change the game most, in the order a parent should do them. */
export const VOICE_KEYS = [
  { key: (s) => "family_hello_" + s, label: "Hello Rayna! (your greeting)" },
  { key: () => "word_RAYNA", label: "Rayna (her name)" },
  { key: () => "praise_3_1", label: "Big praise: wonderful!" },
  { key: () => "praise_2_1", label: "Good praise: nice one!" },
  { key: () => "retry_1", label: "Gentle retry: let us try again" },
  { key: () => "letter_R", label: "The letter R" },
  { key: () => "letter_A", label: "The letter A" },
  { key: () => "letter_Y", label: "The letter Y" },
  { key: () => "letter_N", label: "The letter N" },
  { key: () => "grandma_time_for_break", label: "Time for a break" },
  { key: () => "veer_cheer_1", label: "Veer's cheer" },
  { key: (s) => (LAST_ROW[s] || LAST_ROW.mama).key, label: (s) => (LAST_ROW[s] || LAST_ROW.mama).label },
  ...Object.entries(HALLOWEEN_PHRASES).map(([key, phrase]) => ({ key: () => key, label: 'Halloween: ' + phrase.text })),
];

// speech.js looks in the voices store under the phrase's OWN speaker first, then the
// preferred one, then 'guide'. So a shared line (praise, retry, letters, her name) is
// stored under 'guide', where it always plays, whoever recorded it; a family line is
// stored under the family member it belongs to.
function storeSpeaker(key, tab) {
  try {
    const owner = speakerFor(key);
    if (owner && owner !== "guide") return owner;
  } catch (_) {}
  return isShared(key) ? "guide" : tab;
}

function isShared(key) {
  try { return speakerFor(key) === "guide"; } catch (_) { return false; }
}

const MAX_RECORD_MS = 10000;
export const MAX_VOICE_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_BACKUP_IMPORT_BYTES = 128 * 1024 * 1024;
export const MAX_BACKUP_GALLERY_RECORDS = 10000;
export const BACKUP_KV_KEYS = [
  "scrapbook", "family_mural_draft", "studio:draft:v1", "discovery", "stories.v1",
  "valley:display:v1", MEADOW_LABELS_KEY, PLAY_STAGE_CURRENT_KEY,
  PICNIC_KEY, BUILD_LAB_KEY, WATER_GARDEN_KEY, PICTURE_POST_KEY, BRIDGE_DRAFTS_KEY, TOY_WORKSHOP_KEY, ROLLING_RUN_KEY, MUSIC_BAND_KEY, ANIMAL_FRIENDS_KEY, MEADOW_DRAFTS_KEY, RIVER_RUN_KEY, GARDEN_DRAFTS_KEY,
];

/** Read completely before touching saved play; file access is not format validity. */
export async function readBackupFile(file) {
  if (Number(file?.size) > MAX_BACKUP_IMPORT_BYTES) {
    throw new Error("This backup is too large. Existing play was kept.");
  }
  let text;
  try {
    if (typeof file?.text !== "function") throw new Error("File reading is unavailable");
    text = await file.text();
  } catch (cause) {
    const error = new Error("This file could not be opened. Choose the downloaded backup again. Existing play was kept.");
    error.code = "file-unreadable";
    error.cause = cause;
    throw error;
  }
  // Some local editors add a UTF-8 BOM to otherwise valid JSON backups.
  return JSON.parse(String(text).replace(/^\uFEFF/, ""));
}
const VOICE_IMPORT_TYPES = new Set(["audio/webm", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-wav"]);
const VOICE_IMPORT_EXTS = { webm: "audio/webm", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav" };

/** Validate and store a local family recording without uploading or voice cloning. */
export async function importVoiceFile(file, speaker, key) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) throw new Error("Choose an audio file that is not empty.");
  if (file.size > MAX_VOICE_IMPORT_BYTES) throw new Error("That file is too large. Choose an audio file under 5 MB.");
  const ext = String(file.name || "").toLowerCase().split(".").pop();
  const declared = String(file.type || "").toLowerCase().split(";")[0];
  if (declared && !VOICE_IMPORT_TYPES.has(declared)) throw new Error("Choose a WebM, MP3, M4A, OGG, or WAV audio file.");
  const mime = declared || VOICE_IMPORT_EXTS[ext];
  if (!mime) throw new Error("Choose a WebM, MP3, M4A, OGG, or WAV audio file.");
  const blob = typeof file.slice === "function" ? file.slice(0, file.size, mime) : file;
  await db.put("voices", String(speaker) + "/" + String(key), {
    blob, mime, at: Date.now(), speaker: String(speaker), key: String(key), source: "local-import",
  });
  return { mime, bytes: file.size };
}

const jsonCopy = (value) => JSON.parse(JSON.stringify(value));
const isBackupRecord = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const backupImportError = (code, message) => Object.assign(new Error(message), { code });

function checkedBackupVersion(value, supported) {
  if (!supported.includes(Number(value))) throw backupImportError("backup-version", "This backup uses an unsupported version. Open it with the version of the game that saved it.");
}

function checkedBackupProgress(value) {
  const hasProgress = isBackupRecord(value) && (
    ["letters", "words", "drawings", "days", "unicorn", "journey"].some(key => isBackupRecord(value[key])) ||
    Array.isArray(value.stickers) || typeof value.firstRunDone === "boolean"
  );
  if (!hasProgress) throw backupImportError("backup-format", "This file does not contain saved play history.");
  if (value.v != null) checkedBackupVersion(value.v, [0, 1, progress.SCHEMA_VERSION]);
  if (Object.hasOwn(value, 'booHollow')) normaliseBooHollow(value.booHollow);
  return jsonCopy(value);
}

/** Recognize complete supported files before any replacement is allowed. */
function checkedBackupEnvelope(obj) {
  if (!isBackupRecord(obj)) throw backupImportError("backup-format", "That file was not a usable Rayna’s Valley backup.");
  checkBackupWorld(obj);
  if (obj.kind === "rayna-valley-picnic-copy") {
    checkedBackupVersion(obj.version, [1]);
    if (!isBackupRecord(obj.picnic) || !isBackupRecord(obj.picnic.draft) || !Array.isArray(obj.picnic.draft.pieces)) {
      throw backupImportError("backup-format", "This recovery file does not contain a saved picnic.");
    }
    return { kind: "picnic", picnic: normalizePicnicStore(obj.picnic) };
  }
  if (obj.kind === "rainbow-valley-backup") {
    checkedBackupVersion(obj.version, [2]);
    if (!isBackupRecord(obj.kv) || !Array.isArray(obj.gallery) || (obj.settings != null && !isBackupRecord(obj.settings))) {
      throw backupImportError("backup-format", "This backup is incomplete or has an invalid saved-play section.");
    }
    return { kind: "full", progress: checkedBackupProgress(obj.progress), settings: obj.settings == null ? null : jsonCopy(obj.settings), kv: obj.kv, gallery: obj.gallery };
  }
  // Original progress files used kind:"progress", or a raw progress object.
  // A foreign or incomplete full backup must never become a blank progress save.
  if ((obj.kind != null && obj.kind !== "progress") || (obj.app != null && obj.app !== "rainbow-valley") ||
      obj.version != null || Object.hasOwn(obj, "kv") || Object.hasOwn(obj, "gallery")) {
    throw backupImportError("backup-format", "That file was not a usable Rayna’s Valley backup.");
  }
  if (obj.v != null) checkedBackupVersion(obj.v, [0, 1, progress.SCHEMA_VERSION]);
  return { kind: "progress", progress: checkedBackupProgress(Object.hasOwn(obj, "progress") ? obj.progress : obj) };
}

function normaliseBackupKv(key, value) {
  if (key === GARDEN_DRAFTS_KEY) return normaliseGardenDrafts(value);
  if (key === STORIES_KEY) return normaliseStoryState(value);
  if (key === STUDIO_DRAFT_KEY) return normaliseStudioDocument(value);
  if (key === RIVER_RUN_KEY) return normalizeRiverRun(value);
  if (key === MEADOW_DRAFTS_KEY) return normaliseMeadowDrafts(value);
  if (key === ANIMAL_FRIENDS_KEY) return normalizeAnimalFriends(value);
  if (key === MUSIC_BAND_KEY) return normalizeMusicBand(value);
  if (key === SCRAPBOOK_KEY) return normaliseScrapbook(value);
  if (key === ROLLING_RUN_KEY) return normalizeRollingRun(value);
  if (key === TOY_WORKSHOP_KEY) return normalizeToyWorkshop(value);
  if (key === BRIDGE_DRAFTS_KEY) return normaliseBridgeDrafts(value);
  if (key === PICNIC_KEY) return normalizePicnicStore(value);
  if (key === BUILD_LAB_KEY) return normalizeBuildLabState(value);
  if (key === WATER_GARDEN_KEY) return normalizeWaterGardenStore(value);
  if (key === PICTURE_POST_KEY) return normalizePicturePostState(value);
  if (key === MEADOW_LABELS_KEY) return normaliseMeadowLabels(value);
  if (key === "discovery") return normalizeDiscoveryState(value);
  if (key === PLAY_STAGE_CURRENT_KEY) return requireStoredPlayStageScene(value);
  return jsonCopy(value);
}

function normaliseBackupGalleryPair(pair) {
  if (!Array.isArray(pair) || pair.length !== 2 || pair[0] == null || !pair[1] || typeof pair[1] !== "object") return null;
  const key = String(pair[0]).slice(0, 240);
  const row = pair[1];
  if (row.kind === 'build-lab') {
    const source = row.source;
    if (source?.kind !== 'build-lab' || source.version !== 1 || !source.build || typeof source.build !== 'object' || source.id !== row.buildId) return null;
    const entry = { id: source.id, build: source.build, png: row.png, at: row.at };
    const clean = buildLabGalleryRow(entry);
    return clean ? [buildLabGalleryKey(entry), clean] : null;
  }
  if (row.kind === 'picture-post') {
    const day = messageDayFields(row);
    const message = normalizePicturePostState({ sent: [row.source] }).sent[0];
    if (Object.prototype.hasOwnProperty.call(day, 'messageDay') && JSON.stringify(day.messageDay) !== JSON.stringify(message?.messageDay)) throw messageDayError();
    if (!message || row.png !== message.png || row.deliveryId !== message.id) return null;
    const clean = postGalleryRow(message);
    return clean ? [postGalleryKey(message), clean] : null;
  }
  if (row.kind !== PLAY_STAGE_POSTCARD_KIND) return [key, jsonCopy(row)];
  // A local postcard owns its room, score and recording. An unsupported room
  // refuses the whole import before mutation rather than disappearing as a row.
  if (isLocalPNG(row.png)) requireStoredPlayStageScene(row.scene);
  const clean = normalisePlayStagePostcard(row, key);
  if (!clean) return null;
  const { key: cleanKey, ...stored } = clean;
  return [cleanKey || key, stored];
}

// A picture can still be rasterizing after its screen has unmounted. Drain the
// controller export and mural queue before taking or replacing a family snapshot.
async function flushArtWrites() {
  const [mural, { studio }] = await Promise.all([
    import("../world/family-mural.js"), import("../world/screens/studio.js"),
  ]);
  const [, paperSaved] = await Promise.all([mural.flushMuralWrites(), studio.beforeBreak()]);
  if (paperSaved === false) throw Object.assign(new Error("The live picture could not be saved. Keep the page open and retry."), { code: "studio-write" });
}

/** Build a local-only backup of settings, play history, drafts, and creations. */
export async function flushSavedPlayWrites() {
  await flushToyPhotos();
  await flushBooHollowWrites();
  await flushDiscoveryWrites();
  await flushGardenDraftWrites();
  await flushStoryWrites();
  await flushRiverRun();
  await flushMeadowDraftWrites();
  await flushAnimalFriends();
  await Promise.all([picnicState.flush(), buildLabState.flush(), flushWaterGarden(), picturePostState.flush(), flushBridgeWrites(), flushToyWorkshop(), flushRollingRun(), flushMusicBand()]);
  await flushMeadowLabelWrites();
  await flushPlayStageCheckpointWrites();
  await flushArtWrites();
  await flushDecorations();
}

export async function buildBackup() {
  await flushSavedPlayWrites();
  const snapshot = await db.snapshot(['kv', 'gallery']);
  const savedKv = new Map(snapshot.kv);
  const kv = {};
  for (const key of BACKUP_KV_KEYS) {
    const value = savedKv.get(key);
    const clean = value == null ? null : normaliseBackupKv(key, value);
    if (clean != null) kv[key] = clean;
  }
  const creations = snapshot.gallery
    .map(normaliseBackupGalleryPair).filter(Boolean);
  return {
    kind: "rainbow-valley-backup",
    version: 2,
    savedWorld: { v: 1, id: savedWorld.id },
    exportedAt: new Date().toISOString(),
    progress: jsonCopy(progress.normaliseImportedProgress(savedKv.get('progress') || progress.exportJSON().progress)),
    settings: jsonCopy(settings.normaliseSettings(savedKv.get('settings') || settings.get())),
    kv,
    gallery: creations,
    recordedVoicesIncluded: false,
  };
}

/** Create exactly the file the importer can accept, without changing saved play. */
export function backupDownloadBlob(backup, maxBytes = MAX_BACKUP_IMPORT_BYTES) {
  if (!Array.isArray(backup?.gallery) || backup.gallery.length > MAX_BACKUP_GALLERY_RECORDS)
    throw new Error("This collection has too many pictures for one supported backup. Existing play has not been changed.");
  const limit = Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= MAX_BACKUP_IMPORT_BYTES ? maxBytes : MAX_BACKUP_IMPORT_BYTES;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  if (blob.size > limit)
    throw new Error("This collection is too large for the supported backup format. Existing play stays here. Individual pictures can still be exported from Gallery.");
  return blob;
}

/** Restore backup v2, while remaining compatible with the original progress-only file. */
let restoringBackup = false;
export function restoreBackup(obj) { return withPhotoImportsPaused(() => restoreBackupPaused(obj)); }
async function restoreBackupPaused(obj) {
  if (restoringBackup) throw backupImportError('backup-busy', 'A backup is already being restored. Wait for it to finish.');
  restoringBackup = true;
  try { return await restoreCheckedBackup(obj); }
  finally { restoringBackup = false; }
}

async function restoreCheckedBackup(obj) {
  const backup = checkedBackupEnvelope(obj);
  await flushBooHollowWrites();
  await flushDiscoveryWrites();
  await flushGardenDraftWrites();
  await flushStoryWrites();
  await flushRiverRun();
  await flushMeadowDraftWrites();
  await flushAnimalFriends();
  await flushDecorations();
  await Promise.all([picnicState.flush(), buildLabState.flush(), flushWaterGarden(), picturePostState.flush(), flushBridgeWrites(), flushToyWorkshop(), flushRollingRun(), flushMusicBand()]);
  if (backup.kind === "picnic") {
    await db.atomicWrite({ put: [['kv', PICNIC_KEY, backup.picnic]] });
    await picnicState.load({ force: true });
    return { version: 2, reloadRecommended: true, restoredAreas: ["picnic"] };
  }
  if (backup.kind === "progress") {
    await db.atomicWrite({ put: [['kv', 'progress', progress.normaliseImportedProgress(backup.progress)]] });
    await progress.load();
    busEmit('progress:changed', { kind: 'import' });
    return { version: 1, reloadRecommended: false };
  }
  // Reject capacity/format failures before changing any existing child work,
  // settings or progress. Valid neighboring records are still normalized below.
  const savedKv = backup.kv;
  const cleanKv = new Map();
  for (const key of BACKUP_KV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(savedKv, key) && savedKv[key] != null) {
      const clean = normaliseBackupKv(key, savedKv[key]);
      if (clean != null) cleanKv.set(key, clean);
    }
  }
  const rawGallery = backup.gallery;
  if (rawGallery.length > MAX_BACKUP_GALLERY_RECORDS) throw new Error("This backup contains too many gallery records. Your current play has not been changed.");
  const galleryRows = rawGallery.map(normaliseBackupGalleryPair).filter(Boolean);
  const stageRows = galleryRows
    .filter(([, row]) => row.kind === PLAY_STAGE_POSTCARD_KIND)
    .sort((a, b) => Number(b[1].at || 0) - Number(a[1].at || 0));
  if (stageRows.length > PLAY_STAGE_MAX_POSTCARDS) {
    throw backupImportError("backup-postcards-full", "This backup contains more kept stage postcards than this version can restore.");
  }
  await flushArtWrites();
  await flushMeadowLabelWrites();
  await flushPlayStageCheckpointWrites();
  const rowsToRestore = galleryRows.filter(([, row]) => row.kind !== PLAY_STAGE_POSTCARD_KIND).concat(stageRows);
  const puts = [
    ['kv', 'progress', progress.normaliseImportedProgress(backup.progress)],
    ...[...cleanKv].map(([key, value]) => ['kv', key, value]),
    ...rowsToRestore.map(([key, row]) => ['gallery', key, row]),
  ];
  if (backup.settings) puts.push(['kv', 'settings', settings.normaliseSettings(backup.settings, settings.get())]);
  await db.atomicWrite({ put: puts, del: [...BACKUP_KV_KEYS, 'resume'].map(key => ['kv', key]), clear: ['gallery'] });
  await Promise.all([progress.load(), settings.load()]);
  busEmit('progress:changed', { kind: 'import' });
  if (backup.settings) busEmit('settings:changed', { patch: backup.settings, settings: settings.get() });
  await Promise.all([loadDiscovery({ force: true }), picnicState.load({ force: true }), buildLabState.load({ force: true }), picturePostState.load({ force: true }), loadToyWorkshop({ force: true }), loadRollingRun({ force: true }), loadMusicBand({ force: true }), loadAnimalFriends({ force: true }), loadRiverRun({ force: true }), storiesState.load({ force: true })]);
  return { version: 2, reloadRecommended: true };
}

/** Clear child play data and creations, while retaining parent settings and local voices. */
export function eraseSavedPlay() { return withPhotoImportsPaused(() => eraseSavedPlayPaused()); }
async function eraseSavedPlayPaused() {
  await flushBooHollowWrites();
  await flushDiscoveryWrites();
  await flushGardenDraftWrites();
  await flushStoryWrites();
  await flushRiverRun();
  await flushMeadowDraftWrites();
  await flushAnimalFriends();
  await flushDecorations();
  await Promise.all([picnicState.flush(), buildLabState.flush(), flushWaterGarden(), picturePostState.flush(), flushBridgeWrites(), flushToyWorkshop(), flushRollingRun(), flushMusicBand()]);
  await flushArtWrites();
  const resets = await Promise.allSettled([
    resetBridgeDrafts(),
    import("../state/discovery.js").then((mod) => mod.reset()),
    import("../state/stories.js").then((mod) => mod.resetStories()),
    clearMeadowLabels(),
    clearPlayStageState().then(() => flushPlayStageCheckpointWrites()),
    import("../state/studio.js").then(async (mod) => {
      if (typeof mod.flushStudioWrites === "function") await mod.flushStudioWrites();
      return mod.clearStudioDraft();
    }),
  ]);
  await progress.resetAll();
  for (const key of ["resume", ...BACKUP_KV_KEYS]) {
    try { await db.del("kv", key); } catch (_) {}
  }
  // Clear again after feature write queues have drained so an older autosave can
  await Promise.all([loadDiscovery({ force: true }), picnicState.load({ force: true }), buildLabState.load({ force: true }), picturePostState.load({ force: true }), loadToyWorkshop({ force: true }), loadRollingRun({ force: true }), loadMusicBand({ force: true }), loadAnimalFriends({ force: true }), loadRiverRun({ force: true }), storiesState.load({ force: true })]);
  // never recreate a picture behind the parent's confirmed start-over action.
  try { await db.clear("gallery"); } catch (_) {}
  return { cleared: true, moduleResets: resets.map((row) => row.status) };
}

// ---------------------------------------------------------------- tiny DOM helpers

const cleanups = [];
const timers = [];
let recorderMod = null;
let recorderTried = false;
let micMessage = "";
let parentListeningPlayer = null;

function listen(target, evt, fn, opts) {
  target.addEventListener(evt, fn, opts);
  cleanups.push(() => target.removeEventListener(evt, fn, opts));
}

function h(tag, opts, kids) {
  const n = document.createElement(tag);
  const o = opts || {};
  if (o.class) n.className = o.class;
  if (o.text != null) n.textContent = o.text;
  if (o.attrs) for (const k of Object.keys(o.attrs)) n.setAttribute(k, o.attrs[k]);
  if (o.style) Object.assign(n.style, o.style);
  if (o.on) for (const k of Object.keys(o.on)) listen(n, k, o.on[k]);
  for (const c of [].concat(kids || [])) if (c) n.appendChild(c);
  return n;
}

function btn(label, onClick, cls) {
  return h("button", {
    class: "rv-btn " + (cls || ""), text: label,
    attrs: { type: "button" }, on: { click: onClick },
  });
}

function card(title, kids, cls) {
  return h("section", { class: "rv-card " + (cls || "") }, [h("h2", { class: "rv-h2", text: title })].concat(kids || []));
}

function note(text) { return h("p", { class: "rv-note", text }); }

function toggle(label, value, onChange) {
  const b = h("button", {
    class: "rv-switch", attrs: { type: "button", "aria-label": label, "aria-pressed": value ? "true" : "false" },
  }, [h("span", { class: "rv-switch-knob" })]);
  listen(b, "click", () => {
    const next = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", next ? "true" : "false");
    onChange(next);
  });
  const row = h("div", { class: "rv-row" }, [h("span", { class: "rv-row-label", text: label }), b]);
  row.control = b;
  row.paint = (v) => b.setAttribute("aria-pressed", v ? "true" : "false");
  return row;
}

function segmented(options, value, onPick) {
  const wrap = h("div", { class: "rv-seg" });
  const paint = (v) => {
    for (const b of wrap.children) b.setAttribute("aria-pressed", b.dataset.value === v ? "true" : "false");
  };
  for (const opt of options) {
    const b = h("button", {
      class: "rv-seg-btn", text: opt.label,
      attrs: { type: "button", "aria-pressed": "false" },
      on: { click: () => { paint(opt.value); onPick(opt.value); } },
    });
    b.dataset.value = opt.value;
    wrap.appendChild(b);
  }
  paint(value);
  return wrap;
}

// ---------------------------------------------------------------- letter and word chips

function letterChip(ch, st) {
  const NS = "http://www.w3.org/2000/svg";
  const fed = Math.max(0, Math.min(1, (st && st.fed) || 0));
  const level = Math.max(0, Math.min(4, (st && st.level) || 0));
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("class", "rv-chip-svg");

  const track = document.createElementNS(NS, "circle");
  track.setAttribute("cx", "32"); track.setAttribute("cy", "32"); track.setAttribute("r", "26");
  track.setAttribute("fill", "none"); track.setAttribute("stroke", P.grey); track.setAttribute("stroke-width", "5");
  svg.appendChild(track);

  const fill = document.createElementNS(NS, "circle");
  fill.setAttribute("cx", "32"); fill.setAttribute("cy", "32");
  fill.setAttribute("r", String(4 + 19 * fed));
  fill.setAttribute("fill", fed > 0 ? P.mint : "transparent");
  fill.setAttribute("opacity", "0.85");
  svg.appendChild(fill);

  if (level > 0) {
    const c = 2 * Math.PI * 26;
    const arc = document.createElementNS(NS, "circle");
    arc.setAttribute("cx", "32"); arc.setAttribute("cy", "32"); arc.setAttribute("r", "26");
    arc.setAttribute("fill", "none"); arc.setAttribute("stroke", P.lilacDeep);
    arc.setAttribute("stroke-width", "5"); arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("transform", "rotate(-90 32 32)");
    arc.style.strokeDasharray = c;
    arc.style.strokeDashoffset = String(c * (1 - level / 4));
    svg.appendChild(arc);
  }

  const text = document.createElementNS(NS, "text");
  text.setAttribute("x", "32"); text.setAttribute("y", "41");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("class", "rv-chip-letter");
  text.textContent = ch;
  svg.appendChild(text);

  if (st && st.hatched) {
    const wing = document.createElementNS(NS, "path");
    wing.setAttribute("d", "M48 14 C54 8 59 11 57 17 C59 14 60 20 54 21 C51 22 48 19 48 14 Z");
    wing.setAttribute("fill", letterHue(ch));
    wing.setAttribute("stroke", P.ink);
    wing.setAttribute("stroke-width", "1.5");
    svg.appendChild(wing);
  }

  const wrap = h("div", { class: "rv-chip" + (st && st.hatched ? " is-hatched" : "") });
  wrap.appendChild(svg);
  wrap.title = ch + ": level " + level + " of 4" + (st && st.hatched ? ", hatched" : "");
  return wrap;
}

function wordChip(word, st, i) {
  const earned = !!(st && st.stripe);
  return h("div", {
    class: "rv-word" + (earned ? " is-earned" : ""),
    text: word,
    style: earned ? { background: rainbowAt(i / 16), borderColor: P.ink } : null,
  });
}

// ---------------------------------------------------------------- sections

function progressSection(refreshers) {
  const grid = h("div", { class: "rv-chips" });
  const words = h("div", { class: "rv-words" });
  const summary = h("p", { class: "rv-note" });
  let showAll = false;

  const paint = () => {
    const s = progress.get();
    const pool = showAll ? [...UPPER, ...LOWER, ...DIGITS] : UPPER;
    grid.textContent = "";
    for (const ch of pool) grid.appendChild(letterChip(ch, s.letters[ch]));
    words.textContent = "";
    progress.WORDS.forEach((w, i) => words.appendChild(wordChip(w, s.words[w], i)));
    const hatched = Object.keys(s.letters).filter((k) => s.letters[k].hatched).length;
    const day = s.days[session.today()] || { traces: 0 };
    summary.textContent = hatched + " butterflies hatched, " + s.unicorn.stripes +
      " of " + progress.WORDS.length + " unicorn stripes, " + s.stickers.length + " stickers. " + day.traces + " letters traced today.";
  };
  refreshers.push(paint);

  const more = btn("show lowercase and numbers", () => {
    showAll = !showAll;
    more.textContent = showAll ? "show capitals only" : "show lowercase and numbers";
    paint();
  }, "rv-btn-soft");

  paint();
  return card("Progress", [
    summary,
    grid,
    note("The ring is how much help she still gets (empty ring = thick guide, full ring = from memory). The green centre is how close that caterpillar is to hatching."),
    more,
    h("h3", { class: "rv-h3", text: "Words" }),
    words,
    note("A coloured word is a unicorn stripe she has won back."),
  ]);
}

export function toyPhotoSection(refreshers = []) {
  let disposed = false, revision = 0, candidate = null, saving = false, selectedFile = null, crop = 'whole', rotation = 0;
  let decodeTail = Promise.resolve();
  const status = h("p", { class: "rv-note", attrs: { role: "status" }, text: "Choose a JPEG, PNG or still WebP, then preview it before adding. Nothing is uploaded." });
  const input = h("input", { attrs: { type: "file", accept: "image/jpeg,image/png,image/webp", "aria-label": "Choose a toy photo" } });
  const preview = h("img", { class: "rv-big-img", attrs: { alt: "Preview of the toy picture you selected", hidden: true } });
  const clearPreview = () => { candidate = null; preview.hidden = true; preview.removeAttribute('src'); };
  const paintControls = () => {
    add.disabled = saving || !candidate; input.disabled = saving;
    cancel.disabled = saving || !selectedFile;
    whole.disabled = square.disabled = rotate.disabled = saving || !selectedFile;
    whole.setAttribute('aria-pressed', String(crop === 'whole')); square.setAttribute('aria-pressed', String(crop === 'square'));
  };
  const prepare = async () => {
    const file = selectedFile, mode = crop, turns = rotation, ticket = ++revision, admission = photoImportTicket();
    clearPreview(); paintControls(); if (!file) { status.textContent = "Choose a toy picture to preview."; return; }
    status.textContent = "Preparing a smaller local preview…";
    // At most one decode per open card. Retired queued selections do no work.
    const work = decodeTail.then(() => disposed || ticket !== revision ? null : prepareToyPhoto(file, { crop: mode, rotation: turns, ticket: admission }));
    decodeTail = work.catch(() => undefined);
    try {
      const ready = await work;
      if (!ready || disposed || ticket !== revision) return;
      candidate = ready; preview.src = ready.png; preview.hidden = false;
      status.textContent = mode === 'square' ? "Check the center-square crop before adding. It may leave out the edges." : "Check the whole picture before adding it to the game.";
    } catch (error) { if (!disposed && ticket === revision) status.textContent = error.message || "This picture could not open."; }
    finally { if (!disposed && ticket === revision) paintControls(); }
  };
  const whole = btn("Preview whole picture", () => { if (!saving && selectedFile) { crop = 'whole'; void prepare(); } }, "rv-btn-soft");
  const square = btn("Preview center square", () => { if (!saving && selectedFile) { crop = 'square'; void prepare(); } }, "rv-btn-soft");
  const rotate = btn("Turn picture clockwise", () => { if (!saving && selectedFile && !disposed) { rotation = (rotation + 1) % 4; void prepare(); } }, "rv-btn-soft");
  const add = btn("Add this toy picture", async () => {
    if (!candidate || saving || disposed) return;
    saving = true; paintControls();
    try {
      const result = await addToyPhoto(candidate);
      if (disposed) return;
      clearPreview(); selectedFile = null; input.value = '';
      status.textContent = result.persistent ? "Toy picture added. Choose it from Pictures in the toy activities." : "Toy picture is here for now. Device saving is unavailable; it may disappear when this page closes.";
      for (const refresh of refreshers) { try { refresh(); } catch {} }
    } catch (error) { if (!disposed) status.textContent = error.message || "The picture could not be added. Your existing pictures are unchanged."; }
    finally { saving = false; if (!disposed) paintControls(); }
  }, "rv-btn-go");
  const cancel = btn("Cancel preview", () => {
    if (saving) return;
    revision++; clearPreview(); selectedFile = null; input.value = ''; paintControls();
    status.textContent = "Preview canceled. No picture was added.";
  }, "rv-btn-soft");
  paintControls();
  listen(input, 'change', () => { if (!saving && !disposed) { selectedFile = input.files?.[0] || null; crop = 'whole'; rotation = 0; void prepare(); } });
  cleanups.push(() => { disposed = true; revision++; candidate = null; selectedFile = null; preview.removeAttribute('src'); });
  return card("Toy pictures", [note("Parent choice only. JPEG/PNG/still WebP up to 8 MB; HEIC is not supported. Choose whole-picture or center-square preview, and turn it if needed, before Add. The smaller copy omits the original filename and photo metadata. Pictures stay on this device unless you explicitly export a backup."), input, preview, h('div', {class:'rv-btn-row'}, [whole, square, rotate]), h('div', {class:'rv-btn-row'}, [add, cancel]), status]);
}

function gallerySection(refreshers) {
  const grid = h("div", { class: "rv-gallery" });
  const empty = note("Loading saved pictures…");
  let overlay = null;
  let disposed = false, read = 0;
  const rowLabel = (row) => row?.kind === "toy-photo" ? "Toy picture" : row && row.kind === PLAY_STAGE_POSTCARD_KIND ? "Story stage postcard" : String(row && row.id || "Picture");

  const close = () => { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); overlay = null; };

  const open = (row) => {
    close();
    const label = rowLabel(row);
    const img = h("img", { class: "rv-big-img", attrs: { src: row.png, alt: label } });
    overlay = h("div", { class: "rv-overlay", on: { click: (e) => { if (e.target === overlay) close(); } } }, [
      h("div", { class: "rv-card rv-overlay-card" }, [
        h("h2", { class: "rv-h2", text: label + ", " + row.day }),
        img,
        h("div", { class: "rv-btn-row" }, [
          btn("export png", () => gallery.exportPNG(row.key), "rv-btn-go"),
          btn("delete this one", async () => { await gallery.remove(row.key); close(); paint(); }, "rv-btn-soft"),
          btn("close", close, "rv-btn-soft"),
        ]),
      ]),
    ]);
    document.body.appendChild(overlay);
    cleanups.push(close);
  };

  const paint = async () => {
    if (disposed) return;
    const currentRead = ++read;
    grid.setAttribute("aria-busy", "true");
    const rows = await gallery.list();
    if (disposed || currentRead !== read) return;
    grid.textContent = "";
    grid.setAttribute("aria-busy", "false");
    empty.textContent = "Pictures and kept story scenes will show up here.";
    empty.style.display = rows.length ? "none" : "";
    for (const row of rows.slice(0, 60)) {
      const label = rowLabel(row);
      const thumb = h("button", {
        class: "rv-thumb", attrs: { type: "button", title: label + " " + row.day },
        on: { click: () => open(row) },
      }, [h("img", { attrs: { src: row.png, alt: label } })]);
      grid.appendChild(thumb);
    }
  };
  cleanups.push(() => { disposed = true; read++; close(); });
  refreshers.push(paint);
  paint();
  return card("Gallery", [empty, grid, note("Tap a picture or postcard to see it big and save it to the tablet.")]);
}

function sessionSection() {
  const s = settings.get();
  const value = h("p", { class: "rv-value" });
  const slider = h("input", {
    class: "rv-slider",
    attrs: { type: "range", min: "0", max: "60", step: "5", value: String(s.timerEnabled !== true ? 0 : s.sessionMinutes), "aria-label": "Play time in minutes" },
  });
  const startSession = async (stillCurrent) => {
    await settings.set({ sessionMinutes: Number(slider.value) });
    if (!stillCurrent()) return false;
    // A fresh session starts on the map, including after a reload. Saved artwork
    // lives separately and remains available in its activity and the gallery.
    await resume.save({ screen: "map", params: {}, strokes: [] });
    if (!stillCurrent()) return false;
    session.startNewSession();
    return await routerApi?.go?.("map", {}, { dir: "right" });
  };
  const start = btn("Start play", () => starter.play(false), "rv-btn-go");
  const immersiveStatus = h("p", { class: "rv-note", attrs: { role: "status" } });
  const fullScreenStart = btn("Start full screen play", () => starter.play(true), "rv-btn-go");
  const starter = playStart({
    enter: enterFullscreen, standalone: isStandalone, start: startSession,
    available: () => !document.hidden && !routerApi?.isMoving?.(),
    report: (phase) => {
      const opening = phase === 'opening';
      if (opening || phase === 'settled') { start.disabled = opening; fullScreenStart.disabled = opening; slider.disabled = opening; }
      if (opening) immersiveStatus.textContent = 'Opening play…';
      if (phase === 'unavailable') immersiveStatus.textContent = 'Full screen is unavailable here. Use Start play, or open the game from your Home Screen. All play still works in the browser.';
      if (phase === 'error') immersiveStatus.textContent = 'Play could not start. Please try again. Your saved pictures have not been deleted.';
      if (phase === 'canceled') immersiveStatus.textContent = 'Play was canceled. Tap Start play when ready.';
      if (phase === 'ready') immersiveStatus.textContent = '';
    },
  });
  cleanups.push(() => starter.destroy());
  const exitFullScreen = btn("Leave full screen", async () => {
    const result = await exitFullscreen();
    immersiveStatus.textContent = result.exited
      ? "Full screen is off. Your saved work stays here."
      : "The browser is still in full screen. Use its exit control or try again. Your saved work stays here.";
  });
  exitFullScreen.hidden = !fullscreenElement();
  listen(document, "fullscreenchange", () => { exitFullScreen.hidden = !fullscreenElement(); });
  listen(document, "webkitfullscreenchange", () => { exitFullScreen.hidden = !fullscreenElement(); });
  const paint = () => {
    const m = Number(slider.value);
    value.textContent = m === 0 ? "Timer off" : "Break after " + m + (m === 1 ? " minute" : " minutes");
    start.textContent = m === 0 ? "Start play without a timer" : "Start " + m + "-minute play";
  };
  const change = async () => {
    paint();
    await settings.set({ sessionMinutes: Number(slider.value) });
    session.reset();
  };
  listen(slider, "input", paint);
  listen(slider, "change", change);
  const presets = h("div", { class: "rv-timer-presets", attrs: { "aria-label": "Play time presets" } },
    Array.from({ length: 13 }, (_, i) => i * 5).map(minutes => btn(minutes === 60 ? "1 hour" : minutes ? minutes + " min" : "Off", () => {
      slider.value = String(minutes);
      void change();
    })));
  paint();
  return card("Session", [
    value, slider, presets, start, fullScreenStart, exitFullScreen, immersiveStatus,
    note("Full screen hides browser controls where supported. It does not lock the device's Home button, system gestures or app switching. Grown-up settings includes Leave full screen; Esc also exits where supported."),
    note("Coming back to the game in a browser tab shows one big Play button over Rayna's place. One tap continues and asks for full screen; if the browser says no, play simply carries on in the window."),
    note("Keep just one game tab open so your saved play stays protected. A second tab waits on a cover until the first one is closed. While the game is opening you see the butterfly; a slow or failed start retries by itself, and a round arrow appears after about 10 seconds if you want to retry sooner."),
    h("details", { class: "rv-device-help" }, [
      h("summary", { text: "Keep play in one app: parent device setup" }),
      note("iPad: Settings → Accessibility → Guided Access. Set a parent passcode, open the game, then triple-click the top button or the older iPad's Home button and choose Start. Keep Touch enabled. End through the button shortcut and parent authentication. Apple says iPadOS18 and earlier uses a double-click for pausing; button/options wording varies by version."),
      note("Android: Settings → Security (or Security & location) → Advanced → App pinning. Open the game, open Overview, tap the app icon and Pin. Unpin with the device's gesture or Back/Overview combination and parent PIN. Samsung wording may differ; search Settings for Pin app."),
      note("An installed Home Screen app gives the cleanest presentation on supported trusted HTTPS/localhost addresses. Ordinary home Wi-Fi HTTP is online browser play; it cannot install this game's offline worker."),
    ]),
    note("The timer starts off. A grown-up can choose 5–60 minutes here to enable it. When time is up, Mama asks Rayna to take a break. The game waits for her current stroke or short action to finish, then pauses until a grown-up starts play again. Sound follows your mute setting."),
    note("Changing the duration starts a fresh timer. Off removes the time limit. Refreshing the page keeps the timer and any break already in progress."),
    btn("Take a break with Mama now", async () => {
      session.lockForBreak();
      await routerApi?.go?.("mama-break", { sessionEnd: true });
    }, "rv-btn-go"),
  ]);
}

function playSection() {
  const s = settings.get();
  const worldStatus = h("p", { class: "rv-note", attrs: { role: "status" }, text: `Open now: ${savedWorld.label}.` });
  let switchingWorld = false;
  const worldButtons = Object.values(SAVED_WORLDS).map(world => {
    const button = btn(`Open ${world.label}`, async () => {
      if (switchingWorld || world.id === savedWorld.id) return;
      switchingWorld = true;
      worldButtons.forEach(item => { item.disabled = true; });
      worldStatus.textContent = "Saving current play before opening the other world…";
      try {
        await flushSavedPlayWrites();
        const storage = await db.flushTemporaryWrites();
        if (!storage.persistent) throw new Error("Current play is temporary. Keep this page open, save a backup in Data, and retry storage before switching.");
        location.assign(savedWorldLink(location.href, world.id, { muted: settings.get().muted }));
      } catch (error) {
        worldStatus.textContent = error?.message || "The other world could not be opened. Current play is still here.";
        switchingWorld = false;
        worldButtons.forEach((item, index) => { item.disabled = Object.values(SAVED_WORLDS)[index].id === savedWorld.id; });
      }
    });
    button.disabled = world.id === savedWorld.id;
    return button;
  });
  const regionRows = [];
  const regions = [
    ["garden", "Caterpillar garden (letters)"],
    ["meadow", "Unicorn meadow (words)"],
    ["stories", "Storybook paths (stories)"],
    ["bridge", "Rainbow bridge (drawing)"],
    ["studio", "Open Rainbow Studio (create)"],
    ["treehouse", "Veer's treehouse"],
    ["grandma", "Ba's house"],
    ["discovery", "Discovery glade (play and notice)"],
  ].map(([key, label]) => {
    const row = toggle(label, s.regions[key] !== false, async (v) => {
      const saved = await settings.set({ regions: { [key]: v } });
      for (const item of regionRows) item.row.paint(saved.regions[item.key] !== false);
    });
    regionRows.push({ key, row });
    return row;
  });
  // One switch per activity inside a place (work order item 5, Nov 16 2026).
  const activityChoices = settings.activityChoices();
  const activities = [
    ["town-tracks", "Town (trains and roads)"],
    ["water-garden", "Water garden"],
    ["play-stage", "Play stage"],
    ["animal-friends", "Cat friend"],
    ["rolling-run", "Rolling hill"],
    ["river-run", "River"],
    ["toy-workshop", "Toy workshop"],
    ["build-lab", "Build a bridge"],
    ["picnic", "Café and picnic"],
    ["music-band", "Music"],
    ["picture-post", "Picture mail"],
    ["boo-hollow", "Ghost friends"],
  ].map(([key, label]) => toggle(label, activityChoices[key] !== false,
    (v) => settings.set({ activities: { [key]: v } })));
  activities.push(toggle("Cat friend: the older full corner (move things, keep corners, garden visits) instead of hide and seek",
    s.catCornerFull === true, (v) => settings.set({ catCornerFull: v })));

  return card("Play", [
    h("h3", { class: "rv-h3", text: "Saved worlds" }),
    worldStatus,
    note("Rayna and Veer have separate drawings, toys, scenes, progress and timers in their saved worlds on this browser. An ordinary old link still opens Shared earlier play. Existing work stays there; nothing is moved or guessed to belong to either child."),
    h("div", { class: "rv-btn-row" }, worldButtons),
    parentShareLinks(),
    note("Use the address of the chosen world when reopening or sharing this build. A different device or address keeps its own local saves. Family recordings stay in the world where they were recorded; built-in narration remains available in every world."),
    note(savedWorld.id === "shared"
      ? "Shared earlier play is preserved here. Choose Rayna’s saved world or Veer’s saved world above for separate play. Choosing a child opens that child’s own saves; it does not rename or move these earlier creations."
      : `${valleyProfile(s.valleyProfile).title} uses its own saved world. Existing Rayna narration stays the same.`),
    h("h3", { class: "rv-h3", text: "Which hand" }),
    segmented([{ value: "right", label: "right hand" }, { value: "left", label: "left hand" }],
      s.handedness, (v) => settings.set({ handedness: v })),
    h("h3", { class: "rv-h3", text: "What can draw" }),
    segmented([{ value: "both", label: "pen and finger" }, { value: "pen", label: "pen only" }],
      s.penOnly ? "pen" : "both", (v) => settings.set({ penOnly: v === "pen" })),
    note("Pen only ignores fingers completely, so a hand resting on the screen never draws."),
    h("h3", { class: "rv-h3", text: "Learning support" }),
    segmented([
      { value: "explore", label: "explore" },
      { value: "grow", label: "grow" },
      { value: "challenge", label: "challenge" },
    ], s.learningLevel, (v) => settings.set({ learningLevel: v })),
    note("Explore gives the most modeling. Grow fades help gradually. Challenge offers less help, while the guide still stays warm and available."),
    h("h3", { class: "rv-h3", text: "Places to visit" }),
  ].concat(regions).concat([
    h("h3", { class: "rv-h3", text: "Activities" }),
    note("Some activities start switched off while they are rebuilt as simpler toys. Switch any of them back on here; an activity also needs its place switched on above."),
  ]).concat(activities).concat([
    h("h3", { class: "rv-h3", text: "Letters to practise" }),
    segmented([
      { value: "upper", label: "capitals" },
      { value: "upper+lower", label: "capitals and small" },
      { value: "all", label: "letters and numbers" },
    ], s.pool, (v) => settings.set({ pool: v })),
    toggle("Calmer motion (fewer particles)", !!s.reducedMotion, (v) => settings.set({ reducedMotion: v })),
    toggle("Dark drawing paper", !!s.darkPaper, (v) => settings.set({ darkPaper: v })),
    toggle("Halloween decorations (October 15 to November 3)", !s.halloweenOff, (v) => settings.set({ halloweenOff: !v })),
    toggle("Sound off", !!s.muted, (v) => settings.set({ muted: v })),
  ]));
}

function soundSection() {
  const s = settings.get();
  const rows = [
    ["volume", "All sound", s.volume],
    ["musicVolume", "Background music", s.musicVolume],
    ["effectsVolume", "Effects & instruments", s.effectsVolume],
    ["voiceVolume", "Voices", s.voiceVolume],
  ].map(([key, label, initial]) => {
    const value = h("span", { class: "rv-volume-value" });
    const slider = h("input", {
      class: "rv-slider",
      attrs: { type: "range", min: "0", max: "1", step: "0.05", value: String(initial), "aria-label": label },
    });
    const paint = () => { value.textContent = Math.round(Number(slider.value) * 100) + "%"; };
    listen(slider, "input", paint);
    listen(slider, "change", () => settings.set({ [key]: Number(slider.value) }));
    paint();
    return h("div", { class: "rv-volume-row" }, [
      h("div", { class: "rv-volume-label" }, [h("span", { text: label }), value]), slider,
    ]);
  });
  return card("Sound", rows.concat([
    note("Background music changes the valley soundtrack. Effects & instruments changes taps, chimes and Music Band notes. All sound lowers everything. These choices are saved on this tablet; Voices includes family recordings and the guide."),
  ]));
}

async function recorder() {
  if (recorderMod || recorderTried) return recorderMod;
  recorderTried = true;
  try { recorderMod = await import("../audio/recorder.js"); } catch (_) { recorderMod = null; }
  return recorderMod;
}

function narrationReviewSection() {
  let alive = true, loading = false, loaded = false, loadMessage = "";
  const controls = new Map();
  const status = h("p", { class: "rv-note", attrs: { role: "status", "aria-live": "polite" } });
  const rows = h("div", { class: "rv-listening-rows" });
  const stop = btn("Stop preview", () => player.stop(), "rv-btn-soft");
  const details = h("details", { class: "rv-listening-details" }, [
    h("summary", { text: "Review names and guidance" }),
    note("For adults: tap a sample to check the bundled Heart narrator on this device. The words below are exactly what each clip says. Family recordings still take priority during play."),
    status, stop, rows,
  ]);
  const paint = (state) => {
    if (!alive) return;
    const blocked = state.muted || state.gain === 0;
    let message = state.muted
      ? "Sound off is on. Turn it off in Play to hear a preview."
      : state.gain === 0 ? "Raise All sound and Voices in Sound to hear a preview."
        : state.phase === "loading" ? "Preparing the selected preview..."
          : state.phase === "playing" ? "Playing the selected preview. Tap Stop preview to end it."
            : state.reason === "unavailable" ? "That clip could not play on this device. Tap Play to try again."
              : state.reason === "recording-missing" ? "That family line has no recording now."
                : "Tap Play to hear one sample. Nothing plays automatically.";
    if (loadMessage) message += " " + loadMessage;
    status.textContent = message;
    stop.disabled = !state.activeKey;
    for (const [key, button] of controls) {
      const active = state.activeKey === key;
      button.disabled = blocked;
      button.textContent = active ? "Stop" : "Play";
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", (active ? "Stop " : "Play ") + button.dataset.label);
    }
  };
  const player = createParentListeningPlayer({ onState: paint });
  parentListeningPlayer = player;
  cleanups.push(() => {
    alive = false;
    player.dispose();
    if (parentListeningPlayer === player) parentListeningPlayer = null;
  });
  refreshers.push(() => player.refresh());
  listen(details, "toggle", async () => {
    if (!details.open) { player.stop("collapsed"); return; }
    if (loaded || loading) return;
    loading = true; loadMessage = "Checking the bundled samples..."; paint(player.snapshot());
    try {
      const entries = await loadNarrationReview();
      if (!alive) return;
      player.setEntries(entries);
      rows.textContent = "";
      for (const entry of entries) {
        const play = btn("Play", () => {
          if (player.snapshot().activeKey === entry.key) player.stop();
          else player.play(entry.key);
        }, "rv-btn-soft rv-listening-play");
        play.dataset.label = entry.label;
        controls.set(entry.key, play);
        rows.appendChild(h("div", { class: "rv-listening-row" }, [
          h("div", { class: "rv-listening-copy" }, [
            h("strong", { text: entry.label }), h("p", { text: entry.text }),
          ]), play,
        ]));
      }
      loaded = entries.length > 0;
      loadMessage = entries.length ? entries.length + " bundled samples checked." : "The bundled samples are unavailable here. Close and reopen to retry.";
    } catch (_) {
      if (!alive) return;
      loadMessage = "The bundled samples could not be checked. Close and reopen to retry.";
    } finally {
      loading = false;
      if (alive) paint(player.snapshot());
    }
  });
  paint(player.snapshot());
  return card("Narration review", [details], "rv-listening-card");
}

function voicesSection(refreshers) {
  let disposed = false, paintSerial = 0, rowHolds = [];
  const retireHolds = () => { rowHolds.forEach(hold => hold.destroy()); rowHolds = []; };
  cleanups.push(() => { disposed = true; paintSerial++; retireHolds(); });
  listen(document, 'visibilitychange', () => { if (document.hidden) rowHolds.forEach(hold => hold.cancel()); });
  listen(window, 'blur', () => rowHolds.forEach(hold => hold.cancel()));
  let speaker = "grandma";
  const rows = h("div", { class: "rv-voice-rows" });
  const status = h("p", { class: "rv-note" });

  const paintRows = async () => {
    const visit = ++paintSerial; retireHolds();
    const mod = await recorder();
    if (disposed || visit !== paintSerial) return;
    rows.textContent = "";
    for (const spec of VOICE_KEYS) {
      const key = spec.key(speaker);
      const who = storeSpeaker(key, speaker);
      const label = typeof spec.label === "function" ? spec.label(speaker) : spec.label;
      const dot = h("span", { class: "rv-rec-dot" });
      const state = h("span", { class: "rv-voice-state", text: "" });
      const recBtn = h("button", {
        class: "rv-btn rv-btn-rec", attrs: { type: "button" },
      }, [dot, h("span", { text: "hold to record" })]);
      const playBtn = btn("play", async () => {
        const player = parentListeningPlayer;
        if (!player) return;
        await player.playRecording(() => db.get("voices", who + "/" + key), who + "/" + key);
        const result = player.snapshot();
        status.textContent = result.muted ? "Sound off is on. Turn it off in Play to hear a recording."
          : result.gain === 0 ? "Raise All sound and Voices in Sound to hear a recording."
            : result.reason === "recording-missing" ? "That line has no recording now."
              : result.reason === "unavailable" ? "That recording could not play on this device."
                : "Recording previews stop when you leave Parent or switch sound off.";
      }, "rv-btn-soft");
      const delBtn = btn("delete", async () => {
        if (parentListeningPlayer?.snapshot().activeKey === "recording:" + who + "/" + key) parentListeningPlayer.stop();
        const m = await recorder();
        if (m && m.deleteRecording) { try { await m.deleteRecording(who, key); } catch (_) {} }
        refreshRow();
      }, "rv-btn-soft");
      const importInput = h("input", {
        class: "rv-file",
        attrs: { type: "file", accept: ".webm,.mp3,.m4a,.mp4,.ogg,.wav,audio/webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav" },
      });
      listen(importInput, "change", async () => {
        const file = importInput.files && importInput.files[0];
        if (!file) return;
        try {
          await importVoiceFile(file, who, key);
          status.textContent = "Imported that recording. It stays on this tablet.";
        } catch (err) {
          status.textContent = (err && err.message) || "That audio file could not be imported.";
        }
        importInput.value = "";
        refreshRow();
      });
      const importBtn = btn("import audio", () => importInput.click(), "rv-btn-soft");

      const hold = recordingHold({
        limit: MAX_RECORD_MS,
        start: async (stillHeld) => {
          parentListeningPlayer?.stop("recording");
          const m = await recorder();
          if (!m?.startRecording) throw new Error("Recording is not available on this device.");
          if (!stillHeld() || disposed || visit !== paintSerial || document.hidden) throw new Error("Recording canceled.");
          return m.startRecording(who, key);
        },
        report: (phase, error) => {
          if (disposed || visit !== paintSerial) return;
          recBtn.classList.toggle('is-recording', phase === 'recording');
          if (phase === 'pending') status.textContent = "Keep holding while the microphone opens.";
          if (phase === 'recording' || phase === 'idle') status.textContent = '';
          if (phase === 'error') status.textContent = error?.message || "Recording could not finish.";
          if (phase === 'saved') refreshRow();
        },
      });
      rowHolds.push(hold);
      listen(recBtn, 'pointerdown', event => {
        if (event.button > 0 || document.hidden) return;
        event.preventDefault(); void hold.begin(event.pointerId);
      });
      listen(recBtn, 'pointerup', event => { void hold.finish(event.pointerId, true); });
      listen(recBtn, 'keydown', event => {
        if (![' ', 'Enter'].includes(event.key) || event.repeat || document.hidden) return;
        event.preventDefault(); void hold.begin('keyboard');
      });
      listen(recBtn, 'keyup', event => {
        if (![' ', 'Enter'].includes(event.key)) return;
        event.preventDefault(); void hold.finish('keyboard', true);
      });
      listen(recBtn, 'blur', () => hold.cancel());
      for (const name of ['pointercancel', 'pointerleave', 'lostpointercapture'])
        listen(recBtn, name, event => { void hold.finish(event.pointerId, false); });

      const refreshRow = async () => {
        const m = await recorder();
        let has = false;
        if (m && m.hasRecording) { try { has = await Promise.resolve(m.hasRecording(who, key)); } catch (_) {} }
        state.textContent = has ? "saved" : "not recorded";
        state.classList.toggle("is-saved", !!has);
        playBtn.disabled = !has;
        delBtn.disabled = !has;
      };
      refreshRow();

      rows.appendChild(h("div", { class: "rv-voice-row" }, [
        h("div", { class: "rv-voice-label" }, [
          h("span", { class: "rv-voice-title", text: label }),
          state,
          isShared(key) ? h("span", { class: "rv-voice-state", text: "shared line" }) : null,
        ]),
        h("div", { class: "rv-btn-row" }, [recBtn, playBtn, importBtn, delBtn]),
        importInput,
      ]));
    }
    if (!mod) status.textContent = "Recording is not available on this device.";
    else if (micMessage) status.textContent = micMessage;
  };

  const tabs = h("div", { class: "rv-seg" });
  const paintTabs = () => {
    for (const b of tabs.children) b.setAttribute("aria-pressed", b.dataset.value === speaker ? "true" : "false");
  };
  for (const s of SPEAKERS) {
    const b = h("button", {
      class: "rv-seg-btn", text: SPEAKER_LABELS[s], attrs: { type: "button", "aria-pressed": "false" },
      on: { click: () => { speaker = s; paintTabs(); paintRows(); } },
    });
    b.dataset.value = s;
    tabs.appendChild(b);
  }
  paintTabs();
  paintRows();
  refreshers.push(paintRows);

  const preferred = (settings.get().voices || {}).preferred || "auto";
  const prefer = segmented(
    [{ value: "auto", label: "anyone" }].concat(SPEAKERS.map((s) => ({ value: s, label: SPEAKER_LABELS[s] }))),
    preferred, (v) => settings.set({ voices: { preferred: v } }),
  );

  return card("Voices", [
    note("Pick who is speaking, then hold to record or import a family-made audio file. Ten seconds each for recordings. Files must be WebM, MP3, M4A, OGG, or WAV and under 5 MB."),
    tabs, rows, status,
    h("h3", { class: "rv-h3", text: "Whose voice does Rayna hear first" }),
    prefer,
    note("This stores the real recording you choose. It does not clone, synthesize, or imitate anyone's voice. A shared line plays whoever recorded it; a family line stays that person's own."),
  ], "rv-card-wide");
}

function pwaSection() {
  const value = h("p", { class: "rv-value", text: "Checking this launch..." });
  const detail = note("");
  const openedBuild = note("Opened build: checking...");
  const offlineBuild = note("Offline build: checking...");
  const buildDetail = note("");
  let disposed = false;
  let busy = false;
  let mod = null;
  let buildCheck = 0;
  let buildAbort = null;
  const retry = btn("retry offline setup", async () => {
    if (busy || disposed) return;
    busy = true;
    retry.disabled = true;
    value.textContent = "Retrying offline setup";
    detail.textContent = "Keep this page connected while the game downloads.";
    try {
      mod = mod || await import("../pwa.js");
      if (disposed) return;
      paint(await mod.retryRegistration());
    } catch (_) {
      unavailable();
    } finally {
      busy = false;
      if (!disposed) retry.disabled = false;
    }
  });
  retry.hidden = true;
  function unavailable() {
    if (disposed) return;
    value.textContent = "Offline status unavailable";
    detail.textContent = "Play can continue while connected. Retry setup before relying on offline play.";
    retry.hidden = false;
    if (mod) refreshBuild();
    else {
      openedBuild.textContent = "Opened build: unavailable";
      offlineBuild.textContent = "Offline build: unavailable";
      buildDetail.textContent = "Build identities could not be confirmed. Offline readiness is shown above.";
    }
  }
  function paint(cap) {
    if (disposed) return;
    retry.hidden = cap.offlineReady || !cap.secureContext || !cap.serviceWorkerSupported ||
      ["registration-deferred", "registering", "installing", "activating"].includes(cap.reason);
    retry.disabled = busy;
    if (cap.offlineReady) {
      value.textContent = "Offline ready";
      detail.textContent = "Offline play is ready on this address. An installed Home Screen app can also hide browser controls.";
    } else if (!cap.secureContext) {
      value.textContent = "Online-only on this address";
      detail.textContent = "Ordinary Wi-Fi HTTP cannot install offline support. Use localhost on this computer or a trusted HTTPS address on the tablet.";
    } else if (!cap.serviceWorkerSupported) {
      value.textContent = "Offline mode unavailable";
      detail.textContent = "This browser does not support offline setup. Play can continue while connected.";
    } else if (["registration-failed", "registration-unavailable", "installation-failed", "initialization-failed"].includes(cap.reason)) {
      value.textContent = "Offline setup did not finish";
      detail.textContent = "Play can continue while connected. Retry the download before relying on offline play.";
    } else {
      value.textContent = ["installing", "activating"].includes(cap.reason) ? "Downloading offline play" : "Offline setup is starting";
      detail.textContent = "Keep this page connected until it says Offline ready.";
    }
    refreshBuild();
  }
  async function refreshBuild() {
    if (disposed || !mod) return;
    const check = ++buildCheck;
    buildAbort?.abort();
    buildAbort = typeof AbortController === "function" ? new AbortController() : null;
    try {
      const identity = typeof mod.buildIdentity === "function"
        ? await mod.buildIdentity({ signal: buildAbort?.signal })
        : { reason: "legacy", openedBuild: null, offlineBuild: null };
      if (disposed || check !== buildCheck) return;
      openedBuild.textContent = "Opened build: " + (identity.openedBuild || "unavailable");
      offlineBuild.textContent = "Offline build: " + (identity.offlineBuild || "unavailable");
      if (identity.openedBuild && identity.offlineBuild) {
        buildDetail.textContent = identity.openedBuild === identity.offlineBuild
          ? "This page and offline play use the same build."
          : "This page and offline play use different builds. Reopening the game will use the offline build.";
      } else if (identity.reason === "legacy") {
        buildDetail.textContent = "Build reporting is unavailable in this opened version.";
      } else if (identity.reason === "uncontrolled") {
        buildDetail.textContent = "This online page's build could not be confirmed. A new opening can use the offline build once the browser controls it.";
      } else if (["lan-http", "insecure-context", "unsupported"].includes(identity.reason)) {
        buildDetail.textContent = "Build identities are unavailable on this online-only address or browser.";
      } else if (identity.offlineBuild) {
        buildDetail.textContent = "This page's build could not be confirmed. Offline readiness is shown above.";
      } else if (identity.openedBuild) {
        buildDetail.textContent = "This page's build is confirmed; the offline build could not be confirmed.";
      } else {
        buildDetail.textContent = "Build identities could not be confirmed. Offline readiness is shown above.";
      }
    } catch (_) {
      if (disposed || check !== buildCheck) return;
      openedBuild.textContent = "Opened build: unavailable";
      offlineBuild.textContent = "Offline build: unavailable";
      buildDetail.textContent = "Build identities could not be confirmed. Offline readiness is shown above.";
    }
  }
  cleanups.push(() => { disposed = true; buildCheck++; buildAbort?.abort(); });
  cleanups.push(busOn("pwa:capability", paint));
  (async () => {
    try {
      mod = await import("../pwa.js");
      if (disposed) return;
      paint(await mod.capabilities());
    } catch (_) { unavailable(); }
  })();
  return card("App and offline", [value, detail, openedBuild, offlineBuild, buildDetail, retry]);
}

function todaySection(refreshers) {
  const line = h("p", { class: "rv-value" });
  const actions = h("div", { class: "rv-btn-row" });
  const paint = () => {
    const d = progress.get().days[session.today()] || { traces: 0, hatches: 0, stripes: 0, drawings: 0 };
    line.textContent = d.traces + " letters, " + d.hatches + " butterflies, " + d.stripes + " stripes, " + d.drawings + " drawings today.";
  };
  const reset = () => {
    actions.textContent = "";
    actions.appendChild(btn("reset today", () => {
      actions.textContent = "";
      actions.appendChild(h("span", { class: "rv-confirm-text", text: "Clear today's tally and today's drawings?" }));
      actions.appendChild(btn("yes, clear today", async () => { await progress.resetToday(); reset(); paint(); refreshers.forEach((f) => f()); }, "rv-btn-warn"));
      actions.appendChild(btn("keep it", reset, "rv-btn-soft"));
    }, "rv-btn-soft"));
  };
  refreshers.push(paint);
  paint();
  reset();
  return card("Today", [line, actions, note("This clears today only. Play history and creations from earlier days stay.")]);
}

function dataSection(refreshers) {
  const status = h("p", { class: "rv-note" });

  const doExport = async () => {
    status.textContent = "Preparing the backup…";
    try {
    const blob = backupDownloadBlob(await buildBackup());
    const url = URL.createObjectURL(blob);
    const a = h("a", { attrs: { href: url, download: "valley-" + savedWorld.id + "-" + session.today() + ".json" }, style: { display: "none" } });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 4000);
    status.textContent = "Backup download started. Check that the JSON file finished downloading. Recorded voices stay on this tablet.";
    } catch (error) {
      status.textContent = "A complete backup could not be prepared. Keep the game open. " + (error?.message || "Please retry.");
    }
  };

  const file = h("input", { class: "rv-file", attrs: { type: "file", accept: "application/json,.json" } });
  listen(file, "change", async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    let reopening = false;
    rootEl?.setAttribute('inert', '');
    try {
      const obj = await readBackupFile(f);
      const result = await restoreBackup(obj);
      const storage = await db.flushTemporaryWrites();
      status.textContent = (result.restoredAreas ? "Loaded the picnic recovery copy. Other play was kept." : "Loaded the backup.") +
        (!storage.persistent ? " Storage is temporary. Keep this page open, save a backup, and retry storage before closing it." : result.reloadRecommended ? " Reopening the game…" : "");
      refreshers.forEach((fn) => fn());
      if (storage.persistent && result.reloadRecommended && typeof location !== "undefined") {
        reopening = true;
        setTimeout(() => location.reload(), 500);
      }
    } catch (error) {
      // Keep diagnostics local. A generic message cannot distinguish a bad file
      // from a browser/storage failure when a valid backup is being restored.
      console.warn("[backup] restore failed", error);
      const capacity = {
        'file-unreadable': 'This file could not be opened. Choose the downloaded backup again.',
        'picnic-enjoyed-by': 'This backup has an invalid food-tasting record.',
        'tables-full': 'This picnic backup has too many kept tables.',
        'gardens-full': 'This garden backup has too many kept gardens.',
        'papers-full': 'This picture-message backup has too many unfinished papers.',
        'letters-full': 'This picture-message backup has too many sent envelopes.',
        capacity: 'This picnic backup is too large.',
      };
      status.textContent = error?.code ? (capacity[error.code] || error.message) + " Existing play was kept." : /too large/.test(error?.message || "") ? error.message : "That file was not a usable Rayna’s Valley backup. Existing play was kept.";
    }
    if (!reopening) rootEl?.removeAttribute('inert');
    file.value = "";
  });
  const importBtn = btn("load a backup", () => file.click(), "rv-btn-soft");

  const wipeWrap = h("div", { class: "rv-btn-row" });
  const wipeReset = () => {
    wipeWrap.textContent = "";
    wipeWrap.appendChild(btn("erase everything", () => {
      wipeWrap.textContent = "";
      wipeWrap.appendChild(h("span", { class: "rv-confirm-text", text: "This erases saved play history and creations." }));
      wipeWrap.appendChild(btn("continue", () => {
        wipeWrap.textContent = "";
        wipeWrap.appendChild(h("span", { class: "rv-confirm-text", text: "Really erase all saved play and creations?" }));
        wipeWrap.appendChild(btn("yes, erase it all", async () => {
          await eraseSavedPlay();
          const storage = await db.flushTemporaryWrites();
          wipeReset();
          status.textContent = storage.persistent ? "Saved play and creations were erased. Recorded voices and parent choices were kept. Reopening the game…" : "Start over is temporary because storage is unavailable. Keep this page open and retry storage before closing it. Recorded voices and parent choices were kept.";
          refreshers.forEach((fn) => fn());
          if (storage.persistent && typeof location !== "undefined") setTimeout(() => location.reload(), 700);
        }, "rv-btn-warn"));
        wipeWrap.appendChild(btn("cancel", wipeReset, "rv-btn-soft"));
      }, "rv-btn-warn"));
      wipeWrap.appendChild(btn("cancel", wipeReset, "rv-btn-soft"));
    }, "rv-btn-soft"));
  };
  wipeReset();
  const retryStorage = btn("retry storage", async () => {
    const storage = await db.flushTemporaryWrites();
    status.textContent = storage.persistent ? "Temporary changes are now saved on this device." : "Storage is still unavailable. Keep this page open and save a backup before closing it.";
    refreshers.forEach(fn => fn());
  }, "rv-btn-soft");

  return card("Data", [
    h("div", { class: "rv-btn-row" }, [btn("save a backup", doExport, "rv-btn-go"), importBtn]),
    file, status, retryStorage,
    h("h3", { class: "rv-h3", text: "Start over" }),
    wipeWrap,
    note("Backups include play history, parent choices, drafts, and gallery creations. Recorded voices stay in this browser and are not put in the backup. Nothing is uploaded."),
  ]);
}

function performanceSection() {
  const fps = h("span", { class: "rv-stat-value", text: "-" });
  const dropped = h("span", { class: "rv-stat-value", text: "-" });
  const worst = h("span", { class: "rv-stat-value", text: "-" });
  const long = h("span", { class: "rv-stat-value", text: "-" });

  const stat = (label, node) => h("div", { class: "rv-stat" }, [node, h("span", { class: "rv-stat-label", text: label })]);

  const paint = () => {
    if (typeof document !== "undefined" && document.hidden) return;
    const s = perf.stats();
    const l = perf.longTasks();
    fps.textContent = s.samples ? String(s.fps) : "-";
    dropped.textContent = String(s.dropped);
    worst.textContent = s.samples ? s.worstMs + " ms" : "-";
    long.textContent = l.supported ? String(l.count) : "not measured";
  };

  perf.startFrameMonitor();
  paint();
  const id = setInterval(paint, 1000);
  timers.push(id);

  return card("Performance", [
    h("div", { class: "rv-stats" }, [
      stat("frames per second", fps),
      stat("dropped frames (1 min)", dropped),
      stat("worst frame", worst),
      stat("long tasks (1 min)", long),
    ]),
    note("The game requests Wake Lock while playing where supported. The browser may decline it, including on low battery; device sleep remains controlled by your settings."),
  ]);
}

// ---------------------------------------------------------------- the screen

let rootEl = null;
let hostEl = null;
let backFn = null;
const refreshers = [];

function ensureStylesheet() {
  if (typeof document === "undefined") return;
  const href = new URL("../../css/parent.css", import.meta.url).href;
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    if (link.href === href || /parent\.css(\?|$)/.test(link.getAttribute("href") || "")) return;
  }
  document.head.appendChild(h("link", { attrs: { rel: "stylesheet", href } }));
}

function goBack() {
  if (session.isBreakLocked()) { routerApi?.go?.("mama-break", { sessionEnd: true }); return; }
  if (typeof backFn === "function") { backFn(); return; }
  if (routerApi && routerApi.back) { routerApi.back(); return; }
  if (routerApi && routerApi.go) { routerApi.go("map", null, { dir: "fade" }); }
}

function build() {
  const back = h("button", {
    class: "rv-back", attrs: { type: "button" }, text: "back to the valley", on: { click: goBack },
  });
  const head = h("header", { class: "rv-head" }, [
    back,
    h("h1", { class: "rv-h1", text: valleyProfile(settings.get().valleyProfile).title }),
  ]);
  const grid = h("div", { class: "rv-grid" }, [
    sessionSection(),
    progressSection(refreshers),
    gallerySection(refreshers),
    toyPhotoSection(refreshers),
    playSection(),
    soundSection(),
    narrationReviewSection(),
    voicesSection(refreshers),
    pwaSection(),
    todaySection(refreshers),
    dataSection(refreshers),
    performanceSection(),
  ]);
  return h("div", { class: "rv-parent", attrs: { "data-screen": "parent" } }, [head, grid]);
}

export function mount(host, params) {
  hostEl = host || document.body;
  ensureStylesheet();
  backFn = params && typeof params.onBack === "function" ? params.onBack : null;
  rootEl = build();
  hostEl.appendChild(rootEl);
  hostEl.setAttribute("data-screen", "parent");

  const off = busOn("progress:changed", () => refreshers.forEach((f) => { try { f(); } catch (_) {} }));
  cleanups.push(off);

  // Fill in anything that was not loaded before the corner was opened.
  (async () => {
    try {
      if (!settings.isLoaded()) await settings.load();
      if (!progress.isLoaded()) await progress.load();
      refreshers.forEach((f) => { try { f(); } catch (_) {} });
    } catch (_) {}
  })();
  return rootEl;
}

export function unmount() {
  while (timers.length) { const t = timers.pop(); clearInterval(t); clearTimeout(t); }
  while (cleanups.length) { try { cleanups.pop()(); } catch (_) {} }
  refreshers.length = 0;
  perf.stopFrameMonitor();
  if (rootEl && rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
  if (hostEl && hostEl.getAttribute("data-screen") === "parent") hostEl.removeAttribute("data-screen");
  rootEl = null;
  hostEl = null;
  backFn = null;
}

export function onBack() { goBack(); }

export const screen = { id: "parent", mount, unmount, onBack };

// The router is written by the world lane. Register when it is there; never throw if it
// is not (dev pages mount this screen directly).
let routerApi = null;
export function install(api) {
  routerApi = api || null;
  if (routerApi && typeof routerApi.register === "function") routerApi.register(screen);
  return screen;
}

(async () => {
  try {
    const mod = await import("../world/router.js");
    install(mod);
  } catch (_) { /* no router yet: dev page mounts the screen directly */ }
})();

export default screen;
