import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync('public/community.js','utf8');
function fixture(){
 const dom=new JSDOM('<body><button id="origin">Messages</button></body>',{url:'https://example.test/messages'});
 const {document,HTMLDialogElement}=dom.window;
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
 let now=1000;const timers=new Map();let id=0;
 const clock={now:()=>now};
 const block=source.slice(source.indexOf('// A live invitation'),source.indexOf('export function mountCommunityHeader'));
 const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const api=new Function('document','location','Date','setInterval','clearInterval','esc',block+';return {show:gameInvite,clear:clearGameInvite};')(document,dom.window.location,clock,fn=>{timers.set(++id,fn);return id;},key=>timers.delete(key),esc);
 document.querySelector('#origin').focus();
 return {dom,document,timers,...api,advance(ms){now+=ms;for(const fn of [...timers.values()])fn();}};
}
const roomId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const invite={roomId,gameName:'Connect Four',host:{name:'Alex <img src=x>'}};
test('invitation is a labelled modal with safe names, countdown and an explicit join link',()=>{
 const f=fixture();try{f.show(invite);const d=f.document.querySelector('dialog');assert.ok(d.open);assert.equal(d.getAttribute('aria-labelledby'),'game-invite-title');assert.match(d.textContent,/Alex <img src=x>/);assert.equal(d.querySelector('img'),null);assert.equal(d.querySelector('a').getAttribute('href'),'/games/'+roomId);assert.equal(d.querySelector('[data-invite-count]').textContent,'01:00');assert.equal(f.document.activeElement,d.querySelector('button'));}finally{f.clear();f.dom.window.close();}
});
test('duplicate delivery cannot reset the deadline; expiry removes the dialog and timer',()=>{
 const f=fixture();try{f.show(invite);f.advance(30000);const first=f.document.querySelector('dialog');assert.equal(first.querySelector('[data-invite-count]').textContent,'00:30');f.show(invite);assert.equal(f.document.querySelector('dialog'),first);assert.equal(f.timers.size,1);f.advance(30000);assert.equal(f.document.querySelector('dialog'),null);assert.equal(f.timers.size,0);assert.equal(f.document.activeElement.id,'origin');}finally{f.clear();f.dom.window.close();}
});
test('dismissal, Escape, replacement and session cleanup release invitation timers',()=>{
 const f=fixture();try{f.show(invite);f.document.querySelector('dialog button').click();assert.equal(f.timers.size,0);f.show(invite);const first=f.document.querySelector('dialog');f.show({...invite,roomId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'});assert.equal(first.isConnected,false);assert.equal(f.timers.size,1);f.document.querySelector('dialog').dispatchEvent(new f.dom.window.Event('cancel',{cancelable:true}));assert.equal(f.timers.size,0);f.show(invite);f.clear();assert.equal(f.document.querySelector('dialog'),null);assert.equal(f.timers.size,0);assert.ok(source.includes('destroy(){active=false;clearGameInvite();'));}finally{f.clear();f.dom.window.close();}
});
test('invalid rooms and current rooms do not interrupt; an expired join click is refused',()=>{
 const f=fixture();try{f.show({...invite,roomId:'invalid'});assert.equal(f.timers.size,0);f.dom.reconfigure({url:'https://example.test/games/'+roomId});f.show(invite);assert.equal(f.timers.size,0);f.dom.reconfigure({url:'https://example.test/messages'});f.show(invite);const a=f.document.querySelector('dialog a');f.advance(60000);const click=new f.dom.window.MouseEvent('click',{cancelable:true});a.dispatchEvent(click);assert.equal(click.defaultPrevented,true);}finally{f.clear();f.dom.window.close();}
});
