import {escapeHtml as esc} from './ui-utils.js';
import {resolveDesign} from './poster-design.js';
export const objectTypes=['text','sticky','rect','ellipse','line','arrow','image','path'];
export const objectDefaults={x:100,y:100,width:280,height:150,rotation:0,opacity:1,fill:'#eaf0ff',stroke:'#3856bc',strokeWidth:2,text:'',fontSize:32,fontFamily:'sans',align:'left',src:'',fit:'cover',locked:false,points:[]};
export const numericProps={x:[-16000,16000],y:[-16000,16000],width:[8,8000],height:[8,8000],rotation:[-360,360],opacity:[0,1],strokeWidth:[0,30],fontSize:[8,200]};
function error(message,status=400){throw Object.assign(new Error(message),{status});}
export function validateProps(props){
 if(!props||typeof props!=='object'||Array.isArray(props)||!Object.keys(props).length)error('Choose an object property');const out={};
 for(const [key,v] of Object.entries(props)){
  if(numericProps[key]){const [min,max]=numericProps[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)error('Invalid '+key);out[key]=Math.round(v*100)/100;}
  else if(['fill','stroke'].includes(key)){if(typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v))error('Choose a hex colour');out[key]=v;}
  else if(key==='text'){if(typeof v!=='string'||v.length>2000)error('Text must be at most 2000 characters');out[key]=v;}
  else if(key==='src'){if(typeof v!=='string'||v.length>1500||v&&!/^\/media\/[a-f0-9-]{36}$/.test(v)&&!/^https:\/\//.test(v))error('Choose a valid image');if(v.startsWith('https:')){try{if(new URL(v).protocol!=='https:')error('Choose HTTPS');}catch{error('Choose a valid image URL');}}out[key]=v;}
  else if(key==='fontFamily'||key==='align'||key==='fit'){const choices={fontFamily:['serif','sans','display','mono'],align:['left','center','right'],fit:['cover','contain']};if(!choices[key].includes(v))error('Invalid '+key);out[key]=v;}
  else if(key==='locked'){if(typeof v!=='boolean')error('Invalid lock');out[key]=v;}
  else if(key==='points'){if(!Array.isArray(v)||v.length>600||v.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>8000)))error('Invalid drawing points');out[key]=v.map(p=>p.map(n=>Math.round(n*10)/10));}
  else error('This object property cannot be edited');
 }return out;
}
function validId(id){if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(id))error('Invalid object ID');return id;}
export function seedCanvas(p){
 if(p.canvasPreset==='blank')return {width:2400,height:1600,background:'#ffffff',objects:[],receipts:[]};
 const d=resolveDesign(p),colours={sunshine:['#f4e0a0','#403524'],sage:['#dbe8d5','#244632'],lavender:['#e3dcf0','#393450'],coral:['#efbda9','#583826'],sky:['#d9eaf3','#203c52'],ink:['#142338','#ffffff']},palette=colours[p.style]||['#f4efe6','#172a32'],bg=d.customColours==='on'?d.backgroundColour:palette[0],fg=d.customColours==='on'?d.textColour:palette[1];
 const objects=[],add=(id,type,props)=>objects.push({id,type,...objectDefaults,...props});
 if(p.heroImageUrl)add('base-photo','image',{x:0,y:0,width:900,height:d.layout==='cover'?1200:550,src:p.heroImageUrl});
 add('base-campus','text',{x:70,y:55,width:750,height:70,text:(p.universityId||'campus').toUpperCase()+' / '+(p.category||'EVENT').toUpperCase(),fontSize:22,fill:fg});
 add('base-decoration','text',{x:550,y:220,width:230,height:230,text:'✳',fontSize:185,fill:d.accentColour});
 add('base-title','text',{x:80,y:650,width:740,height:200,text:p.title||'Your next campus moment',fontSize:72,fontFamily:d.fontFamily,fill:p.heroImageUrl&&d.layout==='cover'?'#ffffff':fg});
 if(p.subtitle)add('base-subtitle','text',{x:80,y:865,width:720,height:110,text:p.subtitle,fontSize:28,fill:p.heroImageUrl&&d.layout==='cover'?'#ffffff':fg});
 add('base-when','text',{x:80,y:1055,width:720,height:60,text:[p.date||'Date to come',p.time].filter(Boolean).join(' · '),fontSize:25,fill:p.heroImageUrl&&d.layout==='cover'?'#ffffff':fg});
 add('base-where','text',{x:80,y:1120,width:720,height:50,text:p.location||'Your campus, your place',fontSize:21,fill:p.heroImageUrl&&d.layout==='cover'?'#ffffff':fg});
 return {width:900,height:1200,background:bg,objects,receipts:[]};
}
export function applyCanvasOperation(canvas,input){
 const c=structuredClone(canvas);if(!input||typeof input!=='object')error('Invalid canvas operation');const action=input.action;
 if(action==='settings'){const props=input.props;if(!props||Object.keys(props).some(k=>!['width','height','background'].includes(k)))error('Invalid canvas settings');for(const [k,v] of Object.entries(props)){if(k==='background'){if(!/^#[a-f0-9]{6}$/i.test(v))error('Choose a background colour');}else if(!Number.isInteger(v)||v<320||v>8000)error('Canvas size must be between 320 and 8000');if(input.expected&&JSON.stringify(c[k])!==JSON.stringify(input.expected[k]))error('A friend changed this setting; their edit has been kept',409);c[k]=v;}return c;}
 if(action==='add'){const o=input.object;validId(o?.id);if(!objectTypes.includes(o.type))error('Choose a valid object');if(c.objects.length>=180)error('This board has reached its 180-object limit');if(c.objects.some(e=>e.id===o.id))error('This object already exists',409);const {id,type,...props}=o;c.objects.push({id,type,...objectDefaults,...validateProps(props)});return c;}
 const id=validId(input.id),index=c.objects.findIndex(o=>o.id===id);if(index<0)error('This object was removed by a collaborator',409);const o=c.objects[index];
 if(input.expected&&Object.entries(input.expected).some(([key,value])=>JSON.stringify(o[key])!==JSON.stringify(value)))error('A friend changed this object; their edit has been kept',409);
 if(action==='patch'){const props=validateProps(input.props);if(o.locked&&Object.keys(props).some(k=>k!=='locked'))error('Unlock this object before editing it',409);Object.assign(o,props);}
 else if(action==='delete'){if(o.locked)error('Unlock this object before deleting it',409);c.objects.splice(index,1);}
 else if(action==='reorder'){if(input.expectedIndex!==undefined&&input.expectedIndex!==index)error('A friend changed this layer; their edit has been kept',409);if(input.position==='at'&&(!Number.isInteger(input.index)||input.index<0||input.index>=c.objects.length))error('Invalid layer index');if(!['front','back','forward','backward','at'].includes(input.position))error('Choose a layer position');c.objects.splice(index,1);c.objects.splice(input.position==='at'?input.index:input.position==='front'?c.objects.length:input.position==='back'?0:input.position==='forward'?Math.min(index+1,c.objects.length):Math.max(index-1,0),0,o);}
 else error('Invalid canvas operation');return c;
}
const fonts={serif:'Georgia,serif',sans:'Arial,sans-serif',display:'Arial Black,Arial,sans-serif',mono:'Courier New,monospace'};
function textLines(o){const capacity=Math.max(1,o.width/o.fontSize),lines=[],weight=ch=>ch.codePointAt(0)>=0x2e80?1:/\s/.test(ch)?.32:.56;for(const paragraph of o.text.split('\n')){let line='',used=0;for(const word of paragraph.split(/(\s+)/)){const chars=Array.from(word),size=chars.reduce((n,ch)=>n+weight(ch),0);if(used+size>capacity&&line&&size<=capacity){lines.push(line.trimEnd());line='';used=0;}for(const ch of chars){const width=weight(ch);if(used+width>capacity&&line){lines.push(line.trimEnd());line='';used=0;}if(!line&&/\s/.test(ch))continue;line+=ch;used+=width;}}lines.push(line);}return lines.slice(0,80);}
export function canvasObjectSvg(o,interactive=false){
 const w=o.width,h=o.height,stroke=`stroke="${o.stroke}" stroke-width="${o.strokeWidth}"`,fill=`fill="${o.fill}"`;let inside='';
 if(o.type==='rect'||o.type==='sticky')inside=`<rect width="${w}" height="${h}" rx="${o.type==='sticky'?8:3}" ${fill} ${stroke}/>`;
 if(o.type==='ellipse')inside=`<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}" ${fill} ${stroke}/>`;
 if(o.type==='line'||o.type==='arrow'){inside=`<path d="M 0 0 L ${w} ${h}" fill="none" ${stroke}/>`;if(o.type==='arrow')inside+=`<path d="M ${w-25} ${h} L ${w} ${h} L ${w} ${h-25}" fill="none" ${stroke}/>`;}
 if(o.type==='image'&&o.src)inside=`<image href="${esc(o.src)}" width="${w}" height="${h}" preserveAspectRatio="${o.fit==='cover'?'xMidYMid slice':'xMidYMid meet'}"/>`;
 if(o.type==='path')inside=`<path d="${o.points.map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ')}" fill="none" ${stroke} stroke-linecap="round" stroke-linejoin="round" transform="scale(${w/Math.max(1,...o.points.map(p=>p[0]))} ${h/Math.max(1,...o.points.map(p=>p[1]))})" vector-effect="non-scaling-stroke"/>`;
 if(o.type==='text'||o.type==='sticky'){const inset=o.type==='sticky'?18:0;inside+=`<text x="${o.align==='center'?w/2:o.align==='right'?w-inset:inset}" y="${o.fontSize+inset}" fill="${o.type==='sticky'?o.stroke:o.fill}" font-size="${o.fontSize}" font-family="${fonts[o.fontFamily]}" font-weight="${o.fontFamily==='display'?900:500}" text-anchor="${o.align==='center'?'middle':o.align==='right'?'end':'start'}">${textLines(o).map((line,i)=>`<tspan x="${o.align==='center'?w/2:o.align==='right'?w-inset:inset}" dy="${i?o.fontSize*1.22:0}">${esc(line)}</tspan>`).join('')}</text>`;}
 return `<g ${interactive?`data-canvas-item="${o.id}" tabindex="0" role="button" aria-label="${esc(o.type+' '+(o.text||'object').slice(0,60))}"`:''} transform="translate(${o.x} ${o.y}) rotate(${o.rotation} ${w/2} ${h/2})" opacity="${o.opacity}">${interactive?`<rect class="canvas-hit" width="${w}" height="${h}" fill="transparent"/>`:''}${inside}</g>`;
}
export function canvasSvg(c,interactive=false){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.width} ${c.height}" width="${c.width}" height="${c.height}" class="canvas-document" role="img" aria-label="Shared canvas design"><rect width="100%" height="100%" fill="${c.background}"/>${c.objects.map(o=>canvasObjectSvg(o,interactive)).join('')}</svg>`;}
export function canvasPoster(p,large=false){return `<div class="poster canvas-poster${large?' large':''}" style="aspect-ratio:${p.canvas.width}/${p.canvas.height}" aria-label="${esc(p.title||'Campus design')}">${canvasSvg(p.canvas)}</div>`;}
