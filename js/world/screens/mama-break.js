// Mama's manual or timed break. A timed break ends only through parent controls.
import router, { muteButton } from '../router.js';
import bus from '../bus.js';
import settings from '../../state/settings.js';
import speech, { volumeGain } from '../../audio/speech.js';
import music from '../../audio/music.js';
import session from '../../state/session.js';
import { showAdultChallenge, dismissAdultChallenge } from '../../parent/gate.js';

const TEXT = "Rayna, sweetheart, remember to be kind. It's time for a little break. Let's take a breath together. I love you.";
const TIMER_TEXT = "Rayna, sweetheart, it's time for a little break. Let's put our game down and take a breath. I love you.";
const back = () => router.go('parent', { onBack: () => router.go('map', {}, { dir: 'right' }) }, { dir: 'right' });

export const mamaBreak = {
  id: 'mama-break',
  mount(host, params = {}) {
    const timed = params.sessionEnd === true || session.isBreakLocked();
    host.dataset.mamaMode = timed ? 'timed' : 'manual';
    host.setAttribute('aria-label', 'A little break with Mama');
    const root = document.createElement('div');
    root.className = 'mama-break';
    root.innerHTML = `
      <div class="mama-break__top">
        <button type="button" class="mama-break__back" aria-label="Back to parent corner">&#8592;</button>
        <span class="mama-break__sound"></span>
      </div>
      <div class="mama-break__body">
        <h1>A little break with Mama</h1>
        <img class="mama-break__picture" src="assets/art/final/characters/family_adult1_idle.webp" alt="Mama waving hello" draggable="false">
        <p class="mama-break__message"></p>
        <button type="button" class="mama-break__hear">&#9829; Hear Mama's reminder</button>
        <button type="button" class="mama-break__full" hidden>Full screen</button>
        <p class="mama-break__status" role="status" aria-live="polite"></p>
      </div>`;
    host.append(root);
    root.querySelector('.mama-break__message').textContent = timed ? TIMER_TEXT : TEXT;
    const backButton = root.querySelector('.mama-break__back');
    if (timed) {
      backButton.innerHTML = '<span aria-hidden="true">&#9881;</span> Grown-ups';
      backButton.classList.add('mama-break__back--settings');
      backButton.setAttribute('aria-haspopup', 'dialog');
      backButton.setAttribute('aria-label', 'Grown-up controls');
    }
    backButton.addEventListener('click', () => this._back?.());
    this._mute = muteButton();
    root.querySelector('.mama-break__sound').append(this._mute);

    const audio = document.createElement('audio');
    audio.src = timed ? 'assets/audio/mama-timer-heart.mp3' : 'assets/audio/mama-break-heart.mp3';
    audio.preload = 'auto';
    root.append(audio);
    const hear = root.querySelector('.mama-break__hear');
    const status = root.querySelector('.mama-break__status');
    const full = root.querySelector('.mama-break__full');
    let alive = true;
    let attempt = 0;
    let ducked = false;
    let challenge = null;
    const unduck = () => { if (ducked) { ducked = false; music.duck(false); } };
    const stop = () => {
      attempt++;
      audio.pause();
      audio.currentTime = 0;
      unduck();
    };
    const gain = () => settings.get().muted ? 0 : volumeGain(settings.get());
    const refresh = () => {
      audio.volume = gain();
      if (!audio.volume) stop();
      hear.textContent = audio.volume ? '\u2665 Hear Mama\'s reminder' : '\u2665 Sound is off';
      hear.setAttribute('aria-disabled', String(!audio.volume));
    };
    refresh();
    const playVoice = async () => {
      if (!alive || document.hidden) return;
      if (!gain()) { status.textContent = 'Turn sound on to hear the reminder.'; return; }
      stop();
      speech.cancel();
      const current = attempt;
      status.textContent = '';
      try {
        await audio.play();
        if (!alive || attempt !== current) return;
        ducked = true;
        music.duck(true);
        hear.textContent = '\u2665 Listen again';
      } catch {
        if (alive && attempt === current) status.textContent = 'Tap the heart to try again.';
      }
    };
    hear.addEventListener('click', playVoice);
    this._back = () => {
      stop();
      if (timed) challenge = showAdultChallenge(() => { if (alive) { if (params.onAdultBack) params.onAdultBack(); else void back(); } });
      else void back();
    };
    let autoTried = false;
    const offEnter = bus.on('screen:enter', ({ id }) => {
      if (id === 'mama-break' && timed && !autoTried) {
        autoTried = true;
        if (gain()) void playVoice();
      }
    });
    audio.addEventListener('ended', unduck);
    audio.addEventListener('error', () => {
      unduck();
      if (alive) status.textContent = 'The reminder is shown above. Audio is unavailable right now.';
    });

    const updateFull = () => { full.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; };
    if (document.fullscreenEnabled && document.documentElement.requestFullscreen) full.hidden = false;
    updateFull();
    full.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch { if (alive) status.textContent = 'Full screen is unavailable in this browser.'; }
    });
    const hidden = () => { if (document.hidden) stop(); };
    const offSettings = bus.on('settings:changed', refresh);
    const offLeave = bus.on('screen:leave', stop);
    document.addEventListener('visibilitychange', hidden);
    document.addEventListener('fullscreenchange', updateFull);
    window.addEventListener('pagehide', stop);
    this._cleanup = () => {
      alive = false;
      stop();
      offSettings(); offLeave(); offEnter();
      dismissAdultChallenge(challenge);
      document.removeEventListener('visibilitychange', hidden);
      document.removeEventListener('fullscreenchange', updateFull);
      window.removeEventListener('pagehide', stop);
      audio.removeAttribute('src');
      audio.load();
    };
  },
  // Stay here while resting. A parent can start a fresh timer in the parent corner.
  busy() { return true; },
  onBack() { this._back?.(); },
  unmount() { this._cleanup?.(); this._cleanup = null; this._back = null; this._mute?.destroy?.(); this._mute = null; },
};
export default mamaBreak;
