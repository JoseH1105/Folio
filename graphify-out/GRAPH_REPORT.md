# Graph Report - Folio  (2026-10-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 324 nodes · 602 edges · 24 communities (20 shown, 4 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 63 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0ffc2d69`
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
- NOTICE.md
- sw.js
- build-site.sh

## God Nodes (most connected - your core abstractions)
1. `openProject()` - 19 edges
2. `compile()` - 15 edges
3. `renderTree()` - 13 edges
4. `runCompile()` - 11 edges
5. `openPath()` - 11 edges
6. `initEditor()` - 11 edges
7. `db()` - 10 edges
8. `normPath()` - 10 edges
9. `activate()` - 9 edges
10. `insertFigure()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `initEditor()` --indirect_call--> `latexHint()`  [INFERRED]
  js/tex.js → js/tex.js  _Bridges community 19 → community 8_
- `resolveInput()` --indirect_call--> `normPath()`  [INFERRED]
  js/tex.js → js/tex.js  _Bridges community 5 → community 8_
- `syncFromPdf()` --calls--> `setView()`  [EXTRACTED]
  js/tex.js → js/tex.js  _Bridges community 10 → community 4_
- `compile()` --calls--> `showPdf()`  [EXTRACTED]
  js/tex.js → js/tex.js  _Bridges community 10 → community 9_
- `wrapCmd()` --calls--> `editable()`  [EXTRACTED]
  js/tex.js → js/tex.js  _Bridges community 14 → community 8_

## Import Cycles
- None detected.

## Communities (24 total, 4 thin omitted)

### Community 0 - "tex-engine.js"
Cohesion: 0.07
Nodes (39): activate(), applyMeasure(), applyZoom(), boot(), buildToc(), copyText(), download(), exportHtml() (+31 more)

### Community 1 - "package.json"
Cohesion: 0.06
Nodes (31): runs-on, steps, concurrency, cancel-in-progress, group, environment, needs, runs-on (+23 more)

### Community 2 - "build-mirror.cjs"
Cohesion: 0.22
Nodes (23): armIdle(), cacheStats(), call(), clearCache(), compile(), db(), deleteProject(), emit() (+15 more)

### Community 3 - "tex.js"
Cohesion: 0.09
Nodes (18): BARE_NAME_FORMATS, basic, { cd, meta }, chunk(), data, FMT, formatsFor(), IMG (+10 more)

### Community 4 - "markdown.js"
Cohesion: 0.16
Nodes (13): appDir(), applyLineMarks(), loadSynctex(), openSample(), pdfWordAt(), renderLogList(), resetSample(), samplePlotPng() (+5 more)

### Community 5 - "ui.js"
Cohesion: 0.26
Nodes (19): addFiles(), addImage(), deletePath(), dirHandleFor(), newFile(), newFolder(), nodeMenu(), normPath() (+11 more)

### Community 6 - "folio-tex-worker.js"
Cohesion: 0.14
Nodes (18): dependencies, codemirror@5.65.16, dompurify@3.1.6, @highlightjs/cdn-assets@11.9.0, katex@0.16.11, marked@12.0.2, pdfjs-dist@3.11.174, description (+10 more)

### Community 7 - "Folio — Markdown y LaTeX en tu escritorio"
Cohesion: 0.21
Nodes (14): copyProjectToFolder(), detectMain(), newProject(), openFileHandle(), openFolderDialog(), openFromLaunch(), openProject(), projectIdFor() (+6 more)

### Community 8 - "minilz4.cjs"
Cohesion: 0.21
Nodes (12): bracedArg(), enter(), init(), initEditor(), outlineActive(), renderOutline(), resolveInput(), showEmptyEditor() (+4 more)

### Community 9 - "Folio — sistema visual"
Cohesion: 0.21
Nodes (12): clearPdf(), collectFiles(), compile(), indexProject(), markStale(), onKey(), parseLog(), saveAll() (+4 more)

### Community 10 - "IEEEtran.cls"
Cohesion: 0.25
Nodes (11): addLinks(), cssScale(), freeFarPages(), goDest(), relayout(), renderPage(), setView(), showPdf() (+3 more)

### Community 11 - "NOTICE.md"
Cohesion: 0.31
Nodes (8): attach(), clear(), cursorLines(), pass(), closeBrace(), decorateTex(), renderMath(), titleBlock()

### Community 12 - "home.js"
Cohesion: 0.24
Nodes (3): applyTheme(), initTheme(), toast()

### Community 13 - "shell.js"
Cohesion: 0.22
Nodes (8): 1. Publicarla (una sola vez, unos 10 minutos), 2. Instalarla en Windows, 3. Uso, Abrir archivos con clic derecho, Actualizar, Descargas y memoria, Folio — Markdown y LaTeX en tu escritorio, Licencia

### Community 14 - "sw.js"
Cohesion: 0.29
Nodes (8): applyEqTemplate(), editable(), fillTemplate(), inMath(), insertBlock(), insertHeading(), insertMathSymbol(), insertTexTable()

### Community 15 - "build-site.sh"
Cohesion: 0.33
Nodes (4): collectNew(), known, knownMisses, parseRemoteName()

### Community 16 - "openSample"
Cohesion: 0.29
Nodes (6): Color, Disposición, Folio — sistema visual, Forma y profundidad, Movimiento, Tipografía

### Community 17 - "IEEEtran.cls"
Cohesion: 0.48
Nodes (5): ago(), paint(), removeItem(), render(), row()

### Community 18 - "NOTICE.md"
Cohesion: 0.60
Nodes (3): openLaunched(), setWs(), setZen()

### Community 19 - "sw.js"
Cohesion: 0.40
Nodes (5): figureSnippet(), insertFigure(), latexHint(), outsideBlocks(), relFrom()

## Knowledge Gaps
- **2 isolated node(s):** `insert`, `update`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 98 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `insert`, `update` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `tex-engine.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06578947368421052 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `tex.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09333333333333334 - nodes in this community are weakly interconnected._
- **Should `folio-tex-worker.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14035087719298245 - nodes in this community are weakly interconnected._