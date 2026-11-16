// One visit owns its contextual guidance. Old animation completions never speak
// after another action, a chooser, an interruption, or a retired visit.
import bus from './bus.js';
import router from './router.js';
import speech from '../audio/speech.js';
import settings from '../state/settings.js';
import session from '../state/session.js';
import { LIVING_PLAY_PHRASES } from '../data/living-play-phrases.js';

export class LivingGuidance {
  constructor({ route, active, ready, guideKey, caption, events = bus, narrator = speech,
    currentRoute = () => router.current(), moving = () => router.isMoving(),
    hidden = () => typeof document !== 'undefined' && document.hidden,
    breakLocked = () => session.isBreakLocked(), muted = () => settings.get().muted,
    unlocked = () => speech.isUnlocked(), schedule = (fn, ms) => setTimeout(fn, ms), unschedule = timer => clearTimeout(timer) }) {
    Object.assign(this, { route, active, ready, guideKey, caption, narrator, currentRoute,
      moving, hidden, breakLocked, muted, unlocked, schedule, unschedule });
    this.serial = 0; this.timer = null; this.disposed = false; this.entered = false;
    this.off = [
      events.on('screen:enter', event => {
        if (event?.id !== route || !event.mounted || this.entered || this.disposed) return;
        this.entered = true; this.guide(false);
      }),
      events.on('screen:leave', event => { if (event?.id === route) this.interrupt(); }),
      events.on('settings:changed', () => this.interrupt()),
      events.on('mute:changed', () => this.interrupt()),
      events.on('session:end', () => this.interrupt()),
    ];
  }
  available() {
    return !this.disposed && this.active() && this.ready() && this.currentRoute() === this.route &&
      !this.moving() && !this.hidden() && !this.breakLocked();
  }
  interrupt() {
    if (this.disposed) return;
    ++this.serial;
    if (this.timer !== null) this.unschedule(this.timer);
    this.timer = null; this.narrator.cancel();
  }
  present(key) {
    if (!this.available() || !LIVING_PLAY_PHRASES[key]) return false;
    this.caption(LIVING_PLAY_PHRASES[key].text, key);
    // Captions stay useful before the first audio gesture and while muted.
    if (!this.muted() && this.unlocked()) void this.narrator.say(key);
    return true;
  }
  guide(help = true) {
    this.interrupt(); return this.present(this.guideKey(help));
  }
  after(key, { settled = null, delay = 0, guard = () => true } = {}) {
    this.interrupt(); const token = this.serial;
    const arm = () => {
      if (this.disposed || token !== this.serial) return;
      this.timer = this.schedule(() => {
        this.timer = null;
        if (token === this.serial && this.available() && guard()) this.present(key);
      }, delay);
    };
    // A canceled animation rejects finished; it cannot claim contact happened.
    if (settled?.then) settled.then(arm, () => {}); else arm();
  }
  dispose() {
    this.interrupt(); this.disposed = true;
    this.off.forEach(off => off()); this.off = [];
  }
}

export default LivingGuidance;
