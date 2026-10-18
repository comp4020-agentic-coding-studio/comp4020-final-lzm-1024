const key='campuswall-appearance',modes=['system','light','dark'];
let preference='system',media,installed=false;
function valid(value){return modes.includes(value)?value:'system';}
function apply(){
  const theme=preference==='dark'||preference==='system'&&media?.matches?'dark':'light';
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#14181d':'#f7f6f2');
  document.querySelectorAll('.appearance-picker select').forEach(select=>select.value=preference);
}
export function setAppearance(value){
  preference=valid(value);
  try{localStorage.setItem(key,preference);}catch{}
  apply();
}
export function mountAppearancePicker(){
  const nav=document.querySelector('#header nav');if(!nav||nav.querySelector('.appearance-picker'))return;
  const label=document.createElement('label');label.className='appearance-picker';
  label.innerHTML='<span aria-hidden="true">◐</span><select aria-label="Appearance"><option value="system">Follow system</option><option value="light">Light mode</option><option value="dark">Dark mode</option></select>';
  const select=label.querySelector('select');select.value=preference;select.onchange=()=>setAppearance(select.value);nav.append(label);
}
export function installAppearance(){
  if(installed)return;installed=true;
  media=window.matchMedia?.('(prefers-color-scheme: dark)');
  try{preference=valid(localStorage.getItem(key));}catch{preference='system';}
  const change=()=>apply(),storage=event=>{if(event.key===key||event.key===null){preference=valid(event.key===null?null:event.newValue);apply();}};
  media?.addEventListener('change',change);window.addEventListener('storage',storage);apply();mountAppearancePicker();
  return ()=>{installed=false;media?.removeEventListener('change',change);window.removeEventListener('storage',storage);};
}
