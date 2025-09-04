// scripts/seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'web_project',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306
  });

  const hash = (p) => bcrypt.hashSync(p, 10);

  const users = [
    ['teacher1', hash('123456'), 'teacher', 'Teacher One', 'teacher1@uni.local'],
    ['teacher2', hash('123456'), 'teacher', 'Teacher Two', 'teacher2@uni.local'],
    ['student1', hash('123456'), 'student', 'Student One', 'student1@uni.local'],
    ['student2', hash('123456'), 'student', 'Student Two', 'student2@uni.local'],
    ['secretary1', hash('123456'), 'secretariat', 'Secretary One', 'sec@uni.local'],
    ['admin1', hash('123456'), 'admin', 'Admin One', 'admin@uni.local']
  ];

  await conn.query('DELETE FROM users');
  await conn.query('DELETE FROM topics');
  await conn.query('DELETE FROM assignments');
  await conn.query('DELETE FROM invitations');
  await conn.query('DELETE FROM announcements');

  await conn.query(
    'INSERT INTO users (username,password,role,full_name,email) VALUES ?',
    [users]
  );

  // get teacher1 id
  const [t1] = await conn.query('SELECT id FROM users WHERE username=?', ['teacher1']);
  const teacher1 = t1[0].id;
  const [s1] = await conn.query('SELECT id FROM users WHERE username=?', ['student1']);
  const student1 = s1[0].id;

  await conn.query(
    'INSERT INTO topics (title,description,pdf_path,created_by) VALUES (?,?,?,?)',
    ['Distributed Systems Thesis', 'Consensus και P2P', null, teacher1]
  );

  const [topic] = await conn.query('SELECT id FROM topics ORDER BY id DESC LIMIT 1');
  const topicId = topic[0].id;

  await conn.query(
    'INSERT INTO assignments (topic_id,student_id,supervisor_id,status) VALUES (?,?,?,?)',
    [topicId, student1, teacher1, 'under_assignment']
  );

  await conn.query(
    'INSERT INTO announcements (title, body, location, date_start) VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
    ['Thesis Defense: Student One', 'Topic: Distributed Systems Thesis', 'Room B1']
  );

  console.log('Seed done.');
  await conn.end();
})();
