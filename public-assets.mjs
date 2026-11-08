import {readFileSync,statSync,createReadStream,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {brotliCompressSync,gzipSync,constants} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {campusDetails,universities,isActiveCampus} from './campus.mjs';
import {gallery} from './photo-gallery.mjs';
import {escapeHtml} from './public/ui-utils.js';

const textFiles=['early.js','robot.js','robot.css','collaborators.js','account.js','moderation.js','delight.js','delight.css','guide.js','guide.css','header.css','mobile.css','feedback.js','file-transfer.js','file-transfer.css','appearance.js','appearance.css','theme-init.js','i18n.js','message-translation.js','locales/zh-CN.js','locales/es.js','locales/fr.js','locales/ja.js','voice-calls.js','voice-transport.js','call-media.js','typography.css','community.js','community.css','watch.js','watch-player.js','watch-share.js','watch-model.js','watch.css','profile.js','profile.css','chat-ui.js','app.js','chat.js','messages.js','games.js','game-catalog.js','event-utils.js','email-utils.js','ui-utils.js','motion.js','photo-posters.js','styles.css','games.css','motion.css','photo-posters.css','poster-design.js','designer.js','poster-design.css','designer.css','canvas-model.js','whiteboard.js','whiteboard.css'];
export function encoding(header=''){
  const accepted=new Map(header.split(',').map(value=>{const [name,...options]=value.trim().split(';'),quality=options.find(v=>v.trim().startsWith('q='));return [name.toLowerCase(),quality?Number(quality.trim().slice(2)):1];}));
  const quality=name=>accepted.get(name)??accepted.get('*')??0,br=quality('br'),gzip=quality('gzip');
  return br>0&&br>=gzip?'br':gzip>0?'gzip':null;
}
const versionLength=12;
function matches(header,etag){return typeof header==='string'&&header.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag);}

// With PUBLIC_ASSET_DIR (set in the deployment image), minified files and their
// pre-built Brotli/gzip variants from scripts/build-assets.mjs replace the source
// files, so nothing is compressed at startup. Without it, source files are served.
function builtAssets(dir){
  if(!dir||!existsSync(join(dir,'manifest.json')))return new Map();
  const {files,images={}}=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8')),built=new Map();built.images=images;
  for(const [path,entry] of Object.entries(files)){
    const file=join(dir,'files',path.slice(1));
    built.set(path,{type:`${entry.type}; charset=utf-8`,variants:{identity:readFileSync(file),gzip:readFileSync(file+'.gz'),br:readFileSync(file+'.br')},hash:entry.hash});
  }
  return built;
}
// Without a build, a card-sized photo URL is answered with the original photo.
const cardPhotoOriginal=path=>/^\/demo-photos\/[a-z0-9-]+-720\.webp$/.test(path)?path.replace(/-720\.webp$/,'.webp'):null;
// Site icons, regenerated from icon.svg by scripts/make-icons.mjs.
export const siteIcons=['/icon.svg','/icon-192.png','/icon-512.png','/apple-touch-icon.png','/favicon.ico'];
const imageType=path=>path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':path.endsWith('.ico')?'image/x-icon':'image/webp';
const siteTitle='CampusWall — Your campus, at a glance',siteDescription='Your campus, at a glance. Discover events and create campus posters together.';
const clip=(text,limit)=>text.length>limit?text.slice(0,limit-1).trimEnd()+'…':text;
const metaTag=(attribute,name,content)=>`<meta ${attribute}="${name}" content="${escapeHtml(content)}">`;
const previewTags=({title,description,url,image,alt,large})=>[
  metaTag('property','og:type','website'),metaTag('property','og:site_name','CampusWall'),metaTag('property','og:title',title),metaTag('property','og:description',description),
  ...(url?[metaTag('property','og:url',url)]:[]),metaTag('property','og:image',image),metaTag('property','og:image:alt',alt),metaTag('name','twitter:card',large?'summary_large_image':'summary')
].join('');
// Link previews (Messenger, WhatsApp, Discord, Slack, iMessage) read the page HTML
// without running app.js, so a published poster's own page carries its title, date,
// venue and image. Test notices keep their TEST label and disclosure here as well.
export function posterShareTags(poster,url,origin){
  const isTest=!!poster.isTest,title=(isTest?'[TEST] ':'')+(String(poster.title||'').trim()||'Campus event');
  const when=/^\d{4}-\d{2}-\d{2}$/.test(poster.date||'')?new Date(poster.date+'T00:00:00Z').toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'';
  const text=String(poster.description||'').replace(/\s+/g,' ').trim();
  const description=clip(isTest?(text.startsWith('TEST EVENT')?text:'TEST EVENT — Fictional, not a real event. '+text):[[when,poster.time,poster.location].filter(Boolean).join(' · '),text].filter(Boolean).join(' — '),200)||siteDescription;
  const hero=String(poster.heroImageUrl||''),demo=/^\/demo-photos\/([a-z0-9-]+)\.webp$/.exec(hero);
  const image=demo?`${origin}/demo-photos/${demo[1]}-720.webp`:/^\/media\/[a-f0-9-]{36}$/.test(hero)?origin+hero:/^https:\/\/\S+$/.test(hero)?hero:null;
  const alt=image?String(poster.photoPoster?.photoAlt||`Poster image for ${title}`):'CampusWall';
  return {title:`${title} · CampusWall`,description,tags:previewTags({title,description,url,image:image||`${origin}/icon-512.png`,alt,large:!!image})};
}
export function createPublicAssets(root=process.cwd(),{builtDir=process.env.PUBLIC_ASSET_DIR,baseUrl=process.env.PUBLIC_BASE_URL}={}){
  const assets=new Map(),built=builtAssets(builtDir);
  function textAsset(content,type){
    const raw=Buffer.from(content);
    return {type:`${type}; charset=utf-8`,variants:{identity:raw,gzip:gzipSync(raw),br:brotliCompressSync(raw,{params:{[constants.BROTLI_PARAM_QUALITY]:5}})},hash:createHash('sha256').update(raw).digest('hex')};
  }
  for(const name of textFiles)assets.set('/'+name,built.get('/'+name)||textAsset(readFileSync(join(root,'public',name)),name.endsWith('.css')?'text/css':'text/javascript'));
  assets.set('/vendor/leaflet.js',built.get('/vendor/leaflet.js')||textAsset(readFileSync(join(root,'node_modules/leaflet/dist/leaflet.js')),'text/javascript'));
  assets.set('/vendor/leaflet.css',built.get('/vendor/leaflet.css')||textAsset(readFileSync(join(root,'node_modules/leaflet/dist/leaflet.css')),'text/css'));
  assets.set('/vendor/hls.min.js',built.get('/vendor/hls.min.js')||textAsset(readFileSync(join(root,'node_modules/hls.js/dist/hls.min.js')),'text/javascript'));
  for(const event of gallery.events){
    const path=`/demo-photos/${event.key}-720.webp`,known=built.images?.[path];
    if(known?.built)assets.set(path,{file:join(builtDir,'files',path.slice(1)),type:'image/webp',bytes:known.bytes,hash:known.hash});
  }
  for(const path of [...Object.values(campusDetails).map(c=>c.logo.src),...gallery.events.map(event=>`/demo-photos/${event.key}.webp`),...siteIcons]){
    const file=join(root,'public',path.slice(1));
    const known=built.images?.[path];
    assets.set(path,{file,type:imageType(path),bytes:known?.bytes??statSync(file).size,hash:known?.hash??createHash('sha256').update(readFileSync(file)).digest('hex')});
  }
  const shell=built.get('/index.html')||textAsset(readFileSync(join(root,'public','index.html')),'text/html');
  // Sets the page title and description and adds preview tags to the shared page shell.
  // Content-versioned addresses let browsers keep public files without asking again, so a
  // repeat visit skips those requests. The import map also versions relative imports inside
  // modules, and each file's address depends only on its own content. A deployment changes
  // this revalidated page, which then names the new files. A browser that ignores import
  // maps uses the plain addresses, which still revalidate.
  const versionOf=path=>`${path}?v=${assets.get(path).hash.slice(0,versionLength)}`;
  const importMap=JSON.stringify({imports:Object.fromEntries([...assets].filter(([path,asset])=>asset.variants&&/\.(?:js|css)$/.test(path)&&!path.startsWith('/vendor/')).map(([path])=>[path,versionOf(path)]))});
  const importMapScript=`<script type="importmap">${importMap}</script>`;
  const campuses=Object.fromEntries(universities.map(([id])=>id).filter(isActiveCampus).map(id=>[id,campusDetails[id].timeZone]));
  // The import map must come before anything that can start a module, so preload hints are
  // links in the page rather than Link headers, which some browsers treat as module loads.
  const startupModules=['appearance.js','app.js','chat-ui.js','event-utils.js','email-utils.js','chat.js','canvas-model.js','poster-design.js','photo-posters.js','ui-utils.js','motion.js','i18n.js','message-translation.js','feedback.js','robot.js'];
  const hints=({modules=[],styles=[]})=>[...startupModules,...modules].map(name=>`<link rel="modulepreload" href="${versionOf('/'+name)}">`).concat(['robot.css',...styles].map(name=>`<link rel="preload" as="style" href="${versionOf('/'+name)}">`)).join('');
  const shellFor=extra=>shell.variants.identity.toString('utf8')
    .replace(/(href|src)="(\/[^"?]+\.(?:css|js))"/g,(match,attribute,path)=>assets.get(path)?.variants?`${attribute}="${versionOf(path)}"`:match)
    .replace('<script src=',()=>`${metaTag('name','campuswall-campuses',JSON.stringify(campuses))}${importMapScript}<script async src="${versionOf('/early.js')}"></script><script src=`)
    .replace('</head>',()=>`${hints(extra)}</head>`);
  const shells={base:shellFor({}),wall:shellFor({modules:['delight.js'],styles:['delight.css']}),games:shellFor({modules:['games.js','game-catalog.js'],styles:['games.css']})};
  const withPreview=({title,description,tags},html=shells.base)=>textAsset(html
    .replace(/<title>[^<]*<\/title>/,()=>`<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/,()=>`${metaTag('name','description',description)}${tags}`),'text/html');
  // Preview images must be absolute URLs, so the site-wide tags need the deployed address.
  const siteTags=baseUrl?{title:siteTitle,description:siteDescription,tags:previewTags({title:siteTitle,description:siteDescription,url:new URL('/',baseUrl).href,image:new URL('/icon-512.png',baseUrl).href,alt:'CampusWall'})}:null;
  const pages=Object.fromEntries(Object.entries(shells).map(([name,html])=>[name,siteTags?withPreview(siteTags,html):textAsset(html,'text/html')]));
  const campusPaths=new Set(Object.keys(campuses).map(id=>'/'+id));
  const readme=textAsset(`<!doctype html><meta charset="utf-8"><meta name="theme-color" content="#f7f6f2"><title>About CampusWall</title><link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" href="/icon.svg" type="image/svg+xml"><script src="/theme-init.js"></script><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/appearance.css"><main class="readme"><a href="/">← CampusWall</a><pre>${escapeHtml(readFileSync(join(root,'README.md'),'utf8'))}</pre></main>`,'text/html');
  assets.set('/readme',readme);assets.set('/readme/',readme);
  async function send(req,res,asset,{privatePage=false,photo=false,longCache=false,status=200}={}){
    const selected=asset.variants?encoding(req.headers['accept-encoding']):null;
    const bytes=asset.variants?.[selected||'identity'];
    const etag=`"${asset.hash}-${selected||'identity'}"`;
    const headers={'content-type':asset.type,'etag':etag,'cache-control':privatePage?'private, no-cache':longCache?'public, max-age=31536000, immutable':photo?'public, max-age=86400':'public, no-cache',...(asset.variants?{vary:privatePage?'Accept-Encoding, Cookie':'Accept-Encoding'}:{}),...(selected?{'content-encoding':selected}:{})};
    if(status===200&&matches(req.headers['if-none-match'],etag)){res.writeHead(304,headers);res.end();return;}
    res.writeHead(status,{...headers,'content-length':bytes?.length??asset.bytes});
    if(req.method==='HEAD'){res.end();return;}
    if(bytes){res.end(bytes);return;}
    // Photos stay off the JS heap and filesystem reads do not block live chat.
    try{await pipeline(createReadStream(asset.file),res);}catch(error){if(!res.destroyed)res.destroy(error);}
  }
  return {
    // The content security policy allows exactly this inline import map and no other inline script.
    importMapHash:`'sha256-${createHash('sha256').update(importMap).digest('base64')}'`,
    async serve(req,res,path){const asset=assets.get(path)||assets.get(cardPhotoOriginal(path));if(!asset)return false;// Only the address of this exact content may be kept long-term; an outdated one gets the
      // current file, revalidated, so it can never be stored under the wrong version.
      const version=new URL(req.url,'http://localhost').searchParams.get('v');
      await send(req,res,asset,{photo:path.startsWith('/demo-photos/'),longCache:!!asset.variants&&version===asset.hash.slice(0,versionLength)});return true;},
    // `share` is a published poster's preview from posterShareTags; the server passes it
    // only after the visitor's campus checks, and it never contains account data.
    sendPage:(req,res,share,status=200)=>{
      // The page's preload hints name public startup files only, never account data.
      const path=new URL(req.url,'http://localhost').pathname.replace(/(.)\/$/,'$1');
      const name=path==='/games'||path.startsWith('/games/')?'games':path==='/'||campusPaths.has(path)?'wall':'base';
      return send(req,res,share?withPreview(share):pages[name],{privatePage:true,status});
    }
  };
}
