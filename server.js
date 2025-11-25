const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000; // The port your server will run on

// Middleware
app.use(cors()); // Allows frontend (on different port) to access this server
app.use(express.json()); // Allows server to parse JSON bodies in requests

// --- TEMPORARY IN-MEMORY DATA MODEL ---
// This array simulates your database table for Projects (Slide 3 data)
let projects = [
    { id: 'proj-1', name: 'Project Name 1', status: 'In Progress', mindmap: [] },
    { id: 'proj-2', name: 'Project Name 2', status: 'To Do', mindmap: [] }
];

// This defines the structure of a Mind Map Node (Block on Slide 4)
// The mindmap array inside each project will hold these objects:
/*
  const exampleMindMapNode = {
      node_id: 'node-A',
      project_id: 'proj-1',
      text: 'Main Idea',
      type: 'light-block', // CSS class identifier
      x: 100, // X-coordinate for positioning
      y: 50,  // Y-coordinate for positioning
      connections: ['node-B', 'node-C'] // IDs of connected nodes
  };
*/


// --- API ROUTES ---

// 1. GET /api/projects - Retrieve all projects (For Dashboard - Slide 3)
app.get('/api/projects', (req, res) => {
    // Only send the basic project list (name, id, status)
    const projectList = projects.map(({ id, name, status }) => ({ id, name, status }));
    res.json(projectList);
});

// 2. POST /api/projects - Create a new project (From "Add Project +" button)
app.post('/api/projects', (req, res) => {
    const newProject = {
        id: 'proj-' + (projects.length + 1),
        name: req.body.name || `New Project ${projects.length + 1}`,
        status: 'To Do',
        mindmap: [] // Starts with an empty mind map
    };
    projects.push(newProject);
    res.status(201).json(newProject);
});

// 3. GET /api/mindmap/:id - Load a specific mind map (For Whiteboard - Slide 4)
app.get('/api/mindmap/:id', (req, res) => {
    const projectId = req.params.id;
    const project = projects.find(p => p.id === projectId);

    if (project) {
        res.json(project.mindmap);
    } else {
        res.status(404).json({ message: 'Project not found' });
    }
});

// 4. PUT /api/mindmap/:id - Save the entire mind map structure
app.put('/api/mindmap/:id', (req, res) => {
    const projectId = req.params.id;
    const newMindMap = req.body; // Expects an array of nodes

    const projectIndex = projects.findIndex(p => p.id === projectId);

    if (projectIndex !== -1) {
        projects[projectIndex].mindmap = newMindMap;
        res.json({ message: 'Mind map saved successfully', mindmap: projects[projectIndex].mindmap });
    } else {
        res.status(404).json({ message: 'Project not found' });
    }
});


// Start the Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Run the frontend files (index.html) to connect!');
});
