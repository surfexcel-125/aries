/* workspace.js
   Standalone workspace script. Drop into same folder as project_detail.html
   Include via: <script src="workspace.js" defer></script>
*/
(function(){
  /* Elements (resolved after DOM ready) */
  const ready = () => {
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
    const saveModalBtn = document.getElementById('saveModal');
    const cancelModalBtn = document.getElementById('cancelModal');
    const deleteBlockBtn = document.getElementById('deleteBlock');

    /* Storage & model */
    function getQueryParam(k){ return new URLSearchParams(location.search).get(k); }
    const projectId = getQueryParam('id') || 'demo';
    const storageKey = 'aries_workspace_v1_' + projectId;

    let model = { nodes: [], links: [] }; // link: {id, from, to, fromAnchor, toAnchor, points?}
    let selectedNodeId = null;
    let selectedLinkId = null;

    /* Transform */
    let scale = 1, pan = {x:0,y:0};
    const MIN_SCALE = 0.35, MAX_SCALE = 2.6, SCALE_STEP = 0.12;

    /* Drag/Pinch */
    let draggingId = null, dragOffset = {x:0,y:0};
    let isPanning = false, panStart = {x:0,y:0};
    const pointerMap = new Map(); let pinchState = null;

    /* Connect mode */
    let connectMode = false, connectFrom = null;

    /* Snap/grid */
    let snapOn = true, gridSize = Number(gridSizeInput?.value) || 20;

    /* helpers */
    function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
    function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
    function flash(msg){ const el=document.createElement('div'); el.textContent=msg; Object.assign(el.style,{position:'fixed',right:'20px',bottom:'24px',background:'#0b74ff',color:'#fff',padding:'8px 12px',borderRadius:'8px',zIndex:1500}); document.body.appendChild(el); setTimeout(()=>el.remove(),1200); }

    /* mapping between displayed canvas and model coords */
    function visiblePointToModel(clientX, clientY){
      const rect = canvas.getBoundingClientRect();
      const scaleDisplayedX = rect.width / canvas.offsetWidth || 1;
      const scaleDisplayedY = rect.height / canvas.offsetHeight || 1;
      const mx = (clientX - rect.left) / scaleDisplayedX;
      const my = (clientY - rect.top)  / scaleDisplayedY;
      return { x: mx, y: my };
    }
    function pageToModel(clientX, clientY){ return visiblePointToModel(clientX, clientY); }
    function modelToPage(mx,my){
      const rect = canvas.getBoundingClientRect();
      const scaleDisplayedX = rect.width / canvas.offsetWidth || 1;
      const scaleDisplayedY = rect.height / canvas.offsetHeight || 1;
      return { x: rect.left + mx * scaleDisplayedX, y: rect.top + my * scaleDisplayedY };
    }

    function getNodeBounds(n){ return { x: n.x, y: n.y, w: n.w || 230, h: n.h || 120 }; }

    /* DOM-aware anchors: read actual node element bounding rect to avoid visual drift */
    function computeAnchors(n){
      const el = canvas.querySelector('.node[data-id="'+n.id+'"]');
      try {
        if(el){
          const nodeRect = el.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          const scaleDisplayedX = canvasRect.width / canvas.offsetWidth || 1;
          const scaleDisplayedY = canvasRect.height / canvas.offsetHeight || 1;
          const modelLeft = (nodeRect.left - canvasRect.left) / scaleDisplayedX;
          const modelTop  = (nodeRect.top  - canvasRect.top)  / scaleDisplayedY;
          const modelW    = nodeRect.width  / scaleDisplayedX;
          const modelH    = nodeRect.height / scaleDisplayedY;
          const xs = [ modelLeft + modelW*0.18, modelLeft + modelW*0.5, modelLeft + modelW*0.82 ];
          return [
            { x: xs[0], y: modelTop, side: 'top' },
            { x: xs[1], y: modelTop, side: 'top' },
            { x: xs[2], y: modelTop, side: 'top' },
            { x: xs[0], y: modelTop + modelH, side: 'bottom' },
            { x: xs[1], y: modelTop + modelH, side: 'bottom' },
            { x: xs[2], y: modelTop + modelH, side: 'bottom' },
            { x: modelLeft,     y: modelTop + modelH/2, side: 'left' },
            { x: modelLeft + modelW, y: modelTop + modelH/2, side: 'right' }
          ];
        }
      } catch(err){
        console.warn('computeAnchors(dom) failed, falling back to model coords', err);
      }
      const b = getNodeBounds(n);
      const xs = [ b.x + b.w*0.18, b.x + b.w*0.5, b.x + b.w*0.82 ];
      return [
        { x: xs[0], y: b.y, side: 'top' },
        { x: xs[1], y: b.y, side: 'top' },
        { x: xs[2], y: b.y, side: 'top' },
        { x: xs[0], y: b.y + b.h, side: 'bottom' },
        { x: xs[1], y: b.y + b.h, side: 'bottom' },
        { x: xs[2], y: b.y + b.h, side: 'bottom' },
        { x: b.x, y: b.y + b.h/2, side: 'left' },
        { x: b.x + b.w, y: b.y + b.h/2, side: 'right' }
      ];
    }

    /* Persistence */
    function loadModel(){ try{ const raw = localStorage.getItem(storageKey); model = raw ? JSON.parse(raw) : {nodes:[],links:[]}; }catch(e){ model={nodes:[],links:[]}; } }
    function saveModel(){ try{ localStorage.setItem(storageKey, JSON.stringify(model)); }catch(e){} flash('Saved'); }

    /* Grid */
    function updateGrid(){ if(!showGrid.checked){ canvas.style.backgroundImage='none'; return; } const size = gridSize; canvas.style.backgroundImage = `linear-gradient(to right, var(--grid-color) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)`; canvas.style.backgroundSize = size+'px '+size+'px'; }

    /* Transform & SVG sync */
    function syncSVGSize(){
      svg.setAttribute('width', canvas.offsetWidth);
      svg.setAttribute('height', canvas.offsetHeight);
      svg.setAttribute('viewBox', `0 0 ${canvas.offsetWidth} ${canvas.offsetHeight}`);
      svg.style.left = canvas.style.left || '0px';
      svg.style.top = canvas.style.top || '0px';
    }
    function applyTransform(){
      const tx = -canvas.offsetWidth/2 + pan.x;
      const ty = -canvas.offsetHeight/2 + pan.y;
      board.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
      zoomIndicator.textContent = Math.round(scale*100)+'%';
      syncSVGSize();
      renderLinks();
    }

    function zoomAt(newScale, clientX, clientY){
      const before = visiblePointToModel(clientX, clientY);
      scale = clamp(newScale, MIN_SCALE, MAX_SCALE);
      applyTransform();
      const rect = canvas.getBoundingClientRect();
      const scaleDisplayedX = rect.width / canvas.offsetWidth || 1;
      const scaleDisplayedY = rect.height / canvas.offsetHeight || 1;
      pan.x += ((clientX - rect.left) / scaleDisplayedX) - before.x;
      pan.y += ((clientY - rect.top)  / scaleDisplayedY) - before.y;
      applyTransform();
    }

    /* Nodes DOM */
    function createNodeDOM(n){
      const el = document.createElement('div');
      el.className = 'node';
      el.dataset.id = n.id;
      el.style.left = n.x+'px'; el.style.top = n.y+'px';
      el.style.width = (n.w||230)+'px'; el.style.background = n.color||'#fff';
      el.innerHTML = `<div class="mini"><button class="mini-edit" style="background:transparent;border:0;font-size:14px;cursor:pointer">✎</button></div><div class="title"></div><div class="body"></div>`;
      el.addEventListener('pointerdown', onNodePointerDown);
      el.addEventListener('click', (e)=>{ e.stopPropagation(); selectNode(n.id); if(connectMode) nodeClickForConnect(n.id); });
      el.addEventListener('dblclick', ()=> openModal(n.id));
      el.querySelector('.mini-edit').addEventListener('click', ev=>{ ev.stopPropagation(); openModal(n.id); });
      return el;
    }

    function renderNodes(){
      updateGrid();
      const ids = new Set(model.nodes.map(n=>n.id));
      Array.from(canvas.querySelectorAll('.node')).forEach(el=>{ if(!ids.has(el.dataset.id)) el.remove(); });
      model.nodes.forEach(n=>{
        let el = canvas.querySelector('.node[data-id="'+n.id+'"]');
        if(!el){ el = createNodeDOM(n); canvas.appendChild(el); }
        el.style.left = n.x+'px'; el.style.top = n.y+'px'; el.style.width = (n.w||230)+'px'; el.style.background = n.color||'#fff';
        el.classList.remove('node-shape-soft','node-shape-pill','node-shape-outline');
        if(n.shape==='soft') el.classList.add('node-shape-soft');
        if(n.shape==='pill') el.classList.add('node-shape-pill');
        if(n.shape==='outline'){ el.classList.add('node-shape-outline'); el.style.background='transparent'; }
        el.querySelector('.title').textContent = n.title||'Untitled';
        el.querySelector('.body').textContent = n.body||'';
        el.style.outline = (selectedNodeId === n.id) ? '3px solid rgba(11,116,255,0.12)' : 'none';
      });
      renderLinks();
    }

    function addNodeAt(x,y){
      const id = uid();
      const node = { id, x:Math.max(40,Math.round(x)), y:Math.max(40,Math.round(y)), w:230, h:120, title:'New block', body:'Double-click or click ✎ to edit', color:'#fffdf5', shape:'card' };
      model.nodes.push(node); saveModel(); renderNodes(); openModal(id);
    }

    /* Drag node */
    function onNodePointerDown(e){
      e.stopPropagation();
      const el = e.currentTarget; const id = el.dataset.id;
      draggingId = id;
      const node = model.nodes.find(n=>n.id===id);
      const pos = pageToModel(e.clientX,e.clientY);
      dragOffset.x = pos.x - (node.x||0);
      dragOffset.y = pos.y - (node.y||0);
      el.setPointerCapture(e.pointerId);
      el.addEventListener('pointermove', onNodePointerMove);
      el.addEventListener('pointerup', onNodePointerUp);
    }
    function onNodePointerMove(e){
      if(!draggingId) return;
      const pos = pageToModel(e.clientX,e.clientY);
      let x = pos.x - dragOffset.x; let y = pos.y - dragOffset.y;
      if(snapOn){
        const gs = gridSize; const snapX = Math.round(x/gs)*gs; const snapY = Math.round(y/gs)*gs;
        x = x + (snapX - x)*0.35; y = y + (snapY - y)*0.35;
      }
      const node = model.nodes.find(n=>n.id===draggingId);
      if(!node) return;
      node.x = Math.max(0, Math.round(x)); node.y = Math.max(0, Math.round(y));
      renderNodes();
    }
    function onNodePointerUp(e){
      const id = e.currentTarget.dataset.id;
      const node = model.nodes.find(n=>n.id===id);
      if(node && snapOn){ const gs = gridSize; node.x = Math.round(node.x/gs)*gs; node.y = Math.round(node.y/gs)*gs; }
      autoLinkOnDrop(node);
      draggingId = null;
      try{ e.currentTarget.removeEventListener('pointermove', onNodePointerMove); e.currentTarget.removeEventListener('pointerup', onNodePointerUp); }catch(err){}
      saveModel(); renderNodes();
    }

    /* Auto-link on drop by nearest anchors */
    function anchorDistance(a,b){ return Math.hypot(a.x - b.x, a.y - b.y); }
    function autoLinkOnDrop(node){
      if(!node) return;
      const threshold = 12;
      const anchorsA = computeAnchors(node);
      model.nodes.forEach(other=>{
        if(other.id === node.id) return;
        const anchorsB = computeAnchors(other);
        let best = Infinity, bestPair = null;
        anchorsA.forEach((pa,i)=>{
          anchorsB.forEach((pb,j)=>{
            const d = anchorDistance(pa,pb);
            if(d < best){ best = d; bestPair = { aIndex:i, bIndex:j, d }; }
          });
        });
        if(bestPair && bestPair.d <= threshold){
          const exists = model.links.some(l => l.from === node.id && l.to === other.id && l.fromAnchor === bestPair.aIndex && l.toAnchor === bestPair.bIndex);
          if(!exists){
            model.links.push({ id: uid(), from: node.id, to: other.id, fromAnchor: bestPair.aIndex, toAnchor: bestPair.bIndex, points: null });
          }
        }
      });
    }

    /* Pan/zoom */
    panLayer.addEventListener('pointerdown', e=>{
      if(e.target.closest('.node')) return;
      panLayer.setPointerCapture(e.pointerId);
      isPanning = true; panStart.x = e.clientX - pan.x; panStart.y = e.clientY - pan.y;
      panLayer.addEventListener('pointermove', onPanMove); panLayer.addEventListener('pointerup', onPanEnd);
    });
    function onPanMove(e){ if(!isPanning) return; pan.x = e.clientX - panStart.x; pan.y = e.clientY - panStart.y; applyTransform(); }
    function onPanEnd(e){ isPanning = false; panLayer.removeEventListener('pointermove', onPanMove); panLayer.removeEventListener('pointerup', onPanEnd); saveModel(); }

    panLayer.addEventListener('wheel', e=>{ e.preventDefault(); const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP; const newScale = scale + delta; zoomAt(newScale,e.clientX,e.clientY); }, { passive:false });

    // pinch
    panLayer.addEventListener('pointerdown', e=>{ pointerMap.set(e.pointerId,e); if(pointerMap.size===2){ const arr=Array.from(pointerMap.values()); pinchState={ dist: Math.hypot(arr[0].clientX-arr[1].clientX, arr[0].clientY-arr[1].clientY), scale:scale, center:{x:(arr[0].clientX+arr[1].clientX)/2,y:(arr[0].clientY+arr[1].clientY)/2} }; } e.target.setPointerCapture(e.pointerId); });
    panLayer.addEventListener('pointermove', e=>{ if(!pointerMap.has(e.pointerId)) return; pointerMap.set(e.pointerId,e); if(pinchState && pointerMap.size===2){ const arr=Array.from(pointerMap.values()); const dist=Math.hypot(arr[0].clientX-arr[1].clientX, arr[0].clientY-arr[1].clientY); const factor = dist / pinchState.dist; const newScale = clamp(pinchState.scale * factor, MIN_SCALE, MAX_SCALE); zoomAt(newScale, pinchState.center.x, pinchState.center.y); } });
    ['pointerup','pointercancel'].forEach(t=>panLayer.addEventListener(t,e=>{ pointerMap.delete(e.pointerId); if(pointerMap.size<2) pinchState=null; }));

    /* --- Improved orthogonal routing helpers --- */
    function expandRect(rect, pad){ return { left: rect.x - pad, top: rect.y - pad, right: rect.x + rect.w + pad, bottom: rect.y + rect.h + pad }; }
    function buildNodeRects(excludeIds = new Set(), pad = 8){
      const rects = [];
      model.nodes.forEach(n=>{ if(excludeIds.has(n.id)) return; const r = getNodeBounds(n); rects.push({ id: n.id, rect: expandRect(r, pad) }); });
      return rects;
    }
    function segmentIntersectsRect(p1, p2, rect){
      const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
      if(maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) return false;
      if(p1.y === p2.y){
        if(p1.y >= rect.top && p1.y <= rect.bottom) return !(maxX < rect.left || minX > rect.right);
        return false;
      }
      if(p1.x === p2.x){
        if(p1.x >= rect.left && p1.x <= rect.right) return !(maxY < rect.top || minY > rect.bottom);
        return false;
      }
      const edges = [
        [{x:rect.left, y:rect.top}, {x:rect.right, y:rect.top}],
        [{x:rect.right, y:rect.top}, {x:rect.right, y:rect.bottom}],
        [{x:rect.right, y:rect.bottom}, {x:rect.left, y:rect.bottom}],
        [{x:rect.left, y:rect.bottom}, {x:rect.left, y:rect.top}],
      ];
      for(const [e1,e2] of edges){ if(segmentsIntersect(p1,p2,e1,e2)) return true; }
      return false;
    }
    function segmentsIntersect(a1,a2,b1,b2){
      const orient = (p,q,r) => (q.x-p.x)*(r.y-p.y) - (q.y-p.y)*(r.x-p.x);
      const o1 = orient(a1,a2,b1), o2 = orient(a1,a2,b2), o3 = orient(b1,b2,a1), o4 = orient(b1,b2,a2);
      if(o1 === 0 && onSegment(a1,a2,b1)) return true;
      if(o2 === 0 && onSegment(a1,a2,b2)) return true;
      if(o3 === 0 && onSegment(b1,b2,a1)) return true;
      if(o4 === 0 && onSegment(b1,b2,a2)) return true;
      return (o1>0) !== (o2>0) && (o3>0) !== (o4>0);
    }
    function onSegment(p,q,r){ return Math.min(p.x,q.x) <= r.x && r.x <= Math.max(p.x,q.x) && Math.min(p.y,q.y) <= r.y && r.y <= Math.max(p.y,q.y); }
    function polylineIntersectsRects(pts, rects){ for(let i=0;i<pts.length-1;i++){ const a = pts[i], b = pts[i+1]; for(const r of rects){ if(segmentIntersectsRect(a,b,r.rect)) return true; } } return false; }

    function orthogonalRoute(aFrom, aTo){
      const sx = aFrom.x, sy = aFrom.y, tx = aTo.x, ty = aTo.y;
      const dx = Math.abs(tx - sx), dy = Math.abs(ty - sy);
      const margin = 12;
      if(dy < margin){ const mx = (sx + tx) / 2; return [ {x:sx,y:sy}, {x:mx,y:sy}, {x:mx,y:ty}, {x:tx,y:ty} ]; }
      if(dx < margin){ const my = (sy + ty)/2; return [ {x:sx,y:sy}, {x:sx,y:my}, {x:tx,y:my}, {x:tx,y:ty} ]; }

      const exclude = new Set();
      let fromNodeId = null, toNodeId = null;
      for(const n of model.nodes){
        const b = getNodeBounds(n);
        if(aFrom.x >= b.x && aFrom.x <= b.x + b.w && aFrom.y >= b.y && aFrom.y <= b.y + b.h) fromNodeId = n.id;
        if(aTo.x   >= b.x && aTo.x   <= b.x + b.w && aTo.y   >= b.y && aTo.y   <= b.y + b.h) toNodeId = n.id;
      }
      if(fromNodeId) exclude.add(fromNodeId); if(toNodeId) exclude.add(toNodeId);
      const rects = buildNodeRects(exclude, 8);

      const candidates = [];
      const midX = (sx + tx) / 2;
      const midY = (sy + ty) / 2;
      candidates.push([ {x:sx,y:sy}, {x:midX,y:sy}, {x:midX,y:ty}, {x:tx,y:ty} ]);
      candidates.push([ {x:sx,y:sy}, {x:sx,y:midY}, {x:tx,y:midY}, {x:tx,y:ty} ]);
      candidates.push([ {x:sx,y:sy}, {x:tx,y:sy}, {x:tx,y:ty} ]);
      candidates.push([ {x:sx,y:sy}, {x:sx,y:ty}, {x:tx,y:ty} ]);

      const pad = 18;
      const left = Math.min(sx,tx) - pad;
      const right = Math.max(sx,tx) + pad;
      const top = Math.min(sy,ty) - pad;
      const bottom = Math.max(sy,ty) + pad;
      candidates.push([ {x:sx,y:sy}, {x:left,y:sy}, {x:left,y:ty}, {x:tx,y:ty} ]);
      candidates.push([ {x:sx,y:sy}, {x:right,y:sy}, {x:right,y:ty}, {x:tx,y:ty} ]);
      candidates.push([ {x:sx,y:sy}, {x:sx,y:top}, {x:tx,y:top}, {x:tx,y:ty} ]);
      candidates.push([ {x:sx,y:sy}, {x:sx,y:bottom}, {x:tx,y:bottom}, {x:tx,y:ty} ]);

      candidates.push([ {x:sx,y:sy}, {x:tx,y:ty} ]);

      for(const pts of candidates){
        const cleanPts = [ pts[0] ];
        for(let i=1;i<pts.length;i++){
          const prev = cleanPts[cleanPts.length-1];
          if(Math.hypot(prev.x - pts[i].x, prev.y - pts[i].y) > 0.5) cleanPts.push(pts[i]);
        }
        if(!polylineIntersectsRects(cleanPts, rects)) return cleanPts;
      }
      return [ {x:sx,y:sy}, {x:midX,y:sy}, {x:midX,y:ty}, {x:tx,y:ty} ];
    }

    /* Links rendering & interaction */
    function renderLinks(){
      svg.innerHTML = '';
      const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
      defs.innerHTML = `<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${getComputedStyle(document.documentElement).getPropertyValue('--link-color').trim()||'#0f172a'}"></path></marker>`;
      svg.appendChild(defs);

      model.links.forEach(link=>{
        const fromNode = model.nodes.find(n=>n.id===link.from);
        const toNode = model.nodes.find(n=>n.id===link.to);
        if(!fromNode || !toNode) return;
        const aFrom = computeAnchors(fromNode)[ link.fromAnchor ?? 6 ];
        const aTo   = computeAnchors(toNode)[ link.toAnchor ?? 7 ];
        let pts;
        if(link.points && link.points.length){
          pts = [ {x:aFrom.x, y:aFrom.y} ].concat(link.points).concat([ {x:aTo.x, y:aTo.y} ]);
        } else {
          pts = orthogonalRoute(aFrom, aTo);
        }
        const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
        const poly = document.createElementNS('http://www.w3.org/2000/svg','polyline');
        poly.setAttribute('points', ptsStr); poly.setAttribute('fill','none');
        poly.setAttribute('stroke', selectedLinkId===link.id ? getComputedStyle(document.documentElement).getPropertyValue('--link-selected').trim() : getComputedStyle(document.documentElement).getPropertyValue('--link-color').trim());
        poly.setAttribute('stroke-width', '2'); poly.setAttribute('stroke-linejoin','round');
        poly.classList.add('path-line','connector-shadow'); poly.dataset.id = link.id; poly.style.pointerEvents = 'stroke';
        poly.addEventListener('click', e=>{ e.stopPropagation(); selectLink(link.id); });
        poly.addEventListener('dblclick', e=>{ e.stopPropagation(); const rect = canvas.getBoundingClientRect(); const mx = (e.clientX - rect.left) / (rect.width / canvas.offsetWidth || 1); const my = (e.clientY - rect.top) / (rect.height / canvas.offsetHeight || 1); link.points = link.points || []; link.points.push({x:mx,y:my}); saveModel(); renderLinks(); });
        svg.appendChild(poly);

        const start = pts[0], end = pts[pts.length-1];
        const startHandle = document.createElementNS('http://www.w3.org/2000/svg','circle');
        startHandle.setAttribute('cx', start.x); startHandle.setAttribute('cy', start.y); startHandle.setAttribute('r',6);
        startHandle.classList.add('endpoint-handle'); startHandle.dataset.linkId = link.id; startHandle.dataset.end = 'from';
        enableEndpointDrag(startHandle, link, 'from'); svg.appendChild(startHandle);

        const endHandle = document.createElementNS('http://www.w3.org/2000/svg','circle');
        endHandle.setAttribute('cx', end.x); endHandle.setAttribute('cy', end.y); endHandle.setAttribute('r',6);
        endHandle.classList.add('endpoint-handle'); endHandle.dataset.linkId = link.id; endHandle.dataset.end = 'to';
        enableEndpointDrag(endHandle, link, 'to'); svg.appendChild(endHandle);

        const prev = pts[pts.length-2] || start;
        const arrowLine = document.createElementNS('http://www.w3.org/2000/svg','line');
        arrowLine.setAttribute('x1', prev.x); arrowLine.setAttribute('y1', prev.y);
        arrowLine.setAttribute('x2', end.x); arrowLine.setAttribute('y2', end.y);
        arrowLine.setAttribute('stroke','transparent'); arrowLine.setAttribute('marker-end','url(#arrow)');
        svg.appendChild(arrowLine);

        (link.points||[]).forEach((p,i)=>{
          const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
          c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r',7);
          c.setAttribute('fill','#fff'); c.setAttribute('stroke','#0b74ff'); c.setAttribute('stroke-width','1.8'); c.style.pointerEvents='auto';
          c.dataset.linkId = link.id; c.dataset.bendIndex = i;
          enableBendDrag(c, link, i);
          svg.appendChild(c);
        });
      });

      syncSVGSize();
    }

    /* Endpoint drag & previews */
    function enableEndpointDrag(circleEl, link, which){
      circleEl.addEventListener('pointerdown', (e)=>{
        e.stopPropagation(); circleEl.setPointerCapture(e.pointerId);
        const onMove = (ev)=>{
          const rect = canvas.getBoundingClientRect();
          const mx = (ev.clientX - rect.left) / (rect.width / canvas.offsetWidth || 1);
          const my = (ev.clientY - rect.top)  / (rect.height / canvas.offsetHeight || 1);
          circleEl.setAttribute('cx', mx); circleEl.setAttribute('cy', my);
          renderTemporaryLinkPreview(link, {x:mx,y:my}, which);
        };
        const onUp = (ev)=>{
          circleEl.releasePointerCapture(ev.pointerId); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
          const rect = canvas.getBoundingClientRect();
          const mx = (ev.clientX - rect.left) / (rect.width / canvas.offsetWidth || 1);
          const my = (ev.clientY - rect.top)  / (rect.height / canvas.offsetHeight || 1);
          const snap = findNearestAnchor({x:mx,y:my}, 18);
          if(snap){
            if(which === 'from'){ link.from = snap.nodeId; link.fromAnchor = snap.anchorIndex; }
            else { link.to = snap.nodeId; link.toAnchor = snap.anchorIndex; }
            link.points = link.points || null;
          } else {
            if(!link.points) link.points = [];
            if(which === 'from'){ link.points.unshift({ x: mx, y: my }); }
            else { link.points.push({ x: mx, y: my }); }
          }
          saveModel(); renderLinks();
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    }

    function renderTemporaryLinkPreview(link, tempPoint, which){
      renderLinks();
      const fromNode = model.nodes.find(n=>n.id===link.from);
      const toNode = model.nodes.find(n=>n.id===link.to);
      if(!fromNode || !toNode) return;
      const aFrom = computeAnchors(fromNode)[ link.fromAnchor ?? 6 ];
      const aTo   = computeAnchors(toNode)[ link.toAnchor ?? 7 ];
      let pts;
      if(which === 'from'){ pts = orthogonalRoute(tempPoint, aTo); } else { pts = orthogonalRoute(aFrom, tempPoint); }
      const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
      const preview = document.createElementNS('http://www.w3.org/2000/svg','polyline');
      preview.setAttribute('points', ptsStr);
      preview.setAttribute('fill','none');
      preview.setAttribute('stroke', '#0b74ff');
      preview.setAttribute('stroke-width', 1.8);
      preview.setAttribute('stroke-dasharray','6 6');
      preview.setAttribute('pointer-events','none');
      svg.appendChild(preview);
    }

    function findNearestAnchor(pt, threshold){
      let best = Infinity, bestFound = null;
      model.nodes.forEach(n=>{
        const anchors = computeAnchors(n);
        anchors.forEach((a,i)=>{
          const d = Math.hypot(a.x - pt.x, a.y - pt.y);
          if(d < best){ best = d; bestFound = { nodeId: n.id, anchorIndex: i, anchor: a, dist: d }; }
        });
      });
      if(bestFound && bestFound.dist <= threshold) return bestFound;
      return null;
    }

    function enableBendDrag(circleEl, link, index){
      circleEl.addEventListener('pointerdown', (e)=>{
        e.stopPropagation(); circleEl.setPointerCapture(e.pointerId);
        const onMove = (ev)=>{
          const rect = canvas.getBoundingClientRect();
          const mx = (ev.clientX - rect.left) / (rect.width / canvas.offsetWidth || 1);
          const my = (ev.clientY - rect.top)  / (rect.height / canvas.offsetHeight || 1);
          link.points[index] = { x: mx, y: my }; renderLinks();
        };
        const onUp = (ev)=>{
          circleEl.releasePointerCapture(ev.pointerId); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); saveModel();
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
      circleEl.addEventListener('dblclick', e=>{ e.stopPropagation(); link.points.splice(index,1); if(link.points.length===0) link.points=null; saveModel(); renderLinks(); });
    }

    /* Selection & delete */
    function selectLink(id){
      selectedLinkId = id; selectedLinkLabel.textContent = id || 'none'; toolDeleteLink.disabled = !id;
      selectedNodeId = null; toolDeleteNode.disabled = true; renderNodes(); renderLinks();
    }
    function selectNode(id){
      selectedNodeId = id; selectedLinkId = null; toolDeleteNode.disabled = !id; toolDeleteLink.disabled = true; selectedLinkLabel.textContent = 'none'; renderNodes(); renderLinks();
    }

    toolDeleteNode.addEventListener('click', ()=>{
      if(!selectedNodeId) return;
      if(!confirm('Delete selected block?')) return;
      model.links = model.links.filter(l => l.from !== selectedNodeId && l.to !== selectedNodeId);
      model.nodes = model.nodes.filter(n => n.id !== selectedNodeId);
      selectedNodeId = null; toolDeleteNode.disabled = true; saveModel(); renderNodes();
    });

    toolDeleteLink.addEventListener('click', ()=>{
      if(!selectedLinkId) return;
      if(!confirm('Delete selected link?')) return;
      model.links = model.links.filter(l => l.id !== selectedLinkId);
      selectedLinkId = null; selectedLinkLabel.textContent = 'none'; toolDeleteLink.disabled = true; saveModel(); renderLinks();
    });

    window.addEventListener('keydown', (e)=>{
      if(e.key === 'Delete' || e.key === 'Backspace'){
        if(selectedNodeId){
          model.links = model.links.filter(l => l.from !== selectedNodeId && l.to !== selectedNodeId);
          model.nodes = model.nodes.filter(n => n.id !== selectedNodeId);
          selectedNodeId = null; toolDeleteNode.disabled = true; saveModel(); renderNodes();
        } else if(selectedLinkId){
          model.links = model.links.filter(l => l.id !== selectedLinkId);
          selectedLinkId = null; selectedLinkLabel.textContent = 'none'; toolDeleteLink.disabled = true; saveModel(); renderLinks();
        }
      }
    });

    /* Connector flow */
    toolConnector.addEventListener('click', ()=> {
      connectMode = !connectMode; connectFrom = null;
      toolConnector.style.background = connectMode ? '#fdecea' : '';
      toolConnector.textContent = connectMode ? 'Connector (active)' : 'Connector';
      if(connectMode) flash('Connector active — click source then target');
    });

    function nodeClickForConnect(id){
      if(!connectMode) return;
      if(!connectFrom){ connectFrom = id; highlightNode(connectFrom,true); return; }
      if(connectFrom === id){ highlightNode(connectFrom,false); connectFrom = null; return; }
      const fromNode = model.nodes.find(n=>n.id===connectFrom);
      const toNode = model.nodes.find(n=>n.id===id);
      if(!fromNode || !toNode){ connectFrom = null; setConnectMode(false); return; }
      const anchorsFrom = computeAnchors(fromNode);
      const anchorsTo = computeAnchors(toNode);
      let best = Infinity, bestPair = null;
      anchorsFrom.forEach((af,i)=>{ anchorsTo.forEach((at,j)=>{ const d = Math.hypot(af.x - at.x, af.y - at.y); if(d < best){ best = d; bestPair = {i,j}; } }); });
      if(bestPair){
        model.links.push({ id: uid(), from: connectFrom, to: id, fromAnchor: bestPair.i, toAnchor: bestPair.j, points: null });
        saveModel(); renderLinks();
      }
      highlightNode(connectFrom,false); connectFrom = null; setConnectMode(false);
    }
    function highlightNode(id,on){ const el = canvas.querySelector('.node[data-id="'+id+'"]'); if(!el) return; el.style.outline = on ? '3px solid rgba(11,116,255,0.12)' : 'none'; }
    function setConnectMode(on){ connectMode = !!on; connectFrom = null; toolConnector.style.background = connectMode ? '#fdecea' : ''; toolConnector.textContent = connectMode ? 'Connector (active)' : 'Connector'; }

    /* Modal editing */
    function openModal(id){
      selectedNodeId = id;
      const node = model.nodes.find(n=>n.id===id);
      if(!node) return;
      modalTitle.value = node.title || '';
      modalBody.value = node.body || '';
      modalColor.value = node.color || '#ffffff';
      modalShape.value = node.shape || 'card';
      modal.style.display = 'flex'; modal.setAttribute('aria-hidden','false'); modalTitle.focus();
      selectNode(id);
    }
    function closeModal(){ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); }
    saveModalBtn.addEventListener('click', ()=>{ if(!selectedNodeId) return closeModal(); const node = model.nodes.find(n=>n.id===selectedNodeId); if(!node) return closeModal(); node.title = modalTitle.value.trim(); node.body = modalBody.value.trim(); node.color = modalColor.value; node.shape = modalShape.value; saveModel(); renderNodes(); closeModal(); });
    cancelModalBtn.addEventListener('click', closeModal);
    deleteBlockBtn.addEventListener('click', ()=>{ if(!selectedNodeId) return closeModal(); if(!confirm('Delete this block?')) return; model.links = model.links.filter(l => l.from !== selectedNodeId && l.to !== selectedNodeId); model.nodes = model.nodes.filter(n => n.id !== selectedNodeId); saveModel(); renderNodes(); closeModal(); });

    /* UI actions */
    function handleAddNode(){
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const pos = visiblePointToModel(cx, cy);
      addNodeAt(pos.x - 100, pos.y - 40);
    }
    document.getElementById('addNode')?.addEventListener('click', handleAddNode);
    toolAddNode.addEventListener('click', handleAddNode);

    zoomInCorner.addEventListener('click', ()=> zoomAt(scale + SCALE_STEP, window.innerWidth/2, window.innerHeight/2));
    zoomOutCorner.addEventListener('click', ()=> zoomAt(scale - SCALE_STEP, window.innerWidth/2, window.innerHeight/2));

    saveBoardBtn.addEventListener('click', ()=> saveModel());
    backToProjects.addEventListener('click', ()=> { saveModel(); window.location.href = 'projects.html'; });

    exportBtn.addEventListener('click', ()=>{ const data = JSON.stringify(model,null,2); const blob = new Blob([data],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = (projectId||'board') + '.board.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
    importFile.addEventListener('change', e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=function(){ try{ const parsed=JSON.parse(r.result); if(parsed && parsed.nodes){ model=parsed; saveModel(); renderNodes(); flash('Imported'); } else alert('Invalid file'); } catch(err){ alert('Invalid JSON'); } }; r.readAsText(f); });

    showGrid.addEventListener('change', ()=> updateGrid());
    gridSizeInput.addEventListener('change', ()=>{ gridSize = clamp(Number(gridSizeInput.value)||20,5,200); updateGrid(); });
    centerBtn.addEventListener('click', ()=> { pan={x:0,y:0}; scale=1; applyTransform(); });

    menuIcon.addEventListener('click', ()=> { const isOpen = floatingTools.classList.toggle('open'); floatingTools.setAttribute('aria-hidden', isOpen ? 'false':'true'); });

    canvas.addEventListener('click', (e)=>{ selectedNodeId = null; selectedLinkId = null; toolDeleteNode.disabled = true; toolDeleteLink.disabled = true; selectedLinkLabel.textContent = 'none'; renderNodes(); renderLinks(); });

    /* Bootstrap */
    loadModel();
    if(!model.nodes.length){
      model.nodes.push({ id: uid(), x:120, y:120, w:260, h:120, title:'Start', body:'Drop nodes near others to auto-link.', color:'#fff8f0', shape:'soft' });
      saveModel();
    }
    updateGrid(); renderNodes(); applyTransform();

    /* Debug API */
    window.__ariesWorkspace = window.__ariesWorkspace || {};
    window.__ariesWorkspace.model = model;
    window.__ariesWorkspace.saveModel = saveModel;
    window.__ariesWorkspace.addNodeAt = (x,y)=>addNodeAt(x,y);
    window.__ariesWorkspace.showAnchors = function(show){
      document.querySelectorAll('.anchor-dot').forEach(el=>el.remove());
      if(!show) return;
      model.nodes.forEach(n=>{
        const anchors = computeAnchors(n);
        anchors.forEach((a,i)=>{
          const d = document.createElement('div'); d.className='anchor-dot'; d.style.left=(a.x)+'px'; d.style.top=(a.y)+'px'; canvas.appendChild(d);
        });
      });
    };

  }; // end ready()

  if(document.readyState === 'complete' || document.readyState === 'interactive') ready(); else window.addEventListener('DOMContentLoaded', ready);
})();
