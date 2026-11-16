// A bounded, ordered route. Edits are pure; no family stores are touched.
export const TOWN_COLS = 5, TOWN_ROWS = 3;
export const TERRAINS = Object.freeze(['road', 'hill', 'bridge']);
export const STARTER_ROUTE = Object.freeze([
  {x:1,y:0,kind:'road'}, {x:2,y:0,kind:'hill'}, {x:3,y:0,kind:'road'},
  {x:3,y:1,kind:'bridge'}, {x:3,y:2,kind:'road'}, {x:2,y:2,kind:'road'},
  {x:1,y:2,kind:'road'}, {x:1,y:1,kind:'road'}
].map(Object.freeze));
const adjacent=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1;
const validPoint = p => Number.isInteger(p?.x) && p.x>=0 && p.x<TOWN_COLS && Number.isInteger(p.y) && p.y>=0 && p.y<TOWN_ROWS && TERRAINS.includes(p.kind);
export function validRoute(route) {
  if (!Array.isArray(route) || route.length<1 || route.length>TOWN_COLS*TOWN_ROWS) return false;
  const keys=new Set();
  return route.every((p,i)=>{const key=`${p.x},${p.y}`; if(!validPoint(p)||keys.has(key)||(i && !adjacent(route[i-1],p))) return false;keys.add(key);return true;});
}
export const isLoop = route => validRoute(route) && route.length>=4 && adjacent(route[0],route.at(-1));
export function addPiece(route, x, y, kind='road') {
  if (!validRoute(route) || !validPoint({x,y,kind}) || route.some(p=>p.x===x && p.y===y)) return null;
  const piece={x,y,kind},copy=route.map(p=>({...p}));
  if(adjacent(route.at(-1),piece))return [...copy,piece];
  if(adjacent(route[0],piece))return [piece,...copy];
  return null;
}
export function changeTerrain(route,x,y,kind) {
  if(!validRoute(route)||!TERRAINS.includes(kind)) return null;
  const i=route.findIndex(p=>p.x===x && p.y===y); if(i<0)return null;
  return route.map((p,n)=>n===i?{...p,kind}:{...p});
}
// Vehicles travel the exact ordered segments, returning along open routes.
export function routePosition(route, distance) {
  if(!validRoute(route) || !Number.isFinite(distance)) return null;
  const points=route.map(p=>({x:p.x+0.5,y:p.y+0.5-(p.kind==='hill'?.16:p.kind==='bridge'?.06:0)}));
  if(points.length===1) return {...points[0],angle:0};
  const loop=isLoop(route), vertices=loop?[...points,points[0]]:[...points,...points.slice(0,-1).reverse()];
  const lengths=vertices.slice(1).map((p,i)=>Math.hypot(p.x-vertices[i].x,p.y-vertices[i].y));
  const total=lengths.reduce((a,b)=>a+b,0); let remaining=((distance%total)+total)%total;
  for(let i=0;i<lengths.length;i++){const len=lengths[i]; if(remaining<=len || i===lengths.length-1){const a=vertices[i],b=vertices[i+1],t=len?remaining/len:0; return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};} remaining-=len;}
}
// Landmark art follows the road tangent, including bends and loop closure.
export function pieceAngle(route,index) {
 if(!validRoute(route) || !Number.isInteger(index) || index<0 || index>=route.length)return null;
 if(route.length===1)return 0;
 const loop=isLoop(route),current=route[index];
 const before=route[index-1] || (loop?route.at(-1):current),after=route[index+1] || (loop?route[0]:current);
 const dx=after.x-before.x,dy=after.y-before.y;
 return Math.atan2(dy,dx)*180/Math.PI;
}
