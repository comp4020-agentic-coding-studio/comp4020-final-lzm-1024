// One account inbox, with every HTTP operation and broadcast checked separately.
export function generatedUsername(name,userId,get){
  const stem=name.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,12)||'student';
  const suffix=userId.replaceAll('-','').slice(0,10);let value=`${stem}_${suffix}`,n=0;
  while(get('SELECT 1 FROM users WHERE username=? COLLATE NOCASE',value))value=`${stem.slice(0,8)}_${suffix}_${++n}`;
  return value;
}

export function createMessaging({db,get,all,run,id,now,fail,string,authenticated,body,json,sockets,send,validSocket,campusAccess,notify=()=>{}}){
  const select='SELECT m.seq,m.id,m.conversationId,m.authorId,m.body,m.createdAt,u.name author,u.username,u.avatarId FROM private_messages m JOIN users u ON u.id=m.authorId';
  function member(conversationId,u){return get('SELECT * FROM conversations WHERE id=? AND (user1=? OR user2=?)',conversationId,u.id,u.id)||fail(404,'Conversation not found');}
  function view(c,u){
    const peer=get('SELECT id,name,username,avatarId FROM users WHERE id=?',c.user1===u.id?c.user2:c.user1);
    const lastMessage=get(`${select} WHERE m.conversationId=? ORDER BY m.seq DESC LIMIT 1`,c.id)||null;
    const read=c.user1===u.id?c.read1:c.read2;
    const unread=get('SELECT COUNT(*) n FROM private_messages WHERE conversationId=? AND seq>? AND authorId<>?',c.id,read,u.id).n;
    return {id:c.id,peer,lastMessage,unread,updatedAt:c.updatedAt,version:c.version};
  }
  function list(u){return all('SELECT * FROM conversations WHERE user1=? OR user2=? ORDER BY updatedAt DESC,id LIMIT 100',u.id,u.id).map(c=>view(c,u));}
  function startConversation(u,userId){
    const peer=get("SELECT id FROM users WHERE id=? AND passwordHash<>'!disabled'",userId)||fail(404,'This organiser is not available for messages');
    if(peer.id===u.id)fail(400,'Choose another user to message');const [user1,user2]=[u.id,peer.id].sort();
    let c=get('SELECT * FROM conversations WHERE user1=? AND user2=?',user1,user2);
    if(!c){
      if(get('SELECT COUNT(*) n FROM conversations WHERE createdBy=? AND createdAt>?',u.id,new Date(Date.now()-60000).toISOString()).n>=20)fail(429,'Please wait before starting another conversation');
      const conversationId=id(),time=now();run('INSERT INTO conversations (id,user1,user2,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',conversationId,user1,user2,u.id,time,time);c=member(conversationId,u);
    }
    return view(c,u);
  }
  function broadcast(c,message,onlyUser=null){
    for(const ws of sockets)if(ws.inbox&&(ws.user.id===c.user1||ws.user.id===c.user2)&&(!onlyUser||ws.user.id===onlyUser)){
      if(!validSocket(ws)){ws.close(4001,'Session expired');continue;}
      send(ws,message?'inbox:message':'inbox:read',{conversation:view(c,ws.user),...(message?{message}:{})});
    }
  }
  const cursor=value=>{if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))fail(400,'Invalid message cursor');return Number(value);};
  async function handle(req,res,url){
    const path=url.pathname,method=req.method,u=authenticated(req);
    if(path==='/api/users/search'&&method==='GET'){
      const query=string(url.searchParams.get('q')||'',50,'Search').replace(/^@/,'').toLowerCase();
      return json(res,200,{users:query.length<2?[]:all("SELECT id,name,username,avatarId FROM users WHERE id<>? AND passwordHash<>'!disabled' AND (instr(lower(name),?)>0 OR instr(username,?)>0) ORDER BY CASE WHEN username=? THEN 0 ELSE 1 END,name,id LIMIT 30",u.id,query,query,query)});
    }
    if(path==='/api/messages/from-poster'&&method==='POST'){
      const input=await body(req);authenticated(req);const posterId=string(input.posterId,100,'Poster');
      const poster=get("SELECT ownerId,universityId FROM posters WHERE id=? AND status='PUBLISHED'",posterId)||fail(404,'This poster is no longer available');campusAccess(req,poster.universityId);
      return json(res,200,{conversation:startConversation(u,poster.ownerId)});
    }
    if(path==='/api/messages/conversations'){
      if(method==='GET')return json(res,200,{conversations:list(u)});
      if(method==='POST'){
        const input=await body(req);authenticated(req);return json(res,200,{conversation:startConversation(u,string(input.userId,36,'User'))});
      }
    }
    const match=path.match(/^\/api\/messages\/conversations\/([a-f0-9-]{36})(?:\/(messages|read))?$/);
    if(match){
      const conversationId=match[1],action=match[2];let c=member(conversationId,u);
      if(!action&&method==='GET')return json(res,200,{conversation:view(c,u)});
      if(action==='messages'&&method==='GET'){
        const before=url.searchParams.get('before'),after=url.searchParams.get('after');if(before!==null&&after!==null)fail(400,'Choose one message cursor');
        const value=before??after,rows=all(`${select} WHERE m.conversationId=?${value===null?'':` AND m.seq${after===null?'<':'>'}?`} ORDER BY m.seq ${after===null?'DESC':'ASC'} LIMIT 51`,conversationId,...(value===null?[]:[cursor(value)]));
        const hasMore=rows.length>50,window=rows.slice(0,50);return json(res,200,{messages:after===null?window.reverse():window,hasMore});
      }
      if(action==='messages'&&method==='POST'){
        const input=await body(req);authenticated(req);c=member(conversationId,u);const text=string(input.body,2000,'Message');if(!text)fail(400,'Write a message first');
        if(typeof input.clientId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.clientId))fail(400,'Invalid message request');
        const previous=get('SELECT * FROM private_messages WHERE authorId=? AND clientId=?',u.id,input.clientId);
        if(previous){if(previous.body!==text||previous.conversationId!==conversationId)fail(409,'This request already sent a different message');return json(res,200,{message:get(`${select} WHERE m.id=?`,previous.id),conversation:view(c,u)});}
        if(get('SELECT COUNT(*) n FROM private_messages WHERE authorId=? AND createdAt>?',u.id,new Date(Date.now()-60000).toISOString()).n>=30){res.setHeader('retry-after','60');fail(429,'You’re sending messages quickly. Please wait a minute.');}
        const messageId=id(),time=now();
        db.exec('BEGIN');try{run('INSERT INTO private_messages (id,conversationId,authorId,clientId,body,createdAt) VALUES (?,?,?,?,?,?)',messageId,conversationId,u.id,input.clientId,text,time);run('UPDATE conversations SET updatedAt=?,version=version+1 WHERE id=?',time,conversationId);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
        notify(c.user1===u.id?c.user2:c.user1,'message',u.name+' sent you a private message','/messages?conversation='+c.id,'dm:'+messageId);c=member(conversationId,u);const message=get(`${select} WHERE m.id=?`,messageId);broadcast(c,message);return json(res,201,{message,conversation:view(c,u)});
      }
      if(action==='read'&&method==='POST'){
        const input=await body(req);authenticated(req);c=member(conversationId,u);const through=input.throughSeq;
        if(!Number.isSafeInteger(through)||through<0||(through>0&&!get('SELECT 1 FROM private_messages WHERE conversationId=? AND seq=?',conversationId,through)))fail(400,'Invalid read position');
        const field=c.user1===u.id?'read1':'read2';if(through>c[field])run(`UPDATE conversations SET ${field}=?,version=version+1 WHERE id=?`,through,conversationId);c=member(conversationId,u);broadcast(c,null,u.id);return json(res,200,{conversation:view(c,u)});
      }
    }
    fail(405,'This messaging operation is not available');
  }
  function inviteGame(u,peerId,roomId,gameName){
    if(get('SELECT 1 FROM private_messages WHERE authorId=? AND clientId=?',u.id,roomId))return null;
    const cView=startConversation(u,peerId),c=member(cView.id,u);
    if(get('SELECT COUNT(*) n FROM private_messages WHERE authorId=? AND createdAt>?',u.id,new Date(Date.now()-60000).toISOString()).n>=30)fail(429,'Please wait before sending another invitation');
    const messageId=id(),time=now();run('INSERT INTO private_messages (id,conversationId,authorId,clientId,body,createdAt) VALUES (?,?,?,?,?,?)',messageId,c.id,u.id,roomId,`Let’s play ${gameName}! Join my campus game room: /games/${roomId}`,time);run('UPDATE conversations SET updatedAt=?,version=version+1 WHERE id=?',time,c.id);
    return ()=>broadcast(member(c.id,u),get(`${select} WHERE m.id=?`,messageId));
  }
  return {handle,list,inviteGame};
}
