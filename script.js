// Εναλλαγή τμημάτων σελίδας
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none';
    });
    document.getElementById(sectionId).style.display = 'block';
}

// Διαχείριση αποσύνδεσης
function logout() {
    // Προσθήκη logout λογικής
    alert("Αποσυνδεθήκατε με επιτυχία!");
    window.location.href = "login.html";
}

// Παράδειγμα φόρτωσης δεδομένων για πίνακα μέσω AJAX (για Προσκλήσεις)
document.addEventListener("DOMContentLoaded", () => {
    loadInvitations();
});

function loadInvitations() {
    fetch("load_invitations.php")
        .then(response => response.json())
        .then(data => {
            const tableBody = document.getElementById("invitationsTable").querySelector("tbody");
            tableBody.innerHTML = "";

            data.forEach(invitation => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${invitation.thesis_title}</td>
                    <td>
                        <button onclick="acceptInvitation(${invitation.id})">Αποδοχή</button>
                        <button onclick="declineInvitation(${invitation.id})">Απόρριψη</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        });
}

// Λογική για αποδοχή/απόρριψη προσκλήσεων
function acceptInvitation(id) {
    // Ενέργειες για αποδοχή
    alert(`Αποδεχθήκατε την πρόσκληση με ID: ${id}`);
}

function declineInvitation(id) {
    // Ενέργειες για απόρριψη
    alert(`Απορρίψατε την πρόσκληση με ID: ${id}`);
}
