# Graph Report - Folio  (2026-10-22)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 257 nodes · 516 edges · 21 communities (16 shown, 5 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 59 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8758c4f1`
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
- openSample
- IEEEtran.cls
- NOTICE.md
- sw.js
- build-site.sh

## God Nodes (most connected - your core abstractions)
1. `openProject()` - 19 edges
2. `compile()` - 15 edges
3. `renderTree()` - 13 edges
4. `runCompile()` - 11 edges
5. `openPath()` - 11 edges
6. `db()` - 10 edges
7. `initEditor()` - 10 edges
8. `activate()` - 9 edges
9. `normPath()` - 9 edges
10. `renamePath()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `initEditor()` --indirect_call--> `latexHint()`  [INFERRED]
  js/tex.js → js/tex.js  _Bridges community 1 → community 6_
- `resolveInput()` --indirect_call--> `normPath()`  [INFERRED]
  js/tex.js → js/tex.js  _Bridges community 4 → community 9_
- `openPath()` --calls--> `applyLineMarks()`  [EXTRACTED]
  js/tex.js → js/tex.js  _Bridges community 1 → community 9_
- `loadSynctex()` --calls--> `normPath()`  [EXTRACTED]
  js/tex.js → js/tex.js  _Bridges community 1 → community 4_
- `openProject()` --calls--> `showProblems()`  [EXTRACTED]
  js/tex.js → js/tex.js  _Bridges community 1 → community 7_

## Import Cycles
- None detected.

## Communities (21 total, 5 thin omitted)

### Community 0 - "tex-engine.js"
Cohesion: 0.10
Nodes (37): activate(), applyZoom(), boot(), buildToc(), copyText(), download(), exportHtml(), formatRows() (+29 more)

### Community 1 - "package.json"
Cohesion: 0.13
Nodes (19): applyLineMarks(), editable(), figureSnippet(), insertBlock(), insertHeading(), insertTexTable(), latexHint(), loadSynctex() (+11 more)

### Community 2 - "build-mirror.cjs"
Cohesion: 0.22
Nodes (23): armIdle(), cacheStats(), call(), clearCache(), compile(), db(), deleteProject(), emit() (+15 more)

### Community 3 - "tex.js"
Cohesion: 0.09
Nodes (18): BARE_NAME_FORMATS, basic, { cd, meta }, chunk(), data, FMT, formatsFor(), IMG (+10 more)

### Community 4 - "markdown.js"
Cohesion: 0.23
Nodes (18): addFiles(), addImage(), dirHandleFor(), newFile(), newFolder(), nodeMenu(), normPath(), refresh() (+10 more)

### Community 5 - "ui.js"
Cohesion: 0.12
Nodes (16): dependencies, codemirror, dompurify, @highlightjs/cdn-assets, marked, pdfjs-dist, description, license (+8 more)

### Community 6 - "folio-tex-worker.js"
Cohesion: 0.19
Nodes (15): clearPdf(), collectFiles(), compile(), enter(), indexProject(), init(), initEditor(), markStale() (+7 more)

### Community 7 - "Folio — Markdown y LaTeX en tu escritorio"
Cohesion: 0.30
Nodes (12): copyProjectToFolder(), newProject(), onDrop(), openFileHandle(), openFolderDialog(), openFromLaunch(), openProject(), projectIdFor() (+4 more)

### Community 8 - "minilz4.cjs"
Cohesion: 0.25
Nodes (11): addLinks(), cssScale(), freeFarPages(), goDest(), relayout(), renderPage(), setView(), showPdf() (+3 more)

### Community 9 - "Folio — sistema visual"
Cohesion: 0.22
Nodes (10): bracedArg(), deletePath(), detectMain(), insertFigure(), openPath(), outlineActive(), outsideBlocks(), renderOutline() (+2 more)

### Community 10 - "IEEEtran.cls"
Cohesion: 0.24
Nodes (3): applyTheme(), initTheme(), toast()

### Community 11 - "NOTICE.md"
Cohesion: 0.22
Nodes (8): 1. Publicarla (una sola vez, unos 10 minutos), 2. Instalarla en Windows, 3. Uso, Abrir archivos con clic derecho, Actualizar, Descargas y memoria, Folio — Markdown y LaTeX en tu escritorio, Licencia

### Community 12 - "home.js"
Cohesion: 0.33
Nodes (4): collectNew(), known, knownMisses, parseRemoteName()

### Community 13 - "shell.js"
Cohesion: 0.29
Nodes (6): Color, Disposición, Folio — sistema visual, Forma y profundidad, Movimiento, Tipografía

### Community 14 - "sw.js"
Cohesion: 0.48
Nodes (5): ago(), paint(), removeItem(), render(), row()

### Community 16 - "openSample"
Cohesion: 0.67
Nodes (4): appDir(), openSample(), resetSample(), samplePlotPng()

## Knowledge Gaps
- **7 isolated node(s):** `insert`, `update`, `codemirror`, `dompurify`, `@highlightjs/cdn-assets` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 73 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `scanDir()` connect `markdown.js` to `package.json`, `Folio — Markdown y LaTeX en tu escritorio`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `insert`, `update`, `codemirror` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `tex-engine.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10452961672473868 - nodes in this community are weakly interconnected._
- **Why does `openProject()` connect `Folio — Markdown y LaTeX en tu escritorio` to `package.json`, `markdown.js`, `folio-tex-worker.js`, `Folio — sistema visual`, `openSample`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `tex.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09333333333333334 - nodes in this community are weakly interconnected._
- **Should `ui.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._