const $ = (s)=>document.querySelector(s);
$('#loginBtn').addEventListener('click', async ()=>{
  const username = $('#username').value.trim();
  const password = $('#password').value;
  const r = await fetch('/api/auth/login',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({username,password})
  });
  const data = await r.json();
  if(!r.ok){ $('#msg').textContent = data.message || 'Login failed'; return; }
  location.href = data.redirect || '/';
});
