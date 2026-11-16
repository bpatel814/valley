// The valley home is five places standing in the meadow (work order item 6,
// Nov 16 2026). Each place has one big thing that opens its best activity in a
// single tap, and its other activities stand beside it as smaller pictures, also
// one tap. No menus, no words. A parent's switches decide what stands there.

export const VALLEY_PLACES = Object.freeze([
  { id: 'garden', label: 'Caterpillar garden', sound: 'nibble',
    routes: ['garden', 'water-garden', 'animal-friends', 'boo-hollow'] },
  { id: 'meadow', label: 'Unicorn meadow', sound: 'sparkle',
    routes: ['meadow', 'stories', 'rolling-run', 'river-run'] },
  { id: 'art', label: 'Art corner', sound: 'pop',
    routes: ['studio', 'bridge', 'picture-post', 'toy-workshop'] },
  { id: 'toys', label: 'Toy glade', sound: 'chime',
    routes: ['discovery', 'town-tracks', 'build-lab', 'music-band'] },
  { id: 'family', label: 'Family treehouse', sound: 'chime',
    routes: ['treehouse', 'grandma', 'play-stage', 'picnic'] },
].map(place => Object.freeze({ ...place, routes: Object.freeze(place.routes) })));

// What each activity looks like standing in the valley. `friend` is a living
// character (blinks, cheers); everything else is a picture from the art set.
export const VALLEY_THINGS = Object.freeze({
  garden: { friend: 'caterpillar', label: 'Garden: trace with the caterpillar' },
  meadow: { friend: 'unicorn', label: 'Write a name with the unicorn' },
  stories: { art: 'assets/art/final/stories/basket.webp', label: 'Stories' },
  studio: { art: 'assets/art/final/places/art.webp', label: 'Paint and stamp', easel: true },
  bridge: { art: 'assets/art/final/characters/bridge_idle.webp', label: 'Draw along' },
  discovery: { art: 'assets/art/final/characters/discovery_idle.webp', label: 'Puzzles' },
  'town-tracks': { art: 'assets/art/final/town-map.svg', label: 'Town' },
  treehouse: { art: 'assets/art/final/places/together.webp', label: 'Scrapbook' },
  grandma: { art: 'assets/art/final/characters/family_grandma_idle.webp', label: 'Visit Ba' },
  'play-stage': { art: 'assets/art/final/play-stage/play_stage_booth_front.webp', label: 'Play stage',
    layers: ['assets/art/final/play-stage/play_stage_curtain_left.webp', 'assets/art/final/play-stage/play_stage_curtain_right.webp'] },
  'water-garden': { art: 'assets/art/final/props/counting-flower.webp', label: 'Water garden' },
  'animal-friends': { art: 'assets/art/final/stories/black-cat.webp', label: 'Cat friend' },
  'boo-hollow': { art: 'assets/art/final/halloween/boo-path-v1-runtime.webp', label: 'Ghost friends' },
  'rolling-run': { art: 'assets/art/final/rolling-run/ramp-v1.png', label: 'Rolling hill' },
  'river-run': { art: 'assets/art/final/river-run/dock-v1.png', label: 'River' },
  'picture-post': { art: 'assets/art/final/picture-post/envelope.png', label: 'Picture mail' },
  'toy-workshop': { art: 'assets/art/final/toy-workshop/wheels-v1.png', label: 'Toy workshop' },
  'build-lab': { art: 'assets/art/final/characters/discovery_idle.webp', label: 'Build a bridge' },
  'music-band': { art: 'assets/art/final/music-band/drum-v1.png', label: 'Music' },
  picnic: { art: 'assets/art/final/garden-cafe/table-v1.png', label: 'Café and picnic' },
});

/**
 * The places to draw, in valley order, each with its big thing and its small ones.
 * `isOpen(route)` is the parent's switch (place and activity) and registration.
 * A place whose usual big thing is switched off promotes its next open activity;
 * a place with nothing open is not drawn. Every open route appears exactly once.
 */
export function valleyLayout(isOpen) {
  const seen = new Set();
  return VALLEY_PLACES.flatMap(place => {
    const open = place.routes.filter(route => !seen.has(route) && isOpen(route));
    open.forEach(route => seen.add(route));
    if (!open.length) return [];
    return [{ id: place.id, label: place.label, sound: place.sound, main: open[0], extras: open.slice(1) }];
  });
}
