// One invitation per document visit. It never routes, resets or writes saved play.
import { enterFullscreen, fullscreenElement, isStandalone } from '../engine/immersive.js';
import { welcomeEntry } from './welcome-entry.js';

export function shouldInvitePlay(screen, doc = globalThis.document, win = globalThis.window, nav = globalThis.navigator) {
  return !!screen && !['welcome', 'parent', 'mama-break'].includes(screen) &&
    !doc?.hidden && !fullscreenElement(doc) && !isStandalone(win, nav);
}

export function mountPlayInvitation({ screen, doc = globalThis.document, win = globalThis.window,
  nav = globalThis.navigator, onClose = () => {} } = {}) {
  if (!shouldInvitePlay(screen, doc, win, nav)) return null;
  const app = doc.getElementById('app');
  if (!app) return null;
  const parentEntry = doc.getElementById('parent-entry');
  const previousFocus = doc.activeElement;
  const targets = [app, parentEntry].filter(Boolean).map(el => ({ el, inert: el.hasAttribute('inert') }));
  const cover = doc.createElement('div'); cover.className = 'play-entry-cover';
  const panel = doc.createElement('section'); panel.className = 'play-entry-panel';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'play-entry-title');
  const title = doc.createElement('h2'); title.id = 'play-entry-title'; title.textContent = 'Ready to play?';
  const note = doc.createElement('p'); note.textContent = 'We kept your place. Full screen when available.';
  const play = doc.createElement('button'); play.type = 'button'; play.className = 'play-entry-primary';
  play.textContent = 'Continue playing';
  const windowed = doc.createElement('button'); windowed.type = 'button'; windowed.className = 'play-entry-window';
  windowed.textContent = 'Play in this window';
  panel.append(title, note, play, windowed); cover.append(panel);
  let alive = true;
  const close = (notify = true) => {
    if (!alive) return;
    alive = false; control.destroy();
    doc.removeEventListener('keydown', keydown);
    doc.removeEventListener('visibilitychange', visibility);
    cover.remove();
    for (const { el, inert } of targets) if (!inert) el.removeAttribute('inert');
    if (previousFocus?.isConnected && !doc.hidden) previousFocus.focus?.({ preventScroll: true });
    if (notify) onClose();
  };
  const control = welcomeEntry({
    isActive: () => alive && !doc.hidden,
    requestFullscreen: () => enterFullscreen(doc),
    enter: () => { close(); return true; },
    paint: state => { play.disabled = state === 'opening'; },
  });
  const keydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Tab') {
      event.preventDefault();
      (doc.activeElement === play ? windowed : play).focus();
    }
  };
  const visibility = () => { if (doc.hidden) close(); };
  play.addEventListener('click', () => { void control.play(); });
  windowed.addEventListener('click', () => close());
  doc.addEventListener('keydown', keydown);
  doc.addEventListener('visibilitychange', visibility);
  for (const { el } of targets) el.setAttribute('inert', '');
  doc.body.append(cover); play.focus({ preventScroll: true });
  return { active: () => alive, destroy: () => close(false) };
}
