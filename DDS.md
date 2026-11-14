# Driven-Development Specification (DDS)
## UrkuSAR

### 1. Arquitectura del Sistema
El prototipo combina señales sintéticas para explorar una priorización geotécnica explicable. No predice inestabilidad ni emite alertas. Flujo actual: fixtures locales → validación compartida → índice heurístico → GeoJSON → interfaz React. `src/data/adapter.js` carga los archivos y `src/data/model.js` concentra validación y cálculo, reutilizados por los scripts Node.

### 2. Fuentes consultables y límites

- **MODIS:** catálogo NASA CMR de MOD14A1. Describe productos disponibles, no la presencia de anomalías en la región. Resolución nominal 1 km.
- **FIRMS MODIS/VIIRS:** importación CSV de detecciones; brillo radiométrico en Kelvin y FRP en MW. Se conserva su significado sin convertirlos en anomalías de temperatura.
- **Sentinel-1 SLC:** catálogo público ASF. Escenas complejas para interferometría posterior, no desplazamiento preprocesado. Descargas sujetas a Earthdata Login.
- **OPERA DISP-S1:** consulta de disponibilidad de productos LOS preprocesados. La cobertura publicada no incluye Ecuador. Ningún resultado para Cotopaxi se interpreta como desplazamiento cero.
- **InSAR normalizado:** importación de observaciones LOS de un producto procesado externo. No hay lector de NISAR/HDF5 ni procesamiento interferométrico implementado.

### 3. Contrato de datos v1

- `src/data/zones.geojson`: FeatureCollection no vacío, IDs únicos, nombre, área ilustrativa en km² y número entero de puntos de observación. Polígonos 2D WGS84 en orden longitud/latitud. Las áreas del fixture no se derivan de las geometrías.
- `src/data/observations.json`: versión, región, corte ISO UTC, fuentes declaradas como `fixture`, unidades `°C` y `mm`, y exactamente una observación por zona.
- Cada observación contiene `zoneId`, fecha `YYYY-MM-DD` no posterior al corte, `thermalAnomalyC`, `displacementMm`, `persistenceDays` entero no negativo y `confidence` entre 0 y 1.
- La validación rechaza IDs duplicados/desconocidos, falta de correspondencia, unidades incorrectas, fechas inexistentes, números no finitos, anillos abiertos/degenerados y coordenadas fuera de rango. No sustituye una validación topológica GIS de intersecciones ni garantiza coherencia física.
- La confianza es declarada; la persistencia ya viene agregada. La estimación de ambas desde series temporales requiere otro contrato e ingesta real. No se inventan mediciones faltantes.

### 4. Motor explicable v1

Normalización: `T = clamp(anomalia / 5, 0, 1)`, `D = clamp(abs(desplazamiento) / 20, 0, 1)`, `P = clamp(persistencia / 30, 0, 1)`.

Índice: `100 * (0.35*T + 0.45*D + 0.20*P)`. Un descenso térmico aporta cero, y se usa magnitud del desplazamiento sin inferir su causa. La confianza se conserva separada, no multiplica el índice ni representa probabilidad de colapso.

Pesos no negativos suman 1; normalizadores positivos y umbrales ordenados son configurables mediante `analyze(zones, observations, config)`. La UI permite ajustar los pesos en porcentaje y aplica solo configuraciones válidas.

Clasificación sobre el valor sin redondear: vigilancia < 50, elevado ≥ 50 y < 80, crítico ≥ 80. El redondeo ocurre únicamente al presentar. Todos estos parámetros son ilustrativos y no están calibrados.

Salida: FeatureCollection con geometrías preservadas, `risk`, `level`, fecha, métricas de observación y `explanation` (versión, entradas, normalizaciones 0–1, pesos, aportes en puntos, umbrales, normalizadores). `metadata` identifica procedencia sintética, fuentes previstas y limitaciones. La misma entrada/configuración genera la misma salida, sin alterar los inputs.

### 5. Ingesta del Hito 3

`src/data/sources.js` expone `buildSourceUrl`, `normalizeSource`, `loadSource`, `parseFirmsCsv` y `parseInsarCsv`. `SourcePanel.jsx` mantiene esos datos separados del adaptador del índice. Consulta manual, GET público, sin credenciales; timeout de 15 segundos. Rango máximo de 366 días inclusive, BBOX sin cruce del antimeridiano y 10 registros por fuente.

CMR: `https://cmr.earthdata.nasa.gov/search/granules.json` con `short_name`, BBOX, rango UTC y orden temporal descendente. ASF: `https://api.daac.asf.alaska.edu/services/search/param` con plataforma Sentinel-1, SLC, polígono WGS84 y salida GeoJSON. Ambos se verificaron desde el navegador con CORS.

Caché versionada por fuente y consulta en localStorage, TTL 15 minutos. Se validan registros, fechas y enlaces antes de reusarlos. Caché corrupta/futura se descarta; un error remoto devuelve caché antigua compatible o falla explícitamente. Un fallo de cuota/privacidad no impide una respuesta remota. Errores son visibles en la UI, sin log persistente ni almacenamiento de credenciales.

Contrato CSV FIRMS: `latitude,longitude,acq_date,acq_time,brightness` (MODIS) o `bright_ti4` (VIIRS), además de `frp,confidence,satellite`. Fechas válidas, hora HHMM, brillo positivo, FRP no negativa. Confianza MODIS 0–100; VIIRS l/n/h, sin equiparar escalas.

Contrato CSV InSAR: `latitude,longitude,date,displacement_mm,coherence,reference_date,product_id,source_url`. Fecha de referencia no posterior a medición; desplazamiento firmado en mm, coherencia 0–1, URL HTTPS. Corresponde a puntos WGS84 de desplazamiento LOS, no a movimiento vertical derivado. La procedencia es declarada, no autenticada.

Ambos importadores aceptan BOM, CRLF, delimitadores dentro de comillas y rechazan encabezados duplicados, números vacíos/no finitos, fechas imposibles, referencias inválidas y archivos mayores de 5 MiB UTF-8. Validan todo el archivo antes de filtrar por región/fecha, incluso las filas fuera del rango. No suben ni persisten archivos importados.

Pendiente: producto LOS verificable para Cotopaxi, línea base térmica/QA y contrato temporal para obtener persistencia desde series. Los datos externos no alimentan `analyze` hasta resolver esos puntos. No se infiere causalidad geotécnica a partir de metadatos o un CSV aportado.

### 6. Stack implementado

- React y Vite; mapa SVG local, sin token de Mapbox.
- JavaScript puro compartido entre navegador y Node.js para el motor.
- `node:test` para el cálculo y validación; Playwright/Chromium para interacción, exportación y tamaños de pantalla.
- GitHub para control de versiones. No existe backend remoto ni modelo ML entrenado.

### 7. Reportes y exportación del Hito 4

`src/data/export.js` expone `exportAnalysis`, `createZoneReport` y `renderZoneReport`. Opera sobre el análisis ya calculado, no sobre campos de formulario pendientes ni respuestas de catálogos externos.

`exportAnalysis` acepta alcance `all`, `visible` con filtro de nivel, o `selected` con un ID existente. No modifica las entradas. Conserva geometría, IDs y propiedades, mantiene el CRS84 declarado y recalcula la extensión para el subconjunto. Un subconjunto vacío produce una colección vacía sin `bbox`; la UI deshabilita esa descarga. Rechaza IDs, filtros o CRS desconocidos, en lugar de exportar silenciosamente todo.

Se añaden `metadata.export` (alcance, filtro/selección, fecha, número de entidades, orden espacial y limitaciones geométricas) y propiedades planas de procedencia, pesos, contribuciones y unidades para tablas GIS. `explanation` sigue presente con precisión numérica completa. El `crs` explícito se mantiene por compatibilidad con el fixture; no se afirma una validación formal RFC 7946 ni reproyección.

`createZoneReport` captura una copia independiente de la zona y metadatos. `renderZoneReport` produce HTML con datos escapados, CSP restrictiva, sin scripts, sin solicitudes externas y estilos de impresión A4. La vista previa usa un iframe con sandbox dentro de un diálogo modal. La descarga conserva la misma copia que se está previsualizando; el PDF se obtiene con la función de impresión del navegador, no con un servicio de generación.

El formato de reporte actual solo acepta el estado `synthetic`. Identifica área declarada versus geometría, confianza declarada versus probabilidad de fallo, umbrales ilustrativos versus validación profesional y fuentes previstas versus observaciones reales. La revisión en QGIS y la calibración/aprobación geotécnica permanecen pendientes.

### 8. Auditoría raster y GIS independiente

La aplicación incluye una evidencia archivada, no un nuevo vector para `analyze`. `scripts/audit-products.py` fija URLs, tamaño y SHA-256 de un GeoTIFF de coherencia LiCSAR y un NetCDF NOAA GOES-19 LST. Comprueba CRS/cobertura, escala documentada 0–255 de coherencia, geolocalización de centros de píxel desde la proyección geostacionaria CF, unidades Kelvin y selección DQF=0. No rellena ausencias, no confunde coherencia con mm y no convierte una temperatura absoluta en anomalía. El resultado y sus bloqueos quedan en `src/data/product-audit.json`; los binarios se conservan únicamente en `.data-cache/` ignorado por Git.

Las fechas de esos productos no son compatibles y no hay línea base térmica ni referencia de fase validada. La salida `eligibleForRiskIndex: false` es una decisión deliberada, no un valor de riesgo cero. El script es un auditor de dos productos fijados, no un procesador genérico InSAR o un pipeline de series temporales listo para operar.

`scripts/check-gis.py` obtiene cinco GeoJSON directamente del exportador JS y los abre con el driver GDAL/OGR. Verifica conteo, CRS, campos numéricos, extensión, igualdad de coordenadas y topología GEOS. No requiere GeoPandas ni un servidor GIS y forma parte de CI; la interfaz QGIS y evaluación experta no se simulan. Dependencias Python aisladas y fijadas en `scripts/requirements-gis.txt`.
