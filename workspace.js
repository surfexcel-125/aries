/* workspace.js — full replacement
   Fixes:
   - Accurate pointer -> board coordinate mapping using board.getBoundingClientRect()
   - Show link-label prompt ONLY when mouseup occurs inside target node bounding box
   - Keeps parallel link displacement, inspector protections, DOM-anchor anchors
*/
(function(){
  function ready() {
    const projectId = window.currentProjectId;
    if (!projectId) { console.error("Missing projectId"); return; }

    // DOM
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
    const zoomFitBtn = document.getElementById('zoomFitBtn');

    const inspector = document.getElementById('inspector');
    const selectedCount = document.getElementById('selectedCount');
    const inspectorSingle = document.getElementById('inspectorSingle');
    const inspectorMulti = document.getElementById('inspectorMulti');
    const inspectorId = document.getElementById('inspectorId');
    const inspectorType = document.getElementById('inspectorType');
    const inspectorTitle = document.getElementById('inspectorTitle');
    const inspectorBody = document.getElementById('inspectorBody');
    const inspectorW = document.getElementById('inspectorW');
    const inspectorH = document.getElementById('inspectorH');
    const inspectorSave = document.getElementById('inspectorSave');
    const inspectorDelete = document.getElementById('inspectorDelete');
    const statusMeta = document.getElementById('statusMeta');

    const exportBtn = document.getElementById('exportBtn');
    const importFile = document.getElementById('importFile');
    const exportJsonBtn = document.getElementById('exportJson');
    const importJsonBtn = document.getElementById('importJsonBtn');
    const autosizeBtn = document.getElementById('autosizeBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');

    // state
    let model = { nodes: [], links: [] };
    let transform = { x: 0, y: 0, scale: 1 };
    let selectedNodes = new Set();
    let selectedLinkId = null;
    let dragInfo = null;
    let linkDraw = null; // { sourceId, x, y, currentX, currentY }
    let highestZ = 15;
    let dirty = false;
    const DEBOUNCE = 800;
    let autoSaveTimer = null;

    // helpers
    const uid = (p='n') => p + Math.random().toString(36).slice(2,9);
    const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
    const gridSize = () => parseInt(gridSizeInput.value || 25);

    // Convert page/client coordinates to board coordinates (inverse of CSS transform)
    function screenToBoard(sx, sy) {
      const rect = board.getBoundingClientRect();
      // rect.left/top are where the board appears on screen after CSS transforms.
      // To get untransformed board coords we:
      // 1) subtract the board rect origin (rect.left/top),
      // 2) divide by current scale to invert scale.
      // This yields coordinates that match node positions (node.x/node.y are in board-space).
      const x = (sx - rect.left) / transform.scale;
      const y = (sy - rect.top) / transform.scale;
      return { x, y };
    }

    function boardToScreen(bx, by) {
      const rect = board.getBoundingClientRect();
      return { x: rect.left + bx * transform.scale, y: rect.top + by * transform.scale };
    }

    // Detect typing/focus in inspector to prevent accidental delete
    function isTyping() {
      try {
        const ae = document.activeElement;
        if (!ae) return false;
        const tag = (ae.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (ae.isContentEditable) return true;
        if (ae.closest && ae.closest('#inspector')) return true;
        return false;
      } catch (e) { return false; }
    }

    // Anchor calculation using DOM offsets (preferred) with model fallback
    function getAnchor(node, isTarget=false) {
      const el = document.getElementById(`node-${node.id}`);
      if (el) {
        const left = el.offsetLeft;
        const top = el.offsetTop;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (!isTarget) return { x: left + w, y: top + (h/2) };
        return { x: left, y: top + (h/2) };
      }
      const w = (node.w !== undefined) ? node.w : 220;
      const h = (node.h !== undefined) ? node.h : 100;
      if (!isTarget) return { x: node.x + w, y: node.y + (h/2) };
      return { x: node.x, y: node.y + (h/2) };
    }

    // render nodes
    function escapeHtml(str) {
      if (str == null) return '';
      return String(str).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])});
    }

    function clearNodes() { document.querySelectorAll('.node').forEach(n=>n.remove()); }

    function renderNodes() {
      clearNodes();
      model.nodes.forEach(node => {
        const el = document.createElement('div');
        el.className = `node node-type-${node.type} ${selectedNodes.has(node.id) ? 'selected' : ''}`;
        el.id = `node-${node.id}`;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.zIndex = node.zIndex || 15;
        if (node.type !== 'decision') {
          el.style.width = `${node.w}px`;
          el.style.height = `${node.h}px`;
        }
        el.innerHTML = `<div class="node-title">${escapeHtml(node.title)}</div><div class="node-body">${escapeHtml(node.body)}</div>`;
        const out = document.createElement('div');
        out.className = 'anchor output-anchor';
        out.addEventListener('mousedown', e => startLinkDraw(e, node.id));
        el.appendChild(out);

        el.addEventListener('mousedown', e => handleNodeDown(e, node.id));
        el.addEventListener('dblclick', e => { e.stopPropagation(); openNodeInspector(node); });
        el.addEventListener('contextmenu', e => nodeContext(e, node.id));
        board.appendChild(el);
      });
      renderLinks();
      updateInspector();
    }

    // Render links & preview, with parallel splitting
    function renderLinks() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      // preview path while drawing (dashed)
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
        p.setAttribute('stroke-dasharray','6,6');
        svg.appendChild(p);
      }

      // group by directional pair
      const pairs = {};
      model.links.forEach(link => {
        const key = `${link.source}::${link.target}`;
        if (!pairs[key]) pairs[key] = [];
        pairs[key].push(link);
      });
      Object.keys(pairs).forEach(key => {
        const arr = pairs[key];
        arr.forEach((link, idx) => { link._parallelIndex = idx; link._parallelCount = arr.length; });
      });

      model.links.forEach(link => {
        const s = model.nodes.find(n => n.id === link.source);
        const t = model.nodes.find(n => n.id === link.target);
        if (!s || !t) return;
        const p1 = getAnchor(s, false);
        const p2 = getAnchor(t, true);

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx*dx + dy*dy) || 1;
        const nx = -dy / length;
        const ny = dx / length;

        const baseGap = 18;
        const idx = (link._parallelIndex !== undefined) ? link._parallelIndex : 0;
        const count = (link._parallelCount !== undefined) ? link._parallelCount : 1;
        const middle = (count - 1) / 2;
        const offset = (idx - middle) * baseGap;
        const offsetX = nx * offset;
        const offsetY = ny * offset;

        const start = { x: p1.x + offsetX, y: p1.y + offsetY };
        const end   = { x: p2.x + offsetX, y: p2.y + offsetY };

        const cpDist = Math.max(40, Math.abs(p2.x - p1.x) * 0.35);
        const c1x = start.x + cpDist;
        const c1y = start.y;
        const c2x = end.x - cpDist;
        const c2y = end.y;
        const d = `M${start.x} ${start.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`;

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
        path.addEventListener('click', e => {
          e.stopPropagation();
          selectedLinkId = link.id;
          selectedNodes.clear();
          toolDeleteLink.disabled = false;
          toolDeleteNode.disabled = true;
          renderNodes(); renderLinks();
        });

        svg.appendChild(path);

        if (link.label) {
          const midX = (start.x + end.x)/2;
          const midY = (start.y + end.y)/2;
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

    // transform & grid
    function applyTransform() {
      board.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
      zoomIndicator && (zoomIndicator.textContent = `${Math.round(transform.scale*100)}%`);
      updateGrid();
      renderLinks();
      requestAnimationFrame(() => { repaintUI(); });
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

    function repaintUI() {
      try {
        const uiEls = document.querySelectorAll('.topbar, .header-actions, #floatingTools, .controls-panel, .header-title');
        uiEls.forEach(el => {
          el.style.transform = el.style.transform || 'translateZ(0)';
          el.style.willChange = 'transform';
        });
        setTimeout(()=> uiEls.forEach(el => el.style.willChange = ''), 260);
      } catch(e){ /* ignore */ }
    }

    // model ops
    function addNodeAt(x,y,type,opts={}) {
      const s = gridSize();
      const nx = Math.round(x / s) * s;
      const ny = Math.round(y / s) * s;
      highestZ++;
      const base = { id: uid('n'), x: nx, y: ny, w:220, h:100, type, zIndex: highestZ, title:'New', body:'' };
      if (type === 'page') base.title = 'New Page', base.body='Website Page';
      else if (type === 'action') base.title='Action', base.body='User event';
      else if (type === 'decision') { base.title='Decision'; base.body='Condition'; base.w=150; base.h=150; }
      Object.assign(base, opts);
      model.nodes.push(base);
      markDirty(); renderNodes();
      return base;
    }

    function markDirty() { dirty = true; statusMeta.textContent = 'Unsaved changes'; clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(saveModel, DEBOUNCE); saveBoardBtn.textContent = 'Saving...'; }
    async function saveModel() {
      if (!dirty) return;
      if (!window.AriesDB || !window.AriesDB.saveProjectWorkspace) {
        console.warn('No AriesDB.saveProjectWorkspace found');
        dirty = false; statusMeta.textContent = 'Local only'; saveBoardBtn.textContent = 'Save Board';
        return;
      }
      try {
        await window.AriesDB.saveProjectWorkspace(projectId, model.nodes, model.links);
        dirty = false; statusMeta.textContent = 'Saved';
        saveBoardBtn.textContent = 'Saved!'; setTimeout(()=> saveBoardBtn.textContent = 'Save Board', 1200);
      } catch (err) {
        console.error('Save failed', err);
        statusMeta.textContent = 'Save failed'; saveBoardBtn.textContent = 'Save Failed';
        setTimeout(()=> saveBoardBtn.textContent = 'Save Board', 1400);
      }
    }

    async function loadModel() {
      if (!window.AriesDB || !window.AriesDB.loadProjectData) { seedModel(); renderNodes(); return; }
      try {
        const d = await window.AriesDB.loadProjectData(projectId);
        if (d) {
          headerTitle && (headerTitle.textContent = d.name || headerTitle.textContent);
          model.nodes = (d.nodes || []).map(n => ({ ...n }));
          model.links = (d.links || []).map(l => ({ ...l }));
          highestZ = model.nodes.reduce((m,n)=> Math.max(m,n.zIndex||15), 15);
        } else seedModel();
      } catch (err) { console.error('Load failed', err); seedModel(); }
      applyTransform(); renderNodes();
    }

    function seedModel(){
      if (model.nodes.length === 0) {
        addNodeAt(200,200,'page',{title:'Home'});
        addNodeAt(520,200,'action',{title:'Login'});
        addNodeAt(860,200,'decision',{title:'Auth?'});
      }
    }

    // selection & inspector
    function setSelectedNodesFromClick(nodeId, ev) {
      if (ev.shiftKey) {
        if (selectedNodes.has(nodeId)) selectedNodes.delete(nodeId); else selectedNodes.add(nodeId);
      } else {
        selectedNodes.clear();
        selectedNodes.add(nodeId);
      }
      selectedLinkId = null;
      toolDeleteNode.disabled = false;
      toolDeleteLink.disabled = true;
      renderNodes(); renderLinks(); updateInspector();
    }

    function updateInspector() {
      selectedCount.textContent = selectedNodes.size;
      if (!inspector) return;
      if (selectedNodes.size === 0) {
        inspectorSingle.style.display = 'none'; inspectorMulti.style.display = 'none';
      } else if (selectedNodes.size === 1) {
        inspectorMulti.style.display = 'none'; inspectorSingle.style.display = 'block';
        const id = Array.from(selectedNodes)[0];
        const node = model.nodes.find(n=>n.id===id);
        if (node) {
          inspectorId.textContent = node.id;
          inspectorType.value = node.type;
          inspectorTitle.value = node.title;
          inspectorBody.value = node.body;
          inspectorW.value = parseInt(node.w||220);
          inspectorH.value = parseInt(node.h||100);
        }
      } else {
        inspectorSingle.style.display = 'none'; inspectorMulti.style.display = 'block';
      }
    }

    function applyInspectorToNode() {
      if (selectedNodes.size !== 1) return;
      const id = Array.from(selectedNodes)[0];
      const node = model.nodes.find(n=>n.id===id);
      if (!node) return;
      node.type = inspectorType.value;
      node.title = inspectorTitle.value;
      node.body = inspectorBody.value;
      node.w = parseInt(inspectorW.value) || node.w;
      node.h = parseInt(inspectorH.value) || node.h;
      markDirty(); renderNodes();
    }

    inspectorSave && inspectorSave.addEventListener('click', applyInspectorToNode);
    inspectorDelete && inspectorDelete.addEventListener('click', ()=> { if (selectedNodes.size === 1) deleteSelectedNode(Array.from(selectedNodes)[0]); });

    document.getElementById('alignLeft').addEventListener('click', ()=> {
      if (selectedNodes.size<2) return;
      const arr = Array.from(selectedNodes).map(id=>model.nodes.find(n=>n.id===id));
      const left = Math.min(...arr.map(n=>n.x));
      arr.forEach(n=> n.x = left);
      markDirty(); renderNodes();
    });
    document.getElementById('alignTop').addEventListener('click', ()=> {
      if (selectedNodes.size<2) return;
      const arr = Array.from(selectedNodes).map(id=>model.nodes.find(n=>n.id===id));
      const top = Math.min(...arr.map(n=>n.y));
      arr.forEach(n=> n.y = top);
      markDirty(); renderNodes();
    });

    // link draw start
    function startLinkDraw(e, sourceId) {
      e.stopPropagation();
      const src = model.nodes.find(n=>n.id===sourceId);
      if (!src) return;
      const anchor = getAnchor(src,false);
      linkDraw = { sourceId, x: anchor.x, y: anchor.y, currentX: anchor.x, currentY: anchor.y };
      canvas.style.cursor = 'crosshair';
    }

    // finalize link only if release point lies inside target's DOM box
    async function finalizeLinkIfPossible(evt) {
      if (!linkDraw) { linkDraw = null; canvas.style.cursor = 'default'; renderLinks(); return; }

      // compute release board coords robustly using event client coordinates
      let clientX = (evt && evt.clientX) || (window._lastMouse && window._lastMouse.clientX) || 0;
      let clientY = (evt && evt.clientY) || (window._lastMouse && window._lastMouse.clientY) || 0;
      const boardPt = screenToBoard(clientX, clientY);

      const targetEl = document.elementFromPoint(clientX, clientY) ? document.elementFromPoint(clientX, clientY).closest('.node') : null;

      if (targetEl && linkDraw) {
        const targetId = targetEl.id.replace('node-','');
        if (targetId !== linkDraw.sourceId) {
          // check if boardPt is inside targetEl bounding box (using offsetLeft/top/width/height)
          const left = targetEl.offsetLeft;
          const top = targetEl.offsetTop;
          const w = targetEl.offsetWidth;
          const h = targetEl.offsetHeight;
          const inside = boardPt.x >= left && boardPt.x <= (left + w) && boardPt.y >= top && boardPt.y <= (top + h);
          if (inside) {
            try {
              // ask for label only when released inside the target node
              const label = (window.requestTransitionLabel && typeof window.requestTransitionLabel === 'function')
                              ? await window.requestTransitionLabel('Next')
                              : window.prompt('Enter transition label (e.g., Next, Success):', 'Next');
              if (label !== null && label !== '') {
                model.links.push({ id: uid('l'), source: linkDraw.sourceId, target: targetId, label: label.trim() });
                markDirty();
              }
            } catch (e) {
              console.error('Label modal error', e);
            }
          } // else: release not inside target => ignore
        }
      }

      linkDraw = null;
      canvas.style.cursor = 'default';
      renderLinks();
    }

    // on mouse up ends draws/drags
    function onUp(e) {
      if (linkDraw) {
        finalizeLinkIfPossible(e);
      }

      if (dragInfo) {
        if (dragInfo.mode === 'node') {
          const s = gridSize();
          for (let id of Object.keys(dragInfo.startPositions)) {
            const n = model.nodes.find(x=>x.id===id);
            if (!n) continue;
            n.x = Math.round(n.x / s) * s;
            n.y = Math.round(n.y / s) * s;
          }
          markDirty(); renderNodes();
        }
        dragInfo = null;
        canvas.style.cursor = 'default';
      }
    }

    // context menu
    function nodeContext(e, nodeId) {
      e.preventDefault();
      setSelectedNodesFromClick(nodeId, e);
      contextMenuAt(e.clientX, e.clientY, nodeId);
    }
    function contextMenuAt(x,y,nodeId) {
      const cm = document.getElementById('contextMenu');
      cm.style.left = `${x}px`;
      cm.style.top = `${y}px`;
      cm.style.display = 'block';
      document.getElementById('contextEdit').onclick = ()=> { cm.style.display='none'; openNodeInspector(model.nodes.find(n=>n.id===nodeId)); };
      document.getElementById('contextDelete').onclick = ()=> { cm.style.display='none'; deleteSelectedNode(nodeId); };
    }

    function openNodeInspector(node) {
      selectedNodes.clear();
      selectedNodes.add(node.id);
      updateInspector();
      if (inspector && inspector.classList.contains('hidden')) {
        inspector.classList.remove('hidden'); inspector.classList.add('visible');
      }
    }

    // node drag / pan
    function handleNodeDown(e, nodeId) {
      if (e.button !== 0) return;
      e.stopPropagation();
      document.getElementById('contextMenu').style.display = 'none';
      if (!selectedNodes.has(nodeId)) {
        setSelectedNodesFromClick(nodeId, e);
      }
      selectedLinkId = null;
      const startPositions = {};
      Array.from(selectedNodes).forEach(id => {
        const n = model.nodes.find(x=>x.id===id); if (n) startPositions[id] = { x: n.x, y: n.y };
      });
      const node = model.nodes.find(n=>n.id===nodeId);
      if (node) { highestZ++; node.zIndex = highestZ; const el=document.getElementById(`node-${nodeId}`); if (el) el.style.zIndex = highestZ; }
      dragInfo = { mode:'node', startX: e.clientX, startY: e.clientY, nodeId, startPositions };
      renderNodes();
    }

    function onCanvasDown(e) {
      if (e.target.closest('.node') || e.target.closest('#contextMenu')) return;
      selectedNodes.clear(); selectedLinkId = null;
      toolDeleteNode.disabled = true; toolDeleteLink.disabled = true;
      renderNodes(); renderLinks(); updateInspector();
      dragInfo = { mode:'pan', startX: e.clientX, startY: e.clientY, startTransformX: transform.x, startTransformY: transform.y };
      canvas.style.cursor = 'grabbing';
    }

    // Save the last mouse position globally to fall back if event not passed to finalize
    window._lastMouse = { clientX: 0, clientY: 0 };

    function onMove(e) {
      window._lastMouse.clientX = e.clientX;
      window._lastMouse.clientY = e.clientY;

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
        for (let id of Object.keys(dragInfo.startPositions)) {
          const n = model.nodes.find(x=>x.id===id);
          if (!n) continue;
          n.x = dragInfo.startPositions[id].x + deltaX;
          n.y = dragInfo.startPositions[id].y + deltaY;
          const el = document.getElementById(`node-${n.id}`);
          if (el) { el.style.left = `${n.x}px`; el.style.top = `${n.y}px`; }
        }
        renderLinks();
      } else if (linkDraw) {
        // use robust conversion from client -> board coords
        const b = screenToBoard(e.clientX, e.clientY);
        linkDraw.currentX = b.x;
        linkDraw.currentY = b.y;
        renderLinks();
      }
    }

    // keyboard (with typing protection)
    function onKey(e) {
      if (isTyping()) return;
      if ((e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedNodes.size > 0) {
          Array.from(selectedNodes).forEach(id => deleteSelectedNode(id));
          selectedNodes.clear(); renderNodes();
        } else if (selectedLinkId) {
          deleteSelectedLink();
        }
      } else if (e.key === 'Escape') {
        linkDraw = null; dragInfo = null;
        document.getElementById('contextMenu').style.display = 'none';
        renderLinks();
      }
    }

    function deleteSelectedNode(nodeId) {
      if (!nodeId) return;
      model.nodes = model.nodes.filter(n=>n.id !== nodeId);
      model.links = model.links.filter(l => l.source !== nodeId && l.target !== nodeId);
      selectedNodes.delete(nodeId);
      toolDeleteNode.disabled = true;
      renderNodes();
      markDirty();
    }
    function deleteSelectedLink() {
      if (!selectedLinkId) return;
      model.links = model.links.filter(l => l.id !== selectedLinkId);
      selectedLinkId = null;
      toolDeleteLink.disabled = true;
      renderLinks();
      markDirty();
    }

    // UI bindings
    toolAddPage && toolAddPage.addEventListener('click', ()=> addNodeAt(220,220,'page'));
    toolAddAction && toolAddAction.addEventListener('click', ()=> addNodeAt(420,220,'action'));
    toolAddDecision && toolAddDecision.addEventListener('click', ()=> addNodeAt(640,220,'decision'));
    toolDeleteNode && toolDeleteNode.addEventListener('click', ()=> { Array.from(selectedNodes).forEach(id=>deleteSelectedNode(id)); selectedNodes.clear(); renderNodes(); });
    toolDeleteLink && toolDeleteLink.addEventListener('click', deleteSelectedLink);

    canvas.addEventListener('mousedown', onCanvasDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', (ev)=> { const t = ev.touches[0]; onCanvasDown({ clientX: t.clientX, clientY: t.clientY, target: ev.target }); ev.preventDefault(); }, { passive:false});
    canvas.addEventListener('touchmove', (ev)=> { const t = ev.touches[0]; onMove({ clientX: t.clientX, clientY: t.clientY }); ev.preventDefault(); }, { passive:false});
    canvas.addEventListener('touchend', (ev)=> { onUp({ clientX:0, clientY:0 }); }, { passive:false});

    const zoomFactor = 1.2;
    zoomInCorner && zoomInCorner.addEventListener('click', ()=> { transform.scale = clamp(transform.scale * zoomFactor, 0.25, 2); applyTransform(); });
    zoomOutCorner && zoomOutCorner.addEventListener('click', ()=> { transform.scale = clamp(transform.scale / zoomFactor, 0.25, 2); applyTransform(); });
    centerBtn && centerBtn.addEventListener('click', ()=> { transform = { x: 0, y: 0, scale: 1 }; applyTransform(); });
    zoomFitBtn && zoomFitBtn.addEventListener('click', zoomToFit);

    showGrid && showGrid.addEventListener('change', applyTransform);
    gridSizeInput && gridSizeInput.addEventListener('change', applyTransform);

    // export/import
    document.addEventListener('workspace:importJson', (ev) => {
      const payload = ev.detail;
      if (!payload) return;
      model.nodes = (payload.nodes || []).map(n => ({ ...n }));
      model.links = (payload.links || []).map(l => ({ ...l }));
      highestZ = model.nodes.reduce((m,n)=> Math.max(m,n.zIndex||15), 15);
      selectedNodes.clear(); selectedLinkId = null;
      markDirty(); applyTransform(); renderNodes();
    });

    exportBtn && exportBtn.addEventListener('click', ()=> downloadJSON());
    exportJsonBtn && exportJsonBtn.addEventListener('click', ()=> downloadJSON());
    importJsonBtn && importJsonBtn.addEventListener('click', ()=> document.getElementById('importFile').click());

    autosizeBtn && autosizeBtn.addEventListener('click', autoResizeBoard);
    clearAllBtn && clearAllBtn.addEventListener('click', ()=> { if (confirm('Clear entire board?')) { model.nodes=[]; model.links=[]; selectedNodes.clear(); markDirty(); renderNodes(); }});

    function downloadJSON() {
      const payload = { nodes: model.nodes, links: model.links, exportedAt: new Date().toISOString(), projectId };
      const data = JSON.stringify(payload, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workflow-${projectId || 'board'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function autoResizeBoard() {
      if (model.nodes.length === 0) { board.style.width = '1200px'; board.style.height = '900px'; return; }
      const pad = 140;
      const maxX = Math.max(...model.nodes.map(n => n.x + (n.w||220)));
      const maxY = Math.max(...model.nodes.map(n => n.y + (n.h||100)));
      const minX = Math.min(...model.nodes.map(n => n.x));
      const minY = Math.min(...model.nodes.map(n => n.y));
      const w = Math.max(1200, (maxX - minX) + pad*2);
      const h = Math.max(800, (maxY - minY) + pad*2);
      board.style.width = `${Math.round(w)}px`;
      board.style.height = `${Math.round(h)}px`;
      const dx = pad - minX, dy = pad - minY;
      model.nodes.forEach(n => { n.x += dx; n.y += dy; });
      markDirty(); renderNodes(); applyTransform();
    }

    function zoomToFit() {
      if (model.nodes.length === 0) { transform = { x:0, y:0, scale:1 }; applyTransform(); return; }
      const minX = Math.min(...model.nodes.map(n=>n.x));
      const minY = Math.min(...model.nodes.map(n=>n.y));
      const maxX = Math.max(...model.nodes.map(n=>n.x + (n.w||220)));
      const maxY = Math.max(...model.nodes.map(n=>n.y + (n.h||100)));
      const pad = 80;
      const bboxW = (maxX - minX) + pad*2;
      const bboxH = (maxY - minY) + pad*2;
      const viewW = canvas.clientWidth;
      const viewH = canvas.clientHeight;
      const scaleX = viewW / bboxW;
      const scaleY = viewH / bboxH;
      const scale = clamp(Math.min(scaleX, scaleY, 1.6), 0.2, 1.6);
      transform.scale = scale;
      const centerBoardX = (minX + maxX)/2;
      const centerBoardY = (minY + maxY)/2;
      transform.x = (viewW/2) - (centerBoardX * transform.scale);
      transform.y = (viewH/2) - (centerBoardY * transform.scale);
      applyTransform();
    }

    // prevent clicks inside UI panels from clearing selection
    document.addEventListener('click', (e)=> {
      const target = e.target;
      if (target.closest('.node') || target.closest('.link-path')) return;
      if (target.closest('#inspector')
          || target.closest('.topbar')
          || target.closest('.header-actions')
          || target.closest('#floatingTools')
          || target.closest('.controls-panel')
          || target.closest('#contextMenu')
          || target.closest('.modal-backdrop')
          || target.closest('.modal-card')) {
        return;
      }
      selectedNodes.clear(); selectedLinkId = null;
      toolDeleteNode.disabled = true; toolDeleteLink.disabled = true;
      document.getElementById('contextMenu').style.display = 'none';
      renderNodes(); renderLinks(); updateInspector();
    });

    // save binding
    saveBoardBtn && saveBoardBtn.addEventListener('click', saveModel);

    // initial load
    loadModel();

    // keyboard
    document.addEventListener('keydown', onKey);

    // expose small API for debugging
    window._wf = { model, renderNodes, saveModel, zoomToFit, autoResizeBoard };
  }

  document.addEventListener('DOMContentLoaded', ready);
})();
