// Reports and moderation. A signed-in student can report a public poster or comment on their
// own campus. Moderators are the accounts named in MODERATOR_IDS; they review reports from their
// own campus only. Taking a poster down returns it to its creator as a private draft that cannot
// be republished (the creator keeps their work and can still delete it); removing a comment
// deletes it. A decision closes every open report about that poster or comment.
export const reportReasons=['spam','harassment','inappropriate','misleading','other'];
const title=p=>{try{return String(JSON.parse(p.publicData||p.content||'{}').title||'Untitled event');}catch{return 'Untitled event';}};

export function createModeration({get,all,run,id,now,fail,string,body,json,campusAccount,throttle,removePoster,removeComment,issueRecovery,moderatorIds=''}){
  const moderators=new Set(String(moderatorIds).split(',').map(value=>value.trim()).filter(Boolean));
  const isModerator=userId=>!!userId&&moderators.has(userId);
  // Only content that is public on the reporter's (or moderator's) campus can be reported or removed.
  function target(type,targetId,universityId){
    if(type==='poster'){
      const p=get('SELECT p.id,p.ownerId,p.universityId,p.slug,p.status,p.publicData,u.name owner FROM posters p JOIN users u ON u.id=p.ownerId WHERE p.id=?',targetId);
      return p&&p.status==='PUBLISHED'&&p.universityId===universityId?{posterId:p.id,authorId:p.ownerId,poster:p}:null;
    }
    const c=get('SELECT c.id,c.authorId,c.body,u.name author,p.id posterId,p.slug,p.universityId,p.status,p.publicData FROM comments c JOIN posters p ON p.id=c.posterId JOIN users u ON u.id=c.authorId WHERE c.id=?',targetId);
    return c&&c.status==='PUBLISHED'&&c.universityId===universityId?{posterId:c.posterId,authorId:c.authorId,comment:c}:null;
  }
  function queue(universityId){
    // Reports about content its author has since deleted are closed rather than shown.
    for(const r of all("SELECT DISTINCT targetType,targetId FROM reports WHERE universityId=? AND status='open'",universityId))
      if(!target(r.targetType,r.targetId,universityId))run("UPDATE reports SET status='gone',resolvedAt=? WHERE targetType=? AND targetId=? AND universityId=? AND status='open'",now(),r.targetType,r.targetId,universityId);
    const groups=new Map();
    for(const r of all("SELECT targetType,targetId,reason,note,createdAt FROM reports WHERE universityId=? AND status='open' ORDER BY createdAt LIMIT 1000",universityId)){
      const key=r.targetType+':'+r.targetId;
      if(!groups.has(key)){
        const t=target(r.targetType,r.targetId,universityId);
        groups.set(key,{targetType:r.targetType,targetId:r.targetId,firstReportedAt:r.createdAt,count:0,reasons:{},notes:[],
          ...(r.targetType==='poster'?{title:title(t.poster),slug:t.poster.slug,author:t.poster.owner}:{body:t.comment.body,author:t.comment.author,title:title(t.comment),slug:t.comment.slug})});
      }
      const g=groups.get(key);g.count++;g.reasons[r.reason]=(g.reasons[r.reason]||0)+1;if(r.note&&g.notes.length<10)g.notes.push(r.note);
    }
    return [...groups.values()].sort((a,b)=>b.count-a.count||a.firstReportedAt.localeCompare(b.firstReportedAt));
  }
  async function handle(req,res,url){
    const u=campusAccount(req),method=req.method,path=url.pathname;
    if(path==='/api/reports'){
      if(method!=='POST')fail(405,'Method not allowed');
      const input=await body(req),type=['poster','comment'].includes(input.targetType)?input.targetType:fail(400,'Choose what to report');
      const targetId=string(input.targetId,36,'Report target'),t=target(type,targetId,u.universityId)||fail(404,type==='poster'?'Poster not found':'Comment not found');
      if(t.authorId===u.id)fail(400,type==='poster'?'You can’t report your own poster':'You can’t report your own comment');
      const reason=reportReasons.includes(input.reason)?input.reason:fail(400,'Choose a reason');
      const note=input.note===undefined||input.note===null?'':string(input.note,300,'Note').trim();
      throttle('report',u.id,20,60*60000,'You have sent many reports. Please wait an hour.');
      run('INSERT OR IGNORE INTO reports (id,reporterId,universityId,targetType,targetId,posterId,reason,note,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',id(),u.id,u.universityId,type,targetId,t.posterId,reason,note,now());
      return json(res,200,{reported:true});
    }
    if(!isModerator(u.id))fail(403,'Only moderators can do that');
    if(path==='/api/moderation/reports'){if(method!=='GET')fail(405,'Method not allowed');return json(res,200,{reports:queue(u.universityId)});}
    const decision=path.match(/^\/api\/moderation\/(poster|comment)\/([A-Za-z0-9-]{1,36})$/);
    if(decision){
      if(method!=='POST')fail(405,'Method not allowed');
      const [,type,targetId]=decision,input=await body(req),action=['remove','dismiss'].includes(input.action)?input.action:fail(400,'Choose remove or dismiss');
      if(action==='remove'){const t=target(type,targetId,u.universityId)||fail(404,type==='poster'?'Poster not found':'Comment not found');if(type==='poster')removePoster(t.poster,title(t.poster));else removeComment(t.comment,title(t.comment));}
      const closed=run("UPDATE reports SET status=?,resolvedAt=?,resolvedBy=? WHERE targetType=? AND targetId=? AND universityId=? AND status='open'",action==='remove'?'removed':'dismissed',now(),u.id,type,targetId,u.universityId).changes;
      return json(res,200,{ok:true,closed});
    }
    // A student who forgot their password and has no recovery code asks a moderator, who checks
    // who they are in person and gives them a one-time code that expires in 24 hours.
    if(path==='/api/moderation/recovery'){
      if(method!=='POST')fail(405,'Method not allowed');
      const input=await body(req),name=string(input.username,25,'Username').trim().replace(/^@/,'').toLowerCase();
      const student=get("SELECT id,name,username FROM users WHERE username=? COLLATE NOCASE AND universityId=? AND passwordHash<>'!disabled'",name,u.universityId)||fail(404,'Student not found');
      if(student.id===u.id)fail(400,'Use your own account page to create your recovery code');
      throttle('recovery-issue',u.id,10,60*60000,'You have created several recovery codes. Please wait an hour.');
      const expiresAt=Date.now()+24*3600000;return json(res,200,{code:issueRecovery(student.id,expiresAt),expiresAt,student:{name:student.name,username:student.username}});
    }
    fail(404,'Endpoint not found');
  }
  return {handle,isModerator};
}
