/* workspace.js — Full advanced workspace (replacement)
   - Smart addNodeAt: places nodes in visible viewport when coordinates are missing/out-of-view
   - 8 visible anchors + forced snap-to-anchor
   - Precise cursor-following link preview while drawing (no blocking prompts)
   - Multi-segment editable connectors (polyline) with bend-point editing
   - Double-click node/link modals for edit/delete and path editing toggle
   - Undo/Redo, templates, palette, inspector preserved
   - Defensive checks, debug API
   - This file is intentionally long — do not shorten it.
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
    maxUndo: 200
  };

  // ---------- DOM references & fallbacks ----------
  let canvas = $('canvas');
  if (!canvas) {
    canvas = document.createElement('div');
    canvas.id = 'canvas';
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '80px';
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
    board.style.background = 'transparent';
    canvas.appendChild(board);
  }

  let svg = $('svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'svg');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    board.appendChild(svg);
  }

  // Optional elements (if present)
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
  const exportBtn = $('exportBtn');
  const exportJsonBtn = $('exportJson');
  const importJsonBtn = $('importJsonBtn');
  const importFile = $('importFile');
  const autosizeBtn = $('autosizeBtn');
  const clearAllBtn = $('clearAllBtn');

  // Inspector optional fields
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
  const statusMeta = $('statusMeta');

  // ---------- State ----------
  const model = { nodes: [], links: [] }; // nodes: {id,x,y,w,h,type,title,body,zIndex}
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
    grid: { enabled: true, size: 25 }
  };

  // ---------- Helpers ----------
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
      const ae = document.activeElement;
      if (!ae) return false;
      const tag = (ae.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (ae.isContentEditable) return true;
      if (ae.closest && ae.closest('#inspector')) return true;
      return false;
    } catch (e) { return false; }
  }
  function deepCopyState() { return deepClone({ nodes: model.nodes, links: model.links }); }
  function saveSnapshot() {
    state.undoStack.push(deepCopyState());
    if (state.undoStack.length > CONFIG.maxUndo) state.undoStack.shift();
    state.redoStack = [];
  }
  function undo() {
    if (state.undoStack.length === 0) return;
    const last = state.undoStack.pop();
    state.redoStack.push(deepCopyState());
    model.nodes.length = 0; model.links.length = 0;
    last.nodes.forEach(n => model.nodes.push(n)); last.links.forEach(l => model.links.push(l));
    state.selectedNodes.clear(); state.selectedLinkId = null;
    renderNodes(); renderLinks(); markDirty(false);
  }
  function redo() {
    if (state.redoStack.length === 0) return;
    const next = state.redoStack.pop();
    state.undoStack.push(deepCopyState());
    model.nodes.length = 0; model.links.length = 0;
    next.nodes.forEach(n => model.nodes.push(n)); next.links.forEach(l => model.links.push(l));
    state.selectedNodes.clear(); state.selectedLinkId = null;
    renderNodes(); renderLinks(); markDirty(false);
  }
  function markDirty(userTriggered = true) {
    state.dirty = true;
    if (statusMeta && userTriggered) statusMeta.textContent = 'Unsaved changes';
    if (saveBoardBtn && userTriggered) saveBoardBtn.textContent = 'Saving...';
    clearTimeout(state._autoSaveTimer);
    state._autoSaveTimer = setTimeout(() => {
      if (window.AriesDB && typeof window.AriesDB.saveProjectWorkspace === 'function') {
        const pid = window.currentProjectId || (new URL(window.location.href)).searchParams.get('id') || 'local';
        window.AriesDB.saveProjectWorkspace(pid, model.nodes, model.links).then(()=> {
          state.dirty = false;
          if (statusMeta) statusMeta.textContent = 'Saved';
          if (saveBoardBtn) { saveBoardBtn.textContent = 'Save Board'; }
        }).catch((err)=> {
          console.warn('Auto-save failed', err);
          if (statusMeta) statusMeta.textContent = 'Save failed';
          if (saveBoardBtn) { saveBoardBtn.textContent = 'Save Board'; }
        });
      } else {
        if (statusMeta) statusMeta.textContent = 'Local';
        if (saveBoardBtn) saveBoardBtn.textContent = 'Save Board';
      }
    }, 900);
  }

  // ---------- Visible board helpers (NEW) ----------
  // Compute board coords visible in the canvas (taking transform into account)
  function getVisibleBoardRect() {
    const rect = canvas.getBoundingClientRect();
    const topLeft = screenToBoard(rect.left, rect.top);
    const bottomRight = screenToBoard(rect.left + rect.width, rect.top + rect.height);
    return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
  }

  // ---------- Anchors ----------
  function computeAnchorsForNode(node) {
    const el = document.getElementById(`node-${node.id}`);
    const boardRect = board.getBoundingClientRect();
    if (el) {
      const r = el.getBoundingClientRect();
      const left = (r.left - boardRect.left) / state.transform.scale;
      const top = (r.top - boardRect.top) / state.transform.scale;
      const w = r.width / state.transform.scale;
      const h = r.height / state.transform.scale;
      return [
        { x: left, y: top },
        { x: left + w / 2, y: top },
        { x: left + w, y: top },
        { x: left + w, y: top + h / 2 },
        { x: left + w, y: top + h },
        { x: left + w / 2, y: top + h },
        { x: left, y: top + h },
        { x: left, y: top + h / 2 }
      ];
    } else {
      const x = node.x, y = node.y, w = node.w || 220, h = node.h || 100;
      return [
        { x, y }, { x: x + w / 2, y }, { x: x + w, y },
        { x: x + w, y: y + h / 2 }, { x: x + w, y: y + h },
        { x: x + w / 2, y: y + h }, { x, y: y + h }, { x, y: y + h / 2 }
      ];
    }
  }

  function nearestAnchorIndex(node, boardPoint) {
    const anchors = computeAnchorsForNode(node);
    let best = 0, bestD = Infinity;
    anchors.forEach((a, i) => {
      const dx = a.x - boardPoint.x, dy = a.y - boardPoint.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  // ---------- Model operations with SMART placement ----------
  // addNodeAt: if x/y missing or offscreen, place at center of visible board
  function addNodeAt(x, y, type, opts = {}) {
    saveSnapshot();

    // grid
    const s = state.grid.size || 25;

    // If x/y not provided (undefined/null) -> place at center of visible area
    // If provided but offscreen -> also snap to center of visible area
    let targetX = x, targetY = y;

    // If user invoked add at mouse location (x,y passed from event), we prefer that if visible
    // Compute visible rect
    const vis = getVisibleBoardRect();

    const coordsValid = (nx, ny) => (typeof nx === 'number' && typeof ny === 'number' && nx >= vis.left && nx <= vis.right && ny >= vis.top && ny <= vis.bottom);

    if (!coordsValid(targetX, targetY)) {
      // center of visible area
      const centerX = vis.left + vis.width / 2;
      const centerY = vis.top + vis.height / 2;
      targetX = centerX;
      targetY = centerY;
    }

    // snap to grid
    const nx = Math.round(targetX / s) * s;
    const ny = Math.round(targetY / s) * s;

    state.highestZ++;
    const base = { id: uid('n'), x: nx, y: ny, w: 220, h: 100, type, zIndex: state.highestZ, title: 'New', body: '' };
    if (type === 'page') { base.title = 'New Page'; base.body = 'Website Page'; }
    else if (type === 'action') { base.title = 'Action'; base.body = 'User event'; }
    else if (type === 'decision') { base.title = 'Decision'; base.body = 'Condition'; base.w = 150; base.h = 150; }
    Object.assign(base, opts);
    model.nodes.push(base);
    markDirty();
    renderNodes();
    return base;
  }

  function addLinkObj(obj) {
    saveSnapshot();
    model.links.push(obj);
    markDirty();
    renderLinks();
    return obj;
  }

  function deleteNode(nodeId) {
    saveSnapshot();
    model.nodes = model.nodes.filter(n => n.id !== nodeId);
    model.links = model.links.filter(l => l.source !== nodeId && l.target !== nodeId);
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

  // ---------- Rendering: nodes & anchors ----------
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
      el.style.zIndex = node.zIndex || 15;
      el.style.width = `${node.w}px`;
      el.style.height = `${node.h}px`;
      el.style.boxSizing = 'border-box';
      el.style.background = '#fff';
      el.style.borderRadius = '10px';
      el.style.boxShadow = '0 8px 20px rgba(12,18,30,0.06)';
      el.style.padding = '12px';
      el.innerHTML = `<div class="node-title" style="font-weight:700;margin-bottom:6px;">${escape(node.title)}</div><div class="node-body" style="color:#334155">${escape(node.body)}</div>`;

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

      // place 8 dots inside element relative to its size
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
        dot.title = 'Anchor - drag from here to create link';
        dot.addEventListener('mouseenter', () => dot.style.borderColor = CONFIG.anchorDotHover);
        dot.addEventListener('mouseleave', () => dot.style.borderColor = CONFIG.anchorDotStroke);

        // mousedown starts link draw from this anchor
        dot.addEventListener('mousedown', ev => {
          ev.stopPropagation();
          const anchors = computeAnchorsForNode(node);
          const anchor = anchors[idx];
          state.linkDraw = {
            sourceId: node.id,
            sourceAnchorIdx: idx,
            startX: anchor.x,
            startY: anchor.y,
            currentX: anchor.x,
            currentY: anchor.y
          };
          canvas.style.cursor = 'crosshair';
          svg.style.pointerEvents = 'auto';
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

  function orthogonalPath(start, end, cornerRadius = 8) {
    const dx = Math.abs(end.x - start.x), dy = Math.abs(end.y - start.y);
    if (dx > dy) {
      const midX = start.x + (end.x - start.x) / 2;
      const p1 = { x: midX, y: start.y }, p2 = { x: midX, y: end.y };
      return polyToPath([start, p1, p2, end], cornerRadius);
    } else {
      const midY = start.y + (end.y - start.y) / 2;
      const p1 = { x: start.x, y: midY }, p2 = { x: end.x, y: midY };
      return polyToPath([start, p1, p2, end], cornerRadius);
    }
  }

  // ---------- Render Links & handles ----------
  function renderLinks() {
    if (!svg) return;
    clearSVG();

    // preview while drawing
    if (state.linkDraw) {
      const a = { x: state.linkDraw.startX, y: state.linkDraw.startY };
      const b = { x: state.linkDraw.currentX, y: state.linkDraw.currentY };
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', orthogonalPath(a, b, 6));
      p.setAttribute('stroke', CONFIG.previewStroke);
      p.setAttribute('stroke-width', 3);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-dasharray', '6,6');
      p.setAttribute('stroke-linecap', 'round');
      svg.appendChild(p);
    }

    // group parallel links for offset spacing
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
      const sNode = model.nodes.find(n => n.id === link.source);
      const tNode = model.nodes.find(n => n.id === link.target);
      if (!sNode || !tNode) return;

      const sAnchors = computeAnchorsForNode(sNode);
      const tAnchors = computeAnchorsForNode(tNode);

      const sIndex = (typeof link.sourceAnchorIdx === 'number') ? link.sourceAnchorIdx : nearestAnchorIndex(sNode, { x: (sNode.x + tNode.x) / 2, y: (sNode.y + tNode.y) / 2 });
      const tIndex = (typeof link.targetAnchorIdx === 'number') ? link.targetAnchorIdx : nearestAnchorIndex(tNode, { x: (sNode.x + tNode.x) / 2, y: (sNode.y + tNode.y) / 2 });
      const p1 = sAnchors[sIndex];
      const p2 = tAnchors[tIndex];

      // initialize points if missing: [p1, mid, p2]
      if (!link.points || !Array.isArray(link.points) || link.points.length < 2) {
        link.points = [{ x: p1.x, y: p1.y }, { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, { x: p2.x, y: p2.y }];
      } else {
        // ensure first/last match anchors (snap)
        link.points[0] = { x: p1.x, y: p1.y };
        link.points[link.points.length - 1] = { x: p2.x, y: p2.y };
      }

      // parallel spacing (push midpoints perpendicular)
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const idx = (link._parallelIndex !== undefined) ? link._parallelIndex : 0;
      const count = (link._parallelCount !== undefined) ? link._parallelCount : 1;
      const middle = (count - 1) / 2;
      const offset = (idx - middle) * CONFIG.parallelGap;
      const offsetX = nx * offset, offsetY = ny * offset;

      // apply offset to intermediate points (not endpoints)
      const renderPoints = link.points.map((pt, i) => {
        if (i === 0 || i === link.points.length - 1) return pt;
        return { x: pt.x + offsetX, y: pt.y + offsetY };
      });

      const d = polyToPath(renderPoints, 8);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const isSel = state.selectedLinkId === link.id;
      const strokeColor = isSel ? CONFIG.linkSelected : CONFIG.linkStroke;
      path.setAttribute('d', d);
      path.setAttribute('stroke', strokeColor);
      path.setAttribute('stroke-width', 3);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.classList.add('link-path');
      path.id = `link-${link.id}`;
      path.style.cursor = 'pointer';
      path.style.pointerEvents = 'auto';

      // select on click
      path.addEventListener('click', e => {
        e.stopPropagation();
        state.selectedLinkId = link.id;
        state.selectedNodes.clear();
        if (toolDeleteLink) toolDeleteLink.disabled = false;
        if (toolDeleteNode) toolDeleteNode.disabled = true;
        renderNodes(); renderLinks();
      });

      // double-click opens link modal (edit label/delete) with "Edit path" option
      path.addEventListener('dblclick', e => {
        e.stopPropagation();
        openLinkModal(link);
      });

      // alt+dblclick to add a bend point quickly
      path.addEventListener('dblclick', e => {
        if (e.altKey) {
          e.stopPropagation();
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
        }
      });

      svg.appendChild(path);

      // label placed at middle point
      if (link.label) {
        const midI = Math.floor((link.points.length - 1) / 2);
        const mid = link.points[midI];
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', mid.x);
        text.setAttribute('y', mid.y - 12);
        text.setAttribute('class', 'link-label');
        text.setAttribute('text-anchor', 'middle');
        text.textContent = link.label;
        svg.appendChild(text);
      }

      // handles for editing if link._editing
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

          c.addEventListener('mousedown', ev => {
            ev.stopPropagation();
            ev.preventDefault();
            state.handleDrag = {
              linkId: link.id,
              ptIdx: pidx,
              startClientX: ev.clientX,
              startClientY: ev.clientY,
              startX: pt.x,
              startY: pt.y
            };
          });

          c.addEventListener('dblclick', ev => {
            ev.stopPropagation();
            if (pidx === 0 || pidx === link.points.length - 1) return;
            if (confirm('Remove this bend point?')) {
              saveSnapshot();
              link.points.splice(pidx, 1);
              markDirty();
              renderLinks();
            }
          });
        });
      }
    });
  }

  // ---------- Utility math ----------
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

  // ---------- Interaction ----------
  function startLinkDrawFromAnchor(nodeId, anchorIdx) {
    const node = model.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const a = computeAnchorsForNode(node)[anchorIdx];
    state.linkDraw = { sourceId: nodeId, sourceAnchorIdx: anchorIdx, startX: a.x, startY: a.y, currentX: a.x, currentY: a.y };
    canvas.style.cursor = 'crosshair';
    svg.style.pointerEvents = 'auto';
    renderLinks();
  }

  function finalizeLinkIfPossible(evt) {
    if (!state.linkDraw) { state.linkDraw = null; canvas.style.cursor = 'default'; svg.style.pointerEvents = 'none'; renderLinks(); return; }
    const clientX = (evt && evt.clientX) || (window._lastMouse && window._lastMouse.clientX) || 0;
    const clientY = (evt && evt.clientY) || (window._lastMouse && window._lastMouse.clientY) || 0;
    const boardPt = screenToBoard(clientX, clientY);

    const elAt = document.elementFromPoint(clientX, clientY);
    const targetNodeEl = elAt ? elAt.closest('.node') : null;

    if (targetNodeEl) {
      const targetId = targetNodeEl.id.replace('node-', '');
      if (targetId && targetId !== state.linkDraw.sourceId) {
        const targetNode = model.nodes.find(n => n.id === targetId);
        if (targetNode) {
          const targetIdx = nearestAnchorIndex(targetNode, boardPt);
          const sNode = model.nodes.find(n => n.id === state.linkDraw.sourceId);
          const sAnch = computeAnchorsForNode(sNode)[state.linkDraw.sourceAnchorIdx];
          const tAnch = computeAnchorsForNode(targetNode)[targetIdx];
          const cp = { x: (sAnch.x + tAnch.x) / 2, y: (sAnch.y + tAnch.y) / 2 };
          const newLink = {
            id: uid('l'),
            source: state.linkDraw.sourceId,
            target: targetId,
            sourceAnchorIdx: state.linkDraw.sourceAnchorIdx,
            targetAnchorIdx: targetIdx,
            points: [{ x: sAnch.x, y: sAnch.y }, { x: cp.x, y: cp.y }, { x: tAnch.x, y: tAnch.y }],
            label: ''
          };
          addLinkObj(newLink);
        }
      }
    }

    state.linkDraw = null;
    canvas.style.cursor = 'default';
    svg.style.pointerEvents = 'none';
    renderLinks();
  }

  function handleNodeDown(e, nodeId) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const cm = $('contextMenu'); if (cm) cm.style.display = 'none';
    if (!state.selectedNodes.has(nodeId)) {
      if (e.shiftKey) state.selectedNodes.add(nodeId);
      else { state.selectedNodes.clear(); state.selectedNodes.add(nodeId); }
    }
    state.selectedLinkId = null;
    const startPositions = {};
    Array.from(state.selectedNodes).forEach(id => {
      const n = model.nodes.find(x => x.id === id);
      if (n) startPositions[id] = { x: n.x, y: n.y };
    });
    const node = model.nodes.find(n => n.id === nodeId);
    if (node) { state.highestZ++; node.zIndex = state.highestZ; const el = document.getElementById(`node-${nodeId}`); if (el) el.style.zIndex = state.highestZ; }
    state.dragInfo = { mode: 'node', startX: e.clientX, startY: e.clientY, nodeId, startPositions };
    renderNodes();
  }

  function onCanvasDown(e) {
    if (e.target && e.target.closest && e.target.closest('.node')) return;
    const cm = $('contextMenu'); if (cm && e.target && e.target.closest && e.target.closest('#contextMenu')) return;
    state.selectedNodes.clear(); state.selectedLinkId = null;
    if (toolDeleteNode) toolDeleteNode.disabled = true;
    if (toolDeleteLink) toolDeleteLink.disabled = true;
    renderNodes(); renderLinks(); updateInspector();
    state.dragInfo = { mode: 'pan', startX: e.clientX, startY: e.clientY, startTransformX: state.transform.x, startTransformY: state.transform.y };
    canvas.style.cursor = 'grabbing';
  }

  window._lastMouse = { clientX: 0, clientY: 0 };

  function onMove(e) {
    if (e) { window._lastMouse.clientX = e.clientX; window._lastMouse.clientY = e.clientY; }

    // handle handleDrag (moving a specific point)
    if (state.handleDrag) {
      const hd = state.handleDrag;
      const link = model.links.find(l => l.id === hd.linkId);
      if (!link) return;
      const dx = (e.clientX - hd.startClientX) / state.transform.scale;
      const dy = (e.clientY - hd.startClientY) / state.transform.scale;
      const newX = hd.startX + dx;
      const newY = hd.startY + dy;
      link.points[hd.ptIdx].x = newX;
      link.points[hd.ptIdx].y = newY;
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
      state.linkDraw.currentX = b.x;
      state.linkDraw.currentY = b.y;
      renderLinks();
    }
  }

  function onUp(e) {
    if (state.handleDrag) {
      saveSnapshot();
      state.handleDrag = null;
      markDirty();
      renderLinks();
      return;
    }
    if (state.linkDraw) finalizeLinkIfPossible(e);
    if (state.dragInfo) {
      if (state.dragInfo.mode === 'node') {
        const s = state.grid.size;
        for (let id of Object.keys(state.dragInfo.startPositions)) {
          const n = model.nodes.find(x => x.id === id);
          if (!n) continue;
          n.x = Math.round(n.x / s) * s;
          n.y = Math.round(n.y / s) * s;
        }
        saveSnapshot();
        markDirty();
        renderNodes();
      }
      state.dragInfo = null;
      canvas.style.cursor = 'default';
    }
  }

  // ---------- Context menu ----------
  function nodeContext(e, nodeId) {
    e.preventDefault();
    setSelectedNodesFromClick(nodeId, e);
    const cm = $('contextMenu');
    if (!cm) return;
    cm.style.left = `${e.clientX}px`;
    cm.style.top = `${e.clientY}px`;
    cm.style.display = 'block';
    const ce = $('contextEdit'); if (ce) ce.onclick = () => { cm.style.display = 'none'; openNodeModal(model.nodes.find(n => n.id === nodeId)); };
    const cd = $('contextDelete'); if (cd) cd.onclick = () => { cm.style.display = 'none'; deleteNode(nodeId); };
  }

  // ---------- Inspector ----------
  function updateInspector() {
    if (selectedCount) selectedCount.textContent = state.selectedNodes.size;
    if (!inspector) return;
    if (state.selectedNodes.size === 0) {
      if (inspectorSingle) inspectorSingle.style.display = 'none';
      if (inspectorMulti) inspectorMulti.style.display = 'none';
    } else if (state.selectedNodes.size === 1) {
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
    saveSnapshot();
    markDirty();
    renderNodes();
  }
  if (inspectorSave) inspectorSave.addEventListener('click', applyInspectorToNode);
  if (inspectorDelete) inspectorDelete.addEventListener('click', () => { if (state.selectedNodes.size === 1) deleteNode(Array.from(state.selectedNodes)[0]); });

  function setSelectedNodesFromClick(nodeId, ev) {
    if (ev && ev.shiftKey) {
      if (state.selectedNodes.has(nodeId)) state.selectedNodes.delete(nodeId);
      else state.selectedNodes.add(nodeId);
    } else {
      state.selectedNodes.clear();
      state.selectedNodes.add(nodeId);
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
    mb.style.zIndex = 20000; mb.style.background = 'rgba(0,0,0,0.45)'; mb.style.display = 'flex'; mb.style.justifyContent = 'center'; mb.style.alignItems = 'center';
    document.body.appendChild(mb);
    return mb;
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

    const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.justifyContent = 'flex-end'; actions.style.gap = '8px';
    const btnDelete = document.createElement('button'); btnDelete.textContent = 'Delete'; btnDelete.style.background = '#fff'; btnDelete.style.border = '1px solid #f44336'; btnDelete.style.color = '#f44336';
    const btnCancel = document.createElement('button'); btnCancel.textContent = 'Cancel';
    const btnSave = document.createElement('button'); btnSave.textContent = 'Save'; btnSave.style.background = '#1e88e5'; btnSave.style.color = '#fff'; btnSave.style.border = 'none';
    actions.appendChild(btnDelete); actions.appendChild(btnCancel); actions.appendChild(btnSave);
    card.appendChild(actions);

    btnCancel.addEventListener('click', () => closeModal());
    btnDelete.addEventListener('click', () => {
      if (confirm('Delete this node?')) { deleteNode(node.id); closeModal(); }
    });
    btnSave.addEventListener('click', () => {
      saveSnapshot();
      node.title = inputTitle.value;
      node.body = ta.value;
      node.w = parseInt(wInput.value, 10) || node.w;
      node.h = parseInt(hInput.value, 10) || node.h;
      markDirty();
      renderNodes();
      closeModal();
    });

    mb.addEventListener('click', ev => { if (ev.target === mb) closeModal(); });
  }

  function openLinkModal(link) {
    if (!link) return;
    const mb = createModalBackdrop(); mb.innerHTML = '';
    const card = document.createElement('div'); card.style.background = '#fff'; card.style.padding = '18px'; card.style.borderRadius = '10px'; card.style.minWidth = '360px'; card.style.boxShadow = '0 12px 40px rgba(0,0,0,0.3)';
    mb.appendChild(card);

    const h = document.createElement('h3'); h.textContent = 'Edit Connection'; h.style.marginTop = '0'; card.appendChild(h);
    const labelInput = document.createElement('input'); labelInput.type = 'text'; labelInput.value = link.label || ''; labelInput.style.width = '100%'; labelInput.style.marginBottom = '12px'; card.appendChild(labelInput);

    const checkRow = document.createElement('div'); checkRow.style.display = 'flex'; checkRow.style.alignItems = 'center'; checkRow.style.gap = '8px'; checkRow.style.marginBottom = '12px';
    const editPathBtn = document.createElement('button'); editPathBtn.textContent = link._editing ? 'Stop editing path' : 'Edit path'; editPathBtn.style.marginRight = '8px';
    const addBendHint = document.createElement('span'); addBendHint.textContent = 'Double-click path to add bend (or Alt + DblClick)'; addBendHint.style.color = '#666'; addBendHint.style.fontSize = '12px';
    checkRow.appendChild(editPathBtn); checkRow.appendChild(addBendHint);
    card.appendChild(checkRow);

    const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.justifyContent = 'flex-end'; actions.style.gap = '8px';
    const btnDelete = document.createElement('button'); btnDelete.textContent = 'Delete'; btnDelete.style.background = '#fff'; btnDelete.style.border = '1px solid #f44336'; btnDelete.style.color = '#f44336';
    const btnCancel = document.createElement('button'); btnCancel.textContent = 'Cancel';
    const btnSave = document.createElement('button'); btnSave.textContent = 'Save'; btnSave.style.background = '#1e88e5'; btnSave.style.color = '#fff'; btnSave.style.border = 'none';
    actions.appendChild(btnDelete); actions.appendChild(btnCancel); actions.appendChild(btnSave);
    card.appendChild(actions);

    editPathBtn.addEventListener('click', () => {
      link._editing = !link._editing;
      renderLinks();
      editPathBtn.textContent = link._editing ? 'Stop editing path' : 'Edit path';
    });

    btnCancel.addEventListener('click', () => closeModal());
    btnDelete.addEventListener('click', () => {
      if (confirm('Delete this connection?')) { deleteLink(link.id); closeModal(); }
    });
    btnSave.addEventListener('click', () => {
      saveSnapshot();
      link.label = labelInput.value.trim();
      markDirty();
      renderLinks();
      closeModal();
    });

    mb.addEventListener('click', ev => { if (ev.target === mb) closeModal(); });
  }

  // ---------- Grid & transform ----------
  function applyTransform() {
    board.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.scale})`;
    if (zoomIndicator) zoomIndicator.textContent = `${Math.round(state.transform.scale * 100)}%`;
    updateGrid();
    renderLinks();
    requestAnimationFrame(()=>{});
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

  function repaintUI() {
    try {
      const uiEls = document.querySelectorAll('.topbar, .header-actions, #floatingTools, .controls-panel, .header-title');
      uiEls.forEach(el => {
        el.style.transform = el.style.transform || 'translateZ(0)';
        el.style.willChange = 'transform';
      });
      setTimeout(()=> uiEls.forEach(el => el.style.willChange = ''), 260);
    } catch(e){}
  }

  // ---------- Save/Load ----------
  async function saveModel() {
    if (!state.dirty) return;
    if (!window.AriesDB || typeof window.AriesDB.saveProjectWorkspace !== 'function') {
      localStorage.setItem('wf_local_' + (window.currentProjectId || 'local'), JSON.stringify({ nodes: model.nodes, links: model.links, savedAt: now() }));
      state.dirty = false;
      if (statusMeta) statusMeta.textContent = 'Saved (local)';
      if (saveBoardBtn) saveBoardBtn.textContent = 'Save Board';
      return;
    }
    try {
      const pid = window.currentProjectId || (new URL(window.location.href)).searchParams.get('id');
      await window.AriesDB.saveProjectWorkspace(pid, model.nodes, model.links);
      state.dirty = false;
      if (statusMeta) statusMeta.textContent = 'Saved';
      if (saveBoardBtn) { saveBoardBtn.textContent = 'Saved!'; setTimeout(()=> saveBoardBtn.textContent = 'Save Board', 1200); }
    } catch (err) {
      console.error('Save failed', err);
      if (statusMeta) statusMeta.textContent = 'Save failed';
      if (saveBoardBtn) { saveBoardBtn.textContent = 'Save Board'; }
    }
  }

  async function loadModel() {
    if (!window.AriesDB || typeof window.AriesDB.loadProjectData !== 'function') {
      const saved = localStorage.getItem('wf_local_' + (window.currentProjectId || 'local'));
      if (saved) {
        try { const d = JSON.parse(saved); model.nodes.length = 0; model.links.length = 0; (d.nodes||[]).forEach(n=>model.nodes.push(n)); (d.links||[]).forEach(l=>model.links.push(l)); renderNodes(); applyTransform(); return; } catch(e){ console.warn('Local load failed', e); }
      }
      seedModel(); renderNodes(); applyTransform(); return;
    }
    try {
      const d = await window.AriesDB.loadProjectData(window.currentProjectId);
      if (d) {
        if (headerTitle && d.name) headerTitle.textContent = d.name;
        model.nodes.length = 0; model.links.length = 0;
        (d.nodes || []).forEach(n => model.nodes.push(n));
        (d.links || []).forEach(l => model.links.push(l));
        state.highestZ = model.nodes.reduce((m, n) => Math.max(m, n.zIndex || 15), 15);
      } else seedModel();
    } catch (err) {
      console.error('Load failed', err);
      seedModel();
    }
    applyTransform();
    renderNodes();
  }

  function seedModel() {
    if (model.nodes.length === 0) {
      addNodeAt(200, 200, 'page', { title: 'Home' });
      addNodeAt(520, 200, 'action', { title: 'Login' });
      addNodeAt(860, 200, 'decision', { title: 'Auth?' });
    }
  }

  function downloadJSON() {
    const payload = { nodes: model.nodes, links: model.links, exportedAt: now() };
    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `workflow-${window.currentProjectId||'board'}.json`; a.click(); URL.revokeObjectURL(url);
  }

  function autoResizeBoard() {
    if (!board) return;
    if (model.nodes.length === 0) { board.style.width = '1200px'; board.style.height = '900px'; return; }
    const pad = 140;
    const maxX = Math.max(...model.nodes.map(n => n.x + (n.w || 220)));
    const maxY = Math.max(...model.nodes.map(n => n.y + (n.h || 100)));
    const minX = Math.min(...model.nodes.map(n => n.x));
    const minY = Math.min(...model.nodes.map(n => n.y));
    const w = Math.max(1200, (maxX - minX) + pad * 2);
    const h = Math.max(800, (maxY - minY) + pad * 2);
    board.style.width = `${Math.round(w)}px`;
    board.style.height = `${Math.round(h)}px`;
    const dx = pad - minX, dy = pad - minY;
    model.nodes.forEach(n => { n.x += dx; n.y += dy; });
    markDirty();
    renderNodes();
    applyTransform();
  }

  function zoomToFit() {
    if (!canvas || !board) { state.transform = { x: 0, y: 0, scale: 1 }; applyTransform(); return; }
    if (model.nodes.length === 0) { state.transform = { x: 0, y: 0, scale: 1 }; applyTransform(); return; }
    const minX = Math.min(...model.nodes.map(n => n.x));
    const minY = Math.min(...model.nodes.map(n => n.y));
    const maxX = Math.max(...model.nodes.map(n => n.x + (n.w || 220)));
    const maxY = Math.max(...model.nodes.map(n => n.y + (n.h || 100)));
    const pad = 80;
    const bboxW = (maxX - minX) + pad * 2;
    const bboxH = (maxY - minY) + pad * 2;
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

  // ---------- Palette & UI ----------
  function createFloatingPalette() {
    if ($('wf-palette')) return;
    const p = document.createElement('div'); p.id = 'wf-palette';
    p.style.position = 'fixed'; p.style.left = '12px'; p.style.top = '92px'; p.style.zIndex = 15000;
    p.style.background = 'rgba(255,255,255,0.96)'; p.style.border = '1px solid rgba(0,0,0,0.06)'; p.style.padding = '8px'; p.style.borderRadius = '10px';
    p.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)';

    const title = document.createElement('div'); title.textContent = 'Palette'; title.style.fontWeight = '700'; title.style.marginBottom = '6px';
    p.appendChild(title);

    [['Page','page'], ['Action','action'], ['Decision','decision']].forEach(([label, type], i) => {
      const b = document.createElement('button'); b.textContent = label;
      b.style.display = 'block'; b.style.margin = '6px 0'; b.style.width = '120px';
      // call addNodeAt() with no coords so it places in visible area
      b.addEventListener('click', ()=> addNodeAt(undefined, undefined, type));
      p.appendChild(b);
    });

    const templatesRow = document.createElement('div'); templatesRow.style.marginTop = '8px';
    const saveTpl = document.createElement('button'); saveTpl.textContent = 'Save Template'; saveTpl.style.display = 'block'; saveTpl.style.width = '120px';
    saveTpl.addEventListener('click', ()=> {
      if (state.selectedNodes.size === 0) return alert('Select at least one node to save as template.');
      const ids = Array.from(state.selectedNodes);
      const nodes = model.nodes.filter(n => ids.includes(n.id));
      const tpl = { id: uid('tpl'), name: 'Template ' + (state.templates.length + 1), nodes };
      state.templates.push(tpl);
      alert('Template saved locally.');
    });
    templatesRow.appendChild(saveTpl);
    p.appendChild(templatesRow);

    document.body.appendChild(p);
  }

  // ---------- Event bindings ----------
  function setupBindings() {
    if (toolAddPage) toolAddPage.addEventListener('click', ()=> addNodeAt(undefined, undefined, 'page'));
    if (toolAddAction) toolAddAction.addEventListener('click', ()=> addNodeAt(undefined, undefined, 'action'));
    if (toolAddDecision) toolAddDecision.addEventListener('click', ()=> addNodeAt(undefined, undefined, 'decision'));
    if (toolDeleteNode) toolDeleteNode.addEventListener('click', ()=> { Array.from(state.selectedNodes).forEach(id => deleteNode(id)); state.selectedNodes.clear(); renderNodes(); });
    if (toolDeleteLink) toolDeleteLink.addEventListener('click', ()=> { if (state.selectedLinkId) deleteLink(state.selectedLinkId); });

    if (canvas) canvas.addEventListener('mousedown', onCanvasDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    canvas.addEventListener('touchstart', (ev)=> { const t = ev.touches[0]; onCanvasDown({ clientX: t.clientX, clientY: t.clientY, target: ev.target }); ev.preventDefault(); }, { passive:false });
    canvas.addEventListener('touchmove', (ev)=> { const t = ev.touches[0]; onMove({ clientX: t.clientX, clientY: t.clientY }); ev.preventDefault(); }, { passive:false });
    canvas.addEventListener('touchend', (ev)=> { onUp({ clientX:0, clientY:0 }); }, { passive:false });

    const zoomFactor = 1.2;
    if (zoomInCorner) zoomInCorner.addEventListener('click', ()=> { state.transform.scale = clamp(state.transform.scale * zoomFactor, 0.25, 2); applyTransform(); });
    if (zoomOutCorner) zoomOutCorner.addEventListener('click', ()=> { state.transform.scale = clamp(state.transform.scale / zoomFactor, 0.25, 2); applyTransform(); });
    if (centerBtn) centerBtn.addEventListener('click', ()=> { state.transform = { x: 0, y: 0, scale: 1 }; applyTransform(); });
    if (zoomFitBtn) zoomFitBtn.addEventListener('click', zoomToFit);

    if (showGrid) showGrid.addEventListener('change', ()=> { state.grid.enabled = showGrid.checked; applyTransform(); });
    if (gridSizeInput) gridSizeInput.addEventListener('change', ()=> { state.grid.size = parseInt(gridSizeInput.value) || 25; applyTransform(); });

    document.addEventListener('click', (e)=> {
      const t = e.target;
      if (!t) return;
      if (t.closest && (t.closest('.node') || t.closest('.link-path'))) return;
      if (t.closest && (t.closest('#inspector') || t.closest('.topbar') || t.closest('.header-actions') || t.closest('#floatingTools') || t.closest('.controls-panel') || t.closest('#contextMenu') || t.closest('.modal-backdrop') || t.closest('.modal-card') || t.closest('#wf-modal-backdrop'))) return;
      state.selectedNodes.clear(); state.selectedLinkId = null;
      if (toolDeleteNode) toolDeleteNode.disabled = true;
      if (toolDeleteLink) toolDeleteLink.disabled = true;
      const cm = $('contextMenu'); if (cm) cm.style.display = 'none';
      renderNodes(); renderLinks(); updateInspector();
    });

    const exportBtnRef = exportBtn || exportJsonBtn;
    if (exportBtnRef) exportBtnRef.addEventListener('click', downloadJSON);
    if (importJsonBtn && importFile) importJsonBtn.addEventListener('click', ()=> importFile.click());
    if (importFile) {
      importFile.addEventListener('change', (ev)=> {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = function(e) {
          try {
            const data = JSON.parse(e.target.result);
            saveSnapshot();
            model.nodes.length = 0; model.links.length = 0;
            (data.nodes || []).forEach(n => model.nodes.push(n));
            (data.links || []).forEach(l => model.links.push(l));
            markDirty();
            renderNodes(); applyTransform();
            alert('Imported JSON.');
          } catch(err) { alert('Import failed: ' + err.message); }
        };
        reader.readAsText(f);
      });
    }

    if (autosizeBtn) autosizeBtn.addEventListener('click', autoResizeBoard);
    if (clearAllBtn) clearAllBtn.addEventListener('click', ()=> { if (confirm('Clear all nodes and links?')) { saveSnapshot(); model.nodes.length = 0; model.links.length = 0; state.selectedNodes.clear(); markDirty(); renderNodes(); }});

    // keyboard
    document.addEventListener('keydown', (e) => {
      if (isTyping()) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedNodes.size > 0) {
          saveSnapshot();
          Array.from(state.selectedNodes).forEach(id => deleteNode(id));
          state.selectedNodes.clear();
          renderNodes();
          markDirty();
        } else if (state.selectedLinkId) {
          saveSnapshot();
          deleteLink(state.selectedLinkId);
        }
      } else if (e.key === 'Escape') {
        state.linkDraw = null; state.dragInfo = null;
        const cm = $('contextMenu'); if (cm) cm.style.display = 'none';
        renderLinks();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
      }
    });
  }

  // ---------- Minimal CSS injection ----------
  (function injectCSS() {
    if (document.getElementById('wf-styles')) return;
    const css = `
#wf-palette button{ cursor:pointer; padding:8px 10px; border-radius:6px; border:1px solid rgba(0,0,0,0.06); background:#fff; }
.anchor-dot { transition: border-color 120ms ease; }
.node.selected { outline: 2px solid rgba(59,132,255,0.12); box-shadow: 0 12px 28px rgba(29,78,216,0.06) inset; }
.link-label { font-family: sans-serif; font-size: 13px; fill: #111827; }
`;
    const s = document.createElement('style'); s.id = 'wf-styles'; s.innerHTML = css; document.head.appendChild(s);
  })();

  // ---------- Boot ----------
  function boot() {
    state.grid.enabled = (showGrid ? showGrid.checked : true);
    state.grid.size = (gridSizeInput ? parseInt(gridSizeInput.value || 25, 10) : 25);
    createFloatingPalette();
    setupBindings();
    loadModel();
    renderNodes();
    applyTransform();

    window._wf = window._wf || {};
    Object.assign(window._wf, {
      model, renderNodes, renderLinks, saveModel, loadModel, addNodeAt, addLinkObj, autoResizeBoard, zoomToFit, computeAnchorsForNode, undo, redo, state
    });

    console.log('Advanced workspace loaded. Debug API available as window._wf');
  }

  document.addEventListener('DOMContentLoaded', boot);

  // Keep last mouse
  document.addEventListener('mousemove', (e) => { window._lastMouse = { clientX: e.clientX, clientY: e.clientY }; });

  // ---------- Small helpers ----------
  function escape(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
})();
