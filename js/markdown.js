/* Folio — Markdown workspace */
(function () {
  'use strict';
  const { $, esc, debounce, store, inFrame, toast, ask } = UI;
  const app = $('#app'), editor = $('#editor'), page = $('#page'), viewer = $('#viewer');
  const SAMPLE = $('#sample').textContent.replace(/^\n/, '');
  const MD_RE = /\.(md|markdown|mdown|mkd|txt)$/i;

  /* ---------- markdown rendering ---------- */
  const slugify = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let slugs = {};
  const hasMarked = typeof window.marked !== 'undefined';
  if (hasMarked) {
    marked.use({
      gfm: true, breaks: false, renderer: {
        heading(text, level, raw) {
          const base = slugify(raw) || 'seccion'; const n = slugs[base] || 0; slugs[base] = n + 1;
          return `<h${level} id="${n ? base + '-' + n : base}">${text}</h${level}>\n`;
        }
      }
    });
  }
  if (window.DOMPurify) {
    DOMPurify.addHook('afterSanitizeAttributes', node => {
      if (node.tagName === 'A' && node.getAttribute('href') && !node.getAttribute('href').startsWith('#')) { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
    });
  }
  if (window.hljs) hljs.configure({ ignoreUnescapedHTML: true });
  function toHtml(md) {
    slugs = {};
    if (!hasMarked) return '<pre>' + esc(md) + '</pre>';
    const raw = marked.parse(md);
    return window.DOMPurify ? DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] }) : raw;
  }

  /* ---------- documents ---------- */
  let docs = [], active = null, uid = 0;
  const handles = new Map();
  const newId = () => 'd' + Date.now().toString(36) + (uid++);
  const cur = () => docs.find(d => d.id === active) || null;
  const dirty = d => d && d.content !== d.saved;
  const makeDoc = (name, content, opts = {}) => ({ id: newId(), name, content, saved: opts.saved ?? content, path: opts.path || '', isSample: !!opts.isSample, opened: Date.now(), closed: false });
  const openDocs = () => docs.filter(d => !d.closed);
  const persist = debounce(() => {
    store.set('folio.docs', docs.map(({ id, name, content, saved, path, isSample, opened, closed }) => ({ id, name, content, saved, path, isSample, opened, closed })));
    store.set('folio.active', active);
  }, 300);
  /* file handles survive restarts in IndexedDB, so a document opened from disk keeps saving to its file */
  const HANDLES_KEY = 'md-handles';
  async function persistHandles() {
    if (!window.FolioDB) return;
    const obj = {}; for (const [id, h] of handles) if (docs.some(d => d.id === id)) obj[id] = h;
    try { await FolioDB.kvSet(HANDLES_KEY, obj); } catch (e) { }
  }
  async function loadHandles() {
    if (!window.FolioDB) return;
    try { const obj = await FolioDB.kvGet(HANDLES_KEY); for (const [id, h] of Object.entries(obj || {})) if (docs.some(d => d.id === id)) handles.set(id, h); } catch (e) { }
  }

  function render() {
    const d = cur();
    $('#empty').hidden = !!d; $('#pageWrap').hidden = !d; $('#zoomBox').hidden = !d;
    editor.disabled = !d;
    if (!d) { editor.value = ''; buildToc(); status(); return; }
    page.innerHTML = d.content.trim() ? toHtml(d.content) : '<p class="empty-doc">Documento vacío. Escribe en el editor o suelta un archivo .md aquí.</p>';
    page.querySelectorAll('table').forEach(t => { const w = document.createElement('div'); w.className = 'tbl'; t.replaceWith(w); w.appendChild(t); });
    page.querySelectorAll('input[type=checkbox]').forEach((cb, i) => { cb.disabled = false; cb.dataset.i = i; cb.setAttribute('aria-label', 'Marcar tarea'); });
    if (window.hljs) page.querySelectorAll('pre code').forEach(el => { try { hljs.highlightElement(el); } catch (e) { } });
    $('#footName').textContent = d.name;
    buildToc(); status();
  }
  const renderSoon = debounce(render, 120);

  function buildToc() {
    const list = $('#tocList'); const hs = cur() ? page.querySelectorAll('h1,h2,h3') : [];
    if (!hs.length) { list.innerHTML = '<li class="none">Este documento no tiene títulos.</li>'; return; }
    list.innerHTML = [...hs].map(h => `<li><button class="l${h.tagName[1]}" data-id="${esc(h.id)}">${esc(h.textContent)}</button></li>`).join('');
    tocActive();
  }
  function tocActive() {
    const btns = [...document.querySelectorAll('#tocList button')]; if (!btns.length) return;
    const top = viewer.getBoundingClientRect().top + 90; let on = btns[0];
    for (const b of btns) { const h = document.getElementById(b.dataset.id); if (h && h.getBoundingClientRect().top <= top) on = b; }
    btns.forEach(b => b.classList.toggle('on', b === on));
  }
  function renderTabs() {
    $('#tabs').innerHTML = openDocs().map(d => `
      <div class="tab ${d.id === active ? 'on' : ''}" data-id="${d.id}">
        <button class="tab-name" role="tab" aria-selected="${d.id === active}" title="${esc(d.path || d.name)}">${dirty(d) ? '<span class="dot" title="Sin guardar"></span>' : ''}${esc(d.name)}${d.isSample ? ' <span class="tag">ejemplo</span>' : ''}</button>
        <button class="tab-x" aria-label="Cerrar ${esc(d.name)}">×</button>
      </div>`).join('');
    const on = $('#tabs .tab.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function status() {
    const d = cur();
    if (!d) { $('#stName').textContent = 'Ningún documento abierto'; $('#stWords').textContent = ''; $('#stPos').textContent = ''; $('#stSave').textContent = ''; return; }
    const words = (d.content.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`|\-\[\]()!]/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
    const mins = Math.max(1, Math.round(words / 200));
    $('#stName').textContent = d.isSample ? `${d.name} · documento de ejemplo` : (d.path || d.name);
    $('#stWords').textContent = `${words.toLocaleString('es')} palabras · ${mins} min`;
    $('#footInfo').textContent = `${words.toLocaleString('es')} palabras`;
    if (app.dataset.mode !== 'read') {
      const before = editor.value.slice(0, editor.selectionStart).split('\n');
      $('#stPos').textContent = `Ln ${before.length}, Col ${before[before.length - 1].length + 1}`;
    } else $('#stPos').textContent = '';
    const s = $('#stSave');
    if (dirty(d)) { s.textContent = '● Sin guardar'; s.className = 'st-warn'; }
    else { s.textContent = handles.has(d.id) ? '✓ Guardado en disco' : '✓ Sin cambios'; s.className = 'st-ok'; }
  }
  function activate(id) {
    active = id; const d = cur();
    if (d) { d.closed = false; d.opened = Date.now(); }
    editor.value = d ? d.content : '';
    renderTabs(); render(); persist();
    viewer.scrollTop = 0; editor.scrollTop = 0;
  }

  /* ---------- modes ---------- */
  function setMode(m) {
    app.dataset.mode = m;
    document.querySelectorAll('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    app.classList.remove('toc-open');
    store.set('folio.mode', m);
    if (m !== 'read' && cur() && Shell.ws() === 'md') setTimeout(() => editor.focus({ preventScroll: true }), 0);
    status();
  }
  document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  /* ---------- editor ---------- */
  let lastDirty = null;
  function onInput() {
    const d = cur(); if (!d) return;
    d.content = editor.value; if (d.isSample && dirty(d)) d.isSample = false;
    const nd = dirty(d); if (nd !== lastDirty) { lastDirty = nd; renderTabs(); }
    renderSoon(); persist(); status();
  }
  editor.addEventListener('input', onInput);
  editor.addEventListener('keyup', status); editor.addEventListener('click', status);

  function replaceRange(start, end, text, selA, selB) {
    editor.focus();
    editor.setSelectionRange(start, end);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { }
    if (!ok || editor.value.slice(start, start + text.length) !== text) editor.setRangeText(text, start, end, 'end');
    if (selA != null) editor.setSelectionRange(start + selA, start + (selB ?? selA));
    onInput();
  }
  function wrap(b, a, ph) {
    const s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
    if (s >= b.length && v.slice(s - b.length, s) === b && v.slice(e, e + a.length) === a) { replaceRange(s - b.length, e + a.length, v.slice(s, e), 0, e - s); return; }
    const sel = v.slice(s, e) || ph;
    replaceRange(s, e, b + sel + a, b.length, b.length + sel.length);
  }
  function lineRange() {
    const v = editor.value; let s = editor.selectionStart, e = editor.selectionEnd;
    s = v.lastIndexOf('\n', s - 1) + 1; const n = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e); e = n === -1 ? v.length : n;
    return [s, e];
  }
  function prefixLines(kind) {
    const [s, e] = lineRange(); const lines = editor.value.slice(s, e).split('\n');
    let out;
    if (/^h[1-6]$/.test(kind)) {
      const p = '#'.repeat(+kind[1]) + ' ';
      const all = lines.every(l => l.startsWith(p));
      out = lines.map(l => { const t = l.replace(/^#{1,6}\s+/, ''); return all ? t : p + t; });
    } else {
      const re = { ul: /^(\s*)[-*+]\s+(?!\[[ xX]\])/, ol: /^(\s*)\d+[.)]\s+/, task: /^(\s*)[-*+]\s+\[[ xX]\]\s+/, quote: /^(\s*)>\s?/ }[kind];
      const nonEmpty = lines.filter(l => l.trim());
      const all = nonEmpty.length && nonEmpty.every(l => re.test(l));
      let n = 0;
      out = lines.map(l => {
        if (all) return l.replace(re, '$1');
        if (!l.trim() && lines.length > 1) return l;
        const t = l.replace(/^(\s*)([-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)/, '$1');
        const ind = t.match(/^\s*/)[0], body = t.slice(ind.length);
        return ind + ({ ul: '- ', ol: `${++n}. `, task: '- [ ] ', quote: '> ' }[kind]) + body;
      });
    }
    const text = out.join('\n');
    replaceRange(s, e, text, text.length);
  }
  function insertBlock(text, selA, selB) {
    const s = editor.selectionStart, e = editor.selectionEnd, v = editor.value;
    const before = v.slice(0, s), after = v.slice(e);
    const pre = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const post = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    replaceRange(s, e, pre + text + post, pre.length + (selA ?? text.length), pre.length + (selB ?? selA ?? text.length));
  }

  /* tables */
  const isTblLine = l => /^\s*\|/.test(l);
  function parseRow(line) {
    let s = line.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map(c => c.trim());
  }
  function formatRows(rows) {
    const n = Math.max(...rows.map(r => r.length));
    rows.forEach(r => { while (r.length < n) r.push(''); });
    const align = rows[1].map(c => { const l = c.startsWith(':'), r = c.endsWith(':'); return l && r ? 'c' : r ? 'r' : l ? 'l' : ''; });
    const w = Array.from({ length: n }, (_, j) => Math.max(3, ...rows.filter((_, i) => i !== 1).map(r => [...r[j]].length)));
    return rows.map((r, i) => '| ' + r.map((c, j) => {
      if (i !== 1) return c + ' '.repeat(w[j] - [...c].length);
      const a = align[j]; if (a === 'c') return ':' + '-'.repeat(w[j] - 2) + ':'; if (a === 'r') return '-'.repeat(w[j] - 1) + ':'; if (a === 'l') return ':' + '-'.repeat(w[j] - 1); return '-'.repeat(w[j]);
    }).join(' | ') + ' |');
  }
  function tableAtCaret() {
    const v = editor.value, pos = editor.selectionStart, lines = v.split('\n');
    let idx = 0, off = 0;
    for (; idx < lines.length; idx++) { if (pos <= off + lines[idx].length) break; off += lines[idx].length + 1; }
    if (!isTblLine(lines[idx] || '')) return null;
    let s = idx, e = idx;
    while (s > 0 && isTblLine(lines[s - 1])) s--;
    while (e < lines.length - 1 && isTblLine(lines[e + 1])) e++;
    if (e - s < 1 || !/^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(lines[s + 1])) return null;
    const start = lines.slice(0, s).reduce((a, l) => a + l.length + 1, 0);
    const block = lines.slice(s, e + 1);
    return { block, start, end: start + block.join('\n').length, row: idx - s };
  }
  function tableOp(kind) {
    const t = tableAtCaret();
    if (!t) { toast('Coloca el cursor dentro de una tabla para usar esta opción.'); return; }
    const rows = t.block.map(parseRow); const n = Math.max(...rows.map(r => r.length));
    let caretRow = t.row;
    if (kind === 'row') { const at = Math.max(t.row, 1) + 1; rows.splice(at, 0, Array(n).fill('')); caretRow = at; }
    if (kind === 'col') rows.forEach((r, i) => { while (r.length < n) r.push(''); r.push(i === 0 ? `Columna ${n + 1}` : i === 1 ? '---' : ''); });
    if (kind === 'delrow') { if (t.row < 2) { toast('El encabezado no se puede quitar. Coloca el cursor en una fila de datos.'); return; } if (rows.length <= 3) { toast('La tabla necesita al menos una fila de datos.'); return; } rows.splice(t.row, 1); caretRow = Math.min(t.row, rows.length - 1); }
    const out = formatRows(rows); const text = out.join('\n');
    const caret = out.slice(0, caretRow).reduce((a, l) => a + l.length + 1, 0) + 2;
    replaceRange(t.start, t.end, text, caret);
  }
  function insertTable(cols, rows) {
    const data = [Array.from({ length: cols }, (_, i) => `Columna ${i + 1}`), Array(cols).fill('---'), ...Array.from({ length: rows }, () => Array(cols).fill(''))];
    insertBlock(formatRows(data).join('\n'), 2, 2 + 'Columna 1'.length);
  }

  const commands = {
    h1: () => prefixLines('h1'), h2: () => prefixLines('h2'), h3: () => prefixLines('h3'),
    bold: () => wrap('**', '**', 'texto en negrita'), italic: () => wrap('_', '_', 'texto en cursiva'), strike: () => wrap('~~', '~~', 'texto tachado'),
    code: () => wrap('`', '`', 'código'),
    link: () => { const s = editor.selectionStart, e = editor.selectionEnd, sel = editor.value.slice(s, e) || 'texto del enlace'; const t = `[${sel}](https://)`; replaceRange(s, e, t, sel.length + 3, t.length - 1); },
    image: () => { const s = editor.selectionStart, e = editor.selectionEnd, sel = editor.value.slice(s, e) || 'descripción'; const t = `![${sel}](https://)`; replaceRange(s, e, t, sel.length + 4, t.length - 1); },
    ul: () => prefixLines('ul'), ol: () => prefixLines('ol'), task: () => prefixLines('task'), quote: () => prefixLines('quote'),
    codeblock: () => { const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd); insertBlock('```\n' + (sel || 'código') + '\n```', 4, 4 + (sel || 'código').length); },
    hr: () => insertBlock('---'),
    table: () => UI.pickTable($('#tableBtn'), insertTable), row: () => tableOp('row'), col: () => tableOp('col'), delrow: () => tableOp('delrow'), fmt: () => tableOp('fmt')
  };
  $('#toolbar').addEventListener('mousedown', e => { if (e.target.closest('.tb')) e.preventDefault(); });
  $('#toolbar').addEventListener('click', e => { const b = e.target.closest('[data-cmd]'); if (b && cur()) commands[b.dataset.cmd](); });

  editor.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const s = editor.selectionStart, ee = editor.selectionEnd;
      if (s === ee && !e.shiftKey) { replaceRange(s, s, '  ', 2); return; }
      const [ls, le] = lineRange(); const lines = editor.value.slice(ls, le).split('\n');
      const out = lines.map(l => e.shiftKey ? l.replace(/^ {1,2}/, '') : '  ' + l).join('\n');
      replaceRange(ls, le, out, 0, out.length); return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const v = editor.value, s = editor.selectionStart; if (s !== editor.selectionEnd) return;
      const ls = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(ls, s);
      const m = line.match(/^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) |> )/);
      if (!m) return;
      e.preventDefault();
      if (line.trim() === m[2].trim()) { replaceRange(ls, s, '', 0); return; }
      let next = m[2];
      if (m[3]) next = (+m[3] + 1) + m[4] + ' '; else if (/\[[xX]\]/.test(next)) next = next.replace(/\[[xX]\]/, '[ ]');
      replaceRange(s, s, '\n' + m[1] + next, 1 + m[1].length + next.length);
    }
  });

  /* ---------- open / save ---------- */
  async function openFile(file, handle, path) {
    if (window.Shell && Shell.ws() !== 'md' && MD_RE.test(file.name)) Shell.setWs('md');
    if (!MD_RE.test(file.name)) { toast(`${file.name} no es un archivo Markdown. Folio abre .md, .markdown y .txt.`); return; }
    const text = await file.text();
    if (handle) {
      for (const [id, h] of handles) {
        let same = false; try { same = await h.isSameEntry(handle); } catch (e) { }
        const d = docs.find(x => x.id === id);
        if (same && d) { if (!dirty(d)) { d.content = d.saved = text; } activate(id); toast(dirty(d) ? 'Este archivo ya está abierto con cambios sin guardar.' : `Recargado: ${file.name}`); return; }
      }
    }
    const s = docs.find(d => d.isSample && !dirty(d)); if (s) docs.splice(docs.indexOf(s), 1);
    const d = makeDoc(file.name, text, { path });
    docs.push(d); if (handle) { handles.set(d.id, handle); persistHandles(); }
    activate(d.id);
    toast(`Abierto: ${file.name}`);
  }
  async function openDialog() {
    if (window.showOpenFilePicker && !inFrame) {
      try {
        const hs = await showOpenFilePicker({ id: 'folio-md', multiple: true, types: [{ description: 'Documentos Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdown'], 'text/plain': ['.txt'] } }] });
        for (const h of hs) await openFile(await h.getFile(), h);
        return;
      } catch (e) { if (e.name === 'AbortError') return; }
    }
    $('#fileInput').click();
  }
  $('#fileInput').addEventListener('change', async e => { for (const f of [...e.target.files]) await openFile(f); e.target.value = ''; });

  function markSaved(d, name) {
    d.saved = d.content; if (name) d.name = name; d.isSample = false;
    lastDirty = false; renderTabs(); status(); persist(); $('#footName').textContent = d.name;
  }
  async function save(as = false) {
    const d = cur(); if (!d) return;
    const h = handles.get(d.id);
    if (!as && h && h.createWritable) {
      try { const w = await h.createWritable(); await w.write(d.content); await w.close(); markSaved(d); toast(`Guardado: ${d.name}`); return; }
      catch (e) { if (e.name === 'AbortError' || e.name === 'NotAllowedError') { toast('No se dio permiso para escribir el archivo.'); return; } }
    }
    if (window.showSaveFilePicker && !inFrame) {
      try {
        const nh = await showSaveFilePicker({ id: 'folio-md', suggestedName: /\.\w+$/.test(d.name) ? d.name : d.name + '.md', types: [{ description: 'Documento Markdown', accept: { 'text/markdown': ['.md'] } }] });
        const w = await nh.createWritable(); await w.write(d.content); await w.close();
        handles.set(d.id, nh); persistHandles(); d.path = ''; markSaved(d, nh.name); toast(`Guardado: ${nh.name}. Desde ahora Ctrl+S sobrescribe este archivo.`); return;
      } catch (e) { if (e.name === 'AbortError') return; }
    }
    if (!inFrame) { download(/\.\w+$/.test(d.name) ? d.name : d.name + '.md', d.content, 'text/markdown'); markSaved(d); toast('Descargado en tu carpeta de descargas.'); return; }
    await copyText(d.content, true);
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function copyText(text, fromSave) {
    try { await navigator.clipboard.writeText(text); toast(fromSave ? 'Aquí no se pueden guardar archivos: copié el Markdown al portapapeles.' : 'Markdown copiado al portapapeles.'); }
    catch (e) { if (app.dataset.mode === 'read') setMode('edit'); editor.focus(); editor.select(); toast('Texto seleccionado. Cópialo con Ctrl+C.'); }
  }
  function exportHtml() {
    const d = cur(); if (!d) return;
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.name.replace(MD_RE, ''))}</title><style>${css} body{overflow:auto} .viewer{min-height:100vh}</style></head><body><div class="ws-md" data-mode="read" style="display:block"><section class="viewer"><article class="page"><div class="doc">${page.innerHTML}</div></article></section></div></body></html>`;
    if (inFrame) { copyText(html); return; }
    download(d.name.replace(MD_RE, '') + '.html', html, 'text/html'); toast('HTML exportado.');
  }

  /* ---------- task checkboxes in the sheet ---------- */
  page.addEventListener('change', e => {
    const cb = e.target; if (!cb.matches('input[type=checkbox]')) return;
    const d = cur(); if (!d) return;
    const target = +cb.dataset.i; let k = -1, inFence = false;
    const lines = d.content.split('\n').map(l => {
      if (/^\s*(```|~~~)/.test(l)) { inFence = !inFence; return l; }
      if (inFence) return l;
      return l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/, (m, a, b, c) => (++k === target ? a + (b === ' ' ? 'x' : ' ') + c : m));
    });
    d.content = lines.join('\n'); editor.value = d.content; d.isSample = d.isSample && !dirty(d);
    const keep = viewer.scrollTop; render(); viewer.scrollTop = keep; renderTabs(); persist();
  });

  /* ---------- tabs ---------- */
  $('#tabs').addEventListener('click', async e => {
    const tab = e.target.closest('.tab'); if (!tab) return;
    const id = tab.dataset.id;
    if (e.target.closest('.tab-x')) {
      const d = docs.find(x => x.id === id);
      const open = openDocs(), i = open.indexOf(d);
      if (d.isSample && !dirty(d)) { docs.splice(docs.indexOf(d), 1); handles.delete(id); }
      else d.closed = true;
      const next = open[i + 1] || open[i - 1] || null;
      if (id === active || !next) activate(next ? next.id : null); else { renderTabs(); persist(); }
      return;
    }
    if (id !== active) activate(id);
  });
  $('#tabs').addEventListener('auxclick', e => { if (e.button === 1) { const x = e.target.closest('.tab')?.querySelector('.tab-x'); if (x) x.click(); } });
  function newDocument() {
    const taken = new Set(docs.map(d => d.name)); let name = 'Sin título.md', n = 2;
    while (taken.has(name)) name = `Sin título ${n++}.md`;
    const d = makeDoc(name, '', { saved: '' }); docs.push(d); activate(d.id); setMode('edit');
  }
  $('#newDoc').addEventListener('click', newDocument);

  /* ---------- menu & buttons ---------- */
  const menu = $('#menu');
  UI.bindMenu($('#moreBtn'), menu);
  app.parentElement.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || !(menu.contains(b) || $('#empty').contains(b))) return;
    menu.hidden = true;
    ({ saveAs: () => save(true), copy: () => cur() && copyText(cur().content), exportHtml, print: () => window.print(), toc: toggleToc, open: openDialog, new: newDocument, sample: loadSample })[b.dataset.act]?.();
  });
  if (inFrame) $('#printItem').hidden = true;
  $('#openBtn').addEventListener('click', openDialog);
  $('#saveBtn').addEventListener('click', () => save());
  function toggleToc() {
    if (app.dataset.mode !== 'read') setMode('read');
    if (innerWidth <= 1000) app.classList.toggle('toc-open');
    else { app.classList.toggle('toc-off'); store.set('folio.toc', !app.classList.contains('toc-off')); }
  }
  $('#backdrop').addEventListener('click', () => app.classList.remove('toc-open'));
  $('#tocList').addEventListener('click', e => {
    const b = e.target.closest('button[data-id]'); if (!b) return;
    const h = document.getElementById(b.dataset.id); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
    app.classList.remove('toc-open');
  });
  viewer.addEventListener('scroll', debounce(tocActive, 60));
  page.addEventListener('dblclick', () => { if (app.dataset.mode === 'read') setMode('edit'); });
  let syncing = false;
  editor.addEventListener('scroll', () => {
    if (app.dataset.mode !== 'edit' || syncing) return;
    const r = editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight);
    syncing = true; viewer.scrollTop = r * (viewer.scrollHeight - viewer.clientHeight);
    requestAnimationFrame(() => { syncing = false; });
  });
  const ZOOMS = [0.75, 0.85, 1, 1.1, 1.25, 1.5];
  let zi = ZOOMS.indexOf(store.get('folio.zoom') ?? 1); if (zi < 0) zi = 2;
  function applyZoom() { document.documentElement.style.setProperty('--zoom', ZOOMS[zi]); $('#zVal').textContent = Math.round(ZOOMS[zi] * 100) + '%'; store.set('folio.zoom', ZOOMS[zi]); }
  $('#zIn').addEventListener('click', () => { zi = Math.min(ZOOMS.length - 1, zi + 1); applyZoom(); });
  $('#zOut').addEventListener('click', () => { zi = Math.max(0, zi - 1); applyZoom(); });

  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) { if (e.key === 'Escape') { menu.hidden = true; app.classList.remove('toc-open'); } return; }
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); save(e.shiftKey); }
    else if (k === 'o') { e.preventDefault(); openDialog(); }
    else if (k === 'e') { e.preventDefault(); setMode(app.dataset.mode === 'read' ? 'edit' : 'read'); }
    else if (document.activeElement === editor && !e.shiftKey && !e.altKey) {
      if (k === 'b') { e.preventDefault(); commands.bold(); }
      else if (k === 'i') { e.preventDefault(); commands.italic(); }
      else if (k === 'k') { e.preventDefault(); commands.link(); }
    }
  }
  function loadSample() {
    const ex = docs.find(d => d.isSample); if (ex) { activate(ex.id); return; }
    const d = makeDoc('Guía rápida.md', SAMPLE, { isSample: true }); docs.push(d); activate(d.id); setMode('read');
  }
  function hasUnsavedOnDisk() { return docs.some(d => dirty(d) && handles.has(d.id)); }

  /* drop: files dropped while the Markdown workspace is visible */
  async function onDrop(entries) {
    for (const en of entries) {
      if (en.handle && en.handle.kind === 'file') await openFile(await en.handle.getFile(), en.handle);
      else if (en.file) await openFile(en.file);
    }
  }

  /* ---------- boot ---------- */
  function boot(inj) {
    const saved = store.get('folio.docs');
    if (Array.isArray(saved)) docs = saved.filter(d => d && typeof d.content === 'string').map(d => ({ ...d, id: d.id || newId() }));
    let startId = store.get('folio.active');
    if (inj && typeof inj.content === 'string') {
      const same = inj.path && docs.find(d => d.path && d.path.toLowerCase() === String(inj.path).toLowerCase());
      if (same && dirty(same)) startId = same.id;
      else { if (same) docs.splice(docs.indexOf(same), 1); const d = makeDoc(inj.name || 'documento.md', inj.content, { path: inj.path || '' }); docs.push(d); startId = d.id; }
    }
    docs = docs.filter(d => !(d.isSample && !dirty(d)));
    docs.forEach(d => { if (d.opened == null) d.opened = 0; if (d.closed == null) d.closed = false; });
    const start = docs.find(d => d.id === startId && !d.closed) || openDocs().sort((a, b) => b.opened - a.opened)[0];
    startId = start ? start.id : null;
    if (store.get('folio.toc') === false) app.classList.add('toc-off');
    applyZoom();
    setMode(store.get('folio.mode') || 'read');
    activate(startId);
    loadHandles();
  }

  /* ---------- library (used by Inicio) ---------- */
  function library() {
    return docs.map(d => ({ id: d.id, name: d.name, path: d.path, opened: d.opened || 0, dirty: dirty(d), hasFile: handles.has(d.id), isOpen: !d.closed, isSample: d.isSample }));
  }
  async function openDoc(id) {
    const d = docs.find(x => x.id === id); if (!d) return;
    const h = handles.get(id);
    if (h && !dirty(d)) {
      try {
        let perm = await h.queryPermission({ mode: 'read' });
        if (perm !== 'granted') perm = await h.requestPermission({ mode: 'read' });
        if (perm === 'granted') { const text = await (await h.getFile()).text(); if (text !== d.content) { d.content = d.saved = text; } }
      } catch (e) { toast(`No se pudo leer ${d.name} del disco; se muestra la última copia guardada en Folio.`); }
    }
    Shell.setWs('md'); activate(id);
  }
  async function removeDoc(id) {
    const d = docs.find(x => x.id === id); if (!d) return false;
    const onDisk = handles.has(id) || d.path;
    const msg = onDisk
      ? `¿Quitar “${d.name}” de Folio? El archivo en tu equipo no se borra.${dirty(d) ? ' Los cambios sin guardar se perderán.' : ''}`
      : `¿Eliminar “${d.name}”? Solo existe dentro de Folio, así que su contenido se perderá.`;
    if (!(await ask(msg, onDisk ? 'Quitar' : 'Eliminar', true))) return false;
    const wasActive = id === active;
    docs.splice(docs.indexOf(d), 1); handles.delete(id); persistHandles();
    if (wasActive) { const next = openDocs().sort((a, b) => b.opened - a.opened)[0]; activate(next ? next.id : null); }
    else { renderTabs(); persist(); }
    toast(onDisk ? `“${d.name}” ya no aparece en Folio.` : `“${d.name}” eliminado.`);
    return true;
  }

  window.Markdown = { boot, onKey, onDrop, openFile, openDialog, newDocument, loadSample, library, openDoc, removeDoc, setMode, hasUnsavedOnDisk, isMarkdown: name => MD_RE.test(name), download };
})();
