// CampusWall's own little robot, an original character: a mint screen-faced head,
// a heart on its chest and wheels for feet. It dreams on the wall, sleeps on error
// pages and cheers when a poster goes live. It is decoration only: hidden from
// assistive technology and never needed to use the site. Motion lives in
// robot.css. On the wall it follows the Effects pause control; elsewhere it plays
// briefly and stops. Reduced-motion preferences keep it still.
import {loadStylesheet} from './ui-utils.js';

const ink='#263238';
let clips=0;

const robotSvg=`<svg class="robot" viewBox="0 0 100 112" focusable="false"><g class="robot-body"><g class="robot-antenna"><path d="M50 19V10" stroke="${ink}" stroke-width="3" stroke-linecap="round"/><circle class="robot-bulb" cx="50" cy="7" r="5" fill="#f3c75f" stroke="${ink}" stroke-width="2.5"/></g><g class="robot-arm robot-arm-left"><rect x="15" y="66" width="10" height="22" rx="5" fill="#8fd0c4" stroke="${ink}" stroke-width="2.5"/></g><g class="robot-arm robot-arm-right"><rect x="75" y="66" width="10" height="22" rx="5" fill="#8fd0c4" stroke="${ink}" stroke-width="2.5"/></g><rect x="44" y="58" width="12" height="7" fill="${ink}"/><rect x="25" y="63" width="50" height="32" rx="10" fill="#f4ead8" stroke="${ink}" stroke-width="3"/><path class="robot-heart" d="M50 88C43 83 40 80 40 76.5A5.2 5.2 0 0 1 50 74.5A5.2 5.2 0 0 1 60 76.5C60 80 57 83 50 88Z" fill="#e86a6a" stroke="${ink}" stroke-width="2"/><circle cx="17" cy="39" r="5" fill="#f3c75f" stroke="${ink}" stroke-width="2.5"/><circle cx="83" cy="39" r="5" fill="#f3c75f" stroke="${ink}" stroke-width="2.5"/><rect x="20" y="18" width="60" height="42" rx="13" fill="#8fd0c4" stroke="${ink}" stroke-width="3"/><rect x="28" y="26" width="44" height="26" rx="9" fill="#22313a"/><g class="robot-eyes-open" fill="#a8f0e2"><ellipse cx="41" cy="38" rx="3.6" ry="4.6"/><ellipse cx="59" cy="38" rx="3.6" ry="4.6"/></g><g class="robot-eyes-shut" fill="none" stroke="#a8f0e2" stroke-width="2.4" stroke-linecap="round"><path d="M37 37q4 4 8 0"/><path d="M55 37q4 4 8 0"/></g><circle cx="35" cy="46" r="2.6" fill="#f2a7b8"/><circle cx="65" cy="46" r="2.6" fill="#f2a7b8"/><path d="M46 46q4 3 8 0" fill="none" stroke="#a8f0e2" stroke-width="2.2" stroke-linecap="round"/></g><g class="robot-wheels"><circle cx="37" cy="102" r="8" fill="${ink}"/><circle cx="37" cy="102" r="3" fill="#8fd0c4"/><circle cx="63" cy="102" r="8" fill="${ink}"/><circle cx="63" cy="102" r="3" fill="#8fd0c4"/></g></svg>`;

// What it dreams about: the city at dusk, the seaside, friends and a poster on the wall.
const star=(x,y,r)=>`<path d="M${x} ${y-r}l${r*.3} ${r*.7} ${r*.7} ${r*.3}-${r*.7} ${r*.3}-${r*.3} ${r*.7}-${r*.3}-${r*.7}-${r*.7}-${r*.3} ${r*.7}-${r*.3}z" fill="#f3c75f"/>`;
const dreams=[
  `<g class="robot-dream-frame"><rect x="10" y="10" width="90" height="62" fill="#f7c59f"/><circle cx="82" cy="24" r="6" fill="#fff3c4"/><g fill="#4a3f6b"><rect x="18" y="42" width="14" height="30"/><rect x="34" y="32" width="16" height="40"/><rect x="38" y="23" width="8" height="6" rx="2"/><rect x="39" y="28" width="1.5" height="4"/><rect x="43.5" y="28" width="1.5" height="4"/><rect x="52" y="47" width="12" height="25"/><rect x="66" y="37" width="20" height="35"/></g><g class="robot-windows" fill="#ffd86b"><rect x="22" y="47" width="3" height="4"/><rect x="38" y="37" width="3" height="4"/><rect x="44" y="45" width="3" height="4"/><rect x="38" y="53" width="3" height="4"/><rect x="56" y="52" width="3" height="4"/><rect x="70" y="42" width="3" height="4"/><rect x="78" y="50" width="3" height="4"/><rect x="70" y="58" width="3" height="4"/></g></g>`,
  `<g class="robot-dream-frame"><rect x="10" y="10" width="90" height="62" fill="#bfe3f0"/><circle cx="58" cy="50" r="13" fill="#f7b267"/><rect x="10" y="50" width="90" height="22" fill="#4f9dc6"/><path d="M16 59q5-4 10 0t10 0M58 65q5-4 10 0t10 0" fill="none" stroke="#e8f6fb" stroke-width="2" stroke-linecap="round"/><path d="M27 50h16l-3 4H30z" fill="#f4ead8"/><path d="M34 48V34l8 14z" fill="#fff"/></g>`,
  `<g class="robot-dream-frame"><rect x="10" y="10" width="90" height="62" fill="#fde2e4"/><path d="M55 60C43 52 38 47 38 41A8 8 0 0 1 55 38A8 8 0 0 1 72 41C72 47 67 52 55 60Z" fill="#e86a6a" stroke="${ink}" stroke-width="2"/>${star(28,28,6)}${star(83,50,4.5)}</g>`,
  `<g class="robot-dream-frame"><rect x="10" y="10" width="90" height="62" fill="#e9e4d8"/><rect x="40" y="20" width="30" height="40" rx="2" fill="#fff" stroke="${ink}" stroke-width="2"/><rect x="41" y="21" width="28" height="11" fill="#335747"/><path d="M45 38h20M45 44h16M45 50h12" stroke="#9aa5a0" stroke-width="2.4" stroke-linecap="round"/><circle cx="55" cy="20" r="3.2" fill="#e86a6a" stroke="${ink}" stroke-width="1.5"/>${star(82,32,5)}</g>`
];

// mood: 'dream' (asleep, with a dream bubble) or 'cheer' (jumps and waves).
// loop: true on the wall, where the Effects control decides whether it moves.
export function robotScene(mood='dream',{loop=false}={}){
  const dreaming=mood==='dream',clip=`robot-dream-${++clips}`;
  const bubble=dreaming?`<svg class="robot-dream" viewBox="0 0 110 100" focusable="false"><circle class="robot-cloud" cx="99" cy="91" r="4.5"/><circle class="robot-cloud" cx="89" cy="80" r="6.5"/><rect class="robot-cloud" x="6" y="6" width="96" height="70" rx="34"/><clipPath id="${clip}"><rect x="10" y="10" width="88" height="62" rx="30"/></clipPath><g clip-path="url(#${clip})">${dreams.join('')}</g></svg>`:'';
  const extras=dreaming?'<span class="robot-z">z</span><span class="robot-z">z</span><span class="robot-z">Z</span>':'<span class="robot-spark">♥</span><span class="robot-spark">✦</span><span class="robot-spark">♥</span>';
  return `<span class="robot-scene ${loop?'robot-loop':'robot-once'}${dreaming?' robot-sleeping':''}" data-mood="${dreaming?'dream':'cheer'}" aria-hidden="true">${bubble}${robotSvg}${extras}</span>`;
}

// Fills every [data-robot] placeholder in root once its styles have loaded, so the
// drawing never appears unstyled. Placeholders may hold a fallback such as an emoji.
export async function fillRobots(root,{loop=false}={}){
  await loadStylesheet('/robot.css');
  for(const slot of root.querySelectorAll('[data-robot]:not([data-robot-ready])')){
    if(!slot.isConnected)continue;
    slot.innerHTML=robotScene(slot.dataset.robot,{loop});slot.dataset.robotReady='';slot.setAttribute('aria-hidden','true');
  }
}
