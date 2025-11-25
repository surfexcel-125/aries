// --- Function to switch between main views ---
function showView(viewId) {
    // 1. Hide all main views
    const views = document.querySelectorAll('.app-view');
    views.forEach(view => {
        view.classList.add('hidden-view');
        view.classList.remove('active-view');
    });

    // 2. Show the requested view
    const activeView = document.getElementById(viewId);
    if (activeView) {
        activeView.classList.remove('hidden-view');
        activeView.classList.add('active-view');
    }
    
    // 3. Close the menu overlay if it's open
    const menu = document.getElementById('project-menu-overlay');
    if (menu.style.display === 'block') {
        toggleMenu();
    }
}

// --- Function to toggle the Project Menu (Slide 6) ---
function toggleMenu() {
    const menu = document.getElementById('project-menu-overlay');
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
    } else {
        menu.style.display = 'block';
    }
}

// --- Function to dynamically add a new project row (for Project Dashboard) ---
let projectCount = 3; 
function addProject() {
    projectCount++;
    const projectsList = document.getElementById('projects-list');
    
    const newProjectRow = document.createElement('div');
    newProjectRow.classList.add('project-row');
    newProjectRow.setAttribute('onclick', "showView('mindmap-editor')"); // All projects lead to the same editor for now
    
    newProjectRow.innerHTML = `
        <div class="project-name-container">
            <span class="project-name">Project Name ${projectCount}</span>
        </div>
        <div class="project-status-container">
            <span class="status-label">STATUS</span>
            <select class="status-dropdown">
                <option selected>To Do</option>
                <option>In Progress</option>
                <option>Complete</option>
            </select>
        </div>
    `;
    
    projectsList.appendChild(newProjectRow);
    
    // Optional: Scroll to the new project
    newProjectRow.scrollIntoView({ behavior: 'smooth' });
}

// Set the initial view when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // This ensures only the landing page is shown initially
    showView('landing-page'); 
});
