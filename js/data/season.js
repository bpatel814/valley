// A small content flag, not a new save format. Boo Hollow itself is year-round.
export function halloweenActive(settings = {}, date = new Date()) {
  if (settings.halloweenOff === true || !Number.isFinite(date?.getTime?.())) return false;
  const month = date.getMonth(), day = date.getDate();
  return (month === 9 && day >= 15) || (month === 10 && day <= 3);
}

export function seasonHero(profile, settings = {}, date = new Date()) {
  return profile.id === 'rayna' && halloweenActive(settings, date)
    ? { art: 'halloween/rayna-trex-idle-v2', alt: 'Rayna in her pink T-rex costume', costume: true }
    : { art: profile.heroArt, alt: profile.heroAlt, costume: false };
}

// Explicit replacements only: family identities, child drawings and expression states
// retain their own artwork. Every lookup falls back if seasonal art cannot decode.
const HALLOWEEN_ART = Object.freeze({
  'characters/unicorn_happy': 'unicorn-happy',
  'characters/unicorn_happy_grey': 'unicorn-happy-grey',
  'characters/unicorn_cheer': 'unicorn-cheer',
  'characters/unicorn_cheer_grey': 'unicorn-cheer-grey',
  'characters/unicorn_sleepy': 'unicorn-sleepy',
  'characters/unicorn_sleepy_grey': 'unicorn-sleepy-grey',

  'characters/pip_happy': 'pip-happy',
  'characters/pip_cheer': 'pip-cheer',
  'characters/pip_sleepy': 'pip-sleepy',
  'characters/caterpillar_nibble': 'caterpillar-nibble',
  'characters/caterpillar_happy': 'caterpillar-happy',
  'characters/caterpillar_cheer': 'caterpillar-cheer',
  'characters/caterpillar_sleepy': 'caterpillar-sleepy',
  'characters/butterfly_open': 'butterfly-open',
  'characters/butterfly_closed': 'butterfly-closed',
  'stories/black-cat': 'cat',
  'props/wg-cat-resting-v1': 'cat-resting',
  'play-stage/backdrop': 'play-stage-background',

  'characters/pip_idle': 'pip',
  'characters/caterpillar_idle': 'caterpillar',
  'characters/unicorn_idle': 'unicorn',
  'characters/unicorn_idle_grey': 'unicorn-grey',
  'characters/discovery_idle': 'explore',
  'places/art': 'art',
  'places/together': 'together',
  'halloween/boo-hollow-background-v1': 'world',
});
export function seasonalArtKey(key, preferences = {}, date = new Date()) {
  return halloweenActive(preferences, date) && HALLOWEEN_ART[key]
    ? 'halloween/refresh/' + HALLOWEEN_ART[key] : key;
}
export function seasonalBackgroundKey(region, preferences = {}, date = new Date()) {
  if (!halloweenActive(preferences, date)) return null;
  const name = ({garden:'garden-background', meadow:'meadow-background', treehouse:'together-background'})[region] || 'world';
  return 'halloween/refresh/' + name;
}

// The seasonal title is a separate asset; original logos remain untouched.
export function seasonLogo(profile, preferences = {}, date = new Date()) {
  return profile.id === 'rayna' && halloweenActive(preferences, date)
    ? 'assets/art/final/halloween/refresh/title-rebuilt-v1.webp'
    : `assets/art/final/ui/${profile.logo}.webp`;
}

// Only Meadow's live word-picture UI uses these. Saved sticker identities do not.
const HALLOWEEN_WORD_ART = Object.freeze({
  'stickers/draw_cat':'cat', 'stickers/meadow_dog':'dog',
  'stickers/draw_caterpillar':'bug', 'stories/bee':'bee',
  'stickers/meadow_pig':'pig', 'stickers/meadow_cow':'cow',
});
export function seasonalWordArtKey(key, preferences = {}, date = new Date()) {
  return halloweenActive(preferences, date) && HALLOWEEN_WORD_ART[key]
    ? 'halloween/refresh/word-' + HALLOWEEN_WORD_ART[key] : key;
}

export function seasonLogoFallback(profile, preferences = {}, date = new Date()) {
  return profile.id === 'rayna' && halloweenActive(preferences, date)
    ? 'assets/art/final/halloween/refresh/title-rebuilt-v1.png'
    : `assets/art/final/ui/${profile.logo}.png`;
}
