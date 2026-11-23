/**
 * Script utama area publik
 */
(function () {
   'use strict';

   function initApp() {
      if (typeof window.bootstrap === 'undefined') return;

      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
         window.bootstrap.Tooltip.getOrCreateInstance(el);
      });
   }

   initApp();
   document.addEventListener('template:ready', initApp);
})();

