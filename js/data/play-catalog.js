// Draft navigation model: group destinations without moving or changing saves.
// A UI integration is still required; this module alone changes no game routes.
export const PLAY_GROUPS = Object.freeze([
  {id:'words', title:'Words', routes:['garden','meadow','stories']},
  {id:'draw', title:'Draw', routes:['studio','bridge','picture-post']},
  {id:'play', title:'Play', routes:['boo-hollow','rolling-run','river-run','toy-workshop','animal-friends']},
  {id:'make', title:'Make', routes:['town-tracks','build-lab','water-garden','discovery','garden-cafe']},
  {id:'together', title:'Together', routes:['treehouse','grandma','picnic','music-band','play-stage']},
].map(group=>Object.freeze({...group,routes:Object.freeze(group.routes)})));
// A café is a distinct saved-work-preserving view of the existing Picnic route.
export function resolvePlayDestination(id) {
  return id === 'garden-cafe' ? {route:'picnic', params:{cafe:true}} : {route:id, params:{}};
}
export function availablePlayGroups(registered, regions, regionFor, isPreviewEnabled=()=>true) {
  return PLAY_GROUPS.map(group=>({...group,routes:group.routes.filter(route=>{
    const resolved=resolvePlayDestination(route);
    const region=regionFor(resolved.route);
    return registered.has(resolved.route) && regions[region]!==false && isPreviewEnabled(resolved.route) && isPreviewEnabled(region);
  })})).filter(group=>group.routes.length);
}
