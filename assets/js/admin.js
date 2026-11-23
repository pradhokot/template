/**
 * Script utama area admin (pengelolaan sidebar collapse desktop & tooltip)
 */
(function () {
   'use strict';

   const SIDEBAR_STATE_KEY = 'admin-sidebar-collapsed';

   function getSidebarCollapsed() {
      try {
         return localStorage.getItem(SIDEBAR_STATE_KEY) === 'true';
      } catch (_) {
         return false;
      }
   }

   function setSidebarCollapsed(collapsed) {
      try {
         localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? 'true' : 'false');
      } catch (_) {
         // Abaikan jika penyimpanan browser dibatasi
      }
   }

   function initAdmin() {
      const isCollapsed = getSidebarCollapsed();
      document.body.classList.toggle('sidebar-collapsed', isCollapsed);

      const toggleBtn = document.querySelector('[data-sidebar-toggle]');
      if (toggleBtn && toggleBtn.dataset.bound !== 'true') {
         toggleBtn.dataset.bound = 'true';
         toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');

         toggleBtn.addEventListener('click', function () {
            const collapsed = document.body.classList.toggle('sidebar-collapsed');
            setSidebarCollapsed(collapsed);
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
