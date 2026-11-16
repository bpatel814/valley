// Invitations offer a beginning. Children choose the cast, order and ending.
export const PLAY_STAGE_PERFORMANCES = Object.freeze([
  { id: "gift", label: "A picture surprise", icon: "gift", cue: "play_stage_performance_gift", invitation: "Wrap your picture. Give it to a friend. Open the surprise!", verbs: ["wrap-prop", "give-prop", "unwrap-prop"] },
  { id: "parade", label: "Our family parade", icon: "parade", cue: "play_stage_parade_route", invitation: "Choose a leader. Tap a trail. Go together!", verbs: ["parade-stop", "give-prop", "hop-actor"] },
  { id: "free", label: "My own show", icon: "record", cue: "play_stage_performance_free", invitation: "Record your own show. Stop, then play it back.", verbs: [] },
]);

export function playStagePerformanceInvitation(id) {
  return PLAY_STAGE_PERFORMANCES.find((entry) => entry.id === id) || PLAY_STAGE_PERFORMANCES[2];
}

export function playStagePerformanceProgress(performance) {
  const invitation = playStagePerformanceInvitation(performance?.invitationId);
  const verbs = new Set((performance?.beats || []).map((beat) => beat.type));
  // A visual memory of what happened, never a score or a requirement to finish.
  return invitation.verbs.map((verb) => ({ verb, happened: verbs.has(verb) }));
}
