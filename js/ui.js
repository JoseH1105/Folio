/* Folio — shared UI helpers */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; };
  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  let toastT;
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, ms || Math.min(8000, 2400 + msg.length * 35));
  }

  // In-page dialog. opts: {title, message, ok, cancel, fields:[{id,label,value,hint}], danger}
  function dialog(opts) {
    return new Promise(res => {
      const m = $('#modal'), body = $('#modalBody');
      $('#modalTitle').hidden = !opts.title; $('#modalTitle').textContent = opts.title || '';
      $('#modalMsg').hidden = !opts.message; $('#modalMsg').textContent = opts.message || '';
      body.innerHTML = (opts.fields || []).map(f => `<label class="field">${esc(f.label)}<input id="dlg_${f.id}" value="${esc(f.value || '')}" autocomplete="off" spellcheck="false">${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`).join('');
      if (opts.html) body.innerHTML += opts.html;
      const yes = $('#modalYes'), no = $('#modalNo');
      yes.textContent = opts.ok || 'Aceptar'; no.textContent = opts.cancel || 'Cancelar'; no.hidden = opts.cancel === false;
      yes.style.background = opts.danger ? 'var(--danger)' : ''; yes.style.borderColor = opts.danger ? 'var(--danger)' : '';
      m.hidden = false;
      const first = body.querySelector('input');
      setTimeout(() => { if (first) { first.focus(); const v = first.value, dot = v.lastIndexOf('.'); first.setSelectionRange(0, dot > 0 ? dot : v.length); } else no.hidden ? yes.focus() : no.focus(); }, 0);
      const done = v => {
        m.hidden = true; yes.onclick = no.onclick = null; m.onkeydown = null;
        if (v && opts.fields) { const out = {}; opts.fields.forEach(f => { out[f.id] = $('#dlg_' + f.id).value; }); res(out); } else res(v);
      };
      yes.onclick = () => done(true); no.onclick = () => done(false);
      m.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); done(false); } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); done(true); } };
    });
  }
  const ask = (message, ok, danger) => dialog({ message, ok, danger });

  /* ---------- theme ---------- */
  const THEMES = ['dark', 'light', 'system'];
  const THEME_LABEL = { system: 'según el sistema', light: 'claro', dark: 'oscuro' };
  const THEME_ICON = {
    system: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="9" rx="1.2"/><path d="M5.5 14h5M8 11.5V14"/><path d="M8 2.5v9" /><path d="M8 3.3a3.7 3.7 0 0 1 0 7.4z" fill="currentColor" stroke="none"/></svg>',
    light: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3"/></svg>',
    dark: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.6 10.2A6 6 0 0 1 5.8 2.4a.4.4 0 0 0-.5-.5A6.6 6.6 0 1 0 14.1 10.7a.4.4 0 0 0-.5-.5z"/></svg>'
  };
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const b = $('#themeBtn'); if (b) { b.innerHTML = THEME_ICON[t]; b.title = 'Tema: ' + THEME_LABEL[t] + ' (clic para cambiar)'; }
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = dark ? '#0B0D10' : '#E8EBEF';
  }
  function initTheme() {
    let t = 'dark'; try { t = localStorage.getItem('folio.theme') || 'dark'; } catch (e) { }
    if (!THEMES.includes(t)) t = 'dark';
    applyTheme(t);
    $('#themeBtn').addEventListener('click', () => {
      t = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
      try { localStorage.setItem('folio.theme', t); } catch (e) { }
      applyTheme(t); toast('Tema ' + THEME_LABEL[t], 1500);
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(t));
  }

  // Simple dropdown menus: button[aria-haspopup] + .menu sibling
  function bindMenu(btn, menu, onOpen) {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = menu.hidden;
      document.querySelectorAll('.menu').forEach(m => { if (m !== menu) m.hidden = true; });
      if (open && onOpen) onOpen();
      menu.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    });
  }
  document.addEventListener('click', e => {
    document.querySelectorAll('.menu').forEach(m => { if (!m.hidden && !m.parentElement.contains(e.target)) m.hidden = true; });
  });

  /* ---------- table size picker (shared by Markdown and LaTeX) ---------- */
  let pickCb = null;
  function initPicker() {
    const pop = $('#tablePop'), grid = $('#grid');
    grid.innerHTML = Array.from({ length: 64 }, (_, i) => `<span data-c="${i % 8 + 1}" data-r="${Math.floor(i / 8) + 1}"></span>`).join('');
    const hl = (c, r) => { grid.querySelectorAll('span').forEach(s => s.classList.toggle('on', +s.dataset.c <= c && +s.dataset.r <= r)); const rows = Math.max(1, r - 1); $('#gridLbl').textContent = `${c} columna${c > 1 ? 's' : ''} · ${rows} fila${rows > 1 ? 's' : ''} + encabezado`; };
    grid.addEventListener('mouseover', e => { const s = e.target.closest('span'); if (s) hl(+s.dataset.c, +s.dataset.r); });
    grid.addEventListener('click', e => { const s = e.target.closest('span'); if (!s) return; pop.hidden = true; pickCb && pickCb(+s.dataset.c, Math.max(1, +s.dataset.r - 1)); });
    $('#tInsert').addEventListener('click', () => { pop.hidden = true; pickCb && pickCb(Math.min(20, Math.max(1, +$('#tCols').value || 1)), Math.min(100, Math.max(1, +$('#tRows').value || 1))); });
    document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('#tablePop') && !e.target.closest('[data-picker]')) pop.hidden = true; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') pop.hidden = true; });
    initPicker.hl = hl;
  }
  function pickTable(anchor, cb) {
    const pop = $('#tablePop'); pickCb = cb; anchor.dataset.picker = '1';
    const r = anchor.getBoundingClientRect(); pop.hidden = false; initPicker.hl(3, 3);
    pop.style.left = Math.max(12, Math.min(r.left, innerWidth - pop.offsetWidth - 12)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
  }

  window.UI = { initPicker, pickTable, $, esc, debounce, store, inFrame, toast, dialog, ask, initTheme, bindMenu };
})();
