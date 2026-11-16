import { picturePNGSize, pictureAlphaView, PICTURE_VIEW_MAX_PIXELS } from '../data/picture-view.js';

/** Inspect one chosen local picture at its full resolution. No exports or writes. */
export function inspectPictureView(png, { signal } = {}) {
  const size = picturePNGSize(png);
  if (!size || size.width > 4096 || size.height > 4096 || size.width * size.height > PICTURE_VIEW_MAX_PIXELS || signal?.aborted) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image(); let finished = false;
    const done = view => {
      if (finished) return; finished = true; clearTimeout(timer);
      signal?.removeEventListener('abort', abort); image.onload = image.onerror = null; image.removeAttribute('src');
      resolve(view);
    };
    const abort = () => done(null), timer = setTimeout(abort, 8000);
    signal?.addEventListener('abort', abort, { once:true });
    image.onerror = abort;
    image.onload = () => {
      let canvas;
      try {
        if (image.naturalWidth !== size.width || image.naturalHeight !== size.height || signal?.aborted) { done(null); return; }
        canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
        const ctx = canvas.getContext('2d', { willReadFrequently:true });
        ctx.drawImage(image,0,0); done(pictureAlphaView(size.width,size.height,ctx.getImageData(0,0,size.width,size.height).data));
      } catch { done(null); }
      finally { if (canvas) canvas.width = canvas.height = 1; }
    };
    image.src = png;
  });
}

export function pictureView(png, frame, className='', label='Your exact whole picture') {
  if (!frame) {
    const image = document.createElement('img'); image.src = png; image.alt = label; image.draggable = false; image.className = className; return image;
  }
  const ns = 'http://www.w3.org/2000/svg', view = document.createElementNS(ns,'svg');
  view.setAttribute('class',className); view.setAttribute('role','img'); view.setAttribute('aria-label',label);
  view.setAttribute('viewBox',`${frame.x} ${frame.y} ${frame.width} ${frame.height}`); view.setAttribute('preserveAspectRatio','xMidYMid meet');
  const original = document.createElementNS(ns,'image'); original.setAttribute('href',png);
  original.setAttribute('width',frame.sourceWidth); original.setAttribute('height',frame.sourceHeight); view.append(original); return view;
}
