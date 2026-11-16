const P = (text, note) => ({ text, speaker: "guide", note });

export const STUDIO_PHRASES = Object.freeze({
  art_lift_to_continue: P("Lift up, then draw another line.", "free art reaches the stored sample limit; accepted ink stays intact"),
  studio_paper_full: P("Keep your picture, then try a fresh page.", "Studio reaches its stored mark limit; save or undo remains available"),
  studio_intro: P("This paper is all yours.", "enter Open Rainbow Studio on a blank canvas"),
  studio_brush: P("Pick a color, then make any mark you like.", "choose the Studio brush"),
  studio_stamp: P("Tap the paper to add a friend or picture.", "choose Studio stamps"),
  studio_clear_ask: P("Keep your picture, or wipe the paper clean?", "first clear tap opens the calm picture confirmation"),
  studio_clear_done: P("A fresh page, ready when you are.", "clear confirmation accepted"),
  studio_saved: P("Your picture is safe with your other creations.", "Studio picture saved locally"),
  studio_pictures: P("Here are your pictures. Tap one when you want to add more.", "open the child's Studio picture tray"),
  studio_remix: P("Here it is again. What would you like to add?", "reopen a saved Studio picture"),
  studio_empty: P("One little mark or picture is enough to save.", "save tapped on an empty Studio page"),
});

export default STUDIO_PHRASES;
