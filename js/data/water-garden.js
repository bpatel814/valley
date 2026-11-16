// Geometry uses a stable 100 by 100 garden, independent of device pixels.
export const WATER_GARDEN_VERSION = 1;
export const WATER_CANOPY_WIDTH = 34;
export const WATER_GARDEN_MODES = ['pip', 'shade', 'free'];
export const WATER_SOURCE = { x: 50, y: 12 };
export const WATER_HUB = { x: 50, y: 38 };
export const WATER_BEDS = [{ id: 'left', x: 20, y: 76 }, { id: 'middle', x: 50, y: 76 }, { id: 'right', x: 80, y: 76 }];
export const WATER_SITUATIONS = {
  pip: { title: "Pip's flower paths", request: 'Grow a flower and invite Pip to look.', phrase: 'wg_pip', plant: 'flower' },
  shade: { title: 'A quiet resting garden', request: 'Grow a leafy canopy, then choose a shady spot for the cat.', phrase: 'wg_shade', plant: 'leaf' },
  free: { title: 'Your water garden', request: 'Plant, connect and decorate your own garden.', phrase: 'wg_free', plant: 'flower' },
};
export const ROUTE_SEGMENTS = [
  { id: 'trunk', points: [WATER_SOURCE, WATER_HUB] },
  ...WATER_BEDS.map(bed => ({ id: bed.id, points: [WATER_HUB, { x: bed.x, y: bed.y }] })),
];
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = n => Math.max(0, Math.min(100, Number(n)));
export function normalizeWaterGarden(raw = {}, mode = 'pip') {
  raw = raw && typeof raw === 'object' ? raw : {};
  const paths = (Array.isArray(raw.paths) ? raw.paths : []).slice(0, 60).map(path =>
    (Array.isArray(path) ? path : []).slice(0, 800)
      .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map(p => ({ x: clamp(p.x), y: clamp(p.y) }))).filter(path => path.length);
  return { v: 1, mode: WATER_GARDEN_MODES.includes(mode) ? mode : 'pip', paths,
    plants: WATER_BEDS.map((bed, i) => ({ id: bed.id, kind: raw.plants?.[i]?.kind === 'leaf' ? 'leaf' : 'flower',
      stage: Math.max(0, Math.min(3, Number(raw.plants?.[i]?.stage) | 0)) })),
    decorations: (Array.isArray(raw.decorations) ? raw.decorations : []).slice(0, 24)
      .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map(p => ({ x: clamp(p.x), y: clamp(p.y), kind: p.kind === 'stone' ? 'stone' : 'flower' })),
    pours: Math.max(0, Math.min(1000, Number(raw.pours) | 0)),
    friend: { x: Number.isFinite(raw.friend?.x) ? Math.max(6, Math.min(94, raw.friend.x)) : 12,
      y: Number.isFinite(raw.friend?.y) ? Math.max(12, Math.min(92, raw.friend.y)) : 30 } };
}
// The view uses the same ellipse for the visibly shaded ground and rest detection.
export function waterShadeAreas(raw) {
  const garden = normalizeWaterGarden(raw, raw?.mode);
  return WATER_BEDS.filter((bed, i) => garden.plants[i].kind === 'leaf' && garden.plants[i].stage === 3)
    .map(bed => ({ id: bed.id, x: bed.x + 4, y: 83, rx: 16, ry: 9 }));
}
export function waterFriendOutcome(raw) {
  const garden = normalizeWaterGarden(raw, raw?.mode);
  const shade = waterShadeAreas(garden).find(area => ((garden.friend.x - area.x) / area.rx) ** 2 + ((garden.friend.y - area.y) / area.ry) ** 2 <= 1);
  const flower = WATER_BEDS.find((bed, i) => garden.plants[i].kind === 'flower' && garden.plants[i].stage === 3 &&
    Math.hypot(garden.friend.x - bed.x, garden.friend.y - 83) <= 13);
  return { resting: garden.mode !== 'pip' && !!shade, shadeBed: shade?.id || null,
    visitingFlower: garden.mode === 'pip' && !!flower, flowerBed: flower?.id || null };
}
export function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function segments(path) { return path.length === 1 ? [[path[0], path[0]]] : path.slice(1).map((p, i) => [path[i], p]); }
function geometryPolyline(path) {
  if (path.length < 3) return path;
  // Keep original saved ink intact; prune subpixel wiggle only for connectivity.
  const retained = new Set([0, path.length - 1]);
  const pending = [[0, path.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop();
    let furthest = -1, distance = .3;
    for (let i = start + 1; i < end; i++) {
      const d = pointSegmentDistance(path[i], path[start], path[end]);
      if (d > distance) { distance = d; furthest = i; }
    }
    if (furthest !== -1) { retained.add(furthest); pending.push([start, furthest], [furthest, end]); }
  }
  return [...retained].sort((a, b) => a - b).map(i => path[i]);
}
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function segmentDistance(a, b, c, d) {
  // Strict crossings plus endpoint distance cover intersections and collinear overlap.
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
export function waterConnections(paths, tolerance = 4.5) {
  const list = normalizeWaterGarden({ paths }).paths;
  const lines = list.map(path => segments(geometryPolyline(path)));
  const wet = new Set();
  const depth = {};
  lines.forEach((parts, i) => {
    if (parts.some(([a, b]) => pointSegmentDistance(WATER_SOURCE, a, b) <= tolerance)) { wet.add(i); depth[i] = 0; }
  });
  const queue = [...wet];
  while (queue.length) {
    const current = queue.shift();
    lines.forEach((parts, i) => {
      if (!wet.has(i) && lines[current].some(([a, b]) => parts.some(([c, d]) => segmentDistance(a, b, c, d) <= tolerance))) {
        wet.add(i); depth[i] = depth[current] + 1; queue.push(i);
      }
    });
  }
  return { paths: [...wet], depth, beds: WATER_BEDS.filter(bed => [...wet].some(i => lines[i].some(([a, b]) => pointSegmentDistance(bed, a, b) <= tolerance + 3))).map(bed => bed.id) };
}
export function pourWater(raw) {
  const garden = normalizeWaterGarden(raw, raw.mode);
  const connected = waterConnections(garden.paths);
  const grown = [];
  garden.plants.forEach(plant => {
    if (plant.stage > 0 && plant.stage < 3 && connected.beds.includes(plant.id)) { plant.stage += 1; grown.push(plant.id); }
  });
  garden.pours += 1;
  return { garden, connected, grown, complete: garden.plants.every(plant => plant.stage === 3) };
}
// Render-pixel hit testing: one nearest channel, newest on an exact crossing.
// Shared by the press preview and release, so the highlighted path is the lifted one.
export function waterPathAt(paths, target) {
  if (![target?.x, target?.y, target?.width, target?.height].every(Number.isFinite) || target.width <= 0 || target.height <= 0) return -1;
  const pixel = p => ({ x: p.x * target.width / 100, y: p.y * target.height / 100 });
  let selected = -1, nearest = 22;
  paths.forEach((path, index) => {
    const distance = Math.min(...segments(path).map(([a, b]) => pointSegmentDistance(pixel(target), pixel(a), pixel(b))));
    if (distance <= nearest) { nearest = distance; selected = index; }
  });
  return selected;
}
/** Pick one ornament in rendered pixels; latest wins an exact overlap. */
export function waterDecorationAt(decorations, target) {
  if (![target?.x,target?.y,target?.width,target?.height].every(Number.isFinite) || target.width <= 0 || target.height <= 0) return -1;
  let selected = -1, nearest = 24;
  decorations.forEach((p,index) => {
    const distance = Math.hypot((p.x-target.x)*target.width/100,(p.y-target.y)*target.height/100);
    if (distance <= nearest) { selected=index; nearest=distance; }
  });
  return selected;
}
export function editWaterGarden(raw, action) {
  const garden = normalizeWaterGarden(raw, raw.mode);
  if (action.type === 'path' && garden.paths.length < 60) {
    const points = Array.isArray(action.points) ? action.points : [];
    // Split long intentional marks at shared endpoints instead of truncating their ink.
    for (let offset = 0; offset < points.length && garden.paths.length < 60; offset += 799) {
      const path = normalizeWaterGarden({ paths: [points.slice(offset, offset + 800)] }).paths[0];
      if (path) garden.paths.push(path);
    }
  }
  if (action.type === 'segment' && garden.paths.length < 60) {
    const segment = ROUTE_SEGMENTS.find(row => row.id === action.id);
    if (segment) garden.paths.push(clone(segment.points));
  }
  if (action.type === 'lift-path') {
    const selected = waterPathAt(garden.paths, action);
    if (selected >= 0) garden.paths.splice(selected, 1);
  }
  if (action.type === 'plant') {
    const plant = garden.plants.find(row => row.id === action.id);
    const kind = action.kind === 'leaf' ? 'leaf' : 'flower';
    if (plant && !(plant.stage === 3 && plant.kind === kind)) { plant.kind = kind; plant.stage = 1; }
  }
  if (action.type === 'decorate' && garden.decorations.length < 24) {
    garden.decorations.push({ x: action.x, y: action.y, kind: action.kind });
  }
  if (action.type === 'move-decoration' && Number.isInteger(action.index) && garden.decorations[action.index] && Number.isFinite(action.x) && Number.isFinite(action.y)) {
    garden.decorations[action.index] = { ...garden.decorations[action.index], x: action.x, y: action.y };
  }
  if (action.type === 'place-friend') {
    const bed = WATER_BEDS.find(row => row.id === action.bed);
    if (bed) garden.friend = { x: bed.x + 6, y: 83 };
    else if (Number.isFinite(action.x) && Number.isFinite(action.y)) garden.friend = { x: action.x, y: action.y };
  }
  if (action.type === 'clear') return normalizeWaterGarden({}, garden.mode);
  return normalizeWaterGarden(garden, garden.mode);
}
export function commitGardenEdit(draft, garden) {
  return { garden: normalizeWaterGarden(garden, garden.mode), history: [...(draft.history || []), clone(draft.garden)].slice(-40) };
}
export function undoGardenEdit(draft) {
  if (!draft.history?.length) return clone(draft);
  return { garden: normalizeWaterGarden(draft.history.at(-1), draft.garden.mode), history: clone(draft.history.slice(0, -1)) };
}
