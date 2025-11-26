/* workspace.js
   COMPLETE Workflow Mapper script with Firebase integration.
   Includes rendering for Page, Action, Decision nodes and link label functionality.
*/
(function(){
  /* Elements (resolved after DOM ready) */
  const ready = () => {
    const projectId = window.currentProjectId;
    if (!projectId) {
        console.error("Workspace init failed: Missing project ID. Waiting for redirect...");
        return; 
    }
    
    // --- Element Declarations ---
    const canvas = document.getElementById('canvas');
    const board = document.getElementById('board');
    const panLayer = document.getElementById('panLayer');
    const svg = document.getElementById('svg');

    const headerTitle = document.getElementById('headerTitle');
    const floatingTools = document.getElementById('floatingTools');
    
    // New Node Tool Buttons
    const toolAddPage = document.getElementById('toolAddPage');
    const toolAddAction = document.getElementById('toolAddAction');
    const toolAddDecision = document.getElementById('toolAddDecision');

    const toolDeleteNode = document.getElementById('toolDeleteNode');
    const toolDeleteLink = document.getElementById('toolDeleteLink');
    const zoomIndicator = document.getElementById('zoomIndicator');
    const zoomInCorner = document.getElementById('zoomInCorner');
    const zoomOutCorner = document.getElementById('zoomOutCorner');

    const showGrid = document.getElementById('showGrid');
    const gridSizeInput = document.getElementById('gridSize');
    const centerBtn = document.getElementById('centerBtn');
    const saveBoardBtn = document.getElementById('saveBoard');
    
    const modal = document.getElementById('modal');
    const modalProjectId = document.getElementById('modalProjectId');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const deleteBlock = document.getElementById('deleteBlock');
    const cancelModal = document.getElementById('cancelModal');
    const saveModal = document.getElementById('saveModal');

    // --- Model and State Initialization ---
    let model = { nodes: [], links: [] };
    let transform = { x: 0, y: 0, scale: 1 };
    let selectedNodeId = null;
    let selectedLinkId = null;
    let dragInfo = null;
    let activeModalNode = null;
    let gridSize = parseInt(gridSizeInput.value) || 25;
    let linkDraw = null; // State for when a link is being drawn

    
    // --- Utility Functions ---
    const uid = (prefix='node') => prefix + Math.random().toString(36).substring(2, 9);
    const clamp = (num, min, max) => Math.max(min, Math.min(num, max));
    const findNode = (id) => model.nodes.find(n => n.id === id);
    const findLink = (id) => model.links.find(l => l.id === id);
    
    // Convert screen coordinates to board coordinates
    const screenToBoard = (x, y) => ({
      x: (x - transform.x) / transform.scale,
      y: (y - transform.y) / transform.scale
    });
    
    // --- Transformation & Grid ---
    function applyTransform() {
      board.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
      updateZoomIndicator();
      updateGrid(); // Grid size is affected by scale
      renderLinks();
    }

    function updateZoomIndicator() {
      if(zoomIndicator) zoomIndicator.textContent = `${Math.round(transform.scale * 100)}%`;
    }

    function updateGrid() {
      gridSize = parseInt(gridSizeInput.value) || 25;
      if (showGrid.checked) {
        canvas.style.backgroundImage = `linear-gradient(to right, var(--grid-color) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)`;
        canvas.style.backgroundSize = `${gridSize * transform.scale}px ${gridSize * transform.scale}px`;
        canvas.style.backgroundPosition = `${transform.x % (gridSize * transform.scale)}px ${transform.y % (gridSize * transform.scale)}px`;
      } else {
        canvas.style.backgroundImage = 'none';
      }
    }
    
    // --- Data Management Functions ---

    let autoSaveTimer;
    const DEBOUNCE_DELAY = 1000;
    function triggerSave() {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(saveModel, DEBOUNCE_DELAY);
        if (saveBoardBtn) saveBoardBtn.textContent = "Saving...";
    }

    function saveModel() {
        if (window.AriesDB && window.AriesDB.saveProjectWorkspace) {
            window.AriesDB.saveProjectWorkspace(projectId, model.nodes, model.links)
                .then(() => {
                    if (saveBoardBtn) {
                        saveBoardBtn.textContent = "Saved!";
                        setTimeout(() => saveBoardBtn.textContent = "Save Board", 2000);
                    }
                })
                .catch(err => {
                    console.error("FIREBASE SAVE FAILED:", err);
                    if (saveBoardBtn) saveBoardBtn.textContent = "Save Failed!";
                });
        }
    }

    async function loadModel() {
        if (!window.AriesDB || !window.AriesDB.loadProjectData) {
             seedInitialModel();
             return;
        }

        try {
            const data = await window.AriesDB.loadProjectData(projectId);
            
            if (data) {
                if (headerTitle) headerTitle.textContent = data.name || `Project: ${projectId.substring(0, 5)}...`;
                model.nodes = data.nodes || [];
                model.links = data.links || [];
            } else {
                seedInitialModel(); 
            }
        } catch (error) {
            console.error("FIREBASE LOAD FAILED:", error);
            seedInitialModel(); 
            return;
        }

        updateGrid(); 
        renderNodes(); 
        renderLinks();
        applyTransform();
    }
    
    function seedInitialModel() {
      if (model.nodes.length === 0) {
        // Default starting node for a new workflow
        addNodeAt(200, 200, 'page'); 
      }
    }
    
    // --- Node and Link Rendering ---

    function getAnchor(node, isTarget = false) {
      const el = document.getElementById(`node-${node.id}`);
      if (!el) return { x: node.x, y: node.y }; 

      // Get screen space coordinates of the element's bounding box
      const rect = el.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      
      // Calculate true width/height in board space
      const width = rect.width / transform.scale;
      const height = rect.height / transform.scale;

      // Center point in board space
      let cx = node.x + width / 2;
      let cy = node.y + height / 2;
      
      // For simple horizontal flow, anchors are on the right (source) and left (target)
      let ax = isTarget ? node.x : node.x + width;
      let ay = cy; 
      
      // If Decision node, adjust anchor for rotated shape
      if (node.type === 'decision') {
          // Anchors should be at the corners of the diamond
          if (isTarget) {
              // Left point
              ax = node.x;
              ay = node.y + height / 2;
          } else {
              // Right point
              ax = node.x + width;
              ay = node.y + height / 2;
          }
      }

      return { x: ax, y: ay };
    }

    function renderNodes() {
      document.querySelectorAll('.node').forEach(n => n.remove());

      model.nodes.forEach(node => {
        const el = document.createElement('div');
        el.className = `node node-type-${node.type} ${node.id === selectedNodeId ? 'selected' : ''}`;
        el.id = `node-${node.id}`;
        
        // Position relative to the board
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        
        // Set fixed width/height for Decision node type
        if (node.type !== 'decision') {
            el.style.width = `${node.w}px`;
            el.style.height = `${node.h}px`;
        }

        el.innerHTML = `<div class="node-title">${node.title}</div><div class="node-body">${node.body}</div>`;
        
        // Output Anchor
        const outputAnchor = document.createElement('div');
        outputAnchor.className = 'anchor output-anchor';
        outputAnchor.addEventListener('mousedown', (e) => startLinkDraw(e, node.id));
        el.appendChild(outputAnchor);
        
        el.addEventListener('mousedown', (e) => handleNodeMouseDown(e, node.id));
        el.addEventListener('dblclick', (e) => { e.stopPropagation(); openNodeModal(node); });

        board.appendChild(el);
      });
      renderLinks();
    }
    
    function renderLinks() {
      svg.innerHTML = ''; 

      model.links.forEach(link => {
        const sourceNode = findNode(link.source);
        const targetNode = findNode(link.target);

        if (!sourceNode || !targetNode) return;

        const p1 = getAnchor(sourceNode);
        const p2 = getAnchor(targetNode, true);

        // Compute control points for a strong, horizontal Bezier curve
        const dx = Math.max(50, Math.abs(p1.x - p2.x) * 0.4);
        const c1x = p1.x + dx;
        const c1y = p1.y;
        const c2x = p2.x - dx;
        const c2y = p2.y;

        const pathData = `M${p1.x} ${p1.y} C${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const isSelected = link.id === selectedLinkId;
        
        path.setAttribute('d', pathData);
        path.setAttribute('stroke', isSelected ? 'var(--link-selected)' : 'var(--link-color)');
        path.setAttribute('stroke-width', 3);
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', `url(#arrowhead${isSelected ? '-selected' : ''})`);
        path.id = `link-${link.id}`;
        path.classList.add('link-path');
        
        path.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedLinkId = link.id;
          selectedNodeId = null;
          toolDeleteLink.disabled = false;
          toolDeleteNode.disabled = true;
          renderNodes(); 
          renderLinks(); 
        });

        svg.appendChild(path);
        
        // Add Link Label Text
        if (link.label) {
            // Find the midpoint of the path for text placement
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', midX);
            text.setAttribute('y', midY - 5); // Shift up slightly
            text.setAttribute('class', 'link-label');
            text.textContent = link.label;
            text.setAttribute('text-anchor', 'middle');
            svg.appendChild(text);
        }
      });
      
      // Render temporary link being drawn
      if (linkDraw) {
        // This is complex, but for simplicity, we'll draw a straight line
        const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tempPath.setAttribute('x1', linkDraw.x);
        tempPath.setAttribute('y1', linkDraw.y);
        tempPath.setAttribute('x2', linkDraw.currentX);
        tempPath.setAttribute('y2', linkDraw.currentY);
        tempPath.setAttribute('stroke', 'var(--accent)');
        tempPath.setAttribute('stroke-width', 2);
        tempPath.setAttribute('fill', 'none');
        svg.appendChild(tempPath);
      }
    }


    // --- Interaction Handlers ---

    function addNodeAt(x, y, type) {
      const snappedCoords = {
        x: Math.round(x / gridSize) * gridSize,
        y: Math.round(y / gridSize) * gridSize
      };
      
      const defaults = { id: uid(), x: snappedCoords.x, y: snappedCoords.y, w: 220, h: 100, type: type };
      let newNode;
      
      if (type === 'page') {
        newNode = { ...defaults, title: 'New Page', body: 'Website Page or Screen' };
      } else if (type === 'action') {
        newNode = { ...defaults, title: 'User Action', body: 'Button Click or Input' };
        newNode.w = 180;
      } else if (type === 'decision') {
        newNode = { ...defaults, title: 'Decision', body: 'Is X True?', w: 140, h: 140 };
      }
      
      model.nodes.push(newNode);
      renderNodes();
      triggerSave();
    }
    
    function startLinkDraw(e, sourceId) {
        e.stopPropagation(); 
        const nodeEl = document.getElementById(`node-${sourceId}`);
        const rect = nodeEl.getBoundingClientRect();
        const boardRect = board.getBoundingClientRect();
        
        // Calculate anchor position in board space (right center of the node)
        const startX = nodeEl.offsetLeft + rect.width; 
        const startY = nodeEl.offsetTop + rect.height / 2;
        
        linkDraw = { 
            sourceId: sourceId, 
            x: startX, 
            y: startY, 
            currentX: startX,
            currentY: startY
        };
        panLayer.style.cursor = 'crosshair';
    }


    function handleNodeMouseDown(e, nodeId) {
      e.stopPropagation(); 

      selectedNodeId = nodeId;
      selectedLinkId = null;
      toolDeleteNode.disabled = false;
      toolDeleteLink.disabled = true;
      renderNodes(); 

      const node = findNode(nodeId);
      if (!node) return;

      dragInfo = {
        mode: 'node',
        startX: e.clientX,
        startY: e.clientY,
        startNodeX: node.x,
        startNodeY: node.y,
        nodeId: nodeId
      };
    }

    function handleMouseDown(e) {
      if (e.target !== panLayer && e.target !== canvas) return;

      // Clear selections on background click
      selectedNodeId = null;
      selectedLinkId = null;
      toolDeleteNode.disabled = true;
      toolDeleteLink.disabled = true;
      renderNodes(); 
      renderLinks();

      // Start Panning
      dragInfo = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        startTransformX: transform.x,
        startTransformY: transform.y
      };

      panLayer.style.cursor = 'grabbing';
    }

    function handleMouseMove(e) {
      if (!dragInfo && !linkDraw) return;
      
      const deltaX = e.clientX - (dragInfo ? dragInfo.startX : 0);
      const deltaY = e.clientY - (dragInfo ? dragInfo.startY : 0);
      const { x: cursorX, y: cursorY } = screenToBoard(e.clientX, e.clientY);

      if (dragInfo && dragInfo.mode === 'pan') {
        transform.x = dragInfo.startTransformX + deltaX;
        transform.y = dragInfo.startTransformY + deltaY;
        applyTransform();
      } else if (dragInfo && dragInfo.mode === 'node') {
        const node = findNode(dragInfo.nodeId);
        if (node) {
          node.x = dragInfo.startNodeX + deltaX / transform.scale;
          node.y = dragInfo.startNodeY + deltaY / transform.scale;
          
          const el = document.getElementById(`node-${node.id}`);
          if (el) {
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
          }
          renderLinks(); 
        }
      } else if (linkDraw) {
          // Update temporary link line endpoint
          linkDraw.currentX = cursorX;
          linkDraw.currentY = cursorY;
          renderLinks(); // Re-render to show the line
      }
    }

    function handleMouseUp(e) {
      if (linkDraw) {
        // Finalize link
        const targetElement = e.target.closest('.node');
        if (targetElement) {
            const targetId = targetElement.id.replace('node-', '');
            
            // Do not link a node to itself
            if (targetId !== linkDraw.sourceId) {
                const label = prompt("Enter transition label (e.g., 'Success', 'User Clicks'):", "Next Step");
                
                if (label !== null) { // Check if user didn't hit cancel
                    model.links.push({
                        id: uid('link'),
                        source: linkDraw.sourceId,
                        target: targetId,
                        label: label.trim() 
                    });
                    renderNodes();
                    triggerSave();
                }
            }
        }
        
        linkDraw = null;
        panLayer.style.cursor = 'grab';
        renderLinks(); // Clear temporary line
      }
      
      if (dragInfo) {
          if (dragInfo.mode === 'node') {
            // Snap node to grid before saving
            const node = findNode(dragInfo.nodeId);
            if (node) {
              node.x = Math.round(node.x / gridSize) * gridSize;
              node.y = Math.round(node.y / gridSize) * gridSize;
            }
            renderNodes();
            triggerSave();
          }
          dragInfo = null;
          panLayer.style.cursor = 'grab';
      }
    }
    
    // --- Modal Handlers ---

    function openNodeModal(node) {
      activeModalNode = node;
      modalTitle.value = node.title;
      modalBody.value = node.body;
      modalProjectId.textContent = node.id;
      
      // Ensure color/shape inputs are hidden/unused if you removed them from HTML
      
      modal.setAttribute('aria-hidden', 'false');
    }

    function saveModalChanges() {
      if (activeModalNode) {
        activeModalNode.title = modalTitle.value;
        activeModalNode.body = modalBody.value;
        renderNodes();
        modal.setAttribute('aria-hidden', 'true');
        triggerSave();
      }
    }
    
    function deleteSelectedNode() {
        if (selectedNodeId) {
            model.nodes = model.nodes.filter(n => n.id !== selectedNodeId);
            model.links = model.links.filter(l => l.source !== selectedNodeId && l.target !== selectedNodeId);
            
            selectedNodeId = null;
            toolDeleteNode.disabled = true;
            
            renderNodes();
            triggerSave();
        }
    }
    
    function deleteSelectedLink() {
        if (selectedLinkId) {
            model.links = model.links.filter(l => l.id !== selectedLinkId);
            selectedLinkId = null;
            toolDeleteLink.disabled = true;
            renderLinks();
            triggerSave();
        }
    }
    
    // --- Event Listeners ---

    if (saveBoardBtn) saveBoardBtn.addEventListener('click', saveModel);
    
    // New Node Tool Listeners
    if (toolAddPage) toolAddPage.addEventListener('click', () => addNodeAt(200, 200, 'page'));
    if (toolAddAction) toolAddAction.addEventListener('click', () => addNodeAt(200, 200, 'action'));
    if (toolAddDecision) toolAddDecision.addEventListener('click', () => addNodeAt(200, 200, 'decision'));

    if (toolDeleteNode) toolDeleteNode.addEventListener('click', deleteSelectedNode);
    if (toolDeleteLink) toolDeleteLink.addEventListener('click', deleteSelectedLink);

    // Canvas/Interaction Listeners
    if (panLayer) {
        panLayer.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // Disable context menu on canvas
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    // Control Panel
    if (showGrid) showGrid.addEventListener('change', applyTransform); // Calls updateGrid internally
    if (gridSizeInput) gridSizeInput.addEventListener('change', applyTransform);
    if (centerBtn) centerBtn.addEventListener('click', () => { 
        transform = { x: 0, y: 0, scale: 1 };
        applyTransform();
    });

    // Zoom
    const zoomFactor = 1.2;
    if (zoomInCorner) zoomInCorner.addEventListener('click', () => { 
        transform.scale = clamp(transform.scale * zoomFactor, 0.25, 2);
        applyTransform(); 
    });
    if (zoomOutCorner) zoomOutCorner.addEventListener('click', () => { 
        transform.scale = clamp(transform.scale / zoomFactor, 0.25, 2);
        applyTransform(); 
    });

    // Modal
    if (cancelModal) cancelModal.addEventListener('click', () => modal.setAttribute('aria-hidden', 'true'));
    if (saveModal) saveModal.addEventListener('click', saveModalChanges);
    if (deleteBlock) deleteBlock.addEventListener('click', () => { 
        deleteSelectedNode(); 
        modal.setAttribute('aria-hidden', 'true');
    });

    /* --- Bootstrap --- */
    loadModel(); 
    updateZoomIndicator();

  }; 

  document.addEventListener('DOMContentLoaded', ready);
})();
