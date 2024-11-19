const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt'); // For password hashing (if you want to use it later)
const mysql = require('mysql2'); // For database connection
const path = require('path'); // For serving static files

const app = express();

// Middleware
app.use(express.json()); // For parsing JSON
app.use(express.urlencoded({ extended: true })); // For parsing form data
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// Session Configuration
app.use(session({
    secret: 'your-secret-key', // Replace with a secure secret
    resave: false,
    saveUninitialized: true,
}));

// Mock User Data (Temporary)
const users = [
    { username: 'teacher1', password: '12345', role: 'teacher' },
    { username: 'student1', password: '12345', role: 'student' },
];

// Database Connection (if needed in the future)
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'password', // Replace with your DB password
    database: 'web_app',  // Replace with your DB name
});

db.connect(err => {
    if (err) {
        console.error('Database connection failed:', err);
    } else {
        console.log('Connected to database.');
    }
});

// Middleware to Protect Routes
function checkAuth(role) {
    return (req, res, next) => {
        if (!req.session.user || req.session.user.role !== role) {
            return res.redirect('/login');
        }
        next();
    };
}

// Routes

// Root Redirect to Login
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Serve Login Page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Handle Login Form Submission
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Check mock user credentials
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        // Save user session
        req.session.user = {
            username: user.username,
            role: user.role,
        };

        // Redirect based on role
        if (user.role === 'teacher') {
            return res.redirect('/dashboard/teacher');
        } else if (user.role === 'student') {
            return res.redirect('/dashboard/student');
        } else {
            return res.status(403).send('Access denied.');
        }
    } else {
        return res.status(401).send('Invalid username or password.');
    }
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).send('Could not log out.');
        res.redirect('/login');
    });
});

// Serve Teacher Dashboard
app.get('/dashboard/teacher', checkAuth('teacher'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'TeacherDashboard.html'));
});

// Serve Student Dashboard
app.get('/dashboard/student', checkAuth('student'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'StudentDashboard.html'));
});

// Serve Admin Dashboard (if applicable)
app.get('/dashboard/admin', checkAuth('admin'), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'AdminDashboard.html'));
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
