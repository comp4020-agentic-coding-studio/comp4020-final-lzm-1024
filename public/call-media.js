// Keep incoming audio and video separate, and expose autoplay failures to the user.
export function createRemotePlayback({audio,video,onStatus,Stream=globalThis.MediaStream}){
 let active=true;const tracks=new Set(),listeners=[],state={audioBlocked:false,videoBlocked:false};
 const listen=(target,event,fn)=>{target.addEventListener?.(event,fn);listeners.push(()=>target.removeEventListener?.(event,fn));};
 function update(key,value){if(!active||state[key]===value)return;state[key]=value;onStatus({...state});}
 function play(element,key){if(!active||!element.srcObject)return Promise.resolve();const source=element.srcObject;return Promise.resolve().then(()=>{if(active&&element.srcObject===source)return element.play();}).then(()=>{if(active&&element.srcObject===source)update(key,false);},()=>{if(active&&element.srcObject===source)update(key,true);});}
 // Invoke play synchronously inside a button gesture, before awaiting either player.
 function resume(element,key){if(!active||!element.srcObject)return Promise.resolve();const source=element.srcObject;let result;try{result=element.play();}catch{update(key,true);return Promise.resolve();}return Promise.resolve(result).then(()=>{if(active&&element.srcObject===source)update(key,false);},()=>{if(active&&element.srcObject===source)update(key,true);});}
 for(const [element,key] of [[audio,'audioBlocked'],[video,'videoBlocked']]){
  element.autoplay=true;element.setAttribute('playsinline','');element.setAttribute('webkit-playsinline','');
  listen(element,'loadedmetadata',()=>play(element,key));listen(element,'canplay',()=>play(element,key));
  listen(element,'playing',()=>update(key,false));listen(element,'pause',()=>{if(element.srcObject)update(key,true);});
 }
 video.muted=true;video.defaultMuted=true;video.setAttribute('muted','');
 return {
  add(track){if(!active||tracks.has(track)||!['audio','video'].includes(track.kind))return;tracks.add(track);const element=track.kind==='video'?video:audio,key=track.kind==='video'?'videoBlocked':'audioBlocked';
   if(!element.srcObject)element.srcObject=new Stream();for(const old of element.srcObject.getTracks())if(old!==track)element.srcObject.removeTrack(old);element.srcObject.addTrack(track);
   listen(track,'unmute',()=>play(element,key));play(element,key);
  },
  resumeVideo:()=>resume(video,'videoBlocked'),
  resumeAll:()=>Promise.all([resume(audio,'audioBlocked'),resume(video,'videoBlocked')]),
  close(){active=false;listeners.splice(0).forEach(remove=>remove());tracks.clear();for(const element of [audio,video]){element.pause();element.srcObject=null;}}
 };
}
