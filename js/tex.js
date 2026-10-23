/* Folio — LaTeX workspace (Overleaf-style): project folder, editor, real pdfLaTeX, PDF preview */
(function () {
  'use strict';
  const { $, esc, debounce, store, toast, dialog, ask } = UI;

  const TEXT_EXT = /\.(tex|ltx|bib|bst|cls|sty|clo|def|cfg|fd|txt|md|csv|tsv|dat|tikz|pgf|lco|bbx|cbx|ldf|ist|lua|json|py|m|c|h|cpp|hpp|js|ts|r|sh|yaml|yml|xml|ini|lst)$/i;
  const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;
  const COMPILE_EXT = /\.(tex|ltx|bib|bst|cls|sty|clo|def|cfg|fd|txt|csv|tsv|dat|tikz|pgf|lco|bbx|cbx|ldf|ist|lua|png|jpe?g|pdf|eps|mps|jbig2|py|m|c|h|cpp|hpp|js|r|sh|lst|xml|json)$/i;
  const HIDDEN = /^(\.|__pycache__$|node_modules$|~\$)|\.(aux|log|out|toc|lof|lot|fls|fdb_latexmk|synctex\.gz|synctex|bbl|blg|bcf|run\.xml|nav|snm|vrb|xdv|dvi|bak|tmp)$/i;
  const MAX_FILE = 50 * 1024 * 1024, MAX_ENTRIES = 3000, MAX_DEPTH = 8;
  const supportsFS = 'showDirectoryPicker' in window;

  let P = null;                     // current project
  const buffers = new Map();        // path -> { doc, gen }
  let cm = null, inited = false;
  let lastPdf = null;               // Uint8Array of the last good PDF
  let problems = [];
  let selectedDir = '';
  const expanded = new Set();
  let projectSeq = 0;

  /* ================= helpers ================= */
  const dirname = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
  const basename = p => p.slice(p.lastIndexOf('/') + 1);
  const joinPath = (a, b) => (a ? a + '/' : '') + b;
  function normPath(p) {
    const out = [];
    for (const seg of p.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); }
    return out.join('/');
  }
  function relFrom(fromDir, target) {
    if (!fromDir) return target;
    const a = fromDir.split('/'), b = target.split('/');
    let i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
    return '../'.repeat(a.length - i) + b.slice(i).join('/');
  }
  const safeName = n => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-') || 'archivo';
  const stamp = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };
  const fmtBytes = b => b > 1e6 ? (b / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
  const isDirty = path => { const b = buffers.get(path); return !!b && !b.doc.isClean(b.gen); };
  const anyDirty = () => [...buffers.keys()].some(isDirty);
  const readOnly = () => !P;

  async function verifyPermission(handle, withRequest) {
    const opts = { mode: 'readwrite' };
    try {
      if ((await handle.queryPermission(opts)) === 'granted') return true;
      if (withRequest && (await handle.requestPermission(opts)) === 'granted') return true;
    } catch (e) { }
    return false;
  }
  async function dirHandleFor(path, create) {
    if (!P.root) throw new Error('Este archivo no está dentro de una carpeta de proyecto.');
    let h = P.root;
    for (const seg of path.split('/').filter(Boolean)) h = await h.getDirectoryHandle(seg, { create: !!create });
    return h;
  }
  async function writeFile(path, data) {
    let fh = P.files.get(path)?.handle;
    if (!fh) { const dir = await dirHandleFor(dirname(path), true); fh = await dir.getFileHandle(basename(path), { create: true }); }
    const w = await fh.createWritable(); await w.write(data); await w.close();
    P.files.set(path, { handle: fh });
    let d = dirname(path); while (d) { P.dirs.add(d); d = dirname(d); }
    return fh;
  }
  async function uniquePath(dir, name) {
    const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    let cand = joinPath(dir, name), n = 2;
    while (P.files.has(cand)) cand = joinPath(dir, `${stem}-${n++}${ext}`);
    return cand;
  }

  /* ================= project loading ================= */
  async function scanDir(root) {
    const files = new Map(), dirs = new Set(); let count = 0;
    async function walk(dir, prefix, depth) {
      for await (const [name, h] of dir.entries()) {
        if (HIDDEN.test(name)) continue;
        const path = prefix + name;
        if (h.kind === 'directory') { if (depth < MAX_DEPTH) { dirs.add(path); await walk(h, path + '/', depth + 1); } }
        else { if (++count > MAX_ENTRIES) throw new Error(`La carpeta tiene más de ${MAX_ENTRIES} archivos. Elige la carpeta del proyecto, no una carpeta general como Documentos.`); files.set(path, { handle: h }); }
      }
    }
    await walk(root, '', 0);
    return { files, dirs };
  }
  async function detectMain(files, preferred) {
    if (preferred && files.has(preferred)) return preferred;
    const tex = [...files.keys()].filter(p => /\.tex$/i.test(p)).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
    if (files.has('main.tex')) return 'main.tex';
    for (const p of tex.slice(0, 25)) {
      try { const f = await files.get(p).handle.getFile(); if (f.size < 2e6 && /\\documentclass/.test(await f.text())) return p; } catch (e) { }
    }
    return tex[0] || null;
  }

  async function openProject(desc, opts = {}) {
    if (P && anyDirty()) await saveAll().catch(() => { });
    const my = ++projectSeq;
    let files, dirs;
    try {
      if (desc.kind === 'file') { files = new Map([[desc.fileHandle.name, { handle: desc.fileHandle }]]); dirs = new Set(); }
      else ({ files, dirs } = await scanDir(desc.root));
    } catch (e) { toast(e.message); return false; }
    if (my !== projectSeq) return false;
    buffers.clear(); problems = []; lastPdf = null; selectedDir = '';
    P = { id: desc.id, name: desc.name, kind: desc.kind, root: desc.root || null, fileHandle: desc.fileHandle || null, files, dirs, main: null, open: null };
    P.main = await detectMain(files, desc.main);
    expanded.clear(); [...dirs].filter(d => !d.includes('/')).forEach(d => expanded.add(d));
    if (desc.kind !== 'app' || desc.id !== 'sample') {
      FolioDB.putProject({ id: desc.id, name: desc.name, kind: desc.kind, handle: desc.root || desc.fileHandle, main: P.main, opened: Date.now() }).catch(() => { });
    }
    store.set('folio.tex.last', desc.id);
    document.title = `${P.name} · Folio`;
    renderHeader(); renderTree(); renderBanner(); showProblems(); clearPdf();
    const first = opts.open && files.has(opts.open) ? opts.open : P.main;
    if (first) await openPath(first); else { showEmptyEditor(); }
    if ($('#autoCompile').checked && P.main && opts.compile !== false) compile('open');
    return true;
  }

  async function openFolderDialog(startIn) {
    if (!supportsFS) { toast('Este navegador no permite abrir carpetas. Usa Edge o Chrome.'); return; }
    let root;
    try { root = await showDirectoryPicker({ id: 'folio-tex', mode: 'readwrite', startIn: startIn || 'documents' }); }
    catch (e) { if (e.name !== 'AbortError') toast('No se pudo abrir la carpeta: ' + e.message); return; }
    const id = await projectIdFor(root);
    let preferMain = null;
    if (startIn && startIn.kind === 'file') { try { const parts = await root.resolve(startIn); if (parts) preferMain = parts.join('/'); } catch (e) { } }
    const rec = (await FolioDB.projects().catch(() => [])).find(p => p.id === id);
    await openProject({ id, name: root.name, kind: 'folder', root, main: preferMain || rec?.main });
  }
  async function projectIdFor(handle) {
    const all = await FolioDB.projects().catch(() => []);
    for (const p of all) { try { if (p.handle && p.handle.kind === handle.kind && await p.handle.isSameEntry(handle)) return p.id; } catch (e) { } }
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  async function openFileHandle(fh) {
    // .tex opened alone (file handler / drag): look for an already-known project folder that contains it
    const all = await FolioDB.projects().catch(() => []);
    for (const p of all) {
      if (p.kind !== 'folder' || !p.handle) continue;
      try {
        if ((await p.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') continue;
        const parts = await p.handle.resolve(fh);
        if (parts) { await openProject({ id: p.id, name: p.name, kind: 'folder', root: p.handle, main: p.main }, { open: parts.join('/') }); return; }
      } catch (e) { }
    }
    const id = await projectIdFor(fh);
    await openProject({ id, name: fh.name, kind: 'file', fileHandle: fh, main: fh.name });
  }
  async function reopen(rec) {
    const ok = await verifyPermission(rec.handle, true);
    if (!ok) { toast('Folio necesita permiso para abrir esa carpeta.'); return; }
    if (rec.kind === 'file') await openProject({ id: rec.id, name: rec.name, kind: 'file', fileHandle: rec.handle, main: rec.handle.name });
    else await openProject({ id: rec.id, name: rec.name, kind: 'folder', root: rec.handle, main: rec.main });
  }

  /* ---------- templates & sample ---------- */
  const PREAMBLE = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{graphicx,booktabs,ragged2e}
\\usepackage[spanish,es-tabla,activeacute]{babel}
\\usepackage{amsmath,amssymb}
\\usepackage{float}
\\usepackage{listings}
\\usepackage{xcolor}
\\usepackage{caption}
\\usepackage{subcaption}
\\usepackage{hyperref}
\\usepackage{xurl}
\\usepackage{tabularx}

\\lstset{basicstyle=\\ttfamily\\small, keywordstyle=\\color{blue!55!black}\\bfseries,
  commentstyle=\\color{gray}\\itshape, stringstyle=\\color{green!45!black},
  frame=single, rulecolor=\\color{black!25}, breaklines=true, numbers=left,
  numberstyle=\\tiny\\color{gray}, showstringspaces=false,
  literate={á}{{\\'a}}1 {é}{{\\'e}}1 {í}{{\\'i}}1 {ó}{{\\'o}}1 {ú}{{\\'u}}1
           {Á}{{\\'A}}1 {É}{{\\'E}}1 {Í}{{\\'I}}1 {Ó}{{\\'O}}1 {Ú}{{\\'U}}1
           {ñ}{{\\~n}}1 {Ñ}{{\\~N}}1 {ü}{{\\"u}}1 {Ü}{{\\"U}}1 {¿}{{\\textquestiondown}}1 {¡}{{\\textexclamdown}}1
           {°}{{\\textdegree}}1 {±}{{$\\pm$}}1}
\\hypersetup{colorlinks=true, linkcolor=blue!50!black, urlcolor=blue!50!black, citecolor=green!40!black}
`;
  const NEW_MAIN = PREAMBLE + `
\\title{Título del documento}
\\author{Jose Hernández Barrantes}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introducción}
Escribe aquí. Arrastra o pega una imagen en el editor para insertarla como figura.

\\end{document}
`;
  const SAMPLE_MAIN = PREAMBLE + `
\\title{Modelado de un sistema de primer orden}
\\author{Proyecto de ejemplo de Folio}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
\\justifying
Este documento es un ejemplo para probar Folio: usa el mismo preámbulo de tus artículos, con
figuras, tablas, ecuaciones, código y referencias cruzadas. Edita el texto y el PDF se
actualiza solo unos segundos después.
\\end{abstract}

\\section{Introducción}
\\justifying
Un sistema de primer orden responde a una entrada escalón con una curva exponencial
caracterizada por su ganancia estática $K$ y su constante de tiempo $\\tau$~\\cite{ogata2010}.
La Figura~\\ref{fig:respuesta} muestra la respuesta simulada y la Tabla~\\ref{tab:parametros}
resume los parámetros identificados.

\\section{Modelo}
La función de transferencia del sistema es
\\begin{equation}
  G(s) = \\frac{Y(s)}{U(s)} = \\frac{K}{\\tau s + 1},
  \\label{eq:tf}
\\end{equation}
y su respuesta a un escalón de amplitud $A$ es
\\begin{equation}
  y(t) = K A \\left(1 - e^{-t/\\tau}\\right), \\qquad t \\geq 0.
  \\label{eq:escalon}
\\end{equation}
A partir de \\eqref{eq:escalon}, la salida alcanza el 63,2\\,\\% de su valor final cuando $t=\\tau$.

\\begin{figure}[H]
  \\centering
  \\includegraphics[width=0.8\\linewidth]{figuras/respuesta-escalon.png}
  \\caption{Respuesta al escalón del sistema de primer orden.}
  \\label{fig:respuesta}
\\end{figure}

\\section{Resultados}
\\begin{table}[H]
  \\centering
  \\caption{Parámetros identificados a partir del ensayo.}
  \\label{tab:parametros}
  \\begin{tabularx}{0.8\\linewidth}{Xcc}
    \\toprule
    Parámetro & Símbolo & Valor \\\\
    \\midrule
    Ganancia estática & $K$ & 2,0 \\\\
    Constante de tiempo & $\\tau$ & 1,5\\,s \\\\
    Tiempo de establecimiento (2\\,\\%) & $t_s$ & 6,0\\,s \\\\
    \\bottomrule
  \\end{tabularx}
\\end{table}

El siguiente código calcula la respuesta de la ecuación~\\eqref{eq:escalon}:
\\begin{lstlisting}[language=Python]
import numpy as np

def respuesta(t, K=2.0, tau=1.5, A=1.0):
    """Respuesta al escalón de un sistema de primer orden."""
    return K * A * (1 - np.exp(-t / tau))
\\end{lstlisting}

Más información en \\url{https://es.wikipedia.org/wiki/Sistema_de_primer_orden}.

\\bibliographystyle{plain}
\\bibliography{referencias}

\\end{document}
`;
  const SAMPLE_BIB = `@book{ogata2010,
  author    = {Katsuhiko Ogata},
  title     = {Ingeniería de control moderna},
  edition   = {5},
  publisher = {Pearson Educación},
  address   = {Madrid},
  year      = {2010}
}
`;
  function samplePlotPng() {
    const W = 1200, H = 700, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const L = 110, R = 40, T = 40, B = 100, pw = W - L - R, ph = H - T - B;
    const X = t => L + t / 10 * pw, Y = y => T + ph - y / 2.4 * ph;
    g.strokeStyle = '#e3e6ec'; g.lineWidth = 1.5;
    for (let t = 0; t <= 10; t++) { g.beginPath(); g.moveTo(X(t), T); g.lineTo(X(t), T + ph); g.stroke(); }
    for (let y = 0; y <= 2.4 + 1e-9; y += 0.4) { g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(L + pw, Y(y)); g.stroke(); }
    g.strokeStyle = '#333'; g.lineWidth = 2.5; g.strokeRect(L, T, pw, ph);
    g.fillStyle = '#333'; g.font = '28px serif'; g.textAlign = 'center';
    for (let t = 0; t <= 10; t += 2) g.fillText(String(t), X(t), T + ph + 38);
    g.textAlign = 'right'; for (let y = 0; y <= 2.4 + 1e-9; y += 0.8) g.fillText(y.toFixed(1).replace('.', ','), L - 14, Y(y) + 9);
    g.textAlign = 'center'; g.font = 'italic 30px serif'; g.fillText('t (s)', L + pw / 2, H - 22);
    g.save(); g.translate(34, T + ph / 2); g.rotate(-Math.PI / 2); g.fillText('y(t)', 0, 0); g.restore();
    g.setLineDash([12, 10]); g.strokeStyle = '#9aa3b5'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(L, Y(2)); g.lineTo(L + pw, Y(2)); g.stroke();
    g.beginPath(); g.moveTo(X(1.5), Y(0)); g.lineTo(X(1.5), Y(2 * (1 - Math.exp(-1)))); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#2f3fb8'; g.lineWidth = 5; g.beginPath();
    for (let i = 0; i <= 400; i++) { const t = i / 40, y = 2 * (1 - Math.exp(-t / 1.5)); i ? g.lineTo(X(t), Y(y)) : g.moveTo(X(t), Y(y)); }
    g.stroke();
    g.fillStyle = '#2f3fb8'; g.beginPath(); g.arc(X(1.5), Y(2 * (1 - Math.exp(-1))), 9, 0, 7); g.fill();
    g.font = '26px serif'; g.textAlign = 'left'; g.fillStyle = '#333'; g.fillText('63,2 % en t = τ', X(1.5) + 18, Y(2 * (1 - Math.exp(-1))) + 34);
    return new Promise(res => c.toBlob(res, 'image/png'));
  }
  async function appDir() { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle('folio-proyectos', { create: true }); }
  async function openSample() {
    try {
      const base = await appDir();
      const root = await base.getDirectoryHandle('ejemplo-articulo', { create: true });
      let exists = false; try { await root.getFileHandle('main.tex'); exists = true; } catch (e) { }
      if (!exists) {
        const put = async (dir, name, data) => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(data); await w.close(); };
        await put(root, 'main.tex', SAMPLE_MAIN);
        await put(root, 'referencias.bib', SAMPLE_BIB);
        const fig = await root.getDirectoryHandle('figuras', { create: true });
        await put(fig, 'respuesta-escalon.png', await samplePlotPng());
      }
      await openProject({ id: 'sample', name: 'Ejemplo: artículo', kind: 'app', root, main: 'main.tex' });
    } catch (e) {
      toast('No se pudo crear el proyecto de ejemplo: ' + e.message);
      showEmptyEditor();
    }
  }
  async function resetSample() {
    if (!(await ask('¿Restaurar el proyecto de ejemplo? Se borran los cambios que hiciste en él.', 'Restaurar', true))) return;
    const base = await appDir(); try { await base.removeEntry('ejemplo-articulo', { recursive: true }); } catch (e) { }
    await openSample();
  }
  async function newProject() {
    if (!supportsFS) { toast('Este navegador no permite crear carpetas. Usa Edge o Chrome.'); return; }
    let root;
    try { root = await showDirectoryPicker({ id: 'folio-tex', mode: 'readwrite', startIn: 'documents' }); }
    catch (e) { if (e.name !== 'AbortError') toast(e.message); return; }
    let hasMain = false, count = 0;
    for await (const [name] of root.entries()) { count++; if (name === 'main.tex') hasMain = true; }
    if (hasMain) { toast('Esa carpeta ya tiene un main.tex. Se abrirá como proyecto.'); }
    else {
      if (count > 0 && !(await ask(`La carpeta “${root.name}” ya tiene ${count} elemento${count > 1 ? 's' : ''}. Se añadirán main.tex y la carpeta figuras/ sin tocar lo demás.`, 'Crear proyecto aquí'))) return;
      const fh = await root.getFileHandle('main.tex', { create: true }); const w = await fh.createWritable(); await w.write(NEW_MAIN); await w.close();
      await root.getDirectoryHandle('figuras', { create: true });
    }
    await openProject({ id: await projectIdFor(root), name: root.name, kind: 'folder', root, main: 'main.tex' });
  }
  async function copyProjectToFolder() {
    if (!P || !P.root) return;
    let dest;
    try { dest = await showDirectoryPicker({ id: 'folio-tex', mode: 'readwrite', startIn: 'documents' }); } catch (e) { return; }
    await saveAll();
    let n = 0;
    for (const [path, f] of P.files) {
      let d = dest; const parts = path.split('/'); const name = parts.pop();
      for (const seg of parts) d = await d.getDirectoryHandle(seg, { create: true });
      const fh = await d.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(await f.handle.getFile()); await w.close(); n++;
    }
    toast(`${n} archivos copiados a “${dest.name}”.`);
    await openProject({ id: await projectIdFor(dest), name: dest.name, kind: 'folder', root: dest, main: P.main });
  }

  /* ================= header, menus ================= */
  function renderHeader() {
    $('#projName').textContent = P ? P.name : 'Sin proyecto';
    const k = $('#projKind');
    k.hidden = !P || P.kind === 'folder';
    k.textContent = P ? (P.kind === 'app' ? 'en la app' : P.kind === 'file' ? 'solo archivo' : '') : '';
    const sel = $('#mainSel'), texs = P ? [...P.files.keys()].filter(p => /\.tex$/i.test(p)).sort() : [];
    $('#mainSelWrap').hidden = texs.length < 2;
    sel.innerHTML = texs.map(p => `<option value="${esc(p)}"${p === P.main ? ' selected' : ''}>${esc(p)}</option>`).join('');
  }
  $('#mainSel').addEventListener('change', e => { setMain(e.target.value); });
  function setMain(path) {
    if (!P) return; P.main = path; renderHeader(); renderTree();
    if (P.kind !== 'app') FolioDB.projects().then(all => { const r = all.find(x => x.id === P.id); if (r) { r.main = path; FolioDB.putProject(r); } }).catch(() => { });
    toast(`Archivo principal: ${path}`); if ($('#autoCompile').checked) compile('main');
  }

  const projMenu = $('#projMenu');
  UI.bindMenu($('#projBtn'), projMenu, async () => {
    const recents = (await FolioDB.projects().catch(() => [])).filter(p => !P || p.id !== P.id).sort((a, b) => b.opened - a.opened).slice(0, 8);
    projMenu.innerHTML = `
      <button data-pact="open">Abrir carpeta de proyecto… <kbd>Ctrl+O</kbd></button>
      <button data-pact="new">Proyecto nuevo con tu preámbulo…</button>
      <button data-pact="sample">Proyecto de ejemplo</button>
      ${P && P.kind === 'file' ? '<button data-pact="folder">Abrir la carpeta de este archivo…</button>' : ''}
      ${P && P.kind === 'app' ? '<button data-pact="copy">Copiar este proyecto a una carpeta…</button><button data-pact="reset">Restaurar el ejemplo</button>' : ''}
      ${recents.length ? '<hr><div class="mlabel">Recientes</div>' + recents.map(r => `<button data-pact="recent" data-id="${esc(r.id)}"><span>${esc(r.name)}</span><span class="sub">${r.kind === 'file' ? 'archivo' : 'carpeta'}</span></button>`).join('') : ''}`;
  });
  projMenu.addEventListener('click', async e => {
    const b = e.target.closest('[data-pact]'); if (!b) return; projMenu.hidden = true;
    const act = b.dataset.pact;
    if (act === 'open') openFolderDialog();
    else if (act === 'new') newProject();
    else if (act === 'sample') openSample();
    else if (act === 'folder') openFolderDialog(P.fileHandle);
    else if (act === 'copy') copyProjectToFolder();
    else if (act === 'reset') resetSample();
    else if (act === 'recent') { const r = (await FolioDB.projects()).find(x => x.id === b.dataset.id); if (r) reopen(r); }
  });

  const compileMenu = $('#compileMenu');
  UI.bindMenu($('#compileMore'), compileMenu);
  compileMenu.addEventListener('click', e => {
    const b = e.target.closest('[data-tact]'); if (!b) return; compileMenu.hidden = true;
    ({ savePdf, openPdf, engine: engineDialog, restart: () => { FolioTex.stop(); toast('Motor reiniciado. Se iniciará al compilar.'); } })[b.dataset.tact]();
  });

  function renderBanner() {
    const el = $('#texBanner');
    if (P && P.kind === 'file') {
      el.innerHTML = `<div class="banner"><span>Abriste solo <strong>${esc(P.name)}</strong>. Para usar imágenes, .bib u otros archivos, abre su carpeta.</span><button class="btn" id="bnFolder">Abrir carpeta</button></div>`;
      $('#bnFolder').onclick = () => openFolderDialog(P.fileHandle);
    } else if (P && P.kind === 'app' && P.id === 'sample') {
      el.innerHTML = `<div class="banner"><span>Ejemplo guardado dentro de la app. Para tus trabajos usa una carpeta de tu equipo.</span><button class="btn" id="bnNew">Proyecto nuevo</button><button class="btn" id="bnOpen">Abrir carpeta</button><button class="ib x" id="bnX" aria-label="Ocultar aviso">×</button></div>`;
      $('#bnNew').onclick = newProject; $('#bnOpen').onclick = () => openFolderDialog();
      $('#bnX').onclick = () => { el.innerHTML = ''; store.set('folio.tex.sampleBanner', false); };
      if (store.get('folio.tex.sampleBanner') === false) el.innerHTML = '';
    } else el.innerHTML = '';
  }

  /* ================= file tree ================= */
  const ICON = {
    dir: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.5 4v9h13V5.5H8L6.5 3.5h-5z"/></svg>',
    dirOpen: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.5 13V3.5h5L8 5.5h5v2M1.5 13l2-5.5h11l-2 5.5z"/></svg>',
    tex: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3"/><path d="M5.5 8h5M5.5 10.5h5M5.5 13h3" stroke-linecap="round"/></svg>',
    img: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="m2.5 11.5 3.5-3.5 3 3 2-2 2.5 2.5"/></svg>',
    bib: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3 2.5h9.5v11H3z M5.5 2.5v11"/></svg>',
    pdf: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3"/><path d="M5.5 11.5h1.2a1 1 0 0 0 0-2H5.5v3" stroke-linecap="round"/></svg>',
    file: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3"/></svg>',
    more: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="3" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="13" cy="8" r="1.3"/></svg>'
  };
  const iconFor = p => /\.(tex|ltx|sty|cls)$/i.test(p) ? ICON.tex : /\.bib$/i.test(p) ? ICON.bib : /\.pdf$/i.test(p) ? ICON.pdf : IMG_EXT.test(p) || /\.eps$/i.test(p) ? ICON.img : ICON.file;

  function renderTree() {
    const el = $('#tree');
    if (!P) { el.innerHTML = '<p class="log-empty">Abre una carpeta de proyecto para ver sus archivos.</p>'; return; }
    const kids = new Map(); const add = (parent, entry) => { if (!kids.has(parent)) kids.set(parent, []); kids.get(parent).push(entry); };
    for (const d of P.dirs) add(dirname(d), { path: d, dir: true });
    for (const f of P.files.keys()) add(dirname(f), { path: f, dir: false });
    const level = parent => {
      const items = (kids.get(parent) || []).sort((a, b) => (b.dir - a.dir) || basename(a.path).localeCompare(basename(b.path), 'es', { numeric: true }));
      if (!items.length) return '';
      return '<ul role="group">' + items.map(it => {
        const open = it.dir && expanded.has(it.path);
        const on = it.dir ? (selectedDir === it.path && !P.open) : P.open === it.path;
        return `<li role="treeitem"${it.dir ? ` aria-expanded="${open}"` : ''}><div class="node${on ? ' on' : ''}" data-path="${esc(it.path)}" data-dir="${it.dir ? 1 : ''}" tabindex="0">${it.dir ? (open ? ICON.dirOpen : ICON.dir) : iconFor(it.path)}<span class="nm">${esc(basename(it.path))}</span>${!it.dir && it.path === P.main ? '<span class="main-tag" title="Archivo principal">main</span>' : ''}${!it.dir && isDirty(it.path) ? '<span class="dot" title="Sin guardar"></span>' : ''}<button class="more" aria-label="Opciones de ${esc(basename(it.path))}">${ICON.more}</button></div>${open ? level(it.path) : ''}</li>`;
      }).join('') + '</ul>';
    };
    el.innerHTML = level('') || '<p class="log-empty">La carpeta está vacía.</p>';
  }
  const renderTreeSoon = debounce(renderTree, 150);
  $('#tree').addEventListener('click', e => {
    const node = e.target.closest('.node'); if (!node) return;
    const path = node.dataset.path;
    if (e.target.closest('.more')) { e.stopPropagation(); nodeMenu(node, path, !!node.dataset.dir); return; }
    if (node.dataset.dir) { selectedDir = path; expanded.has(path) ? expanded.delete(path) : expanded.add(path); renderTree(); }
    else { selectedDir = dirname(path); openPath(path); if (innerWidth <= 1000) setView('code'); }
  });
  $('#tree').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('node')) e.target.click(); });

  let ctx = null;
  function nodeMenu(anchor, path, isDir) {
    if (ctx) ctx.remove();
    ctx = document.createElement('div'); ctx.className = 'menu'; ctx.style.position = 'fixed';
    const r = anchor.getBoundingClientRect();
    ctx.style.left = Math.min(r.right - 20, innerWidth - 250) + 'px'; ctx.style.top = Math.min(r.bottom, innerHeight - 220) + 'px';
    const isTex = /\.tex$/i.test(path), isImg = IMG_EXT.test(path) || /\.(pdf|eps)$/i.test(path);
    ctx.innerHTML = [
      !isDir && isTex && path !== P.main ? '<button data-n="main">Usar como archivo principal</button>' : '',
      !isDir && isImg ? '<button data-n="fig">Insertar como figura</button>' : '',
      isDir ? '<button data-n="newfile">Archivo nuevo aquí</button><button data-n="upload">Añadir archivos aquí</button>' : '',
      !isDir ? '<button data-n="rename">Cambiar nombre…</button>' : '',
      '<button data-n="copy">Copiar ruta</button>',
      `<hr><button data-n="delete" style="color:var(--danger)">Eliminar${isDir ? ' carpeta' : ''}…</button>`
    ].join('');
    document.body.appendChild(ctx);
    const close = () => { if (ctx) { ctx.remove(); ctx = null; } document.removeEventListener('click', close, true); };
    setTimeout(() => document.addEventListener('click', close, true), 0);
    ctx.addEventListener('click', async e => {
      const b = e.target.closest('[data-n]'); if (!b) return; close();
      const n = b.dataset.n;
      if (n === 'main') setMain(path);
      else if (n === 'fig') insertFigure(path);
      else if (n === 'newfile') { selectedDir = path; newFile(); }
      else if (n === 'upload') { selectedDir = path; $('#texUpload').click(); }
      else if (n === 'rename') renamePath(path);
      else if (n === 'copy') { try { await navigator.clipboard.writeText(path); toast('Ruta copiada: ' + path); } catch (er) { toast(path); } }
      else if (n === 'delete') deletePath(path, isDir);
    });
  }

  async function newFile() {
    if (!P || !P.root) { toast('Abre una carpeta de proyecto para crear archivos.'); return; }
    const r = await dialog({ title: 'Archivo nuevo', fields: [{ id: 'name', label: selectedDir ? `Nombre (en ${selectedDir}/)` : 'Nombre', value: 'seccion.tex', hint: 'Por ejemplo: introduccion.tex, referencias.bib' }], ok: 'Crear' });
    if (!r || !r.name.trim()) return;
    const path = normPath(joinPath(selectedDir, r.name.trim()));
    if (P.files.has(path)) { toast('Ya existe un archivo con ese nombre.'); return; }
    try {
      const content = /\.tex$/i.test(path) && path !== P.main ? `% ${basename(path)}\n% Inclúyelo en ${P.main || 'main.tex'} con \\input{${path.replace(/\.tex$/i, '')}}\n\n` : '';
      await writeFile(path, content); expanded.add(dirname(path)); renderTree(); renderHeader(); openPath(path);
    } catch (e) { toast('No se pudo crear: ' + e.message); }
  }
  async function newFolder() {
    if (!P || !P.root) { toast('Abre una carpeta de proyecto para crear carpetas.'); return; }
    const r = await dialog({ title: 'Carpeta nueva', fields: [{ id: 'name', label: selectedDir ? `Nombre (en ${selectedDir}/)` : 'Nombre', value: 'secciones' }], ok: 'Crear' });
    if (!r || !r.name.trim()) return;
    const path = normPath(joinPath(selectedDir, safeName(r.name.trim())));
    try { await dirHandleFor(path, true); P.dirs.add(path); expanded.add(path); selectedDir = path; renderTree(); } catch (e) { toast('No se pudo crear: ' + e.message); }
  }
  async function renamePath(path) {
    const r = await dialog({ title: 'Cambiar nombre', fields: [{ id: 'name', label: 'Nombre nuevo', value: basename(path) }], ok: 'Cambiar' });
    if (!r || !r.name.trim() || r.name.trim() === basename(path)) return;
    const to = joinPath(dirname(path), r.name.trim());
    if (P.files.has(to)) { toast('Ya existe un archivo con ese nombre.'); return; }
    try {
      if (isDirty(path)) await saveFile(path);
      const h = P.files.get(path).handle;
      if (typeof h.move === 'function') { await h.move(r.name.trim()); P.files.delete(path); P.files.set(to, { handle: h }); }
      else { await writeFile(to, await h.getFile()); const dir = await dirHandleFor(dirname(path)); await dir.removeEntry(basename(path)); P.files.delete(path); }
      const b = buffers.get(path); if (b) { buffers.delete(path); buffers.set(to, b); }
      if (P.open === path) P.open = to;
      if (P.main === path) setMain(to);
      renderTree(); renderHeader(); updateFileHead(); toast(`Renombrado a ${basename(to)}`);
    } catch (e) { toast('No se pudo cambiar el nombre: ' + e.message); }
  }
  async function deletePath(path, isDir) {
    if (!(await ask(isDir ? `¿Eliminar la carpeta “${path}” y todo su contenido? No se puede deshacer.` : `¿Eliminar “${path}”? No se puede deshacer.`, 'Eliminar', true))) return;
    try {
      const dir = await dirHandleFor(dirname(path));
      await dir.removeEntry(basename(path), { recursive: !!isDir });
      for (const k of [...P.files.keys()]) if (k === path || k.startsWith(path + '/')) { P.files.delete(k); buffers.delete(k); }
      for (const d of [...P.dirs]) if (d === path || d.startsWith(path + '/')) P.dirs.delete(d);
      if (P.open && !P.files.has(P.open)) { P.open = null; P.main && P.files.has(P.main) ? openPath(P.main) : showEmptyEditor(); }
      if (P.main && !P.files.has(P.main)) { P.main = await detectMain(P.files); renderHeader(); }
      renderTree(); toast('Eliminado.');
    } catch (e) { toast('No se pudo eliminar: ' + e.message); }
  }
  async function refresh() {
    if (!P || !P.root) return;
    if (anyDirty()) await saveAll();
    try {
      const { files, dirs } = await scanDir(P.root);
      P.files = files; P.dirs = dirs;
      for (const k of [...buffers.keys()]) if (!files.has(k)) buffers.delete(k);
      renderTree(); renderHeader(); toast('Carpeta actualizada.');
    } catch (e) { toast(e.message); }
  }
  $('#newFileBtn').addEventListener('click', newFile);
  $('#newFolderBtn').addEventListener('click', newFolder);
  $('#refreshBtn').addEventListener('click', refresh);
  $('#uploadBtn').addEventListener('click', () => { if (!P || !P.root) { toast('Abre una carpeta de proyecto primero.'); return; } $('#texUpload').click(); });
  $('#texUpload').addEventListener('change', async e => { const fs = [...e.target.files]; e.target.value = ''; await addFiles(fs, selectedDir); });
  async function addFiles(files, dir) {
    if (!P || !P.root) { toast('Abre una carpeta de proyecto para añadir archivos.'); return; }
    let n = 0;
    for (const f of files) {
      if (f.size > MAX_FILE) { toast(`${f.name} pesa más de 50 MB y no se añadió.`); continue; }
      const path = await uniquePath(dir, safeName(f.name)); await writeFile(path, f); n++;
    }
    if (dir) expanded.add(dir);
    renderTree(); renderHeader(); if (n) toast(`${n} archivo${n > 1 ? 's' : ''} añadido${n > 1 ? 's' : ''}${dir ? ' a ' + dir + '/' : ''}.`);
  }

  /* ================= editor ================= */
  function initEditor() {
    cm = CodeMirror($('#cm'), {
      mode: 'stex', lineNumbers: true, lineWrapping: true, matchBrackets: true, autoCloseBrackets: '{}[]()', styleActiveLine: true,
      indentUnit: 2, tabSize: 2, indentWithTabs: false, spellcheck: true, inputStyle: 'contenteditable', readOnly: 'nocursor',
      extraKeys: {
        'Ctrl-Enter': () => compile('key'), 'Cmd-Enter': () => compile('key'),
        'Ctrl-S': () => saveAndCompile(), 'Cmd-S': () => saveAndCompile(),
        'Ctrl-B': () => wrapCmd('textbf'), 'Cmd-B': () => wrapCmd('textbf'),
        'Ctrl-I': () => wrapCmd('textit'), 'Cmd-I': () => wrapCmd('textit'),
        'Ctrl-Space': c => c.showHint({ hint: latexHint, completeSingle: false }),
        'Ctrl-/': c => toggleComment(c), 'Cmd-/': c => toggleComment(c),
        'Tab': c => c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('  '),
        'Shift-Tab': c => c.indentSelection('subtract'),
        'Ctrl-G': 'jumpToLine'
      }
    });
    cm.on('changes', () => { if (!P || !P.open) return; updateFileHead(); renderTreeSoon(); renderOutlineSoon(); autoSave(); });
    cm.on('cursorActivity', () => { const c = cm.getCursor(); $('#texPos').textContent = P && P.open ? `Ln ${c.line + 1}, Col ${c.ch + 1}` : ''; outlineActive(); });
    cm.on('inputRead', (c, ch) => {
      if (!ch.text || ch.text.length !== 1) return;
      const t = ch.text[0];
      const line = c.getLine(c.getCursor().line).slice(0, c.getCursor().ch);
      if (/^[A-Za-z]$/.test(t) && /\\[A-Za-z]{2,}$/.test(line)) c.showHint({ hint: latexHint, completeSingle: false });
      else if (t === '{' && /\\(ref|eqref|autoref|cref|Cref|pageref|cite[a-zA-Z]*|includegraphics(\[[^\]]*\])?|input|include|begin)\{$/.test(line)) c.showHint({ hint: latexHint, completeSingle: false });
      else if (t === ',' && /\\cite[a-zA-Z]*(\[[^\]]*\])*\{[^}]*$/.test(line)) c.showHint({ hint: latexHint, completeSingle: false });
    });
    cm.on('paste', (c, e) => {
      const items = [...(e.clipboardData && e.clipboardData.items || [])].filter(i => i.kind === 'file' && /^image\//.test(i.type));
      if (!items.length) return;
      e.preventDefault();
      items.forEach(i => { const f = i.getAsFile(); if (f) addImage(f, null); });
    });
  }
  function toggleComment(c) {
    const from = c.getCursor('from').line, to = c.getCursor('to').line;
    const lines = []; for (let l = from; l <= to; l++) lines.push(c.getLine(l));
    const all = lines.filter(l => l.trim()).every(l => /^\s*%/.test(l));
    c.operation(() => { for (let l = from; l <= to; l++) { const t = c.getLine(l); if (all) { const m = t.match(/^(\s*)% ?/); if (m) c.replaceRange(m[1], { line: l, ch: 0 }, { line: l, ch: m[0].length }); } else if (t.trim()) c.replaceRange('% ', { line: l, ch: t.match(/^\s*/)[0].length }); } });
  }
  function showEmptyEditor() {
    if (!cm) return;
    cm.swapDoc(CodeMirror.Doc('% Sin proyecto abierto.\n% Elige uno en Inicio o desde el menú del proyecto (arriba a la izquierda).\n', 'stex'));
    cm.setOption('readOnly', 'nocursor');
    $('#imgPrev').hidden = true; updateFileHead(); renderOutline();
  }
  let imgUrl = null;
  async function openPath(path, line) {
    if (!P || !P.files.has(path)) return;
    if (imgUrl) { URL.revokeObjectURL(imgUrl); imgUrl = null; }
    const prev = $('#imgPrev');
    if (IMG_EXT.test(path) || /\.pdf$/i.test(path)) {
      const file = await P.files.get(path).handle.getFile();
      P.open = path; renderTree(); updateFileHead(); renderOutline();
      prev.hidden = false;
      if (/\.pdf$/i.test(path)) prev.innerHTML = `<figure><p style="color:var(--ink-2)">PDF de ${fmtBytes(file.size)}. Puedes incluirlo como figura con \\includegraphics.</p><button class="btn" id="figIns">Insertar como figura</button></figure>`;
      else { imgUrl = URL.createObjectURL(file); prev.innerHTML = `<figure><img src="${imgUrl}" alt="${esc(basename(path))}"><figcaption>${esc(path)} · ${fmtBytes(file.size)}</figcaption><button class="btn" id="figIns">Insertar como figura</button></figure>`; }
      $('#figIns').onclick = () => insertFigure(path);
      return;
    }
    prev.hidden = true;
    if (!TEXT_EXT.test(path)) { toast(`Folio no edita archivos ${path.split('.').pop()}.`); return; }
    let b = buffers.get(path);
    if (!b) {
      const file = await P.files.get(path).handle.getFile();
      if (file.size > 5e6) { toast('El archivo es demasiado grande para editarlo aquí (más de 5 MB).'); return; }
      const text = await file.text();
      const doc = CodeMirror.Doc(text, /\.(tex|ltx|sty|cls|bib|bst|clo|def|cfg|fd|tikz|pgf|ldf)$/i.test(path) ? 'stex' : 'text/plain');
      b = { doc, gen: doc.changeGeneration() };
      buffers.set(path, b);
    }
    P.open = path;
    cm.swapDoc(b.doc); cm.setOption('readOnly', false);
    applyLineMarks();
    if (line) { cm.setCursor({ line: line - 1, ch: 0 }); cm.scrollIntoView({ line: line - 1, ch: 0 }, 120); }
    renderTree(); updateFileHead(); renderOutline();
    setTimeout(() => { cm.refresh(); if (!line) cm.focus(); }, 0);
  }
  function updateFileHead() {
    const el = $('#fileHead');
    if (!P || !P.open) { el.innerHTML = `<span class="path">${P ? 'Selecciona un archivo' : 'Sin proyecto'}</span>`; $('#texSave').textContent = ''; return; }
    const d = isDirty(P.open);
    el.innerHTML = `<span class="path">${esc(P.open)}</span>${P.open === P.main ? '<span class="tag">principal</span>' : ''}<span class="saved ${d ? 'st-warn' : 'st-ok'}">${d ? '● Sin guardar' : '✓ Guardado'}</span>`;
    $('#texSave').textContent = anyDirty() ? 'Cambios sin guardar' : 'Todo guardado';
    $('#texSave').className = anyDirty() ? 'st-warn' : 'st-ok';
  }

  /* ================= outline (sections of the open file, plus its \input files) ================= */
  const SEC_LEVEL = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5 };
  const SEC_RE = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*(?:\[[^\]]*\])?\s*\{/g;
  const INPUT_RE = /\\(?:input|include|subfile)\s*\{([^}]+)\}/g;
  let outlineItems = [];
  const stripComment = l => { const m = l.match(/(^|[^\\])%/); return m ? l.slice(0, m.index + m[1].length) : l; };
  function bracedArg(text, from) {
    let depth = 1, i = from;
    for (; i < text.length && depth; i++) { if (text[i] === '\\') { i++; continue; } if (text[i] === '{') depth++; else if (text[i] === '}') depth--; }
    return depth ? null : text.slice(from, i - 1);
  }
  const plainTitle = t => t.replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?\{([^{}]*)\}/g, '$2').replace(/\\[a-zA-Z]+\*?/g, '').replace(/[{}$]/g, '').replace(/~/g, ' ').replace(/\s+/g, ' ').trim();
  function resolveInput(arg) {
    const rel = arg.trim(); const base = dirname(P.main || '');
    const cands = [rel, rel + '.tex', joinPath(base, rel), joinPath(base, rel + '.tex')].map(normPath);
    return cands.find(c => P.files.has(c)) || null;
  }
  function renderOutline() {
    const el = $('#outline'); outlineItems = [];
    if (!P || !P.open || !cm || !/\.(tex|ltx)$/i.test(P.open)) { el.innerHTML = `<p class="log-empty">${P ? 'Abre un archivo .tex para ver sus secciones.' : 'Sin proyecto.'}</p>`; return; }
    const lines = cm.getValue().split('\n');
    lines.forEach((raw, line) => {
      const l = stripComment(raw); if (!l.includes('\\')) return;
      for (const m of l.matchAll(SEC_RE)) {
        const t = bracedArg(l, m.index + m[0].length);
        outlineItems.push({ kind: 'sec', level: SEC_LEVEL[m[1]], title: plainTitle(t == null ? l.slice(m.index + m[0].length) : t) || '(sin título)', line });
      }
      for (const m of l.matchAll(INPUT_RE)) {
        const path = resolveInput(m[1]);
        if (path) outlineItems.push({ kind: 'file', title: path, path, line });
      }
    });
    if (!outlineItems.length) { el.innerHTML = '<p class="log-empty">Este archivo no tiene secciones. Usa \\section{…} para crearlas.</p>'; return; }
    const top = Math.min(...outlineItems.filter(i => i.kind === 'sec').map(i => i.level), 2);
    el.innerHTML = '<ol>' + outlineItems.map((it, i) => it.kind === 'file'
      ? `<li><button class="ol-item file lv${Math.max(2, top + 1)}" data-i="${i}" title="Abrir ${esc(it.path)}">${iconFor(it.path)}<span class="t">${esc(basename(it.path))}</span></button></li>`
      : `<li><button class="ol-item lv${Math.min(5, it.level - top + 2)}" data-i="${i}" title="${esc(it.title)} · línea ${it.line + 1}"><span class="t">${esc(it.title)}</span><span class="k">${it.line + 1}</span></button></li>`).join('') + '</ol>';
    outlineActive();
  }
  const renderOutlineSoon = debounce(renderOutline, 300);
  function outlineActive() {
    if (!cm || !outlineItems.length) return;
    const cur = cm.getCursor().line; let on = -1;
    outlineItems.forEach((it, i) => { if (it.kind === 'sec' && it.line <= cur) on = i; });
    $('#outline').querySelectorAll('.ol-item').forEach(b => b.classList.toggle('on', +b.dataset.i === on));
  }
  $('#outline').addEventListener('click', e => {
    const b = e.target.closest('.ol-item'); if (!b) return;
    const it = outlineItems[+b.dataset.i]; if (!it) return;
    if (it.kind === 'file') { openPath(it.path); return; }
    if (innerWidth <= 1000) setView('code');
    cm.setCursor({ line: it.line, ch: 0 });
    cm.scrollTo(null, Math.max(0, cm.heightAtLine(it.line, 'local') - 24));
    cm.focus();
  });

  /* sidebar sections collapse independently */
  const secState = store.get('folio.tex.sections') || {};
  document.querySelectorAll('.side-t').forEach(b => {
    const sec = b.closest('.side-sec');
    const apply = open => { sec.classList.toggle('collapsed', !open); b.setAttribute('aria-expanded', String(open)); };
    apply(secState[b.dataset.sec] !== false);
    b.addEventListener('click', () => { const open = b.getAttribute('aria-expanded') !== 'true'; apply(open); secState[b.dataset.sec] = open; store.set('folio.tex.sections', secState); });
  });

  /* ---------- save ---------- */
  async function saveFile(path) {
    const b = buffers.get(path); if (!b || b.doc.isClean(b.gen)) return false;
    const gen = b.doc.changeGeneration();
    await writeFile(path, b.doc.getValue());
    b.gen = gen;
    return true;
  }
  let saving = null;
  async function saveAll() {
    if (!P) return 0;
    if (saving) await saving;
    saving = (async () => {
      let n = 0;
      for (const path of [...buffers.keys()]) {
        try { if (await saveFile(path)) n++; }
        catch (e) {
          if (e.name === 'NotAllowedError') toast('Folio no tiene permiso para guardar. Vuelve a abrir la carpeta desde el menú del proyecto.');
          else toast(`No se pudo guardar ${path}: ${e.message}`);
          throw e;
        }
      }
      return n;
    })();
    try { return await saving; } finally { saving = null; updateFileHead(); renderTreeSoon(); }
  }
  const autoSave = debounce(async () => {
    if (!P || !anyDirty()) return;
    try { await saveAll(); } catch (e) { return; }
    if ($('#autoCompile').checked) compile('auto');
  }, 1600);
  async function saveAndCompile() {
    autoSave.cancel();
    try { const n = await saveAll(); if (n) toast(n === 1 ? 'Guardado.' : `${n} archivos guardados.`, 1200); } catch (e) { return; }
    compile('save');
  }

  /* ---------- insert helpers ---------- */
  const preambleText = () => { const b = P && P.main && buffers.get(P.main); return b ? b.doc.getValue().split('\\begin{document}')[0] : ''; };
  const hasPkg = name => new RegExp('\\\\usepackage(\\[[^\\]]*\\])?\\{[^}]*\\b' + name + '\\b[^}]*\\}').test(preambleText());
  function editable() { if (!P || !P.open || !cm || cm.getOption('readOnly')) { toast('Abre un archivo .tex para insertar.'); return false; } return true; }
  function wrapCmd(name) {
    if (!editable()) return;
    const sel = cm.getSelection();
    if (sel) cm.replaceSelection(`\\${name}{${sel}}`);
    else { cm.replaceSelection(`\\${name}{}`); const c = cm.getCursor(); cm.setCursor({ line: c.line, ch: c.ch - 1 }); }
    cm.focus();
  }
  function insertBlock(text, selectToken) {
    if (!editable()) return;
    const c = cm.getCursor(); const line = cm.getLine(c.line);
    const pre = line.trim() ? '\n' : '';
    const indent = (line.match(/^\s*/) || [''])[0];
    const body = text.split('\n').map((l, i) => (i ? indent : '') + l).join('\n');
    const at = line.trim() ? { line: c.line, ch: line.length } : { line: c.line, ch: 0 };
    const startIdx = cm.indexFromPos(at) + pre.length;
    cm.replaceRange(pre + (line.trim() ? indent : '') + body + '\n', at, line.trim() ? undefined : { line: c.line, ch: line.length });
    if (selectToken) {
      const full = cm.getValue(); const i = full.indexOf(selectToken, startIdx);
      if (i >= 0) cm.setSelection(cm.posFromIndex(i), cm.posFromIndex(i + selectToken.length));
    }
    cm.focus();
  }
  // never drop a figure inside another float, table, equation or code block: move below its \end
  function outsideBlocks(pos) {
    const doc = cm.getDoc(), text = doc.getValue(), idx = doc.indexFromPos(pos);
    const re = /\\(begin|end)\{(figure\*?|table\*?|tabular[x*]?|equation\*?|align\*?|gather\*?|lstlisting|verbatim|minipage|subfigure|itemize|enumerate)\}/g;
    const stack = []; let m;
    while ((m = re.exec(text)) && m.index < idx) { if (m[1] === 'begin') stack.push(m[2]); else { const i = stack.lastIndexOf(m[2]); if (i >= 0) stack.splice(i); } }
    if (!stack.length) return pos;
    const outer = stack[0]; let depth = 0; re.lastIndex = idx;
    while ((m = re.exec(text))) {
      if (m[2] !== outer) continue;
      if (m[1] === 'begin') depth++; else if (depth-- === 0) { const end = doc.posFromIndex(m.index + m[0].length); return { line: end.line, ch: doc.getLine(end.line).length }; }
    }
    return pos;
  }
  function figureSnippet(path) {
    const rel = relFrom(dirname(P.main || ''), path).replace(/\.(png|jpe?g|pdf|eps)$/i, m => m);
    const label = 'fig:' + safeName(basename(path).replace(/\.[^.]+$/, '')).toLowerCase();
    return `\\begin{figure}[${hasPkg('float') ? 'H' : 'htbp'}]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${rel}}\n  \\caption{Descripción de la figura.}\n  \\label{${label}}\n\\end{figure}`;
  }
  function insertFigure(path, pos) {
    if (!P) return;
    if (!P.open || !buffers.has(P.open) || !/\.tex$/i.test(P.open)) { if (P.main) { openPath(P.main).then(() => insertFigure(path, pos)); } return; }
    $('#imgPrev').hidden = true;
    cm.setCursor(outsideBlocks(pos || cm.getCursor()));
    insertBlock(figureSnippet(path), 'Descripción de la figura.');
  }
  async function addImage(file, pos) {
    if (!P || !P.root) { toast('Para guardar imágenes, abre la carpeta del proyecto (menú del proyecto).'); return; }
    if (!/^image\/(png|jpeg)$|^application\/pdf$/.test(file.type) && !/\.(png|jpe?g|pdf)$/i.test(file.name || '')) {
      toast('pdfLaTeX acepta imágenes PNG, JPG o PDF. Convierte la imagen a uno de esos formatos.'); return;
    }
    if (file.size > MAX_FILE) { toast('La imagen pesa más de 50 MB.'); return; }
    const ext = (file.type === 'image/jpeg' ? '.jpg' : file.type === 'application/pdf' ? '.pdf' : '.png');
    let name = file.name && !/^image\.(png|jpe?g)$/i.test(file.name) ? safeName(file.name) : `imagen-${stamp()}${ext}`;
    if (!/\.(png|jpe?g|pdf)$/i.test(name)) name += ext;
    const dir = normPath(joinPath(dirname(P.main || ''), 'figuras'));
    try {
      const path = await uniquePath(dir, name);
      await writeFile(path, file);
      expanded.add(dir); renderTree();
      insertFigure(path, pos);
      toast(`Imagen guardada en ${path}`);
    } catch (e) { toast('No se pudo guardar la imagen: ' + e.message); }
  }
  $('#imgInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) addImage(f, null); });

  function insertTexTable(cols, rows) {
    const bt = hasPkg('booktabs');
    const head = Array.from({ length: cols }, (_, i) => `Columna ${i + 1}`).join(' & ') + ' \\\\';
    const row = Array(cols).fill('   ').join(' & ') + ' \\\\';
    const body = Array(rows).fill(row);
    const spec = 'l'.repeat(cols);
    const lines = [`\\begin{table}[${hasPkg('float') ? 'H' : 'htbp'}]`, '  \\centering', '  \\caption{Título de la tabla.}', '  \\label{tab:nueva}', `  \\begin{tabular}{${spec}}`,
      bt ? '    \\toprule' : '    \\hline', '    ' + head, bt ? '    \\midrule' : '    \\hline', ...body.map(r => '    ' + r), bt ? '    \\bottomrule' : '    \\hline', '  \\end{tabular}', '\\end{table}'];
    insertBlock(lines.join('\n'), 'Título de la tabla.');
  }
  const INS = {
    section: () => insertHeading('section'), subsection: () => insertHeading('subsection'),
    bold: () => wrapCmd('textbf'), italic: () => wrapCmd('textit'),
    itemize: () => insertBlock('\\begin{itemize}\n  \\item Primer elemento\n  \\item \n\\end{itemize}', 'Primer elemento'),
    enumerate: () => insertBlock('\\begin{enumerate}\n  \\item Primer paso\n  \\item \n\\end{enumerate}', 'Primer paso'),
    equation: () => insertBlock('\\begin{equation}\n  y = mx + b\n  \\label{eq:nueva}\n\\end{equation}', 'y = mx + b'),
    figure: () => { if (!P || !P.root) { toast('Abre la carpeta del proyecto para añadir imágenes.'); return; } $('#imgInput').click(); },
    table: () => { if (editable()) UI.pickTable($('#texTableBtn'), insertTexTable); },
    code: () => insertBlock(hasPkg('listings') ? '\\begin{lstlisting}[language=Python]\nprint("Hola")\n\\end{lstlisting}' : '\\begin{verbatim}\nprint("Hola")\n\\end{verbatim}', 'print("Hola")'),
    ref: () => { if (!editable()) return; cm.replaceSelection('\\ref{}'); const c = cm.getCursor(); cm.setCursor({ line: c.line, ch: c.ch - 1 }); cm.focus(); cm.showHint({ hint: latexHint, completeSingle: false }); }
  };
  function insertHeading(cmd) {
    if (!editable()) return;
    const sel = cm.getSelection();
    if (sel && !sel.includes('\n')) { cm.replaceSelection(`\\${cmd}{${sel}}`); return; }
    insertBlock(`\\${cmd}{Título}`, 'Título');
  }
  $('#insBar').addEventListener('mousedown', e => { if (e.target.closest('.tb')) e.preventDefault(); });
  $('#insBar').addEventListener('click', e => { const b = e.target.closest('[data-ins]'); if (b) INS[b.dataset.ins](); });

  /* ---------- autocomplete ---------- */
  const COMMANDS = ['section{}', 'subsection{}', 'subsubsection{}', 'paragraph{}', 'textbf{}', 'textit{}', 'emph{}', 'underline{}', 'texttt{}', 'textsc{}',
    'cite{}', 'ref{}', 'eqref{}', 'label{}', 'caption{}', 'includegraphics[width=0.8\\linewidth]{}', 'input{}', 'include{}', 'usepackage{}', 'begin{}', 'end{}',
    'item', 'centering', 'newpage', 'clearpage', 'tableofcontents', 'listoffigures', 'listoftables', 'maketitle', 'title{}', 'author{}', 'date{}', 'footnote{}',
    'url{}', 'href{}{}', 'frac{}{}', 'dfrac{}{}', 'sqrt{}', 'sum', 'prod', 'int', 'oint', 'lim', 'infty', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon',
    'zeta', 'eta', 'theta', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda',
    'Sigma', 'Phi', 'Psi', 'Omega', 'partial', 'nabla', 'cdot', 'times', 'pm', 'leq', 'geq', 'neq', 'approx', 'equiv', 'propto', 'rightarrow', 'Rightarrow',
    'leftarrow', 'Leftrightarrow', 'mathbf{}', 'mathrm{}', 'mathbb{}', 'mathcal{}', 'boldsymbol{}', 'left(', 'right)', 'quad', 'qquad', 'text{}', 'hline',
    'toprule', 'midrule', 'bottomrule', 'multicolumn{}{}{}', 'multirow{}{}{}', 'vspace{}', 'hspace{}', 'noindent', 'justifying', 'raggedright', 'lstinputlisting{}',
    'linewidth', 'textwidth', 'today', 'bibliography{}', 'bibliographystyle{}', 'appendix', 'small', 'footnotesize', 'large', 'Large', 'textcolor{}{}', 'si{}', 'SI{}{}'];
  const ENVS = ['figure', 'table', 'tabular', 'tabularx', 'equation', 'equation*', 'align', 'align*', 'gather', 'cases', 'itemize', 'enumerate', 'description', 'center',
    'minipage', 'subfigure', 'lstlisting', 'abstract', 'verbatim', 'quote', 'matrix', 'pmatrix', 'bmatrix', 'thebibliography'];
  let labelIndex = [], citeIndex = [];
  function indexProject(files) {
    const labels = new Set(), cites = new Set();
    for (const f of files) {
      if (typeof f.contents !== 'string') continue;
      if (/\.tex$/i.test(f.path)) for (const m of f.contents.matchAll(/\\label\{([^}]+)\}/g)) labels.add(m[1]);
      if (/\.bib$/i.test(f.path)) for (const m of f.contents.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)) cites.add(m[1]);
    }
    labelIndex = [...labels].sort(); citeIndex = [...cites].sort();
  }
  function latexHint(c) {
    const cur = c.getCursor(), line = c.getLine(cur.line).slice(0, cur.ch);
    let m, list = [], from;
    const docLabels = () => { const s = new Set(labelIndex); for (const [, b] of buffers) for (const mm of b.doc.getValue().matchAll(/\\label\{([^}]+)\}/g)) s.add(mm[1]); return [...s].sort(); };
    if ((m = /\\(?:ref|eqref|autoref|cref|Cref|pageref)\{([^}]*)$/.exec(line))) { from = cur.ch - m[1].length; list = docLabels().filter(l => l.toLowerCase().includes(m[1].toLowerCase())).map(l => ({ text: l, displayText: l })); }
    else if ((m = /\\cite[a-zA-Z]*(?:\[[^\]]*\])*\{(?:[^}]*,\s*)?([^},]*)$/.exec(line))) { from = cur.ch - m[1].length; list = citeIndex.filter(k => k.toLowerCase().includes(m[1].toLowerCase())).map(k => ({ text: k })); }
    else if ((m = /\\includegraphics(?:\[[^\]]*\])?\{([^}]*)$/.exec(line))) { from = cur.ch - m[1].length; const base = dirname(P?.main || ''); list = [...(P ? P.files.keys() : [])].filter(p => /\.(png|jpe?g|pdf|eps)$/i.test(p)).map(p => relFrom(base, p)).filter(p => p.toLowerCase().includes(m[1].toLowerCase())).map(p => ({ text: p })); }
    else if ((m = /\\(?:input|include)\{([^}]*)$/.exec(line))) { from = cur.ch - m[1].length; const base = dirname(P?.main || ''); list = [...(P ? P.files.keys() : [])].filter(p => /\.tex$/i.test(p) && p !== P.main).map(p => relFrom(base, p).replace(/\.tex$/i, '')).filter(p => p.includes(m[1])).map(p => ({ text: p })); }
    else if ((m = /\\begin\{([A-Za-z*]*)$/.exec(line))) {
      from = cur.ch - m[1].length;
      list = ENVS.filter(e => e.startsWith(m[1])).map(e => ({ text: e, hint: (cm2, data, comp) => { const indent = cm2.getLine(data.from.line).match(/^\s*/)[0]; cm2.replaceRange(`${e}}\n${indent}  \n${indent}\\end{${e}}`, data.from, { line: data.to.line, ch: cm2.getLine(data.to.line).indexOf('}', data.to.ch) === data.to.ch ? data.to.ch + 1 : data.to.ch }); cm2.setCursor({ line: data.from.line + 1, ch: indent.length + 2 }); } }));
    }
    else if ((m = /\\([A-Za-z]*)$/.exec(line))) {
      from = cur.ch - m[1].length;
      list = COMMANDS.filter(k => k.startsWith(m[1]) && k !== m[1]).slice(0, 40).map(k => ({
        text: k, displayText: '\\' + k.replace('{}{}{}', '{…}{…}{…}').replace('{}{}', '{…}{…}').replace('{}', '{…}'),
        hint: (cm2, data) => { cm2.replaceRange(k, data.from, data.to); const i = k.indexOf('{}'); if (i >= 0) cm2.setCursor({ line: data.from.line, ch: data.from.ch + i + 1 }); }
      }));
    }
    if (!list.length) return null;
    return { list, from: CodeMirror.Pos(cur.line, from), to: CodeMirror.Pos(cur.line, cur.ch) };
  }

  /* ================= compile ================= */
  let compiling = false, lastReason = '';
  async function collectFiles() {
    const files = [];
    const outPdf = P.main ? P.main.replace(/\.tex$/i, '.pdf') : '';
    for (const [path, f] of P.files) {
      if (!COMPILE_EXT.test(path) || path === outPdf) continue;
      const b = buffers.get(path);
      if (b) { files.push({ path, contents: b.doc.getValue() }); continue; }
      try {
        const file = await f.handle.getFile();
        if (file.size > MAX_FILE) continue;
        if (/\.(tex|bib|sty|cls)$/i.test(path) && file.size < 3e6) files.push({ path, contents: await file.text() });
        else files.push({ path, contents: new Uint8Array(await file.arrayBuffer()) });
      } catch (e) { }
    }
    return files;
  }
  async function compile(reason) {
    if (!P) { toast('Abre un proyecto primero.'); return; }
    if (!P.main) { toast('El proyecto no tiene un archivo .tex principal.'); return; }
    lastReason = reason;
    autoSave.cancel();
    try { if (anyDirty()) await saveAll(); } catch (e) { /* keep compiling from the buffer */ }
    const proj = P;
    const files = await collectFiles();
    indexProject(files);
    setCompiling(true);
    let res;
    try { res = await FolioTex.compile({ files, main: P.main }); }
    catch (e) { setCompiling(false); if (proj !== P) return; problems = [{ sev: 'error', msg: 'No se pudo compilar', detail: e.message }]; showProblems(true); markStale(true); return; }
    if (res.superseded) return;
    setCompiling(false);
    if (proj !== P) return;
    problems = parseLog(res.log);
    if (!res.ok && !problems.some(p => p.sev === 'error')) problems.unshift({ sev: 'error', msg: 'La compilación no generó PDF', detail: 'Revisa el registro completo.' });
    rawLog = res.log;
    if (res.ok) { lastPdf = res.pdf; setSynctex(res.synctex); }
    showProblems(!res.ok && (reason === 'key' || reason === 'button' || reason === 'save'));
    if (res.ok) { await showPdf(res.pdf); markStale(false); }
    else markStale(true);
  }
  function setCompiling(on) {
    compiling = on;
    const b = $('#compileBtn');
    b.querySelector('svg, .spin').outerHTML = on ? '<span class="spin" aria-hidden="true"></span>' : '<svg viewBox="0 0 16 16" fill="currentColor" id="compileIco"><path d="M4.5 2.8v10.4L13 8z"/></svg>';
    b.querySelector('span:last-child').textContent = on ? 'Compilando' : 'Compilar';
    $('.pdf-pane').classList.toggle('compiling', on);
  }
  $('#compileBtn').addEventListener('click', () => compile('button'));
  $('#autoCompile').addEventListener('change', e => store.set('folio.tex.auto', e.target.checked));

  /* ---------- log parsing ---------- */
  let rawLog = '';
  function translate(msg, ctx) {
    let m;
    if (/^Undefined control sequence/.test(msg)) { const cmd = (ctx.match(/(\\[A-Za-z@]+)\s*$/) || [])[1]; return ['Comando no definido' + (cmd ? `: ${cmd}` : ''), 'Revisa si está mal escrito o si falta el \\usepackage que lo define.']; }
    if ((m = /^LaTeX Error: File `([^']+)' not found/.exec(msg))) {
      const f = m[1];
      if (/\.cls$/.test(f)) return [`No se encontró la clase de documento «${f.replace(/\.cls$/, '')}»`, `Revisa el nombre. Si es correcto, es una clase que Folio no incluye (muchas plantillas de revistas y congresos): copia el archivo ${f} de la plantilla, o descárgalo de CTAN, a la carpeta del proyecto junto al archivo principal.`];
      if (/\.sty$/.test(f)) return [`No se encontró el paquete «${f.replace(/\.sty$/, '')}»`, `Revisa el nombre. Si es correcto, puede que Folio no lo incluya o que no haya conexión para descargarlo: también puedes copiar ${f} a la carpeta del proyecto.`];
      return [`No se encontró el archivo «${f}»`, 'Revisa la ruta y el nombre (mayúsculas incluidas) relativos al archivo principal.'];
    }
    if ((m = /^Package pdftex.def Error: File `([^']+)' not found/.exec(msg))) return [`No se encontró la imagen «${m[1]}»`, 'Revisa la ruta relativa al archivo principal y la extensión.'];
    if ((m = /^LaTeX Error: Environment (\S+) undefined/.exec(msg))) return [`Entorno «${m[1]}» no definido`, 'Puede faltar un paquete o el nombre está mal escrito.'];
    if ((m = /^LaTeX Error: \\begin\{([^}]+)\} on input line (\d+) ended by \\end\{([^}]+)\}/.exec(msg))) return [`\\begin{${m[1]}} (línea ${m[2]}) se cerró con \\end{${m[3]}}`, 'Los entornos deben cerrarse en el mismo orden en que se abren.'];
    if (/^LaTeX Error: Invalid UTF-8 byte sequence/.test(msg) || /^Package inputenc Error: Unicode character/.test(msg)) return ['Carácter no admitido en este punto', /lstlisting|listings/.test(preambleText()) ? 'Si está dentro de un bloque de código (listings), añade el carácter a la opción literate de \\lstset, como en la plantilla de Folio.' : 'Revisa acentos o símbolos especiales en esa línea.'];
    if (/^Missing \$ inserted/.test(msg)) return ['Falta un $', 'Hay un símbolo matemático (como _ o ^) fuera del modo matemático, o un $ sin cerrar.'];
    if (/^Missing \} inserted/.test(msg)) return ['Falta una llave }', null];
    if (/^Extra \}, or forgotten \$/.test(msg)) return ['Sobra una llave } o falta un $', null];
    if (/^Extra alignment tab has been changed to \\cr/.test(msg)) return ['Hay más columnas (&) de las definidas en la tabla', 'Revisa la especificación de columnas del tabular.'];
    if (/^Misplaced alignment tab character &/.test(msg)) return ['Un & fuera de una tabla', 'Para escribir el símbolo usa \\&.'];
    if ((m = /^File ended while scanning use of (\S+)/.exec(msg))) return [`El archivo terminó antes de cerrar ${m[1]}`, 'Probablemente falta una llave } de cierre.'];
    if (/^Paragraph ended before (\S+) was complete/.test(msg)) return [msg, 'Suele indicar una llave sin cerrar en un argumento.'];
    if (/^LaTeX Error: Missing \\begin\{document\}/.test(msg)) return ['Falta \\begin{document} o hay texto antes de él', null];
    if (/^Emergency stop/.test(msg)) return null;
    if (/^==> Fatal error occurred/.test(msg)) return null;
    return [msg, null];
  }
  function parseLog(log) {
    const out = [];
    if (!log) return out;
    const main = P.main || 'main.tex', mainDir = dirname(main);
    // un-wrap TeX's 79-column lines so file names in parentheses stay intact
    const raw = log.split('\n'); const lines = [];
    for (let i = 0; i < raw.length; i++) { let l = raw[i]; while (l.length === 79 && i + 1 < raw.length && !/^(!|l\.\d)/.test(raw[i + 1])) l += raw[++i]; lines.push(l); }
    const stack = [];
    const fileFor = () => { for (let i = stack.length - 1; i >= 0; i--) { const f = stack[i]; if (/^\.\//.test(f) || (!f.startsWith('/') && /\.tex$/.test(f))) return normPath(joinPath(mainDir, f.replace(/^\.\//, ''))); } return main; };
    const trackParens = l => {
      const re = /\(([^\s()]+\.(?:tex|sty|cls|cfg|def|clo|fd|bbl|aux|ldf|out|toc|lof|lot|dfu|code\.tex|ltx))|\)/g; let m;
      while ((m = re.exec(l))) { if (m[0] === ')') stack.pop(); else stack.push(m[1]); }
    };
    const seen = new Set();
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('! ')) {
        let msg = l.slice(2).trim(), line = null, ctx = '';
        for (let j = i + 1; j < Math.min(lines.length, i + 25); j++) { const mm = /^l\.(\d+)\s?(.*)$/.exec(lines[j]); if (mm) { line = +mm[1]; ctx = mm[2]; break; } if (lines[j].startsWith('! ')) break; }
        if (/^LaTeX Error:|^Package .* Error:/.test(msg)) { let k = i + 1; while (k < lines.length && lines[k].trim() && !/^(See the|Type  H|l\.\d)/.test(lines[k])) { msg += ' ' + lines[k].trim(); k++; if (k - i > 4) break; } }
        const tr = translate(msg, ctx); if (!tr) continue;
        const key = 'e' + tr[0] + line; if (seen.has(key)) continue; seen.add(key);
        out.push({ sev: 'error', msg: tr[0], detail: [tr[1], ctx ? `l.${line}: ${ctx.trim()}` : ''].filter(Boolean).join('\n'), file: fileFor(), line });
        continue;
      }
      let m;
      if ((m = /^(?:LaTeX|Package (\S+)|Class (\S+)) Warning: (.*)$/.exec(l))) {
        let msg = m[3]; const who = m[1] || m[2];
        let k = i + 1; while (k < lines.length && /^\(\S+\)\s/.test(lines[k])) { msg += ' ' + lines[k].replace(/^\(\S+\)\s+/, ''); k++; }
        const ln = /on input line (\d+)/.exec(msg);
        let text = msg.replace(/\s*on input line \d+\.?/, '').trim(), detail = who ? `Paquete ${who}` : '';
        let mm;
        if ((mm = /^Reference `([^']+)' on page \d+ undefined/.exec(text))) { text = `Referencia «${mm[1]}» sin definir`; detail = 'No hay \\label con ese nombre, o hace falta compilar otra vez.'; }
        else if ((mm = /^Citation `([^']+)' on page \d+ undefined/.exec(text))) { text = `Cita «${mm[1]}» sin definir`; detail = 'No existe esa clave en el archivo .bib.'; }
        else if (/^There were undefined references/.test(text)) { continue; }
        else if (/^Label\(s\) may have changed/.test(text)) { text = 'Las etiquetas cambiaron'; detail = 'Vuelve a compilar para actualizar las referencias.'; }
        else if (/Shell escape feature is not enabled/.test(text)) continue;
        else if (/^Font shape/.test(text) || /Some font shapes were not available/.test(text)) continue;
        const key = 'w' + text + (ln ? ln[1] : ''); if (seen.has(key)) continue; seen.add(key);
        out.push({ sev: 'warning', msg: text, detail, file: fileFor(), line: ln ? +ln[1] : null });
      }
      else if ((m = /^(Overfull|Underfull) \\([hv])box \(([^)]+)\).*?(?:lines? (\d+)(?:--(\d+))?)?$/.exec(l))) {
        if (m[1] === 'Underfull') { trackParens(l); continue; }
        out.push({ sev: 'info', msg: `Línea demasiado ancha (${m[3]})`, detail: 'El texto se sale del margen. Suele ser una palabra larga, una URL o una tabla.', file: fileFor(), line: m[4] ? +m[4] : null });
      }
      trackParens(l);
    }
    if (out.some(p => p.sev === 'error')) out.splice(0, out.length, ...out.filter(p => !(p.sev === 'warning' && /sin definir|cambiaron/.test(p.msg))));
    return out.sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.sev] - { error: 0, warning: 1, info: 2 }[b.sev]));
  }
  let logView = 'problems';
  function showProblems(open) {
    const errs = problems.filter(p => p.sev === 'error').length, warns = problems.filter(p => p.sev === 'warning').length;
    $('#probBadges').innerHTML = !P ? '' : errs ? `<button class="badge err" id="badgeBtn" title="Ver errores">${errs} error${errs > 1 ? 'es' : ''}</button>` : warns ? `<button class="badge warn" id="badgeBtn" title="Ver advertencias">${warns} aviso${warns > 1 ? 's' : ''}</button>` : (lastPdf ? '<span class="badge ok">Sin errores</span>' : '');
    const bb = $('#badgeBtn'); if (bb) { bb.style.border = '0'; bb.style.cursor = 'pointer'; bb.onclick = () => toggleLog(true); }
    renderLogList();
    if (open) toggleLog(true);
    applyLineMarks();
  }
  function renderLogList() {
    const el = $('#logList');
    if (logView === 'raw') { el.innerHTML = rawLog ? `<pre class="log-raw">${esc(rawLog)}</pre>` : '<p class="log-empty">Todavía no hay registro. Compila el proyecto.</p>'; return; }
    if (!problems.length) { el.innerHTML = `<p class="log-empty">${lastPdf ? 'Sin errores ni advertencias.' : 'Compila para ver los errores y advertencias.'}</p>`; return; }
    const sevLabel = { error: 'Error', warning: 'Aviso', info: 'Formato' };
    el.innerHTML = problems.map((p, i) => `<button class="log-item ${p.sev}" data-i="${i}"><span class="sev">${sevLabel[p.sev]}</span><span class="msg">${esc(p.msg)}${p.detail ? `<small>${esc(p.detail)}</small>` : ''}</span><span class="loc">${p.file ? esc(basename(p.file)) : ''}${p.line ? ':' + p.line : ''}</span></button>`).join('');
  }
  $('#logList').addEventListener('click', e => {
    const b = e.target.closest('.log-item'); if (!b) return;
    const p = problems[+b.dataset.i]; if (!p || !p.file) return;
    if (P.files.has(p.file)) { openPath(p.file, p.line); if (innerWidth <= 1000) setView('code'); }
  });
  document.querySelectorAll('[data-log]').forEach(b => b.addEventListener('click', () => {
    logView = b.dataset.log; document.querySelectorAll('[data-log]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderLogList();
  }));
  function toggleLog(force) {
    const pane = $('#logPane'); const show = force ?? pane.hidden;
    pane.hidden = !show; $('#logToggle').setAttribute('aria-pressed', String(show));
    if (cm) setTimeout(() => cm.refresh(), 0);
  }
  $('#logToggle').addEventListener('click', () => toggleLog());
  $('#logClose').addEventListener('click', () => toggleLog(false));
  let lineMarks = [];
  function applyLineMarks() {
    if (!cm) return;
    lineMarks.forEach(({ doc, h, cls }) => { try { doc.removeLineClass(h, 'background', cls); } catch (e) { } });
    lineMarks = [];
    if (!P || !P.open) return;
    const b = buffers.get(P.open); if (!b) return;
    for (const p of problems) {
      if (p.file !== P.open || !p.line || p.sev === 'info') continue;
      const cls = p.sev === 'error' ? 'cm-line-error' : 'cm-line-warning';
      const h = b.doc.addLineClass(Math.min(p.line - 1, b.doc.lineCount() - 1), 'background', cls);
      lineMarks.push({ doc: b.doc, h, cls });
    }
  }

  /* ================= PDF preview (pdf.js) ================= */
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  const scroller = $('#pdfScroll'), pagesEl = $('#pdfPages');
  let pdfDoc = null, views = [], zoom = store.get('folio.tex.zoom') || 'width', io = null, renderGen = 0;
  const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  function clearPdf() {
    if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
    views.forEach(v => { if (v.task) try { v.task.cancel(); } catch (e) { } });
    views = []; pagesEl.innerHTML = ''; setSynctex(null); $('#pdfEmpty').hidden = false; $('#pdfPage').textContent = '– / –';
    markStale(false);
  }
  function cssScale(vp1) { return zoom === 'width' ? Math.max(0.3, (scroller.clientWidth - 28) / vp1.width) : zoom; }
  async function showPdf(bytes) {
    if (!window.pdfjsLib) { toast('No se pudo cargar el visor de PDF.'); return; }
    const keep = scroller.scrollHeight > scroller.clientHeight ? scroller.scrollTop / scroller.scrollHeight : 0;
    const keepLeft = scroller.scrollLeft;
    const gen = ++renderGen;
    let doc;
    try { doc = await pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise; }
    catch (e) { toast('No se pudo mostrar el PDF: ' + e.message); return; }
    if (gen !== renderGen) { doc.destroy(); return; }
    const old = pdfDoc; pdfDoc = doc;
    const sizes = [];
    for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); sizes.push({ page: p, vp1: p.getViewport({ scale: 1 }) }); }
    if (gen !== renderGen) return;
    if (io) io.disconnect();
    views.forEach(v => { if (v.task) try { v.task.cancel(); } catch (e) { } });
    const frag = document.createDocumentFragment();
    views = sizes.map((s, i) => {
      const el = document.createElement('div'); el.className = 'pdf-page'; el.dataset.i = i;
      const sc = cssScale(s.vp1); el.style.width = Math.round(s.vp1.width * sc) + 'px'; el.style.height = Math.round(s.vp1.height * sc) + 'px';
      frag.appendChild(el);
      return { el, page: s.page, vp1: s.vp1, rendered: 0, task: null };
    });
    pagesEl.replaceChildren(frag);
    $('#pdfEmpty').hidden = true;
    if (old) old.destroy();
    scroller.scrollTop = keep * scroller.scrollHeight; scroller.scrollLeft = keepLeft;
    io = new IntersectionObserver(entries => { for (const en of entries) { const v = views[+en.target.dataset.i]; if (!v) continue; v.visible = en.isIntersecting; if (en.isIntersecting) renderPage(v); } freeFarPages(); }, { root: scroller, rootMargin: '800px 0px' });
    views.forEach(v => io.observe(v.el));
    updateZoomLabel(); updatePageNum();
  }
  async function renderPage(v) {
    const sc = cssScale(v.vp1), dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = sc * dpr; if (v.rendered === key) return;
    if (v.task) { try { v.task.cancel(); } catch (e) { } }
    const vp = v.page.getViewport({ scale: sc * dpr });
    const canvas = document.createElement('canvas'); canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    v.task = v.page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp });
    try { await v.task.promise; } catch (e) { return; }
    v.task = null; v.rendered = key;
    const old = v.el.querySelector('canvas'); if (old) { old.width = old.height = 0; old.remove(); }
    v.el.prepend(canvas);
    if (!v.el.querySelector('.annot')) addLinks(v, sc);
  }
  async function addLinks(v, sc) {
    try {
      const ann = await v.page.getAnnotations();
      const layer = document.createElement('div'); layer.className = 'annot';
      for (const a of ann) {
        if (a.subtype !== 'Link') continue;
        const [x1, y1, x2, y2] = a.rect; const h = v.vp1.height;
        const el = document.createElement('a');
        el.style.left = (Math.min(x1, x2) / v.vp1.width * 100) + '%'; el.style.top = ((h - Math.max(y1, y2)) / h * 100) + '%';
        el.style.width = (Math.abs(x2 - x1) / v.vp1.width * 100) + '%'; el.style.height = (Math.abs(y2 - y1) / h * 100) + '%';
        if (a.url) { el.href = a.url; el.target = '_blank'; el.rel = 'noopener'; el.title = a.url; }
        else if (a.dest) { el.href = '#'; el.addEventListener('click', ev => { ev.preventDefault(); goDest(a.dest); }); }
        else continue;
        layer.appendChild(el);
      }
      v.el.appendChild(layer);
    } catch (e) { }
  }
  async function goDest(dest) {
    try {
      const d = typeof dest === 'string' ? await pdfDoc.getDestination(dest) : dest; if (!d) return;
      const idx = await pdfDoc.getPageIndex(d[0]); const v = views[idx]; if (!v) return;
      const yTop = d[1] && d[1].name === 'XYZ' && d[3] != null ? (v.vp1.height - d[3]) / v.vp1.height : 0;
      scroller.scrollTop = v.el.offsetTop - 16 + yTop * v.el.offsetHeight;
    } catch (e) { }
  }
  /* ---------- SyncTeX: double-click on the PDF jumps to the source line (and word) ---------- */
  const SP_PER_BP = 65781.76;
  let syncRaw = null, syncMap = null;
  function setSynctex(bytes) { syncRaw = bytes; syncMap = null; }
  async function loadSynctex() {
    if (syncMap || !syncRaw) return syncMap;
    let text;
    try { text = await new Response(new Blob([syncRaw]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
    catch (e) { return null; }
    const inputs = {}, pages = [];
    let unit = 1, page = null;
    for (const l of text.split('\n')) {
      const c = l[0];
      if (c === 'I' && l.startsWith('Input:')) { const m = /^Input:(\d+):(.*)$/.exec(l); if (m) inputs[m[1]] = m[2]; }
      else if (c === 'U' && l.startsWith('Unit:')) unit = +l.slice(5) || 1;
      else if (c === '{') { page = []; pages[+l.slice(1) - 1] = page; }
      else if (c === '}') page = null;
      else if (page && '[(hvxkg$'.includes(c)) {
        const m = /^.(\d+),(\d+):(-?\d+),(-?\d+)(?::(-?\d+),(-?\d+),(-?\d+))?/.exec(l); if (!m) continue;
        const r = { k: c, tag: m[1], line: +m[2], x: +m[3] * unit / SP_PER_BP, y: +m[4] * unit / SP_PER_BP };
        if (m[5] != null) { r.w = +m[5] * unit / SP_PER_BP; r.h = +m[6] * unit / SP_PER_BP; r.d = +m[7] * unit / SP_PER_BP; }
        page.push(r);
      }
    }
    // map engine paths (/home/web_user/project_dir/./sec/intro.tex) to project paths (sec/intro.tex)
    const files = {};
    for (const [tag, p] of Object.entries(inputs)) {
      const m = /project_dir\/(.*)$/.exec(p); if (!m) continue;
      const rel = normPath(m[1].replace(/(^|\/)\.\//g, '$1'));
      if (P && P.files.has(rel)) files[tag] = rel;
      else if (P && P.files.has(rel + '.tex')) files[tag] = rel + '.tex';
    }
    syncMap = { files, pages };
    return syncMap;
  }
  function syncLookup(map, pageIdx, bx, by) {
    const recs = (map.pages[pageIdx] || []).filter(r => map.files[r.tag]);
    if (!recs.length) return null;
    // innermost line box (hbox) that contains the point, then the last item on its baseline left of the click
    let box = null;
    for (const r of recs) {
      if (r.k !== '(' || r.w == null) continue;
      if (bx >= r.x - 1 && bx <= r.x + r.w + 1 && by >= r.y - r.h - 2 && by <= r.y + r.d + 2 && (!box || r.w * (r.h + r.d) <= box.w * (box.h + box.d))) box = r;
    }
    let best = null;
    if (box) {
      const onLine = recs.filter(r => r.k !== '(' && r.k !== '[' && Math.abs(r.y - box.y) < 0.5 && r.x >= box.x - 1 && r.x <= box.x + box.w + 1);
      for (const r of onLine) if (r.x <= bx + 1 && (!best || r.x > best.x)) best = r;
      if (!best && onLine.length) best = onLine.reduce((a, b) => Math.abs(a.x - bx) < Math.abs(b.x - bx) ? a : b);
      if (!best) best = box;
    }
    if (!best) {
      let bd = Infinity;
      for (const r of recs) { const d = Math.abs(r.x - bx) + 3 * Math.abs(r.y - by); if (d < bd) { bd = d; best = r; } }
    }
    return best ? { path: map.files[best.tag], line: best.line } : null;
  }
  // the word under the pointer, read from the PDF text layer
  async function pdfWordAt(v, bx, by) {
    try {
      const tc = await v.page.getTextContent(); const py = v.vp1.height - by;
      for (const it of tc.items) {
        if (!it.str || !it.width) continue;
        const x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
        if (bx < x || bx > x + it.width || py < y - h * 0.3 || py > y + h) continue;
        const s = it.str.normalize('NFKC'); let i = Math.min(s.length - 1, Math.max(0, Math.floor((bx - x) / it.width * s.length)));
        const isW = ch => /[\p{L}\p{N}]/u.test(ch);
        if (!isW(s[i])) { if (i > 0 && isW(s[i - 1])) i--; else if (i + 1 < s.length && isW(s[i + 1])) i++; else return null; }
        let a = i, b = i; while (a > 0 && isW(s[a - 1])) a--; while (b + 1 < s.length && isW(s[b + 1])) b++;
        return s.slice(a, b + 1);
      }
    } catch (e) { }
    return null;
  }
  async function syncFromPdf(v, ev) {
    if (!syncRaw) { toast('Compila el proyecto para poder saltar del PDF al código.'); return; }
    const map = await loadSynctex(); if (!map) return;
    const rect = v.el.getBoundingClientRect();
    const bx = (ev.clientX - rect.left) / rect.width * v.vp1.width, by = (ev.clientY - rect.top) / rect.height * v.vp1.height;
    const hit = syncLookup(map, +v.el.dataset.i, bx, by);
    if (!hit) { toast('No se encontró el código de esa parte del PDF.'); return; }
    const word = await pdfWordAt(v, bx, by);
    if (P.open !== hit.path) await openPath(hit.path);
    if (!cm || P.open !== hit.path) return;
    if (innerWidth <= 1000) setView('code');
    else if (main.dataset.layout === 'pdf') setLayout('split');
    const ln = Math.min(hit.line, cm.lineCount()) - 1;
    let from = { line: ln, ch: 0 }, to = null;
    if (word && word.length > 1) {
      // the word may sit on the reported line or, for paragraphs, a line or two around it
      const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const w = fold(word);
      for (const l of [ln, ln + 1, ln - 1, ln + 2, ln - 2]) {
        if (l < 0 || l >= cm.lineCount()) continue;
        const i = fold(cm.getLine(l)).indexOf(w);
        if (i >= 0) {
          // PDF text can split accented letters (OT1), so widen to the whole word in the source
          const t = cm.getLine(l), isW = ch => /[\p{L}\p{N}]/u.test(ch);
          let a = i, b = i + word.length; while (a > 0 && isW(t[a - 1])) a--; while (b < t.length && isW(t[b])) b++;
          from = { line: l, ch: a }; to = { line: l, ch: b }; break;
        }
      }
    }
    cm.focus();
    if (to) cm.setSelection(from, to); else cm.setCursor(from);
    cm.scrollIntoView({ from, to: to || from }, Math.round(cm.getScrollInfo().clientHeight / 3));
    const mark = cm.markText({ line: from.line, ch: 0 }, { line: from.line, ch: cm.getLine(from.line).length }, { className: 'cm-sync-flash' });
    setTimeout(() => mark.clear(), 1200);
  }
  pagesEl.addEventListener('dblclick', ev => {
    const el = ev.target.closest('.pdf-page'); if (!el || ev.target.closest('.annot a')) return;
    const v = views[+el.dataset.i]; if (v) { ev.preventDefault(); syncFromPdf(v, ev); }
  });

  function freeFarPages() {
    const rendered = views.filter(v => v.rendered && !v.visible);
    if (rendered.length <= 6) return;
    const mid = scroller.scrollTop + scroller.clientHeight / 2;
    rendered.sort((a, b) => Math.abs(b.el.offsetTop - mid) - Math.abs(a.el.offsetTop - mid));
    for (const v of rendered.slice(0, rendered.length - 6)) { const c = v.el.querySelector('canvas'); if (c) { c.width = c.height = 0; c.remove(); } v.rendered = 0; }
  }
  function relayout() {
    if (!views.length) return;
    const ratio = scroller.scrollTop / (scroller.scrollHeight || 1);
    for (const v of views) { const sc = cssScale(v.vp1); v.el.style.width = Math.round(v.vp1.width * sc) + 'px'; v.el.style.height = Math.round(v.vp1.height * sc) + 'px'; v.el.querySelectorAll('.annot').forEach(a => a.remove()); }
    scroller.scrollTop = ratio * scroller.scrollHeight;
    views.forEach(v => { if (v.visible) renderPage(v); });
    updateZoomLabel();
  }
  function updateZoomLabel() { $('#pdfZoom').textContent = zoom === 'width' ? 'Ancho' : Math.round(zoom * 100) + '%'; }
  function stepZoom(dir) {
    const curZ = zoom === 'width' && views[0] ? cssScale(views[0].vp1) : (zoom === 'width' ? 1 : zoom);
    let i = ZOOMS.findIndex(z => z >= curZ - 0.001); if (i < 0) i = ZOOMS.length - 1;
    if (dir > 0) i = ZOOMS[i] > curZ + 0.001 ? i : Math.min(ZOOMS.length - 1, i + 1); else i = Math.max(0, ZOOMS[i] < curZ - 0.001 ? i : i - 1);
    zoom = ZOOMS[i]; store.set('folio.tex.zoom', zoom); relayout();
  }
  function updatePageNum() {
    if (!views.length) { $('#pdfPage').textContent = '– / –'; return; }
    const mid = scroller.scrollTop + scroller.clientHeight / 3; let n = 1;
    for (const v of views) { if (v.el.offsetTop <= mid) n = +v.el.dataset.i + 1; }
    $('#pdfPage').textContent = `${n} / ${views.length}`;
    return n;
  }
  scroller.addEventListener('scroll', debounce(updatePageNum, 60));
  $('#pdfIn').addEventListener('click', () => stepZoom(1));
  $('#pdfOut').addEventListener('click', () => stepZoom(-1));
  $('#pdfFit').addEventListener('click', () => { zoom = 'width'; store.set('folio.tex.zoom', zoom); relayout(); });
  $('#pdfNext').addEventListener('click', () => { const n = updatePageNum() || 1; const v = views[n]; if (v) scroller.scrollTop = v.el.offsetTop - 12; });
  $('#pdfPrev').addEventListener('click', () => { const n = updatePageNum() || 1; const v = views[Math.max(0, n - 2)]; if (v) scroller.scrollTop = v.el.offsetTop - 12; });
  scroller.addEventListener('wheel', e => { if (!e.ctrlKey || !views.length) return; e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  new ResizeObserver(debounce(() => { if (zoom === 'width') relayout(); }, 120)).observe(scroller);
  function markStale(on) {
    let el = $('#pdfStale');
    $('.pdf-pane').classList.toggle('stale', !!(on && lastPdf));
    if (!on || !lastPdf) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'pdfStale'; el.className = 'pdf-stale'; $('.pdf-pane').appendChild(el); }
    el.textContent = 'Hay errores: se muestra el último PDF correcto';
  }
  $('#pdfSave').addEventListener('click', () => savePdf());
  async function savePdf() {
    if (!lastPdf) { toast('Compila primero para generar el PDF.'); return; }
    const name = basename(P.main || 'documento.tex').replace(/\.tex$/i, '.pdf');
    if (P.root) {
      try { const path = normPath(joinPath(dirname(P.main), name)); await writeFile(path, lastPdf); renderTree(); toast(`PDF guardado en ${path}${P.kind === 'app' ? ' (dentro de la app)' : ''}.`); if (P.kind !== 'app') return; } catch (e) { toast('No se pudo guardar el PDF: ' + e.message); return; }
    }
    if (window.showSaveFilePicker) {
      try { const h = await showSaveFilePicker({ id: 'folio-pdf', suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] }); const w = await h.createWritable(); await w.write(lastPdf); await w.close(); toast('PDF guardado.'); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    Markdown.download(name, new Blob([lastPdf], { type: 'application/pdf' }));
  }
  function openPdf() {
    if (!lastPdf) { toast('Compila primero para generar el PDF.'); return; }
    const url = URL.createObjectURL(new Blob([lastPdf], { type: 'application/pdf' }));
    const w = window.open(url, '_blank');
    if (!w) Markdown.download(basename(P.main || 'documento').replace(/\.tex$/i, '.pdf'), new Blob([lastPdf], { type: 'application/pdf' }));
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  /* ================= engine status & dialog ================= */
  FolioTex.onState(s => {
    const dot = $('#engDot'), msg = $('#engMsg'), prog = $('#engProg');
    dot.className = s.status === 'ready' ? 'st-ok' : s.status === 'off' ? '' : 'st-warn';
    dot.style.color = s.status === 'off' ? 'var(--ink-3)' : '';
    msg.textContent = s.status === 'off' ? (s.detail || 'Motor apagado · se inicia al compilar') : s.detail || s.status;
    if (s.progress && s.progress.total) {
      prog.hidden = false; prog.firstElementChild.style.width = Math.round(s.progress.loaded / s.progress.total * 100) + '%';
      msg.textContent = `${s.detail}: ${fmtBytes(s.progress.loaded)} de ${fmtBytes(s.progress.total)}`;
      $('#pdfEmptyMsg').textContent = `Descargando la base de TeX Live (${Math.round(s.progress.loaded / s.progress.total * 100)} %). Solo ocurre la primera vez.`;
    } else prog.hidden = true;
  });
  async function engineDialog() {
    const st = await FolioTex.cacheStats();
    let est = null, persisted = null;
    try { est = await navigator.storage.estimate(); persisted = await navigator.storage.persisted(); } catch (e) { }
    const s = FolioTex.state;
    const html = `<div class="settings"><dl>
      <dt>Motor</dt><dd>pdfLaTeX · TeX Live 2026 (BusyTeX)</dd>
      <dt>Estado</dt><dd>${esc(s.status === 'off' ? 'apagado (libera memoria; se inicia al compilar)' : s.detail || s.status)}</dd>
      <dt>Paquetes extra</dt><dd>${st.count} archivos · ${fmtBytes(st.bytes)} — compartidos por todos tus proyectos</dd>
      ${est ? `<dt>Almacenamiento</dt><dd>${fmtBytes(est.usage || 0)} usados de la app (incluye la base de TeX Live)</dd>` : ''}
      ${persisted != null ? `<dt>Protección</dt><dd>${persisted ? 'El navegador no borrará estos datos automáticamente' : 'El navegador podría borrar estos datos si falta espacio'}</dd>` : ''}
      </dl>
      <p style="font-size:13px;color:var(--ink-2);margin:0 0 12px">Los paquetes se descargan una sola vez y se reutilizan en todos los proyectos. Borrarlos solo hace falta si algo falla.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px"><button class="btn" id="clrPk">Borrar paquetes extra</button><button class="btn" id="clrAll" style="color:var(--danger)">Borrar todo (incluye la base)</button></div></div>`;
    const p = dialog({ title: 'Motor LaTeX y paquetes', html, ok: 'Cerrar', cancel: false });
    $('#clrPk').onclick = async () => { await FolioTex.clearCache(false); toast('Paquetes extra borrados. Se descargarán al usarlos de nuevo.'); $('#modalYes').click(); };
    $('#clrAll').onclick = async () => { if (!confirmAll) { confirmAll = true; $('#clrAll').textContent = 'Pulsa otra vez para confirmar'; return; } await FolioTex.clearCache(true); toast('Datos del motor borrados. La próxima compilación descargará la base de nuevo.'); $('#modalYes').click(); };
    let confirmAll = false;
    await p;
  }

  /* ================= layout: splitters, narrow view ================= */
  const main = $('#texMain');
  document.querySelectorAll('.splitter').forEach(sp => {
    sp.addEventListener('pointerdown', e => {
      e.preventDefault(); sp.setPointerCapture(e.pointerId); sp.classList.add('drag');
      const rect = main.getBoundingClientRect();
      const move = ev => {
        if (sp.dataset.split === 'tree') { const w = Math.min(420, Math.max(150, ev.clientX - rect.left)); main.style.setProperty('--tree-w', w + 'px'); }
        else { const w = Math.min(rect.width - 320, Math.max(260, rect.right - ev.clientX)); main.style.setProperty('--pdf-w', w + 'px'); }
        if (cm) cm.refresh();
      };
      const up = () => { sp.classList.remove('drag'); sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); store.set('folio.tex.layout', { tree: main.style.getPropertyValue('--tree-w'), pdf: main.style.getPropertyValue('--pdf-w') }); if (zoom === 'width') relayout(); };
      sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up);
    });
  });
  const lay = store.get('folio.tex.layout'); if (lay) { if (lay.tree) main.style.setProperty('--tree-w', lay.tree); if (lay.pdf) main.style.setProperty('--pdf-w', lay.pdf); }
  $('#treeToggle').addEventListener('click', () => { if (innerWidth <= 1000) { setView(main.dataset.view === 'files' ? 'code' : 'files'); return; } main.classList.toggle('tree-off'); store.set('folio.tex.tree', !main.classList.contains('tree-off')); setTimeout(() => cm && cm.refresh(), 0); });
  if (store.get('folio.tex.tree') === false) main.classList.add('tree-off');
  function setView(v) { main.dataset.view = v; document.querySelectorAll('#texViewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v))); if (v === 'code' && cm) setTimeout(() => cm.refresh(), 0); if (v === 'pdf') relayout(); }
  document.querySelectorAll('#texViewSeg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  /* wide-screen layout: editor only, editor + PDF, or PDF only */
  function setLayout(l) {
    if (!['code', 'split', 'pdf'].includes(l)) l = 'split';
    main.dataset.layout = l;
    document.querySelectorAll('#layoutSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layout === l)));
    store.set('folio.tex.layoutMode', l);
    setTimeout(() => { if (cm) cm.refresh(); }, 0);
  }
  document.querySelectorAll('#layoutSeg button').forEach(b => b.addEventListener('click', () => setLayout(b.dataset.layout)));
  setLayout(store.get('folio.tex.layoutMode') || 'split');

  /* ================= drag & drop ================= */
  const codeWrap = $('#codeWrap');
  let codeDragDepth = 0;
  codeWrap.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { codeDragDepth++; $('#codeDrop').hidden = false; } });
  codeWrap.addEventListener('dragleave', () => { codeDragDepth = Math.max(0, codeDragDepth - 1); if (!codeDragDepth) $('#codeDrop').hidden = true; });
  $('#tree').addEventListener('dragover', e => { const n = e.target.closest('.node[data-dir="1"]'); document.querySelectorAll('.node.drop-target').forEach(x => x !== n && x.classList.remove('drop-target')); if (n) n.classList.add('drop-target'); });
  async function onDrop(entries, e) {
    codeDragDepth = 0; $('#codeDrop').hidden = true;
    const targetNode = e.target.closest && e.target.closest('#tree .node');
    document.querySelectorAll('.node.drop-target').forEach(x => x.classList.remove('drop-target'));
    const dirEntry = entries.find(en => en.handle && en.handle.kind === 'directory');
    if (dirEntry) {
      const ok = await verifyPermission(dirEntry.handle, true);
      if (!ok) { toast('Folio necesita permiso de edición para abrir esa carpeta.'); return; }
      await openProject({ id: await projectIdFor(dirEntry.handle), name: dirEntry.handle.name, kind: 'folder', root: dirEntry.handle });
      return;
    }
    const files = []; for (const en of entries) { if (en.handle && en.handle.kind === 'file') files.push({ file: await en.handle.getFile(), handle: en.handle }); else if (en.file) files.push({ file: en.file }); }
    if (!files.length) return;
    const onEditor = !!(e.target.closest && e.target.closest('#codeWrap'));
    const images = files.filter(f => /\.(png|jpe?g|pdf)$/i.test(f.file.name) || /^image\/(png|jpeg)$/.test(f.file.type));
    if (!P || !P.root) {
      const tex = files.find(f => /\.tex$/i.test(f.file.name) && f.handle);
      if (tex) { await openFileHandle(tex.handle); return; }
      toast('Primero abre la carpeta del proyecto (o suelta la carpeta aquí).'); return;
    }
    if (onEditor && images.length && P.open && /\.tex$/i.test(P.open)) {
      const pos = cm.coordsChar({ left: e.clientX, top: e.clientY }, 'window');
      for (const f of images) await addImage(f.file, pos);
      return;
    }
    if (files.length === 1 && /\.tex$/i.test(files[0].file.name) && files[0].handle && !targetNode) {
      try { const parts = await P.root.resolve(files[0].handle); if (parts) { openPath(parts.join('/')); return; } } catch (er) { }
    }
    const dir = targetNode ? (targetNode.dataset.dir ? targetNode.dataset.path : dirname(targetNode.dataset.path)) : (images.length === files.length ? normPath(joinPath(dirname(P.main || ''), 'figuras')) : selectedDir);
    await addFiles(files.map(f => f.file), dir);
  }

  /* ================= keyboard & lifecycle ================= */
  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey; if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'enter') { e.preventDefault(); compile('key'); }
    else if (k === 's') { e.preventDefault(); saveAndCompile(); }
    else if (k === 'o') { e.preventDefault(); openFolderDialog(); }
  }
  function init() {
    if (inited) return;
    inited = true;
    initEditor();
    $('#autoCompile').checked = store.get('folio.tex.auto') !== false;
    renderTree(); updateFileHead(); showProblems(); renderOutline();
  }
  let autoTried = false;   // the last project reopens by itself once, and only if permission is still granted
  async function show() {
    const first = !inited;
    init();
    if (!first) { if (cm) setTimeout(() => cm.refresh(), 0); return; }
    if (pendingFile) { const f = pendingFile; pendingFile = null; autoTried = true; await openFileHandle(f); return; }
    if (autoTried || P) return;
    autoTried = true;
    const lastId = store.get('folio.tex.last');
    if (lastId === 'sample') { await openSample(); return; }
    const rec = lastId ? (await FolioDB.projects().catch(() => [])).find(p => p.id === lastId) : null;
    if (rec && rec.handle && await verifyPermission(rec.handle, false)) await reopen(rec);
  }

  /* ---------- entry points used by Inicio ---------- */
  async function recents() {
    return (await FolioDB.projects().catch(() => [])).filter(r => r.id !== 'sample').sort((a, b) => (b.opened || 0) - (a.opened || 0));
  }
  // run an open/create action from Inicio and switch to LaTeX only if a project actually opened
  async function enter(action) {
    autoTried = true; init();
    const before = P; await action();
    if (P && P !== before) Shell.setWs('tex');
  }
  const openRecent = rec => enter(() => reopen(rec));
  async function forget(rec) {
    const msg = rec.kind === 'file'
      ? `¿Quitar “${rec.name}” de la lista? El archivo en tu equipo no se borra.`
      : `¿Quitar el proyecto “${rec.name}” de la lista? La carpeta y sus archivos en tu equipo no se borran.`;
    if (!(await ask(msg, 'Quitar', true))) return false;
    await FolioDB.deleteProject(rec.id).catch(() => { });
    if (store.get('folio.tex.last') === rec.id) store.set('folio.tex.last', null);
    return true;
  }
  let pendingFile = null;
  async function openFromLaunch(handle) {
    if (!inited) { pendingFile = handle; Shell.setWs('tex'); return; }
    Shell.setWs('tex'); await openFileHandle(handle);
  }
  window.addEventListener('beforeunload', e => { if (P && anyDirty()) { saveAll().catch(() => { }); e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && P && anyDirty()) saveAll().catch(() => { }); });

  window.Tex = {
    show, onKey, onDrop, openFromLaunch, recents, openRecent, forget,
    newProject: () => enter(newProject),
    openFolder: () => enter(() => openFolderDialog()),
    openSample: () => enter(openSample),
    isTex: name => /\.(tex|ltx|bib)$/i.test(name), get project() { return P; }
  };
})();
