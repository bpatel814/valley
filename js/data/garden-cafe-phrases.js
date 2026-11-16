// Café cues are owned by actual visit, action and consequence guards.
const P = (text, note) => Object.freeze({ text, speaker: 'guide', note });
export const GARDEN_CAFE_PHRASES = Object.freeze({
  living_cafe_intro: P("Tap a person to choose who comes. Tap Food to choose our meal.", "Settled café entry; person and Food are available."),
  living_cafe_move: P("Choose a place, then tap where it goes.", "Pictured arrange chooser and tap placement."),
  living_cafe_share: P("Tap a person or their plate to share this fruit.", "An actual uneaten fruit is selected; receiving targets are shown."),
  living_cafe_halves: P("Now you have two halves. Who shall we share them with?", "Successful cut of one actual whole fruit; two halves exist."),
  living_cafe_visitor: P("There is a place for one more friend.", "Visitor has actually joined and the new place is visible."),
  living_cafe_small: P("We can keep this gathering small.", "Extra visitor removed; remaining meal stays intact."),
  living_cafe_rhythm: P("Tap a beat to change its sound. Then tap Play.", "Actual six-beat rhythm chooser; Play is available."),
  living_cafe_next_beat: P("Tap Next when you're ready for the next beat.", "Child-paced welcome only, after the first instrument is quiet and Next remains available; canceled by Next, Stop or interruption."),
  living_cafe_finished: P("Our welcome is played. Change a beat, or keep our café.", "Both captured turns and final instrument tail fully complete."),
  living_cafe_saved: P("Your café is kept. We can come back and change it.", "Persistent café Keep succeeds, never temporary/write failure."),
  living_cafe_sign: P("Your own picture welcomes our friends.", "Exact source picture is successfully assigned and visible on the sign."),
  living_cafe_welcome: P("Who shall we welcome today? Make a place or keep our gathering small.", "Optional Make room situation; actual visitor choices visible."),
  living_cafe_meal: P("One whole fruit can become two halves. Or choose more fruit. You decide.", "Optional Share a meal situation; Cut and More preserve quantity."),
  living_cafe_music: P("Shall our welcome be lively or gentle? Change a sound or leave a quiet beat.", "Optional welcome rhythm situation with actual editable notes and rests."),
});
