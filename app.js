// app.js
// Merged header + sidebar wiring, Firebase auth bootstrap, AriesDB facade,
// plus light project population. Assumes header.html and sidebar.html are present in pages
// and all styles live in main.css.
// Load with: <script type="module" src="app.js"></script>

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { collection, getDocs, addDoc, doc, getDoc, updateDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ------------------------- Firebase auth bootstrap ------------------------- */
export const authPromise = new Promise((resolve, reject) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) {
      console.warn('Firebase auth timed out after 10s — continuing without user.');
      reject(new Error('Firebase auth timeout'));
    }
  }, 10000);

  try {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        settled = true;
        clearTimeout(timer);
        window.currentUser = user;
        resolve(user);
      } else {
        signInAnonymously(auth).catch(err => {
          settled = true;
          clearTimeout(timer);
          console.warn('Anonymous sign-in failed', err);
          reject(err);
        });
      }
    });
  } catch (err) {
    clearTimeout(timer);
    reject(err);
  }
});

/* ------------------------- AriesDB facade ------------------------- */
window.AriesDB = {
  async getProjects() {
    await authPromise.catch(()=>{});
    try {
      const q = query(collection(db, 'projects'), orderBy('createdAt','desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error('AriesDB.getProjects', e);
      return [];
    }
  },

  async createProject(name) {
    await authPromise.catch(()=>{});
    try {
      const ref = await addDoc(collection(db, 'projects'), {
        name, status: 'Active', owner: window.currentUser?.uid || null,
        createdAt: serverTimestamp(), nodes: [], links: []
      });
      return ref.id;
    } catch (e) {
      console.error('AriesDB.createProject', e);
      return null;
    }
  },

  async loadProjectData(projectId) {
    await authPromise.catch(()=>{});
    try {
      const r = doc(db, 'projects', projectId);
      const s = await getDoc(r);
      return s.exists() ? s.data() : null;
    } catch (e) {
      console.error('AriesDB.loadProjectData', e);
      return null;
    }
  },

  async saveProjectWorkspace(projectId, nodes, links) {
    await authPromise.catch(()=>{});
    try {
      const r = doc(db, 'projects', projectId);
      await updateDoc(r, { nodes: nodes||[], links: links||[], lastModified: serverTimestamp() });
      return true;
    } catch (e) {
      console.error('AriesDB.saveProjectWorkspace', e);
      return false;
    }
  }
};

/* ------------------------- Header init ------------------------- */
function initHeader() {
  const hamburger = document.getElementById('aries-hamburger');
  if (!hamburger) return;

  function syncAria() {
    const sidebar = document.getElementById('aries-sidebar');
    const expanded = sidebar && sidebar.classList.contains('open');
    hamburger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  hamburger.addEventListener('click', (ev) => {
    ev.preventDefault();
    window.dispatchEvent(new CustomEvent('aries:toggleSidebar'));
  });

  window.addEventListener('aries:sidebarState', syncAria);
  setTimeout(syncAria, 30);
}

/* ------------------------- Sidebar init ------------------------- */
function initSidebar({ breakpoint = 900 } = {}) {
  const sidebar = document.getElementById('aries-sidebar');
  if (!sidebar) return;

  const back = document.getElementById('aries-sidebar-back');
  const STORAGE_KEY = 'aries:sidebarOpen_v3';

  const isDesktop = () => window.matchMedia(`(min-width:${breakpoint}px)`).matches;

  const persist = (v) => { try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch(_){} };
  const readPref = () => { try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch(_) { return false; } };

  function setOpen(open, opts = { focusFirst: true }) {
    if (open) {
      sidebar.classList.remove('collapsed'); sidebar.classList.add('open');
      document.body.classList.add('aries-sidebar-open');
      persist(true);
    } else {
      sidebar.classList.remove('open'); sidebar.classList.add('collapsed');
      document.body.classList.remove('aries-sidebar-open');
      persist(false);
    }
    window.dispatchEvent(new CustomEvent('aries:sidebarState'));
    if (opts.focusFirst) {
      const first = sidebar.querySelector('button, a, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
    }
  }

  function toggle() { setOpen(!sidebar.classList.contains('open')); }

  back?.addEventListener('click', () => setOpen(false));
  window.addEventListener('aries:toggleSidebar', toggle);

  document.addEventListener('click', (e) => {
    if (!sidebar.classList.contains('open')) return;
    const topbar = document.getElementById('aries-topbar');
    if (!sidebar.contains(e.target) && !topbar.contains(e.target)) {
      if (!isDesktop()) setOpen(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
    if ((e.key === 'm' || e.key === 'M') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) toggle();
  });

  // wire project buttons (if any)
  sidebar.querySelectorAll('.aries-project, .project-item, .aries-project-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (id) location.href = `project_detail.html?id=${id}`;
    });
  });

  if (isDesktop() && readPref()) setOpen(true, { focusFirst: false });
  else setOpen(false, { focusFirst: false });

  window.aries = window.aries || {};
  window.aries.sidebar = { setOpen, toggle };
}

/* ------------------------- Populate sidebar projects (if sidebar nav empty) ------------------------- */
async function populateSidebarProjects() {
  const sidebar = document.getElementById('aries-sidebar');
  if (!sidebar) return;
  const nav = sidebar.querySelector('.aries-sidebar-nav') || sidebar.querySelector('.project-list-placeholder');
  if (!nav) return;

  // If there are already project items, don't overwrite
  const existing = nav.querySelectorAll('.aries-project, .project-item');
  if (existing && existing.length > 0) return;

  try {
    const projects = await window.AriesDB.getProjects();
    if (!projects || projects.length === 0) return;
    nav.innerHTML = '';
    projects.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'aries-project';
      btn.textContent = p.name || 'Untitled';
      btn.dataset.id = p.id;
      nav.appendChild(btn);
      btn.addEventListener('click', () => location.href = `project_detail.html?id=${p.id}`);
    });
  } catch (e) {
    console.warn('populateSidebarProjects', e);
  }
}

/* ------------------------- Boot sequence ------------------------- */
function boot() {
  try { initHeader(); } catch(e) { console.warn('initHeader', e); }
  try { initSidebar({ breakpoint: 900 }); } catch(e) { console.warn('initSidebar', e); }
  setTimeout(populateSidebarProjects, 100);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
