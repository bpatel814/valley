// Discovery Glade content and pure mission rules.
//
// These missions record visits and local drafts only. They deliberately avoid a
// score, rank, timer, or mastery label. A descriptive response can name a mismatch
// without treating it as a win, and every mission always remains replayable.

const option = (id, picture, phraseKey, extra = {}) => ({ id, picture, phraseKey, ...extra });
const variant = (id, promptKey, scene, options, extra = {}) => ({ id, promptKey, scene, options, ...extra });

export const DISCOVERY_FAMILIES = Object.freeze({
  shape: { id: "shape", label: "Shapes and places", hue: "mint" },
  sort: { id: "sort", label: "Matching and comparing", hue: "sky" },
  quantity: { id: "quantity", label: "Small sets and patterns", hue: "peach" },
});

export const DISCOVERY_MISSIONS = Object.freeze([
  {
    id: "shape-fit", family: "shape", verb: "fit", kind: "choice", icon: "bridge",
    introKey: "discovery_fit_intro", demoKey: "discovery_fit_demo", successKey: "discovery_fit_success",
    variations: [
      variant("bridge-gap", "discovery_fit_bridge", "bridge", [
        option("round", "circle", "discovery_fit_round"),
        option("plank", "rectangle", "discovery_fit_plank", { correct: true }),
        option("point", "triangle", "discovery_fit_point"),
      ], { target: "gap" }),
      variant("bird-window", "discovery_fit_window", "birdhouse", [
        option("square", "square", "discovery_fit_square"),
        option("round", "circle", "discovery_fit_round", { correct: true }),
        option("point", "triangle", "discovery_fit_point"),
      ], { target: "window" }),
      variant("kite-patch", "discovery_fit_kite", "kite", [
        option("long", "rectangle", "discovery_fit_plank"),
        option("round", "circle", "discovery_fit_round"),
        option("point", "triangle", "discovery_fit_point", { correct: true }),
      ], { target: "patch" }),
    ],
  },
  {
    id: "shape-build", family: "shape", verb: "build", kind: "build", icon: "tower",
    introKey: "discovery_build_intro", demoKey: "discovery_build_demo", successKey: "discovery_build_success",
    variations: [
      variant("tower", "discovery_build_tower", "tower", [
        option("round", "circle", "discovery_build_round"),
        option("block", "square", "discovery_build_block"),
        option("roof", "triangle", "discovery_build_roof"),
      ], { mode: "structure", minParts: 2, required: { block: 1 }, readyKey: "discovery_build_tower_ready", needKey: "discovery_build_tower_need", maxParts: 9 }),
      variant("boat", "discovery_build_boat", "boat", [
        option("sail", "boat-sail", "discovery_build_sail"),
        option("window", "boat-window", "discovery_build_window"),
        option("hull", "boat-hull", "discovery_build_hull"),
      ], { mode: "structure", minParts: 2, required: { hull: 1, sail: 1 }, readyKey: "discovery_build_boat_ready", needKey: "discovery_build_boat_need", maxParts: 9 }),
      variant("garden", "discovery_build_garden", "flower-bed", [
        option("petal", "circle", "discovery_build_petal"),
        option("leaf", "leaf", "discovery_build_leaf"),
        option("stone", "oval", "discovery_build_stone"),
      ], { mode: "open", minParts: 1, required: {}, readyKey: "discovery_build_garden_ready", maxParts: 9 }),
    ],
  },
  {
    id: "shape-roll", family: "shape", verb: "test", kind: "compare", icon: "slope",
    introKey: "discovery_roll_intro", demoKey: "discovery_roll_demo", successKey: "discovery_roll_success",
    variations: [
      variant("hill", "discovery_roll_hill", "hill", [
        option("ball", "circle", "discovery_roll_ball", { motion: "roll", readyPhraseKey: "discovery_roll_ball_ready" }),
        option("box", "square", "discovery_roll_box", { motion: "stop", readyPhraseKey: "discovery_roll_box_ready" }),
        option("roof", "triangle", "discovery_roll_point", { motion: "tip", readyPhraseKey: "discovery_roll_point_ready" }),
      ]),
      variant("ramp", "discovery_roll_ramp", "ramp", [
        option("wheel", "ring", "discovery_roll_ball", { motion: "roll", readyPhraseKey: "discovery_roll_ball_ready" }),
        option("book", "rectangle", "discovery_roll_box", { motion: "slide", readyPhraseKey: "discovery_roll_box_ready" }),
        option("star", "star", "discovery_roll_point", { motion: "tip", readyPhraseKey: "discovery_roll_point_ready" }),
      ]),
      variant("log", "discovery_roll_log", "log-hill", [
        option("orange", "circle", "discovery_roll_ball", { motion: "roll", readyPhraseKey: "discovery_roll_ball_ready" }),
        option("gift", "square", "discovery_roll_box", { motion: "stop", readyPhraseKey: "discovery_roll_box_ready" }),
        option("cone", "triangle", "discovery_roll_point", { motion: "tip", readyPhraseKey: "discovery_roll_point_ready" }),
      ]),
    ],
  },
  {
    id: "shape-place", family: "shape", verb: "place", kind: "choice", icon: "rainbow",
    introKey: "discovery_place_intro", demoKey: "discovery_place_demo", successKey: "discovery_place_success",
    variations: [
      variant("under", "discovery_place_under", "rainbow", [
        option("on", "pip-on", "discovery_place_on"),
        option("under", "pip-under", "discovery_place_under_named", { correct: true }),
        option("beside", "pip-beside", "discovery_place_beside"),
      ]),
      variant("on", "discovery_place_on_prompt", "bridge", [
        option("under", "pip-under", "discovery_place_under_named"),
        option("on", "pip-on", "discovery_place_on", { correct: true }),
        option("beside", "pip-beside", "discovery_place_beside"),
      ]),
      variant("beside", "discovery_place_beside_prompt", "tree", [
        option("beside", "pip-beside", "discovery_place_beside", { correct: true }),
        option("on", "pip-on", "discovery_place_on"),
        option("under", "pip-under", "discovery_place_under_named"),
      ]),
    ],
  },
  {
    id: "sort-color", family: "sort", verb: "sort", kind: "sort", icon: "baskets",
    introKey: "discovery_sort_intro", demoKey: "discovery_sort_demo", successKey: "discovery_sort_success",
    variations: [
      variant("berries", "discovery_sort_berries", "picnic", [], {
        targets: [option("pink", "basket-pink", "discovery_sort_pink"), option("blue", "basket-blue", "discovery_sort_blue")],
        pieces: [option("berry-1", "berry-pink", "", { target: "pink" }), option("berry-2", "berry-blue", "", { target: "blue" }), option("berry-3", "berry-pink", "", { target: "pink" }), option("berry-4", "berry-blue", "", { target: "blue" })],
      }),
      variant("leaves", "discovery_sort_leaves", "leaf-table", [], {
        targets: [option("gold", "basket-gold", "discovery_sort_gold"), option("green", "basket-green", "discovery_sort_green")],
        pieces: [option("leaf-1", "leaf-gold", "", { target: "gold" }), option("leaf-2", "leaf-green", "", { target: "green" }), option("leaf-3", "leaf-green", "", { target: "green" }), option("leaf-4", "leaf-gold", "", { target: "gold" })],
      }),
      variant("buttons", "discovery_sort_buttons", "sewing-table", [], {
        targets: [option("round", "basket-round", "discovery_sort_round"), option("pointy", "basket-pointy", "discovery_sort_pointy")],
        pieces: [option("button-1", "circle", "", { target: "round" }), option("button-2", "star", "", { target: "pointy" }), option("button-3", "circle", "", { target: "round" }), option("button-4", "triangle", "", { target: "pointy" })],
      }),
    ],
  },
  {
    id: "sort-shadow", family: "sort", verb: "match", kind: "choice", icon: "shadow",
    introKey: "discovery_match_intro", demoKey: "discovery_match_demo", successKey: "discovery_match_success",
    variations: [
      variant("leaf", "discovery_match_leaf", "shadow-leaf", [option("leaf", "leaf", "discovery_match_leaf_named", { correct: true }), option("star", "star", "discovery_match_star"), option("round", "circle", "discovery_match_round")]),
      variant("star", "discovery_match_star_prompt", "shadow-star", [option("round", "circle", "discovery_match_round"), option("star", "star", "discovery_match_star", { correct: true }), option("leaf", "leaf", "discovery_match_leaf_named")]),
      variant("boot", "discovery_match_boot", "shadow-boot", [option("boot", "boot", "discovery_match_boot_named", { correct: true }), option("mitten", "mitten", "discovery_match_mitten"), option("leaf", "leaf", "discovery_match_leaf_named")]),
    ],
  },
  {
    id: "sort-size", family: "sort", verb: "compare", kind: "size", icon: "beds",
    introKey: "discovery_size_intro", demoKey: "discovery_size_demo", successKey: "discovery_size_success",
    variations: [
      variant("small-bed", "discovery_size_small", "sleepy-bug", [option("tiny", "bed-small", "discovery_size_tiny"), option("middle", "bed-medium", "discovery_size_middle"), option("big", "bed-big", "discovery_size_big")]),
      variant("big-umbrella", "discovery_size_big_prompt", "rainy-friends", [option("tiny", "umbrella-small", "discovery_size_tiny"), option("middle", "umbrella-medium", "discovery_size_middle"), option("big", "umbrella-big", "discovery_size_big")]),
      variant("medium-bowl", "discovery_size_middle_prompt", "three-berries", [option("big", "bowl-big", "discovery_size_big"), option("middle", "bowl-medium", "discovery_size_middle"), option("tiny", "bowl-small", "discovery_size_tiny")]),
    ],
  },
  {
    id: "sort-pair", family: "sort", verb: "pair", kind: "choice", icon: "patches",
    introKey: "discovery_pair_intro", demoKey: "discovery_pair_demo", successKey: "discovery_pair_success",
    variations: [
      variant("spots", "discovery_pair_spots", "coat-spots", [option("spots", "patch-spots", "discovery_pair_spots_named", { correct: true }), option("stripes", "patch-stripes", "discovery_pair_stripes"), option("waves", "patch-waves", "discovery_pair_waves")]),
      variant("stripes", "discovery_pair_stripes_prompt", "scarf-stripes", [option("waves", "patch-waves", "discovery_pair_waves"), option("spots", "patch-spots", "discovery_pair_spots_named"), option("stripes", "patch-stripes", "discovery_pair_stripes", { correct: true })]),
      variant("waves", "discovery_pair_waves_prompt", "blanket-waves", [option("stripes", "patch-stripes", "discovery_pair_stripes"), option("waves", "patch-waves", "discovery_pair_waves", { correct: true }), option("spots", "patch-spots", "discovery_pair_spots_named")]),
    ],
  },
  {
    id: "quantity-count", family: "quantity", verb: "count", kind: "count", icon: "flowers",
    introKey: "discovery_count_intro", demoKey: "discovery_count_demo", successKey: "discovery_count_success",
    variations: [
      variant("three-flowers", "discovery_count_three", "flower-pots", [option("pink", "flower-pink", "discovery_count_added"), option("yellow", "flower-yellow", "discovery_count_added"), option("blue", "flower-blue", "discovery_count_added")], { goal: 3, countKeys: ["discovery_count_flower_one", "discovery_count_flower_two", "discovery_count_flower_three"] }),
      variant("four-stars", "discovery_count_four", "night-sky", [option("yellow", "star-yellow", "discovery_count_added"), option("pink", "star-pink", "discovery_count_added"), option("blue", "star-blue", "discovery_count_added")], { goal: 4, countKeys: ["discovery_count_star_one", "discovery_count_star_two", "discovery_count_star_three", "discovery_count_star_four"] }),
      variant("five-drops", "discovery_count_five", "rain-cloud", [option("blue", "drop-blue", "discovery_count_added"), option("pink", "drop-pink", "discovery_count_added"), option("yellow", "drop-yellow", "discovery_count_added")], { goal: 5, countKeys: ["discovery_count_drop_one", "discovery_count_drop_two", "discovery_count_drop_three", "discovery_count_drop_four", "discovery_count_drop_five"] }),
    ],
  },
  {
    id: "quantity-share", family: "quantity", verb: "share", kind: "share", icon: "friends",
    introKey: "discovery_share_intro", demoKey: "discovery_share_demo", successKey: "discovery_share_success",
    variations: [
      variant("four-berries", "discovery_share_berries", "two-friends", [], { total: 4, piece: "berry-pink", targets: [option("pip", "friend-pip", "discovery_share_pip"), option("cat", "friend-cat", "discovery_share_cat")] }),
      variant("two-cookies", "discovery_share_cookies", "tea-party", [], { total: 2, piece: "cookie", targets: [option("pip", "friend-pip", "discovery_share_pip"), option("uni", "friend-unicorn", "discovery_share_unicorn")] }),
      variant("four-leaves", "discovery_share_leaves", "leaf-lunch", [], { total: 4, piece: "leaf-green", targets: [option("cat", "friend-cat", "discovery_share_cat"), option("uni", "friend-unicorn", "discovery_share_unicorn")] }),
    ],
  },
  {
    id: "quantity-pattern", family: "quantity", verb: "continue", kind: "choice", icon: "pattern",
    introKey: "discovery_pattern_intro", demoKey: "discovery_pattern_demo", successKey: "discovery_pattern_success",
    variations: [
      variant("sun-rain", "discovery_pattern_next", "pattern-sun-rain", [option("sun", "sun", "discovery_pattern_sun", { correct: true }), option("rain", "drop-blue", "discovery_pattern_rain"), option("flower", "flower-pink", "discovery_pattern_flower")], { pattern: ["sun", "drop-blue", "sun", "drop-blue"] }),
      variant("leaf-leaf-star", "discovery_pattern_next", "pattern-leaf-star", [option("star", "star-yellow", "discovery_pattern_star"), option("leaf", "leaf-green", "discovery_pattern_leaf", { correct: true }), option("flower", "flower-blue", "discovery_pattern_flower")], { pattern: ["leaf-green", "leaf-green", "star-yellow", "leaf-green", "leaf-green", "star-yellow"] }),
      variant("pink-blue", "discovery_pattern_next", "pattern-pink-blue", [option("blue", "circle-blue", "discovery_pattern_blue", { correct: true }), option("pink", "circle-pink", "discovery_pattern_pink"), option("yellow", "circle-yellow", "discovery_pattern_yellow")], { pattern: ["circle-pink", "circle-blue", "circle-pink", "circle-blue", "circle-pink"] }),
    ],
  },
  {
    id: "quantity-one-more", family: "quantity", verb: "add-one", kind: "choice", icon: "more",
    introKey: "discovery_more_intro", demoKey: "discovery_more_demo", successKey: "discovery_more_success",
    variations: [
      variant("two-to-three", "discovery_more_prompt", "two-apples", [option("two", "set-2", "discovery_more_two"), option("three", "set-3", "discovery_more_three", { correct: true }), option("four", "set-4", "discovery_more_four")], { start: 2, answer: 3 }),
      variant("three-to-four", "discovery_more_prompt", "three-leaves", [option("five", "set-5", "discovery_more_five"), option("four", "set-4", "discovery_more_four", { correct: true }), option("three", "set-3", "discovery_more_three")], { start: 3, answer: 4 }),
      variant("one-to-two", "discovery_more_prompt", "one-star", [option("one", "set-1", "discovery_more_one"), option("three", "set-3", "discovery_more_three"), option("two", "set-2", "discovery_more_two", { correct: true })], { start: 1, answer: 2 }),
    ],
  },
]);

const BY_ID = new Map(DISCOVERY_MISSIONS.map((mission) => [mission.id, mission]));

export function discoveryMission(id) {
  return BY_ID.get(String(id || "")) || null;
}

export function discoveryVariation(missionOrId, id) {
  const mission = typeof missionOrId === "string" ? discoveryMission(missionOrId) : missionOrId;
  if (!mission) return null;
  return mission.variations.find((entry) => entry.id === id) || null;
}

// Widths are logical pixels in the 360 x 300 size stage. Bowl width is its
// usable inner width; three 36 px berries with two 6 px gaps span 120 px.
const SIZE_TRIALS = Object.freeze({
  "small-bed": Object.freeze({
    tiny: { subject: "bed", width: 160, subjectWidth: 60, relation: "snug", phraseKey: "discovery_size_bed_snug" },
    middle: { subject: "bed", width: 220, subjectWidth: 60, relation: "roomy", phraseKey: "discovery_size_bed_roomy" },
    big: { subject: "bed", width: 280, subjectWidth: 60, relation: "roomy", phraseKey: "discovery_size_bed_roomy" },
  }),
  "big-umbrella": Object.freeze({
    tiny: { subject: "umbrella", width: 100, subjectWidth: 216, relation: "uncovered", phraseKey: "discovery_size_rain_outside" },
    middle: { subject: "umbrella", width: 168, subjectWidth: 216, relation: "uncovered", phraseKey: "discovery_size_rain_outside" },
    big: { subject: "umbrella", width: 264, subjectWidth: 216, relation: "covered", phraseKey: "discovery_size_rain_covered" },
  }),
  "medium-bowl": Object.freeze({
    tiny: { subject: "bowl", width: 72, subjectWidth: 120, relation: "overflow", phraseKey: "discovery_size_berries_outside" },
    middle: { subject: "bowl", width: 150, subjectWidth: 120, relation: "snug", phraseKey: "discovery_size_berries_fit" },
    big: { subject: "bowl", width: 232, subjectWidth: 120, relation: "roomy", phraseKey: "discovery_size_berries_roomy" },
  }),
});

export function discoverySizeTrial(variationOrId, optionId) {
  const id = typeof variationOrId === "string" ? variationOrId : variationOrId?.id;
  const trial = SIZE_TRIALS[id]?.[optionId];
  return trial ? { ...trial } : null;
}

export function missionOptions(mission, variation) {
  if (!mission || !variation) return [];
  if (mission.kind === "sort") return variation.pieces || [];
  if (mission.kind === "share") return Array.from({ length: variation.total || 0 }, (_, i) => option("share-" + i, variation.piece, ""));
  return variation.options || [];
}

function countParts(parts) {
  const counts = {};
  for (const id of parts || []) counts[id] = (counts[id] || 0) + 1;
  return counts;
}

export function buildIsReady(variation, built) {
  if (!variation) return false;
  const parts = Array.isArray(built) ? built : [];
  if (parts.length < Math.max(1, Number(variation.minParts) || 1)) return false;
  const counts = countParts(parts);
  return Object.entries(variation.required || {}).every(([id, needed]) => (counts[id] || 0) >= Math.max(1, Number(needed) || 1));
}

export function discoveryCanFinish(mission, variation, draft) {
  if (!mission || !variation || !draft) return false;
  if (mission.kind === "build") return buildIsReady(variation, draft.built);
  if (mission.kind === "compare" || mission.kind === "size") {
    const allowed = new Set((variation.options || []).map((entry) => entry.id));
    return new Set((draft.observed || []).filter((id) => allowed.has(id))).size >= 2;
  }
  return false;
}

export function discoveryCanLaunch(missionOrId, variationOrId, draft) {
  const mission = typeof missionOrId === "string" ? discoveryMission(missionOrId) : missionOrId;
  const variation = typeof variationOrId === "string"
    ? discoveryVariation(mission, variationOrId)
    : variationOrId;
  return !!(
    mission?.id === "shape-build" &&
    variation?.id === "boat" &&
    buildIsReady(variation, Array.isArray(draft?.built) ? draft.built : [])
  );
}

export function emptyDiscoveryDraft(missionId, variationId) {
  return {
    missionId,
    variationId,
    placements: {},
    built: [],
    made: [],
    observed: [],
    choice: null,
    completed: false,
  };
}

function boundedList(raw, allowed, max) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id) => allowed.has(id)).slice(0, max);
}

function uniqueBounded(raw, allowed, max) {
  const out = [];
  for (const id of Array.isArray(raw) ? raw : []) {
    if (!allowed.has(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeDiscoveryDraft(raw, fallbackMission, fallbackVariation) {
  const mission = discoveryMission(raw && raw.missionId) || discoveryMission(fallbackMission) || DISCOVERY_MISSIONS[0];
  const variation = discoveryVariation(mission, raw && raw.variationId) || discoveryVariation(mission, fallbackVariation) || mission.variations[0];
  const options = new Set(missionOptions(mission, variation).map((entry) => entry.id));
  const targetIds = new Set((variation.targets || []).map((entry) => entry.id));
  const placements = {};
  if (raw && raw.placements && typeof raw.placements === "object" && !Array.isArray(raw.placements)) {
    for (const [piece, target] of Object.entries(raw.placements)) {
      // Sorting only saves actual matches. Sharing deliberately preserves an
      // uneven arrangement so the child can move a piece and compare again.
      const matches = mission.kind !== "sort" || variation.pieces.some((entry) => entry.id === piece && entry.target === target);
      if (options.has(piece) && targetIds.has(target) && matches) placements[piece] = target;
    }
  }
  const draft = emptyDiscoveryDraft(mission.id, variation.id);
  draft.placements = placements;
  draft.built = boundedList(raw && raw.built, options, Math.max(1, variation.maxParts || 9));
  draft.made = boundedList(raw && raw.made, new Set((variation.options || []).map((entry) => entry.id)), Math.max(0, variation.goal || 5));
  draft.choice = options.has(raw && raw.choice) ? raw.choice : null;
  const priorObserved = [...(Array.isArray(raw && raw.observed) ? raw.observed : [])];
  if ((mission.kind === "compare" || mission.kind === "size") && draft.choice) priorObserved.push(draft.choice);
  draft.observed = uniqueBounded(priorObserved, options, Math.max(1, options.size));
  if (mission.kind === "compare") draft.choice = null;
  if (mission.kind === "choice") {
    const picked = variation.options.find((entry) => entry.id === draft.choice);
    draft.completed = !!(picked && picked.correct === true);
  } else if (mission.kind === "build") {
    draft.completed = raw?.completed === true && buildIsReady(variation, draft.built);
  } else if (mission.kind === "compare") {
    draft.completed = raw?.completed === true && discoveryCanFinish(mission, variation, draft);
  } else if (mission.kind === "size") {
    draft.completed = raw?.completed === true && discoveryCanFinish(mission, variation, draft);
  } else if (mission.kind === "count") {
    draft.completed = draft.made.length >= variation.goal;
  } else if (mission.kind === "sort") {
    draft.completed = variation.pieces.every((piece) => draft.placements[piece.id] === piece.target);
  } else if (mission.kind === "share") {
    const allPlaced = Object.keys(draft.placements).length === variation.total;
    const counts = variation.targets.map((target) => Object.values(draft.placements).filter((id) => id === target.id).length);
    draft.completed = allPlaced && counts.every((count) => count === counts[0]);
  }
  return draft;
}

export function applyDiscoveryAction(missionId, variationId, rawDraft, action) {
  const mission = discoveryMission(missionId);
  const variation = discoveryVariation(mission, variationId);
  if (!mission || !variation) return { draft: null, accepted: false, complete: false, phraseKey: null, consequence: "invalid" };
  // A resumed or stale view may hand us a draft from another activity. Never
  // carry its counts, choice, or completion into the requested mission.
  const sameActivity = (!rawDraft?.missionId || rawDraft.missionId === mission.id)
    && (!rawDraft?.variationId || rawDraft.variationId === variation.id);
  const draft = normalizeDiscoveryDraft(sameActivity ? rawDraft : null, mission.id, variation.id);
  if (draft.completed) return { draft, accepted: false, complete: true, phraseKey: mission.successKey, consequence: "already-complete" };
  if (!action || typeof action !== "object") return { draft, accepted: false, complete: false, phraseKey: null, consequence: "invalid" };
  const type = action && action.type;

  if (mission.kind === "choice") {
    const picked = variation.options.find((entry) => entry.id === action.optionId);
    if (type !== "choose" || !picked) return { draft, accepted: false, complete: false, phraseKey: null, consequence: "invalid" };
    draft.choice = picked.id;
    draft.completed = picked.correct === true;
    return { draft, accepted: true, complete: draft.completed, phraseKey: draft.completed ? mission.successKey : picked.phraseKey, consequence: picked.motion || (draft.completed ? "fit" : "notice") };
  }

  if (mission.kind === "build") {
    if (type === "finish") {
      const ready = buildIsReady(variation, draft.built);
      if (!ready) return { draft, accepted: false, complete: false, ready: false, phraseKey: variation.needKey || null, consequence: "keep-building" };
      draft.completed = true;
      return { draft, accepted: true, complete: true, ready: true, phraseKey: mission.successKey, consequence: "finish" };
    }
    if (type === "undo") {
      if (!draft.built.length) return { draft, accepted: false, complete: false, ready: false, phraseKey: null, consequence: "nothing-to-undo" };
      draft.built.pop();
      draft.completed = false;
      return { draft, accepted: true, complete: false, ready: buildIsReady(variation, draft.built), phraseKey: null, consequence: "undo" };
    }
    const picked = variation.options.find((entry) => entry.id === action.optionId);
    if (type !== "choose" || !picked) return { draft, accepted: false, complete: false, phraseKey: null, consequence: "invalid" };
    const wasReady = buildIsReady(variation, draft.built);
    const maxParts = Math.max(1, variation.maxParts || 9);
    if (draft.built.length >= maxParts) {
      return { draft, accepted: false, complete: false, ready: wasReady, phraseKey: null, consequence: "full" };
    }
    draft.built.push(picked.id);
    const ready = buildIsReady(variation, draft.built);
    const phraseKey = ready && !wasReady
      ? variation.readyKey
      : (!ready && draft.built.length >= 2 && variation.needKey ? variation.needKey : picked.phraseKey);
    draft.completed = false;
    return { draft, accepted: true, complete: false, ready, phraseKey, consequence: "build" };
  }

  if (mission.kind === "compare") {
    if (type === "finish") {
      const ready = discoveryCanFinish(mission, variation, draft);
      if (!ready) return { draft, accepted: false, complete: false, ready: false, phraseKey: null, consequence: "keep-testing" };
      draft.completed = true;
      return { draft, accepted: true, complete: true, ready: true, phraseKey: mission.successKey, consequence: "finish" };
    }
    const picked = variation.options.find((entry) => entry.id === action.optionId);
    if (type !== "choose" || !picked) return { draft, accepted: false, complete: false, phraseKey: null, consequence: "invalid" };
    const wasReady = discoveryCanFinish(mission, variation, draft);
    if (!draft.observed.includes(picked.id)) draft.observed.push(picked.id);
    draft.completed = false;
    const ready = discoveryCanFinish(mission, variation, draft);
    return {
      draft,
      accepted: true,
      complete: false,
      ready,
      phraseKey: ready && !wasReady ? (picked.readyPhraseKey || picked.phraseKey) : picked.phraseKey,
      consequence: picked.motion || "notice",
    };
  }

  if (mission.kind === "size") {
    if (type === "finish") {
      const ready = discoveryCanFinish(mission, variation, draft);
      if (!ready) return { draft, accepted: false, complete: false, ready: false, phraseKey: null, consequence: "keep-testing" };
      draft.completed = true;
      return { draft, accepted: true, complete: true, ready: true, phraseKey: mission.successKey, consequence: "finish" };
    }
    const trial = type === "choose" ? discoverySizeTrial(variation, action.optionId) : null;
    if (!trial) return { draft, accepted: false, complete: false, phraseKey: null, consequence: "invalid" };
    draft.choice = action.optionId;
    if (!draft.observed.includes(action.optionId)) draft.observed.push(action.optionId);
    draft.completed = false;
    return {
      draft,
      accepted: true,
      complete: false,
      ready: discoveryCanFinish(mission, variation, draft),
      phraseKey: trial.phraseKey,
      consequence: trial.relation,
    };
  }

  if (mission.kind === "count") {
    const picked = variation.options.find((entry) => entry.id === action.optionId);
    if (type !== "choose" || !picked || draft.made.length >= variation.goal) return { draft, accepted: false, complete: false, phraseKey: null, consequence: "invalid" };
    draft.made.push(picked.id);
    draft.completed = draft.made.length >= variation.goal;
    const countKey = variation.countKeys?.[draft.made.length - 1];
    return { draft, accepted: true, complete: draft.completed, phraseKey: countKey || (draft.completed ? mission.successKey : picked.phraseKey), consequence: "count" };
  }

  if (mission.kind === "sort") {
    const piece = (variation.pieces || []).find((entry) => entry.id === action.pieceId);
    const target = (variation.targets || []).find((entry) => entry.id === action.targetId);
    if (type !== "place" || !piece || !target) return { draft, accepted: false, complete: false, phraseKey: null, consequence: "invalid" };
    if (piece.target !== target.id) return { draft, accepted: true, complete: false, phraseKey: "discovery_sort_other", consequence: "return" };
    draft.placements[piece.id] = target.id;
    draft.completed = variation.pieces.every((entry) => draft.placements[entry.id] === entry.target);
    return { draft, accepted: true, complete: draft.completed, phraseKey: draft.completed ? mission.successKey : target.phraseKey, consequence: "sort" };
  }

  if (mission.kind === "share") {
    const pieces = missionOptions(mission, variation);
    const piece = pieces.find((entry) => entry.id === action.pieceId);
    const target = (variation.targets || []).find((entry) => entry.id === action.targetId);
    if (type !== "place" || !piece || !target) return { draft, accepted: false, complete: false, phraseKey: null, consequence: "invalid" };
    draft.placements[piece.id] = target.id;
    const counts = variation.targets.map((entry) => Object.values(draft.placements).filter((id) => id === entry.id).length);
    const allPlaced = Object.keys(draft.placements).length === pieces.length;
    draft.completed = allPlaced && counts.every((n) => n === counts[0]);
    return {
      draft,
      accepted: true,
      complete: draft.completed,
      phraseKey: draft.completed ? mission.successKey : (allPlaced ? "discovery_share_uneven" : target.phraseKey),
      consequence: draft.completed ? "equal" : (allPlaced ? "uneven" : "share"),
    };
  }

  return { draft, accepted: false, complete: false, phraseKey: null, consequence: "invalid" };
}

export const DISCOVERY_CATALOG_PAGES = Object.freeze([
  Object.freeze(["shape-build", "sort-color", "quantity-share"]),
  Object.freeze(["shape-fit", "shape-roll", "quantity-count"]),
  Object.freeze(["shape-place", "sort-shadow", "quantity-pattern"]),
  Object.freeze(["sort-size", "sort-pair", "quantity-one-more"]),
]);

export function missionSet(page = 0) {
  const n = DISCOVERY_CATALOG_PAGES.length;
  const index = ((Math.trunc(Number(page)) || 0) % n + n) % n;
  return DISCOVERY_CATALOG_PAGES[index].map((id) => discoveryMission(id));
}
export default DISCOVERY_MISSIONS;
