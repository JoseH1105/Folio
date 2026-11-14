/* Folio — Markdown → PDF that looks exactly like the rendered sheet.
   The sheet is cloned into an off-screen A4 stage (always the light "paper" theme), cut into pages
   at line and block boundaries (never through a line of text, a formula or an image), and each
   page is painted by the browser itself (html-to-image, SVG foreignObject) so fonts, KaTeX and
   code highlighting come out as on screen. The PDF file is written here: one JPEG per page plus
   clickable link areas, no other library. */
(function () {
  'use strict';
  // A4 at 96 px/in, the same width as the on-screen sheet (.page max-width: 794px; padding 76px 88px)
  const PW = 794, PH = 1123, MX = 88, MT = 76, MB = 84, CH = PH - MT - MB;
  const SCALE = 2;                               // ≈190 dpi: sharp text, reasonable file size
  const CHUNK = Math.floor(16000 / SCALE);       // html-to-image shrinks canvases above 16384 px
  const PT = 72 / 96;                            // CSS px → PDF points

  let libLoading = null;
  function loadLib() {
    if (window.htmlToImage) return Promise.resolve();
    return libLoading ||= new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = 'vendor/html-to-image.js';
      s.onload = ok; s.onerror = () => { libLoading = null; fail(new Error('No se pudo cargar el generador de PDF.')); };
      document.head.appendChild(s);
    });
  }

  /* ---------- where a page may end ---------- */
  // Every line box (text, inline formulas, images) and every block edge is a candidate; a cut is
  // allowed only where nothing atomic straddles it. Headings and table heads never end a page.
  function layout(stage) {
    const top = stage.getBoundingClientRect().top;
    const atoms = [];                              // [top, bottom] intervals that must not be cut
    const edges = new Set([0]);
    const keepWithNext = [];                       // headings / table heads: a page ending right after one moves before it
    const rel = r => [r.top - top, r.bottom - top];
    const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n; (n = walker.nextNode());) {
      if (!n.data.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.height) atoms.push(rel(r));
    }
    stage.querySelectorAll('img,svg,canvas,video,.katex-display,.katex,input,hr,tr,thead,h1,h2,h3,h4,h5,h6').forEach(el => {
      const r = el.getBoundingClientRect(); if (r.height) atoms.push(rel(r));
    });
    stage.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect(); if (!r.height) return;
      const [a, b] = rel(r); edges.add(a); edges.add(b);
      if (/^(H[1-6]|THEAD)$/.test(el.tagName)) keepWithNext.push([a, b]);
    });
    atoms.forEach(([a, b]) => { edges.add(a); edges.add(b); });
    atoms.sort((x, y) => x[0] - y[0]);
    // merge overlapping atoms into bands; a cut is safe on band edges and in the gaps between them
    const bands = [];
    for (const [a, b] of atoms) {
      const last = bands[bands.length - 1];
      if (last && a < last[1] - 0.5) last[1] = Math.max(last[1], b); else bands.push([a, b]);
    }
    const inside = y => bands.some(([a, b]) => y > a + 0.5 && y < b - 0.5);
    const cuts = [...edges].filter(y => !inside(y)).sort((a, b) => a - b);
    return { cuts, keepWithNext, height: stage.getBoundingClientRect().height };
  }

  function paginate({ cuts, keepWithNext, height }) {
    const pages = [];
    let y = 0;
    while (y < height - 1) {
      const limit = y + CH;
      if (limit >= height) { pages.push([y, height]); break; }
      let end = 0;
      for (const c of cuts) { if (c > limit) break; if (c > y + CH * 0.35) end = c; }
      if (end) {
        // don't leave a heading alone at the bottom: end the page above it
        const h = keepWithNext.find(([a, b]) => a < end && b > end - 40 && a > y + CH * 0.35);
        if (h) end = cuts.filter(c => c <= h[0] + 0.5).pop() || end;
      } else end = limit;                          // nothing fits (a huge image or block): cut it
      pages.push([y, end]);
      // the next page starts at the next content, not in the margin between two blocks
      const next = cuts.find(c => c >= end);
      y = next !== undefined && next - end < 30 ? next : end;
      if (pages.length > 2000) break;
    }
    return pages;
  }

  /* ---------- PDF writer ---------- */
  const enc = new TextEncoder();
  const pdfText = s => '<FEFF' + [...s].map(ch => {
    const c = ch.codePointAt(0);
    if (c < 0x10000) return c.toString(16).padStart(4, '0');
    const v = c - 0x10000; return ((v >> 10) + 0xD800).toString(16) + ((v & 0x3FF) + 0xDC00).toString(16);
  }).join('').toUpperCase() + '>';
  const pdfStr = s => '(' + s.replace(/[\\()]/g, '\\$&') + ')';

  function writePdf(pages, title) {
    const parts = [], offs = []; let len = 0;
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (i, fn) => { offs[i] = len; push(`${i} 0 obj\n`); fn(); push('\nendobj\n'); };
    const W = (PW * PT).toFixed(2), H = (PH * PT).toFixed(2);
    const n = pages.length, per = 3, first = 4;
    let next = first + n * per;                    // link annotations are numbered after the pages
    const annots = pages.map(p => p.links.map(() => next++));
    push('%PDF-1.4\n'); push(new Uint8Array([37, 226, 227, 207, 211, 10]));
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, k) => `${first + k * per} 0 R`).join(' ')}] /Count ${n} >>`));
    obj(3, () => push(`<< /Title ${pdfText(title)} /Producer (Folio) /Creator (Folio) >>`));
    pages.forEach((p, k) => {
      const po = first + k * per, co = po + 1, io = po + 2;
      const a = annots[k].length ? ` /Annots [${annots[k].map(i => `${i} 0 R`).join(' ')}]` : '';
      obj(po, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /P ${io} 0 R >> >> /Contents ${co} 0 R${a} >>`));
      const cs = `q ${W} 0 0 ${H} 0 0 cm /P Do Q`;
      obj(co, () => push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
      obj(io, () => {
        push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
        push(p.jpeg); push('\nendstream');
      });
    });
    pages.forEach((p, k) => p.links.forEach((l, j) => obj(annots[k][j], () => {
      const r = [l.x * PT, (PH - l.y - l.h) * PT, (l.x + l.w) * PT, (PH - l.y) * PT].map(v => v.toFixed(2)).join(' ');
      push(`<< /Type /Annot /Subtype /Link /Rect [${r}] /Border [0 0 0] /A << /S /URI /URI ${pdfStr(l.url)} >> >>`);
    })));
    const xref = len, size = next;
    push(`xref\n0 ${size}\n0000000000 65535 f \n`);
    for (let i = 1; i < size; i++) push(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
    push(`trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  /* ---------- page painting ---------- */
  function footer(ctx, name, i, n) {
    ctx.save(); ctx.scale(SCALE, SCALE);
    const y = PH - 44;
    ctx.strokeStyle = '#DEE2E7'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(MX, y + 0.5); ctx.lineTo(PW - MX, y + 0.5); ctx.stroke();
    ctx.fillStyle = '#687180'; ctx.textBaseline = 'top';
    ctx.font = '11.5px "Geist Variable", Geist, system-ui, "Segoe UI", sans-serif';
    const num = `${i} / ${n}`, nw = ctx.measureText(num).width;
    let label = name;
    while (label.length > 1 && ctx.measureText(label).width > PW - 2 * MX - nw - 24) label = label.slice(0, -2) + '…';
    ctx.fillText(label, MX, y + 11);
    ctx.fillText(num, PW - MX - nw, y + 11);
    ctx.restore();
  }
  const jpegOf = canvas => new Promise((ok, fail) => canvas.toBlob(b => b ? b.arrayBuffer().then(a => ok(new Uint8Array(a)), fail) : fail(new Error('No se pudo pintar la página.')), 'image/jpeg', 0.92));

  function linksOf(stage) {
    const top = stage.getBoundingClientRect().top, left = stage.getBoundingClientRect().left, out = [];
    stage.querySelectorAll('a[href]').forEach(a => {
      let url; try { url = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
      if (!/^(https?|mailto):$/.test(url.protocol)) return;
      for (const r of a.getClientRects()) if (r.width && r.height) out.push({ url: url.href, x: r.left - left + MX, y: r.top - top, w: r.width, h: r.height });
    });
    return out;
  }

  // each @font-face arrives with every format inlined (KaTeX ships woff2, woff and ttf); the
  // browser only needs one, and this CSS is repeated in every painted chunk.
  // (html-to-image's own preferredFontFormat option drops the fonts altogether.)
  const woff2Only = css => css.replace(/src:\s*([^;]+);/g, (m, v) => {
    const alts = v.split(/,\s*(?=url\()/);
    return `src: ${alts.find(a => /format\(["']?woff2/.test(a)) || alts[0]};`;
  });

  /* source: the rendered .doc element; returns a PDF Blob */
  async function build(source, { title, name, onProgress } = {}) {
    await loadLib();
    const host = document.createElement('div'); host.className = 'pdf-stage-host'; host.setAttribute('aria-hidden', 'true');
    const stage = document.createElement('div'); stage.className = 'pdf-stage';
    const doc = source.cloneNode(true);
    doc.removeAttribute('id');
    doc.querySelectorAll('.remote-note, .err-copy').forEach(el => el.remove());
    doc.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    source.querySelectorAll('input[type=checkbox]').forEach((cb, i) => { const c = doc.querySelectorAll('input[type=checkbox]')[i]; if (c) c.checked = cb.checked; });
    stage.appendChild(doc); host.appendChild(stage); document.body.appendChild(host);
    try {
      await document.fonts.ready;
      await Promise.all([...stage.querySelectorAll('img')].map(img => img.decode().catch(() => { })));
      const slices = paginate(layout(stage));
      const links = linksOf(stage);
      const opts = { pixelRatio: SCALE, backgroundColor: '#FFFFFF', cacheBust: false, skipAutoScale: true,
        imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' };
      opts.fontEmbedCSS = woff2Only(await htmlToImage.getFontEmbedCSS(stage, opts));
      // paint in a few tall chunks (one for most documents) and cut the pages out of them
      const chunks = [];
      for (const s of slices) {
        const c = chunks[chunks.length - 1];
        if (c && s[1] - c.y0 <= CHUNK) { c.y1 = s[1]; c.slices.push(s); } else chunks.push({ y0: s[0], y1: s[1], slices: [s] });
      }
      const out = []; let done = 0;
      for (const c of chunks) {
        const h = Math.ceil(c.y1 - c.y0);
        const canvas = await htmlToImage.toCanvas(stage, { ...opts, width: PW - 2 * MX, height: h, canvasWidth: PW - 2 * MX, canvasHeight: h,
          style: { transform: `translateY(${-c.y0}px)`, margin: '0' } });
        for (const [a, b] of c.slices) {
          const pg = document.createElement('canvas'); pg.width = PW * SCALE; pg.height = PH * SCALE;
          const ctx = pg.getContext('2d');
          ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, pg.width, pg.height);
          const sy = Math.round((a - c.y0) * SCALE), sh = Math.min(Math.round((b - a) * SCALE), canvas.height - sy);
          if (sh > 0) ctx.drawImage(canvas, 0, sy, canvas.width, sh, MX * SCALE, MT * SCALE, canvas.width, sh);
          footer(ctx, name || title, out.length + 1, slices.length);
          const pageLinks = links.filter(l => l.y + l.h > a && l.y < b).map(l => ({ ...l, y: l.y - a + MT }))
            .map(l => { const y0 = Math.max(l.y, MT), y1 = Math.min(l.y + l.h, MT + (b - a)); return { ...l, y: y0, h: y1 - y0 }; });
          out.push({ jpeg: await jpegOf(pg), w: pg.width, h: pg.height, links: pageLinks });
          onProgress && onProgress(++done, slices.length);
        }
      }
      return writePdf(out, title || 'Documento');
    } finally { host.remove(); }
  }

  window.MdPdf = { build };
})();
