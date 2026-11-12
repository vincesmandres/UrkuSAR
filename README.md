# UrkuSAR

Dashboard de inteligencia geotécnica para cruzar anomalías térmicas MODIS/VIIRS con deformación InSAR y priorizar zonas de riesgo. El prototipo está enfocado en el volcán Cotopaxi, Ecuador, siguiendo el alcance de `SCOPE.md` y la arquitectura descrita en `DDS.md`.

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

- Dashboard responsive con estética dark/cyberpunk y lenguaje de ingeniería.
- Mapa de correlación con polígonos de riesgo, sensores térmicos y puntos de deformación.
- Selector de periodo, capas activables y selección interactiva de zonas.
- Panel de diagnóstico con índice compuesto, métricas y señal histórica.
- Feed de eventos y estado de los vectores de datos.

Los datos visibles son una muestra sintética para la demostración del flujo de producto. La conexión con datasets NASA preprocesados es el siguiente paso del pipeline descrito en `DDS.md`.
