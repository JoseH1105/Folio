/* Folio — Visual mode for the CodeMirror editors (LaTeX and Markdown).
   Decorations only: the document text is never changed. Markup is hidden or replaced by
   widgets (headings, bold, lists, rendered math, images, citations); the lines holding a
   cursor always show their raw code so editing stays exact. Only the visible part of the
   document (plus a margin) is decorated, and it is redone after edits and scrolling. */
(function () {
  'use strict';
  const MARGIN = 30;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ---------- math (KaTeX) ---------- */
  const mathCache = new Map();
  function renderMath(tex, display) {
    const key = (display ? 'D' : 'I') + tex;
    let html = mathCache.get(key);
    if (html == null) {
      try { html = window.katex ? katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false }) : null; }
      catch (e) { html = null; }
      if (mathCache.size > 800) mathCache.clear();
      mathCache.set(key, html);
    }
    if (!html) return null;
    const w = el(display ? 'div' : 'span', display ? 'cm-v-math cm-v-display' : 'cm-v-math');
    w.innerHTML = html;
    return w;
  }
  const cleanMath = s => s.replace(/\\label\s*\{[^}]*\}/g, '').replace(/\\(nonumber|notag)\b/g, '').trim();

  // balanced {...} starting at the '{' at index i of s; returns index after '}' or -1
  function closeBrace(s, i) {
    let d = 0;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (c === '\\') { j++; continue; }
      if (c === '{') d++; else if (c === '}' && --d === 0) return j + 1;
    }
    return -1;
  }
  const commentAt = s => { for (let i = 0; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === '%') return i; } return -1; };

  function attach(cm, kind, opts = {}) {
    let on = false, marks = [], lineCls = [], timer = null, lastCursorKey = '';
    const imgCache = new Map();
    const doc = () => cm.getDoc();

    function clear() {
      for (const m of marks) m.clear();
      for (const [d, h, c] of lineCls) d.removeLineClass(h, 'wrap', c);
      marks = []; lineCls = [];
    }
    function cursorLines() {
      const set = new Set();
      for (const r of doc().listSelections()) { const a = Math.min(r.anchor.line, r.head.line), b = Math.max(r.anchor.line, r.head.line); for (let l = a; l <= b; l++) set.add(l); }
      return set;
    }
    // decoration helpers handed to the language decorators
    const api = {
      hide(line, a, b) { if (b > a) marks.push(cm.markText({ line, ch: a }, { line, ch: b }, { replacedWith: el('span', 'cm-v-hidden'), handleMouseEvents: false })); },
      style(line, a, b, cls) { if (b > a) marks.push(cm.markText({ line, ch: a }, { line, ch: b }, { className: cls })); },
      widget(from, to, node) { node.classList.add('cm-v-widget'); const m = cm.markText(from, to, { replacedWith: node, handleMouseEvents: false }); marks.push(m); return m; },
      // an image inside a widget: resolved sources are remembered so redecorating never reloads them,
      // and a load only re-measures its own line (a full refresh would redecorate and loop)
      image(box, mark, key, resolve, alt) {
        const put = url => { const img = el('img'); img.alt = alt; img.onload = () => mark.changed(); img.src = url; box.replaceChildren(img); };
        if (imgCache.has(key)) { const url = imgCache.get(key); if (url) put(url); return; }
        Promise.resolve(resolve()).then(url => { imgCache.set(key, url || ''); if (url && mark.find()) put(url); }).catch(() => imgCache.set(key, ''));
      },
      line(line, cls) { const d = doc(), h = d.getLineHandle(line); if (!h) return; d.addLineClass(h, 'wrap', cls); lineCls.push([d, h, cls]); },
      el, renderMath, cleanMath, closeBrace, commentAt, cm, opts
    };

    function pass() {
      timer = null;
      if (!on) return;
      const vp = cm.getViewport(), n = cm.lineCount();
      const from = Math.max(0, vp.from - MARGIN), to = Math.min(n, vp.to + MARGIN);
      const cur = cursorLines();
      lastCursorKey = [...cur].join(',');
      cm.operation(() => {
        clear();
        try { (kind === 'tex' ? decorateTex : decorateMd)(api, from, to, cur); } catch (e) { console.warn('visual', e); }
      });
    }
    const schedule = ms => { if (!on) return; clearTimeout(timer); timer = setTimeout(pass, ms); };
    cm.on('viewportChange', () => schedule(60));
    cm.on('changes', () => schedule(160));
    cm.on('swapDoc', () => { marks = []; lineCls = []; imgCache.clear(); schedule(0); });
    cm.on('cursorActivity', () => { if (on && [...cursorLines()].join(',') !== lastCursorKey) schedule(0); });

    return {
      get on() { return on; },
      set(v) {
        on = !!v;
        cm.getWrapperElement().classList.toggle('cm-visual', on);
        cm.getWrapperElement().classList.toggle('cm-visual-' + kind, on);
        if (on) pass(); else { clearTimeout(timer); cm.operation(clear); }
        setTimeout(() => cm.refresh(), 0);
      },
      refresh() { schedule(0); }
    };
  }

  /* ================= LaTeX ================= */
  const SECTION = { part: 'h0', chapter: 'h1', section: 'h2', subsection: 'h3', subsubsection: 'h4', paragraph: 'h5', subparagraph: 'h5' };
  const MATH_ENVS = /^(equation|align|gather|multline|flalign|eqnarray|displaymath|math)\*?$/;
  const ENV_LABEL = { itemize: 'Lista', enumerate: 'Lista numerada', description: 'Descripción', figure: 'Figura', 'figure*': 'Figura', table: 'Tabla', 'table*': 'Tabla', center: 'Centrado', quote: 'Cita', quotation: 'Cita', verbatim: 'Código', lstlisting: 'Código', tabular: 'Tabla', tabularx: 'Tabla', minipage: 'Bloque', subfigure: 'Subfigura', IEEEkeywords: 'Palabras clave', keywords: 'Palabras clave', document: 'Documento' };
  const STYLE_CMDS = { textbf: 'cm-v-b', textit: 'cm-v-i', emph: 'cm-v-i', textsl: 'cm-v-i', underline: 'cm-v-u', texttt: 'cm-v-tt', textsc: 'cm-v-sc', caption: 'cm-v-caption', title: 'cm-v-title-t', author: 'cm-v-author-t', date: 'cm-v-author-t' };

  const SWITCH = { justifying: 'texto justificado', centering: 'centrado', raggedright: 'alineado a la izquierda', raggedleft: 'alineado a la derecha', newpage: 'salto de página', clearpage: 'salto de página', pagebreak: 'salto de página', tableofcontents: 'Índice', listoffigures: 'Lista de figuras', listoftables: 'Lista de tablas', appendix: 'Apéndices', bigskip: 'espacio', medskip: 'espacio', smallskip: 'espacio', noindent: '', hline: '', toprule: '', midrule: '', bottomrule: '' };
  // \title, \author, \date from the preamble, rendered where \maketitle sits
  function titleBlock(cm, docBegin, el) {
    const pre = []; for (let l = 0; l < (docBegin > 0 ? docBegin : Math.min(cm.lineCount(), 200)); l++) pre.push(cm.getLine(l));
    const text = pre.map(l => { const c = commentAt(l); return c >= 0 ? l.slice(0, c) : l; }).join('\n');
    const arg = name => {
      const m = new RegExp('\\\\' + name + '\\s*(?:\\[[^\\]]*\\])?\\s*\\{').exec(text); if (!m) return null;
      const end = closeBrace(text, m.index + m[0].length - 1); if (end < 0) return null;
      return text.slice(m.index + m[0].length, end - 1);
    };
    const plain = t => t.replace(/\\\\(\[[^\]]*\])?/g, '\n').replace(/\\and\b/g, '\n').replace(/\\(textbf|textit|emph|large|Large|LARGE|small|footnotesize)\b\s*/g, '').replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?\{([^{}]*)\}/g, '$2').replace(/\\[a-zA-Z]+\*?/g, '').replace(/[{}~]/g, ' ').replace(/[ \t]+/g, ' ').trim();
    const box = el('div', 'cm-v-titleblock');
    const t = arg('title'), a = arg('author'); let d = arg('date');
    if (d != null && /\\today/.test(d)) d = new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
    if (t) box.append(el('div', 'cm-v-tb-title', plain(t)));
    if (a) box.append(el('div', 'cm-v-tb-author', plain(a)));
    if (d) box.append(el('div', 'cm-v-tb-date', plain(d)));
    if (!box.children.length) box.append(el('span', 'cm-v-env', 'Título del documento'));
    return box;
  }

  function decorateTex(v, from, to, cur) {
    const { cm, el } = v, n = cm.lineCount();
    const L = i => cm.getLine(i);
    // whole-document scan: preamble end, environments (for math blocks, lists and verbatim)
    let docBegin = -1, docEnd = -1;
    const blocks = [];                    // math blocks {a, b, env, body}
    const itemNo = new Map(), envAt = new Map();
    const stack = [], verbatim = new Set();
    let inVerb = null, mathOpen = null;
    const scanTo = Math.min(n, to + 400);
    for (let i = 0; i < scanTo; i++) {
      const raw = L(i), c = commentAt(raw), s = c >= 0 ? raw.slice(0, c) : raw;
      if (inVerb) { verbatim.add(i); if (new RegExp('\\\\end\\{' + inVerb.replace('*', '\\*') + '\\}').test(raw)) inVerb = null; continue; }
      if (docBegin < 0 && /\\begin\{document\}/.test(s)) docBegin = i;
      if (/\\end\{document\}/.test(s)) docEnd = i;
      if (!mathOpen && /^\s*\\\[\s*$/.test(s)) { mathOpen = { a: i, env: '\\[' }; continue; }
      if (mathOpen && mathOpen.env === '\\[') { if (/\\\]/.test(s)) { blocks.push({ a: mathOpen.a, b: i, env: 'displaymath' }); mathOpen = null; } continue; }
      const re = /\\(begin|end)\{([^}]+)\}/g; let m;
      while ((m = re.exec(s))) {
        const env = m[2];
        if (m[1] === 'begin') {
          if (/^(verbatim|lstlisting|minted)$/.test(env)) { inVerb = env; verbatim.add(i); break; }
          if (MATH_ENVS.test(env) && !mathOpen && !stack.some(e => MATH_ENVS.test(e.env))) mathOpen = { a: i, env };
          stack.push({ env, count: 0 });
        } else {
          const k = stack.map(e => e.env).lastIndexOf(env); if (k >= 0) stack.splice(k);
          if (mathOpen && env === mathOpen.env) { blocks.push({ a: mathOpen.a, b: i, env }); mathOpen = null; }
        }
      }
      if (/\\item\b/.test(s)) { const top = [...stack].reverse().find(e => /^(itemize|enumerate|description)$/.test(e.env)); if (top) { top.count++; itemNo.set(i, top.env === 'enumerate' ? top.count + '.' : top.env === 'description' ? '' : '•'); } }
      envAt.set(i, stack.length ? stack[stack.length - 1].env : '');
    }
    const touches = (a, b) => { for (let l = a; l <= b; l++) if (cur.has(l)) return true; return false; };
    const done = new Set();

    // preamble: one quiet row until the cursor enters it
    if (docBegin > 0 && from <= docBegin && !touches(0, docBegin)) {
      const w = el('div', 'cm-v-preamble');
      w.append(el('span', 'cm-v-pill', 'Preámbulo'), el('span', 'cm-v-muted', `${docBegin + 1} líneas de configuración · clic para editarlas`));
      v.widget({ line: 0, ch: 0 }, { line: docBegin, ch: L(docBegin).length }, w);
      for (let l = 0; l <= docBegin; l++) done.add(l);
    }
    // display math blocks rendered as a whole
    for (const bk of blocks) {
      if (bk.b < from || bk.a > to || touches(bk.a, bk.b)) continue;
      const lines = []; for (let l = bk.a; l <= bk.b; l++) lines.push(L(l));
      let body = lines.join('\n');
      if (bk.env === 'displaymath' && /^\s*\\\[/.test(lines[0])) body = body.replace(/^\s*\\\[/, '').replace(/\\\]\s*$/, '');
      else body = body.replace(new RegExp('^[\\s\\S]*?\\\\begin\\{' + bk.env.replace('*', '\\*') + '\\}'), '').replace(new RegExp('\\\\end\\{' + bk.env.replace('*', '\\*') + '\\}[\\s\\S]*$'), '');
      const label = (body.match(/\\label\s*\{([^}]*)\}/) || [])[1];
      const base = bk.env.replace('*', '');
      const tex = cleanMath(body);
      const wrapped = base === 'align' || base === 'flalign' || base === 'eqnarray' ? `\\begin{aligned}${tex}\\end{aligned}` : base === 'gather' || base === 'multline' ? `\\begin{gathered}${tex}\\end{gathered}` : tex;
      const m = v.renderMath(wrapped, true); if (!m) continue;
      const box = el('div', 'cm-v-eq'); box.append(m);
      if (label) box.append(el('span', 'cm-v-eqlabel', label));
      v.widget({ line: bk.a, ch: 0 }, { line: bk.b, ch: L(bk.b).length }, box);
      for (let l = bk.a; l <= bk.b; l++) done.add(l);
    }

    for (let i = from; i < to; i++) {
      if (verbatim.has(i)) { v.line(i, 'cm-v-codeline'); continue; }
      if (done.has(i) || cur.has(i)) continue;
      const raw = L(i), c = commentAt(raw);
      if (c >= 0) { if (!raw.slice(0, c).trim()) { v.line(i, 'cm-v-comment-line'); continue; } v.style(i, c, raw.length, 'cm-v-comment'); }
      const s = c >= 0 ? raw.slice(0, c) : raw;
      if (i === docBegin || i === docEnd) { if (/^\s*\\(begin|end)\{document\}\s*$/.test(s)) v.widget({ line: i, ch: 0 }, { line: i, ch: s.length }, el('span', 'cm-v-env', i === docBegin ? 'Inicio del documento' : 'Fin del documento')); continue; }

      // math on the line ($…$ and \(…\)) — collected first so other decorations skip it
      const busy = [];
      const reM = /(?<!\\)\$([^$]+?)(?<!\\)\$|\\\((.+?)\\\)/g; let mm;
      while ((mm = reM.exec(s))) {
        const w = v.renderMath(cleanMath(mm[1] || mm[2]), false);
        if (w) { v.widget({ line: i, ch: mm.index }, { line: i, ch: mm.index + mm[0].length }, w); busy.push([mm.index, mm.index + mm[0].length]); }
      }
      const free = (a, b) => !busy.some(([x, y]) => a < y && b > x);

      // sectioning: heading line with the command and braces hidden
      let mh = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(?:\[[^\]]*\])?\s*\{/.exec(s);
      if (mh && free(mh.index, mh.index + mh[0].length)) {
        const open = mh.index + mh[0].length - 1, close = closeBrace(s, open);
        if (close > 0) { v.line(i, 'cm-v-' + SECTION[mh[1]]); v.hide(i, mh.index, open + 1); v.hide(i, close - 1, close); busy.push([mh.index, open + 1], [close - 1, close]); }
      }
      // environments on their own line
      const me = /^(\s*)\\(begin|end)\{([^}]+)\}((?:\[[^\]]*\]|\{[^}]*\})*)\s*$/.exec(s);
      if (me) {
        const env = me[3];
        if (env === 'abstract') {
          v.widget({ line: i, ch: 0 }, { line: i, ch: s.length }, me[2] === 'begin' ? el('div', 'cm-v-abstract', v.opts.abstractName ? v.opts.abstractName() : 'Resumen') : el('div', 'cm-v-rule'));
        } else {
          const name = ENV_LABEL[env] || env;
          v.widget({ line: i, ch: me[1].length }, { line: i, ch: s.length }, el('span', 'cm-v-env' + (me[2] === 'end' ? ' end' : ''), me[2] === 'begin' ? name : 'fin · ' + name));
        }
        continue;
      }
      // list items
      const mi = /\\item\b\s*(\[[^\]]*\])?\s*/.exec(s);
      if (mi && itemNo.has(i) && free(mi.index, mi.index + mi[0].length)) {
        const lab = mi[1] ? mi[1].slice(1, -1) : itemNo.get(i);
        v.widget({ line: i, ch: mi.index }, { line: i, ch: mi.index + mi[0].length }, el('span', 'cm-v-bullet' + (mi[1] ? ' named' : ''), lab || '•'));
        busy.push([mi.index, mi.index + mi[0].length]);
      }
      // \maketitle shows the title block taken from the preamble
      if (/^\s*\\maketitle\s*$/.test(s)) { v.widget({ line: i, ch: 0 }, { line: i, ch: s.length }, titleBlock(cm, docBegin, el)); continue; }
      // layout switches on their own line → quiet labels
      const ms = /^\s*\\(\w+)\s*$/.exec(s);
      if (ms && SWITCH[ms[1]] !== undefined) {
        if (SWITCH[ms[1]]) v.widget({ line: i, ch: s.indexOf('\\') }, { line: i, ch: s.length }, el('span', 'cm-v-env', SWITCH[ms[1]]));
        else v.line(i, 'cm-v-comment-line');
        continue;
      }
      const mt = /^\s*\\(title|author|date)\s*\{/.exec(s);
      if (mt) v.line(i, 'cm-v-' + mt[1]);
      // inline styling commands
      const reC = /\\(textbf|textit|emph|textsl|underline|texttt|textsc|caption|title|author|date)\s*\{/g; let mc;
      while ((mc = reC.exec(s))) {
        const open = mc.index + mc[0].length - 1, close = closeBrace(s, open);
        if (close < 0 || !free(mc.index, open + 1)) continue;
        v.hide(i, mc.index, open + 1); v.hide(i, close - 1, close);
        v.style(i, open + 1, close - 1, STYLE_CMDS[mc[1]]);
        busy.push([mc.index, open + 1], [close - 1, close]);
      }
      // citations, references, labels → pills
      const reR = /\\(cite[a-zA-Z]*|ref|eqref|autoref|cref|Cref|pageref|label|url)\s*(?:\[[^\]]*\])*\s*\{([^}]*)\}/g; let mr;
      while ((mr = reR.exec(s))) {
        if (!free(mr.index, mr.index + mr[0].length)) continue;
        const k = mr[1], arg = mr[2].split(',').map(x => x.trim()).join(', ');
        const text = /^cite/.test(k) ? `[${arg}]` : k === 'label' ? arg : k === 'url' ? arg : '→ ' + arg;
        v.widget({ line: i, ch: mr.index }, { line: i, ch: mr.index + mr[0].length }, el('span', 'cm-v-ref ' + (/^cite/.test(k) ? 'cite' : k === 'label' ? 'label' : 'ref'), text));
        busy.push([mr.index, mr.index + mr[0].length]);
      }
      // images
      const reG = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g; let mg;
      while ((mg = reG.exec(s))) {
        if (!free(mg.index, mg.index + mg[0].length)) continue;
        const box = el('span', 'cm-v-img');
        box.append(el('span', 'cm-v-muted', mg[1]));
        const mark = v.widget({ line: i, ch: mg.index }, { line: i, ch: mg.index + mg[0].length }, box);
        if (v.opts.image) v.image(box, mark, mg[1], () => v.opts.image(mg[1]), mg[1]);
        busy.push([mg.index, mg.index + mg[0].length]);
      }
      // escaped characters: show the character, not the backslash
      const reE = /\\([%&_#$])/g; let mx;
      while ((mx = reE.exec(s))) if (free(mx.index, mx.index + 2)) v.hide(i, mx.index, mx.index + 1);
    }
  }

  /* ================= Markdown ================= */
  function decorateMd(v, from, to, cur) {
    const { cm, el } = v, L = i => cm.getLine(i);
    // fenced code blocks from the top of the document
    const code = new Set(); let fence = null, fenceStart = -1;
    for (let i = 0; i < Math.min(cm.lineCount(), to); i++) {
      const s = L(i), m = /^\s*(```|~~~)/.exec(s);
      if (fence) { code.add(i); if (m && m[1] === fence) { fence = null; } continue; }
      if (m) { fence = m[1]; fenceStart = i; code.add(i); }
    }
    for (let i = from; i < to; i++) {
      const s = L(i);
      if (code.has(i)) { v.line(i, /^\s*(```|~~~)/.test(s) ? 'cm-v-fence' : 'cm-v-codeline'); continue; }
      if (cur.has(i)) continue;
      // headings
      const h = /^(#{1,6})\s+/.exec(s);
      if (h) { v.line(i, 'cm-v-md-h' + h[1].length); v.hide(i, 0, h[0].length); }
      // horizontal rule
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(s) && !(i > 0 && L(i - 1).trim() && /^-+$/.test(s.trim()))) { v.widget({ line: i, ch: 0 }, { line: i, ch: s.length }, el('div', 'cm-v-rule')); continue; }
      // blockquote
      const q = /^(\s*>\s?)+/.exec(s);
      if (q) { v.line(i, 'cm-v-quote'); v.hide(i, 0, q[0].length); }
      // lists and tasks
      const li = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/.exec(s);
      let start = 0;
      if (li && !h) {
        const a = li[1].length, b = li[0].length;
        if (li[3]) {
          const done = /\[[xX]\]/.test(li[3]);
          const box = el('span', 'cm-v-task' + (done ? ' done' : ''));
          box.setAttribute('role', 'checkbox'); box.setAttribute('aria-checked', String(done));
          const ln = i, at = a + li[2].length + 1 + li[3].indexOf('[') + 1;
          box.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); cm.replaceRange(done ? ' ' : 'x', { line: ln, ch: at }, { line: ln, ch: at + 1 }); });
          v.widget({ line: i, ch: a }, { line: i, ch: b }, box);
          if (done) v.style(i, b, s.length, 'cm-v-done');
        } else v.widget({ line: i, ch: a }, { line: i, ch: b }, el('span', 'cm-v-bullet', /\d/.test(li[2]) ? li[2] : '•'));
        start = b;
      }
      // tables stay as text, in a monospaced grid
      if (/^\s*\|/.test(s)) { v.line(i, 'cm-v-table'); continue; }
      const busy = [];
      const free = (a, b) => !busy.some(([x, y]) => a < y && b > x);
      // inline code first: nothing inside it is formatted
      const reCode = /(`+)([^`]+?)\1/g; let m;
      while ((m = reCode.exec(s))) { if (m.index < start) continue; const k = m[1].length; v.hide(i, m.index, m.index + k); v.style(i, m.index + k, m.index + m[0].length - k, 'cm-v-tt'); v.hide(i, m.index + m[0].length - k, m.index + m[0].length); busy.push([m.index, m.index + m[0].length]); }
      // images and links
      const reImg = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
      while ((m = reImg.exec(s))) {
        if (!free(m.index, m.index + m[0].length)) continue;
        const box = el('span', 'cm-v-img');
        box.append(el('span', 'cm-v-muted', 'Imagen: ' + (m[1] || m[2])));
        const mark = v.widget({ line: i, ch: m.index }, { line: i, ch: m.index + m[0].length }, box);
        if (/^(https?:|data:image\/)/.test(m[2])) v.image(box, mark, m[2], () => m[2], m[1]);
        busy.push([m.index, m.index + m[0].length]);
      }
      const reLink = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
      while ((m = reLink.exec(s))) {
        if (!free(m.index, m.index + m[0].length)) continue;
        const t0 = m.index + 1, t1 = t0 + m[1].length;
        v.hide(i, m.index, t0); v.style(i, t0, t1, 'cm-v-link'); v.hide(i, t1, m.index + m[0].length);
        busy.push([m.index, m.index + m[0].length]);
      }
      // bold, italic, strikethrough
      const inline = [[/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, 'cm-v-b'], [/~~(?=\S)(.+?)(?<=\S)~~/g, 'cm-v-s'], [/(?<![*\w])([*_])(?=\S)([^*_]+?)(?<=\S)\1(?![*\w])/g, 'cm-v-i']];
      for (const [re, cls] of inline) {
        while ((m = re.exec(s))) {
          if (m.index < start || !free(m.index, m.index + m[0].length)) continue;
          const k = cls === 'cm-v-s' ? 2 : m[1].length;
          v.hide(i, m.index, m.index + k); v.style(i, m.index + k, m.index + m[0].length - k, cls); v.hide(i, m.index + m[0].length - k, m.index + m[0].length);
          busy.push([m.index, m.index + k], [m.index + m[0].length - k, m.index + m[0].length]);
        }
      }
    }
  }

  /* segmented Código / Visual control */
  function bindToggle(seg, inst, key) {
    const set = on => { inst.set(on); seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === 'visual') === on))); try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { } };
    seg.addEventListener('mousedown', e => e.preventDefault());
    seg.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) set(b.dataset.v === 'visual'); });
    let saved = null; try { saved = localStorage.getItem(key); } catch (e) { }
    set(saved === '1');
    return set;
  }

  window.FolioVisual = { attach, bindToggle };
})();
