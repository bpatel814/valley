// One live screen, with a short storybook transition and deterministic cleanup.
import bus from './bus.js';
import { installControlCue } from './control-cue.js';
import settings from '../state/settings.js';
import music from '../audio/music.js';
import speech from '../audio/speech.js';
import sfx from '../audio/sfx.js';
import art from './art.js';
import session from '../state/session.js';
import resume from '../state/resume.js';
import { isPreviewRouteEnabled } from '../data/preview-access.js';

const screens = new Map();
let root = null;
let entry = null;
let moving = false;
const EASE = 'cubic-bezier(.22,.61,.36,1)';

function reduced() {
  return document.documentElement.classList.contains('reduced-motion') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export function init(el) { root = el || document.getElementById('app'); return root; }
export function register(screen) {
  if (screen && typeof screen.id === 'string' && typeof screen.mount === 'function') screens.set(screen.id, screen);
  return screen;
}
export function current() { return entry?.id || null; }
export function currentScreen() { return entry?.screen || null; }
export function registered() { return [...screens.keys()]; }
export function isMoving() { return moving; }

/** A screen can refuse an exit without losing its live paper or checkpoint. */
export async function checkpointBeforeLeave(screen, next, params = {}) {
  try { return (await screen?.beforeLeave?.({ next, params })) !== false; }
  catch (error) { console.info('[router] kept current work', error?.code || error?.name); return false; }
}


function cleanup(visit) {
  if (!visit) return;
  try { visit.screen.unmount?.(); }
  catch (error) { console.error('[router] cleanup', visit.id, error); }
}
function animate(el, keyframes, duration) {
  if (!el?.animate || !duration) return Promise.resolve();
  const a = el.animate(keyframes, { duration, easing: EASE });
  return a.finished.catch(() => {});
}

export async function go(id, params = {}, opts = {}) {
  if (moving) return false;
  // A saved/deep-linked paused activity returns safely to the map as well.
  if (!isPreviewRouteEnabled(id)) { id = 'map'; params = {}; }
  if (session.isBreakLocked() && !['mama-break', 'parent'].includes(id)) return false;
  const region = settings.activityRegion(id);
  const isActivity = settings.REGIONS.includes(region);
  const calmRecap = id === 'grandma' && params?.sessionEnd === true;
  if (isActivity && !settings.isActivityEnabled(id) && !calmRecap) return false;
  const screen = screens.get(id);
  if (!screen || (entry?.id === id && !opts.force)) return false;
  const parent = root || init();
  if (!parent) return false;
  moving = true;
  parent.setAttribute('aria-busy', 'true');
  const old = entry;
  if (opts.checkpointDone !== old?.screen && !await checkpointBeforeLeave(old?.screen, id, params)) {
    parent.removeAttribute('aria-busy');
    moving = false;
    return false;
  }
  let loading = null;
  const loadingTimer = old ? setTimeout(() => {
    loading = document.createElement('div');
    loading.className = 'route-loading';
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-live', 'polite');
    loading.textContent = 'Opening…';
    Object.assign(loading.style, {
      position: 'absolute', left: '50%', bottom: 'max(18px, 4vh)', zIndex: '80',
      transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: '999px',
      background: 'rgba(255,253,248,.96)', color: '#654f48', fontWeight: '700',
      boxShadow: '0 4px 18px rgba(76,55,48,.18)', pointerEvents: 'none',
    });
    parent.append(loading);
  }, 180) : 0;
  if (old) old.host.inert = true;
  try {
    await art.ensureRoute(id);
  } catch (error) {
    // Published art has procedural fallbacks. A damaged optional image must not
    // strand navigation, and ensureRoute already retries PNG after WebP.
    console.info('[router] art fallback', id, error && (error.name || error.message));
  } finally {
    if (loadingTimer) clearTimeout(loadingTimer);
    loading?.remove();
  }
  const el = document.createElement('section');
  el.className = 'screen is-entering';
  el.dataset.screen = id;
  el.setAttribute('aria-label', id === 'map' ? 'Rayna’s Valley' : id);
  el.style.opacity = '0';
  if (old) {
    old.host.classList.add('is-leaving');
    bus.emit('screen:leave', { id: old.id, next: id });
    speech.cancel?.();
    // Stop the old visit before mounting another singleton and its event listeners.
    cleanup(old);
  }
  parent.append(el);
  entry = { id, screen, host: el, params };
  let mounted = false;
  try {
    // Retire the previous route's checkpoint even before the first action.
    // Reinstall a boot snapshot with its strokes intact after resume.take().
    if (opts.restoreSnapshot?.screen === id) await resume.save(opts.restoreSnapshot);
    else await resume.enterRoute(id, params);
    await screen.mount(el, params || {});
    mounted = true;
    const dist = reduced() ? 0 : 16;
    const incoming = opts.dir === 'right' ? -dist : dist;
    const axis = opts.dir === 'up' ? 'Y' : 'X';
    const duration = reduced() ? 140 : 300;
    el.style.opacity = '';
    await Promise.all([
      animate(el, [{ opacity: 0, transform: `translate${axis}(${incoming}px)` }, { opacity: 1, transform: 'none' }], duration),
      old ? animate(old.host, [{ opacity: 1 }, { opacity: 0 }], duration) : Promise.resolve(),
    ]);
  } catch (error) {
    console.error('[router] mount', id, error);
    await resume.enterRoute('map');
    cleanup(entry);
    el.replaceChildren();
    el.style.opacity = '';
    const recovery = document.createElement('div');
    recovery.className = 'game-recovery';
    const message = document.createElement('p');
    message.textContent = "Let's go back to our valley.";
    recovery.append(message, makeButton({ icon: 'home', label: 'Back to the valley', cls: 'btn--mint', onTap: () => go('map', {}, { force: true }) }));
    el.append(recovery);
    entry.screen = { id, onBack: () => go('map', {}, { force: true }) };
  } finally {
    old?.host.remove();
    el.classList.remove('is-entering');
    parent.removeAttribute('aria-busy');
    moving = false;
  }
  bus.emit('screen:enter', { id, params, mounted });
  return mounted;
}

export function back() {
  if (!entry || moving) return false;
  if (entry.screen.onBack) { entry.screen.onBack(); return true; }
  if (entry.id === 'map') return false;
  void go('map', {}, { dir: 'right' });
  return true;
}

const ICONS = {
  stop: '<rect x="17" y="17" width="30" height="30" rx="5" fill="currentColor"/>',
  clear: '<path d="m38 7-9 25M22 31l16 5 5 18H12Z"/><path d="m23 40-3 13m10-11-1 12m7-11 2 11"/>',
  undo: '<path d="m24 10-15 15 15 15M11 25h25c17 0 23 22 5 28"/>',
  back: '<path d="m28 13-19 19 19 19M11 32h44"/>',
  help: '<path d="M22 21c0-15 26-15 24 0-1 10-14 7-14 17m0 12v1"/>',
  art: '<path d="m13 44 5-13L43 6l14 14-25 25-15 5Zm5-13 14 14M39 10l14 14"/><path d="M12 54h35"/>',
  save: '<path d="M11 8h35l8 9v38H11Zm8 0v18h24V8M21 55V37h23v18"/>',
  home: '<path d="M8 27 32 8 56 27M15 24v31h34V24M26 55V38h12v17"/>',
  sound: '<path d="M10 25h12l13-12v38L22 39H10Z"/><path d="M43 22q12 10 0 20M51 14q21 18 0 36"/>',
  muted: '<path d="M10 25h12l13-12v38L22 39H10Z"/><path d="m44 24 13 16m0-16L44 40"/>',
  next: '<path d="M12 32h37M35 15l17 17-17 17"/>',
  leaf: '<path d="M12 51C-1 20 28 8 54 9c1 26-10 51-37 43Z" fill="#d5e5b8"/><path d="M12 55 44 21M24 43v-17M25 42h17"/>',
  star: '<path d="m32 6 8 17 19 3-14 13 4 19-17-9-17 9 4-19L5 26l19-3Z" fill="#ffe3a0"/>',
  play: '<path d="M23 13 51 32 23 51Z" fill="currentColor"/>',
  heart: '<path d="M32 53 10 32C-1 15 20 3 32 19 44 3 65 15 54 32Z" fill="currentColor"/>',
  book: '<path d="M32 15C22 8 10 9 6 11v41c9-3 18-2 26 3 8-5 17-6 26-3V11c-8-2-18-3-26 4Zm0 0v40"/>',
  replay: '<path d="M14 19a23 23 0 1 1-5 26M14 6v17H2"/>',
  parent: '<circle cx="23" cy="19" r="10"/><circle cx="45" cy="32" r="8"/><path d="M6 54V42c0-15 31-15 31 0v12m0 0V45c0-11 21-11 21 0v9"/>',
};
export function iconSVG(name) {
  return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.next}</svg>`;
}
// Pictured, keyboard-operable actions for a saved-work read failure.
export function recoveryAction(icon, label, onClick) {
  const action = document.createElement('button'); action.type = 'button'; action.setAttribute('aria-label', label);
  const picture = document.createElement('span'); picture.className = 'load-recovery-icon'; picture.setAttribute('aria-hidden', 'true'); picture.innerHTML = iconSVG(icon);
  const caption = document.createElement('span'); caption.textContent = label; action.append(picture, caption);
  action.addEventListener('click', onClick); return action;
}

export function tapify(el, onTap) {
  el.addEventListener('pointerdown', e => { if (e.button === 0) el.classList.add('is-down'); });
  const up = () => el.classList.remove('is-down');
  for (const event of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture', 'blur']) el.addEventListener(event, up);
  if (onTap) el.addEventListener('click', onTap);
  return el;
}
export function makeButton({ icon, cls = '', onTap, label = '' }) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn ' + cls;
  if (label) b.setAttribute('aria-label', label);
  b.innerHTML = iconSVG(icon);
  return tapify(b, onTap);
}
export function muteButton() {
  const b = makeButton({ icon: 'sound', cls: 'mute btn--sky', label: 'sound' });
  const paint = () => {
    const muted = settings.get().muted;
    b.innerHTML = iconSVG(muted ? 'muted' : 'sound');
    const caption = document.createElement('span');
    caption.className = 'control-caption';
    caption.textContent = muted ? 'Sound off' : 'Sound on';
    b.append(caption);
    b.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
    b.setAttribute('aria-pressed', String(muted));
    b.title = muted ? 'Turn sound on' : 'Mute sound';
  };
  paint();
  b.addEventListener('click', async () => {
    const muted = !settings.get().muted;
    // The audio modules receive the settings event; music also supports its legacy API.
    await settings.set({ muted });
    music.mute(muted);
    if (!muted) sfx.play('tap');
    paint();
  });
  const off = bus.on('mute:changed', paint);
  b.destroy = off;
  return b;
}
export function homeButton() {
  const button = makeButton({ icon: 'home', cls: 'home btn--mint', label: 'home', onTap: () => {
    sfx.play('tap'); void go('map', {}, { dir: 'right' });
  } });
  const caption = document.createElement('span');
  caption.className = 'control-caption'; caption.textContent = 'Home';
  button.append(caption);
  button.destroy = installControlCue(button, { phraseKey: 'ui_home', isActive: () => !moving });
  return button;
}
export const router = { init, register, go, back, current, currentScreen, registered, isMoving };
export default router;
