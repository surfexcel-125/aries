// app.js — ready-to-replace (no layout push)
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  collection, getDocs, addDoc, doc, getDoc, updateDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ===================== Auth boot (authPromise) ===================== */
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

/* ===================== AriesDB facade ===================== */
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
(function () {
  const SLIDE_MS = 300;
  const HAMBURGER_SELECTORS = ['#aries-hamburger', '.aries-hamburger', '.topbar .hamburger', '.hamburger'];
  const SIDEBAR_SELECTORS = ['#aries-sidebar', '.aries-sidebar', '.sidebar'];

  function findFirst(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function createOverlayIfMissing() {
    let overlay = document.getElementById('aries-overlay') || document.getElementById('legacy-sidebar-overlay');
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

    // initial state
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
      void sidebar.offsetWidth;
      sidebar.classList.add('open');
      overlay.classList.remove('hidden'); overlay.classList.add('visible');
      // NOTE: do NOT add or remove any class that shifts the page layout
      sidebar.setAttribute('aria-hidden', 'false');
      sidebar.dataset.open = 'true';
      hamburger.setAttribute('aria-expanded', 'true');
      setTimeout(() => sidebar.classList.remove('animating'), SLIDE_MS);
    }

    function closeSidebar() {
      if (!sidebar.classList.contains('open')) {
        sidebar.classList.remove('animating');
        sidebar.classList.add('hidden');
        overlay.classList.remove('visible'); overlay.classList.add('hidden');
        sidebar.setAttribute('aria-hidden', 'true');
        sidebar.dataset.open = 'false';
        hamburger.setAttribute('aria-expanded', 'false');
        return;
      }
      sidebar.classList.add('animating');
      sidebar.classList.remove('open');
      overlay.classList.remove('visible'); overlay.classList.add('hidden');
      sidebar.setAttribute('aria-hidden', 'true');
      sidebar.dataset.open = 'false';
      hamburger.setAttribute('aria-expanded', 'false');
      setTimeout(() => {
        sidebar.classList.remove('animating');
        sidebar.classList.add('hidden');
      }, SLIDE_MS);
    }

    function toggleSidebar() { sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); }

    // events
    hamburger.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleSidebar(); });
    overlay.addEventListener('click', (e) => { e.preventDefault(); closeSidebar(); });

    document.addEventListener('click', (e) => {
      if (!sidebar.classList.contains('open')) return;
      const t = e.target;
      if (!sidebar.contains(t) && t !== hamburger && !hamburger.contains(t) && t !== overlay) {
        closeSidebar();
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (e.key === 'Escape') { if (sidebar.classList.contains('open')) closeSidebar(); }
      else if ((e.key === 'm' || e.key === 'M') && !/INPUT|TEXTAREA/.test(tag)) toggleSidebar();
    });

    console.info('app.js: wired hamburger -> sidebar (no layout push)');
  }

  function attemptWire() {
    const hamburger = findFirst(HAMBURGER_SELECTORS);
    const sidebar = findFirst(SIDEBAR_SELECTORS);
    const overlay = createOverlayIfMissing();
    if (hamburger && sidebar) { wire(hamburger, sidebar, overlay); return true; }
    console.warn('app.js.attemptWire: elements not present yet', { hamburgerFound: !!hamburger, sidebarFound: !!sidebar });
    return false;
  }

  function watchAndWire() {
    const mo = new MutationObserver((m, obs) => {
      const ok = attemptWire();
      if (ok) { obs.disconnect(); console.info('app.js: MutationObserver disconnected'); }
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
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

  /* Static sidebar population (Dashboard + Projects only) */
  async function populateSidebarContent() {
    const sidebar = document.querySelector('#aries-sidebar') || document.querySelector('.aries-sidebar') || document.querySelector('.sidebar');
    if (!sidebar) return;
    let nav = sidebar.querySelector('.aries-sidebar-nav') || sidebar.querySelector('.aries-sidebar-content');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'aries-sidebar-nav aries-sidebar-content';
      nav.setAttribute('role','navigation');
      sidebar.appendChild(nav);
    }
    nav.innerHTML = ''; // clear placeholders / demo

    const staticNav = document.createElement('div');
    staticNav.id = 'aries-static-nav';
    staticNav.style.display = 'flex';
    staticNav.style.flexDirection = 'column';
    staticNav.style.gap = '10px';

    const staticLinks = [
      { title: 'Dashboard', href: 'index.html' },
      { title: 'Projects', href: 'projects.html' }
    ];

    staticLinks.forEach(link => {
      const a = document.createElement('a');
      a.className = 'aries-project';
      a.href = link.href;
      a.textContent = link.title;
      a.style.display = 'block';
      a.style.textDecoration = 'none';
      staticNav.appendChild(a);
    });

    nav.appendChild(staticNav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(populateSidebarContent, 220));
  } else {
    setTimeout(populateSidebarContent, 220);
  }

  window.aries = window.aries || {};
  window.aries.refreshSidebar = populateSidebarContent;

})();
