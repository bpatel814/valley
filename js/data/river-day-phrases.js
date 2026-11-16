// Exact local Heart lines. Arrival and comparison require actual settled trips.
const cue = (text, note) => Object.freeze({ text, speaker: 'guide', note });
export const RIVER_DAY_PHRASES = Object.freeze({
  living_river_day_meeting: cue('Choose Ba or Ishan to meet at your dock. Then launch your picture and see where it goes.', 'Explicit meeting entry or Help before choosing a guest; both pictured choices available.'),
  living_river_day_changed: cue('Keep this first trip. Choose different water or a stone, then see what changes.', 'First actual trip retained; different usable current or stone proposals available.'),
  living_river_day_stop: cue('Here is where your float stopped. Move the dock here, or try another route to your dock.', 'First actual trip retained; both usable stopping-place proposals shown.'),
  living_river_day_ba: cue('Ba is waiting at your dock. Let your picture float along the river.', 'Ba explicitly selected and visibly waiting at the actual movable dock; Launch available.'),
  living_river_day_ishan: cue('Ishan is waiting at your dock. Let your picture float along the river.', 'Ishan explicitly selected and visibly waiting at the actual movable dock; Launch available.'),
  living_river_day_ba_arrived: cue('Your picture has arrived at the dock. Ba is here to meet you.', 'Actual arriving Launch settled; Ba and the picture visible at the dock.'),
  living_river_day_ishan_arrived: cue('Your picture has arrived at the dock. Ishan is here to meet you.', 'Actual arriving Launch settled; Ishan and the picture visible at the dock.'),
  living_river_day_compared: cue('Here are both real journeys. Choose either one to keep playing.', 'Two different actual journeys retained; both pictured return choices available.'),
});
