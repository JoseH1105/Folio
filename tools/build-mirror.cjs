// Builds the on-demand TeX Live mirror for Folio.
// Every file present in texlive-extra but missing from texlive-basic (the preloaded
// package) is written to <out>/<kpse-format>/<filename>, which is the URL layout that
// BusyTeX's remote kpathsea expects:  <endpoint>/<format>/<name>
//
// usage: node build-mirror.cjs <busytex-dir> <out-dir> [extra-files-dir]
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./minilz4.cjs');

const [, , dir, out, extraDir] = process.argv;
if (!dir || !out) { console.error('usage: node build-mirror.cjs <busytex-dir> <out-dir> [extra-files-dir]'); process.exit(1); }

function loadMeta(js) {
  const s = fs.readFileSync(js, 'utf8');
  const obj = at => {
    const i = s.indexOf('{', at); let d = 0, inS = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inS) { if (c === '\\') { j++; continue; } if (c === '"') inS = false; continue; }
      if (c === '"') inS = true; else if (c === '{') d++; else if (c === '}') { d--; if (!d) return JSON.parse(s.slice(i, j + 1)); }
    }
    throw new Error('object not found in ' + js);
  };
  return { cd: obj(s.indexOf('compressedData = {')), meta: obj(s.indexOf('loadPackage({"files"')) };
}

// kpathsea format numbers (kpse_file_format_type)
const FMT = {
  tfm: [3], afm: [4], bib: [6], bst: [7], cnf: [8], map: [11], pro: [30], vf: [33],
  pfb: [32], pfa: [32], enc: [44], cmap: [45], lua: [51], luc: [51], fea: [52],
  otf: [47], ttf: [36], ttc: [36], ist: [35],
};
const TEXLIKE = new Set(['tex', 'sty', 'cls', 'clo', 'def', 'cfg', 'fd', 'ldf', 'ltx', 'dfu', 'ini', 'cbx', 'bbx', 'lbx', 'dbx', 'bcx',
  'code', 'lco', 'trsl', 'dict', 'lng', 'lang', 'tikz', 'pgf', 'sfd', 'mkii', 'mkiv', 'gls', 'ist', 'xdy', 'cnf', 'dat', 'lst', 'bug', 'bg2', 'nls', 'ins', 'cmp']);
const IMG = new Set(['pdf', 'png', 'jpg', 'jpeg', 'eps', 'mps', 'jbig2', 'jb2', 'svg']);
const SKIP = new Set(['pfm', 'ps', 'mld', 'mlo', 'hyp', 'txt', 'md', 'html', 'log', 'zip', 'sh', 'pl', 'py']);
function formatsFor(name) {
  const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
  if (FMT[ext] && !TEXLIKE.has(ext)) return FMT[ext];
  if (ext === 'ist') return [35, 26];
  if (ext === 'cnf') return [8, 26];
  if (TEXLIKE.has(ext) || IMG.has(ext)) return [26];
  if (SKIP.has(ext)) return [];
  return [26, 39];
}

const WANT = /\/texmf-dist\/(tex\/(latex|generic|plain)\/|fonts\/(tfm|type1|vf|enc|map)\/|bibtex\/(bst|bib)\/)/;
const basic = new Set(loadMeta(path.join(dir, 'texlive-basic.js')).meta.files.map(f => f.filename));
const { cd, meta } = loadMeta(path.join(dir, 'texlive-extra.js'));
const data = new Uint8Array(fs.readFileSync(path.join(dir, 'texlive-extra.data')));
const CS = L.CHUNK_SIZE; const tmp = new Uint8Array(CS);
let lastIdx = -1, lastChunk = null;
function chunk(i) {
  if (i === lastIdx) return lastChunk;
  const st = cd.offsets[i], sz = cd.sizes[i], c = data.subarray(st, st + sz);
  lastChunk = cd.successes[i] ? tmp.slice(0, L.uncompress(c, tmp)) : c; lastIdx = i; return lastChunk;
}
function read(f) {
  const len = f.end - f.start, o = new Uint8Array(len); let pos = f.start, w = 0;
  while (w < len) { const ci = Math.floor(pos / CS), off = pos % CS, c = chunk(ci), take = Math.min(c.length - off, len - w); o.set(c.subarray(off, off + take), w); w += take; pos += take; }
  return o;
}

const seen = new Set(); let files = 0, bytes = 0, dups = 0;
function put(name, buf) {
  for (const fmt of formatsFor(name)) {
    const key = fmt + '/' + name;
    if (seen.has(key)) { dups++; continue; }
    seen.add(key);
    const p = path.join(out, String(fmt), name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf); files++; bytes += buf.length;
  }
}
for (const f of meta.files) {
  if (basic.has(f.filename) || !WANT.test(f.filename)) continue;
  const name = path.basename(f.filename);
  if (!name || name.startsWith('.') || /[^A-Za-z0-9._+-]/.test(name)) continue;
  put(name, read(f));
}
// Extra files shipped with Folio (e.g. babel-spanish, absent from all BusyTeX collections)
if (extraDir && fs.existsSync(extraDir)) {
  for (const name of fs.readdirSync(extraDir)) {
    const p = path.join(extraDir, name);
    if (fs.statSync(p).isFile()) put(name, new Uint8Array(fs.readFileSync(p)));
  }
}
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ built: new Date().toISOString(), files, bytes }));
console.log(`mirror: ${files} files, ${(bytes / 1e6).toFixed(1)} MB (${dups} duplicate names skipped)`);
