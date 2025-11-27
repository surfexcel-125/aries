/**
 * Aries Workspace Engine - Advanced Edition
 * Features: History Stack, Multi-Select, Clipboard, Styling, Pointer Events
 */

(function() {
    // --- Constants & Config ---
    const CONFIG = {
        gridSize: 20,
        snapToGrid: true,
        zoomMin: 0.1,
        zoomMax: 3.0,
        colors: [
            '#ffffff', '#fecaca', '#fde68a', '#d9f99d', '#bfdbfe', '#ddd6fe', '#fbcfe8', '#e2e8f0'
        ]
    };

    // --- State Management ---
    const state = {
        projectId: 'local-demo',
        nodes: [],
        links: [],
        transform: { x: 0, y: 0, scale: 1 },
        selection: new Set(), // Set of Node IDs
        selectedLinkId: null,
        clipboard: null, // For Copy/Paste
        history: [], // Undo stack
        historyIndex: -1, // Current pointer in history
        isDirty: false
    };

    // --- Interaction State ---
    const interact = {
        mode: 'IDLE', // IDLE, PAN, DRAG_ITEMS, DRAG_SELECTION, LINK_DRAW, HANDLE_DRAG
        startX: 0, startY: 0, // Screen coords
        startTransform: { x: 0, y: 0 },
        startNodePositions: {}, // Map { id: {x,y} }
        linkDraft: null, // { sourceId, anchorIdx, currX, currY }
        selectionBox: { x: 0, y: 0, w: 0, h: 0 }
    };

    // --- DOM Cache ---
    const DOM = {};

    function init() {
        // Cache Elements
        ['canvas', 'board', 'svg', 'selectionBox', 'inspector', 'inspectorData', 'inspectorEmpty', 'contextMenu', 'statusText'].forEach(id => DOM[id] = document.getElementById(id));
        
        // Setup Inspector Colors
        const colorGrid = document.getElementById('colorGrid');
        CONFIG.colors.forEach(c => {
            const d = document.createElement('div');
            d.className = 'color-swatch';
            d.style.backgroundColor = c;
            d.onclick = () => updateSelectionProperties({ color: c });
            colorGrid.appendChild(d);
        });

        // Setup Events
        setupPointerEvents();
        setupToolbarEvents();
        setupKeyboardEvents();
        
        // Initial Seed
        pushHistory(); // Initial state
        addNode(100, 100, 'page', { title: 'Start' });
        addNode(400, 100, 'action', { title: 'Process' });
        centerView();
    }

    // --- History System (Undo/Redo) ---
    function pushHistory() {
        // Remove redo future
        if (state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
        }
        // Push deep copy
        const snapshot = JSON.stringify({ nodes: state.nodes, links: state.links });
        state.history.push(snapshot);
        state.historyIndex++;
        
        // Limit stack size (50 steps)
        if (state.history.length > 50) {
            state.history.shift();
            state.historyIndex--;
        }
        updateStatus('Saved to history');
    }

    function undo() {
        if (state.historyIndex > 0) {
            state.historyIndex--;
            restoreHistory();
        }
    }

    function redo() {
        if (state.historyIndex < state.history.length - 1) {
            state.historyIndex++;
            restoreHistory();
        }
    }

    function restoreHistory() {
        const snapshot = JSON.parse(state.history[state.historyIndex]);
        state.nodes = snapshot.nodes;
        state.links = snapshot.links;
        state.selection.clear();
        state.selectedLinkId = null;
        render();
        updateInspector();
        updateStatus('Undo/Redo performed');
    }

    // --- Core Logic ---

    function addNode(x, y, type, props = {}) {
        const id = 'n-' + Date.now() + Math.random().toString(36).substr(2, 5);
        const defaults = {
            page: { w: 200, h: 100, bg: '#ffffff', shape: 'rect' },
            action: { w: 200, h: 100, bg: '#fff7ed', shape: 'round' },
            decision: { w: 140, h: 140, bg: '#f0f9ff', shape: 'diamond' } // Simplified visual for diamond
        };
        const def = defaults[type] || defaults.page;
        
        const node = {
            id, type, x, y,
            w: def.w, h: def.h,
            title: props.title || 'New Node',
            body: props.body || '',
            style: {
                bg: def.bg,
                shape: def.shape // rect, round, capsule
            },
            zIndex: 10
        };
        
        state.nodes.push(node);
        pushHistory();
        render();
        return node;
    }

    function deleteSelection() {
        if (state.selection.size === 0 && !state.selectedLinkId) return;

        // Delete Nodes
        if (state.selection.size > 0) {
            state.nodes = state.nodes.filter(n => !state.selection.has(n.id));
            // Cleanup links attached to deleted nodes
            state.links = state.links.filter(l => !state.selection.has(l.source) && !state.selection.has(l.target));
            state.selection.clear();
        }

        // Delete Link
        if (state.selectedLinkId) {
            state.links = state.links.filter(l => l.id !== state.selectedLinkId);
            state.selectedLinkId = null;
        }

        pushHistory();
        render();
        updateInspector();
    }

    function updateSelectionProperties(props) {
        if (state.selection.size === 0) return;
        let changed = false;
        state.nodes.forEach(n => {
            if (state.selection.has(n.id)) {
                if (props.color) n.style.bg = props.color;
                if (props.shape) n.style.shape = props.shape;
                if (props.w) n.w = parseInt(props.w);
                if (props.h) n.h = parseInt(props.h);
                if (props.title !== undefined) n.title = props.title;
                if (props.body !== undefined) n.body = props.body;
                if (props.type) n.type = props.type;
                changed = true;
            }
        });
        if (changed) {
            pushHistory();
            render();
            updateInspector(); // Reflect changes back to UI
        }
    }

    // --- Clipboard ---
    function copySelection() {
        if (state.selection.size === 0) return;
        const toCopy = state.nodes.filter(n => state.selection.has(n.id));
        state.clipboard = JSON.parse(JSON.stringify(toCopy));
        updateStatus(`Copied ${toCopy.length} nodes`);
    }

    function pasteSelection() {
        if (!state.clipboard) return;
        state.selection.clear();
        
        // Find center of screen to paste
        // Or just offset from original
        const offset = 40;
        
        state.clipboard.forEach(template => {
            const newId = 'n-' + Date.now() + Math.random().toString(36).substr(2, 5);
            const newNode = { ...template, id: newId, x: template.x + offset, y: template.y + offset, zIndex: 20 };
            state.nodes.push(newNode);
            state.selection.add(newId);
        });

        pushHistory();
        render();
        updateStatus('Pasted');
    }

    // --- Rendering Engine ---

    function render() {
        // 1. Render Nodes
        // Diffing algorithm is too complex for this snippet, so we clear and rebuild (optimized by browser)
        // Ideally, use React/Vue, but for Vanilla, this is robust.
        
        const existingNodeEls = document.querySelectorAll('.node');
        const nodeMap = new Map();
        existingNodeEls.forEach(el => nodeMap.set(el.id, el));

        // Mark all for removal initially
        const toRemove = new Set(nodeMap.keys());

        state.nodes.forEach(node => {
            const domId = `node-${node.id}`;
            let el = nodeMap.get(domId);

            if (!el) {
                // Create New
                el = document.createElement('div');
                el.id = domId;
                el.className = 'node';
                el.innerHTML = `
                    <div class="node-content">
                        <div class="node-title"></div>
                        <div class="node-body"></div>
                    </div>
                    <div class="anchors"></div>
                `;
                
                // Add Anchors
                const anchorContainer = el.querySelector('.anchors');
                // 4 Cardinal + 4 Corners = 8 Anchors
                const positions = [
                    ['0','0'], ['50%','0'], ['100%','0'], // Top
                    ['100%','50%'], ['100%','100%'],      // Right
                    ['50%','100%'], ['0','100%'],         // Bottom
                    ['0','50%']                           // Left
                ];
                positions.forEach((pos, idx) => {
                    const dot = document.createElement('div');
                    dot.className = 'anchor-dot';
                    Object.assign(dot.style, { 
                        position:'absolute', left:pos[0], top:pos[1], 
                        width:'10px', height:'10px', marginLeft:'-5px', marginTop:'-5px',
                        background:'#fff', border:'1px solid #999', borderRadius:'50%' 
                    });
                    dot.onpointerdown = (e) => startLinkDraw(e, node.id, idx);
                    anchorContainer.appendChild(dot);
                });

                DOM.board.appendChild(el);
                
                // Event Wiring
                el.onpointerdown = (e) => handleNodeDown(e, node.id);
            } else {
                toRemove.delete(domId);
            }

            // Update Props
            el.style.transform = `translate(${node.x}px, ${node.y}px)`;
            el.style.width = `${node.w}px`;
            el.style.height = `${node.h}px`;
            el.style.backgroundColor = node.style.bg || '#fff';
            
            // Shapes
            el.className = `node ${state.selection.has(node.id) ? 'selected' : ''}`;
            el.style.borderRadius = node.style.shape === 'round' ? '12px' : (node.style.shape === 'capsule' ? '50px' : '4px');

            // Text
            el.querySelector('.node-title').textContent = node.title;
            el.querySelector('.node-body').textContent = node.body;
        });

        // Remove deleted
        toRemove.forEach(id => document.getElementById(id).remove());

        renderLinks();
    }

    function renderLinks() {
        DOM.svg.innerHTML = ''; // Clear SVG
        
        // Definitions for markers (ensure they stay)
        DOM.svg.innerHTML += `
          <defs>
            <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" /></marker>
            <marker id="arrowhead-selected" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0b74ff" /></marker>
          </defs>
        `;

        // Draw active draft line
        if (interact.linkDraft) {
            const path = createSvgPath(
                interact.linkDraft.startX, interact.linkDraft.startY,
                interact.linkDraft.currX, interact.linkDraft.currY,
                null, true // dashed
            );
            DOM.svg.appendChild(path);
        }

        state.links.forEach(link => {
            const sNode = state.nodes.find(n => n.id === link.source);
            const tNode = state.nodes.find(n => n.id === link.target);
            if (!sNode || !tNode) return;

            const p1 = getNodeAnchor(sNode, link.sourceAnchor);
            const p2 = getNodeAnchor(tNode, link.targetAnchor);

            // Control Point defaults to midpoint if missing
            if (!link.cp) link.cp = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };

            const isSel = state.selectedLinkId === link.id;
            
            // Draw Curve (Quadratic Bezier)
            const d = `M ${p1.x} ${p1.y} Q ${link.cp.x} ${link.cp.y} ${p2.x} ${p2.y}`;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('stroke', isSel ? '#0b74ff' : '#64748b');
            path.setAttribute('stroke-width', isSel ? 3 : 2);
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', isSel ? 'url(#arrowhead-selected)' : 'url(#arrowhead)');
            path.style.cursor = 'pointer';
            
            path.onclick = (e) => {
                e.stopPropagation();
                state.selectedLinkId = link.id;
                state.selection.clear();
                render();
                updateInspector();
            };

            DOM.svg.appendChild(path);

            // Draw Label
            if (link.label) {
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', link.cp.x);
                text.setAttribute('y', link.cp.y - 15);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('fill', '#333');
                text.setAttribute('font-size', '12px');
                text.setAttribute('font-weight', 'bold');
                text.style.pointerEvents = 'none';
                text.textContent = link.label;
                DOM.svg.appendChild(text);
            }

            // Draw Control Handle
            if (isSel) {
                const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                handle.setAttribute('cx', link.cp.x);
                handle.setAttribute('cy', link.cp.y);
                handle.setAttribute('r', 6);
                handle.setAttribute('fill', '#fff');
                handle.setAttribute('stroke', '#0b74ff');
                handle.style.cursor = 'move';
                
                handle.onpointerdown = (e) => {
                    e.stopPropagation();
                    el.setPointerCapture(e.pointerId);
                    interact.mode = 'HANDLE_DRAG';
                    interact.handleLink = link;
                    interact.startX = e.clientX;
                    interact.startY = e.clientY;
                    interact.startCp = { ...link.cp };
                };
                DOM.svg.appendChild(handle);
            }
        });
    }

    function createSvgPath(x1, y1, x2, y2, color, dashed) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
        path.setAttribute('stroke', color || '#0b74ff');
        path.setAttribute('stroke-width', 2);
        path.setAttribute('fill', 'none');
        if (dashed) path.setAttribute('stroke-dasharray', '5,5');
        return path;
    }

    function applyTransform() {
        DOM.board.style.transform = `translate(${state.transform.x}px, ${state.transform.y}px) scale(${state.transform.scale})`;
        
        // Update Grid Background
        const scaledGrid = CONFIG.gridSize * state.transform.scale;
        const ox = state.transform.x % scaledGrid;
        const oy = state.transform.y % scaledGrid;
        DOM.canvas.style.backgroundSize = `${scaledGrid}px ${scaledGrid}px`;
        DOM.canvas.style.backgroundPosition = `${ox}px ${oy}px`;
        
        document.getElementById('zoomLevel').textContent = Math.round(state.transform.scale * 100) + '%';
    }

    // --- Pointer Events (The Brain) ---

    function setupPointerEvents() {
        const c = DOM.canvas;
        
        c.onpointerdown = (e) => {
            if (e.target.closest('.node')) return; // Handled by node
            DOM.contextMenu.style.display = 'none';

            c.setPointerCapture(e.pointerId);
            interact.startX = e.clientX;
            interact.startY = e.clientY;

            // Spacebar or Middle Click = PAN
            if (e.button === 1 || e.buttons === 4 || keys.Space) {
                interact.mode = 'PAN';
                interact.startTransform = { ...state.transform };
                c.style.cursor = 'grabbing';
            } else {
                // Left Click = SELECTION BOX (or clear selection)
                if (!e.shiftKey) {
                    state.selection.clear();
                    state.selectedLinkId = null;
                    render();
                    updateInspector();
                }
                interact.mode = 'SELECT_BOX';
                interact.selectionBox = { x: 0, y: 0, w: 0, h: 0 }; // relative to client
                DOM.selectionBox.style.display = 'block';
                updateSelectionBox(e);
            }
        };

        c.onpointermove = (e) => {
            const dx = e.clientX - interact.startX;
            const dy = e.clientY - interact.startY;

            if (interact.mode === 'PAN') {
                state.transform.x = interact.startTransform.x + dx;
                state.transform.y = interact.startTransform.y + dy;
                applyTransform();
            }
            else if (interact.mode === 'DRAG_ITEMS') {
                const scale = state.transform.scale;
                state.nodes.forEach(n => {
                    if (state.selection.has(n.id)) {
                        const start = interact.startNodePositions[n.id];
                        n.x = start.x + (dx / scale);
                        n.y = start.y + (dy / scale);
                    }
                });
                render(); // Re-render nodes (optimized in real DOM diffing, here we brute force)
            }
            else if (interact.mode === 'LINK_DRAW') {
                const pt = screenToBoard(e.clientX, e.clientY);
                interact.linkDraft.currX = pt.x;
                interact.linkDraft.currY = pt.y;
                renderLinks();
            }
            else if (interact.mode === 'HANDLE_DRAG') {
                const scale = state.transform.scale;
                interact.handleLink.cp.x = interact.startCp.x + (dx / scale);
                interact.handleLink.cp.y = interact.startCp.y + (dy / scale);
                renderLinks();
            }
            else if (interact.mode === 'SELECT_BOX') {
                // Update selection div geometry
                const x = Math.min(e.clientX, interact.startX);
                const y = Math.min(e.clientY, interact.startY);
                const w = Math.abs(e.clientX - interact.startX);
                const h = Math.abs(e.clientY - interact.startY);
                
                DOM.selectionBox.style.left = (x - DOM.canvas.getBoundingClientRect().left) + 'px'; // Relative to canvas container
                DOM.selectionBox.style.top = (y - DOM.canvas.getBoundingClientRect().top) + 'px';
                DOM.selectionBox.style.width = w + 'px';
                DOM.selectionBox.style.height = h + 'px';
                
                // Calculate selection logic on Pointer Up, not Move (perf)
            }
        };

        c.onpointerup = (e) => {
            if (interact.mode === 'DRAG_ITEMS') {
                // Snap to Grid
                if (CONFIG.snapToGrid) {
                    state.nodes.forEach(n => {
                        if (state.selection.has(n.id)) {
                            n.x = Math.round(n.x / CONFIG.gridSize) * CONFIG.gridSize;
                            n.y = Math.round(n.y / CONFIG.gridSize) * CONFIG.gridSize;
                        }
                    });
                }
                pushHistory();
                render();
            }
            else if (interact.mode === 'LINK_DRAW') {
                // Check if dropped on node
                const el = document.elementFromPoint(e.clientX, e.clientY);
                const nodeEl = el?.closest('.node');
                if (nodeEl) {
                    const targetId = nodeEl.id.replace('node-', '');
                    if (targetId !== interact.linkDraft.sourceId) {
                        finalizeLink(interact.linkDraft.sourceId, targetId, interact.linkDraft.anchorIdx);
                    }
                }
                interact.linkDraft = null;
                renderLinks();
            }
            else if (interact.mode === 'SELECT_BOX') {
                DOM.selectionBox.style.display = 'none';
                // Calculate Intersection
                const boxRect = {
                    left: Math.min(e.clientX, interact.startX),
                    top: Math.min(e.clientY, interact.startY),
                    right: Math.max(e.clientX, interact.startX),
                    bottom: Math.max(e.clientY, interact.startY)
                };
                
                // Select nodes inside box
                state.nodes.forEach(n => {
                    const el = document.getElementById(`node-${n.id}`);
                    const r = el.getBoundingClientRect();
                    // Simple AABB collision
                    if (r.left < boxRect.right && r.right > boxRect.left && r.top < boxRect.bottom && r.bottom > boxRect.top) {
                        state.selection.add(n.id);
                    }
                });
                render();
                updateInspector();
            }

            interact.mode = 'IDLE';
            c.style.cursor = 'default';
        };
    }

    function handleNodeDown(e, id) {
        e.stopPropagation(); // Don't trigger canvas pan
        const nodeEl = document.getElementById(`node-${id}`);
        
        // Multi-select shift check
        if (!e.shiftKey && !state.selection.has(id)) {
            state.selection.clear();
        }
        state.selection.add(id);
        
        state.selectedLinkId = null;
        render();
        updateInspector();
        
        // Prep Drag
        interact.mode = 'DRAG_ITEMS';
        interact.startX = e.clientX;
        interact.startY = e.clientY;
        interact.startNodePositions = {};
        
        state.nodes.forEach(n => {
            if (state.selection.has(n.id)) {
                interact.startNodePositions[n.id] = { x: n.x, y: n.y };
            }
        });
        
        DOM.canvas.setPointerCapture(e.pointerId);
    }

    function startLinkDraw(e, sourceId, anchorIdx) {
        e.stopPropagation();
        const pt = screenToBoard(e.clientX, e.clientY);
        interact.mode = 'LINK_DRAW';
        interact.linkDraft = {
            sourceId, anchorIdx,
            startX: pt.x, startY: pt.y,
            currX: pt.x, currY: pt.y
        };
        DOM.canvas.setPointerCapture(e.pointerId);
    }

    async function finalizeLink(sourceId, targetId, sourceAnchor) {
        // Calculate target anchor (nearest)
        const tNode = state.nodes.find(n => n.id === targetId);
        // Simple logic: index 0 for now, or math to find closest
        const targetAnchor = 0; 

        // Ask for Label
        const label = await window.requestTransitionLabel();
        if (label === null) return; // Cancelled

        state.links.push({
            id: 'l-' + Date.now(),
            source: sourceId, target: targetId,
            sourceAnchor, targetAnchor,
            label: label
        });
        pushHistory();
        renderLinks();
    }

    // --- Helpers ---
    function screenToBoard(sx, sy) {
        const rect = DOM.board.getBoundingClientRect();
        return {
            x: (sx - rect.left) / state.transform.scale,
            y: (sy - rect.top) / state.transform.scale
        };
    }

    function getNodeAnchor(node, anchorIdx) {
        // Simplified Anchor logic based on index 0-7
        const w = node.w, h = node.h;
        const coords = [
           {x:0,y:0}, {x:w/2,y:0}, {x:w,y:0},
           {x:w,y:h/2}, {x:w,y:h},
           {x:w/2,y:h}, {x:0,y:h}, {x:0,y:h/2}
        ];
        const offset = coords[anchorIdx] || coords[0];
        return { x: node.x + offset.x, y: node.y + offset.y };
    }

    function centerView() {
        const cw = DOM.canvas.clientWidth;
        const ch = DOM.canvas.clientHeight;
        state.transform = { x: cw/2 - 300, y: ch/2 - 200, scale: 1 };
        applyTransform();
    }

    function updateStatus(msg) {
        DOM.statusText.textContent = msg;
        setTimeout(() => DOM.statusText.textContent = 'Ready', 3000);
    }

    // --- Inspector UI ---
    function updateInspector() {
        const selCount = state.selection.size;
        if (selCount === 0 && !state.selectedLinkId) {
            DOM.inspector.classList.add('hidden');
            return;
        }
        
        DOM.inspector.classList.remove('hidden');
        
        if (selCount > 0) {
            DOM.inspectorEmpty.style.display = 'none';
            DOM.inspectorData.style.display = 'flex';
            
            // Populate fields if only 1 selected
            if (selCount === 1) {
                const id = Array.from(state.selection)[0];
                const n = state.nodes.find(x => x.id === id);
                document.getElementById('inspTitle').value = n.title;
                document.getElementById('inspBody').value = n.body;
                document.getElementById('inspW').value = n.w;
                document.getElementById('inspH').value = n.h;
                document.getElementById('inspType').value = n.type;
                
                // Active Shape State
                document.getElementById('shapeRect').style.background = n.style.shape === 'rect' ? '#e2e8f0' : '#fff';
                document.getElementById('shapeRound').style.background = n.style.shape === 'round' ? '#e2e8f0' : '#fff';
            }
        }
    }
    
    // Wire up Inspector Inputs
    function setupInspectorEvents() {
        const ids = ['inspTitle', 'inspBody', 'inspW', 'inspH', 'inspType'];
        ids.forEach(id => {
            document.getElementById(id).onchange = (e) => {
                const key = id.replace('insp', '').toLowerCase();
                const val = e.target.value;
                const props = {};
                props[key] = val;
                updateSelectionProperties(props);
            };
        });

        document.getElementById('shapeRect').onclick = () => updateSelectionProperties({ shape: 'rect' });
        document.getElementById('shapeRound').onclick = () => updateSelectionProperties({ shape: 'round' });
        document.getElementById('closeInspector').onclick = () => DOM.inspector.classList.add('hidden');
    }

    // --- Toolbar & Keys ---
    function setupToolbarEvents() {
        setupInspectorEvents();

        document.getElementById('zoomIn').onclick = () => { state.transform.scale *= 1.1; applyTransform(); };
        document.getElementById('zoomOut').onclick = () => { state.transform.scale /= 1.1; applyTransform(); };
        document.getElementById('fitView').onclick = centerView;
        document.getElementById('undoBtn').onclick = undo;
        document.getElementById('redoBtn').onclick = redo;

        document.getElementById('toolAddPage').onclick = () => addNode(200, 200, 'page');
        document.getElementById('toolAddAction').onclick = () => addNode(200, 350, 'action');
        document.getElementById('toolAddDecision').onclick = () => addNode(200, 500, 'decision');
        document.getElementById('toolDelete').onclick = deleteSelection;
        
        document.getElementById('saveBoard').onclick = () => {
             localStorage.setItem('aries_project', JSON.stringify({nodes: state.nodes, links: state.links}));
             updateStatus('Saved locally');
        };
        
        document.getElementById('toggleInspector').onclick = () => DOM.inspector.classList.toggle('hidden');
    }

    // Key tracking
    const keys = {};

    function setupKeyboardEvents() {
        window.onkeydown = (e) => {
            keys[e.code] = true;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.code === 'Space') DOM.canvas.style.cursor = 'grabbing';
            if (e.code === 'Delete' || e.code === 'Backspace') deleteSelection();
            
            // Ctrl Shortcuts
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') { e.preventDefault(); undo(); }
                if (e.key === 'y') { e.preventDefault(); redo(); }
                if (e.key === 'c') { e.preventDefault(); copySelection(); }
                if (e.key === 'v') { e.preventDefault(); pasteSelection(); }
            }
        };
        window.onkeyup = (e) => {
            keys[e.code] = false;
            if (e.code === 'Space') {
                if (interact.mode !== 'PAN') DOM.canvas.style.cursor = 'default';
            }
        };
    }

    function updateSelectionBox(e) {
        // Logic handled in pointermove, this is placeholder for visual updates if needed
    }

    // --- Launch ---
    document.addEventListener('DOMContentLoaded', init);

})();
