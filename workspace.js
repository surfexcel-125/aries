/* workspace.js — anchors fixed, exact preview, double-click modals, editable paths
   - Anchor positions computed from DOM bounding boxes (robust with transforms)
   - Preview follows cursor exactly and snaps to nearest anchor
   - Double-click node => edit modal; double-click link => edit modal
   - Link control point (cp) remains draggable to tweak path
   - Defensive DOM guards
*/
(function(){
  function ready() {
    const projectId = window.currentProjectId;
    if (!projectId) console.warn('No projectId found; workspace will work locally.');

    const $ = id => document.getElementById(id) || null;

    // ensure canvas/board/svg exist (create minimal if necessary)
    const canvas = $('canvas') || document.querySelector('.canvas') || (function createCanvas(){
      const c = document.createElement('div'); c.id = 'canvas';
      c.style.position = 'absolute'; c.style.left='0'; c.style.top='80px'; c.style.right='0'; c.style.bottom='0';
      c.style.overflow='hidden'; document.body.appendChild(c); return c;
    })();

    const board = $('board') || (function createBoard(){
      const b = document.createElement('div'); b.id='board';
      b.style.position='absolute'; b.style.left='0'; b.style.top='0';
      b.style.width='2000px'; b.style.height='1500px'; b.style.transformOrigin='0 0';
      canvas.appendChild(b); return b;
    })();

    let svg = $('svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('id','svg'); svg.style.position='absolute'; svg.style.left='0'; svg.style.top='0';
      svg.style.width='100%'; svg.style.height='100%'; svg.style.pointerEvents='none';
      board.appendChild(svg);
    }

    const headerTitle = $('headerTitle');
    const toolAddPage = $('toolAddPage');
    const toolAddAction = $('toolAddAction');
    const toolAddDecision = $('toolAddDecision');
    const toolDeleteNode = $('toolDeleteNode');
    const toolDeleteLink = $('toolDeleteLink');
    const saveBoardBtn = $('saveBoard');

    const showGrid = $('showGrid');
    const gridSizeInput = $('gridSize');
    const zoomIndicator = $('zoomIndicator');
    const zoomInCorner = $('zoomInCorner');
    const zoomOutCorner = $('zoomOutCorner');
    const centerBtn = $('centerBtn');
    const zoomFitBtn = $('zoomFitBtn');

    const inspector = $('inspector'); // inspector remains available
    const selectedCount = $('selectedCount');
    const inspectorSingle = $('inspectorSingle');
    const inspectorMulti = $('inspectorMulti');
    const inspectorId = $('inspectorId');
    const inspectorType = $('inspectorType');
    const inspectorTitle = $('inspectorTitle');
    const inspectorBody = $('inspectorBody');
    const inspectorW = $('inspectorW');
    const inspectorH = $('inspectorH');
    const inspectorSave = $('inspectorSave');
    const inspectorDelete = $('inspectorDelete');
    const statusMeta = $('statusMeta');

    const exportBtn = $('exportBtn');
    const importFile = $('importFile');
    const exportJsonBtn = $('exportJson');
    const importJsonBtn = $('importJsonBtn');
    const autosizeBtn = $('autosizeBtn');
    const clearAllBtn = $('clearAllBtn');

    // app state
    let model = { nodes: [], links: [] };
    let transform = { x: 0, y: 0, scale: 1 };
    let selectedNodes = new Set();
    let selectedLinkId = null;
    let dragInfo = null;             // node drag or pan
    let linkDraw = null;             // preview while drawing {sourceId, sourceAnchorIdx, startX, startY, currentX, currentY}
    let highestZ = 15;
    let dirty = false;
    const DEBOUNCE = 800;
    let autoSaveTimer = null;
    let handleDrag = null; // for cp handle dragging {linkId, startClientX,...}

    // utilities
    const uid = (p='n') => p + Math.random().toString(36).slice(2,9);
    const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
    const gridSize = () => { try { const val = gridSizeInput && gridSizeInput.value; const n = parseInt(val,10); return isNaN(n) ? 25 : n; } catch(e){ return 25; } };

    function screenToBoard(sx, sy) {
      const rect = board.getBoundingClientRect();
      return { x: (sx - rect.left) / transform.scale, y: (sy - rect.top) / transform.scale };
    }
    function boardToScreen(bx, by) {
      const rect = board.getBoundingClientRect();
      return { x: rect.left + bx * transform.scale, y: rect.top + by * transform.scale };
    }

    function isTyping() {
      try {
        const ae = document.activeElement; if (!ae) return false;
        const tag = (ae.tagName||'').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (ae.isContentEditable) return true;
        if (ae.closest && ae.closest('#inspector')) return true;
        return false;
      } catch(e){ return false; }
    }

    function escapeHtml(str) { if (str == null) return ''; return String(str).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

    // ----- IMPORTANT: anchor computation using DOM bounding rects -----
    // returns array of 8 anchors (board coordinates) for the node
    function computeAnchorsForNode(node) {
      const el = document.getElementById(`node-${node.id}`);
      const boardRect = board.getBoundingClientRect();
      if (el) {
        const r = el.getBoundingClientRect();
        // convert screen pixels (r) to board coords (unscaled)
        const left = (r.left - boardRect.left) / transform.scale;
        const top  = (r.top  - boardRect.top) / transform.scale;
        const w = r.width / transform.scale;
        const h = r.height / transform.scale;
        return [
          { x: left,      y: top },           // top-left
          { x: left + w/2, y: top },          // top-mid
          { x: left + w,   y: top },          // top-right
          { x: left + w,   y: top + h/2 },    // right-mid
          { x: left + w,   y: top + h },      // bottom-right
          { x: left + w/2, y: top + h },      // bottom-mid
          { x: left,      y: top + h },       // bottom-left
          { x: left,      y: top + h/2 }      // left-mid
        ];
      } else {
        // fallback to model x/y/w/h (board coords)
        const w = node.w || 220;
        const h = node.h || 100;
        const x = node.x;
        const y = node.y;
        return [
          { x: x,         y: y },
          { x: x + w/2,   y: y },
          { x: x + w,     y: y },
          { x: x + w,     y: y + h/2 },
          { x: x + w,     y: y + h },
          { x: x + w/2,   y: y + h },
          { x: x,         y: y + h },
          { x: x,         y: y + h/2 }
        ];
      }
    }

    function nearestAnchorIndex(node, boardPoint) {
      const anchors = computeAnchorsForNode(node);
      let best = 0, bestD = Infinity;
      anchors.forEach((a,i)=>{ const dx = a.x - boardPoint.x; const dy = a.y - boardPoint.y; const d = dx*dx+dy*dy; if (d < bestD) { bestD = d; best = i; } });
      return best;
    }

    // UI render helpers
    function clearNodes(){ document.querySelectorAll('.node').forEach(n=>n.remove()); }

    function renderNodes() {
      clearNodes();
      model.nodes.forEach(node=>{
        const el = document.createElement('div');
        el.className = `node node-type-${node.type} ${selectedNodes.has(node.id)?'selected':''}`;
        el.id = `node-${node.id}`;
        el.style.position = 'absolute';
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.zIndex = node.zIndex || 15;
        el.style.background = '#fff';
        el.style.borderRadius = '10px';
        el.style.boxShadow = '0 8px 20px rgba(12,18,30,0.06)';
        el.style.padding = '14px';
        el.style.width = (node.w || 220) + 'px';
        el.style.height = (node.h || 100) + 'px';
        el.innerHTML = `<div class="node-title" style="font-weight:700;margin-bottom:8px;">${escapeHtml(node.title)}</div><div class="node-body" style="color:#3b4b54;">${escapeHtml(node.body)}</div>`;

        // anchors container for visible dots
        const anchorsContainer = document.createElement('div');
        anchorsContainer.className = 'anchors';
        anchorsContainer.style.position = 'absolute';
        anchorsContainer.style.left = '0';
        anchorsContainer.style.top = '0';
        anchorsContainer.style.width = '100%';
        anchorsContainer.style.height = '100%';
        anchorsContainer.style.pointerEvents = 'none';
        el.appendChild(anchorsContainer);

        // compute local anchor positions for dot placement (unscaled)
        const w = node.w || 220, h = node.h || 100;
        const dots = [
          { left: 0,        top: 0 },        // top-left
          { left: w/2-6,    top: 0 },        // top-mid
          { left: w-12,     top: 0 },        // top-right
          { left: w-12,     top: h/2-6 },    // right-mid
          { left: w-12,     top: h-12 },     // bottom-right
          { left: w/2-6,    top: h-12 },     // bottom-mid
          { left: 0,        top: h-12 },     // bottom-left
          { left: 0,        top: h/2-6 }     // left-mid
        ];

        dots.forEach((d, idx)=>{
          const dot = document.createElement('div');
          dot.className = 'anchor-dot';
          dot.dataset.nodeId = node.id;
          dot.dataset.anchorIndex = String(idx);
          dot.style.position = 'absolute';
          dot.style.left = `${d.left}px`;
          dot.style.top = `${d.top}px`;
          dot.style.width = '12px';
          dot.style.height = '12px';
          dot.style.borderRadius = '50%';
          dot.style.background = 'rgba(255,255,255,0.95)';
          dot.style.border = '2px solid rgba(0,0,0,0.12)';
          dot.style.boxSizing = 'border-box';
          dot.style.pointerEvents = 'auto';
          dot.style.cursor = 'crosshair';
          dot.title = 'Anchor';
          dot.addEventListener('mouseenter', ()=> dot.style.borderColor = 'var(--accent-hover, #2e86ff)');
          dot.addEventListener('mouseleave', ()=> dot.style.borderColor = 'rgba(0,0,0,0.12)');
          dot.addEventListener('mousedown', ev=>{
            ev.stopPropagation();
            // start link draw using accurate board coords from computeAnchorsForNode
            const boardAnchors = computeAnchorsForNode(node);
            const anchor = boardAnchors[idx];
            linkDraw = { sourceId: node.id, sourceAnchorIdx: idx, startX: anchor.x, startY: anchor.y, currentX: anchor.x, currentY: anchor.y };
            if (canvas) canvas.style.cursor = 'crosshair';
            if (svg) svg.style.pointerEvents = 'auto';
            renderLinks();
          });
          anchorsContainer.appendChild(dot);
        });

        // node events
        el.addEventListener('mousedown', e => handleNodeDown(e, node.id));
        el.addEventListener('dblclick', e => { e.stopPropagation(); openNodeModal(node); });
        el.addEventListener('contextmenu', e => nodeContext(e, node.id));
        board.appendChild(el);
      });
      renderLinks();
      updateInspector();
    }

    // ------- routing helpers ----------
    function polyToPath(points, cornerRadius) {
      if (!points || points.length < 2) return '';
      const r = Math.max(0, cornerRadius || 0);
      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i-1], cur = points[i], next = points[i+1];
        if (next && r > 0) {
          const vx = cur.x - prev.x, vy = cur.y - prev.y, nx = next.x - cur.x, ny = next.y - cur.y;
          const inLen = Math.sqrt(vx*vx + vy*vy) || 1, outLen = Math.sqrt(nx*nx + ny*ny) || 1;
          const rad = Math.min(r, inLen/2, outLen/2);
          const ux = vx / inLen, uy = vy / inLen, ox = nx / outLen, oy = ny / outLen;
          const csx = cur.x - ux * rad, csy = cur.y - uy * rad;
          const cex = cur.x + ox * rad, cey = cur.y + oy * rad;
          d += ` L ${csx} ${csy}`;
          d += ` Q ${cur.x} ${cur.y}, ${cex} ${cey}`;
        } else {
          d += ` L ${cur.x} ${cur.y}`;
        }
      }
      return d;
    }

    function orthogonalPath(start, end, offsetX=0, offsetY=0, cornerRadius=8) {
      const s = { x: start.x + offsetX, y: start.y + offsetY };
      const e = { x: end.x + offsetX, y: end.y + offsetY };
      const dx = Math.abs(e.x - s.x), dy = Math.abs(e.y - s.y);
      if (dx > dy) {
        const midX = s.x + (e.x - s.x)/2;
        const p1 = { x: midX, y: s.y }, p2 = { x: midX, y: e.y };
        return polyToPath([s,p1,p2,e], cornerRadius);
      } else {
        const midY = s.y + (e.y - s.y)/2;
        const p1 = { x: s.x, y: midY }, p2 = { x: e.x, y: midY };
        return polyToPath([s,p1,p2,e], cornerRadius);
      }
    }

    // render links and handles
    function renderLinks() {
      if (!svg) return;
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      // preview while drawing
      if (linkDraw) {
        const a = { x: linkDraw.startX, y: linkDraw.startY };
        const b = { x: linkDraw.currentX, y: linkDraw.currentY };
        const p = document.createElementNS('http://www.w3.org/2000/svg','path');
        p.setAttribute('d', orthogonalPath(a,b,0,0,6));
        p.setAttribute('stroke', getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#2e86ff');
        p.setAttribute('stroke-width', 3); p.setAttribute('fill','none'); p.setAttribute('stroke-dasharray','6,6');
        p.setAttribute('stroke-linecap','round'); svg.appendChild(p);
      }

      // group parallels
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

      model.links.forEach(link=>{
        const sNode = model.nodes.find(n=>n.id === link.source);
        const tNode = model.nodes.find(n=>n.id === link.target);
        if (!sNode || !tNode) return;

        const sAnchors = computeAnchorsForNode(sNode);
        const tAnchors = computeAnchorsForNode(tNode);

        const sIndex = (typeof link.sourceAnchorIdx === 'number') ? link.sourceAnchorIdx : nearestAnchorIndex(sNode, { x: (sNode.x + tNode.x)/2, y: (sNode.y + tNode.y)/2 });
        const tIndex = (typeof link.targetAnchorIdx === 'number') ? link.targetAnchorIdx : nearestAnchorIndex(tNode, { x: (sNode.x + tNode.x)/2, y: (sNode.y + tNode.y)/2 });

        const p1 = sAnchors[sIndex];
        const p2 = tAnchors[tIndex];

        if (!link.cp || typeof link.cp.x !== 'number' || typeof link.cp.y !== 'number') {
          link.cp = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };
        }

        // parallel offset base
        const dx = p2.x - p1.x, dy = p2.y - p1.y; const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const baseGap = 14;
        const idx = (link._parallelIndex !== undefined) ? link._parallelIndex : 0;
        const count = (link._parallelCount !== undefined) ? link._parallelCount : 1;
        const middle = (count - 1) / 2;
        const offset = (idx - middle) * baseGap;
        const offsetX = nx * offset, offsetY = ny * offset;

        const midBase = { x: (p1.x + p2.x)/2 + offsetX, y: (p1.y + p2.y)/2 + offsetY };
        const extraX = link.cp.x - midBase.x;
        const extraY = link.cp.y - midBase.y;

        const d = orthogonalPath(p1, p2, offsetX + extraX, offsetY + extraY, 8);

        // path
        const path = document.createElementNS('http://www.w3.org/2000/svg','path');
        const isSel = selectedLinkId === link.id;
        const strokeColor = isSel ? (getComputedStyle(document.documentElement).getPropertyValue('--link-selected') || '#1b74ff') : (getComputedStyle(document.documentElement).getPropertyValue('--link-color') || '#334155');
        path.setAttribute('d', d); path.setAttribute('stroke', strokeColor); path.setAttribute('stroke-width', 3);
        path.setAttribute('fill', 'none'); path.setAttribute('stroke-linecap','round'); path.setAttribute('stroke-linejoin','round');
        path.classList.add('link-path'); path.id = `link-${link.id}`; path.style.cursor = 'pointer'; path.style.pointerEvents = 'auto';

        path.addEventListener('click', e => {
          e.stopPropagation(); selectedLinkId = link.id; selectedNodes.clear();
          if (toolDeleteLink) toolDeleteLink.disabled = false; if (toolDeleteNode) toolDeleteNode.disabled = true;
          renderNodes(); renderLinks();
        });

        // double-click opens modal to edit label/delete
        path.addEventListener('dblclick', e => {
          e.stopPropagation(); openLinkModal(link);
        });

        svg.appendChild(path);

        // label draws at cp (above)
        if (link.label) {
          const text = document.createElementNS('http://www.w3.org/2000/svg','text');
          text.setAttribute('x', link.cp.x); text.setAttribute('y', link.cp.y - 12);
          text.setAttribute('class', 'link-label'); text.setAttribute('text-anchor','middle'); text.textContent = link.label;
          svg.appendChild(text);
        }

        // draggable handle at cp; appearable and pointer events active
        const handle = document.createElementNS('http://www.w3.org/2000/svg','circle');
        handle.setAttribute('cx', link.cp.x); handle.setAttribute('cy', link.cp.y); handle.setAttribute('r', 6);
        handle.setAttribute('data-link-id', link.id);
        handle.style.fill = isSel ? (getComputedStyle(document.documentElement).getPropertyValue('--link-selected') || '#1b74ff') : '#fff';
        handle.style.stroke = isSel ? (getComputedStyle(document.documentElement).getPropertyValue('--link-selected') || '#1b74ff') : '#333';
        handle.style.strokeWidth = 1.5; handle.style.cursor = 'move'; handle.style.pointerEvents = 'auto';
        svg.appendChild(handle);

        // start dragging cp
        handle.addEventListener('mousedown', ev => {
          ev.stopPropagation(); ev.preventDefault();
          handleDrag = { linkId: link.id, startClientX: ev.clientX, startClientY: ev.clientY, startCpX: link.cp.x, startCpY: link.cp.y };
        });
      });
    }

    // apply transform & grid
    function applyTransform() {
      if (board) board.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
      if (zoomIndicator) zoomIndicator.textContent = `${Math.round(transform.scale*100)}%`;
      updateGrid();
      renderLinks();
      requestAnimationFrame(()=> repaintUI());
    }
    function updateGrid() {
      if (!canvas) return;
      if (!showGrid || !showGrid.checked) { canvas.style.backgroundImage = 'none'; return; }
      const size = gridSize(); const scaled = size * transform.scale;
      const bg = `linear-gradient(to right, var(--grid-color) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)`;
      const ox = transform.x % scaled; const oy = transform.y % scaled;
      canvas.style.backgroundImage = bg; canvas.style.backgroundSize = `${scaled}px ${scaled}px`; canvas.style.backgroundPosition = `${ox}px ${oy}px`;
    }
    function repaintUI() {
      try {
        const uiEls = document.querySelectorAll('.topbar, .header-actions, #floatingTools, .controls-panel, .header-title');
        uiEls.forEach(el => { el.style.transform = el.style.transform || 'translateZ(0)'; el.style.willChange = 'transform'; });
        setTimeout(()=> uiEls.forEach(el => el.style.willChange = ''), 260);
      } catch(e){}
    }

    // model ops
    function addNodeAt(x,y,type,opts={}) {
      const s = gridSize(); const nx = Math.round(x / s) * s; const ny = Math.round(y / s) * s;
      highestZ++;
      const base = { id: uid('n'), x:nx, y:ny, w:220, h:100, type, zIndex: highestZ, title:'New', body:'' };
      if (type === 'page') { base.title='New Page'; base.body='Website Page'; }
      else if (type === 'action') { base.title='Action'; base.body='User event'; }
      else if (type === 'decision') { base.title='Decision'; base.body='Condition'; base.w=150; base.h=150; }
      Object.assign(base, opts); model.nodes.push(base); markDirty(); renderNodes(); return base;
    }

    function markDirty() { dirty = true; if (statusMeta) statusMeta.textContent = 'Unsaved changes'; clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(saveModel, DEBOUNCE); if (saveBoardBtn) saveBoardBtn.textContent = 'Saving...'; }

    async function saveModel() {
      if (!dirty) return;
      if (!window.AriesDB || !window.AriesDB.saveProjectWorkspace) {
        console.warn('No AriesDB.saveProjectWorkspace found'); dirty = false; if (statusMeta) statusMeta.textContent = 'Local only'; if (saveBoardBtn) saveBoardBtn.textContent = 'Save Board'; return;
      }
      try {
        await window.AriesDB.saveProjectWorkspace(projectId, model.nodes, model.links);
        dirty = false; if (statusMeta) statusMeta.textContent = 'Saved';
        if (saveBoardBtn) { saveBoardBtn.textContent = 'Saved!'; setTimeout(()=> saveBoardBtn.textContent = 'Save Board', 1200); }
      } catch(err) { console.error('Save failed', err); if (statusMeta) statusMeta.textContent = 'Save failed'; if (saveBoardBtn) { saveBoardBtn.textContent = 'Save Failed'; setTimeout(()=> saveBoardBtn.textContent = 'Save Board', 1400); } }
    }

    async function loadModel() {
      if (!window.AriesDB || !window.AriesDB.loadProjectData) { seedModel(); renderNodes(); return; }
      try {
        const d = await window.AriesDB.loadProjectData(projectId);
        if (d) {
          if (headerTitle && d.name) headerTitle.textContent = d.name;
          model.nodes = (d.nodes || []).map(n=>({ ...n }));
          model.links = (d.links || []).map(l=>({ ...l }));
          highestZ = model.nodes.reduce((m,n)=> Math.max(m,n.zIndex||15), 15);
        } else seedModel();
      } catch(err) { console.error('Load failed', err); seedModel(); }
      applyTransform(); renderNodes();
    }

    function seedModel() { if (model.nodes.length === 0) { addNodeAt(200,200,'page',{title:'Home'}); addNodeAt(520,200,'action',{title:'Login'}); addNodeAt(860,200,'decision',{title:'Auth?'}); } }

    // inspector selection
    function setSelectedNodesFromClick(nodeId, ev) {
      if (ev && ev.shiftKey) { if (selectedNodes.has(nodeId)) selectedNodes.delete(nodeId); else selectedNodes.add(nodeId); }
      else { selectedNodes.clear(); selectedNodes.add(nodeId); }
      selectedLinkId = null; if (toolDeleteNode) toolDeleteNode.disabled = false; if (toolDeleteLink) toolDeleteLink.disabled = true;
      renderNodes(); renderLinks(); updateInspector();
    }

    function updateInspector() {
      if (selectedCount) selectedCount.textContent = selectedNodes.size;
      if (!inspector) return;
      if (selectedNodes.size === 0) { if (inspectorSingle) inspectorSingle.style.display='none'; if (inspectorMulti) inspectorMulti.style.display='none'; }
      else if (selectedNodes.size === 1) {
        if (inspectorMulti) inspectorMulti.style.display='none';
        if (inspectorSingle) inspectorSingle.style.display='block';
        const id = Array.from(selectedNodes)[0]; const node = model.nodes.find(n=>n.id===id);
        if (node && inspectorId && inspectorType && inspectorTitle && inspectorBody && inspectorW && inspectorH) {
          inspectorId.textContent = node.id; inspectorType.value = node.type; inspectorTitle.value = node.title; inspectorBody.value = node.body;
          inspectorW.value = parseInt(node.w||220); inspectorH.value = parseInt(node.h||100);
        }
      } else { if (inspectorSingle) inspectorSingle.style.display='none'; if (inspectorMulti) inspectorMulti.style.display='block'; }
    }

    function applyInspectorToNode() {
      if (selectedNodes.size !== 1) return;
      const id = Array.from(selectedNodes)[0]; const node = model.nodes.find(n=>n.id===id); if (!node) return;
      if (inspectorType) node.type = inspectorType.value; if (inspectorTitle) node.title = inspectorTitle.value; if (inspectorBody) node.body = inspectorBody.value;
      if (inspectorW) node.w = parseInt(inspectorW.value) || node.w; if (inspectorH) node.h = parseInt(inspectorH.value) || node.h;
      markDirty(); renderNodes();
    }
    if (inspectorSave) inspectorSave.addEventListener('click', applyInspectorToNode);
    if (inspectorDelete) inspectorDelete.addEventListener('click', ()=> { if (selectedNodes.size === 1) deleteSelectedNode(Array.from(selectedNodes)[0]); });

    const elAlignLeft = $('alignLeft'); if (elAlignLeft) elAlignLeft.addEventListener('click', ()=> { if (selectedNodes.size<2) return; const arr = Array.from(selectedNodes).map(id=>model.nodes.find(n=>n.id===id)); const left = Math.min(...arr.map(n=>n.x)); arr.forEach(n=> n.x = left); markDirty(); renderNodes(); });
    const elAlignTop = $('alignTop'); if (elAlignTop) elAlignTop.addEventListener('click', ()=> { if (selectedNodes.size<2) return; const arr = Array.from(selectedNodes).map(id=>model.nodes.find(n=>n.id===id)); const top = Math.min(...arr.map(n=>n.y)); arr.forEach(n=> n.y = top); markDirty(); renderNodes(); });

    // finalize link create (snap-to-anchor)
    function finalizeLinkIfPossible(evt) {
      if (!linkDraw) { if (canvas) canvas.style.cursor='default'; if (svg) svg.style.pointerEvents='none'; renderLinks(); return; }
      const clientX = (evt && evt.clientX) || (window._lastMouse && window._lastMouse.clientX) || 0;
      const clientY = (evt && evt.clientY) || (window._lastMouse && window._lastMouse.clientY) || 0;
      const boardPt = screenToBoard(clientX, clientY);

      const elAt = document.elementFromPoint(clientX, clientY);
      const targetNodeEl = elAt ? elAt.closest('.node') : null;
      if (targetNodeEl) {
        const targetId = targetNodeEl.id.replace('node-','');
        if (targetId && targetId !== linkDraw.sourceId) {
          const targetNode = model.nodes.find(n=>n.id === targetId);
          if (targetNode) {
            const targetIdx = nearestAnchorIndex(targetNode, boardPt);
            const sNode = model.nodes.find(n=>n.id === linkDraw.sourceId);
            const sAnch = computeAnchorsForNode(sNode)[linkDraw.sourceAnchorIdx];
            const tAnch = computeAnchorsForNode(targetNode)[targetIdx];
            const cp = { x: (sAnch.x + tAnch.x)/2, y: (sAnch.y + tAnch.y)/2 };
            const newLink = { id: uid('l'), source: linkDraw.sourceId, target: targetId, sourceAnchorIdx: linkDraw.sourceAnchorIdx, targetAnchorIdx: targetIdx, cp: cp, label: '' };
            model.links.push(newLink);
            markDirty(); renderLinks();
          }
        }
      }

      linkDraw = null; if (canvas) canvas.style.cursor = 'default'; if (svg) svg.style.pointerEvents = 'none'; renderLinks();
    }

    // node drag / pan
    function handleNodeDown(e,nodeId) {
      if (e.button !== 0) return;
      e.stopPropagation();
      const cm = $('contextMenu'); if (cm) cm.style.display = 'none';
      if (!selectedNodes.has(nodeId)) setSelectedNodesFromClick(nodeId, e);
      selectedLinkId = null;
      const startPositions = {};
      Array.from(selectedNodes).forEach(id => { const n = model.nodes.find(x=>x.id===id); if (n) startPositions[id] = { x: n.x, y: n.y }; });
      const node = model.nodes.find(n=>n.id===nodeId);
      if (node) { highestZ++; node.zIndex = highestZ; const el = document.getElementById(`node-${nodeId}`); if (el) el.style.zIndex = highestZ; }
      dragInfo = { mode:'node', startX: e.clientX, startY: e.clientY, nodeId, startPositions };
      renderNodes();
    }

    function onCanvasDown(e) {
      if (!e || !e.target) return;
      if (e.target.closest && e.target.closest('.node')) return;
      const cm = $('contextMenu'); if (cm && e.target.closest && e.target.closest('#contextMenu')) return;
      selectedNodes.clear(); selectedLinkId = null;
      if (toolDeleteNode) toolDeleteNode.disabled = true; if (toolDeleteLink) toolDeleteLink.disabled = true;
      renderNodes(); renderLinks(); updateInspector();
      dragInfo = { mode:'pan', startX: e.clientX, startY: e.clientY, startTransformX: transform.x, startTransformY: transform.y };
      if (canvas) canvas.style.cursor = 'grabbing';
    }

    window._lastMouse = { clientX:0, clientY:0 };

    function onMove(e) {
      try {
        window._lastMouse.clientX = e.clientX; window._lastMouse.clientY = e.clientY;

        // cp handle drag (global)
        if (handleDrag) {
          const dx = (e.clientX - handleDrag.startClientX) / transform.scale;
          const dy = (e.clientY - handleDrag.startClientY) / transform.scale;
          const link = model.links.find(l => l.id === handleDrag.linkId);
          if (link) {
            link.cp.x = handleDrag.startCpX + dx;
            link.cp.y = handleDrag.startCpY + dy;
            renderLinks();
          }
          return;
        }

        if (!dragInfo && !linkDraw) return;

        if (dragInfo && dragInfo.mode === 'pan') {
          const dx = e.clientX - dragInfo.startX, dy = e.clientY - dragInfo.startY;
          transform.x = dragInfo.startTransformX + dx; transform.y = dragInfo.startTransformY + dy; applyTransform();
        } else if (dragInfo && dragInfo.mode === 'node') {
          const deltaX = (e.clientX - dragInfo.startX) / transform.scale;
          const deltaY = (e.clientY - dragInfo.startY) / transform.scale;
          for (let id of Object.keys(dragInfo.startPositions)) {
            const n = model.nodes.find(x=>x.id===id); if (!n) continue;
            n.x = dragInfo.startPositions[id].x + deltaX; n.y = dragInfo.startPositions[id].y + deltaY;
            const el = document.getElementById(`node-${n.id}`); if (el) { el.style.left = `${n.x}px`; el.style.top = `${n.y}px`; }
          }
          renderLinks();
        } else if (linkDraw) {
          const b = screenToBoard(e.clientX, e.clientY);
          linkDraw.currentX = b.x; linkDraw.currentY = b.y;
          renderLinks();
        }
      } catch(err) { console.error('onMove error', err); }
    }

    function onUp(e) {
      try {
        if (handleDrag) { handleDrag = null; markDirty(); renderLinks(); return; }
        if (linkDraw) finalizeLinkIfPossible(e);
        if (dragInfo) {
          if (dragInfo.mode === 'node') {
            const s = gridSize(); for (let id of Object.keys(dragInfo.startPositions)) { const n = model.nodes.find(x=>x.id===id); if (!n) continue; n.x = Math.round(n.x / s) * s; n.y = Math.round(n.y / s) * s; }
            markDirty(); renderNodes();
          }
          dragInfo = null;
          if (canvas) canvas.style.cursor = 'default';
        }
      } catch(err) { console.error('onUp error', err); }
    }

    // context menu
    function nodeContext(e, nodeId) {
      e.preventDefault();
      setSelectedNodesFromClick(nodeId, e);
      const cm = $('contextMenu'); if (!cm) return;
      cm.style.left = `${e.clientX}px`; cm.style.top = `${e.clientY}px`; cm.style.display = 'block';
      const ce = $('contextEdit'); if (ce) ce.onclick = ()=> { cm.style.display='none'; openNodeModal(model.nodes.find(n=>n.id===nodeId)); };
      const cd = $('contextDelete'); if (cd) cd.onclick = ()=> { cm.style.display='none'; deleteSelectedNode(nodeId); };
    }

    // deletion helpers
    function deleteSelectedNode(nodeId) {
      if (!nodeId) return;
      model.nodes = model.nodes.filter(n=>n.id !== nodeId);
      model.links = model.links.filter(l => l.source !== nodeId && l.target !== nodeId);
      selectedNodes.delete(nodeId);
      if (toolDeleteNode) toolDeleteNode.disabled = true;
      renderNodes(); markDirty();
    }
    function deleteSelectedLink() {
      if (!selectedLinkId) return;
      model.links = model.links.filter(l => l.id !== selectedLinkId);
      selectedLinkId = null;
      if (toolDeleteLink) toolDeleteLink.disabled = true;
      renderLinks(); markDirty();
    }

    // UI bindings
    if (toolAddPage) toolAddPage.addEventListener('click', ()=> addNodeAt(220,220,'page'));
    if (toolAddAction) toolAddAction.addEventListener('click', ()=> addNodeAt(420,220,'action'));
    if (toolAddDecision) toolAddDecision.addEventListener('click', ()=> addNodeAt(640,220,'decision'));
    if (toolDeleteNode) toolDeleteNode.addEventListener('click', ()=> { Array.from(selectedNodes).forEach(id=>deleteSelectedNode(id)); selectedNodes.clear(); renderNodes(); });
    if (toolDeleteLink) toolDeleteLink.addEventListener('click', deleteSelectedLink);

    if (canvas) canvas.addEventListener('mousedown', onCanvasDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    if (canvas) {
      canvas.addEventListener('touchstart', (ev)=> { const t = ev.touches[0]; onCanvasDown({ clientX: t.clientX, clientY: t.clientY, target: ev.target }); ev.preventDefault(); }, { passive:false});
      canvas.addEventListener('touchmove', (ev)=> { const t = ev.touches[0]; onMove({ clientX: t.clientX, clientY: t.clientY }); ev.preventDefault(); }, { passive:false});
      canvas.addEventListener('touchend', (ev)=> { onUp({ clientX:0, clientY:0 }); }, { passive:false});
    }

    const zoomFactor = 1.2;
    if (zoomInCorner) zoomInCorner.addEventListener('click', ()=> { transform.scale = clamp(transform.scale * zoomFactor, 0.25, 2); applyTransform(); });
    if (zoomOutCorner) zoomOutCorner.addEventListener('click', ()=> { transform.scale = clamp(transform.scale / zoomFactor, 0.25, 2); applyTransform(); });
    if (centerBtn) centerBtn.addEventListener('click', ()=> { transform = { x: 0, y: 0, scale: 1 }; applyTransform(); });
    if (zoomFitBtn) zoomFitBtn.addEventListener('click', zoomToFit);

    if (showGrid) showGrid.addEventListener('change', applyTransform);
    if (gridSizeInput) gridSizeInput.addEventListener('change', applyTransform);

    // import/export and autosize/clear
    document.addEventListener('workspace:importJson', (ev) => {
      const payload = ev && ev.detail; if (!payload) return;
      model.nodes = (payload.nodes || []).map(n=>({ ...n })); model.links = (payload.links || []).map(l=>({ ...l }));
      highestZ = model.nodes.reduce((m,n)=> Math.max(m,n.zIndex||15), 15);
      selectedNodes.clear(); selectedLinkId = null; markDirty(); applyTransform(); renderNodes();
    });

    if (exportBtn) exportBtn.addEventListener('click', ()=> downloadJSON());
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', ()=> downloadJSON());
    if (importJsonBtn) importJsonBtn.addEventListener('click', ()=> { const input = $('importFile'); if (input) input.click(); });

    if (autosizeBtn) autosizeBtn.addEventListener('click', autoResizeBoard);
    if (clearAllBtn) clearAllBtn.addEventListener('click', ()=> { if (confirm('Clear entire board?')) { model.nodes=[]; model.links=[]; selectedNodes.clear(); markDirty(); renderNodes(); }});

    function downloadJSON() {
      const payload = { nodes: model.nodes, links: model.links, exportedAt: new Date().toISOString(), projectId };
      const data = JSON.stringify(payload, null, 2); const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `workflow-${projectId||'board'}.json`; a.click(); URL.revokeObjectURL(url);
    }

    function autoResizeBoard() {
      if (!board) return;
      if (model.nodes.length === 0) { board.style.width='1200px'; board.style.height='900px'; return; }
      const pad = 140; const maxX = Math.max(...model.nodes.map(n => n.x + (n.w||220)));
      const maxY = Math.max(...model.nodes.map(n => n.y + (n.h||100)));
      const minX = Math.min(...model.nodes.map(n => n.x)); const minY = Math.min(...model.nodes.map(n => n.y));
      const w = Math.max(1200, (maxX - minX) + pad*2); const h = Math.max(800, (maxY - minY) + pad*2);
      board.style.width = `${Math.round(w)}px`; board.style.height = `${Math.round(h)}px`;
      const dx = pad - minX, dy = pad - minY; model.nodes.forEach(n => { n.x += dx; n.y += dy; });
      markDirty(); renderNodes(); applyTransform();
    }

    function zoomToFit() {
      if (!canvas || !board) { transform = { x:0, y:0, scale:1 }; applyTransform(); return; }
      if (model.nodes.length === 0) { transform = { x:0, y:0, scale:1 }; applyTransform(); return; }
      const minX = Math.min(...model.nodes.map(n=>n.x)); const minY = Math.min(...model.nodes.map(n=>n.y));
      const maxX = Math.max(...model.nodes.map(n=>n.x + (n.w||220))); const maxY = Math.max(...model.nodes.map(n=>n.y + (n.h||100)));
      const pad = 80; const bboxW = (maxX - minX) + pad*2; const bboxH = (maxY - minY) + pad*2;
      const viewW = canvas.clientWidth; const viewH = canvas.clientHeight; const scaleX = viewW / bboxW; const scaleY = viewH / bboxH;
      const scale = clamp(Math.min(scaleX, scaleY, 1.6), 0.2, 1.6); transform.scale = scale;
      const centerBoardX = (minX + maxX)/2; const centerBoardY = (minY + maxY)/2;
      transform.x = (viewW/2) - (centerBoardX * transform.scale); transform.y = (viewH/2) - (centerBoardY * transform.scale); applyTransform();
    }

    // prevent clicks in panels from clearing selection
    document.addEventListener('click', (e)=> {
      const t = e.target; if (!t) return;
      if (t.closest && (t.closest('.node') || t.closest('.link-path'))) return;
      if (t.closest && (t.closest('#inspector') || t.closest('.topbar') || t.closest('.header-actions') || t.closest('#floatingTools') || t.closest('.controls-panel') || t.closest('#contextMenu') || t.closest('.modal-backdrop') || t.closest('.modal-card'))) return;
      selectedNodes.clear(); selectedLinkId = null; if (toolDeleteNode) toolDeleteNode.disabled = true; if (toolDeleteLink) toolDeleteLink.disabled = true;
      const cm = $('contextMenu'); if (cm) cm.style.display = 'none'; renderNodes(); renderLinks(); updateInspector();
    });

    if (saveBoardBtn) saveBoardBtn.addEventListener('click', saveModel);

    // initial load
    loadModel();

    // keyboard
    document.addEventListener('keydown', e=>{
      if (isTyping()) return;
      if ((e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedNodes.size > 0) { Array.from(selectedNodes).forEach(id=>deleteSelectedNode(id)); selectedNodes.clear(); renderNodes(); }
        else if (selectedLinkId) deleteSelectedLink();
      } else if (e.key === 'Escape') { linkDraw = null; dragInfo = null; const cm = $('contextMenu'); if (cm) cm.style.display = 'none'; renderLinks(); }
    });

    // expose debug helpers
    window._wf = { model, renderNodes, renderLinks, saveModel, zoomToFit, autoResizeBoard, computeAnchorsForNode };

    // fallback toolbar
    if (!toolAddPage && !toolAddAction && !toolAddDecision) {
      const t = document.createElement('div'); t.id='floatingTools';
      t.style.position='fixed'; t.style.left='12px'; t.style.bottom='12px'; t.style.zIndex=9999;
      t.style.background='rgba(255,255,255,0.96)'; t.style.border='1px solid rgba(0,0,0,0.06)'; t.style.padding='8px'; t.style.borderRadius='10px';
      ['Page','Action','Decision'].forEach((label,i)=>{
        const b = document.createElement('button'); b.textContent=label; b.style.margin='4px';
        b.addEventListener('click', ()=> addNodeAt(120 + i*180, 120 + i*40, label.toLowerCase() === 'page' ? 'page' : (label.toLowerCase()==='action' ? 'action' : 'decision')));
        t.appendChild(b);
      });
      document.body.appendChild(t);
    }

    // -------------------
    // Modals for editing
    // -------------------
    function createModalContainer() {
      let mb = $('wf-modal-backdrop');
      if (mb) return mb;
      mb = document.createElement('div'); mb.id = 'wf-modal-backdrop';
      mb.style.position = 'fixed'; mb.style.left='0'; mb.style.top='0'; mb.style.right='0'; mb.style.bottom='0'; mb.style.zIndex=20000;
      mb.style.background = 'rgba(0,0,0,0.45)'; mb.style.display = 'flex'; mb.style.alignItems = 'center'; mb.style.justifyContent = 'center';
      document.body.appendChild(mb);
      return mb;
    }
    function closeModal() {
      const mb = $('wf-modal-backdrop'); if (mb) mb.remove();
    }

    // Node edit modal
    function openNodeModal(node) {
      if (!node) return;
      const mb = createModalContainer(); mb.innerHTML = '';
      const card = document.createElement('div'); card.className = 'modal-card';
      card.style.background = '#fff'; card.style.padding='18px'; card.style.borderRadius='10px'; card.style.minWidth='380px'; card.style.boxShadow='0 12px 40px rgba(0,0,0,0.3)';
      mb.appendChild(card);

      const h = document.createElement('h3'); h.textContent = 'Edit Node'; h.style.marginTop='0'; card.appendChild(h);

      const fTitle = document.createElement('input'); fTitle.type='text'; fTitle.value = node.title || ''; fTitle.style.width='100%'; fTitle.style.marginBottom='8px'; card.appendChild(fTitle);
      const fBody = document.createElement('textarea'); fBody.value = node.body || ''; fBody.style.width='100%'; fBody.style.height='84px'; fBody.style.marginBottom='8px'; card.appendChild(fBody);

      const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.style.marginBottom='12px';
      const fW = document.createElement('input'); fW.type='number'; fW.value = node.w || 220; fW.style.flex='1'; row.appendChild(fW);
      const fH = document.createElement('input'); fH.type='number'; fH.value = node.h || 100; fH.style.flex='1'; row.appendChild(fH);
      card.appendChild(row);

      const actions = document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px';
      const btnDelete = document.createElement('button'); btnDelete.textContent='Delete'; btnDelete.style.background='#fff'; btnDelete.style.border='1px solid #f44336'; btnDelete.style.color='#f44336';
      const btnCancel = document.createElement('button'); btnCancel.textContent='Cancel';
      const btnSave = document.createElement('button'); btnSave.textContent='Save'; btnSave.style.background = '#1e88e5'; btnSave.style.color = '#fff'; btnSave.style.border='none';
      actions.appendChild(btnDelete); actions.appendChild(btnCancel); actions.appendChild(btnSave);
      card.appendChild(actions);

      btnCancel.addEventListener('click', ()=> closeModal());
      btnDelete.addEventListener('click', ()=> {
        if (confirm('Delete this node?')) {
          deleteSelectedNode(node.id); closeModal();
        }
      });
      btnSave.addEventListener('click', ()=> {
        node.title = fTitle.value; node.body = fBody.value;
        node.w = parseInt(fW.value,10) || node.w; node.h = parseInt(fH.value,10) || node.h;
        markDirty(); renderNodes(); closeModal();
      });
      // allow clicking backdrop to close
      mb.addEventListener('click', (ev)=> { if (ev.target === mb) closeModal(); });
    }

    // Link edit modal (label / delete)
    function openLinkModal(link) {
      if (!link) return;
      const mb = createModalContainer(); mb.innerHTML = '';
      const card = document.createElement('div'); card.className = 'modal-card';
      card.style.background = '#fff'; card.style.padding='18px'; card.style.borderRadius='10px'; card.style.minWidth='320px'; card.style.boxShadow='0 12px 40px rgba(0,0,0,0.3)';
      mb.appendChild(card);

      const h = document.createElement('h3'); h.textContent = 'Edit Connection'; h.style.marginTop='0'; card.appendChild(h);

      const fLabel = document.createElement('input'); fLabel.type='text'; fLabel.value = link.label || ''; fLabel.style.width='100%'; fLabel.style.marginBottom='12px'; card.appendChild(fLabel);

      const btns = document.createElement('div'); btns.style.display='flex'; btns.style.justifyContent='flex-end'; btns.style.gap='8px';
      const btnDelete = document.createElement('button'); btnDelete.textContent='Delete'; btnDelete.style.background='#fff'; btnDelete.style.border='1px solid #f44336'; btnDelete.style.color='#f44336';
      const btnCancel = document.createElement('button'); btnCancel.textContent='Cancel';
      const btnSave = document.createElement('button'); btnSave.textContent='Save'; btnSave.style.background = '#1e88e5'; btnSave.style.color = '#fff'; btnSave.style.border='none';
      btns.appendChild(btnDelete); btns.appendChild(btnCancel); btns.appendChild(btnSave);
      card.appendChild(btns);

      btnCancel.addEventListener('click', ()=> closeModal());
      btnDelete.addEventListener('click', ()=> {
        if (confirm('Remove this connection?')) {
          model.links = model.links.filter(l => l.id !== link.id); markDirty(); renderLinks(); closeModal();
        }
      });
      btnSave.addEventListener('click', ()=> {
        link.label = fLabel.value.trim(); markDirty(); renderLinks(); closeModal();
      });

      mb.addEventListener('click', (ev) => { if (ev.target === mb) closeModal(); });
    }

  } // ready

  document.addEventListener('DOMContentLoaded', ready);
})();
