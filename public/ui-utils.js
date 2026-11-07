const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,character=>entities[character]);
export const normaliseSearch=value=>String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();

// Load account services only for a signed-in user. A late import must never
// recreate a service for an account that has already signed out or changed.
export function createSessionMount(load){
  let mount,loading,generation=0;
  return async options=>{
    const current=++generation;
    if(mount)return mount(options);
    if(!options.user)return;
    loading??=Promise.resolve().then(load).then(value=>mount=value).catch(error=>{loading=null;throw error;});
    try{const ready=await loading;if(current===generation)return ready(options);}
    catch(error){if(current===generation)throw error;}
  };
}

const stylesheets=new Map();
export function loadStylesheet(href){
  if(stylesheets.has(href))return stylesheets.get(href);
  const promise=new Promise((resolve,reject)=>{
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;
    link.onload=()=>resolve();
    link.onerror=()=>{link.remove();stylesheets.delete(href);reject(new Error('Unable to load page styles. Please try again.'));};
    document.head.append(link);
  });
  stylesheets.set(href,promise);return promise;
}

// A web address people may follow: http(s) only, otherwise ''.
export function safeUrl(value){try{const url=new URL(String(value||'').trim());return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
// Escaped text with http(s) addresses turned into links. Nothing else becomes markup.
export function linkify(text){
  return String(text??'').split(/(https?:\/\/[^\s<>"']+)/g).map((part,i)=>{
    if(i%2===0)return escapeHtml(part);
    const trail=part.match(/[).,;:!?]+$/)?.[0]||'',raw=trail?part.slice(0,-trail.length):part,href=safeUrl(raw);
    if(!href)return escapeHtml(part);
    const label=raw.replace(/^https?:\/\/(www\.)?/,'');
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow ugc">${escapeHtml(label.length>48?label.slice(0,45)+'…':label)}</a>${escapeHtml(trail)}`;
  }).join('');
}
