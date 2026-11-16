// Exact authored cues for optional Message Day play. No OS speech fallback.
export const MESSAGE_DAY_PHRASES = Object.freeze({
  living_message_intro: { text: "Let's make a message that helps our friends.", speaker: 'guide', note: 'Explicit Messages Playday entry; not on ordinary paper return.' },
  living_message_sign: { text: 'How will friends find our café? A picture or your marks can be our sign.', speaker: 'guide', note: 'Explicit sign beginning or Help on its editable paper.' },
  living_message_invitation: { text: 'Who shall we invite? Choose a friend and make a message.', speaker: 'guide', note: 'Explicit invitation beginning or Help on its editable paper.' },
  living_message_changed: { text: "This time, something is different. Let's make a new message. The first one stays safe.", speaker: 'guide', note: 'Explicit changed-paper beginning or Help; earlier original remains immutable.' },
  living_message_use: { text: 'Shall this be our sign, or an invitation for a friend?', speaker: 'guide', note: 'Explicit pictured use chooser on contentful owned paper.' },
  living_message_sign_ready: { text: 'Your whole sign is ready. Bring it to our café, or change it first.', speaker: 'guide', note: 'Sign folding consequence or explicit Help; not automatic on return.' },
  living_message_sign_arrival: { text: 'Your picture can be our new sign. You can keep our sign as it is, too.', speaker: 'guide', note: 'Explicit carried-sign arrival choice before replacing the current sign.' },
  living_message_invite_arrival: { text: 'Your invitation is here. Welcome your friend, or keep our gathering as it is.', speaker: 'guide', note: 'Explicit invitation arrival choice before changing the current gathering.' },
  living_message_sign_used: { text: 'Your whole picture is our café sign. We can change it again.', speaker: 'guide', note: 'Actual accepted sign write; no success cue after a refused write.' },
  living_message_invite_used: { text: "Your friend can join our café. Let's make room together.", speaker: 'guide', note: 'Actual accepted invitation write; no claim that a duplicate friend arrived.' },
});
