async function api(u,o){ const r=await fetch(u,o); if(!r.ok) throw await r.json(); return r.json(); }
async function load(){ const rows = await api('/api/secretariat/theses'); const tb=document.getElementById('thesesTbody'); tb.innerHTML='';
  rows.forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.id}</td><td>${r.student}</td><td>${r.title}</td><td>${r.status}</td>`; tb.appendChild(tr); });
}
document.getElementById('importBtn').onclick = async ()=>{
  let items; try{ items = JSON.parse(document.getElementById('jsonArea').value) }catch{ return alert('Μη έγκυρο JSON'); }
  await api('/api/secretariat/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});
  alert('OK'); load();
};
document.getElementById('logoutBtn').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});location.href='/'};
load();
