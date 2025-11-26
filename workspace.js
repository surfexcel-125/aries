/* workspace.js — replacement module
   - Drag, pan, zoom, connectors, save/load, keyboard Delete, snap-to-grid, improved anchors
   - Expects window.AriesDB.loadProjectData and saveProjectWorkspace (from your app.js/firebase helpers).
*/
(function(){
  // Helpers & state
  const ready = () => {
    const projectId = window.currentProjectId;
    if (!projectId) { console.error("Missing projectId"); return; }

    // Elements
    const canvas = document.getElementById('canvas');
    const board = document.getElementById('board');
    const svg = document.getElementById('svg');
    const headerTitle = document.getElementById('headerTitle');

    const toolAddPage = document.getElementById('toolAddPage');
    const toolAddAction = document.getElementById('toolAddAction');
    const toolAddDecision = document.getElementById('toolAddDecision');
    const toolDeleteNode = document.getElementById('toolDeleteNode');
    const toolDeleteLink = document.getElementById('toolDeleteLink');
    const saveBoardBtn = document.getElementById('saveBoard');

    const showGrid = document.getElementById('showGrid');
    const gridSizeInput = document.getElementById('gridSize');
    const zoomIndicator = document.getElementById('zoomIndicator');
    const zoomInCorner = document.getElementById('zoomInCorner');
    const zoomOutCorner = document.getElementById('zoomOutCorner');
    const centerBtn = document.getElementById('centerBtn');

    const modal = document.getElementById('modal');
    const modalProjectId = document.getElementById('modalProjectId');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const deleteBlock = document.getElementById('deleteBlock');
    const cancelModal = document.getElementById('cancelModal');
    const saveModal = document.getElementById('saveModal');

    const contextMenu = document.getElementById('contextMenu');
    const contextEdit = document.getElementById('contextEdit');
    const contextDelete = document.getElementById('contextDelete');

    // Model
    let model = { nodes: [], links: [] };
    let transform = { x: 0, y: 0, scale: 1 };
    let selectedNodeId = null;
    let selectedLinkId = null;
    let dragInfo = null;
    let linkDraw = null;
    let activeModalNode = null;
    let highestZ = 15;
    let autoSaveTimer = null;
    const DEBOUNCE = 1000;

    // Utilities
    const uid = (p='n') => p + Math.random().toString(36).slice(2,9);
    const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
    const gridSize = () => parseInt(gridSizeInput.value || 25);
    const screenToBoard = (sx, sy) => ({ x: (sx - transform.x)/transform.scale, y: (sy - transform.y)/transform.scale });
    const boardToScreen = (bx, by) => ({ x: bx*transform.scale + transform.x, y: by*transform.scale + transform.y });

    // Anchor computation: returns board coordinates for anchor on node boundary
    function getAnchor(node, isTarget=false) {
      const el = document.getElementById(`node-${node.id}`);
      if (!el) {
        return { x: node.x + (node.w||200)/2, y: node.y + (node.h||100)/2 };
      }
      const w = el.offsetWidth / transform.scale;
      const h = el.offsetHeight / transform.scale;
      // default to mid-right for output, mid-left for input
      if (!isTarget) {
        return { x: node.x + w, y: node.y + h/2 };
      } else {
        return { x: node.x, y: node.y + h/2 };
      }
    }

    // Rendering
    function clearNodes() { document.querySelectorAll('.node').forEach(n => n.remove()); }
    function renderNodes() {
      clearNodes();
      model.nodes.forEach(node => {
        const el = document.createElement('div');
        el.className = `node node-type-${node.type} ${node.id===selectedNodeId ? 'selected' : ''}`;
        el.id = `node-${node.id}`;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.zIndex = node.zIndex || 15;
        if (node.type !== 'decision') {
          el.style.width = `${node.w}px`;
          el.style.height = `${node.h}px`;
        }
        el.innerHTML = `<div class="node-title">${node.title}</div><div class="node-body">${node.body}</div>`;
        // anchor
        const out = document.createElement('div');
        out.className = 'anchor output-anchor';
        out.addEventListener('mousedown', e => startLinkDraw(e, node.id));
        el.appendChild(out);

        el.addEventListener('mousedown', e => handleNodeDown(e, node.id));
        el.addEventListener('dblclick', e => { e.stopPropagation(); openNodeModal(node); });
        el.addEventListener('contextmenu', e => nodeContext(e, node.id));
        board.appendChild(el);
      });
      renderLinks();
    }

    function renderLinks() {
      // clear svg paths
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      // temporary link (while drawing)
      if (linkDraw) {
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        const a = { x: linkDraw.x, y: linkDraw.y };
        const b = { x: linkDraw.currentX, y: linkDraw.currentY };
        const midX = (a.x + b.x)/2;
        const d = `M${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
        p.setAttribute('d', d);
        p.setAttribute('stroke', 'var(--accent)');
        p.setAttribute('stroke-width', 3);
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke-dasharray','8,8');
        svg.appendChild(p);
      }

      model.links.forEach(link => {
        const s = model.nodes.find(n => n.id === link.source);
        const t = model.nodes.find(n => n.id === link.target);
        if (!s || !t) return;
        const p1 = getAnchor(s, false);
        const p2 = getAnchor(t, true);
        const dx = Math.max(40, Math.abs(p1.x - p2.x) * 0.4);
        const c1x = p1.x + dx, c1y = p1.y;
        const c2x = p2.x - dx, c2y = p2.y;
        const d = `M${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
        const path = document.createElementNS('http://www.w3.org/2000/svg','path');
        const isSel = selectedLinkId === link.id;
        path.setAttribute('d', d);
        path.setAttribute('stroke', isSel ? 'var(--link-selected)' : 'var(--link-color)');
        path.setAttribute('stroke-width', 3);
        path.setAttribute('fill', 'none');
        path.setAttribute('marker-end', `url(#${isSel ? 'arrowhead-selected' : 'arrowhead'})`);
        path.classList.add('link-path');
        path.id = `link-${link.id}`;
        path.style.cursor = 'pointer';
        // make clickable by overlaying invisible path that accepts pointer events
        path.addEventListener('click', e => {
          e.stopPropagation();
          selectedLinkId = link.id;
          selectedNodeId = null;
          toolDeleteLink.disabled = false;
          toolDeleteNode.disabled = true;
          renderNodes(); renderLinks();
        });
        svg.appendChild(path);

        if (link.label) {
          const midX = (p1.x + p2.x)/2;
          const midY = (p1.y + p2.y)/2;
          const text = document.createElementNS('http://www.w3.org/2000/svg','text');
          text.setAttribute('x', midX);
          text.setAttribute('y', midY - 6);
          text.setAttribute('class','link-label');
          text.setAttribute('text-anchor','middle');
          text.textContent = link.label;
          svg.appendChild(text);
        }
      });
    }

    // Transform & grid drawing
    function applyTransform() {
      board.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
      zoomIndicator && (zoomIndicator.textContent = `${Math.round(transform.scale*100)}%`);
      updateGrid();
      renderLinks();
    }

    function updateGrid() {
      if (!showGrid.checked) { canvas.style.backgroundImage = 'none'; return; }
      const size = gridSize();
      const scaled = size * transform.scale;
      const bg = `linear-gradient(to right, var(--grid-color) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)`;
      const ox = transform.x % scaled;
      const oy = transform.y % scaled;
      canvas.style.backgroundImage = bg;
      canvas.style.backgroundSize = `${scaled}px ${scaled}px`;
      canvas.style.backgroundPosition = `${ox}px ${oy}px`;
    }

    // Model CRUD
    function addNodeAt(x, y, type) {
      // x,y are board coords
      const snap = gridSize();
      const nx = Math.round(x / snap) * snap;
      const ny = Math.round(y / snap) * snap;
      highestZ++;
      const base = { id: uid('n'), x: nx, y: ny, w:220, h:100, type, zIndex: highestZ };
      if (type === 'page') base.title = 'New Page', base.body='Website Page or Screen';
      else if (type === 'action') base.title='User Action', base.body='User event';
      else if (type === 'decision') { base.title='Decision'; base.body='Condition'; base.w=150; base.h=150; }
      model.nodes.push(base);
      triggerSave();
      renderNodes();
    }

    async function saveModel() {
      if (!window.AriesDB || !window.AriesDB.saveProjectWorkspace) {
        console.warn('No AriesDB.saveProjectWorkspace found');
        return;
      }
      try {
        saveBoardBtn.textContent = 'Saving...';
        await window.AriesDB.saveProjectWorkspace(projectId, model.nodes, model.links);
        saveBoardBtn.textContent = 'Saved!';
        setTimeout(()=> saveBoardBtn.textContent = 'Save Board', 1400);
      } catch (err) {
        console.error('Save failed', err);
        saveBoardBtn.textContent = 'Save Failed';
        setTimeout(()=> saveBoardBtn.textContent = 'Save Board', 2000);
      }
    }

    function triggerSave() {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(saveModel, DEBOUNCE);
      saveBoardBtn && (saveBoardBtn.textContent = 'Saving...');
    }

    async function loadModel() {
      if (!window.AriesDB || !window.AriesDB.loadProjectData) {
        seedModel(); return;
      }
      try {
        const d = await window.AriesDB.loadProjectData(projectId);
        if (d) {
          headerTitle && (headerTitle.textContent = d.name || headerTitle.textContent);
          model.nodes = d.nodes || [];
          model.links = d.links || [];
          highestZ = model.nodes.reduce((m,n)=> Math.max(m,n.zIndex||15), 15);
        } else seedModel();
      } catch (err) { console.error('Load failed', err); seedModel(); }
      applyTransform(); renderNodes();
    }

    function seedModel() {
      if (model.nodes.length === 0) {
        addNodeAt(200,200,'page');
        addNodeAt(480,200,'action');
        addNodeAt(760,200,'decision');
      }
    }

    // Events & interactions
    function startLinkDraw(e, sourceId) {
      e.stopPropagation();
      const src = model.nodes.find(n=>n.id===sourceId);
      if (!src) return;
      const anchor = getAnchor(src, false);
      linkDraw = { sourceId, x: anchor.x, y: anchor.y, currentX: anchor.x, currentY: anchor.y };
      canvas.style.cursor = 'crosshair';
    }

    function nodeContext(e, nodeId) {
      e.preventDefault();
      selectedNodeId = nodeId;
      selectedLinkId = null;
      toolDeleteNode.disabled = false;
      toolDeleteLink.disabled = true;
      renderNodes();
      contextMenu.style.left = `${e.clientX}px`;
      contextMenu.style.top = `${e.clientY}px`;
      contextMenu.style.display = 'block';
      contextEdit.onclick = () => { contextMenu.style.display='none'; openNodeModal(model.nodes.find(n=>n.id===nodeId)); };
      contextDelete.onclick = () => { contextMenu.style.display='none'; deleteSelectedNode(); };
    }

    function handleNodeDown(e, nodeId) {
      if (e.button !== 0) return;
      e.stopPropagation();
      contextMenu.style.display = 'none';
      selectedNodeId = nodeId;
      selectedLinkId = null;
      toolDeleteNode.disabled = false;
      toolDeleteLink.disabled = true;

      const node = model.nodes.find(n=>n.id===nodeId);
      if (node) { highestZ++; node.zIndex = highestZ; document.getElementById(`node-${nodeId}`).style.zIndex = highestZ; }
      dragInfo = {
        mode:'node',
        startX: e.clientX,
        startY: e.clientY,
        nodeId,
        startNodeX: node.x,
        startNodeY: node.y
      };
      renderNodes();
    }

    function onCanvasDown(e){
      // clicking empty space -> start panning
      if (e.target.closest('.node') || e.target.closest('#contextMenu')) return;
      selectedNodeId = null; selectedLinkId = null;
      toolDeleteNode.disabled = true; toolDeleteLink.disabled = true;
      renderNodes(); renderLinks();
      dragInfo = { mode:'pan', startX: e.clientX, startY: e.clientY, startTransformX: transform.x, startTransformY: transform.y };
      canvas.style.cursor = 'grabbing';
    }

    function onMove(e) {
      if (!dragInfo && !linkDraw) return;
      if (dragInfo && dragInfo.mode === 'pan') {
        const dx = e.clientX - dragInfo.startX;
        const dy = e.clientY - dragInfo.startY;
        transform.x = dragInfo.startTransformX + dx;
        transform.y = dragInfo.startTransformY + dy;
        applyTransform();
      } else if (dragInfo && dragInfo.mode === 'node') {
        const deltaX = (e.clientX - dragInfo.startX) / transform.scale;
        const deltaY = (e.clientY - dragInfo.startY) / transform.scale;
        const node = model.nodes.find(n=>n.id===dragInfo.nodeId);
        if (!node) return;
        node.x = dragInfo.startNodeX + deltaX;
        node.y = dragInfo.startNodeY + deltaY;
        const el = document.getElementById(`node-${node.id}`);
        if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; }
        renderLinks();
      } else if (linkDraw) {
        const b = screenToBoard(e.clientX, e.clientY);
        linkDraw.currentX = b.x; linkDraw.currentY = b.y;
        renderLinks();
      }
    }

    function onUp(e) {
      if (linkDraw) {
        const targetEl = e.target.closest('.node');
        if (targetEl) {
          const targetId = targetEl.id.replace('node-','');
          if (targetId !== linkDraw.sourceId) {
            const label = prompt("Enter transition label (e.g., Next, Success):","Next");
            if (label !== null) {
              model.links.push({ id: uid('l'), source: linkDraw.sourceId, target: targetId, label: label.trim() });
              triggerSave();
            }
          }
        }
        linkDraw = null;
        canvas.style.cursor = 'default';
        renderLinks();
      }

      if (dragInfo) {
        if (dragInfo.mode === 'node') {
          const node = model.nodes.find(n=>n.id===dragInfo.nodeId);
          if (node) {
            const s = gridSize();
            node.x = Math.round(node.x / s) * s;
            node.y = Math.round(node.y / s) * s;
          }
          renderNodes();
          triggerSave();
        }
        dragInfo = null;
        canvas.style.cursor = 'default';
      }
    }

    // keyboard handlers
    function onKey(e) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) { deleteSelectedNode(); }
        else if (selectedLinkId) { deleteSelectedLink(); }
      } else if (e.key === 'Escape') {
        linkDraw = null; dragInfo = null;
        modal.setAttribute('aria-hidden','true');
        contextMenu.style.display = 'none';
        renderLinks();
      }
    }

    function deleteSelectedNode() {
      if (!selectedNodeId) return;
      model.nodes = model.nodes.filter(n=>n.id !== selectedNodeId);
      model.links = model.links.filter(l => l.source !== selectedNodeId && l.target !== selectedNodeId);
      selectedNodeId = null;
      toolDeleteNode.disabled = true;
      renderNodes();
      triggerSave();
    }
    function deleteSelectedLink() {
      if (!selectedLinkId) return;
      model.links = model.links.filter(l => l.id !== selectedLinkId);
      selectedLinkId = null;
      toolDeleteLink.disabled = true;
      renderLinks();
      triggerSave();
    }

    function openNodeModal(node) {
      activeModalNode = node;
      modalProjectId.textContent = node.id;
      modalTitle.value = node.title;
      modalBody.value = node.body;
      modal.setAttribute('aria-hidden','false');
    }
    function saveModalChanges() {
      if (!activeModalNode) return;
      activeModalNode.title = modalTitle.value;
      activeModalNode.body = modalBody.value;
      renderNodes();
      modal.setAttribute('aria-hidden','true');
      triggerSave();
    }

    // Controls & buttons
    saveBoardBtn && saveBoardBtn.addEventListener('click', saveModel);
    toolAddPage && toolAddPage.addEventListener('click', ()=> addNodeAt(200,200,'page'));
    toolAddAction && toolAddAction.addEventListener('click', ()=> addNodeAt(420,200,'action'));
    toolAddDecision && toolAddDecision.addEventListener('click', ()=> addNodeAt(640,200,'decision'));
    toolDeleteNode && toolDeleteNode.addEventListener('click', deleteSelectedNode);
    toolDeleteLink && toolDeleteLink.addEventListener('click', deleteSelectedLink);

    // pan & mouse
    canvas.addEventListener('mousedown', onCanvasDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    // touch support (basic)
    canvas.addEventListener('touchstart', (ev) => {
      const t = ev.touches[0];
      onCanvasDown({ clientX: t.clientX, clientY: t.clientY, target: ev.target });
      ev.preventDefault();
    }, { passive:false });
    canvas.addEventListener('touchmove', (ev) => {
      const t = ev.touches[0];
      onMove({ clientX: t.clientX, clientY: t.clientY });
      ev.preventDefault();
    }, { passive:false });
    canvas.addEventListener('touchend', (ev) => { onUp({ clientX:0, clientY:0 }); }, { passive:false });

    // zoom controls
    const zoomFactor = 1.2;
    zoomInCorner && zoomInCorner.addEventListener('click', ()=> { transform.scale = clamp(transform.scale * zoomFactor, 0.25, 2); applyTransform(); });
    zoomOutCorner && zoomOutCorner.addEventListener('click', ()=> { transform.scale = clamp(transform.scale / zoomFactor, 0.25, 2); applyTransform(); });
    centerBtn && centerBtn.addEventListener('click', ()=> { transform = { x: 0, y: 0, scale: 1 }; applyTransform(); });

    // grid toggle
    showGrid && showGrid.addEventListener('change', applyTransform);
    gridSizeInput && gridSizeInput.addEventListener('change', applyTransform);

    // modal buttons
    cancelModal && cancelModal.addEventListener('click', ()=> modal.setAttribute('aria-hidden','true'));
    saveModal && saveModal.addEventListener('click', saveModalChanges);
    deleteBlock && deleteBlock.addEventListener('click', ()=> { if (activeModalNode) { selectedNodeId = activeModalNode.id; deleteSelectedNode(); modal.setAttribute('aria-hidden','true'); }});

    // keyboard
    document.addEventListener('keydown', onKey);

    // clicking canvas clears selections
    document.addEventListener('click', (e)=> {
      if (!e.target.closest('.node') && !e.target.closest('.link-path')) {
        selectedNodeId = null; selectedLinkId = null;
        toolDeleteNode.disabled = true; toolDeleteLink.disabled = true;
        contextMenu.style.display = 'none';
        renderNodes(); renderLinks();
      }
    });

    // initial load
    loadModel();

    // expose for debugging (optional)
    window._wf = { model, addNodeAt, renderNodes, saveModel };

  };

  document.addEventListener('DOMContentLoaded', ready);
})();
