// A small persistent keepsake on the shared map, backed only by local gallery PNGs.
import { tapify } from "./router.js";
import sfx from "../audio/sfx.js";
import { openShowAndTell } from "./show-and-tell.js";
import {
  loadCreationFrameModel,
  selectCreationPicture,
  hideCreationPicture,
} from "../state/creation-frame.js";

const PAGE_SIZE = 4;

const ICONS = {
  close: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 16l32 32M48 16 16 48" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/></svg>',
  hide: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="13" width="44" height="38" rx="5" fill="#fffdf8" stroke="currentColor" stroke-width="5"/><path d="m8 55 48-48" stroke="#d96f83" stroke-width="7" stroke-linecap="round"/></svg>',
  next: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 32h38M38 18l14 14-14 14" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M51 32H13M26 18 12 32l14 14" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  talk: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 13h44v31H30L18 54V44h-8Z" fill="#fff2b6" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><circle cx="24" cy="29" r="3"/><circle cx="32" cy="29" r="3"/><circle cx="40" cy="29" r="3"/></svg>',
};

function iconButton(icon, label, className, onTap) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `creation-frame-control tap ${className || ""}`;
  button.setAttribute("aria-label", label);
  button.innerHTML = ICONS[icon];
  return tapify(button, onTap);
}

function framedPicture(png, className, alt) {
  const frame = document.createElement("span");
  frame.className = `creation-frame-wood ${className || ""}`;
  frame.innerHTML =
    '<svg class="creation-frame-grain" viewBox="0 0 100 76" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect x="2" y="2" width="96" height="72" rx="7" fill="none" stroke="currentColor" stroke-width="4"/>' +
      '<path d="M7 13q18 5 37 0t48 0M8 64q22-5 42 0t42 0" fill="none" stroke="currentColor" stroke-width="2" opacity=".28"/>' +
      '<circle cx="9" cy="9" r="2" fill="#ffe6a3"/><circle cx="91" cy="9" r="2" fill="#ffe6a3"/>' +
    '</svg>';
  const mat = document.createElement("span");
  mat.className = "creation-frame-mat";
  const image = new Image();
  image.src = png;
  image.alt = alt;
  image.draggable = false;
  mat.appendChild(image);
  frame.appendChild(mat);
  return frame;
}

class CreationFrameController {
  constructor(mapRoot, { onBusy = () => {}, loadModel = loadCreationFrameModel, hidePicture = hideCreationPicture, selectPicture = selectCreationPicture } = {}) {
    this.root = mapRoot; this._loadModel = loadModel; this._hidePicture = hidePicture; this._selectPicture = selectPicture;
    this._onBusy = typeof onBusy === "function" ? onBusy : () => {};
    this._disposed = false;
    this._visit = 1;
    this._busy = false;
    this._page = 0;
    this._pictures = [];
    this._display = null;
    this.frameButton = null;
    this.overlay = null;
    this._inerted = [];
    this._keyDown = (event) => this._handleKeyDown(event);
    window.addEventListener("keydown", this._keyDown);
    this.ready = this.refresh();
  }

  busy() { return this._busy; }

  _setBusy(value) {
    const next = !!value;
    if (next === this._busy) return;
    this._busy = next;
    this._onBusy(next);
  }

  async refresh() {
    const visit = this._visit;
    let model;
    try { model = await this._loadModel(); }
    catch { return this; }
    if (this._disposed || visit !== this._visit) return this;
    this._pictures = model.pictures;
    this._display = model.display;
    if (this._display) this._renderSmallFrame();
    else this._removeSmallFrame();
    return this;
  }

  _renderSmallFrame() {
    if (!this._display || this._disposed) return;
    if (!this.frameButton) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "creation-frame-mini tap";
      button.setAttribute("aria-label", "open my valley picture");
      tapify(button, () => this.open());
      this.root.appendChild(button);
      this.frameButton = button;
    }
    this.frameButton.replaceChildren(framedPicture(this._display.png, "creation-frame-wood--small", "my displayed picture"));
  }

  _removeSmallFrame() {
    this.frameButton?.remove();
    this.frameButton = null;
  }

  open() {
    if (this._disposed || !this._display || this.overlay) return;
    const index = Math.max(0, this._pictures.findIndex((row) => row.key === this._display.key));
    this._page = Math.floor(index / PAGE_SIZE);
    this._setBusy(true);
    this._renderViewer();
    this._lockBackground();
    queueMicrotask(() => this.overlay?.querySelector(".creation-frame-close")?.focus());
    sfx.play("tap");
  }

  _handleKeyDown(event) {
    // A child overlay, such as Show and Tell, may already have consumed this key.
    // Leave the picture viewer open until its own next Escape.
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      if (this._showAndTell) {
        this._closeShowAndTell();
        this.overlay?.querySelector(".creation-frame-talk")?.focus();
      } else if (this.overlay) {
        this.close();
      }
      return;
    }
    if (event.key !== "Tab" || !this.overlay || this._showAndTell) return;
    const controls = [...this.overlay.querySelectorAll("button:not([disabled])")].filter((button) => button.offsetParent !== null);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!this.overlay.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }

  _lockBackground() {
    this._restoreBackground();
    if (!this.root || !this.overlay) return;
    this._inerted = [...this.root.children]
      .filter((element) => element !== this.overlay)
      .map((element) => ({ element, inert: !!element.inert }));
    for (const item of this._inerted) item.element.inert = true;
  }

  _restoreBackground() {
    for (const item of this._inerted || []) {
      if (item.element?.isConnected) item.element.inert = item.inert;
    }
    this._inerted = [];
  }

  _renderViewer() {
    if (this._disposed || !this._display) return;
    if (!this.overlay) {
      this.overlay = document.createElement("div");
      this.overlay.className = "creation-frame-overlay";
      this.overlay.innerHTML = '<section class="creation-frame-dialog" role="dialog" aria-modal="true" aria-label="my valley picture"></section>';
      this.root.appendChild(this.overlay);
    }
    const dialog = this.overlay.querySelector(".creation-frame-dialog");
    dialog.replaceChildren();

    const close = iconButton("close", "close picture", "creation-frame-close", () => this.close());
    const large = framedPicture(this._display.png, "creation-frame-wood--large", "my valley picture");
    const tray = document.createElement("div");
    tray.className = "creation-frame-tray";
    tray.setAttribute("role", "group");
    tray.setAttribute("aria-label", "choose another picture");
    const pages = Math.max(1, Math.ceil(this._pictures.length / PAGE_SIZE));
    this._page = Math.max(0, Math.min(pages - 1, this._page));
    const shown = this._pictures.slice(this._page * PAGE_SIZE, this._page * PAGE_SIZE + PAGE_SIZE);
    for (const picture of shown) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `creation-frame-thumb tap ${picture.key === this._display.key ? "is-selected" : ""}`;
      button.setAttribute("aria-label", picture.key === this._display.key ? "displayed picture" : "display this picture");
      button.setAttribute("aria-pressed", String(picture.key === this._display.key));
      const image = new Image();
      image.src = picture.png;
      image.alt = "";
      image.draggable = false;
      button.appendChild(image);
      tapify(button, () => { void this._select(picture); });
      tray.appendChild(button);
    }

    const controls = document.createElement("div");
    controls.className = "creation-frame-actions";
    if (pages > 1) {
      controls.append(
        iconButton("back", "previous pictures", "creation-frame-page", () => this._changePage(-1)),
        iconButton("next", "more pictures", "creation-frame-page", () => this._changePage(1)),
      );
    }
    controls.appendChild(iconButton("talk", "show and tell about this picture", "creation-frame-talk", () => this._openShowAndTell()));
    controls.appendChild(iconButton("hide", "remove picture from the valley", "creation-frame-hide", () => { void this.hide(); }));
    dialog.append(close, large, tray, controls);
  }

  _changePage(direction) {
    const pages = Math.max(1, Math.ceil(this._pictures.length / PAGE_SIZE));
    this._page = (this._page + (direction < 0 ? -1 : 1) + pages) % pages;
    this._renderViewer();
    sfx.play("tap");
  }

  async _select(picture) {
    if (this._disposed || !picture || this._selecting) return;
    this._selecting = true;
    const visit = this._visit;
    try {
      await this._selectPicture(picture.key);
      if (this._disposed || visit !== this._visit) return;
      this._closeShowAndTell();
      this._display = picture;
      this._renderSmallFrame();
      this._renderViewer();
      sfx.play("tap");
    } catch { if (!this._disposed && visit === this._visit) this._showReadError(); }
    finally { this._selecting = false; }
  }

  _openShowAndTell() {
    if (this._disposed || !this._display || this._showAndTell) return;
    this._showAndTell = openShowAndTell({
      host: this.root,
      context: "picture",
      preview: this._display.png,
      onClose: () => { this._showAndTell = null; },
    });
    sfx.play("tap");
  }

  _closeShowAndTell() {
    this._showAndTell?.destroy?.();
    this._showAndTell = null;
  }

  _showReadError() {
    if (!this.overlay) return;
    let note = this.overlay.querySelector('.creation-frame-read-error');
    if (!note) { note = document.createElement('p'); note.className = 'creation-frame-read-error'; note.setAttribute('role','status'); this.overlay.querySelector('.creation-frame-dialog')?.append(note); }
    note.textContent = 'Your picture is still here. Try again or ask a grown-up for help.';
  }

  async hide() {
    if (this._disposed || this._hiding) return;
    this._hiding = true;
    const visit = this._visit;
    try {
      await this._hidePicture();
      if (this._disposed || visit !== this._visit) return;
      this._display = null;
      this.close();
      this._removeSmallFrame();
      sfx.play("tap");
    } catch {
      if (!this._disposed && visit === this._visit) this._showReadError();
    } finally { this._hiding = false; }
  }

  close() {
    this._closeShowAndTell();
    this.overlay?.remove();
    this.overlay = null;
    this._restoreBackground();
    this._setBusy(false);
    if (!this._disposed) this.frameButton?.focus();
  }

  destroy() {
    if (this._disposed) return;
    this._disposed = true;
    this._visit += 1;
    window.removeEventListener("keydown", this._keyDown);
    this.close();
    this._removeSmallFrame();
    this.root = null;
  }
}

export function mountCreationFrame(mapRoot, options = {}) {
  if (!mapRoot || typeof mapRoot.appendChild !== "function") {
    return { ready: Promise.resolve(), busy: () => false, destroy() {} };
  }
  return new CreationFrameController(mapRoot, options);
}

export { CreationFrameController };
export default mountCreationFrame;
