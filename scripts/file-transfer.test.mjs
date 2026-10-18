import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountFileTransfer,fileAttachment} from '../public/file-transfer.js';

test('file UI shows real acknowledgement, retains retry identity and releases cancelled uploads',()=>{
  const dom=new JSDOM('<form></form>',{url:'https://campus.example'}),keys=['document','XMLHttpRequest'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let panel,request,ready=true;const messages=[];
  class XHR{constructor(){request=this;this.upload={};this.headers={};}open(method,url){this.method=method;this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}send(file){this.file=file;}abort(){this.onabort?.();}}
  try{
    Object.defineProperty(globalThis,'document',{value:dom.window.document,configurable:true});Object.defineProperty(globalThis,'XMLHttpRequest',{value:XHR,configurable:true});
    panel=mountFileTransfer(document.querySelector('form'),{conversationId:'conversation',isReady:()=>ready,onMessage:v=>messages.push(v),onError(){},onAuthExpired(){}});
    const input=document.querySelector('input'),send=document.querySelector('.dm-file-send'),status=document.querySelector('.dm-file-status');
    const choose=file=>{Object.defineProperty(input,'files',{value:[file],configurable:true});input.dispatchEvent(new dom.window.Event('change'));};
    choose(new dom.window.File(['hello'],'<script> notes.txt'));assert.equal(document.querySelector('script'),null);assert.match(document.querySelector('.dm-file-selected').textContent,/<script>/);
    send.click();const receipt=request.headers['x-client-id'];assert.equal(request.method,'POST');assert.equal(request.file.name,'<script> notes.txt');assert.equal(request.headers['content-type'],'application/octet-stream');
    request.upload.onprogress({lengthComputable:true,loaded:5,total:5});assert.equal(status.textContent,'Saving file…');assert.equal(messages.length,0,'100% transfer is not a server acknowledgement');
    request.onerror();assert.equal(send.disabled,false);send.click();assert.equal(request.headers['x-client-id'],receipt,'An uncertain upload retries the same receipt');
    document.querySelector('.dm-file-cancel').click();assert.match(status.textContent,/Check the conversation/);send.click();assert.equal(request.headers['x-client-id'],receipt);
    request.status=201;request.responseText=JSON.stringify({message:{attachment:{id:'file'}}});request.onload();assert.equal(messages.length,1);assert.equal(status.textContent,'File sent');assert(document.querySelector('.dm-file-selection').hidden);
    choose(new dom.window.File([],'empty.txt'));assert.match(status.textContent,/1 byte and 10 MB/);choose(new dom.window.File(['good'],'next.txt'));ready=false;panel.update();assert(send.disabled);ready=true;panel.update();send.click();const last=request;panel.destroy();panel=null;last.status=201;last.onload();assert.equal(messages.length,1,'Late events cannot update a departed conversation');
    const link=fileAttachment({id:'a'.repeat(36),name:'<img src=x onerror=alert(1)>.html',bytes:42});assert(link);assert.equal(link.querySelector('img'),null);assert.match(link.querySelector('strong').textContent,/<img/);assert.match(link.href,/\/api\/messages\/files\//);assert.equal(fileAttachment({id:'javascript:alert(1)',name:'bad',bytes:1}),null);
  }finally{panel?.destroy();dom.window.close();for(const [key,value] of old)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
