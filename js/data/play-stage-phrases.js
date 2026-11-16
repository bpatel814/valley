// Brief optional narration for family puppet play. Manipulating objects stays quiet.
// Authored triggers and repeat policies: docs/design/play-stage-narration.json.

const P = (text, note) => ({ text, speaker: "guide", note });

export const PLAY_STAGE_PHRASES = Object.freeze({
  living_story_curtain: P("Our friend is waiting at the curtain. Shall they come out, or peek?", "Only after the child deliberately begins the curtain story and the actual friend is waiting. Replay from contextual Help; cancel on another action, leave, mute or break."),
  living_story_sharing: P("One toy, two friends. We can pass it over, or put it down to play together.", "After the child chooses actual participants and one actual toy for the sharing story. The same toy is in the first friend's hands."),
  living_story_ending: P("How will your story end? Keep the toy with a friend, or leave it for another story.", "Only after the child chooses the actual prop and friend for the ending; picture display is an additional pictured option."),
  living_story_hello: P("Hello, friend. Your story has a new arrival.", "Only after the waiting actor actually comes out through a deliberate story choice."),
  living_story_peek: P("There you are! A peek from the other side.", "Only after the waiting actor actually peeks from the other side of the booth."),
  living_story_pass: P("Now the other friend has a turn with the same toy.", "Only after ownership of the actual chosen prop passes to the other participant."),
  living_story_together: P("The toy is between our friends. They can play together.", "Only after the actual chosen prop is placed at a usable point between the participants."),
  living_story_keep: P("You chose a friend to keep the toy.", "Only after the actual chosen prop is held by the chosen ending actor."),
  living_story_leave: P("The toy is waiting here for another story.", "Only after the actual chosen prop is put down in the room."),
  living_story_display: P("Your picture is on display. Your original stays unchanged.", "Only after the exact chosen picture is displayed in the booth; no source PNG is rewritten."),
  play_stage_invite: P("Let's make up a story.", "The first-ever playable stage entry finishes its curtain swish. Once per profile. Repeat only from an explicit hear-again or help action."),
  play_stage_choose_stage_item: P("What should we play with?", "The child opens the shared toy and picture basket for the first time in a visit. At least one real choice is visible. Repeated browsing stays quiet."),
  play_stage_choose_person: P("Who's coming to play?", "The child opens the people picker for the first time in a visit. First people-picker open per visit. Repeated browsing stays quiet."),
  play_stage_picture_selected: P("Here's your picture.", "A personal picture selection finishes loading into its stage card. First successful personal-picture import per visit. Later imports use visual and soft placement feedback only."),
  play_stage_actor_revealed: P("Peekaboo! There you are.", "The first hidden actor completes a reveal from the booth in a visit. First completed reveal per visit. Later hide-and-reveal play uses curtain sound and motion only."),
  play_stage_kept: P("We kept your story.", "A Keep operation succeeds. First successful Keep per visit. Later successful keeps use the save sound and visible postcard confirmation only."),
  play_stage_reopened: P("Here's your story again.", "A kept postcard finishes reopening as editable play. Once per successful postcard reopen. Do not speak during ordinary orientation or reload restoration."),
  play_stage_caregiver_next: P("What might happen next?", "A caregiver or child deliberately activates the optional conversation prompt. Only on explicit request. Never autoplay and never repeat until requested again."),
  play_stage_capacity_swap: P("Let's put one back.", "The child tries to add beyond the three-actor or four-prop capacity and pictured swap choices are visible. Once per visit; repeated full-stage browsing stays quiet."),
});

export default PLAY_STAGE_PHRASES;
