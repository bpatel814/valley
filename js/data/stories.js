// Eight three-beat picture stories. Labels are accessibility metadata for adults;
// children choose from pictures and narration, so visible reading is never required.

const picture = (kind, id, fallback = null) => Object.freeze({ kind, id, fallback });
const VISUAL = Object.freeze({
  rabbit: ["hop", "ground"], rainbow: ["glow", "sky"], raindrop: ["drop", "sky"], ribbon: ["wave", "air"],
  ball: ["roll", "ground"], bee: ["loop", "air"], basket: ["bob", "ground"], boat: ["bob", "ground"],
  butterfly: ["flutter", "air"], blanket: ["float", "air"], hat: ["bob", "ground"], fish: ["swim", "ground"],
  moon: ["float", "sky"], spoon: ["tap", "ground"], balloon: ["float", "sky"], star: ["twinkle", "sky"],
  heart: ["pulse", "air"], tree: ["sway", "ground"], house: ["glow", "ground"], cat: ["hop", "ground"],
  caterpillar: ["wiggle", "ground"], cocoon: ["sway", "air"], card: ["float", "air"], "name-card": ["float", "air"],
  mailbox: ["bob", "ground"], "arrow-sign": ["point", "ground"], "stop-sign": ["pulse", "ground"],
  flower: ["sway", "ground"], bridge: ["glow", "ground"], veer: ["hop", "ground"], unicorn: ["prance", "ground"],
  pip: ["flutter", "air"],
});
const choice = (id, label, art, reactionKey, path = null) => Object.freeze({
  id, label, picture: art, reactionKey,
  motion: (VISUAL[id] || ["pop", "ground"])[0],
  zone: (VISUAL[id] || ["pop", "ground"])[1],
  ...(path ? { path } : {}),
});
const encounter = (id, focus, promptKey, choices, promptByPath = null, promptByChoices = null, reactionByChoices = null) => Object.freeze({
  id, focus, promptKey, choices: Object.freeze(choices),
  ...(promptByPath ? { promptByPath: Object.freeze(promptByPath) } : {}),
  ...(promptByChoices ? { promptByChoices: Object.freeze(promptByChoices) } : {}),
  ...(reactionByChoices ? { reactionByChoices: Object.freeze(reactionByChoices) } : {}),
});
const D = (id) => picture("drawing", id);
const C = (id) => picture("character", id);
// Published story objects must never borrow another object's drawing when art is
// unavailable. Route loading owns WebP/PNG recovery; the screen owns a neutral
// unavailable-picture state after that recovery is exhausted.
const O = (id) => picture("story", id);
export const CAUSAL_SCENE_ACTORS = Object.freeze({
  "rayna-rainy-r": Object.freeze([
    Object.freeze({ id: "rayna", label: "Rayna", picture: C("family_child1") }),
  ]),
  "pip-bouncy-b": Object.freeze([
    Object.freeze({ id: "pip", label: "Pip", picture: C("pip") }),
  ]),
  "cat-hat-picnic": Object.freeze([
    Object.freeze({ id: "cat", label: "Cat", picture: O("black-cat") }),
    Object.freeze({ id: "picnic-basket", label: "picnic basket", picture: O("basket") }),
  ]),
  "moon-tune": Object.freeze([
    Object.freeze({ id: "moon", label: "Moon", picture: O("moon") }),
  ]),
  "cozy-c-sounds": Object.freeze([]),
  "name-mail": Object.freeze([
    Object.freeze({ id: "veer", label: "Veer", picture: C("veer") }),
    Object.freeze({ id: "rayna", label: "Rayna", picture: C("family_child1") }),
  ]),
  "valley-signs": Object.freeze([
    Object.freeze({ id: "veer", label: "Veer", picture: C("veer") }),
  ]),
});
const STORY_LEADS = Object.freeze({
  "cat-hat-picnic": O("black-cat"),
  "moon-tune": O("moon", "balloon"),
  "lost-star": D("star"),
});
const MAIL_ENDINGS = Object.freeze({
  "name-card|arrow-sign|heart": "story_mail_end_name_card_arrow_heart",
  "name-card|arrow-sign|flower": "story_mail_end_name_card_arrow_flower",
  "name-card|house|heart": "story_mail_end_name_card_house_heart",
  "name-card|house|flower": "story_mail_end_name_card_house_flower",
  "mailbox|arrow-sign|heart": "story_mail_end_mailbox_arrow_heart",
  "mailbox|arrow-sign|flower": "story_mail_end_mailbox_arrow_flower",
  "mailbox|house|heart": "story_mail_end_mailbox_house_heart",
  "mailbox|house|flower": "story_mail_end_mailbox_house_flower",
});
const SIGN_ENDINGS = Object.freeze({
  "stop-sign|bridge|pip": "story_signs_end_stop_bridge_pip",
  "stop-sign|bridge|unicorn": "story_signs_end_stop_bridge_unicorn",
  "stop-sign|house|pip": "story_signs_end_stop_house_pip",
  "stop-sign|house|unicorn": "story_signs_end_stop_house_unicorn",
  "arrow-sign|bridge|pip": "story_signs_end_arrow_bridge_pip",
  "arrow-sign|bridge|unicorn": "story_signs_end_arrow_bridge_unicorn",
  "arrow-sign|house|pip": "story_signs_end_arrow_house_pip",
  "arrow-sign|house|unicorn": "story_signs_end_arrow_house_unicorn",
});
const RAYNA_ENDINGS = Object.freeze({
  "rabbit|raindrop|tree": "story_rayna_end_rabbit_raindrop_tree",
  "rabbit|raindrop|house": "story_rayna_end_rabbit_raindrop_house",
  "rabbit|ribbon|tree": "story_rayna_end_rabbit_ribbon_tree",
  "rabbit|ribbon|house": "story_rayna_end_rabbit_ribbon_house",
  "rainbow|raindrop|tree": "story_rayna_end_rainbow_raindrop_tree",
  "rainbow|raindrop|house": "story_rayna_end_rainbow_raindrop_house",
  "rainbow|ribbon|tree": "story_rayna_end_rainbow_ribbon_tree",
  "rainbow|ribbon|house": "story_rayna_end_rainbow_ribbon_house",
});
const PIP_ENDINGS = Object.freeze({
  "ball|basket|butterfly": "story_pip_b_end_ball_basket_butterfly",
  "ball|basket|blanket": "story_pip_b_end_ball_basket_blanket",
  "ball|boat|butterfly": "story_pip_b_end_ball_boat_butterfly",
  "ball|boat|blanket": "story_pip_b_end_ball_boat_blanket",
  "bee|basket|butterfly": "story_pip_b_end_bee_basket_butterfly",
  "bee|basket|blanket": "story_pip_b_end_bee_basket_blanket",
  "bee|boat|butterfly": "story_pip_b_end_bee_boat_butterfly",
  "bee|boat|blanket": "story_pip_b_end_bee_boat_blanket",
});
const CAT_ENDINGS = Object.freeze({
  "hat|moon|star": "story_cat_end_hat_moon_star",
  "hat|moon|heart": "story_cat_end_hat_moon_heart",
  "hat|spoon|star": "story_cat_end_hat_spoon_star",
  "hat|spoon|heart": "story_cat_end_hat_spoon_heart",
  "fish|moon|star": "story_cat_end_fish_moon_star",
  "fish|moon|heart": "story_cat_end_fish_moon_heart",
  "fish|spoon|star": "story_cat_end_fish_spoon_star",
  "fish|spoon|heart": "story_cat_end_fish_spoon_heart",
});
const MOON_ENDINGS = Object.freeze({
  "spoon|tree|star": "story_moon_end_spoon_tree_star",
  "spoon|tree|rainbow": "story_moon_end_spoon_tree_rainbow",
  "spoon|house|star": "story_moon_end_spoon_house_star",
  "spoon|house|rainbow": "story_moon_end_spoon_house_rainbow",
  "balloon|tree|star": "story_moon_end_balloon_tree_star",
  "balloon|tree|rainbow": "story_moon_end_balloon_tree_rainbow",
  "balloon|house|star": "story_moon_end_balloon_house_star",
  "balloon|house|rainbow": "story_moon_end_balloon_house_rainbow",
});
const COZY_ENDINGS = Object.freeze({
  "cat|cocoon|tree": "story_cozy_end_cat_cocoon_tree",
  "cat|cocoon|house": "story_cozy_end_cat_cocoon_house",
  "cat|card|tree": "story_cozy_end_cat_card_tree",
  "cat|card|house": "story_cozy_end_cat_card_house",
  "caterpillar|cocoon|tree": "story_cozy_end_caterpillar_cocoon_tree",
  "caterpillar|cocoon|house": "story_cozy_end_caterpillar_cocoon_house",
  "caterpillar|card|tree": "story_cozy_end_caterpillar_card_tree",
  "caterpillar|card|house": "story_cozy_end_caterpillar_card_house",
});
const story = (id, label, host, cover, introKey, encounters, endingByPath, extension = null, endingByChoices = null) => Object.freeze({
  id, label, host, cover: Object.freeze(cover), introKey,
  encounters: Object.freeze(encounters), endingByPath: Object.freeze(endingByPath),
  ...(STORY_LEADS[id] ? { lead: STORY_LEADS[id] } : {}),
  ...(extension ? { extension: Object.freeze(extension) } : {}),
  ...(endingByChoices ? { endingByChoices: Object.freeze(endingByChoices) } : {}),
});

export const STORIES = Object.freeze([
  story("rayna-rainy-r", "Rayna's rainy R story", "family_child1", [C("family_child1"), O("rabbit", "cat"), D("rainbow")],
    "story_rayna_intro", [
      encounter("friend", "name-initial", "story_rayna_b1_prompt", [
        choice("rabbit", "rabbit", O("rabbit", "cat"), "story_rayna_b1_rabbit", "rabbit"),
        choice("rainbow", "rainbow", D("rainbow"), "story_rayna_b1_rainbow", "rainbow"),
      ]),
      encounter("found", "alliteration", "story_rayna_b2_prompt", [
        choice("raindrop", "raindrop", O("raindrop", "balloon"), "story_rayna_b2_raindrop"),
        choice("ribbon", "ribbon", O("ribbon", "rainbow"), "story_rayna_b2_ribbon"),
      ], { rabbit: "story_rayna_b2_rabbit_prompt", rainbow: "story_rayna_b2_rainbow_prompt" }),
      encounter("place", "story-meaning", "story_rayna_b3_prompt", [
        choice("tree", "tree", D("tree"), "story_rayna_b3_tree"),
        choice("house", "house", D("house"), "story_rayna_b3_house"),
      ], { rabbit: "story_rayna_b3_rabbit_prompt", rainbow: "story_rayna_b3_rainbow_prompt" }),
    ], { rabbit: "story_rayna_end_rabbit", rainbow: "story_rayna_end_rainbow" },
    { route: "garden", params: { item: "rain" }, picture: D("rainbow"), label: "make rain marks" }, RAYNA_ENDINGS),

  story("pip-bouncy-b", "Pip's bouncy B story", "pip", [C("pip"), O("ball", "balloon"), O("bee", "butterfly")],
    "story_pip_b_intro", [
      encounter("visitor", "initial-sound", "story_pip_b_b1_prompt", [
        choice("ball", "ball", O("ball", "balloon"), "story_pip_b_b1_ball", "ball"),
        choice("bee", "bee", O("bee", "butterfly"), "story_pip_b_b1_bee", "bee"),
      ]),
      encounter("ride", "alliteration", "story_pip_b_b2_prompt", [
        choice("basket", "basket", O("basket", "flower"), "story_pip_b_b2_basket"),
        choice("boat", "boat", O("boat", "fish"), "story_pip_b_b2_boat"),
      ], { ball: "story_pip_b_b2_ball_prompt", bee: "story_pip_b_b2_bee_prompt" }, null, {
        "ball|basket": "story_pip_b_b2_ball_basket",
        "ball|boat": "story_pip_b_b2_ball_boat",
        "bee|basket": "story_pip_b_b2_bee_basket",
        "bee|boat": "story_pip_b_b2_bee_boat",
      }),
      encounter("ending", "story-meaning", "story_pip_b_b3_prompt", [
        choice("butterfly", "butterfly", D("butterfly"), "story_pip_b_b3_butterfly"),
        choice("blanket", "blanket", O("blanket", "heart"), "story_pip_b_b3_blanket"),
      ]),
    ], { ball: "story_pip_b_end_ball", bee: "story_pip_b_end_bee" }, null, PIP_ENDINGS),

  story("cat-hat-picnic", "Cat's hat picnic", "caterpillar", [O("black-cat"), O("hat", "star"), O("basket", "flower")],
    "story_cat_intro", [
      encounter("picnic", "rhyme", "story_cat_b1_prompt", [
        choice("hat", "hat", O("hat", "star"), "story_cat_b1_hat", "hat"),
        choice("fish", "fish", D("fish"), "story_cat_b1_fish", "fish"),
      ]),
      encounter("moon-song", "rhyme", "story_cat_b2_prompt", [
        choice("moon", "moon", O("moon", "balloon"), "story_cat_b2_moon"),
        choice("spoon", "spoon", O("spoon", "icecream"), "story_cat_b2_spoon"),
      ], { hat: "story_cat_b2_hat_prompt", fish: "story_cat_b2_fish_prompt" }),
      encounter("gift", "story-meaning", "story_cat_b3_prompt", [
        choice("star", "star", D("star"), "story_cat_b3_star"),
        choice("heart", "heart", D("heart"), "story_cat_b3_heart"),
      ]),
    ], { hat: "story_cat_end_hat", fish: "story_cat_end_fish" },
    { route: "garden", params: { item: "hill" }, picture: O("black-cat"), label: "make a hat hill" }, CAT_ENDINGS),

  story("moon-tune", "Moon's tune", "unicorn", [O("moon", "balloon"), O("spoon", "icecream"), D("balloon")],
    "story_moon_intro", [
      encounter("rhyme", "rhyme", "story_moon_b1_prompt", [
        choice("spoon", "spoon", O("spoon", "icecream"), "story_moon_b1_spoon", "spoon"),
        choice("balloon", "balloon", D("balloon"), "story_moon_b1_balloon", "balloon"),
      ]),
      encounter("place", "story-meaning", "story_moon_b2_prompt", [
        choice("tree", "tree", D("tree"), "story_moon_b2_tree"),
        choice("house", "house", D("house"), "story_moon_b2_house"),
      ], { spoon: "story_moon_b2_spoon_prompt", balloon: "story_moon_b2_balloon_prompt" }),
      encounter("glow", "story-meaning", "story_moon_b3_prompt", [
        choice("star", "star", D("star"), "story_moon_b3_star"),
        choice("rainbow", "rainbow", D("rainbow"), "story_moon_b3_rainbow"),
      ]),
    ], { spoon: "story_moon_end_spoon", balloon: "story_moon_end_balloon" }, null, MOON_ENDINGS),

  story("cozy-c-sounds", "Cozy C sounds", "caterpillar", [O("black-cat"), D("caterpillar"), C("cocoon")],
    "story_cozy_intro", [
      encounter("friend", "initial-sound", "story_cozy_b1_prompt", [
        choice("cat", "cat", O("black-cat"), "story_cozy_b1_cat", "cat"),
        choice("caterpillar", "caterpillar", D("caterpillar"), "story_cozy_b1_caterpillar", "caterpillar"),
      ]),
      encounter("carry", "alliteration", "story_cozy_b2_prompt", [
        choice("cocoon", "cocoon", C("cocoon"), "story_cozy_b2_cocoon"),
        choice("card", "card", O("name-card", "heart"), "story_cozy_b2_card"),
      ], { cat: "story_cozy_b2_cat_prompt", caterpillar: "story_cozy_b2_caterpillar_prompt" }),
      encounter("corner", "story-meaning", "story_cozy_b3_prompt", [
        choice("tree", "tree", D("tree"), "story_cozy_b3_tree"),
        choice("house", "house", D("house"), "story_cozy_b3_house"),
      ]),
    ], { cat: "story_cozy_end_cat", caterpillar: "story_cozy_end_caterpillar" }, null, COZY_ENDINGS),

  story("name-mail", "The name mail", "veer", [O("name-card", "heart"), O("mailbox", "house"), D("house")],
    "story_mail_intro", [
      encounter("label", "functional-print", "story_mail_b1_prompt", [
        choice("name-card", "name card", O("name-card", "heart"), "story_mail_b1_name", "name"),
        choice("mailbox", "mailbox", O("mailbox", "house"), "story_mail_b1_mailbox", "mailbox"),
      ]),
      encounter("route", "functional-print", "story_mail_b2_prompt", [
        choice("arrow-sign", "arrow sign", O("arrow-sign", "rainbow"), "story_mail_b2_arrow"),
        choice("house", "house", D("house"), "story_mail_b2_house"),
      ], { name: "story_mail_b2_name_prompt", mailbox: "story_mail_b2_mailbox_prompt" }),
      encounter("delivery", "story-meaning", "story_mail_b3_prompt", [
        choice("heart", "heart", D("heart"), "story_mail_b3_heart"),
        choice("flower", "flower", D("flower"), "story_mail_b3_flower"),
      ], null, null, {
        "name-card|heart": "story_mail_b3_name_heart",
        "name-card|flower": "story_mail_b3_name_flower",
        "mailbox|heart": "story_mail_b3_mailbox_heart",
        "mailbox|flower": "story_mail_b3_mailbox_flower",
      }),
    ], { name: "story_mail_end_name", mailbox: "story_mail_end_mailbox" },
    { route: "meadow", params: { word: "RAYNA" }, picture: O("name-card", "heart"), label: "write a name" }, MAIL_ENDINGS),

  story("valley-signs", "Valley signs", "veer", [O("stop-sign", "star"), O("arrow-sign", "rainbow"), D("house")],
    "story_signs_intro", [
      encounter("sign", "functional-print", "story_signs_b1_prompt", [
        choice("stop-sign", "stop sign", O("stop-sign", "star"), "story_signs_b1_stop", "stop"),
        choice("arrow-sign", "arrow sign", O("arrow-sign", "rainbow"), "story_signs_b1_arrow", "arrow"),
      ]),
      encounter("path", "functional-print", "story_signs_b2_prompt", [
        choice("bridge", "bridge", C("bridge"), "story_signs_b2_bridge"),
        choice("house", "house", D("house"), "story_signs_b2_house"),
      ], { stop: "story_signs_b2_stop_prompt", arrow: "story_signs_b2_arrow_prompt" }),
      encounter("helper", "story-meaning", "story_signs_b3_prompt", [
        choice("pip", "Pip", C("pip"), "story_signs_b3_pip"),
        choice("unicorn", "unicorn", D("unicorn"), "story_signs_b3_unicorn"),
      ]),
    ], { stop: "story_signs_end_stop", arrow: "story_signs_end_arrow" }, null, SIGN_ENDINGS),

  story("lost-star", "The lost star", "grandma", [D("star"), C("pip"), D("veer")],
    "story_star_intro", [
      encounter("helper", "story-meaning", "story_star_b1_prompt", [
        choice("pip", "Pip", C("pip"), "story_star_b1_pip", "pip"),
        choice("veer", "Veer", D("veer"), "story_star_b1_veer", "veer"),
      ]),
      encounter("search", "story-sequence", "story_star_b2_prompt", [
        choice("tree", "tree", D("tree"), "story_star_b2_tree"),
        choice("house", "house", D("house"), "story_star_b2_house"),
      ], { pip: "story_star_b2_pip_prompt", veer: "story_star_b2_veer_prompt" }),
      encounter("welcome", "story-meaning", "story_star_b3_prompt", [
        choice("heart", "heart", D("heart"), "story_star_b3_heart"),
        choice("balloon", "balloon", D("balloon"), "story_star_b3_balloon"),
      ], null, {
        "pip|tree": "story_star_b3_pip_tree_prompt",
        "pip|house": "story_star_b3_pip_house_prompt",
        "veer|tree": "story_star_b3_veer_tree_prompt",
        "veer|house": "story_star_b3_veer_house_prompt",
      }),
    ], { pip: "story_star_end_pip", veer: "story_star_end_veer" }, null, {
      "pip|tree|heart": "story_star_end_pip_tree_heart",
      "pip|tree|balloon": "story_star_end_pip_tree_balloon",
      "pip|house|heart": "story_star_end_pip_house_heart",
      "pip|house|balloon": "story_star_end_pip_house_balloon",
      "veer|tree|heart": "story_star_end_veer_tree_heart",
      "veer|tree|balloon": "story_star_end_veer_tree_balloon",
      "veer|house|heart": "story_star_end_veer_house_heart",
      "veer|house|balloon": "story_star_end_veer_house_balloon",
    }),
]);

export const STORY_BY_ID = Object.freeze(Object.fromEntries(STORIES.map((item) => [item.id, item])));
export const STORY_SEQUENCE = Object.freeze(STORIES.map((item) => item.id));
export const CAUSAL_STORY_IDS = Object.freeze([
  "rayna-rainy-r", "pip-bouncy-b", "cat-hat-picnic", "moon-tune", "cozy-c-sounds",
  "name-mail", "valley-signs",
]);
export const LITERAL_STORY_PICTURE_IDS = Object.freeze(["name-card", "stop-sign", "arrow-sign"]);
export const STORY_GENERATED_ART_KEYS = Object.freeze([...new Set(STORIES.flatMap((item) => [
  ...item.cover,
  ...(item.lead ? [item.lead] : []),
  ...item.encounters.flatMap((encounter) => encounter.choices.map((entry) => entry.picture)),
  ...(item.extension ? [item.extension.picture] : []),
]).filter((spec) => spec.kind === "story" && !LITERAL_STORY_PICTURE_IDS.includes(spec.id))
  .map((spec) => `stories/${spec.id}`))].sort());

/** Drawing geometry is truthful only for a picture explicitly authored as that drawing. */
export function drawingFallbackForStoryPicture(spec) {
  return spec && spec.kind === "drawing" ? spec.id : null;
}

export function getStory(id) {
  return STORY_BY_ID[String(id || "")] || null;
}

export function storyPath(storyOrId, selectedIds = []) {
  const item = typeof storyOrId === "string" ? getStory(storyOrId) : storyOrId;
  if (!item) return null;
  for (let i = 0; i < Math.min(selectedIds.length, item.encounters.length); i++) {
    const selected = item.encounters[i].choices.find((entry) => entry.id === selectedIds[i]);
    if (selected && selected.path) return selected.path;
  }
  return null;
}

export function encounterPrompt(storyOrId, index, selectedIds = []) {
  const item = typeof storyOrId === "string" ? getStory(storyOrId) : storyOrId;
  const beat = item && item.encounters[index];
  if (!beat) return null;
  const exact = selectedIds.slice(0, index).join("|");
  if (exact && beat.promptByChoices && beat.promptByChoices[exact]) return beat.promptByChoices[exact];
  const path = storyPath(item, selectedIds);
  return (path && beat.promptByPath && beat.promptByPath[path]) || beat.promptKey;
}

export function endingPhrase(storyOrId, selectedIds = []) {
  const item = typeof storyOrId === "string" ? getStory(storyOrId) : storyOrId;
  if (!item) return null;
  const exact = selectedIds.slice(0, item.encounters.length).join("|");
  if (exact && item.endingByChoices && item.endingByChoices[exact]) return item.endingByChoices[exact];
  const path = storyPath(item, selectedIds);
  return item.endingByPath[path] || Object.values(item.endingByPath)[0] || null;
}

export function choiceAt(storyOrId, index, choiceId) {
  const item = typeof storyOrId === "string" ? getStory(storyOrId) : storyOrId;
  return item && item.encounters[index]
    ? item.encounters[index].choices.find((entry) => entry.id === choiceId) || null
    : null;
}

export function choiceReaction(storyOrId, index, choiceId, selectedIds = []) {
  const item = typeof storyOrId === "string" ? getStory(storyOrId) : storyOrId;
  const beat = item && item.encounters[index];
  const selected = choiceAt(item, index, choiceId);
  if (!beat || !selected) return null;
  const conditionalKey = `${selectedIds[0] || ""}|${selected.id}`;
  return beat.reactionByChoices?.[conditionalKey] || selected.reactionKey;
}

/**
 * Canonical state for every fully authored causal scene. The same state
 * drives live play, saved cards, retell, and reduced-motion compositions.
 */
export function causalSceneState(storyOrId, selectedIds = []) {
  const item = typeof storyOrId === "string" ? getStory(storyOrId) : storyOrId;
  if (!item || !CAUSAL_STORY_IDS.includes(item.id)) return null;
  const choices = [];
  for (let index = 0; index < item.encounters.length && index < selectedIds.length; index++) {
    const selected = choiceAt(item, index, selectedIds[index]);
    if (!selected) break;
    choices.push(selected.id);
  }
  const beat = choices.length;
  if (item.id === "name-mail") return Object.freeze({
    storyId: item.id,
    beat,
    marker: choices[0] || "",
    route: choices[1] || "",
    delivery: choices[2] || "",
    phase: beat === 3 ? "delivered" : beat === 2 ? "arrived" : beat === 1 ? "marked" : "ready",
    mailboxTransfer: beat === 3 && choices[0] === "mailbox",
  });
  if (item.id === "valley-signs") return Object.freeze({
    storyId: item.id,
    beat,
    sign: choices[0] || "",
    destination: choices[1] || "",
    friend: choices[2] || "",
    phase: beat === 3 ? "met" : beat === 2 ? "arrived" : beat === 1 ? (choices[0] === "stop-sign" ? "paused" : "turned") : "ready",
  });
  if (item.id === "rayna-rainy-r") return Object.freeze({
    storyId: item.id,
    beat,
    companion: choices[0] || "",
    found: choices[1] || "",
    place: choices[2] || "",
    phase: beat === 3 ? "resting" : beat === 2 ? "gathered" : beat === 1 ? "accompanied" : "ready",
  });
  if (item.id === "pip-bouncy-b") return Object.freeze({
    storyId: item.id,
    beat,
    passenger: choices[0] || "",
    ride: choices[1] || "",
    finish: choices[2] || "",
    phase: beat === 3 ? "finished" : beat === 2 ? "riding" : beat === 1 ? "met" : "ready",
    passengerLoaded: beat >= 2,
  });
  if (item.id === "cat-hat-picnic") return Object.freeze({
    storyId: item.id,
    beat,
    picnicStart: choices[0] || "",
    sound: choices[1] || "",
    finish: choices[2] || "",
    phase: beat === 3 ? "finished" : beat === 2 ? "playing" : beat === 1 ? "gathered" : "ready",
  });
  if (item.id === "moon-tune") return Object.freeze({
    storyId: item.id,
    beat,
    friend: choices[0] || "",
    place: choices[1] || "",
    finale: choices[2] || "",
    phase: beat === 3 ? "finale" : beat === 2 ? "placed" : beat === 1 ? "playing" : "ready",
  });
  return Object.freeze({
    storyId: item.id,
    beat,
    lead: choices[0] || "",
    nearby: choices[1] || "",
    place: choices[2] || "",
    phase: beat === 3 ? "resting" : beat === 2 ? "paired" : beat === 1 ? "arrived" : "ready",
  });
}

export default STORIES;
