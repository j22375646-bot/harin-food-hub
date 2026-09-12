(()=>{
 const page=document.querySelector('[data-page="settings"]'),grid=page.querySelector('.settings-grid'),nav=page.querySelector('.settings-jump');
 const groups=[['team-profile-title','프로필'],['theme-title','화면'],['app-update-title','업데이트'],['settings-connection-title','조회 연결'],['business-list-title','사업장'],['api-title','API'],['settings-history-title','출고 기록']];
 const cards=[...grid.querySelectorAll('.setting-card')].filter(n=>!n.parentElement.closest('.setting-card'));
 const panels=new Map(groups.map(([id])=>{const n=document.createElement('div');n.id='settings-panel-'+id;n.className='settings-tab-panel';n.setAttribute('role','tabpanel');n.setAttribute('aria-labelledby','settings-tab-'+id);return [id,n];}));
 for(const card of cards){let id=groups.find(([id])=>card.querySelector('#'+id))?.[0];if(!id)id=card.classList.contains('telegram-guide')?'api-title':'team-profile-title';panels.get(id).append(card);}
 grid.replaceChildren(...panels.values());nav.replaceChildren();nav.setAttribute('role','tablist');nav.setAttribute('aria-label','앱 설정');
 const buttons=groups.map(([id,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.id='settings-tab-'+id;b.dataset.settingsTarget=id;b.setAttribute('role','tab');b.setAttribute('aria-controls',panels.get(id).id);b.onclick=()=>open(id);nav.append(b);return b;});
 function open(id){if(!panels.has(id))return;for(const [key,panel]of panels)panel.hidden=key!==id;for(const b of buttons){const active=b.dataset.settingsTarget===id;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}page.dispatchEvent(new Event('settings-tab-change'));}
 nav.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();let index=buttons.indexOf(document.activeElement);index=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;open(groups[index][0]);buttons[index].focus();});
 window.moaonSettings={open};open('team-profile-title');
})();
