// Optional story beginnings inside the child's current editable room.
// These choices describe actual actions, not correct answers or completion scores.
export const STAGE_STORY_EPISODES = Object.freeze([
  { id:'curtain', label:'A friend at the curtain', cue:'living_story_curtain', icon:'peek' },
  { id:'sharing', label:'One toy, two friends', cue:'living_story_sharing', icon:'people' },
  { id:'ending', label:'A place for our ending', cue:'living_story_ending', icon:'display' },
]);
export const STAGE_STORY_PROMPTS = Object.freeze({
  living_story_curtain:'Come out, or peek?',living_story_sharing:'Your turn, or play together?',living_story_ending:'Keep it, or leave it here?',
  living_story_hello:'Our friend came out.',living_story_peek:'A peek from the other side!',living_story_pass:'Now our other friend has a turn.',
  living_story_together:'Our toy is between the friends.',living_story_keep:'Our friend has the toy.',living_story_leave:'Ready for another story.',living_story_display:'Your picture is on display.',
});
const OUTCOMES = Object.freeze({curtain:['come-out','peek'],sharing:['pass','together'],ending:['keep','leave','display']});
const episodeExists = value => typeof value==='string' && Object.hasOwn(OUTCOMES,value);
const ref = value => typeof value==='string' && /^[a-zA-Z0-9:_-]{1,180}$/.test(value) ? value : '';
const error = code => Object.assign(new Error(code),{code});
/** Optional ground-contact anchor for an explicitly displayed whole picture. */
export function normalizeStageFrameAnchor(raw) {
  if (raw===undefined) return null;
  if (!raw || typeof raw!=='object' || Array.isArray(raw) || raw.version!==1) throw error('stage-frame-version');
  if (Object.keys(raw).some(key=>!['version','u','v'].includes(key))
    || !['u','v'].every(key=>typeof raw[key]==='number' && Number.isFinite(raw[key]) && raw[key]>=0 && raw[key]<=1)) throw error('stage-frame-anchor');
  return {version:1,u:raw.u,v:raw.v};
}
export function normalizeStageStoryDay(raw) {
  if (raw==null) return null;
  if (typeof raw!=='object' || Array.isArray(raw) || raw.v!==1) throw error('stage-story-version');
  if (!episodeExists(raw.episode) || !['waiting','chosen','free'].includes(raw.phase) || !ref(raw.actorId)
    || raw.episode!=='curtain' && !ref(raw.propId) || raw.episode==='sharing' && (!ref(raw.partnerId) || raw.partnerId===raw.actorId)
    || raw.outcome!=null && (typeof raw.outcome!=='string' || raw.outcome && !OUTCOMES[raw.episode].includes(raw.outcome))
    || raw.phase==='chosen' && !raw.outcome || raw.phase==='waiting' && raw.outcome) throw error('stage-story-invalid');
  return {v:1,episode:raw.episode,phase:raw.phase,actorId:raw.actorId,
    partnerId:raw.episode==='sharing' ? raw.partnerId : '',propId:raw.episode==='curtain' ? '' : raw.propId,outcome:raw.outcome || ''};
}
export const stageStoryCanHold = (actor,prop) => !!actor && !!prop && (actor.role!=='ishan' || ['toy','build'].includes(prop.kind));
export function stageStoryContext(scene) {
  const story=scene.storyDay; if (!story) return null;
  const actor=scene.actors.find(row=>row.id===story.actorId),partner=scene.actors.find(row=>row.id===story.partnerId),prop=scene.props.find(row=>row.id===story.propId);
  if (!actor || story.episode!=='curtain' && !prop || story.episode==='sharing' && !partner) return null;
  return {story,actor,partner,prop};
}
export function stageStoryStillWaiting(scene) {
  const context=stageStoryContext(scene); if(!context)return false;
  const {story,actor,partner,prop}=context;
  if(story.episode==='curtain')return actor.hidden && actor.peekSide==='left';
  if(story.episode==='sharing')return !actor.hidden && !partner.hidden && prop.placement==='held' && prop.ownerActorId===actor.id;
  return true;
}
function give(scene,prop,actor) {
  for (const other of scene.props) if (other.id!==prop.id && other.ownerActorId===actor.id) {
    other.ownerActorId=''; other.placement='ground'; other.u=actor.u; other.v=actor.v;
  }
  prop.ownerActorId=actor.id; prop.placement='held'; prop.handSocket='right'; delete prop.frameAnchor;
}
function putDown(prop,actor,partner,action) {
  prop.ownerActorId=''; prop.placement='ground'; delete prop.frameAnchor;
  prop.u=Number.isFinite(action.u) ? Math.max(0,Math.min(1,action.u)) : partner ? (actor.u+partner.u)/2 : actor.u;
  prop.v=Number.isFinite(action.v) ? Math.max(0,Math.min(1,action.v)) : partner ? (actor.v+partner.v)/2 : actor.v;
}
/** Mutates only the normalized working scene supplied by the shared action store. */
export function applyStageStoryAction(scene,action) {
  if (action.type==='story-pause' && scene.storyDay?.phase==='waiting') { scene.storyDay.phase='free'; return true; }
  if (action.type==='story-begin') {
    const actor=scene.actors.find(row=>row.id===action.actorId),partner=scene.actors.find(row=>row.id===action.partnerId),prop=scene.props.find(row=>row.id===action.propId);
    if (!actor || !episodeExists(action.episode) || action.episode!=='curtain' && !stageStoryCanHold(actor,prop)
      || action.episode==='sharing' && (!stageStoryCanHold(partner,prop) || partner.id===actor.id)) return false;
    scene.storyDay={v:1,episode:action.episode,phase:'waiting',actorId:actor.id,partnerId:action.episode==='sharing' ? partner.id : '',propId:action.episode==='curtain' ? '' : prop.id,outcome:''};
    if (action.episode==='curtain') { actor.hidden=true; actor.peekSide='left'; }
    if (action.episode==='sharing') { actor.hidden=false; partner.hidden=false; give(scene,prop,actor); }
    return true;
  }
  const context=stageStoryContext(scene);
  if (action.type!=='story-choice' || !context || context.story.phase!=='waiting' || !OUTCOMES[context.story.episode].includes(action.choice)) return false;
  const {story,actor,partner,prop}=context;
  if (story.episode==='curtain') { actor.hidden=action.choice==='peek'; actor.peekSide='right'; }
  if (story.episode==='sharing') {
    if (!stageStoryCanHold(partner,prop)) return false;
    actor.hidden=false; partner.hidden=false;
    if (action.choice==='pass') give(scene,prop,partner); else putDown(prop,actor,partner,action);
  }
  if (story.episode==='ending') {
    if (action.choice==='display' && prop.kind!=='picture' || action.choice==='keep' && !stageStoryCanHold(actor,prop)) return false;
    if (action.choice==='keep') { actor.hidden=false; give(scene,prop,actor); }
    else if (action.choice==='leave') putDown(prop,actor,null,action);
    else {
      const anchor=action.frameAnchor===undefined ? prop.frameAnchor : normalizeStageFrameAnchor(action.frameAnchor);
      prop.ownerActorId=''; prop.placement='frame'; delete prop.wrapped;
      if(anchor)prop.frameAnchor=anchor;
    }
  }
  story.phase='chosen'; story.outcome=action.choice;
  return true;
}
export const stageStoryResultCue = (episode,choice) => ({curtain:{'come-out':'living_story_hello',peek:'living_story_peek'},
  sharing:{pass:'living_story_pass',together:'living_story_together'},ending:{keep:'living_story_keep',leave:'living_story_leave',display:'living_story_display'}})[episode]?.[choice];
