const sources=[['autodetect','Detect language'],['zh-CN','Chinese'],['ja','Japanese'],['es','Spanish'],['fr','French'],['de','German'],['ko','Korean'],['pt','Portuguese'],['it','Italian'],['ar','Arabic'],['ru','Russian'],['uk','Ukrainian'],['hi','Hindi'],['vi','Vietnamese'],['th','Thai'],['id','Indonesian'],['en','English']];
export function addMessageTranslation(article,{channel,messageId}){
  article.querySelectorAll(':scope > p,:scope > div > strong').forEach(node=>node.setAttribute('data-i18n-ignore',''));
  const box=document.createElement('div');box.className='message-translation';
  box.innerHTML='<button type="button" class="translate-message" aria-expanded="false" title="Sends only this message to MyMemory for translation.">Translate to English</button><div class="translation-controls" hidden><label>Source language<select aria-label="Source language"></select></label><button type="button" class="translation-retry">Translate</button><p class="translation-disclosure">Only this message is sent to MyMemory. Machine translations may be inaccurate.</p></div><p class="translation-result" lang="en" translate="no" hidden></p><p class="translation-error" role="status"></p>';
  const button=box.querySelector('.translate-message'),panel=box.querySelector('.translation-controls'),result=box.querySelector('.translation-result'),select=box.querySelector('select'),error=box.querySelector('.translation-error');
  for(const [code,name] of sources){const option=document.createElement('option');option.value=code;option.textContent=name;select.append(option);}
  const body=article.querySelector(':scope > p')?.textContent||'';
  select.value=/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(body)?'ja':/\p{Script=Han}/u.test(body)?'zh-CN':'autodetect';
  let controller,busy=false;
  async function run(){
    if(busy)return;busy=true;controller=new AbortController();button.disabled=true;box.querySelector('.translation-retry').disabled=true;error.textContent='Translating…';
    try{
      const response=await fetch('/api/translate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel,messageId,source:select.value}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Translation is temporarily unavailable. Please try again later.');
      if(!article.isConnected)return;
      // Decode provider entities without interpreting provider text as HTML.
      const decoder=document.createElement('textarea');decoder.innerHTML=data.translatedText;
      result.textContent=decoder.value;result.hidden=false;error.textContent='';button.textContent='Hide translation';button.setAttribute('aria-expanded','true');
    }catch(e){if(article.isConnected&&e.name!=='AbortError')error.textContent=e.name==='TimeoutError'?'Translation is temporarily unavailable. Please try again later.':e.message;}
    finally{busy=false;if(article.isConnected){button.disabled=false;box.querySelector('.translation-retry').disabled=false;}}
  }
  button.onclick=()=>{panel.hidden=false;if(!result.hidden){result.hidden=true;button.textContent='Translate to English';button.setAttribute('aria-expanded','false');return;}if(result.textContent){result.hidden=false;button.textContent='Hide translation';button.setAttribute('aria-expanded','true');}else run();};
  box.querySelector('.translation-retry').onclick=run;
  article.append(box);
  return ()=>controller?.abort();
}
