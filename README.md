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
npx playwright install chromium
npm run check
```

`npm run check` valida el fixture, ejecuta las pruebas unitarias, las de navegador y las de producción. Usa `npm ci` para reproducir las versiones del lockfile.

- `npm test`: modelo, ingesta y exportación, sin red.
- `npm run test:e2e`: flujos funcionales de escritorio y móvil con Vite en `127.0.0.1:4174`.
- `npm run test:release`: genera `dist` para `/UrkuSAR/` y prueba ese artefacto con preview en `127.0.0.1:4175/UrkuSAR/`. No utiliza el servidor de desarrollo.
- Las pruebas de producción verifican carga de recursos, ausencia de consultas externas automáticas, uso sin red tras la carga, descarga, navegación por teclado y reglas automáticas WCAG 2/2.1 A/AA mediante axe-core.
- Los servidores de pruebas se detienen al terminar. Los puertos 4174 y 4175 deben estar libres. Las capturas, trazas y resultados axe se guardan en `test-results/`, ignorado por Git.

La auditoría automática no certifica cumplimiento WCAG ni sustituye una revisión con lectores de pantalla. El iframe del reporte permanece aislado sin scripts: se audita el contenedor modal por separado y el mismo HTML como documento autónomo. Los resultados `incomplete` de axe requieren revisión manual. No se debilita el sandbox para ejecutar la auditoría.

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

GitHub Pages está habilitado con GitHub Actions en el repositorio público `vincesmandres/UrkuSAR`. Publicación inicial verificada el 14 de noviembre de 2026 en **https://vincesmandres.github.io/UrkuSAR/**. La ejecución `43616067248`, intento 2, finalizó correctamente después de activar Pages.

`.github/workflows/pages.yml` valida fixtures y pruebas funcionales antes de ejecutar la nueva puerta de calidad `test:release`; solo sube el artefacto y despliega si todas pasan. Ante un fallo guarda diagnósticos durante siete días. Los cambios locales no se publican automáticamente: requieren commit/push a `main` o ejecutar el workflow sobre un commit ya subido. Para un nuevo repositorio es necesario activar **Settings → Pages → Source: GitHub Actions**; de lo contrario el despliegue puede devolver 404.

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

- Ejecutar `npm ci`, instalar Chromium y completar `npm run check` sin fallos.
- Revisar las capturas de escritorio/móvil y los resultados axe; no ignorar advertencias `incomplete` sin revisión.
- Confirmar etiquetas sintéticas, valores iniciales Z-04=91 y separación entre catálogo e índice.
- Probar selección, filtros, recálculo, exportación de subconjuntos y reporte descargado.
- Comprobar teclado: salto al contenido, selección del mapa, cierre con Escape y retorno de foco.
- Ensayar el guion en menos de tres minutos y preparar el flujo alternativo sin red tras cargar la página.
- Antes de publicar, revisar diff y ausencia de credenciales; tras un push autorizado, comprobar el workflow y la URL pública, no solo el build local.
- Mantener visibles los pendientes: QGIS, lectores de pantalla reales, otros motores de navegador, datos LOS/QA térmico y revisión geotécnica. No constituyen validaciones completadas por estas pruebas.
