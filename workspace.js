/* workspace.js
   COMPLETE Workflow Mapper script with FIXED dragging (event propagation) and layout fixes.
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
    
    // Node Tool Buttons
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

    // Context Menu
    const contextMenu = document.getElementById('contextMenu');
    const contextEdit = document.getElementById('contextEdit');
    const contextDelete = document.getElementById('contextDelete');


    // --- Model and State Initialization ---
    let model = { nodes: [], links: [] };
    let transform = { x: 0, y: 0, scale: 1 };
    let selectedNodeId = null;
    let selectedLinkId = null;
    let dragInfo = null;
    let activeModalNode = null;
    let gridSize = parseInt(gridSizeInput.value) || 25;
    let linkDraw = null; 
    let highestZIndex = 15; 

    
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
      updateGrid(); 
      renderLinks();
    }

    function updateZoomIndicator() {
      if(zoomIndicator) zoomIndicator.textContent = `${Math.round(transform.scale * 100)}%`;
    }

    function updateGrid() {
      gridSize = parseInt(gridSizeInput.value) || 25;
      if (showGrid.checked) {
        const bgSize = `${gridSize * transform.scale}px ${gridSize * transform.scale}px`;
        const bgPosX = transform.x % (gridSize * transform.scale);
        const bgPosY = transform.y % (gridSize * transform.scale);
        
        canvas.style.backgroundImage = `linear-gradient(to right, var(--grid-color) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)`;
        canvas.style.backgroundSize = bgSize;
        canvas.style.backgroundPosition = `${bgPosX}px ${bgPosY}px`;
      } else {
        canvas.style.backgroundImage = 'none';
      }
    }
    
    // --- Data Management Functions (Stubbed for completeness) ---

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
                if (headerTitle) headerTitle.textContent = data.name || `Workflow: ${projectId.substring(0, 5)}...`;
                model.nodes = data.nodes || [];
                model.links = data.links || [];
                highestZIndex = model.nodes.reduce((max, node) => Math.max(max, node.zIndex || 15), 15);
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
        addNodeAt(200, 200, 'page'); 
      }
    }
    
    // --- Node and Link Rendering ---

    function getAnchor(node, isTarget = false) {
      const el = document.getElementById(`node-${node.id}`);
      if (!el) return { x: node.x, y: node.y }; 

      const width = el.offsetWidth / transform.scale;
      const height = el.offsetHeight / transform.scale;
      
      let ax, ay;
      
      if (node.type === 'decision') {
          ax = isTarget ? node.x : node.x + width;
          ay = node.y + height / 2;
      } else {
          ax = isTarget ? node.x : node.x + width;
          ay = node.y + height / 2;
      }

      return { x: ax, y: ay };
    }

    function renderNodes() {
      document.querySelectorAll('.node').forEach(n => n.remove());

      model.nodes.forEach(node => {
        const el = document.createElement('div');
        el.className = `node node-type-${node.type} ${node.id === selectedNodeId ? 'selected' : ''}`;
        el.id = `node-${node.id}`;
        
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.zIndex = node.zIndex || 15;
        
        if (node.type !== 'decision') {
            el.style.width = `${node.w}px`;
            el.style.height = `${node.h}px`;
        }

        el.innerHTML = `<div class="node-title">${node.title}</div><div class="node-body">${node.body}</div>`;
        
        const outputAnchor = document.createElement('div');
        outputAnchor.className = 'anchor output-anchor';
        outputAnchor.addEventListener('mousedown', (e) => startLinkDraw(e, node.id));
        el.appendChild(outputAnchor);
        
        // Add listeners to enable dragging and modification
        el.addEventListener('mousedown', (e) => handleNodeMouseDown(e, node.id));
        el.addEventListener('dblclick', (e) => { e.stopPropagation(); openNodeModal(node); });
        el.addEventListener('contextmenu', (e) => handleContextMenu(e, node.id));


        board.appendChild(el);
      });
      renderLinks();
    }
    
    function renderLinks() {
      svg.innerHTML = ''; 
      
      if (linkDraw) {
        const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        const p1 = { x: linkDraw.x, y: linkDraw.y };
        const p2 = { x: linkDraw.currentX, y: linkDraw.currentY };
        
        const midX = (p1.x + p2.x) / 2;
        const pathData = `M${p1.x} ${p1.y} C${midX} ${p1.y}, ${midX} ${p2.y}, ${p2.x} ${p2.y}`;

        tempPath.setAttribute('d', pathData);
        tempPath.setAttribute('stroke', 'var(--accent)');
        tempPath.setAttribute('stroke-dasharray', '8, 8');
        tempPath.setAttribute('stroke-width', 3);
        tempPath.setAttribute('fill', 'none');
        tempPath.id = 'temp-link';
        svg.appendChild(tempPath);
      }


      model.links.forEach(link => {
        const sourceNode = findNode(link.source);
        const targetNode = findNode(link.target);

        if (!sourceNode || !targetNode) return;

        const p1 = getAnchor(sourceNode);
        const p2 = getAnchor(targetNode, true);

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
          contextMenu.style.display = 'none';
          renderNodes(); 
          renderLinks(); 
        });

        svg.appendChild(path);
        
        if (link.label) {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', midX);
            text.setAttribute('y', midY - 5); 
            text.setAttribute('class', 'link-label');
            text.textContent = link.label;
            text.setAttribute('text-anchor', 'middle');
            svg.appendChild(text);
        }
      });
    }


    // --- Interaction Handlers ---

    function addNodeAt(x, y, type) {
      const randOffset = Math.floor(Math.random() * 8) * gridSize / 4; 
      
      const snappedCoords = {
        x: Math.round((x + randOffset) / gridSize) * gridSize,
        y: Math.round((y + randOffset) / gridSize) * gridSize
      };
      
      highestZIndex++;
      
      const defaults = { 
        id: uid(), 
        x: snappedCoords.x, 
        y: snappedCoords.y, 
        w: 220, 
        h: 100, 
        type: type,
        zIndex: highestZIndex
      };
      let newNode;
      
      if (type === 'page') {
        newNode = { ...defaults, title: 'New Page', body: 'Website Page or Screen' };
      } else if (type === 'action') {
        newNode = { ...defaults, title: 'User Action', body: 'Button Click or Input' };
        newNode.w = 180;
      } else if (type === 'decision') {
        newNode = { ...defaults, title: 'Decision', body: 'Is X True?', w: 150, h: 150 };
      }
      
      model.nodes.push(newNode);
      renderNodes();
      triggerSave();
    }
    
    function startLinkDraw(e, sourceId) {
        e.stopPropagation(); 
        const anchorPos = getAnchor(findNode(sourceId));
        
        linkDraw = { 
            sourceId: sourceId, 
            x: anchorPos.x, 
            y: anchorPos.y, 
            currentX: anchorPos.x,
            currentY: anchorPos.y
        };
        panLayer.style.cursor = 'crosshair';
    }
    
    function handleContextMenu(e, nodeId) {
        e.preventDefault(); 
        
        selectedNodeId = nodeId;
        selectedLinkId = null;
        toolDeleteNode.disabled = false;
        toolDeleteLink.disabled = true;
        renderNodes(); 

        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.style.display = 'block';
        
        contextEdit.onclick = () => { contextMenu.style.display = 'none'; openNodeModal(findNode(nodeId)); };
        contextDelete.onclick = () => { contextMenu.style.display = 'none'; deleteSelectedNode(); };
    }

    /**
     * Handles mousedown on a node.
     * CRITICAL FIX: e.stopPropagation() prevents the event from reaching the panLayer.
     */
    function handleNodeMouseDown(e, nodeId) {
      if(e.button !== 0) return; // Only handle left clicks for drag

      e.stopPropagation(); // <--- THIS IS THE CRITICAL FIX for stopping workspace panning
      
      contextMenu.style.display = 'none';

      selectedNodeId = nodeId;
      selectedLinkId = null;
      toolDeleteNode.disabled = false;
      toolDeleteLink.disabled = true;
      
      const node = findNode(nodeId);
      if (node) {
        highestZIndex++;
        node.zIndex = highestZIndex;
        document.getElementById(`node-${nodeId}`).style.zIndex = highestZIndex;
      }

      dragInfo = {
        mode: 'node',
        startX: e.clientX,
        startY: e.clientY,
        startNodeX: node.x,
        startNodeY: node.y,
        nodeId: nodeId
      };
      
      renderNodes(); 
    }

    function handleMouseDown(e) {
      // If we clicked on a node or the context menu, exit, as handleNodeMouseDown handled it.
      if (e.target.closest('.node') || e.target.closest('#contextMenu')) return;
      
      selectedNodeId = null;
      selectedLinkId = null;
      toolDeleteNode.disabled = true;
      toolDeleteLink.disabled = true;
      contextMenu.style.display = 'none';

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
      
      const { x: cursorX, y: cursorY } = screenToBoard(e.clientX, e.clientY);

      if (dragInfo && dragInfo.mode === 'pan') {
        const deltaX = e.clientX - dragInfo.startX;
        const deltaY = e.clientY - dragInfo.startY;
        transform.x = dragInfo.startTransformX + deltaX;
        transform.y = dragInfo.startTransformY + deltaY;
        applyTransform();
      } else if (dragInfo && dragInfo.mode === 'node') {
        const deltaX = e.clientX - dragInfo.startX;
        const deltaY = e.clientY - dragInfo.startY;
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
          linkDraw.currentX = cursorX;
          linkDraw.currentY = cursorY;
          renderLinks();
      }
    }

    function handleMouseUp(e) {
      if (linkDraw) {
        const targetElement = e.target.closest('.node');
        if (targetElement) {
            const targetId = targetElement.id.replace('node-', '');
            
            if (targetId !== linkDraw.sourceId) {
                const label = prompt("Enter transition label (e.g., 'Success', 'User Clicks'):", "Next Step");
                
                if (label !== null) { 
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
        renderLinks(); 
      }
      
      if (dragInfo) {
          if (dragInfo.mode === 'node') {
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
    
    // Node Tool Listeners
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
        
        canvas.addEventListener('mousedown', () => contextMenu.style.display = 'none');
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.node')) e.preventDefault();
        });
    }
    
    // Control Panel
    if (showGrid) showGrid.addEventListener('change', applyTransform); 
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
