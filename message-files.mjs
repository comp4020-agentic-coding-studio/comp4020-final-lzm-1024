import {mkdirSync,readdirSync,renameSync,rmSync,createReadStream,statSync} from 'node:fs';
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';

export const maxMessageFile=10*1024*1024;
export function createMessageFiles({dataDir,get,all,id,fail,authenticated,member,publish}){
  const directory=join(dataDir,'message-files'),uploads=new Map();let reserved=0;
  mkdirSync(directory,{recursive:true,mode:0o700});
  const retained=new Set(all('SELECT id FROM message_files').map(f=>f.id+'.bin'));
  for(const file of readdirSync(directory))if(/^[a-f0-9-]{36}\.(part|bin)$/.test(file)&&!retained.has(file))rmSync(join(directory,file),{force:true});
  function current(req,user,conversationId){const latest=authenticated(req);if(latest.id!==user.id)fail(401,'Sign in again to send this file');member(conversationId,latest);return latest;}
  return {
    async upload(req,res,conversationId,user){
      member(conversationId,user);
      if(req.headers['content-type']!=='application/octet-stream')fail(415,'Send a file as binary data');
      let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{fail(400,'Invalid file name');}
      if(!name||name.length>180||/[\x00-\x1f\x7f/\\]/.test(name)||!name.trim()||['.','..'].includes(name))fail(400,'Choose a file with a valid name of at most 180 characters');
      const clientId=req.headers['x-client-id'];if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(clientId||''))fail(400,'Invalid file request');
      const length=Number(req.headers['content-length']);if(req.headers['content-length']!==undefined&&(!Number.isSafeInteger(length)||length<1||length>maxMessageFile))fail(413,'Choose a file between 1 byte and 10 MB');
      if(uploads.has(user.id)||uploads.size>=2)fail(429,'Another file is uploading. Please wait');
      const previous=get('SELECT id FROM private_messages WHERE authorId=? AND clientId=?',user.id,clientId),reserve=Number.isSafeInteger(length)&&length>0?length:maxMessageFile;
      if(!previous){
        if(get('SELECT COUNT(*) n FROM private_messages WHERE authorId=? AND createdAt>?',user.id,new Date(Date.now()-60000).toISOString()).n>=30)fail(429,'Please wait before sending another file');
        const total=get('SELECT COUNT(*) count,COALESCE(SUM(bytes),0) bytes FROM message_files');
        const own=get('SELECT COUNT(*) count,COALESCE(SUM(f.bytes),0) bytes FROM message_files f JOIN private_messages m ON m.id=f.messageId WHERE m.authorId=?',user.id);
        if(total.bytes+reserved+reserve>200*1024*1024||total.count+uploads.size>=1000)fail(507,'File storage is full');
        if(own.bytes+reserve>50*1024*1024||own.count>=100)fail(413,'Your shared files have reached the 50 MB or 100-file limit');
      }
      const fileId=id(),temporary=join(directory,fileId+'.part'),destination=join(directory,fileId+'.bin');
      uploads.set(user.id,true);reserved+=reserve;let handle,committed=false,bytes=0,oversized=false;
      const timeout=setTimeout(()=>req.destroy(Error('File upload timed out')),120000);timeout.unref();
      try{
        handle=await open(temporary,'wx',0o600);const digest=createHash('sha256');
        for await(const chunk of req){bytes+=chunk.length;if(bytes>maxMessageFile){oversized=true;continue;}digest.update(chunk);await handle.writeFile(chunk);}
        await handle.sync();await handle.close();handle=null;
        if(oversized||!bytes)fail(413,'Choose a file between 1 byte and 10 MB');
        current(req,user,conversationId);
        renameSync(temporary,destination);
        const result=publish(user,conversationId,{id:fileId,name,bytes,digest:digest.digest('hex'),clientId});committed=!result.duplicate;
        result.deliver?.();return result;
      }finally{
        clearTimeout(timeout);await handle?.close().catch(()=>{});rmSync(temporary,{force:true});if(!committed)rmSync(destination,{force:true});uploads.delete(user.id);reserved-=reserve;
      }
    },
    async download(req,res,fileId,user){
      const file=get('SELECT f.*,m.conversationId FROM message_files f JOIN private_messages m ON m.id=f.messageId WHERE f.id=?',fileId)||fail(404,'File not found');member(file.conversationId,user);
      const path=join(directory,file.id+'.bin');try{statSync(path);}catch{fail(404,'This file is no longer available');}
      res.writeHead(200,{'content-type':'application/octet-stream','content-length':file.bytes,'content-disposition':`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,'cache-control':'private, no-store','x-content-type-options':'nosniff','vary':'Cookie'});
      await pipeline(createReadStream(path),res);
    }
  };
}
