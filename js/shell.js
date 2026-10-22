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
    if (shell.classList.contains('zen')) setZen(false);
    if (w === 'tex') Tex.show(); else document.title = 'Folio';
    if (w === 'home') Home.render();
    $('#dropTitle').textContent = w === 'tex' ? 'Suelta para añadir al proyecto' : 'Suelta para abrir';
    $('#dropSub').textContent = w === 'tex' ? 'Imágenes van a figuras/ · una carpeta se abre como proyecto' : 'Archivos .md, .markdown o .txt';
  }
  document.querySelectorAll('.ws-seg button').forEach(b => b.addEventListener('click', () => setWs(b.dataset.ws)));
  window.Shell = { ws, setWs };

  UI.initTheme();
  UI.initPicker();

  /* ---------- focus mode: hides the chrome around the editor and the page ---------- */
  function setZen(on) {
    shell.classList.toggle('zen', on);
    $('#zenExit').hidden = !on;
    $('#zenBtn').setAttribute('aria-pressed', String(on));
    dispatchEvent(new Event('resize'));
  }
  $('#zenBtn').addEventListener('click', () => setZen(true));
  $('#zenExit').addEventListener('click', () => setZen(false));

  /* ---------- global keyboard ---------- */
  addEventListener('keydown', e => {
    if (!$('#modal').hidden) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === '.' || e.code === 'Period')) { e.preventDefault(); setZen(!shell.classList.contains('zen')); return; }
    if (e.key === 'Escape' && shell.classList.contains('zen') && !document.querySelector('.CodeMirror-dialog, .CodeMirror-hints')) setZen(false);
    if (ws() === 'tex') Tex.onKey(e); else if (ws() === 'md') Markdown.onKey(e);
  });

  /* ---------- drag & drop routing ---------- */
  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; if (ws() !== 'tex') $('#drop').hidden = false; });
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
    // a .tex/.bib or a folder dropped on Inicio or the Markdown side opens the LaTeX workspace
    if (ws() !== 'tex' && window.Tex) {
      const isTexish = entries.some(en => (en.handle && en.handle.kind === 'directory') || Tex.isTex(en.handle ? en.handle.name : en.file.name));
      setWs(isTexish ? 'tex' : 'md');
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

  /* ---------- boot: always start on Inicio, unless a file was handed to the app ---------- */
  Markdown.boot(window.__FOLIO_FILE__);
  setWs(window.__FOLIO_FILE__ ? 'md' : 'home');

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
