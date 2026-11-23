/**
 * Mini-Blade Template Engine (Vanilla JS)
 *
 * Mendukung direktif mirip Laravel Blade untuk preview HTML statis:
 * - data-extends="layouts/app.html"     -> @extends
 * - data-section="name"                 -> @section
 * - data-yield="name"                   -> @yield
 * - data-include="partials/nav.html"    -> @include (mendukung nested include)
 * - data-push="styles|scripts|..."      -> @push
 * - data-stack="styles|scripts|..."     -> @stack
 * - prefix "@/" pada href/src/action    -> asset() / url() relatif terhadap root proyek
 */
(function () {
   'use strict';

   const THEME_STORAGE_KEY = 'app-theme';
   const MAX_INCLUDE_DEPTH = 12;
   const STYLESHEET_TIMEOUT_MS = 1500;
   const REWRITE_ATTRS = ['href', 'src', 'action', 'poster', 'data-href'];

   // Deteksi root proyek secara otomatis dari posisi script ini
   const currentScript = document.currentScript;
   const scriptSrc = currentScript ? currentScript.getAttribute('src') : 'assets/js/template-engine.js';
   const engineUrl = new URL(scriptSrc, window.location.href);
   const rootUrl = engineUrl.href.replace(/assets\/js\/template-engine\.js(\?.*)?$/, '');

   // Terapkan tema sedini mungkin untuk mencegah kedipan warna (theme flicker)
   applyInitialTheme();

   // Cegah FOUC sementara template dirakit
   const loadingStyle = document.createElement('style');
   loadingStyle.id = 'template-engine-loading';
   loadingStyle.textContent = 'html.template-loading { visibility: hidden; }';
   document.head.appendChild(loadingStyle);
   document.documentElement.classList.add('template-loading');

   function applyInitialTheme() {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) || 'auto';
      const resolved = saved === 'auto'
         ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
         : saved;
      document.documentElement.setAttribute('data-bs-theme', resolved);
   }

   function resolveProjectUrl(path, baseUrl) {
      if (!path) return '';
      if (/^(https?:|mailto:|tel:|#|javascript:|data:)/i.test(path)) {
         return path;
      }
      if (path.startsWith('@/')) {
         return new URL(path.slice(2), rootUrl).href;
      }
      if (path.startsWith('./') || path.startsWith('../')) {
         return new URL(path, baseUrl || window.location.href).href;
      }
      return new URL(path.replace(/^\/+/, ''), rootUrl).href;
   }

   function rewriteAtUrls(container) {
      if (!container || !container.querySelectorAll) return;

      const selector = REWRITE_ATTRS.map(function (attr) {
         return '[' + attr + '^="@/"]';
      }).join(',');

      container.querySelectorAll(selector).forEach(function (el) {
         REWRITE_ATTRS.forEach(function (attr) {
            const val = el.getAttribute(attr);
            if (val && val.startsWith('@/')) {
               el.setAttribute(attr, resolveProjectUrl(val));
            }
         });
      });

      // Proses juga konten di dalam <template> bersarang
      container.querySelectorAll('template').forEach(function (tpl) {
         rewriteAtUrls(tpl.content);
      });
   }

   const fetchCache = new Map();

   async function fetchHtml(url) {
      if (fetchCache.has(url)) {
         return fetchCache.get(url);
      }

      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
         throw new Error('Gagal memuat template "' + url + '" (HTTP ' + response.status + ')');
      }
      const text = await response.text();
      fetchCache.set(url, text);
      return text;
   }

   function htmlToFragment(html) {
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      return tpl.content;
   }

   async function processIncludes(rootNode, baseUrl, stacks, activeStack, depth) {
      if (depth > MAX_INCLUDE_DEPTH) {
         throw new Error('Batas kedalaman data-include terlampaui (maksimal ' + MAX_INCLUDE_DEPTH + ').');
      }

      const includeNodes = Array.from(rootNode.querySelectorAll('[data-include]'));
      for (const node of includeNodes) {
         const rawPath = node.getAttribute('data-include');
         if (!rawPath) continue;

         const includeUrl = resolveProjectUrl(rawPath, baseUrl);
         if (activeStack.has(includeUrl)) {
            throw new Error('Terdeteksi circular include pada: ' + includeUrl);
         }

         const html = await fetchHtml(includeUrl);
         const fragment = htmlToFragment(html);
         rewriteAtUrls(fragment);

         const nextStack = new Set(activeStack);
         nextStack.add(includeUrl);

         // Kumpulkan push yang berasal dari dalam partial
         collectPushes(fragment, stacks);

         // Proses nested include di dalam partial
         await processIncludes(fragment, includeUrl, stacks, nextStack, depth + 1);

         if (node.tagName === 'TEMPLATE') {
            node.replaceWith(fragment);
         } else {
            node.removeAttribute('data-include');
            node.innerHTML = '';
            node.appendChild(fragment);
         }
      }
   }

   function collectSections(rootNode) {
      const sections = new Map();
      const nodes = Array.from(rootNode.querySelectorAll('[data-section]'));

      for (const node of nodes) {
         const name = node.getAttribute('data-section');
         if (!name) continue;

         const fragment = document.createDocumentFragment();
         if (node.tagName === 'TEMPLATE') {
            fragment.appendChild(node.content.cloneNode(true));
         } else {
            while (node.firstChild) {
               fragment.appendChild(node.firstChild);
            }
         }
         rewriteAtUrls(fragment);
         sections.set(name, fragment);
         node.remove();
      }
      return sections;
   }

   function collectPushes(rootNode, stacks) {
      const nodes = Array.from(rootNode.querySelectorAll('[data-push]'));

      for (const node of nodes) {
         const stackName = node.getAttribute('data-push');
         if (!stackName) continue;

         const fragment = document.createDocumentFragment();
         if (node.tagName === 'TEMPLATE') {
            fragment.appendChild(node.content.cloneNode(true));
         } else {
            while (node.firstChild) {
               fragment.appendChild(node.firstChild);
            }
         }
         rewriteAtUrls(fragment);

         if (!stacks.has(stackName)) {
            stacks.set(stackName, []);
         }
         stacks.get(stackName).push(fragment);
         node.remove();
      }
   }

   function applyYields(rootNode, sections) {
      const yieldNodes = Array.from(rootNode.querySelectorAll('[data-yield]'));

      for (const node of yieldNodes) {
         const name = node.getAttribute('data-yield');
         const hasSection = sections.has(name);

         if (node.tagName === 'TITLE') {
            if (hasSection) {
               const text = sections.get(name).textContent.trim();
               if (text) {
                  node.textContent = text;
               }
            }
            node.removeAttribute('data-yield');
            continue;
         }

         if (node.tagName === 'TEMPLATE') {
            if (hasSection) {
               node.replaceWith(sections.get(name).cloneNode(true));
            } else {
               node.replaceWith(node.content.cloneNode(true));
            }
            continue;
         }

         if (hasSection) {
            node.innerHTML = '';
            node.appendChild(sections.get(name).cloneNode(true));
         }
         node.removeAttribute('data-yield');
      }
   }

   function applyStacks(rootNode, stacks) {
      const stackNodes = Array.from(rootNode.querySelectorAll('[data-stack]'));

      for (const node of stackNodes) {
         const name = node.getAttribute('data-stack');
         const items = stacks.get(name) || [];
         const combined = document.createDocumentFragment();

         for (const item of items) {
            combined.appendChild(item.cloneNode(true));
         }

         if (node.tagName === 'TEMPLATE') {
            node.replaceWith(combined);
         } else {
            node.innerHTML = '';
            node.appendChild(combined);
            node.removeAttribute('data-stack');
         }
      }
   }

   function extractScripts(container) {
      const scripts = [];
      const nodes = Array.from(container.querySelectorAll('script'));

      for (const oldScript of nodes) {
         const info = {
            attrs: Array.from(oldScript.attributes).map(function (attr) {
               return { name: attr.name, value: attr.value };
            }),
            text: oldScript.textContent
         };
         scripts.push(info);
         oldScript.remove();
      }
      return scripts;
   }

   function runScriptsSequentially(scripts, targetParent) {
      return scripts.reduce(function (chain, info) {
         return chain.then(function () {
            return new Promise(function (resolve) {
               const script = document.createElement('script');
               let isExternal = false;

               info.attrs.forEach(function (attr) {
                  if (attr.name === 'src') {
                     isExternal = true;
                  }
                  script.setAttribute(attr.name, attr.value);
               });

               script.async = false;

               if (isExternal) {
                  script.onload = resolve;
                  script.onerror = function () {
                     console.error('[TemplateEngine] Gagal memuat script:', script.src);
                     resolve();
                  };
                  targetParent.appendChild(script);
               } else {
                  script.textContent = info.text;
                  targetParent.appendChild(script);
                  resolve();
               }
            });
         });
      }, Promise.resolve());
   }

   function waitForStylesheets() {
      const links = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'));
      if (links.length === 0) return Promise.resolve();

      const pending = links.map(function (link) {
         if (link.sheet) return Promise.resolve();
         return new Promise(function (resolve) {
            link.addEventListener('load', resolve, { once: true });
            link.addEventListener('error', resolve, { once: true });
         });
      });

      const timeout = new Promise(function (resolve) {
         setTimeout(resolve, STYLESHEET_TIMEOUT_MS);
      });

      return Promise.race([Promise.all(pending), timeout]);
   }

   function markActiveNavLinks() {
      const currentPath = normalizePath(window.location.pathname);

      document.querySelectorAll('a.nav-link[href], a[data-nav][href]').forEach(function (link) {
         const rawHref = link.getAttribute('href');
         if (!rawHref || rawHref === '#' || rawHref.startsWith('#')) return;

         try {
            const linkUrl = new URL(link.href);
            if (linkUrl.origin !== window.location.origin) return;

            if (normalizePath(linkUrl.pathname) === currentPath) {
               link.classList.add('active');
               link.setAttribute('aria-current', 'page');
            }
         } catch (_) {
            // Abaikan URL tidak valid
         }
      });
   }

   function normalizePath(pathname) {
      return pathname.replace(/\/index\.html$/i, '/').replace(/\/+$/, '') || '/';
   }

   function revealPage() {
      document.body.removeAttribute('hidden');
      document.documentElement.classList.remove('template-loading');
      if (loadingStyle.parentNode) {
         loadingStyle.remove();
      }
   }

   function showError(err) {
      console.error('[TemplateEngine]', err);
      revealPage();

      const isFileProtocol = window.location.protocol === 'file:';
      const hint = isFileProtocol
         ? 'Halaman dibuka lewat protokol file://. Silakan buka melalui web server lokal (misalnya http://localhost/template).'
         : 'Periksa path file pada atribut data-extends atau data-include.';

      const banner = document.createElement('div');
      banner.style.cssText = 'max-width:680px;margin:2rem auto;padding:1.25rem;border:1px solid #f5c2c7;border-radius:0.5rem;background:#f8d7da;color:#842029;font-family:system-ui,sans-serif;line-height:1.5;';

      const heading = document.createElement('strong');
      heading.textContent = 'Mini-Blade Template Engine Error';

      const detail = document.createElement('p');
      detail.style.margin = '0.5rem 0 0.25rem';
      detail.textContent = err && err.message ? err.message : String(err);

      const note = document.createElement('small');
      note.textContent = hint;

      banner.appendChild(heading);
      banner.appendChild(detail);
      banner.appendChild(note);

      document.body.prepend(banner);
   }

   async function render() {
      const stacks = new Map();
      const extendsNode = document.querySelector('[data-extends]');

      if (extendsNode) {
         const layoutPath = extendsNode.getAttribute('data-extends');
         const layoutUrl = resolveProjectUrl(layoutPath, window.location.href);

         // Kumpulkan section dan push dari halaman sumber
         const sections = collectSections(document);
         const pageStacks = new Map();
         collectPushes(document, pageStacks);

         // Muat file layout
         const layoutHtml = await fetchHtml(layoutUrl);
         const parsed = new DOMParser().parseFromString(layoutHtml, 'text/html');

         rewriteAtUrls(parsed.head);
         rewriteAtUrls(parsed.body);

         // Proses include di layout (bisa menaruh push tambahan)
         await processIncludes(parsed.head, layoutUrl, stacks, new Set([layoutUrl]), 0);
         await processIncludes(parsed.body, layoutUrl, stacks, new Set([layoutUrl]), 0);

         // Proses include dan push di dalam masing-masing section halaman
         for (const [, fragment] of sections) {
            collectPushes(fragment, pageStacks);
            await processIncludes(fragment, window.location.href, stacks, new Set([window.location.href]), 0);
         }

         // Gabungkan push halaman di urutan akhir agar CSS/JS halaman meng-override layout
         for (const [name, items] of pageStacks) {
            if (!stacks.has(name)) {
               stacks.set(name, []);
            }
            stacks.get(name).push(...items);
         }

         // Terapkan yield & stack pada head dan body layout
         applyYields(parsed.head, sections);
         applyYields(parsed.body, sections);
         applyStacks(parsed.head, stacks);
         applyStacks(parsed.body, stacks);

         // Pastikan semua path @/ hasil yield/stack ikut ter-resolve
         rewriteAtUrls(parsed.head);
         rewriteAtUrls(parsed.body);

         // Salin atribut <html> (kecuali data-bs-theme) dan <body> dari layout
         Array.from(parsed.documentElement.attributes).forEach(function (attr) {
            if (attr.name !== 'data-bs-theme') {
               document.documentElement.setAttribute(attr.name, attr.value);
            }
         });

         Array.from(document.body.attributes).forEach(function (attr) {
            if (attr.name !== 'hidden') {
               document.body.removeAttribute(attr.name);
            }
         });
         Array.from(parsed.body.attributes).forEach(function (attr) {
            document.body.setAttribute(attr.name, attr.value);
         });

         // Ekstrak seluruh script agar bisa dijalankan berurutan setelah DOM terpasang
         const headScripts = extractScripts(parsed.head);
         const bodyScripts = extractScripts(parsed.body);

         // Pasang head dari layout (pertahankan script engine & loading style)
         Array.from(document.head.children).forEach(function (child) {
            if (child !== currentScript && child !== loadingStyle) {
               child.remove();
            }
         });
         while (parsed.head.firstChild) {
            document.head.appendChild(document.adoptNode(parsed.head.firstChild));
         }

         // Pasang body dari layout
         document.body.innerHTML = '';
         while (parsed.body.firstChild) {
            document.body.appendChild(document.adoptNode(parsed.body.firstChild));
         }

         await waitForStylesheets();
         markActiveNavLinks();
         revealPage();

         await runScriptsSequentially(headScripts, document.head);
         await runScriptsSequentially(bodyScripts, document.body);
      } else {
         // Mode standalone (tanpa data-extends, hanya data-include & data-push/stack)
         rewriteAtUrls(document.head);
         rewriteAtUrls(document.body);
         collectPushes(document, stacks);

         await processIncludes(document.head, window.location.href, stacks, new Set([window.location.href]), 0);
         await processIncludes(document.body, window.location.href, stacks, new Set([window.location.href]), 0);

         applyStacks(document.head, stacks);
         applyStacks(document.body, stacks);
         rewriteAtUrls(document.head);
         rewriteAtUrls(document.body);

         await waitForStylesheets();
         markActiveNavLinks();
         revealPage();
      }

      window.TemplateEngine.isReady = true;
      document.dispatchEvent(new CustomEvent('template:ready', {
         detail: { rootUrl: rootUrl }
      }));
   }

   window.TemplateEngine = {
      rootUrl: rootUrl,
      isReady: false,
      url: function (path) {
         return resolveProjectUrl(path, rootUrl);
      }
   };

   if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
         render().catch(showError);
      }, { once: true });
   } else {
      render().catch(showError);
   }
})();
