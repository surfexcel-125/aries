// app.js — Full ready-to-replace
// - Expects ./firebase-config.js to export `auth` and `db`
// - Uses *logged-in* email/password user only (no anonymous sign-in)
// - If no user on protected pages, redirects to index.html
// - Provides AriesDB facade with get/create/load/save/delete
// - Wires header hamburger -> animated sliding sidebar
// - Populates sidebar with simple static nav

import { auth, db } from './firebase-config.js';
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

import {
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ===================== Helper: detect login page ===================== */

function isLoginPage() {
  // Handles /index.html, /, and query strings
  const path = window.location.pathname || '';
  const file = path.split('/').pop() || '';
  if (file === '' || file === 'index.html') return true;
  // If you ever host login somewhere else, adjust here
  return false;
}

/* ===================== Auth boot (authPromise) ===================== */
/*
  authPromise:
    - Resolves with the current user if logged in.
    - If NOT logged in and NOT on login page -> redirects to index.html and rejects.
    - If on login page, this file is usually not imported, so it's mostly for safety.
*/

export const authPromise = new Promise((resolve, reject) => {
  let settled = false;
  const TIMEOUT_MS = 10000;

  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      console.warn('Firebase auth timeout after 10s.');
      if (!isLoginPage()) {
        // Force login if auth state is taking too long
        window.location.href = 'index.html';
      }
      reject(new Error('Firebase auth timeout'));
    }
  }, TIMEOUT_MS);

  try {
    onAuthStateChanged(
      auth,
      (user) => {
        if (settled) return;
        if (user) {
          // Logged in successfully
          settled = true;
          clearTimeout(timer);
          window.currentUser = user;
          // console.log('Auth: logged in as', user.uid);
          resolve(user);
        } else {
          // Not logged in
          settled = true;
          clearTimeout(timer);
          window.currentUser = null;
          if (!isLoginPage()) {
            // On a protected page -> redirect to login
            console.warn('No user. Redirecting to login.');
            window.location.href = 'index.html';
          }
          reject(new Error('NO_USER'));
        }
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.error('Auth observer error:', error);
        if (!isLoginPage()) {
          window.location.href = 'index.html';
        }
        reject(error);
      }
    );
  } catch (err) {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      console.error('Auth init error:', err);
      if (!isLoginPage()) {
        window.location.href = 'index.html';
      }
      reject(err);
    }
  }
});

/* ===================== AriesDB facade ===================== */
/* Safe to use from your pages. They await authPromise internally. */

window.AriesDB = {
  /**
   * Returns array of projects: [{id, name, status, ...}, ...]
   * If error, returns [] and logs to console.
   */
  async getProjects() {
    await authPromise.catch(() => { /* redirect will already have happened */ });
    try {
      const qRef = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(qRef);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error('AriesDB.getProjects error', e);
      return [];
    }
  },

  /**
   * Create new project with basic structure. Returns new doc id or null.
   */
  async createProject(name) {
    await authPromise.catch(() => {});
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

  /**
   * Load single project data (doc fields) or null if not found.
   */
  async loadProjectData(projectId) {
    await authPromise.catch(() => {});
    if (!projectId) return null;
    try {
      const r = doc(db, 'projects', projectId);
      const s = await getDoc(r);
      return s.exists() ? s.data() : null;
    } catch (e) {
      console.error('AriesDB.loadProjectData error', e);
      return null;
    }
  },

  /**
   * Save workspace nodes & links for a project (if you want them on the project doc itself).
   * NOTE: Your current workspace.html uses a separate 'workspaceBoards' collection,
   * so this method is extra/optional.
   */
  async saveProjectWorkspace(projectId, nodes, links) {
    await authPromise.catch(() => {});
    if (!projectId) return false;
    try {
      const r = doc(db, 'projects', projectId);
      await updateDoc(r, {
        nodes: nodes || [],
        links: links || [],
        lastModified: serverTimestamp()
      });
      return true;
    } catch (e) {
      console.error('AriesDB.saveProjectWorkspace error', e);
      return false;
    }
  },

  /**
   * Delete a project document. Returns true on success, false otherwise.
   */
  async deleteProject(projectId) {
    await authPromise.catch(() => {});
    if (!projectId) return false;
    try {
      const r = doc(db, 'projects', projectId);
      await deleteDoc(r);
      return true;
    } catch (e) {
      console.error('AriesDB.deleteProject error', e);
      return false;
    }
  }
};

/* ===================== UI: Header + Sliding Sidebar ===================== */
/*
  - Wires any hamburger button (#aries-hamburger, .aries-hamburger, etc.)
  - Controls #aries-sidebar / .aries-sidebar using transform (no layout shift)
  - Uses a persistent overlay (#aries-overlay)
*/

(function () {
  const SLIDE_MS = 300;
  const HAMBURGER_SELECTORS = [
    '#aries-hamburger',
    '.aries-hamburger',
    '.topbar .hamburger',
    '.hamburger'
  ];
  const SIDEBAR_SELECTORS = [
    '#aries-sidebar',
    '.aries-sidebar',
    '.sidebar'
  ];

  function findFirst(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function createOverlayIfMissing() {
    let overlay = document.getElementById('aries-overlay') ||
                  document.getElementById('legacy-sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'aries-overlay';
      overlay.className = 'aries-overlay hidden';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);
      console.info('app.js: created #aries-overlay');
    }
    return overlay;
  }

  function wire(hamburger, sidebar, overlay) {
    if (!hamburger || !sidebar) return;

    sidebar.classList.remove('open', 'animating');
    sidebar.classList.add('hidden');
    sidebar.setAttribute('aria-hidden', 'true');
    sidebar.dataset.open = 'false';

    hamburger.setAttribute('aria-expanded', 'false');

    overlay.classList.add('hidden');
    overlay.classList.remove('visible');

    function openSidebar() {
      if (sidebar.classList.contains('open')) return;
      sidebar.classList.remove('hidden');
      sidebar.classList.add('animating');
      void sidebar.offsetWidth; // force reflow
      sidebar.classList.add('open');

      overlay.classList.remove('hidden');
      overlay.classList.add('visible');

      sidebar.setAttribute('aria-hidden', 'false');
      sidebar.dataset.open = 'true';
      hamburger.setAttribute('aria-expanded', 'true');

      setTimeout(() => sidebar.classList.remove('animating'), SLIDE_MS);
    }

    function closeSidebar() {
      if (!sidebar.classList.contains('open')) {
        sidebar.classList.remove('animating');
        sidebar.classList.add('hidden');
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
        sidebar.setAttribute('aria-hidden', 'true');
        sidebar.dataset.open = 'false';
        hamburger.setAttribute('aria-expanded', 'false');
        return;
      }

      sidebar.classList.add('animating');
      sidebar.classList.remove('open');

      overlay.classList.remove('visible');
      overlay.classList.add('hidden');

      sidebar.setAttribute('aria-hidden', 'true');
      sidebar.dataset.open = 'false';
      hamburger.setAttribute('aria-expanded', 'false');

      setTimeout(() => {
        sidebar.classList.remove('animating');
        sidebar.classList.add('hidden');
      }, SLIDE_MS);
    }

    function toggleSidebar() {
      if (sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    }

    hamburger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });

    overlay.addEventListener('click', (e) => {
      e.preventDefault();
      closeSidebar();
    });

    document.addEventListener('click', (e) => {
      if (!sidebar.classList.contains('open')) return;
      const t = e.target;
      if (!sidebar.contains(t) &&
          t !== hamburger &&
          !hamburger.contains(t) &&
          t !== overlay) {
        closeSidebar();
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (e.key === 'Escape') {
        if (sidebar.classList.contains('open')) closeSidebar();
      } else if ((e.key === 'm' || e.key === 'M') && !/INPUT|TEXTAREA/.test(tag)) {
        toggleSidebar();
      }
    });

    console.info('app.js: wired hamburger -> sidebar');
  }

  function attemptWire() {
    const hamburger = findFirst(HAMBURGER_SELECTORS);
    const sidebar = findFirst(SIDEBAR_SELECTORS);
    const overlay = createOverlayIfMissing();
    if (hamburger && sidebar) {
      wire(hamburger, sidebar, overlay);
      return true;
    }
    console.warn('app.js.attemptWire: elements not present yet', {
      hamburgerFound: !!hamburger,
      sidebarFound: !!sidebar
    });
    return false;
  }

  function watchAndWire() {
    const mo = new MutationObserver((m, obs) => {
      const ok = attemptWire();
      if (ok) {
        obs.disconnect();
        console.info('app.js: MutationObserver disconnected');
      }
    });
    mo.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
    setTimeout(() => attemptWire(), 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const ok = attemptWire();
      if (!ok) watchAndWire();
    });
  } else {
    const ok = attemptWire();
    if (!ok) watchAndWire();
  }

  /* ===================== Sidebar population (simple static nav) ===================== */
  async function populateSidebarContent() {
    const sidebar =
      document.querySelector('#aries-sidebar') ||
      document.querySelector('.aries-sidebar') ||
      document.querySelector('.sidebar');

    if (!sidebar) return;

    let nav =
      sidebar.querySelector('.aries-sidebar-nav') ||
      sidebar.querySelector('.aries-sidebar-content');

    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'aries-sidebar-nav aries-sidebar-content';
      nav.setAttribute('role', 'navigation');
      sidebar.appendChild(nav);
    }

    nav.innerHTML = '';

    const list = document.createElement('ul');
    list.className = 'aries-sidebar-list';

    function addItem(label, href) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'aries-sidebar-link';
      a.textContent = label;
      a.href = href;
      li.appendChild(a);
      list.appendChild(li);
    }

    addItem('Dashboard', 'home.html');
    addItem('Projects', 'projects.html');

    nav.appendChild(list);
  }

  // populate sidebar after DOM + (optionally) auth is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => populateSidebarContent());
  } else {
    populateSidebarContent();
  }
})();
