# Graph Report - Folio  (2026-11-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 330 nodes · 612 edges · 19 communities (15 shown, 4 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 63 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `80097e8a`
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

## God Nodes (most connected - your core abstractions)
1. `openProject()` - 19 edges
2. `compile()` - 15 edges
3. `renderTree()` - 13 edges
4. `initEditor()` - 11 edges
5. `openPath()` - 11 edges
6. `runCompile()` - 11 edges
7. `normPath()` - 10 edges
8. `db()` - 10 edges
9. `insertFigure()` - 9 edges
10. `onDrop()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `compile()` --calls--> `showPdf()`  [EXTRACTED]
  js/tex.js → js/tex.js  _Bridges community 0 → community 7_
- `initEditor()` --calls--> `wrapCmd()`  [EXTRACTED]
  js/tex.js → js/tex.js  _Bridges community 0 → community 9_

## Import Cycles
- None detected.

## Communities (19 total, 4 thin omitted)

### Community 0 - "tex-engine.js"
Cohesion: 0.07
Nodes (75): addFiles(), addImage(), appDir(), applyLineMarks(), bracedArg(), clearPdf(), collectFiles(), compile() (+67 more)

### Community 1 - "package.json"
Cohesion: 0.07
Nodes (39): activate(), applyMeasure(), applyZoom(), boot(), buildToc(), copyText(), download(), exportHtml() (+31 more)

### Community 2 - "build-mirror.cjs"
Cohesion: 0.06
Nodes (31): runs-on, steps, concurrency, cancel-in-progress, group, environment, needs, runs-on (+23 more)

### Community 3 - "tex.js"
Cohesion: 0.22
Nodes (23): armIdle(), cacheStats(), call(), clearCache(), compile(), db(), deleteProject(), emit() (+15 more)

### Community 4 - "markdown.js"
Cohesion: 0.11
Nodes (24): dependencies, codemirror@5.65.16, dompurify@3.1.6, @fontsource-variable/geist@5.3.0, @fontsource-variable/jetbrains-mono@5.3.0, @fontsource-variable/source-serif-4@5.3.1, @highlightjs/cdn-assets@11.9.0, katex@0.16.11 (+16 more)

### Community 5 - "ui.js"
Cohesion: 0.09
Nodes (18): BARE_NAME_FORMATS, basic, { cd, meta }, chunk(), data, FMT, formatsFor(), IMG (+10 more)

### Community 6 - "folio-tex-worker.js"
Cohesion: 0.31
Nodes (8): attach(), clear(), cursorLines(), pass(), closeBrace(), decorateTex(), renderMath(), titleBlock()

### Community 7 - "Folio — Markdown y LaTeX en tu escritorio"
Cohesion: 0.29
Nodes (10): addLinks(), cssScale(), freeFarPages(), goDest(), relayout(), renderPage(), showPdf(), stepZoom() (+2 more)

### Community 8 - "minilz4.cjs"
Cohesion: 0.24
Nodes (3): applyTheme(), initTheme(), toast()

### Community 9 - "Folio — sistema visual"
Cohesion: 0.25
Nodes (9): applyEqTemplate(), editable(), fillTemplate(), inMath(), insertBlock(), insertHeading(), insertMathSymbol(), insertTexTable() (+1 more)

### Community 10 - "IEEEtran.cls"
Cohesion: 0.22
Nodes (8): 1. Publicarla (una sola vez, unos 10 minutos), 2. Instalarla en Windows, 3. Uso, Abrir archivos con clic derecho, Actualizar, Descargas y memoria, Folio — Markdown y LaTeX en tu escritorio, Licencia

### Community 11 - "NOTICE.md"
Cohesion: 0.33
Nodes (4): collectNew(), known, knownMisses, parseRemoteName()

### Community 12 - "home.js"
Cohesion: 0.29
Nodes (6): Color, Disposición, Folio — sistema visual, Forma y profundidad, Movimiento, Tipografía

### Community 13 - "shell.js"
Cohesion: 0.48
Nodes (5): ago(), paint(), removeItem(), render(), row()

### Community 14 - "sw.js"
Cohesion: 0.60
Nodes (3): openLaunched(), setWs(), setZen()

## Knowledge Gaps
- **2 isolated node(s):** `insert`, `update`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 98 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 2 inferred relationships involving `initEditor()` (e.g. with `latexHint()` and `visualImage()`) actually correct?**
  _`initEditor()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `insert`, `update` to the rest of the system?**
  _2 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `tex-engine.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06925624811803674 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06578947368421052 - nodes in this community are weakly interconnected._
- **Should `build-mirror.cjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `markdown.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `ui.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09333333333333334 - nodes in this community are weakly interconnected._