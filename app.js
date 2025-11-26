// READY-TO-REPLACE app.js
// Enhancements: keyboard accessibility, defensive checks, dropdown repositioning, small UX tweaks.

(function () {
  'use strict';

  // --- Sidebar Functionality ---
  const menuIcon = document.getElementById('menuIcon');
  const closeIcon = document.getElementById('closeIcon');
  const sidebar = document.getElementById('sidebar');

  function openSidebar() {
    if (sidebar) sidebar.classList.add('open');
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
  }

  // Add keyboard handlers for accessibility
  function addButtonKeyboardSupport(el, onActivate) {
    if (!el) return;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onActivate();
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        // if sidebar open, close it
        closeSidebar();
      }
    });
  }

  if (menuIcon && closeIcon && sidebar) {
    menuIcon.addEventListener('click', openSidebar);
    closeIcon.addEventListener('click', closeSidebar);

    addButtonKeyboardSupport(menuIcon, openSidebar);
    addButtonKeyboardSupport(closeIcon, closeSidebar);
  }

  // --- Project Switcher Functionality (New) ---
  const projectDropdownToggle = document.getElementById('projectDropdownToggle');
  const projectDropdownMenu = document.getElementById('projectDropdownMenu');
  const dropdownButtons = document.querySelectorAll('.dropdown-project-button');

  // Toggle dropdown menu visibility
  function toggleProjectDropdown() {
    if (!projectDropdownMenu) return;
    projectDropdownMenu.classList.toggle('visible');
    // Try to position the dropdown if it might overflow the viewport
    repositionProjectDropdown();
  }

  // Reposition dropdown if it would go offscreen (basic)
  function repositionProjectDropdown() {
    if (!projectDropdownMenu || !projectDropdownToggle) return;
    const menuRect = projectDropdownMenu.getBoundingClientRect();
    const toggleRect = projectDropdownToggle.getBoundingClientRect();
    // If dropdown would overflow bottom of viewport, show above the header
    if (menuRect.bottom > window.innerHeight) {
      projectDropdownMenu.style.top = (toggleRect.top - menuRect.height - 8) + 'px';
    } else {
      // Reset to default (this matches CSS default of top near header)
      projectDropdownMenu.style.top = (toggleRect.bottom + 8) + 'px';
    }
  }

  // Simulated save and navigation
  function saveAndSwitchProject(event) {
    event.preventDefault(); // Stop immediate navigation
    const targetUrl = event.currentTarget.href;
    const currentProjectName = projectDropdownToggle ? projectDropdownToggle.innerText.split(' ')[0] : 'Project';

    // Simulated save (replace with actual API call if you have one)
    // console.log(`Auto-saving workspace state for ${currentProjectName}...`);

    setTimeout(() => {
      // console.log('Save complete. Switching project...');
      if (targetUrl) window.location.href = targetUrl;
    }, 300);
  }

  if (projectDropdownToggle && projectDropdownMenu) {
    projectDropdownToggle.addEventListener('click', toggleProjectDropdown);
    addButtonKeyboardSupport(projectDropdownToggle, toggleProjectDropdown);

    // Hide menu if user clicks outside
    document.addEventListener('click', (event) => {
      if (!projectDropdownMenu.contains(event.target) && !projectDropdownToggle.contains(event.target)) {
        projectDropdownMenu.classList.remove('visible');
      }
    });

    // Escape key closes the dropdown globally
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        projectDropdownMenu.classList.remove('visible');
        closeSidebar();
      }
    });

    // Attach save-and-switch for each dropdown button
    dropdownButtons.forEach(button => {
      button.addEventListener('click', saveAndSwitchProject);
      // keyboard accessible by default because it's an <a>, but ensure Enter works
      button.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          saveAndSwitchProject(ev);
        }
      });
    });
  }

  // On resize, reposition dropdown so it remains visible
  window.addEventListener('resize', () => {
    if (projectDropdownMenu && projectDropdownMenu.classList.contains('visible')) {
      repositionProjectDropdown();
    }
  });

})(); 
