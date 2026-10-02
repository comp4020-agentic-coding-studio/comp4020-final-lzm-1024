export function parseMedia(value){
 if(typeof value!=='string'||value.length>2048)throw Error('Use a video link up to 2048 characters');let url;try{url=new URL(value.trim());}catch{throw Error('Enter a valid HTTPS video link');}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw Error('Use a public HTTPS video link without credentials');
 const host=url.hostname.toLowerCase();if(!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.includes(':')||/^\d+\.\d+\.\d+\.\d+$/.test(host))throw Error('Use a public video host');
 let videoId;
 if(['youtu.be','www.youtu.be'].includes(host))videoId=url.pathname.split('/')[1];
 else if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)){const parts=url.pathname.split('/');videoId=parts[1]==='watch'?url.searchParams.get('v'):['embed','shorts','live'].includes(parts[1])?parts[2]:null;}
 if(videoId){if(!/^[a-zA-Z0-9_-]{11}$/.test(videoId))throw Error('Use a valid YouTube video link');return {kind:'youtube',videoId,url:'https://www.youtube.com/watch?v='+videoId};}
 if(/\.m3u8$/i.test(url.pathname))return {kind:'hls',url:url.href};
 if(/\.(mp4|webm)$/i.test(url.pathname))return {kind:'file',url:url.href};
 throw Error('Use a YouTube link or a direct .mp4, .webm or .m3u8 link. Website pages cannot be played as video.');
}
export function playbackPosition(room,serverTime=Date.now()){return Math.max(0,Math.min(604800,Number(room.position)+(room.playing?Math.max(0,serverTime-Number(room.anchorAt))/1000:0)));}
