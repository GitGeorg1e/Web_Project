// public/js/teacher-theses.js
(function () {
  const $ = (id) => document.getElementById(id);

  const fetchJSON = (url, opts = {}) =>
    fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      ...opts
    }).then(async (r) => {
      const isJson = r.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await r.json() : await r.text();
      if (!r.ok) throw (isJson ? data : { message: data || r.statusText });
      return data;
    });

  let state = { page: 1, pageSize: 20, role: '', status: '' };

  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleString(); } catch { return String(d); }
  }
  const roleLabel = (r) => r === 'supervisor' ? 'Επιβλέπων' : (r === 'committee' ? 'Τριμελής' : r || '—');
  const statusLabel = (s) => ({
    under_assignment: 'Υπό ανάθεση',
    active: 'Ενεργή',
    under_review: 'Υπό εξέταση',
    completed: 'Περατωμένη',
    canceled: 'Ακυρωμένη'
  }[s] || s || '—');

  async function loadTheses() {
    const tbody = $('theses-body');
    const pagerInfo = $('pager-info');
    tbody.innerHTML = `<tr><td colspan="7">Φόρτωση…</td></tr>`;

    const q = new URLSearchParams();
    if (state.role)   q.set('role', state.role);
    if (state.status) q.set('status', state.status);
    q.set('page', state.page);
    q.set('pageSize', state.pageSize);

    try {
      const data = await fetchJSON(`/api/teacher/my-theses?${q.toString()}`);
      const items = data.items || [];

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">Δεν βρέθηκαν αποτελέσματα.</td></tr>`;
      } else {
        tbody.innerHTML = items.map((r, i) => `
          <tr style="border-bottom:1px solid #f3f3f3">
            <td>${r.assignment_id}</td>
            <td>${roleLabel(r.role)}</td>
            <td>${statusLabel(r.status)}</td>
            <td>${r.title || '—'}</td>
            <td>${r.student || '—'}</td>
            <td>${fmtDate(r.created_at)}</td>
            <td>${r.role === 'committee' ? (r.committee_status || '—') : '—'}</td>
          </tr>
        `).join('');
      }

      pagerInfo.textContent = `Σελίδα ${data.page} — ${items.length} εγγραφές (ανά ${state.pageSize})`;
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7">Σφάλμα: ${e.message || 'Unknown'}</td></tr>`;
    }
  }

  // UI events
  document.addEventListener('DOMContentLoaded', () => {
    // αρχικές τιμές από UI
    state.role    = $('flt-role')?.value || '';
    state.status  = $('flt-status')?.value || '';
    state.pageSize= Number($('flt-pagesize')?.value || 20);

    $('btn-apply')?.addEventListener('click', () => {
      state.role    = $('flt-role').value;
      state.status  = $('flt-status').value;
      state.pageSize= Number($('flt-pagesize').value);
      state.page = 1;
      loadTheses();
    });

    $('btn-prev')?.addEventListener('click', () => {
      if (state.page > 1) { state.page--; loadTheses(); }
    });
    $('btn-next')?.addEventListener('click', () => {
      state.page++; loadTheses();
    });

    loadTheses();
  });
})();
