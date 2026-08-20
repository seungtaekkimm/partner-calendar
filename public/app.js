
let view=new Date(), selected=null, events=[], adminPin=sessionStorage.getItem('partnerAdminPin')||'';
let profile=JSON.parse(localStorage.getItem('partnerProfile')||'null');
const $=id=>document.getElementById(id);
const catNames={hq:'HQ Visit',meeting:'미팅',conference:'학회',training:'교육',kol:'KOL Lecture',other:'기타'};
const catClass=c=>'cat-'+(c||'other');
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

async function api(url,opt={}){
  opt.headers={...(opt.headers||{}),'Content-Type':'application/json'};
  if(adminPin) opt.headers['x-admin-pin']=adminPin;
  const r=await fetch(url,opt); if(!r.ok) throw new Error(await r.text()); return r.json();
}
async function load(){ events=await api('/api/events'); render(); }

function updateProfileUI(){
  $('profileBtn').textContent=profile?`${profile.company} · ${profile.name}`:'내 정보';
  $('newBtn').hidden=!adminPin;
}
function ensureProfile(){
  if(profile)return true;
  $('profileDlg').showModal(); return false;
}

function datesBetween(a,b){
  const out=[], cur=new Date(a+'T00:00:00'), end=new Date((b||a)+'T00:00:00');
  while(cur<=end){out.push(ymd(cur));cur.setDate(cur.getDate()+1)} return out;
}
function eventsOn(date){return events.filter(e=>datesBetween(e.start_date,e.end_date).includes(date));}
function render(){
  $('month').textContent=`${view.getFullYear()}년 ${view.getMonth()+1}월`;
  const box=$('days');box.innerHTML='';
  const first=new Date(view.getFullYear(),view.getMonth(),1), start=new Date(first);start.setDate(1-first.getDay());
  const today=ymd(new Date());
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const key=ymd(d);
    const el=document.createElement('div');el.className='day'+(d.getMonth()!=view.getMonth()?' off':'')+(key===today?' today':'');
    el.onclick=()=>{selected=key;showDetail()};
    el.innerHTML=`<div class="num">${d.getDate()}</div>`;
    eventsOn(key).slice(0,3).forEach(e=>{const x=document.createElement('div');x.className='event '+catClass(e.category);x.textContent=(e.time?e.time+' ':'')+e.title;el.appendChild(x)});
    box.appendChild(el);
  }
  if(selected)showDetail();
}
function showDetail(){
  $('selectedTitle').textContent=selected||'선택한 날짜';
  const list=eventsOn(selected), d=$('detail');d.innerHTML='';
  if(!list.length){d.className='empty';d.textContent='등록된 행사가 없습니다.';return}
  d.className='';
  list.forEach(e=>{
    const attendees=(e.responses||[]).filter(r=>r.status==='참석');
    const mine=profile?(e.responses||[]).find(r=>r.company===profile.company&&r.position===profile.position&&r.name===profile.name):null;
    const div=document.createElement('div');div.className='item';
    div.innerHTML=`
      <span class="badge ${catClass(e.category)}">${catNames[e.category]}</span>
      <b>${e.title}</b><div class="meta">${e.start_date}${e.end_date!==e.start_date?' ~ '+e.end_date:''}${e.time?' · '+e.time:''}${e.place?' · '+e.place:''}</div>
      <div style="margin-top:7px;font-size:13px">${e.description||''}</div>
      <div class="actions">
        <button class="btn yes" data-rsvp="참석">${mine?.status==='참석'?'✓ 참석 중':'참석'}</button>
        <button class="btn no" data-rsvp="불참">${mine?.status==='불참'?'✓ 불참':'불참'}</button>
        ${adminPin?'<button class="btn ghost" data-edit>수정</button><button class="btn ghost" data-delete style="color:#b91c1c">삭제</button>':''}
      </div>
      <div style="margin-top:10px;font-size:12px"><b style="font-size:12px">참석자</b><div class="meta">${attendees.length?attendees.map(r=>`${r.company} · ${r.position} · ${r.name}`).join('<br>'):'아직 참석자가 없습니다.'}</div></div>
      <div class="review"><textarea rows="2" placeholder="후기를 남겨주세요"></textarea><input type="file" accept="image/*" multiple><button class="btn ghost" data-review>후기/사진 등록</button></div>
      <div class="reviews"></div>`;
    div.querySelectorAll('[data-rsvp]').forEach(b=>b.onclick=()=>rsvp(e.id,b.dataset.rsvp));
    if(adminPin){div.querySelector('[data-edit]').onclick=()=>openEdit(e);div.querySelector('[data-delete]').onclick=()=>removeEvent(e.id)}
    div.querySelector('[data-review]').onclick=()=>addReview(e.id,div);
    const rb=div.querySelector('.reviews');
    (e.reviews||[]).forEach(r=>{
      const z=document.createElement('div');z.style='font-size:12px;margin-top:10px;padding-top:8px;border-top:1px solid #eee';
      z.innerHTML=`<b>${r.company} · ${r.position} · ${r.name}</b><div>${r.text||''}</div><div class="meta">${new Date(r.created_at).toLocaleString()}</div><div class="photos">${(r.images||[]).map(x=>`<img src="${x}">`).join('')}</div>`;rb.appendChild(z)
    });
    d.appendChild(div);
  });
}
async function rsvp(id,status){
  if(!ensureProfile())return;
  await api(`/api/events/${id}/rsvp`,{method:'POST',body:JSON.stringify({...profile,status})}); await load();
}
async function addReview(id,div){
  if(!ensureProfile())return;
  const text=div.querySelector('textarea').value, files=[...div.querySelector('input[type=file]').files];
  const images=await Promise.all(files.map(f=>new Promise(r=>{const rd=new FileReader();rd.onload=()=>r(rd.result);rd.readAsDataURL(f)})));
  await api(`/api/events/${id}/reviews`,{method:'POST',body:JSON.stringify({...profile,text,images})});await load();
}

function openNew(){
  $('eventModalTitle').textContent='행사 등록';$('editId').value='';$('category').value='hq';$('eventTitle').value='';
  const v=selected||ymd(new Date());$('startDate').value=v;$('endDate').value=v;$('eventTime').value='';$('eventPlace').value='';$('eventDesc').value='';$('eventDlg').showModal();
}
function openEdit(e){
  $('eventModalTitle').textContent='행사 수정';$('editId').value=e.id;$('category').value=e.category;$('eventTitle').value=e.title;
  $('startDate').value=e.start_date;$('endDate').value=e.end_date;$('eventTime').value=e.time||'';$('eventPlace').value=e.place||'';$('eventDesc').value=e.description||'';$('eventDlg').showModal();
}
async function removeEvent(id){if(confirm('이 행사를 삭제할까요?')){await api('/api/events/'+id,{method:'DELETE'});await load()}}

$('profileBtn').onclick=()=>{
  if(profile){$('company').value=profile.company;$('position').value=profile.position;$('userName').value=profile.name}
  $('profileDlg').showModal()
};
$('profileForm').onsubmit=e=>{
  e.preventDefault();profile={company:$('company').value.trim(),position:$('position').value.trim(),name:$('userName').value.trim()};
  localStorage.setItem('partnerProfile',JSON.stringify(profile));$('profileDlg').close();updateProfileUI();showDetail();
};
$('adminBtn').onclick=async()=>{
  const pin=prompt('관리자 PIN을 입력하세요.');if(pin===null)return;
  const r=await api('/api/admin/login',{method:'POST',body:JSON.stringify({pin})});
  if(r.ok){adminPin=pin;sessionStorage.setItem('partnerAdminPin',pin);updateProfileUI();showDetail();alert('관리자 모드입니다.')}else alert('PIN이 올바르지 않습니다.');
};
$('newBtn').onclick=openNew;
$('cancelEvent').onclick=()=>$('eventDlg').close();
$('eventForm').onsubmit=async e=>{
  e.preventDefault();
  const body={category:$('category').value,title:$('eventTitle').value,start_date:$('startDate').value,end_date:$('endDate').value,time:$('eventTime').value,place:$('eventPlace').value,description:$('eventDesc').value};
  const id=$('editId').value;
  await api(id?'/api/events/'+id:'/api/events',{method:id?'PUT':'POST',body:JSON.stringify(body)});
  $('eventDlg').close();selected=body.start_date;view=new Date(body.start_date+'T00:00:00');await load();
};
$('prevBtn').onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);render()};
$('nextBtn').onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);render()};

updateProfileUI(); load();
if(!profile)setTimeout(()=>$('profileDlg').showModal(),200);
