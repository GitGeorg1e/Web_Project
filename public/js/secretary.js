// =========================
// Secretary UI (polished)
// =========================

// ---- Endpoints (όπως τα έχεις) ----
const ENDPOINTS = {
  me:                 '/api/auth/me',
  logout:             '/api/auth/logout',
  list:               '/api/secretariat/assignments',                  // GET
  details:            (id)=> `/api/secretariat/assignments/${id}`,     // GET
  importUsers:        '/api/secretariat/import-users',                 // POST
  gsApproval:         (id)=> `/api/secretariat/assignments/${id}/gs-approval`,
  cancelAssignment:   (id)=> `/api/secretariat/assignments/${id}/cancel`,
  completeAssignment: (id)=> `/api/secretariat/assignments/${id}/complete`,
};

// ---------- helpers ----------
const $ = (id)=> document.getElementById(id);
function clear(node){ while(node && node.firstChild) node.removeChild(node.firstChild); }

function toast(msg,type='success'){
  const wrap = document.querySelector('.toast-wrap') || (()=>{ const w=document.createElement('div'); w.className='toast-wrap'; document.body.appendChild(w); return w; })();
  const t=document.createElement('div'); t.className='toast ' + (type==='error'?'error':'success'); t.textContent=msg;
  wrap.appendChild(t); setTimeout(()=>t.remove(), 2600);
}
function setLoading(btn,on){
  if(!btn) return;
  btn.disabled = !!on;
  if(on){ btn.dataset.prev = btn.textContent; btn.textContent = 'Παρακαλώ…'; }
  else  { btn.textContent = btn.dataset.prev || btn.textContent; }
}
async function api(url, opts={}){
  const r = await fetch(url, { credentials:'same-origin', ...opts });
  const isJson = r.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await r.json().catch(()=> ({})) : {};
  if(!r.ok){
    const msg = data.message || r.statusText || 'Σφάλμα αιτήματος';
    toast(msg,'error'); throw new Error(msg);
  }
  return data;
}

// ---------- welcome / logout ----------
async function loadWelcome(){
  try{
    const { user } = await api(ENDPOINTS.me);
    const w = $('welcome'); if(w) w.textContent = `Καλώς ήρθες, ${user.full_name || user.username} (${user.role})`;
  }catch(_e){}
}
$('logout')?.addEventListener('click', async ()=>{
  const btn = $('logout');
  try{ setLoading(btn,true); await api(ENDPOINTS.logout,{method:'POST'}); }
  catch(_e){} finally{ setLoading(btn,false); location.href='/'; }
});

// ---------- λίστα & λεπτομέρειες ----------
async function loadList(){
  const ul = $('list'); if(!ul) return;
  clear(ul); ul.innerHTML = '<li class="muted">Φόρτωση…</li>';
  try{
    const rows = await api(ENDPOINTS.list);
    clear(ul);
    if(!rows?.length){ ul.innerHTML = '<li class="muted">Δεν βρέθηκαν εγγραφές.</li>'; return; }

    rows.forEach(r=>{
      const li = document.createElement('li');
      li.style.padding='8px 0';
      li.style.borderBottom='1px solid var(--border)';

      const btn = document.createElement('button');
      btn.type='button'; btn.className='secondary small';
      btn.textContent = `#${r.id} — ${r.title || 'Θέμα'} — ${r.status} — ${r.student_name || r.student_username || 'Φοιτητής'}`;
      btn.addEventListener('click', ()=> loadDetails(r.id));

      li.appendChild(btn);
      ul.appendChild(li);
    });
  }catch(_e){
    clear(ul); ul.innerHTML = '<li class="muted">Σφάλμα φόρτωσης.</li>';
  }
}

async function loadDetails(id){
  const box = $('details'); if(!box) return;
  box.textContent = 'Φόρτωση…';
  try{
    const d = await api(ENDPOINTS.details(id));
    const committee = Array.isArray(d.committee) ? d.committee : [];
    const wrap = document.createElement('div');
    wrap.style.display='grid'; wrap.style.gap='6px';

    const addLine = (k,v)=>{
      const row=document.createElement('div');
      const b=document.createElement('strong'); b.textContent = k+': '; row.appendChild(b);
      if(k==='Σύνδεσμος' && v && typeof v==='string'){
        const a=document.createElement('a'); a.href=v; a.textContent=v; a.target='_blank'; a.rel='noopener';
        row.appendChild(a);
      }else{
        row.append(String(v ?? '—'));
      }
      wrap.appendChild(row);
    };

    addLine('ID', d.id);
    addLine('Τίτλος', d.title);
    addLine('Περιγραφή', d.description);
    addLine('Κατάσταση', d.status);
    addLine('Φοιτητής', d.student_name || d.student_username);
    addLine('Email Φοιτητή', d.student_email);
    addLine('Επιβλέπων', d.supervisor_name || d.supervisor_username);
    addLine('Email Επιβλέποντα', d.supervisor_email);
    addLine('Από επίσημη ανάθεση (ημ.)', d.created_at ? new Date(d.created_at).toLocaleString() : '—');
    addLine('ΑΠ ΓΣ', (d.ap_gs_number && d.ap_gs_year) ? `${d.ap_gs_number}/${d.ap_gs_year}` : '—');
    addLine('Draft URL', d.draft_url);
    addLine('Repository', d.repository_url);

    // Επιτροπή
    const cTitle=document.createElement('h3'); cTitle.textContent='Τριμελής'; wrap.appendChild(cTitle);
    const cul=document.createElement('ul'); cul.style.listStyle='none'; cul.style.padding='0';
    if(committee.length){
      committee.forEach(c=>{
        const li=document.createElement('li');
        li.textContent = `${c.full_name || c.username} — ${c.status}`;
        cul.appendChild(li);
      });
    }else{
      const li=document.createElement('li'); li.textContent='—'; cul.appendChild(li);
    }
    wrap.appendChild(cul);

    // Εξέταση
    const eTitle=document.createElement('h3'); eTitle.textContent='Στοιχεία εξέτασης'; wrap.appendChild(eTitle);
    addLine('Ημ/νία', d.exam_datetime);
    addLine('Τρόπος', d.exam_mode);
    addLine('Αίθουσα', d.exam_room);
    addLine('Σύνδεσμος', d.meeting_url);

    clear(box); box.appendChild(wrap);

    // Προγεμίζουμε το πεδίο ID ενεργειών
    const idInput = $('act-assignment-id'); if(idInput && !idInput.value) idInput.value = d.id;
  }catch(e){
    box.textContent = e.message || 'Σφάλμα φόρτωσης.';
  }
}

// ---------- import JSON χρηστών ----------
$('btn-import')?.addEventListener('click', async ()=>{
  const file = $('json-file')?.files?.[0];
  const msg = $('import-msg'); if(msg) msg.textContent = '';
  if(!file){ toast('Διάλεξε αρχείο JSON','error'); return; }

  try{
    const text = await file.text();
    let payload;
    try{ payload = JSON.parse(text); }
    catch{ toast('Μη έγκυρο JSON','error'); return; }

    const btn=$('btn-import'); setLoading(btn,true);
    await api(ENDPOINTS.importUsers, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    toast('Η εισαγωγή ολοκληρώθηκε');
    if(msg) msg.textContent='✅ ΟΚ';
    await loadList();
  }catch(_e){
    if(msg) msg.textContent='❌ Αποτυχία εισαγωγής';
  }finally{
    setLoading($('btn-import'),false);
  }
});

// ---------- ενέργειες ανάθεσης ----------
const actMsg = $('act-msg');
const getVal = id => $(id)?.value?.trim();

$('btn-gs-approval')?.addEventListener('click', async ()=>{
  if(actMsg) actMsg.textContent='';
  const id = Number(getVal('act-assignment-id'));
  const number = getVal('gs-number');
  const year = Number(getVal('gs-year'));
  if(!id || !number || !year){ if(actMsg) actMsg.textContent='Συμπλήρωσε ID, αριθμό & έτος ΓΣ.'; return; }

  const btn = $('btn-gs-approval');
  try{
    setLoading(btn,true);
    await api(ENDPOINTS.gsApproval(id), {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ number, year })
    });
    toast('Καταχωρήθηκε ο ΑΠ ΓΣ');
    await loadDetails(id); await loadList();
  }catch(e){
    if(actMsg) actMsg.textContent = `❌ ${e.message || 'Σφάλμα'}`;
  }finally{ setLoading(btn,false); }
});

$('btn-cancel')?.addEventListener('click', async ()=>{
  if(actMsg) actMsg.textContent='';
  const id = Number(getVal('act-assignment-id'));
  const gs_number = getVal('gs-number');
  const gs_year = Number(getVal('gs-year'));
  const reason = getVal('cancel-reason') || 'κατόπιν αίτησης Φοιτητή/τριας';
  if(!id || !gs_number || !gs_year){ if(actMsg) actMsg.textContent='Συμπλήρωσε ID και ΓΣ (αριθμός/έτος).'; return; }
  if(!confirm('Σίγουρα ακύρωση ανάθεσης;')) return;

  const btn = $('btn-cancel');
  try{
    setLoading(btn,true);
    await api(ENDPOINTS.cancelAssignment(id), {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ gs_number, gs_year, reason })
    });
    toast('Η ανάθεση ακυρώθηκε');
    await loadDetails(id); await loadList();
  }catch(e){
    if(actMsg) actMsg.textContent = `❌ ${e.message || 'Σφάλμα'}`;
  }finally{ setLoading(btn,false); }
});

$('btn-complete')?.addEventListener('click', async ()=>{
  if(actMsg) actMsg.textContent='';
  const id = Number(getVal('act-assignment-id'));
  if(!id){ if(actMsg) actMsg.textContent='Δώσε ID ΔΕ.'; return; }

  const btn = $('btn-complete');
  try{
    setLoading(btn,true);
    await api(ENDPOINTS.completeAssignment(id), { method:'POST' });
    toast('Η ΔΕ έγινε Περατωμένη');
    await loadDetails(id); await loadList();
  }catch(e){
    if(actMsg) actMsg.textContent = `❌ ${e.message || 'Σφάλμα'}`;
  }finally{ setLoading(btn,false); }
});

// ---------- bootstrap ----------
document.addEventListener('DOMContentLoaded', async ()=>{
  await loadWelcome();
  await loadList();
});
