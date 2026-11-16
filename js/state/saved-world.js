// Selected by the dedicated demo document BEFORE the module graph loads.
// Not a URL flag and never inferred from an existing saved world.
export const temporaryDemo = typeof document !== 'undefined'
  && document.documentElement?.dataset?.playMode === 'temporary-demo';
const DEMO_WORLD = Object.freeze({ id: 'demo', label: 'Temporary demo', database: null, profile: null });

// Explicit saved worlds. An unqualified old link keeps the original database.
// No existing creation, progress or voice is assigned to a child by inference.
export const SAVED_WORLDS = Object.freeze({
  shared: Object.freeze({ id: 'shared', label: 'Shared earlier play', database: 'rainbow-valley', profile: null }),
  rayna: Object.freeze({ id: 'rayna', label: 'Rayna’s saved world', database: 'rainbow-valley-rayna', profile: 'rayna' }),
  veer: Object.freeze({ id: 'veer', label: 'Veer’s saved world', database: 'rainbow-valley-veer', profile: 'veer' }),
});

export function savedWorldFromSearch(search = '') {
  const choices = new URLSearchParams(search).getAll('world');
  return choices.length === 1 && ['rayna', 'veer'].includes(choices[0]) ? SAVED_WORLDS[choices[0]] : SAVED_WORLDS.shared;
}

// Stable for the entire page lifetime. Switching requires ordinary full navigation
// so no loaded controller or pending queue can write into a different database.
export const savedWorld = temporaryDemo ? DEMO_WORLD : savedWorldFromSearch(typeof location !== 'undefined' ? location.search : '');

export function savedWorldLink(href, id, { muted = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(SAVED_WORLDS, id)) throw new Error('Unknown saved world');
  const url = new URL(href);
  url.hash = '';
  for (const key of ['world', 'word', 'muted', 'welcome']) url.searchParams.delete(key);
  if (id !== 'shared') url.searchParams.set('world', id);
  url.searchParams.set('welcome', '1');
  if (muted) url.searchParams.set('muted', '1');
  return url.href;
}

export function savedWorldStorageKey(legacyKey, world = savedWorld) {
  return world.id === 'shared' ? legacyKey : `${legacyKey}:${world.id}`;
}

export function checkBackupWorld(backup, world = savedWorld) {
  const source = backup?.savedWorld;
  // Old backups remain recoverable in the unassigned original world.
  const sourceId = source == null ? 'shared' : source.v === 1 && Object.prototype.hasOwnProperty.call(SAVED_WORLDS, source.id) ? source.id : null;
  if (!sourceId) throw Object.assign(new Error('This backup has an unknown saved world. Current play was kept.'), { code: 'backup-world-invalid' });
  if (sourceId !== world.id) throw Object.assign(new Error(`This backup belongs to ${SAVED_WORLDS[sourceId].label}. Open that saved world before restoring it. Current play was kept.`), { code: 'backup-world-mismatch' });
  return sourceId;
}
