# Folio — sistema visual

Dirección: **mesa de composición nocturna**. Paneles de grafito en capas, un solo acento
jade para acción y estado, y el PDF como la única hoja iluminada. Es una herramienta de
trabajo: los controles son los estándar (pestañas, segmentados, menús, barra lateral) y
la identidad vive en los detalles: color, tipografía, densidad y la línea de prueba.

Todos los valores viven como variables CSS en `:root` dentro de `index.html`. El tema
oscuro es el predeterminado; el claro y «según el sistema» se eligen con el botón de tema.

## Color

| Token | Oscuro | Claro | Uso |
| --- | --- | --- | --- |
| `--bg-0` | `#0B0D10` | `#E8EBEF` | Cabecera, barra de estado, mesa del visor |
| `--bg-1` | `#111418` | `#F4F5F7` | Barra lateral, barras de panel, registro |
| `--bg-2` | `#161A1F` | `#FFFFFF` | Editor, menús, diálogos |
| `--bg-3` / `--bg-4` | `#1D2228` / `#262C34` | `#ECEEF1` / `#E1E4E9` | Hover / activo |
| `--line` / `--line-2` | `#21262D` / `#2E353E` | `#DEE2E7` / `#CBD1D8` | Divisiones / bordes de control |
| `--ink` / `--ink-2` / `--ink-3` | `#E7E9EC` / `#A8AFB9` / `#7A8492` | `#15181C` / `#4B5360` / `#687180` | Texto principal / secundario / etiquetas (≥ 4,5:1) |
| `--accent` | `#3DD68C` | `#0B7F4B` | Compilar, guardar, selección, foco, estado activo |
| `--accent-soft` | jade 12 % | jade 10 % | Fondo de elementos seleccionados |
| `--ok` `--warn` `--danger` `--info` | jade, ámbar, coral, azul | versiones oscuras | Solo para estado |

El acento no decora: aparece en la acción principal, en lo seleccionado y en el estado.

Resaltado LaTeX (CodeMirror `stex`): comandos `--hl-cmd` (violeta), entornos `--hl-env`
(ámbar), matemáticas `--hl-math` (cian), llaves `--hl-br` (gris), comentarios
`--hl-com` en cursiva.

## Tipografía

- Interfaz: **Geist** 400/500/600, base 13,5 px, escala compacta (11–17 px).
- Código y medidas: **JetBrains Mono** 13,5 px / 1,65.
- Documento Markdown: **Source Serif 4** 17 px / 1,7, medida de hoja A4.
- Etiquetas de sección de panel: Geist 600, 10,5 px, mayúsculas, +0,07 em.

## Forma y profundidad

- Radios: 6–7 px en controles, 10 px en menús, 14 px en diálogos y tarjetas vacías.
- Los paneles se separan con líneas de 1 px; las sombras son solo para lo que flota
  (menús, diálogos, avisos) y para las hojas (PDF y página Markdown).
- Alturas: cabecera 46 px, barras de panel 36–38 px, barra de estado 26 px, filas 28 px.

## Movimiento

150–200 ms con `cubic-bezier(.2,.8,.2,1)`. Menús y diálogos aparecen con un leve
desplazamiento. Se respeta `prefers-reduced-motion`.

**Línea de prueba (gesto propio):** mientras el motor compila, una línea jade recorre el
borde superior del PDF. Si la compilación falla, las páginas anteriores se atenúan y un
aviso dice que se muestra el último PDF correcto.

## Disposición

- LaTeX: barra lateral (Archivos arriba, Esquema abajo, plegables) · editor con barra de
  inserción y registro · PDF. Modos **Editor / Dividido / PDF** y modo enfoque (`Ctrl+.`).
- Markdown: pestañas de documento en la cabecera · modos Leer / Editar / Fuente.
- Menos de 1000 px: los paneles LaTeX pasan a pestañas (Archivos / Código / PDF).
  Menos de 820 px: la cabecera ocupa dos filas y las barras de formato se desplazan.
