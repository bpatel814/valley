// One invitation per document visit. It never routes, resets or writes saved play.
// A child sees one big picture Play over her own scene: no words to read, no
// second choice. The whole cover answers a tap, so a flat hand anywhere works.
import { enterFullscreen, fullscreenElement, isStandalone } from '../engine/immersive.js';
import { welcomeEntry } from './welcome-entry.js';
import sfx from '../audio/sfx.js';

// Same picture as the title screen's Let's play control (router iconSVG('play') and its tap cue).
const PLAY_ICON = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 13 51 32 23 51Z" fill="currentColor"/></svg>';
const TAP_CUE = '<svg viewBox="0 0 48 48"><path d="M20 39V17a4 4 0 0 1 8 0v10l3-5a4 4 0 0 1 7 4l-5 13Z" fill="#fff7df" stroke="#654f48" stroke-width="3"/><path d="M12 15h-5m7-8-3-3m16 3 3-3" stroke="#654f48" stroke-width="3" stroke-linecap="round"/></svg>';

export function shouldInvitePlay(screen, doc = globalThis.document, win = globalThis.window, nav = globalThis.navigator) {
  return !!screen && !['welcome', 'parent', 'mama-break'].includes(screen) &&
    !doc?.hidden && !fullscreenElement(doc) && !isStandalone(win, nav);
}

export function mountPlayInvitation({ screen, doc = globalThis.document, win = globalThis.window,
  nav = globalThis.navigator, onClose = () => {}, chime = () => sfx.play('chime') } = {}) {
  if (!shouldInvitePlay(screen, doc, win, nav)) return null;
  const app = doc.getElementById('app');
  if (!app) return null;
  const parentEntry = doc.getElementById('parent-entry');
  const previousFocus = doc.activeElement;
  const targets = [app, parentEntry].filter(Boolean).map(el => ({ el, inert: el.hasAttribute('inert') }));
  const cover = doc.createElement('div'); cover.className = 'play-entry-cover';
  cover.setAttribute('role', 'dialog'); cover.setAttribute('aria-modal', 'true');
  cover.setAttribute('aria-label', 'Continue playing');
  const play = doc.createElement('button'); play.type = 'button';
  play.className = 'btn btn--pink welcome-play-button play-entry-play';
  play.setAttribute('aria-label', 'Continue playing');
  play.innerHTML = PLAY_ICON;
  const hint = doc.createElement('span'); hint.className = 'welcome-tap-cue'; hint.setAttribute('aria-hidden', 'true');
  hint.innerHTML = TAP_CUE;
  play.append(hint); cover.append(play);
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
    // Requested inside the tap. A refusal is silent: play simply carries on in the window.
    requestFullscreen: () => enterFullscreen(doc),
    enter: () => { try { chime(); } catch (_) {} close(); return true; },
    paint: state => { play.disabled = state === 'opening'; hint.hidden = state === 'opening'; },
  });
  const keydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Tab') { event.preventDefault(); play.focus(); }
  };
  const visibility = () => { if (doc.hidden) close(); };
  play.addEventListener('pointerdown', event => { if (event.button === 0) play.classList.add('is-down'); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) play.addEventListener(type, () => play.classList.remove('is-down'));
  // A tap anywhere on the cover is the same as the Play button.
  cover.addEventListener('click', () => { void control.play(); });
  doc.addEventListener('keydown', keydown);
  doc.addEventListener('visibilitychange', visibility);
  for (const { el } of targets) el.setAttribute('inert', '');
  doc.body.append(cover); play.focus({ preventScroll: true });
  return { active: () => alive, destroy: () => close(false) };
}
