// Get the HTML elements using their IDs
const menuIcon = document.getElementById('menuIcon');
const closeIcon = document.getElementById('closeIcon');
const sidebar = document.getElementById('sidebar');
// The body element is no longer needed for shifting

// Function to open the sidebar
function openSidebar() {
    sidebar.classList.add('open');
}

// Function to close the sidebar
function closeSidebar() {
    sidebar.classList.remove('open');
}

// Attach the functions to the click events
menuIcon.addEventListener('click', openSidebar);
closeIcon.addEventListener('click', closeSidebar);
