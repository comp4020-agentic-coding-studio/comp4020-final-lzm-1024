// One caller offer, one recipient answer. Serialize both directions and retain early ICE.
export function createAudioTransport({stream,iceServers,onSignal,onTrack,onConnected,onFailed,PeerConnection=globalThis.RTCPeerConnection}) {
 const pc=new PeerConnection({iceServers});let closed=false,offered=false,ready=false,connected=false,incoming=Promise.resolve(),outgoing=Promise.resolve();const early=[],pending=[];
 const fail=error=>{if(!closed)onFailed(error);};
 const publish=signal=>{outgoing=outgoing.then(()=>closed?undefined:onSignal(signal));outgoing.catch(fail);return outgoing;};
 const description=async()=>{await publish({description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});if(closed)return;ready=true;for(const candidate of pending.splice(0))await publish({candidate});};
 for(const track of stream.getAudioTracks())pc.addTrack(track,stream);
 pc.onicecandidate=e=>{const candidate=e.candidate?.toJSON()||null;if(ready)publish({candidate});else pending.push(candidate);};
 pc.ontrack=e=>{if(!closed)onTrack(e);};
 pc.onconnectionstatechange=()=>{if(closed)return;if(pc.connectionState==='connected'&&!connected){connected=true;Promise.resolve(onConnected()).catch(fail);}else if(pc.connectionState==='failed')fail(Error('The audio connection could not be established. Try another network.'));};
 return {
  async offer(){if(closed||offered)return;offered=true;await pc.setLocalDescription(await pc.createOffer());if(!closed)await description();},
  receive(signal){incoming=incoming.then(async()=>{if(closed)return;if(signal.description){await pc.setRemoteDescription(signal.description);for(const candidate of early.splice(0))await pc.addIceCandidate(candidate);if(signal.description.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());if(!closed)await description();}}else if(Object.hasOwn(signal,'candidate')){if(pc.remoteDescription)await pc.addIceCandidate(signal.candidate);else early.push(signal.candidate);}});incoming.catch(fail);return incoming;},
  mute(value){for(const track of stream.getAudioTracks())track.enabled=!value;},
  close(){if(closed)return;closed=true;pc.onicecandidate=null;pc.ontrack=null;pc.onconnectionstatechange=null;pc.close();for(const track of stream.getTracks())track.stop();early.length=0;pending.length=0;}
 };
}
