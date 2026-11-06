export function publicationHelp(field){
 const details={
  title:{title:'Add an event title',message:'Your poster needs an event title before it can appear on the wall.',steps:['Open Event details and enter a name in Event title.','Wait until the editor shows Connected · Saved.','Select Publish again.'],actionLabel:'Go to Event title'},
  date:{title:'Add an event date',message:'Your poster needs an event date so other students know when it happens.',steps:['Open Event details and choose the actual event date in Date.','A date written on the canvas does not fill the Date field.','Wait until the editor shows Connected · Saved, then select Publish again.'],actionLabel:'Go to Date'},
  location:{title:'Add an event location',message:'Your poster needs a location so other students know where to go.',steps:['Open Event details and enter the venue or meeting place in Location.','A location written on the canvas does not fill the Location field.','Wait until the editor shows Connected · Saved, then select Publish again.'],actionLabel:'Go to Location'}
 };
 return details[field]||null;
}

export function explainFeedback(message,{kind='info'}={}){
 const text=String(message??'');
 if(/still uploading/i.test(text))return {kind:'warning',title:'Your upload is still in progress',message:text,steps:['Keep this page open while the upload finishes.','Wait for Connected · Saved before publishing or leaving the editor.']};
 if(/changes are still saving|wait for reconnection|connection lost before changes|connection interrupted.*saved canvas/i.test(text))return {kind:'warning',title:'Wait for the editor to reconnect and save',message:text,steps:['Check your internet connection and keep the editor open.','Wait until the editor shows Connected · Saved, then try again.','Changes without a save confirmation may not be kept after reconnecting.']};
 if(/wait for.*live connection|connection interrupted/i.test(text))return {kind:'warning',title:'Wait for the connection to return',message:text,steps:['Check your internet connection.','Keep this page open until the connection returns, then try again.']};
 if(/^(?:failed to fetch|fetch failed|networkerror|load failed)$/i.test(text))return {kind:'error',title:'We could not reach CampusWall',message:text,steps:['Check your internet connection.','Try the action again once you are online. Avoid refreshing an editor with unsaved changes.']};
 if(/^(?:sign in\b|authentication required|sign in required|please sign in)/i.test(text))return {kind:'warning',title:'Sign in to continue',message:text,steps:['Use Sign in to access your account again.','Return to this page and repeat the action.']};
 if(/(?:camera|microphone).*not allowed|(?:camera|microphone).*permission.*denied/i.test(text))return {kind:'error',title:'Allow access to your call devices',message:text,steps:['Open this website’s permissions in your browser and allow the microphone.','For a video call, also allow the camera.','Return to the conversation and start or answer the call again.']};
 if(kind==='info'&&/\b(?:unable to|could not|connection failed|permission denied|not allowed|invalid\b)/i.test(text))kind='error';
 return {kind,title:kind==='error'?'That action could not be completed':'CampusWall update',message:text,steps:[]};
}

export function createFeedback({node,document:doc=node.ownerDocument,setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,celebrationTimer=null,dialog=null,restoreFocus=null,persistent=false,hovering=false;
 const element=(tag,className,text)=>{const el=doc.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
 function dismiss(){clearTimer(timer);hovering=false;const focused=node.contains(doc.activeElement);node.classList.remove('show');node.hidden=true;node.replaceChildren();if(focused&&restoreFocus?.isConnected)restoreFocus.focus();}
 function arm(){clearTimer(timer);if(!node.hidden&&!persistent&&!hovering&&!node.contains(doc.activeElement))timer=setTimer(dismiss,7000);}
 node.hidden=true;
 node.addEventListener('pointerenter',()=>{hovering=true;clearTimer(timer);});node.addEventListener('pointerleave',()=>{hovering=false;arm();});
 node.addEventListener('focusin',()=>clearTimer(timer));node.addEventListener('focusout',event=>{if(!node.contains(event.relatedTarget))queueMicrotask(arm);});
 function show(message,options={}){
  const detail=explainFeedback(message,options);clearTimer(timer);if(!node.contains(doc.activeElement))restoreFocus=doc.activeElement;persistent=detail.kind!=='info';
  node.hidden=false;node.replaceChildren();node.className='feedback-notice';node.dataset.kind=detail.kind;node.setAttribute('role',persistent?'alert':'status');node.setAttribute('aria-live',persistent?'assertive':'polite');node.setAttribute('aria-atomic','true');
  const icon=element('span','feedback-icon',persistent?'!':'i');icon.setAttribute('aria-hidden','true');const body=element('div','feedback-body');body.append(element('strong','feedback-title',detail.title),element('p','feedback-message',detail.message));
  if(detail.steps.length){body.append(element('strong','feedback-next','What to do next'));const list=element('ol','feedback-steps');for(const step of detail.steps)list.append(element('li','',step));body.append(list);}
  const close=element('button','feedback-dismiss','×');close.type='button';close.setAttribute('aria-label','Dismiss notification');close.onclick=dismiss;node.append(icon,body,close);node.classList.add('show');arm();
 }
 function closeHelp(){clearTimer(celebrationTimer);celebrationTimer=null;if(!dialog)return;const current=dialog;dialog=null;if(current.open)current.close();current.remove();}
 function celebrate(){
  closeHelp();dismiss();const previous=doc.activeElement,current=element('dialog','dialog feedback-dialog publish-celebration');dialog=current;current.setAttribute('aria-labelledby','published-heading');current.setAttribute('aria-describedby','published-description');
  const icon=element('div','celebration-icon','🎉');icon.setAttribute('aria-hidden','true');const badge=element('span','feedback-help-badge','PUBLISHED SUCCESSFULLY'),heading=element('h2','','Congratulations!');heading.id='published-heading';
  const message=element('p','celebration-message','Your poster is live!');message.id='published-description';const copy=element('p','feedback-description','Your event is now on your campus wall. Let your friends know!'),button=element('button','primary','View my poster');button.type='button';button.autofocus=true;
  const close=element('button','feedback-dismiss celebration-dismiss','×');close.type='button';close.setAttribute('aria-label','Close celebration');
  const finish=()=>{closeHelp();if(previous?.isConnected)previous.focus();};button.onclick=close.onclick=finish;current.addEventListener('keydown',event=>event.stopPropagation());current.addEventListener('cancel',event=>{event.preventDefault();finish();});current.addEventListener('close',()=>{if(dialog===current){clearTimer(celebrationTimer);celebrationTimer=null;dialog=null;}current.remove();});
  current.append(close,icon,badge,heading,message,copy,button);
  if(!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches){const confetti=element('div','publish-confetti');confetti.setAttribute('aria-hidden','true');for(let i=0;i<28;i++){const piece=element('i','');piece.style.setProperty('--x',`${(i*37)%100}%`);piece.style.setProperty('--sway',`${(i%2?1:-1)*(30+(i*11)%80)}px`);piece.style.setProperty('--delay',`${(i%7)*50}ms`);piece.style.setProperty('--colour',['#e9bc59','#60bea2','#b4a1ed','#ed92ac','#79bce8'][i%5]);confetti.append(piece);}current.append(confetti);celebrationTimer=setTimer(()=>{confetti.remove();if(dialog===current)celebrationTimer=null;},3100);}
  doc.body.append(current);current.showModal();
 }
 function help(detail,onAction){
  closeHelp();const previous=doc.activeElement,current=element('dialog','dialog feedback-dialog');dialog=current;current.setAttribute('role','alertdialog');current.setAttribute('aria-labelledby','feedback-heading');current.setAttribute('aria-describedby','feedback-description');
  const heading=element('h2','',detail.title);heading.id='feedback-heading';const description=element('p','feedback-description',detail.message);description.id='feedback-description';const list=element('ol','feedback-help-steps');for(const [index,step] of detail.steps.entries()){const item=element('li',''),number=element('span','feedback-step-number',String(index+1));number.setAttribute('aria-hidden','true');item.append(number,element('span','',step));list.append(item);}
  const badge=element('span','feedback-help-badge','Before you publish'),actions=element('div','feedback-help-actions'),go=element('button','primary',detail.actionLabel),cancel=element('button','','Keep editing');go.type=cancel.type='button';go.autofocus=true;
  const finish=action=>{if(dialog===current)dialog=null;if(current.open)current.close();current.remove();if(previous?.isConnected)previous.focus();if(action)onAction?.();};
  current.addEventListener('keydown',event=>event.stopPropagation());
  go.onclick=()=>finish(true);cancel.onclick=()=>finish(false);current.addEventListener('cancel',event=>{event.preventDefault();finish(false);});current.addEventListener('close',()=>{if(dialog===current)dialog=null;current.remove();});
  actions.append(go,cancel);current.append(badge,heading,description,element('h3','','How to fix it'),list,actions);doc.body.append(current);current.showModal();
 }
 return {show,help,celebrate,dismiss,closeHelp};
}
