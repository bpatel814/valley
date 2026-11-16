import db from './db.js';
import { newMessageDay, messageDayFields } from '../data/message-day.js';
import { normalizePostDraft, normalizePostPaper, newPostDraft, applyPostAction, postDeliverySnapshot, picturePostSource, validId, validPostPNG, validPostTime, postRecipient, postSituation, POST_PLACES, POST_STAMPS, POST_MAX_STOPS } from '../data/picture-post.js';
export const PICTURE_POST_KEY = 'picturePostV1';
export const PICTURE_POST_MAX_SENT = 1000;
// Owned papers are retained. This is an import/storage bound, not a recent-list
// pruning rule; reaching it blocks a new paper instead of deleting another one.
export const PICTURE_POST_MAX_DRAFTS = 1000;
const clone = value => JSON.parse(JSON.stringify(value));
export function normalizePicturePostState(raw) {
  if (raw?.schema != null && raw.schema !== 1) throw Object.assign(new Error('This picture album is from an unsupported version. Current papers were kept.'), { code: 'post-version' });
  const out = { schema: 1, draft: normalizePostDraft(raw?.draft), drafts: [], sent: [], selectedMessage: null };
  const draftIds = new Set();
  for (const item of (Array.isArray(raw?.drafts) ? raw.drafts : [])) {
    const draft = normalizePostDraft(item);
    if (!draft.paper.marks.length || draftIds.has(draft.id)) continue;
    draftIds.add(draft.id); out.drafts.push({ ...draft, stage: 'make', png: null, stops: [] });
    if (out.drafts.length > PICTURE_POST_MAX_DRAFTS) throw Object.assign(new Error('This paper album has too many drafts to load safely. Existing papers were kept.'), { code: 'papers-full' });
  }
  const ids = new Set();
  for (const message of (Array.isArray(raw?.sent) ? raw.sent : [])) {
    const day = messageDayFields(message);
    if (!message || !validPostPNG(message.png) || !validPostTime(message.at) || !POST_PLACES.some(p => p.id === message.destination)) continue;
    const id = validId(message.id); if (id !== message.id || ids.has(id)) continue; ids.add(id);
    out.sent.push({ id, draftId: validId(message.draftId), revision: Number.isSafeInteger(message.revision) && message.revision >= 0 ? message.revision : 0,
      situation: postSituation(message.situation).id, recipient: postRecipient(message.recipient).id, destination: message.destination,
      stops: (Array.isArray(message.stops) ? message.stops : []).filter(p => POST_PLACES.some(v => v.id === p)).slice(-POST_MAX_STOPS),
      paper: normalizePostPaper(message.paper), png: message.png, at: Math.round(message.at), opened: message.opened === true,
      reply: Array.isArray(message.reply) ? message.reply.filter(stamp => POST_STAMPS.includes(stamp)).slice(0, POST_STAMPS.length) : postSituation(message.situation).reply.slice(), ...day });
    if (out.sent.length > PICTURE_POST_MAX_SENT) throw Object.assign(new Error('This letter album has too many sent envelopes to load safely. Existing letters were kept.'), { code: 'letters-full' });
  }
  if (out.sent.some(m => m.id === raw?.selectedMessage)) out.selectedMessage = raw.selectedMessage;
  if (out.draft.stage === 'delivered' && !out.sent.some(m => m.id === `${out.draft.id}:${out.draft.revision}`)) out.draft = { ...out.draft, stage: 'make', png: null, stops: [] };
  return out;
}
let value = normalizePicturePostState(null), loaded = false, tail = Promise.resolve(), serial = 0;
const pendingGallery = new Map();
const id = () => `letter-${Date.now()}-${++serial}`;
export function postGalleryKey(message) { return `picture-post_${validId(message.id)}`; }
export function postGalleryRow(message) { const source = picturePostSource(message); return source && validPostTime(message.at) ? { ...source, deliveryId: message.id, day: new Date(message.at).toISOString().slice(0, 10), source: clone(message) } : null; }
function enqueue(work) { tail = tail.then(work, work); void tail.catch(() => {}); return tail; }
async function repairPendingGallery(snapshot) {
  const ids = new Set(snapshot.sent.map(message => postGalleryKey(message)));
  for (const [key, row] of pendingGallery) {
    if (!ids.has(key)) continue;
    if (!await db.getStrict('gallery', key)) await db.put('gallery', key, row);
    pendingGallery.delete(key);
  }
}
function persist() {
  const snapshot = clone(value);
  return enqueue(async () => { await db.put('kv', PICTURE_POST_KEY, snapshot); await repairPendingGallery(snapshot); });
}
export function retryPicturePostWrites() {
  const snapshot = clone(value);
  return enqueue(async () => {
    await db.put('kv', PICTURE_POST_KEY, snapshot);
    for (const message of snapshot.sent) {
      const key = postGalleryKey(message);
      if (!await db.getStrict('gallery', key)) await db.put('gallery', key, postGalleryRow(message));
    }
    await repairPendingGallery(snapshot);
    return { persistent: db.status().persistent };
  });
}
export function flushPicturePostCheckpointWrites() { return tail; }
export function get() { return clone(value); }
// Idle guidance only needs this normalized draft property, not copies of the whole album.
export function draftHasPaperMarks() { return value.draft.paper.marks.length > 0; }
export async function load({ force = false, io = db } = {}) {
  if (!loaded || force) {
    loaded = false; await tail;
    const raw = await (io.getStrict || io.get)('kv', PICTURE_POST_KEY);
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw Object.assign(new Error('This picture album could not be read safely.'), {code:'post-invalid'});
    const incoming = normalizePicturePostState(raw);
    if ((raw?.sent != null && (!Array.isArray(raw.sent) || incoming.sent.length !== raw.sent.length)) ||
        (raw?.drafts != null && (!Array.isArray(raw.drafts) || incoming.drafts.length !== raw.drafts.length))) {
      throw Object.assign(new Error('Some saved papers need a newer or repaired album. They were kept.'), {code:'post-invalid'});
    }
    // Repair a tab close between the state write and gallery write. Stable delivery keys
    // make this idempotent and never prune older owned gallery creations.
    for (const message of incoming.sent) if (!await (io.getStrict || io.get)('gallery', postGalleryKey(message))) await io.put('gallery', postGalleryKey(message), postGalleryRow(message));
    value = incoming; pendingGallery.clear(); loaded = true;
  }
  return get();
}
export function apply(action) { value.draft = applyPostAction(value.draft, action); void persist(); return get(); }
function stashCurrent(reopeningId = null) {
  if (!value.draft.paper.marks.length || value.draft.stage === 'delivered') return true;
  const drafts = value.drafts.filter(d => d.id !== value.draft.id && d.id !== reopeningId);
  if (drafts.length >= PICTURE_POST_MAX_DRAFTS) return false;
  drafts.push({ ...clone(value.draft), stage: 'make', png: null, stops: [] });
  value.drafts = drafts;
  return true;
}
export function saveDraft() { if (!stashCurrent()) return null; void persist(); return get(); }
export function start(situation = 'free') { if (!stashCurrent()) return null; value.draft = newPostDraft(id(), situation); value.selectedMessage = null; void persist(); return get(); }
export function startMessageDay(episode, options = {}) {
  // Prepare and validate before stashing or replacing any live paper.
  const messageDay = newMessageDay(episode, options);
  const previous = messageDay.previousMessageId ? value.sent.find(message => message.id === messageDay.previousMessageId) : null;
  if (messageDay.previousMessageId && !previous) return null;
  const paper = previous ? normalizePostPaper(previous.paper) : null;
  if (!stashCurrent()) return null;
  value.draft = { ...newPostDraft(id(), previous?.situation || 'free'),
    ...(previous ? { recipient: previous.recipient, destination: previous.destination, paper } : {}), messageDay };
  value.selectedMessage = null; void persist(); return get();
}
export function deliver(now = Date.now()) {
  const message = postDeliverySnapshot(value.draft, now);
  if (!message || value.sent.some(m => m.id === message.id) || value.sent.length >= PICTURE_POST_MAX_SENT) return null;
  // Commit original and stage together, before the first asynchronous write. A second
  // tap observes delivered and cannot create another envelope.
  value.sent.push(message); value.draft.stage = 'delivered'; value.selectedMessage = message.id;
  const snapshot = clone(value), row = postGalleryRow(message);
  pendingGallery.set(postGalleryKey(message), row);
  // One rejecting operation: a later gallery success cannot hide a failed state write.
  void enqueue(async () => {
    await db.put('kv', PICTURE_POST_KEY, snapshot);
    await repairPendingGallery(snapshot);
  });
  return clone(message);
}
export function open(messageId) { const message = value.sent.find(m => m.id === messageId); if (!message) return null; message.opened = true; value.selectedMessage = message.id; void persist(); return clone(message); }
export function reopen(messageId) {
  const message = value.sent.find(m => m.id === messageId); if (!message) return null;
  // Editing a delivered picture creates a new draft; the recipient keeps the original.
  if (!stashCurrent()) return null;
  value.draft = { ...newPostDraft(id(), message.situation), recipient: message.recipient, destination: message.destination, paper: clone(message.paper), ...messageDayFields(message) };
  value.selectedMessage = null; void persist(); return get();
}
export function reopenDraft(draftId) {
  const draft = value.drafts.find(d => d.id === draftId); if (!draft) return null;
  const copy = clone(draft); if (!stashCurrent(draft.id)) return null;
  value.draft = copy; value.selectedMessage = null; void persist(); return get();
}
export function reopenSource(source) {
  const day = messageDayFields(source);
  if (source?.kind !== 'picture-post' || !validPostPNG(source.png)) return null;
  const paper = normalizePostPaper(source.document || source.paper); if (!paper.marks.length) return null;
  if (!stashCurrent()) return null;
  value.draft = { ...newPostDraft(id(), source.situation), recipient: postRecipient(source.recipient).id,
    destination: POST_PLACES.some(p => p.id === source.destination) ? source.destination : postSituation(source.situation).destination, paper, ...day };
  value.selectedMessage = null; void persist(); return get();
}
export async function reopenGallery(key, { isCurrent = () => true } = {}) { await tail; const row = await db.getStrict('gallery', String(key)); return isCurrent() ? reopenSource(row) : null; }
export function draftSource() {
  const draft = value.draft;
  return draft.png ? picturePostSource({ ...draft, id: `${draft.id}:${draft.revision}`, at: Date.now() }) : null;
}
export function select(messageId) { value.selectedMessage = value.sent.some(m => m.id === messageId) ? messageId : null; void persist(); return get(); }
export function flush() { return tail; }
export default { get, draftHasPaperMarks, load, apply, start, startMessageDay, deliver, open, reopen, select, saveDraft, reopenDraft, reopenSource, reopenGallery, draftSource, flush, checkpointFlush: flushPicturePostCheckpointWrites, retry: retryPicturePostWrites };
