// app.js — header + sidebar enhanced behavior (ready-to-replace)
// Assumes firebase-config.js exists and exports `auth` and `db` if you still use AriesDB.
// This file focuses on header/sidebar behavior & bootstrapping.

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/* --- Minimal Auth boot (keeps compatibility with the rest of your code) --- */
export const authPromise = new Promise((resolve, reject) => {
  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled) {
      console.warn('Firebase auth timeout (10s). Proceeding without user.');
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
        // attempt anonymous sign-in
        signInAnonymously(auth).catch(err => {
          settled = true;
          clearTimeout(timeout);
          console.warn('Anonymous sign-in failed', err);
          reject(err);
        });
      }
    });
  } catch (e) {
    clearTimeout(timeout);
    reject(e);
  }
});

/* --- Header & Sidebar Behavior --- */
function setupHeaderSidebar() {
  // Try to locate existing elements
  let topbar = document.querySelector('.topbar') || document.getElementById('topbar');
  let sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');

  // If missing, inject a minimal header + sidebar so behavior still works.
  if (!topbar) {
    topbar = document.createElement('header');
    topbar.className = 'topbar';
    topbar.innerHTML = `
      <button class="hamburger" id="ariesHamburger" aria-label="Open menu" aria-expanded="false">☰</button>
      <div class="brand" aria-hidden="true">ARIES</div>
      <img src="images/goat.png" class="logo" alt="Aries logo">
    `;
    document.body.insertAdjacentElement('afterbegin', topbar);
  }

  if (!sidebar) {
    sidebar = document.createElement('aside');
    sidebar.id = 'sidebar';
    sidebar.className = 'sidebar';
    sidebar.setAttribute('aria-hidden', 'true');
    sidebar.innerHTML = `
      <nav class="sidebar-nav" role="navigation" aria-label="Main">
        <ul>
          <li><a href="index.html">Dashboard</a></li>
          <li><a href="projects.html">Projects</a></li>
          <li><a href="workspace.html">Workspace</a></li>
        </ul>
      </nav>
    `;
    // Append after topbar for natural DOM order
    topbar.insertAdjacentElement('afterend', sidebar);
  }

  const hamburger = topbar.querySelector('.hamburger') || topbar.querySelector('#ariesHamburger');
  // If there is no hamburger, create one and prepend.
  let localHamburger = hamburger;
  if (!localHamburger) {
    localHamburger = document.createElement('button');
    localHamburger.className = 'hamburger';
    localHamburger.id = 'ariesHamburger';
    localHamburger.setAttribute('aria-label','Open menu');
    localHamburger.textContent = '☰';
    topbar.prepend(localHamburger);
  }

  // State management
  const STORAGE_KEY = 'aries:sidebarOpen';
  function isPrefOpen() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch(e){ return false; }
  }
  function setPrefOpen(v) {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch(e) {}
  }

  // Accessibility helpers
  function setSidebarOpen(open, opts = {}) {
    if (open) {
      sidebar.classList.add('open');
      sidebar.setAttribute('aria-hidden','false');
      localHamburger.setAttribute('aria-expanded','true');
      document.body.classList.add('aries-sidebar-open');
      setPrefOpen(true);
      if (opts.focusFirst !== false) focusFirstInSidebar();
      enableFocusTrap();
    } else {
      sidebar.classList.remove('open');
      sidebar.setAttribute('aria-hidden','true');
      localHamburger.setAttribute('aria-expanded','false');
      document.body.classList.remove('aries-sidebar-open');
      setPrefOpen(false);
      disableFocusTrap();
    }
  }

  // Toggle
  function toggleSidebar() {
    const open = sidebar.classList.contains('open');
    setSidebarOpen(!open);
  }

  // focus management
  let lastActiveElement = null;
  function focusFirstInSidebar() {
    lastActiveElement = document.activeElement;
    const focusable = sidebar.querySelectorAll('a, button, input, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();
    else sidebar.focus({preventScroll:true});
  }

  // basic focus trap implementation
  let trapHandler = null;
  function enableFocusTrap() {
    trapHandler = function (e) {
      if (e.key === 'Tab') {
        const focusable = Array.from(sidebar.querySelectorAll('a, button, input, [tabindex]:not([tabindex="-1"])'))
          .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else if (e.key === 'Escape') {
        setSidebarOpen(false);
        if (lastActiveElement) { lastActiveElement.focus(); lastActiveElement = null; }
      }
    };
    document.addEventListener('keydown', trapHandler);
  }
  function disableFocusTrap() {
    if (trapHandler) {
      document.removeEventListener('keydown', trapHandler);
      trapHandler = null;
    }
  }

  // click outside to close (for overlay / mobile)
  function onDocClick(e) {
    if (!sidebar.classList.contains('open')) return;
    const target = e.target;
    if (!sidebar.contains(target) && !topbar.contains(target)) {
      setSidebarOpen(false);
    }
  }

  // keyboard shortcut: "m" toggles sidebar (useful), configurable
  function onKeyShortcut(e) {
    // ignore if focus is in input/textarea
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    if (e.key && (e.key === 'm' || e.key === 'M')) {
      toggleSidebar();
    }
  }

  // Attach events
  localHamburger.addEventListener('click', toggleSidebar);
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setSidebarOpen(false);
  });
  document.addEventListener('keydown', onKeyShortcut);

  // keep it responsive: when resizing, if larger than a threshold and user prefers open, keep it open
  function onResize() {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    if (wide && isPrefOpen()) setSidebarOpen(true, { focusFirst: false });
    if (wide === false && !isPrefOpen()) setSidebarOpen(false, { focusFirst: false });
  }
  window.addEventListener('resize', onResize);

  // initial state based on localStorage and width
  try {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    const pref = isPrefOpen();
    if (wide && pref) setSidebarOpen(true, { focusFirst: false });
    else setSidebarOpen(false, { focusFirst: false });
  } catch (e) {
    setSidebarOpen(false, { focusFirst: false });
  }
}

// DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupHeaderSidebar);
} else {
  setupHeaderSidebar();
}
// app.js — header + sidebar enhanced behavior (ready-to-replace)
// Assumes firebase-config.js exists and exports `auth` and `db` if you still use AriesDB.
// This file focuses on header/sidebar behavior & bootstrapping.

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/* --- Minimal Auth boot (keeps compatibility with the rest of your code) --- */
export const authPromise = new Promise((resolve, reject) => {
  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled) {
      console.warn('Firebase auth timeout (10s). Proceeding without user.');
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
        // attempt anonymous sign-in
        signInAnonymously(auth).catch(err => {
          settled = true;
          clearTimeout(timeout);
          console.warn('Anonymous sign-in failed', err);
          reject(err);
        });
      }
    });
  } catch (e) {
    clearTimeout(timeout);
    reject(e);
  }
});

/* --- Header & Sidebar Behavior --- */
function setupHeaderSidebar() {
  // Try to locate existing elements
  let topbar = document.querySelector('.topbar') || document.getElementById('topbar');
  let sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');

  // If missing, inject a minimal header + sidebar so behavior still works.
  if (!topbar) {
    topbar = document.createElement('header');
    topbar.className = 'topbar';
    topbar.innerHTML = `
      <button class="hamburger" id="ariesHamburger" aria-label="Open menu" aria-expanded="false">☰</button>
      <div class="brand" aria-hidden="true">ARIES</div>
      <img src="images/goat.png" class="logo" alt="Aries logo">
    `;
    document.body.insertAdjacentElement('afterbegin', topbar);
  }

  if (!sidebar) {
    sidebar = document.createElement('aside');
    sidebar.id = 'sidebar';
    sidebar.className = 'sidebar';
    sidebar.setAttribute('aria-hidden', 'true');
    sidebar.innerHTML = `
      <nav class="sidebar-nav" role="navigation" aria-label="Main">
        <ul>
          <li><a href="index.html">Dashboard</a></li>
          <li><a href="projects.html">Projects</a></li>
          <li><a href="workspace.html">Workspace</a></li>
        </ul>
      </nav>
    `;
    // Append after topbar for natural DOM order
    topbar.insertAdjacentElement('afterend', sidebar);
  }

  const hamburger = topbar.querySelector('.hamburger') || topbar.querySelector('#ariesHamburger');
  // If there is no hamburger, create one and prepend.
  let localHamburger = hamburger;
  if (!localHamburger) {
    localHamburger = document.createElement('button');
    localHamburger.className = 'hamburger';
    localHamburger.id = 'ariesHamburger';
    localHamburger.setAttribute('aria-label','Open menu');
    localHamburger.textContent = '☰';
    topbar.prepend(localHamburger);
  }

  // State management
  const STORAGE_KEY = 'aries:sidebarOpen';
  function isPrefOpen() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch(e){ return false; }
  }
  function setPrefOpen(v) {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch(e) {}
  }

  // Accessibility helpers
  function setSidebarOpen(open, opts = {}) {
    if (open) {
      sidebar.classList.add('open');
      sidebar.setAttribute('aria-hidden','false');
      localHamburger.setAttribute('aria-expanded','true');
      document.body.classList.add('aries-sidebar-open');
      setPrefOpen(true);
      if (opts.focusFirst !== false) focusFirstInSidebar();
      enableFocusTrap();
    } else {
      sidebar.classList.remove('open');
      sidebar.setAttribute('aria-hidden','true');
      localHamburger.setAttribute('aria-expanded','false');
      document.body.classList.remove('aries-sidebar-open');
      setPrefOpen(false);
      disableFocusTrap();
    }
  }

  // Toggle
  function toggleSidebar() {
    const open = sidebar.classList.contains('open');
    setSidebarOpen(!open);
  }

  // focus management
  let lastActiveElement = null;
  function focusFirstInSidebar() {
    lastActiveElement = document.activeElement;
    const focusable = sidebar.querySelectorAll('a, button, input, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();
    else sidebar.focus({preventScroll:true});
  }

  // basic focus trap implementation
  let trapHandler = null;
  function enableFocusTrap() {
    trapHandler = function (e) {
      if (e.key === 'Tab') {
        const focusable = Array.from(sidebar.querySelectorAll('a, button, input, [tabindex]:not([tabindex="-1"])'))
          .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else if (e.key === 'Escape') {
        setSidebarOpen(false);
        if (lastActiveElement) { lastActiveElement.focus(); lastActiveElement = null; }
      }
    };
    document.addEventListener('keydown', trapHandler);
  }
  function disableFocusTrap() {
    if (trapHandler) {
      document.removeEventListener('keydown', trapHandler);
      trapHandler = null;
    }
  }

  // click outside to close (for overlay / mobile)
  function onDocClick(e) {
    if (!sidebar.classList.contains('open')) return;
    const target = e.target;
    if (!sidebar.contains(target) && !topbar.contains(target)) {
      setSidebarOpen(false);
    }
  }

  // keyboard shortcut: "m" toggles sidebar (useful), configurable
  function onKeyShortcut(e) {
    // ignore if focus is in input/textarea
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    if (e.key && (e.key === 'm' || e.key === 'M')) {
      toggleSidebar();
    }
  }

  // Attach events
  localHamburger.addEventListener('click', toggleSidebar);
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setSidebarOpen(false);
  });
  document.addEventListener('keydown', onKeyShortcut);

  // keep it responsive: when resizing, if larger than a threshold and user prefers open, keep it open
  function onResize() {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    if (wide && isPrefOpen()) setSidebarOpen(true, { focusFirst: false });
    if (wide === false && !isPrefOpen()) setSidebarOpen(false, { focusFirst: false });
  }
  window.addEventListener('resize', onResize);

  // initial state based on localStorage and width
  try {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    const pref = isPrefOpen();
    if (wide && pref) setSidebarOpen(true, { focusFirst: false });
    else setSidebarOpen(false, { focusFirst: false });
  } catch (e) {
    setSidebarOpen(false, { focusFirst: false });
  }
}

// DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupHeaderSidebar);
} else {
  setupHeaderSidebar();
}
