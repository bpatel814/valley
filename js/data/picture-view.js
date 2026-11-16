// A view of a local original, never a replacement image or a saved crop.
export const PICTURE_VIEW_MAX_PIXELS = 4 * 1024 * 1024;
const prefix = 'data:image/png;base64,';

export function picturePNGSize(png) {
  if (typeof png !== 'string' || !png.startsWith(prefix)) return null;
  try {
    const header = atob(png.slice(prefix.length, prefix.length + 32));
    if (header.length < 24 || [...header.slice(0, 8)].some((c, i) => c.charCodeAt(0) !== [137,80,78,71,13,10,26,10][i]) || header.slice(12,16) !== 'IHDR') return null;
    const uint = offset => Array.from(header.slice(offset, offset + 4)).reduce((value, c) => value * 256 + c.charCodeAt(0), 0);
    const width = uint(16), height = uint(20);
    return width > 0 && height > 0 ? { width, height } : null;
  } catch { return null; }
}

export function normalizePictureView(raw) {
  if (raw == null) return null;
  const { x, y, width, height, sourceWidth, sourceHeight } = raw;
  const valid = [x,y,width,height,sourceWidth,sourceHeight].every(Number.isInteger) &&
    sourceWidth > 0 && sourceHeight > 0 && sourceWidth <= 4096 && sourceHeight <= 4096 &&
    sourceWidth * sourceHeight <= PICTURE_VIEW_MAX_PIXELS && x >= 0 && y >= 0 && width > 0 && height > 0 &&
    x + width <= sourceWidth && y + height <= sourceHeight;
  if (!valid) throw Object.assign(new Error('picture-view-invalid'), { code: 'picture-view-invalid' });
  return { x, y, width, height, sourceWidth, sourceHeight };
}

/** Include every visible pixel, even a faint isolated mark, with a paper margin. */
export function pictureAlphaView(width, height, pixels) {
  normalizePictureView({ x:0,y:0,width,height,sourceWidth:width,sourceHeight:height });
  if (!pixels || pixels.length !== width * height * 4) throw new Error('picture-view-pixels');
  let left = width, top = height, right = -1, bottom = -1;
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
    if (pixels[(y * width + x) * 4 + 3] === 0) continue;
    left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = Math.max(bottom,y);
  }
  if (right < 0) return null;
  const margin = Math.max(2, Math.ceil(Math.max(right-left+1,bottom-top+1) * .08));
  left = Math.max(0,left-margin); top = Math.max(0,top-margin);
  right = Math.min(width-1,right+margin); bottom = Math.min(height-1,bottom+margin);
  if (left === 0 && top === 0 && right === width-1 && bottom === height-1) return null;
  return { x:left,y:top,width:right-left+1,height:bottom-top+1,sourceWidth:width,sourceHeight:height };
}
