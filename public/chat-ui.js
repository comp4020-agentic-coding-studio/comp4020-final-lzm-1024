import {escapeHtml as esc} from './ui-utils.js';
export function avatar(person={},extra='',linked=true){
 const valid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(person.avatarId||'');
 const userId=person.authorId||person.id||'',link=linked&&/^[a-f0-9-]{36}$/.test(userId);
 return `<span ${link?`data-profile-user="${esc(userId)}" role="link" tabindex="0" aria-label="View ${esc(person.name||person.author||'user')} profile"`:'aria-hidden="true"'} class="user-avatar ${extra}" data-avatar-user="${esc(person.authorId||person.id||'')}"><span>${esc(Array.from(person.name||person.author||'?')[0].toUpperCase())}</span>${valid?`<img src="/avatars/${person.avatarId}.webp" width="40" height="40" alt="" loading="lazy">`:''}</span>`;
}
export function refreshAvatars(root,person){root.querySelectorAll('[data-avatar-user]').forEach(node=>{if(node.dataset.avatarUser===person.id)node.outerHTML=avatar(person,node.classList.contains('dm-avatar')?'dm-avatar':'');});}
const groups=[['Smileys','😊 😃 😄 😁 😆 😂 🤣 🙂 🙃 😉 😍 🥰 😎 🤓 🥳 🤔 😴 😭 😅 🫡 🥹 😇 🤗'],['Hearts','❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💕 💖 💝 💯 ✨ ⭐ 🌟 🔥 🎉 🎊'],['Gestures','👍 👎 👋 🙌 👏 🤝 ✌️ 🤞 💪 🙏 🫶 👌 🤙 👐'],['Campus','📚 🎓 📝 💻 🎨 🎵 🎮 ⚽ 🏀 🎾 🏆 📷 🎬 🎤 💡 🧠 🔬 🚀'],['Nature & food','🌸 🌻 🌿 🌈 ☀️ 🌙 🐨 🐱 🐶 🦋 🍕 🍔 🍜 🍣 🍰 🍎 ☕ 🧋 🍵']];
export function mountEmoji(form,input){
 const host=document.createElement('div');host.className='emoji-picker';
 host.innerHTML='<button type="button" class="emoji-toggle" aria-label="Choose emoji" aria-expanded="false">☺ <span>Emoji</span></button><div class="emoji-popover" hidden><div class="emoji-top"><strong>Add a little expression</strong><button type="button" aria-label="Close emoji picker">✕</button></div><div class="emoji-tabs" role="group" aria-label="Emoji categories"></div><div class="emoji-grid" role="group" aria-label="Emoji"></div><p class="emoji-status" role="status"></p></div>';
 input.after(host);const toggle=host.querySelector('.emoji-toggle'),panel=host.querySelector('.emoji-popover'),grid=host.querySelector('.emoji-grid'),status=host.querySelector('.emoji-status');let start=0,end=0;
 const capture=()=>{start=input.selectionStart;end=input.selectionEnd;};
 const close=()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false');};
 function render(index){host.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.category)===index)));grid.replaceChildren();for(const value of groups[index][1].split(' ')){const b=document.createElement('button');b.type='button';b.textContent=value;b.setAttribute('aria-label',`Insert ${value}`);b.onclick=()=>{if(input.disabled)return;const length=input.value.length-(end-start)+value.length;if(input.maxLength>0&&length>input.maxLength){status.textContent='Message length limit reached.';return;}input.focus();input.setSelectionRange(start,end);input.setRangeText(value,start,end,'end');capture();input.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='';};grid.append(b);}}
 groups.forEach(([name],index)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.dataset.category=index;b.onclick=()=>render(index);host.querySelector('.emoji-tabs').append(b);});render(0);
 toggle.onpointerdown=capture;toggle.onclick=()=>{if(input.disabled)return;if(panel.hidden){capture();panel.hidden=false;toggle.setAttribute('aria-expanded','true');}else close();};host.querySelector('.emoji-top button').onclick=()=>{close();input.focus();};
 const outside=e=>{if(!host.contains(e.target))close();},escape=e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopPropagation();close();toggle.focus();}};
 input.addEventListener('select',capture);input.addEventListener('keyup',capture);input.addEventListener('click',capture);document.addEventListener('pointerdown',outside);host.addEventListener('keydown',escape);
 return ()=>{input.removeEventListener('select',capture);input.removeEventListener('keyup',capture);input.removeEventListener('click',capture);document.removeEventListener('pointerdown',outside);host.removeEventListener('keydown',escape);host.remove();};
}
