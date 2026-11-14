const LEVELS = { critical: 'Crítico', elevated: 'Elevado', watch: 'Vigilancia' }
const CRS = 'urn:ogc:def:crs:OGC:1.3:CRS84'

export function exportAnalysis(
  analysis,
  {
    scope = 'all',
    selectedId,
    level = 'all',
    exportedAt = new Date().toISOString(),
  } = {},
) {
  if (
    analysis?.type !== 'FeatureCollection' ||
    !Array.isArray(analysis.features) ||
    !analysis.metadata
  )
    throw new Error('Se requiere un análisis con procedencia.')
  if (!['all', 'visible', 'selected'].includes(scope))
    throw new Error('Alcance de exportación inválido.')
  if (level !== 'all' && !Object.hasOwn(LEVELS, level))
    throw new Error('Filtro de nivel inválido.')
  if (
    typeof exportedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(exportedAt) ||
    !Number.isFinite(Date.parse(exportedAt)) ||
    new Date(exportedAt).toISOString() !==
      (exportedAt.includes('.') ? exportedAt : exportedAt.replace('Z', '.000Z'))
  )
    throw new Error('Fecha de exportación inválida.')
  if (analysis.crs?.properties?.name !== CRS)
    throw new Error(
      'El exportador requiere coordenadas WGS84 longitud/latitud (CRS84).',
    )
  if (
    !analysis.features.every(
      (feature) =>
        feature?.type === 'Feature' &&
        typeof feature.id === 'string' &&
        feature.properties?.explanation &&
        feature.geometry?.type === 'Polygon',
    )
  )
    throw new Error('El análisis contiene zonas sin geometría o explicación.')
  if (
    new Set(analysis.features.map(({ id }) => id)).size !==
    analysis.features.length
  )
    throw new Error('El análisis contiene IDs duplicados.')

  let features = analysis.features
  if (scope === 'selected') {
    features = features.filter(({ id }) => id === selectedId)
    if (features.length !== 1)
      throw new Error('La zona seleccionada no existe en el análisis.')
  } else if (scope === 'visible' && level !== 'all') {
    features = features.filter(({ properties }) => properties.level === level)
  }

  const result = structuredClone(analysis)
  // Bounds of a subset must never retain the extent of the original collection.
  delete result.bbox
  result.features = structuredClone(features).map((feature) => {
    const p = feature.properties
    Object.assign(p, {
      zoneId: feature.id,
      dataStatus: analysis.metadata.status,
      observedAt: analysis.metadata.observedAt,
      coordinateReference: 'OGC:CRS84',
      coordinateOrder: 'longitude,latitude',
      thermalUnit: 'degC',
      displacementUnit: 'mm',
      persistenceUnit: 'day',
      thermalSource: analysis.metadata.sources.thermal.provider,
      displacementSource: analysis.metadata.sources.displacement.provider,
      thermalSourceStatus: analysis.metadata.sources.thermal.status,
      displacementSourceStatus: analysis.metadata.sources.displacement.status,
      areaIsGeometryDerived: false,
      modelVersion: p.explanation.version,
      thermalWeight: p.explanation.weights.thermal,
      displacementWeight: p.explanation.weights.displacement,
      persistenceWeight: p.explanation.weights.persistence,
      thermalContribution: p.explanation.contributions.thermal,
      displacementContribution: p.explanation.contributions.displacement,
      persistenceContribution: p.explanation.contributions.persistence,
      elevatedThreshold: p.explanation.thresholds.elevated,
      criticalThreshold: p.explanation.thresholds.critical,
      limitation: analysis.metadata.limitation,
    })
    return feature
  })
  result.metadata.export = {
    version: '1.0.0',
    exportedAt,
    scope,
    level: scope === 'visible' ? level : null,
    selectedId: scope === 'selected' ? selectedId : null,
    featureCount: features.length,
    coordinateReference: 'OGC:CRS84',
    coordinateOrder: 'longitude,latitude',
    geometryNote:
      'Geometrías ilustrativas conservadas sin reproyección; no son límites oficiales.',
    areaNote: 'areaKm2 proviene del fixture; no se calcula desde la geometría.',
  }
  if (features.length) {
    const coordinates = features.flatMap(({ geometry }) =>
      geometry.coordinates.flat(),
    )
    const extent = [Infinity, Infinity, -Infinity, -Infinity]
    for (const [x, y] of coordinates) {
      extent[0] = Math.min(extent[0], x)
      extent[1] = Math.min(extent[1], y)
      extent[2] = Math.max(extent[2], x)
      extent[3] = Math.max(extent[3], y)
    }
    result.bbox = extent
  }
  return result
}

export function createZoneReport(
  analysis,
  selectedId,
  generatedAt = new Date().toISOString(),
) {
  if (analysis?.metadata?.status !== 'synthetic')
    throw new Error(
      'Este formato de reporte solo admite la demostración sintética.',
    )
  const snapshot = exportAnalysis(analysis, {
    scope: 'selected',
    selectedId,
    exportedAt: generatedAt,
  })
  return {
    version: '1.0.0',
    generatedAt,
    zone: snapshot.features[0],
    metadata: snapshot.metadata,
    bbox: snapshot.bbox,
    crs: snapshot.crs,
  }
}

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  )
const format = (value) =>
  typeof value === 'number'
    ? new Intl.NumberFormat('es-EC', { maximumFractionDigits: 4 }).format(value)
    : value

export function renderZoneReport(report) {
  const p = report.zone.properties
  const e = p.explanation
  const rows = [
    [
      'Térmica',
      p.thermalAnomalyC,
      '°C',
      e.normalizers.thermal,
      e.normalized.thermal,
      e.weights.thermal,
      e.contributions.thermal,
    ],
    [
      'Deformación (magnitud para el índice)',
      p.displacementMm,
      'mm',
      e.normalizers.displacement,
      e.normalized.displacement,
      e.weights.displacement,
      e.contributions.displacement,
    ],
    [
      'Persistencia declarada',
      p.persistenceDays,
      'días',
      e.normalizers.persistence,
      e.normalized.persistence,
      e.weights.persistence,
      e.contributions.persistence,
    ],
  ]
  const facts = [
    ['Zona', report.zone.id],
    ['Región', report.metadata.region],
    ['Fecha de observación del fixture', p.observedOn],
    ['Corte del fixture (UTC)', report.metadata.observedAt],
    ['Generado (UTC)', report.generatedAt],
    ['Versión del modelo', e.version],
    ['Estado de los datos', report.metadata.status],
    [
      'Confianza declarada (no probabilidad de fallo)',
      `${format(p.confidence * 100)}%`,
    ],
    ['Área declarada del fixture, no calculada', `${format(p.areaKm2)} km²`],
    ['CRS / orden de coordenadas', 'WGS84 · OGC:CRS84 · longitud, latitud'],
    ['Extensión [oeste, sur, este, norte]', report.bbox.join(', ')],
  ]
  return `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>UrkuSAR · Reporte ${escape(report.zone.id)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#fafbf8;color:#242c27;font:14px/1.6 system-ui,sans-serif}main{max-width:900px;margin:auto;padding:32px}header{border-bottom:1px solid #dce1d7;padding-bottom:20px}h1{font-size:28px;line-height:1.2;font-weight:500;margin:12px 0}h2{font-size:18px;font-weight:600;margin:26px 0 12px}.eyebrow{font:11px monospace;letter-spacing:1px}.notice{border:1px solid #ac806d;padding:14px;color:#764631}.score{font-size:40px;font-weight:400;margin:18px 0}.score small{font-size:14px}dl{display:grid;grid-template-columns:minmax(170px,1fr) 2fr;gap:8px 20px}dt{color:#59634f}dd{margin:0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;border-bottom:1px solid #dce1d7;padding:9px 5px;vertical-align:top}.table-wrap{overflow:auto}code{overflow-wrap:anywhere}footer{margin-top:28px;border-top:1px solid #dce1d7;padding-top:16px;color:#59634f;font-size:12px}li{margin:8px 0}p{overflow-wrap:anywhere}@media(max-width:600px){main{padding:18px}dl{grid-template-columns:1fr;gap:3px}dd{margin-bottom:10px}h1{font-size:24px}}@media print{@page{size:A4;margin:16mm}body{background:white;font-size:10pt}main{padding:0;max-width:none}h2{break-after:avoid}tr,.notice,header{break-inside:avoid}.table-wrap{overflow:visible}table{font-size:8pt}footer{font-size:9pt}}
</style></head><body><main>
<header><div class="eyebrow">URKUSAR / REPORTE DE ZONA / DEMOSTRACIÓN SINTÉTICA</div><h1>${escape(p.name)}</h1><p class="notice">No es una alerta oficial ni un dictamen geotécnico. Los valores y polígonos son sintéticos. No utilizar para evacuaciones, diseño estructural o decisiones operativas.</p></header>
<section><h2>Resultado heurístico</h2><p class="score">${escape(format(p.risk))} <small>/ 100 · ${escape(LEVELS[p.level])}</small></p><p>El índice prioriza señales según pesos ilustrativos; no expresa probabilidad de colapso. Se clasifica con el valor sin redondear: vigilancia &lt; ${escape(e.thresholds.elevated)}, elevado ≥ ${escape(e.thresholds.elevated)} y &lt; ${escape(e.thresholds.critical)}, crítico ≥ ${escape(e.thresholds.critical)}.</p><dl>${facts.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join('')}</dl></section>
<section><h2>Entradas y explicación</h2><p>Índice = 100 × Σ(señal normalizada × peso). Las señales se limitan a [0, 1]. La temperatura negativa aporta cero; el desplazamiento se utiliza en magnitud.</p><div class="table-wrap" role="region" aria-label="Entradas y aportes al índice" tabindex="0"><table><thead><tr><th>Vector</th><th>Entrada</th><th>Unidad</th><th>Saturación</th><th>Normalizado</th><th>Peso</th><th>Aporte (puntos)</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escape(format(value))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>Los valores presentados se redondean a cuatro decimales. El GeoJSON conserva la precisión numérica del cálculo y la explicación completa.</p></section>
<section><h2>Procedencia</h2><p>Esquema ${escape(report.metadata.schemaVersion)}. Los nombres de sensores describen fuentes previstas; no acreditan una adquisición real de los valores del fixture.</p><ul>${Object.values(
    report.metadata.sources,
  )
    .map(
      (item) =>
        `<li>${escape(item.provider)} · estado ${escape(item.status)} · unidad ${escape(item.unit)} · resolución declarada ${escape(item.resolution)}</li>`,
    )
    .join(
      '',
    )}</ul><p>Las consultas a catálogos y los CSV importados en el módulo de fuentes no están incorporados a este reporte.</p></section>
<section><h2>Limitaciones y revisión pendiente</h2><ul><li>${escape(report.metadata.limitation)}</li><li>Persistencia y confianza son entradas del fixture, no estimaciones desde series temporales. La confianza no modifica el índice.</li><li>Pesos, normalizadores y umbrales no están calibrados con eventos reales ni aprobados por un especialista.</li><li>El área declarada no se deriva del polígono. Las geometrías no delimitan peligro real.</li><li>Antes de cualquier evaluación técnica se requieren datos verificados, línea base térmica, QA, referencia LOS, alineación espacial/temporal e inspección de campo.</li></ul></section>
<footer>Snapshot del análisis al abrir el reporte; cambios posteriores de pesos no alteran este archivo. Exporta el GeoJSON de la misma configuración para examinar sus campos en QGIS. Archivo HTML autónomo: puede imprimirse o guardarse como PDF desde el navegador.</footer>
</main></body></html>`
}
