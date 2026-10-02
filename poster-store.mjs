import {campusDetails} from './campus.mjs';

// A whole wall uses one query, including author identity, comment totals and
// viewer-specific saves. All SQL fragments below come from server code only.
const metadata=`u.name authorName, u.passwordHash<>'!disabled' authorCanMessage,
  (SELECT COUNT(*) FROM comments c WHERE c.posterId=p.id) commentTotal,
  EXISTS(SELECT 1 FROM saved_posters s WHERE s.posterId=p.id AND s.userId=?) viewerSaved`;
export function createPosterStore({all,get}){
  function present(p,privateView=false,viewerId=null){
    const meta=Object.hasOwn(p,'authorName')?p:get(`SELECT ${metadata} FROM posters p JOIN users u ON u.id=p.ownerId WHERE p.id=?`,viewerId,p.id);
    const content=JSON.parse(privateView?p.content:(p.publicData||p.content));
    if(!privateView&&content.canvas)delete content.canvas.receipts;
    return {...content,timeZone:campusDetails[p.universityId].timeZone,id:p.id,slug:p.slug,ownerId:p.ownerId,owner:meta.authorName,canMessageOwner:!!(meta.authorCanMessage&&p.status==='PUBLISHED'&&viewerId!==p.ownerId),universityId:p.universityId,status:p.status,version:p.version,createdAt:p.createdAt,updatedAt:p.updatedAt,publishedAt:p.publishedAt,commentCount:meta.commentTotal,isSaved:!!meta.viewerSaved,...(privateView?{hasUnpublishedChanges:p.status==='PUBLISHED'&&p.content!==p.publicData}:{})};
  }
  function list({where,params=[],join='',order,privateView=false,viewerId=null}){
    // Public lists never need to materialise an unpublished working document.
    const columns=privateView?'p.*':`p.id,p.ownerId,p.universityId,p.slug,p.status,p.version,p.createdAt,p.updatedAt,p.publishedAt,COALESCE(p.publicData,p.content) publicData`;
    return all(`SELECT ${columns},${metadata} FROM posters p JOIN users u ON u.id=p.ownerId ${join} WHERE ${where} ORDER BY ${order}`,viewerId,...params).map(p=>present(p,privateView,viewerId));
  }
  return {present,list};
}
