// Parent-selected, device-local pictures. Never sends files or retains filenames/EXIF.
import db from './db.js';
import { savedWorld } from './saved-world.js';
import { isLocalPNG } from './creation-frame.js';
const MAX_FILE = 8 * 1024 * 1024, MAX_PIXELS = 30_000_000;
let tail = Promise.resolve(), epoch = 0, paused = 0;
const prepared = new WeakMap();
const fail = message => { throw new Error(message); };
export function photoDimensions(bytes) {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(a.buffer, a.byteOffset, a.byteLength);
  if (a.length >= 24 && a[0]===137 && a[1]===80 && a[2]===78 && a[3]===71 && a[4]===13 && a[5]===10 && a[6]===26 && a[7]===10 && String.fromCharCode(...a.slice(12,16))==='IHDR')
    return {type:'image/png',width:v.getUint32(16),height:v.getUint32(20)};
  if(a.length>=4 && a[0]===255 && a[1]===216){
    let i=2;
    while(i+3<a.length){
      if(a[i++]!==255)break;
      while(a[i]===255)i++;
      const marker=a[i++];
      if(marker===217 || marker===218)break;
      if(marker===1 || marker>=208&&marker<=215)continue;
      if(i+2>a.length)break;
      const length=v.getUint16(i);if(length<2 || i+length>a.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length>=8)
        return {type:'image/jpeg',height:v.getUint16(i+3),width:v.getUint16(i+5)};
      i+=length;
    }
  }
  // Dimension preflight only, not a codec. Browser decoding remains required.
  // https://developers.google.com/speed/webp/docs/riff_container
  // https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification
  // https://datatracker.ietf.org/doc/html/rfc6386#section-9.1
  const tag = (offset) => String.fromCharCode(...a.slice(offset, offset + 4));
  if (a.length >= 20 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    const end = v.getUint32(4, true) + 8, size = v.getUint32(16, true), kind = tag(12);
    if (end !== a.length || size + 20 > end) fail('This WebP picture is incomplete. Choose another copy.');
    if (kind === 'VP8X' && size >= 10 && a.length >= 30) {
      if (a[20] & 2) fail('Choose a still picture rather than an animated WebP.');
      const u24 = i => a[i] | a[i + 1] << 8 | a[i + 2] << 16;
      return { type: 'image/webp', width: 1 + u24(24), height: 1 + u24(27) };
    }
    if (kind === 'VP8L' && size >= 5 && a.length >= 25 && a[20] === 47) {
      const bits = v.getUint32(21, true);
      if (bits >>> 29) fail('This WebP version is not supported.');
      return { type: 'image/webp', width: 1 + (bits & 16383), height: 1 + ((bits >>> 14) & 16383) };
    }
    if (kind === 'VP8 ' && size >= 10 && a.length >= 30 && !(a[20] & 1) && a[23] === 157 && a[24] === 1 && a[25] === 42)
      return { type: 'image/webp', width: v.getUint16(26, true) & 16383, height: v.getUint16(28, true) & 16383 };
  }
  return fail('Choose a JPEG, PNG or still WebP picture. HEIC and other formats are not supported yet.');
}
export function photoFit(width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>MAX_PIXELS)fail('This picture is too large to open safely. Choose a smaller copy.');
  const scale=Math.min(1,1024/Math.max(width,height));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export function photoImportTicket(){return Object.freeze({epoch,world:savedWorld.id,allowed:!paused});}
export async function prepareToyPhoto(file, adapters={}){
  if(paused)fail('Saved play is being restored. Try again when it finishes.');
  if(!file || !Number.isFinite(file.size)||file.size<1||file.size>MAX_FILE)fail('Choose a picture no larger than 8 MB.');
  const admission=adapters.ticket || photoImportTicket();
  if(!admission.allowed || admission.epoch!==epoch || admission.world!==savedWorld.id) fail('Saved play changed. Choose the picture again.');
  const start=admission.epoch,world=admission.world;
  const dimensions=photoDimensions(await file.arrayBuffer());photoFit(dimensions.width,dimensions.height);
  if(file.type && file.type!==dimensions.type)fail('The picture format does not match its contents.');
  const decode=adapters.decode || globalThis.createImageBitmap;
  if(typeof decode!=='function')fail('Picture import is unavailable in this browser.');
  let bitmap;
  try{
    bitmap=await decode(file);photoFit(bitmap.width,bitmap.height);
    const rotation = [0, 1, 2, 3].includes(adapters.rotation) ? adapters.rotation : 0;
    const square = adapters.crop === 'square';
    const side = Math.min(bitmap.width, bitmap.height);
    const fit=photoFit(square ? side : bitmap.width, square ? side : bitmap.height);
    const canvas=adapters.canvas ? adapters.canvas() : document.createElement('canvas');canvas.width=rotation % 2 ? fit.height : fit.width;canvas.height=rotation % 2 ? fit.width : fit.height;
    const context=canvas.getContext('2d');if(!context)fail('Picture preview could not open.');
    if (rotation) {
      context.translate(canvas.width / 2, canvas.height / 2); context.rotate(rotation * Math.PI / 2); context.translate(-fit.width / 2, -fit.height / 2);
    }
    if (square) context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,fit.width,fit.height);
    else context.drawImage(bitmap,0,0,fit.width,fit.height);
    const png=canvas.toDataURL('image/png');
    if(!isLocalPNG(png)||png.length>4_000_000)fail('This picture needs a smaller copy.');
    if(paused||epoch!==start||savedWorld.id!==world)fail('Saved play changed. Choose the picture again.');
    const candidate=Object.freeze({png,width:canvas.width,height:canvas.height});prepared.set(candidate,{epoch:start,world,busy:false,used:false});return candidate;
  }finally{bitmap?.close?.();}
}
export function flushToyPhotos(){return tail;}
export async function withPhotoImportsPaused(work){
  paused++;epoch++;
  try{await tail;return await work();}finally{paused--;}
}
export function addToyPhoto(candidate){
  const meta=prepared.get(candidate);
  if(!meta||meta.used||meta.busy||paused||meta.epoch!==epoch||meta.world!==savedWorld.id)return Promise.reject(new Error('Choose or preview the picture again.'));
  meta.busy=true;
  const next=tail.then(async()=>{
    if(paused||meta.epoch!==epoch||meta.world!==savedWorld.id)fail('Saved play changed. Choose the picture again.');
    const photos=(await db.entries('gallery')).filter(([,row])=>row?.kind==='toy-photo');
    if(photos.length>=24||photos.reduce((n,[,row])=>n+(row.png?.length||0),0)+candidate.png.length>32_000_000)fail('The toy picture shelf is full. Existing pictures have been kept.');
    if(!globalThis.crypto?.randomUUID)fail('This browser cannot create a safe picture ID.');
    const key='toy-photo:'+crypto.randomUUID();if(await db.get('gallery',key))fail('Picture ID already exists. Try again.');
    const at=Date.now(),row={kind:'toy-photo',id:'toy-photo',png:candidate.png,at,day:new Date(at).toISOString().slice(0,10)};
    await db.put('gallery',key,row);meta.used=true;return {...row,key,persistent:db.status().persistent};
  }).finally(()=>{meta.busy=false;});
  tail=next.catch(()=>undefined);return next;
}
