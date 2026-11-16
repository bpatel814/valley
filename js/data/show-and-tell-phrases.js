// Optional, locally spoken prompts for looking at a saved creation together.
// These are design inferences from the learning evidence, not assessment items.

const P = (text, note) => ({ text, speaker: "guide", note });

export const SHOW_AND_TELL_INTRO_KEY = "show_and_tell_intro";

export const SHOW_AND_TELL_PHRASES = Object.freeze({
  show_and_tell_intro: P("Want to show someone your picture? Tap an idea, or close this card.", "Optional invitation when a saved picture, story, or mural is open"),
  show_and_tell_describe: P("Tell someone about one part you made or chose.", "Describe prompt"),
  show_and_tell_find: P("Can you find something near you with the same shape?", "Find-a-shape prompt"),
  show_and_tell_color: P("What color do you notice first?", "Color noticing prompt"),
  show_and_tell_move: P("Can you pretend to move like something in your picture?", "Pretend-motion prompt"),
  show_and_tell_next: P("What could happen next?", "Story extension prompt"),
  show_and_tell_trade: P("You choose one part. Then someone else chooses a part.", "Turn-taking explanation prompt"),
  show_and_tell_how: P("Can you tell how you made one mark or choice?", "Process explanation prompt"),
  show_and_tell_feel: P("How does this picture make you feel?", "Feeling-word prompt"),
});

export default SHOW_AND_TELL_PHRASES;
