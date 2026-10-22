/* Folio — app shell: workspaces, file launching, drag & drop routing, service worker */
(function () {
  'use strict';
  const { $, store, toast, inFrame } = UI;
  const shell = $('#shell');

  function ws() { return shell.dataset.ws; }
  function setWs(w) {
    if (w === 'tex' && !window.Tex) w = 'md';
    shell.dataset.ws = w;
    document.querySelectorAll('.ws-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ws === w)));
    store.set('folio.ws', w);
    if (w === 'tex') Tex.show(); else document.title = 'Folio';
    $('#dropTitle').textContent = w === 'tex' ? 'Suelta para añadir al proyecto' : 'Suelta para abrir';
    $('#dropSub').textContent = w === 'tex' ? 'Imágenes van a figuras/ · una carpeta se abre como proyecto' : 'Archivos .md, .markdown o .txt';
  }
  document.querySelectorAll('.ws-seg button').forEach(b => b.addEventListener('click', () => setWs(b.dataset.ws)));
  window.Shell = { ws, setWs };

  UI.initTheme();
  UI.initPicker();

  /* ---------- global keyboard ---------- */
  addEventListener('keydown', e => {
    if (!$('#modal').hidden) return;
    if (ws() === 'tex') Tex.onKey(e); else Markdown.onKey(e);
  });

  /* ---------- drag & drop routing ---------- */
  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; if (ws() === 'md') $('#drop').hidden = false; });
  addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  addEventListener('dragleave', e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop').hidden = true; });
  addEventListener('drop', async e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; $('#drop').hidden = true;
    // collect synchronously: DataTransfer is emptied once the handler yields
    const files = [...e.dataTransfer.files];
    const items = [...(e.dataTransfer.items || [])].filter(i => i.kind === 'file');
    const handlePromises = !inFrame && items.length && items[0].getAsFileSystemHandle ? items.map(i => i.getAsFileSystemHandle().catch(() => null)) : null;
    let entries = [];
    if (handlePromises) { const hs = await Promise.all(handlePromises); entries = hs.map((h, i) => h ? { handle: h } : (files[i] ? { file: files[i] } : null)).filter(Boolean); }
    if (!entries.length) entries = files.map(f => ({ file: f }));
    // a .tex/.bib or a folder dropped on the Markdown side opens the LaTeX workspace
    if (ws() === 'md' && window.Tex) {
      const isTexish = entries.some(en => (en.handle && en.handle.kind === 'directory') || Tex.isTex(en.handle ? en.handle.name : en.file.name));
      if (isTexish) { setWs('tex'); }
    }
    if (ws() === 'tex') Tex.onDrop(entries, e); else Markdown.onDrop(entries);
  });

  /* ---------- launching files (installed app: "Abrir con" / file handlers) ---------- */
  if ('launchQueue' in window) {
    launchQueue.setConsumer(async params => {
      if (!params.files || !params.files.length) return;
      for (const h of params.files) {
        if (h.kind !== 'file') continue;
        if (window.Tex && Tex.isTex(h.name)) await Tex.openFromLaunch(h);
        else { setWs('md'); await Markdown.openFile(await h.getFile(), h); }
      }
    });
  }

  /* ---------- boot ---------- */
  Markdown.boot(window.__FOLIO_FILE__);
  setWs(store.get('folio.ws') === 'tex' ? 'tex' : 'md');

  /* ---------- service worker (offline + updates) ---------- */
  if ('serviceWorker' in navigator && !inFrame && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Hay una versión nueva de Folio. Se usará la próxima vez que abras la app.', 6000);
        });
      });
    }).catch(() => { });
  }
})();
