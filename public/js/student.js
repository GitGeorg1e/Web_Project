// =========================
// Student UI (polished)
// =========================

// --- Endpoints όπως τα έχεις ήδη ---
const ENDPOINTS = {
  me:               '/api/auth/me',
  logout:           '/api/auth/logout',
  thesis:           '/api/student/thesis',
  profileSave:      '/api/student/profile',
  committeeList:    (assignmentId)=> `/api/student/committee?assignment_id=${encodeURIComponent(assignmentId)}`,
  committeeInvite:  '/api/student/committee/invite',
  committeeDelete:  (inviteId)=> `/api/student/committee/invite/${encodeURIComponent(inviteId)}`,
  draftSave:        (id)=> `/api/student/assignment/${encodeURIComponent(id)}/draft`,
  examSave:         (id)=> `/api/student/assignment/${encodeURIComponent(id)}/exam`,
  repoSave:         (id)=> `/api/student/assignment/${encodeURIComponent(id)}/repository`,
  minutesOpen:      (id)=> `/api/student/assignment/${encodeURIComponent(id)}/report`,
};

// --- DOM helpers ---
const $ = (id)=> document.getElementById(id);
function clear(node){ while(node && node.firstChild) node.removeChild(node.firstChild); }

// --- UI helpers ---
function toast(msg,type='success'){
  const wrap = document.querySelector('.toast-wrap') || (()=>{ const w=document.createElement('div'); w.className='toast-wrap'; document.body.appendChild(w); return w; })();
  const t=document.createElement('div'); t.className='toast ' + (type==='error'?'error':'success'); t.textContent=msg;
  wrap.appendChild(t); setTimeout(()=>t.remove(), 2600);
}
function setLoading(btn,on){
  if(!btn) return;
  btn.disabled=!!on;
  if(on){ btn.dataset.prev = btn.textContent; btn.textContent = 'Παρακαλώ…'; }
  else  { btn.textContent = btn.dataset.prev || btn.textContent; }
}
async function api(url, opts={}){
  const r = await fetch(url, { credentials:'same-origin', ...opts });
  const data = await r.json().catch(()=> ({}));
  if(!r.ok){
    const msg = data.message || r.statusText || 'Σφάλμα αιτήματος';
    toast(msg,'error'); throw new Error(msg);
  }
  return data;
}

// ------- Welcome / Logout -------
async function loadWelcome(){
  try{
    const { user } = await api(ENDPOINTS.me);
    const w = $('welcome'); if(w) w.textContent = `Καλώς ήρθες, ${user.full_name || user.username} (${user.role})`;
  }catch(_e){}
}
$('logout')?.addEventListener('click', async ()=>{
  try{ setLoading($('logout'),true); await api(ENDPOINTS.logout,{method:'POST'}); }
  catch(_e){} finally{ setLoading($('logout'),false); location.href='/'; }
});

// ------- Thesis (και prefill assignment ids) -------
async function loadThesis(){
  const box = $('thesis'); if(!box) return;
  box.textContent = 'Φόρτωση…';
  try{
    const data = await api(ENDPOINTS.thesis);
    clear(box);
    box.appendChild(line('Θέμα:',        data.title ?? '—'));
    box.appendChild(line('Κατάσταση:',   data.status ?? '—'));
    box.appendChild(line('Ανάθεση:',     `#${data.id} — ${new Date(data.created_at).toLocaleString()}`));

    // Prefill assignment id πεδία
    ['invite-assignment-id','draft-assignment-id','exam-assignment-id','repo-assignment-id','report-assignment-id']
      .forEach(id => { const el = $(id); if(el && !el.value) el.value = data.id; });

    await loadCommittee();
  }catch(e){
    box.textContent = e.message || 'Δεν βρέθηκε ανάθεση.';
  }
}
function line(label, value){
  const p=document.createElement('div'); const b=document.createElement('strong'); b.textContent=label; p.appendChild(b); p.append(' '+value); return p;
}

// ------- Προφίλ -------
$('profile-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('button[type="submit"]');
  const payload = {
    address:        $('address')?.value?.trim() || '',
    email_contact:  $('email_contact')?.value?.trim() || '',
    phone_mobile:   $('phone_mobile')?.value?.trim() || '',
    phone_landline: $('phone_landline')?.value?.trim() || ''
  };
  try{
    setLoading(btn,true);
    await api(ENDPOINTS.profileSave, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    toast('Το προφίλ αποθηκεύτηκε');
    const msg=$('profile-msg'); if(msg){ msg.textContent='✅ Αποθηκεύτηκε'; setTimeout(()=> msg.textContent='',1800); }
  }catch(_e){} finally{ setLoading(btn,false); }
});

// ------- Τριμελής Επιτροπή -------
async function loadCommittee(){
  const asg = $('invite-assignment-id')?.value?.trim();
  if(!asg) return;
  try{
    const rows = await api(ENDPOINTS.committeeList(asg));
    const ul = $('committee-list'); if(!ul) return; clear(ul);
    rows.forEach(r=>{
      const li=document.createElement('li');
      li.style.padding='6px 0'; li.style.borderBottom='1px solid var(--border)';
      li.appendChild(document.createTextNode(`${r.full_name || r.username} — `));
      const em=document.createElement('em'); em.textContent=r.status; li.appendChild(em);

      if(r.status==='pending'){
        const space=document.createTextNode(' ');
        const del=document.createElement('button'); del.className='secondary small'; del.type='button'; del.textContent='Ακύρωση';
        del.addEventListener('click', async ()=>{
          if(!confirm('Ακύρωση πρόσκλησης;')) return;
          try{ setLoading(del,true); await api(ENDPOINTS.committeeDelete(r.id), { method:'DELETE' }); toast('Η πρόσκληση ακυρώθηκε'); await loadCommittee(); }
          catch(_e){} finally{ setLoading(del,false); }
        });
        li.appendChild(space); li.appendChild(del);
      }
      ul.appendChild(li);
    });
  }catch(_e){}
}
$('btn-invite')?.addEventListener('click', async ()=>{
  const btn = $('btn-invite');
  const assignment_id = Number($('invite-assignment-id')?.value?.trim());
  const invitee_id    = Number($('invite-teacher-id')?.value?.trim());
  if(!assignment_id || !invitee_id){ toast('Συμπλήρωσε assignment_id και invitee_id','error'); return; }
  try{
    setLoading(btn,true);
    await api(ENDPOINTS.committeeInvite, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ assignment_id, invitee_id })
    });
    $('invite-teacher-id').value='';
    toast('Η πρόσκληση στάλθηκε');
    await loadCommittee();
  }catch(_e){} finally{ setLoading(btn,false); }
});

// ------- Draft & Links -------
$('btn-draft')?.addEventListener('click', async ()=>{
  const btn = $('btn-draft');
  const id = $('draft-assignment-id')?.value?.trim();
  const draft_url = $('draft-url')?.value?.trim();
  const links = ($('links')?.value || '').split('\n').map(s=>s.trim()).filter(Boolean);
  if(!id){ toast('Δώσε assignment_id','error'); return; }
  try{
    setLoading(btn,true);
    await api(ENDPOINTS.draftSave(id), {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ draft_url, links })
    });
    toast('Αποθηκεύτηκε το draft/links');
  }catch(_e){} finally{ setLoading(btn,false); }
});

// ------- Exam -------
$('btn-exam')?.addEventListener('click', async ()=>{
  const btn = $('btn-exam');
  const id = $('exam-assignment-id')?.value?.trim();
  const exam_datetime = $('exam-datetime')?.value?.trim();
  const exam_mode = $('exam-mode')?.value;
  const exam_room = $('exam-room')?.value?.trim() || null;
  const meeting_url = $('meeting-url')?.value?.trim() || null;
  if(!id){ toast('Δώσε assignment_id','error'); return; }
  try{
    setLoading(btn,true);
    await api(ENDPOINTS.examSave(id), {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ exam_datetime, exam_mode, exam_room, meeting_url })
    });
    toast('Αποθηκεύτηκαν τα στοιχεία εξέτασης');
  }catch(_e){} finally{ setLoading(btn,false); }
});

// ------- Repository -------
$('btn-repo')?.addEventListener('click', async ()=>{
  const btn = $('btn-repo');
  const id = $('repo-assignment-id')?.value?.trim();
  const repository_url = $('repo-url')?.value?.trim();
  if(!id || !repository_url){ toast('Δώσε assignment_id και URL','error'); return; }
  try{
    setLoading(btn,true);
    await api(ENDPOINTS.repoSave(id), {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ repository_url })
    });
    toast('Αποθηκεύτηκε το αποθετήριο');
  }catch(_e){} finally{ setLoading(btn,false); }
});

// ------- Report -------
$('btn-report')?.addEventListener('click', ()=>{
  const id = $('report-assignment-id')?.value?.trim();
  if(!id){ toast('Δώσε assignment_id','error'); return; }
  window.open(ENDPOINTS.minutesOpen(id), '_blank');
});

// ------- Init -------
document.addEventListener('DOMContentLoaded', async ()=>{
  await loadWelcome();
  await loadThesis();
});
