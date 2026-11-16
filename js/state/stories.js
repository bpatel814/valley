// Local authored story paths. Each story keeps its own unfinished choices.
import db from "./db.js";
import { getStory, choiceAt, endingPhrase, storyPath } from "../data/stories.js";
export const STORIES_KEY = "stories.v1";
export const STORIES_VERSION = 1;
export const MAX_STORY_CARDS = 1000;
export const MAX_STORY_BYTES = 64 * 1024 * 1024;
const blank = () => ({ version: STORIES_VERSION, draft: null, drafts: {}, book: [], replayCounts: {}, lastStoryId: null });
let state = blank(), loaded = false, loading = null, writeTail = Promise.resolve();
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
const safeTime = (value, fallback = 0) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
const safeId = (value, max = 120) => String(value || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, max);
const failure = code => Object.assign(new Error(code === 'story-capacity' ? 'The story shelf is full. Earlier stories and this path were kept.' : 'This story could not be saved. Its choices are still here.'), { code });
function normaliseChoices(story, raw) {
  const out = [];
  if (!story || !Array.isArray(raw)) return out;
  for (let i = 0; i < Math.min(raw.length, story.encounters.length); i++) {
    const id = safeId(raw[i], 60); if (!choiceAt(story, i, id)) break; out.push(id);
  }
  return out;
}
function normaliseDraft(raw) {
  const story = getStory(raw?.storyId); if (!story) return null;
  const choices = normaliseChoices(story, raw.choices);
  return { storyId: story.id, choices, step: choices.length, startedAt: safeTime(raw.startedAt), updatedAt: safeTime(raw.updatedAt) };
}
export function normaliseStoryState(raw) {
  const next = blank();
  if (!raw || typeof raw !== 'object') return next;
  if (raw.version != null && raw.version !== STORIES_VERSION) throw failure('story-version');
  for (const [key, value] of Object.entries(raw.drafts || {})) {
    const draft = normaliseDraft(value); if (draft && draft.storyId === key) next.drafts[key] = draft;
  }
  const active = normaliseDraft(raw.draft);
  if (active) {
    const existing = next.drafts[active.storyId];
    if (!existing || active.updatedAt >= existing.updatedAt) next.drafts[active.storyId] = active;
    next.draft = copy(next.drafts[active.storyId]);
  }
  const seen = new Set();
  for (const row of Array.isArray(raw.book) ? raw.book : []) {
    const story = getStory(row?.storyId), choices = normaliseChoices(story, row?.choices), id = safeId(row?.id, 160);
    if (!story || choices.length !== story.encounters.length || !id || seen.has(id)) continue;
    seen.add(id); next.book.push({ id, storyId: story.id, choices, path: storyPath(story, choices), endingKey: endingPhrase(story, choices), createdAt: safeTime(row.createdAt) });
  }
  if (next.book.length > MAX_STORY_CARDS) throw failure('story-capacity');
  if (raw.replayCounts && typeof raw.replayCounts === 'object') for (const [id, count] of Object.entries(raw.replayCounts)) {
    if (getStory(id)) next.replayCounts[id] = Math.max(0, Math.min(999, Number(count) | 0));
  }
  next.lastStoryId = getStory(raw.lastStoryId) ? raw.lastStoryId : null;
  if (new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_STORY_BYTES) throw failure('story-capacity');
  return next;
}
// Never silently drop a kept card or unfinished choice when opening a shelf.
// The permissive normalizer remains useful for explicit import previews.
export function requireStoredStoryState(raw) {
  if (raw == null) return normaliseStoryState(null);
  const bad = () => { throw Object.assign(new Error("This storybook contains saved work this version cannot safely open."), { code: "story-invalid" }); };
  if (typeof raw !== "object" || Array.isArray(raw)) bad();
  if (raw.version != null && raw.version !== STORIES_VERSION) throw failure("story-version");
  const validChoices = (story, choices, complete = false) => {
    if (!story || !Array.isArray(choices)) return false;
    const clean = normaliseChoices(story, choices);
    return clean.length === choices.length && (!complete || clean.length === story.encounters.length)
      && clean.every((choice, i) => choice === choices[i]);
  };
  const validDraft = (draft, key = null) => {
    const story = getStory(draft?.storyId);
    return !!story && (!key || key === story.id) && validChoices(story, draft.choices);
  };
  if (raw.draft != null && !validDraft(raw.draft)) bad();
  if (raw.drafts != null) {
    if (typeof raw.drafts !== "object" || Array.isArray(raw.drafts)) bad();
    for (const [key, draft] of Object.entries(raw.drafts)) if (!validDraft(draft, key)) bad();
  }
  if (raw.book != null) {
    if (!Array.isArray(raw.book)) bad();
    const ids = new Set();
    for (const row of raw.book) {
      if (!row || !validChoices(getStory(row.storyId), row.choices, true) || !row.id || safeId(row.id, 160) !== row.id || ids.has(row.id)) bad();
      ids.add(row.id);
    }
  }
  if (raw.replayCounts != null) {
    if (typeof raw.replayCounts !== "object" || Array.isArray(raw.replayCounts)) bad();
    for (const [id, count] of Object.entries(raw.replayCounts)) if (!getStory(id) || !Number.isInteger(count) || count < 0 || count > 999) bad();
  }
  if (raw.lastStoryId != null && !getStory(raw.lastStoryId)) bad();
  return normaliseStoryState(raw);
}

function enqueue(work) {
  const next = writeTail.then(work, work); writeTail = next;
  void next.catch(() => {}); return next;
}
function persist() {
  const snapshot = normaliseStoryState(state);
  return enqueue(async () => { try { await db.put('kv', STORIES_KEY, snapshot); return copy(snapshot); }
    catch (cause) { const error = failure(cause?.code === 'story-capacity' ? cause.code : 'story-write'); error.cause = cause; throw error; } });
}
export async function load({ force = false } = {}) {
  if (loaded && !force) return get();
  if (!loading) loading = (async () => { await writeTail.catch(() => {}); const next = requireStoredStoryState(await db.getStrict('kv', STORIES_KEY)); state = next; loaded = true; return get(); })();
  try { return await loading; } finally { loading = null; }
}
export function get() { return copy(state); }
function activate(draft) { state = { ...state, draft: copy(draft), ...(draft ? { drafts: { ...state.drafts, [draft.storyId]: copy(draft) }, lastStoryId: draft.storyId } : {}) }; }
export async function beginStory(storyId, { fresh = false, at = Date.now() } = {}) {
  await load(); const story = getStory(storyId); if (!story) return null;
  if (!fresh && state.drafts[story.id]) { activate(state.drafts[story.id]); await persist(); return copy(state.draft); }
  if (fresh) state = { ...state, replayCounts: { ...state.replayCounts, [story.id]: Math.min(999, (state.replayCounts[story.id] || 0) + 1) } };
  activate({ storyId: story.id, choices: [], step: 0, startedAt: safeTime(at), updatedAt: safeTime(at) });
  await persist(); return copy(state.draft);
}
export async function recordStoryChoice(storyId, choiceId, { at = Date.now() } = {}) {
  await load(); const story = getStory(storyId); if (!story || state.draft?.storyId !== story.id) return null;
  const index = state.draft.choices.length, chosen = choiceAt(story, index, choiceId); if (!chosen || index >= story.encounters.length) return null;
  activate({ ...state.draft, choices: [...state.draft.choices, chosen.id], step: index + 1, updatedAt: safeTime(at) });
  await persist(); return copy(state.draft);
}
function makeCardId(storyId, at) {
  const nonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `story:${storyId}:${at}:${nonce}`;
}
export async function finishStory(storyId, { at = Date.now() } = {}) {
  await load(); const story = getStory(storyId); if (!story || state.draft?.storyId !== story.id) return null;
  const choices = normaliseChoices(story, state.draft.choices); if (choices.length !== story.encounters.length) return null;
  if (state.book.length >= MAX_STORY_CARDS) throw failure('story-capacity');
  const when = safeTime(at, Date.now()), card = { id: makeCardId(story.id, when), storyId: story.id, choices, path: storyPath(story, choices), endingKey: endingPhrase(story, choices), createdAt: when };
  const candidate = normaliseStoryState({ ...state, book: [card, ...state.book], draft: null, drafts: Object.fromEntries(Object.entries(state.drafts).filter(([id]) => id !== story.id)), lastStoryId: story.id });
  const before = state; state = candidate;
  try { await persist(); return copy(card); }
  catch (error) {
    if (state === candidate) state = before;
    else {
      const drafts = { ...state.drafts }; if (!drafts[story.id]) drafts[story.id] = copy(before.drafts[story.id]);
      state = { ...state, book: state.book.filter(row => row.id !== card.id), drafts,
        draft: !state.draft && state.lastStoryId === story.id ? copy(drafts[story.id]) : state.draft };
    }
    // A later queued snapshot may include the refused card. Correct it without
    // dropping newer choices in another story or replacing a later active path.
    void persist().catch(() => {}); throw error;
  }
}
export async function reviseStoryCard(cardId, fromIndex = 2, { at = Date.now() } = {}) {
  await load(); const card = state.book.find(row => row.id === safeId(cardId, 160)), story = card && getStory(card.storyId);
  const cut = Math.max(0, Math.min(story?.encounters.length - 1 || 0, Number(fromIndex) | 0)); if (!story || !card || cut >= card.choices.length) return null;
  const choices = normaliseChoices(story, card.choices).slice(0, cut); if (choices.length !== cut) return null;
  const when = safeTime(at, Date.now()); activate({ storyId: story.id, choices, step: choices.length, startedAt: when, updatedAt: when });
  await persist(); return copy(state.draft);
}
export async function clearDraft(storyId = null) {
  await load(); const id = storyId || state.draft?.storyId; if (!id || !state.drafts[id]) return false;
  state = { ...state, drafts: Object.fromEntries(Object.entries(state.drafts).filter(([key]) => key !== id)), draft: state.draft?.storyId === id ? null : state.draft }; await persist(); return true;
}
export async function removeStoryCard(cardId) {
  await load(); const before = state.book.length; state = { ...state, book: state.book.filter(card => card.id !== cardId) };
  if (state.book.length === before) return false; await persist(); return true;
}
export async function checkpointStories() { await load(); await persist(); return { persistent: db.status().persistent }; }
export function flushStoryWrites() { return writeTail; }
export async function resetStories() {
  await writeTail.catch(() => {}); state = blank(); loaded = true; loading = null;
  await enqueue(() => db.del('kv', STORIES_KEY)); return get();
}
export const storiesState = { load, get, beginStory, recordStoryChoice, finishStory, reviseStoryCard, clearDraft, removeStoryCard,
  resetStories, checkpointStories, flushStoryWrites, normaliseStoryState };
export default storiesState;
