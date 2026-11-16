// Eight optional prompts that make a saved picture, story, or mural easier to share.
// They deliberately have no correctness state, progression, recording, or reward.

export const SHOW_AND_TELL_CONTEXTS = Object.freeze(["picture", "story", "mural"]);

const item = (id, icon, phraseKey, label) => Object.freeze({
  id, icon, phraseKey, label, contexts: SHOW_AND_TELL_CONTEXTS,
});

export const SHOW_AND_TELL_PROMPTS = Object.freeze([
  item("describe", "talk", "show_and_tell_describe", "tell about a part"),
  item("find", "find", "show_and_tell_find", "find the same shape"),
  item("color", "palette", "show_and_tell_color", "notice a color"),
  item("move", "move", "show_and_tell_move", "pretend to move"),
  item("next", "next", "show_and_tell_next", "tell what happens next"),
  item("trade", "trade", "show_and_tell_trade", "take turns choosing"),
  item("how", "spark", "show_and_tell_how", "tell how you made it"),
  item("feel", "heart", "show_and_tell_feel", "share a feeling"),
]);

export function normaliseShowAndTellContext(context) {
  return SHOW_AND_TELL_CONTEXTS.includes(context) ? context : "picture";
}

export function promptsForShowAndTell(context = "picture") {
  const clean = normaliseShowAndTellContext(context);
  return SHOW_AND_TELL_PROMPTS.filter((prompt) => prompt.contexts.includes(clean));
}

export function showAndTellPrompt(context = "picture", index = 0) {
  const prompts = promptsForShowAndTell(context);
  if (!prompts.length) return null;
  const number = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
  return prompts[Math.max(0, Math.min(prompts.length - 1, number))];
}

export default SHOW_AND_TELL_PROMPTS;
