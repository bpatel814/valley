// Concrete sets keep the same object and scale across a question and its choices.
const objects = Object.freeze({
  "two-apples": { key: "apple", one: "apple", many: "apples" },
  "three-leaves": { key: "leaf", one: "leaf", many: "leaves" },
  "one-star": { key: "star", one: "star", many: "stars" },
});
const objectFor = (variation) => objects[variation?.scene] || objects["two-apples"];
const amount = (count) => Math.max(0, Math.min(5, Math.trunc(Number(count)) || 0));
export function quantityChoiceCount(option) {
  return amount(/^set-([1-5])$/.exec(option?.picture || "")?.[1]);
}
export function quantityLabel(variation, count) {
  const object = objectFor(variation);
  return `${amount(count)} ${amount(count) === 1 ? object.one : object.many}`;
}
function item(object, x, y, size = 66, extra = false) {
  return `<image data-counting-object="${object.key}"${extra ? ' data-extra="true"' : ''} href="assets/art/final/props/counting-${object.key}.png" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
}
function positions(count) {
  if (count <= 3) return Array.from({ length: count }, (_, i) => [110 + (i - (count - 1) / 2) * 70 - 33, 47]);
  return Array.from({ length: count }, (_, i) => i < 3 ? [7 + i * 70, 9] : [count === 4 ? 77 : 42 + (i - 3) * 70, 85]);
}
export function quantityChoicePicture(variation, count) {
  const n = amount(count);
  const object = objectFor(variation);
  return `<svg class="discovery-quantity-choice" viewBox="0 0 220 160" aria-hidden="true">${positions(n).map(([x, y]) => item(object, x, y)).join("")}</svg>`;
}
export function quantityScene(variation, completed = false) {
  const object = objectFor(variation);
  const start = amount(variation.start);
  const count = start + 1;
  const title = completed ? quantityLabel(variation, count) : `${quantityLabel(variation, start)}, with one more ${object.one} joining`;
  const original = Array.from({ length: start }, (_, i) => item(object, 33 + i * 75, 94, 70));
  if (completed) {
    const left = (400 - count * 78) / 2;
    return `<svg class="discovery-quantity-stage" viewBox="0 0 400 260" role="img" aria-label="${title}"><rect x="12" y="64" width="376" height="132" rx="32" fill="#e2f3d9" stroke="#a3c98b" stroke-width="3"/>${Array.from({ length: count }, (_, i) => item(object, left + i * 78, 94, 70, i === start)).join("")}</svg>`;
  }
  return `<svg class="discovery-quantity-stage" viewBox="0 0 400 260" role="img" aria-label="${title}"><rect x="15" y="64" width="250" height="132" rx="32" fill="#fff4dc" stroke="#dfc798" stroke-width="3"/>${original.join("")}<path d="M316 130h-32m10-10-10 10 10 10" fill="none" stroke="#5e9567" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>${item(object, 326, 94, 70, true)}</svg>`;
}
