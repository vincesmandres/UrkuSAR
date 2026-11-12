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

**Estado:** siguiente  
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

**Estado:** planificado  
**Objetivo:** calcular el índice de riesgo a partir de variables observables.

**Entregables**

- Normalización de anomalía térmica y desplazamiento.
- Cálculo de persistencia temporal y confianza de observación.
- Índice compuesto con pesos configurables y niveles crítico/elevado/vigilancia.
- GeoJSON de salida con explicación por polígono.

**Aceptación**

- El mismo input produce el mismo output.
- Cada polígono expone los valores usados para el score.
- Existen casos de prueba para los tres niveles de riesgo.

## Hito 3 · Integración de fuentes NASA

**Estado:** planificado  
**Objetivo:** conectar datos reales sin romper la demo offline.

**Entregables**

- Adaptador MODIS/VIIRS con configuración por región y fecha.
- Adaptador para productos InSAR preprocesados Sentinel-1/NISAR.
- Cache local de respuestas y registro de errores de ingesta.
- Indicador de fuente, fecha, resolución y frescura en la UI.

**Aceptación**

- La aplicación funciona con red y también con el fixture local.
- Una falla remota no deja el dashboard en estado inconsistente.

## Hito 4 · Exportación y revisión geotécnica

**Estado:** planificado  
**Objetivo:** hacer que el resultado sea útil fuera del dashboard.

**Entregables**

- Descarga de GeoJSON de zonas visibles o seleccionadas.
- Reporte resumido de una zona con sus evidencias y limitaciones.
- Metadatos para abrir el resultado en QGIS.
- Revisión de vocabulario y umbrales con criterio geotécnico.

**Aceptación**

- El GeoJSON exportado es válido y conserva CRS y propiedades.
- El reporte distingue priorización de riesgo de alerta oficial.

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

1. Completar el Hito 1 con fixtures y contrato de datos.
2. Extraer el cálculo de riesgo para iniciar el Hito 2.
3. Conectar la UI al adaptador antes de integrar APIs externas.
4. Añadir exportación y pruebas antes de pulir el pitch.
