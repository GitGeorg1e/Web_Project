// ================== helpers ==================
function $(id){ return document.getElementById(id); }
function td(text){ const x=document.createElement('td'); x.textContent=text; return x; }
function clear(node){ while(node && node.firstChild) node.removeChild(node.firstChild); }
function esc(s){ return String(s ?? ''); }
let statsChart = null;

function makeBtn(label, variant='primary'){
  const b=document.createElement('button');
  b.type='button';
  b.textContent=label;
  if(variant==='secondary') b.className='secondary';
  return b;
}

function setLoading(btn, on){
  if(!btn) return;
  btn.disabled = !!on;
  if(on){
    btn.dataset.prev = btn.textContent;
    btn.textContent = 'Παρακαλώ…';
  }else{
    btn.textContent = btn.dataset.prev || btn.textContent;
  }
}

function toast(msg, type='success'){
  const wrap = document.querySelector('.toast-wrap') || (()=>{ const w=document.createElement('div'); w.className='toast-wrap'; document.body.appendChild(w); return w; })();
  const t = document.createElement('div');
  t.className = 'toast ' + (type==='error' ? 'error' : 'success');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(()=> t.remove(), 2600);
}

async function api(url, opts = {}){
  const r = await fetch(url, { credentials: 'same-origin', ...opts });
  const data = await r.json().catch(()=> ({}));
  if(!r.ok){
    const msg = data.message || r.statusText || 'Request failed';
    toast(msg, 'error');
    throw new Error(msg);
  }
  return data;
}

// ================== session / welcome / logout ==================
async function loadMe(){
  const { user } = await api('/api/auth/me');
  $('welcome').textContent = `Καλώς ήρθες, ${user.full_name || user.username} (${user.role})`;
}
$('logoutBtn')?.addEventListener('click', async ()=>{
  await api('/api/auth/logout', { method:'POST' });
  location.href = '/';
});

// ================== FilePond (PDF uploader) ==================
let pond = null;
function initFilePond(){
  if(!window.FilePond) return;
  if(window.FilePondPluginFileValidateType) FilePond.registerPlugin(FilePondPluginFileValidateType);
  if(window.FilePondPluginFileValidateSize) FilePond.registerPlugin(FilePondPluginFileValidateSize);

  const input = $('t_pdf');
  if(!input) return;

  pond = FilePond.create(input, {
    allowMultiple:false,
    instantUpload:false,
    acceptedFileTypes:['application/pdf'],
    fileValidateTypeLabelExpectedTypes:'Μόνο αρχεία PDF',
    maxFileSize:'10MB',
    labelIdle:'Σύρε εδώ ένα <span class="filepond--label-action">PDF</span> ή κάνε κλικ'
  });
}

// ================== Topics ==================
let editingTopicId = null;

async function loadTopics(){
  const rows = await api('/api/teacher/topics');
  const tb = $('topicsTbody'); clear(tb);

  rows.forEach(r=>{
    const tr = document.createElement('tr');

    tr.appendChild(td(r.id));
    tr.appendChild(td(r.title));

    const cPdf = document.createElement('td');
    if(r.pdf_path){
      const a=document.createElement('a');
      a.href=r.pdf_path; a.textContent='Άνοιγμα PDF';
      a.target='_blank'; a.rel='noopener';
      cPdf.appendChild(a);
    }else{
      cPdf.textContent='—';
    }
    tr.appendChild(cPdf);

    tr.appendChild(td(new Date(r.created_at).toLocaleString()));

    const act = document.createElement('td'); act.className='text-right';
    const editBtn = makeBtn('Επεξεργασία', 'secondary');
    editBtn.addEventListener('click', ()=>{
      editingTopicId = r.id;
      $('t_title').value = r.title || '';
      $('t_desc').value  = r.description || '';
      if(pond) pond.removeFiles(); else $('t_pdf').value = '';
      $('topicFormHint').textContent = `Λειτουργία: Επεξεργασία (#${r.id})`;
      location.hash = '#topics'
    });
    act.appendChild(editBtn);

    tr.appendChild(act);
    tb.appendChild(tr);
  });
}

$('cancelEditBtn')?.addEventListener('click', ()=>{
  editingTopicId = null;
  $('t_title').value = '';
  $('t_desc').value  = '';
  if(pond) pond.removeFiles(); else $('t_pdf').value = '';
  $('topicFormHint').textContent = 'Λειτουργία: Δημιουργία';
});

$('createTopicBtn')?.addEventListener('click', async (e)=>{
  const btn = e.currentTarget;
  const title = $('t_title').value.trim();
  const description = $('t_desc').value.trim();
  const fallback = $('t_pdf');
  if(!title) return alert('Τίτλος υποχρεωτικός');

  const fd = new FormData();
  fd.append('title', title);
  fd.append('description', description);

  const fileFromPond = pond && pond.getFiles && pond.getFiles()[0]?.file;
  const file = fileFromPond || (fallback.files && fallback.files[0]) || null;
  if(file) fd.append('pdf', file);

  try{
    setLoading(btn, true);
    if(editingTopicId){
      const r = await fetch(`/api/teacher/topics/${editingTopicId}`, { method:'PUT', credentials:'same-origin', body:fd });
      const data = await r.json().catch(()=> ({}));
      if(!r.ok) throw new Error(data.message || 'Update failed');
      toast('Το θέμα ενημερώθηκε');
    }else{
      const r = await fetch('/api/teacher/topics', { method:'POST', credentials:'same-origin', body:fd });
      const data = await r.json().catch(()=> ({}));
      if(!r.ok) throw new Error(data.message || 'Create failed');
      toast('Το θέμα δημιουργήθηκε');
    }

    editingTopicId = null;
    $('t_title').value = '';
    $('t_desc').value  = '';
    if(pond) pond.removeFiles(); else $('t_pdf').value = '';
    $('topicFormHint').textContent = 'Λειτουργία: Δημιουργία';
    await loadTopics();
  }catch(_e){ /* toast already shown */ }
  finally{ setLoading(btn, false); }
});

// ================== Assignments ==================
async function loadAssignments(){
  const rows = await api('/api/teacher/assignments');
  const tb = $('assignmentsTbody'); clear(tb);

  rows.forEach(r=>{
    const tr = document.createElement('tr');

    tr.appendChild(td(r.id));
    tr.appendChild(td(esc(r.student)));
    tr.appendChild(td(esc(r.title)));
    tr.appendChild(td(esc(r.supervisor || '—'))); 

    const st = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = r.status;
    badge.dataset.status = r.status; // χρωματισμός μέσω CSS
    st.appendChild(badge);
    tr.appendChild(st);

    const act = document.createElement('td'); act.className='text-right';

    if(r.status === 'under_assignment'){
      const b = makeBtn('Οριστικοποίηση');
      b.addEventListener('click', async ()=>{
        try{ setLoading(b, true); await api(`/api/teacher/assignments/${r.id}/confirm`, { method:'POST' }); toast('Η ανάθεση έγινε ενεργή'); await loadAssignments(); }
        catch(_e){}
        finally{ setLoading(b, false); }
      });
      act.appendChild(b);
    }else if(r.status === 'active'){
      const b = makeBtn('Αίτηση Εξέτασης');
      b.addEventListener('click', async ()=>{
        try{ setLoading(b, true); await api(`/api/teacher/assignments/${r.id}/request-review`, { method:'POST' }); toast('Στάλθηκε για εξέταση'); await loadAssignments(); }
        catch(_e){}
        finally{ setLoading(b, false); }
      });
      act.appendChild(b);
    }else{
      act.appendChild(document.createTextNode('—'));
    }

    tr.appendChild(act);
    tb.appendChild(tr);
  });
}

$('assignBtn')?.addEventListener('click', async (e)=>{
  e.preventDefault();
  const btn = e.currentTarget;
  const topic_id   = Number($('a_topic')?.value);
  const student_id = Number($('a_student')?.value);
  if (!topic_id || !student_id) { alert('Συμπλήρωσε IDs (topic_id & student_id)'); return; }

  try {
    setLoading(btn, true);
    const r = await fetch('/api/teacher/assign', {
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({ topic_id, student_id })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.message || r.statusText);
    alert(' Η ανάθεση δημιουργήθηκε (#'+data.id+')');
    $('a_topic').value=''; $('a_student').value='';
    if (typeof loadAssignments==='function') await loadAssignments();
  } catch (err) {
    alert('' + (err.message || 'Σφάλμα'));
  } finally {
    setLoading(btn, false);
  }
});

// προαιρετική ακύρωση ανάθεσης
$('btn-cancel-assignment')?.addEventListener('click', async (e)=>{
  const btn = e.currentTarget;
  const id = Number($('cancel-assignment-id').value.trim());
  const reason = $('cancel-reason').value.trim();
  const msg = $('cancel-msg'); msg.textContent = '';

  if(!id){ msg.textContent = 'Δώσε assignment_id'; return; }
  if(!confirm('Σίγουρα ακύρωση ανάθεσης;')) return;

  try{
    setLoading(btn, true);
    const r = await fetch(`/api/teacher/assignments/${id}/cancel`, {
      method:'POST',
      credentials:'same-origin',
      headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await r.json().catch(()=> ({}));
    if(!r.ok) throw new Error(data.message || r.statusText);
    msg.textContent = ' Ακυρώθηκε.';
    await loadAssignments();
  }catch(e){
    msg.textContent = ` ${e.message || 'Σφάλμα'}`;
  }finally{
    setLoading(btn, false);
  }
});


// ================== Invitations ==================
async function loadInvitations(){
  const rows = await api('/api/teacher/invitations');
  const tb = $('invTbody'); clear(tb);

  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.appendChild(td(r.id));
    tr.appendChild(td(esc(r.title)));
    tr.appendChild(td(r.student));

    const st = document.createElement('td');
    const badge = document.createElement('span');
    badge.className='badge';
    badge.textContent = r.status;
    badge.dataset.status = r.status;
    st.appendChild(badge);
    tr.appendChild(st);

    const act = document.createElement('td'); act.className='text-right';
    if(r.status === 'pending'){
      const accept = makeBtn('Αποδοχή');
      const reject = makeBtn('Απόρριψη','secondary');

      accept.addEventListener('click', async ()=>{
        try{
          setLoading(accept, true);
          await api('/api/teacher/invitations/respond',{
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ invitation_id: r.id, action:'accept' })
          });
          toast('Πρόσκληση: αποδοχή');
          await loadInvitations();
        }catch(_e){} finally{ setLoading(accept,false); }
      });

      reject.addEventListener('click', async ()=>{
        try{
          setLoading(reject, true);
          await api('/api/teacher/invitations/respond',{
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ invitation_id: r.id, action:'reject' })
          });
          toast('Πρόσκληση: απόρριψη');
          await loadInvitations();
        }catch(_e){} finally{ setLoading(reject,false); }
      });

      act.appendChild(accept); act.appendChild(reject);
    }else{
      act.appendChild(document.createTextNode('—'));
    }
    tr.appendChild(act);

    tb.appendChild(tr);
  });
}

// ================== Stats & Export ==================
async function loadStats(){
  const s = await api('/api/teacher/stats');

  // αν το tab είναι κρυφό, περίμενε το next frame ώστε να έχει πλάτος ο καμβάς
  const section = document.getElementById('stats');
  if (section && section.classList.contains('tab') && !section.classList.contains('active')) {
    await new Promise(requestAnimationFrame);
  }

  const ctx = document.getElementById('statsChart').getContext('2d');
  if (statsChart) statsChart.destroy();

  statsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Πλήθος','Μ.Ο. Ημέρες','Μ.Ο. Βαθμός'],
      datasets: [{ label:'Στατιστικά', data:[s.total_supervised, s.avg_days_open, s.avg_grade] }]
    },
    options: { responsive:true, animation:false, plugins:{ legend:{ display:false } } }
  });
}


$('exportJson')?.addEventListener('click', e=>{ e.preventDefault(); window.open('/api/teacher/theses/export?format=json','_blank'); });
$('exportCsv') ?.addEventListener('click', e=>{ e.preventDefault(); window.open('/api/teacher/theses/export?format=csv','_blank'); });

/* ================== Tabs (show/hide + lazy load) ================== */
const loadedTabs = {};

async function showTab(hash){
  const links = Array.from(document.querySelectorAll('nav.card a[href^="#"]'));
  const valid = new Set(links.map(a=>a.getAttribute('href')));
  const target = valid.has(hash) ? hash : '#topics';

  links.forEach(a => a.classList.toggle('active', a.getAttribute('href')===target));

  const sections = Array.from(document.querySelectorAll('main .card[id]'));
  sections.forEach(sec => sec.classList.toggle('active', '#'+sec.id === target));

  const name = target.slice(1);

  // για τα περισσότερα tabs φόρτωσε μόνο μία φορά,
  // αλλά για 'stats' (και προαιρετικά 'theses') φόρτωνε κάθε φορά
  const singleRun = !['stats'].includes(name);
  if (singleRun && loadedTabs[name]) return;

  const loaders = {
    topics:       () => loadTopics(),
    'my-topics':  () => loadTopics(),
    assign:       () => {},
    assignments:  () => loadAssignments(),
    invitations:  () => loadInvitations(),
    stats:        () => loadStats(), // θα τρέχει σε κάθε άνοιγμα
    theses:       () => {
      if (window.teacherTheses?.open) window.teacherTheses.open();
      else if (typeof window.applyThesesFilters === 'function') window.applyThesesFilters();
      else window.dispatchEvent(new CustomEvent('theses:open'));
    },
    'manage-assignment': () => {}
  };

  if (!loaders[name]) return;

  try {
    await Promise.resolve(loaders[name]());
    if (singleRun) loadedTabs[name] = true;
  } catch (err) {
    console.error('[tab loader]', name, err);
    // μην το κλειδώσεις, ώστε να ξαναδοκιμάσει στο επόμενο άνοιγμα
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initFilePond();
    await loadMe();
    await showTab(location.hash || '#topics');
    window.addEventListener('hashchange', () => showTab(location.hash));
  } catch (e) {
    if (String(e.message).toLowerCase().includes('unauthorized')) location.href='/';
  }
});
