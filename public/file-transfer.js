export const fileSize=bytes=>bytes>=1024*1024?(bytes/1024/1024).toFixed(1)+' MB':Math.max(1,Math.ceil(bytes/1024))+' KB';
export function fileAttachment(file){
  if(!/^[a-f0-9-]{36}$/.test(file?.id||''))return null;
  const link=document.createElement('a');link.className='dm-file';link.href='/api/messages/files/'+file.id;link.download=file.name;
  const icon=document.createElement('span');icon.className='dm-file-icon';icon.textContent='↧';icon.setAttribute('aria-hidden','true');
  const copy=document.createElement('span'),name=document.createElement('strong'),size=document.createElement('small'),action=document.createElement('span');
  name.textContent=file.name;name.setAttribute('translate','no');size.textContent=fileSize(file.bytes);size.setAttribute('translate','no');action.textContent='Download file';copy.append(name,size);link.append(icon,copy,action);return link;
}
export function mountFileTransfer(form,{conversationId,onMessage,onError,onAuthExpired,isReady}){
  let active=true,file=null,clientId=null,xhr=null;
  const tools=document.createElement('div');tools.className='dm-file-tools';
  tools.innerHTML='<label class="dm-file-picker"><span>Attach file</span><input type="file" aria-label="Choose file"></label><span class="dm-file-limit">Up to 10 MB per file</span><div class="dm-file-selection" hidden><span class="dm-file-selected" translate="no"></span><button type="button" class="dm-file-send">Send file</button><button type="button" class="dm-file-clear">Remove file</button></div><progress max="100" value="0" aria-label="File upload progress" hidden></progress><p class="dm-file-status" role="status"></p><button type="button" class="dm-file-cancel" hidden>Cancel upload</button>';
  form.append(tools);
  const input=tools.querySelector('input'),selection=tools.querySelector('.dm-file-selection'),send=tools.querySelector('.dm-file-send'),clear=tools.querySelector('.dm-file-clear'),progress=tools.querySelector('progress'),status=tools.querySelector('.dm-file-status'),cancel=tools.querySelector('.dm-file-cancel');
  function update(){if(!active)return;input.disabled=!!xhr;send.disabled=!!xhr||!file||!isReady();clear.disabled=!!xhr;selection.hidden=!file;progress.hidden=!xhr;cancel.hidden=!xhr;}
  function finish(){xhr=null;update();}
  input.onchange=()=>{
    const chosen=input.files?.[0];if(!chosen)return;
    file=null;clientId=null;
    if(!chosen.size||chosen.size>10*1024*1024){input.value='';status.textContent='Choose a file between 1 byte and 10 MB';update();return;}
    if(chosen.name.length>180||/[\x00-\x1f\x7f/\\]/.test(chosen.name)){input.value='';status.textContent='Choose a file with a valid name of at most 180 characters';update();return;}
    file=chosen;clientId=crypto.randomUUID();tools.querySelector('.dm-file-selected').textContent=file.name+' · '+fileSize(file.size);status.textContent='';update();
  };
  clear.onclick=()=>{file=null;clientId=null;input.value='';status.textContent='';update();};
  send.onclick=()=>{
    if(xhr||!file||!isReady())return;
    const request=new XMLHttpRequest();xhr=request;request.open('POST','/api/messages/conversations/'+conversationId+'/files');request.timeout=125000;
    request.setRequestHeader('content-type','application/octet-stream');request.setRequestHeader('x-file-name',encodeURIComponent(file.name));request.setRequestHeader('x-client-id',clientId);
    progress.value=0;status.textContent='Uploading file…';update();
    request.upload.onprogress=e=>{if(!active||xhr!==request)return;if(e.lengthComputable)progress.value=Math.min(100,Math.round(e.loaded/e.total*100));status.textContent=e.lengthComputable&&e.loaded===e.total?'Saving file…':'Uploading file…';};
    request.onload=()=>{
      if(!active||xhr!==request)return;
      let result;try{result=JSON.parse(request.responseText);}catch{}
      if(request.status>=200&&request.status<300&&result?.message?.attachment){file=null;clientId=null;input.value='';status.textContent='File sent';finish();onMessage(result);}
      else{status.textContent=result?.error||'Upload failed. Select Send file to retry.';finish();if(request.status===401)onAuthExpired();onError(Error(status.textContent));}
    };
    request.onerror=request.ontimeout=()=>{if(active&&xhr===request){status.textContent='Upload failed. Select Send file to retry.';finish();}};
    request.onabort=()=>{if(active&&xhr===request){status.textContent='Upload stopped. Check the conversation before retrying.';finish();}};
    try{request.send(file);}catch{status.textContent='Upload failed. Select Send file to retry.';finish();}
  };
  cancel.onclick=()=>xhr?.abort();update();
  return {update,destroy(){active=false;xhr?.abort();xhr=null;file=null;tools.remove();}};
}
