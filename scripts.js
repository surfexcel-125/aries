const API_BASE_URL = 'http://localhost:3000/api';

// --- View Switching (Same as before) ---
function showView(viewId) {
    const views = document.querySelectorAll('.app-view');
    views.forEach(view => {
        view.classList.add('hidden-view');
        view.classList.remove('active-view');
    });

    const activeView = document.getElementById(viewId);
    if (activeView) {
        activeView.classList.remove('hidden-view');
        activeView.classList.add('active-view');
    }
    
    // Auto-close menu
    const menu = document.getElementById('project-menu-overlay');
    if (menu.style.display === 'block') {
        toggleMenu();
    }
}

function toggleMenu() {
    const menu = document.getElementById('project-menu-overlay');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

// --- Dynamic Project Dashboard Functions (NEW) ---

// 1. Fetch and Render the Project List (Slide 3)
async function loadProjectsDashboard() {
    try {
        const response = await fetch(`${API_BASE_URL}/projects`);
        if (!response.ok) throw new Error('Failed to fetch projects');
        const projects = await response.json();
        
        renderProjectsList(projects);
        
    } catch (error) {
        console.error("Error loading dashboard:", error);
        // Fallback for when the server isn't running
        document.getElementById('projects-list').innerHTML = `
            <p style="color: red; padding: 20px;">
                Error: Could not connect to the backend server at ${API_BASE_URL}. 
                Ensure the server.js is running (npm start).
            </p>`;
    }
}

function renderProjectsList(projects) {
    const projectsListContainer = document.getElementById('projects-list');
    projectsListContainer.innerHTML = ''; // Clear existing list

    projects.forEach(project => {
        const newProjectRow = document.createElement('div');
        newProjectRow.classList.add('project-row');
        // When clicking a project, load its mind map view
        newProjectRow.setAttribute('onclick', `loadMindMap('${project.id}', '${project.name}')`);
        
        newProjectRow.innerHTML = `
            <div class="project-name-container">
                <span class="project-name">${project.name}</span>
            </div>
            <div class="project-status-container">
                <span class="status-label">STATUS</span>
                <select class="status-dropdown">
                    <option ${project.status === 'To Do' ? 'selected' : ''}>To Do</option>
                    <option ${project.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option ${project.status === 'Complete' ? 'selected' : ''}>Complete</option>
                </select>
            </div>
        `;
        
        projectsListContainer.appendChild(newProjectRow);
    });
}

// 2. Add New Project
async function addProject() {
    const newName = prompt("Enter a name for the new project:");
    if (!newName) return;

    try {
        const response = await fetch(`${API_BASE_URL}/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: newName }),
        });
        
        if (!response.ok) throw new Error('Failed to create project');
        
        // Reload the list to show the new project
        loadProjectsDashboard(); 

    } catch (error) {
        console.error("Error adding project:", error);
        alert("Failed to add project. Check console.");
    }
}

// 3. Load Mind Map for a Project
function loadMindMap(projectId, projectName) {
    // In a real application, you would fetch the mind map data here:
    // fetch(`${API_BASE_URL}/mindmap/${projectId}`).then(...)

    // For now, we update the view name and switch to the editor
    document.getElementById('mindmap-editor').querySelector('h2').textContent = `Mind Map Whiteboard (${projectName})`;
    
    showView('mindmap-editor');
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    // Load the dashboard data when the page starts
    loadProjectsDashboard(); 
    // Start on the landing page
    showView('landing-page'); 
});
