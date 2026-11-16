import { welcomeEntry } from '../welcome-entry.js';
import { enterFullscreen } from '../../engine/immersive.js';
import router, { makeButton, muteButton } from '../router.js';
import { Character } from '../characters.js';
import { addScenery, picture } from '../scene.js';
import sfx from '../../audio/sfx.js';
import settings from '../../state/settings.js';
import { valleyProfile } from '../../data/valley-profiles.js';
import { seasonHero, seasonLogo, seasonLogoFallback, halloweenActive } from '../../data/season.js';

export const welcome = {
  id: 'welcome',
  async mount(host) {
    this._alive = true;
    const profile = valleyProfile(settings.get().valleyProfile);
    document.title = profile.title;
    host.setAttribute('aria-label', profile.title);
    const root = document.createElement('div');
    root.className = 'welcome-world';
    const scenery = addScenery(root, 'map');
    const autumn = halloweenActive(settings.get()) && picture('halloween/boo-hollow-background-v1', { className: 'scene-layer' });
    if (autumn) scenery.replaceChildren(autumn);
    root.insertAdjacentHTML('beforeend', `<div class="welcome-title"><img src="${seasonLogo(profile, settings.get())}" data-fallback="${seasonLogoFallback(profile, settings.get())}" alt="${profile.title}" draggable="false"/></div><div class="welcome-unicorn"></div><div class="welcome-caterpillar"></div><div class="welcome-pip"></div><div class="welcome-play"></div>`);
    const logo = root.querySelector('.welcome-title img');
    logo.addEventListener('error', () => {
      const fallback = logo.dataset.fallback;
      if (fallback) { delete logo.dataset.fallback; logo.src = fallback; }
      else logo.remove();
    });
    const heroLook = seasonHero(profile, settings.get());
    const child = picture(heroLook.art, { alt: heroLook.alt }) || picture(profile.heroArt, { alt: profile.heroAlt });
    if (child) {
      const hero = document.createElement('div');
      hero.className = `title-${profile.id} welcome-${profile.id}`;
      hero.classList.toggle('title-costume', heroLook.costume && child.alt === heroLook.alt);
      hero.append(child); root.append(hero);
    }
    host.append(root);
    this._characters = [
      new Character(root.querySelector('.welcome-unicorn'), { name: 'unicorn', art: true, follow: true, stripes: 16 }),
      new Character(root.querySelector('.welcome-caterpillar'), { name: 'caterpillar', art: true, follow: true, segments: 6 }),
      new Character(root.querySelector('.welcome-pip'), { name: 'pip', art: true, follow: false }),
    ];
    if (halloweenActive(settings.get())) {
      const greet = makeButton({ icon: 'heart', cls: 'welcome-ghost', label: 'Say hello to the friendly ghost' });
      greet.replaceChildren();
      const ghost = new Character(greet, { name: 'ghost', art: false, follow: false });
      this._characters.push(ghost);
      let greeting = false;
      greet.addEventListener('click', () => {
        if (!this._alive || document.hidden || router.isMoving() || greeting) return;
        greeting = true; sfx.play('chime');
        void ghost.greet().catch(() => {}).finally(() => { greeting = false; });
      });
      root.append(greet);
    }
    const play = makeButton({ icon: 'play', cls: 'btn--pink welcome-play-button', label: `Play ${profile.title}` });
    const caption = document.createElement('span');
    caption.className = 'welcome-play-caption';
    const hint = document.createElement('span');
    hint.className = 'welcome-tap-cue';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<svg viewBox="0 0 48 48"><path d="M20 39V17a4 4 0 0 1 8 0v10l3-5a4 4 0 0 1 7 4l-5 13Z" fill="#fff7df" stroke="#654f48" stroke-width="3"/><path d="M12 15h-5m7-8-3-3m16 3 3-3" stroke="#654f48" stroke-width="3" stroke-linecap="round"/></svg>';
    const status = document.createElement('span');
    status.className = 'sr-only'; status.setAttribute('role', 'status');
    play.append(caption, hint);
    this._entry = welcomeEntry({
      isActive: () => this._alive && !document.hidden && !router.isMoving(),
      requestFullscreen: () => enterFullscreen(),
      enter: () => {
        if (!this._alive || router.isMoving()) return false;
        sfx.play('chime');
        return router.go('map', {}, { dir: 'up' });
      },
      paint: state => {
        play.disabled = state === 'opening' || state === 'done';
        play.setAttribute('aria-busy', String(state === 'opening'));
        caption.textContent = state === 'opening' ? 'Opening…' : state === 'retry' ? 'Try again' : "Let’s play";
        status.textContent = state === 'retry' ? 'Tap play to try again.' : state === 'opening' ? 'Opening the valley.' : '';
        hint.hidden = state === 'opening' || state === 'done';
      },
    });
    play.addEventListener('click', () => { void this._entry.play(); });
    root.querySelector('.welcome-play').append(play, status);
    this._mute = muteButton(); root.append(this._mute);
  },
  busy() { return false; },
  onBack() {},
  unmount() { this._alive = false; this._entry?.destroy(); this._characters?.forEach(c => c.destroy()); this._mute?.destroy?.(); },
};
export default welcome;
