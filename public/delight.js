// Warm, optional motion for the campus wall: a friendly greeting, a waving
// mascot, a dreaming robot, drifting petals, a little duck parade and small
// celebrations. Everything here is decoration. It is hidden from assistive
// technology, never blocks input, and stops for reduced-motion preferences, the
// Effects pause control (shared with Games), background tabs and an off-screen hero.
import {fillRobots,robotScene} from './robot.js';
import {loadStylesheet} from './ui-utils.js';
const KEY='campuswall:arcade-effects';
const PETALS=['♥','✿','✦','❀','★','●'],COLOURS=['#f2a7b8','#f3c75f','#9fd3ae','#9ccbec','#cfb2ee','#ffb98f'];
const MAX_PARTICLES=40;

export function greeting(hour=new Date().getHours()){
  if(hour>=5&&hour<12)return ['🌞','Good morning! Lovely to see you.'];
  if(hour>=12&&hour<18)return ['⛅','Good afternoon! Lovely to see you.'];
  return ['🌙','Good evening! Lovely to see you.'];
}

export const mascotSvg='<svg class="delight-mascot" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><path class="delight-leaf" d="M60 26c-2-11 6-19 17-19-1 11-8 18-17 19z" fill="#7fb77e"/><circle cx="60" cy="66" r="38" fill="#f6c453"/><circle cx="22" cy="76" r="8" fill="#f6c453"/><g class="delight-hand"><circle cx="99" cy="58" r="9" fill="#f6c453"/></g><g class="delight-eyes"><ellipse cx="46" cy="60" rx="4.5" ry="6" fill="#3b2a1a"/><ellipse cx="74" cy="60" rx="4.5" ry="6" fill="#3b2a1a"/></g><circle cx="36" cy="74" r="6.5" fill="#f19a9a" opacity=".75"/><circle cx="84" cy="74" r="6.5" fill="#f19a9a" opacity=".75"/><path d="M48 76q12 12 24 0" fill="none" stroke="#3b2a1a" stroke-width="3.5" stroke-linecap="round"/></svg>';

export function mountDelight(root){
  const hero=root.querySelector('.wall-hero');if(!hero)return {celebrate(){},destroy(){}};
  const reduce=matchMedia('(prefers-reduced-motion: reduce)'),cleanups=[];let on=true,visible=true,paradeTimer=null,helloTimer=null,robotTimer=null,destroyed=false;
  try{on=localStorage.getItem(KEY)!=='off';}catch{}
  const allowed=()=>on&&!reduce.matches&&!document.hidden,active=()=>allowed()&&visible;
  const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);cleanups.push(()=>target.removeEventListener(type,handler,options));};

  // A greeting for the time of day, in the visitor's own clock.
  const [icon,text]=greeting();
  hero.firstElementChild?.insertAdjacentHTML('afterbegin',`<p class="delight-greeting"><span class="delight-greeting-icon" aria-hidden="true">${icon}</span> <span>${text}</span></p>`);

  // Drifting petals behind the headline, and a parade of ducks along its edge.
  const sky=document.createElement('div');sky.className='delight-sky';sky.setAttribute('aria-hidden','true');
  sky.innerHTML=Array.from({length:14},(_,i)=>`<span style="--x:${(i*7.3+4)%96}%;--size:${14+(i*5)%16}px;--time:${13+(i*3)%10}s;--delay:-${(i*2.7)%13}s;--sway:${(i%2?1:-1)*(10+i%4*6)}px;color:${COLOURS[i%COLOURS.length]}">${PETALS[i%PETALS.length]}</span>`).join('');
  const parade=document.createElement('div');parade.className='delight-parade';parade.setAttribute('aria-hidden','true');
  parade.innerHTML='<span class="delight-track"><span>🦆</span><span>🐤</span><span>🐤</span><span>🐤</span></span>';
  hero.classList.add('delight-stage');hero.prepend(sky);hero.append(parade);

  // The guide banner gets a friendly mascot that waves hello and answers a tap.
  const mark=root.querySelector('.guide-banner-mark');
  if(mark){mark.classList.add('delight-mascot-holder');mark.innerHTML=`${mascotSvg}<span class="delight-bubble">Hi there!</span>`;
    listen(mark,'pointerdown',()=>{if(!allowed())return;mark.classList.remove('delight-hello');void mark.offsetWidth;mark.classList.add('delight-hello');clearTimeout(helloTimer);helloTimer=setTimeout(()=>mark.classList.remove('delight-hello'),1800);burst(mark,'♥');});}

  // A little robot sleeps above the tagline, dreaming of the city at dusk, the
  // seaside, friends and posters. A tap wakes it to wave hello; then it dozes off.
  const robot=document.createElement('span');robot.className='wall-robot';robot.setAttribute('aria-hidden','true');
  loadStylesheet('/robot.css').then(()=>{if(destroyed)return;robot.innerHTML=`${robotScene('dream',{loop:true})}<span class="robot-say">Hi! I was dreaming about campus.</span>`;(hero.querySelector('.wall-tagline')||hero).prepend(robot);}).catch(()=>{});
  listen(robot,'pointerdown',()=>{
    const scene=robot.querySelector('.robot-scene');if(!scene||!allowed())return;
    scene.classList.remove('robot-sleeping');robot.classList.add('robot-awake');burst(robot.querySelector('.robot'),'♥',undefined,undefined,5);
    clearTimeout(robotTimer);robotTimer=setTimeout(()=>{scene.classList.add('robot-sleeping');robot.classList.remove('robot-awake');},2800);
  });
  // The empty wall's placeholder becomes the same dreaming robot.
  const results=root.querySelector('#results');
  const dreamSlots=()=>{if(!destroyed&&results.querySelector('[data-robot]:not([data-robot-ready])'))fillRobots(results,{loop:true}).catch(()=>{});};
  if(results&&'MutationObserver' in window){const observer=new MutationObserver(dreamSlots);observer.observe(results,{childList:true});cleanups.push(()=>observer.disconnect());dreamSlots();}

  // One shared pause control; hidden when the system asks for reduced motion.
  const toggle=document.createElement('button');toggle.type='button';toggle.className='delight-toggle';
  (hero.querySelector('.wall-tagline')||hero).append(toggle);
  function render(){
    root.classList.toggle('delight-on',on&&!reduce.matches);root.classList.toggle('delight-still',!on||reduce.matches);
    root.classList.toggle('delight-paused',!visible||document.hidden);
    toggle.hidden=reduce.matches;toggle.setAttribute('aria-pressed',String(on));toggle.textContent=on?'✦ Effects on · Pause':'✧ Effects paused · Play';
  }
  toggle.onclick=()=>{on=!on;try{localStorage.setItem(KEY,on?'on':'off');}catch{}render();if(on)scheduleParade(1500);};
  listen(reduce,'change',render);listen(document,'visibilitychange',render);
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;render();},{rootMargin:'40px'});observer.observe(hero);cleanups.push(()=>observer.disconnect());}

  function scheduleParade(delay=26000){clearTimeout(paradeTimer);paradeTimer=setTimeout(()=>{if(active()){parade.classList.remove('walking');void parade.offsetWidth;parade.classList.add('walking');}scheduleParade();},delay);}
  listen(parade,'animationend',event=>{if(event.animationName==='delight-walk')parade.classList.remove('walking');});
  scheduleParade(3500);

  // Little hearts and stars where people tap; capped so nothing piles up.
  function burst(target,glyph,x,y,count=7){
    if(!allowed())return;const box=target.getBoundingClientRect();x??=box.left+box.width/2;y??=box.top+box.height/2;
    for(let i=0;i<count&&document.querySelectorAll('.delight-particle').length<MAX_PARTICLES;i++){
      const p=document.createElement('span'),angle=(Math.PI*2*i)/count+Math.random()*.6,distance=38+Math.random()*34;
      p.className='delight-particle';p.setAttribute('aria-hidden','true');p.textContent=glyph||PETALS[i%3];
      p.style.cssText=`left:${x}px;top:${y}px;color:${COLOURS[(i+2)%COLOURS.length]};--dx:${Math.cos(angle)*distance}px;--dy:${Math.sin(angle)*distance-24}px`;
      p.addEventListener('animationend',()=>p.remove(),{once:true});document.body.append(p);setTimeout(()=>p.remove(),1500);
    }
  }
  listen(hero,'pointerdown',event=>{if(event.target.closest('a,button,input,select,textarea,.wall-robot'))return;burst(hero,null,event.clientX,event.clientY,6);});

  // Filters answer a tap with a small bounce; the poster count pops when it changes.
  const controls=root.querySelector('.wall-controls');
  if(controls)listen(controls,'click',event=>{const chip=event.target.closest('[data-category],[data-date]');if(!chip||!allowed())return;chip.classList.remove('delight-jelly');void chip.offsetWidth;chip.classList.add('delight-jelly');});
  const count=root.querySelector('#count');
  if(count&&'MutationObserver' in window){const observer=new MutationObserver(()=>{if(!allowed())return;count.classList.remove('delight-pop');void count.offsetWidth;count.classList.add('delight-pop');});observer.observe(count,{childList:true,characterData:true,subtree:true});cleanups.push(()=>observer.disconnect());}

  render();
  return {
    // Called only after the server has accepted a save.
    celebrate(button){burst(button,'♥',undefined,undefined,9);},
    destroy(){destroyed=true;clearTimeout(paradeTimer);clearTimeout(helloTimer);clearTimeout(robotTimer);robot.remove();for(const cleanup of cleanups)cleanup();document.querySelectorAll('.delight-particle').forEach(p=>p.remove());root.classList.remove('delight-on','delight-still','delight-paused');}
  };
}
