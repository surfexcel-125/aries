import { auth, db } from './firebase-config.js';

// --- GLOBAL STATE ---
let CURRENT_USER = null;
let CURRENT_PROJECT_ID = null;

// Konva Mind Map Globals
let stage = null;
let layer = null;
let isConnecting = false;
let startNodeId = null;

// Styles based on your design (Slide 4)
const LIGHT_STYLE = { fill: '#e0e0e0', stroke: 'black', cornerRadius: 5 };
const DARK_STYLE = { fill: '#1c4e78', stroke: 'white', cornerRadius: 5 }; 
const LINE_COLOR = '#006699';


// =================================================================
// 1. AUTHENTICATION & INITIALIZATION
// =================================================================

// Monitor user login state
auth.onAuthStateChanged((user) => {
    if (user) {
        CURRENT_USER = user;
        document.getElementById('login-view').classList.add('hidden-view');
        document.getElementById('main-app-shell').classList.remove('hidden-view');
        clientRouter(); // Go to the app
    } else {
        CURRENT_USER = null;
        document.getElementById('login-view').classList.remove('hidden-view');
        document.getElementById('main-app-shell').classList.add('hidden-view');
    }
});

async function handleLogin(event) {
    event.preventDefault(); 
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        alert(`Login Failed: ${error.message}`);
    }
}

async function handleSignup() { 
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        alert("Please enter a valid email and password.");
        return;
    }

    try {
        await auth.createUserWithEmailAndPassword(email, password);
        alert("Sign up successful! You are now logged in.");
    } catch (error) {
        alert(`Signup Failed: ${error.message}`);
    }
}

function handleLogout() {
    auth.signOut();
}


// =================================================================
// 2. ROUTING & UI NAVIGATION
// =================================================================

function clientRouter() {
    if (!CURRENT_USER) return; 

    const path = window.location.hash.slice(1) || 'home'; 
    const [route, ...params] = path.split('/'); 
    
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.add('hidden-content-view');
    });
    
    document.getElementById('project-selection-popup').classList.remove('visible'); 

    if (route === 'dashboard') {
        document.getElementById('project-dashboard').classList.remove('hidden-content-view');
        loadProjectsDashboard();
    } else if (route === 'mindmap' && params[0]) {
        document.getElementById('mindmap-editor').classList.remove('hidden-content-view');
        loadMindMap(params[0]);
    } else {
        document.getElementById('home-view').classList.remove('hidden-content-view');
    }
}

function navigateTo(hash) {
    window.location.hash = hash;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-menu');
    const appShell = document.getElementById('main-app-shell');

    sidebar.classList.toggle('visible');
    appShell.classList.toggle('sidebar-open'); 
}

function toggleProjectPopup(event) {
    if (event && (event.target.id === 'project-selection-popup' || event.target.classList.contains('project-indicator'))) {
        document.getElementById('project-selection-popup').classList.toggle('visible');
    } else if (!event) {
        document.getElementById('project-selection-popup').classList.toggle('visible');
    }
    loadProjectsDashboard();
}

// =================================================================
// 3. EVENT LISTENERS INITIALIZATION (Ensuring all buttons work)
// =================================================================

function initializeEventListeners() {
    // 1. Auth Listeners
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    
    const signupButton = document.getElementById('signup-button');
    if (signupButton) signupButton.addEventListener('click', handleSignup);
    
    // 2. UI/Navigation Listeners (The Sidebar Fix)
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);

    window.addEventListener('hashchange', clientRouter);
}

// Ensure all listeners are attached after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeEventListeners);


// =================================================================
// 4. FIRESTORE CRUD (Dashboard Data)
// =================================================================

async function loadProjectsDashboard() {
    if (!CURRENT_USER) return;
    try {
        const projectsRef = db.collection('projects')
                            .where('userId', '==', CURRENT_USER.uid)
                            .orderBy('createdAt', 'desc');

        const snapshot = await projectsRef.get();
        const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        renderProjectsList(projects);
        renderProjectPopupList(projects);

    } catch (error) {
        console.error("Error loading projects:", error);
        document.getElementById('projects-list').innerHTML = `<p style="color:red;">Error loading projects: ${error.message}</p>`;
    }
}

async function addProject() {
    if (!CURRENT_USER) return;
    const newName = prompt("Enter a name for the new project:");
    if (!newName) return;

    try {
        await db.collection('projects').add({
            userId: CURRENT_USER.uid,
            name: newName,
            status: 'To Do',
            mindmapNodes: [], 
            mindmapConnections: [], 
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        loadProjectsDashboard(); 
    } catch (error) {
        console.error("Error adding project:", error);
    }
}

function renderProjectsList(projects) {
    const container = document.getElementById('projects-list');
    container.innerHTML = '';
    
    projects.forEach(project => {
        const row = document.createElement('div');
        row.classList.add('project-row');
        row.setAttribute('onclick', `MapsTo('mindmap/${project.id}')`);
        
        row.innerHTML = `
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
        container.appendChild(row);
    });
}

function renderProjectPopupList(projects) {
    const container = document.getElementById('popup-project-list');
    container.querySelectorAll('.popup-item').forEach(e => e.remove());
    
    projects.forEach(project => {
        const button = document.createElement('button');
        button.classList.add('menu-item', 'popup-item');
        button.textContent = project.name;
        button.setAttribute('onclick', `MapsTo('mindmap/${project.id}')`);
        container.appendChild(button);
    });
}


// =================================================================
// 5. KONVA.JS MIND MAP EDITOR
// =================================================================

function initMindMap() {
    const container = document.getElementById('mindmap-editor');
    container.querySelector('#mindmap-title').textContent = 'Mind Map Editor';
    // Clear previous map instance
    container.querySelectorAll('canvas, .konvajs-content').forEach(e => e.remove());

    const editorHeight = window.innerHeight - document.getElementById('main-header').offsetHeight - 80;

    stage = new Konva.Stage({
        container: 'mindmap-editor',
        width: container.offsetWidth,
        height: editorHeight, 
        draggable: true, 
    });
    layer = new Konva.Layer();
    stage.add(layer);
}

function getCenter(node) {
    return {
        x: node.x() + node.width() / 2,
        y: node.y() + node.height() / 2,
    };
}

function updateConnections(node) {
    const nodeId = node.id();
    const lines = layer.find('.connector').filter(line => 
        line.getAttr('startNode') === nodeId || line.getAttr('endNode') === nodeId
    );
    
    lines.forEach(line => {
        const startNode = layer.findOne(`#${line.getAttr('startNode')}`);
        const endNode = layer.findOne(`#${line.getAttr('endNode')}`);
        
        if (startNode && endNode) {
            const startCenter = getCenter(startNode);
            const endCenter = getCenter(endNode);
            line.points([startCenter.x, startCenter.y, endCenter.x, endCenter.y]);
        }
    });
    layer.batchDraw();
}

function drawConnection(startId, endId) {
    if (startId === endId) return;

    const startNode = layer.findOne(`#${startId}`);
    const endNode = layer.findOne(`#${endId}`);

    const existingConnection = layer.find('.connector').find(line => 
        (line.getAttr('startNode') === startId && line.getAttr('endNode') === endId) ||
        (line.getAttr('startNode') === endId && line.getAttr('endNode') === startId)
    );

    if (existingConnection) return;

    if (startNode && endNode) {
        const startCenter = getCenter(startNode);
        const endCenter = getCenter(endNode);

        const line = new Konva.Arrow({ 
            points: [startCenter.x, startCenter.y, endCenter.x, endCenter.y],
            stroke: LINE_COLOR,
            strokeWidth: 3,
            fill: LINE_COLOR,
            lineCap: 'round',
            lineJoin: 'round',
            name: 'connector', 
            startNode: startId,
            endNode: endId,
        });

        layer.add(line);
        line.moveToBottom(); 
        layer.batchDraw();
    }
}


function createNode(id, text, x, y, type = 'light-block') {
    const style = type === 'dark-block' ? DARK_STYLE : LIGHT_STYLE;
    const textColor = type === 'dark-block' ? 'white' : 'black';
    const rectWidth = 150;
    const rectHeight = 60;

    const group = new Konva.Group({
        id: id,
        x: x,
        y: y,
        draggable: true,
        width: rectWidth,
        height: rectHeight,
        type: type, 
    });

    const rect = new Konva.Rect({
        width: rectWidth,
        height: rectHeight,
        ...style,
    });

    const textNode = new Konva.Text({
        text: text,
        fontSize: 14,
        fill: textColor,
        width: rectWidth,
        height: rectHeight,
        padding: 10,
        align: 'center',
        verticalAlign: 'middle',
    });
    
    group.on('dragmove', () => {
        updateConnections(group);
    });

    group.on('click', () => {
        if (isConnecting) {
            if (startNodeId && startNodeId !== group.id()) {
                drawConnection(startNodeId, group.id());
                isConnecting = false;
                startNodeId = null;
                alert('Nodes connected!');
                stage.container().style.cursor = 'default';
            } else {
                startNodeId = group.id();
                alert(`Selected ${group.id()} as start node. Click the target node.`);
            }
        }
    });

    group.on('dblclick dbltap', () => {
        const textPosition = group.absolutePosition();
        
        textNode.hide();
        layer.draw();

        const input = document.createElement('input');
        input.value = textNode.text();
        input.style.position = 'absolute';
        input.style.top = textPosition.y + 'px';
        input.style.left = textPosition.x + 'px';
        input.style.width = rectWidth + 'px';
        input.style.height = rectHeight + 'px';
        input.style.textAlign = 'center';
        
        document.body.appendChild(input);
        input.focus();
        
        const removeInput = () => {
            textNode.text(input.value);
            textNode.show();
            document.body.removeChild(input);
            layer.draw();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
                removeInput();
            }
        });
        input.addEventListener('blur', removeInput);
    });
    
    group.add(rect);
    group.add(textNode);
    layer.add(group);
    layer.draw(); 
    
    return group;
}

function createNodeOnMap() {
    const newId = 'node-' + Date.now();
    const mapCenter = {
        x: stage.width() / 2 - 75,
        y: stage.height() / 2 - 30
    };
    
    createNode(newId, 'New Idea', mapCenter.x, mapCenter.y, 'light-block');
}

function startConnectingNodes() {
    isConnecting = true;
    startNodeId = null;
    stage.container().style.cursor = 'crosshair';
    alert('Connection mode enabled. Click the starting node, then the target node.');
}

function getCurrentMindMapData() {
    if (!layer) return { nodes: [], connections: [] };
    
    const nodes = [];
    layer.find('Group').forEach(group => {
        nodes.push({
            id: group.id(),
            text: group.findOne('Text').text(),
            x: group.x(),
            y: group.y(),
            type: group.getAttr('type'),
        });
    });

    const connections = [];
    layer.find('.connector').forEach(line => {
        connections.push({
            startNode: line.getAttr('startNode'),
            endNode: line.getAttr('endNode'),
        });
    });

    return { nodes: nodes, connections: connections };
}


async function loadMindMap(projectId) {
    if (!CURRENT_USER) return;
    CURRENT_PROJECT_ID = projectId;
    initMindMap(); 
    
    try {
        const doc = await db.collection('projects').doc(projectId).get();
        if (!doc.exists) {
            document.getElementById('mindmap-title').textContent = `Project Not Found!`;
            return;
        }

        const projectData = doc.data();
        document.getElementById('mindmap-title').textContent = `Mind Map: ${projectData.name}`;
        const nodesData = projectData.mindmapNodes || [];
        const connectionsData = projectData.mindmapConnections || [];

        // 1. Render Nodes
        if (nodesData.length === 0) {
            createNode('node-1', 'Start Idea', 100, 100, 'dark-block');
        } else {
            nodesData.forEach(node => {
                createNode(node.id, node.text, node.x, node.y, node.type);
            });
        }

        // 2. Render Connections
        connectionsData.forEach(conn => {
            drawConnection(conn.startNode, conn.endNode);
        });
        
    } catch (error) {
        console.error("Error loading mind map data:", error);
    }
}

async function saveMindMapData() {
    if (!CURRENT_USER || !CURRENT_PROJECT_ID) return;
    
    const dataToSave = getCurrentMindMapData();

    try {
        await db.collection('projects').doc(CURRENT_PROJECT_ID).update({
            mindmapNodes: dataToSave.nodes,
            mindmapConnections: dataToSave.connections,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert("Mind map saved successfully!");
    } catch (error) {
        console.error("Error saving mind map:", error);
        alert(`Error: Failed to save map. ${error.message}`);
    }
}
