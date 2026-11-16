// Owned picture messages: drawing never gates delivery. Coordinates belong to the paper,
// not to the device that happened to make the marks.
import { messageDayFields, chooseMessageDayUse } from './message-day.js';
export const POST_RECIPIENTS = Object.freeze([
  { id: 'rayna', name: 'Rayna', art: 'family_child1_idle', home: 'village' },
  { id: 'veer', name: 'Veer', art: 'veer_idle', home: 'village' },
  { id: 'ishan', name: 'Ishan', art: 'family_ishan_idle', home: 'village' },
  { id: 'mama', name: 'Mama', art: 'family_adult1_idle', home: 'village' },
  { id: 'daddy', name: 'Daddy', art: 'family_adult2_idle', home: 'village' },
  { id: 'ba', name: 'Ba', art: 'family_grandma_idle', home: 'grandparents' },
  { id: 'dada', name: 'Dada', art: 'family_grandpa_idle', home: 'grandparents' },
]);
export const POST_STAMPS = Object.freeze(['heart', 'flower', 'sun', 'star']);
export const POST_STAMP_SIZES = Object.freeze([
  Object.freeze({ id: 'small', label: 'Small', size: .08, preview: 18 }),
  Object.freeze({ id: 'medium', label: 'Medium', size: .14, preview: 30 }),
  Object.freeze({ id: 'large', label: 'Large', size: .24, preview: 46 }),
]);
export function postStampSize(id) { return (POST_STAMP_SIZES.find(row => row.id === id) || POST_STAMP_SIZES[1]).size; }
export function createPostStamp(stamp, sizeId, x = .5, y = .5) { return { kind: 'stamp', stamp, x, y, size: postStampSize(sizeId) }; }
export const POST_COLORS = Object.freeze(['#72518b', '#b34765', '#33748d', '#4b7a4c', '#8a602e']);
export const POST_PLACES = Object.freeze([
  { id: 'picnic', name: 'Family picnic', art: 'picture-post/picnic-stop-v2.png' },
  { id: 'village', name: 'Family home', art: 'picture-post/family-home-v2.png' },
  { id: 'grandparents', name: 'Ba and Dada’s home', art: 'picture-post/grandparents-home-v2.png' },
]);
export const POST_SITUATIONS = Object.freeze([
  { id: 'picnic', title: 'Invite someone to a picnic', prompt: 'Draw what you would like at the picnic. Choose someone to invite.', recipient: 'veer', destination: 'picnic', reply: ['sun', 'heart', 'flower'] },
  { id: 'home-picture', title: 'A picture for Ba or Dada', prompt: 'Make a picture for their home. They can hang up your very own marks.', recipient: 'ba', destination: 'grandparents', reply: ['heart', 'flower'] },
  { id: 'free', title: 'Your own picture message', prompt: 'A scribble, a picture, a letter, or a stamp. What will you send?', recipient: 'ishan', destination: 'village', reply: ['heart', 'star'] },
]);
export const POST_MAX_MARKS = 96;
export const POST_MAX_POINTS = 32768;
export const POST_MAX_STROKE_POINTS = 8192;
export const POST_MAX_PNG_CHARS = 800000;
export const POST_MAX_STOPS = 6;
export const postRecipient = id => POST_RECIPIENTS.find(p => p.id === id) || POST_RECIPIENTS[0];
export const postSituation = id => POST_SITUATIONS.find(p => p.id === id) || POST_SITUATIONS[2];
const clone = o => JSON.parse(JSON.stringify(o));
export function postPaperError(code = 'post-capacity') {
  const text = code === 'post-capacity' ? 'This paper has reached its supported size. Current marks and earlier pictures were kept.' : code === 'post-version' ? 'This picture paper is from an unsupported version. Current pictures were kept.' : 'This picture paper cannot be opened without changing its marks. Current pictures were kept.';
  return Object.assign(new Error(text), { code });
}
function paperObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function supportedVersion(value) {
  for (const field of ['v', 'version', 'schema']) if (value[field] != null && value[field] !== 1) throw postPaperError('post-version');
}
function coordinate(value) { if (typeof value !== 'number' || !Number.isFinite(value)) throw postPaperError('post-paper'); return value; }
export function postPoint(point) {
  if (!paperObject(point)) throw postPaperError('post-paper');
  const p = point.p == null ? .5 : coordinate(point.p);
  if (p < 0 || p > 1) throw postPaperError('post-paper');
  const out = { x: coordinate(point.x), y: coordinate(point.y), p };
  for (const field of ['t', 'v']) if (point[field] != null) {
    out[field] = coordinate(point[field]); if (out[field] < 0) throw postPaperError('post-paper');
  }
  return out;
}
export function normalizePostPaper(raw) {
  const paper = { ratio: 1.5, marks: [] }; let points = 0;
  if (raw == null) return paper;
  if (!paperObject(raw)) throw postPaperError('post-paper');
  supportedVersion(raw);
  if ((raw.ratio != null && raw.ratio !== paper.ratio) || (raw.marks != null && !Array.isArray(raw.marks))) throw postPaperError('post-paper');
  const marks = raw.marks || [];
  if (marks.length > POST_MAX_MARKS) throw postPaperError();
  for (const item of marks) {
    if (!paperObject(item)) throw postPaperError('post-paper');
    if (item.kind === 'ink' && Array.isArray(item.points)) {
      points += item.points.length;
      if (item.points.length > POST_MAX_STROKE_POINTS || points > POST_MAX_POINTS) throw postPaperError();
    }
  }
  for (const item of marks) {
    if (item.kind === 'stamp' && POST_STAMPS.includes(item.stamp)) {
      const size = item.size == null ? .14 : coordinate(item.size);
      if (size <= 0 || size > 1) throw postPaperError('post-paper');
      paper.marks.push({ kind: 'stamp', stamp: item.stamp, x: coordinate(item.x), y: coordinate(item.y), size });
    } else if (item.kind === 'ink' && Array.isArray(item.points)) {
      if (!item.points.length) continue;
      if (item.width != null && ![.007, .022].includes(item.width)) throw postPaperError('post-paper');
      paper.marks.push({ kind: 'ink', color: POST_COLORS.includes(item.color) ? item.color : POST_COLORS[0], width: item.width === .022 ? .022 : .007, points: item.points.map(postPoint) });
    } else throw postPaperError('post-paper');
  }
  return paper;
}
export function newPostDraft(id = 'letter-1', situation = 'free') {
  const scene = postSituation(situation);
  return { id: validId(id).slice(0, 80), revision: 0, situation: scene.id, recipient: scene.recipient, destination: scene.destination, stage: 'make', stops: [], paper: normalizePostPaper(null), png: null };
}
export function validId(id) { return typeof id === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/.test(id) ? id : 'letter-1'; }
export function validPostPNG(png) { return typeof png === 'string' && png.length <= POST_MAX_PNG_CHARS && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(png) ? png : null; }
export function validPostTime(at) { return Number.isSafeInteger(at) && at > 0 && at <= 8640000000000000; }
export function normalizePostDraft(raw) {
  if (raw != null && !paperObject(raw)) throw postPaperError('post-paper');
  if (raw) supportedVersion(raw);
  const draft = newPostDraft(raw?.id, raw?.situation);
  if (!raw || typeof raw !== 'object') return draft;
  Object.assign(draft, messageDayFields(raw));
  draft.revision = Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0;
  if (POST_RECIPIENTS.some(p => p.id === raw.recipient)) draft.recipient = raw.recipient;
  if (POST_PLACES.some(p => p.id === raw.destination)) draft.destination = raw.destination;
  draft.paper = normalizePostPaper(raw.paper); draft.png = validPostPNG(raw.png);
  draft.stops = (Array.isArray(raw.stops) ? raw.stops : []).filter(id => POST_PLACES.some(p => p.id === id)).slice(-POST_MAX_STOPS);
  if (['folded', 'delivered'].includes(raw.stage) && draft.png) draft.stage = raw.stage;
  return draft;
}
export function postPaperHasContent(paper) { return normalizePostPaper(paper).marks.length > 0; }
export function applyPostAction(raw, action = {}) {
  const draft = normalizePostDraft(raw);
  if (action.type === 'unfold') { draft.stage = 'make'; draft.png = null; draft.stops = []; return draft; }
  if (draft.stage === 'delivered') return draft;
  if (action.type === 'visit' && draft.stage === 'folded' && POST_PLACES.some(p => p.id === action.place) && draft.stops.at(-1) !== action.place) { draft.stops.push(action.place); draft.stops = draft.stops.slice(-POST_MAX_STOPS); }
  if (action.type === 'fold' && draft.stage === 'make' && postPaperHasContent(draft.paper) && validPostPNG(action.png)) { draft.png = action.png; draft.stage = 'folded'; draft.stops = []; }
  if (draft.stage !== 'make') return draft;
  if (action.type === 'message-day-use') {
    const day = chooseMessageDayUse(draft.messageDay, action.use);
    if (day.use !== draft.messageDay.use) draft.revision++;
    draft.messageDay = day; return draft;
  }
  let edited = false;
  if (action.type === 'recipient' && POST_RECIPIENTS.some(p => p.id === action.recipient) && draft.recipient !== action.recipient) { draft.recipient = action.recipient; edited = true; }
  if (action.type === 'destination' && POST_PLACES.some(p => p.id === action.destination) && draft.destination !== action.destination) { draft.destination = action.destination; edited = true; }
  if (action.type === 'mark') {
    const normalized = normalizePostPaper({ marks: [action.mark] });
    if (normalized.marks.length) { draft.paper = normalizePostPaper({ ...draft.paper, marks: [...draft.paper.marks, normalized.marks[0]] }); edited = true; }
  }
  if (action.type === 'undo' && draft.paper.marks.length) { draft.paper.marks.pop(); edited = true; }
  if (edited) { draft.revision++; draft.png = null; draft.stops = []; }
  return draft;
}
export function postCanDeliver(raw) { const draft = normalizePostDraft(raw); return draft.stage === 'folded' && !!draft.png && postPaperHasContent(draft.paper) && draft.stops.at(-1) === draft.destination; }
export function postDeliverySnapshot(raw, at = Date.now()) {
  const draft = normalizePostDraft(raw);
  if (!postCanDeliver(draft) || !validPostTime(at)) return null;
  return { id: `${draft.id}:${draft.revision}`, draftId: draft.id, revision: draft.revision, situation: draft.situation, recipient: draft.recipient, destination: draft.destination, stops: draft.stops.slice(), paper: clone(draft.paper), png: draft.png, at: Math.round(at), opened: false, reply: postSituation(draft.situation).reply.slice(), ...messageDayFields(draft) };
}
export function picturePostSource(message) {
  const day = messageDayFields(message);
  if (!message?.id || !validPostPNG(message.png)) return null;
  return { id: `picture-post:${validId(message.id)}`, kind: 'picture-post', sourceRoute: 'picture-post', png: message.png, document: normalizePostPaper(message.paper), recipient: postRecipient(message.recipient).id, situation: postSituation(message.situation).id, destination: POST_PLACES.some(place => place.id === message.destination) ? message.destination : postSituation(message.situation).destination, at: message.at, ...day };
}
