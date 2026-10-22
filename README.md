# Folio — Markdown y LaTeX en tu escritorio

Folio es una app web instalable (PWA). Se publica gratis en GitHub Pages y luego se
instala desde Edge como una aplicación normal: ícono en el escritorio, aparece en
**clic derecho › Abrir con** para `.md`, `.tex` y `.bib`, y funciona sin internet.
Windows no la bloquea porque no usa scripts: Edge hace la instalación.

## 1. Publicarla (una sola vez, unos 10 minutos)

1. Entra a <https://github.com> e inicia sesión (o crea una cuenta).
2. Arriba a la derecha: **+ › New repository**.
   - Nombre: `folio`
   - Visibilidad: **Public** (Pages gratis requiere repositorio público; con GitHub
     Student Developer Pack también puedes usar uno privado).
   - Pulsa **Create repository**.
3. En la página del repositorio vacío, pulsa **uploading an existing file**.
4. Abre la carpeta descomprimida `folio` en el Explorador, selecciona **todo su
   contenido** (incluida la carpeta `.github`) y arrástralo a la página. Pulsa
   **Commit changes**.
5. Comprueba que existe el archivo `.github/workflows/publicar.yml`. Si no se subió
   (a veces las carpetas que empiezan con punto se omiten):
   **Add file › Create new file**, escribe `.github/workflows/publicar.yml` como
   nombre, pega el contenido de ese archivo y pulsa **Commit changes**.
6. Ve a **Settings › Pages**. En **Build and deployment › Source**, elige
   **GitHub Actions**.
7. Ve a la pestaña **Actions**. Verás «Publicar Folio» en ejecución (3 a 5 minutos).
   Si aparece en rojo porque corrió antes del paso 6, ábrelo y pulsa
   **Re-run all jobs**.
8. Cuando termine en verde, tu app queda en `https://TU-USUARIO.github.io/folio/`.

## 2. Instalarla en Windows

1. Abre esa dirección en **Microsoft Edge**.
2. En la barra de direcciones aparece el ícono **Instalar** (un cuadrado con un +).
   También está en **⋯ › Aplicaciones › Instalar Folio**.
3. Marca **Crear acceso directo en el escritorio** y **Anclar a la barra de tareas** si
   lo quieres.

### Abrir archivos con clic derecho

- Clic derecho en un `.md` o `.tex` › **Abrir con** › **Folio**. La primera vez Edge
  pregunta si Folio puede abrir ese tipo de archivo: acepta.
- Para que el doble clic abra siempre con Folio: **Abrir con › Elegir otra aplicación ›
  Folio › Siempre**.

## 3. Uso

**Inicio:** la app abre en una vista con tus documentos Markdown y tus proyectos LaTeX
recientes, en dos columnas. Clic en uno para abrirlo; **Nuevo** y **Abrir** crean o abren
otros; el buscador filtra por nombre. El icono de papelera los quita de Folio: los archivos
de tu equipo nunca se borran (solo se pierde el contenido de un documento que exista
únicamente dentro de Folio, y la app avisa antes). Cerrar una pestaña no quita el
documento de Inicio. La guía de uso y el proyecto de ejemplo están al pie de cada columna.

**Markdown:** igual que antes: lectura tipo hoja, edición con vista previa, tablas y
`Ctrl+S` guarda sobre el archivo original.

**LaTeX** (pestaña LaTeX):

- **Menú del proyecto › Proyecto nuevo con tu preámbulo** crea `main.tex` y
  `figuras/` en la carpeta que elijas.
- **Abrir carpeta de proyecto** abre un proyecto existente (como en Overleaf).
  También puedes arrastrar la carpeta a la ventana.
- El PDF se compila solo unos segundos después de dejar de escribir
  (interruptor «Compilar al escribir»), o con **Compilar** / `Ctrl+Enter`.
- **Imágenes:** arrástralas o pégalas (`Ctrl+V`, sirve para capturas de pantalla) en el
  editor. Se copian a `figuras/` y se inserta el bloque `figure` donde está el cursor.
- **Esquema:** debajo de los archivos aparecen las secciones del `.tex` abierto (y los
  archivos que incluye con `\input`); clic en una para saltar a ella. La sección donde
  está el cursor queda marcada.
- **Disposición:** en la barra superior elige **Editor**, **Dividido** o **PDF**.
- **Modo enfoque:** el botón de las cuatro esquinas (o `Ctrl+.`) oculta todo menos el
  texto y el PDF; `Esc` lo cierra. También funciona en Markdown.
- **Registro:** muestra los errores en español; clic en uno te lleva a la línea.
- **Guardar PDF:** botón de descarga sobre el PDF o menú junto a Compilar.

## Descargas y memoria

- La primera compilación descarga el motor y la base de TeX Live (unos 125 MB).
  Queda guardada en la app y no se vuelve a descargar.
- Los paquetes que no están en la base (por ejemplo `booktabs`, `listings`,
  `subcaption`, `xurl`, `babel` en español) se descargan archivo por archivo la
  primera vez que un documento los pide (pocos KB cada uno) y se reutilizan en todos
  tus proyectos.
- Después de eso compila sin internet.
- Folio trae las colecciones habituales de TeX Live, pero no todas las clases de revistas y
  congresos (las de Overleaf vienen de TeX Live completo). Incluye **IEEEtran** con sus
  estilos de bibliografía. Si una plantilla usa otra clase (`elsarticle`, `acmart`,
  `llncs`…), copia su archivo `.cls` (viene en la plantilla de la revista o en CTAN) a la
  carpeta del proyecto, junto al archivo principal.
- El motor se reinicia solo cada 30 compilaciones y se apaga tras 10 minutos sin uso
  para liberar memoria. **Motor y paquetes descargados…** (menú junto a Compilar)
  muestra cuánto ocupa y permite borrarlo.

## Actualizar

Sube los archivos nuevos al repositorio; la acción vuelve a publicar sola. La app
instalada usa la versión nueva la próxima vez que la abras.

## Licencia

AGPL-3.0-or-later, por el motor BusyTeX (ver `LICENSE` y `NOTICE.md`).
