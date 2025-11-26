// workspace.js
import { auth } from './firebase-config.js'; // Just to check auth state

(function(){
    // Setup references
    const projectId = new URLSearchParams(location.search).get('id');
    if(!projectId) { alert("No project ID specified"); window.location.href='projects.html'; }

    // State
    let model = { nodes: [], links: [] };
    let selectedNodeId = null;

    // Elements
    const canvas = document.getElementById('canvas');
    const saveIndicator = document.getElementById('saveIndicator');
    
    // --- DATABASE SYNC ---
    async function initWorkspace() {
        // Wait for auth to be ready
        if(!auth.currentUser) {
            await new Promise(resolve => window.addEventListener('auth-ready', resolve));
        }

        const data = await window.AriesDB.loadProjectData(projectId);
        if(data) {
            document.getElementById('workspaceTitle').innerText = data.name.toUpperCase();
            if(data.nodes) model.nodes = data.nodes;
            if(data.links) model.links = data.links;
            render();
        } else {
            alert("Project not found!");
            window.location.href = 'projects.html';
        }
    }

    // Auto-Save Logic (Debounced)
    let saveTimeout;
    function triggerSave() {
        saveIndicator.innerText = "Saving...";
        saveIndicator.style.background = "#e67e22"; // Orange
        
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            await window.AriesDB.saveProjectWorkspace(projectId, model.nodes, model.links);
            saveIndicator.innerText = "Saved";
            saveIndicator.style.background = "green"; 
        }, 2000); // Saves 2 seconds after last change
    }

    // --- RENDERING (Simplified for brevity, uses your logic) ---
    function render() {
        canvas.innerHTML = ''; // Clear
        model.nodes.forEach(node => {
            const el = document.createElement('div');
            // Apply your styles class 'node'
            el.className = 'node'; 
            el.style.cssText = `position:absolute; left:${node.x}px; top:${node.y}px; width:150px; padding:10px; background:white; border:1px solid #ccc; box-shadow:0 2px 5px rgba(0,0,0,0.1); border-radius:8px; cursor:grab;`;
            el.innerHTML = `<strong>${node.title}</strong><br><small>${node.body || ''}</small>`;
            
            // Drag Logic
            el.onmousedown = (e) => startDrag(e, node);
            
            // Edit Logic
            el.ondblclick = () => openEditModal(node);

            canvas.appendChild(el);
        });
        // (You should add your SVG link rendering here from your previous file)
    }

    function startDrag(e, node) {
        const startX = e.clientX;
        const startY = e.clientY;
        const initialLeft = node.x;
        const initialTop = node.y;

        function onMove(ev) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            node.x = initialLeft + dx;
            node.y = initialTop + dy;
            render();
        }
        function onUp() {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            triggerSave(); // SAVE TO DB
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    // --- TOOLBAR ACTIONS ---
    document.getElementById('toolAddNode').onclick = () => {
        model.nodes.push({
            id: Date.now().toString(),
            x: 100, y: 100,
            title: "New Node", body: "Description"
        });
        render();
        triggerSave();
    };

    // --- MODAL ACTIONS ---
    const modal = document.getElementById('nodeModal');
    let editingNode = null;

    function openEditModal(node) {
        editingNode = node;
        document.getElementById('nodeTitleInput').value = node.title;
        document.getElementById('nodeBodyInput').value = node.body;
        modal.classList.add('active');
    }

    document.getElementById('saveNodeBtn').onclick = () => {
        if(editingNode) {
            editingNode.title = document.getElementById('nodeTitleInput').value;
            editingNode.body = document.getElementById('nodeBodyInput').value;
            render();
            triggerSave();
            modal.classList.remove('active');
        }
    };
    document.getElementById('closeNodeModal').onclick = () => modal.classList.remove('active');

    // Start
    initWorkspace();

})();
