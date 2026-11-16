// Watch only an already-denied Web Lock. This never requests, steals or releases
// ownership; the next normal boot must acquire the same writer guard again.
export function watchWorldUnlock({ query, lockName, reload, schedule = setTimeout, cancel = clearTimeout, interval = 2000 }) {
  let stopped = false, timer = null;
  const tick = async () => {
    timer = null;
    if (stopped) return;
    try {
      const result = await query();
      if (stopped) return;
      if (!Array.isArray(result?.held) || result.held.some(lock => typeof lock?.name !== 'string')) {
        stopped = true; // An unexpected result proves nothing. Leave manual retry available.
        return;
      }
      if (!result.held.some(lock => lock.name === lockName)) {
        stopped = true;
        reload();
        return;
      }
    } catch (_) { stopped = true; return; } // A failed query proves nothing.
    if (!stopped) timer = schedule(tick, interval);
  };
  timer = schedule(tick, interval);
  return () => { stopped = true; if (timer !== null) cancel(timer); timer = null; };
}
