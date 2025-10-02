console.log('teacher-manage.js loaded');

const $m = (id) => document.getElementById(id);
const out = (x) => ($m
('m-output').textContent = typeof x === 'string' ? x : JSON.stringify(x, null, 2));

async function jget(url) {
  const r = await fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } });
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw (data || { message: r.statusText });
  return data;
}
async function jpost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: body ? JSON.stringify(body) : null
  });
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw (data || { message: r.statusText });
  return data;
}

function getId() {
  const id = Number($m('m-assignment-id').value.trim());
  if (!id) throw new Error('Δώσε assignment_id');
  return id;
}

/* Υπό Ανάθεση */
$m('m-load-invitations').onclick = async () => {
  try {
    const id = getId();
    const data = await jget(`/api/teacher/assignments/${id}/invitations`);
    out(data);
  } catch (e) { out(e.message || e); }
};

$m('m-cancel-under').onclick = async () => {
  try {
    const id = getId();
    const data = await jpost(`/api/teacher/assignments/${id}/cancel`, null);
    out(data);
  } catch (e) { out(e.message || e); }
};

/* Ενεργή */
$m('m-list-notes').onclick = async () => {
  try {
    const id = getId();
    const data = await jget(`/api/teacher/assignments/${id}/notes`);
    out(data);
  } catch (e) { out(e.message || e); }
};

$m('m-add-note').onclick = async () => {
  try {
    const id = getId();
    const body = ($m('m-note-text').value || '').trim();
    if (!body) return out('Γράψε μια σημείωση.');
    const data = await jpost(`/api/teacher/assignments/${id}/notes`, { body });
    out(data);
    $m('m-note-text').value = '';
  } catch (e) { out(e.message || e); }
};

$m('m-move-under-review').onclick = async () => {
  try {
    const id = getId();
    const data = await jpost(`/api/teacher/assignments/${id}/move-under-review`, null);
    out(data);
  } catch (e) { out(e.message || e); }
};

/* Ακύρωση (Ενεργή) με Γ.Σ. */
$m('m-cancel-active').onclick = async () => {
  try {
    const id = getId();
    const council_number = Number($m('m-council-number').value);
    const council_year = Number($m('m-council-year').value);
    if (!council_number || !council_year) return out('Συμπλήρωσε αριθμό & έτος Γ.Σ.');
    const data = await jpost(`/api/teacher/assignments/${id}/cancel`, { council_number, council_year });
    out(data);
  } catch (e) { out(e.message || e); }
};

/* Υπό Εξέταση */
$m('m-get-draft').onclick = async () => {
  try {
    const id = getId();
    const data = await jget(`/api/teacher/assignments/${id}/draft`);
    out(data);
  } catch (e) { out(e.message || e); }
};

$m('m-announcement').onclick = async () => {
  try {
    const id = getId();
    // Επιστρέφει HTML — ανοίγουμε νέο tab
    window.open(`/api/teacher/assignments/${id}/announcement`, '_blank');
  } catch (e) { out(e.message || e); }
};

/* Grading */
$m('m-enable-grading').onclick = async () => {
  try {
    const id = getId();
    const enabled = $m('m-grading-enabled').value === '1';
    const data = await jpost(`/api/teacher/assignments/${id}/grading/enable`, { enabled });
    out(data);
  } catch (e) { out(e.message || e); }
};

$m('m-submit-grade').onclick = async () => {
  try {
    const id = getId();
    const total = Number($m('m-grade-total').value);
    if (Number.isNaN(total)) return out('Δώσε συνολικό βαθμό (0..10).');
    let criteria = null;
    const raw = ($m('criteria_json').value || '').trim();
    if (raw) { try { criteria = JSON.parse(raw); } catch { return out('Λάθος JSON στα κριτήρια.'); } }
    const data = await jpost(`/api/teacher/assignments/${id}/grades`, { total, criteria });
    out(data);
  } catch (e) { out(e.message || e); }
};

$m('m-list-grades').onclick = async () => {
  try {
    const id = getId();
    const data = await jget(`/api/teacher/assignments/${id}/grades`);
    out(data);
  } catch (e) { out(e.message || e); }
};

