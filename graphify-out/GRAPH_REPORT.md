# Graph Report - Folio  (2026-10-22)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 142 nodes · 233 edges · 16 communities (13 shown, 3 thin omitted)
- Extraction: 86% EXTRACTED · 14% INFERRED · 0% AMBIGUOUS · INFERRED: 32 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0e36be92`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 14
- Community 15

## God Nodes (most connected - your core abstractions)
1. `runCompile()` - 11 edges
2. `db()` - 10 edges
3. `setMode()` - 8 edges
4. `start()` - 7 edges
5. `activate()` - 7 edges
6. `emit()` - 6 edges
7. `kvGet()` - 6 edges
8. `kvSet()` - 6 edges
9. `registerCache()` - 6 edges
10. `writeCache()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `copyText()` --calls--> `setMode()`  [EXTRACTED]
  js/markdown.js → js/markdown.js  _Bridges community 10 → community 7_
- `onKey()` --calls--> `save()`  [EXTRACTED]
  js/markdown.js → js/markdown.js  _Bridges community 10 → community 12_
- `save()` --calls--> `markSaved()`  [EXTRACTED]
  js/markdown.js → js/markdown.js  _Bridges community 10 → community 11_
- `replaceRange()` --calls--> `onInput()`  [EXTRACTED]
  js/markdown.js → js/markdown.js  _Bridges community 11 → community 4_
- `activate()` --calls--> `renderTabs()`  [EXTRACTED]
  js/markdown.js → js/markdown.js  _Bridges community 11 → community 7_

## Import Cycles
- None detected.

## Communities (16 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.22
Nodes (23): armIdle(), cacheStats(), call(), clearCache(), compile(), db(), deleteProject(), emit() (+15 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (16): dependencies, codemirror, dompurify, @highlightjs/cdn-assets, marked, pdfjs-dist, description, license (+8 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (13): basic, { cd, meta }, chunk(), data, FMT, formatsFor(), IMG, put() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.22
Nodes (11): detectMain(), dirHandleFor(), openFileHandle(), openFolderDialog(), openProject(), projectIdFor(), reopen(), scanDir() (+3 more)

### Community 4 - "Community 4"
Cohesion: 0.28
Nodes (10): formatRows(), insertBlock(), insertTable(), lineRange(), parseRow(), prefixLines(), replaceRange(), tableAtCaret() (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.24
Nodes (3): applyTheme(), initTheme(), toast()

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (4): collectNew(), known, knownMisses, parseRemoteName()

### Community 7 - "Community 7"
Cohesion: 0.38
Nodes (7): activate(), applyZoom(), boot(), loadSample(), newDocument(), setMode(), toggleToc()

### Community 8 - "Community 8"
Cohesion: 0.38
Nodes (4): assert(), compress(), compressBlock(), compressPackage()

### Community 9 - "Community 9"
Cohesion: 0.50
Nodes (4): buildToc(), render(), tocActive(), toHtml()

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (4): copyText(), download(), exportHtml(), save()

### Community 11 - "Community 11"
Cohesion: 0.67
Nodes (4): markSaved(), onInput(), renderTabs(), status()

### Community 12 - "Community 12"
Cohesion: 0.50
Nodes (4): onDrop(), onKey(), openDialog(), openFile()

## Knowledge Gaps
- **5 isolated node(s):** `codemirror`, `dompurify`, `@highlightjs/cdn-assets`, `marked`, `pdfjs-dist`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 52 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `codemirror`, `dompurify`, `@highlightjs/cdn-assets` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1323529411764706 - nodes in this community are weakly interconnected._