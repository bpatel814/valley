// Rainbow Bridge teaching paths use the same 0..100 space as letters. Colored
// models are separate illustrations so the finished activity does not look like
// a worksheet.
const S = (id, label, intro, strokes, model) => ({ id, label, intro, strokes, model });

const SUBJECTS = [
  S("sun", "sun", 1, [
    "M72 50 C72 62 62 72 50 72 C38 72 28 62 28 50 C28 38 38 28 50 28 C62 28 72 38 72 50 Z",
    "M50 8 L50 20", "M50 80 L50 92", "M8 50 L20 50", "M80 50 L92 50",
    "M20 20 L28 28", "M72 72 L80 80", "M80 20 L72 28", "M28 72 L20 80",
  ], '<circle cx="50" cy="50" r="23" fill="#ffe98a"/><g stroke="#f2a565" stroke-width="7" stroke-linecap="round"><path d="M50 8V20M50 80V92M8 50H20M80 50H92M20 20L28 28M72 72L80 80M80 20L72 28M28 72L20 80"/></g><circle cx="43" cy="46" r="3"/><circle cx="57" cy="46" r="3"/><path d="M41 57Q50 65 59 57" fill="none" stroke="#4a3b34" stroke-width="3"/>'),
  S("rainbow", "rainbow", 1, [
    "M12 72 C12 24 88 24 88 72", "M24 72 C24 39 76 39 76 72", "M36 72 C36 54 64 54 64 72",
  ], '<g fill="none" stroke-linecap="round" stroke-width="12"><path d="M12 73C12 22 88 22 88 73" stroke="#ff9a9e"/><path d="M24 73C24 38 76 38 76 73" stroke="#ffe98a"/><path d="M36 73C36 54 64 54 64 73" stroke="#9fd0ff"/></g><g fill="#fffdf8" stroke="#bfe3ff" stroke-width="2"><circle cx="20" cy="76" r="13"/><circle cx="80" cy="76" r="13"/></g>'),
  S("flower", "flower", 2, [
    "M50 46 C38 38 34 27 41 21 C48 15 54 25 50 38 C57 24 69 20 74 28 C79 36 67 44 55 45 C70 47 75 58 68 65 C61 72 52 61 50 50 C47 64 36 71 29 64 C22 57 31 47 45 45 Z",
    "M60 45 C60 51 56 55 50 55 C44 55 40 51 40 45 C40 39 44 35 50 35 C56 35 60 39 60 45 Z",
    "M50 55 L50 89", "M50 68 C39 59 31 64 29 73 C39 77 47 75 50 70", "M50 76 C61 66 71 70 73 79 C64 84 56 82 50 78",
  ], '<path d="M50 47V90M50 71C37 59 28 66 30 77C40 80 47 77 50 72M50 79C63 67 73 73 71 84C61 87 54 84 50 80" fill="#b8f0d2" stroke="#4fc38a" stroke-width="5"/><g fill="#ffb3c8" stroke="#f2799b" stroke-width="3"><ellipse cx="50" cy="28" rx="10" ry="16"/><ellipse cx="68" cy="45" rx="16" ry="10"/><ellipse cx="32" cy="45" rx="16" ry="10"/></g><circle cx="50" cy="45" r="12" fill="#ffe98a"/>'),
  S("house", "house", 2, [
    "M14 48 L50 15 L86 48", "M22 43 L22 88 L78 88 L78 43", "M43 88 L43 62 L58 62 L58 88", "M29 54 L39 54 L39 65 L29 65 Z",
  ], '<path d="M21 43V88H79V43L50 18Z" fill="#ffd3ab" stroke="#4a3b34" stroke-width="4"/><path d="M13 48L50 14L87 48" fill="#ffb3c8" stroke="#4a3b34" stroke-width="5"/><path d="M43 88V61H59V88" fill="#d9c7ff" stroke="#4a3b34" stroke-width="3"/><rect x="28" y="51" width="13" height="13" rx="2" fill="#bfe3ff" stroke="#4a3b34" stroke-width="3"/>'),
  S("balloon", "balloon", 1, [
    "M50 14 C31 14 22 30 25 48 C28 66 40 73 50 79 C60 73 72 66 75 48 C78 30 69 14 50 14 Z", "M50 79 C44 84 56 84 50 89", "M50 89 C35 91 65 94 49 97",
  ], '<path d="M50 13C29 13 21 30 25 49C28 65 39 73 50 79C61 73 72 65 75 49C79 30 71 13 50 13Z" fill="#ffb3c8" stroke="#4a3b34" stroke-width="4"/><path d="M50 79l-6 8h12z" fill="#9a7fe0"/><path d="M50 87C35 91 67 94 48 98" fill="none" stroke="#9a7fe0" stroke-width="3"/><ellipse cx="40" cy="31" rx="6" ry="10" fill="#fffdf8" opacity=".6"/>'),
  S("caterpillar", "caterpillar", 2, [
    "M17 61 C23 48 34 49 39 60 C44 44 56 44 65 58 C66 66 63 72 61 64 C56 77 44 77 39 64 C34 76 21 74 17 61 Z",
    "M96 58 C96 67 89 74 80 74 C71 74 64 67 64 58 C64 49 71 42 80 42 C89 42 96 49 96 58 Z",
    "M75 43 L67 27", "M85 43 L94 27",
  ], '<g stroke="#4a3b34" stroke-width="3"><circle cx="25" cy="61" r="15" fill="#ffe98a"/><circle cx="45" cy="61" r="15" fill="#b8f0d2"/><circle cx="65" cy="61" r="15" fill="#9fd0ff"/><circle cx="80" cy="58" r="17" fill="#ffb3c8"/></g><path d="M75 43L67 27M85 42L94 27" stroke="#4a3b34" stroke-width="3"/><circle cx="76" cy="55" r="3"/><circle cx="86" cy="54" r="3"/>'),
  S("cat", "cat", 1, [
    "M28 34 L23 14 L42 27 C48 24 55 24 61 27 L78 15 L74 38 C82 49 78 66 67 73 C56 81 40 79 30 70 C20 61 19 44 28 34 Z",
    "M45 49 C45 56 35 56 35 49 C35 42 45 42 45 49 Z",
    "M67 49 C67 56 57 56 57 49 C57 42 67 42 67 49 Z",
    "M39 61 C39 72 50 72 51 61 C52 72 63 72 63 61",
    "M31 58 L12 54", "M31 64 L11 67", "M69 58 L88 54", "M69 64 L90 68",
  ], '<path d="M28 34L23 14L42 27C49 24 56 24 62 27L78 15L74 38C83 49 79 66 67 74C55 82 39 79 29 70C19 61 19 44 28 34Z" fill="#ffd3ab" stroke="#4a3b34" stroke-width="4"/><path d="M23 15L29 34L39 27ZM78 16L73 37L63 28Z" fill="#ffb3c8"/><circle cx="39" cy="49" r="3"/><circle cx="63" cy="49" r="3"/><path d="M47 58Q51 63 55 58Q55 67 51 67Q47 67 47 58Z" fill="#f2799b"/>'),
  S("butterfly", "butterfly", 2, [
    "M48 30 C36 12 14 17 16 39 C17 51 28 55 43 54 C28 60 24 80 38 83 C48 83 51 68 50 57", "M52 30 C64 12 86 17 84 39 C83 51 72 55 57 54 C72 60 76 80 62 83 C52 83 49 68 50 57", "M50 27 L50 76", "M49 29 C43 19 39 17 35 15", "M51 29 C57 19 61 17 65 15",
  ], '<path d="M46 50C31 54 14 48 16 31C18 15 39 18 49 36M46 55C31 56 22 70 30 81C38 91 49 74 50 60" fill="#d9c7ff" stroke="#4a3b34" stroke-width="3"/><path d="M54 50C69 54 86 48 84 31C82 15 61 18 51 36M54 55C69 56 78 70 70 81C62 91 51 74 50 60" fill="#ffb3c8" stroke="#4a3b34" stroke-width="3"/><path d="M50 31V78" stroke="#4a3b34" stroke-width="7"/>'),
  S("fish", "fish", 2, [
    "M19 52 C31 29 61 25 78 48 C62 74 32 75 19 52 Z", "M77 48 L94 30 L91 68 L77 51 Z", "M40 48 C40 55 30 55 30 48 C30 41 40 41 40 48 Z", "M52 32 C58 41 58 62 51 71",
  ], '<path d="M18 51C31 28 62 26 79 49C62 74 31 74 18 51Z" fill="#9fd0ff" stroke="#4a3b34" stroke-width="4"/><path d="M77 49L94 31L91 69L77 52Z" fill="#ffb3c8" stroke="#4a3b34" stroke-width="4"/><path d="M53 32C61 44 59 61 51 71" fill="#ffe98a" stroke="#4a3b34" stroke-width="3"/><circle cx="34" cy="45" r="4"/>'),
  S("unicorn", "unicorn", 2, [
    "M29 40 C32 25 48 20 63 27 C78 34 82 52 74 67 C65 83 40 85 28 69 C19 57 20 46 29 40 Z", "M41 24 L50 5 L57 27", "M30 38 C17 31 13 40 21 49", "M61 28 C77 18 86 27 77 40", "M27 41 C12 50 10 68 18 80 C23 87 31 86 36 77",
  ], '<path d="M29 39C33 24 49 20 64 27C79 34 82 52 74 67C65 83 40 85 28 69C19 57 20 46 29 39Z" fill="#fffdf8" stroke="#4a3b34" stroke-width="4"/><path d="M41 25L50 5L58 28Z" fill="#ffe98a" stroke="#4a3b34" stroke-width="3"/><path d="M31 39C18 29 12 40 22 50M63 29C78 17 88 28 77 42M68 71C82 77 82 90 72 95" fill="none" stroke="#9a7fe0" stroke-width="8"/><circle cx="42" cy="48" r="3"/>'),
  S("star", "star", 1, ["M50 8 L61 37 L93 38 L68 58 L76 90 L50 72 L24 90 L32 58 L7 38 L39 37 Z"], '<path d="M50 8L61 37L93 38L68 58L76 90L50 72L24 90L32 58L7 38L39 37Z" fill="#ffe98a" stroke="#4a3b34" stroke-width="4"/><circle cx="42" cy="47" r="3"/><circle cx="58" cy="47" r="3"/><path d="M41 58Q50 66 59 58" fill="none" stroke="#f2a565" stroke-width="3"/>'),
  S("heart", "heart", 1, ["M50 88 C40 77 14 61 14 37 C14 20 35 14 50 31 C65 14 86 20 86 37 C86 61 60 77 50 88 Z"], '<path d="M50 88C40 77 14 61 14 37C14 20 35 14 50 31C65 14 86 20 86 37C86 61 60 77 50 88Z" fill="#ffb3c8" stroke="#4a3b34" stroke-width="4"/><ellipse cx="33" cy="33" rx="7" ry="10" fill="#fffdf8" opacity=".5"/>'),
  S("icecream", "ice cream", 2, [
    "M24 42 C24 27 36 18 49 22 C57 10 78 19 76 36 C85 44 79 55 68 55 L32 55 C22 55 18 48 24 42 Z", "M31 55 L50 92 L69 55 Z", "M36 64 L61 76", "M43 79 L60 65",
  ], '<path d="M31 54L50 93L69 54Z" fill="#ffd3ab" stroke="#4a3b34" stroke-width="4"/><path d="M37 66L62 78M44 81L60 65" stroke="#f2a565" stroke-width="2.5"/><path d="M24 42C23 27 36 18 49 22C57 10 78 19 76 36C86 44 79 55 68 55H32C22 55 18 48 24 42Z" fill="#ffb3c8" stroke="#4a3b34" stroke-width="4"/>'),
  S("tree", "tree", 2, [
    "M42 88 L45 57", "M58 88 L55 57", "M29 61 C12 55 14 36 30 32 C30 14 51 10 60 24 C76 17 89 31 83 45 C94 58 77 70 64 63 C56 75 39 73 34 62 Z", "M45 62 L32 48", "M55 60 L68 43",
  ], '<path d="M42 88L45 57H56L59 88Z" fill="#ffd3ab" stroke="#4a3b34" stroke-width="4"/><path d="M46 63L32 48M54 62L69 43" stroke="#4fc38a" stroke-width="5"/><path d="M29 62C12 55 14 36 30 32C30 14 51 10 60 24C76 17 89 31 83 45C94 58 77 70 64 63C56 75 39 73 34 62Z" fill="#b8f0d2" stroke="#4a3b34" stroke-width="4"/><circle cx="36" cy="40" r="5" fill="#ffe98a"/>'),
  S("veer", "Veer", 2, [
    "M50 14 C39 14 32 23 32 34 C32 45 39 52 50 52 C61 52 68 45 68 34 C68 23 61 14 50 14 Z", "M50 53 L50 79", "M50 61 L27 72", "M50 61 L74 70", "M50 79 L35 94", "M50 79 L66 94",
  ], '<circle cx="50" cy="33" r="19" fill="#ffd3ab" stroke="#4a3b34" stroke-width="4"/><path d="M31 31C33 13 48 9 61 17C68 21 71 29 69 36C64 26 57 22 48 23C41 23 36 26 31 31Z" fill="#4a3b34"/><circle cx="43" cy="34" r="3"/><circle cx="57" cy="34" r="3"/><path d="M43 43Q50 49 58 42" fill="none" stroke="#f2799b" stroke-width="3"/><path d="M36 56Q50 49 64 56L68 82H32Z" fill="#9fd0ff" stroke="#4a3b34" stroke-width="4"/>'),
  S("pumpkin", "pumpkin", 1, [
    "M50 25 C16 10 8 50 18 72 C30 94 70 94 82 72 C92 50 84 10 50 25 Z",
    "M46 25 L46 10 L57 10 L54 25",
    "M50 26 C36 42 36 67 50 86",
    "M50 26 C64 42 64 67 50 86",
  ], '<path d="M50 25C16 10 8 50 18 72C30 94 70 94 82 72C92 50 84 10 50 25Z" fill="#ffbc77" stroke="#8a542f" stroke-width="4"/><path d="M46 25V10H57L54 25" fill="#9ac78b" stroke="#54734a" stroke-width="4"/><path d="M50 26C36 42 36 67 50 86M50 26C64 42 64 67 50 86" fill="none" stroke="#d98742" stroke-width="3"/>'),

  S("friendlyghost", "friendly ghost", 1, [
    "M23 82 L23 43 C23 8 77 8 77 43 L77 82 L64 73 L50 84 L36 73 Z",
    "M37 38 L37 54", "M63 38 L63 54", "M40 59 C46 66 54 66 60 59",
  ], '<path d="M23 82V43C23 8 77 8 77 43V82L64 73L50 84L36 73Z" fill="#fffaf0" stroke="#705446" stroke-width="4"/><path d="M37 38V54M63 38V54M40 59Q50 70 60 59" fill="none" stroke="#705446" stroke-width="4" stroke-linecap="round"/>'),
  S("spider", "spider", 1, [
    "M69 49 C69 65 31 65 31 49 C31 33 69 33 69 49 Z",
    "M33 42 L20 28 L9 30", "M31 48 L16 42 L6 46",
    "M31 54 L16 61 L8 58", "M34 59 L24 75 L12 78",
    "M67 42 L80 28 L91 30", "M69 48 L84 42 L94 46",
    "M69 54 L84 61 L92 58", "M66 59 L76 75 L88 78",
  ], '<g fill="none" stroke="#705446" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M33 42L20 28L9 30M31 48L16 42L6 46M31 54L16 61L8 58M34 59L24 75L12 78M67 42L80 28L91 30M69 48L84 42L94 46M69 54L84 61L92 58M66 59L76 75L88 78"/></g><ellipse cx="50" cy="49" rx="19" ry="13" fill="#cfb8ea" stroke="#705446" stroke-width="4"/>'),

  S("skeleton", "friendly skeleton", 1, [
    "M65 25 C65 47 35 47 35 25 C35 3 65 3 65 25 Z",
    "M50 43 L50 68", "M50 47 L22 61", "M50 47 L78 61", "M50 68 L30 91", "M50 68 L70 91",
  ], '<g fill="none" stroke="#705446" stroke-width="8" stroke-linecap="round"><path d="M50 43V68M50 47L22 61M50 47L78 61M50 68L30 91M50 68L70 91"/></g><g fill="none" stroke="#fff7df" stroke-width="4" stroke-linecap="round"><path d="M50 43V68M50 47L22 61M50 47L78 61M50 68L30 91M50 68L70 91"/></g><ellipse cx="50" cy="25" rx="15" ry="17" fill="#fff7df" stroke="#705446" stroke-width="3"/><circle cx="44" cy="24" r="2" fill="#4a3b34"/><circle cx="56" cy="24" r="2" fill="#4a3b34"/><path d="M44 32Q50 37 56 32" fill="none" stroke="#705446" stroke-width="2"/>'),
  S("witchhat", "witch hat", 1, [
    "M25 80 L45 15 L75 80", "M10 80 L90 80", "M32 61 L66 61",
  ], '<path d="M25 80L45 15L75 80Z" fill="#c9b0e7" stroke="#705446" stroke-width="4" stroke-linejoin="round"/><path d="M10 80H90" stroke="#705446" stroke-width="9" stroke-linecap="round"/><path d="M32 61H66" stroke="#ffca80" stroke-width="7"/>'),

];

// These descriptions name the marks actually taught, not every decorative detail
// in the colored references. Optional family identity stays in the existing label.
const GUIDE_DESCRIPTIONS = Object.freeze({
  skeleton: "A round head, a body line, two arms, and two legs. You can add a friendly face.",
  witchhat: "A tall pointed hat, a wide brim, and one ribbon. Decorate it your own way.",
  "friendlyghost": "One soft ghost outline, two eyes, and a smile. You can give your ghost its own expression.",
  spider: "One round spider body and eight bent legs. You can add your own friendly face.",
  pumpkin: "A round pumpkin, a short stem, and two curved lines. You can add your own face.",
  sun: "A round sun with eight rays. You can add your own face.",
  rainbow: "Three rainbow arches. You can add clouds or choose your own colors.",
  flower: "Petals, a round center, a stem, and two leaves.",
  house: "A roof, walls, a door, and one square window.",
  balloon: "One balloon with a little knot and a wavy string.",
  caterpillar: "A bumpy body, a round head, and two antennae.",
  cat: "A cat head with pointy ears, two eyes, a smile, and four whiskers.",
  butterfly: "Two wings, a body, and two antennae.",
  fish: "A fish body, a triangle tail, a round eye, and a fin.",
  unicorn: "A unicorn head with a horn, two ears, and a flowing mane.",
  star: "One five-pointed star. You can add your own face.",
  heart: "One heart with two round bumps and a point.",
  icecream: "One scoop on a cone with two crossing lines.",
  tree: "Start with two trunk lines. Then add the leafy top and two branches.",
  veer: "A simple stick picture of Veer: a round head, body, arms, and legs.",
});

// Unfinished pre-revision drawings must continue against their original targets.
// These are the actual previous paths, including their omissions; never rewrite
// them to resemble the improved guide or reinterpret saved child ink.
const LEGACY_GUIDES = {
  flower: { intro: 2, strokes: [
    "M50 46 C38 38 34 27 41 21 C48 15 54 25 50 38 C57 24 69 20 74 28 C79 36 67 44 55 45 C70 47 75 58 68 65 C61 72 52 61 50 50 C47 64 36 71 29 64 C22 57 31 47 45 45 Z",
    "M50 47 L50 89", "M50 68 C39 59 31 64 29 73 C39 77 47 75 50 70", "M50 76 C61 66 71 70 73 79 C64 84 56 82 50 78",
  ] },
  house: { intro: 2, strokes: [
    "M14 48 L50 15 L86 48", "M22 43 L22 88 L78 88 L78 43", "M43 88 L43 62 L58 62 L58 88", "M29 54 L39 54 L39 65 L29 65",
  ] },
  caterpillar: { intro: 1, strokes: [
    "M17 61 C23 48 34 49 39 60 C44 44 56 44 61 58 C67 45 80 48 83 61 C80 75 68 76 61 64 C56 77 44 77 39 64 C34 76 21 74 17 61 Z", "M75 43 L67 27", "M85 42 L94 27",
  ] },
  cat: { intro: 1, strokes: [
    "M28 34 L23 14 L42 27 C48 24 55 24 61 27 L78 15 L74 38 C82 49 78 66 67 73 C56 81 40 79 30 70 C20 61 19 44 28 34 Z",
    "M38 49 L43 49", "M60 49 L65 49", "M48 59 C51 62 54 59 54 59 C54 67 46 68 43 64", "M31 58 L12 54", "M31 64 L11 67", "M69 58 L88 54", "M69 64 L90 68",
  ] },
  fish: { intro: 2, strokes: [
    "M19 52 C31 29 61 25 78 48 C62 74 32 75 19 52 Z", "M77 48 L94 30 L91 68 L77 51", "M30 48 C33 44 37 44 40 48", "M52 32 C58 41 58 62 51 71",
  ] },
  unicorn: { intro: 2, strokes: [
    "M29 40 C32 25 48 20 63 27 C78 34 82 52 74 67 C65 83 40 85 28 69 C19 57 20 46 29 40 Z", "M41 24 L50 5 L57 27", "M30 38 C17 31 13 40 21 49", "M61 28 C77 18 86 27 77 40", "M68 70 C80 77 81 89 72 94",
  ] },
  tree: { intro: 3, strokes: [
    "M42 88 L45 57", "M58 88 L55 57", "M29 61 C12 55 14 36 30 32 C30 14 51 10 60 24 C76 17 89 31 83 45 C94 58 77 70 64 63 C56 75 39 73 34 62 Z", "M45 62 L32 48", "M55 60 L68 43",
  ] },
};

export const DRAWINGS = SUBJECTS.map((subject) => Object.freeze({
  ...subject,
  guideDescription: GUIDE_DESCRIPTIONS[subject.id],
  guideRevision: LEGACY_GUIDES[subject.id] ? 2 : 1,
  ...(LEGACY_GUIDES[subject.id] ? {
    legacyIntro: LEGACY_GUIDES[subject.id].intro,
    legacyGlyph: Object.freeze({ name: subject.id, strokes: Object.freeze(LEGACY_GUIDES[subject.id].strokes.slice()) }),
  } : {}),
  glyph: Object.freeze({ name: subject.id, strokes: Object.freeze(subject.strokes.slice()) }),
}));

export const DRAWING_BY_ID = Object.freeze(Object.fromEntries(DRAWINGS.map((item) => [item.id, item])));

export function drawingById(id) {
  return DRAWING_BY_ID[String(id || "").toLowerCase()] || null;
}

/** Fresh activities use the current revision. Old nonempty drafts without a
 * revision must explicitly request revision 1 to retain their original targets.
 * Step 0 uses the introductory marks; step 1 uses the complete ghost. */
export function glyphForStep(subject, step, revision) {
  const item = typeof subject === "string" ? drawingById(subject) : subject;
  if (!item) return null;
  const legacy = Number(revision) === 1 && item.legacyGlyph;
  const glyph = legacy ? item.legacyGlyph : item.glyph;
  const intro = legacy ? item.legacyIntro : item.intro;
  const count = step === 0 ? Math.max(1, Math.min(intro || 1, glyph.strokes.length)) : glyph.strokes.length;
  return { name: item.id, strokes: glyph.strokes.slice(0, count) };
}

/** A tap or an empty array is not a drawing; one intentional sweeping mark is. */
export function drawingHasMarks(strokes, minLength = 5) {
  if (!Array.isArray(strokes)) return false;
  let length = 0;
  let points = 0;
  for (const stroke of strokes) {
    if (!Array.isArray(stroke)) continue;
    let previous = null;
    for (const point of stroke) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      points += 1;
      if (previous) length += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
  }
  return points >= 2 && length >= minLength;
}

export function drawingSVG(subject, { className = "", title = "" } = {}) {
  const item = typeof subject === "string" ? drawingById(subject) : subject;
  if (!item) return "";
  const name = String(title || item.label).replace(/[&<>\"]/g, "");
  return `<svg class="${className}" viewBox="0 0 100 100" role="img" aria-label="${name}">${item.model}</svg>`;
}

export default DRAWINGS;
