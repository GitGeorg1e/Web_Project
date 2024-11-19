// Fetch and Display Logged-in User
fetch('/api/user')
    .then(response => {
        if (!response.ok) {
            window.location.href = '/login'; // Redirect if unauthorized
        }
        return response.json();
    })
    .then(user => {
        document.getElementById("username").innerText = user.username;
    })
    .catch(() => {
        window.location.href = '/login'; // Redirect if unauthorized
    });

// Show or Hide Sections
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById(sectionId).style.display = 'block';
}

// Logout Function
function logout() {
    fetch('/logout', { method: 'GET' })
        .then(() => {
            window.location.href = '/login';
        });
}
