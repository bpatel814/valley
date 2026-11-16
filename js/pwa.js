const temporaryDemo = typeof document !== 'undefined' && document.documentElement?.dataset?.playMode === 'temporary-demo';
// pwa.js - everything that makes the browser behave like an app on the Note.
//
// Registers the service worker, holds the screen awake, swallows the gestures that
// would break a three-year-old's drawing (pinch zoom, double-tap zoom, long-press
// menu, the Android back swipe), and swaps in a new build only at a safe moment.
//
// Nothing here ever shows the child a dialog. app.js calls init() once on boot.

import bus from "./world/bus.js";

let swReg = null;
let pendingWorker = null; // installed and waiting; we reload when it is safe
let reloading = false;
let strokeActive = false;
let currentScreen = null;
let wakeLock = null;
let wakeLockWanted = false;
let deferredInstall = null;
const cleanups = [];
let startPromise = null;
let retryPromise = null;
let installationFailed = false;
let controllerObserved = false;
let watchedRegistrations = new WeakSet();
let watchedWorkers = new WeakSet();
const REGISTRATION_DELAY_MS = 8000;
const BUILD_QUERY_TIMEOUT_MS = 1500;
let buildRequestSerial = 0;
let capability = {
  secureContext: false,
  serviceWorkerSupported: false,
  registered: false,
  offlineReady: false,
  reason: "not-initialized",
};

// ------------------------------------------------------------------ helpers

function listen(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  cleanups.push(() => target.removeEventListener(type, fn, opts));
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

/** Truthful secure-context check. LAN http:// addresses are intentionally false. */
export function secureContextStatus(env = {}) {
  const loc = env.location || (typeof window !== "undefined" ? window.location : null);
  const secure = env.isSecureContext !== undefined
    ? env.isSecureContext === true
    : (typeof window !== "undefined" && window.isSecureContext === true);
  const protocol = loc && loc.protocol ? String(loc.protocol) : "";
  const hostname = loc && loc.hostname ? String(loc.hostname) : "";
  const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  return {
    secureContext: secure,
    protocol,
    hostname,
    localHost,
    reason: secure ? "secure" : protocol === "http:" && !localHost ? "lan-http" : "insecure-context",
  };
}

// ------------------------------------------------------- service worker swap

/* A reload mid-stroke would lose her ink and feel like the app broke. We only swap
 * when she is back on the map with the pen up, or when the tablet is put down. */
function safeToReload() {
  return !strokeActive;
}

function doReload(returnToMap = false) {
  if (reloading || !pendingWorker) return;
  reloading = true;
  // A safe Home transition should remain Home after activation, even if an
  // earlier activity left resumable work. This marker belongs to this tab only.
  if (returnToMap) {
    try { sessionStorage.setItem("rv:update-return", "map"); } catch (_) {}
  }
  try { pendingWorker.postMessage({ type: "SKIP_WAITING" }); } catch (_) {}
  // controllerchange fires once the new worker takes over; reload then, not before.
  setTimeout(() => { if (reloading) window.location.reload(); }, 1200);
}

function markPending(worker) {
  pendingWorker = worker;
  // If she happens to already be idle on the map, take it now.
  if (safeToReload() && currentScreen === "map") doReload(true);
  else if (safeToReload() && document.visibilityState === "hidden") doReload();
}

function registrationCapability(reg = swReg, fallbackReason = capability.reason) {
  const context = secureContextStatus();
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  // This worker rejects installation until every declared precache file passes
  // verification. Registration and "activating" alone do not prove it is ready.
  // A controller can belong to a broader, unrelated scope. Only this
  // registration's activated worker establishes this app's offline capability.
  const offlineReady = reg?.active?.state === "activated";
  const installing = ["installing", "installed"].includes(reg?.installing?.state);
  const activating = reg?.active?.state === "activating" || reg?.installing?.state === "activating" || reg?.waiting?.state === "installed";
  const failed = installationFailed || [reg?.installing, reg?.waiting, reg?.active].some(worker => worker?.state === "redundant");
  return {
    secureContext: context.secureContext,
    serviceWorkerSupported: supported,
    registered: !!reg,
    offlineReady: context.secureContext && supported && offlineReady,
    reason: !context.secureContext ? context.reason : !supported ? "unsupported"
      : offlineReady ? "registered" : installing ? "installing" : activating ? "activating"
      : failed ? "installation-failed" : ["registering", "registration-failed"].includes(fallbackReason) ? fallbackReason
      : reg ? "registration-unavailable" : fallbackReason,
  };
}

function publishCapability(fallbackReason = capability.reason) {
  capability = registrationCapability(swReg, fallbackReason);
  bus.emit("pwa:capability", { ...capability });
  return { ...capability };
}

function watchWorker(worker) {
  if (!worker || typeof worker.addEventListener !== "function" || watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);
  const changed = () => {
    if (worker.state === "redundant") installationFailed = true;
    // Existing active builds remain usable if an update fails to install.
    publishCapability();
    if (worker.state === "installed" && navigator.serviceWorker.controller) markPending(worker);
  };
  listen(worker, "statechange", changed);
}

async function registerSW() {
  const context = secureContextStatus();
  if (!context.secureContext || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    // Resolve from this module, not the current document. Dev/parent pages live one
    // directory down and would otherwise try to register a nonexistent /dev/sw.js.
    const workerURL = new URL("../sw.js", import.meta.url);
    const scopeURL = new URL("../", import.meta.url);
    const reg = await navigator.serviceWorker.register(workerURL.href, { scope: scopeURL.pathname });
    swReg = reg;
    installationFailed = false;

    if (!watchedRegistrations.has(reg)) {
      watchedRegistrations.add(reg);
      listen(reg, "updatefound", () => {
        installationFailed = false;
        watchWorker(reg.installing);
        publishCapability();
      });

      // Check for a new build when she comes back to the app, never on a timer.
      listen(document, "visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    }
    if (!controllerObserved) {
      controllerObserved = true;
      listen(navigator.serviceWorker, "controllerchange", () => {
        watchWorker(navigator.serviceWorker.controller);
        publishCapability();
        if (!reloading) return;
        window.location.reload();
      });
    }
    // updatefound can precede resolution of register(), including on first use.
    watchWorker(reg.installing);
    watchWorker(reg.waiting);
    watchWorker(reg.active);
    watchWorker(navigator.serviceWorker.controller);

    // Listen for activation before asking an already-waiting worker to take over.
    if (reg.waiting && navigator.serviceWorker.controller) markPending(reg.waiting);
    return reg;
  } catch (_) {
    return null; // file:// or a denied worker is not a reason to fail boot
  }
}

function waitForRegistrationWindow() {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => resolve(), { timeout: 2000 });
      } else {
        resolve();
      }
    }, REGISTRATION_DELAY_MS);
  });
}

// ---------------------------------------------------------------- wake lock

async function requestWakeLock() {
  wakeLockWanted = true;
  if (!("wakeLock" in navigator) || wakeLock) return;
  if (document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch (_) {
    wakeLock = null; // low battery or an unsupported browser; not worth a word
  }
}

function releaseWakeLock() {
  const wl = wakeLock;
  wakeLock = null;
  if (wl) { try { wl.release(); } catch (_) {} }
}

// -------------------------------------------------------------- init

let started = false;

export function init({ initialScreen = null } = {}) {
  if (temporaryDemo) return Promise.resolve();
  if (started) return startPromise; // double calls share the same result and listeners
  started = true;
  // Boot mounts its first route before initializing PWA listeners.
  currentScreen = initialScreen;
  startPromise = Promise.resolve().then(async () => {
  const context = secureContextStatus();
  const swSupported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  capability = {
    secureContext: context.secureContext,
    serviceWorkerSupported: swSupported,
    registered: false,
    offlineReady: false,
    reason: !context.secureContext ? context.reason : (!swSupported ? "unsupported" : "registering"),
  };
  const html = document.documentElement;

  // --- gestures that must never happen -------------------------------------
  // Pinch zoom (Safari style gesture events, and the Chrome two-finger path).
  const killGesture = (e) => e.preventDefault();
  listen(document, "gesturestart", killGesture, { passive: false });
  listen(document, "gesturechange", killGesture, { passive: false });
  listen(document, "gestureend", killGesture, { passive: false });
  listen(
    document,
    "touchmove",
    (e) => { if (e.scale !== undefined && e.scale !== 1) e.preventDefault(); },
    { passive: false }
  );
  // Double-tap zoom: touch-action does it without eating single taps.
  html.style.touchAction = "manipulation";
  html.style.overscrollBehavior = "none";
  html.style.webkitUserSelect = "none";
  html.style.userSelect = "none";
  html.style.webkitTouchCallout = "none";
  // Long press on a canvas opens a context menu over her drawing. Never.
  listen(document, "contextmenu", (e) => e.preventDefault(), { passive: false });
  // Ctrl+wheel zoom on the desktop dev machine, for parity with the tablet.
  listen(
    document,
    "wheel",
    (e) => { if (e.ctrlKey) e.preventDefault(); },
    { passive: false }
  );

  // --- Android back gesture ------------------------------------------------
  // One sentinel entry sits on top of the history stack at all times; popping it
  // re-pushes and tells the router to go up a screen. The app can never be left.
  try { history.pushState({ rv: 1 }, ""); } catch (_) {}
  listen(window, "popstate", () => {
    try { history.pushState({ rv: 1 }, ""); } catch (_) {}
    bus.emit("back");
  });

  // --- stroke guard --------------------------------------------------------
  cleanups.push(bus.on("stroke:start", () => { strokeActive = true; }));
  cleanups.push(
    bus.on("stroke:end", () => {
      strokeActive = false;
      // She just finished a stroke, so this is a fine moment if she is idle after.
      if (pendingWorker && document.visibilityState === "hidden") doReload();
    })
  );
  listen(window, "beforeunload", (e) => {
    if (!strokeActive) return;
    e.preventDefault();
    e.returnValue = ""; // Chrome shows its own wording; we only set the flag
    return "";
  });

  // --- safe update moments -------------------------------------------------
  cleanups.push(bus.on("screen:leave", () => { currentScreen = null; }));
  cleanups.push(
    bus.on("screen:enter", (d) => {
      currentScreen = d?.id || null;
      requestWakeLock();
      if (d && d.id === "map" && pendingWorker && safeToReload()) doReload(true);
    })
  );
  listen(document, "visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (wakeLockWanted) requestWakeLock();
    } else {
      releaseWakeLock();
      if (pendingWorker && safeToReload()) doReload();
    }
  });

  // --- install prompt ------------------------------------------------------
  listen(window, "beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
    bus.emit("pwa:installable", { available: true });
  });
  listen(window, "appinstalled", () => {
    deferredInstall = null;
    bus.emit("pwa:installed", {});
  });

  requestWakeLock();
  // A first install can cache tens of megabytes. Give the opening scene, first
  // Play tap, and first spoken line an uncontested window before that work starts.
  if (context.secureContext && swSupported) {
    publishCapability("registration-deferred");
    await waitForRegistrationWindow();
    publishCapability("registering");
    const reg = await registerSW();
    return publishCapability(reg ? "registered" : "registration-failed");
  }
  return publishCapability();
  }).catch((err) => {
    capability = { ...capability, registered: false, offlineReady: false, reason: "initialization-failed" };
    console.info("[pwa] initialization skipped:", err && (err.name || err.message));
    bus.emit("pwa:capability", { ...capability });
    return { ...capability };
  });
  return startPromise;
}

// ------------------------------------------------------------------ exports

/** The parent corner calls this; resolves to 'accepted', 'dismissed' or 'unavailable'. */
export async function installPrompt() {
  if (!deferredInstall) return "unavailable";
  const e = deferredInstall;
  deferredInstall = null;
  try {
    e.prompt();
    const { outcome } = await e.userChoice;
    return outcome;
  } catch (_) {
    return "unavailable";
  }
}

export function canInstall() {
  return deferredInstall !== null;
}

/** Current capability, refreshed from the live registration when possible. */
export async function capabilities() {
  const base = registrationCapability();
  let reg = swReg;
  if (!reg && base.secureContext && base.serviceWorkerSupported) {
    try { reg = await navigator.serviceWorker.getRegistration(new URL("../", import.meta.url).href); } catch (_) {}
  }
  return {
    ...registrationCapability(reg),
    standalone: isStandalone(),
    installPromptAvailable: canInstall(),
  };
}

function buildRegistration(signal) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      resolve(result);
    };
    const cancel = () => finish({ reason: "aborted" });
    const timer = setTimeout(() => finish({ reason: "reply-unavailable" }), BUILD_QUERY_TIMEOUT_MS);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) { cancel(); return; }
    try {
      Promise.resolve(navigator.serviceWorker.getRegistration(new URL("../", import.meta.url).href))
        .then(reg => finish({ reg }), () => finish({ reason: "denied" }));
    } catch (_) { finish({ reason: "denied" }); }
  });
}

function workerBuild(worker, signal) {
  if (signal?.aborted) return Promise.resolve({ reason: "aborted" });
  if (typeof MessageChannel !== "function") return Promise.resolve({ reason: "channel-unavailable" });
  return new Promise(resolve => {
    let channel;
    try { channel = new MessageChannel(); }
    catch (_) { resolve({ reason: "channel-unavailable" }); return; }
    const requestId = `rv-build-${++buildRequestSerial}`;
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      channel.port1.onmessage = null;
      channel.port1.onmessageerror = null;
      try { channel.port1.close(); } catch (_) {}
      try { channel.port2.close(); } catch (_) {}
      resolve(result);
    };
    const cancel = () => finish({ reason: "aborted" });
    const timer = setTimeout(() => finish({ reason: "reply-unavailable" }), BUILD_QUERY_TIMEOUT_MS);
    const version = value => typeof value === "string" && /^[a-f0-9]{12}$/.test(value);
    channel.port1.onmessage = event => {
      const data = event.data;
      if (data?.type !== "RV_BUILD" || data.v !== 1 || data.requestId !== requestId
        || !version(data.active) || (data.opened !== null && !version(data.opened))
        || !["reported", "document-unavailable", "lease-unavailable"].includes(data.openedReason)
        || (data.openedReason === "reported") !== (data.opened !== null)) {
        finish({ reason: "invalid-reply" });
        return;
      }
      finish({ opened: data.opened, active: data.active, reason: data.openedReason });
    };
    channel.port1.onmessageerror = () => finish({ reason: "invalid-reply" });
    channel.port1.start?.();
    signal?.addEventListener("abort", cancel, { once: true });
    try { worker.postMessage({ type: "RV_BUILD", v: 1, requestId }, [channel.port2]); }
    catch (_) { finish({ reason: "denied" }); }
  });
}

/** Read-only Parent identity check; never registers, activates, reloads or writes. */
export async function buildIdentity({ signal } = {}) {
  const unavailable = reason => ({ openedBuild: null, offlineBuild: null, reason });
  if (signal?.aborted) return unavailable("aborted");
  const context = secureContextStatus();
  if (!context.secureContext) return unavailable(context.reason);
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return unavailable("unsupported");
  const serviceWorker = navigator.serviceWorker;
  const controller = serviceWorker.controller;
  const lookup = swReg ? { reg: swReg } : await buildRegistration(signal);
  if (signal?.aborted) return unavailable("aborted");
  if (lookup.reason) return unavailable(lookup.reason);
  const reg = lookup.reg;
  const scope = new URL("../", import.meta.url).href;
  const workerURL = new URL("../sw.js", import.meta.url).href;
  if (!reg || reg.scope !== scope) return unavailable("no-worker");
  const active = reg.active;
  const ownWorker = worker => worker?.scriptURL === workerURL && worker.state === "activated";
  const controlling = ownWorker(controller) ? controller : null;
  const offline = ownWorker(active) ? active : null;
  if (!controlling && !offline) return unavailable("no-worker");
  const openedPromise = controlling ? workerBuild(controlling, signal) : Promise.resolve({ reason: "uncontrolled" });
  const offlinePromise = offline === controlling ? openedPromise
    : offline ? workerBuild(offline, signal) : Promise.resolve({ reason: "no-worker" });
  const [opened, cached] = await Promise.all([openedPromise, offlinePromise]);
  if (signal?.aborted) return unavailable("aborted");
  if (serviceWorker.controller !== controller || reg.active !== active
    || (controlling && !ownWorker(controlling)) || (offline && !ownWorker(offline))) return unavailable("changed");
  return {
    openedBuild: opened.opened || null,
    offlineBuild: cached.active || null,
    reason: opened.reason === "reported" ? (cached.active ? "reported" : cached.reason) : opened.reason,
  };
}

/** Parent-only recovery; concurrent requests share one attempt and keep play open. */
export function retryRegistration() {
  if (retryPromise) return retryPromise;
  retryPromise = (async () => {
    if (!started) await init();
    else await startPromise;
    const current = await capabilities();
    if (!current.secureContext || !current.serviceWorkerSupported || current.offlineReady
      || ["installing", "activating"].includes(current.reason)) return current;
    installationFailed = false;
    publishCapability("registering");
    const reg = await registerSW();
    publishCapability(reg ? "registered" : "registration-failed");
    return capabilities();
  })().finally(() => { retryPromise = null; });
  return retryPromise;
}

/** True while the pen is down; used by the update swap and the unload guard. */
export function isDrawing() {
  return strokeActive;
}

export function consumeUpdateReturn() {
  if (temporaryDemo) return false;
  try {
    const destination = sessionStorage.getItem("rv:update-return");
    sessionStorage.removeItem("rv:update-return");
    return destination === "map";
  } catch (_) { return false; }
}

export function destroy() {
  started = false;
  startPromise = null;
  retryPromise = null;
  while (cleanups.length) {
    const fn = cleanups.pop();
    try { fn(); } catch (_) {}
  }
  releaseWakeLock();
  pendingWorker = null;
  reloading = false;
  strokeActive = false;
  currentScreen = null;
  wakeLockWanted = false;
  deferredInstall = null;
  swReg = null;
  installationFailed = false;
  controllerObserved = false;
  watchedRegistrations = new WeakSet();
  watchedWorkers = new WeakSet();
  capability = { secureContext: false, serviceWorkerSupported: false, registered: false, offlineReady: false, reason: "not-initialized" };
}

export const pwa = {
  init, installPrompt, canInstall, capabilities, buildIdentity, retryRegistration, secureContextStatus,
  isStandalone, isDrawing, consumeUpdateReturn, destroy,
};
export default pwa;
