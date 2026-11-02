#!/usr/bin/env bash
# Builds the complete Folio site into ./_site (or the folder given as $1).
# Used by the GitHub Actions workflow; also runs locally on Linux/macOS with Node 18+.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-_site}"
BUSYTEX_VERSION="1.4.1"
ASSETS_URL="https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v${BUSYTEX_VERSION}/busytex-assets.tar.gz"
# The engine runs inside the published app, so the downloaded package must be exactly the one
# that was reviewed. Update this hash only together with BUSYTEX_VERSION.
ASSETS_SHA256="4f63731fe4ec9238d877846074ab424350add6f6e956944def389e6752d2c78b"
CACHE_DIR="${BUSYTEX_CACHE:-.cache/busytex-${BUSYTEX_VERSION}}"

rm -rf "$OUT"
mkdir -p "$OUT"

echo "== Motor BusyTeX ${BUSYTEX_VERSION}"
if [ ! -f "$CACHE_DIR/busytex/busytex.wasm" ]; then
  mkdir -p "$CACHE_DIR"
  TARBALL="$CACHE_DIR/busytex-assets.tar.gz"
  curl -fsSL -o "$TARBALL" "$ASSETS_URL"
  echo "${ASSETS_SHA256}  ${TARBALL}" | sha256sum -c - || { echo "La huella del motor no coincide: no se publica." >&2; rm -f "$TARBALL"; exit 1; }
  tar xzf "$TARBALL" -C "$CACHE_DIR"
  rm -f "$TARBALL"
fi

echo "== Librerías"
if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

echo "== App"
cp index.html sw.js manifest.webmanifest "$OUT/"
cp -r js icons "$OUT/"

V="$OUT/vendor"
mkdir -p "$V/codemirror" "$V/pdfjs"
cp node_modules/marked/marked.min.js node_modules/dompurify/dist/purify.min.js node_modules/@highlightjs/cdn-assets/highlight.min.js "$V/"
CM=node_modules/codemirror
cp "$CM/lib/codemirror.js" "$CM/lib/codemirror.css" "$CM/mode/stex/stex.js" "$CM/mode/markdown/markdown.js" \
   "$CM/addon/edit/matchbrackets.js" "$CM/addon/edit/closebrackets.js" "$CM/addon/selection/active-line.js" \
   "$CM/addon/search/searchcursor.js" "$CM/addon/search/search.js" "$CM/addon/search/jump-to-line.js" \
   "$CM/addon/dialog/dialog.js" "$CM/addon/dialog/dialog.css" "$CM/addon/hint/show-hint.js" "$CM/addon/hint/show-hint.css" \
   "$V/codemirror/"
cp node_modules/pdfjs-dist/build/pdf.min.js node_modules/pdfjs-dist/build/pdf.worker.min.js "$V/pdfjs/"
# Fonts are served by the app itself (no request to Google on every launch): each stylesheet
# plus only the font files it references.
for spec in geist:wght jetbrains-mono:wght source-serif-4:opsz source-serif-4:opsz-italic; do
  pkg="${spec%%:*}"; css="${spec#*:}"; src="node_modules/@fontsource-variable/$pkg"; dst="$V/fonts/$pkg"
  mkdir -p "$dst/files"
  cp "$src/$css.css" "$dst/"
  grep -o 'url(\./files/[^)]*)' "$src/$css.css" | sed 's#url(\./files/##; s#)$##' | while read -r f; do cp "$src/files/$f" "$dst/files/"; done
done
mkdir -p "$V/katex"
cp node_modules/katex/dist/katex.min.js node_modules/katex/dist/katex.min.css "$V/katex/"
cp -r node_modules/katex/dist/fonts "$V/katex/"

echo "== Motor LaTeX"
B="$OUT/busytex"
mkdir -p "$B"
for f in busytex.js busytex.wasm busytex_pipeline.js busytex_biber.js texlive-basic.js texlive-basic.data texlive-basic.js.providespackage.txt; do
  cp "$CACHE_DIR/busytex/$f" "$B/"
done
cp busytex/folio-tex-worker.js "$B/"

echo "== Paquetes bajo demanda"
node tools/build-mirror.cjs "$CACHE_DIR/busytex" "$OUT/texmf" texmf-extra

BUILD="$(date -u +%Y%m%d%H%M%S)"
sed -i.bak "s/__BUILD__/${BUILD}/" "$OUT/sw.js" && rm -f "$OUT/sw.js.bak"
touch "$OUT/.nojekyll"
cp LICENSE NOTICE.md "$OUT/" 2>/dev/null || true

echo "== Listo: $(du -sh "$OUT" | cut -f1) en $OUT (versión ${BUILD})"
