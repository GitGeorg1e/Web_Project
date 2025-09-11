console.log('student.js loaded');

const fetchJSON = (url, opts = {}) =>
  fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  }).then(async (r) => {
    const isJson = r.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await r.json() : null;
    if (!r.ok) throw (data || { message: r.statusText });
    return data;
  });

// ------- UI helpers
const $ = (id) => document.getElementById(id);

// ------- Logout
$('logout')?.addEventListener('click', async () => {
  try { await fetchJSON('/api/auth/logout', { method: 'POST' }); } catch {}
  location.href = '/';
});

// ------- Load thesis (and prefill assignment ids)
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
    await loadCommittee();
  } catch (e) {
    $('thesis').textContent = e.message || 'Σφάλμα';
  }
}


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
      if (data?.ok) {
        msg.textContent = '✅ Αποθηκεύτηκε!';
      } else {
        msg.textContent = `❌ Απέτυχε: ${data?.message || 'Άγνωστο σφάλμα'}`;
      }
    } catch (err) {
      console.error(err);
      msg.textContent = '❌ Σφάλμα δικτύου (fetch failed)';
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

// ------- init
document.addEventListener('DOMContentLoaded', loadThesis);
