// Display identity. saved-world.js fixes each child's database for the full page.
// Only Shared earlier play permits a title change without switching saves.
export const VALLEY_PROFILES = Object.freeze({
  rayna: Object.freeze({
    id: "rayna", child: "Rayna", title: "Rayna’s Valley", possessive: "Rayna’s",
    logo: "raynas-valley-logo", heroArt: "characters/family_child1_idle", heroAlt: "Rayna",
  }),
  veer: Object.freeze({
    id: "veer", child: "Veer", title: "Veer’s Valley", possessive: "Veer’s",
    logo: "veers-valley-logo", heroArt: "ui/veer-title", heroAlt: "Veer waving",
  }),
});

export function valleyProfile(id) {
  return VALLEY_PROFILES[id] || VALLEY_PROFILES.rayna;
}
