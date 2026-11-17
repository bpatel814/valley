// A screen that fetches its code the first time it is opened (work order item 10).
// The router sees an ordinary screen: `mount` waits for the module, and every
// other property (onBack, busy, beforeLeave, ...) is read from the real screen,
// bound to it, once loaded. Before that, they are simply absent, as they would
// be on a screen that never mounted.
export function lazyScreen(id, importer) {
  let real = null, loading = null;
  const load = () => {
    if (real) return Promise.resolve(real);
    if (!loading) {
      loading = importer().then(module => { real = module.default; return real; })
        .catch(error => { loading = null; throw error; });
    }
    return loading;
  };
  const shell = {
    id,
    lazy: true,
    preload() { return load().catch(() => null); },
    async mount(el, params) { const screen = await load(); return screen.mount(el, params); },
    unmount(...args) { return real?.unmount?.(...args); },
  };
  return new Proxy(shell, {
    get(target, key) {
      if (key in target) return target[key];
      const value = real?.[key];
      return typeof value === 'function' ? value.bind(real) : value;
    },
    has(target, key) { return key in target || (!!real && key in real); },
  });
}

/** Fetch the given screens' code in the background, one after another. */
export function preloadScreens(screens) {
  let chain = Promise.resolve();
  for (const screen of screens) if (screen?.lazy) chain = chain.then(() => screen.preload());
  return chain;
}
