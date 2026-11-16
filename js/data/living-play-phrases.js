// Contextual guides for the five living-play destinations. No automatic speech:
// controllers own visit/trial cancellation and the pictured consequence timing.
import { GARDEN_CAFE_PHRASES } from './garden-cafe-phrases.js';
import { CAT_ROLL_DAY_PHRASES } from './cat-roll-day-phrases.js';
import { RIVER_DAY_PHRASES } from './river-day-phrases.js';
const P = (text, note) => Object.freeze({ text, speaker: 'guide', note });

export const LIVING_PLAY_PHRASES = Object.freeze({
  ...GARDEN_CAFE_PHRASES,
  ...CAT_ROLL_DAY_PHRASES,
  ...RIVER_DAY_PHRASES,
  living_workshop_picture: P('Tap Picture to choose one of your pictures.', 'Workshop: no picture selected; Picture chooser is enabled.'),
  living_workshop_wheels: P('Tap the wheels to put them under your picture.', 'Workshop: rolling picture selected, wheels not attached.'),
  living_workshop_float: P('Tap the float to put it under your picture.', 'Workshop: floating picture selected, float not attached.'),
  living_workshop_puppet: P('Tap the handle to make your picture a puppet.', 'Workshop: puppet picture selected, handle not attached.'),
  living_workshop_ready: P('Your toy is ready. Tap Try to play with it.', 'Workshop: successful assembly shown; Try is enabled.'),
  living_workshop_roll: P('Tap a place on the table. Your toy will roll there.', 'Workshop: rolling toy in Try mode.'),
  living_workshop_swim: P('Tap a place in the water. Your toy will float there.', 'Workshop: floating toy in Try mode.'),
  living_workshop_move: P('Tap a place to move your picture puppet.', 'Workshop: puppet in Try mode.'),

  living_rolling_picture: P('Tap Toy to choose a picture toy.', 'Rolling: no active toy; Toy chooser is enabled.'),
  living_rolling_intro: P('Tap Try to send this toy down the hill.', 'Rolling: active toy on the hill, no trial in progress; neutral for starter or owned toy.'),
  living_rolling_help: P('Tap the mat, then a new place. Tap Try to see where the toy stops.', 'Rolling: landing situation, visible landing mat; explicit Help.'),
  living_rolling_blocked: P('The block stopped the toy. Move the block and try again.', 'Rolling: completed blocked trial with visible toy/block contact.'),
  living_rolling_landed: P('The toy stopped on the mat. Where shall the mat go next?', 'Rolling: completed landed trial, toy visibly on the mat.'),
  living_rolling_short: P('The toy stopped before the mat. Try a bigger push, or move the mat.', 'Rolling: completed short trial; pictured push and mat controls.'),
  living_rolling_past: P('The toy went past the mat. Try a smaller push, or move the mat.', 'Rolling: completed past trial; pictured push and mat controls.'),
  living_rolling_stop: P('The toy stopped here. Change the hill or the push and try again.', 'Rolling: completed free trial, no landing goal.'),

  living_river_picture: P('Tap Picture to choose a picture for the river.', 'River: no picture selected; Picture chooser is enabled.'),
  living_river_attach: P('Tap the float to put it under your picture.', 'River: selected picture without attached float.'),
  living_river_launch: P('Tap Launch to send your picture along the river.', 'River: float attached; Launch is enabled.'),
  living_river_help: P('Tap the dock, then a new place in the water. Launch your picture again.', 'River: attached float; explicit Help; dock supports tap then tap placement.'),
  living_river_still: P('The water is still. Tap Water to give your float a gentle ride.', 'River: completed still-water trial; Water chooser is enabled.'),
  living_river_stone: P('The stone stopped your float. Move the stone and try again.', 'River: completed stone contact; visible float stopped at stone.'),
  living_river_dock: P('Your picture reached the dock. Move the dock for a different journey.', 'River: completed dock arrival with visible dock contact.'),
  living_river_mama: P('Your float reached Mama at the dock.', 'River: completed mama outcome; Mama and float contact visibly shown at the dock.'),
  living_river_bank: P('Your float reached the river bank. Tap Water to choose another direction.', 'River: completed bank arrival; Water chooser offers direction choices.'),
  living_river_drift: P('Your picture floated this far. Move its starting place and try again.', 'River: completed drifting trial; picture start can be repositioned.'),

  living_music_intro: P('Tap an instrument to start your tune. Then tap Play to hear it.', 'Music: empty tune; instrument buttons are enabled.'),
  living_music_change: P('Tap a note, then an instrument to change its sound.', 'Music: notes exist; first return or explicit Help for changing a tune.'),
  living_music_together: P('Tap Mama for a steady beat. Tap Veer to hear your tune again.', 'Music: explicit together Help; Mama pulse and Veer echo controls are visible.'),
  living_music_done: P('Your tune has finished. Tap a note to change its sound.', 'Music: full performance ended; final instrument tail has stopped.'),

  living_animal_seek: P('Tap a hiding place and look for the cat.', 'Animal: independent search; do not name or point to the actual hidden location.'),
  living_animal_hide: P('Choose a place for the cat. Tap Ready to hide it for your friend.', 'Animal: choose-hide phase; open place choices and Ready are visible.'),
  living_animal_partner: P('Now your friend can look. Tap a hiding place to open it.', 'Animal: partner-search phase after Ready; all hiding places are closed.'),
  living_animal_leaves: P('You found the cat behind the leaves.', 'Animal: revealed cat at leaf; leaves open and cat visibly shown.'),
  living_animal_basket: P('You found the cat inside the basket.', 'Animal: revealed cat at basket; basket open and cat visibly shown.'),
  living_animal_blanket: P('You found the cat under the blanket shelter.', 'Animal: revealed cat at shelter; blanket lifted and cat visibly shown.'),
  living_animal_corner: P('Move the bed to make a cozy corner. Tap Rest for the cat to try it.', 'Animal: corner invitation; bed supports tap placement and Rest is visible.'),
  living_animal_visit: P('Tap the cat to say hello. Tap the bed when it is time to rest.', 'Animal: visit invitation; cat and bed are visible and available.'),
  living_animal_rest: P('The cat is resting on your cushion.', 'Animal: successful rest reaction; cat visibly on cushion after movement finishes.'),
  living_animal_space: P('The cat needs more room. Move something away from the bed, then try Rest.', 'Animal: space reaction; nearby objects block rest and Move things is available.'),
  living_animal_picture: P('The cat came to your picture. Where shall your picture go next?', 'Animal: picture reaction; own picture and cat visibly together.'),
  living_animal_move: P('Tap an object, then tap its new place. You can drag it too.', 'Animal: arranging mode; explicit Help only.'),
});

// These maps resolve authored outcomes, never infer what a child drew or knew.
export const LIVING_PLAY_OUTCOME_KEYS = Object.freeze({
  'rolling-run': Object.freeze({ blocked: 'living_rolling_blocked', landed: 'living_rolling_landed', short: 'living_rolling_short', past: 'living_rolling_past', stop: 'living_rolling_stop' }),
  'river-run': Object.freeze({ still: 'living_river_still', stone: 'living_river_stone', dock: 'living_river_dock', mama: 'living_river_mama', bank: 'living_river_bank', drifting: 'living_river_drift' }),
  'animal-friends': Object.freeze({ leaf: 'living_animal_leaves', basket: 'living_animal_basket', shelter: 'living_animal_blanket', rest: 'living_animal_rest', space: 'living_animal_space', picture: 'living_animal_picture' }),
});

/** Current first action / Help, after the controller has loaded and painted. */
export function livingPlayGuideKey(route, scene, { help = false, playing = false, arranging = false } = {}) {
  if (!scene) return null;
  if (route === 'toy-workshop') {
    if (!scene.asset) return 'living_workshop_picture';
    if (!scene.assembled) return { rolling: 'living_workshop_wheels', floating: 'living_workshop_float', puppet: 'living_workshop_puppet' }[scene.behavior] || null;
    if (playing) return { rolling: 'living_workshop_roll', floating: 'living_workshop_swim', puppet: 'living_workshop_move' }[scene.behavior] || null;
    return 'living_workshop_ready';
  }
  if (route === 'rolling-run') return !scene.instance ? 'living_rolling_picture' : help && scene.situation === 'landing' ? 'living_rolling_help' : 'living_rolling_intro';
  if (route === 'river-run') return !scene.instance ? 'living_river_picture' : !scene.attached ? 'living_river_attach' : help ? 'living_river_help' : 'living_river_launch';
  if (route === 'music-band') return !scene.notes?.length ? 'living_music_intro' : help && scene.invitation === 'together' ? 'living_music_together' : 'living_music_change';
  if (route === 'animal-friends') {
    if (arranging) return 'living_animal_move';
    if (scene.invitation === 'seek') {
      if (scene.phase === 'choose-hide') return 'living_animal_hide';
      if (scene.phase === 'partner-search') return 'living_animal_partner';
      if (scene.phase === 'revealed' && scene.places?.some(place => place.id === scene.cat?.place && place.open)) return LIVING_PLAY_OUTCOME_KEYS['animal-friends'][scene.cat?.place] || 'living_animal_seek';
      return 'living_animal_seek';
    }
    return { corner: 'living_animal_corner', visit: 'living_animal_visit' }[scene.invitation] || null;
  }
  return null;
}
