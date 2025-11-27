// app.js — merged header + sidebar wiring, Firebase auth bootstrap, AriesDB facade
// Put this in your project root and load with: <script type="module" src="app.js"></script>

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, getDoc, updateDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* --------------------  Firebase auth bootstrap -------------------- */
export const authPromise = new Promise((resolve, reject) => {
  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled) {
      console.warn('Firebase auth timed out after 10s — proceeding without user.');
      reject(new Error('Firebase auth timeout'));
    }
  }, 10000);

  try {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        settled = true;
        clearTimeout(timeout);
        window.currentUser = user;
        resolve(user);
      } else {
        // try anonymous sign-in
        signInAnonymously(auth).catch(err => {
          settled = true;
          clearTimeout(timeout);
          console.warn('Anonymous sign-in failed', err);
          reject(err);
        });
      }
    });
  } catch (err) {
    clearTimeout(timeout);
    reject(err);
  }
});

/* --------------------  AriesDB - small facade for pages -------------------- */
window.AriesDB = {
  async getProjects() {
    await authPromise.catch(()=>{}); // continue even if auth failed
    try {
      const q = query(collection(db, 'projects'), orderBy('createdAt','desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error('AriesDB.getProjects error', e);
      return [];
    }
  },

  async createProject(name) {
    await authPromise.catch(()=>{});
    try {
      const ref = await addDoc(collection(db,'projects'), {
        name,
        status: 'Active',
        owner: window.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        nodes: [],
        links: []
      });
      return ref.id;
    } catch (e) {
      console.error('AriesDB.createProject error', e);
      return null;
    }
  },

  async loadProjectData(projectId) {
    await authPromise.catch(()=>{});
    try {
      const ref = doc(db, 'projects', projectId);
      const s = await getDoc(ref);
      return s.exists() ? s.data() : null;
    } catch (e) {
      console.error('AriesDB.loadProjectData error', e);
      return null;
    }
  },

  async saveProjectWorkspace(projectId, nodes, links) {
    await authPromise.catch(()=>{});
    try {
      const ref = doc(db,'projects',projectId);
      await updateDoc(ref, { nodes: nodes||[], links: links||[], lastModified: serverTimestamp() });
      return true;
    } catch (e) {
      console.error('AriesDB.saveProjectWorkspace error', e);
      return false;
    }
  }
};

/* --------------------  Header: initHeader() -------------------- */
/* header.html should contain:
<header id="aries-topbar" class="aries-topbar" role="banner">
  <button id="aries-hamburger" ...>☰</button>
  <div class="aries-title">PROJECT MANAGER</div>
  <a href="index.html" class="aries-brand"><img src="images/goat.png" class="aries-logo"></a>
</header>
*/
function initHeader() {
  const hamburger = document.getElementById('aries-hamburger');
  if (!hamburger) return;

  function sync() {
    const sidebar = document.getElementById('aries-sidebar');
    const expanded = sidebar && sidebar.classList.contains('open');
    hamburger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  hamburger.addEventListener('click', (e) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('aries:toggleSidebar'));
  });

  window.addEventListener('aries:sidebarState', sync);
  // initial sync shortly after load
  setTimeout(sync, 30);
}

/* --------------------  Sidebar: initSidebar() -------------------- */
/* sidebar.html should contain:
<aside id="aries-sidebar" class="aries-sidebar collapsed" role="complementary">
  <div class="aries-sidebar-top"><button id="aries-sidebar-back">◀</button></div>
  <nav class="aries-sidebar-nav"> ... project buttons ... </nav>
</aside>
*/
function initSidebar({ breakpoint = 900 } = {}) {
  const sidebar = document.getElementById('aries-sidebar');
  if (!sidebar) return;

  const back = document.getElementById('aries-sidebar-back');
  const STORAGE_KEY = 'aries:sidebarOpen_v3';

  function isDesktop() {
    return window.matchMedia(`(min-width:${breakpoint}px)`).matches;
  }

  function persist(v) {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch (e) {}
  }
  function readPref() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

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

  // click outside to collapse on small screens
  document.addEventListener('click', (e) => {
    if (!sidebar.classList.contains('open')) return;
    const topbar = document.getElementById('aries-topbar');
    if (!sidebar.contains(e.target) && !topbar.contains(e.target)) {
      if (!isDesktop()) setOpen(false);
    }
  });

  // keyboard handlers
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
    if ((e.key === 'm' || e.key === 'M') &&
        !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      toggle();
    }
  });

  // demo wiring for project buttons (they should have data-id attributes)
  sidebar.querySelectorAll('.aries-project, .project-item, .aries-project-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (id) location.href = `project_detail.html?id=${id}`;
    });
  });

  // initial state based on pref + width
  if (isDesktop() && readPref()) setOpen(true, { focusFirst: false });
  else setOpen(false, { focusFirst: false });

  // resize behavior
  window.addEventListener('resize', () => {
    if (!isDesktop()) setOpen(false, { focusFirst: false });
    else if (readPref()) setOpen(true, { focusFirst: false });
  });

  // expose control
  window.aries = window.aries || {};
  window.aries.sidebar = { setOpen, toggle };
}

/* --------------------  Small helper to render project list from Firestore (optional) -------------------- */
async function populateSidebarProjects() {
  const sidebar = document.getElementById('aries-sidebar');
  if (!sidebar) return;
  const nav = sidebar.querySelector('.aries-sidebar-nav') || sidebar.querySelector('.project-list-placeholder');
  if (!nav) return;

  // If user already placed static project buttons, do nothing
  const existing = nav.querySelectorAll('.aries-project, .project-item');
  if (existing && existing.length > 0) return;

  // otherwise fetch projects and render minimal buttons
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
      btn.addEventListener('click', ()=> location.href = `project_detail.html?id=${p.id}`);
    });
  } catch (e) {
    console.warn('populateSidebarProjects failed', e);
  }
}

/* --------------------  Boot on DOMContentLoaded -------------------- */
function boot() {
  try { initHeader(); } catch (e) { console.warn('initHeader failed', e); }
  try { initSidebar({ breakpoint: 900 }); } catch (e) { console.warn('initSidebar failed', e); }
  // populate sidebar if it needs dynamic items
  setTimeout(populateSidebarProjects, 120);
}

// run
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
