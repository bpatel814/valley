// Pip offers a quiet visual invitation. She never chooses a game on the child's behalf.
import { Character } from './characters.js';
import bus from './bus.js';
import router from './router.js';
import progress from '../state/progress.js';
import speech from '../audio/speech.js';
import sfx from '../audio/sfx.js';
import { prefersReducedMotion } from './scene.js';

function center(el) {
  const rect = el?.getBoundingClientRect?.();
  return rect?.width && rect?.height ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rect } : null;
}
export function mapPromptKey(groupOpen = false) { return groupOpen ? 'discovery_welcome' : 'ui_map_invite'; }

class Pip {
  constructor() {
    this.el = null; this.layer = null; this.ch = null;
    this.x = 0; this.y = 0; this.raf = 0;
    this._flightDone = null; this._timers = new Set();
    this._introOffs = []; this._introVersion = 0;
    this.onboarding = false; this._firstStroke = false;
  }
  ensure() {
    if (this.el) return this.el;
    this.layer = document.getElementById('pip-layer');
    if (!this.layer) return null;
    this.el = document.createElement('div'); this.el.className = 'pip';
    this.el.setAttribute('role', 'button');
    this.el.setAttribute('aria-label', 'Hear places to play');
    this.el.tabIndex = -1;
    const describe = () => { if (router.current() === 'map') speech.say(mapPromptKey(!!document.querySelector('.map-group-panel'))); };
    this.el.addEventListener('click', describe);
    this.el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); describe(); } });
    this.layer.append(this.el);
    this.ch = new Character(this.el, { name: 'pip', size: '100%', follow: true, art: true });
    this.x = window.innerWidth * .5; this.y = window.innerHeight * .3;
    this._place(); return this.el;
  }
  _place() {
    if (!this.el) return;
    const w = this.el.offsetWidth || 80, h = this.el.offsetHeight || 80;
    this.x = Math.max(w / 2, Math.min(window.innerWidth - w / 2, this.x));
    this.y = Math.max(h / 2, Math.min(window.innerHeight - h / 2, this.y));
    this.el.style.transform = `translate3d(${this.x - w / 2}px,${this.y - h / 2}px,0)`;
  }
  _later(fn, ms) {
    const id = setTimeout(() => { this._timers.delete(id); fn(); }, ms);
    this._timers.add(id); return id;
  }
  stopFlight() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ch?.el.classList.remove('is-flying');
    if (this._flightDone) { this._flightDone(false); this._flightDone = null; }
  }
  show() {
    // Pip lives on the map. Tracing paper and its start cues must stay unobstructed.
    if (router.current() !== 'map') return this.hide();
    this.ensure(); if (this.el) { this.el.style.opacity = '1'; this.el.style.pointerEvents = 'auto'; this.el.tabIndex = 0; this.el.removeAttribute('aria-hidden'); } return this;
  }
  hide() { this.stopFlight(); if (this.el) { this.el.style.opacity = '0'; this.el.style.pointerEvents = 'none'; this.el.tabIndex = -1; this.el.setAttribute('aria-hidden', 'true'); } return this; }
  isOnboarding() { return this.onboarding; }
  moveTo(x, y, ms = 650) {
    this.ensure(); this.stopFlight();
    if (!this.el) return Promise.resolve(false);
    const x0 = this.x, y0 = this.y, dx = x - x0, dy = y - y0;
    const distance = Math.hypot(dx, dy);
    if (distance < 2 || prefersReducedMotion()) {
      this.x = x; this.y = y; this._place(); return Promise.resolve(true);
    }
    const cx = (x0 + x) / 2 - dy * .15;
    const cy = (y0 + y) / 2 + dx * .1 - Math.min(42, distance * .12);
    const started = performance.now();
    this.ch.el.classList.add('is-flying');
    return new Promise(done => {
      this._flightDone = done;
      const tick = now => {
        const u = Math.min(1, (now - started) / ms);
        const t = u < .5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
        const a = 1 - t;
        this.x = a*a*x0 + 2*a*t*cx + t*t*x;
        this.y = a*a*y0 + 2*a*t*cy + t*t*y;
        this._place();
        if (u < 1) this.raf = requestAnimationFrame(tick);
        else {
          this.raf = 0; this._flightDone = null;
          this.ch?.el.classList.remove('is-flying'); done(true);
        }
      };
      this.raf = requestAnimationFrame(tick);
    });
  }
  flyTo(el, opts = {}) {
    if (router.current() !== 'map') { this.hide(); return Promise.resolve(false); }
    const c = center(el);
    if (!c) return Promise.resolve(false);
    this.show();
    return this.moveTo(c.x + (opts.dx || 0) * c.rect.width, c.y + (opts.dy ?? -.62) * c.rect.height, opts.ms || 650);
  }
  async rest(el, opts = {}) {
    if (await this.flyTo(el, opts)) this.ch?.set('idle');
    return this;
  }
  _ripple(x, y) {
    if (!this.layer || prefersReducedMotion()) return;
    const ripple = document.createElement('div'); ripple.className = 'ripple';
    ripple.style.left = x + 'px'; ripple.style.top = y + 'px';
    this.layer.append(ripple); this._later(() => ripple.remove(), 650);
  }
  async tapAt(el) {
    const c = center(el); if (!c) return this;
    if (!(await this.flyTo(el, { dy: -.52 }))) return this;
    this._ripple(c.x, c.y); sfx.play('tap'); return this;
  }
  async demonstrate(tracer) {
    if (!tracer || this._firstStroke) return this;
    const host = tracer.host || tracer.el;
    this.hide();
    if (this._firstStroke || !host?.isConnected) return this;
    const show = tracer.showMe || tracer.demonstrate;
    if (typeof show === 'function') await show.call(tracer);
    return this;
  }
  async happy() {
    this.ensure(); this.ch?.set('happy');
    if (!prefersReducedMotion() && this.el) this.ch?.bounce();
    this._later(() => this.ch?.set('idle'), 700);
    return this;
  }
  onboard() {
    if (this.onboarding || progress.get().firstRunDone) return;
    this.onboarding = true; this._firstStroke = false;
    const version = ++this._introVersion;
    const guideScreen = () => {
      if (!this.onboarding || version !== this._introVersion) return;
      if (router.current() === 'map') {
        const friend = document.querySelector('[data-region="garden"]');
        if (friend) this.rest(friend, { dx: .32, dy: -.4 });
      } else if (router.current() === 'garden' && !this._firstStroke) {
        this.hide();
        const host = document.querySelector('.screen[data-screen="garden"]');
        this._later(async () => {
          if (!this.onboarding || version !== this._introVersion || router.current() !== 'garden' || this._firstStroke) return;
          await this.demonstrate(host?._tracer);
        }, 900);
      } else {
        this.hide();
      }
    };
    this._introOffs.push(bus.on('screen:enter', guideScreen));
    this._introOffs.push(bus.on('stroke:start', () => { this._firstStroke = true; this.hide(); }));
    this._introOffs.push(bus.on('play:engaged', () => {
      if (!this.onboarding) return;
      void progress.markFirstRun(); this.cancelOnboard(); this.hide();
    }));
    this._introOffs.push(bus.on('stroke:end', () => {
      if (!this.onboarding || !this._firstStroke) return;
      void progress.markFirstRun(); this.cancelOnboard(); this.hide();
    }));
    this.show(); guideScreen();
    speech.say('ui_hi_rayna').then(() => {
      if (this.onboarding && version === this._introVersion && router.current() === 'map') speech.say('ui_map_invite');
    });
  }
  cancelOnboard() {
    this.onboarding = false; this._introVersion++;
    this._introOffs.forEach(off => off()); this._introOffs = [];
    for (const id of this._timers) clearTimeout(id);
    this._timers.clear(); this.stopFlight();
    this.layer?.querySelectorAll('.ripple').forEach(el => el.remove());
  }
  destroy() {
    this.cancelOnboard(); this.ch?.destroy(); this.el?.remove();
    this.el = null; this.ch = null;
  }
}
export const pip = new Pip();
export default pip;
