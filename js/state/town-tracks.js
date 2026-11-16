import db from './db.js';
import { STARTER_ROUTE, validRoute } from '../data/town-tracks.js';
import { validScenery } from '../data/town-buildings.js';
export const TOWN_TRACKS_KEY='town-tracks:v1';
const copy=items=>items.map(p=>({...p}));
let route=copy(STARTER_ROUTE), scenery=[], loaded=false, tail=Promise.resolve(), failure=null;
export async function loadTownTracks(io=db){
 await tail; loaded=false;
 const raw=await (io.getStrict || io.get).call(io,'kv',TOWN_TRACKS_KEY);
 if(raw!=null){
  const object=typeof raw==='object'&&!Array.isArray(raw),v=raw?.version;
  if(!object || ![1,2].includes(v) || Object.keys(raw).some(k=>!(v===1?['version','route']:['version','route','scenery']).includes(k)) || !validRoute(raw.route) || raw.route.some(p=>Object.keys(p).some(k=>!['x','y','kind'].includes(k))) || (v===2&&!validScenery(raw.scenery,raw.route))) throw Object.assign(new Error('Saved town could not be opened safely.'),{code:'town-invalid'});
 }
 route=copy(raw?.route || STARTER_ROUTE);scenery=copy(raw?.version===2?raw.scenery:[]);loaded=true;failure=null;return copy(route);
}
export function townTracksView(){return copy(route);}
export function townSceneryView(){return copy(scenery);}
export async function saveTownTracks(next,io=db,nextScenery=scenery){
 if(!loaded || !validRoute(next) || next.some(p=>Object.keys(p).some(k=>!['x','y','kind'].includes(k))) || !validScenery(nextScenery,next)) throw Object.assign(new Error('Town is not ready to save.'),{code:'town-not-ready'});
 route=copy(next);scenery=copy(nextScenery);const snapshot={version:2,route:copy(route),scenery:copy(scenery)};
 tail=tail.catch(()=>{}).then(()=>io.put('kv',TOWN_TRACKS_KEY,snapshot));const pending=tail;
 try{await pending;failure=null;return {persistent:io.status?.().persistent !== false};}catch(e){failure=e;throw e;}
}
export async function flushTownTracks(io=db){
 try{await tail;}catch{if(!loaded)throw new Error('Town is not ready');return saveTownTracks(route,io,scenery);}
 if(failure)return saveTownTracks(route,io,scenery);return {persistent:io.status?.().persistent !== false};
}
