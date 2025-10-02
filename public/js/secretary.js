console.log('secretary.js loaded');

const $ = (id) => document.getElementById(id);

const fetchJSON = (url, opts={}) =>
  fetch(url, { credentials:'include', headers:{'Content-Type':'application/json'}, ...opts })
    .then(async r => {
      const isJson = r.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await r.json() : null;
      if (!r.ok) throw (data || { message:r.statusText });
      return data;
    });

$('logout')?.addEventListener('click', async () => {
  try { await fetchJSON('/api/auth/logout', { method:'POST' }); } catch {}
  location.href = '/';
});

/* ---------------- TAB SWITCHING ---------------- */
function setupTabs() {
  const links = document.querySelectorAll('nav.card a');
  const tabs  = document.querySelectorAll('.tab');

  const activate = (hash) => {
    const target = document.querySelector(hash) || document.querySelector('#tab-list');
    tabs.forEach(s => s.classList.toggle('active', s === target));
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === hash));
    // lazy load
    if (target?.id === 'tab-list') loadList();
  };

  window.addEventListener('hashchange', () => activate(location.hash || '#tab-list'));
  activate(location.hash || '#tab-list');
}

/* ---------------- ΛΙΣΤΑ & ΛΕΠΤΟΜΕΡΕΙΕΣ ---------------- */
async function loadList() {
  const ul = $('list');
  if (!ul) return;
  // αν ήδη έχει στοιχεία, μην κάνεις ξανά fetch χωρίς λόγο
  if (ul.dataset.loaded === '1') return;
  ul.innerHTML = 'Φόρτωση...';
  try {
    const rows = await fetchJSON('/api/secretariat/assignments');
    ul.innerHTML = '';
    rows.forEach(r => {
      const li = document.createElement('li');
      li.style.cursor = 'pointer';
      li.innerHTML = `
        <strong>#${r.id}</strong> — ${r.title}
        <br><small>Φοιτητής: ${r.student_name || r.student_username} — Επιβλέπων: ${r.supervisor_name || r.supervisor_username}</small>
        <br><small>Κατάσταση: ${r.status} — Ημέρες από ανάθεση: ${r.days_since_assignment ?? '—'} — Αποδεχθέντα μέλη: ${r.accepted_members}</small>
      `;
      li.onclick = () => {
        location.hash = '#tab-details';
        loadDetails(r.id);
      };
      ul.appendChild(li);
    });
    ul.dataset.loaded = '1';
  } catch (e) {
    ul.innerHTML = ` Σφάλμα: ${e.message || 'Server error'}`;
  }
}

async function loadDetails(id) {
  const box = $('details');
  if (!box) return;
  box.innerHTML = 'Φόρτωση...';
  try {
    const d = await fetchJSON('/api/secretariat/assignments/' + id);
    const committeeHtml = (d.committee || [])
      .map(c => `<li>${c.full_name || c.username} — ${c.status}</li>`).join('');
    box.innerHTML = `
      <p><strong>Θέμα:</strong> ${d.title}</p>
      <p><strong>Περιγραφή:</strong> ${d.description || '—'}</p>
      <p><strong>Κατάσταση:</strong> ${d.status}</p>
      <p><strong>Φοιτητής:</strong> ${d.student_name || d.student_username} (${d.student_email || '—'})</p>
      <p><strong>Επιβλέπων:</strong> ${d.supervisor_name || d.supervisor_username} (${d.supervisor_email || '—'})</p>
      <p><strong>Από επίσημη ανάθεση:</strong> ${d.days_since_assignment ?? '—'} ημέρες</p>
      <h3>Τριμελής</h3>
      <ul>${committeeHtml || '<li>—</li>'}</ul>
      <h3>Στοιχεία εξέτασης</h3>
      <p>
        Ημ/νία: ${d.exam_datetime || '—'}<br/>
        Τρόπος: ${d.exam_mode || '—'}<br/>
        ${d.exam_room ? 'Αίθουσα: ' + d.exam_room + '<br/>' : ''}
        ${d.meeting_url ? 'Σύνδεσμος: <a href="'+d.meeting_url+'" target="_blank">'+d.meeting_url+'</a>' : ''}
      </p>
    `;
  } catch (e) {
    box.innerHTML = ` Σφάλμα: ${e.message || 'Server error'}`;
  }
}

/* ---------------- IMPORT JSON ---------------- */
document.getElementById('btn-import')?.addEventListener('click', async () => {
  const fileInput = document.getElementById('json-file');
  const msg = document.getElementById('import-msg');
  msg.textContent = '';

  const file = fileInput?.files?.[0];
  if (!file) { msg.textContent = 'Διάλεξε ένα .json αρχείο.'; return; }

  try {
    const text = await file.text();
    let payload = null;
    try { payload = JSON.parse(text); }
    catch { msg.textContent = 'Το αρχείο δεν είναι έγκυρο JSON.'; return; }

    const res = await fetch('/api/secretariat/import-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : null;

    if (!res.ok) {
      msg.textContent = ` Error ${res.status}: ${data?.message || res.statusText}`;
      return;
    }

    msg.innerHTML = ` ΟΚ — Inserted: ${data.inserted}, Updated: ${data.updated}${
      data.errors?.length ? '<br> Σφάλματα: ' + data.errors.length : ''
    }`;

    if (data.errors?.length) console.warn('Import errors:', data.errors);

    // Ανανεώνουμε λίστα αν είναι ανοιχτή
    $('list')?.removeAttribute('data-loaded');
    if (location.hash === '#tab-list') loadList();
  } catch (e) {
    console.error(e);
    msg.textContent = ' Σφάλμα δικτύου';
  }
});

/* ---------------- ΕΝΕΡΓΕΙΕΣ ---------------- */
const actMsg = document.getElementById('act-msg');
const getVal = id => document.getElementById(id)?.value?.trim();

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    credentials: 'include',
    body: JSON.stringify(body || {})
  });
  const isJson = r.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await r.json() : null;
  if (!r.ok) throw (data || { message: r.statusText });
  return data;
}

document.getElementById('btn-gs-approval')?.addEventListener('click', async () => {
  actMsg.textContent = '';
  const id = Number(getVal('act-assignment-id'));
  const number = getVal('gs-number');
  const year = Number(getVal('gs-year'));
  if (!id || !number || !year) { actMsg.textContent='Συμπλήρωσε ID, αριθμό & έτος ΓΣ.'; return; }
  try {
    await postJson(`/api/secretariat/assignments/${id}/gs-approval`, { number, year });
    actMsg.textContent = ' Καταχωρήθηκε ο ΑΠ ΓΣ.';
    $('list')?.removeAttribute('data-loaded');
    if (location.hash === '#tab-list') loadList();
  } catch (e) {
    actMsg.textContent = ` ${e.message || 'Σφάλμα'}`;
  }
});

document.getElementById('btn-cancel')?.addEventListener('click', async () => {
  actMsg.textContent = '';
  const id = Number(getVal('act-assignment-id'));
  const gs_number = getVal('gs-number');
  const gs_year = Number(getVal('gs-year'));
  const reason = getVal('cancel-reason') || 'κατόπιν αίτησης Φοιτητή/τριας';
  if (!id || !gs_number || !gs_year) { actMsg.textContent='Συμπλήρωσε ID και ΓΣ (αριθμός/έτος).'; return; }
  if (!confirm('Σίγουρα ακύρωση ανάθεσης;')) return;
  try {
    await postJson(`/api/secretariat/assignments/${id}/cancel`, { gs_number, gs_year, reason });
    actMsg.textContent = ' Η ανάθεση ακυρώθηκε.';
    $('list')?.removeAttribute('data-loaded');
    if (location.hash === '#tab-list') loadList();
  } catch (e) {
    actMsg.textContent = ` ${e.message || 'Σφάλμα'}`;
  }
});

document.getElementById('btn-complete')?.addEventListener('click', async () => {
  actMsg.textContent = '';
  const id = Number(getVal('act-assignment-id'));
  if (!id) { actMsg.textContent='Δώσε ID ΔΕ.'; return; }
  try {
    await postJson(`/api/secretariat/assignments/${id}/complete`, {});
    actMsg.textContent = ' Η ΔΕ έγινε Περατωμένη.';
    $('list')?.removeAttribute('data-loaded');
    if (location.hash === '#tab-list') loadList();
  } catch (e) {
    actMsg.textContent = ` ${e.message || 'Σφάλμα'}`;
  }
});

/* ---------------- BOOT ---------------- */
document.addEventListener('DOMContentLoaded', setupTabs);
