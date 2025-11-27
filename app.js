// app.js — header + sidebar wiring (sidebar fully hidden until hamburger click)
// Also includes Firebase auth bootstrap + AriesDB facade (unchanged behavior).
// Load with: <script type="module" src="app.js"></script>

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { collection, getDocs, addDoc, doc, getDoc, updateDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* -------------------- Firebase auth bootstrap -------------------- */
export const authPromise = new Promise((resolve, reject) => {
  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled) {
      console.warn('Firebase auth timed out after 10s — continuing without no user.');
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

/* -------------------- AriesDB facade -------------------- */
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

/* -------------------- UI: Header & Sidebar (hidden-by-default behavior) -------------------- */

/*
Expected HTML already in your pages:

<header id="aries-topbar" class="aries-topbar" role="banner">
  <button id="aries-hamburger" class="aries-hamburger" aria-controls="aries-sidebar" aria-expanded="false">☰</button>
  <div class="aries-title">PROJECT MANAGER</div>
  <a href="index.html" class="aries-brand"><img src="images/goat.png" class="aries-logo"></a>
</header>

<aside id="aries-sidebar" class="aries-sidebar hidden" role="complementary" aria-label="Project list">
  <nav class="aries-sidebar-nav"> ... </nav>
</aside>
*/

function createOverlayIfMissing() {
  let overlay = document.getElementById('aries-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'aries-overlay';
    overlay.className = 'aries-overlay hidden';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
  }
  return overlay;
}

function initHeaderSidebar() {
  const hamburger = document.getElementById('aries-hamburger');
  const sidebar = document.getElementById('aries-sidebar');
  if (!hamburger || !sidebar) {
    console.warn('Header or sidebar element missing — header/sidebar wiring skipped.');
    return;
  }

  const overlay = createOverlayIfMissing();

  // Utility to update aria
  function syncAria(open) {
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    sidebar.setAttribute('aria-hidden', open ? 'false' : 'true');
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function openSidebar() {
    sidebar.classList.remove('hidden');
    sidebar.classList.add('open');
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
    document.body.classList.add('aries-sidebar-open');
    syncAria(true);
    // focus first focusable element inside sidebar for accessibility
    setTimeout(() => {
      const first = sidebar.querySelector('button, a, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
    }, 120);
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebar.classList.add('hidden');
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
    document.body.classList.remove('aries-sidebar-open');
    syncAria(false);
    // return focus to hamburger for usability
    setTimeout(() => hamburger.focus(), 60);
  }

  function toggleSidebar() {
    const open = sidebar.classList.contains('open');
    if (open) closeSidebar();
    else openSidebar();
  }

  // Click hamburger toggles sidebar
  hamburger.addEventListener('click', (e) => {
    e.preventDefault();
    toggleSidebar();
  });

  // Clicking overlay (empty space) hides the sidebar
  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    closeSidebar();
  });

  // Also hide when clicking outside the sidebar (anywhere on body except sidebar)
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (sidebar.classList.contains('open')) {
      if (!sidebar.contains(target) && target !== hamburger && !hamburger.contains(target) && target !== overlay) {
        closeSidebar();
      }
    }
  }, true); // capture to detect early

  // Escape key closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (sidebar.classList.contains('open')) closeSidebar();
    }
    // 'm' toggles but don't when typing
    const tag = document.activeElement && document.activeElement.tagName;
    if ((e.key === 'm' || e.key === 'M') && !/INPUT|TEXTAREA/.test(tag)) toggleSidebar();
  });

  // Keep header aria in sync if some external code toggles sidebar state
  // Provide custom events if other modules want to open/close
  window.addEventListener('aries:sidebarOpen', () => openSidebar());
  window.addEventListener('aries:sidebarClose', () => closeSidebar());

  // Initial state: ensure hidden
  closeSidebar();
}

/* -------------------- populate sidebar projects if empty -------------------- */
async function populateSidebarProjects() {
  const sidebar = document.getElementById('aries-sidebar');
  if (!sidebar) return;
  const nav = sidebar.querySelector('.aries-sidebar-nav') || sidebar;
  if (!nav) return;
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

/* -------------------- boot -------------------- */
function boot() {
  document.documentElement.style.setProperty('--aries-sidebar-width', '0px'); // no reserved width
  try { initHeaderSidebar(); } catch (e) { console.warn('initHeaderSidebar failed', e); }
  setTimeout(populateSidebarProjects, 100);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
