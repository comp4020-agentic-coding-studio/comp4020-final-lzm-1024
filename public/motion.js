// One delegated motion layer: no per-card mouse listeners or cached API results.
const ease='cubic-bezier(.22,1,.36,1)';
let installed=false,preferences,progress,pending=0,showTimer,hideTimer,activated,activatedAt=0;
const animations=new Set(),busy=new Map();
const closing=new WeakSet();
const enabled=()=>installed&&!preferences.matches&&!document.hidden;
function play(node,frames,options={}){
  if(!enabled()||!node?.isConnected||!node.animate)return;
  const animation=node.animate(frames,{duration:380,easing:ease,...options});
  animations.add(animation);
  animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));
  return animation;
}

export async function withRequestMotion(task){
  if(!installed)return task();
  pending++;clearTimeout(hideTimer);
  if(pending===1)showTimer=setTimeout(()=>{if(pending){progress.hidden=false;progress.classList.remove('complete');}},140);
  const button=Date.now()-activatedAt<700&&activated?.isConnected&&activated.matches('.primary,.button,[data-save],.dm-refresh')?activated:null;
  if(button){busy.set(button,(busy.get(button)||0)+1);button.classList.add('motion-busy');}
  try{return await task();}
  finally{
    if(button){const count=busy.get(button)-1;if(count)busy.set(button,count);else{busy.delete(button);button.classList.remove('motion-busy');}}
    if(--pending===0){clearTimeout(showTimer);progress.classList.add('complete');hideTimer=setTimeout(()=>{progress.hidden=true;},220);}
  }
}
export const motionFetch=(...args)=>withRequestMotion(()=>fetch(...args));

export function closeDialog(dialog){
  if(!dialog?.open||closing.has(dialog))return;
  closing.add(dialog);
  const animation=play(dialog,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(10px) scale(.97)'}],{duration:160});
  const finish=()=>{closing.delete(dialog);if(dialog.open)dialog.close();};
  if(animation)animation.finished.catch(()=>{}).finally(finish);else finish();
}

export function installMotion(){
  if(installed)return;installed=true;
  preferences=matchMedia('(prefers-reduced-motion: reduce)');
  document.documentElement.classList.add('motion-enabled');
  progress=document.createElement('div');progress.className='motion-progress';progress.hidden=true;progress.setAttribute('aria-hidden','true');document.body.append(progress);
  const app=document.querySelector('#app'),seen=new WeakSet(),observed=new Set();
  const revealSelector='.poster-card,.club-card,.game-card,.game-table,.university-grid>a,.club-interest,.dm-person';
  const intersection='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    let order=0;
    for(const entry of entries)if(entry.isIntersecting){intersection.unobserve(entry.target);observed.delete(entry.target);play(entry.target,[{opacity:0,transform:'translateY(20px) scale(.98)'},{opacity:1,transform:'none'}],{duration:480,delay:Math.min(order++*35,175)});}
  },{threshold:.08}):null;
  function reveal(node){
    if(seen.has(node))return;seen.add(node);
    if(!enabled())return;
    if(intersection){observed.add(node);intersection.observe(node);}
    else play(node,[{opacity:.2,transform:'translateY(12px)'},{opacity:1,transform:'none'}]);
  }
  let frame=0;
  const added=new Set(),messages=new Set();
  function flush(){
    frame=0;
    for(const node of observed)if(!node.isConnected){intersection.unobserve(node);observed.delete(node);}
    for(const node of added){
      if(!node.isConnected)continue;
      if(node.matches(revealSelector))reveal(node);
      for(const card of node.querySelectorAll(revealSelector))reveal(card);
      // Animate a new page shell rather than every nested heading/form control.
      if(node.parentElement===app&&!node.matches('.loading'))play(node,[{opacity:.25,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:420});
      if(node.matches('.chat-message,.dm-message'))messages.add(node);
      for(const message of node.querySelectorAll('.chat-message,.dm-message'))messages.add(message);
      if(node.matches('.dialog'))play(node,[{opacity:0,transform:'translateY(18px) scale(.95)'},{opacity:1,transform:'none'}],{duration:320});
    }
    // Cap history animation work; old history remains readable without delay.
    for(const node of [...messages].slice(-8))if(!seen.has(node)){seen.add(node);play(node,[{opacity:0,transform:`translateX(${node.classList.contains('own')?12:-12}px) translateY(6px)`},{opacity:1,transform:'none'}],{duration:280});}
    messages.clear();added.clear();
  }
  new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1&&!node.matches('.motion-ripple,.motion-progress'))added.add(node);
    if(!frame)frame=requestAnimationFrame(flush);
  }).observe(document.body,{childList:true,subtree:true});
  const feedback=new MutationObserver(records=>{
    for(const {target} of records){
      if(target.matches('button[aria-pressed],button[data-saved]'))play(target,[{transform:'scale(.94)'},{transform:'scale(1.035)'},{transform:'none'}],{duration:240});
      if(target.id==='toast'&&target.classList.contains('show'))play(target,[{opacity:0,translate:'0 12px',scale:'.96'},{opacity:1,translate:'0 0',scale:'1'}],{duration:300});
    }
  });
  feedback.observe(document.body,{attributes:true,subtree:true,attributeFilter:['aria-pressed','data-saved','class']});
  function activate(event){
    const target=event.target instanceof Element?event.target.closest('button,a.button,[data-nav],.template-option'):null;
    if(!target||target.disabled||target.getAttribute('aria-disabled')==='true')return;
    activated=target;activatedAt=Date.now();
    if(!enabled())return;
    // Use a fixed overlay so a ripple never changes button labels or layout.
    const rect=target.getBoundingClientRect(),size=Math.min(Math.max(rect.width,rect.height)*1.3,180);
    const ripple=document.createElement('span');ripple.className='motion-ripple';ripple.setAttribute('aria-hidden','true');
    const x=event.detail?event.clientX:rect.left+rect.width/2,y=event.detail?event.clientY:rect.top+rect.height/2;
    Object.assign(ripple.style,{left:`${x-size/2}px`,top:`${y-size/2}px`,width:`${size}px`,height:`${size}px`});document.body.append(ripple);
    const animation=play(ripple,[{opacity:.23,transform:'scale(.05)'},{opacity:0,transform:'scale(1)'}],{duration:420});
    if(animation)animation.finished.catch(()=>{}).finally(()=>ripple.remove());else ripple.remove();
  }
  document.addEventListener('click',activate,true);
  document.addEventListener('submit',event=>{activated=event.submitter||event.target.querySelector('button[type="submit"],button.primary');activatedAt=Date.now();},true);
  document.addEventListener('change',event=>{if(event.target.matches('select,input[type="radio"],input[type="checkbox"]'))play(event.target.closest('label')||event.target,[{opacity:.65,translate:'0 2px'},{opacity:1,translate:'0 0'}],{duration:220});});
  document.addEventListener('invalid',event=>play(event.target,[{translate:'-4px 0'},{translate:'4px 0'},{translate:'-2px 0'},{translate:'0 0'}],{duration:240}),true);
  document.addEventListener('cancel',event=>{if(event.target.tagName==='DIALOG'){event.preventDefault();closeDialog(event.target);}},true);
  // A single RAF updates only the hovered photo on fine-pointer devices.
  const fine=matchMedia('(hover:hover) and (pointer:fine)');let pointerFrame=0,tilted=null,point;
  function resetTilt(){if(tilted){tilted.style.removeProperty('--tilt-x');tilted.style.removeProperty('--tilt-y');tilted=null;}}
  document.addEventListener('pointermove',event=>{
    if(!enabled()||!fine.matches||event.pointerType==='touch')return;
    const card=event.target.closest?.('.poster-card');
    const art=card?.querySelector('.photographic-poster,.poster');
    if(!art){resetTilt();return;}
    if(tilted!==art){resetTilt();tilted=art;}point={x:event.clientX,y:event.clientY};
    if(!pointerFrame)pointerFrame=requestAnimationFrame(()=>{pointerFrame=0;if(!tilted?.isConnected||!enabled())return;const rect=tilted.getBoundingClientRect();tilted.style.setProperty('--tilt-x',`${((point.y-rect.top)/rect.height-.5)*-3}deg`);tilted.style.setProperty('--tilt-y',`${((point.x-rect.left)/rect.width-.5)*3}deg`);});
  },{passive:true});
  document.addEventListener('pointerout',event=>{if(tilted&&!event.relatedTarget?.closest?.('.poster-card'))resetTilt();},{passive:true});
  function stop(){for(const animation of animations)animation.cancel();resetTilt();for(const node of observed)intersection.unobserve(node);observed.clear();document.querySelectorAll('.motion-ripple').forEach(node=>node.remove());}
  preferences.addEventListener('change',()=>{if(preferences.matches)stop();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
}
