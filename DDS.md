# Driven-Development Specification (DDS)
## UrkuSAR

### 1. Arquitectura del Sistema
El sistema se diseña como un pipeline híbrido de alerta temprana que cruza dos vectores de datos satelitales para predecir inestabilidad estructural y geotécnica.

### 2. Fuentes de Datos (NASA Open Data)
*   **Vector Térmico (MODIS / VIIRS):** Detección de anomalías térmicas extremas (incendios, calentamiento volcánico).
*   **Vector de Deformación (NISAR / Sentinel-1):** Radar de Apertura Sintética (SAR) para medir el desplazamiento milimétrico de la corteza terrestre (subsidencia, tensión de fallas).

### 3. Pipeline de Procesamiento (El Core de ML)
1.  **Ingesta:** Scripts en Python automatizados para extraer datos de los últimos 30 días de la región objetivo.
2.  **Procesamiento:** 
    *   Uso de Kaggle para ejecutar el script de cruce de datos.
    *   En lugar de calcular el "Phase Unwrapping" desde cero en 48 horas, se consumirán datos InSAR pre-procesados de nivel 2/3.
3.  **Motor de Correlación:** Un modelo ligero que mapea el impacto de zonas calcinadas/calientes contra el desplazamiento del terreno para identificar polígonos de alto riesgo de deslizamiento o colapso geotécnico.

### 4. Tech Stack (Hackathon Edition)
*   **Back-end & Datos:** Python, Pandas, GeoPandas, Scikit-learn (Kaggle Notebooks para agilidad).
*   **Control de Versiones:** GitHub (obligatorio para demostrar orden a los jueces).
*   **Front-end:** React / Mapbox GL JS (para renderizar mapas oscuros de alto rendimiento).
*   **Modelado Estructural (Extra para Pitch):** Autodesk (para simulaciones rápidas de cargas estructurales en el video).
