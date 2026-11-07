// Password change, recovery codes and account deletion. CampusWall sends no email, so a
// forgotten password is recovered with a one-time recovery code: one the student created
// while signed in, or one a moderator issued after checking who they are. Codes are stored
// only as hashes. Deleting an account removes the student's posters, comments, public chat
// and club posts, follows, friendships and sign-ins, and anonymises the account row so that
// private and group conversations stay readable to the other people in them.
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const normaliseCode=code=>String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

export function createAccountSecurity({db,get,all,run,now,fail,string,body,json,authenticated,rateLimit,hash,scrypt,randomBytes,timingSafeEqual,session,sockets,token,throttle,loginLocked,noteLoginFailure,clearLoginFailures,removeFile,uploadPath,avatarPath,onPostersDeleted}){
  const password=(value,label='Password')=>{const text=typeof value==='string'?value:'';if(text.length<8||text.length>128)fail(400,`${label} must contain 8–128 characters`);return text;};
  async function passwordHash(text){const salt=randomBytes(16).toString('hex');return `${salt}:${(await scrypt(text,salt,64)).toString('hex')}`;}
  async function matches(account,text){const [salt,expected]=String(account?.passwordHash||'').split(':');const key=await scrypt(String(text||''),salt||'invalid-account',64);return !!expected&&expected.length===128&&timingSafeEqual(key,Buffer.from(expected,'hex'));}
  function issueRecovery(userId,expiresAt=null){
    const bytes=randomBytes(16),code=[...bytes].map(b=>alphabet[b%alphabet.length]).join('');
    run('UPDATE users SET recoveryHash=?,recoveryExpires=? WHERE id=?',hash(code),expiresAt,userId);
    return code.match(/.{4}/g).join('-');
  }
  // Sign-ins other than the one making the request end at once, including open live connections.
  function endSessions(userId,keepHash=null){
    if(keepHash)run('DELETE FROM sessions WHERE userId=? AND tokenHash<>?',userId,keepHash);else run('DELETE FROM sessions WHERE userId=?',userId);
    for(const ws of sockets)if(ws.user?.id===userId&&ws.sessionHash!==keepHash)ws.close(4001,'Signed out');
  }
  function deleteAccount(u){
    const account=get('SELECT avatarId FROM users WHERE id=?',u.id),files=all('SELECT file FROM uploads WHERE posterId IN (SELECT id FROM posters WHERE ownerId=?)',u.id).map(row=>row.file);
    const campuses=all('SELECT DISTINCT universityId FROM posters WHERE ownerId=? AND status=\'PUBLISHED\'',u.id).map(row=>row.universityId);
    db.exec('BEGIN');
    try{
      for(const sql of [
        'DELETE FROM posters WHERE ownerId=?','DELETE FROM comments WHERE authorId=?','DELETE FROM chat_messages WHERE authorId=?','DELETE FROM club_posts WHERE authorId=?',
        'DELETE FROM watch_messages WHERE authorId=?','DELETE FROM watch_queue WHERE authorId=? AND playedAt IS NULL','DELETE FROM collaborators WHERE userId=?','DELETE FROM saved_posters WHERE userId=?',
        'DELETE FROM club_follows WHERE userId=?','DELETE FROM group_members WHERE userId=?','DELETE FROM screening_subscriptions WHERE userId=?','DELETE FROM watch_invites WHERE userId=?',
        'DELETE FROM watch_votes WHERE userId=?','DELETE FROM notifications WHERE userId=?',"DELETE FROM reports WHERE reporterId=? AND status='open'",
        "UPDATE registrations SET status='cancelled' WHERE userId=? AND status<>'cancelled'",
      ])run(sql,u.id);
      run('DELETE FROM profile_notes WHERE authorId=? OR profileId=?',u.id,u.id);
      run('DELETE FROM friends WHERE user1=? OR user2=?',u.id,u.id);
      run('DELETE FROM user_blocks WHERE blockerId=? OR blockedId=?',u.id,u.id);
      run("UPDATE users SET name='Deleted account',username=?,email=?,passwordHash='!disabled',bio='',headline='',interests='',avatarId=NULL,recoveryHash=NULL,recoveryExpires=NULL WHERE id=?",'deleted_'+randomBytes(6).toString('hex'),`deleted-${u.id}@deleted.invalid`,u.id);
      run('DELETE FROM sessions WHERE userId=?',u.id);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    for(const file of files)removeFile(uploadPath(file));
    if(account?.avatarId)removeFile(avatarPath(account.avatarId));
    for(const ws of sockets)if(ws.user?.id===u.id)ws.close(4001,'Account deleted');
    onPostersDeleted(campuses);
  }
  async function handle(req,res,url){
    const path=url.pathname,method=req.method;
    if(method!=='POST'&&!(path==='/api/account/security'&&method==='GET'))fail(405,'Method not allowed');
    if(path==='/api/auth/recover'){
      rateLimit(req);const input=await body(req),email=string(input.email,254,'Email').trim().toLowerCase(),code=normaliseCode(string(input.code,40,'Recovery code')),next=password(input.password,'New password');
      if(loginLocked(email))fail(429,'Too many failed attempts for this email. Please wait 15 minutes or try again later.');
      const account=get("SELECT * FROM users WHERE email=? AND passwordHash<>'!disabled'",email),expected=Buffer.from(account?.recoveryHash||'0'.repeat(64),'hex'),given=Buffer.from(hash(code),'hex');
      const valid=!!account?.recoveryHash&&code.length===16&&timingSafeEqual(expected,given)&&(!account.recoveryExpires||account.recoveryExpires>Date.now());
      if(!valid){noteLoginFailure(email);fail(401,'That email and recovery code don’t match. Codes work once; a code from a moderator lasts 24 hours.');}
      run('UPDATE users SET passwordHash=?,recoveryHash=NULL,recoveryExpires=NULL WHERE id=?',await passwordHash(next),account.id);
      endSessions(account.id);clearLoginFailures(email);
      const u={id:account.id,name:account.name,email:account.email,username:account.username,universityId:account.universityId,avatarId:account.avatarId};
      session(res,req,u);return json(res,200,{user:u});
    }
    const u=authenticated(req),account=get('SELECT * FROM users WHERE id=?',u.id);
    if(path==='/api/account/security')return json(res,200,{hasRecoveryCode:!!account.recoveryHash&&!account.recoveryExpires});
    const input=await body(req);
    throttle('account-security',u.id,10,15*60000,'Too many attempts. Please wait 15 minutes.');
    if(!await matches(account,input.currentPassword??input.password))fail(403,'Your current password is not correct');
    if(path==='/api/account/password'){
      const next=password(input.newPassword,'New password');if(next===input.currentPassword)fail(400,'Choose a password you haven’t been using');
      run('UPDATE users SET passwordHash=? WHERE id=?',await passwordHash(next),u.id);endSessions(u.id,hash(token(req)));
      return json(res,200,{ok:true});
    }
    if(path==='/api/account/recovery-code')return json(res,200,{code:issueRecovery(u.id)});
    if(path==='/api/account/delete'){
      if(input.confirm!=='DELETE')fail(400,'Type DELETE to confirm');
      deleteAccount(u);res.setHeader('set-cookie','campus_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});
    }
    fail(404,'Endpoint not found');
  }
  return {handle,issueRecovery};
}
