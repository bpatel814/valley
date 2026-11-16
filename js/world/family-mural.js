// family-mural.js - a local, score-free pass-the-pen family mural.

import * as db from "../state/db.js";
import * as session from "../state/session.js";
import settings from "../state/settings.js";
import art from "./art.js";
import { glyphSVG } from "./characters.js";
import PenInput from "../engine/pen.js";
import speech from "../audio/speech.js";
import sfx from "../audio/sfx.js";
import { openShowAndTell } from "./show-and-tell.js";
import { recoveryAction } from "./router.js";

export const MURAL_KEY = "family_mural_draft";
export const MURAL_SIZE = { width: 768, height: 512 };
export const MURAL_INPUT_CAPACITY = Object.freeze({ strokes: 80, points: 1200, turns: 24 });
let muralWriteTail = Promise.resolve();

function enqueueMuralWrite(work) {
  const next = muralWriteTail.then(work, work);
  muralWriteTail = next.catch(() => undefined);
  return next;
}

export function flushMuralWrites() { return muralWriteTail; }

/** Fit the actual upright board to its available grid cell, including short
 * portrait space and browsers without CSS aspect-ratio or container queries. */
export function fitMuralPaper(width, height) {
  const w = Math.max(0, Number(width) || 0), h = Math.max(0, Number(height) || 0);
  const paperWidth = Math.min(w, h * MURAL_SIZE.width / MURAL_SIZE.height);
  return { width: paperWidth, height: paperWidth * MURAL_SIZE.height / MURAL_SIZE.width };
}

export const MURAL_PROMPTS = [
  { id: "garden", arts: ["stickers/draw_flower", "stickers/draw_flower", "stickers/draw_flower"], phrase: "family_mural_garden" },
  { id: "rainbow-home", arts: ["stickers/draw_rainbow", "stickers/draw_house"], phrase: "family_mural_rainbow_home" },
  { id: "heart", arts: ["stickers/draw_heart"], phrase: "family_mural_heart" },
  { id: "blank", arts: [], phrase: "family_mural_blank" },
];

const ROSTER = [
  { id: "mama", name: "Mama", art: "characters/family_adult1_idle", color: "#ef5b8c" },
  { id: "daddy", name: "Daddy", art: "characters/family_adult2_idle", color: "#397fc2" },
  { id: "grandma", name: "Ba", art: "characters/family_grandma_idle", color: "#9b5ac6" },
  { id: "grandpa", name: "Dada", art: "characters/family_grandpa_idle", color: "#e07a3f" },
  { id: "veer", name: "Veer", art: "characters/veer_idle", color: "#25a788" },
  { id: "ishan", name: "Ishan", art: "characters/family_ishan_idle", color: "#7868d8", optional: true },
  { id: "veer-mom", name: "Veer's mom", art: "characters/family_veer_mom_idle", color: "#dd6a98", optional: true },
  { id: "veer-dad", name: "Veer's dad", art: "characters/family_veer_dad_idle", color: "#348a8a", optional: true },
];

export function familyRoster(hasArt = (key) => art.has(key), profile = settings.get().valleyProfile) {
  const roster = profile === "veer"
    ? [ROSTER.find((person) => person.id === "veer-dad"), ...ROSTER.filter((person) => !["veer", "veer-dad"].includes(person.id)), personById("rayna", profile)]
    : ROSTER;
  return roster.filter((person) => !person.optional || hasArt(person.art))
    .map((person) => personById(person.id, profile));
}

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const clone = (value) => JSON.parse(JSON.stringify(value));

export function normaliseStrokes(strokes, width, height) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  return (Array.isArray(strokes) ? strokes : []).map((stroke) =>
    (Array.isArray(stroke) ? stroke : []).map((point) => ({
      x: clamp01(Number(point && point.x) / w),
      y: clamp01(Number(point && point.y) / h),
      p: clamp01(point && point.p == null ? 0.5 : point.p),
    })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  ).filter((stroke) => stroke.length);
}

export function denormaliseStrokes(strokes, width, height) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  return (Array.isArray(strokes) ? strokes : []).map((stroke) =>
    (Array.isArray(stroke) ? stroke : []).map((point) => ({
      x: clamp01(point && point.x) * w,
      y: clamp01(point && point.y) * h,
      p: clamp01(point && point.p == null ? 0.5 : point.p),
    })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  ).filter((stroke) => stroke.length);
}

/** Upright 3:2 paper fitted uniformly inside any display box. */
export function paperViewport(width, height) {
  const boxWidth=Math.max(1,Number(width)||1),boxHeight=Math.max(1,Number(height)||1);
  const scale=Math.min(boxWidth/MURAL_SIZE.width,boxHeight/MURAL_SIZE.height);
  const paperWidth=MURAL_SIZE.width*scale,paperHeight=MURAL_SIZE.height*scale;
  return { left:(boxWidth-paperWidth)/2,top:(boxHeight-paperHeight)/2,width:paperWidth,height:paperHeight,scale };
}

/** Map PenInput's display-box point into stable upright 768x512 paper space.
 * Points in a possible letterbox margin clamp to the nearest paper edge. */
export function displayPointToNormal(point, width, height) {
  const fit=paperViewport(width,height);
  const x=clamp01((Number(point&&point.x)-fit.left)/fit.width),y=clamp01((Number(point&&point.y)-fit.top)/fit.height);
  const pressure=clamp01(point && point.p != null ? point.p : .5);
  return { x, y, p:pressure };
}

/** Inverse mapping, exported for geometry regression tests and visual measurement. */
export function normalPointToDisplay(point, width, height) {
  const fit=paperViewport(width,height),x=clamp01(point&&point.x),y=clamp01(point&&point.y);
  const pressure=clamp01(point && point.p != null ? point.p : .5);
  return { x:fit.left+x*fit.width, y:fit.top+y*fit.height, p:pressure };
}

function safePerson(id) {
  if (id === "rayna") return "rayna";
  return ROSTER.some((person) => person.id === id) ? id : null;
}

export function normaliseDraft(raw) {
  if (!raw || typeof raw !== "object") return null;
  const partner = safePerson(raw.partner);
  const child = raw.child === "veer" ? "veer" : "rayna";
  const prompt = MURAL_PROMPTS.some((p) => p.id === raw.prompt) ? raw.prompt : null;
  if (!partner || partner === child || !prompt) return null;
  const turns = (Array.isArray(raw.turns) ? raw.turns : []).slice(0, 24).map((turn) => ({
    person: safePerson(turn && turn.person) || child,
    color: /^#[0-9a-f]{6}$/i.test(String(turn && turn.color || "")) ? turn.color : "#d94c78",
    mode: turn && turn.mode === "name" ? "name" : "draw",
    strokes: (Array.isArray(turn && turn.strokes) ? turn.strokes : []).slice(0, 80).map((stroke) =>
      (Array.isArray(stroke) ? stroke : []).slice(0, 1200).map((point) => ({
        x: clamp01(point && point.x), y: clamp01(point && point.y), p: clamp01(point && point.p == null ? 0.5 : point.p),
      }))
    ),
  }));
  return {
    v: 1,
    child,
    partner,
    prompt,
    phase: ["drawing", "handoff", "choice", "saved"].includes(raw.phase) ? raw.phase : "drawing",
    turns: turns.length ? turns : [{ person: child, color: personById(child).color, mode: "draw", strokes: [] }],
    nameRibbon: typeof raw.nameRibbon === "string" ? raw.nameRibbon.slice(0, 16) : null,
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export async function loadMuralDraft({ io = db } = {}) {
  await muralWriteTail;
  const raw = await (io.getStrict || io.get)("kv", MURAL_KEY);
  if (raw == null) return null;
  const clean = normaliseDraft(raw);
  const invalid = () => Object.assign(new Error('This family picture needs a newer or repaired page. It was kept.'), {code:'mural-invalid'});
  if (!clean || (raw.v != null && raw.v !== 1) || (raw.turns != null && !Array.isArray(raw.turns))) throw invalid();
  if (raw.turns?.length && (raw.turns.length !== clean.turns.length || raw.turns.some((turn,index) => {
    const normalized = clean.turns[index];
    if (!turn || !normalized || (turn.strokes != null && (!Array.isArray(turn.strokes) || turn.strokes.length !== normalized.strokes.length))) return true;
    return (turn.strokes || []).some((stroke,j) => !Array.isArray(stroke) || stroke.length !== normalized.strokes[j]?.length ||
      stroke.some((point,k) => !point || point.x !== normalized.strokes[j][k].x || point.y !== normalized.strokes[j][k].y || (point.p != null && point.p !== normalized.strokes[j][k].p)));
  }))) throw invalid();
  return clean;
}

export function saveMuralDraft(draft) {
  const clean = normaliseDraft(draft);
  if (!clean) return Promise.resolve(null);
  clean.updatedAt = Date.now();
  return enqueueMuralWrite(async () => { await db.put("kv", MURAL_KEY, clean); return clean; });
}

export function clearMuralDraft() {
  return enqueueMuralWrite(() => db.del("kv", MURAL_KEY));
}

export function saveMuralRecord(draft, png, at = Date.now()) {
  const clean = normaliseDraft(draft);
  if (!clean || typeof png !== "string" || !png.startsWith("data:image/png")) return Promise.resolve(null);
  const day = session.today(at);
  const key = `${day}_family-mural_${at}`;
  const row = {
    id: "family-mural", day, png, at, kind: "family-mural", prompt: clean.prompt,
    strokes: clean.turns.flatMap((turn) => turn.strokes),
    turns: clean.turns.map((turn) => ({ person: turn.person, color: turn.color, mode: turn.mode, strokes: turn.strokes })),
    nameRibbon: clean.nameRibbon || null,
  };
  return enqueueMuralWrite(async () => {
    await db.put("gallery", key, row);
    await db.del("kv", MURAL_KEY);
    return { ...row, key };
  });
}

export function personById(id, profile = settings.get().valleyProfile) {
  if (id === "rayna") return { id: "rayna", name: "Rayna", art: "characters/family_child1_idle", color: "#d94c78" };
  const person = { ...(ROSTER.find((person) => person.id === id) || ROSTER[0]) };
  // IDs identify people across both views, never their changing relationship.
  if (profile === "veer" && person.id === "daddy") person.name = "Masa";
  if (profile === "veer" && person.id === "veer-dad") person.name = "Daddy";
  return person;
}

function portrait(person) {
  const wrap = document.createElement("span");
  wrap.className = "mural-portrait";
  const source = art.get(person.art);
  if (source) {
    const image = source.cloneNode();
    image.alt = "";
    image.draggable = false;
    wrap.appendChild(image);
  } else {
    wrap.innerHTML = muralIcon("heart");
  }
  return wrap;
}

function muralIcon(name) {
  const common='fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
  const paths={
    heart:'<path d="M32 54 10 33C-1 16 20 4 32 20 44 4 65 16 54 33Z" fill="#f38aaa"/>',
    pencil:'<path d="M8 50 13 36 40 9l12 12-27 27Z" fill="#ff9b70"/><path d="m13 36 12 12-17 2Z" fill="#ffe082"/>',
    pass:'<path d="M14 40V22c0-6 8-6 8 0v9-16c0-6 8-6 8 0v15-12c0-6 8-6 8 0v14-8c0-6 8-6 8 0v16c0 12-9 19-20 19S10 50 10 43Z" fill="#ffd7b5"/>',
    undo:'<path d="M15 19v15H1M15 21a22 22 0 1 1-3 29"/>',
    check:'<path d="m10 34 14 14 31-35"/>',
    swap:'<path d="M9 20h40l-9-9m15 33H15l9 9"/>',
    name:'<path d="M9 49 22 13l13 36M14 35h16M39 14h16M47 14v35M39 49h16"/>',
    plus:'<path d="M32 13v38M13 32h38"/>',
    talk:'<path d="M10 13h44v32H31L18 55V45h-8Z" fill="#fff2b8"/><circle cx="24" cy="29" r="3" fill="currentColor" stroke="none"/><circle cx="32" cy="29" r="3" fill="currentColor" stroke="none"/><circle cx="40" cy="29" r="3" fill="currentColor" stroke="none"/>',
    lift:'<path d="m10 47 5-14 20-20 12 12-20 20Z" fill="#ffd3ab"/><path d="M50 35V8m-9 9 9-9 9 9" stroke="#397fc2"/><path d="M8 57h30"/>',
  };
  return `<svg viewBox="0 0 64 64" ${common} aria-hidden="true">${paths[name]||paths.pencil}</svg>`;
}

function promptPicture(prompt) {
  const wrap=document.createElement("span");wrap.className="mural-prompt-art";
  if(!prompt.arts.length){wrap.innerHTML=muralIcon("pencil");return wrap;}
  prompt.arts.forEach((key,i)=>{const source=art.get(key);if(source){const image=source.cloneNode();image.alt="";image.draggable=false;image.style.setProperty("--piece",String(i));wrap.appendChild(image);}});
  if(!wrap.childElementCount)wrap.innerHTML=muralIcon(prompt.id==="heart"?"heart":"pencil");
  return wrap;
}

function makeButton(cls, label, contents, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = cls + " tap";
  button.setAttribute("aria-label", label);
  if (typeof contents === "string") button.innerHTML = contents;
  else if (contents) button.appendChild(contents);
  button.addEventListener("click", action);
  return button;
}

function paintPrompt(ctx, prompt, width, height) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, prompt === "blank" ? "#fffdf7" : "#dff5ff");
  sky.addColorStop(1, "#fff9dc");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  const sx = width / 768, sy = height / 512;
  ctx.scale(sx, sy);
  if (prompt === "garden") {
    ctx.fillStyle = "#bde9a9"; ctx.beginPath(); ctx.moveTo(0, 390); ctx.quadraticCurveTo(180, 330, 360, 390); ctx.quadraticCurveTo(570, 450, 768, 370); ctx.lineTo(768, 512); ctx.lineTo(0, 512); ctx.fill();
    [[115,"#ff7aa8"],[260,"#ffce54"],[525,"#9a7bdb"],[655,"#ff8b62"]].forEach(([x,c],i) => { ctx.strokeStyle="#49885a";ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(x,470);ctx.lineTo(x,382-i*7);ctx.stroke();ctx.fillStyle=c;for(let a=0;a<6;a++){ctx.beginPath();ctx.ellipse(x+Math.cos(a*Math.PI/3)*22,382-i*7+Math.sin(a*Math.PI/3)*22,17,11,a*Math.PI/3,0,Math.PI*2);ctx.fill();}ctx.fillStyle="#7d5a35";ctx.beginPath();ctx.arc(x,382-i*7,12,0,Math.PI*2);ctx.fill();});
  } else if (prompt === "rainbow-home") {
    const colors=["#ef6689","#ff9e52","#f3d65a","#65c38b","#5fa8df","#9874cf"];
    colors.forEach((c,i)=>{ctx.strokeStyle=c;ctx.lineWidth=18;ctx.beginPath();ctx.arc(384,368,245-i*20,Math.PI,0);ctx.stroke();});
    ctx.fillStyle="#ffd89c";ctx.strokeStyle="#795b52";ctx.lineWidth=7;ctx.fillRect(272,292,224,165);ctx.strokeRect(272,292,224,165);ctx.fillStyle="#ef788f";ctx.beginPath();ctx.moveTo(240,300);ctx.lineTo(384,190);ctx.lineTo(528,300);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle="#9d735b";ctx.fillRect(350,365,68,92);
  } else if (prompt === "heart") {
    ctx.fillStyle="#ffd8e5";ctx.strokeStyle="#ef83a3";ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(384,445);ctx.bezierCurveTo(300,365,145,278,180,160);ctx.bezierCurveTo(205,76,330,96,384,183);ctx.bezierCurveTo(438,96,563,76,588,160);ctx.bezierCurveTo(623,278,468,365,384,445);ctx.fill();ctx.stroke();
  } else {
    ctx.fillStyle="#ffe27a";[[80,80],[680,95],[115,420],[650,400]].forEach(([x,y])=>{ctx.beginPath();for(let i=0;i<10;i++){const r=i%2?10:25,a=-Math.PI/2+i*Math.PI/5;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();});
  }
  ctx.restore();
}

function paintStroke(ctx, stroke, color, width, height) {
  if (!stroke.length) return;
  const pts = denormaliseStrokes([stroke], width, height)[0];
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
  for (let i=1;i<pts.length;i++) { const a=pts[i-1],b=pts[i]; ctx.lineWidth=7+7*((a.p+b.p)/2);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke(); }
  ctx.restore();
}

function paintNameGuide(ctx, name, width, height) {
  if (!name || typeof Path2D === "undefined") return;
  const chars = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8).split("");
  if (!chars.length) return;
  const cell = Math.min(86, (width - 50) / chars.length), total = cell * chars.length;
  ctx.save();ctx.translate((width-total)/2,height*0.72);ctx.strokeStyle="#725d77";ctx.globalAlpha=.18;ctx.lineWidth=7;ctx.setLineDash([9,9]);
  const holder=document.createElement("div");
  chars.forEach((ch,i)=>{holder.innerHTML=glyphSVG(ch,"#725d77");const paths=holder.querySelectorAll("path");paths.forEach((node)=>{try{const p=new Path2D(node.getAttribute("d"));ctx.save();ctx.translate(i*cell,0);ctx.scale(cell/100,cell/100);ctx.stroke(p);ctx.restore();}catch(_){}});});
  ctx.restore();
}

export function renderMural(canvas, draft, liveStroke = null) {
  const ctx = canvas && canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;
  const width=canvas.width,height=canvas.height;
  paintPrompt(ctx,draft.prompt,width,height);
  for (const turn of draft.turns) for (const stroke of turn.strokes) paintStroke(ctx,stroke,turn.color,width,height);
  const current=draft.turns[draft.turns.length-1];
  if (liveStroke && liveStroke.length && current) paintStroke(ctx,liveStroke,current.color,width,height);
  if (current && current.mode === "name") paintNameGuide(ctx,draft.nameRibbon,width,height);
}

export class FamilyMural {
  constructor(host, { onSaved = () => {}, onBusy = () => {}, readDraft = loadMuralDraft, writeDraft = saveMuralDraft } = {}) {
    this.host=host;this.onSaved=onSaved;this.onBusy=onBusy;this.readDraft=readDraft;this.writeDraft=writeDraft;this.draft=null;this.pen=null;this.canvas=null;this.live=[];this.disposed=false;this.saving=false;this.rosterPage=0;this.resizeObserver=null;this.showTell=null;
  }

  busy() {
    const promptBusy=!!(this.showTell && this.showTell.busy());
    return !!(this.saving || this.clearing || this.checkpointing || (this.pen && this.pen.drawing) || this.showTell || promptBusy);
  }
  setBusy(value) { this.onBusy(!!value); }

  async mount() {
    if (this.disposed || this.opening) return;
    this.opening = true;
    try {
      const saved=await this.readDraft(); if(this.disposed)return;
      this.draft=saved; this.render();
    } catch {
      if (this.disposed) return;
      this.host.replaceChildren(); this.host.className = "family-page mural-page";
      const recovery = document.createElement("section"); recovery.className = "mural-load-recovery"; recovery.setAttribute("role", "status");
      const message = document.createElement("p"); message.textContent = "Your family picture could not open. Try again, or go back to the scrapbook.";
      const retry = recoveryAction("replay", "Try again", () => { void this.mount(); }); retry.classList.add("mural-load-retry");
      recovery.append(message, retry); this.host.append(recovery);
    } finally { this.opening = false; }
  }

  destroy() {
    this.resetSurface();this.disposed=true;
    this.showTell&&this.showTell.destroy();this.showTell=null;
    this.setBusy(false);speech.cancel();
  }

  resetSurface() {
    this.settleInput(false);
    this.disconnectPen();
    this.resizeObserver&&this.resizeObserver.disconnect();this.resizeObserver=null;
    if(this.resizeFallback)window.removeEventListener("resize",this.resizeFallback);
    if(this.resizeFallback)window.visualViewport?.removeEventListener("resize",this.resizeFallback);
    this.resizeFallback=null;this.canvas=null;this.board=null;this.studio=null;
    this.capacityCue=null;this.capacitySurface=null;this.capacityIcon=null;this.capacityLabel=null;this.capacityKeep=null;
  }

  async persist() {
    if(this.disposed||this.saving||!this.draft||this.draft.phase==="saved")return true;
    let operation;
    try {
      operation=Promise.resolve(this.writeDraft(clone(this.draft))); this.pendingDraft=operation;
      const saved=await operation;
      if(!saved) throw new Error('drawing was not saved');
      if(!this.disposed && this.pendingDraft===operation){this.saveProblem=false;this.host.querySelector('.mural-save-recovery')?.remove();}
      return true;
    } catch {
      if(!this.disposed && (!operation || this.pendingDraft===operation)){this.saveProblem=true;this.showSaveRecovery();}
      return false;
    }
  }

  showSaveRecovery() {
    if(this.disposed || !this.host) return;
    this.host.querySelector('.mural-save-recovery')?.remove();
    const notice=document.createElement('section');notice.className='mural-save-recovery';notice.setAttribute('role','status');
    const message=document.createElement('p');message.textContent='Your drawing is still here. Saving did not finish. Try again or ask a grown-up for help.';
    const retry=recoveryAction('replay','Try again',()=>{void this.retrySave();});notice.append(message,retry);this.host.append(notice);
  }

  async retrySave() {
    if(this.disposed||this.checkpointing||this.busy())return false;
    this.checkpointing=true;
    try { return await this.persist(); } finally {this.checkpointing=false;}
  }

  async beforeLeave() {
    if(this.disposed) return false;
    // An opening read owns no editable paper; leaving retires its result.
    if(this.opening) return !this.draft;
    if(this.busy()) return false;
    if(!this.draft || this.draft.phase==='saved') return true;
    this.checkpointing=true;
    try { const saved=await this.persist(); return !this.disposed && saved; }
    finally { this.checkpointing=false; }
  }

  editingBlocked() { return this.disposed || this.saving || this.clearing || this.checkpointing || !!this.pen?.drawing || !!this.showTell; }

  connectPen(canvas, turn) {
    if(this.pen||this.disposed)return;
    const paperPoint=(p)=>{const r=canvas.getBoundingClientRect();return displayPointToNormal(p,r.width,r.height);};
    this.pen=new PenInput(canvas,{
      allowFinger:!settings.get().penOnly,
      onStrokeStart:(p)=>{
        if(this.disposed||this.saving||this.draft?.phase!=="drawing")return;
        if(turn.strokes.length>=MURAL_INPUT_CAPACITY.strokes){this.updateDrawingTools();return;}
        this.liveTurn=turn;this.live=[paperPoint(p)];this.setBusy(true);this.updateDrawingTools();
        renderMural(canvas,this.draft,this.live);
      },
      onStrokeMove:(p)=>{
        if(!this.liveTurn){if(this.pen?.points.length>1)this.pen.points.length=1;return;}
        if(this.live.length>=MURAL_INPUT_CAPACITY.points){if(this.pen?.points.length>MURAL_INPUT_CAPACITY.points)this.pen.points.length=MURAL_INPUT_CAPACITY.points;return;}
        this.live.push(paperPoint(p));renderMural(canvas,this.draft,this.live);
        if(this.live.length===MURAL_INPUT_CAPACITY.points)this.updateCapacityCue();
      },
      // Samples are normalised when they arrive. Re-mapping all raw display
      // points at release would change earlier ink after a rotation or resize.
      onStrokeEnd:(_points,info)=>this.endStroke(info),
    });
    this.captureLost=(event)=>{if(this.pen?.drawing&&this.pen.activeId===event.pointerId)this.settleInput();};
    this.interruptInput=()=>this.settleInput();
    this.visibilityInput=()=>{if(document.hidden)this.settleInput();};
    canvas.addEventListener("lostpointercapture",this.captureLost);
    window.addEventListener("pointerup",this.captureLost);
    window.addEventListener("pointercancel",this.captureLost);
    window.addEventListener("blur",this.interruptInput);
    window.addEventListener("pagehide",this.interruptInput);
    document.addEventListener("visibilitychange",this.visibilityInput);
  }

  disconnectPen() {
    this.canvas?.removeEventListener("lostpointercapture",this.captureLost);
    if(typeof window!=="undefined"){
      window.removeEventListener("pointerup",this.captureLost);
      window.removeEventListener("pointercancel",this.captureLost);
      window.removeEventListener("blur",this.interruptInput);
      window.removeEventListener("pagehide",this.interruptInput);
    }
    if(typeof document!=="undefined")document.removeEventListener("visibilitychange",this.visibilityInput);
    const pointerId=this.pen?.activeId;this.pen?.destroy();this.pen=null;
    if(pointerId!=null){try{this.canvas?.releasePointerCapture(pointerId);}catch{/* capture already ended */}}
  }

  settleInput(reconnect=true) {
    if(!this.pen?.drawing&&!this.liveTurn)return;
    const turns=this.draft?.turns||[],canvas=this.canvas,turn=this.liveTurn||turns[turns.length-1];
    const lastPenAt=this.pen?.lastPenAt;
    this.disconnectPen();this.endStroke({cancelled:true});
    if(reconnect&&!this.disposed&&canvas&&this.draft?.phase==="drawing"){
      this.connectPen(canvas,turn);
      if(Number.isFinite(lastPenAt))this.pen.lastPenAt=lastPenAt;
    }
  }

  endStroke(info={}) {
    if(this.liveTurn&&this.live.length&&!info.discarded){
      this.liveTurn.strokes.push(this.live.map((point)=>({...point})));
      if(!info.cancelled)sfx.play("draw");
      void this.persist();
    }
    this.live=[];this.liveTurn=null;this.setBusy(false);this.updateDrawingTools();
    if(this.canvas&&this.draft)renderMural(this.canvas,this.draft);
  }

  updateDrawingTools() {
    const turns=this.draft?.turns||[],turn=turns[turns.length-1],blocked=this.editingBlocked();
    if(this.undoButton)this.undoButton.disabled=blocked||!turn?.strokes.length;
    if(this.doneButton)this.doneButton.disabled=blocked||!turn?.strokes.length;
    this.updateCapacityCue();
  }

  buildCapacityCue(surface) {
    const cue=document.createElement("div");cue.className="mural-capacity-cue";cue.hidden=true;
    cue.setAttribute("role","status");cue.setAttribute("aria-live","polite");
    this.capacityIcon=document.createElement("span");this.capacityIcon.className="mural-capacity-picture";
    this.capacityLabel=document.createElement("span");this.capacityLabel.className="mural-capacity-label";
    this.capacityKeep=makeButton("mural-capacity-keep","keep this mural before fresh paper",muralIcon("heart"),()=>this.keepAtCapacity());
    cue.append(this.capacityIcon,this.capacityLabel,this.capacityKeep);surface.appendChild(cue);
    this.capacityCue=cue;this.capacitySurface=surface;this.updateCapacityCue();
  }

  updateCapacityCue() {
    const turns=this.draft?.turns||[],turn=turns[turns.length-1];
    let kind="";
    if(this.liveTurn&&this.live.length>=MURAL_INPUT_CAPACITY.points)kind="lift";
    else if(this.draft?.phase==="choice"&&turns.length>=MURAL_INPUT_CAPACITY.turns)kind="paper";
    else if(this.draft?.phase==="drawing"&&turn?.strokes.length>=MURAL_INPUT_CAPACITY.strokes)kind=turns.length>=MURAL_INPUT_CAPACITY.turns?"paper":"turn";
    const changed=this.capacityKind!==kind;this.capacityKind=kind;
    if(changed&&kind)speech.say(kind==="lift"?"art_lift_to_continue":kind==="turn"?"mural_turn_full":"mural_paper_full");
    if(!this.capacityCue)return;
    this.capacityCue.hidden=!kind;this.capacityCue.dataset.kind=kind;this.capacitySurface.classList.toggle("has-capacity-cue",!!kind);
    this.capacityIcon.innerHTML=muralIcon(kind==="lift"?"lift":"heart");
    this.capacityLabel.textContent=kind==="lift"?"Lift up, then draw another line.":kind==="turn"?"Pass the pen, or keep your mural.":"Keep your mural, then try fresh paper.";
    this.capacityKeep.hidden=kind==="lift";this.capacityKeep.disabled=this.editingBlocked();
    if(changed)this.resizePaper();
  }

  async keepAtCapacity() {
    if(this.editingBlocked()||!this.draft||!["drawing","choice"].includes(this.draft.phase))return;
    if(this.draft.phase==="drawing"){this.draft.phase="choice";void this.persist();this.render();}
    await this.save();
  }

  resizePaper() {
    if(!this.board||!this.studio||this.disposed)return;
    const bounds=this.studio.getBoundingClientRect(),tools=this.tools.getBoundingClientRect();
    const style=window.getComputedStyle(this.studio),vertical=style.gridTemplateColumns.trim().split(/\s+/).length===1;
    const gap=parseFloat(vertical?style.rowGap:style.columnGap)||0;
    const cueHeight=this.capacityCue&&!this.capacityCue.hidden?this.capacityCue.getBoundingClientRect().height:0;
    const paper=fitMuralPaper(bounds.width-(vertical?0:tools.width+gap),bounds.height-(vertical?tools.height+gap:0)-(cueHeight?cueHeight+gap:0));
    this.board.style.width=`${paper.width}px`;this.board.style.height=`${paper.height}px`;
    renderMural(this.canvas,this.draft,this.live);
  }

  render() {
    if(this.disposed)return;this.resetSurface();this.host.replaceChildren();this.host.className="family-page mural-page";
    if(!this.draft)this.renderPartner();
    else if(this.draft.phase==="handoff")this.renderHandoff();
    else if(this.draft.phase==="choice")this.renderChoice();
    else if(this.draft.phase==="saved")this.renderSaved();
    else this.renderDrawing();
    if(this.saveProblem)this.showSaveRecovery();
  }

  renderPartner() {
    this.host.replaceChildren();
    speech.say("family_mural_pick_friend");
    const shell=document.createElement("section");shell.className="mural-picker";shell.setAttribute("aria-label","choose someone to draw with");
    const roster=familyRoster(),pageSize=5,total=Math.max(1,Math.ceil(roster.length/pageSize));this.rosterPage=Math.min(this.rosterPage,total-1);
    const grid=document.createElement("div");grid.className="mural-people";
    roster.slice(this.rosterPage*pageSize,this.rosterPage*pageSize+pageSize).forEach((person)=>{grid.appendChild(makeButton("mural-person",`draw together with ${person.name}`,portrait(person),()=>{sfx.play("chime");this.pickPartner(person.id);}));});
    shell.appendChild(grid);
    if(total>1){const nav=document.createElement("div");nav.className="mural-mini-nav";nav.append(makeButton("mural-icon","previous family choices","‹",()=>{this.rosterPage=(this.rosterPage-1+total)%total;this.renderPartner();}),makeButton("mural-icon","next family choices","›",()=>{this.rosterPage=(this.rosterPage+1)%total;this.renderPartner();}));shell.appendChild(nav);}
    this.host.appendChild(shell);
  }

  pickPartner(id) {
    if(this.editingBlocked())return;
    const child=settings.get().valleyProfile==="veer"?"veer":"rayna";
    const partner=personById(id);this.host.replaceChildren();
    const shell=document.createElement("section");shell.className="mural-picker mural-prompt-picker";shell.setAttribute("aria-label","choose a mural idea");
    const grid=document.createElement("div");grid.className="mural-prompts";
    MURAL_PROMPTS.forEach((prompt)=>grid.appendChild(makeButton("mural-prompt",prompt.id.replace("-"," "),promptPicture(prompt),()=>{speech.say(prompt.phrase);sfx.play("chime");this.draft={v:1,child,partner:id,prompt:prompt.id,phase:"drawing",turns:[{person:child,color:personById(child).color,mode:"draw",strokes:[]}],nameRibbon:null,updatedAt:Date.now()};this.persist();this.render();})));
    const pair=document.createElement("div");pair.className="mural-pair";pair.append(portrait(personById(child)),document.createTextNode(" + "),portrait(partner));shell.append(pair,grid);this.host.appendChild(shell);
  }

  renderDrawing() {
    const turn=this.draft.turns[this.draft.turns.length-1],person=personById(turn.person);
    const wrap=document.createElement("section");wrap.className="mural-studio";
    const board=document.createElement("div");board.className="mural-board";
    const canvas=document.createElement("canvas");canvas.className="mural-canvas";canvas.width=MURAL_SIZE.width;canvas.height=MURAL_SIZE.height;canvas.setAttribute("aria-label",`${person.name}'s drawing space`);board.appendChild(canvas);
    const tools=document.createElement("div");tools.className="mural-tools";
    const who=portrait(person);who.style.setProperty("--ink",turn.color);
    const undo=makeButton("mural-tool","undo this turn's last line",muralIcon("undo"),()=>this.undoTurn());
    const done=makeButton("mural-tool mural-done",turn.mode==="name"?"finish name ribbon":"pass the pen",muralIcon("check"),()=>this.finishTurn());
    tools.append(who,undo,done);wrap.append(board,tools);this.host.appendChild(wrap);this.canvas=canvas;this.board=board;this.studio=wrap;this.tools=tools;this.undoButton=undo;this.doneButton=done;
    this.buildCapacityCue(wrap);
    renderMural(canvas,this.draft);
    this.connectPen(canvas,turn);this.updateDrawingTools();
    this.resizeObserver=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>this.resizePaper()):null;
    this.resizeObserver?.observe(wrap);this.resizeObserver?.observe(tools);
    this.resizeFallback=()=>this.resizePaper();window.addEventListener("resize",this.resizeFallback);window.visualViewport?.addEventListener("resize",this.resizeFallback);this.resizePaper();
    if(!this.capacityKind)speech.say(turn.person===(this.draft.child||"rayna")?"family_mural_your_turn":"family_mural_family_turn");
  }

  finishTurn() {
    if(this.editingBlocked()||this.draft?.phase!=="drawing")return;
    const current=this.draft.turns[this.draft.turns.length-1];if(!current||!current.strokes.length){sfx.play("tap");return;}
    if(current.mode==="name"||this.draft.turns.length>=MURAL_INPUT_CAPACITY.turns){this.draft.phase="choice";}else if(this.draft.turns.filter((t)=>t.mode==="draw").length===1){const p=personById(this.draft.partner);this.draft.turns.push({person:p.id,color:p.color,mode:"draw",strokes:[]});this.draft.phase="handoff";}else this.draft.phase="choice";
    this.persist();sfx.play("chime");this.render();
  }

  undoTurn() {
    if(this.editingBlocked()||this.draft?.phase!=="drawing")return;
    const turn=this.draft.turns[this.draft.turns.length-1];
    if(!turn?.strokes.length)return;
    turn.strokes.pop();sfx.play("tap");void this.persist();this.updateDrawingTools();renderMural(this.canvas,this.draft);
  }

  renderHandoff() {
    const turn=this.draft.turns[this.draft.turns.length-1],person=personById(turn.person);speech.say("family_mural_family_turn");
    const pass=document.createElement("span");pass.className="mural-pass-picture";pass.innerHTML=muralIcon("pass")+muralIcon("pencil");
    const card=document.createElement("section");card.className="mural-handoff";card.append(portrait(person),makeButton("mural-ready",`pass the pen to ${person.name}`,pass,()=>{this.draft.phase="drawing";this.persist();sfx.play("chime");this.render();}));this.host.appendChild(card);
  }

  renderChoice() {
    speech.say("family_mural_again");const shell=document.createElement("section");shell.className="mural-finish";
    const preview=document.createElement("canvas");preview.width=MURAL_SIZE.width;preview.height=MURAL_SIZE.height;preview.className="mural-preview";renderMural(preview,this.draft);
    const actions=document.createElement("div");actions.className="mural-finish-actions";
    const again=makeButton("mural-finish-button","take another turn",muralIcon("swap"),()=>this.takeAnotherTurn());
    again.disabled=this.draft.turns.length>=MURAL_INPUT_CAPACITY.turns;actions.append(again);
    if(!this.draft.nameRibbon&&this.draft.turns.length<MURAL_INPUT_CAPACITY.turns)actions.append(makeButton("mural-finish-button","add a name ribbon",muralIcon("name"),()=>this.renderNamePicker()));
    actions.append(makeButton("mural-finish-button mural-save","save our mural",muralIcon("heart")+muralIcon("check"),()=>this.save()));shell.append(preview,actions);this.host.appendChild(shell);
    this.buildCapacityCue(shell);
  }

  takeAnotherTurn() {
    if(this.editingBlocked()||this.draft?.phase!=="choice"||this.draft.turns.length>=MURAL_INPUT_CAPACITY.turns)return;
    const child=this.draft.child||"rayna",last=this.draft.turns[this.draft.turns.length-1].person,next=last===child?this.draft.partner:child,p=personById(next);
    this.draft.turns.push({person:next,color:p.color,mode:"draw",strokes:[]});this.draft.phase=next===child?"drawing":"handoff";void this.persist();this.render();
  }

  renderNamePicker() {
    if(this.editingBlocked()||this.draft?.phase!=="choice"||this.draft.turns.length>=MURAL_INPUT_CAPACITY.turns)return;
    speech.say("family_mural_name_ribbon");this.host.replaceChildren();const shell=document.createElement("section");shell.className="mural-name-picker";
    for(const person of [personById(this.draft.child||"rayna"),personById(this.draft.partner)]){const face=portrait(person),letters=document.createElement("span");letters.className="mural-name-letters";for(const ch of person.name.toUpperCase())letters.insertAdjacentHTML("beforeend",glyphSVG(ch,person.color));const content=document.createElement("span");content.className="mural-name-choice-inner";content.append(face,letters);shell.appendChild(makeButton("mural-name-choice",`add ${person.name}'s name`,content,()=>{if(this.editingBlocked()||this.draft.phase!=="choice"||this.draft.nameRibbon||this.draft.turns.length>=MURAL_INPUT_CAPACITY.turns)return;this.draft.nameRibbon=person.name;this.draft.turns.push({person:person.id,color:person.color,mode:"name",strokes:[]});this.draft.phase="drawing";this.persist();this.render();}));}
    this.host.appendChild(shell);
  }

  async save() {
    if(this.editingBlocked()||this.draft?.phase!=="choice")return;
    this.saving=true;this.setBusy(true);
    for(const button of this.host.querySelectorAll("button"))button.disabled=true;
    try{
      const snapshot=clone(this.draft),canvas=document.createElement("canvas");canvas.width=MURAL_SIZE.width;canvas.height=MURAL_SIZE.height;renderMural(canvas,snapshot);const png=canvas.toDataURL("image/png");
      const row=await saveMuralRecord(snapshot,png);if(this.disposed||!row)return;
      this.savedRow=row;this.draft.phase="saved";this.saveProblem=false;this.pendingDraft=null;this.onSaved(row);speech.say("family_mural_saved");sfx.play("chime");this.render();
    }catch(error){console.info("[family-mural] keep skipped",error&&(error.name||error.message));}
    finally{
      this.saving=false;
      if(!this.disposed){this.setBusy(false);if(this.draft?.phase==="choice")this.render();else for(const button of this.host.querySelectorAll("button"))button.disabled=false;}
    }
  }

  renderSaved() {
    const shell=document.createElement("section");shell.className="mural-saved";const image=document.createElement("img");image.src=this.savedRow&&this.savedRow.png||"";image.alt="saved family mural";
    const actions=document.createElement("div");actions.className="mural-saved-actions";
    actions.append(makeButton("mural-ready","show and tell our mural",muralIcon("talk"),()=>{
      if(this.editingBlocked()||!this.savedRow)return;this.setBusy(true);
      this.showTell=openShowAndTell({host:this.host,context:"mural",preview:this.savedRow.png,onClose:()=>{this.showTell=null;this.setBusy(false);}});
    }),makeButton("mural-ready","make another family mural",muralIcon("heart")+muralIcon("plus"),()=>this.newMural()));
    shell.append(image,actions);this.host.appendChild(shell);
  }

  async newMural() {
    if(this.editingBlocked()||this.draft?.phase!=="saved")return;
    this.clearing=true;this.setBusy(true);
    for(const button of this.host.querySelectorAll("button"))button.disabled=true;
    try{
      await clearMuralDraft();if(this.disposed)return;
      this.draft=null;this.savedRow=null;this.render();
    }catch(error){console.info("[family-mural] new paper skipped",error&&(error.name||error.message));}
    finally{
      this.clearing=false;
      if(!this.disposed){this.setBusy(false);for(const button of this.host.querySelectorAll("button"))button.disabled=false;}
    }
  }
}

export default FamilyMural;
