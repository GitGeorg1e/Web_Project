console.log('student.js loaded');

// ------- helpers
const $ = (id) => document.getElementById(id);

async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const isJson = r.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await r.json() : null;
  if (!r.ok) throw (data || { message: r.statusText });
  return data;
}

// ------- session / welcome / logout
async function loadMe() {
  try {
    const { user } = await fetchJSON('/api/auth/me');
    const w = $('welcome');
    if (w) w.textContent = `Καλώς ήρθες, ${user.full_name || user.username} (${user.role})`;
  } catch {
    // αν είμαστε εκτός session γύρνα στο login
    location.href = '/';
  }
}

$('logout')?.addEventListener('click', async () => {
  try { await fetchJSON('/api/auth/logout', { method: 'POST' }); } catch {}
  location.href = '/';
});

// ------- Load thesis (και prefill assignment ids)
async function loadThesis() {
  try {
    const data = await fetchJSON('/api/student/thesis');
    const box = $('thesis');
    if (!data) { box.textContent = 'Δεν βρέθηκε ανάθεση.'; return; }
    box.innerHTML = `
      <div><strong>Θέμα:</strong> ${data.title}</div>
      <div><strong>Κατάσταση:</strong> ${data.status}</div>
      <div><strong>Ανάθεση:</strong> #${data.id} — ${new Date(data.created_at).toLocaleString()}</div>
    `;
    // Prefill assignment id fields
    ['invite-assignment-id','draft-assignment-id','exam-assignment-id','repo-assignment-id','report-assignment-id']
      .forEach(id => { const el = $(id); if (el && !el.value) el.value = data.id; });
    await loadCommittee(); // να φαίνεται άμεσα
  } catch (e) {
    $('thesis').textContent = e.message || 'Σφάλμα';
  }
}

// ------- Προφίλ
const profileForm = document.getElementById('profile-form');
if (profileForm) {
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      address: document.getElementById('address').value,
      email_contact: document.getElementById('email_contact').value,
      phone_mobile: document.getElementById('phone_mobile').value,
      phone_landline: document.getElementById('phone_landline').value
    };
    const msg = document.getElementById('profile-msg');

    try {
      const r = await fetch('/api/student/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const isJson = r.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await r.json() : null;

      if (!r.ok) {
        msg.textContent = `❌ Error ${r.status}: ${data?.message || r.statusText}`;
        return;
      }
      msg.textContent = data?.ok ? '✅ Αποθηκεύτηκε!' : `❌ Απέτυχε: ${data?.message || 'Άγνωστο σφάλμα'}`;
    } catch (err) {
      console.error(err);
      document.getElementById('profile-msg').textContent = '❌ Σφάλμα δικτύου (fetch failed)';
    }
  });
}

// ------- Committee
async function loadCommittee() {
  const asg = $('invite-assignment-id')?.value?.trim();
  if (!asg) return;
  try {
    const rows = await fetchJSON('/api/student/committee?assignment_id=' + encodeURIComponent(asg));
    const ul = $('committee-list');
    ul.innerHTML = '';
    rows.forEach(r => {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>${r.full_name || r.username}</strong>
        — <em>${r.status}</em>
        ${r.status === 'pending' ? `<button data-id="${r.id}" class="btn-cancel" type="button">Ακύρωση</button>` : ''}
      `;
      ul.appendChild(li);
    });
    ul.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Ακύρωση πρόσκλησης;')) return;
        try {
          await fetchJSON('/api/student/committee/invite/' + id, { method: 'DELETE' });
          await loadCommittee();
        } catch (e) { alert(e.message || 'Σφάλμα'); }
      };
    });
  } catch (e) {
    alert(e.message || 'Σφάλμα');
  }
}

$('btn-invite')?.addEventListener('click', async () => {
  const assignment_id = Number($('invite-assignment-id').value.trim());
  const invitee_id = Number($('invite-teacher-id').value.trim());
  if (!assignment_id || !invitee_id) return alert('Συμπλήρωσε assignment_id & invitee_id');
  try {
    await fetchJSON('/api/student/committee/invite', {
      method: 'POST',
      body: JSON.stringify({ assignment_id, invitee_id })
    });
    $('invite-teacher-id').value = '';
    await loadCommittee();
  } catch (e) { alert(e.message || 'Σφάλμα'); }
});

// ------- Draft & Links
$('btn-draft')?.addEventListener('click', async () => {
  const id = $('draft-assignment-id').value.trim();
  const draft_url = $('draft-url').value.trim();
  const links = $('links').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!id) return alert('Δώσε assignment_id');
  try {
    await fetchJSON(`/api/student/assignment/${encodeURIComponent(id)}/draft`, {
      method: 'POST',
      body: JSON.stringify({ draft_url, links })
    });
    alert('Αποθηκεύτηκε.');
  } catch (e) { alert(e.message || 'Σφάλμα'); }
});

// ------- Exam
$('btn-exam')?.addEventListener('click', async () => {
  const id = $('exam-assignment-id').value.trim();
  const exam_datetime = $('exam-datetime').value.trim();
  const exam_mode = $('exam-mode').value;
  const exam_room = $('exam-room').value.trim() || null;
  const meeting_url = $('meeting-url').value.trim() || null;
  if (!id) return alert('Δώσε assignment_id');
  try {
    await fetchJSON(`/api/student/assignment/${encodeURIComponent(id)}/exam`, {
      method: 'POST',
      body: JSON.stringify({ exam_datetime, exam_mode, exam_room, meeting_url })
    });
    alert('Αποθηκεύτηκε.');
  } catch (e) { alert(e.message || 'Σφάλμα'); }
});

// ------- Repository
$('btn-repo')?.addEventListener('click', async () => {
  const id = $('repo-assignment-id').value.trim();
  const repository_url = $('repo-url').value.trim();
  if (!id) return alert('Δώσε assignment_id');
  try {
    await fetchJSON(`/api/student/assignment/${encodeURIComponent(id)}/repository`, {
      method: 'POST',
      body: JSON.stringify({ repository_url })
    });
    alert('Αποθηκεύτηκε.');
  } catch (e) { alert(e.message || 'Σφάλμα'); }
});

// ------- Report
$('btn-report')?.addEventListener('click', () => {
  const id = $('report-assignment-id').value.trim();
  if (!id) return alert('Δώσε assignment_id');
  window.open(`/api/student/assignment/${encodeURIComponent(id)}/report`, '_blank');
});

/* ================== Tabs (show/hide + lazy load) ================== */
const loadedTabs = {};
function showTab(hash){
  const links = Array.from(document.querySelectorAll('nav.card a[href^="#"]'));
  const valid = new Set(links.map(a=>a.getAttribute('href')));
  const target = valid.has(hash) ? hash : '#overview';

  // active link
  links.forEach(a => a.classList.toggle('active', a.getAttribute('href')===target));

  // toggle sections
  const sections = Array.from(document.querySelectorAll('main .card[id]'));
  sections.forEach(sec => sec.classList.toggle('active', '#'+sec.id === target));

  // lazy load per tab (once)
  const name = target.slice(1);
  if (loadedTabs[name]) return;

  const loaders = {
    overview:   ()=> loadThesis(),
    profile:    ()=> {/* optional: μπορούσες να φέρεις υπάρχον προφίλ */},
    committee:  ()=> loadCommittee(),
    draft:      ()=> {/* φόρμες μόνο */},
    exam:       ()=> {/* φόρμες μόνο */},
    repository: ()=> {/* φόρμες μόνο */},
    report:     ()=> {/* φόρμες μόνο */}
  };

  if (loaders[name]) {
    loaders[name]();
    loadedTabs[name] = true;
  }
}

// ------- init
document.addEventListener('DOMContentLoaded', async () => {
  await loadMe();
  // default tab
  showTab(location.hash || '#overview');
  window.addEventListener('hashchange', ()=> showTab(location.hash));
});
