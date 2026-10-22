/* Folio service worker
 * - App shell and small engine scripts: cached per build (offline use).
 * - busytex.wasm (32 MB): cached per engine version, so app updates don't re-download it.
 * - TeX Live base (.data) and the ./texmf/ mirror are NOT touched here: the page stores them
 *   in IndexedDB itself (shared across projects), so they are never stored twice.
 */
const BUILD = '__BUILD__';
const ENGINE_VERSION = 'busytex-1.4.1';
const SHELL = 'folio-shell-' + BUILD;
const ENGINE = 'folio-engine-' + ENGINE_VERSION;
const FONTS = 'folio-fonts';

const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'js/ui.js', 'js/markdown.js', 'js/tex-engine.js', 'js/tex.js', 'js/shell.js',
  'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/marked.min.js', 'vendor/purify.min.js', 'vendor/highlight.min.js',
  'vendor/codemirror/codemirror.js', 'vendor/codemirror/codemirror.css', 'vendor/codemirror/stex.js',
  'vendor/codemirror/matchbrackets.js', 'vendor/codemirror/closebrackets.js', 'vendor/codemirror/active-line.js',
  'vendor/codemirror/searchcursor.js', 'vendor/codemirror/search.js', 'vendor/codemirror/jump-to-line.js',
  'vendor/codemirror/dialog.js', 'vendor/codemirror/dialog.css', 'vendor/codemirror/show-hint.js', 'vendor/codemirror/show-hint.css',
  'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js',
  'busytex/folio-tex-worker.js', 'busytex/busytex_pipeline.js', 'busytex/busytex_biber.js', 'busytex/busytex.js',
  'busytex/texlive-basic.js', 'busytex/texlive-basic.js.providespackage.txt'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k !== SHELL && k !== ENGINE && k !== FONTS) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/texmf/') || url.pathname.endsWith('.data')) return;   // handled by IndexedDB in the page

  if (url.pathname.endsWith('/busytex.wasm')) {
    e.respondWith(caches.open(ENGINE).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' }) || (req.mode === 'navigate' ? await c.match('index.html') : null);
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok && url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) c.put(req, r.clone());
      return r;
    } catch (err) {
      return new Response('Sin conexión', { status: 503, statusText: 'offline' });
    }
  })());
});
