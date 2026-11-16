import {TOWN_COLS,TOWN_ROWS,validRoute} from './town-tracks.js';
export const TOWN_BUILDINGS=Object.freeze(['house','station','tree']);
export function validScenery(items,route){
 if(!validRoute(route)||!Array.isArray(items)||items.length>TOWN_COLS*TOWN_ROWS)return false;
 const keys=new Set();return items.every(p=>{if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['x','y','kind'].includes(k))||!Number.isInteger(p.x)||p.x<0||p.x>=TOWN_COLS||!Number.isInteger(p.y)||p.y<0||p.y>=TOWN_ROWS||!TOWN_BUILDINGS.includes(p.kind)||route.some(r=>r.x===p.x&&r.y===p.y))return false;const key=`${p.x},${p.y}`;if(keys.has(key))return false;keys.add(key);return true;});
}
export function placeBuilding(items,route,x,y,kind){
 if(!validScenery(items,route)||!TOWN_BUILDINGS.includes(kind)||!Number.isInteger(x)||x<0||x>=TOWN_COLS||!Number.isInteger(y)||y<0||y>=TOWN_ROWS||route.some(p=>p.x===x&&p.y===y))return null;
 const prior=items.find(p=>p.x===x&&p.y===y);const rest=items.filter(p=>p!==prior).map(p=>({...p}));return prior?.kind===kind?rest:[...rest,{x,y,kind}];
}
// The train pauses once when it reaches a station beside the actual route.
// Only active play time counts; the caller does not advance during breaks.
export function stepTrain(state,route,items,delta,positionAt){
 if(!state || !Number.isFinite(state.distance) || !Number.isFinite(delta) || delta<0 || !validScenery(items,route) || typeof positionAt!=='function')return null;
 const dt=Math.min(delta,100),wait=Math.max(0,Number(state.wait)||0);
 if(wait>0)return {...state,wait:Math.max(0,wait-dt)};
 const distance=state.distance+dt*.00036, pos=positionAt(route,distance);
 const near=items.find(p=>p.kind==='station' && Math.hypot(pos.x-(p.x+.5),pos.y-(p.y+.5))<=1.05);
 const key=near?`${near.x},${near.y}`:null;
 return {distance,near:key,wait:key && key!==state.near?1200:0};
}
