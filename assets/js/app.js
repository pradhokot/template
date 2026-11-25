/**
 * Script utama area publik
 */
(function () {
   'use strict';

   let globalListenersBound = false;

   function initTooltips() {
      if (typeof window.bootstrap === 'undefined') return;

      document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
         window.bootstrap.Tooltip.getOrCreateInstance(el);
      });
   }

   function hideBrokenImageSlots() {
      document.querySelectorAll('img.img-slot').forEach(function (img) {
         const src = (img.getAttribute('src') || '').trim();
         if (!src || src === '#' || (img.complete && img.naturalWidth === 0)) {
            img.hidden = true;
         }
      });
   }

   function getMegaMenuBackdrop() {
      if (!document.querySelector('[data-mega-dropdown]')) return null;

      let backdrop = document.querySelector('.mega-menu-backdrop');
      if (!backdrop) {
         backdrop = document.createElement('div');
         backdrop.className = 'mega-menu-backdrop';
         backdrop.setAttribute('aria-hidden', 'true');
         document.body.appendChild(backdrop);
      }
      return backdrop;
   }

   function syncMegaMenuBackdrop() {
      const backdrop = getMegaMenuBackdrop();
      if (!backdrop) return;

      const hasOpenDropdown = Boolean(document.querySelector('[data-mega-dropdown].is-open'));
      backdrop.classList.toggle('show', hasOpenDropdown);
   }

   function setMegaDropdownState(dropdown, isOpen) {
      const toggle = dropdown.querySelector('[data-mega-toggle]');
      const menu = dropdown.querySelector(':scope > .dropdown-menu');
      if (!toggle || !menu) return;

      dropdown.classList.toggle('is-open', isOpen);
      menu.classList.toggle('show', isOpen);
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      syncMegaMenuBackdrop();
   }

   function closeAllMegaDropdowns(exceptDropdown) {
      document.querySelectorAll('[data-mega-dropdown].is-open').forEach(function (dropdown) {
         if (dropdown !== exceptDropdown) {
            setMegaDropdownState(dropdown, false);
         }
      });
   }

   function showMegaTab(tabTrigger) {
      if (typeof window.bootstrap === 'undefined') return;
      window.bootstrap.Tab.getOrCreateInstance(tabTrigger).show();
   }

   function bindGlobalListeners() {
      if (globalListenersBound) return;
      globalListenersBound = true;

      const hoverDevice = window.matchMedia('(hover: hover) and (pointer: fine)');

      // Fallback otomatis saat gambar slot backend gagal dimuat (404/broken)
      document.addEventListener('error', function (event) {
         const target = event.target;
         if (target instanceof HTMLImageElement && target.classList.contains('img-slot')) {
            target.hidden = true;
         }
      }, true);

      // Hover & mouseleave pada mega-menu desktop (sinkron dengan aria-expanded)
      document.addEventListener('pointerover', function (event) {
         if (!hoverDevice.matches || !(event.target instanceof Element)) return;

         const dropdown = event.target.closest('[data-mega-dropdown]');
         if (dropdown && !(event.relatedTarget instanceof Node && dropdown.contains(event.relatedTarget))) {
            closeAllMegaDropdowns(dropdown);
            setMegaDropdownState(dropdown, true);
         }

         const tabTrigger = event.target.closest('header [data-mega-tab][data-bs-target]');
         if (tabTrigger && !(event.relatedTarget instanceof Node && tabTrigger.contains(event.relatedTarget))) {
            showMegaTab(tabTrigger);
         }
      });

      document.addEventListener('pointerout', function (event) {
         if (!hoverDevice.matches || !(event.target instanceof Element)) return;

         const dropdown = event.target.closest('[data-mega-dropdown]');
         if (dropdown && !(event.relatedTarget instanceof Node && dropdown.contains(event.relatedTarget))) {
            setMegaDropdownState(dropdown, false);
         }
      });

      // Klik pada pemicu mega-menu & tab (dukung layar sentuh serta navigasi URL asli)
      document.addEventListener('click', function (event) {
         if (!(event.target instanceof Element)) return;

         const megaToggle = event.target.closest('[data-mega-toggle]');
         if (megaToggle) {
            const dropdown = megaToggle.closest('[data-mega-dropdown]');
            const rawHref = (megaToggle.getAttribute('href') || '').trim();
            if (dropdown && (!rawHref || rawHref === '#')) {
               event.preventDefault();
               const nextOpen = !dropdown.classList.contains('is-open');
               closeAllMegaDropdowns(dropdown);
               setMegaDropdownState(dropdown, nextOpen);
            }
            return;
         }

         const tabTrigger = event.target.closest('header [data-mega-tab][data-bs-target]');
         if (tabTrigger) {
            const rawHref = (tabTrigger.getAttribute('href') || '').trim();
            if (!rawHref || rawHref === '#') {
               event.preventDefault();
               showMegaTab(tabTrigger);
            }
            return;
         }

         if (!event.target.closest('[data-mega-dropdown]')) {
            closeAllMegaDropdowns(null);
         }
      });

      // Navigasi keyboard pada mega-menu & tablist
      document.addEventListener('focusin', function (event) {
         if (!(event.target instanceof Element)) return;

         const tabTrigger = event.target.closest('header [data-mega-tab][data-bs-target]');
         if (tabTrigger) {
            showMegaTab(tabTrigger);
         }

         const activeDropdown = event.target.closest('[data-mega-dropdown]');
         closeAllMegaDropdowns(activeDropdown);
      });

      document.addEventListener('keydown', function (event) {
         if (!(event.target instanceof Element)) return;

         if (event.key === 'Escape') {
            const openDropdown = event.target.closest('[data-mega-dropdown].is-open')
               || document.querySelector('[data-mega-dropdown].is-open');
            if (openDropdown) {
               const toggle = openDropdown.querySelector('[data-mega-toggle]');
               setMegaDropdownState(openDropdown, false);
               if (toggle) toggle.focus();
            }
            return;
         }

         const megaToggle = event.target.closest('[data-mega-toggle]');
         if (megaToggle && (event.key === 'ArrowDown' || event.key === ' ')) {
            const dropdown = megaToggle.closest('[data-mega-dropdown]');
            if (dropdown) {
               event.preventDefault();
               closeAllMegaDropdowns(dropdown);
               setMegaDropdownState(dropdown, true);
               const firstTab = dropdown.querySelector('[data-mega-tab]');
               if (firstTab) firstTab.focus();
            }
            return;
         }

         const tabTrigger = event.target.closest('header [data-mega-tab][data-bs-target]');
         if (tabTrigger && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            const tablist = tabTrigger.closest('[role="tablist"]');
            if (!tablist) return;

            const tabs = Array.from(tablist.querySelectorAll(':scope > [data-mega-tab]'));
            const currentIndex = tabs.indexOf(tabTrigger);
            if (currentIndex === -1 || tabs.length < 2) return;

            event.preventDefault();
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            const nextTab = tabs[(currentIndex + delta + tabs.length) % tabs.length];
            nextTab.focus();
            showMegaTab(nextTab);
         }
      });

      // Tutup mega-menu jika modal atau offcanvas dibuka agar backdrop tidak menumpuk
      document.addEventListener('show.bs.modal', function () {
         closeAllMegaDropdowns(null);
      });

      document.addEventListener('show.bs.offcanvas', function () {
         closeAllMegaDropdowns(null);
      });

      // Modal pencarian: auto-focus input saat terbuka & cegah reload halaman saat submit preview
      document.addEventListener('shown.bs.modal', function (event) {
         const modal = event.target;
         if (modal instanceof Element && modal.id === 'modal-search') {
            const input = modal.querySelector('#search');
            if (input) input.focus();
         }
      });

      document.addEventListener('submit', function (event) {
         const form = event.target;
         if (form instanceof HTMLFormElement && form.closest('#modal-search')) {
            event.preventDefault();
         }
      });
   }

   function initApp() {
      initTooltips();
      hideBrokenImageSlots();
      getMegaMenuBackdrop();
      bindGlobalListeners();
   }

   initApp();
   document.addEventListener('template:ready', initApp);
})();
