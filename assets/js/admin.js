/**
 * Script utama area admin (pengelolaan sidebar collapse desktop & tooltip)
 */
(function () {
   'use strict';

   const SIDEBAR_STATE_KEY = 'admin-sidebar-collapsed';

   function initAdmin() {
      const isCollapsed = localStorage.getItem(SIDEBAR_STATE_KEY) === 'true';
      document.body.classList.toggle('sidebar-collapsed', isCollapsed);

      const toggleBtn = document.querySelector('[data-sidebar-toggle]');
      if (toggleBtn && toggleBtn.dataset.bound !== 'true') {
         toggleBtn.dataset.bound = 'true';
         toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');

         toggleBtn.addEventListener('click', function () {
            const collapsed = document.body.classList.toggle('sidebar-collapsed');
            localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? 'true' : 'false');
            toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
         });
      }

      if (typeof window.bootstrap !== 'undefined') {
         document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
            window.bootstrap.Tooltip.getOrCreateInstance(el);
         });
      }
   }

   initAdmin();
   document.addEventListener('template:ready', initAdmin);
})();

