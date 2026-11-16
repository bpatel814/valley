// Public play links only. Never copy the current URL, save data or private state.
export const CHILD_PLAY_LINKS = Object.freeze([
  Object.freeze({ name: 'Rayna', url: 'https://raynas-valley.bp9118.chatgpt.site/rayna/' }),
  Object.freeze({ name: 'Veer', url: 'https://raynas-valley.bp9118.chatgpt.site/veer/' }),
]);

export function parentShareLinks({ doc = document, clipboard = globalThis.navigator?.clipboard } = {}) {
  const section = doc.createElement('section');
  section.className = 'rv-share-links';
  section.setAttribute('aria-label', 'Copy a play link');
  const heading = doc.createElement('h3'); heading.className = 'rv-h3'; heading.textContent = 'Copy a play link';
  const explanation = doc.createElement('p'); explanation.className = 'rv-note';
  explanation.textContent = 'These links open the right valley. They do not share your drawings or recordings. Each browser keeps its own saved play.';
  const status = doc.createElement('p'); status.className = 'rv-note'; status.setAttribute('role', 'status');
  const buttons = []; let copying = false;
  section.append(heading, explanation);
  for (const child of CHILD_PLAY_LINKS) {
    const row = doc.createElement('div'); row.className = 'rv-share-link-row';
    const label = doc.createElement('label'); label.textContent = `${child.name}’s play link`;
    const field = doc.createElement('input'); field.type = 'text'; field.readOnly = true; field.value = child.url;
    field.setAttribute('aria-label', `${child.name}’s play link`); field.spellcheck = false;
    label.append(field);
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'rv-btn';
    button.textContent = `Copy ${child.name}’s link`; buttons.push(button);
    button.addEventListener('click', async () => {
      if (copying) return;
      copying = true; buttons.forEach(item => { item.disabled = true; });
      status.textContent = `Copying ${child.name}’s link…`;
      try {
        if (typeof clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
        await clipboard.writeText(child.url);
        status.textContent = `${child.name}’s play link copied.`;
      } catch (_) {
        field.focus(); field.select();
        status.textContent = `Could not copy automatically. ${child.name}’s link is selected above; use your device’s Copy option.`;
      } finally {
        copying = false; buttons.forEach(item => { item.disabled = false; });
      }
    });
    row.append(label, button); section.append(row);
  }
  section.append(status);
  return section;
}
