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

   const initHoverTabs = () => {
      if (typeof window.bootstrap === 'undefined') return;

      const hoverDevice = window.matchMedia("(hover: hover) and (pointer: fine)");

      document.addEventListener("pointerover", (event) => {
         if (!hoverDevice.matches || !(event.target instanceof Element)) {
            return;
         }

         const tabTrigger = event.target.closest(
            'header [data-bs-toggle="pill"][data-bs-target]'
         );

         if (!tabTrigger || (event.relatedTarget instanceof Node && tabTrigger.contains(event.relatedTarget))) {
            return;
         }

         window.bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
      });
   };

   initApp();
   initHoverTabs();
   document.addEventListener('template:ready', initApp);
})();
