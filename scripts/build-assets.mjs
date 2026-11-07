// Production asset build: minify public JS (esbuild) and CSS (lightningcss), then
// pre-compress each file once at maximum Brotli and gzip levels. The server loads
// the result when PUBLIC_ASSET_DIR points here, so it does no compression at
// startup. Source files stay untouched and are still served in development/tests.
//
// Usage: node scripts/build-assets.mjs [publicDir=public] [outDir=.asset-build]
import {readFileSync,writeFileSync,mkdirSync,rmSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join,relative,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {brotliCompressSync,gzipSync,constants} from 'node:zlib';
import {transform as transformJs} from 'esbuild';
import {transform as transformCss} from 'lightningcss';

const [publicDir='public',outDir='.asset-build']=process.argv.slice(2);
const files=[],images=[];
(function walk(dir){for(const name of readdirSync(dir)){const path=join(dir,name);if(statSync(path).isDirectory())walk(path);else if(/\.(m?js|css|html)$/.test(name))files.push(path);else if(/\.(webp|png|svg)$/.test(name))images.push(path);}})(publicDir);
// Vendor libraries served under /vendor/. They ship minified already except Leaflet's CSS.
const vendor=[['/vendor/leaflet.js','node_modules/leaflet/dist/leaflet.js'],['/vendor/leaflet.css','node_modules/leaflet/dist/leaflet.css'],['/vendor/hls.min.js','node_modules/hls.js/dist/hls.min.js']].filter(([,file])=>existsSync(file));

// Every relative module specifier, static or dynamic, must survive minification unchanged.
const specifiers=code=>[...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)(["'`])(\.{1,2}\/[^"'`]+)\1/g)].map(m=>m[2]).sort();

rmSync(outDir,{recursive:true,force:true});
const manifest={},totals={source:0,minified:0,br:0,gzip:0};
for(const [path,file,isVendor] of [...files.map(file=>['/'+relative(publicDir,file).split(sep).join('/'),file,false]),...vendor.map(([path,file])=>[path,file,true])]){
  const source=readFileSync(file,'utf8');
  let output=source,type;
  if(path.endsWith('.css')){type='text/css';output=Buffer.from(transformCss({filename:path,code:Buffer.from(source),minify:true}).code).toString();}
  else if(path.endsWith('.html')){type='text/html';}
  else if(isVendor){type='text/javascript';}
  else{
    type='text/javascript';
    output=(await transformJs(source,{loader:'js',minify:true,target:'es2022',charset:'ascii',legalComments:'none',sourcefile:path})).code;
    const before=specifiers(source),after=specifiers(output);
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error(`${path}: module specifiers changed during minification\n${before}\n${after}`);
    await transformJs(output,{loader:'js',format:'esm'}).catch(error=>{throw new Error(`${path}: minified output does not parse: ${error.message}`);});
  }
  const identity=Buffer.from(output),br=brotliCompressSync(identity,{params:{[constants.BROTLI_PARAM_QUALITY]:11,[constants.BROTLI_PARAM_MODE]:constants.BROTLI_MODE_TEXT,[constants.BROTLI_PARAM_SIZE_HINT]:identity.length}}),gz=gzipSync(identity,{level:9});
  const target=join(outDir,'files',path.slice(1));mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,identity);writeFileSync(target+'.br',br);writeFileSync(target+'.gz',gz);
  manifest[path]={type,hash:createHash('sha256').update(identity).digest('hex'),bytes:identity.length,br:br.length,gzip:gz.length};
  totals.source+=Buffer.byteLength(source);totals.minified+=identity.length;totals.br+=br.length;totals.gzip+=gz.length;
}
// Image validators are computed here so the server does not read every photo at startup.
const imageManifest=Object.fromEntries(images.map(file=>{const bytes=readFileSync(file);return ['/'+relative(publicDir,file).split(sep).join('/'),{hash:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}];}));
// Poster cards show photos at roughly 340 CSS px, so a 720px-wide copy covers 2x screens.
const sharp=await import('sharp').then(module=>module.default,()=>null);
if(sharp)for(const file of images.filter(file=>/demo-photos[\\/][^\\/]+\.webp$/.test(file))){
  const path='/'+relative(publicDir,file).split(sep).join('/').replace(/\.webp$/,'-720.webp'),bytes=await sharp(file).resize({width:720,withoutEnlargement:true}).webp({quality:72,effort:6}).toBuffer();
  const target=join(outDir,'files',path.slice(1));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
  imageManifest[path]={hash:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,built:true};
}
writeFileSync(join(outDir,'manifest.json'),JSON.stringify({version:1,files:manifest,images:imageManifest},null,1));
console.log(`Built ${files.length+vendor.length} text assets, ${images.length} image validators and ${Object.values(imageManifest).filter(image=>image.built).length} card photos: source ${totals.source} B → minified ${totals.minified} B → brotli ${totals.br} B (gzip ${totals.gzip} B).`);
