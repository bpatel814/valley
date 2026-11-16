/** Authored choices for A different way down. These do not award correctness. */
export const ROLLING_DAY_VERSION = 1;
export const ROLLING_DAY_EPISODES = Object.freeze(['prediction', 'changed-route', 'comparison']);
export const ROLLING_DAY_LABELS = Object.freeze({ prediction: 'Where will it stop?', 'changed-route': 'A different way down', comparison: 'Two ways down' });
export const ROLLING_DAY_PREDICTIONS = Object.freeze([
  Object.freeze({ id: 'near', label: 'Near the hill', x: 52 }),
  Object.freeze({ id: 'middle', label: 'In the middle', x: 72 }),
  Object.freeze({ id: 'far', label: 'Farther along', x: 88 }),
]);
export const ROLLING_DAY_RESOLUTIONS = Object.freeze(['clear-block', 'move-block', 'landing-nearby']);
