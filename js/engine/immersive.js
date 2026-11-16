// Fullscreen is presentation, never a device lock. Play offers entry; parent controls retain exit.
export function isStandalone(win = globalThis.window, nav = globalThis.navigator) {
  return !!(nav?.standalone || win?.matchMedia?.('(display-mode: standalone)').matches);
}
export function fullscreenElement(doc = globalThis.document) { return doc?.fullscreenElement || doc?.webkitFullscreenElement || null; }
export async function enterFullscreen(doc = globalThis.document) {
  if (fullscreenElement(doc)) return { entered: true, reason: '' };
  const target = doc?.documentElement;
  const request = target?.requestFullscreen || target?.webkitRequestFullscreen;
  if (!request) return { entered: false, reason: 'unsupported' };
  try { await request.call(target); return { entered: !!fullscreenElement(doc), reason: '' }; }
  catch (_) { return { entered: false, reason: 'declined' }; }
}
export async function exitFullscreen(doc = globalThis.document) {
  if (!fullscreenElement(doc)) return { exited: true, reason: '' };
  const exit = doc?.exitFullscreen || doc?.webkitExitFullscreen;
  if (!exit) return { exited: false, reason: 'unsupported' };
  try {
    await exit.call(doc);
    const exited = !fullscreenElement(doc);
    return { exited, reason: exited ? '' : 'unchanged' };
  } catch (_) { return { exited: !fullscreenElement(doc), reason: fullscreenElement(doc) ? 'declined' : '' }; }
}
