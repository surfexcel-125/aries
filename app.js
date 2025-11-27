// app.js — full ready-to-replace file
// - Firebase auth boot + AriesDB facade
// - header + smooth sliding sidebar (overlay) wiring
// - sidebar population from Firestore (if empty)
// Usage: <script type="module" src="app.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, addDoc, doc, getDoc, updateDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ===================== FIREBASE CONFIG =====================
 Replace values below if you later change Firebase projects.
 Keep this block as-is if your firebase-config.js isn't used.
 If you already use a separate firebase-config.js that exports `auth` and `db`,
 you may remove the initializeApp block and import those exports instead.
============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyCfEZ4gJEMFfwCBq7N4XecRli0qCAThyCE",
  authDomain: "aries-48190.firebaseapp.com",
  projectId: "aries-48190",
  storageBucket: "aries-48190.firebasestorage.app",
  messagingSenderId: "1030954306592",
  appId: "1:1030954306592:web:1242fdf52c9b2107424045"
};

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e) {
  console.warn('Firebase initializeApp warning:', e);
}
const auth = getAuth(app);
const db = getFirestore(app);

/* ===================== AUTH BOOT (authPromise) ===================== */
/* Resolves with user or rejects on timeout. Code continues even if it rejects. */
export const authPromise = new Promise((resolve, reject) => {
  let settled = false;
  const TIMEOUT_MS = 10000;
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      console.warn('Firebase auth timeout after 10s; continuing without a user.');
      reject(new Error('Firebase auth timeout'));
    }
  }, TIMEOUT_MS);

  try {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        settled = true;
        clearTimeout(timer);
        window.currentUser = user;
        resolve(user);
      } else {
        // attempt anonymous sign-in
        signInAnonymously(auth).catch(err => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            console.warn('Anonymous sign-in failed:', err);
            reject(err);
          }
        });
      }
    });
  } catch (err) {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      console.error('Auth init error:', err);
      reject(err);
    }
  }
});

/* ===================== AriesDB (small facade) ===================== */
window.AriesDB = {
  async getProjects() {
    await authPromise.catch(()=>{});
    try {
      const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
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
      const ref = await addDoc(collection(db, 'projects'), {
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
      const r = doc(db, 'projects', projectId);
      const s = await getDoc(r);
      return s.exists() ? s.data() : null;
    } catch (e) {
      console.error('AriesDB.loadProjectData error', e);
      return null;
    }
  },

  async saveProjectWorkspace(projectId, nodes, links) {
    await authPromise.catch(()=>{});
    try {
      const r = doc(db, 'projects', projectId);
      await updateDoc(r, {
        nodes: nodes || [], links: links || [], lastModified: serverTimestamp()
      });
      return true;
    } catch (e) {
      console.error('AriesDB.saveProjectWorkspace error', e);
      return false;
    }
  }
};

/* ===================== UI: Header + Sliding Sidebar ===================== */
/*
Expected HTML (you already added these):
<header id="aries-topbar" class="aries-topbar" role="banner">
  <button id="aries-hamburger" class="aries-hamburger" aria-controls="aries-sidebar" aria-expanded="false">☰</button>
  <div class="aries-title">PROJECT MANAGER</div>
  <a href="index.html" class="aries-brand"><img src="images/goat.png" class="aries-logo"></a>
</header>

<aside id="aries-sidebar" class="aries-sidebar hidden" role="complementary" aria-label="Project list">
  <nav class="aries-sidebar-nav aries-sidebar-content">
    <!-- ideally your project buttons use class="aries-project" -->
    <button class="aries-project" data-id="p1">Project 1</button>
  </nav>
</aside>

Make sure main.css contains the sliding/overlay CSS we discussed.
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

function initHeaderSidebar({ slideMs = 300, breakpoint = 900 } = {}) {
  const hamburger = document.getElementById('aries-hamburger');
  const sidebar = document.getElementById('aries-sidebar');

  if (!hamburger || !sidebar) {
    console.warn('initHeaderSidebar: #aries-hamburger or #aries-sidebar not found. Skipping wiring.');
    return;
  }

  const overlay = createOverlayIfMissing();

  // ensure initial classes
  sidebar.classList.remove('open', 'animating');
  sidebar.classList.add('hidden');
  sidebar.setAttribute('aria-hidden', 'true');
  sidebar.dataset.open = 'false';
  hamburger.setAttribute('aria-expanded', 'false');

  // helpers
  function openSidebar() {
    if (sidebar.classList.contains('open')) return;
    sidebar.classList.remove('hidden');
    sidebar.classList.add('animating');
    // force reflow to ensure animation
    void sidebar.offsetWidth;
    sidebar.classList.add('open'); // slide in via CSS transform
    overlay.classList.remove('hidden'); overlay.classList.add('visible');
    document.body.classList.add('aries-sidebar-open');
    sidebar.setAttribute('aria-hidden', 'false');
    sidebar.dataset.open = 'true';
    hamburger.setAttribute('aria-expanded', 'true');

    // after slide completes, clear animating flag
    setTimeout(() => sidebar.classList.remove('animating'), slideMs);
  }

  function closeSidebar() {
    if (!sidebar.classList.contains('open')) {
      // ensure hidden state present
      sidebar.classList.remove('animating');
      sidebar.classList.add('hidden');
      overlay.classList.remove('visible'); overlay.classList.add('hidden');
      sidebar.setAttribute('aria-hidden', 'true');
      sidebar.dataset.open = 'false';
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('aries-sidebar-open');
      return;
    }

    sidebar.classList.add('animating');
    sidebar.classList.remove('open'); // triggers transform to off-screen
    overlay.classList.remove('visible'); overlay.classList.add('hidden');
    sidebar.setAttribute('aria-hidden', 'true');
    sidebar.dataset.open = 'false';
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('aries-sidebar-open');

    // after transition finish hide fully to avoid pointer events
    setTimeout(() => {
      sidebar.classList.remove('animating');
      sidebar.classList.add('hidden');
    }, slideMs);
  }

  function toggleSidebar() {
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  }

  // toggle from hamburger
  hamburger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSidebar();
  });

  // overlay click closes
  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    closeSidebar();
  });

  // click outside closes (capture phase to detect before other handlers)
  document.addEventListener('click', (e) => {
    if (!sidebar.classList.contains('open')) return;
    const t = e.target;
    if (!sidebar.contains(t) && t !== hamburger && !hamburger.contains(t) && t !== overlay) {
      closeSidebar();
    }
  }, true);

  // keyboard: Escape closes, M toggles (unless in input)
  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === 'Escape') {
      if (sidebar.classList.contains('open')) closeSidebar();
    } else if ((e.key === 'm' || e.key === 'M') && !/INPUT|TEXTAREA/.test(tag)) {
      toggleSidebar();
    }
  });

  // custom events for external control
  window.addEventListener('aries:sidebarOpen', openSidebar);
  window.addEventListener('aries:sidebarClose', closeSidebar);
  window.addEventListener('aries:toggleSidebar', toggleSidebar);
}

/* ===================== Sidebar population (only if nav is empty) ===================== */
async function populateSidebarProjects() {
  const sidebar = document.getElementById('aries-sidebar');
  if (!sidebar) return;
  const nav = sidebar.querySelector('.aries-sidebar-nav') || sidebar.querySelector('.aries-sidebar-content') || sidebar;
  if (!nav) return;

  // if there are already items that look like project buttons, do not overwrite
  const existing = nav.querySelectorAll('.aries-project, .project-item');
  if (existing && existing.length > 0) return;

  try {
    const projects = await window.AriesDB.getProjects();
    if (!projects || projects.length === 0) return;
    nav.innerHTML = ''; // clear placeholders
    projects.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'aries-project';
      btn.textContent = p.name || 'Untitled';
      btn.dataset.id = p.id;
      nav.appendChild(btn);
      btn.addEventListener('click', () => { location.href = `project_detail.html?id=${p.id}`; });
    });
  } catch (e) {
    console.warn('populateSidebarProjects failed', e);
  }
}

/* ===================== Boot ===================== */
function boot() {
  // init header/sidebar UI
  try { initHeaderSidebar(); } catch (e) { /* noop if not present */ }

  // clear any reserved left margin so page doesn't shift
  document.documentElement.style.setProperty('--aries-sidebar-width', '0px');

  // wire header/sidebar from DOM
  initHeaderSidebar({ slideMs: 300, breakpoint: 900 });

  // attempt to populate sidebar from Firestore (non-blocking)
  setTimeout(() => populateSidebarProjects(), 120);
}

/* Keep init robust to inline script order */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* ===================== Expose for debugging / external control ===================== */
window.aries = window.aries || {};
window.aries.openSidebar = () => window.dispatchEvent(new Event('aries:sidebarOpen'));
window.aries.closeSidebar = () => window.dispatchEvent(new Event('aries:sidebarClose'));
window.aries.toggleSidebar = () => window.dispatchEvent(new Event('aries:toggleSidebar'));
