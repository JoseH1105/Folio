/* Folio — Inicio: recent Markdown documents and LaTeX projects, with create / open / remove */
(function () {
  'use strict';
  const { $, esc, toast } = UI;

  const ICON = {
    md: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3"/><path d="M5.5 8h5M5.5 10.5h5M5.5 13h3" stroke-linecap="round"/></svg>',
    folder: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M1.5 4v9h13V5.5H8L6.5 3.5h-5z"/></svg>',
    tex: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3"/><path d="M5.5 8.5h2.2M6.6 8.5V12M8.6 9.5l2 2.5M10.6 9.5l-2 2.5" stroke-linecap="round"/></svg>',
    del: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v4.5M9.2 6.5v4.5"/></svg>'
  };

  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  function ago(t) {
    if (!t) return '';
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'hace un momento';
    const steps = [[60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
    let v = s / 60;
    for (const [n, unit] of steps) { if (Math.abs(v) < n) return rtf.format(-Math.round(v), unit); v /= n; }
    return '';
  }

  let mdItems = [], texItems = [], query = '';
  const match = name => !query || name.toLowerCase().includes(query);

  function row(kind, it) {
    const meta = [];
    if (kind === 'md') {
      meta.push(it.hasFile ? 'Archivo del equipo' : it.path ? esc(it.path) : 'Solo en Folio');
    } else {
      meta.push(it.kind === 'file' ? 'Archivo .tex suelto' : 'Carpeta del equipo');
      if (it.main) meta.push(esc(it.main));
    }
    const when = ago(it.opened); if (when) meta.push(when);
    const tags = (kind === 'md' && it.dirty ? '<span class="h-tag warn">Sin guardar</span>' : '') +
      ((kind === 'md' && it.isOpen) || (kind === 'tex' && Tex.project && Tex.project.id === it.id) ? '<span class="h-tag">Abierto</span>' : '');
    const label = kind === 'md' ? (it.hasFile || it.path ? 'Quitar de Folio' : 'Eliminar') : 'Quitar de la lista';
    return `<li><div class="h-row" role="button" tabindex="0" data-kind="${kind}" data-id="${esc(it.id)}" title="Abrir ${esc(it.name)}">
      <span class="h-ico">${kind === 'md' ? ICON.md : it.kind === 'file' ? ICON.tex : ICON.folder}</span>
      <span class="h-main"><span class="h-name">${esc(it.name)}</span><span class="h-meta">${meta.join(' · ')}</span></span>
      ${tags}<button class="ib h-del" data-del title="${label}" aria-label="${label}: ${esc(it.name)}">${ICON.del}</button></div></li>`;
  }

  function paint() {
    const md = mdItems.filter(it => match(it.name)), tex = texItems.filter(it => match(it.name));
    $('#hMdCount').textContent = mdItems.length || '';
    $('#hTexCount').textContent = texItems.length || '';
    $('#hMdList').innerHTML = md.length ? md.map(it => row('md', it)).join('')
      : `<li class="h-empty">${query ? 'Ningún documento coincide con la búsqueda.' : 'Aún no hay documentos. Crea uno nuevo, abre un .md de tu equipo o suéltalo en esta ventana.'}</li>`;
    $('#hTexList').innerHTML = tex.length ? tex.map(it => row('tex', it)).join('')
      : `<li class="h-empty">${query ? 'Ningún proyecto coincide con la búsqueda.' : 'Aún no hay proyectos. Crea uno en una carpeta de tu equipo o abre una carpeta que ya tenga tu .tex.'}</li>`;
  }

  async function render() {
    mdItems = Markdown.library().sort((a, b) => b.opened - a.opened);
    texItems = window.Tex ? await Tex.recents() : [];
    paint();
  }

  $('#homeSearch').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); paint(); });

  async function openItem(kind, id) {
    if (kind === 'md') { await Markdown.openDoc(id); return; }
    const rec = texItems.find(r => r.id === id); if (rec) await Tex.openRecent(rec);
  }
  async function removeItem(kind, id) {
    if (kind === 'md') { if (await Markdown.removeDoc(id)) render(); return; }
    const rec = texItems.find(r => r.id === id); if (rec && await Tex.forget(rec)) { toast(`“${rec.name}” ya no aparece en la lista.`); render(); }
  }
  ['#hMdList', '#hTexList'].forEach(sel => {
    const list = $(sel);
    list.addEventListener('click', e => {
      const r = e.target.closest('.h-row'); if (!r) return;
      if (e.target.closest('[data-del]')) { e.stopPropagation(); removeItem(r.dataset.kind, r.dataset.id); }
      else openItem(r.dataset.kind, r.dataset.id);
    });
    list.addEventListener('keydown', e => {
      const r = e.target.closest('.h-row'); if (!r || e.target !== r) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(r.dataset.kind, r.dataset.id); }
      else if (e.key === 'Delete') { e.preventDefault(); removeItem(r.dataset.kind, r.dataset.id); }
    });
  });

  $('#homeWs').addEventListener('click', e => {
    const b = e.target.closest('[data-h]'); if (!b) return;
    ({
      mdNew: () => { Shell.setWs('md'); Markdown.newDocument(); },
      mdOpen: () => Markdown.openDialog(),
      mdGuide: () => { Shell.setWs('md'); Markdown.loadSample(); },
      texNew: () => Tex.newProject(),
      texOpen: () => Tex.openFolder(),
      texSample: () => Tex.openSample()
    })[b.dataset.h]?.();
  });

  window.Home = { render };
})();
