# Alcance del producto UrkuSAR

## Propósito

UrkuSAR es un sistema de diagnóstico geotécnico que convierte observaciones satelitales en señales priorizadas para protección civil e ingeniería. El MVP debe responder una pregunta concreta: **¿qué zonas del entorno del Cotopaxi muestran una combinación preocupante de anomalía térmica y deformación del terreno?**

## Usuario objetivo

- Analista de riesgos y protección civil que necesita priorizar inspecciones.
- Especialista geotécnico que necesita revisar evidencia espacial antes de una visita de campo.
- Equipo de investigación que necesita demostrar una correlación reproducible con datos NASA.

## Alcance del MVP

### Producto web

- Dashboard responsive con identidad visual UrkuSAR.
- Mapa de una región objetivo: Cotopaxi, Ecuador.
- Capas de anomalía térmica, deformación InSAR y riesgo compuesto.
- Selección de polígonos con métricas, nivel de riesgo, superficie y tendencia.
- Filtros por periodo y activación independiente de capas.
- Feed de eventos recientes y estado de actualización de datos.

### Datos y procesamiento

- Dataset de demostración versionado para permitir una primera carga sin credenciales externas.
- Adaptadores para datos MODIS/VIIRS y escenas InSAR preprocesadas de Sentinel-1/NISAR.
- Normalización espacial a una grilla común de la región objetivo.
- Índice compuesto explicable, basado en anomalía térmica, desplazamiento y persistencia temporal.
- Exportación de polígonos de riesgo a GeoJSON para interoperabilidad con QGIS y otros clientes.

### Trazabilidad y comunicación

- Indicar siempre si los datos son sintéticos, históricos o provenientes de una fuente externa.
- Mostrar fecha de captura, resolución y fuente de cada vector.
- Documentar supuestos, limitaciones y umbrales del modelo.
- Preparar una demo reproducible para el pitch del proyecto.

## Fuera de alcance

- Monitoreo global o procesamiento en tiempo real a escala planetaria.
- Cálculo de phase unwrapping desde señales SAR crudas.
- Predicción determinista de colapsos o emisión de alertas oficiales.
- Entrenamiento de una GAN o de un modelo profundo desde cero.
- Sustituir la inspección de campo, la autoridad competente o el criterio de un ingeniero.

## Criterios de éxito del MVP

- La interfaz permite identificar una zona, entender por qué fue priorizada y consultar su evidencia.
- El pipeline puede producir el mismo GeoJSON a partir del mismo conjunto de entradas.
- Cada resultado incluye fuente, fecha, unidad y nivel de confianza.
- La experiencia funciona en escritorio y móvil sin depender de una API externa para la demo.
- El proyecto puede ejecutarse con `npm install`, `npm run dev` y `npm run build`.

## Riesgos y decisiones

- **Disponibilidad de APIs:** se usará una muestra local como fallback y se aislará la ingesta remota.
- **Comparabilidad de sensores:** se documentarán resoluciones y reproyecciones antes de correlacionar.
- **Interpretación del riesgo:** el índice se presentará como priorización técnica, no como predicción determinista.
- **Rendimiento:** se limitará el MVP a una región y a geometrías simplificadas.
