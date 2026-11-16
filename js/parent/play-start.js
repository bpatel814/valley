// One parent action owns startup. Fullscreen request runs in the original gesture.
export function playStart({ enter, standalone, start, report=()=>{}, available=()=>true }) {
  let live=true,busy=false,serial=0;
  return {
    async play(full=false){
      if(!live||busy||!available())return false;
      busy=true;const ticket=++serial;const current=()=>live&&ticket===serial&&available();report('opening');
      try{
        if(full){const result=await enter();if(!current()){if(live&&ticket===serial)report('canceled');return false;}if(!result?.entered&&!standalone()){report('unavailable');return false;}}
        if(!current()){if(live&&ticket===serial)report('canceled');return false;}
        const result=await start(current);
        if(current())report(result===false?'error':'ready');
        else if(live&&ticket===serial)report('canceled');
        return result!==false;
      }catch(error){if(current())report('error',error);return false;}
      finally{busy=false;if(live&&ticket===serial)report('settled');}
    },
    destroy(){live=false;serial++;},
  };
}
