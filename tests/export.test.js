import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { analyze, DEFAULT_CONFIG } from '../src/data/model.js'
import {
  createZoneReport,
  exportAnalysis,
  renderZoneReport,
} from '../src/data/export.js'

const zones = JSON.parse(
  await readFile(new URL('../src/data/zones.geojson', import.meta.url), 'utf8'),
)
const observations = JSON.parse(
  await readFile(
    new URL('../src/data/observations.json', import.meta.url),
    'utf8',
  ),
)
const analysis = analyze(zones, observations)
const exportedAt = '2026-11-13T13:00:00.000Z'

test('exporta todas las zonas con identidad, CRS, geometría y explicación intactas', () => {
  const result = exportAnalysis(analysis, { exportedAt })
  assert.equal(result.type, 'FeatureCollection')
  assert.deepEqual(result.crs, analysis.crs)
  assert.equal(result.metadata.status, 'synthetic')
  assert.deepEqual(result.metadata.sources, analysis.metadata.sources)
  assert.equal(result.metadata.export.scope, 'all')
  assert.equal(result.metadata.export.featureCount, 3)
  assert.equal(result.metadata.export.exportedAt, exportedAt)
  assert.deepEqual(result.bbox, [-78.46, -0.74, -78.28, -0.57])
  for (let index = 0; index < result.features.length; index++) {
    const feature = result.features[index]
    assert.equal(feature.id, analysis.features[index].id)
    assert.deepEqual(feature.geometry, analysis.features[index].geometry)
    assert.deepEqual(
      feature.properties.explanation,
      analysis.features[index].properties.explanation,
    )
    assert.equal(feature.properties.zoneId, feature.id)
    assert.equal(feature.properties.displacementUnit, 'mm')
    assert.equal(feature.properties.thermalUnit, 'degC')
    assert.equal(feature.properties.dataStatus, 'synthetic')
    assert.equal(feature.properties.coordinateOrder, 'longitude,latitude')
    assert.equal(
      feature.properties.thermalWeight,
      feature.properties.explanation.weights.thermal,
    )
  }
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result)
})

test('exporta visibles según el filtro y recalcula extensión del subconjunto', () => {
  const result = exportAnalysis(
    { ...analysis, bbox: [-180, -90, 180, 90] },
    { scope: 'visible', level: 'elevated', exportedAt },
  )
  assert.deepEqual(
    result.features.map(({ id }) => id),
    ['Z-02'],
  )
  assert.equal(result.metadata.export.level, 'elevated')
  assert.deepEqual(result.bbox, [-78.36, -0.66, -78.28, -0.57])
  assert.equal(
    exportAnalysis(analysis, { scope: 'visible', level: 'all', exportedAt })
      .features.length,
    3,
  )
})

test('zona seleccionada se exporta aunque esté fuera del filtro visible', () => {
  const result = exportAnalysis(analysis, {
    scope: 'selected',
    selectedId: 'Z-01',
    level: 'critical',
    exportedAt,
  })
  assert.deepEqual(
    result.features.map(({ id }) => id),
    ['Z-01'],
  )
  assert.equal(result.metadata.export.selectedId, 'Z-01')
  assert.equal(result.metadata.export.level, null)
})

test('un subconjunto vacío no exporta todas las zonas ni una extensión infinita', () => {
  const noneCritical = analyze(zones, observations, {
    ...DEFAULT_CONFIG,
    normalizers: { thermal: 500, displacement: 2000, persistence: 3000 },
  })
  const result = exportAnalysis(
    { ...noneCritical, bbox: [-180, -90, 180, 90] },
    { scope: 'visible', level: 'critical', exportedAt },
  )
  assert.deepEqual(result.features, [])
  assert.equal(result.metadata.export.featureCount, 0)
  assert.equal('bbox' in result, false)
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result)
})

test('conserva pesos aplicados y no reintroduce valores predeterminados', () => {
  const adjusted = analyze(zones, observations, {
    ...DEFAULT_CONFIG,
    weights: { thermal: 1, displacement: 0, persistence: 0 },
  })
  const result = exportAnalysis(adjusted, {
    scope: 'selected',
    selectedId: 'Z-04',
    exportedAt,
  })
  assert.equal(result.features[0].properties.risk, 96)
  assert.equal(result.features[0].properties.thermalWeight, 1)
  assert.equal(result.features[0].properties.displacementWeight, 0)
  const report = createZoneReport(adjusted, 'Z-04', exportedAt)
  assert.equal(report.zone.properties.risk, 96)
  assert.equal(report.zone.properties.explanation.weights.thermal, 1)
})

test('exportación y reporte son snapshots independientes y reproducibles', () => {
  const original = structuredClone(analysis)
  const first = exportAnalysis(analysis, { exportedAt })
  assert.deepEqual(first, exportAnalysis(analysis, { exportedAt }))
  const report = createZoneReport(analysis, 'Z-04', exportedAt)
  assert.equal(
    renderZoneReport(report),
    renderZoneReport(createZoneReport(analysis, 'Z-04', exportedAt)),
  )
  first.features[0].geometry.coordinates[0][0][0] = 0
  report.zone.properties.explanation.weights.thermal = 0
  report.metadata.sources.thermal.provider = 'changed'
  assert.deepEqual(analysis, original)
})

test('reporte incluye advertencias, unidades, aportes y procedencia', () => {
  const html = renderZoneReport(createZoneReport(analysis, 'Z-04', exportedAt))
  for (const expected of [
    'No es una alerta oficial',
    'no expresa probabilidad',
    'WGS84',
  ]) {
    assert.ok(html.includes(expected))
  }
  assert.ok(html.includes('DEMOSTRACIÓN SINTÉTICA'))
  assert.ok(html.includes('MODIS / VIIRS'))
  assert.ok(html.includes('33,6'))
  assert.ok(html.includes('41,4'))
  assert.ok(html.includes('Área declarada del fixture, no calculada'))
  assert.ok(html.includes(exportedAt))
  assert.ok(html.includes('no están incorporados a este reporte'))
  assert.ok(html.includes('@media print'))
  assert.ok(html.includes('Content-Security-Policy'))
  assert.ok(!/<script\b|<link\b|<img\b/i.test(html))
})

test('reporte escapa nombres, atributos y metadatos no confiables', () => {
  const input = structuredClone(analysis)
  input.features[0].properties.name = '<img src=x onerror="alert(1)">&\''
  input.metadata.sources.thermal.provider = '</li><script>alert(1)</script>'
  input.metadata.region = '</style><iframe src="https://evil.example">'
  const html = renderZoneReport(createZoneReport(input, 'Z-04', exportedAt))
  assert.ok(
    html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;'),
  )
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!/<script\b|<img\b|<iframe\b/i.test(html))
})

test('rechaza alcances, filtros, fechas, IDs y CRS desconocidos', () => {
  assert.throws(() => exportAnalysis(analysis, { scope: 'unknown' }))
  assert.throws(() => exportAnalysis(analysis, { level: 'unknown' }))
  assert.throws(() => exportAnalysis(analysis, { exportedAt: 'bad' }))
  assert.throws(() =>
    exportAnalysis(analysis, { exportedAt: '2026-02-30T13:00:00Z' }),
  )
  assert.throws(() =>
    exportAnalysis(analysis, { scope: 'selected', selectedId: 'missing' }),
  )
  assert.throws(() => createZoneReport(analysis, 'missing'))
  assert.throws(() => exportAnalysis({ ...analysis, crs: undefined }))
  assert.throws(() =>
    exportAnalysis({
      ...analysis,
      features: [analysis.features[0], analysis.features[0]],
    }),
  )
  assert.throws(
    () =>
      createZoneReport(
        { ...analysis, metadata: { ...analysis.metadata, status: 'observed' } },
        'Z-04',
      ),
    /sintética/,
  )
})
