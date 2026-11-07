import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setLanguage,translate} from '../public/i18n.js';

test('every page change sets a page title and moves focus to the new heading',()=>{
  const app=readFileSync('public/app.js','utf8');
  assert.match(app,/history\[replace\?'replaceState':'pushState'\]\(\{\},'',path\);await route\(\);window\.scrollTo\(0,0\);afterRoute\(\);/,'links announce the new page');
  assert.match(app,/addEventListener\('popstate',async\(\)=>\{try\{await flush\(\);await route\(\);afterRoute\(\);/,'back and forward announce the new page');
  assert.match(app,/header\(\);await route\(\);afterRoute\(\{focus:false\}\);/,'the first load sets a title without moving focus');
  assert.match(app,/if\(!focus\|\|path===announcedPath\)return;/,'filters on the same page keep focus');
  for(const name of ['Notifications','Campus life','Messages','Watch together','Games','Clubs & societies','Getting started','Sign in','Saved events','My posters','Poster studio'])assert.ok(app.includes(`'${name}']`),name);
  assert.match(readFileSync('public/header.css','utf8'),/\[data-route-focus\]:focus\{outline:none\}/);
});

test('decorated labels and newly covered pages are translated in every language',async()=>{
  const catalogues=Object.fromEntries(await Promise.all(['zh-CN','es','fr','ja'].map(async id=>[id,(await import('../public/locales/'+id+'.js')).default])));
  for(const [id,catalogue] of Object.entries(catalogues)){
    await setLanguage(id,{persist:false});
    assert.equal(translate('☆ Save event'),'☆ '+catalogue['Save event'],id+' leading symbol');
    assert.equal(translate('A campus full of possibilities ↙'),catalogue['A campus full of possibilities']+' ↙',id+' trailing arrow');
    for(const key of ['WELCOME BACK','Sign in to CampusWall.','New here? Create an account','Sport & outdoors','A little more campus life.','Sign in to join','The little things that matter.','Overlapping confirmed plans. Saved events are tentative; fictional test notices do not create conflicts.','Republish'])assert.equal(translate(key),catalogue[key],id+' '+key);
    assert.equal(translate('Published 06/11/2026'),catalogue['Published {0}'].replace('{0}','06/11/2026'));
    assert.equal(translate('3 / 50 confirmed'),catalogue['{0} / {1} confirmed'].replace('{0}','3').replace('{1}','50'));
    assert.equal(translate('November 2026'),catalogue['November {0}'].replace('{0}','2026'));
    assert.equal(translate('Alex (you)'),catalogue['{0} (you)'].replace('{0}','Alex'));
  }
  await setLanguage('en',{persist:false});
});
