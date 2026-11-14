import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { analyze, DEFAULT_CONFIG, validateData } from '../src/data/model.js'

const zones = JSON.parse(
  await readFile(new URL('../src/data/zones.geojson', import.meta.url), 'utf8'),
)
const observations = JSON.parse(
  await readFile(
    new URL('../src/data/observations.json', import.meta.url),
    'utf8',
  ),
)

test('valida fixtures y conserva configuración por defecto', () => {
  assert.equal(validateData(zones, observations), true)
  assert.deepEqual(DEFAULT_CONFIG, {
    weights: { thermal: 0.35, displacement: 0.45, persistence: 0.2 },
    normalizers: { thermal: 5, displacement: 20, persistence: 30 },
    thresholds: { elevated: 50, critical: 80 },
  })
})

test('calcula niveles, score y campos de observación', () => {
  const result = analyze(zones, observations)
  assert.deepEqual(
    result.features.map((feature) => feature.properties.level),
    ['critical', 'elevated', 'watch'],
  )
  assert.deepEqual(
    result.features.map((feature) => feature.properties.confidence),
    [0.91, 0.84, 0.79],
  )
  assert.equal(result.features[0].properties.risk, 91)
  assert.ok(
    Math.abs(
      result.features[0].properties.explanation.normalized.displacement - 0.92,
    ) < 1e-10,
  )
  assert.ok(
    Math.abs(
      result.features[0].properties.explanation.contributions.persistence - 16,
    ) < 1e-10,
  )
  assert.equal(result.features[0].properties.explanation.version, '1.0.0')
})

test('respeta límites de nivel y magnitud de desplazamiento', () => {
  const customZones = structuredClone(zones)
  const customObservations = structuredClone(observations)
  customObservations.observations = customObservations.observations.map(
    (item, index) => ({
      ...item,
      thermalAnomalyC: index === 0 ? 4 : 0,
      displacementMm: index === 0 ? -10 : 0,
      persistenceDays: index === 0 ? 0 : 0,
    }),
  )
  const result = analyze(customZones, customObservations)
  assert.ok(Math.abs(result.features[0].properties.risk - 50.5) < 1e-10)
  const atElevated = structuredClone(customObservations)
  atElevated.observations[0] = {
    ...atElevated.observations[0],
    thermalAnomalyC: 5,
    displacementMm: 20 / 3,
    persistenceDays: 0,
  }
  assert.equal(
    analyze(customZones, atElevated).features[0].properties.level,
    'elevated',
  )
  const atCritical = structuredClone(atElevated)
  atCritical.observations[0] = {
    ...atCritical.observations[0],
    displacementMm: 20,
    persistenceDays: 0,
  }
  assert.equal(
    analyze(customZones, atCritical).features[0].properties.level,
    'critical',
  )
})

test('acepta configuración válida y rechaza configuración inválida', () => {
  const config = {
    weights: { thermal: 0, displacement: 1, persistence: 0 },
    normalizers: { thermal: 1, displacement: 10, persistence: 1 },
    thresholds: { elevated: 40, critical: 90 },
  }
  assert.equal(analyze(zones, observations, config).features.length, 3)
  assert.throws(
    () =>
      analyze(zones, observations, {
        ...config,
        weights: { ...config.weights, thermal: 0.5 },
      }),
    /pesos/i,
  )
})

test('rechaza entradas incompletas, duplicadas, fechas y geometrías inválidas', () => {
  assert.throws(
    () =>
      validateData(zones, {
        ...observations,
        observations: observations.observations.slice(0, 2),
      }),
    /completa/i,
  )
  const duplicate = structuredClone(observations)
  duplicate.observations[1].zoneId = duplicate.observations[0].zoneId
  assert.throws(() => validateData(zones, duplicate), /duplicada/i)
  const badDate = structuredClone(observations)
  badDate.observations[0].date = '12/11/2026'
  assert.throws(() => validateData(zones, badDate), /Fecha/i)
  const badGeometry = structuredClone(zones)
  badGeometry.features[0].geometry.coordinates[0][0][0] = 999
  assert.throws(() => validateData(badGeometry, observations), /Longitud/i)
})

test('es reproducible y no muta entradas', () => {
  const zonesBefore = structuredClone(zones)
  const observationsBefore = structuredClone(observations)
  const first = analyze(zones, observations)
  const second = analyze(zones, observations)
  assert.deepEqual(first, second)
  assert.deepEqual(zones, zonesBefore)
  assert.deepEqual(observations, observationsBefore)
  assert.notStrictEqual(first.features[0], zones.features[0])
  assert.deepEqual(first.features[0].geometry, zones.features[0].geometry)
  first.features[0].geometry.coordinates[0][0][0] = 0
  assert.deepEqual(zones, zonesBefore)
})

test('satura senales, no eleva riesgo por enfriamiento y mantiene confianza separada', () => {
  const input = structuredClone(observations)
  Object.assign(input.observations[0], {
    thermalAnomalyC: 500,
    displacementMm: -2000,
    persistenceDays: 300,
  })
  assert.equal(analyze(zones, input).features[0].properties.risk, 100)
  Object.assign(input.observations[0], {
    thermalAnomalyC: -10,
    displacementMm: 0,
    persistenceDays: 0,
  })
  assert.equal(analyze(zones, input).features[0].properties.risk, 0)
  input.observations[0].confidence = 0
  assert.equal(analyze(zones, input).features[0].properties.risk, 0)
  assert.equal(analyze(zones, input).features[0].properties.confidence, 0)
})

test('umbrales exactos y pesos personalizados', () => {
  const input = structuredClone(observations)
  const config = {
    ...DEFAULT_CONFIG,
    weights: { thermal: 1, displacement: 0, persistence: 0 },
  }
  for (const [thermal, score, level] of [
    [0, 0, 'watch'],
    [2.499, 49.98, 'watch'],
    [2.5, 50, 'elevated'],
    [4, 80, 'critical'],
    [5, 100, 'critical'],
  ]) {
    input.observations[0].thermalAnomalyC = thermal
    const p = analyze(zones, input, config).features[0].properties
    assert.ok(Math.abs(p.risk - score) < 1e-10)
    assert.equal(p.level, level)
  }
})

test('observaciones son fuente unica de metricas, con trazabilidad de salida', () => {
  const changed = structuredClone(zones)
  changed.features[0].properties.risk = 0
  changed.features[0].properties.thermalAnomalyC = 0
  const result = analyze(changed, observations)
  const p = result.features[0].properties
  assert.equal(p.risk, 91)
  assert.equal(p.thermalAnomalyC, 4.8)
  assert.equal(p.observedOn, observations.observations[0].date)
  assert.equal(result.metadata.status, 'synthetic')
  assert.deepEqual(result.metadata.sources, observations.sources)
  assert.deepEqual(result.crs, zones.crs)
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result)
  for (const { properties } of result.features) {
    assert.ok(
      Math.abs(
        Object.values(properties.explanation.contributions).reduce(
          (a, b) => a + b,
          0,
        ) - properties.risk,
      ) < 1e-10,
    )
  }
})

for (const [name, change, pattern] of [
  [
    'unidad incorrecta',
    (z, o) => {
      o.sources.thermal.unit = 'K'
    },
    /unidades/,
  ],
  [
    'fecha inexistente',
    (z, o) => {
      o.observations[0].date = '2026-02-30'
    },
    /Fecha/,
  ],
  [
    'fecha futura al corte',
    (z, o) => {
      o.observations[0].date = '2026-12-01'
    },
    /posterior/,
  ],
  [
    'dato infinito',
    (z, o) => {
      o.observations[0].displacementMm = Infinity
    },
    /Desplazamiento/,
  ],
  [
    'dato NaN',
    (z, o) => {
      o.observations[0].thermalAnomalyC = NaN
    },
    /térmica/,
  ],
  [
    'dato ausente',
    (z, o) => {
      delete o.observations[0].confidence
    },
    /Confianza/,
  ],
  [
    'persistencia negativa',
    (z, o) => {
      o.observations[0].persistenceDays = -1
    },
    /Persistencia/,
  ],
  [
    'zona desconocida',
    (z, o) => {
      o.observations[0].zoneId = 'UNKNOWN'
    },
    /sin zona/,
  ],
  [
    'zona duplicada',
    (z) => {
      z.features[1].id = z.features[0].id
    },
    /duplicado/,
  ],
  [
    'anillo abierto',
    (z) => {
      z.features[0].geometry.coordinates[0].pop()
    },
    /cerrado/,
  ],
  [
    'anillo degenerado',
    (z) => {
      z.features[0].geometry.coordinates = [
        [
          [0, 0],
          [1, 1],
          [2, 2],
          [0, 0],
        ],
      ]
    },
    /degenerado/,
  ],
  [
    'latitud invalida',
    (z) => {
      z.features[0].geometry.coordinates[0][0][1] = -91
    },
    /Latitud/,
  ],
  [
    'fuente sin procedencia',
    (z, o) => {
      delete o.sources.thermal.provider
    },
    /fuentes/,
  ],
]) {
  test(`rechaza ${name}`, () => {
    const z = structuredClone(zones)
    const o = structuredClone(observations)
    change(z, o)
    assert.throws(() => validateData(z, o), pattern)
  })
}

test('rechaza pesos negativos, normalizador cero y umbrales invertidos', () => {
  assert.throws(
    () =>
      analyze(zones, observations, {
        ...DEFAULT_CONFIG,
        weights: { thermal: -1, displacement: 1, persistence: 1 },
      }),
    /Peso/,
  )
  assert.throws(
    () =>
      analyze(zones, observations, {
        ...DEFAULT_CONFIG,
        normalizers: { ...DEFAULT_CONFIG.normalizers, thermal: 0 },
      }),
    /Normalizador/,
  )
  assert.throws(
    () =>
      analyze(zones, observations, {
        ...DEFAULT_CONFIG,
        thresholds: { elevated: 90, critical: 80 },
      }),
    /umbrales/,
  )
})
