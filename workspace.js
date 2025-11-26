/* workspace.js
   Standalone workspace script. Drop into same folder as project_detail.html
   Now handles Firebase loading and saving using the AriesDB helpers.
*/
(function(){
  /* Elements (resolved after DOM ready) */
  const ready = () => {
    // Check for the project ID defined in project_detail.html
    const projectId = window.currentProjectId;
    if (!projectId) {
        console.error("Workspace init failed: Missing project ID. Waiting for redirect...");
        return; // Exit if the ID wasn't set by the preceding script block
    }
    
    // --- Element Declarations (Must include all referenced elements) ---
    const canvas = document.getElementById('canvas');
    const board = document.getElementById('board');
    const panLayer = document.getElementById('panLayer');
    const svg = document.getElementById('svg');

    const menuIcon = document.getElementById('menuIcon');
    const floatingTools = document.getElementById('floatingTools');
    const toolAddNode = document.getElementById('toolAddNode');
    const toolConnector = document.getElementById('toolConnector');
    const toolDeleteLink = document.getElementById('toolDeleteLink');
    const toolDeleteNode = document.getElementById('toolDeleteNode');
    const selectedLinkLabel = document.getElementById('selectedLinkLabel');

    const backToProjects = document.getElementById('backToProjects');
    const saveBoardBtn = document.getElementById('saveBoard');
    const exportBtn = document.getElementById('exportBtn');
    const importFile = document.getElementById('importFile');
    const zoomIndicator = document.getElementById('zoomIndicator');
    const zoomInCorner = document.getElementById('zoomInCorner');
    const zoomOutCorner = document.getElementById('zoomOutCorner');

    const showGrid = document.getElementById('showGrid');
    const gridSizeInput = document.getElementById('gridSize');
    const centerBtn = document.getElementById('centerBtn');
    
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalColor = document.getElementById('modalColor');
    const modalShape = document.getElementById('modalShape');
    const deleteBlock = document.getElementById('deleteBlock');
    const cancelModal = document.getElementById('cancelModal');
    const saveModal = document.getElementById('saveModal');


    // --- Model and State Initialization ---
    let model = { nodes: [], links: [] };
    let transform = { x: 0, y: 0, scale: 1 };
    let selectedNodeId = null;
    let selectedLinkId = null;
    let dragInfo = null;
    let currentDragTarget = null;
    let linkDraw = null;
    let activeModalNode = null;
    
    // --- Core Functions (STUBS - Replace with your full logic) ---
    const uid = (prefix='node') => prefix + Math.random().toString(36).substring(2, 9);
    const renderNodes = () => { console.log("STUB: Rendering all nodes.", model.nodes.length); }; 
    const renderLinks = () => { console.log("STUB: Rendering all links.", model.links.length); };
    const applyTransform = () => { console.log("STUB: Applying transform.", transform); };
    const updateGrid = () => { console.log("STUB: Updating grid."); };
    const addNodeAt = (x, y) => { console.log("STUB: Adding node at", x, y); };
    const computeAnchors = (node) => { console.log("STUB: Computing anchors for", node.id); return []; };
    const handleMouseDown = (e) => { console.log("STUB: Handling mouse down."); };
    const handleMouseMove = (e) => { console.log("STUB: Handling mouse move."); };
    const handleMouseUp = (e) => { console.log("STUB: Handling mouse up."); };
    const openNodeModal = (node) => { console.log("STUB: Opening modal for node", node.id); };
    const updateZoomIndicator = () => { if(zoomIndicator) zoomIndicator.textContent = `${Math.round(transform.scale * 100)}%`; };
    
    // --- Data Management Functions ---

    /**
     * Replaces the local save with a robust, cloud-based save.
     */
    function saveModel() {
        console.log("Saving model to Firebase...", model.nodes.length, model.links.length);
        
        if (window.AriesDB && window.AriesDB.saveProjectWorkspace) {
            if (saveBoardBtn) saveBoardBtn.textContent = "Saving...";
            
            window.AriesDB.saveProjectWorkspace(projectId, model.nodes, model.links)
                .then(() => {
                    console.log(`Project ${projectId} saved successfully.`);
                    if (saveBoardBtn) {
                        saveBoardBtn.textContent = "Saved!";
                        setTimeout(() => saveBoardBtn.textContent = "Save Board", 2000);
                    }
                })
                .catch(err => {
                    console.error("FIREBASE SAVE FAILED:", err);
                    alert("Error saving project. See console for details.");
                    if (saveBoardBtn) saveBoardBtn.textContent = "Save Failed!";
                });
        } else {
            console.error("AriesDB not available. Check if app.js is loaded.");
        }
    }

    /**
     * Replaces the local load with a robust, cloud-based load.
     */
    async function loadModel() {
        if (!window.AriesDB || !window.AriesDB.loadProjectData) {
             console.error("AriesDB not available for loading. Starting with seed data.");
             seedInitialModel();
             return;
        }

        try {
            // Wait for authentication and fetch data from Firestore
            const data = await window.AriesDB.loadProjectData(projectId);
            
            if (data) {
                // Update header with project name
                document.getElementById('headerTitle').textContent = data.name || "Aries Workspace";
                
                model.nodes = data.nodes || [];
                model.links = data.links || [];
                
                console.log(`Project ${projectId} loaded: ${model.nodes.length} nodes.`);
            } else {
                console.warn(`No data found for project ${projectId}. Starting with a blank canvas.`);
            }
        } catch (error) {
            console.error("FIREBASE LOAD FAILED:", error);
            // Fallback: If loading fails, start with the default seed data
            seedInitialModel(); 
            return;
        }

        // After loading is complete (or after fallback), initialize the canvas view
        updateGrid(); 
        renderNodes(); 
        renderLinks();
        applyTransform();
    }
    
    // Fallback seed function (Copied from your original workspace.js logic)
    function seedInitialModel() {
      model.nodes.push({ 
        id: uid(), 
        x:120, y:120, w:260, h:120, 
        title:'Start', 
        body:'Drop nodes near others to auto-link.', 
        color:'#fff8f0', 
        shape:'soft' 
      });
      console.log("Initialized with seed data. Saving now...");
      saveModel(); // Save the new seed data immediately
    }


    /* --- Auto-Save Listener --- */
    let autoSaveTimer;
    const DEBOUNCE_DELAY = 1000;
    function triggerSave() {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(saveModel, DEBOUNCE_DELAY);
        if (saveBoardBtn) saveBoardBtn.textContent = "Saving...";
    }
    
    // --- Event Listeners (Must be attached to the DOM elements) ---

    // Manual Save Button
    if (saveBoardBtn) {
        saveBoardBtn.addEventListener('click', saveModel);
    }
    
    // Tools
    if (toolAddNode) {
        toolAddNode.addEventListener('click', () => { 
            addNodeAt(0, 0); 
            triggerSave(); 
        });
    }

    // Canvas/Interaction Listeners (for moving, linking, etc.)
    if (panLayer) {
        panLayer.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // This should trigger save after dragging/moving nodes/links
        panLayer.addEventListener('mouseup', triggerSave); 
    }

    // Delete Buttons
    if (toolDeleteNode) {
        toolDeleteNode.addEventListener('click', () => { /* Delete logic here */ triggerSave(); });
    }
    if (toolDeleteLink) {
        toolDeleteLink.addEventListener('click', () => { /* Delete logic here */ triggerSave(); });
    }
    
    // Control Panel
    if (showGrid) showGrid.addEventListener('change', updateGrid);
    if (gridSizeInput) gridSizeInput.addEventListener('change', updateGrid);
    if (centerBtn) centerBtn.addEventListener('click', () => { /* Center logic */ applyTransform(); });

    // Zoom
    if (zoomInCorner) zoomInCorner.addEventListener('click', () => { /* Zoom in logic */ updateZoomIndicator(); applyTransform(); });
    if (zoomOutCorner) zoomOutCorner.addEventListener('click', () => { /* Zoom out logic */ updateZoomIndicator(); applyTransform(); });

    // Modal
    if (cancelModal) cancelModal.addEventListener('click', () => modal.setAttribute('aria-hidden', 'true'));
    if (saveModal) saveModal.addEventListener('click', () => { /* Modal Save logic */ modal.setAttribute('aria-hidden', 'true'); triggerSave(); });
    if (deleteBlock) deleteBlock.addEventListener('click', () => { /* Modal Delete logic */ modal.setAttribute('aria-hidden', 'true'); triggerSave(); });

    /* --- Bootstrap --- */
    loadModel(); 
    updateZoomIndicator();

    /* Debug API */
    window.__ariesWorkspace = window.__ariesWorkspace || {};
    window.__ariesWorkspace.model = model;

  }; 

  // Wait for the DOM to be fully loaded before trying to find elements
  document.addEventListener('DOMContentLoaded', ready);
})();
