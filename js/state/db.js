// db.js - the only place IndexedDB is touched.
//
// Database `rainbow-valley` v1, three plain stores (no keyPath, key passed explicitly):
//   kv       small documents: 'progress', 'settings', 'resume'
//   gallery  finished drawings: `${day}_${id}_${ts}` -> {id, day, png, strokes, at}
//   voices   family recordings: `${speaker}/${key}` -> Blob
//
// Every write lands immediately (no debounce, no coalescing): a toddler kills the tab
// mid-stroke and nothing may be lost. If IndexedDB is missing (node tests) or refuses to
// open (private mode), we fall back to an in-memory Map, log one line, and never throw.

import { savedWorld, temporaryDemo } from './saved-world.js';
import { emit } from '../world/bus.js';

const DB_NAME = savedWorld.database;
const DB_VERSION = 1;
export const STORES = ["kv", "gallery", "voices"];

let connection = null;      // live IDBDatabase
let opening = null;         // in-flight open promise
let memoryMode = false;     // true once we give up on IndexedDB
let toldTheConsole = false;
let lastFailure = null;
const memory = new Map();   // store name -> Map(key -> value)
// An overlay retains unsaved writes while reads can still reach existing IDB
// records after a quota failure. Never replace the visible library with an
// empty memory store simply because one new creation could not be written.
const removed = new Map();
const cleared = new Set();
const revisions = new Map();
// Keep DB version 1 for v7 rollback. This private kv row is never exported.
export const WRITER_LEASE_KEY = 'valley:writer-lease:v8';
const LEASE_MS = 30000;
let writerGuard = null;
let writerOwned = true;
let leaseUntil = 0;
let leaseTicker = null;
let releaseLock = null;
const writerToken = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`;

function writerError() {
  return Object.assign(new Error(`${savedWorld.label} is open in another tab. Close the other tab, then reopen this one. Your saved play was kept.`), { code: 'saved-world-busy' });
}
function lostWriter() {
  const wasOwned = writerOwned;
  writerOwned = false;
  if (leaseTicker) { clearInterval(leaseTicker); leaseTicker = null; }
  if (wasOwned) emit('saved-world:blocked', { world: savedWorld.id });
  return writerError();
}
export function writerGuardKind() { return writerGuard; }
export function hasWriteAccess() {
  return !writerGuard || (writerOwned && (writerGuard !== 'lease' || Date.now() < leaseUntil));
}
function changed(store) { revisions.set(store, (revisions.get(store) || 0) + 1); }
function removedKeys(store) { if (!removed.has(store)) removed.set(store, new Set()); return removed.get(store); }
function recovered() {
  if (connection && !cleared.size && [...memory.values()].every(m => !m.size) && [...removed.values()].every(s => !s.size)) {
    memoryMode = false; lastFailure = null;
  }
}

function memStore(store) {
  let m = memory.get(store);
  if (!m) { m = new Map(); memory.set(store, m); }
  return m;
}

function fallback(why, preserveConnection = false) {
  memoryMode = true;
  lastFailure = String(why || "unknown storage failure");
  if (!preserveConnection) connection = null;
  opening = null;
  if (!toldTheConsole) {
    toldTheConsole = true;
    console.info("[db] using in-memory storage (" + why + ")");
  }
}

function hasIDB() {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

/** Open (or reuse) the one shared connection. Resolves to a db or null (memory mode). */
function open() {
  if (temporaryDemo) { memoryMode = true; return Promise.resolve(null); }
  if (connection) return Promise.resolve(connection);
  if (opening) return opening;
  if (!hasIDB()) { fallback("indexedDB is not available"); return Promise.resolve(null); }
  let req;
  try { req = indexedDB.open(DB_NAME, DB_VERSION); }
  catch (e) { fallback("open threw: " + (e && e.name)); return Promise.resolve(null); }

  opening = new Promise((resolve) => {
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onblocked = () => {
      // Another tab holds an older version open. It will close; we simply wait.
      console.info("[db] waiting for another tab to release the database");
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { try { db.close(); } catch (_) {} connection = null; };
      db.onclose = () => { connection = null; };
      connection = db;
      opening = null;
      resolve(db);
    };
    req.onerror = () => {
      fallback("open failed: " + (req.error && req.error.name));
      resolve(null);
    };
  });
  return opening;
}

/** Run one transaction; on any IndexedDB failure fall back to memory rather than throw. */
function run(store, mode, work, { strict = false } = {}) {
  return open().then(async (db) => {
    if (mode === 'readwrite' && writerGuard && !writerOwned) throw writerError();
    if (!db) {
      // When IndexedDB exists but could not open, a critical read cannot
      // distinguish an empty store from inaccessible saved data.
      if (strict && !temporaryDemo && hasIDB()) throw new Error('Saved data could not be opened.');
      return work(null);
    }
    if (mode === 'readwrite' && writerGuard === 'memory') await ensurePersistentOwnership();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(mode === 'readwrite' && writerGuard === 'lease' ? [...new Set([store, 'kv'])] : store, mode);
      } catch (e) {
        reject(e);
        return;
      }
      const os = tx.objectStore(store);
      let result, renewedUntil = 0;
      const perform = () => {
        try { result = work(os); return true; }
        catch (e) { try { tx.abort(); } catch (_) {} reject(e); return false; }
      };
      tx.oncomplete = () => { if (renewedUntil) leaseUntil = renewedUntil; resolve(result && result.__box ? result.value : result); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("aborted"));
      if (mode === 'readwrite' && writerGuard === 'lease') {
        const leases = tx.objectStore('kv');
        const req = leases.get(WRITER_LEASE_KEY);
        req.onsuccess = () => {
          if (req.result?.token !== writerToken) {
            reject(lostWriter()); try { tx.abort(); } catch (_) {} return;
          }
          if (!perform()) return;
          try {
            renewedUntil = Date.now() + LEASE_MS;
            leases.put({ token: writerToken, until: renewedUntil }, WRITER_LEASE_KEY);
          } catch (error) { reject(error); try { tx.abort(); } catch (_) {} }
        };
      } else perform();
    });
  }).catch((e) => {
    if (e?.code === 'saved-world-busy' || strict) throw e;
    fallback("transaction failed: " + (e && (e.name || e.message)), true);
    return work(null);
  });
}

/** Wrap an IDBRequest so the transaction's oncomplete can hand back its result. */
function boxed(req) {
  const box = { __box: true, value: undefined };
  req.onsuccess = () => { box.value = req.result; };
  return box;
}

function read(store, key, strict = false) {
  if (memStore(store).has(key)) return Promise.resolve(memStore(store).get(key));
  if (cleared.has(store) || removedKeys(store).has(key)) return Promise.resolve(undefined);
  return run(store, "readonly", (os) => {
    if (!os) return memStore(store).get(key);
    return boxed(os.get(key));
  }, { strict });
}
export function get(store, key) { return read(store, key); }
// Critical bootstrap reads must distinguish an empty record from a failed read.
export function getStrict(store, key) { return read(store, key, true); }

export function put(store, key, val) {
  changed(store);
  let persistent = false;
  return run(store, "readwrite", (os) => {
    persistent = !!os;
    if (!os) { removedKeys(store).delete(key); memStore(store).set(key, val); return val; }
    os.put(val, key);
    return val;
  }).then(result => { if (persistent) { memStore(store).delete(key); removedKeys(store).delete(key); recovered(); } return result; });
}

export function del(store, key) {
  changed(store);
  let persistent = false;
  return run(store, "readwrite", (os) => {
    persistent = !!os;
    if (!os) { memStore(store).delete(key); removedKeys(store).add(key); return true; }
    os.delete(key);
    return true;
  }).then(result => { if (persistent) { memStore(store).delete(key); removedKeys(store).delete(key); recovered(); } return result; });
}

/** All values in a store. */
export function all(store) {
  return entries(store).then(rows => rows.map(([, value]) => value));
}

/** All keys in a store. */
function listKeys(store, strict = false) {
  return run(store, "readonly", (os) => {
    if (!os) return [];
    return boxed(os.getAllKeys());
  }, { strict }).then(base => {
    const out = new Set(cleared.has(store) ? [] : base);
    for (const key of removedKeys(store)) out.delete(key);
    for (const key of memStore(store).keys()) out.add(key);
    return [...out].filter(key => store !== 'kv' || key !== WRITER_LEASE_KEY);
  });
}
export function keys(store) { return listKeys(store); }
export function keysStrict(store) { return listKeys(store, true); }

export function clear(store) {
  changed(store);
  let persistent = false;
  return run(store, "readwrite", (os) => {
    persistent = !!os;
    if (!os) { memStore(store).clear(); removedKeys(store).clear(); cleared.add(store); return true; }
    os.clear();
    return true;
  }).then(result => { if (persistent) { memStore(store).clear(); removedKeys(store).clear(); cleared.delete(store); recovered(); } return result; });
}

/** Key/value pairs from one transaction, preserving the pairing. */
function enumerate(store, strict = false) {
  return run(store, "readonly", (os) => {
    if (!os) return [];
    const box = { __box: true, value: [] };
    const req = os.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      box.value.push([cursor.key, cursor.value]);
      cursor.continue();
    };
    return box;
  }, { strict }).then(base => {
    const out = new Map(cleared.has(store) ? [] : base);
    for (const key of removedKeys(store)) out.delete(key);
    for (const [key, value] of memStore(store)) out.set(key, value);
    return [...out].filter(([key]) => store !== 'kv' || key !== WRITER_LEASE_KEY);
  });
}
export function entries(store) { return enumerate(store); }
export function entriesStrict(store) { return enumerate(store, true); }

/** True when we are running off the in-memory Map (tests, private mode). */
export function isMemory() { return temporaryDemo || memoryMode || !hasIDB(); }

/** Small truthful status object for the adult screen and diagnostics. */
export function status() {
  return {
    mode: isMemory() ? "memory" : "indexeddb",
    persistent: !isMemory(),
    reason: lastFailure,
    world: savedWorld.id,
    writable: hasWriteAccess(),
  };
}

async function claimLease({ renew = false } = {}) {
  const database = await open();
  if (!database) { writerGuard = 'memory'; writerOwned = true; return true; }
  return new Promise((resolve, reject) => {
    const tx = database.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    let owned = false, renewedUntil = 0;
    const req = store.get(WRITER_LEASE_KEY);
    req.onsuccess = () => {
      const lease = req.result;
      if (renew ? lease?.token !== writerToken : lease?.token !== writerToken && Number(lease?.until) > Date.now()) return;
      renewedUntil = Date.now() + LEASE_MS;
      store.put({ token: writerToken, until: renewedUntil }, WRITER_LEASE_KEY);
      owned = true;
    };
    tx.oncomplete = () => { if (owned) leaseUntil = renewedUntil; resolve(owned); };
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Writer ownership could not be checked'));
  });
}

function beginLeaseRenewal() {
  if (leaseTicker) return;
  leaseTicker = setInterval(() => {
    void claimLease({ renew: true }).then(owned => { if (!owned) lostWriter(); }).catch(error => {
      // Quota refusal is not evidence of another owner. Preserve temporary ink
      // and the parent's backup controls while continuing to retry ownership.
      fallback('writer lease retry failed: ' + (error?.name || error?.message), true);
    });
  }, LEASE_MS / 3);
  leaseTicker?.unref?.();
}

async function ensurePersistentOwnership() {
  if (writerGuard !== 'memory') return;
  // IDB can recover during a private-mode or temporary-storage session. Claim
  // ownership before promoting any overlay back to persistent storage.
  writerGuard = 'lease';
  try { writerOwned = await claimLease(); }
  catch (error) { writerGuard = 'memory'; writerOwned = true; throw error; }
  if (!writerOwned) throw lostWriter();
  if (writerGuard === 'lease') beginLeaseRenewal();
}

/** One writable document per saved world. Rayna and Veer may play concurrently.
 * Web Locks remain held while a tab sleeps. Safari 14 uses an atomic IDB lease;
 * every write rechecks its token so a resumed stale tab cannot replace new play.
 */
export async function acquireWritableSession() {
  if (temporaryDemo) { writerGuard = 'demo'; writerOwned = true; memoryMode = true; return true; }
  if (writerGuard) return hasWriteAccess();
  writerOwned = false;
  if (globalThis.navigator?.locks?.request) {
    const obtained = await new Promise(resolve => {
      globalThis.navigator.locks.request(`rayna-valley:${DB_NAME}:writer`, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) { writerGuard = 'lock'; resolve(false); return; }
        writerGuard = 'lock'; writerOwned = true;
        await new Promise(release => { releaseLock = release; resolve(true); });
      }).catch(() => resolve(null));
    });
    if (obtained !== null) return obtained;
  }
  writerGuard = 'lease';
  try { writerOwned = await claimLease(); }
  catch (error) {
    writerGuard = 'memory'; writerOwned = true;
    fallback('writer ownership unavailable: ' + (error?.name || error?.message), true);
  }
  if (writerOwned && writerGuard === 'lease') beginLeaseRenewal();
  return writerOwned;
}

export async function releaseWritableSession() {
  if (!writerGuard) return;
  writerOwned = false;
  if (leaseTicker) { clearInterval(leaseTicker); leaseTicker = null; }
  releaseLock?.(); releaseLock = null;
  if (writerGuard !== 'lease') return;
  const database = await open();
  if (!database) return;
  await new Promise(resolve => {
    const tx = database.transaction('kv', 'readwrite'), store = tx.objectStore('kv');
    const req = store.get(WRITER_LEASE_KEY);
    req.onsuccess = () => { if (req.result?.token === writerToken) store.delete(WRITER_LEASE_KEY); };
    tx.oncomplete = tx.onerror = tx.onabort = resolve;
  });
}

/** Consistent multi-store snapshot, including temporary work without private rows. */
export async function snapshot(stores = STORES) {
  const database = await open();
  const base = Object.fromEntries(stores.map(store => [store, []]));
  if (database) {
    await new Promise((resolve, reject) => {
      const tx = database.transaction(stores, 'readonly');
      for (const store of stores) {
        const req = tx.objectStore(store).openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          base[store].push([cursor.key, cursor.value]); cursor.continue();
        };
      }
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Saved play could not be read'));
    });
  }
  for (const store of stores) {
    const rows = new Map(cleared.has(store) ? [] : base[store]);
    for (const key of removedKeys(store)) rows.delete(key);
    for (const [key, value] of memStore(store)) rows.set(key, value);
    if (store === 'kv') rows.delete(WRITER_LEASE_KEY);
    base[store] = [...rows];
  }
  return base;
}

/** Commit a validated restore in one transaction. A failed persistent restore
 * leaves all originals and every live cache intact, rather than partially mixing
 * two backups. Ordinary drawing writes still use their recoverable overlay.
 */
export async function atomicWrite({ put: puts = [], del: deletes = [], clear: clears = [] } = {}) {
  const stores = [...new Set([...puts.map(([store]) => store), ...deletes.map(([store]) => store), ...clears])];
  if (!stores.length) return status();
  if (stores.some(store => !STORES.includes(store)) || puts.some(([store, key]) => store === 'kv' && key === WRITER_LEASE_KEY) || deletes.some(([store, key]) => store === 'kv' && key === WRITER_LEASE_KEY)) throw new Error('Invalid saved-play transaction');
  if (writerGuard && !writerOwned) throw writerError();
  const database = await open();
  if (database) {
    try {
      if (writerGuard === 'memory') await ensurePersistentOwnership();
      await new Promise((resolve, reject) => {
        const names = writerGuard === 'lease' ? [...new Set([...stores, 'kv'])] : stores;
        const tx = database.transaction(names, 'readwrite');
        let refusal = null, renewedUntil = 0;
        const apply = () => {
          try {
            for (const store of clears) tx.objectStore(store).clear();
            for (const [store, key] of deletes) tx.objectStore(store).delete(key);
            for (const [store, key, value] of puts) tx.objectStore(store).put(value, key);
            if (writerGuard === 'lease') {
              renewedUntil = Date.now() + LEASE_MS;
              tx.objectStore('kv').put({ token: writerToken, until: renewedUntil }, WRITER_LEASE_KEY);
            }
          } catch (error) { refusal = error; try { tx.abort(); } catch (_) {} reject(error); }
        };
        tx.oncomplete = () => { if (renewedUntil) leaseUntil = renewedUntil; resolve(); };
        tx.onerror = tx.onabort = () => reject(refusal || tx.error || new Error('Saved-play transaction was aborted'));
        if (writerGuard === 'lease') {
          const req = tx.objectStore('kv').get(WRITER_LEASE_KEY);
          req.onsuccess = () => {
            if (req.result?.token !== writerToken) { refusal = lostWriter(); tx.abort(); return; }
            apply();
          };
        } else apply();
      });
    } catch (error) {
      if (error?.code === 'saved-world-busy') throw error;
      throw Object.assign(new Error('The backup could not be saved. Existing play was kept. Free some device storage, then try again.'), { code: 'backup-storage', cause: error });
    }
  }
  // No awaited work while changing the temporary overlay: memory restores are
  // atomic too, and persistence continues to be reported truthfully as temporary.
  for (const store of clears) { memStore(store).clear(); removedKeys(store).clear(); if (database) cleared.delete(store); else cleared.add(store); }
  for (const [store, key] of deletes) { memStore(store).delete(key); if (database) removedKeys(store).delete(key); else removedKeys(store).add(key); }
  for (const [store, key, value] of puts) { removedKeys(store).delete(key); if (database) memStore(store).delete(key); else memStore(store).set(key, value); }
  stores.forEach(changed);
  recovered();
  return status();
}

/** Retry temporary changes without hiding originals or reloading unsaved work.
 * Each store is replayed atomically, including a failed clear before newer puts.
 * If another action changes it during the retry, leave its overlay for a later
 * retry rather than mistakenly discarding a newer edit.
 */
export async function flushTemporaryWrites() {
  for (const store of STORES) {
    if (!cleared.has(store) && !removedKeys(store).size && !memStore(store).size) continue;
    let persistent = false, revision;
    await run(store, "readwrite", os => {
      if (!os) return false;
      persistent = true; revision = revisions.get(store) || 0;
      if (cleared.has(store)) os.clear();
      for (const key of removedKeys(store)) os.delete(key);
      for (const [key, value] of memStore(store)) os.put(value, key);
      return true;
    }).then(result => {
      if (result && persistent && revision === (revisions.get(store) || 0)) {
        cleared.delete(store); removedKeys(store).clear(); memStore(store).clear();
      }
    });
  }
  if (await run("kv", "readonly", os => !!os)) recovered();
  return status();
}

/** Close the shared connection (used by the parent corner before a full reset). */
export function close() {
  if (connection) { try { connection.close(); } catch (_) {} }
  connection = null;
  opening = null;
}

export const db = { get, getStrict, put, del, all, keys, keysStrict, entries, entriesStrict, clear, isMemory, status, flushTemporaryWrites, close, snapshot, atomicWrite, acquireWritableSession, releaseWritableSession, hasWriteAccess, writerGuardKind, STORES };
export default db;
