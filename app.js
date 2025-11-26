// --- Sidebar Functionality ---
const menuIcon = document.getElementById('menuIcon');
const closeIcon = document.getElementById('closeIcon');
const sidebar = document.getElementById('sidebar');

function openSidebar() {
    sidebar.classList.add('open');
}

function closeSidebar() {
    sidebar.classList.remove('open');
}

if (menuIcon && closeIcon && sidebar) {
    menuIcon.addEventListener('click', openSidebar);
    closeIcon.addEventListener('click', closeSidebar);
}

// --- Project Switcher Functionality (New) ---
const projectDropdownToggle = document.getElementById('projectDropdownToggle');
const projectDropdownMenu = document.getElementById('projectDropdownMenu');
const dropdownButtons = document.querySelectorAll('.dropdown-project-button');


// Function to toggle the dropdown menu
function toggleProjectDropdown() {
    if (projectDropdownMenu) {
        projectDropdownMenu.classList.toggle('visible');
    }
}

// Function to simulate saving the project before switching
function saveAndSwitchProject(event) {
    event.preventDefault(); // Stop the link from immediately navigating
    
    const targetUrl = event.currentTarget.href;
    const currentProjectName = projectDropdownToggle.innerText.split(' ')[0]; // e.g., 'Project'
    
    console.log(`Auto-saving workspace state for ${currentProjectName}...`);
    // --- START: Simulated Auto-Save Logic ---
    // In a real application, you would send an AJAX request here to save data:
    // fetch('/api/save-project', { method: 'POST', body: JSON.stringify({ project: currentProjectName, data: currentWorkspaceData }) });
    // --- END: Simulated Auto-Save Logic ---
    
    // Simulate a brief delay for saving before navigating
    setTimeout(() => {
        console.log('Save complete. Switching project...');
        window.location.href = targetUrl; // Navigate to the new project URL
    }, 300); // 300ms delay
}


if (projectDropdownToggle && projectDropdownMenu) {
    // 1. Toggle the menu when the project name is clicked
    projectDropdownToggle.addEventListener('click', toggleProjectDropdown);
    
    // 2. Hide the menu if the user clicks anywhere else
    document.addEventListener('click', (event) => {
        if (!projectDropdownToggle.contains(event.target) && !projectDropdownMenu.contains(event.target)) {
            projectDropdownMenu.classList.remove('visible');
        }
    });

    // 3. Attach the save-and-switch function to all project links
    dropdownButtons.forEach(button => {
        button.addEventListener('click', saveAndSwitchProject);
    });
}
