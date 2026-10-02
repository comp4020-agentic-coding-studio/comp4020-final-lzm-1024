import {createServer,request} from 'node:http';
import {connect} from 'node:net';

// Disposable loopback-only network fixture. This never proxies external sites.
const target=Number(process.env.PREVIEW_PORT||18116),port=Number(process.env.SLOW_PORT||18117);
const delay=Number(process.env.SLOW_DELAY_MS||300),chunkBytes=16*1024,tickMs=250;
const server=createServer((req,res)=>{
 const upstream=request({hostname:'127.0.0.1',port:target,path:req.url,method:req.method,headers:req.headers},response=>{
  response.pause();setTimeout(()=>{
   res.writeHead(response.statusCode,response.headers);let queued=[],ended=false,blocked=false;
   response.on('data',buffer=>{queued.push(buffer);response.pause();});response.on('end',()=>ended=true);response.on('error',()=>res.destroy());
   const timer=setInterval(()=>{if(res.destroyed){clearInterval(timer);upstream.destroy();return;}if(blocked)return;
    if(queued.length){const head=queued[0],chunk=head.subarray(0,chunkBytes);if(head.length<=chunkBytes)queued.shift();else queued[0]=head.subarray(chunkBytes);blocked=!res.write(chunk);}
    if(!queued.length){if(ended){clearInterval(timer);res.end();}else response.resume();}
   },tickMs);res.on('drain',()=>blocked=false);res.on('close',()=>{clearInterval(timer);upstream.destroy();});response.resume();
  },delay);
 });upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
});
server.on('upgrade',(req,socket,head)=>{
 const upstream=connect(target,'127.0.0.1',()=>{
  upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`+Object.entries(req.headers).map(([key,value])=>`${key}: ${value}`).join('\r\n')+'\r\n\r\n');if(head.length)upstream.write(head);
 });const timers=new Set();
 function forward(from,to){from.on('data',data=>{from.pause();const timer=setTimeout(()=>{timers.delete(timer);if(!to.destroyed){if(to.write(data))from.resume();else to.once('drain',()=>from.resume());}},delay);timers.add(timer);});}
 forward(socket,upstream);forward(upstream,socket);
 function close(){for(const timer of timers)clearTimeout(timer);timers.clear();socket.destroy();upstream.destroy();}
 socket.on('close',close);upstream.on('close',close);socket.on('error',close);upstream.on('error',close);
});
server.listen(port,'127.0.0.1',()=>console.log(`Slow local preview: ${delay} ms each direction for sockets; HTTP ${delay} ms plus 64 KiB/s per response. Port ${port} -> ${target}.`));
