// Optional pen-hover/focus explanation. Never activates a control or records input.
import settings from '../state/settings.js';
import speech from '../audio/speech.js';

export function installControlCue(button, { phraseKey = '', isActive = () => true,
  say = key => { if (!speech.isSpeaking()) void speech.say(key); },
  now = () => performance.now(), delay = setTimeout, cancel = clearTimeout,
  preferences = () => settings.get(), hidden = () => !!document.hidden } = {}) {
  let intent = null, clear = null, motion = null, disposed = false, last = -Infinity;
  if (phraseKey) button.dataset.voiceKey = phraseKey;
  const reset = () => {
    if (intent !== null) cancel(intent); intent = null;
    if (clear !== null) cancel(clear); clear = null;
    motion?.cancel?.(); motion = null;
    button.classList.remove('is-control-cued');
  };
  const permitted = () => !disposed && button.isConnected && !button.disabled && !hidden() && isActive();
  const invite = () => {
    if (!permitted() || now() - last < 2000) return;
    reset();
    intent = delay(() => {
      intent = null;
      if (!permitted()) return;
      last = now(); button.classList.add('is-control-cued');
      const prefs = preferences();
      const reduced = prefs.reducedMotion || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (!reduced && button.animate) {
        motion = button.animate([{translate:'0 0'},{translate:'0 -3px'},{translate:'0 0'}], {duration:700,iterations:1,easing:'ease-in-out'});
        motion.finished?.catch?.(() => {});
      }
      if (phraseKey && !prefs.muted) say(phraseKey);
      clear = delay(reset, 900);
    }, 240);
  };
  const enter = event => { if (event.pointerType === 'pen' && !event.buttons) invite(); };
  button.addEventListener('pointerenter', enter);
  button.addEventListener('focus', invite);
  for (const event of ['pointerleave','pointerdown','blur']) button.addEventListener(event,reset);
  return () => {
    disposed = true; reset();
    button.removeEventListener('pointerenter',enter);button.removeEventListener('focus',invite);
    for (const event of ['pointerleave','pointerdown','blur']) button.removeEventListener(event,reset);
  };
}
