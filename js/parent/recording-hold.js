// One explicitly held pointer owns one recording attempt. No microphone APIs here.
export function recordingHold({ start, report=()=>{}, limit=10000, schedule=setTimeout, unschedule=clearTimeout }){
 let live=true,serial=0,owner=null,handle=null,timer=null;
 const clear=()=>{if(timer!==null)unschedule(timer);timer=null;};
 function cancel(){serial++;owner=null;clear();const old=handle;handle=null;try{old?.cancel();}catch{}if(live)report('idle');}
 async function finish(id,save=true){
  if(!live||owner!==id)return false;
  const ticket=++serial;owner=null;clear();const old=handle;handle=null;report('idle');
  if(!old)return false; // Pending start will see the retired serial and cancel itself.
  if(!save){try{old.cancel();}catch{}return false;}
  try{await old.stop();if(live&&ticket===serial)report('saved');return true;}
  catch(error){if(live&&ticket===serial)report('error',error);return false;}
 }
 return {
  async begin(id){
   if(!live||owner!==null||id==null)return false;
   owner=id;const ticket=++serial;report('pending');
   try{
    const result=await start(() => live && ticket === serial && owner === id);
    if(!live||ticket!==serial||owner!==id){try{result?.cancel();}catch{}return false;}
    handle=result;report('recording');timer=schedule(()=>{void finish(id,true);},limit);return true;
   }catch(error){if(live&&ticket===serial){owner=null;report('error',error);}return false;}
  },finish,cancel,
  destroy(){if(!live)return;live=false;cancel();},
 };
}
