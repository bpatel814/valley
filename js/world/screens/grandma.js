// Ba's room: a calm family vignette built from today's real local keepsakes.

import router, { homeButton, muteButton, tapify, iconSVG } from "../router.js";
import { addScenery } from "../scene.js";
import Character from "../characters.js";
import art from "../art.js";
import * as gallery from "../../parent/gallery.js";
import scrapbook from "../scrapbook.js";
import session from "../../state/session.js";
import progress from "../../state/progress.js";
import storyState from "../../state/stories.js";
import discoveryState from "../../state/discovery.js";
import { getStory, choiceAt } from "../../data/stories.js";
import { discoveryMission, discoveryVariation } from "../../data/discovery.js";
import { drawingById, drawingSVG } from "../../data/drawings.js";
import speech from "../../audio/speech.js";
import sfx from "../../audio/sfx.js";
import settings from "../../state/settings.js";
import {halloweenActive, seasonHero} from "../../data/season.js";
import {valleyProfile} from "../../data/valley-profiles.js";

let visit = 0;
let host = null;
let mute = null;
let grandma = null;
let timer = 0;
let busy = false;

const REST_ICON = '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M64 13c-6 3-10 10-10 17 0 13 12 23 25 20-5 13-17 22-32 22-21 0-37-16-37-36 0-19 15-35 34-36 8 0 15 2 20 6Z" fill="#f6d778" stroke="#634c45" stroke-width="5" stroke-linejoin="round"/><path d="M37 48c-13-15-31 3-17 17l17 16 17-16c14-14-4-32-17-17Z" fill="#ef9ab6" stroke="#634c45" stroke-width="5"/></svg>';
const STORY_ICON = '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M48 24C35 14 19 14 11 18v54c13-6 25-3 37 5 12-8 24-11 37-5V18c-15-5-27-1-37 6Z" fill="#fff8d8" stroke="#634c45" stroke-width="5" stroke-linejoin="round"/><path d="M48 24v51" stroke="#634c45" stroke-width="4"/><path d="m28 29 5 10 11 2-8 7 2 11-10-6-10 6 2-11-8-7 11-2Z" fill="#f4c76d"/></svg>';
const PALETTE_ICON = '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M50 9C27 8 10 25 10 46c0 23 22 38 40 34 12-3-3-15 8-20h14C94 55 87 12 50 9Z" fill="#ffe4a1" stroke="#634c45" stroke-width="5"/><circle cx="31" cy="31" r="7" fill="#ef9ab6"/><circle cx="50" cy="23" r="7" fill="#83bfd8"/><circle cx="70" cy="33" r="7" fill="#a88ed8"/><circle cx="28" cy="55" r="7" fill="#7ac89f"/></svg>';
const DISCOVERY_ICON = '<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="40" cy="39" r="25" fill="#d9f2e1" stroke="#634c45" stroke-width="6"/><path d="m58 57 23 23" stroke="#634c45" stroke-width="10" stroke-linecap="round"/><path d="M40 20v38M21 39h38" stroke="#78b996" stroke-width="5" stroke-linecap="round"/><circle cx="40" cy="39" r="8" fill="#ffe27d"/></svg>';

function reduced() {
  return document.documentElement.classList.contains("reduced-motion") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function action(label, icon, cls, onTap) {
  const myVisit = visit;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `grandma-action tap ${cls}`;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon;
  return tapify(button, event => {
    if (myVisit !== visit || !host || busy || !button.isConnected) return;
    return onTap(event);
  });
}

function imageFor(key, cls = "") {
  const source = art.get(key);
  if (!source || !source.src) return null;
  const image = source.cloneNode();
  image.className = cls;
  image.alt = "";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");
  return image;
}

function storyPicture(spec) {
  const frame = document.createElement("span");
  frame.className = "today-story-picture";
  if (!spec) return frame;
  let image = null;
  if (spec.kind === "story") image = imageFor(`stories/${spec.id}`);
  else if (spec.kind === "character") image = imageFor(`characters/${spec.id}_idle`) || imageFor(`characters/${spec.id}`);
  else if (spec.kind === "drawing") image = imageFor(`stickers/draw_${spec.id}`);
  if (image) frame.appendChild(image);
  else {
    const fallback = drawingById(spec.kind === "drawing" ? spec.id : spec.fallback);
    frame.innerHTML = fallback ? drawingSVG(fallback, { title: "" }) : iconSVG("book");
  }
  return frame;
}

function storyKeepsake(card) {
  const item = card && getStory(card.storyId);
  if (!item) return null;
  const node = document.createElement("article");
  node.className = "today-keepsake today-story";
  node.setAttribute("aria-label", "today's picture story");
  const ribbon = document.createElement("span");
  ribbon.className = "today-keepsake-ribbon";
  ribbon.innerHTML = STORY_ICON;
  const scene = document.createElement("div");
  scene.className = "today-story-scene";
  card.choices.slice(0, 3).forEach((id, index) => {
    const picked = choiceAt(item, index, id);
    if (picked) scene.appendChild(storyPicture(picked.picture));
  });
  node.append(ribbon, scene);
  return node;
}

function drawingKeepsake(row) {
  if (!row || !row.png) return null;
  const frame = document.createElement("figure");
  frame.className = "today-keepsake today-drawing";
  frame.setAttribute("aria-label", "today's saved picture");
  const image = document.createElement("img");
  image.src = row.png;
  image.alt = "today's saved picture";
  image.draggable = false;
  frame.appendChild(image);
  return frame;
}

function discoveryKeepsake(entry) {
  const mission = entry && discoveryMission(entry.missionId);
  const variation = mission && discoveryVariation(mission, entry.variationId);
  if (!mission || !variation) return null;
  const node = document.createElement("article");
  node.className = `today-keepsake today-discovery today-discovery--${mission.family}`;
  node.setAttribute("aria-label", "today's discovery");
  const glass = document.createElement("span");
  glass.className = "today-discovery-glass";
  glass.innerHTML = DISCOVERY_ICON;
  const tray = document.createElement("span");
  tray.className = "today-discovery-tray";
  const tokens = variation.options?.length ? variation.options.slice(0, 3).map((option) => option.picture) : [mission.icon];
  tokens.forEach((token, index) => {
    const part = document.createElement("i");
    part.style.setProperty("--today-part", String(index));
    part.dataset.token = String(token || mission.icon || "discovery");
    tray.appendChild(part);
  });
  node.append(glass, tray);
  return node;
}

function rewardStrip(summary) {
  const butterflies = Math.min(5, Number(summary.butterflies || 0));
  const total = Math.min(5, butterflies + Number(summary.gems || 0));
  if (!total) return null;
  const strip = document.createElement("div");
  strip.className = "today-rewards";
  strip.setAttribute("aria-label", "today's word gems and butterflies");
  for (let i = 0; i < total; i++) {
    const mark = document.createElement("span");
    mark.className = i < butterflies ? "today-reward today-reward--butterfly" : "today-reward today-reward--gem";
    mark.innerHTML = i < butterflies
      ? '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M38 39C25 35 11 21 18 12c8-9 20 3 22 17 2-14 14-26 22-17 7 9-7 23-20 27 12 5 18 21 8 27-8 5-10-11-10-19 0 8-2 24-10 19-10-6-4-22 8-27Z" fill="#f09ab8" stroke="#634c45" stroke-width="4"/><path d="M40 28v31" stroke="#634c45" stroke-width="5" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M14 28 29 12h22l15 16-26 39Z" fill="#8ed8f8" stroke="#634c45" stroke-width="4" stroke-linejoin="round"/><path d="M14 28h52M29 12l7 16 4 39 4-39 7-16" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="3"/></svg>';
    strip.appendChild(mark);
  }
  return strip;
}

function emptyAlbum() {
  const node = document.createElement("div");
  node.className = "grandma-empty-album";
  node.setAttribute("aria-label", "a cozy empty family album");
  node.innerHTML = '<svg viewBox="0 0 300 190" aria-hidden="true"><path d="M18 34c45-13 89-8 132 18 43-26 87-31 132-18v130c-45-13-89-8-132 18-43-26-87-31-132-18Z" fill="#fff8dc" stroke="#634c45" stroke-width="8" stroke-linejoin="round"/><path d="M150 52v130" stroke="#c99978" stroke-width="5"/><path d="M48 79h66m-66 27h78m49-27h76m-76 27h55" stroke="#e5cda9" stroke-width="8" stroke-linecap="round"/><path d="M76 127c-20-23-48 5-26 25l26 23 26-23c22-20-6-48-26-25Z" fill="#ef9ab6" stroke="#634c45" stroke-width="5"/></svg>';
  return node;
}

function recapSequence({ drawings, story, discovery }) {
  const keys = [];
  if (story) keys.push("grandma_recap_story");
  if (discovery) keys.push("grandma_recap_discovery");
  if (drawings.length) keys.push("grandma_recap_picture");
  return keys;
}

/** Select only completed records saved on the requested local day. Drafts are never
 * accepted here, so Ba cannot praise a story or discovery that was merely opened. */
export function todaysCompletions(day, { drawings = [], book = [], visits = [] } = {}) {
  const savedDrawings = Array.isArray(drawings) ? drawings.filter((row) => row && row.png && row.day === day) : [];
  const savedStories = Array.isArray(book) ? book.filter((card) => card && card.createdAt && session.today(card.createdAt) === day) : [];
  const savedDiscoveries = Array.isArray(visits) ? visits.filter((entry) => entry && entry.at && session.today(entry.at) === day) : [];
  return {
    drawings: savedDrawings,
    story: savedStories[0] || null,
    discovery: savedDiscoveries[savedDiscoveries.length - 1] || null,
  };
}

async function saySequence(keys, myVisit) {
  for (const key of keys) {
    if (myVisit !== visit) return;
    await speech.say(key);
  }
}

function enterQuiet(room, actions, myVisit) {
  if (myVisit !== visit || room.classList.contains("is-settled")) return;
  busy = true;
  sfx.play("chime");
  room.classList.add("is-settled");
  actions.replaceChildren();
  const quiet = document.createElement("div");
  quiet.className = "grandma-quiet-mark";
  quiet.innerHTML = REST_ICON;
  quiet.setAttribute("aria-label", "resting together");
  actions.appendChild(quiet);
  grandma?.setState?.("idle");
  speech.say("grandma_rest_ready").finally(() => {
    if (myVisit === visit) busy = false;
  });
}

export async function mount(el, params = {}) {
  const myVisit = ++visit;
  busy = true;
  host = el;
  host.classList.add("family-screen", "grandma-house");
  host.dataset.grandmaMode = params.sessionEnd ? "session-end" : "visit";
  addScenery(host, "map", { foreground: false });
  host.appendChild(homeButton());
  mute = muteButton();
  host.appendChild(mute);

  const day = session.today();
  const [galleryResult, storyResult, discoveryResult] = await Promise.all([
    gallery.list(day).catch(() => []),
    storyState.load().catch(() => ({ book: [] })),
    discoveryState.load().catch(() => ({ visits: [] })),
  ]);
  if (myVisit !== visit) return;

  const completed = todaysCompletions(day, {
    drawings: galleryResult,
    book: storyResult?.book,
    visits: discoveryResult?.visits,
  });
  const drawings = completed.drawings;
  const storyCard = completed.story;
  const discoveryCard = completed.discovery;
  const summary = scrapbook.todaySummary(day);

  const room = document.createElement("main");
  room.className = "grandma-room";
  room.dataset.hasKeepsakes = drawings.length || storyCard || discoveryCard ? "true" : "false";

  const hearth = document.createElement("section");
  hearth.className = "grandma-hearth";
  const rug = document.createElement("span");
  rug.className = "grandma-rug";
  rug.setAttribute("aria-hidden", "true");
  const chair = document.createElement("span");
  chair.className = "grandma-chair";
  chair.setAttribute("aria-hidden", "true");
  const grandmaButton = document.createElement("button");
  grandmaButton.type = "button";
  grandmaButton.className = "grandma-hug tap";
  grandmaButton.setAttribute("aria-label", "hug Ba");
  const grandmaHost = document.createElement("span");
  grandmaButton.appendChild(grandmaHost);
  const heart = document.createElement("span");
  heart.className = "grandma-heart";
  heart.innerHTML = iconSVG("heart");
  heart.setAttribute("aria-hidden", "true");
  hearth.append(rug, chair, grandmaButton, heart);
  if (halloweenActive(settings.get())) {
    room.classList.add('grandma-halloween');
    const profile = valleyProfile(settings.get().valleyProfile), hero = seasonHero(profile, settings.get());
    const child = imageFor(hero.art, 'grandma-season-child');
    if (child) hearth.append(child);
    const friends = document.createElement('div'); friends.className = 'grandma-season-friends';
    friends.setAttribute('aria-label', 'Your ghost friends came home with you');
    for (const row of galleryResult.filter(row => row.id === 'ghost' && row.png).slice(0, 2)) {
      const original = document.createElement('img'); original.src = row.png; original.alt = 'Your own saved ghost friend'; friends.append(original);
    }
    if (friends.children.length) hearth.append(friends);
  }
  grandma = new Character(grandmaHost, { name: "grandma", art: true, follow: false });
  tapify(grandmaButton, async () => {
    if (busy || myVisit !== visit || !grandmaButton.isConnected) return;
    busy = true;
    sfx.play("chime");
    grandma?.celebrate(1);
    heart.classList.remove("is-showing");
    void heart.offsetWidth;
    heart.classList.add("is-showing");
    try {
      await speech.say("grandma_hug");
      if (myVisit === visit && grandmaButton.isConnected) await progress.awardSticker(progress.MILESTONES.grandmaHug);
    } catch (_) {
      // The affection does not depend on a reward write succeeding.
    } finally {
      if (myVisit === visit) busy = false;
    }
  });

  const album = document.createElement("section");
  album.className = "grandma-album";
  album.setAttribute("aria-label", "today's family album");
  const keepsakes = document.createElement("div");
  keepsakes.className = "grandma-keepsakes";
  const cards = [drawingKeepsake(drawings[0]), storyKeepsake(storyCard), discoveryKeepsake(discoveryCard)].filter(Boolean);
  if (cards.length) keepsakes.append(...cards);
  else keepsakes.appendChild(emptyAlbum());
  const rewards = rewardStrip(summary);
  if (rewards) album.append(keepsakes, rewards);
  else album.appendChild(keepsakes);

  const actions = document.createElement("nav");
  actions.className = "grandma-choices";
  actions.setAttribute("aria-label", params.sessionEnd ? "rest choices" : "family activities");
  if (params.sessionEnd) {
    actions.appendChild(action("all done and rest", REST_ICON, "grandma-rest", () => enterQuiet(room, actions, myVisit)));
  } else {
    if (settings.isRegionEnabled("stories")) actions.appendChild(action("make a picture story with Ba", STORY_ICON, "grandma-story", () => {
      sfx.play("chime");
      router.go("stories", {}, { dir: "left" });
    }));
    if (settings.isRegionEnabled("treehouse")) actions.appendChild(action("open my family scrapbook", iconSVG("book"), "grandma-book", () => {
      sfx.play("chime");
      router.go("treehouse", {}, { dir: "left" });
    }));
    const makePlace = ["studio", "bridge"].find((id) => settings.isRegionEnabled(id));
    if (makePlace) actions.appendChild(action("make a picture together", PALETTE_ICON, "grandma-make", () => {
      sfx.play("tap");
      router.go(makePlace, {}, { dir: "right" });
    }));
  }

  room.append(hearth, album, actions);
  host.appendChild(room);
  busy = false;
  const recap = recapSequence({ drawings, story: storyCard, discovery: discoveryCard });
  timer = setTimeout(() => {
    if (myVisit !== visit) return;
    if (params.sessionEnd) void saySequence(recap.length ? [...recap, "grandma_rest_ready"] : ["grandma_time_for_break"], myVisit);
    else speech.say(cards.length ? "grandma_proud" : "grandma_hello");
  }, reduced() ? 30 : 280);
}

export function unmount() {
  visit += 1;
  busy = false;
  clearTimeout(timer);
  timer = 0;
  grandma?.destroy();
  grandma = null;
  mute?.destroy?.();
  mute = null;
  speech.cancel();
  if (host) {
    host.classList.remove("family-screen", "grandma-house");
    delete host.dataset.grandmaMode;
  }
  host = null;
}

export function onBack() { if (!busy) router.go("map", {}, { dir: "right" }); }
export const screen = { id: "grandma", mount, unmount, onBack, busy: () => busy, breakBusy: () => busy, beforeLeave: () => !!host && !busy, beforeBreak: () => !!host && !busy };
export default screen;
