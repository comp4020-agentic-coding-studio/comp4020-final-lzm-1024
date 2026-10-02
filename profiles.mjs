// Public personal pages; editable fields and guestbook authors are server-scoped.
export function createProfiles({get,all,run,body,json,authenticated,campusAccess,string,fail,id,now,notify=()=>{}}){
 const select='SELECT n.seq,n.id,n.profileId,n.authorId,n.body,n.createdAt,u.name author,u.username,u.avatarId FROM profile_notes n JOIN users u ON u.id=n.authorId';
 function profile(profileId,req){const p=get("SELECT id,name,username,universityId,avatarId,bio,headline,interests,createdAt FROM users WHERE id=? AND passwordHash<>'!disabled'",profileId)||fail(404,'Profile not found');campusAccess(req,p.universityId);return p;}
 return {async handle(req,res,url){
  const match=url.pathname.match(/^\/api\/profiles\/([a-f0-9-]{36})(?:\/(notes)(?:\/([a-f0-9-]{36}))?)?$/);if(!match)fail(404,'Profile not found');
  const profileId=match[1],method=req.method;
  if(method==='GET'){
   const p=profile(profileId,req);if(!match[2])return json(res,200,{profile:p});if(match[3])fail(404,'Note not found');
   const before=url.searchParams.get('before');if(before!==null&&(!/^\d+$/.test(before)||!Number.isSafeInteger(Number(before))||Number(before)<1))fail(400,'Invalid note cursor');
   const notes=all(`${select} WHERE n.profileId=? AND n.removedAt IS NULL AND n.seq<? ORDER BY n.seq DESC LIMIT 31`,profileId,before?Number(before):Number.MAX_SAFE_INTEGER);return json(res,200,{notes:notes.slice(0,30),hasMore:notes.length>30});
  }
  authenticated(req);const input=await body(req),u=authenticated(req),p=profile(profileId,req);
  if(method==='PATCH'&&!match[2]){
   if(u.id!==p.id)fail(403,'You can only edit your own profile');const limits={bio:800,headline:100,interests:120};
   if(!Object.keys(input).length||Object.keys(input).some(k=>!Object.hasOwn(limits,k)))fail(400,'Only introduction, headline and interests can be edited');
   const updates=Object.keys(input).map(k=>[k,string(input[k],limits[k],k)]);run(`UPDATE users SET ${updates.map(([k])=>k+'=?').join(',')} WHERE id=?`,...updates.map(([,v])=>v),u.id);return json(res,200,{profile:profile(profileId,req)});
  }
  if(method==='POST'&&match[2]&&!match[3]){
   if(u.universityId!==p.universityId)fail(403,'Leave notes on your own campus');const text=string(input.body,600,'Note');if(!text)fail(400,'Write a note first');if(typeof input.clientId!=='string'||!/^[a-f0-9-]{36}$/.test(input.clientId))fail(400,'Invalid note request');
   const previous=get('SELECT * FROM profile_notes WHERE authorId=? AND clientId=?',u.id,input.clientId);if(previous){if(previous.profileId!==profileId||previous.body!==text||previous.removedAt)fail(409,'This request already submitted a different note');return json(res,200,{note:get(`${select} WHERE n.id=?`,previous.id)});}
   if(get('SELECT COUNT(*) n FROM profile_notes WHERE authorId=? AND createdAt>?',u.id,new Date(Date.now()-60000).toISOString()).n>=10)fail(429,'Please wait a minute before leaving more notes');
   const noteId=id();run('INSERT INTO profile_notes (id,profileId,authorId,clientId,body,createdAt) VALUES (?,?,?,?,?,?)',noteId,p.id,u.id,input.clientId,text,now());if(u.id!==p.id)notify(p.id,'profile',u.name+' left a note on your profile','/people/'+p.id,'profile-note:'+noteId);return json(res,201,{note:get(`${select} WHERE n.id=?`,noteId)});
  }
  if(method==='DELETE'&&match[3]){const note=get('SELECT * FROM profile_notes WHERE id=? AND profileId=? AND removedAt IS NULL',match[3],p.id)||fail(404,'Note not found');if(u.id!==note.authorId&&u.id!==p.id)fail(403,'Only the author or profile owner can remove this note');run('UPDATE profile_notes SET removedAt=? WHERE id=?',now(),note.id);return json(res,200,{ok:true});}
  fail(405,'Method not allowed');
 }};
}
