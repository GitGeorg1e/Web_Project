// public/js/login.js
(() => {
  const $ = (s) => document.querySelector(s);
  const btn = $('#loginBtn');
  const msg = $('#msg');
  const userEl = $('#username');
  const passEl = $('#password');

  function showMsg(text, isError = false) {
    if (!msg) return;
    msg.textContent = text || '';
    msg.style.color = isError ? '#ff6b6b' : 'var(--muted, #9aa3b2)';
  }

  function setLoading(on) {
    if (!btn) return;
    btn.disabled = !!on;
    btn.dataset.prev = btn.dataset.prev || btn.textContent;
    btn.textContent = on ? 'Παρακαλώ…' : btn.dataset.prev;
  }

  async function doLogin() {
    const username = userEl?.value.trim();
    const password = passEl?.value;

    if (!username || !password) {
      showMsg('Συμπλήρωσε username και password', true);
      return;
    }

    try {
      setLoading(true);
      showMsg('');

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json() : {};

      if (!res.ok) throw new Error(data.message || res.statusText || 'Login failed');

      // Ο server συνήθως επιστρέφει { redirect: '/teacher.html' } κλπ.
      location.href = data.redirect || '/';
    } catch (err) {
      showMsg(`❌ ${err.message}`, true);
    } finally {
      setLoading(false);
    }
  }

  // Κλικ στο κουμπί
  btn?.addEventListener('click', (e) => { e.preventDefault(); doLogin(); });
  // Enter στα πεδία
  userEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } });
  passEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } });

  // Autofocus στο username
  window.addEventListener('DOMContentLoaded', () => userEl?.focus());
})();
