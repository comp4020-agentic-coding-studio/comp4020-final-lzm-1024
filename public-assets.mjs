import {readFileSync,statSync,createReadStream} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {brotliCompressSync,gzipSync,constants} from 'node:zlib';
import {pipeline} from 'node:stream/promises';
import {campusDetails} from './campus.mjs';
import {gallery} from './photo-gallery.mjs';
import {escapeHtml} from './public/ui-utils.js';

const textFiles=['voice-calls.js','voice-transport.js','typography.css','community.js','community.css','watch.js','watch-player.js','watch-share.js','watch-model.js','watch.css','profile.js','profile.css','chat-ui.js','app.js','chat.js','messages.js','games.js','game-catalog.js','event-utils.js','email-utils.js','ui-utils.js','motion.js','photo-posters.js','styles.css','games.css','motion.css','photo-posters.css','poster-design.js','designer.js','poster-design.css','designer.css','canvas-model.js','whiteboard.js','whiteboard.css'];
function encoding(header=''){
  const accepted=new Map(header.split(',').map(value=>{const [name,...options]=value.trim().split(';'),quality=options.find(v=>v.trim().startsWith('q='));return [name.toLowerCase(),quality?Number(quality.trim().slice(2)):1];}));
  const quality=name=>accepted.get(name)??accepted.get('*')??0,br=quality('br'),gzip=quality('gzip');
  return br>0&&br>=gzip?'br':gzip>0?'gzip':null;
}
function matches(header,etag){return typeof header==='string'&&header.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag);}

export function createPublicAssets(root=process.cwd()){
  const assets=new Map();
  function textAsset(content,type){
    const raw=Buffer.from(content);
    return {type:`${type}; charset=utf-8`,variants:{identity:raw,gzip:gzipSync(raw),br:brotliCompressSync(raw,{params:{[constants.BROTLI_PARAM_QUALITY]:5}})},hash:createHash('sha256').update(raw).digest('hex')};
  }
  for(const name of textFiles)assets.set('/'+name,textAsset(readFileSync(join(root,'public',name)),name.endsWith('.css')?'text/css':'text/javascript'));
  assets.set('/vendor/leaflet.js',textAsset(readFileSync(join(root,'node_modules/leaflet/dist/leaflet.js')),'text/javascript'));
  assets.set('/vendor/leaflet.css',textAsset(readFileSync(join(root,'node_modules/leaflet/dist/leaflet.css')),'text/css'));
  assets.set('/vendor/hls.min.js',textAsset(readFileSync(join(root,'node_modules/hls.js/dist/hls.min.js')),'text/javascript'));
  for(const path of [...Object.values(campusDetails).map(c=>c.logo.src),...gallery.events.map(event=>`/demo-photos/${event.key}.webp`)]){
    const file=join(root,'public',path.slice(1));
    assets.set(path,{file,type:path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'image/webp',bytes:statSync(file).size,hash:createHash('sha256').update(readFileSync(file)).digest('hex')});
  }
  const page=textAsset(readFileSync(join(root,'public','index.html')),'text/html');
  const readme=textAsset(`<!doctype html><meta charset="utf-8"><title>About CampusWall</title><link rel="stylesheet" href="/styles.css"><main class="readme"><a href="/">← CampusWall</a><pre>${escapeHtml(readFileSync(join(root,'README.md'),'utf8'))}</pre></main>`,'text/html');
  assets.set('/readme',readme);assets.set('/readme/',readme);
  async function send(req,res,asset,{privatePage=false,photo=false}={}){
    const selected=asset.variants?encoding(req.headers['accept-encoding']):null;
    const bytes=asset.variants?.[selected||'identity'];
    const etag=`"${asset.hash}-${selected||'identity'}"`;
    const headers={'content-type':asset.type,'etag':etag,'cache-control':privatePage?'private, no-cache':photo?'public, max-age=86400':'public, no-cache',...(asset.variants?{vary:privatePage?'Accept-Encoding, Cookie':'Accept-Encoding'}:{}),...(selected?{'content-encoding':selected}:{})};
    if(matches(req.headers['if-none-match'],etag)){res.writeHead(304,headers);res.end();return;}
    res.writeHead(200,{...headers,'content-length':bytes?.length??asset.bytes});
    if(req.method==='HEAD'){res.end();return;}
    if(bytes){res.end(bytes);return;}
    // Photos stay off the JS heap and filesystem reads do not block live chat.
    try{await pipeline(createReadStream(asset.file),res);}catch(error){if(!res.destroyed)res.destroy(error);}
  }
  return {
    async serve(req,res,path){const asset=assets.get(path);if(!asset)return false;await send(req,res,asset,{photo:path.startsWith('/demo-photos/')});return true;},
    sendPage:(req,res)=>send(req,res,page,{privatePage:true})
  };
}
