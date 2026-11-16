// art.js - the art manifest and the loaded images behind it.
//
// Every visual in the game asks art.get(key) first and draws its palette placeholder
// when the answer is null (js/world/characters.js). That is what lets the whole game be
// playable before a single illustration exists, and lets art land later with no code
// change. Keys are the manifest's own keys, e.g. "characters/pip_idle", "props/leaf".
//
// Manifest shape (written by tools/postprocess_art.py):
//   { "characters/pip_idle": { webp, png, w, h, anchor: [ax, ay] }, ... }

const MANIFEST_URL = "assets/art/manifest.json";
import settings from '../state/settings.js';
import { halloweenActive, seasonalArtKey, seasonalBackgroundKey, seasonLogo, seasonLogoFallback } from '../data/season.js';
const BASE = "assets/art/";

let manifest = {};
let loaded = false;
let manifestPromise = null;
const images = new Map(); // key -> HTMLImageElement (only successfully decoded ones)
const pending = new Map();
const directPending = new Map();
const directLoaded = new Set();
const warmScheduled = new Set();

const exact = (...keys) => ({ exact: keys });
const prefix = (...keys) => ({ prefix: keys });

// Route groups are deliberately central and conservative. A screen is mounted only
// after its group has loaded, so synchronous art.get() consumers never flash their
// procedural fallback while the published image is still in flight.
const ROUTE_ART = Object.freeze({
  welcome: [
    exact(
      "bg/shared/layer0", "bg/map/layer1", "bg/map/layer2",
      "characters/pip_idle", "characters/caterpillar_idle",
      "characters/unicorn_idle", "characters/unicorn_idle_grey", "characters/family_child1_idle",
      "ui/veer-title", "ui/veers-valley-logo"
      , "halloween/rayna-trex-idle-v2", "halloween/boo-hollow-background-v1"
    ),
  ],
  map: [
    exact(
      "bg/stories/day", "places/art", "places/together",
      "characters/caterpillar_idle", "characters/unicorn_idle", "characters/unicorn_idle_grey",
      "characters/bridge_idle", "characters/discovery_idle", "characters/family_child1_idle",
      "ui/veer-title", "ui/veers-valley-logo"
      , "halloween/rayna-trex-idle-v2", "halloween/boo-path-v1", "halloween/boo-hollow-background-v1"
    ),
    exact("characters/pip_idle", "characters/pip_happy"),
  ],
  garden: [
    prefix("bg/shared/", "bg/garden/", "characters/caterpillar_", "characters/butterfly_", "characters/cocoon"),
    exact("stories/raindrop", "ui/leaf_badge", "stickers/draw_flower"),
  ],
  meadow: [
    prefix("bg/shared/", "bg/meadow/", "characters/unicorn_"),
  ],
  bridge: [
    exact("bg/shared/layer0", "bg/map/layer1"),
    prefix("models/", "stickers/"),
  ],
  studio: [
    exact("halloween/refresh/pip", "halloween/refresh/unicorn", "halloween/refresh/butterfly-open", "halloween/refresh/caterpillar"),
    exact(
      "bg/shared/layer0", "bg/map/layer1",
      "characters/pip_idle", "characters/unicorn_idle", "characters/butterfly_open",
      "characters/caterpillar_idle", "characters/veer_idle",
      "stickers/draw_sun", "stickers/draw_rainbow", "stickers/draw_flower",
      "stickers/draw_house", "stickers/draw_balloon", "stickers/draw_heart", "stickers/draw_star", "toy-workshop/wheels-v1"
    ),
  ],
  stories: [
    exact(
      "bg/shared/layer0", "bg/meadow/layer1", "bg/stories/day", "bg/stories/twilight",
      "characters/family_child1_idle", "characters/family_grandma_idle",
      "characters/cocoon", "characters/bridge_idle"
    ),
    prefix(
      "characters/pip_", "characters/caterpillar_", "characters/unicorn_",
      "characters/veer_", "characters/grandma_", "stories/", "stickers/"
    ),
  ],
  discovery: [
    exact(
      "bg/shared/layer0", "bg/discovery/layer1",
      "characters/pip_idle", "characters/pip_happy", "characters/pip_cheer", "characters/discovery_idle", "stories/black-cat",
      "characters/unicorn_idle", "characters/caterpillar_idle", "characters/caterpillar_sleepy",
      "props/counting-flower", "props/counting-pot",
      "props/counting-apple", "props/counting-leaf", "props/counting-star",
      "props/coat-spots", "props/scarf-stripes", "props/blanket-waves"
    ),
  ],
  treehouse: [
    exact("bg/shared/layer0", "bg/map/layer1", "play-stage/backdrop", "play-stage/booth_front"),
    prefix("characters/family_", "characters/veer_", "stickers/"),
  ],
  "play-stage": [
    prefix("play-stage/", "characters/family_", "music-band/"),
    exact("toy-workshop/puppet-handle-v1"),
    exact("characters/pip_idle", "characters/veer_idle", "stickers/draw_heart", "stickers/draw_flower", "stories/ball"),
  ],
  grandma: [
    exact("bg/shared/layer0", "bg/map/layer1", "halloween/rayna-trex-idle-v2"),
    prefix("characters/grandma_", "characters/family_", "characters/veer_", "stories/", "stickers/"),
  ],
  parent: [],
  picnic: [prefix("characters/family_", "garden-cafe/"), exact("characters/veer_idle", "characters/pip_idle", "stories/basket", "props/fruit_bowl", "props/strawberry", "props/picnic-apple-v1", "props/picnic-round-plate-v1", "props/picnic-round-bowl-v1", "props/picnic-apple-half-v1", "props/picnic-strawberry-half-v1", "props/picnic-empty-table-v1", "river-run/float-v1", "ui/sign", "stickers/draw_flower"), prefix("music-band/")],
  "build-lab": [exact("characters/caterpillar_idle")],
  "water-garden": [exact("characters/pip_idle", "stories/basket", "stories/black-cat", "props/counting-flower", "props/counting-pot", "props/wg-leafy-canopy", "props/wg-sprout", "props/wg-cat-resting-v1")],
  "picture-post": [prefix("characters/family_", "picture-post/"), exact("characters/veer_idle", "stickers/draw_flower", "stickers/draw_sun", "stickers/draw_heart", "stickers/draw_star")],
  "toy-workshop": [prefix("toy-workshop/"), exact("river-run/float-v1")],
  "rolling-run": [exact("toy-workshop/wheels-v1", "rolling-run/ramp-v1", "rolling-run/block-v1", "rolling-run/landing-mat-v1", "stickers/draw_flower")],
  "music-band": [prefix("music-band/"), exact("characters/family_adult1_idle", "characters/veer_idle")],
  "animal-friends": [prefix("animal-friends/"), exact("stories/black-cat", "props/wg-cat-resting-v1", "characters/family_ishan_idle", "characters/family_grandma_idle", "characters/family_grandpa_idle")],
  "river-run": [prefix("river-run/"), exact("characters/family_adult1_idle", "characters/family_grandma_idle", "characters/family_ishan_idle")],
  "boo-hollow": [prefix('halloween/'), exact('bg/shared/layer0', 'bg/map/layer1', 'characters/family_child1_idle', 'characters/family_grandma_idle', 'characters/family_grandpa_idle', 'characters/veer_idle', 'characters/family_ishan_idle', 'ui/veer-title')],
});

const ROUTE_DIRECT = Object.freeze({
  welcome: [["assets/art/final/ui/raynas-valley-logo.webp", "assets/art/final/ui/raynas-valley-logo.png"]],
  map: [["assets/art/final/ui/raynas-valley-logo.webp", "assets/art/final/ui/raynas-valley-logo.png"]],
  discovery: [
    "assets/art/final/characters/pip_idle.webp",
    "assets/art/final/characters/unicorn_idle.webp",
    "assets/art/final/characters/caterpillar_idle.webp",
    "assets/art/final/characters/caterpillar_sleepy.webp",
  ],
});

/** Manifest paths may be repo-relative or relative to assets/art/; accept both. */
function resolve(p) {
  if (!p) return null;
  if (/^(https?:)?\/\//.test(p) || p.startsWith("/")) return p;
  if (p.startsWith("assets/")) return p;
  return BASE + p.replace(/^\.\//, "");
}

/** Bound the whole fallback sequence, not each attempt. A stalled image must
 * not strand navigation. Late completions cannot populate a retired request. */
function loadImageSources(sources) {
  if (!sources.length) return Promise.resolve(null);
  return new Promise(done => {
    let i = 0, settled = false;
    const img = new Image(); img.decoding = "async";
    const finish = value => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      img.onload = img.onerror = null;
      done(value);
    };
    const timer = setTimeout(() => finish(null), 8000);
    img.onload = () => finish(img);
    img.onerror = () => {
      if (settled) return;
      i += 1;
      if (i < sources.length) img.src = sources[i];
      else finish(null);
    };
    img.src = sources[0];
  });
}

/** One image, WebP first, PNG on error. Missing or stalled art is just null. */
function loadOne(key, entry) {
  if (images.has(key)) return Promise.resolve(images.get(key));
  if (pending.has(key)) return pending.get(key);
  const sources = [resolve(entry && entry.webp), resolve(entry && entry.png), resolve(entry && entry.svg)].filter(Boolean);
  const promise = loadImageSources(sources).then(img => {
    if (img) images.set(key, img);
    return img;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

function loadDirect(sourceList) {
  const sources = (Array.isArray(sourceList) ? sourceList : [sourceList]).filter(Boolean);
  const key = sources.join("\n");
  if (directLoaded.has(key)) return Promise.resolve(true);
  if (directPending.has(key)) return directPending.get(key);
  const promise = loadImageSources(sources).then(img => {
    if (img) directLoaded.add(key);
    return !!img;
  }).finally(() => directPending.delete(key));
  directPending.set(key, promise);
  return promise;
}

/**
 * Read the manifest without downloading every illustration. A missing manifest
 * (404, or an HTML error page from a dev server) is a normal state, not a failure:
 * the game runs in placeholder mode. Safe to call more than once.
 */
export async function load() {
  if (loaded) return manifest;
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    let data = null, timer;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    try {
      // Include body decoding in the same deadline. A late network result must
      // not replace the placeholder manifest after the route has continued.
      const request = (async () => {
        const res = await fetch(MANIFEST_URL, { cache: "no-cache", ...(controller ? { signal: controller.signal } : {}) });
        return res.ok ? await res.json() : null;
      })();
      const deadline = new Promise(resolve => {
        timer = setTimeout(() => { resolve(null); controller?.abort(); }, 8000);
      });
      data = await Promise.race([request, deadline]);
    } catch {
      data = null;
    } finally {
      clearTimeout(timer);
    }
    manifest = data && typeof data === "object" && !Array.isArray(data) ? data : {};
    loaded = true;
    return manifest;
  })();
  return manifestPromise;
}

/** Manifest keys needed before a route mounts. Exported for focused contract tests. */
export function routeKeys(route) {
  const rules = ROUTE_ART[String(route || "")] || [];
  const available = Object.keys(manifest);
  const selected = new Set();
  for (const rule of rules) {
    for (const key of rule.exact || []) if (manifest[key]) selected.add(key);
    for (const start of rule.prefix || []) {
      for (const key of available) if (key.startsWith(start)) selected.add(key);
    }
  }
  // The other child's title/portrait is not visible on this entry screen.
  // Keep the assets in the manifest and load them normally when that profile
  // is selected; do not make a first Rayna visit wait for Veer's title art.
  if (['welcome', 'map'].includes(String(route)) && settings.get().valleyProfile !== 'veer') {
    selected.delete('ui/veer-title');
    selected.delete('ui/veers-valley-logo');
  }
  return [...selected];
}

/** Load and decode a reviewed set. A failed WebP transparently tries its PNG. */
export async function ensure(keysToLoad) {
  await load();
  const base = Array.isArray(keysToLoad) ? keysToLoad : [];
  const requested = [...new Set(base.flatMap(key => [key, seasonalArtKey(key, settings.get())]))].filter(key => manifest[key]);
  await Promise.all(requested.map((key) => loadOne(key, manifest[key])));
  return {
    requested,
    loaded: requested.filter((key) => images.has(key)),
    missing: requested.filter((key) => !images.has(key)),
  };
}

/** Decode all art a route reads synchronously, plus intentional direct image URLs. */
export async function ensureRoute(route) {
  await load();
  const id = String(route || "");
  const [result] = await Promise.all([
    ensure(routeKeys(id)),
    halloweenActive(settings.get()) ? ensure(['halloween/treat-bucket-v1', seasonalBackgroundKey(id, settings.get()), seasonalBackgroundKey('map', settings.get())]) : Promise.resolve(),
    ['welcome', 'map'].includes(id) && halloweenActive(settings.get())
      ? loadDirect([seasonLogo({id:'rayna', logo:'raynas-valley-logo'}, settings.get()), seasonLogoFallback({id:'rayna', logo:'raynas-valley-logo'}, settings.get())]) : Promise.resolve(),
    Promise.all((ROUTE_DIRECT[id] || []).map(loadDirect)),
  ]);
  return result;
}

/** Warm one likely next route only after the current screen has had time to settle. */
export function warmRoute(route, { delay = 1200 } = {}) {
  const id = String(route || "");
  if (!ROUTE_ART[id] || warmScheduled.has(id)) return false;
  if (typeof navigator !== "undefined" && navigator.connection?.saveData) return false;
  warmScheduled.add(id);
  setTimeout(() => {
    const run = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        warmScheduled.delete(id);
        return;
      }
      void ensureRoute(id);
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(run, 250);
  }, Math.max(0, Number(delay) || 0));
  return true;
}

/** The decoded image for a key, or null when there is no art for it (yet). */
export function get(key) {
  return images.get(seasonalArtKey(key, settings.get())) || images.get(key) || null;
}

/** Stable image identity for editable saved stamps; never apply seasonal aliases. */
export function getOriginal(key) {
  return images.get(key) || null;
}

/** True only when the image is actually decoded and drawable. */
export function has(key) {
  return Boolean(get(key));
}

/** Normalised [ax, ay] anchor (0..1) for a key; the centre when the manifest is silent. */
export function anchor(key) {
  const selected = seasonalArtKey(key, settings.get());
  const entry = images.has(selected) ? manifest[selected] : manifest[key];
  const a = entry && entry.anchor;
  return Array.isArray(a) && a.length === 2 ? [a[0], a[1]] : [0.5, 0.5];
}

/** Every key the manifest knows, loaded or not. Used by the parent corner. */
export function keys() {
  return Object.keys(manifest);
}

export const art = { load, ensure, ensureRoute, warmRoute, routeKeys, get, getOriginal, has, anchor, keys };
export default art;
