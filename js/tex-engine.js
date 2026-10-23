/* Folio — LaTeX engine manager
 * - One long-lived compile worker (BusyTeX pdfTeX, TeX Live 2026).
 * - TeX Live base package (~93 MB) is cached by Emscripten in IndexedDB (EM_PRELOAD_CACHE).
 * - Files fetched on demand from ./texmf/ are stored once in IndexedDB ("folio-tex"/"texmf")
 *   and handed back to every new worker, so they are shared by all projects and never
 *   downloaded twice. Misses (404) are remembered too.
 * - Memory: compiles are serialized (latest request wins), the worker is recycled after
 *   RECYCLE_AFTER compiles or any failure, and shut down after IDLE_MS without use.
 */
(function () {
  'use strict';
  const ENGINE_VERSION = 'busytex-1.4.1';
  const BASE = new URL('busytex/', document.baseURI).href;
  const ENDPOINT = new URL('texmf/', document.baseURI).href;
  const PRELOAD = [BASE + 'texlive-basic.js'];
  const IDLE_MS = 10 * 60 * 1000;
  const RECYCLE_AFTER = 30;
  const INIT_TIMEOUT = 180000;
  const COMPILE_TIMEOUT = 180000;
  const CACHE_CAP = 250 * 1024 * 1024;

  /* ---------- IndexedDB ---------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open('folio-tex', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('texmf')) d.createObjectStore('texmf', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbp;
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const txDone = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  async function kvGet(k) { const d = await db(); return reqP(d.transaction('kv').objectStore('kv').get(k)); }
  async function kvSet(k, v) { const d = await db(); const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); return txDone(t); }

  const FolioDB = {
    db, kvGet, kvSet,
    async projects() { const d = await db(); return reqP(d.transaction('projects').objectStore('projects').getAll()); },
    async putProject(p) { const d = await db(); const t = d.transaction('projects', 'readwrite'); t.objectStore('projects').put(p); return txDone(t); },
    async deleteProject(id) { const d = await db(); const t = d.transaction('projects', 'readwrite'); t.objectStore('projects').delete(id); return txDone(t); }
  };

  async function cacheStats() {
    const s = await kvGet('texmf-stats');
    return s || { count: 0, bytes: 0 };
  }
  async function readCache() {
    const d = await db();
    const all = await reqP(d.transaction('texmf').objectStore('texmf').getAll());
    return all;
  }
  async function writeCache(files) {
    if (!files.length) return;
    const d = await db();
    const stats = await cacheStats();
    const t = d.transaction('texmf', 'readwrite');
    const st = t.objectStore('texmf');
    const now = Date.now();
    for (const f of files) {
      st.put({ key: f.format + '/' + f.name, format: f.format, name: f.name, data: f.contents, size: f.contents.byteLength, t: now });
      stats.count++; stats.bytes += f.contents.byteLength;
    }
    await txDone(t);
    await kvSet('texmf-stats', stats);
    if (stats.bytes > CACHE_CAP) await trimCache();
  }
  async function trimCache() {
    const all = (await readCache()).sort((a, b) => a.t - b.t);
    let bytes = all.reduce((a, f) => a + f.size, 0);
    const d = await db(); const t = d.transaction('texmf', 'readwrite'); const st = t.objectStore('texmf');
    let count = all.length;
    for (const f of all) { if (bytes <= CACHE_CAP * 0.8) break; st.delete(f.key); bytes -= f.size; count--; }
    await txDone(t);
    await kvSet('texmf-stats', { count, bytes });
  }
  async function clearCache(includeBase) {
    const d = await db();
    const t = d.transaction(['texmf', 'kv'], 'readwrite');
    t.objectStore('texmf').clear();
    t.objectStore('kv').delete('texmf-stats');
    t.objectStore('kv').delete('texmf-misses');
    await txDone(t);
    if (includeBase) await new Promise(res => { const r = indexedDB.deleteDatabase('EM_PRELOAD_CACHE'); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  }
  async function ensureVersion() {
    let mirror = '';
    try { const r = await fetch(ENDPOINT + 'index.json', { cache: 'no-cache' }); if (r.ok) mirror = (await r.json()).built || ''; } catch (e) { }
    const want = ENGINE_VERSION + '|' + mirror;
    const have = await kvGet('texmf-version');
    if (have && mirror && have !== want) {
      const engineChanged = have.split('|')[0] !== ENGINE_VERSION;
      await clearCache(engineChanged);
    }
    if (mirror || !have) await kvSet('texmf-version', want);
  }

  /* ---------- engine ---------- */
  const listeners = new Set();
  const state = { status: 'off', detail: '', progress: null, compiles: 0 };
  function emit(patch) { Object.assign(state, patch); listeners.forEach(fn => { try { fn({ ...state }); } catch (e) { } }); }

  let worker = null, starting = null, idleTimer = null, seq = 1;
  const waiters = new Map();
  let running = null, pending = null;

  function terminate(reason) {
    if (worker) { worker.terminate(); worker = null; }
    starting = null; state.compiles = 0;
    for (const [, w] of waiters) w.reject(new Error(reason || 'Motor reiniciado'));
    waiters.clear();
    emit({ status: 'off', detail: reason || '', progress: null });
  }
  function armIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!running && !pending) terminate('Motor en reposo para liberar memoria'); }, IDLE_MS); }

  function call(cmd, payload, transfer, timeout) {
    const id = seq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(id); reject(new Error('timeout')); }, timeout || 60000);
      waiters.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
      worker.postMessage(Object.assign({ cmd, id }, payload), transfer || []);
    });
  }

  function onMessage({ data }) {
    if (data.type === 'print') {
      const m = /^(?:Preparing|Downloading data)\.\.\. \((\d+)\/(\d+)\)$/.exec(data.msg);
      if (m) emit({ progress: { loaded: +m[1], total: +m[2] }, detail: 'Descargando la base de TeX Live (solo la primera vez)' });
      return;
    }
    const w = waiters.get(data.id);
    if (!w) return;
    waiters.delete(data.id);
    if (data.type === 'error') w.reject(new Error(data.message)); else w.resolve(data);
  }

  async function registerCache() {
    const files = await readCache();
    const misses = (await kvGet('texmf-misses')) || [];
    if (!files.length && !misses.length) return 0;
    const transfer = [];
    const payload = files.map(f => { const c = new Uint8Array(f.data); transfer.push(c.buffer); return { name: f.name, format: f.format, contents: c }; });
    await call('register', { files: payload, misses }, transfer, 60000);
    return files.length;
  }

  function start() {
    if (worker && !starting) return Promise.resolve();
    if (starting) return starting;
    emit({ status: 'starting', detail: 'Iniciando el motor LaTeX', progress: null });
    starting = (async () => {
      await ensureVersion().catch(() => { });
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
      worker = new Worker(BASE + 'folio-tex-worker.js');
      worker.onmessage = onMessage;
      worker.onerror = e => { e.preventDefault && e.preventDefault(); terminate('El motor se detuvo inesperadamente'); };
      const id = seq++;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiters.delete(id); reject(new Error('El motor tardó demasiado en iniciar. Revisa tu conexión.')); }, INIT_TIMEOUT);
        waiters.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
        worker.postMessage({ cmd: 'init', id, busytex_js: BASE + 'busytex.js', busytex_wasm: BASE + 'busytex.wasm', preload: PRELOAD });
      });
      const n = await registerCache();
      starting = null;
      emit({ status: 'ready', detail: n ? `Motor listo · ${n} archivos de paquetes en caché` : 'Motor listo', progress: null });
      armIdle();
    })().catch(err => { terminate(err.message); throw err; });
    return starting;
  }

  async function runCompile(req) {
    await start();
    emit({ status: 'compiling', detail: 'Compilando…' });
    const t0 = performance.now();
    const transfer = [];
    const files = req.files.map(f => {
      if (typeof f.contents === 'string') return f;
      const c = f.contents instanceof Uint8Array ? f.contents : new Uint8Array(f.contents);
      transfer.push(c.buffer); return { path: f.path, contents: c };
    });
    let res;
    try {
      res = await call('compile', { files, main: req.main, endpoint: ENDPOINT }, transfer, COMPILE_TIMEOUT);
    } catch (err) {
      terminate(err.message === 'timeout' ? 'La compilación tardó demasiado; se reinició el motor' : err.message);
      throw new Error(err.message === 'timeout' ? 'La compilación superó 3 minutos y se canceló.' : err.message);
    }
    state.compiles++;
    const ms = performance.now() - t0;
    writeCache(res.newFiles || []).catch(() => { });
    if (res.newMisses && res.newMisses.length) {
      kvGet('texmf-misses').then(m => kvSet('texmf-misses', Array.from(new Set([...(m || []), ...res.newMisses])))).catch(() => { });
    }
    if (res.moduleReloaded && state.compiles > 1) registerCache().catch(() => { });
    emit({ status: 'ready', detail: `Compilado en ${(ms / 1000).toFixed(1)} s` + ((res.newFiles || []).length ? ` · ${res.newFiles.length} archivos nuevos guardados en caché` : '') });
    if (state.compiles >= RECYCLE_AFTER) terminate('Motor reciclado para liberar memoria');
    else armIdle();
    return { ok: res.exit_code === 0 && !!res.pdf, exitCode: res.exit_code, pdf: res.pdf || null, synctex: res.synctex || null, log: res.log || '', ms, fetched: (res.newFiles || []).length };
  }

  // Serialized queue: one compile at a time, the newest pending request replaces older ones.
  function compile(req) {
    return new Promise((resolve, reject) => {
      const job = { req, resolve, reject };
      if (running) {
        if (pending) pending.resolve({ superseded: true });
        pending = job; return;
      }
      run(job);
    });
  }
  function run(job) {
    running = job;
    runCompile(job.req).then(job.resolve, job.reject).finally(() => {
      running = null;
      if (pending) { const next = pending; pending = null; run(next); }
    });
  }

  window.FolioDB = FolioDB;
  window.FolioTex = {
    compile, start,
    stop: () => terminate('Motor detenido'),
    onState(fn) { listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); },
    get state() { return { ...state }; },
    cacheStats, clearCache: async (all) => { terminate('Caché borrada'); await clearCache(all); },
    endpoint: ENDPOINT
  };
})();
