// Exact local Heart recordings. Controllers must show these actual consequences.
const cue = (text, note) => Object.freeze({ text, speaker: 'guide', note });
export const CAT_ROLL_DAY_PHRASES = Object.freeze({
  living_cat_day_resting_place: cue('Our cat can rest in its cozy bed, or underneath the shade. You choose.', 'Explicit resting-place entry or Help; bed and shade choices available.'),
  living_cat_day_quiet_corner: cue('Ishan is here. We can play together, or make a quiet corner for the cat.', 'Ishan actually present; play and quiet alternatives available.'),
  living_cat_day_little_welcome: cue('Who shall visit our cat? Choose a friend, and see where they meet.', 'Explicit little-welcome entry before visitor choice; cat revealed.'),
  living_cat_day_bed: cue('Our cat is resting in the bed. The corner is still yours to change.', 'Visible settled bed rest; arrangement remains editable.'),
  living_cat_day_shade: cue('Our cat has settled underneath the shade.', 'Visible settled rest underneath the canopy.'),
  living_cat_day_quiet: cue('A quiet visit. Our friend can watch while the cat rests.', 'Visitor actually watching while the visible cat rests.'),
  living_cat_day_play: cue('They are playing together. You can keep visiting, or make a quiet place.', 'Actual visible joint play; quiet alternatives available.'),
  living_cat_day_greet: cue('Our cat has come over to say hello.', 'Actual visible cat approach to the chosen visitor.'),
  living_cat_day_leave: cue('Bye for now. Our cat and the corner you made are still here.', 'Visitor actually departed; cat and arranged corner retained.'),
  living_roll_day_prediction: cue('Where do you think our toy will stop? Choose a place, then let it roll.', 'Explicit prediction entry or Help before choosing; Try opens pictured choices.'),
  living_roll_day_changed_route: cue('Something can change on this route. Choose a new block or a different landing place.', 'Explicit changed-route entry before accepting a pictured condition.'),
  living_roll_day_comparison: cue('Keep this first roll. Change something, and try another way. We can look at both.', 'First real trial captured, second not yet captured.'),
  living_roll_day_predicted: cue('That is your guess. Now let the toy roll and see where it stops.', 'Explicit pictured prediction accepted; actual Try still available.'),
  living_roll_day_changed: cue('The route has changed. Clear the way, move the block, or choose a place to stop.', 'Accepted route change; at least one available real resolution.'),
  living_roll_day_compared: cue('Here are both real rolls. Choose either one to keep playing.', 'Second different actual trial settled; both retained pictured choices available.'),
});
