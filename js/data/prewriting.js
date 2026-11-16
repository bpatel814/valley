// Pre-writing marks for the first tracing experiences. They use the same 100 x 100
// GLYPHS contract as letters.js, so Tracer, guide and scorer need no special cases.
// The order moves from one straight pull to curves, closed shapes and crossings.

export const PREWRITING_GLYPHS = {
  rain: {
    id: "rain",
    strokes: ["M50 14 L50 86"],
    name: "Rain line",
    label: "Rain",
    sound: "down",
    phraseKey: "prewrite_rain",
  },
  path: {
    id: "path",
    strokes: ["M14 52 L86 52"],
    name: "Path line",
    label: "Path",
    sound: "across",
    phraseKey: "prewrite_path",
  },
  hill: {
    id: "hill",
    strokes: ["M14 76 C26 28 74 28 86 76"],
    name: "Hill",
    label: "Hill",
    sound: "up and over",
    phraseKey: "prewrite_hill",
  },
  rainbow: {
    id: "rainbow",
    strokes: ["M12 78 C18 24 82 24 88 78"],
    name: "Rainbow",
    label: "Rainbow",
    sound: "round the sky",
    phraseKey: "prewrite_rainbow",
  },
  bubble: {
    id: "bubble",
    strokes: ["M68 20 C42 7 18 28 18 52 C18 76 40 92 64 84 C88 76 92 42 76 26 C73 23 71 21 68 20 Z"],
    name: "Bubble",
    label: "Bubble",
    sound: "round and round",
    phraseKey: "prewrite_bubble",
  },
  rocketTrail: {
    id: "rocketTrail",
    strokes: ["M14 76 L32 28 L50 76 L68 28 L86 76"],
    name: "Rocket trail",
    label: "Rocket trail",
    sound: "zip zag",
    phraseKey: "prewrite_rocket_trail",
  },
  cross: {
    id: "cross",
    strokes: ["M50 14 L50 86", "M14 50 L86 50"],
    name: "Cross",
    label: "Cross",
    sound: "down and across",
    phraseKey: "prewrite_cross",
  },
};

export const PREWRITING_SEQUENCE = Object.freeze([
  "rain",
  "path",
  "hill",
  "rainbow",
  "bubble",
  "rocketTrail",
  "cross",
]);

export function getPrewritingGlyph(id) {
  return PREWRITING_GLYPHS[id] || null;
}

export default PREWRITING_GLYPHS;
