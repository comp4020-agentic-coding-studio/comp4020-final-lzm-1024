import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {linkify,safeUrl} from '../public/ui-utils.js';
import {designedPoster,categoryArt,titleFit,fitPosters} from '../public/poster-design.js';

// Found by previewing eleven real ANU events: long titles overlapped the date or were
// cut off, photo-less posters all looked alike, links in descriptions could not be
// followed, and shared events offered CampusWall booking and "Message organiser".
const app=readFileSync('public/app.js','utf8'),community=readFileSync('public/community.js','utf8'),css=readFileSync('public/poster-design.css','utf8');

test('descriptions link only safe web addresses and escape everything else',()=>{
  const html=linkify('Register: https://example.org/a?b=1&c=2. <b>Bold</b> javascript:alert(1) http://user:pw@evil.test/x');
  assert.match(html,/<a href="https:\/\/example\.org\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow ugc">example\.org\/a\?b=1&amp;c=2<\/a>\./,'trailing full stop stays outside the link');
  assert.ok(html.includes('&lt;b&gt;Bold&lt;/b&gt;'));assert.ok(!html.includes('<b>'));
  assert.equal((html.match(/<a /g)||[]).length,1,'no link for javascript: or credentials');
  assert.match(linkify('https://example.org/'+'x'.repeat(80)),/>example\.org\/x{33}…<\/a>/,'long addresses are shortened for display');
  assert.equal(linkify('<img src=x onerror=alert(1)>'),'&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(safeUrl('ftp://example.org'),'');assert.equal(safeUrl(' https://ok.test/p '),'https://ok.test/p');
});

test('posters without a photo show their category colour and symbol',()=>{
  const base={title:'Quiz night',category:'Academic',date:'2026-11-20',location:'Kambri',style:'campus-anu',layout:'minimal'};
  const html=designedPoster(base,{shortName:'ANU'},()=> '20 Nov');
  assert.match(html,/no-image/);assert.ok(html.includes(`--cat:${categoryArt.Academic[1]}`));assert.ok(html.includes(`<span class="design-placeholder" aria-hidden="true">${categoryArt.Academic[0]}</span>`));
  assert.ok(designedPoster({...base,category:'Sport'},{},()=> '').includes(categoryArt.Sport[0]));
  assert.ok(designedPoster({...base,category:'<script>'},{},()=> '').includes(`--cat:${categoryArt.Other[1]}`),'unknown categories use the neutral art');
  assert.doesNotMatch(designedPoster({...base,heroImageUrl:'https://example.org/p.jpg'},{},()=> ''),/no-image|design-placeholder/,'photos are never replaced');
  assert.doesNotMatch(designedPoster({...base,layout:'cover'},{},()=> ''),/design-placeholder/,'full-bleed covers keep their wash');
  assert.ok(titleFit('Short')===1&&titleFit('A title of about twenty-five')<1&&titleFit('x'.repeat(60))<titleFit('x'.repeat(25)));
  assert.match(css,/\.poster\.designed-poster \.design-copy h2\{font-size:calc\(var\(--d-titleScale\)\*\.11cqw\*var\(--d-fit,1\)\);-webkit-line-clamp:4\}/);
});

test('fitting shrinks a little, then moves photo-less copy up, then shrinks, then hides the subtitle',()=>{
  const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),previous=Object.getOwnPropertyDescriptor(globalThis,'getComputedStyle');
  globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
  try{
    const make=(noImage,need)=>{
      const root=dom.window.document.querySelector('main');root.insertAdjacentHTML('beforeend',`<div class="designed-poster${noImage?' no-image':''}" style="--d-fit:.88;--d-titleY:55"><div class="design-copy"><h2>T</h2><p>S</p></div><div class="design-footer"></div></div>`);
      const poster=root.lastElementChild;Object.defineProperty(poster,'offsetWidth',{value:300});
      // Copy bottom grows with the title size and the copy's top; "need" is the extra height of the text.
      poster.querySelector('.design-copy').getBoundingClientRect=()=>{const fit=Number(poster.style.getPropertyValue('--d-fit')),y=Number(poster.style.getPropertyValue('--d-titleY')),hidden=poster.classList.contains('fit-tight');return {top:y*4,bottom:y*4+need*fit-(hidden?40:0)};};
      poster.querySelector('.design-footer').getBoundingClientRect=()=>({top:320});poster.getBoundingClientRect=()=>({bottom:400});
      return poster;
    };
    const gentle=make(true,110),moved=make(true,200),photo=make(false,200);
    fitPosters(dom.window.document);
    assert.equal(gentle.style.getPropertyValue('--d-fit'),'0.82','one small step is enough');assert.equal(gentle.style.getPropertyValue('--d-titleY'),'55','a small shrink is enough');
    assert.ok(Number(moved.style.getPropertyValue('--d-titleY'))<55&&moved.classList.contains('fit-moved'),'photo-less copy moves up before shrinking further');
    assert.equal(moved.style.getPropertyValue('--d-fit'),'0.76');assert.ok(!moved.classList.contains('fit-tight'),'subtitle kept');
    assert.equal(photo.style.getPropertyValue('--d-titleY'),'55','copy never moves over a photo');assert.ok(Number(photo.style.getPropertyValue('--d-fit'))<.76);
  }finally{if(previous)Object.defineProperty(globalThis,'getComputedStyle',previous);else delete globalThis.getComputedStyle;dom.window.close();}
});

test('shared events send people to the official page instead of CampusWall booking or messages',async()=>{
  assert.match(app,/function contactOrganiser\(p\)\{if\(safeUrl\(p\.eventUrl\)\)return officialLink\(p\);/,'cards show the official page, not Message organiser');
  assert.match(app,/if\(!safeUrl\(p\.eventUrl\)\)\$\('#share-poster'\)\.insertAdjacentHTML\('afterend',contactOrganiser\(p\)\);/,'one official link on the detail page');
  assert.match(app,/<p class="description" data-i18n-ignore>\$\{linkify\(p\.description\)\}<\/p>/);
  assert.match(app,/<span class="card-author-text"><span data-i18n-ignore>/,'organiser and sharer stay one line');
  assert.match(app,/<dt>ORGANISED BY<\/dt><dd data-i18n-ignore>\$\{esc\(p\.organiser\)\}<\/dd>/,'organiser names are not translated');
  assert.match(app,/rel="noopener noreferrer nofollow">Official page ↗/);
  assert.match(community,/const official=safeUrl\(poster\.eventUrl\);if\(official&&!poster\.isTest\)/);
  assert.match(app,/const app=\$\('#app'\);observePosterFit\(app\);/);
  for(const language of ['zh-CN','es','fr','ja']){const catalogue=(await import(`../public/locales/${language}.js`)).default;for(const label of ['Organised by','ORGANISED BY','Official event page','Official page','Book on the official page','Go to the official page','· shared by','This event takes bookings on its official page.','This event is shared from its organiser, so bookings and questions go to their page rather than CampusWall.','Sharing someone else’s event? Name the organiser and link their page. Bookings and questions then go there.'])assert.ok(catalogue[label],`${language}: ${label}`);}
});
