import { installIdleHelp } from '../idle-help.js';
import session from '../../state/session.js';
import { installControlCue } from '../control-cue.js';
import router, { muteButton, tapify, iconSVG, recoveryAction } from '../router.js';
import bus from '../bus.js';
import settings from '../../state/settings.js';
import speech from '../../audio/speech.js';
import { PenInput } from '../../engine/pen.js';
import state, { PICTURE_POST_MAX_SENT } from '../../state/picture-post.js';
import * as db from '../../state/db.js';
import { checkpointLivingScene } from './music-band.js';
import { savedWorld } from '../../state/saved-world.js';
import { POST_RECIPIENTS, POST_PLACES, POST_SITUATIONS, POST_STAMPS, POST_STAMP_SIZES, createPostStamp, POST_COLORS, POST_MAX_STROKE_POINTS, POST_MAX_POINTS, POST_MAX_MARKS, POST_MAX_PNG_CHARS, postPoint, postRecipient, postSituation, postCanDeliver, postPaperHasContent, picturePostSource } from '../../data/picture-post.js';
import { MESSAGE_DAY_EPISODES } from '../../data/message-day.js';

const PAPER_WIDTH = 900, PAPER_HEIGHT = 600;
const ART_ROOT = 'assets/art/final/';
const DAY_PROMPTS = Object.freeze({ sign: 'How will friends find our café? Make a sign with pictures or marks.', invitation: 'Who shall we invite? Make a message for a friend.', changed: 'Something changed. Make a new message. Your earlier message stays in the album.' });
const images = new Map();
let visitSerial = 0;
function image(path, alt = '') { const img = document.createElement('img'); img.src = ART_ROOT + path; img.alt = alt; img.draggable = false; img.addEventListener('error', () => { img.hidden = true; img.parentElement?.classList.add('post-art-missing'); }); return img; }
function button(label, content, fn, cls = '') { const b = document.createElement('button'); b.type = 'button'; b.className = `post-button ${cls}`; b.setAttribute('aria-label', label); if (typeof content === 'string') b.textContent = content; else if (content) b.append(content); tapify(b, fn); return b; }

export function makePostNavigation({leave, album, help, fromMap=false, active=()=>true}) {
  const guarded=(label,content,action)=>{ let node; node=button(label,content,()=>{ if (active() && node.isConnected) action(); }); return node; };
  const home=guarded('Return home with your current picture','',()=>leave('map'));
  home.innerHTML=iconSVG('home'); home.dataset.control='home';
  const back=guarded(fromMap ? 'Return to the valley with your current picture' : 'Return to Together with your current picture','',()=>leave(fromMap ? 'map' : 'treehouse'));
  back.innerHTML=iconSVG('back');
  const albums=guarded('Open your letters album',symbol('album'),album);
  const assistance=guarded('Hear and show help',symbol('help'),help); assistance.dataset.help='';
  for (const [node,label] of [[home,'Home'],[back,'Back'],[albums,'Letters'],[assistance,'Help']]) {
    const caption=document.createElement('span');caption.className='post-nav-caption';caption.textContent=label;node.append(caption);
  }
  installControlCue(home,{phraseKey:'ui_home',isActive:active});
  const mute=muteButton();
  return {home,back,albums,assistance,mute,ordered:[home,back,albums,assistance,mute]};
}
function postCaption(text) { const caption=document.createElement('span'); caption.className='post-action-caption'; caption.textContent=text; return caption; }
function stampArt(stamp) { return `stickers/draw_${stamp}.webp`; }
function portrait(id) { const recipient = postRecipient(id); return image(`characters/${recipient.art}.webp`, recipient.name); }
function placePicture(place) {
  const group = document.createElement('span'); group.className = 'post-place-picture'; group.append(image(place.art));
  const people = place.id === 'grandparents' ? ['ba', 'dada'] : place.id === 'village' ? ['mama', 'daddy'] : [];
  if (people.length) { const family = document.createElement('span'); family.className = 'post-place-family'; people.forEach(id => family.append(portrait(id))); group.append(family); }
  return group;
}
function speak(key) { if (!settings.get().muted) speech.say(key); }
function symbol(name) {
  const paths = {
    pen: '<path d="m12 35 5-12L34 6l8 8-17 17-13 4Z" fill="#d9b36f" stroke="currentColor" stroke-width="3"/><path d="m17 23 8 8M12 35l8-2" stroke="currentColor" stroke-width="3"/>',
    brush: '<path d="m20 26 18-20 6 6-17 19" fill="#ba9170" stroke="currentColor" stroke-width="3"/><path d="M25 26c-12-3-7 14-18 13 15 9 27-3 18-13Z" fill="#72518b" stroke="currentColor" stroke-width="3"/>',
    undo: '<path d="m19 9-12 12 12 12M8 21h18q15 0 15 17" fill="none" stroke="currentColor" stroke-width="4"/>',
    album: '<rect x="7" y="7" width="34" height="34" rx="5" fill="#fffdf4" stroke="currentColor" stroke-width="3"/><path d="m10 34 10-12 9 6 8-11 3 17" fill="#8db878"/><circle cx="17" cy="16" r="4" fill="#e7be71"/>',
    help: '<path d="M15 15c0-14 23-13 21 0-1 7-12 7-12 16" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="24" cy="39" r="3" fill="currentColor"/>',
    keep: '<path d="M24 14C9 0 0 20 24 41 48 20 39 0 24 14Z" fill="#eaa0af" stroke="currentColor" stroke-width="3"/>',
  };
  const frame = document.createElement('span'); frame.className = 'post-symbol'; frame.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true">${paths[name] || paths.album}</svg>`; return frame;
}
export function fitPostPaper(width, height) {
  const inkWidth = Math.max(0, Math.min(Math.max(0, width - 10), Math.max(0, height - 10) * 1.5));
  return { width: Math.min(Math.max(0, width), inkWidth + 10), height: Math.min(Math.max(0, height), inkWidth / 1.5 + 10), inkWidth, inkHeight: inkWidth / 1.5 };
}
export function postCurrentStop(draft) {
  const stop = Array.isArray(draft?.stops) ? draft.stops.at(-1) : null;
  return POST_PLACES.some(place => place.id === stop) ? stop : null;
}
export function postAlbumPage(snapshot, page = 0) {
  const papers = [...snapshot.drafts.slice().reverse().map(draft => ({ draft })), ...snapshot.sent.slice().reverse().map(message => ({ message }))];
  const pages = Math.max(1, Math.ceil(papers.length / 6)), index = Math.max(0, Math.min(pages - 1, Number(page) | 0));
  return { pages, index, items: papers.slice(index * 6, index * 6 + 6) };
}
export function postPaperRecoveryCopy(draft, pendingMark, at = Date.now()) {
  const copy = JSON.parse(JSON.stringify(draft));
  if (pendingMark) {
    const mark = JSON.parse(JSON.stringify(pendingMark)); delete mark.budget;
    if (mark.kind === 'stamp') copy.paper.marks.push({ kind: 'stamp', stamp: mark.stamp, x: mark.x, y: mark.y, size: mark.size ?? .14 });
    else copy.paper.marks.push(mark);
  }
  return { kind: 'rayna-valley-post-paper-recovery', version: 1, savedWorld: { v: 1, id: savedWorld.id }, at, draft: copy };
}
export function paintPostPaper(context, paper, stampImages = images) {
  const width = context.canvas.width, height = context.canvas.height;
  context.clearRect(0, 0, width, height); context.fillStyle = '#fffdf4'; context.fillRect(0, 0, width, height);
  for (const mark of paper.marks) {
    if (mark.kind === 'stamp') {
      const img = stampImages.get(mark.stamp); if (!img?.complete || !img.naturalWidth) continue;
      const size = width * mark.size; context.drawImage(img, mark.x * width - size / 2, mark.y * height - size / 2, size, size);
    } else {
      context.strokeStyle = mark.color; context.fillStyle = mark.color; context.lineCap = 'round'; context.lineJoin = 'round';
      const first = mark.points[0]; if (!first) continue;
      context.beginPath(); context.arc(first.x * width, first.y * height, width * mark.width * (.6 + .8 * first.p) / 2, 0, Math.PI * 2); context.fill();
      for (let i = 1; i < mark.points.length; i++) { const a = mark.points[i - 1], b = mark.points[i]; context.lineWidth = width * mark.width * (.6 + .8 * (a.p + b.p) / 2); context.beginPath(); context.moveTo(a.x * width, a.y * height); context.lineTo(b.x * width, b.y * height); context.stroke(); }
    }
  }
}
const screen = {
  id: 'picture-post',
  async mount(root, params = {}) {
    this.visit = ++visitSerial; const token = this.visit; this.alive = true; this.root = root; this.stroke = null; this.capacityStroke = null; this.busySaving = false; this.mode = 'pen'; this.color = POST_COLORS[0]; this.stamp = 'heart'; this.stampScale = 'medium';
    this.checkpointing = false; this.checkpointPromise = null; this.ready = false; this.initialOpenPending = true; this.openingPost = false; this.main = null; this.status = null; this.footer = null;
    await this._openSavedPost(root, params, token);
  },
  async _openSavedPost(root, params, token) {
    if (!this.alive || token !== this.visit || this.openingPost) return;
    this.openingPost = true; const oldRetry = root.querySelector('.post-load-retry'); if (oldRetry) oldRetry.disabled = true;
    let reopenResult = true;
    try {
      await state.load(); if (!this.alive || token !== this.visit) return;
      if (params.galleryKey) reopenResult = await state.reopenGallery(params.galleryKey, { isCurrent: () => this.alive && token === this.visit });
      else if (params.source?.kind === 'picture-post') reopenResult = state.reopenSource(params.source);
    } catch {
      if (!this.alive || token !== this.visit) return;
      root.replaceChildren(); const recovery = document.createElement('section'); recovery.className = 'post-load-recovery'; recovery.setAttribute('role', 'status');
      const text = document.createElement('p'); text.textContent = 'Your picture messages could not be opened. Try again, or go Home.';
      const retry = recoveryAction('replay', 'Try again', () => { void this._openSavedPost(root, params, token); }); retry.classList.add('post-load-retry');
      const home = recoveryAction('home', 'Home', () => { if (this.alive && token === this.visit) void router.go('map'); });
      recovery.append(text, retry, home); root.append(recovery); return;
    } finally { if (this.visit === token) { this.openingPost = false; const retry = root.querySelector('.post-load-retry'); if (retry) retry.disabled = false; } }
    if (!this.alive || token !== this.visit) return;
    return this._finishOpeningPost(root, params, token, reopenResult);
  },
  async _finishOpeningPost(root, params, token, reopenResult) {
    this.initialOpenPending = false;
    root.classList.add('picture-post');
    root.setAttribute('aria-label', 'Picture Post');
    root.innerHTML = '<header class="post-header"><h1>Picture Post</h1><div class="post-nav"></div></header><p class="post-status" role="status" aria-live="polite"></p><main class="post-main"></main><footer class="post-footer"></footer>';
    this.main = root.querySelector('.post-main'); this.status = root.querySelector('.post-status'); this.footer = root.querySelector('.post-footer');
    this.checkpointInput = event => { if (!this.alive || token !== this.visit || this.checkpointing) { event.preventDefault(); event.stopImmediatePropagation(); } };
    for (const type of ['pointerdown', 'click', 'keydown']) root.addEventListener(type, this.checkpointInput, true);
    const nav=makePostNavigation({leave:route=>this.leave(route), album:()=>this.album(), help:()=>this.help(), fromMap:params.fromMap === true, active:()=>this.alive && token===this.visit && !this.checkpointing});
    this.mute=nav.mute; root.querySelector('.post-nav').append(...nav.ordered);
    this.offSettings = bus.on('settings:changed', () => { this.pen?.setAllowFinger(!settings.get().penOnly);if(settings.get().reducedMotion){this.idleMotion?.cancel?.();this.idleMotion=null;} });
    this.layoutResize = () => this.resizePaper?.(); window.addEventListener('resize', this.layoutResize);
    const promises = POST_STAMPS.map(stamp => new Promise(resolve => { const img = new Image(); images.set(stamp, img); img.onload = img.onerror = resolve; img.src = ART_ROOT + stampArt(stamp); }));
    await Promise.all(promises); if (!this.alive || token !== this.visit) return;
    const current = state.get();
    if (current.draft.stage === 'delivered') { const message = current.sent.find(m => m.id === current.selectedMessage) || current.sent.at(-1); if (message) this.received(message.id); else this.make(); }
    else if (current.draft.stage === 'folded') this.route(); else this.make();
    if (!reopenResult) this.setStatus('That paper could not be opened. Your current paper stays here. Ask a grown-up to check the album or backup.');
    this.ready = true; speak('picture_post_intro');
    this._installIdleHelp();
  },
  _installIdleHelp(clock = {}) {
    this.idleHelp?.();const token=this.visit,schedule=clock.delay || setTimeout,unschedule=clock.cancel || clearTimeout;
    this.idleHelp=installIdleHelp(this.root,{
      active:()=>this.alive && this.visit===token && this.root?.dataset.postPhase==='make' && !!this.paperCue && !this.paperCue.hidden && !state.draftHasPaperMarks() && !this.choicePanel && this.main.querySelector('.post-situation-options')?.hidden!==false && !this.checkpointing && !this.busySaving && !this.capacityStroke && !this.pen?.drawing && !session.isBreakLocked() && !router.isMoving() && router.current()==='picture-post' && !speech.isSpeaking(),
      demonstrate:()=>{
        const cue=this.paperCue,hand=cue.querySelector('.post-paper-cue-hand');if(!hand)return null;cue.classList.add('is-guided');
        const reduced=settings.get().reducedMotion || (typeof window.matchMedia==='function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const motion=!reduced && hand.animate?.([{translate:'0 0'},{translate:'-8px -5px'},{translate:'0 0'}],{duration:900,iterations:1,easing:'ease-in-out'});
        this.idleMotion=motion || null;motion?.finished?.catch?.(()=>{});const key=this.mode==='stamp'?'studio_stamp':'studio_brush';
        let voiceOwned=false;if(!settings.get().muted && speech.isUnlocked()){voiceOwned=true;void speech.say(key).then(()=>{voiceOwned=false;},()=>{voiceOwned=false;});}
        let visualDone=false;const clearVisual=()=>{if(visualDone)return;visualDone=true;motion?.cancel?.();if(this.idleMotion===motion)this.idleMotion=null;cue.classList.remove('is-guided');};
        const visualTimer=schedule(clearVisual,2400);
        return ()=>{unschedule(visualTimer);clearVisual();if(voiceOwned && speech.isSpeaking())speech.cancel();voiceOwned=false;};
      },...clock
    });
  },
  clearView() { if (!this.finishStroke()) return false; this.keyboardCleanup?.(); this.keyboardCleanup = null; this.routeView = (this.routeView || 0) + 1; this.closeChoices(); this.paperObserver?.disconnect(); this.paperObserver = null; this.resizePaper = null; this.pen?.destroy(); this.pen = null; this.canvas = null; this.stampPreview = null; this.paperCue = null; this.main.classList.remove('post-help'); this.root.dataset.postPhase = ''; this.main.replaceChildren(); this.footer.replaceChildren(); return true; },
  setStatus(text) { if (this.alive) this.status.textContent = text; },
  albumFull() { this.setStatus('Your paper stays here. Ask a grown-up to back up the full album before making another paper.'); },
  lettersFull() { this.setStatus('Your letter book is full. Your envelope and older letters stay here. Ask a grown-up to save a backup before sending another.'); },
  paperFull() { this.setStatus(this.capacityStroke ? 'Your whole mark and earlier paper are still here. This mark is too large for the album. Undo the newest mark, or Keep a recovery copy.' : 'Your paper is still here. There is no more room on this paper. Undo a mark, or Keep it and ask a grown-up for a backup.'); },
  startPaper(situation = 'free') { if (!this.alive || this.checkpointing || this.pen?.drawing || this.busySaving) return; if (!this.finishStroke()) return; if (!state.start(situation)) { this.albumFull(); return; } this.make(); },
  startDay(episode, messageId = '', arrivingGuest = '') {
    if (!this.alive || this.checkpointing || this.pen?.drawing || this.busySaving || !this.finishStroke()) return;
    if (!state.startMessageDay(episode, { messageId, arrivingGuest })) { this.albumFull(); return; }
    if (arrivingGuest) state.apply({ type: 'recipient', recipient: arrivingGuest });
    this.make();
    if (!postPaperHasContent(state.get().draft.paper)) this.dayMaterials();
    speak('living_message_' + episode);
  },
  dayDialog(label) {
    if (!this.openChoices('message-day')) return null;
    const panel = this.choicePanel, grid = panel.querySelector('.post-choice-grid');
    panel.setAttribute('aria-label', label);
    const heading = document.createElement('h2'); heading.textContent = label; heading.className = 'post-day-heading'; grid.before(heading);
    grid.classList.add('post-day-grid');
    const token = this.visit, view = this.routeView;
    const current = () => this.alive && token === this.visit && view === this.routeView && this.choicePanel === panel && panel.isConnected && !this.checkpointing && !this.busySaving && !this.pen?.drawing;
    const add = (label, art, caption, action) => {
      const choice = button(label, art, () => { if (current()) action(); }, 'post-day-choice');
      const text = document.createElement('span'); text.textContent = caption; choice.append(text); grid.append(choice); return choice;
    };
    return { panel, grid, current, add };
  },
  openMessageDay() {
    const dialog = this.dayDialog('Messages that help'); if (!dialog) return;
    MESSAGE_DAY_EPISODES.forEach(episode => dialog.add(episode.label, image(episode.id === 'sign' ? 'stickers/draw_flower.webp' : episode.id === 'invitation' ? 'picture-post/envelope.png' : 'picture-post/picnic-stop-v2.png'), episode.label,
      () => episode.id === 'changed' ? this.chooseChangedMessage() : this.startDay(episode.id)));
    speak('living_message_intro');
  },
  chooseChangedMessage(page = 0) {
    const dialog = this.dayDialog('Change a message, keeping its original'); if (!dialog) return;
    const messages = state.get().sent.slice().reverse(), pages = Math.max(1, Math.ceil(messages.length / 6));
    const index = Math.max(0, Math.min(pages - 1, page));
    dialog.add('Make a fresh announcement without an earlier picture', image('picture-post/envelope.png'), 'New announcement', () => this.startDay('changed'));
    messages.slice(index * 6, index * 6 + 6).forEach(message => {
      const art = document.createElement('img'); art.src = message.png; art.alt = '';
      dialog.add('Change the message for ' + postRecipient(message.recipient).name + '. Keep the original.', art, 'For ' + postRecipient(message.recipient).name, () => this.chooseChangedPlan(message.id));
    });
    if (pages > 1) {
      const back = dialog.add('Previous messages to change', symbol('undo'), 'Previous', () => this.chooseChangedMessage(index - 1)); back.disabled = index === 0;
      const more = dialog.add('More messages to change', image('picture-post/envelope.png'), 'More', () => this.chooseChangedMessage(index + 1)); more.disabled = index === pages - 1;
    }
  },
  chooseChangedPlan(messageId) {
    const message = state.get().sent.find(row => row.id === messageId); if (!message) return;
    const dialog = this.dayDialog('This time, who needs the message?'); if (!dialog) return;
    dialog.add('Change this paper into a sign. Keep the earlier invitation.', image('stickers/draw_flower.webp'), 'A new sign', () => this.startDay('changed', message.id));
    POST_RECIPIENTS.filter(person => person.id !== message.recipient).forEach(person => dialog.add('Make a new invitation for ' + person.name + '. Keep the earlier message for ' + postRecipient(message.recipient).name, portrait(person.id), 'Invite ' + person.name, () => this.startDay('changed', message.id, person.id)));
  },
  dayMaterials() {
    const dialog = this.dayDialog('Start with a picture or your own marks'); if (!dialog) return;
    dialog.add('Use the game flower as a starting picture. You can change or undo it.', image('stickers/draw_flower.webp'), 'Game flower', () => {
      state.apply({ type: 'mark', mark: { kind: 'stamp', stamp: 'flower', x: .5, y: .5, size: .42 } }); this.make();
    });
    dialog.add('Draw or scribble your own message', symbol('pen'), 'My own marks', () => { this.mode = 'pen'; this.closeChoices(); this.canvas?.focus?.(); });
  },
  chooseDayUse() {
    if (!this.finishStroke() || !postPaperHasContent(state.get().draft.paper)) return;
    const dialog = this.dayDialog('What will your message do?'); if (!dialog) return;
    const use = purpose => { state.apply({ type: 'message-day-use', use: purpose }); state.apply({ type: 'destination', destination: 'picnic' }); this.closeChoices(); void this.fold(); };
    dialog.add('Use my whole message as our café sign', image('stickers/draw_flower.webp'), 'Our sign', () => use('cafe-sign'));
    dialog.add('Carry an invitation to ' + postRecipient(state.get().draft.recipient).name, portrait(state.get().draft.recipient), 'Invite a friend', () => use('cafe-invite'));
    speak('living_message_use');
  },
  editPaper(action) { if (!this.alive || this.checkpointing || this.pen?.drawing || this.busySaving) return; if (!this.finishStroke()) return; if (!action()) { this.albumFull(); return; } this.make(); },
  async keepDraft() {
    if (!this.alive || this.checkpointing || this.pen?.drawing || this.busySaving) return;
    if (!this.finishStroke()) { this.keepCapacityCopy(); return; } if (!state.saveDraft()) { this.albumFull(); return; }
    const token = this.visit; this.busySaving = true;
    try { await state.checkpointFlush(); if (this.alive && token === this.visit) this.setStatus(db.status().persistent ? 'Your draft is kept in the album. You can change it later.' : 'Your paper is still here, but storage is temporary. Ask a grown-up to save a backup before closing the game.'); }
    catch { if (this.alive && token === this.visit) this.setStatus('Your paper is still here. Try keeping it again.'); }
    finally { if (this.alive && token === this.visit) this.busySaving = false; }
  },
  keepCapacityCopy() {
    if (!this.alive || this.pen?.drawing || this.busySaving || !this.capacityStroke) return false;
    let link, href;
    try {
      const copy = postPaperRecoveryCopy(state.get().draft,this.capacityStroke);
      href = URL.createObjectURL(new Blob([JSON.stringify(copy)],{type:'application/json'}));
      link = document.createElement('a'); link.href=href; link.download='picture-post-paper-recovery.json'; link.style.display='none'; document.body.append(link); link.click();
      this.setStatus('A recovery copy with your whole mark was prepared. Ask a grown-up to check the download before closing. Your paper is still here; it was not saved in the album.');
      return true;
    } catch { this.setStatus('The recovery copy could not be prepared. Your whole mark is still here. Retry Keep, or Undo the newest mark.'); return false; }
    finally { link?.remove(); if (href) setTimeout(()=>URL.revokeObjectURL(href),1000); }
  },
  help() {
    if (this.pen?.drawing || this.busySaving) return;
    const phase = state.get().draft.stage;
    const day = state.get().draft.messageDay;
    if (day && (phase === 'make' || day.use === 'cafe-sign' && phase === 'folded')) {
      this.setStatus(phase === 'make' ? DAY_PROMPTS[day.episode] : 'Your whole sign is ready. Bring it to our café, or change it first.');
      speak(phase === 'make' ? 'living_message_' + day.episode : 'living_message_sign_ready');
      if (phase === 'make') this.openChoices('help'); return;
    }
    this.setStatus(phase === 'make' ? 'Draw, scribble, or tap a picture stamp. Choose a friend. Fold your picture when you are ready.' : phase === 'folded' ? 'Take your envelope along the path. Tap places in any order. Deliver at the place you chose.' : 'Tap the envelope to see your own message and your friend’s picture reply.');
    speak(phase === 'make' ? 'picture_post_help_make' : phase === 'folded' ? 'picture_post_help_route' : 'picture_post_help_open');
    this.main.classList.add('post-help');
    if (phase === 'make') this.openChoices('help');
  },
  make() {
    if (!this.clearView()) return; const draft = state.get().draft;
    const token = this.visit, view = this.routeView;
    const currentView = () => this.alive && token === this.visit && view === this.routeView;
    this.root.dataset.postPhase = 'make';
    if (draft.stage !== 'make') { state.apply({ type: 'unfold' }); }
    const current = state.get().draft; this.setStatus(current.messageDay ? DAY_PROMPTS[current.messageDay.episode] : postSituation(current.situation).prompt);
    const situations = document.createElement('div'); situations.className = 'post-situations';
    const situationOptions=document.createElement('div'); situationOptions.className='post-situation-options';
    situationOptions.hidden=true; situationOptions.id=`post-ideas-${token}-${view}`;
    const ideas=button('Choose a message idea','',()=>{
      if (!currentView() || !ideas.isConnected || this.pen?.drawing || this.busySaving || this.choicePanel || this.checkpointing) return;
      situationOptions.hidden=!situationOptions.hidden; ideas.setAttribute('aria-expanded',String(!situationOptions.hidden));
    },'post-ideas');
    ideas.innerHTML=iconSVG('book'); ideas.setAttribute('aria-expanded','false');ideas.setAttribute('aria-controls',situationOptions.id);ideas.dataset.ideas='';
    const closeIdeas=()=>{situationOptions.hidden=true;ideas.setAttribute('aria-expanded','false');};
    situations.addEventListener('keydown',event=>{ if(event.key==='Escape' && currentView() && !situationOptions.hidden) { event.preventDefault();closeIdeas();ideas.focus(); } });
    const ideasCaption=document.createElement('span');ideasCaption.textContent='Ideas';ideas.append(ideasCaption);situations.append(ideas);
    POST_SITUATIONS.forEach(scene => {
      const selected=scene.id===current.situation;
      const b=button(scene.title,image(scene.id === 'picnic' ? 'picture-post/picnic-stop-v2.png' : scene.id === 'home-picture' ? 'characters/family_grandma_idle.webp' : 'picture-post/envelope.png'),()=>{ if (currentView() && b.isConnected) this.startPaper(scene.id); });
      b.dataset.situation=scene.id; b.disabled=selected;
      const label=document.createElement('span');label.textContent=({ picnic:'Picnic', 'home-picture':'Ba & Dada', free:'My picture' })[scene.id] || scene.title;b.append(label);
      b.setAttribute('aria-pressed',String(selected));situationOptions.append(b);
    });
    const day = button('Messages that help: choose a sign, invitation or changed message', image('picture-post/envelope.png'), () => { if (currentView()) this.openMessageDay(); }, 'post-day-entry'); const dayLabel = document.createElement('span'); dayLabel.textContent = 'Playday'; day.append(dayLabel); situationOptions.append(day); situations.append(situationOptions);
    const workspace = document.createElement('div'); workspace.className = 'post-workspace';
    const paper = document.createElement('div'); paper.className = 'post-paper';
    this.canvas = document.createElement('canvas'); this.canvas.width = PAPER_WIDTH; this.canvas.height = PAPER_HEIGHT; this.canvas.setAttribute('aria-label', 'Your message paper. Draw here, or choose a stamp, slide and lift to place it. Keyboard stamp: arrow keys move a preview, Enter or Space places it, Escape cancels.'); this.canvas.tabIndex = 0; paper.append(this.canvas);
    this.paperCue=document.createElement('span'); this.paperCue.className='post-paper-cue'; this.paperCue.setAttribute('aria-hidden','true');
    this.paperCue.innerHTML='<span class="post-paper-cue-ink"><svg viewBox="0 0 160 90"><path d="M12 68Q42 10 72 50T140 22" fill="none" stroke="#b48ed0" stroke-width="9" stroke-dasharray="9 6" stroke-linecap="round"/><path d="m126 16 16 5-9 14" fill="none" stroke="#806398" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="post-paper-cue-stamp" hidden></span>';
    this.paperCue.querySelector('.post-paper-cue-stamp').append(image(stampArt(this.stamp)));
    const cueHand=document.createElement('span'); cueHand.className='post-paper-cue-hand';
    cueHand.innerHTML='<svg viewBox="0 0 48 48"><path d="M17 25V8q0-5 5-5t5 5v13q5-4 9 0 6-1 6 6l-4 14H21L9 29q-4-6 2-7l6 3Z" fill="#ffe1bd" stroke="#79563c" stroke-width="3" stroke-linejoin="round"/></svg>';
    this.paperCue.append(cueHand);
    paper.append(this.paperCue);
    // A separate visual follows the held stamp without repainting or changing
    // the saved paper on every pointer sample. The canvas remains the target.
    this.stampPreview = image(stampArt(this.stamp)); this.stampPreview.className = 'post-stamp-preview'; this.stampPreview.dataset.stamp = this.stamp;
    this.stampPreview.hidden = true; this.stampPreview.setAttribute('aria-hidden', 'true'); paper.append(this.stampPreview);
    const tools = document.createElement('div'); tools.className = 'post-tools';
    ['pen', 'brush'].forEach(tool => { const b = button(tool === 'pen' ? 'Fine pen' : 'Wide brush', symbol(tool), () => { if (this.pen?.drawing || this.busySaving) return; this.finishStroke(); this.mode = tool; this.refreshTools(); }); b.dataset.tool = tool; b.classList.add('post-ink-tool');
      const sample = document.createElement('span'); sample.className = 'post-ink-sample'; sample.dataset.inkWidth = tool === 'brush' ? 'wide' : 'thin'; sample.setAttribute('aria-hidden', 'true'); b.append(sample); tools.append(b); });
    const colors = button('Choose ink color', '', () => this.openChoices('color'), 'post-color post-color-launcher'); colors.dataset.palette = ''; tools.append(colors);
    const stamps = button('Choose a picture stamp', image(stampArt(this.stamp)), () => this.openChoices('stamp'), 'post-stamp'); stamps.dataset.stampLauncher = ''; tools.append(stamps);
    const undo = button('Undo the last mark or stamp', symbol('undo'), () => this.undoMark()); undo.dataset.undo = ''; tools.append(undo);
    const area = document.createElement('div'); area.className = 'post-paper-area'; area.append(paper); workspace.append(area, tools);
    this.main.append(situations, workspace);
    const fold = button(current.messageDay ? 'Choose how to use my message' : 'Fold your own picture into an envelope', image('picture-post/envelope.png'), () => { if (currentView()) current.messageDay ? this.chooseDayUse() : this.fold(); }, 'post-primary'); fold.dataset.fold = ''; const foldLabel = document.createElement('span'); foldLabel.textContent = current.messageDay ? 'Use' : 'Fold'; fold.append(foldLabel);
    const people = button('Choose who gets your picture', portrait(current.recipient), () => this.openChoices('recipient'), 'post-choice-launcher'); people.dataset.recipientLauncher = '';
    const destination = button('Choose where your friend opens the message', placePicture(POST_PLACES.find(p => p.id === current.destination)), () => this.openChoices('destination'), 'post-choice-launcher'); destination.dataset.destinationLauncher = '';
    const keep = button('Keep an editable draft', symbol('keep'), () => this.keepDraft()); keep.dataset.keep = ''; keep.append(postCaption('Keep'));
    this.footer.append(people, destination, keep, fold);
    this.pen = new PenInput(this.canvas, {
      allowFinger: !settings.get().penOnly,
      onStrokeStart: point => {
        if (!currentView() || this.choicePanel || this.checkpointing || this.busySaving) return;
        closeIdeas();
        if (this.capacityStroke) { this.paperFull(); return; }
        this.keyboardPosition = null; this.stampPreview.hidden = true; this.main.classList.remove('post-help'); const paper = state.get().draft.paper;
        const available = POST_MAX_POINTS - paper.marks.reduce((count, mark) => count + (mark.points?.length || 0), 0);
        if (paper.marks.length >= POST_MAX_MARKS || (this.mode !== 'stamp' && available <= 0)) { this.paperFull(); return; }
        this.stroke = this.mode === 'stamp' ? createPostStamp(this.stamp, this.stampScale) : { kind: 'ink', color: this.color, width: this.mode === 'brush' ? .022 : .007, points: [], budget: Math.min(available, POST_MAX_STROKE_POINTS) }; this.updatePaperCue(); this.collectPoint(point);
      },
      onStrokeMove: point => { if (currentView() && this.stroke) this.collectPoint(point); },
      onStrokeEnd: (_, detail) => { if (!currentView()) return; if (detail.discarded || (detail.cancelled && this.stroke?.kind === 'stamp')) { this.stroke = null; this.stampPreview.hidden = true; this.repaint(); this.updatePaperCue(); } else this.finishStroke(); },
    });
    this.keyboardPosition = null;
    const cancelKeyboard = () => { this.keyboardPosition = null; if (!this.pen?.drawing && this.stampPreview) this.stampPreview.hidden = true; this.updatePaperCue(); };
    const hidden = () => { if (document.hidden && currentView()) cancelKeyboard(); };
    document.addEventListener('visibilitychange', hidden);
    this.keyboardCleanup = () => document.removeEventListener('visibilitychange', hidden);
    this.canvas.addEventListener('blur', () => { if (currentView()) cancelKeyboard(); });
    this.canvas.addEventListener('keydown', event => {
      if (!currentView() || document.hidden || this.choicePanel || this.checkpointing || this.busySaving || this.pen?.drawing || this.mode !== 'stamp') return;
      const moves = { ArrowLeft: [-.05, 0], ArrowRight: [.05, 0], ArrowUp: [0, -.05], ArrowDown: [0, .05] };
      if (event.key === 'Escape') { event.preventDefault(); cancelKeyboard(); return; }
      if (!moves[event.key] && !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      if (this.capacityStroke || state.get().draft.paper.marks.length >= POST_MAX_MARKS) { cancelKeyboard(); this.paperFull(); return; }
      if (moves[event.key]) {
        const point = this.keyboardPosition || { x: .5, y: .5 }, [dx, dy] = moves[event.key];
        this.keyboardPosition = { x: Math.max(0, Math.min(1, point.x + dx)), y: Math.max(0, Math.min(1, point.y + dy)) };
        this.showStampPreview({ ...createPostStamp(this.stamp, this.stampScale), ...this.keyboardPosition });
      } else if (!event.repeat) {
        this.stroke = { ...createPostStamp(this.stamp, this.stampScale), ...(this.keyboardPosition || {}) };
        this.finishStroke();
      }
    });
    const resize = () => { if (!currentView() || this.pen?.drawing) return; const size = fitPostPaper(area.clientWidth, area.clientHeight); paper.style.width = `${size.width}px`; paper.style.height = `${size.height}px`; };
    this.resizePaper = resize; this.paperObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize); this.paperObserver?.observe(area); resize();
    this.repaint(); this.refreshPeople(); this.refreshTools();
  },
  collectPoint(point) {
    if (!this.stroke || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect(), pt = postPoint({ x: point.x / Math.max(1, rect.width), y: point.y / Math.max(1, rect.height), p: point.p, t: point.t, v: point.v });
    if (this.stroke.kind === 'stamp') {
      // A captured finger may finish outside the paper. Keep the stamp visible
      // at the nearest paper edge rather than saving an off-paper decoration.
      const x = Math.max(0, Math.min(1, pt.x)), y = Math.max(0, Math.min(1, pt.y));
      this.stroke.x = x; this.stroke.y = y;
      this.showStampPreview(this.stroke);
      return;
    }
    this.stroke.points.push(pt);
    if (this.stroke.points.length > this.stroke.budget) this.setStatus('Your whole mark is still here. Lift your pen, then Undo this mark or Keep a recovery copy. It is too large for the album.');
    const context = this.canvas.getContext('2d'), points = this.stroke.points;
    // Paint only the newest segment while a pointer is down. Full original ink is saved at its end.
    const a = points.at(-2) || pt; context.strokeStyle = this.stroke.color; context.fillStyle = this.stroke.color; context.lineWidth = PAPER_WIDTH * this.stroke.width * (.6 + .8 * pt.p); context.lineCap = 'round';
    if (points.length === 1) { context.beginPath(); context.arc(pt.x * PAPER_WIDTH, pt.y * PAPER_HEIGHT, context.lineWidth / 2, 0, Math.PI * 2); context.fill(); }
    else { context.beginPath(); context.moveTo(a.x * PAPER_WIDTH, a.y * PAPER_HEIGHT); context.lineTo(pt.x * PAPER_WIDTH, pt.y * PAPER_HEIGHT); context.stroke(); }
  },
  showStampPreview(stamp) {
    const preview = this.stampPreview; if (!preview || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (preview.dataset.stamp !== stamp.stamp) { preview.src = ART_ROOT + stampArt(stamp.stamp); preview.dataset.stamp = stamp.stamp; }
    preview.style.left = `${stamp.x * 100}%`; preview.style.top = `${stamp.y * 100}%`;
    preview.style.width = `${stamp.size * 100}%`; preview.style.height = `${stamp.size * rect.width / Math.max(1, rect.height) * 100}%`;
    preview.hidden = false; this.updatePaperCue();
  },
  finishStroke() {
    this.keyboardPosition = null;
    if (this.stampPreview) this.stampPreview.hidden = true;
    if (this.capacityStroke) { this.paperFull(); return false; }
    if (!this.stroke) return true;
    const mark = this.stroke;
    try { state.apply({ type: 'mark', mark }); }
    catch (error) {
      if (!['post-capacity','post-paper','post-version'].includes(error?.code)) throw error;
      this.capacityStroke=mark; this.stroke=null; this.paperFull(); this.repaint(); this.refreshTools(); return false;
    }
    this.stroke = null;
    this.repaint(); this.refreshTools(); this.resizePaper?.();
    return true;
  },
  undoMark() {
    if (!this.alive || this.checkpointing || this.pen?.drawing || this.busySaving) return false;
    if (!this.capacityStroke) this.finishStroke();
    if (this.capacityStroke) { this.capacityStroke=null; this.setStatus('The newest mark was undone. Your earlier paper is still here.'); }
    else state.apply({type:'undo'});
    this.repaint(); this.refreshTools(); return true;
  },
  repaint() { if (this.canvas) { const paper=state.get().draft.paper; if (this.capacityStroke) paper.marks.push(this.capacityStroke.kind === 'stamp' ? {...this.capacityStroke,size:this.capacityStroke.size ?? .14} : this.capacityStroke); paintPostPaper(this.canvas.getContext('2d'),paper); } },
  closeChoices() {
    if (!this.choicePanel) return;
    this.choicePanel.remove(); this.choicePanel = null; this.updatePaperCue();
    this.choiceReturn?.focus?.(); this.choiceReturn = null;
  },
  openChoices(kind) {
    if (!this.alive || this.checkpointing || this.pen?.drawing || this.busySaving) return false;
    if (!this.finishStroke()) return false; this.closeChoices();
    const token = this.visit, view = this.routeView;
    this.choiceReturn = document.activeElement;
    const panel = document.createElement('section'); panel.className = 'post-choices'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', { color: 'Choose ink color', stamp: 'Choose picture stamp', 'stamp-size': 'Choose stamp size', recipient: 'Choose your friend', destination: 'Choose a place', help: 'Picture Post help', 'message-day': 'Messages that help' }[kind]);
    const sheet = document.createElement('div'); sheet.className = 'post-choice-sheet';
    const close = button('Close choices and return to your paper', '', () => { if (this.choicePanel === panel) this.closeChoices(); }, 'post-close-choices'); close.innerHTML = iconSVG('back'); close.append(postCaption('Back')); sheet.append(close);
    const choices = document.createElement('div'); choices.className = `post-choice-grid post-choice-${kind}`;
    const validChoice = () => this.alive && token === this.visit && view === this.routeView && this.choicePanel === panel && !this.checkpointing && !this.busySaving && !this.pen?.drawing;
    const choose = action => { if (!validChoice()) return; action(); this.closeChoices(); this.refreshPeople(); this.refreshTools(); };
    if (kind === 'color') POST_COLORS.forEach((color, i) => {
      const name = ['Purple', 'Rose', 'Blue', 'Green', 'Brown'][i];
      const b = button(`${name} ink`, '', () => choose(() => { this.color = color; if (this.mode === 'stamp') this.mode = 'pen'; }), 'post-color');
      b.dataset.color = color; b.style.setProperty('--ink', color);
      const swatch = document.createElement('span'); swatch.className = 'post-ink-swatch'; swatch.setAttribute('aria-hidden', 'true');
      const check = document.createElement('span'); check.className = 'post-ink-check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true'); check.hidden = true; swatch.append(check);
      const caption = document.createElement('span'); caption.className = 'post-ink-name'; caption.textContent = name;
      b.append(swatch, caption); choices.append(b);
    });
    if (kind === 'stamp') POST_STAMPS.forEach(stamp => { const b = button(`${stamp} picture stamp`, image(stampArt(stamp)), () => choose(() => { this.stamp = stamp; this.mode = 'stamp'; }), 'post-stamp'); b.dataset.stamp = stamp; choices.append(b); });
    if (kind === 'stamp') {
      const size = button('Change stamp size', '', () => { if (validChoice()) this.openChoices('stamp-size'); }, 'post-stamp-size-launcher');
      size.dataset.stampSizeLauncher = '';
      size.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="10" cy="44" r="5" fill="#a98bc5"/><circle cx="29" cy="39" r="10" fill="#a98bc5"/><circle cx="51" cy="32" r="15" fill="#a98bc5"/></svg>';
      choices.append(size);
    }
    if (kind === 'stamp-size') POST_STAMP_SIZES.forEach(size => {
      const preview = image(stampArt(this.stamp)); preview.style.width = `${size.preview}px`; preview.style.height = `${size.preview}px`;
      const b = button(`${size.label} ${this.stamp} stamp`, preview, () => choose(() => { this.stampScale = size.id; this.mode = 'stamp'; }), 'post-stamp-size');
      b.dataset.stampSize = size.id; b.setAttribute('aria-pressed', String((this.stampScale || 'medium') === size.id));
      const caption = document.createElement('span'); caption.textContent = size.label; b.append(caption); choices.append(b);
    });
    if (kind === 'recipient') POST_RECIPIENTS.forEach(person => { const b = button(`Send to ${person.name}`, portrait(person.id), () => choose(() => state.apply({ type: 'recipient', recipient: person.id })), 'post-person'); b.dataset.recipient = person.id; const caption = document.createElement('span'); caption.textContent = person.name; b.append(caption); choices.append(b); });
    if (kind === 'destination') POST_PLACES.forEach(place => { const b = button(`Deliver at ${place.name}`, placePicture(place), () => choose(() => state.apply({ type: 'destination', destination: place.id })), 'post-place-choice'); b.dataset.destination = place.id; const caption = document.createElement('span'); caption.textContent = place.name; b.append(caption); choices.append(b); });
    if (kind === 'help') {
      const demo = document.createElement('div'); demo.className = 'post-stamp-demo';
      demo.setAttribute('role', 'img'); demo.setAttribute('aria-label', 'Hold a stamp, slide it across the paper, then lift to place it.');
      demo.dataset.reducedMotion = String(!!settings.get().reducedMotion);
      const track = document.createElement('div'); track.className = 'post-stamp-demo-track'; track.setAttribute('aria-hidden', 'true');
      const guide = document.createElement('span'); guide.className = 'post-stamp-demo-guide'; guide.textContent = '→';
      const gesture = document.createElement('span'); gesture.className = 'post-stamp-demo-gesture';
      gesture.append(image(stampArt(this.stamp || 'heart')));
      const finger = document.createElement('span'); finger.className = 'post-stamp-demo-finger';
      finger.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 25V8q0-5 5-5t5 5v13q5-4 9 0 6-1 6 6l-4 14H21L9 29q-4-6 2-7l6 3Z" fill="#ffe1bd" stroke="#79563c" stroke-width="3" stroke-linejoin="round"/></svg>';
      gesture.append(finger); track.append(guide, gesture); demo.append(track);
      const caption = document.createElement('p'); caption.textContent = 'Hold · Slide · Lift'; caption.setAttribute('aria-hidden', 'true'); demo.append(caption); choices.append(demo);
      [symbol('pen'), portrait(state.get().draft.recipient), image('picture-post/envelope.png')].forEach((art, i) => { const step = document.createElement('div'); step.append(art); const caption = document.createElement('p'); caption.textContent = state.get().draft.messageDay ? ['Draw, or slide a stamp and lift', 'Choose a friend for an invitation', 'Choose a sign or invitation'][i] : ['Draw, or slide a stamp and lift', 'Choose a friend and place', 'Fold and carry your picture'][i]; step.append(caption); choices.append(step); });
    }
    sheet.append(choices); panel.append(sheet); this.root.append(panel); this.choicePanel = panel;
    panel.addEventListener('keydown', event => {
      if (this.choicePanel !== panel) return;
      if (event.key === 'Escape') { event.preventDefault(); this.closeChoices(); }
      if (event.key === 'Tab') { const buttons = [...panel.querySelectorAll('button:not(:disabled)')]; const first = buttons[0], last = buttons.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    });
    this.refreshPeople(); this.refreshTools(); close.focus(); return true;
  },
  updatePaperCue() {
    if (!this.paperCue) return;
    const paper=state.get().draft.paper;
    this.paperCue.hidden=!!(postPaperHasContent(paper) || this.stroke || this.capacityStroke || this.choicePanel || this.keyboardPosition || this.pen?.drawing || this.busySaving || this.checkpointing);
    if (!this.paperCue.hidden) {
      const stamp=this.mode==='stamp'; this.paperCue.dataset.mode=stamp?'stamp':'ink';
      this.paperCue.querySelector('.post-paper-cue-ink').hidden=stamp;
      const stampCue=this.paperCue.querySelector('.post-paper-cue-stamp'); stampCue.hidden=!stamp;
      const image=stampCue.querySelector('img'); const source=ART_ROOT+stampArt(this.stamp);
      if (image.getAttribute('src')!==source) image.src=source;
    }
  },
  refreshTools() {
    this.updatePaperCue();
    if (!this.main) return; const draft = state.get().draft;
    this.main.querySelectorAll('[data-tool]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.tool === this.mode));
      b.style.setProperty('--ink', this.color);
      const colorName = ['Purple', 'Rose', 'Blue', 'Green', 'Brown'][POST_COLORS.indexOf(this.color)] || 'Selected';
      b.setAttribute('aria-label', `${b.dataset.tool === 'brush' ? 'Wide brush' : 'Fine pen'}: ${colorName} ink`);
    });
    this.main.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === this.color)));
    this.main.querySelectorAll('[data-stamp]').forEach(b => b.setAttribute('aria-pressed', String(this.mode === 'stamp' && this.stamp === b.dataset.stamp)));
    this.choicePanel?.querySelectorAll('[data-color]').forEach(b => {
      const selected = b.dataset.color === this.color;
      b.setAttribute('aria-pressed', String(selected));
      const check = b.querySelector('.post-ink-check'); if (check) check.hidden = !selected;
    });
    this.choicePanel?.querySelectorAll('[data-stamp]').forEach(b => b.setAttribute('aria-pressed', String(this.mode === 'stamp' && this.stamp === b.dataset.stamp)));
    const palette = this.main.querySelector('[data-palette]'); if (palette) palette.style.setProperty('--ink', this.color);
    const stamps = this.main.querySelector('[data-stamp-launcher]'); if (stamps) { stamps.replaceChildren(image(stampArt(this.stamp))); stamps.setAttribute('aria-pressed', String(this.mode === 'stamp')); }
    const undo = this.main.querySelector('[data-undo]'); if (undo) undo.disabled = !draft.paper.marks.length && !this.capacityStroke;
    const keep = this.footer?.querySelector('[data-keep]'); if (keep) keep.setAttribute('aria-label',this.capacityStroke ? 'Keep a recovery copy of my whole paper and newest mark' : 'Keep an editable draft');
    const fold = this.footer?.querySelector('[data-fold]'); if (fold) fold.disabled = !!this.capacityStroke || !postPaperHasContent(draft.paper) || this.busySaving;
  },
  refreshPeople() {
    const draft = state.get().draft;
    this.main.querySelectorAll('[data-recipient]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.recipient === draft.recipient)));
    this.main.querySelectorAll('[data-destination]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.destination === draft.destination)));
    this.choicePanel?.querySelectorAll('[data-recipient]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.recipient === draft.recipient)));
    this.choicePanel?.querySelectorAll('[data-destination]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.destination === draft.destination)));
    const person = this.footer.querySelector('[data-recipient-launcher]'); if (person) { person.replaceChildren(portrait(draft.recipient),postCaption('Friend')); person.setAttribute('aria-label', `Choose friend: currently ${postRecipient(draft.recipient).name}`); }
    const destination = this.footer.querySelector('[data-destination-launcher]'); if (destination) { const place = POST_PLACES.find(p => p.id === draft.destination); destination.replaceChildren(placePicture(place),postCaption('Place')); destination.setAttribute('aria-label', `Choose place: currently ${place.name}`); }
  },
  async fold() {
    if (!this.alive || this.checkpointing || this.busySaving || this.pen?.drawing || state.get().draft.stage !== 'make') return;
    if (!this.finishStroke()) return; if (!postPaperHasContent(state.get().draft.paper) || !this.canvas) return;
    this.busySaving = true; this.refreshTools(); const token = this.visit; let failed = false;
    try {
      this.repaint(); let png = this.canvas.toDataURL('image/png');
      // Retain the whole paper at every size. Original normalized vector ink remains
      // untouched in the source document, including when a dense picture needs a smaller PNG.
      for (const width of [600, 450]) if (png.length > POST_MAX_PNG_CHARS) { const copy = document.createElement('canvas'); copy.width = width; copy.height = width / 1.5; copy.getContext('2d').drawImage(this.canvas, 0, 0, copy.width, copy.height); png = copy.toDataURL('image/png'); }
      state.apply({ type: 'fold', png }); await state.checkpointFlush();
    }
    catch { failed = true; }
    finally { if (this.alive && token === this.visit) this.busySaving = false; }
    if (!this.alive || token !== this.visit) return;
    if (state.get().draft.stage === 'folded') { this.route(); if (failed) this.setStatus('Your folded picture is still here. Device saving failed. Try leaving again to retry saving it.'); else speak(state.get().draft.messageDay?.use === 'cafe-sign' ? 'living_message_sign_ready' : 'picture_post_fold'); }
    else { this.setStatus('Your picture is still here. Undo a few marks or keep a draft before making a new message.'); this.refreshTools(); }
  },
  route() {
    if (state.get().draft.messageDay?.use === 'cafe-sign') { this.carrySign(); return; }
    if (!this.clearView()) return; const draft = state.get().draft, person = postRecipient(draft.recipient), currentStop = postCurrentStop(draft);
    const routeView = this.routeView;
    const canAct = () => this.alive && this.routeView === routeView && !this.busySaving && !this.checkpointing;
    const visit = place => { if (!canAct()) return; state.apply({ type: 'visit', place }); this.route(); };
    this.root.dataset.postPhase = 'route';
    this.setStatus(`Your picture is inside. Take it to ${person.name} at ${POST_PLACES.find(p => p.id === draft.destination).name}.`);
    const lettersFull = state.get().sent.length >= PICTURE_POST_MAX_SENT;
    if (lettersFull) this.lettersFull();
    const scene = document.createElement('section'); scene.className = 'post-route-scene';
    const place = POST_PLACES.find(p => p.id === (currentStop || draft.destination));
    scene.dataset.stop = place.id; scene.setAttribute('aria-label', `${place.name}: your picture delivery`);
    const landmark = image(place.art, place.name); landmark.className = 'post-route-landmark'; scene.append(landmark);
    const landing = document.createElement('div'); landing.className = 'post-route-landing';
    const letter = document.createElement('span'); letter.className = 'post-carried-picture';
    letter.append(image('picture-post/envelope.png', 'Envelope holding your exact picture'));
    const own = document.createElement('img'); own.src = draft.png; own.alt = 'Your original picture inside this envelope'; own.className = 'post-envelope-picture'; letter.append(own);
    if (place.id === draft.destination) {
      const recipient = document.createElement('div'); recipient.className = 'post-route-recipient'; recipient.append(portrait(draft.recipient));
      const name = document.createElement('span'); name.textContent = person.name; recipient.append(name);
      const arrived = currentStop === draft.destination;
      const send = button(arrived ? `Give your picture to ${person.name}` : `Visit ${place.name} with your picture`, letter,
        () => { if (!canAct()) return; if (arrived) void this.deliver(); else visit(place.id); }, 'post-primary post-delivery-target');
      send.dataset.deliveryTarget = arrived ? 'give' : 'visit';
      const label = document.createElement('span'); label.className = 'post-delivery-caption'; label.textContent = arrived ? `Give to ${person.name}` : 'Take my picture'; send.append(label);
      send.disabled = this.busySaving || (arrived && (!postCanDeliver(draft) || lettersFull));
      landing.append(send, recipient);
    } else { letter.classList.add('post-letter-at-stop'); landing.append(letter); }
    scene.append(landing);
    const places = document.createElement('div'); places.className = 'post-route'; places.setAttribute('aria-label', 'Choose the places along your delivery route');
    POST_PLACES.forEach(place => {
      const b = button(`Visit ${place.name}`, placePicture(place), () => visit(place.id), 'post-route-stop'); b.dataset.place = place.id;
      b.classList.toggle('is-destination', place.id === draft.destination); const name = document.createElement('span'); name.textContent = place.name; b.append(name);
      const index = draft.stops.lastIndexOf(place.id); if (index >= 0) { const step = document.createElement('span'); step.className = 'post-route-order'; step.textContent = String(index + 1); b.append(step); }
      if (place.id === draft.destination) b.append(portrait(draft.recipient)); places.append(b);
      if (place.id === currentStop) { b.classList.add('is-current'); b.setAttribute('aria-current', 'location'); }
    });
    const sequence = document.createElement('div'); sequence.className = 'post-route-sequence'; sequence.textContent = draft.stops.length ? draft.stops.map(id => POST_PLACES.find(p => p.id === id).name).join(' → ') : 'Tap a place to carry your envelope there.';
    this.main.append(scene, places, sequence);
    this.footer.append(button('Unfold and change your picture', symbol('undo'), () => { if (!canAct()) return; state.apply({ type: 'unfold' }); this.make(); }));
  },
  carrySign() {
    if (!this.clearView()) return; const draft = state.get().draft, token = this.visit, view = this.routeView;
    const current = () => this.alive && token === this.visit && view === this.routeView && !this.checkpointing && !this.busySaving;
    this.root.dataset.postPhase = 'sign'; this.setStatus('Your whole sign is ready. Bring it to our café, or change it first.');
    const paper = document.createElement('img'); paper.src = draft.png; paper.alt = 'Your whole message ready to become the café sign'; paper.className = 'post-sign-paper'; this.main.append(paper);
    const cafe = button('Bring my sign to our café', image('picture-post/picnic-stop-v2.png'), () => { if (current()) void router.go('picnic', { messageForCafe: picturePostSource(state.get().draft) }); }, 'post-primary post-day-choice');
    const caption = document.createElement('span'); caption.textContent = 'Our café'; cafe.append(caption);
    const change = button('Unfold and change my sign', symbol('pen'), () => { if (current()) { state.apply({ type: 'unfold' }); this.make(); } }, 'post-day-choice');
    const changeCaption = document.createElement('span'); changeCaption.textContent = 'Change sign'; change.append(changeCaption);
    this.footer.append(change, cafe);
  },
  async deliver() {
    if (!this.alive || this.checkpointing || this.busySaving) return; const token = this.visit, message = state.deliver(); if (!message) { if (state.get().sent.length >= PICTURE_POST_MAX_SENT) this.lettersFull(); return; }
    this.busySaving = true; [...this.main.querySelectorAll('button'), ...this.footer.querySelectorAll('button')].forEach(b => b.disabled = true);
    let failed = false;
    try { await state.checkpointFlush(); }
    catch { failed = true; }
    finally { if (this.alive && token === this.visit) this.busySaving = false; }
    if (!this.alive || token !== this.visit) return;
    this.received(message.id);
    if (failed) this.setStatus('Your exact message is still here. Device saving failed. Try leaving again to retry, or ask a grown-up for help.');
    else if (!db.status().persistent) this.setStatus('Your exact message is here for now. Storage is temporary; ask a grown-up to save a backup before closing the game.');
    speak('picture_post_delivered'); if (!failed) bus.emit('creation:saved', { kind: 'picture-post', id: message.id, situation: message.situation, recipient: message.recipient });
  },
  received(messageId) {
    if (!this.clearView()) return; const message = state.get().sent.find(m => m.id === messageId); if (!message) { this.album(); return; }
    this.root.dataset.postPhase = message.opened && ['grandparents', 'village'].includes(message.destination) ? 'home-open' : 'received';
    state.select(message.id); const person = postRecipient(message.recipient);
    this.setStatus(message.opened ? `${person.name} has your exact picture. Here is a picture reply.` : `${person.name} has your envelope. Tap it to open the picture together.`);
    const arrival = document.createElement('div'); arrival.className = 'post-arrival'; const recipient = document.createElement('div'); recipient.className = 'post-arrival-person'; recipient.append(portrait(message.recipient));
    const label = document.createElement('span'); label.textContent = person.name; recipient.append(label);
    const envelope = button(`Open your own message with ${person.name}`, image('picture-post/envelope.png', ''), () => { state.open(message.id); this.received(message.id); speak('picture_post_reply'); }, 'post-open-envelope');
    const exact = document.createElement('img'); exact.src = message.png; exact.alt = 'The exact original picture you delivered'; exact.className = 'post-original-picture';
    envelope.append(exact); arrival.append(recipient, envelope); this.main.append(arrival);
    if (message.opened) {
      envelope.classList.add('is-open');
      const reply = document.createElement('div'); reply.className = 'post-reply'; const caption = document.createElement('p'); caption.textContent = `${person.name} sends you this picture`; reply.append(caption);
      const replyPaper = document.createElement('div'); replyPaper.className = 'post-reply-paper'; message.reply.forEach(stamp => replyPaper.append(image(stampArt(stamp), stamp))); reply.append(replyPaper); this.main.append(reply);
      if (message.destination === 'grandparents' || message.destination === 'village') {
        const place = POST_PLACES.find(p => p.id === message.destination);
        const display = document.createElement('div'); display.className = 'post-home-display'; display.setAttribute('aria-label', `Your picture displayed at ${place.name}`);
        const room = image('picture-post/home-room-v1.png', 'An imaginary family room with a picture frame'); room.className = 'post-room';
        const hanging = document.createElement('img'); hanging.src = message.png; hanging.alt = 'Your own exact picture hanging on the wall'; hanging.className = 'post-wall-picture';
        const friend = portrait(message.recipient); friend.className = 'post-room-person'; display.append(room, hanging, friend); this.main.prepend(display);
        arrival.classList.add('post-home-original');
        const resizeRoom = () => {
          if (!this.alive) return;
          const landscape = window.matchMedia('(max-height:440px) and (orientation:landscape)').matches;
          const size = fitPostPaper(Math.max(0, this.main.clientWidth - (landscape ? 144 : 6)) + 10, Math.max(0, this.main.clientHeight - (landscape ? 6 : 92)) + 10);
          display.style.width = `${size.inkWidth}px`; display.style.height = `${size.inkHeight}px`;
        };
        this.resizePaper = resizeRoom; this.paperObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resizeRoom); this.paperObserver?.observe(this.main); resizeRoom();
      }
    }
    this.footer.append(button('Make a new version. Your friend keeps the original.', symbol('pen'), () => this.editPaper(() => state.reopen(message.id))), button('Keep this letter in your album', symbol('album'), () => this.album()), button('Make another picture message', image('picture-post/envelope.png'), () => this.startPaper(), 'post-primary post-new-picture'));
    if (message.opened && message.destination === 'picnic' && router.registered().includes('picnic')) {
      const token = this.visit, view = this.routeView;
      const authored = !!message.messageDay;
      const play = button(`Take your invitation and ${person.name} to ${authored ? 'our café' : 'the picnic'}`, image('picture-post/picnic-stop-v2.png'), () => { if (this.alive && token === this.visit && view === this.routeView && !this.checkpointing && !this.busySaving) void router.go('picnic', authored ? { messageForCafe: picturePostSource(message) } : { invitation: picturePostSource(message) }); }, 'post-primary post-picnic-link');
      const caption = document.createElement('span'); caption.textContent = authored ? 'Our café' : 'Our picnic'; play.append(caption); this.footer.prepend(play);
    }
    this.resizePaper?.();
  },
  album(page = 0) {
    if (this.pen?.drawing || this.busySaving) return;
    if (!this.clearView()) return; const snapshot = state.get(); this.setStatus('Your drafts can change. Your friends keep the pictures you already sent.');
    const wall = document.createElement('div'); wall.className = 'post-album';
    const current = button('Return to your current message', snapshot.draft.stage === 'folded' ? '✉ Continue delivery' : snapshot.draft.stage === 'delivered' ? '✉ Latest letter' : '✎ Continue this picture', () => { const draft = state.get().draft; if (draft.stage === 'folded') this.route(); else if (draft.stage === 'delivered') this.received(`${draft.id}:${draft.revision}`); else this.make(); }, 'post-album-current'); wall.append(current);
    const { pages, index, items } = postAlbumPage(snapshot, page);
    for (const { draft, message } of items) {
      if (draft) { const preview = document.createElement('canvas'); preview.width = 270; preview.height = 180; paintPostPaper(preview.getContext('2d'), draft.paper); const b = button(`Edit draft for ${postRecipient(draft.recipient).name}`, preview, () => this.editPaper(() => state.reopenDraft(draft.id)), 'post-album-card'); const label = document.createElement('span'); label.textContent = `Draft for ${postRecipient(draft.recipient).name}`; b.append(label); wall.append(b); }
      else { const img = document.createElement('img'); img.src = message.png; img.alt = ''; const b = button(`Open sent picture for ${postRecipient(message.recipient).name}`, img, () => this.received(message.id), 'post-album-card'); const label = document.createElement('span'); label.textContent = `For ${postRecipient(message.recipient).name}`; b.append(label, portrait(message.recipient)); if (message.opened) { const mark = document.createElement('span'); mark.className = 'post-reply-keepsake'; mark.append(image(stampArt(message.reply[0]), 'Picture reply kept here')); b.append(mark); } wall.append(b); }
    }
    if (pages > 1) { const nav = document.createElement('nav'); nav.className = 'post-album-pages'; nav.setAttribute('aria-label', `Letter album page ${index + 1} of ${pages}`); const before = button('Previous letters page', '‹', () => this.album(index - 1)); before.disabled = index === 0; const after = button('More saved letters', '›', () => this.album(index + 1)); after.disabled = index === pages - 1; nav.append(before, after); wall.append(nav); }
    this.main.append(wall); this.footer.append(button('Make a new picture message', '＋ New picture', () => this.startPaper(), 'post-primary'));
  },
  leave(route) { if (!this.alive || this.checkpointing) return false; return router.go(route); },
  breakBusy() { return !!(this.busySaving || this.pen?.drawing || this.stroke || this.checkpointing); },
  busy() { return this.breakBusy(); },
  beforeLeave() { return this.checkpoint(); },
  beforeBreak() { return this.checkpoint(); },
  checkpoint() {
    if (!this.alive) return Promise.resolve(false);
    if (this.capacityStroke) { this.paperFull(); return Promise.resolve(false); }
    if (this.checkpointPromise) return this.checkpointPromise;
    if (this.busySaving || this.pen?.drawing || this.stroke) {
      this.setStatus(this.busySaving ? 'Your picture is still being prepared. Try again when it is ready.' : 'Finish your mark, then try again. Your paper is still here.');
      return Promise.resolve(false);
    }
    if (this.initialOpenPending) return Promise.resolve(true);
    const token = this.visit; this.checkpointing = true; this.setStatus('');
    const pending = checkpointLivingScene({ flush: () => state.checkpointFlush(), retry: () => state.retry(), storage: () => db.status(),
      alive: () => this.alive && token === this.visit, held: () => this.busySaving || !!this.pen?.drawing || !!this.stroke,
      report: message => { if (this.alive && token === this.visit) this.setStatus(message); }, subject: 'Your current picture and letters' });
    this.checkpointPromise = pending.finally(() => { if (this.alive && token === this.visit) { this.checkpointing = false; this.checkpointPromise = null; } });
    return this.checkpointPromise;
  },
  unmount() { this.idleHelp?.();this.idleHelp=null;this.keyboardCleanup?.(); this.keyboardCleanup = null; this.closeChoices(); this.paperObserver?.disconnect(); window.removeEventListener('resize', this.layoutResize); this.resizePaper = null; this.finishStroke(); this.alive = false; this.ready = false; this.initialOpenPending = false; this.openingPost = false; this.visit = ++visitSerial; this.pen?.destroy(); this.pen = null; this.canvas = null; this.stampPreview = null; this.paperCue = null; this.mute?.destroy?.(); this.offSettings?.(); speech.cancel(); void state.flush().catch(() => {}); this.root = null; },
};
export default screen;
