import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicationHelp} from '../public/feedback.js';
import {designChooser} from '../public/designer.js';

const app=readFileSync('public/app.js','utf8'),mobile=readFileSync('public/mobile.css','utf8');

test('the wall shows posters before the campus chat',()=>{
  const wall=app.slice(app.indexOf('async function wall('));
  assert.ok(wall.indexOf('id="results"')<wall.indexOf('id="campus-chat"'),'posters come before the chat');
  assert.match(wall,/class="hero wall-hero wall-hero-compact"/);assert.match(wall,/class="wall-chat-jump">Join the campus chat ↓/);
  assert.match(wall,/\$\('\.wall-chat-jump'\)\.onclick=event=>\{event\.preventDefault\(\);/,'the jump does not re-run the router');
  assert.match(wall,/x\.setAttribute\('aria-pressed',String\(x===chosen\)\)/,'filters announce their selection');
  assert.match(mobile,/\.category-tabs\{flex-wrap:nowrap;overflow-x:auto/,'phone categories scroll in one row');
  assert.match(mobile,/\.date-tabs\{display:none\}\.date-select\{display:block;/,'phones pick dates from one compact menu');
});

test('a new account is welcomed once with first steps',()=>{
  assert.match(app,/if\(register\)try\{sessionStorage\.setItem\('campuswall-welcome',me\.id\);\}catch\{\}/,'only a fresh sign-up sets the welcome');
  assert.match(app,/if\(!me\|\|pending!==me\.id\)return '';/,'another account never sees it');
  for(const step of ['Add a profile photo ↗','Find friends ↗','Create your first poster ↗'])assert.ok(app.includes(step),step);
  assert.match(app,/sessionStorage\.removeItem\('campuswall-welcome'\)/,'dismissing clears it');
});

test('sign-up offers show password and skips a choice with one open campus',()=>{
  assert.match(app,/mountPasswordToggle\(\$\('#auth \[name="password"\]'\)\)/);
  assert.match(app,/toggle\.setAttribute\('aria-pressed',String\(show\)\)/);
  assert.match(app,/if\(universities\.length===1\)\{school\.value=universities\[0\]\.id;school\.closest\('label'\)\.hidden=true;\}/);
});

test('poster creation starts from an event template and lists every missing detail',()=>{
  const chooser=designChooser({name:'Australian National University',shortName:'ANU'});
  assert.match(chooser,/value="minimal" checked/);assert.doesNotMatch(chooser,/value="whiteboard" checked/);
  assert.match(readFileSync('public/designer.js','utf8'),/<button type="button" id="studio-details">Event details<\/button>/);
  assert.match(app,/detailsButton\.textContent=missing\?`Event details · \$\{missing\} to add`:'Event details ✓'/);
  const several=publicationHelp('date',['date','location']);assert.equal(several.title,'Add the missing event details');
  assert.equal(several.steps.length,3);assert.match(several.steps[0],/Date/);assert.match(several.steps[1],/Location/);assert.equal(several.actionLabel,'Go to Date');
  assert.equal(publicationHelp('location').title,'Add an event location','single missing field keeps its specific help');
});

test('phones get readable text, finger-sized controls and a compact Campus life row',()=>{
  assert.match(mobile,/\.meta-top,\.category,\.card-meta p,\.card-author,\.test-card-label[^{]*\{font-size:12px\}/);
  assert.match(mobile,/\.chat-broadcast-heading button\{min-width:44px;min-height:40px/);
  assert.match(mobile,/\.community-tabs\{flex-wrap:nowrap;justify-content:flex-start/);
  assert.match(readFileSync('public/community.js','utf8'),/strip\.scrollLeft=Math\.max\(0,currentTab\.offsetLeft/);
});

test('conversations can block directly and every new label is translated',async()=>{
  assert.match(readFileSync('public/messages.js','utf8'),/<button class="quiet dm-block" type="button">Block<\/button>/);
  assert.match(readFileSync('public/profile.js','utf8'),/api\('\/api\/account','PATCH',account\)/,'profile editor saves name and username through the account endpoint');
  const keys=['Join the campus chat','YOU’RE IN','Welcome to CampusWall,','Three good first steps:','Add a profile photo','Find friends','Create your first poster','Show password','Hide password','Profile saved.','{0} to add','Add the missing event details','Blocked','Letters, numbers or underscores. Your email and university stay the same.'];
  for(const id of ['zh-CN','es','fr','ja']){const c=(await import('../public/locales/'+id+'.js')).default;for(const key of keys)assert.ok(c[key],id+' '+key);}
});
