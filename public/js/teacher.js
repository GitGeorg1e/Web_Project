// --- helpers ---
async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'same-origin', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || r.statusText || 'Request failed');
  return data;
}
function esc(s) { return String(s ?? ''); }
function $(id) { return document.getElementById(id); }
function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
function td(text) { const x=document.createElement('td'); x.textContent=text; return x; }
function makeBtn(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.marginRight = '8px';
  b.addEventListener('click', onClick);
  return b;
}

// --- me/welcome ---
async function loadMe(){
  const { user } = await api('/api/auth/me');
  $('welcome').textContent = `Καλώς ήρθες, ${user.full_name || user.username} (${user.role})`;
}

// ========= Topics =========
let editingTopicId = null;

async function loadTopics(){
  const rows = await api('/api/teacher/topics');
  const tb = $('topicsTbody'); clear(tb);

  rows.forEach(r=>{
    const tr = document.createElement('tr');

    tr.appendChild(td(r.id));
    tr.appendChild(td(r.title));

    const cPdf = document.createElement('td');
    if (r.pdf_path) {
      const a = document.createElement('a');
      a.href = r.pdf_path; a.textContent = 'Άνοιγμα PDF';
      a.target = '_blank'; a.rel = 'noopener';
      cPdf.appendChild(a);
    } else {
      cPdf.textContent = '—';
    }
    tr.appendChild(cPdf);

    tr.appendChild(td(new Date(r.created_at).toLocaleString()));

    const act = document.createElement('td');
    const editBtn = makeBtn('Επεξεργασία', ()=>{
      editingTopicId = r.id;
      $('t_title').value = r.title || '';
      $('t_desc').value  = r.description || '';
      if (pond) pond.removeFiles(); else $('t_pdf').value = '';
      $('topicFormHint').textContent = `Λειτουργία: Επεξεργασία (#${r.id})`;
    });
    act.appendChild(editBtn);
    tr.appendChild(act);

    tb.appendChild(tr);
  });
}

$('cancelEditBtn').onclick = ()=>{
  editingTopicId = null;
  $('t_title').value = '';
  $('t_desc').value  = '';
  if (pond) pond.removeFiles(); else $('t_pdf').value = '';
  $('topicFormHint').textContent = 'Λειτουργία: Δημιουργία';
};

$('createTopicBtn').onclick = async ()=>{
  const title = $('t_title').value.trim();
  const description = $('t_desc').value.trim();
  const fallbackInput = $('t_pdf');
  if (!title) return alert('Τίτλος υποχρεωτικός');

  const fd = new FormData();
  fd.append('title', title);
  fd.append('description', description);

  const fileFromPond = pond && pond.getFiles && pond.getFiles()[0]?.file;
  const file = fileFromPond || (fallbackInput.files && fallbackInput.files[0]) || null;
  if (file) fd.append('pdf', file);

  try {
    if (editingTopicId) {
      const r = await fetch(`/api/teacher/topics/${editingTopicId}`, {
        method: 'PUT',
        credentials: 'same-origin',
        body: fd
      });
      const data = await r.json().catch(()=> ({}));
      if (!r.ok) throw new Error(data.message || 'Update failed');
    } else {
      const r = await fetch('/api/teacher/topics', {
        method: 'POST',
        credentials: 'same-origin',
        body: fd
      });
      const data = await r.json().catch(()=> ({}));
      if (!r.ok) throw new Error(data.message || 'Create failed');
    }

    editingTopicId = null;
    $('t_title').value = '';
    $('t_desc').value  = '';
    if (pond) pond.removeFiles(); else $('t_pdf').value = '';
    $('topicFormHint').textContent = 'Λειτουργία: Δημιουργία';

    await loadTopics();
  } catch (e) {
    alert(e.message);
  }
};

// ========= FilePond (PDF uploader) =========
let pond = null;
function initFilePond() {
  if (!window.FilePond) return;
  if (window.FilePondPluginFileValidateType) FilePond.registerPlugin(FilePondPluginFileValidateType);
  if (window.FilePondPluginFileValidateSize) FilePond.registerPlugin(FilePondPluginFileValidateSize);

  const input = $('t_pdf');
  if (!input) return;

  pond = FilePond.create(input, {
    allowMultiple: false,
    instantUpload: false,
    acceptedFileTypes: ['application/pdf'],
    fileValidateTypeLabelExpectedTypes: 'Μόνο αρχεία PDF',
    maxFileSize: '10MB',
    labelIdle: 'Σύρε εδώ ένα <span class="filepond--label-action">PDF</span> ή κάνε κλικ'
  });
}

// --- assignments (με κουμπιά ενεργειών) ---
async function loadAssignments(){
  const rows = await api('/api/teacher/assignments');
  const tb = $('assignmentsTbody'); clear(tb);

  rows.forEach(r=>{
    const tr = document.createElement('tr');

    tr.appendChild(td(r.id));
    tr.appendChild(td(esc(r.student)));
    tr.appendChild(td(esc(r.title)));

    const st = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = r.status;
    st.appendChild(badge);
    tr.appendChild(st);

    // Ενέργειες
    const act = document.createElement('td');

    if (r.status === 'under_assignment') {
      act.appendChild(makeBtn('Οριστικοποίηση', async ()=>{
        try {
          await api(`/api/teacher/assignments/${r.id}/confirm`, { method:'POST' });
          await loadAssignments();
        } catch(e){ alert(e.message); }
      }));
    } else if (r.status === 'active') {
      act.appendChild(makeBtn('Αίτηση Εξέτασης', async ()=>{
        try {
          await api(`/api/teacher/assignments/${r.id}/request-review`, { method:'POST' });
          await loadAssignments();
        } catch(e){ alert(e.message); }
      }));
    } else {
      act.appendChild(document.createTextNode('—'));
    }

    tr.appendChild(act);
    tb.appendChild(tr);
  });
}

// --- invitations (accept/reject χωρίς innerHTML) ---
async function loadInvitations(){
  const rows = await api('/api/teacher/invitations');
  const tb = $('invTbody'); clear(tb);

  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.appendChild(td(r.id));
    tr.appendChild(td(esc(r.title)));
    tr.appendChild(td(r.student));
    tr.appendChild(td(r.status));

    const act = document.createElement('td');
    if (r.status === 'pending') {
      const accept = makeBtn('Αποδοχή', async ()=>{
        try{
          await api('/api/teacher/invitations/respond',{
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ invitation_id: r.id, action: 'accept' })
          });
          loadInvitations();
        }catch(e){ alert(e.message); }
      });
      const reject = makeBtn('Απόρριψη', async ()=>{
        try{
          await api('/api/teacher/invitations/respond',{
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ invitation_id: r.id, action: 'reject' })
          });
          loadInvitations();
        }catch(e){ alert(e.message); }
      });
      act.appendChild(accept);
      act.appendChild(reject);
    } else {
      act.appendChild(document.createTextNode('—'));
    }

    tr.appendChild(act);
    tb.appendChild(tr);
  });
}

// --- stats (μένει όπως το είχες) ---
async function loadStats(){
  const s = await api('/api/teacher/stats');
  const ctx = $('statsChart');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels:['Πλήθος','Μ.Ο. Ημέρες','Μ.Ο. Βαθμός'],
      datasets:[{ label:'Στατιστικά', data:[s.total_supervised, s.avg_days_open, s.avg_grade] }]
    },
    options: { responsive:true, plugins:{ legend:{ display:false } } }
  });
}

// --- actions ---
$('createTopicBtn').onclick = async ()=>{
  const title = $('t_title').value.trim();
  const description = $('t_desc').value.trim();
  if(!title) return alert('Τίτλος υποχρεωτικός');
  try{
    await api('/api/teacher/topics',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title, description })
    });
    $('t_title').value=''; $('t_desc').value='';
    loadTopics();
  }catch(e){ alert(e.message); }
};

$('assignBtn').onclick = async ()=>{
  const topic_id   = Number($('a_topic').value);
  const student_id = Number($('a_student').value);
  if(!topic_id || !student_id) return alert('Συμπλήρωσε IDs');
  try{
    await api('/api/teacher/assign',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ topic_id, student_id })
    });
    loadAssignments();
  }catch(e){ alert(e.message); }
};

$('logoutBtn').onclick = async ()=>{
  await api('/api/auth/logout',{ method:'POST' });
  location.href='/';
};

$('exportJson').onclick = (e)=>{ e.preventDefault(); window.open('/api/teacher/theses/export?format=json','_blank'); };
$('exportCsv').onclick  = (e)=>{ e.preventDefault(); window.open('/api/teacher/theses/export?format=csv','_blank'); };

// --- initial load ---
loadMe(); 
loadTopics(); 
loadAssignments(); 
loadInvitations(); 
loadStats();
