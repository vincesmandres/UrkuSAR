# Hitos de desarrollo de UrkuSAR

Este plan ordena la construcción del MVP desde la demo actual hasta un prototipo respaldado por datos reproducibles.

## Hito 0 · Base navegable

**Estado:** completado  
**Objetivo:** disponer de una interfaz demostrable para validar la propuesta.

**Entregables**

- SPA React/Vite ejecutable localmente.
- Dashboard responsive con mapa estilizado de Cotopaxi.
- Polígonos, métricas, eventos, capas y selección interactiva.
- Identidad de producto unificada como UrkuSAR.

**Aceptación**

- `npm run build` termina sin errores.
- La pantalla principal carga sin credenciales ni servicios externos.

## Hito 1 · Contrato de datos y fixture reproducible

**Estado:** completado; validación reforzada durante el Hito 2

**Objetivo:** reemplazar datos embebidos en la UI por un modelo de datos explícito.

**Entregables**

- `data/` con fixture GeoJSON de zonas y archivos de observaciones.
- Esquema documentado para térmico, deformación, riesgo y metadatos.
- Utilidad de carga que valide geometrías, unidades y campos obligatorios.
- UI consumiendo el fixture mediante un único adaptador.

**Aceptación**

- Un comando de validación detecta geometrías o unidades inválidas.
- Cambiar el fixture actualiza mapa, métricas y detalle sin editar componentes.

## Hito 2 · Motor de correlación explicable

**Estado:** implementado y probado para el contrato sintético v1; validación científica pendiente

**Objetivo:** calcular el índice de riesgo a partir de variables observables.

**Entregables**

- Normalización de anomalía térmica y desplazamiento.
- Normalización de persistencia temporal agregada y conservación de confianza declarada. Su cálculo desde series reales queda pendiente porque el fixture contiene una sola observación por zona.
- Índice compuesto con pesos configurables y niveles crítico/elevado/vigilancia.
- GeoJSON de salida con explicación por polígono.

**Aceptación**

- El mismo input produce el mismo output.
- Cada polígono expone los valores usados para el score.
- Existen casos de prueba para los tres niveles de riesgo.

**Evidencia de implementación (12 noviembre 2026)**

- `src/data/model.js`: motor determinista, validación compartida y explicación por polígono.
- `npm test`: 23 pruebas del modelo/contrato.
- `npm run test:e2e`: 8 pruebas Chromium en escritorio y móvil, selección por teclado, filtros, recálculo, errores de configuración, descarga GeoJSON y ausencia de desbordamiento horizontal.
- `npm run validate:data` y `npm run build`: correctos.
- Rediseño minimalista claro; eliminados tiempo real ficticio, tendencias decorativas y controles sin implementación.
- No es correlación estadística demostrada ni predicción. Pesos, normalizadores y umbrales requieren calibración; confianza y persistencia son entradas del fixture.

## Hito 3 · Integración de fuentes NASA

**Estado:** integración de catálogos e importadores implementada; correlación real pendiente de productos válidos para Cotopaxi

**Objetivo:** conectar datos reales sin romper la demo offline.

**Entregables**

- Adaptador MODIS/VIIRS con configuración por región y fecha.
- Adaptador para productos InSAR preprocesados Sentinel-1/NISAR.
- Cache local de respuestas y registro de errores de ingesta.
- Indicador de fuente, fecha, resolución y frescura en la UI.

**Aceptación**

- La aplicación funciona con red y también con el fixture local.
- Una falla remota no deja el dashboard en estado inconsistente.

**Avance verificado (13 noviembre 2026)**

- Consultas públicas NASA CMR (MOD14A1 y OPERA DISP-S1) y ASF Sentinel-1 SLC por BBOX y fechas; no requieren claves en el cliente.
- Importadores CSV MODIS/VIIRS FIRMS y CSV normalizado de desplazamiento LOS preprocesado. Validan coordenadas, fechas, unidades por contrato, referencia y procedencia declarada.
- Caché local por fuente/rango de 15 minutos. Ante fallos se muestra la caché antigua del mismo rango, o un error si no existe. No se sustituyen fallos por observaciones cero.
- UI con procedencia, fecha de adquisición, fecha de consulta, resolución nominal y estados remota/caché/error. Errores visibles por fuente; no se guardan logs persistentes de errores.
- 54 pruebas unitarias (23 de modelo y 31 de ingesta) y 18 de navegador correctas. Verificación real desde CLI y Chromium: 4 entradas MODIS, 10 escenas Sentinel-1 y 0 productos DISP-S1 para el rango inicial. Estos conteos no son mediciones de inestabilidad.
- Builds normal y con base `/UrkuSAR/`; workflow de GitHub Pages preparado, aún sin publicación pública.

**Pendiente para cerrar la integración científica**

- Obtener un producto de deformación LOS procesado que cubra Cotopaxi, con referencia, coherencia, geometría y unidades. OPERA DISP-S1 no cubre Ecuador; las escenas SLC no son desplazamiento.
- Establecer línea base térmica y QA: el brillo FIRMS en Kelvin y la FRP en MW no equivalen a una anomalía °C.
- Alinear fechas/resoluciones y definir persistencia sobre series antes de conectar observaciones al índice. Por ahora las importaciones y catálogos están deliberadamente separados de la demo sintética.
- Validar con archivos de campo/proveedor: las pruebas CSV usan ejemplos de test, no un dataset científico validado. No se implementó lector nativo HDF5/GeoTIFF ni ingesta NISAR.

## Hito 4 · Exportación y revisión geotécnica

**Estado:** exportación y reportes implementados; revisión en QGIS y aprobación geotécnica pendientes

**Objetivo:** hacer que el resultado sea útil fuera del dashboard.

**Entregables**

- Descarga de GeoJSON de zonas visibles o seleccionadas.
- Reporte resumido de una zona con sus evidencias y limitaciones.
- Metadatos para abrir el resultado en QGIS.
- Revisión de vocabulario y umbrales con criterio geotécnico.

**Aceptación**

- El GeoJSON exportado es válido y conserva CRS y propiedades.
- El reporte distingue priorización de riesgo de alerta oficial.

**Avance verificado (13 noviembre 2026)**

- Exportación de todas las zonas, las visibles según el filtro o la seleccionada, incluso si está fuera del filtro actual. Sin sustitución silenciosa de un conjunto vacío por todas las zonas.
- GeoJSON conserva IDs, coordenadas WGS84 longitud/latitud, miembro `crs`, propiedades y explicación sin reproyección. Recalcula `bbox` para el subconjunto y añade metadatos de alcance y fecha de exportación.
- Campos planos para tablas GIS: `zoneId`, procedencia, unidades, pesos, aportes y umbrales. La explicación anidada original también se conserva.
- Reporte por zona con vista previa modal y descarga HTML autónoma sin scripts. Puede imprimirse o guardarse como PDF con el navegador; no hay un generador PDF del lado servidor.
- El reporte captura el análisis aplicado al abrirlo, no los pesos editados sin recalcular. Incluye fuentes previstas, fechas, entradas, normalización, contribuciones y limitaciones del fixture sintético.
- 63 pruebas unitarias y 26 de navegador correctas: subconjuntos, metadatos, snapshots, escape HTML, descarga, modo offline, estilos de impresión y navegación modal por teclado. Build de producción correcto.
- No hay ejecutables QGIS/ogrinfo disponibles en el entorno. Se verificaron invariantes GeoJSON/CRS y descarga en navegador, no una apertura en QGIS. Vocabulario revisado para evitar promesas predictivas; los umbrales siguen sin calibración ni aprobación profesional.

## Hito 5 · Calidad, demo y entrega

**Estado:** planificado  
**Objetivo:** cerrar un prototipo presentable y verificable.

**Entregables**

- Pruebas de componentes críticos y validación del pipeline.
- Revisión responsive en escritorio y móvil.
- Guion de demo de tres minutos y flujo de pitch.
- Documentación de instalación, arquitectura, datos y trabajo futuro.

**Aceptación**

- Build limpio y checklist de demo completado.
- Se puede explicar el origen de cada métrica mostrada.
- No se presentan resultados sintéticos como observaciones oficiales.

## Orden de trabajo inmediato

1. Obtener y validar productos térmicos y LOS compatibles para cerrar el Hito 3; no convertir metadatos de catálogo en mediciones.
2. Definir alineación temporal/espacial, línea base térmica y persistencia a partir de series, sin confundir confianza con probabilidad de fallo.
3. Completar revisión manual del Hito 4 en QGIS y evaluación de supuestos con un especialista; los reportes y las exportaciones ya están implementados.
4. Autorizar commit/push y activar Pages con GitHub Actions para publicar la revisión. El build de revisión local no es un despliegue público.
5. Iniciar Hito 5: checklist de entrega, guion de demostración y revisión final de accesibilidad/operación, manteniendo explícitos los pendientes científicos.
