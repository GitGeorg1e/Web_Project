// src/controllers/feedController.js
const { pool } = require('../config/db');

function xmlEscape(s='') {
  return String(s).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}

async function announcements(req, res) {
  const format = (req.query.format || 'json').toLowerCase(); // 'json' | 'xml'
  const start = req.query.start ? new Date(req.query.start) : new Date('1970-01-01');
  const end = req.query.end ? new Date(req.query.end) : new Date('2999-12-31');

  const [rows] = await pool.query(
    'SELECT id,title,body,location,date_start,date_end FROM announcements WHERE date_start BETWEEN ? AND ? ORDER BY date_start DESC',
    [start, end]
  );

  if (format === 'xml') {
    const items = rows.map(a => `
      <announcement>
        <id>${a.id}</id>
        <title>${xmlEscape(a.title)}</title>
        <body>${xmlEscape(a.body || '')}</body>
        <location>${xmlEscape(a.location || '')}</location>
        <date_start>${a.date_start.toISOString()}</date_start>
        <date_end>${a.date_end ? a.date_end.toISOString() : ''}</date_end>
      </announcement>`).join('');
    res.set('Content-Type','application/xml');
    return res.send(`<announcements>${items}\n</announcements>`);
  }
  res.json({ items: rows });
}

module.exports = { announcements };
