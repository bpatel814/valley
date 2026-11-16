// App shell: one coherent storybook, first-gesture audio, safe resume and adult entry.
import './engine/compat.js';
import router from './world/router.js';
import bus from './world/bus.js';
import art from './world/art.js';
import { Particles } from './world/fx.js';
import pip from './world/pip.js';
import welcome from './world/screens/welcome.js';
import map from './world/screens/map.js';
import garden from './world/screens/garden.js';
import meadow from './world/screens/meadow.js';
import bridge from './world/screens/bridge.js';
import studio from './world/screens/studio.js';
import stories from './world/screens/stories.js';
import discovery from './world/screens/discovery.js';
import treehouse from './world/screens/treehouse.js';
import playStage from './world/screens/play-stage.js';
import picnic from './world/screens/picnic.js';
import buildLab from './world/screens/build-lab.js';
import waterGarden from './world/screens/water-garden.js';
import picturePost from './world/screens/picture-post.js';
import toyWorkshop from './world/screens/toy-workshop.js';
import rollingRun from './world/screens/rolling-run.js';
import townTracks from './world/screens/town-tracks.js';
import musicBand from './world/screens/music-band.js';
import animalFriends from './world/screens/animal-friends.js';
import riverRun from './world/screens/river-run.js';
import booHollow from './world/screens/boo-hollow.js';
import grandma from './world/screens/grandma.js';
import mamaBreak from './world/screens/mama-break.js';
import parent, { install as installParent } from './parent/corner.js';
import { installParentEntry, uninstallParentEntry } from './parent/gate.js';
import settings from './state/settings.js';
import progress from './state/progress.js';
import session from './state/session.js';
import resume from './state/resume.js';
import music from './audio/music.js';
import speech from './audio/speech.js';
import pwa from './pwa.js';
import { wordInfo } from './data/words.js';
import { installViewport } from './engine/viewport.js';
import db from './state/db.js';
import { savedWorld, temporaryDemo } from './state/saved-world.js';
import { halloweenActive } from './data/season.js';
import { mountPlayInvitation } from './world/play-invitation.js';
import { watchWorldUnlock } from './world/world-unlock-watch.js';

let sessionStarted = false;
let recapDue = false;
let checkTimer = 0;
let openingBreak = false;
let blockedBreak = null;
let playInvitation = null;
let worldUnlockStop = null;

function showWorldInUse() {
  worldUnlockStop?.(); worldUnlockStop = null;
  playInvitation?.destroy(); playInvitation = null; clearTimeout(checkTimer);
  session.stopTicker(); speech.cancel(); music.stop();
  document.getElementById('app')?.setAttribute('inert', '');
  document.getElementById('parent-entry')?.setAttribute('inert', '');
  let cover = document.getElementById('boot-cover');
  if (!cover) { cover = document.createElement('div'); cover.id = 'boot-cover'; document.body.appendChild(cover); }
  cover.classList.remove('is-ready');
  cover.setAttribute('role', 'alertdialog');
  cover.setAttribute('aria-label', `${savedWorld.label} is already open`);
  cover.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;background:var(--paper,#eef7ff);color:var(--ink,#49382f);text-align:center;font:18px/1.5 system-ui';
  const message = document.createElement('p');
  message.textContent = `${savedWorld.label} is open in another tab. Close the other tab, then reopen this one. Your saved play was kept.`;
  message.style.maxWidth = '34ch';
  const retry = document.createElement('button');
  retry.type = 'button'; retry.textContent = 'Reopen this world';
  retry.style.cssText = 'box-sizing:border-box;width:auto;max-width:100%;height:auto;min-height:56px;padding:14px 24px;border:3px solid #655044;border-radius:24px;background:#ffdfaa;color:#49382f;font:700 20px/1.3 system-ui;white-space:normal;overflow-wrap:anywhere;cursor:pointer';
  retry.addEventListener('click', () => { worldUnlockStop?.(); worldUnlockStop = null; window.location.reload(); });
  cover.replaceChildren(message, retry); retry.focus();
  if (db.writerGuardKind() === 'lock' && typeof navigator.locks?.query === 'function') {
    worldUnlockStop = watchWorldUnlock({ query: () => navigator.locks.query(),
      lockName: `rayna-valley:${savedWorld.database}:writer`, reload: () => window.location.reload() });
  }
}

bus.on('saved-world:blocked', showWorldInUse);
window.addEventListener('pagehide', () => { worldUnlockStop?.(); worldUnlockStop = null; playInvitation?.destroy(); playInvitation = null; session.stopTicker(); void db.releaseWritableSession(); });
// A back-forward restored document contains old activity caches. Fresh boot is
// required before it can reclaim writing access.
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });

function applySettings() {
  const s = settings.get();
  const html = document.documentElement;
  html.classList.toggle('reduced-motion', !!s.reducedMotion);
  html.classList.toggle('dark-paper', !!s.darkPaper);
  html.classList.toggle('halloween-active', halloweenActive(s));
  html.classList.toggle('hand-left', s.handedness === 'left');
  html.classList.toggle('hand-right', s.handedness !== 'left');
  music.mute(!!s.muted);
}

function unlockAudio() {
  speech.unlock();
  music.start();
  window.removeEventListener('pointerdown', unlockAudio, true);
  window.removeEventListener('keydown', unlockAudio, true);
}

function updateChrome({ id } = {}) {
  const entry = document.getElementById('parent-entry');
  const canEnter = !temporaryDemo && (id === 'map' || id === 'welcome');
  entry.hidden = !canEnter;
  if (canEnter) installParentEntry(entry, () => {
    void router.go('parent', { onBack: () => router.go('map', {}, { dir: 'right' }) });
  });
  else uninstallParentEntry();

  if (!sessionStarted && !['welcome', 'parent', 'mama-break'].includes(id)) {
    session.startNewSession();
    sessionStarted = true;
  }
  if (['welcome', 'parent', 'grandma', 'treehouse', 'play-stage', 'toy-workshop', 'rolling-run', 'town-tracks', 'music-band', 'animal-friends', 'river-run', 'mama-break'].includes(id)) {
    pip.cancelOnboard();
    pip.hide();
  } else if (!progress.get().firstRunDone) {
    pip.onboard();
  } else if (id === 'map') {
    pip.show();
  } else {
    pip.hide();
  }
  queueSessionCheck();
}

function queueSessionCheck() {
  clearTimeout(checkTimer);
  if (blockedBreak) return;
  checkTimer = setTimeout(() => {
    if (playInvitation?.active()) { session.setBusy(true); return; }
    const id = router.current();
    const screen = router.currentScreen();
    const busy = router.isMoving() || !!(screen?.breakBusy?.() ?? screen?.busy?.());
    session.setBusy(busy || id === 'parent' || id === 'welcome');
    if (!recapDue || openingBreak || ['parent', 'welcome', 'mama-break'].includes(id)) return;
    if (busy) { checkTimer = setTimeout(queueSessionCheck, 200); return; }
    void openTimedBreak(screen);
  }, 60);
}

async function openTimedBreak(screen) {
  if (openingBreak) return;
  openingBreak = true;
  const app = document.getElementById('app');
  // Block another stroke while the last one finishes saving.
  app.inert = true;
  session.lockForBreak();
  try {
    let checkpoint;
    try { checkpoint = await screen?.beforeBreak?.(); }
    catch (error) { console.info('[session] retaining unsaved paper', error?.code || error?.name); checkpoint = false; }
    if (checkpoint === false) { showBlockedBreak(screen, app); recapDue = false; return; }
    const opened = await router.go('mama-break', { sessionEnd: true }, { dir: 'up', checkpointDone: screen });
    recapDue = !opened;
  } catch (error) {
    console.error('[session] opening break', error);
    recapDue = true;
  } finally {
    if (!blockedBreak) app.inert = false;
    openingBreak = false;
    if (recapDue) queueSessionCheck();
  }
}

// Storage trouble must neither erase live paper nor let a child bypass a break.
// Keep the activity mounted underneath Mama until a grown-up chooses recovery.
function showBlockedBreak(screen, app) {
  if (blockedBreak) return;
  const host = document.createElement('section');
  host.className = 'screen';
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '200' });
  blockedBreak = host;
  document.body.append(host);
  const close = () => { mamaBreak.unmount(); host.remove(); blockedBreak = null; app.inert = false; };
  const adultControls = () => {
    let panel = host.querySelector('[data-save-recovery]');
    if (panel) { panel.querySelector('button')?.focus(); return; }
    panel = document.createElement('div'); panel.dataset.saveRecovery = '';
    const note = document.createElement('p');
    note.textContent = 'The current drawing could not be saved. It is still open underneath Mama. Retry saving, or start another play session to keep editing it. Closing this page may lose the unsaved part.';
    const retry = document.createElement('button'), restart = document.createElement('button');
    retry.type = restart.type = 'button'; retry.textContent = 'Retry saving and finish the break'; restart.textContent = 'Start another play session';
    for (const button of [retry, restart]) Object.assign(button.style, { minHeight: '44px', margin: '4px', padding: '8px 12px' });
    retry.addEventListener('click', async () => {
      retry.disabled = restart.disabled = true;
      try {
        if ((await screen?.beforeBreak?.()) === false) { note.textContent = 'This drawing still cannot save. It remains open underneath Mama.'; return; }
        close(); void router.go('mama-break', { sessionEnd: true }, { dir: 'up', checkpointDone: screen });
      } catch { note.textContent = 'Saving did not finish. Your open drawing was kept.'; }
      finally { retry.disabled = restart.disabled = false; }
    });
    restart.addEventListener('click', () => { close(); session.startNewSession(); });
    panel.append(note, retry, restart); host.querySelector('.mama-break__body').append(panel); retry.focus();
  };
  mamaBreak.mount(host, { sessionEnd: true, onAdultBack: adultControls });
  host.querySelector('.mama-break__status').textContent = 'Your drawing is still open. A grown-up can help with saving.';
}

async function boot() {
  installViewport();
  if (!await db.acquireWritableSession()) throw Object.assign(new Error('Saved world is already open'), { code: 'saved-world-busy' });
  await Promise.all([settings.load(), progress.load(), art.load()]);
  if (temporaryDemo) await settings.set({ sessionMinutes: 0 });
  // A quiet preview link is safe to open while someone else is working nearby.
  if (new URLSearchParams(window.location.search).get('muted') === '1') {
    await settings.set({ muted: true });
    const previewURL = new URL(window.location.href);
    previewURL.searchParams.delete('muted');
    window.history.replaceState(window.history.state, '', previewURL.href);
  }
  applySettings();
  sessionStarted = session.restore();
  window.addEventListener('pointerdown', unlockAudio, true);
  window.addEventListener('keydown', unlockAudio, true);
  router.init(document.getElementById('app'));
  for (const screen of [welcome, map, garden, meadow, bridge, studio, stories, discovery, treehouse, playStage, picnic, buildLab, waterGarden, picturePost, toyWorkshop, rollingRun, townTracks, riverRun, musicBand, animalFriends, booHollow, grandma, mamaBreak, parent]) { if (!temporaryDemo || screen !== parent) router.register(screen); }
  if (!temporaryDemo) installParent(router);
  new Particles(document.getElementById('fx'));
  bus.on('settings:changed', applySettings);
  bus.on('screen:enter', updateChrome);
  bus.on('back', () => router.back());
  bus.on('session:calm', () => music.layer('calm'));
  bus.on('session:end', () => { recapDue = true; queueSessionCheck(); });
  bus.on('session:reset', () => {
    sessionStarted = true;
    recapDue = false;
    clearTimeout(checkTimer);
    music.layer('map');
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { session.tick(); queueSessionCheck(); }
  });
  bus.on('stroke:start', () => { session.setBusy(true); queueSessionCheck(); });
  for (const name of ['stroke:end', 'trace:result', 'journey:play', 'activity:idle']) bus.on(name, queueSessionCheck);
  // Keep the exact activity resume data while the parent-controlled break is up.
  const locked = session.isBreakLocked();
  const showWelcome = new URL(window.location.href).searchParams.get('welcome') === '1';
  const raw = locked ? null : showWelcome ? await resume.peek() : await resume.take();
  const available = ['map', ...settings.enabledActivities()].filter(id => router.registered().includes(id));
  const saved = resume.resolve(raw, available);
  const updateReturnedHome = pwa.consumeUpdateReturn();
  const launchURL = new URL(window.location.href);
  const requestedWord = wordInfo(launchURL.searchParams.get('write'));
  if (launchURL.searchParams.has('write')) {
    launchURL.searchParams.delete('write');
    window.history.replaceState(window.history.state, '', launchURL.href);
  }
  if (locked) {
    await router.go('mama-break', { sessionEnd: true });
  } else if (updateReturnedHome) {
    await router.go('map');
  } else if (showWelcome) {
    await router.go('welcome');
  } else if (requestedWord && available.includes('meadow')) {
    await router.go('meadow', { word: requestedWord.word, mode: settings.get().learningLevel || 'explore' });
  } else if (raw && available.includes(saved.screen)) {
    await router.go(saved.screen, { ...(saved.params || {}), strokes: saved.strokes || [] }, { restoreSnapshot: saved });
  } else {
    await router.go(progress.get().firstRunDone ? 'map' : 'welcome');
  }
  // The first usable scene wins the network. Service-worker installation can
  // cache the full offline game after that scene is decoded and mounted.
  void pwa.init({ initialScreen: router.current() });
  if (router.current() === 'welcome') art.warmRoute('map');
  if (!db.hasWriteAccess()) throw Object.assign(new Error('Saved-world ownership ended during startup'), { code: 'saved-world-busy' });
  window.dispatchEvent(new Event('valley:ready'));
  const cover = document.getElementById('boot-cover');
  cover?.classList.add('is-ready');
  playInvitation = mountPlayInvitation({ screen: router.current(), onClose: () => {
    playInvitation = null; queueSessionCheck();
  } });
  setTimeout(() => { if (db.hasWriteAccess()) cover?.remove(); }, 200);
}

boot().catch(error => {
  console.error('[app] boot', error);
  window.dispatchEvent(new Event('valley:boot-failed'));
  if (error?.code === 'saved-world-busy') { showWorldInUse(); return; }
  if (document.getElementById('boot-recovery')) return;
  const cover = document.getElementById('boot-cover');
  if (!cover) return;
  cover.replaceChildren();
  const message = document.createElement('p');
  message.textContent = 'Our valley needs another moment.';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.style.cssText = 'box-sizing:border-box;width:auto;max-width:100%;height:auto;min-height:56px;padding:14px 24px;border:3px solid #655044;border-radius:24px;background:#ffdfaa;color:#49382f;font:700 20px/1.3 system-ui;white-space:normal;overflow-wrap:anywhere;cursor:pointer';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => window.location.reload());
  cover.append(message, retry);
});
