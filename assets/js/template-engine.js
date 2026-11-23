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
 * - data-config="app-name"              -> config('app.name') dari <meta> di index.html
 * - prefix "@/" pada href/src/action    -> asset() / url() relatif terhadap root proyek
 */
(function () {
   'use strict';

   const THEME_STORAGE_KEY = 'app-theme';
   const MAX_INCLUDE_DEPTH = 12;
   const STYLESHEET_TIMEOUT_MS = 1500;
   const DEV_CACHE_BUST = String(Date.now());
   const REWRITE_ATTRS = ['href', 'src', 'action', 'poster', 'data-href', 'data-img-theme-light', 'data-img-theme-dark'];

   // Deteksi root proyek secara otomatis dari posisi script ini
   const currentScript = document.currentScript || document.querySelector('script[src*="assets/js/template-engine.js"]');
   const scriptSrc = currentScript ? currentScript.getAttribute('src') : 'assets/js/template-engine.js';
   const engineUrl = new URL(scriptSrc, window.location.href);
   const rootUrl = engineUrl.href.replace(/assets\/js\/template-engine\.js(\?.*)?$/, '');

   // Terapkan tema sedini mungkin untuk mencegah kedipan warna (theme flicker)
   const initialResolvedTheme = resolveInitialTheme();
   document.documentElement.setAttribute('data-bs-theme', initialResolvedTheme);

   // Cegah FOUC sementara template dirakit
   const loadingStyle = document.createElement('style');
   loadingStyle.id = 'template-engine-loading';
   loadingStyle.textContent = 'html.template-loading { visibility: hidden; }';
   document.head.appendChild(loadingStyle);
   document.documentElement.classList.add('template-loading');

   function readStorage(key, fallback) {
      try {
         return localStorage.getItem(key) || fallback;
      } catch (_) {
         return fallback;
      }
   }

   function resolveInitialTheme() {
      const raw = readStorage(THEME_STORAGE_KEY, 'auto');
      const saved = (raw === 'light' || raw === 'dark' || raw === 'auto') ? raw : 'auto';
      return saved === 'auto'
         ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
         : saved;
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

   function isLocalCustomAsset(url) {
      if (!url || !url.startsWith(rootUrl)) return false;
      const relPath = url.slice(rootUrl.length).split(/[?#]/)[0];
      if (relPath.startsWith('assets/vendor/')) return false;
      return relPath.startsWith('assets/css/') || relPath.startsWith('assets/js/');
   }

   function withCacheBust(url) {
      if (!isLocalCustomAsset(url)) return url;
      try {
         const parsedUrl = new URL(url);
         if (!parsedUrl.searchParams.has('v')) {
            parsedUrl.searchParams.set('v', DEV_CACHE_BUST);
         }
         return parsedUrl.href;
      } catch (_) {
         return url;
      }
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

   async function loadAppConfig() {
      const config = {};
      try {
         const indexUrl = resolveProjectUrl('index.html', rootUrl);
         const html = await fetchHtml(indexUrl);
         const parsed = new DOMParser().parseFromString(html, 'text/html');

         parsed.querySelectorAll('meta[name^="app-"][content]').forEach(function (meta) {
            const key = meta.getAttribute('name');
            const val = meta.getAttribute('content');
            if (key && val !== null) {
               config[key] = val.trim();
            }
         });
      } catch (err) {
         console.warn('[TemplateEngine] Pengaturan global dari index.html tidak dapat dimuat:', err);
      }
      return config;
   }

   function applyConfigs(rootNode, config) {
      if (!rootNode || !rootNode.querySelectorAll) return;

      rootNode.querySelectorAll('[data-config]').forEach(function (el) {
         const key = el.getAttribute('data-config');
         if (key && Object.prototype.hasOwnProperty.call(config, key) && config[key] !== '') {
            el.textContent = config[key];
         }
         el.removeAttribute('data-config');
      });
   }

   function applyTitleElement(titleNode, sections, config) {
      const hasSection = sections && sections.has('title');
      const suffixKey = titleNode.getAttribute('data-title-suffix');
      const suffix = suffixKey && config && config[suffixKey] ? config[suffixKey] : '';

      if (hasSection) {
         const text = sections.get('title').textContent.trim();
         if (text) {
            titleNode.textContent = suffix && !text.includes(suffix)
               ? text + ' — ' + suffix
               : text;
         } else if (suffix) {
            titleNode.textContent = suffix;
         }
      } else if (suffix) {
         const currentText = titleNode.textContent.trim();
         if (currentText && !titleNode.hasAttribute('data-yield')) {
            titleNode.textContent = currentText.includes(suffix)
               ? currentText
               : currentText + ' — ' + suffix;
         } else {
            titleNode.textContent = suffix;
         }
      }

      titleNode.removeAttribute('data-yield');
      titleNode.removeAttribute('data-title-suffix');
   }

   function applyYields(rootNode, sections, config) {
      const yieldNodes = Array.from(rootNode.querySelectorAll('[data-yield]'));

      for (const node of yieldNodes) {
         const name = node.getAttribute('data-yield');
         const hasSection = sections.has(name);

         if (node.tagName === 'TITLE') {
            applyTitleElement(node, sections, config);
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

   function isExecutableScript(scriptEl) {
      const type = (scriptEl.getAttribute('type') || '').trim().toLowerCase();
      return type === '' || type === 'text/javascript' || type === 'application/javascript' || type === 'module';
   }

   function extractScripts(container, skipSet) {
      const scripts = [];
      const nodes = Array.from(container.querySelectorAll('script'));

      for (const oldScript of nodes) {
         if (skipSet && skipSet.has(oldScript)) continue;
         if (!isExecutableScript(oldScript)) continue;

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
                     script.setAttribute('src', withCacheBust(resolveProjectUrl(attr.value, window.location.href)));
                  } else {
                     script.setAttribute(attr.name, attr.value);
                  }
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

   function createFreshLink(oldLink) {
      const freshLink = document.createElement('link');
      Array.from(oldLink.attributes).forEach(function (attr) {
         if (attr.name === 'href') {
            const resolvedHref = resolveProjectUrl(attr.value, window.location.href);
            freshLink.setAttribute('href', withCacheBust(resolvedHref));
         } else {
            freshLink.setAttribute(attr.name, attr.value);
         }
      });
      return freshLink;
   }

   function mountHeadNodes(sourceHead) {
      Array.from(document.head.children).forEach(function (child) {
         if (child !== currentScript && child !== loadingStyle) {
            child.remove();
         }
      });

      while (sourceHead.firstChild) {
         const node = sourceHead.firstChild;
         if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'LINK') {
            const freshLink = createFreshLink(node);
            node.remove();
            document.head.appendChild(freshLink);
         } else {
            document.head.appendChild(document.adoptNode(node));
         }
      }
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

   function syncInitialThemeImages() {
      const resolvedTheme = document.documentElement.getAttribute('data-bs-theme') || 'light';
      const activeAttr = resolvedTheme === 'dark' ? 'data-img-theme-dark' : 'data-img-theme-light';

      document.querySelectorAll('img[data-img-theme-light], img[data-img-theme-dark]').forEach(function (img) {
         if (!('imgThemeOriginalSrc' in img.dataset)) {
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

         const targetSrc = hasActiveAttr && activeVal ? activeVal : img.dataset.imgThemeOriginalSrc;
         if (targetSrc && img.getAttribute('src') !== targetSrc) {
            img.setAttribute('src', targetSrc);
         }
      });
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
      const config = await loadAppConfig();
      window.TemplateEngine.config = config;

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

         // Terapkan yield, stack, dan config global pada head dan body layout
         applyYields(parsed.head, sections, config);
         applyYields(parsed.body, sections, config);
         applyStacks(parsed.head, stacks);
         applyStacks(parsed.body, stacks);
         applyConfigs(parsed.head, config);
         applyConfigs(parsed.body, config);

         // Pastikan semua path @/ hasil yield/stack ikut ter-resolve
         rewriteAtUrls(parsed.head);
         rewriteAtUrls(parsed.body);

         // Salin atribut <html> (pertahankan data-bs-theme & template-loading) dan <body> dari layout
         Array.from(parsed.documentElement.attributes).forEach(function (attr) {
            if (attr.name === 'data-bs-theme') return;
            if (attr.name === 'class') {
               attr.value.split(/\s+/).filter(Boolean).forEach(function (cls) {
                  document.documentElement.classList.add(cls);
               });
               return;
            }
            document.documentElement.setAttribute(attr.name, attr.value);
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

         // Pasang head (buat ulang <link> agar selalu dimuat bersih) dan body dari layout
         mountHeadNodes(parsed.head);

         document.body.innerHTML = '';
         while (parsed.body.firstChild) {
            document.body.appendChild(document.adoptNode(parsed.body.firstChild));
         }

         await waitForStylesheets();
         syncInitialThemeImages();
         markActiveNavLinks();
         revealPage();

         await runScriptsSequentially(headScripts, document.head);
         await runScriptsSequentially(bodyScripts, document.body);
      } else {
         // Mode standalone (tanpa data-extends, tetap mendukung include, push/stack, config, & script dinamis)
         const existingScripts = new WeakSet(document.querySelectorAll('script'));
         const existingLinks = new WeakSet(document.querySelectorAll('link[rel="stylesheet"]'));

         rewriteAtUrls(document.head);
         rewriteAtUrls(document.body);
         collectPushes(document, stacks);

         await processIncludes(document.head, window.location.href, stacks, new Set([window.location.href]), 0);
         await processIncludes(document.body, window.location.href, stacks, new Set([window.location.href]), 0);

         applyStacks(document.head, stacks);
         applyStacks(document.body, stacks);

         const titleNode = document.head.querySelector('title[data-title-suffix], title[data-yield="title"]');
         if (titleNode) {
            applyTitleElement(titleNode, null, config);
         }

         applyConfigs(document.head, config);
         applyConfigs(document.body, config);
         rewriteAtUrls(document.head);
         rewriteAtUrls(document.body);

         // Buat ulang <link rel="stylesheet"> yang baru disisipkan agar selalu termuat
         Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).forEach(function (link) {
            if (!existingLinks.has(link)) {
               link.replaceWith(createFreshLink(link));
            }
         });

         const injectedHeadScripts = extractScripts(document.head, existingScripts);
         const injectedBodyScripts = extractScripts(document.body, existingScripts);

         await waitForStylesheets();
         syncInitialThemeImages();
         markActiveNavLinks();
         revealPage();

         await runScriptsSequentially(injectedHeadScripts, document.head);
         await runScriptsSequentially(injectedBodyScripts, document.body);
      }

      window.TemplateEngine.isReady = true;
      document.dispatchEvent(new CustomEvent('template:ready', {
         detail: { rootUrl: rootUrl, config: config }
      }));
   }

   window.TemplateEngine = {
      rootUrl: rootUrl,
      isReady: false,
      config: {},
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
