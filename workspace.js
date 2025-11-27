// workspace.js — minimal workspace renderer (ready-to-replace)
(function () {
  const board = document.getElementById('board') || document.querySelector('.board');
  if (!board) {
    console.warn('workspace.js: #board not found — aborting.');
    return;
  }

  const projectId = new URLSearchParams(location.search).get('id');
  let model = { nodes: [], links: [] };

  async function loadModel() {
    if (projectId && window.AriesDB && window.AriesDB.loadProjectData) {
      const d = await window.AriesDB.loadProjectData(projectId);
      if (d) model = { nodes: d.nodes || [], links: d.links || [] };
    } else {
      // placeholder
      model.nodes = [
        { id: 'n1', x: 140, y: 120, w: 220, h: 100, title: 'Home' },
        { id: 'n2', x: 460, y: 220, w: 220, h: 100, title: 'Task A' }
      ];
      model.links = [{ from: 'n1', to: 'n2' }];
    }
    render();
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function render() {
    board.innerHTML = '';
    board.style.position = board.style.position || 'relative';

    model.nodes.forEach(n => {
      const el = document.createElement('div');
      el.className = 'wf-node';
      el.id = `node-${n.id}`;
      el.style.position = 'absolute';
      el.style.left = (n.x || 0) + 'px';
      el.style.top = (n.y || 0) + 'px';
      el.style.width = (n.w || 220) + 'px';
      el.style.height = (n.h || 100) + 'px';
      el.style.borderRadius = '8px';
      el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.06)';
      el.style.background = '#fff';
      el.style.border = '1px solid rgba(0,0,0,0.08)';
      el.style.padding = '10px';
      el.innerHTML = `
        <div class="wf-node-title" style="font-weight:700;margin-bottom:8px">${escapeHtml(n.title||'')}</div>
        <div class="wf-node-body" contenteditable="true" data-node="${n.id}" style="min-height:22px">${escapeHtml(n.body||'')}</div>
      `;
      board.appendChild(el);
    });

    // svg links
    const svg = document.getElementById('workspace-links-svg');
    if (svg) {
      svg.innerHTML = '';
      model.links.forEach(l => {
        const from = model.nodes.find(x => x.id === l.from);
        const to = model.nodes.find(x => x.id === l.to);
        if (!from || !to) return;
        const x1 = (from.x || 0) + (from.w || 220);
        const y1 = (from.y || 0) + ((from.h || 100) / 2);
        const x2 = (to.x || 0);
        const y2 = (to.y || 0) + ((to.h || 100) / 2);
        const path = document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
        path.setAttribute('stroke','#2c6f84');
        path.setAttribute('stroke-width','3');
        path.setAttribute('fill','none');
        svg.appendChild(path);
      });
    }
  }

  board.addEventListener('focusout', async (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('[contenteditable][data-node]')) {
      const id = t.dataset.node;
      const node = model.nodes.find(n => n.id === id);
      if (node) {
        node.body = t.innerText;
        if (projectId && window.AriesDB && window.AriesDB.saveProjectWorkspace) {
          try { await window.AriesDB.saveProjectWorkspace(projectId, model.nodes, model.links); } catch (err) { console.warn('autosave failed', err); }
        }
      }
    }
  });

  loadModel();
})();
