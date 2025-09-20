// public/js/teacher-theses.js  (χωρίς innerHTML)
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

  // helpers
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v != null) n.setAttribute(k, v);
    }
    children.flat().forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }

  let state = { page: 1, pageSize: 20, role: '', status: '' };

  const fmtDate   = (d) => d ? new Date(d).toLocaleString() : '—';
  const roleLabel = (r) => r === 'supervisor' ? 'Επιβλέπων' : (r === 'committee' ? 'Τριμελής' : r || '—');
  const statusMap = { under_assignment:'Υπό ανάθεση', active:'Ενεργή', under_review:'Υπό εξέταση', completed:'Περατωμένη', canceled:'Ακυρωμένη' };
  const statusLabel = (s) => statusMap[s] || s || '—';

  // Export links holder (δημιουργείται μία φορά)
  let exportWrap = null, exportJson = null, exportCsv = null;

  // details host (μία επαναχρησιμοποιούμενη κάρτα)
  const detailsHost = el('div', { id: 'theses-details-host' });

  function loadingRow(colspan, text) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = colspan;
    td.textContent = text;
    tr.appendChild(td);
    return tr;
    }

  async function showDetails(id, afterTr) {
    clear(detailsHost);
    const card = el('div', { class: 'card' }, el('div', { text: 'Φόρτωση λεπτομερειών…' }));
    detailsHost.appendChild(card);

    // βάλε το host κάτω από τη γραμμή
    if (afterTr && afterTr.parentElement) {
      afterTr.insertAdjacentElement('afterend', detailsHost);
    }

    try {
      const d = await fetchJSON(`/api/teacher/assignments/${id}/details`);
      // κάρτα λεπτομερειών
      const card2 = el('div', { class: 'card' });

      card2.appendChild(el('h3', { text: `Λεπτομέρειες ΔΕ #${id}` }));

      const p1 = el('p');
      p1.appendChild(el('strong', { text: 'Ρόλος: ' }));
      p1.appendChild(document.createTextNode(roleLabel(d.role)));
      card2.appendChild(p1);

      const p2 = el('p');
      p2.appendChild(el('strong', { text: 'Κατάσταση: ' }));
      p2.appendChild(document.createTextNode(statusLabel(d.status)));
      card2.appendChild(p2);

      const p3 = el('p');
      p3.appendChild(el('strong', { text: 'Τίτλος: ' }));
      p3.appendChild(document.createTextNode(d.title || '—'));
      card2.appendChild(p3);

      const p4 = el('p');
      p4.appendChild(el('strong', { text: 'Φοιτητής: ' }));
      p4.appendChild(document.createTextNode(d.student?.name || d.student?.username || '—'));
      card2.appendChild(p4);

      const p5 = el('p');
      p5.appendChild(el('strong', { text: 'Ημερομηνία ανάθεσης: ' }));
      const createdAt = (d.timeline || []).find(x => x.event === 'created')?.at;
      p5.appendChild(document.createTextNode(fmtDate(createdAt)));
      card2.appendChild(p5);

      if (d.final_grade != null) {
        const p6 = el('p');
        p6.appendChild(el('strong', { text: 'Τελικός βαθμός: ' }));
        p6.appendChild(document.createTextNode(`${Number(d.final_grade).toFixed(2)} (από ${d.graders || 0} κριτές)`));
        card2.appendChild(p6);
      }

      if (d.repository_url) {
        const pRepo = el('p');
        pRepo.appendChild(el('strong', { text: 'Repository: ' }));
        pRepo.appendChild(el('a', { href: d.repository_url, target: '_blank', rel: 'noopener', text: d.repository_url }));
        card2.appendChild(pRepo);
      }
      if (d.report_url) {
        const pRep = el('p');
        pRep.appendChild(el('strong', { text: 'Πρακτικό: ' }));
        pRep.appendChild(el('a', { href: d.report_url, target: '_blank', rel: 'noopener', text: 'Άνοιγμα' }));
        card2.appendChild(pRep);
      }

      if (d.draft_url) {
        const pDraft = el('p');
        pDraft.appendChild(el('strong', { text: 'Draft: ' }));
        pDraft.appendChild(el('a', { href: d.draft_url, target: '_blank', rel: 'noopener', text: d.draft_url }));
        card2.appendChild(pDraft);
      }

      // extra links
      const links = Array.isArray(d.links) ? d.links : [];
      const linksWrap = el('div', { style: 'margin:8px 0' },
        el('strong', { text: 'Extra Links:' }),
        el('ul', { style: 'margin:6px 0 0 18px' },
          ...links.map(u => el('li', {}, el('a', { href: u, target: '_blank', rel: 'noopener', text: u })))
        )
      );
      card2.appendChild(linksWrap);

      // exam
      if (d.exam?.datetime) {
        const pExam = el('p');
        pExam.appendChild(el('strong', { text: 'Εξέταση: ' }));
        pExam.appendChild(document.createTextNode(`${fmtDate(d.exam.datetime)} — ${d.exam.mode || '—'}`));
        pExam.appendChild(document.createElement('br'));
        if (d.exam.mode === 'in_person') {
          pExam.appendChild(document.createTextNode(`Αίθουσα: ${d.exam.room || '—'}`));
        } else {
          pExam.appendChild(document.createTextNode('Σύνδεσμος: '));
          if (d.exam.meeting_url) {
            pExam.appendChild(el('a', { href: d.exam.meeting_url, target: '_blank', rel: 'noopener', text: 'link' }));
          } else {
            pExam.appendChild(document.createTextNode('—'));
          }
        }
        card2.appendChild(pExam);
      }

      // committee
      const committee = Array.isArray(d.committee) ? d.committee : [];
      const commWrap = el('div', { style: 'margin:8px 0' },
        el('strong', { text: 'Τριμελής:' }),
        el('ul', { style: 'margin:6px 0 0 18px' },
          ...committee.map(c => el('li', {}, document.createTextNode(`${c.name} — `), el('em', { text: c.status || '—' })))
        )
      );
      card2.appendChild(commWrap);

      // timeline
      const timeline = Array.isArray(d.timeline) ? d.timeline : [];
      const tlWrap = el('div', { style: 'margin:8px 0' },
        el('strong', { text: 'Χρονολόγιο:' }),
        el('ul', { style: 'margin:6px 0 0 18px' },
          ...timeline.map(t => el('li', {}, el('code', { text: t.event }), document.createTextNode(' — ' + fmtDate(t.at))))
        )
      );
      card2.appendChild(tlWrap);

      detailsHost.replaceChildren(card2);
    } catch (e) {
      const err = el('div', { class: 'card' }, el('div', { text: `❌ Σφάλμα: ${e.message || 'Unknown'}` }));
      detailsHost.replaceChildren(err);
    }
  }

  async function loadTheses() {
    const tbody = $('theses-body');
    const pagerInfo = $('pager-info');
    clear(tbody);
    tbody.appendChild(loadingRow(7, 'Φόρτωση…'));
    detailsHost.remove();

    const q = new URLSearchParams();
    if (state.role)   q.set('role', state.role);
    if (state.status) q.set('status', state.status);
    q.set('page', state.page);
    q.set('pageSize', state.pageSize);

    try {
      const data = await fetchJSON(`/api/teacher/my-theses?${q.toString()}`);
      const items = data.items || [];
      clear(tbody);

      if (items.length === 0) {
        tbody.appendChild(loadingRow(7, 'Δεν βρέθηκαν αποτελέσματα.'));
      } else {
        items.forEach(r => {
          const tr = el('tr', { dataset: { id: String(r.assignment_id) }, style: 'cursor:pointer;border-bottom:1px solid #1e2531' });
          const cells = [
            r.assignment_id,
            roleLabel(r.role),
            statusLabel(r.status),
            r.title || '—',
            r.student || '—',
            fmtDate(r.created_at),
            r.role === 'committee' ? (r.committee_status || '—') : '—'
          ];
          cells.forEach(val => tr.appendChild(el('td', { text: String(val) })));
          tr.addEventListener('click', () => {
            detailsHost.remove();
            showDetails(r.assignment_id, tr);
          });
          tbody.appendChild(tr);
        });
      }

      pagerInfo.textContent = `Σελίδα ${data.page} — ${items.length} εγγραφές (ανά ${state.pageSize})`;

      // Export links (δημιουργία μία φορά, ενημέρωση href κάθε φορά)
      const container = $('theses-result');
      if (!exportWrap) {
        exportWrap = el('div');
        exportJson = el('a', { id: 'theses-export-json' }, 'Export JSON');
        exportCsv  = el('a', { id: 'theses-export-csv', style: 'margin-left:8px' }, 'Export CSV');
        exportWrap.appendChild(exportJson);
        exportWrap.appendChild(document.createTextNode(' • '));
        exportWrap.appendChild(exportCsv);
        container.insertBefore(exportWrap, container.firstChild);
      }
      const base = '/api/teacher/theses/export';
      const qs   = q.toString();
      exportJson.setAttribute('href', `${base}?format=json&${qs}`);
      exportCsv.setAttribute('href',  `${base}?format=csv&${qs}`);
    } catch (e) {
      clear(tbody);
      tbody.appendChild(loadingRow(7, `Σφάλμα: ${e.message || 'Unknown'}`));
    }
  }

  // UI wire-up
  document.addEventListener('DOMContentLoaded', () => {
    state.role     = $('flt-role')?.value || '';
    state.status   = $('flt-status')?.value || '';
    state.pageSize = Number($('flt-pagesize')?.value || 20);

    $('btn-apply')?.addEventListener('click', () => {
      state.role     = $('flt-role').value;
      state.status   = $('flt-status').value;
      state.pageSize = Number($('flt-pagesize').value);
      state.page = 1;
      loadTheses();
    });
    $('btn-prev')?.addEventListener('click', () => { if (state.page > 1) { state.page--; loadTheses(); } });
    $('btn-next')?.addEventListener('click', () => { state.page++; loadTheses(); });

    loadTheses();
  });
})();
