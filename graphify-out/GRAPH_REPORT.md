# Graph Report - Folio  (2026-11-13)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 360 nodes · 659 edges · 23 communities (19 shown, 4 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 69 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b08e4d2c`
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
- build
- shell.js
- sw.js
- Folio
- openSample
- insertFigure
- NOTICE.md
- scanDir
- IEEEtran.cls
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
9. `Folio` - 10 edges
10. `activate()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `savePdf()` --calls--> `build()`  [INFERRED]
  js/markdown.js → js/md-pdf.js

## Import Cycles
- None detected.

## Communities (23 total, 4 thin omitted)

### Community 0 - "tex-engine.js"
Cohesion: 0.06
Nodes (43): activate(), applyMeasure(), applyZoom(), boot(), buildToc(), copyText(), download(), drawMath() (+35 more)

### Community 1 - "package.json"
Cohesion: 0.06
Nodes (31): runs-on, steps, concurrency, cancel-in-progress, group, environment, needs, runs-on (+23 more)

### Community 2 - "build-mirror.cjs"
Cohesion: 0.11
Nodes (22): appDir(), applyEqTemplate(), applyLineMarks(), editable(), fillTemplate(), inMath(), insertBlock(), insertHeading() (+14 more)

### Community 3 - "tex.js"
Cohesion: 0.22
Nodes (23): armIdle(), cacheStats(), call(), clearCache(), compile(), db(), deleteProject(), emit() (+15 more)

### Community 4 - "markdown.js"
Cohesion: 0.10
Nodes (26): dependencies, codemirror@5.65.16, dompurify@3.1.6, @fontsource-variable/geist@5.3.0, @fontsource-variable/jetbrains-mono@5.3.0, @fontsource-variable/source-serif-4@5.3.1, @highlightjs/cdn-assets@11.9.0, html-to-image@1.11.13 (+18 more)

### Community 5 - "ui.js"
Cohesion: 0.09
Nodes (20): BARE_NAME_FORMATS, basic, { cd, meta }, chunk(), data, FMT, formatsFor(), fs (+12 more)

### Community 6 - "folio-tex-worker.js"
Cohesion: 0.26
Nodes (19): addFiles(), addImage(), deletePath(), dirHandleFor(), newFile(), newFolder(), nodeMenu(), normPath() (+11 more)

### Community 7 - "Folio — Markdown y LaTeX en tu escritorio"
Cohesion: 0.22
Nodes (11): clearPdf(), collectFiles(), compile(), indexProject(), markStale(), onKey(), parseLog(), saveAndCompile() (+3 more)

### Community 8 - "minilz4.cjs"
Cohesion: 0.24
Nodes (11): bracedArg(), enter(), init(), initEditor(), outlineActive(), renderOutline(), resolveInput(), showEmptyEditor() (+3 more)

### Community 9 - "Folio — sistema visual"
Cohesion: 0.24
Nodes (13): copyProjectToFolder(), detectMain(), newProject(), openFileHandle(), openFolderDialog(), openFromLaunch(), openProject(), projectIdFor() (+5 more)

### Community 10 - "IEEEtran.cls"
Cohesion: 0.31
Nodes (8): attach(), clear(), cursorLines(), pass(), closeBrace(), decorateTex(), renderMath(), titleBlock()

### Community 11 - "NOTICE.md"
Cohesion: 0.24
Nodes (4): applyTheme(), copyToClipboard(), initTheme(), toast()

### Community 12 - "build"
Cohesion: 0.46
Nodes (7): build(), footer(), layout(), linksOf(), loadLib(), paginate(), writePdf()

### Community 13 - "shell.js"
Cohesion: 0.25
Nodes (11): addLinks(), cssScale(), freeFarPages(), goDest(), relayout(), renderPage(), setView(), showPdf() (+3 more)

### Community 14 - "sw.js"
Cohesion: 0.33
Nodes (4): collectNew(), known, knownMisses, parseRemoteName()

### Community 15 - "Folio"
Cohesion: 0.07
Nodes (27): Color, Disposición, Folio — sistema visual, Forma y profundidad, Movimiento, Tipografía, Avisos de terceros, Abrir tus archivos con doble clic (+19 more)

### Community 16 - "openSample"
Cohesion: 0.48
Nodes (5): ago(), paint(), removeItem(), render(), row()

### Community 17 - "insertFigure"
Cohesion: 0.40
Nodes (5): figureSnippet(), insertFigure(), latexHint(), outsideBlocks(), relFrom()

### Community 18 - "NOTICE.md"
Cohesion: 0.60
Nodes (3): openLaunched(), setWs(), setZen()

## Knowledge Gaps
- **2 isolated node(s):** `insert`, `update`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 108 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `copyToClipboard()` connect `NOTICE.md` to `tex-engine.js`, `build-mirror.cjs`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **What connects `insert`, `update` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `tex-engine.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06229508196721312 - nodes in this community are weakly interconnected._
- **Why does `savePdf()` connect `tex-engine.js` to `build`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Why does `build()` connect `build` to `tex-engine.js`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Should `build-mirror.cjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11264367816091954 - nodes in this community are weakly interconnected._