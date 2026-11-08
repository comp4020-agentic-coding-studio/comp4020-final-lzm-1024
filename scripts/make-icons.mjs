// Regenerates the raster site icons from public/icon.svg (the header's ▦ mark on
// the default campus green). Run after changing the SVG: node scripts/make-icons.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';

const svg=readFileSync('public/icon.svg');
// iOS rounds home-screen icons itself, so its copy fills the square edge to edge.
const square=Buffer.from(svg.toString().replace('rx="14" fill="#335747"','fill="#335747"'));
const png=(source,size)=>sharp(source,{density:Math.ceil(72*size/64)}).resize(size,size).png({compressionLevel:9}).toBuffer();

writeFileSync('public/icon-192.png',await png(svg,192));
writeFileSync('public/icon-512.png',await png(svg,512));
writeFileSync('public/apple-touch-icon.png',await png(square,180));

// favicon.ico for browsers and tools that only look there: one 32px PNG inside an ICO header.
const image=await png(svg,32),header=Buffer.alloc(22);
header.writeUInt16LE(0,0);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
header.writeUInt8(32,6);header.writeUInt8(32,7);header.writeUInt8(0,8);header.writeUInt8(0,9);
header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(image.length,14);header.writeUInt32LE(22,18);
writeFileSync('public/favicon.ico',Buffer.concat([header,image]));
console.log('Wrote icon-192.png, icon-512.png, apple-touch-icon.png and favicon.ico');
