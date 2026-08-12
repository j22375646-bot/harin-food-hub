'use client';

import { useEffect, useState } from 'react';

const roleLabel={OWNER:'소유자',OPERATOR:'운영자',VIEWER:'조회자'};
const emptyForm={username:'',email:'',displayName:'',role:'VIEWER',password:''};

export default function UserManagement({currentUser}){
  const [users,setUsers]=useState([]),[loading,setLoading]=useState(true),[working,setWorking]=useState(''),[message,setMessage]=useState(''),[form,setForm]=useState(emptyForm);
  async function load(){setLoading(true);try{const response=await fetch('/api/dashboard/users',{cache:'no-store'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'계정 조회 실패');setUsers(result.users);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  async function create(event){event.preventDefault();setWorking('create');setMessage('계정을 생성 중…');try{const response=await fetch('/api/dashboard/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'계정 생성 실패');setForm(emptyForm);setMessage('계정을 생성했습니다. 새 사용자는 바로 로그인할 수 있습니다.');await load();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  async function update(user,patch){setWorking(user.user_id);setMessage('권한과 세션을 갱신 중…');try{const response=await fetch(`/api/dashboard/users/${user.user_id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(patch)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'계정 변경 실패');setMessage(patch.active===false?'계정을 비활성화하고 열린 세션을 모두 폐기했습니다.':'계정 권한을 갱신하고 기존 세션을 폐기했습니다.');await load();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}}
  return <main className="accountAdmin"><header><div><span className="eyebrow">ACCESS CONTROL · OWNER</span><h1>계정과 권한 관리</h1><p>개인별 역할을 부여하고 접근을 즉시 중단할 수 있습니다.</p></div><a href="/">허브로 돌아가기</a></header>
    {message&&<div className="accountMessage" role="status">{message}</div>}
    <section className="accountGrid"><article className="panel"><h2>새 계정 만들기</h2><p className="accountHelp">OWNER는 금액·계정 변경, OPERATOR는 수집·주문 운영, VIEWER는 조회만 가능합니다.</p><form className="accountForm" onSubmit={create}>
      <label>계정명<input value={form.username} onChange={event=>setForm({...form,username:event.target.value.toLowerCase()})} pattern="[a-z0-9][a-z0-9._-]{2,31}" required placeholder="예: seobin"/></label>
      <label>표시 이름<input value={form.displayName} onChange={event=>setForm({...form,displayName:event.target.value})} minLength="2" maxLength="80" required placeholder="예: 임서빈"/></label>
      <label>이메일<input type="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value.toLowerCase()})} required placeholder="name@example.com"/></label>
      <label>역할<select value={form.role} onChange={event=>setForm({...form,role:event.target.value})}>{Object.entries(roleLabel).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="wide">초기 비밀번호<input type="password" value={form.password} onChange={event=>setForm({...form,password:event.target.value})} minLength="12" maxLength="200" required autoComplete="new-password" placeholder="12자 이상"/></label>
      <button disabled={working==='create'}>{working==='create'?'생성 중…':'개인 계정 생성'}</button>
    </form></article>
    <article className="panel"><h2>현재 계정</h2>{loading?<p className="accountHelp">계정을 불러오는 중…</p>:<div className="accountList">{users.map(user=><div className={!user.active?'disabled':''} key={user.user_id}><section><b>{user.display_name}</b><small>@{user.username} · {user.email}</small><em>{roleLabel[user.role]} · {user.active?'사용 중':'비활성'}</em></section><aside><select aria-label={`${user.display_name} 역할`} value={user.role} disabled={working===user.user_id} onChange={event=>update(user,{role:event.target.value})}>{Object.entries(roleLabel).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><button className={user.active?'danger':''} disabled={working===user.user_id||user.user_id===currentUser.userId} onClick={()=>update(user,{active:!user.active})}>{user.active?'접근 중지':'다시 활성화'}</button></aside></div>)}</div>}</article></section>
  </main>;
}
