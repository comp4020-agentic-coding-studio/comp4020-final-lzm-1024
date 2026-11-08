import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

// The interface for reporting, moderation, account security, the empty wall and call failures.
const read=file=>readFileSync(file,'utf8');
const app=read('public/app.js'),voice=read('public/voice-calls.js'),mobile=read('public/mobile.css'),assets=read('public-assets.mjs');

test('the account menu links security for everyone and moderation only for moderators; sign-in offers recovery',()=>{
  assert.ok(app.includes('<a href="/account" data-nav>Account &amp; security</a>${me.isModerator?\'<a href="/moderation" data-nav>Moderation</a>\':\'\'}'));
  assert.ok(app.includes('${register?\'\':\'<a class="forgot-link" href="/forgot" data-nav>Forgot your password?</a>\'}'));
  assert.match(app,/if\(!me\.isModerator\)return errorPage\('Only moderators can open this page\.'\);/,'the page is refused before loading the queue');
  for(const file of ['account.js','moderation.js'])assert.ok(assets.includes(`'${file}'`),`${file} is served`);
  // Found in the browser: opening /moderation directly returned 404 until the server knew the page.
  assert.ok(read('server.mjs').includes('|saved|my-posters|account|forgot|moderation|studio'),'the new pages load from a direct link');
});

test('students can report others’ posters and comments; moderators get removal controls',()=>{
  assert.ok(app.includes("const reviewable=me&&me.id!==p.ownerId&&p.ownerId!=='campus-team';"),'not your own poster, not the test notices');
  assert.ok(app.includes('${me&&me.id!==c.authorId?`<button type="button" class="quiet comment-report" data-report-comment="${esc(c.id)}">Report</button>`:\'\'}'));
  assert.ok(app.includes(':me?.isModerator?`<button type="button" class="quiet comment-remove" data-moderate-comment="${esc(c.id)}">Remove (moderator)</button>`'));
  assert.ok(app.includes("${me.isModerator?'<button type=\"button\" class=\"button-danger\" id=\"moderate-poster\">Take poster down (moderator)</button>':''}"));
});

test('the report dialog requires a reason and reports success only after the server accepts',async()=>{
  const dom=new JSDOM('<body></body>',{url:'http://localhost/'});globalThis.document=dom.window.document;
  try{
    const {openReport}=await import('../public/moderation.js');const calls=[],toasts=[];let layer;
    const modal=(title,html)=>{layer=dom.window.document.createElement('dialog');layer.innerHTML=`<h2>${title}</h2>${html}`;dom.window.document.body.append(layer);return layer;};
    openReport({modal,closeDialog:d=>d.remove(),toast:m=>toasts.push(m),targetType:'comment',targetId:'c1',api:async(...args)=>{calls.push(args);return {reported:true};}});
    assert.equal(layer.querySelector('h2').textContent,'Report this comment');
    const radios=[...layer.querySelectorAll('input[name="reason"]')];assert.deepEqual(radios.map(r=>r.value),['spam','harassment','inappropriate','misleading','other']);assert.ok(radios.every(r=>r.required));
    radios[1].checked=true;layer.querySelector('textarea').value='Personal attack';
    layer.querySelector('form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,0));
    assert.deepEqual(calls[0],['/api/reports','POST',{targetType:'comment',targetId:'c1',reason:'harassment',note:'Personal attack'}]);
    assert.deepEqual(toasts,['Thanks. A moderator will review your report.']);assert.ok(!layer.isConnected,'the dialog closes after success');
  }finally{delete globalThis.document;dom.window.close();}
});

test('an empty upcoming wall invites a real event and links the university calendar; recent shows no test notices',()=>{
  assert.ok(app.includes('<h2>No upcoming events yet.</h2>'));
  assert.ok(app.includes('${safeUrl(uni.eventsUrl)?`<a class="button" href="${esc(uni.eventsUrl)}" target="_blank" rel="noopener noreferrer">${esc(uni.shortName)} events calendar ↗</a>`'));
  assert.ok(app.includes(".filter(p=>!p.isTest&&p.ownerId!=='campus-team').slice(-6).reverse()"));
  assert.match(read('campus.mjs'),/anu: \{.*eventsUrl:'https:\/\/www\.anu\.edu\.au\/events'/);
});

test('a lost connection is explained in words with a retry, and the guide link is a real button',async()=>{
  // Found in the browser: with the server unreachable the wall printed the browser's raw "Failed to fetch".
  assert.ok(app.includes("catch(error){if(error.name==='AbortError')throw error;const offline=new Error('CampusWall can’t be reached right now. Check your connection, then try again.');offline.network=true;throw offline;}"));
  assert.ok(app.includes('const value=await response.json().catch(()=>null);if(!response.ok||!value)'),'a proxy error page is not shown as a JSON parse error');
  assert.ok(app.includes('<div class="load-error" role="alert"><p class="error">${esc(error.message)}</p><button type="button" data-retry>Try again</button></div>`;$(\'[data-retry]\').onclick=load;'));
  assert.ok(app.includes("window.addEventListener('online',load);")&&app.includes("window.removeEventListener('online',load);"),'reconnecting reloads the wall, and leaving the wall stops listening');
  assert.ok(app.includes('const guideLink=\'<a href="/guide" data-nav class="button primary wall-guide-link">Getting started ↗</a>\';'));
  assert.match(read('public/styles.css'),/\.wall-tagline \.wall-guide-link\{display:inline-flex;min-height:44px;/);
  for(const language of ['zh-CN','es','fr','ja']){const catalogue=(await import(`../public/locales/${language}.js`)).default;for(const label of ['CampusWall can’t be reached right now. Check your connection, then try again.','Try again'])assert.ok(catalogue[label],`${language}: ${label}`);}
});

test('a failed call explains the missing relay; the phone editor toolbar is an even grid',async()=>{
  assert.ok(voice.includes("const config=await request('');relayAvailable=!!config.relayAvailable;"));
  assert.ok(voice.includes('if(!relayAvailable&&noRelay[status])status=noRelay[status];'));
  assert.match(mobile,/\.whiteboard-mode \.editor-top \.editor-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(mobile,/\.whiteboard-mode \.editor-actions>button,\.whiteboard-mode \.editor-actions>\.category\{width:100%;min-height:44px/);
  for(const language of ['zh-CN','es','fr','ja']){const catalogue=(await import(`../public/locales/${language}.js`)).default;
    for(const label of ['Account & security','Forgot your password?','Report this poster','Report','Send report','Moderation','Reports to review','{0} reports','No upcoming events yet.','{0} events calendar','Delete my account permanently','Create a recovery code','A moderator took your poster “{0}” off the wall','The call connection could not be established. Some campus and mobile networks block direct calls, and CampusWall has no relay server yet. Try another network, such as mobile data.'])assert.ok(catalogue[label],`${language}: ${label}`);}
});
