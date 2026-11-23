/**
 * Pengalih Tema Bootstrap 5.3 (Light / Dark / Auto)
 * Sinkron dengan atribut data-bs-theme pada <html> dan localStorage.
 */
(function () {
   'use strict';

   const STORAGE_KEY = 'app-theme';
   const ICON_MAP = {
      light: 'bi-sun-fill',
      dark: 'bi-moon-stars-fill',
      auto: 'bi-circle-half'
   };

   function getPreferredTheme() {
      return localStorage.getItem(STORAGE_KEY) || 'auto';
   }

   function resolveTheme(theme) {
      if (theme === 'auto') {
         return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return theme;
   }

   function applyTheme(theme) {
      const resolved = resolveTheme(theme);
      document.documentElement.setAttribute('data-bs-theme', resolved);
      updateSwitchers(theme);
      updateThemeImages(resolved);
   }

   function updateThemeImages(resolvedTheme) {
      const activeAttr = resolvedTheme === 'dark' ? 'data-img-theme-dark' : 'data-img-theme-light';

      document.querySelectorAll('img[data-img-theme-light], img[data-img-theme-dark]').forEach(function (img) {
         if (!img.dataset.imgThemeOriginalSrc) {
            img.dataset.imgThemeOriginalSrc = img.getAttribute('src') || '';
         }

         const hasActiveAttr = img.hasAttribute(activeAttr);
         const activeVal = hasActiveAttr ? (img.getAttribute(activeAttr) || '').trim() : '';

         if (hasActiveAttr && (activeVal === '' || activeVal.toLowerCase() === 'invert')) {
            if (img.dataset.imgThemeOriginalSrc && img.getAttribute('src') !== img.dataset.imgThemeOriginalSrc) {
               img.setAttribute('src', img.dataset.imgThemeOriginalSrc);
            }
            img.style.filter = 'invert(1)';
            img.dataset.imgThemeInverted = 'true';
            return;
         }

         if (img.dataset.imgThemeInverted === 'true') {
            img.style.filter = '';
            delete img.dataset.imgThemeInverted;
         }

         const targetSrc = hasActiveAttr && activeVal ? activeVal : img.dataset.imgThemeOriginalSrc;
         if (targetSrc && img.getAttribute('src') !== targetSrc) {
            img.setAttribute('src', targetSrc);
         }
      });
   }

   function updateSwitchers(activeTheme) {
      document.querySelectorAll('[data-theme-switcher]').forEach(function (container) {
         const iconEl = container.querySelector('[data-theme-icon]');
         if (iconEl) {
            iconEl.className = 'bi ' + (ICON_MAP[activeTheme] || ICON_MAP.auto);
         }

         container.querySelectorAll('[data-theme-value]').forEach(function (btn) {
            const isActive = btn.getAttribute('data-theme-value') === activeTheme;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

            const checkIcon = btn.querySelector('[data-theme-check]');
            if (checkIcon) {
               checkIcon.classList.toggle('d-none', !isActive);
            }
         });
      });
   }

   function bindSwitchers() {
      applyTheme(getPreferredTheme());

      document.querySelectorAll('[data-theme-switcher] [data-theme-value]').forEach(function (btn) {
         if (btn.dataset.themeBound === 'true') return;
         btn.dataset.themeBound = 'true';

         btn.addEventListener('click', function () {
            const selected = btn.getAttribute('data-theme-value');
            if (!selected) return;
            localStorage.setItem(STORAGE_KEY, selected);
            applyTheme(selected);
         });
      });
   }

   window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (getPreferredTheme() === 'auto') {
         applyTheme('auto');
      }
   });

   bindSwitchers();
   document.addEventListener('template:ready', bindSwitchers);
})();

