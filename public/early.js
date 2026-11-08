// Starts the first requests while the module graph loads, instead of after it. Each
// response is held only for this page load and is used at most once by app.js, which
// then drops the rest, so nothing here caches session or permission results.
(()=>{
  const request=path=>fetch(path,{headers:{'content-type':'application/json'}}).catch(()=>null);
  const paths=['/api/universities','/api/auth/me'];
  try{
    const campuses=JSON.parse(document.querySelector('meta[name="campuswall-campuses"]')?.content||'{}'),ids=Object.keys(campuses);
    const segments=location.pathname.split('/').filter(Boolean);
    const campus=segments.length===1&&campuses[segments[0]]?segments[0]:!segments.length&&ids.length===1?ids[0]:null;
    // This must match the first request the wall makes: upcoming posters, with no filter.
    if(campus){
      const from=new Intl.DateTimeFormat('en-CA',{timeZone:campuses[campus]}).format(new Date());
      paths.push(`/api/posters?${new URLSearchParams({university:campus,category:'',q:'',from})}`);
    }
  }catch{}
  window.__campusEarly=Object.fromEntries(paths.map(path=>[path,request(path)]));
})();
