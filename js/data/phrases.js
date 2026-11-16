// phrases.js - every spoken line in Rainbow Valley, in one place.
//
// Shape:  PHRASES[key] = { text, speaker, note }
//   text    the authored English line matched against a recorded narrator clip
//   speaker recording role: 'guide' | 'grandma' | 'veer' | 'mama' | 'papa'
//   note    when it plays; docs/PHRASE_KEYS.md is generated from these three fields
//
// {name} in a line is interpolated by speech.say(key, vars) and defaults to "Rayna".
//
// Letter, sound, lowercase and digit lines are built from js/data/letters.js so the
// glyph names and phonics never drift from the stroke data. Everything else is literal.
//
// Rules from the style bible that this file obeys: at least 6 praise variants per tier
// band, at least 3 retry variants, never a negative or "wrong" line anywhere.

import { WORDS as WORD_CATALOG } from "./words.js";
import { GLYPHS, UPPER, LOWER, DIGITS } from "./letters.js";
import { SHOW_AND_TELL_PHRASES } from "./show-and-tell-phrases.js";
import { STUDIO_PHRASES } from "./studio-phrases.js";
import { STORY_PHRASES } from "./story-phrases.js";
import { DISCOVERY_PHRASES } from "./discovery-phrases.js";
import { PLAY_STAGE_PHRASES } from "./play-stage-phrases.js";
import { LIVING_PLAY_PHRASES } from "./living-play-phrases.js";
import { MESSAGE_DAY_PHRASES } from "./message-day-phrases.js";
import { HALLOWEEN_PHRASES } from './halloween-phrases.js';

// Example word per uppercase letter, used by the phonic line "A says ah, like apple."
const EXAMPLE = {
  A: "apple", B: "ball", C: "cat", D: "dog", E: "egg", F: "fish", G: "goat",
  H: "hat", I: "igloo", J: "jam", K: "kite", L: "leaf", M: "moon", N: "nest",
  O: "octopus", P: "pig", Q: "queen", R: "rainbow", S: "sun", T: "tree",
  U: "umbrella", V: "violin", W: "wave", X: "box", Y: "yellow", Z: "zebra",
};

/** Stable word catalogue of Unicorn Meadow. */
export const GAME_WORDS = WORD_CATALOG.map((entry) => entry.word);

/** The guided-drawing objects of Rainbow Bridge. */
export const DRAW_OBJECTS = [
  "sun", "rainbow", "flower", "house", "balloon", "caterpillar", "cat",
  "butterfly", "fish", "unicorn", "star", "heart", "icecream", "tree", "veer", "pumpkin", "friendlyghost", "spider", "skeleton", "witchhat",
];

const P = (text, speaker, note) => ({ text, speaker: speaker || "guide", note: note || "" });

export const PHRASES = {
  ...SHOW_AND_TELL_PHRASES,
  ...STUDIO_PHRASES,
  ...STORY_PHRASES,
  ...DISCOVERY_PHRASES,
  ...PLAY_STAGE_PHRASES,
  ...LIVING_PLAY_PHRASES,
  ...MESSAGE_DAY_PHRASES,
  ...HALLOWEEN_PHRASES,
  play_stage_performance_choose: P("Choose a show, or make your own.", "guide", "choose an authored or free puppet performance"),
  play_stage_performance_gift: P("Choose your picture from the basket. Wrap it, give it to a friend, then open the surprise.", "guide", "owned picture gift performance invitation"),
  play_stage_performance_parade: P("Make a family parade. Move your friends, make a hop, and pass a gift. You choose the order.", "guide", "child-ordered family parade invitation"),
  play_stage_performance_free: P("Your show is recording. Move your friends and toys. Press Stop, then Play to see your show.", "guide", "free puppet performance recording help"),
  play_stage_performance_stopped: P("Your show is ready. Press Play to see it, or keep playing.", "guide", "recorded puppet performance ready to replay"),
  play_stage_parade_route: P("Choose a leader. Tap the ground to make a trail, then press Go. Your friends will follow together.", "guide", "family parade route invitation"),
  play_stage_parade_leader: P("Who will lead your parade?", "guide", "explicit parade leader choice"),
  play_stage_parade_stopped: P("Your friends have stopped. You can change the trail or play your show.", "guide", "parade stopped at the last reached place"),
  bridge_choose_mode: P("Watch me draw. Try the guide, copy the picture, or make your own.", "guide", "four drawing readiness choices"),
  picnic_help: P("Tap fruit, then a plate or the bowl. Cut a whole fruit into two halves. Mix the bowl, tap it, then tap a friend to serve. Tap a friend again to enjoy a piece.", "guide", "picnic preparation and central recipient sharing help"),
  picnic_invite: P("Veer and Ishan are here. What shall we make for our picnic?", "guide", "visible default picnic guests"),
  picnic_cut: P("Two pieces! You can share them.", "guide", "a whole fruit becomes two preserved halves"),
  picnic_mix: P("Stir, stir. Who shall we share this bowl with?", "guide", "real bowl ingredients"),
  picnic_enjoy: P("Mmm. A lovely picnic together.", "guide", "a guest enjoys actual served food"),
  picnic_saved: P("Our picnic is saved. We can play with it again.", "guide", "editable picnic saved"),
  build_lab_help: P("Let's build a bridge for the caterpillar. Choose a plank, then tap the stream. Add a support under a long plank. Tap the caterpillar to try your bridge.", "guide", "build lab help for the visible caterpillar"),
  build_lab_cross: P("Your bridge holds! The caterpillar can crawl across.", "guide", "a supported connected bridge carries the caterpillar"),
  build_lab_settle: P("The planks gently settle. The caterpillar stays safely on the bank. Try a support under the bridge.", "guide", "the caterpillar stays safely on the bank"),
  build_lab_short: P("There is a gap. The caterpillar waits safely. Move a plank, or add another one.", "guide", "visible bridge gap and safe waiting caterpillar"),
  build_lab_delivery_intro: P("Your picture needs a bridge. The caterpillar will carry it to the frame.", "guide", "owned picture bridge delivery invitation"),
  build_lab_delivery_arrived: P("Your own picture arrived! We can keep this bridge, or change it and try again.", "guide", "owned picture has reached the destination frame"),
  wg_help: P("Plant a seed in a bed. Draw a path from the spring to your seed. Pour water and see where it goes.", "guide", "water garden help"),
  wg_pip: P("Pip has some flower seeds. Where shall they grow?", "guide", "flower garden situation"),
  wg_shade: P("Our black cat likes a leafy place to rest. Let's grow a little garden.", "guide", "safe family black cat garden"),
  wg_free: P("This garden is yours. Draw, plant, and see what happens.", "guide", "free garden"),
  wg_flow: P("The water followed your path. A little sprout!", "guide", "connected watering causes first growth"),
  wg_dry: P("Where did the water go? Try joining your path to the spring.", "guide", "disconnected paths retain ink"),
  wg_bloom: P("Look what grew along your water paths!", "guide", "second connected pour blooms"),
  wg_canopy: P("Your leaves made cool shade. Tap the cat, then choose a place under the canopy.", "guide", "grown canopy and child-chosen cat placement"),
  wg_choose_shade: P("Where shall the cat rest? Tap the shade, or choose another comfortable place.", "guide", "cat rest placement choice"),
  wg_cat_rest: P("The cat is resting in the cool shade you grew.", "guide", "cat rests under the child's grown canopy"),
  wg_friend_place: P("Your friend is comfortable here. You can choose another place.", "guide", "freely chosen comfortable friend placement"),
  wg_choose_flower: P("Tap a flower for Pip to visit, or choose a place in your garden.", "guide", "Pip flower visit placement choice"),
  wg_flower_visit: P("Pip is visiting the flower you grew.", "guide", "Pip visits the child's grown flower"),
  picture_post_intro: P("Make a picture message for someone you love.", "guide", "Picture Post invitation"),
  picture_post_help_make: P("Draw, scribble, or tap a picture stamp. Choose a friend. Fold your picture when you are ready.", "guide", "Picture Post creation help"),
  picture_post_help_route: P("Take your envelope along the path. Tap places in any order. Deliver at the place you chose.", "guide", "Picture Post delivery route help"),
  picture_post_help_open: P("Tap the envelope to see your own message and your friend's picture reply.", "guide", "Picture Post envelope opening help"),
  picture_post_fold: P("Your very own picture is inside. Where will you take it?", "guide", "the actual picture is folded into an envelope"),
  picture_post_delivered: P("Your friend has your envelope. Open it together.", "guide", "the envelope arrives for its selected friend"),
  picture_post_reply: P("Here is a picture reply. Your message and their picture are kept in your album.", "guide", "actual message and reply are preserved together"),
  bridge_saved: P("Here is your picture. Let's keep it.", "guide", "manual Bridge save preserves the child's actual ink; no mastery claim"),
  grandma_recap_story: P("Your story is tucked safely in our book.", "guide", "Ba acknowledges an actually completed story from today"),
  grandma_recap_discovery: P("Look what you explored today.", "guide", "Ba acknowledges an actually completed Discovery activity from today"),
  grandma_recap_picture: P("Your picture is safe in our family album.", "guide", "Ba shows an actual saved picture from today"),
  grandma_rest_ready: P("All done for now. Let's rest together.", "guide", "the child chooses a calm end with Ba"),
  ui_map_invite: P("Pick a friend or a place. You can draw, build, or make a story.", "guide", "first map invitation; Pip repeats it on request"),
  ui_try_the_path: P("You can follow the path, or make it your own.", "guide", "optional support in guided drawing"),
  family_mural_intro: P("Let's make a picture together!", "guide", "family co-play mural"),
  mural_turn_full: P("Pass the pen, or keep your mural.", "guide", "current family mural turn reaches its stored mark limit"),
  mural_paper_full: P("Keep your mural, then try fresh paper.", "guide", "family mural reaches its stored turn limit; existing picture stays intact"),
  family_mural_pick_friend: P("Who will make it with you?", "guide", "family co-play mural"),
  family_mural_your_turn: P("Your turn, Rayna!", "guide", "family co-play mural"),
  family_mural_family_turn: P("Now pass the pen. Add your part!", "guide", "family co-play mural"),
  family_mural_again: P("Would you like another turn?", "guide", "family co-play mural"),
  family_mural_name_ribbon: P("Would you like to add a name?", "guide", "family co-play mural"),
  family_mural_saved: P("You made this together!", "guide", "family co-play mural"),
  family_mural_garden: P("Let's make a family garden.", "guide", "family co-play mural"),
  family_mural_rainbow_home: P("A rainbow over our home.", "guide", "family co-play mural"),
  family_mural_heart: P("A big heart for our family.", "guide", "family co-play mural"),
  family_mural_blank: P("What shall we make today?", "guide", "family co-play mural"),

  prewrite_rain: P("Pull the rain down.", "guide", "gentle game cue"),
  prewrite_path: P("Take a little walk across.", "guide", "gentle game cue"),
  prewrite_hill: P("Up the hill, and down we go.", "guide", "gentle game cue"),
  prewrite_rainbow: P("Swoop over the rainbow.", "guide", "gentle game cue"),
  prewrite_bubble: P("Round and round, a little bubble.", "guide", "gentle game cue"),
  prewrite_rocket_trail: P("Whoosh! Follow the rocket.", "guide", "gentle game cue"),
  prewrite_cross: P("Down, and then across.", "guide", "gentle game cue"),
  ui_scribble_reset: P("Oops, a little wiggle! Let's start fresh, right here.", "guide", "clear a high-confidence scribble in guided tracing; keep the current letter"),
  ui_choose_next: P("What shall we try next?", "guide", "optional next pictured activity after Garden or Meadow; no camera instruction"),
  family_hello_grandpa: P("Dada's here! Let's show him your picture.", "guide", "gentle game cue"),
  grandpa_proud: P("Dada loves seeing what you make.", "guide", "gentle game cue"),

  // ---------------------------------------------------------------- praise: light (tier 1)
  praise_1_1: P("There you go!", "guide", "tier 1 result, recognisable try"),
  praise_1_2: P("Look what you made.", "guide", "tier 1 result"),
  praise_1_3: P("You found it!", "guide", "tier 1 result"),
  praise_1_4: P("That's your mark.", "guide", "tier 1 result"),
  praise_1_5: P("I see it!", "guide", "tier 1 result"),
  praise_1_6: P("You kept going.", "guide", "tier 1 result"),

  // ---------------------------------------------------------------- praise: mid (tier 2)
  praise_2_1: P("Oh, I like that!", "guide", "tier 2 result, a good trace"),
  praise_2_2: P("That's lovely.", "guide", "tier 2 result"),
  praise_2_3: P("You're getting the hang of it.", "guide", "tier 2 result"),
  praise_2_4: P("Look at your picture!", "guide", "tier 2 result"),
  praise_2_5: P("Yes, just like that.", "guide", "tier 2 result"),
  praise_2_6: P("You made it your own.", "guide", "tier 2 result"),

  // ---------------------------------------------------------------- praise: big (tier 3)
  praise_3_1: P("Oh, Rayna! Look at that!", "guide", "tier 3 result, the big celebration"),
  praise_3_2: P("You did it!", "guide", "tier 3 result"),
  praise_3_3: P("Let's keep that one.", "guide", "tier 3 result"),
  praise_3_4: P("Look what your hands can do.", "guide", "tier 3 result"),
  praise_3_5: P("Ooh, that's beautiful!", "guide", "tier 3 result"),
  praise_3_6: P("That one's going in your book.", "guide", "tier 3 result"),

  // ---------------------------------------------------------------- retry (never negative)
  retry_1: P("Let's try a little more.", "guide", "tier 0 result, too little ink"),
  retry_2: P("Start here, at the little dot.", "guide", "tier 0 result, she started somewhere else"),
  retry_3: P("Take your time. You can try again.", "guide", "tier 0 result"),

  // ---------------------------------------------------------------- words
  word_RAYNA: P("Rayna. That's you!", "guide", "Unicorn Meadow presents the word RAYNA"),
  word_ISHAN: P("Ishan.", "guide", "Unicorn Meadow presents the word ISHAN"),
  word_VEER: P("Veer.", "guide", "Unicorn Meadow presents the word VEER"),
  word_MAMA: P("Mama.", "guide", "Unicorn Meadow presents the word MAMA"),
  word_DADDY: P("Daddy.", "guide", "Unicorn Meadow presents the word DADDY"),
  word_MASA: P("Masa.", "guide", "Optional Veer family word; whole-word recording is not yet available"),
  word_BA: P("Ba.", "guide", "Unicorn Meadow presents the word BA"),
  word_DADA: P("Dada.", "guide", "Unicorn Meadow presents the word DADA"),
  word_BOO: P("Boo! A friendly ghost.", "guide", "Gentle pictured short Halloween word; visual/silent fallback until an approved clip exists"),
  word_GHOST: P("Ghost.", "guide", "Original friendly ghost illustration, not a child drawing"),
  word_CANDY: P("Candy.", "guide", "Pictured Halloween word; uses visual/silent fallback until an approved clip exists"),
  word_PUMPKIN: P("Pumpkin.", "guide", "Pictured Halloween word; uses visual/silent fallback until an approved clip exists"),
  word_CAT: P("Cat. Meow!", "guide", "Unicorn Meadow presents the word CAT"),
  word_SUN: P("Sun.", "guide", "Unicorn Meadow presents the word SUN"),
  word_DOG: P("Dog. Woof!", "guide", "Unicorn Meadow presents the word DOG"),
  word_HAT: P("Hat.", "guide", "Unicorn Meadow presents the word HAT"),
  word_BUG: P("Bug.", "guide", "Unicorn Meadow presents the word BUG"),
  word_BEE: P("Bee. Buzz!", "guide", "Unicorn Meadow presents the word BEE"),
  word_PIG: P("Pig. Oink!", "guide", "Unicorn Meadow presents the word PIG"),
  word_COW: P("Cow. Moo!", "guide", "Unicorn Meadow presents the word COW"),
  word_BUS: P("Bus.", "guide", "Unicorn Meadow presents the word BUS"),
  word_MOM: P("Mom.", "guide", "Unicorn Meadow presents the word MOM"),
  word_DAD: P("Dad.", "guide", "Unicorn Meadow presents the word DAD"),

  // ---------------------------------------------------------------- drawing objects
  "object_friendlyghost": P("A friendly ghost!", "guide", "Separate guide, never a replacement for a saved ghost"),
  object_skeleton: P("A friendly skeleton!", "guide", "Simple bones; face belongs to the child"),
  object_witchhat: P("A witch hat!", "guide", "Pointed hat with an optional ribbon"),
  object_spider: P("A spider with eight legs.", "guide", "Guided spider drawing; face is optional"),
  object_pumpkin: P("A pumpkin! You can give it a face.", "guide", "Guided pumpkin drawing; optional face belongs to the child"),
  object_sun: P("A sun! Bright and warm.", "guide", "Rainbow Bridge names the object before a drawing"),
  object_rainbow: P("A rainbow!", "guide", "Rainbow Bridge names the object"),
  object_flower: P("A pretty flower.", "guide", "Rainbow Bridge names the object"),
  object_house: P("A cozy little house.", "guide", "Rainbow Bridge names the object"),
  object_balloon: P("A big round balloon!", "guide", "Rainbow Bridge names the object"),
  object_caterpillar: P("A wiggly caterpillar!", "guide", "Rainbow Bridge names the object"),
  object_cat: P("A soft little cat. Meow!", "guide", "Rainbow Bridge names the object"),
  object_butterfly: P("A butterfly with pretty wings.", "guide", "Rainbow Bridge names the object"),
  object_fish: P("A splashy little fish!", "guide", "Rainbow Bridge names the object"),
  object_unicorn: P("A magical unicorn!", "guide", "Rainbow Bridge names the object"),
  object_star: P("A twinkly star.", "guide", "Rainbow Bridge names the object"),
  object_heart: P("A heart, full of love.", "guide", "Rainbow Bridge names the object"),
  object_icecream: P("Yummy ice cream!", "guide", "Rainbow Bridge names the object"),
  object_tree: P("A tall green tree.", "guide", "Rainbow Bridge names the object"),
  object_veer: P("It is Veer! Your cousin.", "guide", "Rainbow Bridge names the object"),

  // ---------------------------------------------------------------- ui and guidance
  ui_hi_rayna: P("Hi, {name}! Ready to play?", "guide", "map, first line of every session"),
  ui_caterpillars_hungry: P("The caterpillars are hungry!", "guide", "map, when the garden is due"),
  ui_lets_feed: P("Let's make some marks for our caterpillar.", "guide", "entering Caterpillar Garden"),
  ui_trace_the_letter: P("Follow the little path.", "guide", "tracing activity starts"),
  ui_start_at_the_dot: P("Start at the yellow dot.", "guide", "the start dot pulses, before the first stroke"),
  ui_butterfly_hatched: P("Oh! Look who's here!", "guide", "a caterpillar is full and hatches"),
  ui_unicorn_lost_colors: P("Our unicorn is ready to play.", "guide", "entering Unicorn Meadow"),
  ui_write_your_name: P("Let's write your name!", "guide", "the word RAYNA is offered"),
  ui_stripe_back: P("A little more rainbow!", "guide", "a word is finished and a mane stripe colors in"),
  ui_all_colors_back: P("Look at all those colors!", "guide", "the unicorn is fully coloured"),
  ui_lets_draw: P("What shall we draw today?", "guide", "entering Rainbow Bridge"),
  ui_dot_to_dot: P("Follow the little dots.", "guide", "drawing step 1"),
  ui_trace_the_ghost: P("Follow the soft lines.", "guide", "drawing step 2"),
  ui_now_you_draw: P("Now you can make your own.", "guide", "drawing step 3, free draw beside the model"),
  ui_sticker_earned: P("A new sticker for your book!", "guide", "a sticker is added"),
  ui_your_turn_rayna: P("Your turn, {name}!", "guide", "treehouse pass-the-pen, Rayna's turn"),
  ui_your_turn_veer: P("Your turn, Veer!", "guide", "treehouse pass-the-pen, Veer's turn"),
  ui_show_mama_papa: P("Let's show Mama and Daddy.", "guide", "the gallery opens"),
  ui_soon: P("That one is still sleeping, soon!", "guide", "she taps a region the parent has locked"),
  ui_undo: P("Let's take that bit back.", "guide", "the undo button is tapped"),
  ui_clear: P("A fresh page.", "guide", "the clear button is tapped"),
  ui_show_me: P("Watch this little path.", "guide", "the show-me button is tapped, before the ghost hand"),
  ui_home: P("Back to the valley!", "guide", "returning to the map"),

  // ---------------------------------------------------------------- grandma
  grandma_time_for_break: P(
    "{name}, sweetheart, time for a little break. Look at everything you made!",
    "grandma", "the soft session end, after the current turn finishes"),
  grandma_hello: P("Hello, my sweet girl!", "grandma", "entering Ba's House"),
  grandma_proud: P("Look at everything you made.", "grandma", "Ba's House, after the gallery is shown"),
  grandma_hug: P("Here comes a big hug!", "grandma", "the hug milestone sticker"),
  grandma_goodnight: P("Goodnight, sweetheart. Sweet dreams.", "grandma", "leaving Ba's House at session end"),

  // ---------------------------------------------------------------- veer
  veer_cheer_1: P("Go Rayna go!", "veer", "treehouse, while Rayna traces"),
  veer_cheer_2: P("Yay!", "veer", "treehouse, after a good result"),
  veer_cheer_3: P("You can do it!", "veer", "treehouse, after a tier 0 or 1 result"),
  veer_cheer_4: P("High five!", "veer", "treehouse, the high-five milestone"),

  // ---------------------------------------------------------------- mama and papa
  mama_love: P("I love you, Rayna.", "mama", "gallery, tapping Mama's heart cameo"),
  papa_love: P("I love you so much, Rayna.", "papa", "gallery, tapping Daddy's heart cameo"),
  family_hello_mama: P("Mama's here to see your picture.", "mama", "Ba's House, tapping Mama"),
  family_hello_papa: P("Daddy's here to see what you made.", "papa", "Ba's House, tapping Daddy"),
  family_hello_grandma: P("Hello, sweet girl!", "grandma", "Ba's House, tapping Ba"),
  family_hello_veer: P("Hi Rayna! Want to play?", "veer", "Ba's House, tapping Veer"),
};

// ------------------------------------------------------------------ generated letter lines

for (const ch of UPPER) {
  const g = GLYPHS[ch] || {};
  PHRASES["letter_" + ch] = P(ch, "guide", "the letter " + ch + " is named (speech.letter)");
  PHRASES["sound_" + ch] = P(
    ch + " says " + (g.sound || ch.toLowerCase()) + ", like " + (EXAMPLE[ch] || ch.toLowerCase()) + ".",
    "guide", "the phonic for " + ch + ", 250 ms after letter_" + ch);
}
for (const ch of LOWER) {
  PHRASES["lower_" + ch] = P("Little " + ch + ".", "guide", "the lowercase " + ch + " is named (speech.letter)");
}
for (const d of DIGITS) {
  const g = GLYPHS[d] || {};
  const nm = g.name || d;
  PHRASES["digit_" + d] = P(nm.charAt(0).toUpperCase() + nm.slice(1) + ".", "guide",
    "the digit " + d + " is named (speech.letter)");
}

// ------------------------------------------------------------------ bands

export const PRAISE = {
  1: ["praise_1_1", "praise_1_2", "praise_1_3", "praise_1_4", "praise_1_5", "praise_1_6"],
  2: ["praise_2_1", "praise_2_2", "praise_2_3", "praise_2_4", "praise_2_5", "praise_2_6"],
  3: ["praise_3_1", "praise_3_2", "praise_3_3", "praise_3_4", "praise_3_5", "praise_3_6"],
};

export const RETRY = ["retry_1", "retry_2", "retry_3"];

/** Speakers a clip folder or a recording may exist for. */
export const SPEAKERS = ["guide", "grandma", "veer", "mama", "papa"];

// ------------------------------------------------------------------ pickers (pure)

function pickFrom(list, last) {
  if (!list || !list.length) return null;
  if (list.length === 1) return list[0];
  const pool = list.filter((k) => k !== last);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** A praise key from the tier band, never the same key twice in a row. */
export function pickPraise(tier, last) {
  const band = PRAISE[tier] || PRAISE[1];
  return pickFrom(band, last);
}

/** A gentle retry key, never the same key twice in a row. */
export function pickRetry(last) {
  return pickFrom(RETRY, last);
}

/** "Hi {name}!" -> "Hi Rayna!". Missing vars fall back to the child's name. */
export function fill(text, vars) {
  const v = { name: "Rayna", ...(vars || {}) };
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
}

/** The line for a key, interpolated. Returns "" for an unknown key (never throws). */
export function textFor(key, vars) {
  const p = PHRASES[key];
  return p ? fill(p.text, vars) : "";
}

/** The speaker for a key, 'guide' when unknown. */
export function speakerFor(key) {
  return (PHRASES[key] && PHRASES[key].speaker) || "guide";
}

export default PHRASES;
