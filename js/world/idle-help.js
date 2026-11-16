// Bounded, cancelable idle invitation. No recording, metrics collection or persistence.
export function installIdleHelp(root, { active, demonstrate, documentTarget = document,
  now = () => performance.now(), delay = setTimeout, cancel = clearTimeout } = {}) {
  let timer = null, stop = null, disposed = false, lastDemo = -Infinity;
  const clear = () => { if (timer !== null) cancel(timer); timer = null; stop?.(); stop = null; };
  const schedule = () => {
    if (disposed || documentTarget.hidden || !root.isConnected) return;
    const wait = Math.max(8000, 20000 - (now() - lastDemo));
    timer = delay(() => {
      timer = null;
      if (disposed || documentTarget.hidden || !root.isConnected) return;
      if (active()) { lastDemo = now(); stop?.(); stop = demonstrate() || null; }
      schedule();
    }, wait);
  };
  const input = () => { clear(); schedule(); };
  const visibility = () => { clear(); if (!documentTarget.hidden) schedule(); };
  for (const event of ['pointerdown','keydown','focusin']) root.addEventListener(event,input,true);
  documentTarget.addEventListener('visibilitychange',visibility);
  schedule();
  return () => {
    disposed=true;clear();
    for (const event of ['pointerdown','keydown','focusin']) root.removeEventListener(event,input,true);
    documentTarget.removeEventListener('visibilitychange',visibility);
  };
}
