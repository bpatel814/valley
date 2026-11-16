// adaptive.js - how the guide fades and which letter comes next. Pure functions, no DOM,
// no storage: js/state/progress.js owns the letter states, this file only transforms them.
//
// Two ideas, both from docs/GAME_DESIGN.md:
//
//  1. The guide fades on her terms. Three results in a row at tier 2 or better and the
//     guide thins by one level; two results in a row at tier 1 or worse and it silently
//     thickens again. She is never told either thing happened.
//  2. Letters come back when they are shaky or stale: due = misses * 2 - streak +
//     daysSinceSeen. The letters of her name are seeded first on a fresh install, because
//     the first thing a three-year-old wants to write is her own name.
//
// `streak` is SIGNED: positive is a run of tier >= 2, negative is a run of tier <= 1.
// That keeps the whole adaptive state inside the schema fields the progress store already
// has (fed, level, streak, misses, attempts, hatched, lastSeen) and makes `due` read the
// way the design doc writes it.

export const FED_BY_TIER = { 0: 0, 1: 0.12, 2: 0.25, 3: 0.34 };
export const NAME_SEED = ["R", "A", "Y", "N"];
const LEVEL_UP_RUN = 3;      // consecutive tier >= 2 needed to thin the guide
const LEVEL_DOWN_RUN = 2;    // consecutive tier <= 1 before it comes back
const MAX_LEVEL = 4;
const DAY_MS = 86400000;

/** A blank letter, matching the progress schema. */
export function newLetterState() {
  return { fed: 0, level: 0, streak: 0, misses: 0, attempts: 0, hatched: false, lastSeen: 0 };
}

/**
 * applyResult(state, tier, nowMs) -> new state (the input is never mutated).
 *
 * A hatch is detectable without an extra field: fed only ever grows, except on the result
 * that fills it, so `next.fed < prev.fed` means "a butterfly just hatched". `hatched`
 * stays true forever after the first one; the next butterfly starts from fed 0.
 */
export function applyResult(state, tier, nowMs = 0) {
  const st = { ...newLetterState(), ...(state || {}) };
  const t = Math.max(0, Math.min(3, Math.round(tier || 0)));
  const good = t >= 2;

  const next = {
    fed: st.fed,
    level: st.level,
    streak: good ? (st.streak > 0 ? st.streak + 1 : 1) : (st.streak < 0 ? st.streak - 1 : -1),
    misses: st.misses + (good ? 0 : 1),
    attempts: st.attempts + 1,
    hatched: st.hatched,
    lastSeen: nowMs,
  };

  // feeding
  next.fed = st.fed + (FED_BY_TIER[t] || 0);
  if (next.fed >= 1) {
    next.fed = 0;          // the caterpillar becomes a butterfly and a new one starts
    next.hatched = true;
  }

  // the fade. Level only ever moves one step, and only on the result that completes a run,
  // so reaching level 4 always means level 3 was held for three good traces.
  if (good) {
    if (next.streak % LEVEL_UP_RUN === 0) next.level = Math.min(MAX_LEVEL, st.level + 1);
  } else if ((-next.streak) % LEVEL_DOWN_RUN === 0) {
    next.level = Math.max(0, st.level - 1);
  }

  return next;
}

/** due = misses * 2 - streak + daysSinceSeen. Higher means "she needs this one". */
export function dueOf(state, nowMs = 0) {
  const st = state || newLetterState();
  const seen = st.lastSeen || 0;
  const days = seen ? Math.max(0, (nowMs - seen) / DAY_MS) : 0;
  return (st.misses || 0) * 2 - (st.streak || 0) + days;
}

const seenBefore = (st) => !!st && ((st.attempts || 0) > 0 || (st.lastSeen || 0) > 0);

/**
 * pickNext(pool, states, lastChar, nowMs) -> char
 *
 * Order: unseen letters of her name first (R, A, Y, N, in that order), then everything
 * else by due, ties broken by fewest attempts, then by the pool's own order so the result
 * is the same every time for the same inputs. Never the letter she just did, unless the
 * pool has only one letter in it.
 */
export function pickNext(pool, states = {}, lastChar = null, nowMs = 0) {
  const list = (pool || []).filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];

  const candidates = list.filter((c) => c !== lastChar);
  const use = candidates.length ? candidates : list;

  let best = use[0];
  let bestKey = keyFor(best, states, nowMs, list);
  for (let i = 1; i < use.length; i++) {
    const k = keyFor(use[i], states, nowMs, list);
    if (better(k, bestKey)) { best = use[i]; bestKey = k; }
  }
  return best;
}

function keyFor(ch, states, nowMs, pool) {
  const st = states ? states[ch] : null;
  const nameRank = seenBefore(st) ? -1 : NAME_SEED.indexOf(ch);
  return {
    name: nameRank,                       // 0..3 for an unseen name letter, -1 otherwise
    due: dueOf(st, nowMs),
    attempts: st ? st.attempts || 0 : 0,
    order: pool.indexOf(ch),
  };
}

function better(a, b) {
  const aName = a.name >= 0, bName = b.name >= 0;
  if (aName !== bName) return aName;                 // her name outranks everything
  if (aName && bName) return a.name < b.name;        // R, then A, then Y, then N
  if (a.due !== b.due) return a.due > b.due;         // the shakiest or stalest first
  if (a.attempts !== b.attempts) return a.attempts < b.attempts;
  return a.order < b.order;
}

export default { applyResult, pickNext, dueOf, newLetterState, FED_BY_TIER, NAME_SEED };
