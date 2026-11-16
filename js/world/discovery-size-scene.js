// One coordinate system for subjects and the things they try. The same scene is
// used in the choice pictures, live experiment and final picture.
import art from "./art.js";
import { discoverySizeTrial } from "../data/discovery.js";

const sizes = { tiny: "small", middle: "medium", big: "large" };
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const character = (name, x, y, width, height) => `<image data-size-subject="${name}" href="${escape(art.get(`characters/${name}`)?.src || `assets/art/final/characters/${name}.webp`)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMax meet"/>`;

export function discoverySizeChoiceLabel(variation, optionId) {
  const trial = discoverySizeTrial(variation, optionId);
  return trial ? `try the ${sizes[optionId]} ${trial.subject}` : "try a size";
}

function bedScene(trial) {
  const left = 180 - trial.width / 2;
  // One illustrated bed, uniformly scaled. The character never scales with it.
  const height = trial.width * 663 / 1024;
  const top = 260 - height;
  const bugHeight = trial.subjectWidth * 4 / 3;
  const pillowX = left + trial.width * .30;
  const mattressY = top + height * .58;
  return `<image data-size-container="bed" data-width="${trial.width}" href="assets/art/final/props/bug_bed.webp" x="${left}" y="${top}" width="${trial.width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
    ${character("caterpillar_sleepy", pillowX - trial.subjectWidth / 2, mattressY - bugHeight, trial.subjectWidth, bugHeight)}`;
}

function umbrellaScene(trial) {
  const left = 180 - trial.width / 2, right = 180 + trial.width / 2;
  const friendWidth = (trial.subjectWidth - 16) / 2;
  const height = trial.width * 990 / 1024;
  // Anchor the canopy edge, not the handle. Uniform scaling keeps the object
  // recognizable while the two friends retain their exact size and positions.
  const canopyY = 154;
  const top = canopyY - height * .50;
  const rain = Array.from({ length: 15 }, (_, i) => 12 + i * 24).map((x, i) => {
    const top = 12 + (i % 3) * 11;
    const outside = x < left || x > right;
    return `<path data-size-rain="${outside ? "outside" : "caught"}" d="M${x} ${top}v15M${x} ${top + 38}v12${outside ? `M${x} 155v18M${x} 204v18M${x} 252v15` : ""}" stroke="#5d9dc1" stroke-width="4" stroke-linecap="round" opacity=".65"/>`;
  }).join("");
  return `<ellipse cx="180" cy="300" rx="139" ry="12" fill="#8bc4d6" opacity=".48"/>
    ${character("pip_idle", 180 - trial.subjectWidth / 2, 174, friendWidth, 116)}
    ${character("unicorn_idle", 188, 174, friendWidth, 116)}
    ${rain}
    <image data-size-container="umbrella" data-width="${trial.width}" href="assets/art/final/props/rain_umbrella.webp" x="${left}" y="${top}" width="${trial.width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
}

function berry(x, y) {
  return `<image data-size-subject="berry" data-diameter="36" href="assets/art/final/props/strawberry.webp" x="${x}" y="${y}" width="36" height="${36 * 256 / 226}" preserveAspectRatio="xMidYMid meet"/>`;
}

function bowlScene(trial) {
  const left = 180 - trial.width / 2;
  const height = trial.width * 465 / 1024;
  const top = 260 - height;
  const frontY = top + height * .43;
  const fruitY = frontY + 5 - 36 * 256 / 226;
  const overflow = trial.relation === "overflow";
  const fruit = overflow ? berry(83, 219) + berry(162, fruitY) + berry(241, 219)
    : berry(120, fruitY) + berry(162, fruitY) + berry(204, fruitY);
  const bowlImage = `<image href="assets/art/final/props/fruit_bowl.webp" x="${left}" y="${top}" width="${trial.width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
  return `<path d="M36 264h288" stroke="#b68863" stroke-width="9" stroke-linecap="round"/>
    <g data-size-container="bowl" data-width="${trial.width}">${bowlImage}</g>
    ${fruit}
    <svg x="${left}" y="${frontY}" width="${trial.width}" height="${height * .57}" viewBox="${left} ${frontY} ${trial.width} ${height * .57}" overflow="hidden" aria-hidden="true">${bowlImage}</svg>`;
}

export function discoverySizeScene(variation, optionId, { preview = false } = {}) {
  const trial = discoverySizeTrial(variation, optionId || variation.options[0]?.id);
  if (!trial) return "";
  const description = trial.subject === "bed" ? (trial.relation === "snug" ? "The bug rests in a snug little bed." : "The bug has more empty space in this bed.")
    : trial.subject === "umbrella" ? (trial.relation === "covered" ? "The umbrella covers both friends." : "Rain can still reach the edges of the friends.")
    : trial.relation === "overflow" ? "Two berries stay outside this bowl."
      : trial.relation === "roomy" ? "All three berries fit with extra room." : "All three berries fit close together.";
  const body = trial.subject === "bed" ? bedScene(trial) : trial.subject === "umbrella" ? umbrellaScene(trial) : bowlScene(trial);
  const accessible = preview ? 'aria-hidden="true"' : `role="img" aria-label="${escape(description)}"`;
  // Frame the useful scene, identically for every size. Never zoom a smaller
  // container up to fill the picture, which would destroy the comparison.
  const viewBox = trial.subject === "bed" ? "20 55 320 220" : trial.subject === "bowl" ? "30 125 300 150" : "0 0 360 325";
  return `<svg class="discovery-size-scene" viewBox="${viewBox}" ${accessible} data-size-scene="${trial.subject}" data-size-relation="${trial.relation}" data-size-width="${trial.width}" data-size-subject-width="${trial.subjectWidth}">${body}</svg>`;
}
