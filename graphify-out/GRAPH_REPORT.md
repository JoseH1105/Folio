# Graph Report - Folio  (2026-10-22)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 177 nodes · 275 edges · 16 communities (11 shown, 5 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `aa26a28d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- tex-engine.js
- package.json
- build-mirror.cjs
- tex.js
- markdown.js
- ui.js
- folio-tex-worker.js
- Folio — Markdown y LaTeX en tu escritorio
- minilz4.cjs
- Folio — sistema visual
- IEEEtran.cls
- NOTICE.md
- home.js
- shell.js
- sw.js
- build-site.sh

## God Nodes (most connected - your core abstractions)
1. `runCompile()` - 11 edges
2. `db()` - 10 edges
3. `activate()` - 9 edges
4. `setMode()` - 8 edges
5. `start()` - 7 edges
6. `Folio — Markdown y LaTeX en tu escritorio` - 7 edges
7. `replaceRange()` - 6 edges
8. `save()` - 6 edges
9. `emit()` - 6 edges
10. `kvGet()` - 6 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (16 total, 5 thin omitted)

### Community 0 - "tex-engine.js"
Cohesion: 0.10
Nodes (37): activate(), applyZoom(), boot(), buildToc(), copyText(), download(), exportHtml(), formatRows() (+29 more)

### Community 1 - "package.json"
Cohesion: 0.22
Nodes (23): armIdle(), cacheStats(), call(), clearCache(), compile(), db(), deleteProject(), emit() (+15 more)

### Community 2 - "build-mirror.cjs"
Cohesion: 0.12
Nodes (14): BARE_NAME_FORMATS, basic, { cd, meta }, chunk(), data, FMT, formatsFor(), IMG (+6 more)

### Community 3 - "tex.js"
Cohesion: 0.12
Nodes (16): dependencies, codemirror, dompurify, @highlightjs/cdn-assets, marked, pdfjs-dist, description, license (+8 more)

### Community 4 - "markdown.js"
Cohesion: 0.22
Nodes (11): detectMain(), dirHandleFor(), openFileHandle(), openFolderDialog(), openProject(), projectIdFor(), reopen(), scanDir() (+3 more)

### Community 5 - "ui.js"
Cohesion: 0.24
Nodes (3): applyTheme(), initTheme(), toast()

### Community 6 - "folio-tex-worker.js"
Cohesion: 0.22
Nodes (8): 1. Publicarla (una sola vez, unos 10 minutos), 2. Instalarla en Windows, 3. Uso, Abrir archivos con clic derecho, Actualizar, Descargas y memoria, Folio — Markdown y LaTeX en tu escritorio, Licencia

### Community 7 - "Folio — Markdown y LaTeX en tu escritorio"
Cohesion: 0.33
Nodes (4): collectNew(), known, knownMisses, parseRemoteName()

### Community 8 - "minilz4.cjs"
Cohesion: 0.29
Nodes (6): Color, Disposición, Folio — sistema visual, Forma y profundidad, Movimiento, Tipografía

### Community 9 - "Folio — sistema visual"
Cohesion: 0.48
Nodes (5): ago(), paint(), removeItem(), render(), row()

### Community 10 - "IEEEtran.cls"
Cohesion: 0.38
Nodes (4): assert(), compress(), compressBlock(), compressPackage()

## Knowledge Gaps
- **7 isolated node(s):** `insert`, `update`, `codemirror`, `dompurify`, `@highlightjs/cdn-assets` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 71 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `insert`, `update`, `codemirror` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `tex-engine.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10452961672473868 - nodes in this community are weakly interconnected._
- **Should `build-mirror.cjs` be split into smaller, more focused modules?**
  _Cohesion score 0.12418300653594772 - nodes in this community are weakly interconnected._
- **Should `tex.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._