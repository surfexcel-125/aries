/* workspace.js — FULL REPLACEMENT (corrected)
   - Fixes included:
     * enable anchors during link-draw so elementFromPoint finds targets
     * merged dblclick handlers on link paths (Alt+dblclick = add bend, dblclick = open modal)
     * pointer capture/release cleanup and safety removal of wf-link-drawing class
     * other robustness improvements
*/

(function () {
  // ---------- Utilities ----------
  const $ = id => document.getElementById(id) || null;
  const uid = (p = 'id') => p + Math.random().toString(36).slice(2, 9);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const deepClone = (o) => JSON.parse(JSON.stringify(o));
  const now = () => new Date().toISOString();

  // ---------- Config ----------
  const CONFIG = {
    anchorDotSize: 12,
    anchorDotStroke: 'rgba(0,0,0,0.12)',
    anchorDotHover: 'var(--accent-hover,#2e86ff)',
    linkStroke: '#3b4b54',
    linkSelected: 'var(--link-selected,#1b74ff)',
    previewStroke: 'var(--accent,#2e86ff)',
    handleRadius: 6,
    parallelGap: 14,
    maxUndo: 350,
    junctionSize: 14,
    versionKeyPrefix: 'wf_versions_', // localStorage prefix
  };

  // ---------- DOM refs (create minimal fallbacks) ----------
  let canvas = $('canvas');
  if (!canvas) {
    canvas = document.createElement('div');
    canvas.id = 'canvas';
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '72px';
    canvas.style.right = '0';
    canvas.style.bottom = '0';
    canvas.style.overflow = 'hidden';
    document.body.appendChild(canvas);
  }

  let board = $('board');
  if (!board) {
    board = document.createElement('div');
    board.id = 'board';
    board.style.position = 'absolute';
    board.style.left = '0';
    board.style.top = '0';
    board.style.width = '2000px';
    board.style.height = '1500px';
    board.style.transformOrigin = '0 0';
    canvas.appendChild(board);
  }

  let svg = $('svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'svg';
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    board.appendChild(svg);
  } else {
    svg.style.pointerEvents = 'none';
  }

  // UI elements (may be present in HTML)
  const headerTitle = $('headerTitle');
  const toolAddPage = $('toolAddPage');
  const toolAddAction = $('toolAddAction');
  const toolAddDecision = $('toolAddDecision');
  const toolTogglePlace = $('toolTogglePlace') || $('wf-place-mode');
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
  const exportJsonBtn = $('exportJson') || $('exportBtn');
  const importJsonBtn = $('importJsonBtn');
  const importFile = $('importFile');
  const autosizeBtn = $('autosizeBtn');
  const clearAllBtn = $('clearAllBtn');
  const statusMeta = $('statusMeta');

  // inspector fields
  const inspector = $('inspector');
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

  // overlay & toast roots (create if missing)
  if (!$('wf-toast')) {
    const r = document.createElement('div'); r.id = 'wf-toast';
    r.style.position = 'fixed'; r.style.left = '50%'; r.style.transform = 'translateX(-50%)'; r.style.top = '86px'; r.style.zIndex = 30000; r.style.pointerEvents = 'none';
    document.body.appendChild(r);
  }
  if (!$('wf-overlay')) {
    const ov = document.createElement('div'); ov.id = 'wf-overlay';
    ov.style.position = 'fixed'; ov.style.left = '0'; ov.style.top = '0'; ov.style.right = '0'; ov.style.bottom = '0'; ov.style.display = 'none'; ov.style.zIndex = 30000; ov.style.background = 'rgba(0,0,0,0.65)'; ov.style.alignItems = 'center'; ov.style.justifyContent = 'center';
    ov.innerHTML = '<div class="card" style="padding:18px;max-width:900px;color:#fff"><h2>Workspace Tour</h2><p id="wf-overlay-text" style="line-height:1.4">Welcome to the workspace</p><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button id="wf-skip" class="btn">Skip</button><button id="wf-next" class="btn primary">Next</button></div></div>';
    document.body.appendChild(ov);
  }

  // ---------- App state ----------
  const model = { nodes: [], links: [], groups: [] };
  const state = {
    transform: { x: 0, y: 0, scale: 1 },
    selectedNodes: new Set(),
    selectedLinkId: null,
    dragInfo: null,
    linkDraw: null,
    handleDrag: null,
    highestZ: 15,
    dirty: false,
    undoStack: [],
    redoStack: [],
    templates: [],
    grid: { enabled: true, size: 25 },
    placeMode: false,
    versionHistory: [] // local versions
  };

  // ---------- Utility functions ----------
  function screenToBoard(sx, sy) {
    const rect = board.getBoundingClientRect();
    return { x: (sx - rect.left) / state.transform.scale, y: (sy - rect.top) / state.transform.scale };
  }
  function boardToScreen(bx, by) {
    const rect = board.getBoundingClientRect();
    return { x: rect.left + bx * state.transform.scale, y: rect.top + by * state.transform.scale };
  }
  function isTyping() {
    try {
      const ae = document.activeElement; if (!ae) return false;
      const tag = (ae.tagName || '').toUpperCase(); if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (ae.isContentEditable) return true; if (ae.closest && ae.closest('#inspector')) return true; return false;
    } catch (e) { return false; }
  }
  function deepCopyState() { return deepClone({ nodes: model.nodes, links: model.links, groups: model.groups }); }
  function saveSnapshot() {
    state.undoStack.push(deepCopyState());
    if (state.undoStack.length > CONFIG.maxUndo) state.undoStack.shift();
    state.redoStack = [];
  }
  function undo() {
    if (state.undoStack.length === 0) return;
    const last = state.undoStack.pop();
    state.redoStack.push(deepCopyState());
    model.nodes.length = 0; model.links.length = 0; model.groups.length = 0;
    (last.nodes || []).forEach(n => model.nodes.push(n));
    (last.links || []).forEach(l => model.links.push(l));
    (last.groups || []).forEach(g => model.groups.push(g));
    state.selectedNodes.clear(); state.selectedLinkId = null;
    renderNodes(); renderLinks(); markDirty(false);
  }
  function redo() {
    if (state.redoStack.length === 0) return;
    const next = state.redoStack.pop();
    state.undoStack.push(deepCopyState());
    model.nodes.length = 0; model.links.length = 0; model.groups.length = 0;
    (next.nodes || []).forEach(n => model.nodes.push(n));
    (next.links || []).forEach(l => model.links.push(l));
    (next.groups || []).forEach(g => model.groups.push(g));
    state.selectedNodes.clear(); state.selectedLinkId = null;
    renderNodes(); renderLinks(); markDirty(false);
  }

  function markDirty(userTriggered = true) {
    state.dirty = true;
    if (statusMeta && userTriggered) statusMeta.textContent = 'Unsaved changes';
    if (saveBoardBtn && userTriggered) saveBoardBtn.textContent = 'Saving...';
    clearTimeout(state._autoSaveTimer);
    state._autoSaveTimer = setTimeout(() => {
      // auto-save to localStorage or backend if provided
      if (window.AriesDB && typeof window.AriesDB.saveProjectWorkspace === 'function') {
        const pid = window.currentProjectId || (new URL(window.location.href)).searchParams.get('id') || 'local';
        window.AriesDB.saveProjectWorkspace(pid, model.nodes, model.links).then(()=> {
          state.dirty = false;
          if (statusMeta) statusMeta.textContent = 'Saved';
          if (saveBoardBtn) saveBoardBtn.textContent = 'Save Board';
        }).catch((err)=> {
          console.warn('Auto-save failed', err);
          if (statusMeta) statusMeta.textContent = 'Save failed';
          if (saveBoardBtn) saveBoardBtn.textContent = 'Save Board';
        });
      } else {
        // local fallback
        localStorage.setItem('wf_local_' + (window.currentProjectId || 'local'), JSON.stringify({ nodes: model.nodes, links: model.links, groups: model.groups, savedAt: now() }));
        state.dirty = false;
        if (statusMeta) statusMeta.textContent = 'Saved (local)';
        if (saveBoardBtn) saveBoardBtn.textContent = 'Save Board';
      }
    }, 900);
  }

  // ---------- Visible area helpers ----------
  function getVisibleBoardRect() {
    const rect = canvas.getBoundingClientRect();
    const tl = screenToBoard(rect.left, rect.top);
    const br = screenToBoard(rect.left + rect.width, rect.top + rect.height);
    return { left: tl.x, top: tl.y, right: br.x, bottom: br.y, width: br.x - tl.x, height: br.y - tl.y };
  }

  // ---------- Anchors: model-based (reliable) ----------
  function computeAnchorsForNode(node) {
    const x = node.x, y = node.y, w = node.w || 220, h = node.h || 100;
    return [
      { x: x, y: y }, { x: x + w/2, y: y }, { x: x + w, y: y },
      { x: x + w, y: y + h/2 }, { x: x + w, y: y + h },
      { x: x + w/2, y: y + h }, { x: x, y: y + h }, { x: x, y: y + h/2 }
    ];
  }

  function nearestAnchorIndex(node, boardPoint) {
    const anchors = computeAnchorsForNode(node);
    let best = 0, bestD = Infinity;
    anchors.forEach((a, i) => {
      const dx = a.x - boardPoint.x, dy = a.y - boardPoint.y;
      const d = dx*dx + dy*dy;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  // ---------- Model operations ----------
  function addNodeAt(x, y, type, opts = {}) {
    saveSnapshot();
    const s = state.grid.size || 25;
    const vis = getVisibleBoardRect();
    let tx = x, ty = y;
    const coordsValid = (nx, ny) => (typeof nx === 'number' && typeof ny === 'number' && nx >= vis.left && nx <= vis.right && ny >= vis.top && ny <= vis.bottom);
    if (!coordsValid(tx, ty)) {
      tx = vis.left + vis.width/2;
      ty = vis.top + vis.height/2;
      showToast('Node placed to visible center');
    }
    const nx = Math.round(tx / s) * s;
    const ny = Math.round(ty / s) * s;
    state.highestZ++;
    const base = { id: uid('n'), x: nx, y: ny, w: 220, h: 100, type, zIndex: state.highestZ, title: 'New', body: '', color: '#ffffff', iconUrl: '', imageUrl: '' };
    if (type === 'page') { base.title = 'New Page'; base.body = 'Website Page'; }
    else if (type === 'action') { base.title = 'Action'; base.body = 'User event'; }
    else if (type === 'decision') { base.title = 'Decision'; base.body = 'Condition'; base.w = 150; base.h = 150; }
    else if (type === 'junction') { base.title = 'Junction'; base._junction = true; base.w = CONFIG.junctionSize; base.h = CONFIG.junctionSize; }
    Object.assign(base, opts);
    model.nodes.push(base);
    markDirty();
    renderNodes();
    return base;
  }

  function addLinkObj(obj) {
    saveSnapshot();
    if (!obj.points || obj.points.length < 2) {
      const sNode = model.nodes.find(n => n.id === obj.source);
      const tNode = model.nodes.find(n => n.id === obj.target);
      if (sNode && tNode) {
        const sAnch = computeAnchorsForNode(sNode)[obj.sourceAnchorIdx || 0];
        const tAnch = computeAnchorsForNode(tNode)[obj.targetAnchorIdx || 0];
        obj.points = createInitialPointsBetween(sAnch, tAnch);
      } else {
        obj.points = obj.points || [{ x:0, y:0 }, { x: 100, y: 100 }];
      }
    }
    model.links.push(obj);
    markDirty();
    renderLinks();
    return obj;
  }

  function deleteNode(nodeId) {
    saveSnapshot();
    model.nodes = model.nodes.filter(n => n.id !== nodeId);
    model.links = model.links.filter(l => l.source !== nodeId && l.target !== nodeId);
    model.groups.forEach(g => { g.nodeIds = (g.nodeIds || []).filter(id => id !== nodeId); });
    state.selectedNodes.delete(nodeId);
    if (toolDeleteNode) toolDeleteNode.disabled = true;
    renderNodes();
    renderLinks();
    markDirty();
  }

  function deleteLink(linkId) {
    saveSnapshot();
    model.links = model.links.filter(l => l.id !== linkId);
    if (state.selectedLinkId === linkId) state.selectedLinkId = null;
    if (toolDeleteLink) toolDeleteLink.disabled = true;
    renderLinks();
    markDirty();
  }

  // ---------- Routing helpers ----------
  function polyToPath(points, cornerRadius) {
    if (!points || points.length < 2) return '';
    const r = Math.max(0, cornerRadius || 0);
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], cur = points[i], next = points[i + 1];
      if (next && r > 0) {
        const vx = cur.x - prev.x, vy = cur.y - prev.y;
        const nx = next.x - cur.x, ny = next.y - cur.y;
        const inLen = Math.sqrt(vx * vx + vy * vy) || 1;
        const outLen = Math.sqrt(nx * nx + ny * ny) || 1;
        const rad = Math.min(r, inLen / 2, outLen / 2);
        const ux = vx / inLen, uy = vy / inLen;
        const ox = nx / outLen, oy = ny / outLen;
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

  function straightenIfAligned(p1, p2) {
    const dx = Math.abs(p1.x - p2.x), dy = Math.abs(p1.y - p2.y);
    const thresh = 8;
    return dx < thresh || dy < thresh;
  }

  function createInitialPointsBetween(p1, p2) {
    if (straightenIfAligned(p1, p2)) return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
    const midX = Math.round((p1.x + p2.x) / 2);
    return [{ x: p1.x, y: p1.y }, { x: midX, y: p1.y }, { x: midX, y: p2.y }, { x: p2.x, y: p2.y }];
  }

  // ---------- Render nodes & anchors (anchor dots hidden until hover) ----------
  function clearNodes() { document.querySelectorAll('.node').forEach(n => n.remove()); }
  function clearSVG() { while (svg && svg.firstChild) svg.removeChild(svg.firstChild); }

  function renderNodes() {
    clearNodes();
    model.nodes.forEach(node => {
      const el = document.createElement('div');
      el.className = `node node-type-${node.type} ${state.selectedNodes.has(node.id) ? 'selected' : ''}`;
      el.id = `node-${node.id}`;
      el.style.position = 'absolute';
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.style.zIndex = (node._junction ? 1500 : (node.zIndex || 15));
      el.style.width = `${node.w}px`;
      el.style.height = `${node.h}px`;
      el.style.boxSizing = 'border-box';
      el.style.borderRadius = node._junction ? '50%' : '10px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = node._junction ? 'center' : 'flex-start';
      el.style.padding = node._junction ? '0' : '12px';
      el.style.cursor = 'pointer';
      el.style.background = node.color || '#ffffff';

      // icon & image support
      let inner = '';
      if (node.iconUrl) inner += `<img src="${escape(node.iconUrl)}" style="width:20px;height:20px;margin-right:8px;object-fit:contain"/>`;
      if (node.imageUrl) {
        inner += `<div style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;border-radius:inherit"><img src="${escape(node.imageUrl)}" style="width:100%;height:100%;object-fit:cover;opacity:0.95"/></div>`;
      }
      if (node._junction) {
        inner = `<div style="width:${node.w}px;height:${node.h}px;border-radius:50%;background:#fff;border:2px solid rgba(0,0,0,0.08)"></div>`;
      } else {
        inner += `<div style="position:relative;z-index:2"><div style="font-weight:700;margin-bottom:6px;">${escape(node.title)}</div><div style="color:#334155">${escape(node.body)}</div></div>`;
      }
      el.innerHTML = inner;

      // anchors container
      const anchorsContainer = document.createElement('div');
      anchorsContainer.className = 'anchors';
      anchorsContainer.style.position = 'absolute';
      anchorsContainer.style.left = '0';
      anchorsContainer.style.top = '0';
      anchorsContainer.style.width = '100%';
      anchorsContainer.style.height = '100%';
      anchorsContainer.style.pointerEvents = 'none';
      el.appendChild(anchorsContainer);

      const w = node.w, h = node.h;
      const dotPositions = [
        { left: 0, top: 0 }, { left: w / 2 - CONFIG.anchorDotSize / 2, top: 0 }, { left: w - CONFIG.anchorDotSize, top: 0 },
        { left: w - CONFIG.anchorDotSize, top: h / 2 - CONFIG.anchorDotSize / 2 }, { left: w - CONFIG.anchorDotSize, top: h - CONFIG.anchorDotSize },
        { left: w / 2 - CONFIG.anchorDotSize / 2, top: h - CONFIG.anchorDotSize }, { left: 0, top: h - CONFIG.anchorDotSize }, { left: 0, top: h / 2 - CONFIG.anchorDotSize / 2 }
      ];

      dotPositions.forEach((pos, idx) => {
        const dot = document.createElement('div');
        dot.className = 'anchor-dot';
        dot.dataset.nodeId = node.id;
        dot.dataset.anchorIndex = String(idx);
        dot.style.position = 'absolute';
        dot.style.left = `${pos.left}px`;
        dot.style.top = `${pos.top}px`;
        dot.style.width = `${CONFIG.anchorDotSize}px`;
        dot.style.height = `${CONFIG.anchorDotSize}px`;
        dot.style.borderRadius = '50%';
        dot.style.background = 'rgba(255,255,255,0.98)';
        dot.style.border = `2px solid ${CONFIG.anchorDotStroke}`;
        dot.style.pointerEvents = 'auto';
        dot.style.cursor = 'crosshair';
        dot.title = 'Anchor — drag from here to create link';

        // START LINK DRAW - improved to enable anchors on potential targets
        dot.addEventListener('pointerdown', ev => {
          ev.stopPropagation();
          ev.preventDefault();
          try { dot.setPointerCapture && dot.setPointerCapture(ev.pointerId); } catch(e){}
          const anchors = computeAnchorsForNode(node);
          const anchor = anchors[idx];
          state.linkDraw = {
            sourceId: node.id,
            sourceAnchorIdx: idx,
            startX: anchor.x, startY: anchor.y,
            currentX: anchor.x, currentY: anchor.y,
            pointerId: ev.pointerId
          };
          // Mark board as in link-draw mode so CSS can enable anchor pointer-events
          try { board.classList.add('wf-link-drawing'); } catch(e){}
          canvas.style.cursor = 'crosshair';
          svg.style.pointerEvents = 'auto';
          renderLinks();
        });

        dot.addEventListener('pointerup', ev => {
          try { dot.releasePointerCapture && dot.releasePointerCapture(ev.pointerId); } catch(e){}
        });

        anchorsContainer.appendChild(dot);
      });

      // pointer-based interactions
      el.addEventListener('pointerdown', e => handleNodeDown(e, node.id));
      el.addEventListener('dblclick', e => { e.stopPropagation(); openNodeModal(node); });
      el.addEventListener('contextmenu', e => nodeContext(e, node.id));
      board.appendChild(el);
    });

    // ensure svg is on top in DOM order
    if (svg && svg.parentElement) svg.parentElement.appendChild(svg);
    svg.style.zIndex = 2000;
    svg.style.pointerEvents = 'none';

    renderLinks();
    updateInspector();
  }

  // ---------- Links rendering ----------
  function clearSVGChildren() { while (svg && svg.firstChild) svg.removeChild(svg.firstChild); }

  function renderLinks() {
    if (!svg) return;
    clearSVGChildren();

    // preview when drawing
    if (state.linkDraw) {
      const a = { x: state.linkDraw.startX, y: state.linkDraw.startY };
      const b = { x: state.linkDraw.currentX, y: state.linkDraw.currentY };
      const pathNode = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathNode.setAttribute('d', createPreviewPath(a, b));
      pathNode.setAttribute('stroke', CONFIG.previewStroke);
      pathNode.setAttribute('stroke-width', 3);
      pathNode.setAttribute('fill', 'none');
      pathNode.setAttribute('stroke-dasharray', '6,6');
      pathNode.setAttribute('stroke-linecap', 'round');
      pathNode.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(pathNode);
    }

    // bucket same-source/target pairs for parallel offset
    const pairs = {};
    model.links.forEach(link => {
      const key = `${link.source}::${link.target}`;
      if (!pairs[key]) pairs[key] = [];
      pairs[key].push(link);
    });
    Object.keys(pairs).forEach(key => {
      const arr = pairs[key]; arr.forEach((link, idx) => { link._parallelIndex = idx; link._parallelCount = arr.length; });
    });

    model.links.forEach(link => {
      const sNode = model.nodes.find(n => n.id === link.source);
      const tNode = model.nodes.find(n => n.id === link.target);
      if (!sNode || !tNode) return;

      const sAnchors = computeAnchorsForNode(sNode);
      const tAnchors = computeAnchorsForNode(tNode);
      const sIndex = (typeof link.sourceAnchorIdx === 'number') ? link.sourceAnchorIdx : nearestAnchorIndex(sNode, { x: (sNode.x + tNode.x) / 2, y: (sNode.y + tNode.y) / 2 });
      const tIndex = (typeof link.targetAnchorIdx === 'number') ? link.targetAnchorIdx : nearestAnchorIndex(tNode, { x: (sNode.x + tNode.x) / 2, y: (sNode.y + tNode.y) / 2 });
      const p1 = sAnchors[sIndex];
      const p2 = tAnchors[tIndex];

      if (!link.points || !Array.isArray(link.points) || link.points.length < 2) {
        link.points = createInitialPointsBetween(p1, p2);
        link.sourceAnchorIdx = sIndex;
        link.targetAnchorIdx = tIndex;
      } else {
        // snap endpoints to anchors
        link.points[0] = { x: p1.x, y: p1.y };
        link.points[link.points.length - 1] = { x: p2.x, y: p2.y };
      }

      // parallel offset for intermediate points
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const idx = (link._parallelIndex !== undefined) ? link._parallelIndex : 0;
      const count = (link._parallelCount !== undefined) ? link._parallelCount : 1;
      const middle = (count - 1) / 2;
      const offset = (idx - middle) * CONFIG.parallelGap;
      const offsetX = nx * offset, offsetY = ny * offset;

      const renderPoints = link.points.map((pt, i) => {
        if (i === 0 || i === link.points.length - 1) return pt;
        return { x: pt.x + offsetX, y: pt.y + offsetY };
      });

      const d = polyToPath(renderPoints, 8);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const isSel = state.selectedLinkId === link.id;
      path.setAttribute('d', d);
      path.setAttribute('stroke', isSel ? CONFIG.linkSelected : (link.color || CONFIG.linkStroke));
      path.setAttribute('stroke-width', 3);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.classList.add('link-path');
      path.id = `link-${link.id}`;
      path.style.cursor = 'pointer';
      path.style.pointerEvents = 'auto';

      // Single dblclick handler (Alt+dblclick adds bend, dblclick otherwise opens modal)
      path.addEventListener('dblclick', e => {
        e.stopPropagation();
        if (e.altKey) {
          // Add bend point
          const boardPt = screenToBoard(e.clientX, e.clientY);
          let bestIdx = 0, bestD = Infinity;
          for (let i = 0; i < link.points.length - 1; i++) {
            const a = link.points[i], b = link.points[i + 1];
            const d = pointToSegmentDistance(boardPt, a, b);
            if (d < bestD) { bestD = d; bestIdx = i + 1; }
          }
          saveSnapshot();
          link.points.splice(bestIdx, 0, { x: boardPt.x, y: boardPt.y });
          markDirty();
          renderLinks();
        } else {
          // Open link modal
          openLinkModal(link);
        }
      });

      path.addEventListener('click', e => {
        e.stopPropagation();
        state.selectedLinkId = link.id;
        state.selectedNodes.clear();
        if (toolDeleteLink) toolDeleteLink.disabled = false;
        if (toolDeleteNode) toolDeleteNode.disabled = true;
        renderNodes(); renderLinks();
      });

      svg.appendChild(path);

      // label
      if (link.label) {
        const mid = link.points[Math.floor((link.points.length - 1) / 2)];
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', mid.x);
        text.setAttribute('y', mid.y - 12);
        text.setAttribute('class', 'link-label');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = link.label;
        svg.appendChild(text);
      }

      // editing handles if enabled
      if (link._editing) {
        link.points.forEach((pt, pidx) => {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', pt.x);
          c.setAttribute('cy', pt.y);
          c.setAttribute('r', (pidx === 0 || pidx === link.points.length - 1) ? (CONFIG.handleRadius - 2) : CONFIG.handleRadius);
          c.setAttribute('data-link-id', link.id);
          c.setAttribute('data-pt-idx', String(pidx));
          c.style.fill = '#fff';
          c.style.stroke = isSel ? CONFIG.linkSelected : '#333';
          c.style.strokeWidth = 1.5;
          c.style.cursor = (pidx === 0 || pidx === link.points.length - 1) ? 'not-allowed' : 'move';
          c.style.pointerEvents = 'auto';
          svg.appendChild(c);

          c.addEventListener('pointerdown', ev => {
            ev.stopPropagation(); ev.preventDefault();
            try { c.setPointerCapture && c.setPointerCapture(ev.pointerId); } catch(e){}
            state.handleDrag = { linkId: link.id, ptIdx: pidx, startClientX: ev.clientX, startClientY: ev.clientY, startX: pt.x, startY: pt.y, pointerId: ev.pointerId };
          });

          c.addEventListener('dblclick', ev => {
            ev.stopPropagation();
            if (pidx === 0 || pidx === link.points.length - 1) return;
            if (confirm('Remove this bend point?')) {
              saveSnapshot(); link.points.splice(pidx, 1); markDirty(); renderLinks();
            }
          });

          c.addEventListener('pointerup', ev => {
            try { c.releasePointerCapture && c.releasePointerCapture(ev.pointerId); } catch(e){}
          });
        });
      }
    });
  }

  // ---------- Geometry helpers ----------
  function pointToSegmentDistance(p, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = p.x - a.x, wy = p.y - a.y;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
    const t = c1 / c2;
    const projx = a.x + t * vx, projy = a.y + t * vy;
    return Math.hypot(p.x - projx, p.y - projy);
  }

  function createPreviewPath(a, b) {
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    if (dx < 8 || dy < 8) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    const midX = Math.round((a.x + b.x) / 2);
    const pts = [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
    return polyToPath(pts, 6);
  }

// ---------- Link finalization (anchor detection + connect-to-connector) ----------
function finalizeLinkIfPossible(evt) {
  // If no active link draw, ensure cleanup
  if (!state.linkDraw) {
    state.linkDraw = null;
    canvas.style.cursor = 'default';
    try { board.classList.remove('wf-link-drawing'); } catch(e){}
    svg.style.pointerEvents = 'none';
    renderLinks();
    return;
  }

  // Get client coords (use last mouse if evt is undefined)
  const clientX = (evt && evt.clientX) || (window._lastMouse && window._lastMouse.clientX) || 0;
  const clientY = (evt && evt.clientY) || (window._lastMouse && window._lastMouse.clientY) || 0;
  const boardPt = screenToBoard(clientX, clientY);

  // Try DOM-based detection first (anchor -> node -> path)
  const elementAt = document.elementFromPoint(clientX, clientY);
  const anchorEl = elementAt ? elementAt.closest('.anchor-dot') : null;
  const nodeEl = elementAt ? elementAt.closest('.node') : null;
  const pathEl = elementAt ? elementAt.closest('path.link-path') : null;

  let handled = false;

  // 1) Anchor element found: connect to that exact anchor
  if (anchorEl) {
    const targetNodeId = anchorEl.dataset.nodeId;
    const targetIndex = parseInt(anchorEl.dataset.anchorIndex, 10);
    if (targetNodeId && targetNodeId !== state.linkDraw.sourceId) {
      const sNode = model.nodes.find(n => n.id === state.linkDraw.sourceId);
      const tNode = model.nodes.find(n => n.id === targetNodeId);
      if (sNode && tNode) {
        const sAnch = computeAnchorsForNode(sNode)[state.linkDraw.sourceAnchorIdx];
        const tAnch = computeAnchorsForNode(tNode)[targetIndex];
        const newLink = { id: uid('l'), source: sNode.id, target: tNode.id, sourceAnchorIdx: state.linkDraw.sourceAnchorIdx, targetAnchorIdx: targetIndex, points: createInitialPointsBetween(sAnch, tAnch), label: '' };
        model.links.push(newLink);
        saveSnapshot(); markDirty(); renderLinks();
        handled = true;
      }
    }
  }

  // 2) Node body (no specific anchor) -> snap to nearest anchor on that node
  if (!handled && nodeEl) {
    const targetNodeId = nodeEl.id.replace('node-', '');
    if (targetNodeId && targetNodeId !== state.linkDraw.sourceId) {
      const targetNode = model.nodes.find(n => n.id === targetNodeId);
      if (targetNode) {
        const targetIdx = nearestAnchorIndex(targetNode, boardPt);
        const sNode = model.nodes.find(n => n.id === state.linkDraw.sourceId);
        const sAnch = computeAnchorsForNode(sNode)[state.linkDraw.sourceAnchorIdx];
        const tAnch = computeAnchorsForNode(targetNode)[targetIdx];
        const newLink = { id: uid('l'), source: sNode.id, target: targetNode.id, sourceAnchorIdx: state.linkDraw.sourceAnchorIdx, targetAnchorIdx: targetIdx, points: createInitialPointsBetween(sAnch, tAnch), label: '' };
        model.links.push(newLink);
        saveSnapshot(); markDirty(); renderLinks();
        handled = true;
      }
    }
  }

  // 3) Path (DOM) OR fallback: geometric search for nearest link segment (distance threshold)
  if (!handled) {
    let pathLinkId = null;
    if (pathEl) {
      const pathId = pathEl.id;
      if (pathId && pathId.startsWith('link-')) pathLinkId = pathId.replace('link-', '');
    }

    // If DOM path not found, compute nearest link by distance
    if (!pathLinkId) {
      const threshold = 16 / (state.transform.scale || 1); // allow a few screen pixels tolerance, scale-corrected
      let bestD = Infinity;
      let bestLink = null;
      let bestSegIdx = 0;
      for (let li = 0; li < model.links.length; li++) {
        const L = model.links[li];
        if (!L.points || L.points.length < 2) continue;
        for (let si = 0; si < L.points.length - 1; si++) {
          const a = L.points[si], b = L.points[si + 1];
          const d = pointToSegmentDistance(boardPt, a, b);
          if (d < bestD) { bestD = d; bestLink = L; bestSegIdx = si + 1; }
        }
      }
      if (bestLink && bestD <= threshold) {
        pathLinkId = bestLink.id;
      }
    }

    // If we found a link (either DOM or geometric), create a junction and split/connect
    if (pathLinkId) {
      const targetLink = model.links.find(l => l.id === pathLinkId);
      if (targetLink) {
        // pick best insertion index by distance to segments
        let bestIdx = 0, bestD = Infinity;
        for (let i = 0; i < targetLink.points.length - 1; i++) {
          const a = targetLink.points[i], b = targetLink.points[i + 1];
          const d = pointToSegmentDistance(boardPt, a, b);
          if (d < bestD) { bestD = d; bestIdx = i + 1; }
        }
        // create junction node at boardPt
        const junction = addNodeAt(boardPt.x, boardPt.y, 'junction', { _junction: true, title: 'Junction', w: CONFIG.junctionSize, h: CONFIG.junctionSize });
        saveSnapshot();
        // insert junction point onto target link's points
        targetLink.points.splice(bestIdx, 0, { x: boardPt.x, y: boardPt.y });
        // create new link from source node to junction
        const sNode = model.nodes.find(n => n.id === state.linkDraw.sourceId);
        if (sNode) {
          const sAnch = computeAnchorsForNode(sNode)[state.linkDraw.sourceAnchorIdx];
          const jAnch = computeAnchorsForNode(junction)[0];
          const newLink1 = { id: uid('l'), source: sNode.id, target: junction.id, sourceAnchorIdx: state.linkDraw.sourceAnchorIdx, targetAnchorIdx: 0, points: createInitialPointsBetween(sAnch, jAnch), label: '' };
          model.links.push(newLink1);
          markDirty();
          renderNodes(); renderLinks();
          handled = true;
        }
      }
    }
  }

  // If nothing handled, simply end the preview without creating a link
  // Cleanup: remove drawing indicators and reset linkDraw
  try { board.classList.remove('wf-link-drawing'); } catch(e){}
  state.linkDraw = null;
  canvas.style.cursor = 'default';
  svg.style.pointerEvents = 'none';
  renderLinks();
}

  // ---------- Interaction: node down, pan, drag, handle drag ----------
  function handleNodeDown(e, nodeId) {
    if (e.button !== 0 && typeof e.button === 'number') return;
    e.stopPropagation();
    const cm = $('contextMenu'); if (cm) cm.style.display = 'none';
    if (!state.selectedNodes.has(nodeId)) {
      if (e.shiftKey) state.selectedNodes.add(nodeId);
      else { state.selectedNodes.clear(); state.selectedNodes.add(nodeId); }
    }
    state.selectedLinkId = null;
    const startPositions = {};
    Array.from(state.selectedNodes).forEach(id => { const n = model.nodes.find(x => x.id === id); if (n) startPositions[id] = { x: n.x, y: n.y }; });
    const node = model.nodes.find(n => n.id === nodeId);
    if (node) { state.highestZ++; node.zIndex = state.highestZ; const el = document.getElementById(`node-${nodeId}`); if (el) el.style.zIndex = state.highestZ; }
    state.dragInfo = { mode: 'node', startX: e.clientX, startY: e.clientY, nodeId, startPositions, pointerId: e.pointerId };
    renderNodes();
  }

  function onCanvasDown(e) {
    const t = e.target;
    // place-mode quick add
    if (state.placeMode && (!t.closest || !t.closest('.node'))) {
      const b = screenToBoard(e.clientX, e.clientY);
      addNodeAt(b.x, b.y, 'action');
      return;
    }
    if (t && t.closest && t.closest('.node')) return;
    const cm = $('contextMenu'); if (cm && t && t.closest && t.closest('#contextMenu')) return;
    state.selectedNodes.clear(); state.selectedLinkId = null;
    if (toolDeleteNode) toolDeleteNode.disabled = true;
    if (toolDeleteLink) toolDeleteLink.disabled = true;
    renderNodes(); renderLinks(); updateInspector();
    state.dragInfo = { mode: 'pan', startX: e.clientX, startY: e.clientY, startTransformX: state.transform.x, startTransformY: state.transform.y, pointerId: e.pointerId };
    canvas.style.cursor = 'grabbing';
  }

  window._lastMouse = { clientX: 0, clientY: 0 };

  function onMove(e) {
    if (e) { window._lastMouse.clientX = e.clientX; window._lastMouse.clientY = e.clientY; }
    if (state.handleDrag) {
      const hd = state.handleDrag;
      const link = model.links.find(l => l.id === hd.linkId);
      if (!link) return;
      const dx = (e.clientX - hd.startClientX) / state.transform.scale;
      const dy = (e.clientY - hd.startClientY) / state.transform.scale;
      const newX = hd.startX + dx, newY = hd.startY + dy;
      link.points[hd.ptIdx].x = newX; link.points[hd.ptIdx].y = newY;
      renderLinks();
      return;
    }
    if (!state.dragInfo && !state.linkDraw) return;
    if (state.dragInfo && state.dragInfo.mode === 'pan') {
      const dx = e.clientX - state.dragInfo.startX;
      const dy = e.clientY - state.dragInfo.startY;
      state.transform.x = state.dragInfo.startTransformX + dx;
      state.transform.y = state.dragInfo.startTransformY + dy;
      applyTransform();
    } else if (state.dragInfo && state.dragInfo.mode === 'node') {
      const deltaX = (e.clientX - state.dragInfo.startX) / state.transform.scale;
      const deltaY = (e.clientY - state.dragInfo.startY) / state.transform.scale;
      for (let id of Object.keys(state.dragInfo.startPositions)) {
        const n = model.nodes.find(x => x.id === id);
        if (!n) continue;
        n.x = state.dragInfo.startPositions[id].x + deltaX;
        n.y = state.dragInfo.startPositions[id].y + deltaY;
        const el = document.getElementById(`node-${n.id}`);
        if (el) { el.style.left = `${n.x}px`; el.style.top = `${n.y}px`; }
      }
      renderLinks();
    } else if (state.linkDraw) {
      const b = screenToBoard(e.clientX, e.clientY);
      state.linkDraw.currentX = b.x; state.linkDraw.currentY = b.y;
      renderLinks();
    }
  }

  function onUp(e) {
    // finalize capture-based drags
    if (state.handleDrag) { saveSnapshot(); try { /*release capture if needed*/ } catch(e){} state.handleDrag = null; markDirty(); renderLinks(); return; }
    if (state.linkDraw) finalizeLinkIfPossible(e);
    if (state.dragInfo) {
      if (state.dragInfo.mode === 'node') {
        const s = state.grid.size;
        for (let id of Object.keys(state.dragInfo.startPositions)) {
          const n = model.nodes.find(x => x.id === id); if (!n) continue;
          n.x = Math.round(n.x / s) * s; n.y = Math.round(n.y / s) * s;
        }
        saveSnapshot(); markDirty(); renderNodes();
      }
      state.dragInfo = null; canvas.style.cursor = 'default';
    }
    // safety cleanup: ensure wf-link-drawing removed if any lingering
    try { board.classList.remove('wf-link-drawing'); } catch(e){}
  }

  // ---------- Context menu ----------
  function nodeContext(e, nodeId) {
    e.preventDefault();
    setSelectedNodesFromClick(nodeId, e);
    const cm = $('contextMenu');
    if (!cm) return;
    cm.style.left = `${e.clientX}px`; cm.style.top = `${e.clientY}px`; cm.style.display = 'block';
    const ce = $('contextEdit'); if (ce) ce.onclick = () => { cm.style.display = 'none'; openNodeModal(model.nodes.find(n => n.id === nodeId)); };
    const cd = $('contextDelete'); if (cd) cd.onclick = () => { cm.style.display = 'none'; deleteNode(nodeId); };
  }

  // ---------- Inspector ----------
  function updateInspector() {
    if (selectedCount) selectedCount.textContent = state.selectedNodes.size;
    if (!inspector) return;
    if (state.selectedNodes.size === 0) { if (inspectorSingle) inspectorSingle.style.display = 'none'; if (inspectorMulti) inspectorMulti.style.display = 'none'; }
    else if (state.selectedNodes.size === 1) {
      if (inspectorMulti) inspectorMulti.style.display = 'none';
      if (inspectorSingle) inspectorSingle.style.display = 'block';
      const id = Array.from(state.selectedNodes)[0];
      const node = model.nodes.find(n => n.id === id);
      if (node && inspectorId && inspectorType && inspectorTitle && inspectorBody && inspectorW && inspectorH) {
        inspectorId.textContent = node.id;
        inspectorType.value = node.type;
        inspectorTitle.value = node.title;
        inspectorBody.value = node.body;
        inspectorW.value = parseInt(node.w || 220);
        inspectorH.value = parseInt(node.h || 100);
        // add color/icon/image inputs (dynamically)
        const colorEl = document.getElementById('inspectorColor') || (() => {
          const holder = document.createElement('div'); holder.style.marginTop = '8px';
          holder.innerHTML = `<label>Color <input id="inspectorColor" type="color" value="${node.color || '#ffffff'}" style="margin-left:8px"/></label>
                              <label style="display:block;margin-top:8px">Icon URL <input id="inspectorIcon" type="text" placeholder="https://..." style="width:100%"/></label>
                              <label style="display:block;margin-top:8px">Image URL <input id="inspectorImage" type="text" placeholder="https://..." style="width:100%"/></label>
                              <div style="display:flex;gap:8px;margin-top:8px"><button id="inspectorApplyMedia" class="btn">Apply</button><button id="inspectorClearMedia" class="btn">Clear</button></div>`;
          inspectorSingle.appendChild(holder);
          return document.getElementById('inspectorColor');
        })();
        const iconIn = document.getElementById('inspectorIcon');
        const imgIn = document.getElementById('inspectorImage');
        if (colorEl) colorEl.value = node.color || '#ffffff';
        if (iconIn) iconIn.value = node.iconUrl || '';
        if (imgIn) imgIn.value = node.imageUrl || '';
        const applyBtn = document.getElementById('inspectorApplyMedia');
        const clearBtn = document.getElementById('inspectorClearMedia');
        if (applyBtn) applyBtn.onclick = () => {
          saveSnapshot();
          node.color = (document.getElementById('inspectorColor') || {}).value || node.color;
          node.iconUrl = (document.getElementById('inspectorIcon') || {}).value || '';
          node.imageUrl = (document.getElementById('inspectorImage') || {}).value || '';
          markDirty(); renderNodes();
        };
        if (clearBtn) clearBtn.onclick = () => {
          saveSnapshot();
          node.iconUrl = ''; node.imageUrl = ''; node.color = '#ffffff';
          markDirty(); renderNodes();
        };
      }
    } else {
      if (inspectorSingle) inspectorSingle.style.display = 'none';
      if (inspectorMulti) inspectorMulti.style.display = 'block';
    }
  }

  function applyInspectorToNode() {
    if (state.selectedNodes.size !== 1) return;
    const id = Array.from(state.selectedNodes)[0];
    const node = model.nodes.find(n => n.id === id);
    if (!node) return;
    if (inspectorType) node.type = inspectorType.value;
    if (inspectorTitle) node.title = inspectorTitle.value;
    if (inspectorBody) node.body = inspectorBody.value;
    if (inspectorW) node.w = parseInt(inspectorW.value) || node.w;
    if (inspectorH) node.h = parseInt(inspectorH.value) || node.h;
    saveSnapshot(); markDirty(); renderNodes();
  }

  if (inspectorSave) inspectorSave.addEventListener('click', applyInspectorToNode);
  if (inspectorDelete) inspectorDelete.addEventListener('click', () => { if (state.selectedNodes.size === 1) deleteNode(Array.from(state.selectedNodes)[0]); });

  function setSelectedNodesFromClick(nodeId, ev) {
    if (ev && ev.shiftKey) {
      if (state.selectedNodes.has(nodeId)) state.selectedNodes.delete(nodeId);
      else state.selectedNodes.add(nodeId);
    } else {
      state.selectedNodes.clear(); state.selectedNodes.add(nodeId);
    }
    state.selectedLinkId = null;
    if (toolDeleteNode) toolDeleteNode.disabled = false;
    if (toolDeleteLink) toolDeleteLink.disabled = true;
    renderNodes(); renderLinks(); updateInspector();
  }

  // ---------- Modals ----------
  function createModalBackdrop() {
    let mb = $('wf-modal-backdrop');
    if (mb) return mb;
    mb = document.createElement('div'); mb.id = 'wf-modal-backdrop';
    mb.style.position = 'fixed'; mb.style.left = '0'; mb.style.top = '0'; mb.style.right = '0'; mb.style.bottom = '0';
    mb.style.zIndex = 28000; mb.style.background = 'rgba(0,0,0,0.45)'; mb.style.display = 'flex'; mb.style.justifyContent = 'center'; mb.style.alignItems = 'center';
    document.body.appendChild(mb); return mb;
  }
  function closeModal() { const mb = $('wf-modal-backdrop'); if (mb) mb.remove(); }

  function openNodeModal(node) {
    if (!node) return;
    const mb = createModalBackdrop(); mb.innerHTML = '';
    const card = document.createElement('div'); card.style.background = '#fff'; card.style.padding = '18px'; card.style.borderRadius = '10px'; card.style.minWidth = '420px'; card.style.boxShadow = '0 12px 40px rgba(0,0,0,0.3)';
    mb.appendChild(card);
    const h = document.createElement('h3'); h.textContent = 'Edit Node'; h.style.marginTop = '0'; card.appendChild(h);
    const inputTitle = document.createElement('input'); inputTitle.type = 'text'; inputTitle.value = node.title || ''; inputTitle.style.width = '100%'; inputTitle.style.marginBottom = '8px'; card.appendChild(inputTitle);
    const ta = document.createElement('textarea'); ta.value = node.body || ''; ta.style.width = '100%'; ta.style.height = '84px'; ta.style.marginBottom = '8px'; card.appendChild(ta);
    const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '8px'; row.style.marginBottom = '12px';
    const wInput = document.createElement('input'); wInput.type = 'number'; wInput.value = node.w || 220; wInput.style.flex = '1';
    const hInput = document.createElement('input'); hInput.type = 'number'; hInput.value = node.h || 100; hInput.style.flex = '1';
    row.appendChild(wInput); row.appendChild(hInput); card.appendChild(row);
    // color/icon/image inputs
    const colorRow = document.createElement('div'); colorRow.style.marginBottom = '12px';
    colorRow.innerHTML = `<label>Color <input id="modalColor" type="color" value="${node.color||'#ffffff'}" style="margin-left:8px"></label><div style="margin-top:8px"><label>Icon URL <input id="modalIcon" type="text" value="${node.iconUrl||''}" style="width:100%"></label><label style="display:block;margin-top:8px">Image URL <input id="modalImage" type="text" value="${node.imageUrl||''}" style="width:100%"></label></div>`;
    card.appendChild(colorRow);

    const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.justifyContent = 'flex-end'; actions.style.gap = '8px';
    const btnDelete = document.createElement('button'); btnDelete.textContent = 'Delete'; btnDelete.style.background = '#fff'; btnDelete.style.border = '1px solid #f44336'; btnDelete.style.color = '#f44336';
    const btnCancel = document.createElement('button'); btnCancel.textContent = 'Cancel';
    const btnSave = document.createElement('button'); btnSave.textContent = 'Save'; btnSave.style.background = '#1e88e5'; btnSave.style.color = '#fff'; btnSave.style.border = 'none';
    actions.appendChild(btnDelete); actions.appendChild(btnCancel); actions.appendChild(btnSave); card.appendChild(actions);

    btnCancel.addEventListener('click', () => closeModal());
    btnDelete.addEventListener('click', () => { if (confirm('Delete this node?')) { deleteNode(node.id); closeModal(); } });
    btnSave.addEventListener('click', () => {
      saveSnapshot();
      node.title = inputTitle.value; node.body = ta.value; node.w = parseInt(wInput.value, 10) || node.w; node.h = parseInt(hInput.value, 10) || node.h;
      node.color = (document.getElementById('modalColor') || {}).value || node.color;
      node.iconUrl = (document.getElementById('modalIcon') || {}).value || '';
      node.imageUrl = (document.getElementById('modalImage') || {}).value || '';
      markDirty(); renderNodes(); closeModal();
    });
    mb.addEventListener('click', ev => { if (ev.target === mb) closeModal(); });
  }

  function openLinkModal(link) {
    if (!link) return;
    const mb = createModalBackdrop(); mb.innerHTML = '';
    const card = document.createElement('div'); card.style.background = '#fff'; card.style.padding = '18px'; card.style.borderRadius = '10px'; card.style.minWidth = '360px'; card.style.boxShadow = '0 12px 40px rgba(0,0,0,0.3)'; mb.appendChild(card);
    const h = document.createElement('h3'); h.textContent = 'Edit Connection'; h.style.marginTop = '0'; card.appendChild(h);
    const labelInput = document.createElement('input'); labelInput.type = 'text'; labelInput.value = link.label || ''; labelInput.style.width = '100%'; labelInput.style.marginBottom = '12px'; card.appendChild(labelInput);
    const editPathBtn = document.createElement('button'); editPathBtn.textContent = link._editing ? 'Stop editing path' : 'Edit path'; editPathBtn.style.marginRight = '8px';
    const hint = document.createElement('div'); hint.style.color = '#666'; hint.style.fontSize = '12px'; hint.textContent = 'Double-click path to add bend (or Alt + dblclick)';
    card.appendChild(editPathBtn); card.appendChild(hint);
    const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.justifyContent = 'flex-end'; actions.style.gap = '8px';
    const btnDelete = document.createElement('button'); btnDelete.textContent = 'Delete'; btnDelete.style.background = '#fff'; btnDelete.style.border = '1px solid #f44336'; btnDelete.style.color = '#f44336';
    const btnCancel = document.createElement('button'); btnCancel.textContent = 'Cancel';
    const btnSave = document.createElement('button'); btnSave.textContent = 'Save'; btnSave.style.background = '#1e88e5'; btnSave.style.color = '#fff'; btnSave.style.border = 'none';
    actions.appendChild(btnDelete); actions.appendChild(btnCancel); actions.appendChild(btnSave); card.appendChild(actions);

    editPathBtn.addEventListener('click', () => { link._editing = !link._editing; renderLinks(); editPathBtn.textContent = link._editing ? 'Stop editing path' : 'Edit path'; });
    btnCancel.addEventListener('click', () => closeModal());
    btnDelete.addEventListener('click', () => { if (confirm('Delete this connection?')) { deleteLink(link.id); closeModal(); } });
    btnSave.addEventListener('click', () => { saveSnapshot(); link.label = labelInput.value.trim(); markDirty(); renderLinks(); closeModal(); });
    mb.addEventListener('click', ev => { if (ev.target === mb) closeModal(); });
  }

  // ---------- Grid & transform ----------
  function applyTransform() {
    board.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.scale})`;
    if (zoomIndicator) zoomIndicator.textContent = `${Math.round(state.transform.scale * 100)}%`;
    updateGrid();
    renderLinks();
  }
  function updateGrid() {
    if (!canvas) return;
    if (!state.grid.enabled) { canvas.style.backgroundImage = 'none'; return; }
    const size = state.grid.size || 25;
    const scaled = size * state.transform.scale;
    const bg = `linear-gradient(to right, var(--grid-color) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)`;
    const ox = state.transform.x % scaled;
    const oy = state.transform.y % scaled;
    canvas.style.backgroundImage = bg;
    canvas.style.backgroundSize = `${scaled}px ${scaled}px`;
    canvas.style.backgroundPosition = `${ox}px ${oy}px`;
  }

  // ---------- Save/Load/Export ----------
  async function saveModel() {
    if (!state.dirty) return;
    if (!window.AriesDB || typeof window.AriesDB.saveProjectWorkspace !== 'function') {
      localStorage.setItem('wf_local_' + (window.currentProjectId || 'local'), JSON.stringify({ nodes: model.nodes, links: model.links, groups: model.groups, savedAt: now() }));
      state.dirty = false; if (statusMeta) statusMeta.textContent = 'Saved (local)'; if (saveBoardBtn) saveBoardBtn.textContent = 'Save Board'; return;
    }
    try {
      const pid = window.currentProjectId || (new URL(window.location.href)).searchParams.get('id');
      await window.AriesDB.saveProjectWorkspace(pid, model.nodes, model.links);
      state.dirty = false;
      if (statusMeta) statusMeta.textContent = 'Saved';
      if (saveBoardBtn) saveBoardBtn.textContent = 'Saved!';
      setTimeout(()=> saveBoardBtn.textContent = 'Save Board', 1200);
    } catch (err) {
      console.error('Save failed', err); if (statusMeta) statusMeta.textContent = 'Save failed'; if (saveBoardBtn) saveBoardBtn.textContent = 'Save Board';
    }
  }

  async function loadModel() {
    if (!window.AriesDB || typeof window.AriesDB.loadProjectData !== 'function') {
      const saved = localStorage.getItem('wf_local_' + (window.currentProjectId || 'local'));
      if (saved) {
        try { const d = JSON.parse(saved); model.nodes.length = 0; model.links.length = 0; model.groups.length = 0; (d.nodes||[]).forEach(n=>model.nodes.push(n)); (d.links||[]).forEach(l=>model.links.push(l)); (d.groups||[]).forEach(g=>model.groups.push(g)); renderNodes(); applyTransform(); return; } catch(e){ console.warn('Local load failed', e); }
      }
      seedModel(); renderNodes(); applyTransform(); return;
    }
    try {
      const d = await window.AriesDB.loadProjectData(window.currentProjectId);
      if (d) {
        if (headerTitle && d.name) headerTitle.textContent = d.name;
        model.nodes.length = 0; model.links.length = 0; model.groups.length = 0;
        (d.nodes || []).forEach(n => model.nodes.push(n));
        (d.links || []).forEach(l => model.links.push(l));
      } else seedModel();
    } catch (err) {
      console.error('Load failed', err); seedModel();
    }
    applyTransform(); renderNodes();
  }

  function seedModel() {
    if (model.nodes.length === 0) {
      addNodeAt(200, 200, 'page', { title: 'Home' });
      addNodeAt(520, 200, 'action', { title: 'Login' });
      addNodeAt(860, 200, 'decision', { title: 'Auth?' });
    }
  }

  function downloadJSON() {
    const payload = { nodes: model.nodes, links: model.links, groups: model.groups, exportedAt: now() };
    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `workflow-${window.currentProjectId || 'board'}.json`; a.click(); URL.revokeObjectURL(url);
  }

  // ---------- Palette, drag-to-place, place-mode ----------
  function createFloatingPalette() {
    if ($('wf-palette')) return;
    const p = document.createElement('div'); p.id = 'wf-palette'; p.style.position = 'fixed'; p.style.left = '12px'; p.style.top = '92px'; p.style.zIndex = 15000; p.style.background = 'rgba(255,255,255,0.96)'; p.style.border = '1px solid rgba(0,0,0,0.06)'; p.style.padding = '8px'; p.style.borderRadius = '10px'; p.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)';
    const title = document.createElement('div'); title.textContent = 'Palette'; title.style.fontWeight = '700'; title.style.marginBottom = '6px'; p.appendChild(title);
    const items = [['Page','page'], ['Action','action'], ['Decision','decision']];
    items.forEach(([label,type])=>{
      const b = document.createElement('button'); b.textContent = label; b.style.display = 'block'; b.style.margin = '6px 0'; b.style.width = '120px';
      b.addEventListener('click', ()=> addNodeAt(undefined, undefined, type));
      b.setAttribute('draggable','true');
      b.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/work-node', type); showToast(`Drag and drop to board to place ${label}`); });
      p.appendChild(b);
    });
    const placeModeBtn = document.createElement('button'); placeModeBtn.id = 'wf-place-mode'; placeModeBtn.textContent = 'Place Mode'; placeModeBtn.style.display='block'; placeModeBtn.style.margin='6px 0'; placeModeBtn.style.width='120px';
    placeModeBtn.addEventListener('click', ()=> { state.placeMode = !state.placeMode; placeModeBtn.style.background = state.placeMode ? 'var(--accent)' : ''; placeModeBtn.style.color = state.placeMode ? '#fff' : ''; showToast(state.placeMode ? 'Place mode enabled' : 'Place mode disabled'); });
    p.appendChild(placeModeBtn);
    const grouping = document.createElement('button'); grouping.textContent = 'Group'; grouping.style.display='block'; grouping.style.margin='6px 0'; grouping.style.width='120px';
    grouping.addEventListener('click', ()=> {
      if (state.selectedNodes.size < 1) return showToast('Select nodes to group');
      const ids = Array.from(state.selectedNodes);
      const g = { id: uid('g'), name: 'Group ' + (model.groups.length + 1), nodeIds: ids };
      model.groups.push(g);
      saveSnapshot(); markDirty(); showToast('Group created');
    });
    p.appendChild(grouping);
    const autoLayout = document.createElement('button'); autoLayout.textContent = 'Auto-layout'; autoLayout.style.display='block'; autoLayout.style.margin='6px 0'; autoLayout.style.width='120px';
    autoLayout.addEventListener('click', ()=> { runAutoLayout(); });
    p.appendChild(autoLayout);
    const saveTpl = document.createElement('button'); saveTpl.textContent = 'Save Template'; saveTpl.style.display='block'; saveTpl.style.margin='6px 0'; saveTpl.style.width='120px';
    saveTpl.addEventListener('click', ()=> {
      if (state.selectedNodes.size === 0) return showToast('Select nodes to save as template');
      const ids = Array.from(state.selectedNodes);
      const nodes = model.nodes.filter(n => ids.includes(n.id));
      const tpl = { id: uid('tpl'), name: 'Template ' + (state.templates.length + 1), nodes: deepClone(nodes) };
      state.templates.push(tpl);
      showToast('Template saved (local)');
    });
    p.appendChild(saveTpl);
    document.body.appendChild(p);
    // board drop handling
    board.addEventListener('dragover', ev => ev.preventDefault());
    board.addEventListener('drop', ev => {
      ev.preventDefault();
      const type = ev.dataTransfer.getData('text/work-node');
      if (!type) return;
      const b = screenToBoard(ev.clientX, ev.clientY);
      addNodeAt(b.x, b.y, type);
    });
  }

  // ---------- Toast ----------
  function showToast(msg, timeout = 2200) {
    const root = $('wf-toast');
    if (!root) return;
    const item = document.createElement('div'); item.className = 'wf-toast-item'; item.style.background = 'rgba(0,0,0,0.78)'; item.style.color = '#fff'; item.style.padding = '10px 14px'; item.style.borderRadius = '8px'; item.style.marginTop = '8px'; item.style.fontWeight = '600';
    item.textContent = msg; root.appendChild(item);
    setTimeout(()=> { item.style.transition = 'opacity 300ms'; item.style.opacity = '0'; setTimeout(()=> item.remove(), 320); }, timeout);
  }

  // ---------- Onboarding ----------
  function startOnboarding() {
    const overlay = $('wf-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    const text = document.getElementById('wf-overlay-text');
    const steps = [
      'Anchors: Each node has 8 anchor points. Hover any node to reveal anchors. Drag from anchor to connect.',
      'Links: Aligned nodes get straight connectors. Non-aligned nodes create orthogonal bend points that you can edit.',
      'Edit Links: Double-click a link to open its editor; toggle path editing then drag handles to reshape.',
      'Connect-to-connector: Drag to an existing line to create a junction and split the link.',
      'Grouping & Auto-layout: Select multiple nodes and press Group or Auto-layout in the palette.',
      'Export: Use Export JSON or Export SVG/PNG to share or publish your work.'
    ];
    let idx = 0;
    const update = () => { if (idx >= steps.length) { overlay.style.display = 'none'; showToast('Tour finished'); return; } text.textContent = steps[idx]; };
    update();
    const nextBtn = $('wf-next'); const skipBtn = $('wf-skip');
    if (nextBtn) nextBtn.onclick = ()=> { idx++; update(); };
    if (skipBtn) skipBtn.onclick = ()=> { overlay.style.display = 'none'; showToast('Tour skipped'); };
  }

  // ---------- Bindings ----------
  function setupBindings() {
    if (toolAddPage) toolAddPage.addEventListener('click', ()=> addNodeAt(undefined, undefined, 'page'));
    if (toolAddAction) toolAddAction.addEventListener('click', ()=> addNodeAt(undefined, undefined, 'action'));
    if (toolAddDecision) toolAddDecision.addEventListener('click', ()=> addNodeAt(undefined, undefined, 'decision'));
    if (toolDeleteNode) toolDeleteNode.addEventListener('click', ()=> { Array.from(state.selectedNodes).forEach(id => deleteNode(id)); state.selectedNodes.clear(); renderNodes(); });
    if (toolDeleteLink) toolDeleteLink.addEventListener('click', ()=> { if (state.selectedLinkId) deleteLink(state.selectedLinkId); });

    if (canvas) canvas.addEventListener('pointerdown', onCanvasDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);

    const zoomFactor = 1.2;
    if (zoomInCorner) zoomInCorner.addEventListener('click', ()=> { state.transform.scale = clamp(state.transform.scale * zoomFactor, 0.25, 3); applyTransform(); });
    if (zoomOutCorner) zoomOutCorner.addEventListener('click', ()=> { state.transform.scale = clamp(state.transform.scale / zoomFactor, 0.25, 3); applyTransform(); });
    if (centerBtn) centerBtn.addEventListener('click', ()=> { state.transform = { x: 0, y: 0, scale: 1 }; applyTransform(); });
    if (zoomFitBtn) zoomFitBtn.addEventListener('click', zoomToFit);

    if (showGrid) showGrid.addEventListener('change', ()=> { state.grid.enabled = showGrid.checked; applyTransform(); });
    if (gridSizeInput) gridSizeInput.addEventListener('change', ()=> { state.grid.size = parseInt(gridSizeInput.value) || 25; applyTransform(); });

    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t) return;
      if (t.closest && (t.closest('.node') || t.closest('.link-path'))) return;
      if (t.closest && (t.closest('#inspector') || t.closest('.topbar') || t.closest('.header-actions') || t.closest('#floatingTools') || t.closest('.controls-panel') || t.closest('#contextMenu') || t.closest('.modal-backdrop') || t.closest('.modal-card') || t.closest('#wf-modal-backdrop') || t.closest('#wf-overlay'))) return;
      state.selectedNodes.clear(); state.selectedLinkId = null;
      if (toolDeleteNode) toolDeleteNode.disabled = true;
      if (toolDeleteLink) toolDeleteLink.disabled = true;
      const cm = $('contextMenu'); if (cm) cm.style.display = 'none';
      renderNodes(); renderLinks(); updateInspector();
    });

    if (exportJsonBtn) exportJsonBtn.addEventListener('click', downloadJSON);
    if (importJsonBtn && importFile) importJsonBtn.addEventListener('click', ()=> importFile.click());
    if (importFile) {
      importFile.addEventListener('change', ev => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = function(e) {
          try {
            const data = JSON.parse(e.target.result);
            saveSnapshot();
            model.nodes.length = 0; model.links.length = 0; (data.nodes || []).forEach(n => model.nodes.push(n)); (data.links || []).forEach(l => model.links.push(l));
            markDirty(); renderNodes(); applyTransform(); showToast('Imported JSON');
          } catch(err) { alert('Import failed: ' + err.message); }
        };
        reader.readAsText(f);
      });
    }

    if (autosizeBtn) autosizeBtn.addEventListener('click', autoResizeBoard);
    if (clearAllBtn) clearAllBtn.addEventListener('click', ()=> { if (confirm('Clear all nodes and links?')) { saveSnapshot(); model.nodes.length = 0; model.links.length = 0; state.selectedNodes.clear(); markDirty(); renderNodes(); }});

    // keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (isTyping()) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedNodes.size > 0) {
          saveSnapshot(); Array.from(state.selectedNodes).forEach(id => deleteNode(id)); state.selectedNodes.clear(); renderNodes(); markDirty();
        } else if (state.selectedLinkId) { saveSnapshot(); deleteLink(state.selectedLinkId); }
      } else if (e.key === 'Escape') {
        state.linkDraw = null; state.dragInfo = null; const cm = $('contextMenu'); if (cm) cm.style.display = 'none'; renderLinks(); try { board.classList.remove('wf-link-drawing'); } catch(e){}
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
      else if (e.key.toLowerCase() === 'g') {
        if (state.selectedNodes.size < 1) return;
        const ids = Array.from(state.selectedNodes);
        model.groups.push({ id: uid('g'), name: 'Group ' + (model.groups.length + 1), nodeIds: ids });
        saveSnapshot(); markDirty(); showToast('Group created');
      }
    });
  }

  // ---------- CSS injection for anchor hover & UI ----------
  (function injectCSS() {
    if (document.getElementById('wf-styles')) return;
    const css = `
/* anchors hidden until hover */
.node .anchor-dot { opacity: 0; transition: opacity 140ms ease; pointer-events: none; }
.node:hover .anchor-dot { opacity: 1; pointer-events: auto; }
.anchor-dot { transition: border-color 120ms ease, opacity 120ms ease; box-sizing:border-box; width:${CONFIG.anchorDotSize}px; height:${CONFIG.anchorDotSize}px; }
.node.selected { outline: 2px solid rgba(59,132,255,0.12); box-shadow: 0 12px 28px rgba(29,78,216,0.06) inset; }
.link-label { font-family: sans-serif; font-size: 13px; fill: #111827; pointer-events:none; }
.wf-toast-item { font-weight:700; }
/* When drawing a link, show and enable all anchors so elementFromPoint finds them reliably */
.wf-link-drawing .node .anchor-dot { opacity: 1 !important; pointer-events: auto !important; transform: scale(1.05); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
`;
    const s = document.createElement('style'); s.id = 'wf-styles'; s.innerHTML = css; document.head.appendChild(s);
  })();

  // ---------- Auto-layout (simple grid layout) ----------
  function runAutoLayout() {
    if (state.selectedNodes.size === 0) {
      const nodes = model.nodes.filter(n => !n._junction);
      if (nodes.length === 0) return;
      const cols = Math.ceil(Math.sqrt(nodes.length));
      const spacingX = 280, spacingY = 160;
      const startX = 80, startY = 80;
      saveSnapshot();
      nodes.forEach((n, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        n.x = startX + c * spacingX;
        n.y = startY + r * spacingY;
      });
      markDirty(); renderNodes(); showToast('Auto-layout applied to all nodes');
      return;
    }
    const ids = Array.from(state.selectedNodes);
    const nodes = model.nodes.filter(n => ids.includes(n.id));
    if (nodes.length === 0) return;
    const cols = Math.ceil(Math.sqrt(nodes.length));
    const spacingX = 260, spacingY = 140;
    const centroidX = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
    const centroidY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
    saveSnapshot();
    nodes.forEach((n, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      n.x = centroidX + (c - Math.floor(cols / 2)) * spacingX;
      n.y = centroidY + r * spacingY;
    });
    markDirty(); renderNodes(); showToast('Auto-layout applied to selection');
  }

  // ---------- Group operations (move together) ----------
  function ungroup(groupId) {
    model.groups = model.groups.filter(g => g.id !== groupId);
    saveSnapshot(); markDirty(); showToast('Group removed');
  }

  // ---------- Export SVG & PNG ----------
  function exportAsSVG() {
    const bbox = board.getBoundingClientRect();
    const width = Math.max(board.offsetWidth, bbox.width);
    const height = Math.max(board.offsetHeight, bbox.height);
    const svgClone = svg.cloneNode(true);
    svgClone.removeAttribute('id');
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    model.nodes.forEach(node => {
      const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      fo.setAttribute('x', String(node.x));
      fo.setAttribute('y', String(node.y));
      fo.setAttribute('width', String(node.w));
      fo.setAttribute('height', String(node.h));
      const div = document.createElement('div');
      div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      div.style.width = node.w + 'px';
      div.style.height = node.h + 'px';
      div.style.boxSizing = 'border-box';
      div.style.padding = '10px';
      div.style.fontFamily = 'Arial, Helvetica, sans-serif';
      div.style.fontSize = '13px';
      div.style.background = node.color || '#fff';
      div.style.borderRadius = '8px';
      div.innerHTML = `<div style="font-weight:700">${escape(node.title)}</div><div>${escape(node.body)}</div>`;
      fo.appendChild(div);
      svgClone.appendChild(fo);
    });

    const svgStr = new XMLSerializer().serializeToString(svgClone);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `workflow-${window.currentProjectId||'board'}.svg`; a.click(); URL.revokeObjectURL(url);
  }

  function exportAsPNG() {
    const bbox = board.getBoundingClientRect();
    const width = Math.max(board.offsetWidth, bbox.width);
    const height = Math.max(board.offsetHeight, bbox.height);
    const svgClone = svg.cloneNode(true);
    svgClone.removeAttribute('id');
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));
    model.nodes.forEach(node => {
      const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      fo.setAttribute('x', String(node.x));
      fo.setAttribute('y', String(node.y));
      fo.setAttribute('width', String(node.w));
      fo.setAttribute('height', String(node.h));
      const div = document.createElement('div');
      div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      div.style.width = node.w + 'px';
      div.style.height = node.h + 'px';
      div.style.boxSizing = 'border-box';
      div.style.padding = '10px';
      div.style.fontFamily = 'Arial, Helvetica, sans-serif';
      div.style.fontSize = '13px';
      div.style.background = node.color || '#fff';
      div.style.borderRadius = '8px';
      div.innerHTML = `<div style="font-weight:700">${escape(node.title)}</div><div>${escape(node.body)}</div>`;
      fo.appendChild(div);
      svgClone.appendChild(fo);
    });
    const svgStr = new XMLSerializer().serializeToString(svgClone);
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = function() {
      try {
        const canvasEl = document.createElement('canvas'); canvasEl.width = img.width; canvasEl.height = img.height;
        const ctx = canvasEl.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvasEl.width, canvasEl.height);
        ctx.drawImage(img, 0, 0);
        canvasEl.toBlob(function(blob) {
          const url2 = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url2; a.download = `workflow-${window.currentProjectId||'board'}.png`; a.click(); URL.revokeObjectURL(url2);
        }, 'image/png');
      } catch(e) { alert('Export PNG failed: ' + e.message); }
      URL.revokeObjectURL(url);
    };
    img.onerror = function(e) { alert('PNG export failed (image load error)'); URL.revokeObjectURL(url); };
    img.src = url;
  }

  // ---------- Version history (local) ----------
  function saveVersion(name) {
    const key = CONFIG.versionKeyPrefix + (window.currentProjectId || 'local');
    const versions = JSON.parse(localStorage.getItem(key) || '[]');
    const entry = { id: uid('v'), name: name || ('Version ' + (versions.length + 1)), nodes: deepClone(model.nodes), links: deepClone(model.links), groups: deepClone(model.groups), createdAt: now() };
    versions.push(entry);
    localStorage.setItem(key, JSON.stringify(versions));
    showToast('Version saved locally');
  }
  function listVersions() {
    const key = CONFIG.versionKeyPrefix + (window.currentProjectId || 'local');
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  function restoreVersion(versionId) {
    const key = CONFIG.versionKeyPrefix + (window.currentProjectId || 'local');
    const versions = JSON.parse(localStorage.getItem(key) || '[]');
    const v = versions.find(x => x.id === versionId);
    if (!v) return showToast('Version not found');
    saveSnapshot();
    model.nodes.length = 0; model.links.length = 0; model.groups.length = 0;
    (v.nodes || []).forEach(n => model.nodes.push(n));
    (v.links || []).forEach(l => model.links.push(l));
    (v.groups || []).forEach(g => model.groups.push(g));
    markDirty(); renderNodes(); showToast('Version restored');
  }

  // ---------- Shareable read-only (blob URL) ----------
  function createShareableReadOnly() {
    const payload = { nodes: model.nodes, links: model.links, exportedAt: now() };
    const data = JSON.stringify(payload);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    showToast('Shareable read-only JSON created (copy from console)');
    console.log('Shareable JSON URL (blob):', url);
    return url;
  }

  // ---------- Export shortcuts UI (attached to floatingTools or controls) ----------
  function attachExportButtons() {
    const ft = $('floatingTools') || document.createElement('div');
    ft.id = 'floatingTools';
    if (!$('floatingTools')) { ft.style.position='fixed'; ft.style.left='18px'; ft.style.bottom='18px'; ft.style.zIndex = 13000; ft.style.background='rgba(255,255,255,0.96)'; ft.style.padding='10px'; ft.style.borderRadius='12px'; ft.style.boxShadow='0 8px 30px rgba(2,6,23,0.06)'; document.body.appendChild(ft); }
    const exportSVGBtn = document.createElement('button'); exportSVGBtn.textContent = 'Export SVG'; exportSVGBtn.className='btn';
    const exportPNGBtn = document.createElement('button'); exportPNGBtn.textContent = 'Export PNG'; exportPNGBtn.className='btn';
    const saveVerBtn = document.createElement('button'); saveVerBtn.textContent = 'Save Version'; saveVerBtn.className='btn';
    const shareBtn = document.createElement('button'); shareBtn.textContent = 'Share JSON'; shareBtn.className='btn';
    exportSVGBtn.onclick = exportAsSVG;
    exportPNGBtn.onclick = exportAsPNG;
    saveVerBtn.onclick = ()=> { const name = prompt('Version name', 'Version ' + (listVersions().length + 1)); if (name !== null) saveVersion(name); };
    shareBtn.onclick = ()=> { const url = createShareableReadOnly(); prompt('Shareable read-only blob URL (copy it now):', url); };
    ft.appendChild(exportSVGBtn); ft.appendChild(exportPNGBtn); ft.appendChild(saveVerBtn); ft.appendChild(shareBtn);
  }

  // ---------- Helper escape ----------
  function escape(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  // ---------- Zoom to fit & autosize ----------
  function autoResizeBoard() {
    if (!board) return;
    if (model.nodes.length === 0) { board.style.width = '1200px'; board.style.height = '900px'; return; }
    const pad = 140;
    const maxX = Math.max(...model.nodes.map(n => n.x + (n.w || 220)));
    const maxY = Math.max(...model.nodes.map(n => n.y + (n.h || 100)));
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
    if (!canvas || !board) { state.transform = { x: 0, y: 0, scale: 1 }; applyTransform(); return; }
    if (model.nodes.length === 0) { state.transform = { x: 0, y: 0, scale: 1 }; applyTransform(); return; }
    const minX = Math.min(...model.nodes.map(n => n.x));
    const minY = Math.min(...model.nodes.map(n => n.y));
    const maxX = Math.max(...model.nodes.map(n => n.x + (n.w || 220)));
    const maxY = Math.max(...model.nodes.map(n => n.y + (n.h || 100)));
    const pad = 80;
    const bboxW = (maxX - minX) + pad*2;
    const bboxH = (maxY - minY) + pad*2;
    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    const scaleX = viewW / bboxW;
    const scaleY = viewH / bboxH;
    const scale = clamp(Math.min(scaleX, scaleY, 1.6), 0.2, 1.6);
    state.transform.scale = scale;
    const centerBoardX = (minX + maxX) / 2;
    const centerBoardY = (minY + maxY) / 2;
    state.transform.x = (viewW / 2) - (centerBoardX * state.transform.scale);
    state.transform.y = (viewH / 2) - (centerBoardY * state.transform.scale);
    applyTransform();
  }

  // ---------- Boot & API exposure ----------
  function boot() {
    state.grid.enabled = (showGrid ? showGrid.checked : true);
    state.grid.size = (gridSizeInput ? parseInt(gridSizeInput.value || 25, 10) : 25);
    createFloatingPalette();
    setupBindings();
    loadModel();
    renderNodes();
    applyTransform();
    attachExportButtons();
    setTimeout(()=> { const o = $('wf-overlay'); if (o) startOnboarding(); }, 600);

    // Expose debug API & helper functions
    window._wf = window._wf || {};
    Object.assign(window._wf, {
      model, state, renderNodes, renderLinks, saveModel, loadModel, addNodeAt, addLinkObj, autoResizeBoard, zoomToFit, computeAnchorsForNode,
      undo, redo, runAutoLayout, ungroup, exportAsSVG, exportAsPNG, createShareableReadOnly, saveVersion, listVersions, restoreVersion
    });

    console.log('Workspace loaded. Debug API available at window._wf');
  }
  document.addEventListener('DOMContentLoaded', boot);

  // ---------- Keep last pointer ----------
  document.addEventListener('pointermove', (e) => { window._lastMouse = { clientX: e.clientX, clientY: e.clientY }; });

  // ---------- Helper: polyToPath (copied for completeness) ----------
  function polyToPath(points, cornerRadius) {
    if (!points || points.length < 2) return '';
    const r = Math.max(0, cornerRadius || 0);
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], cur = points[i], next = points[i + 1];
      if (next && r > 0) {
        const vx = cur.x - prev.x, vy = cur.y - prev.y;
        const nx = next.x - cur.x, ny = next.y - cur.y;
        const inLen = Math.sqrt(vx * vx + vy * vy) || 1;
        const outLen = Math.sqrt(nx * nx + ny * ny) || 1;
        const rad = Math.min(r, inLen / 2, outLen / 2);
        const ux = vx / inLen, uy = vy / inLen;
        const ox = nx / outLen, oy = ny / outLen;
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

})();
