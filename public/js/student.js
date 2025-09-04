async function api(u,o){ const r=await fetch(u,o); if(!r.ok) throw await r.json(); return r.json(); }
async function loadMe(){ const {user}=await api('/api/auth/me'); document.getElementById('welcome').textContent=`Γεια σου, ${user.full_name||user.username}`; }
async function loadThesis(){ const t=await api('/api/student/thesis'); document.getElementById('thesisBox').textContent= t? JSON.stringify(t,null,2) : 'Δεν υπάρχει ανάθεση.'; }
document.getElementById('logoutBtn').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});location.href='/'};
document.getElementById('saveProfile').onclick=async()=>{
  await api('/api/student/profile',{method:'POST',headers:{'Content-Type':'application/json'},
  body: JSON.stringify({address:addr.value,email_contact:em.value,phone_mobile:mob.value,phone_landline:land.value})});
  alert('Αποθηκεύτηκε!');
};
loadMe(); loadThesis();
