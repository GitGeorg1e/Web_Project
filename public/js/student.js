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
// ------- Load thesis (rich overview με περιγραφή, PDF, επιτροπή, ημέρες) -------
async function loadThesis() {
  const box = $('thesis');
  if (!box) return;
  box.textContent = 'Φόρτωση…';

  // 1) Φέρνουμε τα δεδομένα από /api/student/thesis, με fallback σε /api/student/my-thesis
  let d = null;
  try {
    d = await fetchJSON('/api/student/thesis');
  } catch (_e1) {
    try {
      d = await fetchJSON('/api/student/my-thesis');
    } catch (e2) {
      box.textContent = e2.message || 'Σφάλμα';
      return;
    }
  }

  if (!d) {
    box.innerHTML = '<span class="muted">Δεν βρέθηκε ανάθεση.</span>';
    return;
  }

  // 2) Υπολογισμός ημερών από επίσημη ανάθεση
  let days = null;
  if (typeof d.days_since_official_assignment === 'number') {
    days = d.days_since_official_assignment;
  } else if (d.activated_at) {
    const diffMs = Date.now() - new Date(d.activated_at).getTime();
    days = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
  }

  // 3) Κατασκευή markup
  const wrap = document.createElement('div');
  wrap.style.display = 'grid';
  wrap.style.gap = '8px';

  const row = (label, value, asLink=false) => {
    const div = document.createElement('div');
    const b = document.createElement('strong');
    b.textContent = label + ': ';
    div.appendChild(b);

    if (asLink && value) {
      const a = document.createElement('a');
      a.href = value; a.textContent = 'Άνοιγμα'; a.target = '_blank'; a.rel = 'noopener';
      div.appendChild(a);
    } else {
      div.appendChild(document.createTextNode(String(value ?? '—')));
    }
    return div;
  };

  wrap.appendChild(row('Θέμα', d.title));
  wrap.appendChild(row('Περιγραφή', d.description));
  // υποθέτουμε ότι το backend δίνει topics.pdf_path ως topic_pdf
  wrap.appendChild(row('PDF Περιγραφής', d.topic_pdf || '—', !!d.topic_pdf));
  wrap.appendChild(row('Κατάσταση', d.status));
  wrap.appendChild(row('Ημέρες από επίσημη ανάθεση', days == null ? '—' : String(days)));

  // 4) Επιτροπή: αν δεν έχει έρθει μαζί, τη φέρνουμε
  const committeeBox = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = 'Τριμελής Επιτροπή';
  h3.style.margin = '8px 0 0';
  committeeBox.appendChild(h3);

  const ul = document.createElement('ul');
  ul.style.listStyle = 'none';
  ul.style.padding = '0';
  committeeBox.appendChild(ul);

  // helper για να γεμίσουμε τη λίστα επιτροπής
  const renderCommittee = (rows) => {
    ul.innerHTML = '';
    if (Array.isArray(rows) && rows.length) {
      rows.forEach(m => {
        const li = document.createElement('li');
        li.textContent = `${m.full_name || m.username} — ${m.status}`;
        ul.appendChild(li);
      });
    } else {
      const li = document.createElement('li'); li.textContent = '—';
      ul.appendChild(li);
    }
  };

  if (Array.isArray(d.committee)) {
    // ήρθε έτοιμη από το API
    renderCommittee(d.committee);
  } else {
    // αλλιώς φέρνουμε από το ήδη υπάρχον endpoint σου της επιτροπής
    try {
      const rows = await fetchJSON('/api/student/committee?assignment_id=' + encodeURIComponent(d.id));
      renderCommittee(rows);
    } catch {
      renderCommittee([]);
    }
  }

  wrap.appendChild(committeeBox);

  // 5) Απόδοση + προ-γέμισμα IDs (κρατάω όπως το είχες)
  box.innerHTML = '';
  box.appendChild(wrap);

  ['invite-assignment-id','draft-assignment-id','exam-assignment-id','repo-assignment-id','report-assignment-id']
    .forEach(id => { const el = $(id); if (el && !el.value) el.value = d.id; });
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
