// Folio — LaTeX compile worker built on BusyTeX (TeX Live 2026, AGPL-3.0).
// One long-lived pipeline per worker. Packages fetched on demand from the mirror are
// reported back after each compile (only the new ones) so the page can persist them in
// IndexedDB; on start the page hands the cached files back, so nothing downloads twice.
importScripts('busytex_biber.js');
importScripts('busytex_pipeline.js');

const REMOTE_DIR = '/tmp/texlive_remote';
const MISSES_FILE = REMOTE_DIR + '/.misses.json';
let pipeline = null;
let moduleRef = null;
const known = new Set();     // file names in REMOTE_DIR already reported/registered
let knownMisses = new Set();

const send = (msg, transfer) => postMessage(msg, transfer || []);

async function currentModule() {
  const M = await pipeline.Module;
  if (M !== moduleRef) { moduleRef = M; known.clear(); knownMisses = new Set(); return { M, fresh: true }; }
  return { M, fresh: false };
}

function parseRemoteName(fileName) {
  const m = /^(\d+)_(.+)$/.exec(fileName);
  return m ? { format: +m[1], name: m[2] } : null;
}

function collectNew(M) {
  const { FS } = M;
  const files = [], transfer = [];
  let entries = [];
  try { entries = FS.readdir(REMOTE_DIR); } catch (e) { return { files, misses: [], transfer }; }
  for (const fileName of entries) {
    if (fileName === '.' || fileName === '..' || fileName.startsWith('.') || known.has(fileName)) continue;
    const parsed = parseRemoteName(fileName);
    known.add(fileName);
    if (!parsed) continue;
    const data = FS.readFile(REMOTE_DIR + '/' + fileName);
    const copy = new Uint8Array(data);           // detach from the wasm FS before transferring
    files.push({ name: parsed.name, format: parsed.format, contents: copy });
    transfer.push(copy.buffer);
  }
  let misses = [];
  try {
    M.kpse_remote_register_misses([]);           // flushes the in-memory miss list to MISSES_FILE
    const all = JSON.parse(FS.readFile(MISSES_FILE, { encoding: 'utf8' }));
    misses = all.filter(k => !knownMisses.has(k));
    misses.forEach(k => knownMisses.add(k));
  } catch (e) { }
  return { files, misses, transfer };
}

onmessage = async ({ data }) => {
  const { id, cmd } = data;
  try {
    if (cmd === 'init') {
      pipeline = new BusytexPipeline(
        data.busytex_js, data.busytex_wasm, [], data.preload, [],
        msg => send({ type: 'print', msg }),
        versions => send({ type: 'ready', id, versions }),
        true, BusytexPipeline.ScriptLoaderWorker, null, null, null);
      return;
    }
    if (!pipeline) throw new Error('El motor no está inicializado');

    if (cmd === 'register') {
      const { M } = await currentModule();
      for (const f of data.files || []) {
        const saved = M.kpse_remote_register(f.name, f.format, f.contents);
        known.add(saved.split('/').pop());
      }
      if (data.misses && data.misses.length) { M.kpse_remote_register_misses(data.misses); data.misses.forEach(k => knownMisses.add(k)); }
      send({ type: 'registered', id, count: (data.files || []).length });
      return;
    }

    if (cmd === 'compile') {
      const before = await currentModule();
      const res = await pipeline.compile(data.files, data.main, null, false, null, null, 'silent', 'pdftex_bibtex8', [], data.endpoint, false);
      const after = await currentModule();
      const fresh = before.fresh || after.fresh;
      const { files, misses, transfer } = collectNew(after.M);
      const out = { type: 'compiled', id, exit_code: res.exit_code, log: res.log || '', logs: (res.logs || []).map(l => ({ cmd: l.cmd, exit_code: l.exit_code })), newFiles: files, newMisses: misses, moduleReloaded: fresh };
      if (res.pdf && res.pdf.length) { const pdf = new Uint8Array(res.pdf); out.pdf = pdf; transfer.push(pdf.buffer); }
      // SyncTeX map (PDF position → source line) for double-click navigation
      try {
        const { FS, PATH } = after.M;
        const p = PATH.join(pipeline.project_dir, data.main.replace(/\.tex$/i, '.synctex.gz'));
        if (FS.analyzePath(p).exists) { const st = new Uint8Array(FS.readFile(p)); out.synctex = st; transfer.push(st.buffer); }
      } catch (e) { }
      send(out, transfer);
      return;
    }
    throw new Error('Comando desconocido: ' + cmd);
  } catch (err) {
    send({ type: 'error', id, message: String(err && err.message || err), stack: err && err.stack });
  }
};
