// The caller owns negotiation, including at most two ICE recovery attempts.
export function createAudioTransport({stream,iceServers,onSignal,onTrack,onConnected,onFailed,onState=()=>{},mode='audio',PeerConnection=globalThis.RTCPeerConnection,setTimer=setTimeout,clearTimer=clearTimeout}) {
 const pc=new PeerConnection({iceServers});let closed=false,failed=false,offered=false,ready=false,connected=false,restarts=0,setupStarted=false,recovering=false,recoveryTimer=null,disconnectTimer=null,incoming=Promise.resolve(),outgoing=Promise.resolve();const early=[],pending=[];
 const clearRecovery=()=>{clearTimer(recoveryTimer);clearTimer(disconnectTimer);recoveryTimer=disconnectTimer=null;};
 const settleRecovery=()=>{if(pc.signalingState==='stable'&&pc.connectionState==='connected'&&['connected','completed'].includes(pc.iceConnectionState)){clearRecovery();recovering=false;onState('connected');}};
 const fail=error=>{if(!closed&&!failed){failed=true;clearRecovery();onFailed(error);}};
 const publish=signal=>{outgoing=outgoing.then(()=>closed?undefined:onSignal(signal));outgoing.catch(fail);return outgoing;};
 async function limitVideo(){for(const sender of pc.getSenders?.()||[]){if(sender.track?.kind!=='video'||!sender.getParameters||!sender.setParameters)continue;try{const p=sender.getParameters();if(!p.encodings?.length)continue;for(const e of p.encodings){e.maxBitrate=600000;e.maxFramerate=24;}await sender.setParameters(p);}catch{/* Browsers without encoder controls retain the capture limits. */}}}
 const description=async()=>{await publish({description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});if(closed)return;ready=true;for(const candidate of pending.splice(0))await publish({candidate});await limitVideo();};
 const recoveryDeadline=(ms=12000)=>{clearTimer(recoveryTimer);recoveryTimer=setTimer(()=>{recovering=false;if(offered&&pc.signalingState&&pc.signalingState!=='stable')fail(Error('The call could not reconnect. Try calling again or use another network.'));else recover().catch(fail);},ms);};
 const startSetup=()=>{if(!setupStarted&&!connected){setupStarted=true;recoveryDeadline(16000);}};
 async function recover(){
  if(closed||failed||recovering)return;
  if(!pc.remoteDescription)return fail(Error('The call connection could not be established. Try another network.'));
  if(restarts>=2)return fail(Error('The call could not reconnect. Try calling again or use another network.'));
  // A pending offer already gathers candidates; let its answer finish first.
  if(offered&&pc.signalingState&&pc.signalingState!=='stable'){recoveryDeadline();return;}
  restarts++;recovering=true;onState('reconnecting');recoveryDeadline();
  if(offered){ready=false;await pc.setLocalDescription(await pc.createOffer({iceRestart:true}));if(!closed)await description();}
  else await publish({restart:true});
 }
 for(const track of [...stream.getAudioTracks(),...(mode==='video'?stream.getVideoTracks():[])])pc.addTrack(track,stream);
 pc.onicecandidate=e=>{const candidate=e.candidate?.toJSON()||null;if(ready)publish({candidate});else pending.push(candidate);};
 pc.ontrack=e=>{if(!closed)onTrack(e);};
 pc.oniceconnectionstatechange=()=>{if(closed||failed)return;if(['connected','completed'].includes(pc.iceConnectionState)&&pc.connectionState==='connected'){clearRecovery();recovering=false;onState('connected');}else if(pc.iceConnectionState==='failed')recover().catch(fail);};
 pc.onconnectionstatechange=()=>{
  if(closed||failed)return;
  if(pc.connectionState==='connected'){clearRecovery();recovering=false;onState('connected');if(!connected){connected=true;Promise.resolve(onConnected()).catch(fail);}}
  else if(pc.connectionState==='failed')recover().catch(fail);
  else if(pc.connectionState==='disconnected'){onState('reconnecting');if(!disconnectTimer)disconnectTimer=setTimer(()=>{disconnectTimer=null;recover().catch(fail);},4000);}
 };
 return {
  async diagnostics(){
   const result={connection:pc.connectionState||'unknown',ice:pc.iceConnectionState||'unknown',negotiation:pc.signalingState||'unknown',relayConfigured:(iceServers||[]).some(s=>[s.urls].flat().some(url=>/^turns?:/.test(url))),networkPath:false,audioBytesReceived:0,videoBytesReceived:0,videoFramesDecoded:0};
   try{const stats=await pc.getStats();for(const item of stats.values()){if(item.type==='transport'&&item.selectedCandidatePairId)result.networkPath=true;if(item.type==='inbound-rtp'&&!item.isRemote){const kind=item.kind||item.mediaType;if(kind==='audio')result.audioBytesReceived+=Number(item.bytesReceived)||0;if(kind==='video'){result.videoBytesReceived+=Number(item.bytesReceived)||0;result.videoFramesDecoded+=Number(item.framesDecoded)||0;}}}}catch{result.statsUnavailable=true;}
   return result;
  },
  async offer(){if(closed||offered)return;offered=true;await pc.setLocalDescription(await pc.createOffer());startSetup();if(!closed)await description();},
  receive(signal){incoming=incoming.then(async()=>{if(closed||failed)return;if(signal.restart){if(offered)await recover();return;}if(signal.description){await pc.setRemoteDescription(signal.description);for(const candidate of early.splice(0))await pc.addIceCandidate(candidate);if(signal.description.type==='offer'){ready=false;await pc.setLocalDescription(await pc.createAnswer());startSetup();if(!closed)await description();}if(!closed)settleRecovery();}else if(Object.hasOwn(signal,'candidate')){if(pc.remoteDescription)await pc.addIceCandidate(signal.candidate);else early.push(signal.candidate);}});incoming.catch(fail);return incoming;},
  mute(value){for(const track of stream.getAudioTracks())track.enabled=!value;},
  camera(value){for(const track of stream.getVideoTracks?.()||[])track.enabled=value;},
  close(){if(closed)return;closed=true;clearRecovery();pc.onicecandidate=null;pc.ontrack=null;pc.onconnectionstatechange=null;pc.oniceconnectionstatechange=null;pc.close();for(const track of stream.getTracks())track.stop();early.length=0;pending.length=0;}
 };
}
