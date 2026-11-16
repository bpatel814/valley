import { Character } from './characters.js';
// A playful consequence beside the exact written label, never a replacement for it.
export function mountWordFriend(word,{active=()=>true,sound=()=>{},Actor=Character}={}){
 const name = word === 'PUMPKIN' ? 'pumpkin' : ['BOO','GHOST'].includes(word) ? 'ghost' : null;
 if(!name)return null;
 const element=document.createElement('button');element.type='button';
 element.className='meadow-word-friend meadow-word-result__picture';
 element.setAttribute('aria-label',`Your ${word.toLowerCase()} visitor. Tap to say hello.`);
 const actor=new Actor(element,{name,art:false,follow:false,size:'100%'});
 let dead=false,busy=false;
 async function greet(){
  if(dead||busy||!active()||globalThis.document?.hidden)return false;
  busy=true;
  try{try{sound();}catch{}await actor.greet();return !dead;}
  finally{busy=false;}
 }
 const click=()=>{void greet().catch(()=>{});};element.addEventListener('click',click);
 return {element,greet,destroy(){if(dead)return;dead=true;element.removeEventListener('click',click);actor.destroy();element.remove();}};
}

// Keep the already-resolved, profile-correct family picture itself. No new likeness.
export function mountFamilyWordPicture(word,picture,{active=()=>true,sound=()=>{},reduced=()=>!!globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || !!globalThis.document?.documentElement?.classList?.contains('reduced-motion')}={}){
 if(picture?.tagName!=='IMG')return null;
 const element=document.createElement('button');element.type='button';
 element.className='meadow-word-friend meadow-family-word-friend meadow-word-result__picture';
 element.setAttribute('aria-label',`Say hello to the ${String(word).toLowerCase()} picture.`);element.append(picture);
 let dead=false,busy=false,animation=null;
 async function greet(){
  if(dead||busy||!active()||globalThis.document?.hidden)return false;
  busy=true;element.classList.add('is-greeted');try{sound();}catch{}
  try{
   if(!reduced()&&picture.animate){
    animation=picture.animate([{transform:'translateY(0)'},{transform:'translateY(-5%)',offset:.4},{transform:'translateY(0)'}],{duration:440,easing:'ease-out'});
    try{await animation.finished;}catch{}
   }
   return !dead;
  }finally{animation=null;busy=false;}
 }
 const click=()=>{void greet().catch(()=>{});};element.addEventListener('click',click);
 return {element,greet,destroy(){if(dead)return;dead=true;element.removeEventListener('click',click);try{animation?.cancel();}catch{}animation=null;element.remove();}};
}
