// Visit-local entry state only: no storage, recording or timers.
export function welcomeEntry({ enter, paint, requestFullscreen, isActive = () => true }) {
  let alive = true, pending = false, done = false;
  paint('ready');
  return {
    async play() {
      if (!alive || pending || done || !isActive()) return false;
      pending = true; paint('opening');
      try {
        // Invoke inside the trusted click, before any await. Fullscreen is optional:
        // a refusal or an unresolved browser promise must never strand Play.
        try { Promise.resolve(requestFullscreen?.()).catch(() => {}); } catch (_) {}
        const result = await enter();
        if (!alive) return false;
        if (result === false) { paint('retry'); return false; }
        done = true; paint('done'); return true;
      } catch {
        if (alive) paint('retry');
        return false;
      } finally { pending = false; }
    },
    destroy() { alive = false; },
  };
}
