import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import sharp from 'sharp';
const gallery=JSON.parse(readFileSync(new URL('../data/photo-gallery.json',import.meta.url),'utf8'));
const directory=new URL('../public/demo-photos/',import.meta.url);mkdirSync(directory,{recursive:true});
for(const event of gallery.events){
  const target=new URL(`${event.key}.webp`,directory);if(existsSync(target))continue;
  const response=await fetch(`https://images.pexels.com/photos/${event.photo.id}/pexels-photo-${event.photo.id}.jpeg?auto=compress&cs=tinysrgb&w=1400`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error(`Photo ${event.key}: ${response.status}`);
  const image=sharp(Buffer.from(await response.arrayBuffer())).rotate(),metadata=await image.metadata();
  if(metadata.width<1000&&metadata.height<1000)throw Error(`Photo ${event.key} is too small`);
  const encoded=await image.resize({width:1400,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:86}).toBuffer();
  writeFileSync(target,encoded);console.log(`${event.key}: ${Math.round(encoded.length/1024)} KB`);
}
