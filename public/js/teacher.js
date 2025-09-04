async function api(url,opts){ const r=await fetch(url,opts); if(!r.ok) throw await r.json(); return r.json(); }
function esc(s){ return String(s??''); }

async function loadMe(){
  const {user} = await api('/api/auth/me');
  document.getElementById('welcome').textContent = `Καλώς ήρθες, ${user.full_name || user.username} (${user.role})`;
}
async function loadTopics(){
  const rows = await api('/api/teacher/topics');
  const tb = document.getElementById('topicsTbody'); tb.innerHTML='';
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.id}</td><td>${esc(r.title)}</td><td>${new Date(r.created_at).toLocaleString()}</td>`;
    tb.appendChild(tr);
  });
}
async function loadAssignments(){
  const rows = await api('/api/teacher/assignments');
  const tb = document.getElementById('assignmentsTbody'); tb.innerHTML='';
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.id}</td><td>${esc(r.student)}</td><td>${esc(r.title)}</td><td><span class="badge">${r.status}</span></td>`;
    tb.appendChild(tr);
  });
}
async function loadInvitations(){
  const rows = await api('/api/teacher/invitations');
  const tb = document.getElementById('invTbody'); tb.innerHTML='';
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.id}</td><td>${esc(r.title)}</td><td>${r.status}</td>
      <td>${r.status==='pending' ? `<button data-id="${r.id}" data-act="accept">Αποδοχή</button>
                                   <button data-id="${r.id}" data-act="reject">Απόρριψη</button>`:''}</td>`;
    tb.appendChild(tr);
  });
  tb.addEventListener('click', async e=>{
    const b = e.target.closest('button'); if(!b) return;
    await api('/api/teacher/invitations/respond',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invitation_id:b.dataset.id, action:b.dataset.act})});
    loadInvitations();
  }, {once:true});
}
async function loadStats(){
  const s = await api('/api/teacher/stats');
  const ctx = document.getElementById('statsChart');
  new Chart(ctx, {
    type: 'bar',
    data: { labels:['Πλήθος','Μ.Ο. Ημέρες','Μ.Ο. Βαθμός'],
            datasets:[{ label:'Στατιστικά', data:[s.total_supervised, s.avg_days_open, s.avg_grade] }]},
    options: { responsive:true, plugins:{legend:{display:false}} }
  });
}

document.getElementById('createTopicBtn').onclick = async ()=>{
  const title = document.getElementById('t_title').value.trim();
  const description = document.getElementById('t_desc').value.trim();
  if(!title) return alert('Τίτλος υποχρεωτικός');
  await api('/api/teacher/topics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,description})});
  document.getElementById('t_title').value=''; document.getElementById('t_desc').value='';
  loadTopics();
};
document.getElementById('assignBtn').onclick = async ()=>{
  const topic_id=Number(document.getElementById('a_topic').value), student_id=Number(document.getElementById('a_student').value);
  if(!topic_id || !student_id) return alert('Συμπλήρωσε IDs');
  await api('/api/teacher/assign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic_id,student_id})});
  loadAssignments();
};
document.getElementById('logoutBtn').onclick = async ()=>{ await api('/api/auth/logout',{method:'POST'}); location.href='/'; };
document.getElementById('exportJson').onclick = (e)=>{ e.preventDefault(); window.open('/api/teacher/theses/export?format=json','_blank'); };
document.getElementById('exportCsv').onclick  = (e)=>{ e.preventDefault(); window.open('/api/teacher/theses/export?format=csv','_blank'); };

loadMe(); loadTopics(); loadAssignments(); loadInvitations(); loadStats();
