// Size the shell in CSS pixels. Never transform the drawing surface: PenInput
// and canvas resizing continue to use its actual getBoundingClientRect().
const positive = value => Number.isFinite(value) && value > 0;
const smallest = values => {
  const valid = values.filter(positive);
  return valid.length ? Math.floor(Math.min(...valid)) : null;
};

export function measureViewport(win, doc) {
  const root = doc?.documentElement;
  const visual = win?.visualViewport;
  // Pinch zoom is a viewing operation, not a request to relayout the paper.
  const unzoomed = visual && Math.abs((visual.scale ?? 1) - 1) < .01;
  return {
    width: smallest([win?.innerWidth, root?.clientWidth, unzoomed ? visual.width : null]),
    height: smallest([win?.innerHeight, root?.clientHeight, unzoomed ? visual.height : null]),
  };
}

function editable(element) {
  if (!element) return false;
  if (element.isContentEditable || element.tagName === 'TEXTAREA') return true;
  return element.tagName === 'INPUT' && !['button', 'checkbox', 'color', 'file', 'hidden',
    'image', 'radio', 'range', 'reset', 'submit'].includes(element.type);
}

/** Install once at boot, before router.init(). Returns a complete teardown. */
export function installViewport({ win = globalThis.window, doc = globalThis.document } = {}) {
  if (!win || !doc?.documentElement?.style) return () => {};
  const style = doc.documentElement.style;
  const properties = ['--app-width', '--app-height'];
  const previous = properties.map(name => [style.getPropertyValue(name), style.getPropertyPriority(name)]);
  const listeners = [];
  const pointers = new Set();
  let size = null;
  let frame = null;
  let orientationTimer = null;
  let blurTimer = null;
  let keyboardHeld = false;
  let disposed = false;
  const listen = (target, name, fn, options) => {
    target?.addEventListener?.(name, fn, options);
    listeners.push(() => target?.removeEventListener?.(name, fn, options));
  };
  const update = () => {
    if (disposed) return;
    frame = null;
    if (pointers.size) return;
    const next = measureViewport(win, doc);
    if (!next.width || !next.height) return;
    // A parent typing into a field should not move the entire game under it.
    // A width change indicates rotation, where the old layout cannot be held.
    const sameWidth = size && Math.abs(next.width - size.width) < 80;
    if (sameWidth && (editable(doc.activeElement) || blurTimer !== null) &&
        ((keyboardHeld && next.height < size.height - 1) ||
         size.height - next.height > Math.max(120, size.height * .2))) {
      keyboardHeld = true;
      return;
    }
    keyboardHeld = false;
    if (next.width !== size?.width) style.setProperty('--app-width', `${next.width}px`);
    if (next.height !== size?.height) style.setProperty('--app-height', `${next.height}px`);
    size = next;
  };
  const schedule = () => {
    if (!disposed && frame === null) frame = win.requestAnimationFrame(update);
  };
  listen(win, 'resize', schedule);
  listen(win, 'pageshow', schedule);
  listen(win.visualViewport, 'resize', schedule);
  // Safari may finish measuring its new orientation after the window event.
  listen(win, 'orientationchange', () => {
    schedule();
    if (orientationTimer !== null) win.clearTimeout(orientationTimer);
    orientationTimer = win.setTimeout(() => { orientationTimer = null; schedule(); }, 250);
  });
  listen(doc, 'focusin', () => {
    if (blurTimer !== null) { win.clearTimeout(blurTimer); blurTimer = null; }
    schedule();
  });
  listen(doc, 'focusout', () => {
    if (blurTimer !== null) win.clearTimeout(blurTimer);
    blurTimer = win.setTimeout(() => { blurTimer = null; keyboardHeld = false; schedule(); }, 250);
  });
  listen(doc, 'pointerdown', event => {
    if (event.target?.tagName === 'CANVAS') pointers.add(event.pointerId);
  }, true);
  const release = event => { if (pointers.delete(event.pointerId)) schedule(); };
  listen(win, 'pointerup', release, true);
  listen(win, 'pointercancel', release, true);
  listen(win, 'blur', () => { pointers.clear(); schedule(); });
  update();
  return () => {
    if (disposed) return;
    disposed = true;
    listeners.forEach(remove => remove());
    if (frame !== null) win.cancelAnimationFrame(frame);
    if (orientationTimer !== null) win.clearTimeout(orientationTimer);
    if (blurTimer !== null) win.clearTimeout(blurTimer);
    pointers.clear();
    properties.forEach((name, i) => {
      if (previous[i][0]) style.setProperty(name, ...previous[i]);
      else style.removeProperty(name);
    });
  };
}
