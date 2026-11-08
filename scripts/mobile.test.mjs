import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {revealInStrip} from '../public/guide.js';

function strip({width=300,scrollWidth=1200,scrollLeft=0}={}){
  const calls=[];
  return {calls,clientWidth:width,scrollWidth,scrollLeft,
    getBoundingClientRect:()=>({left:0,right:width,width}),
    scrollTo(options){calls.push(options);this.scrollLeft=options.left;}};
}
const chip=(left,width=120)=>({getBoundingClientRect:()=>({left,right:left+width,width})});

test('highlighted guide chip is centred by scrolling only the contents strip',()=>{
  const s=strip();
  assert.equal(revealInStrip(s,chip(400)),true);
  assert.deepEqual(s.calls,[{left:310,behavior:'smooth'}]);
  const r=strip({scrollLeft:500});
  assert.equal(revealInStrip(r,chip(-200),true),true);
  assert.deepEqual(r.calls,[{left:210,behavior:'auto'}],'reduced motion jumps instantly');
  const end=strip({scrollLeft:800});revealInStrip(end,chip(500));
  assert.equal(end.calls[0].left,900,'never scrolls past the end');
});

test('visible chips and non-scrolling desktop sidebars are left alone',()=>{
  const s=strip();assert.equal(revealInStrip(s,chip(100)),false);assert.deepEqual(s.calls,[]);
  const desktop=strip({width:210,scrollWidth:210});assert.equal(revealInStrip(desktop,chip(400)),false);
  assert.equal(revealInStrip(null,chip(0)),false);
});

test('phone stylesheet loads last, is served, and sets touch floors',()=>{
  const html=readFileSync('public/index.html','utf8'),assets=readFileSync('public-assets.mjs','utf8'),css=readFileSync('public/mobile.css','utf8');
  const sheets=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(sheets.at(-1),'/mobile.css');assert.match(assets,/'mobile\.css'/);
  assert.match(css,/@media \(pointer:coarse\)\{[^}]*select,textarea\{font-size:max\(16px,1em\)!important\}/,'touch inputs are at least 16px');
  assert.match(css,/@media \(max-width:860px\)\{[^]*#header nav\{display:none\}/,'the header folds before it can wrap');assert.match(css,/#header\.nav-open nav\{display:flex/);
  assert.equal(sheets.indexOf('/header.css'),sheets.length-2,'header styles load just before phone styles');assert.match(assets,/'header\.css'/);
  assert.match(css,/min-height:44px/);assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(readFileSync('public/guide.css','utf8'),/\.guide-toc\{[^}]*width:calc\(100% \+ 10vw\);margin:0 -5vw/,'contents strip spans both edges');
});

test('header Menu button controls the navigation and is translated',async()=>{
  const app=readFileSync('public/app.js','utf8');
  assert.match(app,/class="quiet nav-toggle" aria-expanded="false" aria-controls="site-nav">[^]*?<span class="sr-only">Menu<\/span><\/button>/,'icon button keeps a translatable accessible name');assert.match(app,/<nav id="site-nav">/);
  assert.match(app,/event\.key==='Escape'/);assert.match(app,/setOpen\(false,\{focus:true\}\)/,'Escape returns focus to the toggle');
  const expected={'zh-CN':'菜单',es:'Menú',fr:'Menu',ja:'メニュー'};
  for(const id of Object.keys(expected))assert.equal((await import('../public/locales/'+id+'.js')).default.Menu,expected[id],id);
});

test('the header bar stays short: settings and account links live in one menu',async()=>{
  const app=readFileSync('public/app.js','utf8'),nav=/\$\('#header nav'\)\.innerHTML=`([^`]*(?:`[^`]*`[^`]*)*)`;/.exec(app)?.[1];
  assert.ok(nav,'header navigation markup is found');
  const topLevel=nav.replace(/<details[^]*?<\/details>/g,'').replace(/<span class="nav-actions">[^]*$/,'');
  assert.deepEqual([...topLevel.matchAll(/>([^<>]+)<\/a>/g)].map(m=>m[1]),['Campus life','Messages','Watch together','Games','Clubs & societies','Getting started'],'every destination is a direct link');
  assert.doesNotMatch(nav,/<summary>More<\/summary>/);assert.doesNotMatch(app,/<summary>Explore<\/summary>/);
  assert.match(app,/class="nav-more nav-account"><summary aria-label="Account and settings">[^]*id="profile"[^]*href="\/my-posters"[^]*href="\/saved"[^]*data-settings[^]*id="logout"/,'account menu holds profile, posters, saved, settings and sign out');
  assert.match(app,/<summary aria-label="Settings">[^]*data-settings/,'guests get the same settings in a menu');
  for(const file of ['public/appearance.js','public/i18n.js'])assert.match(readFileSync(file,'utf8'),/querySelector\('#header \[data-settings\]'\)\|\|document\.querySelector\('#header nav'\)/,file+' mounts inside the menu');
  assert.match(app,/document\.addEventListener\('keydown',event=>\{if\(event\.key!=='Escape'/,'Escape closes an open header menu');
  const css=readFileSync('public/header.css','utf8');assert.match(css,/#header\{flex-wrap:nowrap\}/);assert.match(css,/\.menu-settings/);assert.match(css,/prefers-reduced-motion:reduce/);
  const expected={'zh-CN':['更多','账户与设置'],es:['Más','Cuenta y ajustes'],fr:['Plus','Compte et paramètres'],ja:['その他','アカウントと設定']};
  for(const [id,[more,account]] of Object.entries(expected)){const c=(await import('../public/locales/'+id+'.js')).default;assert.equal(c.More,more,id);assert.equal(c['Account and settings'],account,id);assert.ok(c.Settings&&c.Notifications,id);}
});
