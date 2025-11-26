// Get the HTML elements using their IDs
const menuIcon = document.getElementById('menuIcon');
const closeIcon = document.getElementById('closeIcon');
const sidebar = document.getElementById('sidebar');

// Function to open the sidebar
function openSidebar() {
    sidebar.classList.add('open');
}

// Function to close the sidebar
function closeSidebar() {
    sidebar.classList.remove('open');
}

// Attach the functions to the click events
// NOTE: These listeners are active only on the index.html page.
if (menuIcon && closeIcon && sidebar) {
    menuIcon.addEventListener('click', openSidebar);
    closeIcon.addEventListener('click', closeSidebar);
}
