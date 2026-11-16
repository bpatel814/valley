// letters.js - glyph stroke data for the tracing game.
//
// COORDINATE SPACE: every path lives in a 100 x 100 box.
//   Uppercase + digits: top y=12, baseline y=88, x roughly 10..90.
//   Lowercase x-height:  top y=45, baseline y=88.
//   Ascenders (b d f h k l t) rise to y=12. Descenders (g j p q y) drop to y=100.
//
// STROKE ORDER / DIRECTION models familiar school (Zaner-Bloser style) teaching.
// These are the guide's suggested paths; recognition accepts other orders and
// directions when the child has actually drawn the letter's parts:
//   - Verticals go TOP to BOTTOM. Horizontals go LEFT to RIGHT.
//   - Capital diagonals start high and pull down (A starts at the apex, twice).
//   - Round letters (C G O Q S, a c d g o q s, 0 6 8 9) start at the TOP RIGHT and
//     travel COUNTER-CLOCKWISE, i.e. leftward over the top first.
//   - Stems before bowls (B D P R, b h k m n p r); bowl before stem for a d g q.
//   - Dots on i / j are the LAST stroke and are deliberately tiny (~6 units).
//
// Paths use only M / L / C / Z in absolute coordinates so they sample smoothly.

export const GLYPHS = {
  // ---------- UPPERCASE ----------
  "A": { strokes: ["M50 12 L20 88", "M50 12 L80 88", "M30 58 L70 58"], name: "A", sound: "ah" },
  "B": { strokes: ["M28 12 L28 88", "M28 12 L56 12 C74 12 74 50 56 50 L28 50", "M28 50 L58 50 C78 50 78 88 58 88 L28 88"], name: "B", sound: "buh" },
  "C": { strokes: ["M76 28 C68 17 56 11 44 13 C27 16 18 33 18 50 C18 67 27 84 44 87 C56 89 68 83 76 72"], name: "C", sound: "kuh" },
  "D": { strokes: ["M28 12 L28 88", "M28 12 L52 12 C74 12 82 30 82 50 C82 70 74 88 52 88 L28 88"], name: "D", sound: "duh" },
  "E": { strokes: ["M28 12 L28 88", "M28 12 L76 12", "M28 50 L68 50", "M28 88 L76 88"], name: "E", sound: "eh" },
  "F": { strokes: ["M28 12 L28 88", "M28 12 L76 12", "M28 50 L68 50"], name: "F", sound: "fuh" },
  "G": { strokes: ["M76 28 C68 17 56 11 44 13 C27 16 18 33 18 50 C18 67 27 84 44 87 C58 90 76 82 76 62", "M76 62 L54 62"], name: "G", sound: "guh" },
  "H": { strokes: ["M26 12 L26 88", "M74 12 L74 88", "M26 50 L74 50"], name: "H", sound: "huh" },
  "I": { strokes: ["M50 12 L50 88", "M32 12 L68 12", "M32 88 L68 88"], name: "I", sound: "ih",
    // A plain vertical I is common handwriting. The guide still teaches its bars.
    recognitionVariants: [{ strokes: ["M50 12 L50 88"], parts: [[0, 1, 2]] }] },
  "J": { strokes: ["M66 12 L66 66 C66 82 52 90 38 84 C32 81 28 76 26 70"], name: "J", sound: "juh" },
  "K": { strokes: ["M28 12 L28 88", "M78 12 L30 50", "M30 50 L78 88"], name: "K", sound: "kuh" },
  "L": { strokes: ["M28 12 L28 88", "M28 88 L74 88"], name: "L", sound: "luh" },
  "M": { strokes: ["M22 12 L22 88", "M22 12 L50 62", "M50 62 L78 12", "M78 12 L78 88"], name: "M", sound: "muh" },
  "N": { strokes: ["M26 12 L26 88", "M26 12 L74 88", "M74 12 L74 88"], name: "N", sound: "nuh" },
  "O": { strokes: ["M70 22 C62 15 56 12 50 12 C33 12 20 29 20 50 C20 71 33 88 50 88 C67 88 80 71 80 50 C80 39 76 29 70 22 Z"], name: "O", sound: "ah" },
  "P": { strokes: ["M28 12 L28 88", "M28 12 L56 12 C76 12 76 52 56 52 L28 52"], name: "P", sound: "puh" },
  "Q": { strokes: ["M70 22 C62 15 56 12 50 12 C33 12 20 29 20 50 C20 71 33 88 50 88 C67 88 80 71 80 50 C80 39 76 29 70 22 Z", "M58 66 L82 92"], name: "Q", sound: "kwuh" },
  "R": { strokes: ["M28 12 L28 88", "M28 12 L56 12 C76 12 76 52 56 52 L28 52", "M52 52 L78 88"], name: "R", sound: "ruh" },
  "S": { strokes: ["M74 26 C68 14 52 9 40 15 C26 22 24 40 38 47 C48 52 60 53 68 60 C80 69 76 86 60 88 C46 90 32 84 26 74"], name: "S", sound: "sss" },
  "T": { strokes: ["M22 12 L78 12", "M50 12 L50 88"], name: "T", sound: "tuh" },
  "U": { strokes: ["M24 12 L24 60 C24 78 36 88 50 88 C64 88 76 78 76 60 L76 12"], name: "U", sound: "uh" },
  "V": { strokes: ["M22 12 L50 88", "M78 12 L50 88"], name: "V", sound: "vuh" },
  "W": { strokes: ["M18 12 L34 88", "M34 88 L50 12", "M50 12 L66 88", "M66 88 L82 12"], name: "W", sound: "wuh" },
  "X": { strokes: ["M24 12 L76 88", "M76 12 L24 88"], name: "X", sound: "ks" },
  "Y": { strokes: ["M24 12 L50 50", "M76 12 L50 50", "M50 50 L50 88"], name: "Y", sound: "yuh" },
  "Z": { strokes: ["M24 12 L76 12", "M76 12 L24 88", "M24 88 L76 88"], name: "Z", sound: "zzz" },

  // ---------- DIGITS ----------
  "0": { strokes: ["M68 22 C61 15 56 12 50 12 C35 12 24 29 24 50 C24 71 35 88 50 88 C65 88 76 71 76 50 C76 39 73 29 68 22 Z"], name: "zero", sound: "zero" },
  "1": { strokes: ["M32 28 L50 12", "M50 12 L50 88"], name: "one", sound: "one" },
  "2": { strokes: ["M26 28 C28 16 40 10 52 13 C68 16 76 30 68 44 C60 58 40 68 24 88 L78 88"], name: "two", sound: "two" },
  "3": { strokes: ["M26 24 C30 14 44 10 56 14 C70 19 72 38 52 46 C70 46 80 56 78 68 C76 82 58 92 40 87 C32 85 27 80 24 74"], name: "three", sound: "three" },
  "4": { strokes: ["M62 12 L22 62 L78 62", "M62 12 L62 88"], name: "four", sound: "four" },
  "5": { strokes: ["M74 12 L32 12 L30 44", "M30 44 C48 36 72 42 74 62 C76 80 56 92 36 86 C30 84 26 80 24 74"], name: "five", sound: "five" },
  "6": { strokes: ["M70 18 C58 10 42 16 34 30 C26 44 24 60 28 72 C33 86 50 92 62 84 C74 76 74 58 60 52 C48 47 34 52 30 62"], name: "six", sound: "six" },
  "7": { strokes: ["M24 12 L78 12", "M78 12 L40 88"], name: "seven", sound: "seven" },
  "8": { strokes: ["M66 26 C66 16 59 12 50 12 C41 12 34 17 34 26 C34 40 68 44 70 62 C71 78 61 88 50 88 C39 88 29 78 30 62 C32 44 66 40 66 26"], name: "eight", sound: "eight" },
  "9": { strokes: ["M72 34 C72 21 62 12 50 12 C37 12 27 22 27 34 C27 46 37 56 50 56 C62 56 72 47 72 34 L72 88"], name: "nine", sound: "nine" },

  // ---------- LOWERCASE ----------
  "a": { strokes: ["M64 50 C58 46 53 45 47 45 C34 45 24 54 24 66 C24 78 34 88 47 88 C58 88 66 81 68 72", "M68 45 L68 88"], name: "a", sound: "ah" },
  "b": { strokes: ["M28 12 L28 88", "M28 66 C28 54 38 45 50 45 C63 45 72 54 72 66 C72 78 63 88 50 88 L28 88"], name: "b", sound: "buh" },
  "c": { strokes: ["M66 52 C60 46 52 44 44 46 C31 49 24 58 24 67 C24 78 33 88 45 88 C55 88 63 83 67 76"], name: "c", sound: "kuh" },
  "d": { strokes: ["M70 52 C64 46 57 45 50 45 C37 45 28 54 28 66 C28 78 37 88 50 88 C60 88 68 83 70 76", "M70 12 L70 88"], name: "d", sound: "duh" },
  "e": { strokes: ["M26 68 L68 68 C68 55 58 45 46 45 C33 45 24 55 24 67 C24 79 34 88 46 88 C56 88 63 84 67 78"], name: "e", sound: "eh" },
  "f": { strokes: ["M64 22 C56 13 42 12 36 20 C33 26 32 33 32 42 L32 88", "M18 50 L50 50"], name: "f", sound: "fuh" },
  "g": { strokes: ["M68 52 C62 46 55 45 48 45 C35 45 26 54 26 66 C26 78 35 88 48 88 C58 88 66 83 68 76", "M68 45 L68 88 C68 97 60 100 50 97"], name: "g", sound: "guh" },
  "h": { strokes: ["M28 12 L28 88", "M28 66 C28 54 38 45 50 45 C62 45 70 54 70 66 L70 88"], name: "h", sound: "huh" },
  "i": { strokes: ["M50 45 L50 88", "M50 32 L50 38"], name: "i", sound: "ih" },
  "j": { strokes: ["M56 45 L56 88 C56 97 47 100 40 96", "M56 32 L56 38"], name: "j", sound: "juh" },
  "k": { strokes: ["M28 12 L28 88", "M64 48 L30 68", "M30 68 L66 88"], name: "k", sound: "kuh" },
  "l": { strokes: ["M50 12 L50 88"], name: "l", sound: "luh" },
  "m": { strokes: ["M22 45 L22 88", "M22 62 C22 52 30 45 38 45 C46 45 52 52 52 62 L52 88", "M52 62 C52 52 60 45 68 45 C76 45 82 52 82 62 L82 88"], name: "m", sound: "muh" },
  "n": { strokes: ["M26 45 L26 88", "M26 62 C26 52 36 45 49 45 C61 45 72 52 72 62 L72 88"], name: "n", sound: "nuh" },
  "o": { strokes: ["M47 45 C34 45 24 54 24 66 C24 78 34 88 47 88 C60 88 70 78 70 66 C70 54 60 45 47 45 Z"], name: "o", sound: "ah" },
  "p": { strokes: ["M28 45 L28 100", "M28 66 C28 54 38 45 50 45 C62 45 72 54 72 66 C72 78 62 88 50 88 L28 88"], name: "p", sound: "puh" },
  "q": { strokes: ["M70 52 C64 46 57 45 50 45 C37 45 28 54 28 66 C28 78 37 88 50 88 C60 88 68 83 70 76", "M70 45 L70 100"], name: "q", sound: "kwuh" },
  "r": { strokes: ["M30 45 L30 88", "M30 62 C30 52 40 45 54 45 C60 45 64 46 68 48"], name: "r", sound: "ruh" },
  "s": { strokes: ["M66 52 C60 45 46 44 38 49 C30 54 31 62 42 65 C52 68 63 70 65 77 C67 84 56 88 45 87 C39 86 34 83 31 78"], name: "s", sound: "sss" },
  "t": { strokes: ["M46 12 L46 88", "M28 45 L64 45"], name: "t", sound: "tuh" },
  "u": { strokes: ["M26 45 L26 72 C26 83 35 88 46 88 C57 88 66 83 66 72 L66 45", "M66 45 L66 88"], name: "u", sound: "uh" },
  "v": { strokes: ["M24 45 L46 88", "M68 45 L46 88"], name: "v", sound: "vuh" },
  "w": { strokes: ["M18 45 L32 88", "M32 88 L46 45", "M46 45 L60 88", "M60 88 L74 45"], name: "w", sound: "wuh" },
  "x": { strokes: ["M26 45 L68 88", "M68 45 L26 88"], name: "x", sound: "ks" },
  "y": { strokes: ["M26 45 L48 84", "M70 45 L38 100"], name: "y", sound: "yuh" },
  "z": { strokes: ["M26 45 L70 45", "M70 45 L26 88", "M26 88 L70 88"], name: "z", sound: "zzz" }
};

export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const LOWER = "abcdefghijklmnopqrstuvwxyz".split("");
export const DIGITS = "0123456789".split("");
