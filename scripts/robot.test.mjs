import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {robotScene,fillRobots} from '../public/robot.js';

// The robot is decoration: hidden from assistive technology, still for reduced
// motion, pausable on the wall and brief everywhere else.
const css=readFileSync('public/robot.css','utf8'),read=file=>readFileSync(file,'utf8');
const rules=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>({selector:selector.trim(),body}));

test('scenes are hidden from assistive technology and each dream bubble has its own clip',()=>{
  const dom=new JSDOM(`<div>${robotScene('dream')}</div><div>${robotScene('dream',{loop:true})}</div><div>${robotScene('cheer')}</div>`);
  const scenes=[...dom.window.document.querySelectorAll('.robot-scene')];
  assert.deepEqual(scenes.map(s=>s.getAttribute('aria-hidden')),['true','true','true']);
  assert.deepEqual(scenes.map(s=>s.className),['robot-scene robot-once robot-sleeping','robot-scene robot-loop robot-sleeping','robot-scene robot-once']);
  assert.equal(scenes[0].querySelectorAll('.robot-dream-frame').length,4,'city at dusk, seaside, heart, poster');
  assert.equal(scenes[2].querySelector('.robot-dream'),null,'cheering has no dream bubble');
  const clips=[...dom.window.document.querySelectorAll('clipPath')].map(c=>c.id);assert.equal(new Set(clips).size,clips.length);
  for(const scene of scenes)assert.equal(scene.querySelector('[style]'),null,'no inline styles (CSP)');
});

test('placeholders fill once, only after the stylesheet loads, and keep their fallback if it fails',async()=>{
  const dom=new JSDOM('<main><span data-robot="dream">🎉</span><span data-robot="cheer"></span></main>',{url:'http://localhost/'});globalThis.document=dom.window.document;
  try{
    const main=document.querySelector('main'),filling=fillRobots(main);
    assert.equal(main.querySelector('.robot-scene'),null,'nothing unstyled appears before robot.css');
    const link=document.head.querySelector('link[href="/robot.css"]');assert.ok(link);link.onload();await filling;
    assert.equal(main.querySelectorAll('.robot-scene').length,2);assert.ok([...main.querySelectorAll('[data-robot]')].every(s=>s.hasAttribute('data-robot-ready')&&s.getAttribute('aria-hidden')==='true'));
    const first=main.querySelector('.robot-scene');await fillRobots(main);assert.equal(main.querySelector('.robot-scene'),first,'a filled slot is left alone');
  }finally{delete globalThis.document;dom.window.close();}
  const feedback=read('public/feedback.js');
  assert.ok(feedback.includes("element('div','celebration-icon','🎉');icon.setAttribute('aria-hidden','true');icon.dataset.robot='cheer';"),'the 🎉 stays as the fallback');
  assert.ok(feedback.includes("import('./robot.js').then(robot=>robot.fillRobots(current)).catch(()=>{});"));
});

test('on the wall the robot moves only under the Effects control; elsewhere briefly; never for reduced motion',()=>{
  for(const {selector,body} of rules.filter(rule=>/infinite/.test(rule.body)))
    assert.ok(selector.split(',').every(part=>part.trim().startsWith('.delight-on .robot-loop')),`endless motion is pausable: ${selector}`);
  assert.ok(rules.some(rule=>rule.selector==='.delight-paused .robot-loop *'&&/animation-play-state:paused!important/.test(rule.body)));
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.robot-scene \*\{animation:none!important;transition:none!important\}\}/);
  const once=css.slice(css.indexOf('@media(prefers-reduced-motion:no-preference)'),css.indexOf('@media(prefers-reduced-motion:reduce)'));
  // Each part's last frame: its latest start (shorthand or a per-child animation-delay) plus every repeat.
  const part=selector=>selector.match(/\.robot-[a-z-]+(?=[^.]*$)/)?.[0];
  const delays=[...once.matchAll(/([^{}]+)\{animation-delay:([\d.]+)s/g)].map(([,selector,delay])=>({part:part(selector.replace(/:nth-of-type\(\d\)/,'')),delay:Number(delay)}));
  const runs=[...once.matchAll(/([^{}]+)\{animation:robot-[a-z-]+ ([^;}]+)/g)].map(([,selector,rest])=>{
    const times=[...rest.matchAll(/([\d.]+)s/g)].map(m=>Number(m[1])),count=Number(rest.match(/\s(\d+)\s*$/)?.[1]||1),name=part(selector.trim());
    return {name,end:Math.max(times[1]||0,...delays.filter(d=>d.part===name).map(d=>d.delay))+times[0]*count};
  });
  assert.ok(runs.length>=8&&!/infinite/.test(once));
  for(const run of runs)assert.ok(run.end<=5,`${run.name} finishes within five seconds: ${run.end}`);
  const durations=[...css.matchAll(/animation:robot-[a-z-]+ ([\d.]+)s/g)].map(m=>Number(m[1]));
  assert.ok(durations.every(d=>d>=.4),'nothing faster than 0.4 s: '+durations);
  assert.doesNotMatch(css,/@keyframes robot-[a-z-]+\{[^}]*(?:filter:brightness|background-color)/,'no flashing');
});

test('the wall, empty lists, error pages and publication show the robot; its greeting is translated',async()=>{
  const delight=read('public/delight.js'),app=read('public/app.js'),assets=read('public-assets.mjs');
  assert.ok(delight.includes("robot.className='wall-robot';robot.setAttribute('aria-hidden','true');"));
  assert.ok(delight.includes("const scene=robot.querySelector('.robot-scene');if(!scene||!allowed())return;"),'a tap wakes it only while effects may run');
  assert.ok(delight.includes('robot.remove()'),'navigation removes it');
  assert.equal(app.match(/<span class="empty-art" aria-hidden="true" data-robot="dream"><\/span>/g).length,3,'two empty lists and the error page');
  assert.ok(!app.includes('🐈'));assert.ok(app.includes("import('./robot.js').then(m=>m.fillRobots(app)).catch(()=>{});"));
  for(const file of ['robot.js','robot.css'])assert.ok(assets.includes(`'${file}'`),`${file} is served`);
  assert.ok(read('public/mobile.css').includes('.wall-tagline>span:not(.wall-robot){display:none}'),'the phone layout hides the tagline text, not the robot');
  for(const language of ['zh-CN','es','fr','ja'])assert.ok((await import(`../public/locales/${language}.js`)).default['Hi! I was dreaming about campus.'],language);
});
