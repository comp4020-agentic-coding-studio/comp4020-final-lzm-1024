// Student-to-student blocking. A block is one-sided to create but stops direct
// contact in both directions: private messages, calls, friend requests, profile
// notes, collaborator and game invitations. It does not hide public campus content
// and nobody is told that they have been blocked.
export function createBlocks({get,all,run,now,fail,json,campusAccount,onBlock=()=>{}}){
  const between=(a,b)=>!!(a&&b&&get('SELECT 1 FROM user_blocks WHERE (blockerId=? AND blockedId=?) OR (blockerId=? AND blockedId=?)',a,b,b,a));
  const guard=(a,b)=>{if(between(a,b))fail(403,'You can’t contact this student.');};
  async function handle(req,res,url){
    const u=campusAccount(req),method=req.method,match=url.pathname.match(/^\/api\/blocks(?:\/([a-f0-9-]{36}|[A-Za-z0-9_-]{1,64}))?$/);
    if(!match)fail(404,'Endpoint not found');
    if(!match[1]){if(method!=='GET')fail(405,'Method not allowed');return json(res,200,{blocked:all('SELECT u.id,u.name,u.username,u.avatarId,b.createdAt FROM user_blocks b JOIN users u ON u.id=b.blockedId WHERE b.blockerId=? ORDER BY b.createdAt DESC LIMIT 500',u.id)});}
    const target=get("SELECT id FROM users WHERE id=? AND passwordHash<>'!disabled'",match[1])||fail(404,'Student not found');
    if(target.id===u.id)fail(400,'You can’t block yourself');
    if(method==='POST'){
      if(get('SELECT COUNT(*) n FROM user_blocks WHERE blockerId=?',u.id).n>=500&&!get('SELECT 1 FROM user_blocks WHERE blockerId=? AND blockedId=?',u.id,target.id))fail(429,'You have reached the 500-block limit');
      run('INSERT OR IGNORE INTO user_blocks VALUES (?,?,?)',u.id,target.id,now());onBlock(u.id,target.id);return json(res,200,{blocked:true});
    }
    if(method==='DELETE'){run('DELETE FROM user_blocks WHERE blockerId=? AND blockedId=?',u.id,target.id);return json(res,200,{blocked:false});}
    fail(405,'Method not allowed');
  }
  return {between,guard,handle,isBlockedBy:(blocker,blocked)=>!!get('SELECT 1 FROM user_blocks WHERE blockerId=? AND blockedId=?',blocker,blocked)};
}
