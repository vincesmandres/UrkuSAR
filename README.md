# UrkuSAR

Prototipo de priorización geotécnica del entorno del Cotopaxi, Ecuador. Combina observaciones sintéticas de temperatura, deformación y persistencia en un índice explicable. No es un modelo predictivo entrenado, una correlación estadística demostrada ni una alerta oficial. Alcance en `SCOPE.md`, contrato en `DDS.md` y avance en `MILESTONES.md`.

## Ejecutar localmente

```bash
npm ci
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
npm ci
npx playwright install chromium firefox webkit
npm run check
```

`npm run check` valida el fixture, ejecuta las pruebas unitarias, las de navegador y las de producción. Usa `npm ci` para reproducir las versiones del lockfile.

- `npm test`: modelo, ingesta y exportación, sin red.
- `npm run test:e2e`: flujos en Chromium escritorio/móvil, Firefox y WebKit con Vite en `127.0.0.1:4174`. WebKit automatizado no equivale a probar un iPhone físico.
- `npm run test:release`: genera `dist` para `/UrkuSAR/` y prueba ese artefacto con preview en `127.0.0.1:4175/UrkuSAR/`. No utiliza el servidor de desarrollo.
- Las pruebas de producción verifican carga de recursos, ausencia de consultas externas automáticas, uso sin red tras la carga, descarga, navegación por teclado y reglas automáticas WCAG 2/2.1 A/AA mediante axe-core.
- Los servidores de pruebas se detienen al terminar. Los puertos 4174 y 4175 deben estar libres. Las capturas, trazas y resultados axe se guardan en `test-results/`, ignorado por Git.

La auditoría automática no certifica cumplimiento WCAG ni sustituye una revisión con lectores de pantalla. El iframe del reporte permanece aislado sin scripts: se audita el contenedor modal por separado y el mismo HTML como documento autónomo. Los resultados `incomplete` de axe requieren revisión manual. No se debilita el sandbox para ejecutar la auditoría.

Limitación reproducida de herramienta: Firefox se cierra dentro de axe después de una selección de archivo, tanto en Windows como en Linux CI (ejecución `43624158291`). Se anotó una excepción únicamente para la auditoría Firefox del estado importado, conservando sus pruebas de importación y teclado. Chromium y WebKit mantienen esa auditoría completa; las demás auditorías Firefox permanecen activas. No es una aprobación de accesibilidad de ese estado en Firefox. No ejecutar las suites funcional y de producción simultáneamente: comparten artefactos de pruebas.

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

### Evidencia raster real

En **Fuentes → Auditoría de productos reales** se muestra una inspección archivada reproducible, con URLs, SHA-256 y atribución; no depende del rango del formulario ni modifica el score:

- COMET LiCSAR, frame `142D_09148_131313`, par 2025-05-26/2025-06-07: GeoTIFF de coherencia de 12.1 MB. Su extensión WGS84 cubre Cotopaxi; 122400 celdas inspeccionadas, escala 0–255. **Coherencia no es desplazamiento LOS.**
- NOAA GOES-19 ABI-L2-LSTF, 2026-11-14 17:00 UTC: NetCDF de 0.74 MB. Cuatro centros de píxel en el área; ninguno cumple calidad DQF=0. La temperatura y anomalía permanecen nulas, no se rellenan con cero.
- No hay compatibilidad temporal entre esos productos ni línea base térmica. `eligibleForRiskIndex` es `false`; la evidencia no habilita un análisis de peligro real.

Preparación opcional del entorno GIS, sin afectar la aplicación web:

```powershell
python -m venv .venv-gis
.\.venv-gis\Scripts\python.exe -m pip install -r scripts/requirements-gis.txt
.\.venv-gis\Scripts\python.exe scripts/check-gis.py
.\.venv-gis\Scripts\python.exe scripts/audit-products.py
```

En Linux usar `.venv-gis/bin/python`. `audit-products.py` descarga únicamente los dos archivos fijados (~13 MB), verifica tamaños/checksums y reutiliza `.data-cache/`; falla si cambian. `--output src/data/product-audit.json` regenera la evidencia de la interfaz. No descarga SLC grandes ni publica los binarios. El job GIS de CI no descarga productos remotos: valida exportaciones con GDAL/OGR y GEOS.

Fuente LiCSAR: Lazecky, M.; Maghsoudi, Y. (2022), *LiCSAR interferometry products*, NERC EDS CEDA. [Registro y cita](https://catalogue.ceda.ac.uk/uuid/52cda2e0e6c04272ae15ac836c1e8493), consultado 2026-11-14. Licencia OGL-3. LiCSAR contains modified Copernicus Sentinel data 2025 analysed by COMET. LiCSAR uses JASMIN, the UK's collaborative data analysis environment. Los datos NOAA son abiertos; su uso no implica respaldo a UrkuSAR.

### Serie térmica del periodo SAR

En **Fuentes → Serie térmica alineada al periodo SAR** se muestra una segunda inspección, independiente del archivo térmico de noviembre de 2026:

- Se recuperaron 41 NetCDF GOES-19 reales a las 17:00 UTC: 28 días de referencia (2025-04-28 a 2025-05-25) y 13 de análisis (2025-05-26 a 2025-06-07), coincidentes en calendario con el par LiCSAR. No se afirma simultaneidad de adquisición ni causalidad entre sensores.
- El lector verifica satélite, unidades Kelvin, proyección CF, rejilla, fecha/hora y codificación DQF. Solo acepta valores finitos sin máscara con DQF=0. No se rellenan nubes ni se interpolan días.
- Referencia por píxel: mediana de al menos 7 observaciones válidas anteriores. Se conserva la desviación absoluta mediana (MAD). La diferencia en Kelvin equivale numéricamente a diferencia en °C.
- Se cuentan días observados consecutivos por encima de 2 °C; una ausencia o rechazo de calidad interrumpe la racha. El mínimo de muestras y el umbral son parámetros exploratorios, no calibrados. Una referencia de 28 días no es una climatología.
- **Resultado real:** una sola observación válida en toda la ventana de referencia y ninguna en el periodo analizado, para cuatro píxeles de aproximadamente 10 km. Ningún píxel reúne referencia suficiente: anomalías y rachas permanecen `null`/«No estimable», no cero.
- La interfaz permite elegir un píxel, inspeccionar cada día y descargar la serie con URLs, tamaños y SHA-256. No altera el índice sintético ni traslada una medición de 10 km a polígonos geotécnicos pequeños.

Reproducir el resultado fijado, usando el mismo entorno GIS:

```powershell
.\.venv-gis\Scripts\python.exe -m unittest discover -s tests/python -p "test_*.py" -v
.\.venv-gis\Scripts\python.exe scripts/audit-thermal-series.py --replay src/data/thermal-series.json
```

El modo `--replay` usa las URLs y hashes archivados y comprueba que los resultados coincidan, salvo la fecha de ejecución. Usa `.data-cache/thermal-series/`; si falta un archivo lo descarga y verifica. Sin `--replay`, el script consulta el catálogo S3 y puede regenerar el JSON con `--output src/data/thermal-series.json`. Hay límites de 62 archivos y 4 MiB por archivo; no se descargan productos grandes ni se cambia el protocolo para forzar resultados. Las pruebas Python de CI son sintéticas y sin red; la evidencia publicada proviene de los archivos reales descargados.

El siguiente paso científico ya no es programar la mediana: es conseguir observaciones térmicas con cobertura/QA suficientes y resolución adecuada, además de desplazamiento LOS validado. Este protocolo no permite atribuir a actividad volcánica cualquier calentamiento meteorológico o estacional.

## Reportes y exportación

1. Seleccionar una zona en el mapa o la lista. Los filtros de nivel controlan las zonas visibles; no cambian la selección automáticamente.
2. En **Alcance de exportación**, elegir todas las zonas, las visibles o la seleccionada y pulsar **Descargar GeoJSON**. Las visibles corresponden al filtro actual; la seleccionada se exporta aunque esté fuera de ese filtro.
3. Pulsar **Ver reporte de zona** en el detalle. La vista previa es una copia del análisis aplicado al abrirla. Si se editan pesos sin recalcular, no cambian el resultado exportado.
4. **Descargar reporte HTML** genera un archivo autónomo, sin scripts ni recursos externos. Abrirlo y usar la función Imprimir del navegador para imprimir o guardar como PDF. No es una descarga PDF nativa de la aplicación.

Los reportes conservan advertencias visibles: demostración sintética, índice heurístico sin calibración, no alerta oficial ni dictamen geotécnico. Los datos del módulo de fuentes no se incluyen en esos resultados. El área declarada procede del fixture y no del cálculo geométrico.

Para revisar el GeoJSON en QGIS, añadir el archivo como capa vectorial. Se conserva el CRS `urn:ogc:def:crs:OGC:1.3:CRS84` (WGS84, longitud/latitud) y se añaden campos planos `zoneId`, `dataStatus`, `thermalWeight`, `thermalContribution` y equivalentes, además de la explicación anidada. Comparar la cantidad de entidades con `metadata.export.featureCount` y verificar el orden de coordenadas y sus fechas. No se efectuó una prueba directa en QGIS en este entorno; queda como revisión manual pendiente junto con la aprobación geotécnica.

Verificación GIS independiente realizada con GDAL/OGR 3.12.4 y GEOS 3.14.1: las cinco exportaciones (todas, seleccionada, visibles, pesos modificados y vacía) se leen con CRS EPSG:4326, cantidades correctas, atributos numéricos preservados y polígonos válidos sin cambios de coordenadas. Se ejecuta desde el exportador real de la aplicación, no con archivos de prueba escritos a mano. Esto no reemplaza la revisión visual en QGIS ni la inspección de campo.

## Despliegue de revisión

GitHub Pages está habilitado con GitHub Actions en el repositorio público `vincesmandres/UrkuSAR`. Publicación inicial verificada el 14 de noviembre de 2026 en **https://vincesmandres.github.io/UrkuSAR/**. La ejecución `43616067248`, intento 2, finalizó correctamente después de activar Pages.

`.github/workflows/pages.yml` valida fixtures, pruebas funcionales en tres motores y `test:release`; además ejecuta un job GIS independiente. Solo despliega si ambos jobs pasan. Ante un fallo conserva diagnósticos siete días. El Hito 5 inicial (`7e606e4`) se publicó correctamente en la ejecución `43620874329`. Los cambios locales posteriores requieren commit/push a `main`. Para un nuevo repositorio es necesario activar **Settings → Pages → Source: GitHub Actions**; de lo contrario el despliegue puede devolver 404.

Para revisar localmente el mismo artefacto y su ruta base:

```bash
npm run build:pages
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base=/UrkuSAR/
```

Abrir `http://127.0.0.1:4173/UrkuSAR/`. Es un servidor de revisión local, no hosting público. Para otro repositorio/ruta, ajustar `build:pages`. No se incluyen credenciales ni datos importados en el artefacto.

## Guion de demo: tres minutos

| Tiempo | Acción | Mensaje |
| --- | --- | --- |
| 0:00–0:25 | Abrir la vista del Cotopaxi y señalar la etiqueta sintética. | UrkuSAR explora la priorización geotécnica; esta demostración no predice colapsos ni emite alertas oficiales. |
| 0:25–0:55 | Seleccionar Z-04 desde mapa o lista. | El 91/100 viene de tres entradas del fixture: 4,8 °C, 18,4 mm y 24 días. No son observaciones oficiales. |
| 0:55–1:25 | Mostrar los aportes y cambiar pesos a 100/0/0; recalcular y restablecer. | 33,6 + 41,4 + 16 = 91 puntos. Con peso térmico 100% resulta 96. Los parámetros son ilustrativos, no calibrados. |
| 1:25–1:55 | Filtrar un nivel, descargar GeoJSON visible y abrir el reporte. | Los resultados conservan geometría, configuración y límites del análisis. El reporte HTML puede imprimirse o guardarse como PDF. |
| 1:55–2:30 | Ir a Fuentes; consultar catálogos solo si hay conexión. | CMR/ASF muestran disponibilidad de productos, no mediciones de deformación. Las importaciones permanecen separadas del índice. |
| 2:30–3:00 | Cerrar con limitaciones y siguientes validaciones. | Falta un producto LOS verificado para Ecuador, línea base térmica, alineación temporal y revisión profesional. La propuesta es hacer el análisis trazable, no reemplazar al especialista. |

Si falla la red durante el pitch, continuar con la demo ya cargada. La caché de catálogos indica su antigüedad o muestra error si no hay datos compatibles. No afirmar que la primera carga funciona offline: no existe service worker ni instalación PWA.

## Trazabilidad de métricas

| Elemento visible | Origen y cálculo |
| --- | --- |
| Cantidad de zonas | Número de entidades en `src/data/zones.geojson`. |
| Zonas críticas | Clasificación del índice con los pesos aplicados; umbral ilustrativo 80. |
| Deformación máxima | Máxima magnitud `abs(displacementMm)` de las observaciones sintéticas. |
| Fecha del fixture | `observedAt` de `src/data/observations.json`, no fecha de una consulta remota. |
| Índice y barras | `src/data/model.js`: normalizaciones y contribuciones detalladas en `DDS.md`. |
| Confianza y persistencia | Valores declarados del fixture; no inferidos ni probabilidades de fallo. |
| Conteos y fechas de catálogos | Respuesta de CMR/ASF; la fecha de consulta se muestra separada de la adquisición. |
| Valores importados | Archivo aportado, validado y filtrado; procedencia declarada, no autenticada. |

## Checklist de entrega

- Ejecutar `npm ci`, instalar Chromium/Firefox/WebKit y completar `npm run check` sin fallos, además de `scripts/check-gis.py` y la suite `tests/python` en el entorno GIS.
- Revisar las capturas de escritorio/móvil y los resultados axe; no ignorar advertencias `incomplete` sin revisión.
- Confirmar etiquetas sintéticas, valores iniciales Z-04=91 y separación entre catálogo e índice.
- Probar selección, filtros, recálculo, exportación de subconjuntos y reporte descargado.
- Comprobar teclado: salto al contenido, selección del mapa, cierre con Escape y retorno de foco.
- Ensayar el guion en menos de tres minutos y preparar el flujo alternativo sin red tras cargar la página.
- Antes de publicar, revisar diff y ausencia de credenciales; tras un push autorizado, comprobar el workflow y la URL pública, no solo el build local.
- Mantener visibles los pendientes: interfaz QGIS, lectores de pantalla reales, dispositivos físicos, excepción axe Firefox tras importar, datos LOS/QA térmico y revisión geotécnica. No constituyen validaciones completadas por estas pruebas.
