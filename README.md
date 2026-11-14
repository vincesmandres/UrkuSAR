# UrkuSAR

Prototipo de priorización geotécnica del entorno del Cotopaxi, Ecuador. Combina observaciones sintéticas de temperatura, deformación y persistencia en un índice explicable. No es un modelo predictivo entrenado, una correlación estadística demostrada ni una alerta oficial. Alcance en `SCOPE.md`, contrato en `DDS.md` y avance en `MILESTONES.md`.

## Ejecutar localmente

```bash
npm install
npm run dev
```

Para generar el artefacto de producción:

```bash
npm run build
```

## MVP incluido

- Interfaz minimalista clara, tipografía del sistema y sin fuentes o mapas remotos.
- Mapa SVG de las geometrías GeoJSON; selección mediante mapa, teclado o lista.
- Filtro por nivel y visualización del índice, temperatura o desplazamiento.
- Cálculo determinista con pesos editables, validación y desglose de aportes.
- Descarga del GeoJSON de todas las zonas, visibles o seleccionada, con entradas, pesos aplicados, extensión y procedencia.
- Reporte por zona: vista previa y HTML autónomo para impresión/PDF desde el navegador.
- Validación compartida entre navegador y CLI, pruebas unitarias y de navegador.
- Consulta pública de catálogos MODIS, Sentinel-1 SLC y OPERA DISP-S1, con fechas/BBOX y caché local.
- Importación local CSV FIRMS y desplazamiento LOS normalizado, con validación y procedencia separadas de la demo.

Se eliminaron indicadores de tiempo real, tendencias inventadas y controles sin implementación. El fixture contiene una observación por zona; por eso no hay filtro histórico ni eventos en vivo. Persistencia y confianza son valores suministrados por el fixture, no estimaciones calculadas a partir de una serie temporal.

## Verificación

Probado con Node.js 24.15.0. Para ejecutar la suite de navegador por primera vez:

```bash
npm install
npx playwright install chromium
npm run validate:data
npm test
npm run test:e2e
npm run build
```

Playwright arranca su propio servidor en `127.0.0.1:4174`, prueba escritorio y móvil y lo detiene al terminar. Las capturas se guardan en `test-results/` (ignorado por Git). El puerto debe estar libre.

Para obtener el GeoJSON calculado en stdout, sin navegador:

```bash
node scripts/analyze.mjs
```

## Consultar e importar fuentes

En **Fuentes**, el botón **Consultar catálogos** hace peticiones públicas a NASA CMR y ASF. La consulta inicial es del 13 de octubre al 12 de noviembre de 2026, para Cotopaxi; puede modificarse. No se realiza ninguna consulta externa al abrir la página.

- Los catálogos muestran disponibilidad, no píxeles anómalos ni deformación calculada. Máximo 10 registros por fuente y 366 días inclusive.
- Caché local 15 minutos por fuente/fechas/BBOX. Un fallo puede mostrar datos antiguos del mismo rango, identificados como tales. Sin caché se muestra un error y la demo sigue funcionando.
- Los enlaces de descarga de productos pueden requerir Earthdata Login. No se solicitan ni almacenan claves NASA en el frontend.
- FIRMS: importar CSV oficial MODIS o VIIRS, hasta 5 MiB. Brillo en Kelvin, FRP en MW. No se convierte brillo en anomalía térmica.
- InSAR: importar CSV normalizado con `latitude,longitude,date,displacement_mm,coherence,reference_date,product_id,source_url`. Fechas `YYYY-MM-DD`, unidades mm, coherencia 0–1, URL HTTPS. No interpreta formatos raster/HDF5 ni procesa SAR crudo.
- La procedencia de un archivo es declarada por quien lo aporta. No se suben archivos al servidor ni se guarda su contenido en caché. Las importaciones desaparecen al recargar; los resultados de catálogo sí pueden persistir en localStorage.
- Los archivos se filtran por el rango activo al importarlos. Una importación inválida no reemplaza la última válida. Ningún registro externo modifica el índice sintético.

Prueba opcional con red (no forma parte de CI por disponibilidad de terceros):

```bash
npm run check:sources
```

OPERA DISP-S1 no cubre Cotopaxi. El cierre científico del Hito 3 requiere datos LOS procesados para Ecuador, una línea base térmica y alineación temporal/espacial. Los pesos y umbrales del índice siguen siendo ilustrativos.

## Reportes y exportación

1. Seleccionar una zona en el mapa o la lista. Los filtros de nivel controlan las zonas visibles; no cambian la selección automáticamente.
2. En **Alcance de exportación**, elegir todas las zonas, las visibles o la seleccionada y pulsar **Descargar GeoJSON**. Las visibles corresponden al filtro actual; la seleccionada se exporta aunque esté fuera de ese filtro.
3. Pulsar **Ver reporte de zona** en el detalle. La vista previa es una copia del análisis aplicado al abrirla. Si se editan pesos sin recalcular, no cambian el resultado exportado.
4. **Descargar reporte HTML** genera un archivo autónomo, sin scripts ni recursos externos. Abrirlo y usar la función Imprimir del navegador para imprimir o guardar como PDF. No es una descarga PDF nativa de la aplicación.

Los reportes conservan advertencias visibles: demostración sintética, índice heurístico sin calibración, no alerta oficial ni dictamen geotécnico. Los datos del módulo de fuentes no se incluyen en esos resultados. El área declarada procede del fixture y no del cálculo geométrico.

Para revisar el GeoJSON en QGIS, añadir el archivo como capa vectorial. Se conserva el CRS `urn:ogc:def:crs:OGC:1.3:CRS84` (WGS84, longitud/latitud) y se añaden campos planos `zoneId`, `dataStatus`, `thermalWeight`, `thermalContribution` y equivalentes, además de la explicación anidada. Comparar la cantidad de entidades con `metadata.export.featureCount` y verificar el orden de coordenadas y sus fechas. No se efectuó una prueba directa en QGIS en este entorno; queda como revisión manual pendiente junto con la aprobación geotécnica.

## Despliegue de revisión

Preparado para GitHub Pages en el repositorio público `vincesmandres/UrkuSAR`, con `.github/workflows/pages.yml`. El workflow valida fixtures, ejecuta pruebas unitarias/de navegador y compila antes de publicar. No se ejecuta mientras los cambios sigan locales.

Tras autorizar commit/push, configurar **Settings → Pages → Source: GitHub Actions**. El push a `main` o la ejecución manual del workflow publicará en `https://vincesmandres.github.io/UrkuSAR/`. Esa URL es el destino previsto, no una publicación confirmada.

Para revisar localmente el mismo artefacto y su ruta base:

```bash
npm run build:pages
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base=/UrkuSAR/
```

Abrir `http://127.0.0.1:4173/UrkuSAR/`. Es un servidor de revisión local, no hosting público. Para otro repositorio/ruta, ajustar `build:pages`. No se incluyen credenciales ni datos importados en el artefacto.
