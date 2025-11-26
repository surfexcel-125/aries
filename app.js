// Get the HTML elements using their IDs
const menuIcon = document.getElementById('menuIcon');
const closeIcon = document.getElementById('closeIcon');
const sidebar = document.getElementById('sidebar');
const body = document.body;

// Function to open the sidebar
function openSidebar() {
    sidebar.classList.add('open');
    // Add the class to the body to shift the main content (on desktop)
    body.classList.add('sidebar-open-shift'); 
}

// Function to close the sidebar
function closeSidebar() {
    sidebar.classList.remove('open');
    // Remove the class to shift the main content back
    body.classList.remove('sidebar-open-shift');
}

// Attach the functions to the click events
menuIcon.addEventListener('click', openSidebar);
closeIcon.addEventListener('click', closeSidebar);
