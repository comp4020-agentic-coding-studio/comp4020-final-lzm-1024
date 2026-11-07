import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {studioMarkup} from '../public/designer.js';

// The editor's Delete poster button sat inside the studio layout that the whiteboard hides,
// so creators had no visible way to delete. Creators now see it in three obvious places.
const app=readFileSync('public/app.js','utf8'),css=readFileSync('public/styles.css','utf8');
const render=(isOwner,status='PUBLISHED')=>new JSDOM(studioMarkup({id:'p1',version:1,status,title:'Quiz night',description:'',universityId:'anu'},{field:()=>'',options:()=>'',imagePicker:()=>'',poster:()=>'',university:{},isOwner,styles:[],templates:[]})).window.document;

test('the editor toolbar shows Delete poster and Unpublish to the creator, outside the hidden studio layout',()=>{
  const doc=render(true),del=doc.querySelector('#delete');
  assert.ok(del?.closest('.editor-actions'),'in the visible toolbar');assert.equal(del.closest('.designer-layout'),null,'not inside the layout the whiteboard hides');
  assert.equal(del.className,'button-danger');assert.equal(del.textContent,'Delete poster');
  assert.ok(doc.querySelector('.editor-actions #unpublish'));assert.equal(render(true,'DRAFT').querySelector('#unpublish'),null,'a draft has nothing to unpublish');
  assert.equal(doc.querySelectorAll('#delete').length,1);
  const shared=render(false);assert.equal(shared.querySelector('#delete'),null,'collaborators cannot delete');assert.equal(shared.querySelector('#unpublish'),null);
});

test('the creator sees Delete on their poster page and on My posters cards',()=>{
  assert.match(app,/\$\{me&&me\.id===p\.ownerId\?`<div class="owner-bar" role="group" aria-label="Your poster"><span>You published this poster\.<\/span><a class="button" href="\/studio\/posters\/\$\{p\.id\}" data-nav>Edit your poster ↗<\/a><button type="button" class="button-danger" id="delete-poster">Delete poster<\/button><\/div>`:''\}<div class="detail-tools">/,'owner bar sits under the title, before the public tools');
  assert.match(app,/privateView\?\(me&&me\.id===p\.ownerId\?`<div class="card-tools owner-card-tools">.*data-delete-poster="\$\{esc\(p\.id\)\}">Delete<\/button>/,'only the creator’s cards carry Delete');
  assert.match(app,/\$\('#delete-poster'\)\?\.addEventListener\('click',\(\)=>deletePoster\(p,\(\)=>navigate\(`\/\$\{p\.universityId\}`,true\)\)\);/);
  assert.match(app,/querySelectorAll\('\[data-delete-poster\]'\)\.forEach\(b=>b\.onclick=\(\)=>deletePoster\(/);
  // Found in the browser: the wall update for the deletion reached the poster page, and its late
  // "Poster not found" overwrote the wall the creator had moved to. Late replies now stay on their page.
  assert.match(app,/api\(`\/api\/posters\/\$\{p\.id\}`\)\.then\(\(\)=>\{if\(current===routeId\)loadComments\(\);\}\)\.catch\(error=>\{if\(current===routeId\)errorPage\(error\.message\);\}\)/);
  assert.match(css,/\.owner-bar \.button,\.owner-bar button,\.owner-card-tools>\*,\.delete-poster-actions button\{min-height:44px\}/,'easy to tap');
  assert.match(css,/:root\[data-theme="dark"\] \.button-danger\{/,'readable in dark mode');
});

test('every delete asks once in a dialog that names the poster and defaults to keeping it',async()=>{
  const fn=app.slice(app.indexOf('function deletePoster('),app.indexOf('function sharePoster('));
  assert.match(fn,/modal\('Delete this poster\?'/);assert.match(fn,/<p class="delete-poster-name" data-i18n-ignore>\$\{esc\(p\.title\|\|'Untitled event'\)\}<\/p>/,'the title is escaped and never translated');
  assert.match(fn,/<button type="button" data-keep autofocus>Keep it<\/button><button type="button" class="button-danger" id="confirm-delete">Delete permanently<\/button>/,'focus starts on Keep it');
  assert.match(fn,/button\.disabled=true;button\.textContent='Deleting…';try\{await api\(`\/api\/drafts\/\$\{p\.id\}`,'DELETE'\);closeDialog\(layer\);onDeleted\?\.\(\);toast\('Poster deleted\.'\);\}catch\(error\)\{button\.disabled=false;/,'success is reported only after the server accepts');
  assert.ok(!app.includes("confirm('Delete this poster"),'no browser confirm left');
  for(const language of ['zh-CN','es','fr','ja']){const catalogue=(await import(`../public/locales/${language}.js`)).default;for(const label of ['Delete this poster?','This draft will be deleted for you and anyone you invited. This can’t be undone.','It will disappear from the wall for everyone, along with its comments and bookings. This can’t be undone.','Keep it','Delete permanently','Deleting…','Poster deleted.','You published this poster.','Your poster','Delete poster','Delete','Edit','Edit your poster','Unpublish'])assert.ok(catalogue[label],`${language}: ${label}`);}
});
