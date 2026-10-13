// Translation is an explicit, authorised operation. No text or translation is stored.
export const sourceLanguages=new Set(['autodetect','zh-CN','ja','es','fr','de','ko','pt','it','ar','ru','uk','hi','vi','th','id','en']);
export function translationChunks(text,maxBytes=480){
  const result=[];let chunk='',size=0;
  for(const char of text){const bytes=Buffer.byteLength(char);if(size+bytes>maxBytes){result.push(chunk);chunk='';size=0;}chunk+=char;size+=bytes;}
  if(chunk)result.push(chunk);return result;
}
export function createTranslator({fetchImpl=fetch,now=Date.now}={}){
  const limits=new Map();let concurrent=0,minute=0,total=0;
  return async function translate(text,source,actor){
    if(!sourceLanguages.has(source)||typeof text!=='string'||!text.trim()||text.length>2000)throw Object.assign(Error('Choose a valid message and source language.'),{status:400});
    const stamp=Math.floor(now()/60000);
    if(stamp!==minute){minute=stamp;total=0;limits.clear();}
    if((limits.get(actor)||0)>=10||total>=60||concurrent>=4)throw Object.assign(Error('Translation is busy. Please try again in a minute.'),{status:429});
    limits.set(actor,(limits.get(actor)||0)+1);total++;concurrent++;
    const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]);
    try{
      const parts=translationChunks(text),output=new Array(parts.length);let next=0;
      await Promise.all(Array.from({length:Math.min(3,parts.length)},async()=>{
        while(next<parts.length){
          const index=next++,url=new URL('https://api.mymemory.translated.net/get');
          url.searchParams.set('q',parts[index]);url.searchParams.set('langpair',source+'|en');
          const response=await fetchImpl(url,{signal,redirect:'error'});
          if(!response.ok)throw Error('Unavailable');
          const reader=response.body?.getReader();if(!reader)throw Error('Invalid result');
          const chunks=[];let size=0;
          try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128000){await reader.cancel();throw Error('Invalid result');}chunks.push(value);}}finally{reader.releaseLock();}
          const data=JSON.parse(Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))).toString('utf8'));
          if(Number(data.responseStatus)!==200||data.quotaFinished||typeof data.responseData?.translatedText!=='string')throw Error('Unavailable');
          output[index]=data.responseData.translatedText;
          if(output[index].length>6000)throw Error('Invalid result');
        }
      }));
      const translatedText=output.join(' ');
      if(translatedText.length>12000)throw Error('Invalid result');
      return {translatedText,provider:'MyMemory',target:'en'};
    }catch{throw Object.assign(Error('Translation is temporarily unavailable. Please try again later.'),{status:503});}
    finally{controller.abort();concurrent--;}
  };
}
