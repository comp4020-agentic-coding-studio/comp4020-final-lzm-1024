import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {posterShareTags,siteIcons} from '../public-assets.mjs';

const origin='https://campuswall.example.test',url=origin+'/anu/posters/event-1';
const tag=(tags,name)=>tags.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)">`))?.[1];

test('the preview image is the poster’s own public image, absolute, or the site icon',()=>{
  const media='/media/0f8fad5b-d9cb-469f-a165-70867728950e';
  assert.equal(tag(posterShareTags({title:'Upload',heroImageUrl:media},url,origin).tags,'og:image'),origin+media);
  assert.equal(tag(posterShareTags({title:'Linked',heroImageUrl:'https://images.example.test/a.jpg'},url,origin).tags,'og:image'),'https://images.example.test/a.jpg');
  for(const heroImageUrl of ['http://insecure.example.test/a.jpg','javascript:alert(1)','/private/file.webp',''])
    assert.equal(tag(posterShareTags({title:'Plain',heroImageUrl},url,origin).tags,'og:image'),origin+'/icon-512.png',heroImageUrl);
  assert.equal(tag(posterShareTags({title:'Photo',heroImageUrl:'/demo-photos/afterglow.webp',isTest:true,photoPoster:{photoAlt:'A concert crowd.'}},url,origin).tags,'og:image:alt'),'A concert crowd.');
});

test('descriptions are short single lines; a test notice always opens with its disclosure',()=>{
  const long=posterShareTags({title:'Talk',date:'2026-12-01',location:'Hall',description:'word '.repeat(100)},url,origin);
  assert.ok(long.description.length<=200);assert.ok(long.description.endsWith('…'));assert.ok(!/\s{2}/.test(long.description));
  const notice=posterShareTags({title:'Sample',isTest:true,description:'An invented evening.'},url,origin);
  assert.equal(notice.title,'[TEST] Sample · CampusWall');assert.equal(notice.description,'TEST EVENT — Fictional, not a real event. An invented evening.');
  assert.equal(posterShareTags({title:'  ',date:'not-a-date'},url,origin).title,'Campus event · CampusWall');
});

test('the raster icons exist and favicon.ico wraps a 32px PNG',()=>{
  for(const path of siteIcons)assert.ok(readFileSync('public'+path).length>100,path);
  const ico=readFileSync('public/favicon.ico');
  assert.deepEqual([ico.readUInt16LE(2),ico.readUInt16LE(4),ico[6],ico[7]],[1,1,32,32]);
  assert.equal(ico.subarray(22,26).toString('latin1'),'\x89PNG');assert.equal(ico.readUInt32LE(14),ico.length-22);
});
