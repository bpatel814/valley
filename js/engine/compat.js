// Missing-only bridges for the app's Safari 14+ path. Native APIs always win.
export function arrayAt(index) {
  if (this == null) throw new TypeError('Array.at requires a receiver');
  const array = Object(this);
  const length = Math.min(Math.max(Math.floor(+array.length || 0), 0), Number.MAX_SAFE_INTEGER);
  const number = +index;
  const integer = Number.isNaN(number) ? 0 : Math.trunc(number);
  const offset = integer < 0 ? length + integer : integer;
  return offset < 0 || offset >= length ? undefined : array[offset];
}

function cloneError() {
  const error = new Error('Only plain scene data can be cloned on this browser');
  error.name = 'DataCloneError';
  return error;
}

// Deliberately narrower than structuredClone: no lossy JSON serialization.
// Current scene data uses plain objects/arrays. Unsupported values fail loudly.
export function cloneSceneData(value, options) {
  if (options && Reflect.ownKeys(options).length) throw cloneError();
  const seen = new Map();
  const copy = item => {
    if (typeof item === 'function' || typeof item === 'symbol') throw cloneError();
    if (item === null || typeof item !== 'object') return item;
    if (seen.has(item)) return seen.get(item);
    const proto = Object.getPrototypeOf(item);
    const array = Array.isArray(item);
    if (!array && proto !== Object.prototype && proto !== null) throw cloneError();
    const result = array ? new Array(item.length) : Object.create(proto);
    seen.set(item, result);
    for (const key of Reflect.ownKeys(item)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (typeof key === 'symbol' || !descriptor.enumerable || !('value' in descriptor)) throw cloneError();
      Object.defineProperty(result, key, { value: copy(descriptor.value), enumerable: true, writable: true, configurable: true });
    }
    return result;
  };
  return copy(value);
}

export function installInertFallback(scope) {
  const proto = scope.HTMLElement?.prototype;
  const doc = scope.document;
  if (!proto || !doc || 'inert' in proto) return false;
  const suppressed = new Map();
  const hiddenRoots = new Map();
  const selector = 'a[href],area[href],button,input,select,textarea,iframe,summary,audio[controls],video[controls],[tabindex],[contenteditable]';
  const blocked = node => !!node?.closest?.('[inert]');
  const sync = () => {
    for (const [root, previous] of hiddenRoots) {
      if (root.hasAttribute('inert') && root.isConnected) continue;
      if (previous === null) root.removeAttribute('aria-hidden');
      else root.setAttribute('aria-hidden', previous);
      hiddenRoots.delete(root);
    }
    for (const [element, previous] of suppressed) {
      if (blocked(element) && element.isConnected) continue;
      if (previous === null) element.removeAttribute('tabindex');
      else element.setAttribute('tabindex', previous);
      suppressed.delete(element);
    }
    for (const root of doc.querySelectorAll('[inert]')) {
      if (!hiddenRoots.has(root)) hiddenRoots.set(root, root.getAttribute('aria-hidden'));
      if (root.getAttribute('aria-hidden') !== 'true') root.setAttribute('aria-hidden', 'true');
      const elements = [root, ...root.querySelectorAll(selector)];
      for (const element of elements) {
        if (!suppressed.has(element)) suppressed.set(element, element.getAttribute('tabindex'));
        else if (element.getAttribute('tabindex') !== '-1') suppressed.set(element, element.getAttribute('tabindex'));
        if (element.getAttribute('tabindex') !== '-1') element.setAttribute('tabindex', '-1');
      }
    }
    if (blocked(doc.activeElement)) doc.activeElement.blur();
  };
  Object.defineProperty(proto, 'inert', {
    configurable: true,
    get() { return this.hasAttribute('inert'); },
    set(value) { if (value) this.setAttribute('inert', ''); else this.removeAttribute('inert'); sync(); },
  });
  const guard = event => {
    if (!blocked(event.target)) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'focus' || event.type === 'focusin') event.target.blur?.();
  };
  // Capture before scene listeners: pointer, keyboard, and synthetic clicks.
  for (const name of ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'dragstart', 'selectstart', 'touchstart', 'touchend', 'keydown', 'keyup', 'beforeinput', 'focus', 'focusin']) {
    doc.addEventListener(name, guard, { capture: true, passive: false });
  }
  if (scope.MutationObserver) {
    const observer = new scope.MutationObserver(sync);
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert', 'tabindex', 'href', 'contenteditable', 'controls'] });
  }
  sync();
  return true;
}

export function installCompatibility(scope = globalThis) {
  const arrayProto = scope.Array?.prototype;
  if (arrayProto && typeof arrayProto.at !== 'function') Object.defineProperty(arrayProto, 'at', { value: arrayAt, writable: true, configurable: true });
  if (typeof scope.structuredClone !== 'function') scope.structuredClone = cloneSceneData;
  installInertFallback(scope);
}

installCompatibility();
